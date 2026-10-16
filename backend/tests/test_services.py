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
            {"reply": "cannot perform", "refused": True},
            {"reply": "  ", "refused": False},
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
