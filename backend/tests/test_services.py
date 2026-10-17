import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from backend.models import ReportChunk, ReportVersion
from backend.schemas import DimensionReport
from backend.services.chat import build_chat_messages, run_idea_chat
from backend.services.embeddings import embed_text
from backend.services.llm import (
    AIConfig,
    AIConfigurationError,
    AIProviderError,
    call_llm,
    get_ai_config,
    strict_response_format,
)
from backend.services.reports import grounded_citations

SCHEMA = {
    "name": "reply",
    "schema": {
        "type": "object",
        "properties": {"reply": {"type": "string"}},
        "required": ["reply"],
        "additionalProperties": False,
    },
}


def completion(content="real reply", refusal=None, finish_reason="stop"):
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(content=content, refusal=refusal),
                finish_reason=finish_reason,
            )
        ]
    )


class ClientPolicyTests(unittest.TestCase):
    def test_missing_local_configuration_never_uses_external_credentials(self):
        settings = SimpleNamespace(
            local_ai_api_key="",
            local_ai_base_url=None,
            local_ai_chat_model="",
            openai_api_key="valid-external-key",
            openai_chat_model="external-model",
        )
        with (
            patch("backend.services.llm.settings", settings),
            self.assertRaises(AIConfigurationError),
        ):
            get_ai_config("local")

    def test_configured_local_model_and_endpoint_remain_local(self):
        settings = SimpleNamespace(
            local_ai_api_key="configured-token",
            local_ai_base_url="http://127.0.0.1:11435/v1",
            local_ai_embedding_model="local-embedding",
            openai_embedding_model="external-embedding",
        )
        with patch("backend.services.llm.settings", settings):
            config = get_ai_config("local", "embedding")
        self.assertEqual(config.model, "local-embedding")
        self.assertEqual(config.policy, "local")
        self.assertEqual(config.base_url, "http://127.0.0.1:11435/v1")

    def test_array_structured_output_is_rejected_before_provider_request(self):
        with self.assertRaises(ValueError):
            strict_response_format(
                {"name": "bad", "schema": {"type": "array", "items": {"type": "string"}}}
            )

    def test_context_keeps_newest_without_discarding_persisted_history(self):
        history = [{"role": "user", "text": f"message-{n}: " + "x" * 100} for n in range(300)]
        original = [dict(item) for item in history]
        messages = build_chat_messages(history, "server", max_context_chars=500)
        self.assertIn("message-299", messages[-1]["content"])
        self.assertLessEqual(sum(len(item["content"]) for item in messages), 500)
        self.assertEqual(history, original)
        self.assertNotIn("message-0:", str(messages))


class ProviderBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def test_empty_refusal_truncation_and_invalid_json_are_errors(self):
        for response in [
            completion(""),
            completion("refusal", refusal="blocked"),
            completion("partial", finish_reason="length"),
            completion("{}"),
            completion("[]"),
            completion("{bad"),
        ]:
            client = SimpleNamespace(
                chat=SimpleNamespace(
                    completions=SimpleNamespace(create=AsyncMock(return_value=response))
                )
            )
            with (
                self.subTest(response=response),
                patch(
                    "backend.services.llm.get_ai_config",
                    return_value=AIConfig("local", "model", "http://localhost", "token"),
                ),
                patch("backend.services.llm.get_ai_client", return_value=client),
                self.assertRaises(AIProviderError),
            ):
                await call_llm(
                    [{"role": "user", "content": "private text"}],
                    policy="local",
                    response_format="json_schema",
                    json_schema=SCHEMA,
                )

    async def test_semantic_refusal_and_whitespace_are_not_chat_success(self):
        for response in [
            {"body": "cannot perform", "next_question": None, "refused": True},
            {"body": "  ", "next_question": None, "refused": False},
        ]:
            with (
                patch("backend.services.chat.call_llm", AsyncMock(return_value=response)),
                self.assertRaises(AIProviderError),
            ):
                await run_idea_chat([], policy="local")

    async def test_embedding_results_must_cover_all_input_indices(self):
        client = SimpleNamespace(
            embeddings=SimpleNamespace(
                create=AsyncMock(
                    return_value=SimpleNamespace(
                        data=[SimpleNamespace(index=0, embedding=[1.0, 0.0])]
                    )
                )
            )
        )
        with (
            patch(
                "backend.services.embeddings.get_ai_config",
                return_value=AIConfig("local", "embedding", "http://localhost", "token"),
            ),
            patch("backend.services.embeddings.get_ai_client", return_value=client),
            self.assertRaises(AIProviderError),
        ):
            await embed_text(["first", "second"], policy="local")


class MentorConversationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.create = AsyncMock()
        client = SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=self.create))
        )
        config_patch = patch(
            "backend.services.llm.get_ai_config",
            return_value=AIConfig("local", "model", "http://localhost", "token"),
        )
        client_patch = patch("backend.services.llm.get_ai_client", return_value=client)
        self.config = config_patch.start()
        self.addCleanup(config_patch.stop)
        client_patch.start()
        self.addCleanup(client_patch.stop)

    async def test_provider_body_and_one_question_are_composed_without_rewriting(self):
        examples = (
            (
                "en",
                "You want to help small bakeries reduce waste. A short trial can test demand before building software.",
                "How do those bakeries handle unsold stock today?",
            ),
            (
                "tr",
                "Küçük fırınların israfını azaltmak istiyorsun. Yazılım geliştirmeden önce küçük bir denemeyle ihtiyacı sınayabilirsin.",
                "Bu fırınlar elde kalan ürünleri bugün nasıl değerlendiriyor?",
            ),
        )
        history = [
            {"role": "user", "text": "I want to help small bakeries reduce waste in Turkey."}
        ]
        for language, body, question in examples:
            with self.subTest(language=language):
                self.create.return_value = completion(
                    json.dumps(
                        {"body": f"  {body}  ", "next_question": f" {question} ", "refused": False}
                    )
                )
                reply = await run_idea_chat(
                    history,
                    policy="local",
                    language=language,
                    project_context='{"country": "TR"}',
                )
                self.assertEqual(reply, f"{body}\n\n{question}")
                self.assertEqual(reply.count("?"), 1)

    async def test_one_choice_question_is_not_mistaken_for_multiple_questions(self):
        for question in (
            "Türkiye veya Almanya mı?",
            "Will you sell locally or export?",
            "Bu denemeyi hangi fırınla yapacaksın?",
            "Bu fırınla konuşma öncesi, ne tür bilgiler hazırlamalısın?",
            "Before speaking to the bakery, what information should you prepare?",
            "Fırın sahibi, hangi ürünü en çok satıyor?",
        ):
            with self.subTest(question=question):
                self.create.return_value = completion(
                    json.dumps(
                        {
                            "body": "İlk denemeyi küçük tutabiliriz.",
                            "next_question": question,
                            "refused": False,
                        }
                    )
                )
                reply = await run_idea_chat([], policy="local", language="tr")
                self.assertEqual(reply, f"İlk denemeyi küçük tutabiliriz.\n\n{question}")

    async def test_null_follow_up_preserves_body_without_adding_a_question(self):
        body = "A small trial lets you test the idea before building software."
        self.create.return_value = completion(
            json.dumps({"body": body, "next_question": None, "refused": False})
        )
        reply = await run_idea_chat([], policy="local", language="en")
        self.assertEqual(reply, body)

    async def test_question_lists_compounds_and_invalid_fields_fail_not_truncate(self):
        valid = {
            "body": "Testing demand first can save development effort.",
            "next_question": "Who is your first customer?",
            "refused": False,
        }
        invalid = [
            {},
            {key: value for key, value in valid.items() if key != "body"},
            {key: value for key, value in valid.items() if key != "next_question"},
            {key: value for key, value in valid.items() if key != "refused"},
            {**valid, "reply": "obsolete unstructured output"},
            {**valid, "body": None},
            {**valid, "body": "  "},
            {**valid, "body": "Who buys it? What do they pay?"},
            {**valid, "body": "Can you clarify\uff1f"},
            {**valid, "body": "Which customer buys it\u061f"},
            {**valid, "refused": True},
            {**valid, "refused": "false"},
            {**valid, "next_question": []},
        ]
        for question in (
            "",
            "  ",
            "Who is your customer",
            "Who is your customer? What do they pay?",
            "Who buys it\u061f What do they pay?",
            "Who is your customer and what do they pay?",
            "Müşterin kim ve ne kadar öder?",
            "Who buys it, what do they pay?",
            "Who buys it; what do they pay?",
            "Who buys it / what do they pay?",
            "Who buys it\nwhat do they pay?",
            "1. Who buys it?",
            "- Who buys it?",
            "Who buys it. What do they pay?",
        ):
            invalid.append({**valid, "next_question": question})
        for response in invalid:
            with self.subTest(response=response), self.assertRaises(AIProviderError):
                self.create.return_value = completion(json.dumps(response))
                await run_idea_chat([], policy="local")

    async def test_provider_refusal_truncation_and_failure_still_propagate(self):
        for response in (
            completion("{}", refusal="blocked"),
            completion("{}", finish_reason="length"),
            completion(""),
        ):
            with self.subTest(response=response), self.assertRaises(AIProviderError):
                self.create.return_value = response
                await run_idea_chat([], policy="local")
        with (
            patch(
                "backend.services.chat.call_llm",
                side_effect=AIProviderError("provider unavailable"),
            ),
            self.assertRaisesRegex(AIProviderError, "provider unavailable"),
        ):
            await run_idea_chat([], policy="local")

    async def test_write_mode_keeps_full_sectioned_draft_without_chat_limits(self):
        sections = {
            "title": "Bakery waste pilot",
            "problem_solution": "Unsold stock can become waste. Test a reservation service with one bakery.",
            "innovation": "Differentiation is not established; compare existing alternatives.",
            "objectives": "Learn whether customers reserve products and collect them.",
            "methodology": "Agree a small pilot. Track reservations, collections and feedback.",
            "missing_information": "Which bakery? What baseline should be measured?",
            "refused": False,
        }
        self.create.return_value = completion(json.dumps(sections))
        reply = await run_idea_chat([], policy="local", mode="write", language="en")
        self.assertEqual(
            reply,
            "\n\n".join(
                f"{label}\n{sections[field]}"
                for label, field in (
                    ("Project title", "title"),
                    ("Problem and solution", "problem_solution"),
                    ("Innovation", "innovation"),
                    ("Objectives", "objectives"),
                    ("Methodology", "methodology"),
                    ("Missing information", "missing_information"),
                )
            ),
        )
        for response in (
            {**sections, "refused": True},
            {**sections, "methodology": "  "},
            {key: value for key, value in sections.items() if key != "title"},
        ):
            with self.subTest(response=response), self.assertRaises(AIProviderError):
                self.create.return_value = completion(json.dumps(response))
                await run_idea_chat([], policy="local", mode="write")


class EvidenceBoundaryTests(unittest.TestCase):
    def test_citation_is_exact_quote_and_returned_chunk_id(self):
        chunk = ReportChunk(
            id="chunk-a",
            report_version_id="version-a",
            page=2,
            chunk_index=0,
            text="Only this exact statement is evidence.",
            embedding=[1.0],
        )
        version = ReportVersion(
            id="version-a",
            report_id="report",
            source_sha256="f" * 64,
            source_url="https://official.example/report.pdf",
        )
        report = DimensionReport(
            dimension="market",
            score=None,
            diagnosis="Evidence limited",
            recommended_actions=[],
            risks=[],
            notes="Source report",
            citations=[{"chunk_id": "chunk-a", "quote": "exact statement"}],
        )
        citation = grounded_citations(report, [chunk], version)[0]
        self.assertEqual(citation["page"], 2)
        self.assertEqual(citation["report_version_id"], "version-a")
        report.citations[0].quote = "invented evidence"
        with self.assertRaises(AIProviderError):
            grounded_citations(report, [chunk], version)
        report.citations[0].quote = "exact statement"
        report.citations[0].chunk_id = "not-returned"
        with self.assertRaises(AIProviderError):
            grounded_citations(report, [chunk], version)
