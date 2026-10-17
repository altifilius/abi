"""Rich document boundaries and opt-in persisted report API regressions."""

import copy
import io
import json
import os
import unittest
import zipfile
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from starlette.requests import Request

from backend import ai
from backend import project_reports as reports
from backend.funding import FundingCall, Program, SourceRevision
from backend.report_documents import render_report, text_document, validate_document
from backend.services.llm import AIConfig, AIConfigurationError, AIProviderError
from backend.workspaces import (
    Membership,
    Project,
    User,
    Workspace,
    erase_tenant_rows,
    export_workspace,
    new_id,
    validate_profile,
)


def rich_document():
    return {
        "type": "doc",
        "content": [
            {
                "type": "heading",
                "attrs": {"level": 2},
                "content": [{"type": "text", "text": "Ölçüm ve çözüm"}],
            },
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "Türkçe kalın", "marks": [{"type": "bold"}]},
                    {"type": "text", "text": " italik", "marks": [{"type": "italic"}]},
                    {"type": "hardBreak"},
                    {
                        "type": "text",
                        "text": "güvenli kaynak",
                        "marks": [
                            {
                                "type": "link",
                                "attrs": {
                                    "href": "https://example.org/?x=1&y=2",
                                    "target": "_blank",
                                    "rel": "noopener noreferrer nofollow",
                                    "class": None,
                                },
                            }
                        ],
                    },
                ],
            },
            {
                "type": "orderedList",
                "attrs": {"start": 3},
                "content": [
                    {
                        "type": "listItem",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "Üçüncü adım"}],
                            }
                        ],
                    },
                ],
            },
            {
                "type": "table",
                "content": [
                    {
                        "type": "tableRow",
                        "content": [
                            {
                                "type": "tableHeader",
                                "attrs": {"colspan": 1, "rowspan": 1, "colwidth": None},
                                "content": text_document("Başlık")["content"],
                            },
                            {
                                "type": "tableHeader",
                                "attrs": {"colspan": 1, "rowspan": 1, "colwidth": None},
                                "content": text_document("Tutar")["content"],
                            },
                        ],
                    },
                    {
                        "type": "tableRow",
                        "content": [
                            {
                                "type": "tableCell",
                                "content": text_document("Bilinmiyor")["content"],
                            },
                            {"type": "tableCell", "content": text_document("€ 10")["content"]},
                        ],
                    },
                ],
            },
        ],
    }


class RichDocumentTests(unittest.TestCase):
    def test_real_editor_document_is_preserved_without_lossy_conversion(self):
        document = rich_document()
        self.assertEqual(validate_document(document), document)
        parsed = reports.ReportSection(id="section", title="Özet", content=document)
        self.assertEqual(parsed.content, document)

    def test_raw_html_active_links_and_unknown_node_attributes_are_rejected(self):
        invalid = [
            {"type": "doc", "content": [{"type": "html", "text": "<script>alert(1)</script>"}]},
            {"type": "doc", "content": [{"type": "paragraph", "attrs": {"onclick": "alert(1)"}}]},
            {
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {
                                "type": "text",
                                "text": "click",
                                "marks": [
                                    {"type": "link", "attrs": {"href": "javascript:alert(1)"}}
                                ],
                            }
                        ],
                    }
                ],
            },
            {
                "type": "doc",
                "content": [{"type": "image", "attrs": {"src": "https://example.org/private"}}],
            },
            {"type": "doc", "content": [{"type": []}]},
            {
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": "x", "marks": [{"type": []}]}],
                    }
                ],
            },
        ]
        for document in invalid:
            with self.subTest(document=document), self.assertRaises(ValueError):
                validate_document(document)

    def test_docx_contains_real_unicode_marks_lists_table_and_no_interpreted_html(self):
        document = rich_document()
        document["content"].append(
            {"type": "paragraph", "content": [{"type": "text", "text": "<script>literal</script>"}]}
        )
        binary, media_type = render_report(
            "docx",
            "Çalışma",
            [{"id": "one", "title": "Kapsam", "content": document}],
            "Preparation draft",
        )
        self.assertEqual(
            media_type, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        with zipfile.ZipFile(io.BytesIO(binary)) as archive:
            xml = archive.read("word/document.xml").decode()
            self.assertIn("Türkçe kalın", xml)
            self.assertIn("w:b", xml)
            self.assertIn("w:i", xml)
            self.assertIn("w:tbl", xml)
            self.assertIn("w:numPr", xml)
            self.assertIn('w:start w:val="3"', archive.read("word/numbering.xml").decode())
            self.assertIn("&lt;script&gt;literal&lt;/script&gt;", xml)
            self.assertIn(
                "https://example.org/", archive.read("word/_rels/document.xml.rels").decode()
            )

    def test_pdf_contains_extractable_unicode_text_and_real_table(self):
        from pypdf import PdfReader

        from backend.settings import settings

        if (
            not Path(settings.pdf_font_path).is_file()
            or not Path(settings.pdf_bold_font_path).is_file()
        ):
            self.skipTest("Configure local Unicode report font family")
        binary, media_type = render_report(
            "pdf",
            "Çalışma",
            [{"id": "one", "title": "Kapsam", "content": rich_document()}],
            "Preparation draft",
        )
        self.assertEqual(media_type, "application/pdf")
        text = "\n".join(page.extract_text() for page in PdfReader(io.BytesIO(binary)).pages)
        for expected in ("Çalışma", "Türkçe", "Üçüncü", "Başlık", "Bilinmiyor"):
            self.assertIn(expected, text)

    def test_rows_fully_covered_by_rowspan_are_valid_and_uncovered_rows_rejected(self):
        document = {
            "type": "doc",
            "content": [
                {
                    "type": "table",
                    "content": [
                        {
                            "type": "tableRow",
                            "content": [
                                {
                                    "type": "tableCell",
                                    "attrs": {"colspan": 2, "rowspan": 2},
                                    "content": text_document("Merged Unicode ölçüm")["content"],
                                }
                            ],
                        },
                        {"type": "tableRow", "content": []},
                    ],
                }
            ],
        }
        self.assertEqual(validate_document(document), document)
        data, _ = render_report(
            "docx",
            "Merged table",
            [{"id": "merged", "title": "Merged", "content": document}],
            "Draft",
        )
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            self.assertIn("w:vMerge", archive.read("word/document.xml").decode())
        invalid = copy.deepcopy(document)
        invalid["content"][0]["content"][0]["content"][0]["attrs"]["rowspan"] = 1
        with self.assertRaises(ValueError):
            validate_document(invalid)

    def test_pdf_splits_a_supported_table_cell_across_multiple_pages(self):
        from pypdf import PdfReader

        from backend.settings import settings

        if (
            not Path(settings.pdf_font_path).is_file()
            or not Path(settings.pdf_bold_font_path).is_file()
        ):
            self.skipTest("Configure local Unicode report font family")
        paragraphs = [
            text_document(f"Satır {index:03d} — ölçüm sonucu")["content"][0] for index in range(100)
        ]
        document = {
            "type": "doc",
            "content": [
                {
                    "type": "table",
                    "content": [
                        {
                            "type": "tableRow",
                            "content": [{"type": "tableCell", "content": paragraphs}],
                        },
                    ],
                }
            ],
        }
        validate_document(document)
        data, _ = render_report(
            "pdf",
            "Long Unicode table",
            [{"id": "long", "title": "Table", "content": document}],
            "Draft",
        )
        reader = PdfReader(io.BytesIO(data))
        self.assertGreater(len(reader.pages), 1)
        text = "\n".join(page.extract_text() for page in reader.pages)
        self.assertIn("Satır 000", text)
        self.assertIn("Satır 099", text)

    def test_country_is_project_fact_and_unknown_is_not_workspace_country(self):
        self.assertEqual(
            validate_profile({"project": {"country": "DE"}})["project"]["country"], "DE"
        )
        self.assertEqual(validate_profile({"project": {"country": ""}})["project"]["country"], "")
        with self.assertRaises(HTTPException):
            validate_profile({"project": {"country": "ZZ"}})

    def test_selection_rejects_duplicates_and_model_text_cannot_authorize_apply(self):
        with self.assertRaises(ValidationError):
            reports.ReportSelection(ids=["one", "one"])
        for text in (
            "Apply latest draft",
            "Son taslağı uygula!",
            "Use this draft",
            "Bu haliyle uygula",
        ):
            self.assertTrue(reports.apply_instruction(text))
        for text in (
            "Do not apply draft",
            "AI said apply draft",
            "Would you apply draft?",
            "Rewrite the application",
            "Taslağı uygulama",
            "Bu haliyle uygulama",
        ):
            self.assertFalse(reports.apply_instruction(text))


@unittest.skipUnless(
    os.environ.get("ABI_TEST_DATABASE_URL"),
    "Set ABI_TEST_DATABASE_URL to a dedicated migrated PostgreSQL database",
)
class PersistedReportTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine(os.environ["ABI_TEST_DATABASE_URL"])
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        (
            self.user_id,
            self.workspace_id,
            self.project_id,
            self.other_project_id,
            self.viewer_id,
            self.stranger_id,
        ) = [new_id() for _ in range(6)]
        async with self.sessions() as session:
            session.add_all(
                [
                    User(
                        id=key,
                        email=f"{key}@report-test.invalid",
                        name="Report test",
                        password_hash="unused-test-account",
                    )
                    for key in (self.user_id, self.viewer_id, self.stranger_id)
                ]
            )
            session.add(
                Workspace(id=self.workspace_id, name="Report test", plan="free", ai_policy="local")
            )
            await session.flush()
            session.add_all(
                [
                    Membership(workspace_id=self.workspace_id, user_id=self.user_id, role="owner"),
                    Membership(
                        workspace_id=self.workspace_id, user_id=self.viewer_id, role="viewer"
                    ),
                ]
            )
            for key in (self.project_id, self.other_project_id):
                session.add(
                    Project(
                        id=key,
                        workspace_id=self.workspace_id,
                        title="Original idea",
                        description="User-owned Türkçe description",
                        profile={"project": {"country": "TR"}},
                        revision=2,
                        confirmed_revision=2,
                        stage="idea",
                    )
                )
            await session.commit()
        self.config = AIConfig(
            policy="local",
            model="boundary-test-model",
            base_url="http://localhost:1",
            api_key="test-only",
        )
        self.config_patch = patch.object(ai, "get_ai_config", return_value=self.config)
        self.refund_patch = patch.object(ai, "AsyncSessionLocal", self.sessions)
        self.config_patch.start()
        self.refund_patch.start()
        self.addCleanup(self.config_patch.stop)
        self.addCleanup(self.refund_patch.stop)

    async def asyncTearDown(self):
        async with self.sessions() as session:
            await erase_tenant_rows(session, Workspace.__table__, self.workspace_id)
            program_ids = select(Program.id).where(
                Program.code == f"report-test-{self.workspace_id}"
            )
            await session.execute(
                delete(FundingCall).where(FundingCall.program_id.in_(program_ids))
            )
            await session.execute(
                delete(SourceRevision).where(SourceRevision.program_id.in_(program_ids))
            )
            await session.execute(
                delete(Program).where(Program.code == f"report-test-{self.workspace_id}")
            )
            await session.execute(
                delete(ai.UsageEvent).where(
                    ai.UsageEvent.actor_id.in_([self.user_id, self.viewer_id, self.stranger_id])
                )
            )
            await session.execute(
                delete(User).where(User.id.in_([self.user_id, self.viewer_id, self.stranger_id]))
            )
            await session.commit()
        await self.engine.dispose()

    async def initialize(self, project_id=None):
        async with self.sessions() as session:
            user = await session.get(User, self.user_id)
            return await reports.initialize_reports(
                project_id or self.project_id,
                Request({"type": "http", "headers": [(b"accept-language", b"en")]}),
                user,
                session,
            )

    async def chat(self, report, text="Write this section", section_id=None):
        async with self.sessions() as session:
            user = await session.get(User, self.user_id)
            return await reports.chat_report(
                report["id"],
                reports.ReportChat(
                    text=text,
                    section_id=section_id or report["sections"][0]["id"],
                    expected_revision=report["revision"],
                    language="en",
                ),
                user,
                session,
            )

    async def funding_report(self):
        async with self.sessions() as session:
            program = Program(
                id=new_id(),
                code=f"report-test-{self.workspace_id}",
                name="Sourced funding",
                institution="Source institution",
                country="TR",
                support_type="grant",
                description="Preparation boundary",
                official_url="https://example.org/call",
            )
            session.add(program)
            await session.flush()
            source = SourceRevision(
                id=new_id(),
                program_id=program.id,
                version=1,
                source_url=program.official_url,
                sha256="a" * 64,
                content="[]",
                checked_at=reports.utcnow(),
                publication_status="pending",
            )
            session.add(source)
            await session.flush()
            call = FundingCall(
                id=new_id(),
                program_id=program.id,
                title="Sourced call",
                version=1,
                status="draft",
                source_revision_id=source.id,
                rules=[],
                rule_version="1",
                template={
                    "sections": [
                        {
                            "key": "purpose",
                            "label": "Sourced purpose",
                            "required": True,
                            "source_url": program.official_url,
                            "source_locator": "Section 1",
                            "max_characters": 500,
                        }
                    ]
                },
                finance={},
                language="en",
                portal_url=program.official_url,
            )
            session.add(call)
            await session.flush()
            project = await session.get(Project, self.project_id)
            report = await reports.ensure_funding_report(session, project, call)
            await session.commit()
            return reports.report_payload(report, project)

    async def test_initialization_is_idempotent_preserves_description_and_has_five_bilingual_templates(
        self,
    ):
        first = await self.initialize()
        second = await self.initialize()
        self.assertEqual([row["id"] for row in first], [row["id"] for row in second])
        self.assertEqual({row["template_key"] for row in first}, set(reports.TEMPLATES))
        self.assertEqual(len(first), 5)
        self.assertIn(
            "User-owned Türkçe description", json.dumps(first[0]["sections"], ensure_ascii=False)
        )
        async with self.sessions() as session:
            project = await session.get(Project, self.project_id)
            self.assertEqual(project.description, "User-owned Türkçe description")
            self.assertEqual(project.revision, 2)
            self.assertEqual(
                (
                    await session.execute(
                        select(ai.UsageEvent).where(ai.UsageEvent.project_id == self.project_id)
                    )
                )
                .scalars()
                .all(),
                [],
            )

    async def test_cas_manual_write_and_project_selection_boundary(self):
        current = (await self.initialize())[0]
        other = (await self.initialize(self.other_project_id))[0]
        async with self.sessions() as session:
            user = await session.get(User, self.user_id)
            with self.assertRaises(HTTPException) as rejected:
                await reports.select_reports(
                    self.project_id, reports.ReportSelection(ids=[other["id"]]), user, session
                )
            self.assertEqual(rejected.exception.status_code, 422)
            await session.rollback()
            user = await session.get(User, self.user_id)
            changed = copy.deepcopy(current["sections"])
            changed[0]["title"] = "Human custom title"
            updated = await reports.patch_report(
                current["id"],
                reports.ReportPatch(expected_revision=current["revision"], sections=changed),
                user,
                session,
            )
            self.assertEqual(updated["sections"][0]["title"], "Human custom title")
            with self.assertRaises(HTTPException) as stale:
                await reports.patch_report(
                    current["id"],
                    reports.ReportPatch(
                        expected_revision=current["revision"], sections=current["sections"]
                    ),
                    user,
                    session,
                )
            self.assertEqual(stale.exception.status_code, 409)

    async def test_report_chat_isolation_explicit_apply_and_no_second_charge(self):
        first, second, *_ = await self.initialize()
        completion = AsyncMock(
            return_value={
                "reply": "Proposed section",
                "draft_text": "Unknown: confirm customer demand.",
                "draft_section_id": first["sections"][0]["id"],
                "draft_baseline": "saved",
                "draft_block_index": None,
            }
        )
        with patch.object(reports, "call_llm", completion):
            result = await self.chat(first)
        self.assertFalse(result["applied"])
        self.assertEqual(result["report"]["sections"], first["sections"])
        self.assertEqual(result["usage"]["write"]["used"], 1)
        with patch.object(
            reports,
            "call_llm",
            new=AsyncMock(side_effect=AssertionError("Applying a stored draft must not call AI")),
        ):
            applied = await self.chat(result["report"], "Apply latest draft")
        self.assertTrue(applied["applied"])
        self.assertIn("Unknown: confirm", json.dumps(applied["report"]["sections"]))
        async with self.sessions() as session:
            user = await session.get(User, self.user_id)
            messages = await reports.list_report_messages(second["id"], user, session)
            self.assertEqual(messages, {"messages": []})
            first_messages = await reports.list_report_messages(first["id"], user, session)
            self.assertEqual(len(first_messages["messages"]), 4)
            self.assertTrue(
                all(message["report_id"] == first["id"] for message in first_messages["messages"])
            )
            usage = await ai.usage_payload(
                session, await session.get(Workspace, self.workspace_id), user.id
            )
            self.assertEqual(usage["write"]["used"], 1)
        with self.assertRaises(HTTPException) as stale:
            await self.chat(applied["report"], "Apply latest draft")
        self.assertEqual(stale.exception.detail["code"], "stale_draft")

    async def test_scope_change_blocks_saved_draft_and_requires_explicit_acknowledgment(self):
        first = (await self.initialize())[0]
        with patch.object(
            reports,
            "call_llm",
            new=AsyncMock(
                return_value={
                    "reply": "Draft",
                    "draft_text": "Proposed text",
                    "draft_section_id": first["sections"][0]["id"],
                    "draft_baseline": "saved",
                    "draft_block_index": None,
                }
            ),
        ):
            drafted = await self.chat(first)
        async with self.sessions() as session:
            project = await session.get(Project, self.project_id)
            project.revision = 3
            project.confirmed_revision = 3
            await session.commit()
        with self.assertRaises(HTTPException) as stale:
            await self.chat(drafted["report"], "Apply latest draft")
        self.assertEqual(stale.exception.detail["code"], "scope_review_required")
        async with self.sessions() as session:
            user = await session.get(User, self.user_id)
            acknowledged = await reports.patch_report(
                first["id"],
                reports.ReportPatch(
                    expected_revision=first["revision"],
                    sections=first["sections"],
                    acknowledge_scope=True,
                ),
                user,
                session,
            )
            self.assertFalse(acknowledged["needs_review"])
            self.assertEqual(acknowledged["scope_revision"], 3)
        with self.assertRaises(HTTPException) as stale:
            await self.chat(acknowledged, "Apply latest draft")
        self.assertEqual(stale.exception.detail["code"], "stale_draft")

    async def test_provider_failure_refunds_and_keeps_user_message_without_fake_assistant(self):
        first = (await self.initialize())[0]
        with patch.object(
            reports, "call_llm", new=AsyncMock(side_effect=AIProviderError("Provider unavailable"))
        ):
            with self.assertRaises(HTTPException) as error:
                await self.chat(first)
        self.assertEqual(error.exception.status_code, 502)
        async with self.sessions() as session:
            events = (
                (
                    await session.execute(
                        select(ai.UsageEvent).where(ai.UsageEvent.project_id == self.project_id)
                    )
                )
                .scalars()
                .all()
            )
            self.assertEqual([event.status for event in events], ["failed"])
            messages = (
                (
                    await session.execute(
                        select(reports.ReportMessage).where(
                            reports.ReportMessage.report_id == first["id"]
                        )
                    )
                )
                .scalars()
                .all()
            )
            self.assertEqual([message.role for message in messages], ["user"])

    async def test_concurrent_manual_revision_discards_provider_reply_without_charge(self):
        first = (await self.initialize())[0]

        async def provider(*args, **kwargs):
            async with self.sessions() as session:
                report = await session.get(reports.ProjectReport, first["id"])
                report.sections = [
                    {**section, "content": text_document("New manual content")}
                    if index == 0
                    else section
                    for index, section in enumerate(report.sections)
                ]
                report.revision += 1
                await session.commit()
            return {
                "reply": "Old reply",
                "draft_text": "Old draft",
                "draft_section_id": first["sections"][0]["id"],
                "draft_baseline": "saved",
                "draft_block_index": None,
            }

        with (
            patch.object(reports, "call_llm", side_effect=provider),
            self.assertRaises(HTTPException) as stale,
        ):
            await self.chat(first)
        self.assertEqual(stale.exception.status_code, 409)
        async with self.sessions() as session:
            report = await session.get(reports.ProjectReport, first["id"])
            self.assertIn("New manual content", json.dumps(report.sections))
            event = (
                await session.execute(
                    select(ai.UsageEvent).where(ai.UsageEvent.project_id == self.project_id)
                )
            ).scalar_one()
            self.assertEqual(event.status, "failed")

    async def test_missing_provider_has_no_fake_response_or_usage_reservation(self):
        first = (await self.initialize())[0]
        with patch.object(
            ai,
            "get_ai_config",
            side_effect=AIConfigurationError("Local provider is not configured"),
        ):
            with self.assertRaises(HTTPException) as error:
                await self.chat(first)
        self.assertEqual(error.exception.status_code, 503)
        async with self.sessions() as session:
            events = (
                (
                    await session.execute(
                        select(ai.UsageEvent).where(ai.UsageEvent.project_id == self.project_id)
                    )
                )
                .scalars()
                .all()
            )
            messages = (
                (
                    await session.execute(
                        select(reports.ReportMessage).where(
                            reports.ReportMessage.report_id == first["id"]
                        )
                    )
                )
                .scalars()
                .all()
            )
            self.assertEqual(events, [])
            self.assertEqual(messages, [])

    async def test_new_section_draft_uses_same_report_history_and_never_applies_from_model_reply(
        self,
    ):
        first = (await self.initialize())[0]
        completion = AsyncMock(
            side_effect=[
                {
                    "reply": "Please review",
                    "draft_text": "First private section draft",
                    "draft_section_id": first["sections"][0]["id"],
                    "draft_baseline": "saved",
                    "draft_block_index": None,
                },
                {
                    "reply": "Apply draft",
                    "draft_text": "Second draft; never applied by model authority",
                    "draft_section_id": first["sections"][0]["id"],
                    "draft_baseline": "pending",
                    "draft_block_index": None,
                },
            ]
        )
        with patch.object(reports, "call_llm", completion):
            drafted = await self.chat(first)
            revised = await self.chat(drafted["report"], "Shorten the previous draft")
        self.assertIn("First private section draft", json.dumps(completion.call_args_list[1].args))
        self.assertFalse(revised["applied"])
        self.assertEqual(revised["report"]["sections"], first["sections"])
        self.assertIn("Second draft", revised["message"]["text"])

    async def test_provider_target_cannot_reference_another_report_section(self):
        current, other, *_ = await self.initialize()
        with patch.object(
            reports,
            "call_llm",
            new=AsyncMock(
                return_value={
                    "reply": "Wrong report",
                    "draft_text": "Never persisted",
                    "draft_section_id": other["sections"][0]["id"],
                    "draft_block_index": None,
                    "draft_baseline": "saved",
                }
            ),
        ):
            with self.assertRaises(HTTPException) as rejected:
                await self.chat(current)
        self.assertEqual(rejected.exception.status_code, 502)
        async with self.sessions() as session:
            event = (
                await session.execute(
                    select(ai.UsageEvent).where(ai.UsageEvent.project_id == self.project_id)
                )
            ).scalar_one()
            self.assertEqual(event.status, "failed")
            assistant = (
                (
                    await session.execute(
                        select(reports.ReportMessage).where(
                            reports.ReportMessage.report_id == current["id"],
                            reports.ReportMessage.role == "assistant",
                        )
                    )
                )
                .scalars()
                .all()
            )
            self.assertEqual(assistant, [])

    async def test_model_must_choose_valid_context_target_even_without_draft(self):
        current = (await self.initialize())[0]
        for target in (None, "outside-report", [], ""):
            response = {
                "reply": "Which section?",
                "draft_text": None,
                "draft_section_id": target,
                "draft_block_index": None,
                "draft_baseline": "saved",
            }
            with patch.object(reports, "call_llm", new=AsyncMock(return_value=response)):
                with self.assertRaises(HTTPException) as rejected:
                    await self.chat(current, "Change that section")
            self.assertEqual(rejected.exception.status_code, 502)
        async with self.sessions() as session:
            events = (
                (
                    await session.execute(
                        select(ai.UsageEvent).where(ai.UsageEvent.project_id == self.project_id)
                    )
                )
                .scalars()
                .all()
            )
            self.assertEqual([event.status for event in events], ["failed"] * 4)
            report = await session.get(reports.ProjectReport, current["id"])
            self.assertEqual(report.sections, current["sections"])

    async def test_described_target_overrides_dropdown_and_saved_apply_uses_its_target(self):
        current = (await self.initialize())[1]
        current["sections"][2]["content"] = text_document("Original first paragraph")
        retained = {
            "type": "paragraph",
            "content": [
                {
                    "type": "text",
                    "text": "Original second paragraph retained.",
                    "marks": [{"type": "bold"}],
                }
            ],
        }
        current["sections"][2]["content"]["content"].append(retained)
        async with self.sessions() as session:
            user = await session.get(User, self.user_id)
            current = await reports.patch_report(
                current["id"],
                reports.ReportPatch(
                    expected_revision=current["revision"], sections=current["sections"]
                ),
                user,
                session,
            )
        target = current["sections"][2]
        replacement = "Rewritten first paragraph."
        completion = AsyncMock(
            return_value={
                "reply": "Proposed a timeline revision",
                "draft_text": replacement,
                "draft_section_id": target["id"],
                "draft_block_index": 0,
                "draft_baseline": "saved",
            }
        )
        with patch.object(reports, "call_llm", completion):
            drafted = await self.chat(
                current,
                "Rewrite the first paragraph of Timeline and milestones, retain other paragraphs",
                section_id=current["sections"][0]["id"],
            )
        self.assertEqual(drafted["message"]["section_id"], target["id"])
        self.assertEqual(drafted["message"]["draft"]["section_id"], target["id"])
        applied = await self.chat(
            drafted["report"], "Apply latest draft", section_id=current["sections"][0]["id"]
        )
        self.assertEqual(applied["message"]["section_id"], target["id"])
        for before, after in zip(current["sections"], applied["report"]["sections"], strict=True):
            if before["id"] == target["id"]:
                self.assertEqual(
                    after["content"],
                    {"type": "doc", "content": [*text_document(replacement)["content"], retained]},
                )
            else:
                self.assertEqual(after, before)

    async def test_saved_paragraph_baseline_does_not_carry_pending_other_paragraph(self):
        current = (await self.initialize())[0]
        target_id = current["sections"][0]["id"]
        current["sections"][0]["content"] = text_document(
            "Saved first paragraph\nSaved second paragraph"
        )
        async with self.sessions() as session:
            user = await session.get(User, self.user_id)
            current = await reports.patch_report(
                current["id"],
                reports.ReportPatch(
                    expected_revision=current["revision"], sections=current["sections"]
                ),
                user,
                session,
            )
        completion = AsyncMock(
            side_effect=[
                {
                    "reply": "Pending draft",
                    "draft_text": "Pending first paragraph\nPending second paragraph",
                    "draft_section_id": target_id,
                    "draft_block_index": None,
                    "draft_baseline": "saved",
                },
                {
                    "reply": "Saved paragraph only",
                    "draft_text": "Revised saved first paragraph",
                    "draft_section_id": target_id,
                    "draft_block_index": 0,
                    "draft_baseline": "saved",
                },
            ]
        )
        with patch.object(reports, "call_llm", completion):
            await self.chat(current)
            drafted = await self.chat(
                current,
                "Rewrite only the first paragraph of the saved report, leave its second paragraph unchanged",
            )
        applied = await self.chat(drafted["report"], "Apply latest draft")
        self.assertEqual(
            applied["report"]["sections"][0]["content"],
            text_document("Revised saved first paragraph\nSaved second paragraph"),
        )

    async def test_pending_paragraph_baseline_preserves_pending_other_paragraph(self):
        current = (await self.initialize())[0]
        target_id = current["sections"][0]["id"]
        completion = AsyncMock(
            side_effect=[
                {
                    "reply": "Pending draft",
                    "draft_text": "Pending first paragraph\nPending second paragraph",
                    "draft_section_id": target_id,
                    "draft_block_index": None,
                    "draft_baseline": "saved",
                },
                {
                    "reply": "Revised pending paragraph",
                    "draft_text": "Revised pending first paragraph",
                    "draft_section_id": target_id,
                    "draft_block_index": 0,
                    "draft_baseline": "pending",
                },
            ]
        )
        with patch.object(reports, "call_llm", completion):
            await self.chat(current)
            drafted = await self.chat(
                current, "Revise only the first paragraph of that pending draft"
            )
        self.assertEqual(
            drafted["message"]["draft"]["content"],
            text_document("Revised pending first paragraph\nPending second paragraph"),
        )

    async def test_missing_or_invalid_model_baseline_is_rejected_and_refunded(self):
        current = (await self.initialize())[0]
        for baseline in (None, "invented", "pending"):
            response = {
                "reply": "Invalid baseline",
                "draft_text": "Proposed text",
                "draft_section_id": current["sections"][0]["id"],
                "draft_block_index": 0,
            }
            if baseline is not None:
                response["draft_baseline"] = baseline
            with patch.object(reports, "call_llm", new=AsyncMock(return_value=response)):
                with self.assertRaises(HTTPException) as rejected:
                    await self.chat(current)
            self.assertEqual(rejected.exception.status_code, 502)
        async with self.sessions() as session:
            events = (
                (
                    await session.execute(
                        select(ai.UsageEvent).where(ai.UsageEvent.project_id == self.project_id)
                    )
                )
                .scalars()
                .all()
            )
            self.assertEqual([event.status for event in events], ["failed"] * 3)

    async def test_duplicate_provider_reply_draft_prose_is_displayed_once(self):
        current = (await self.initialize())[0]
        prose = "One substantive draft, not duplicated."
        with patch.object(
            reports,
            "call_llm",
            new=AsyncMock(
                return_value={
                    "reply": prose,
                    "draft_text": prose,
                    "draft_section_id": current["sections"][0]["id"],
                    "draft_block_index": None,
                    "draft_baseline": "saved",
                }
            ),
        ):
            drafted = await self.chat(current)
        self.assertEqual(drafted["message"]["text"], prose)

    async def test_applying_draft_cannot_exceed_complete_report_aggregate_limit(self):
        current = (await self.initialize())[0]
        near_limit = [
            {"id": "first", "title": "First", "content": text_document("a" * 660_000)},
            {"id": "second", "title": "Second", "content": text_document("b" * 660_000)},
            {"id": "third", "title": "Third", "content": text_document("c" * 660_000)},
        ]
        reports.ReportPatch(expected_revision=current["revision"], sections=near_limit)
        async with self.sessions() as session:
            user = await session.get(User, self.user_id)
            current = await reports.patch_report(
                current["id"],
                reports.ReportPatch(expected_revision=current["revision"], sections=near_limit),
                user,
                session,
            )
            report = await session.get(reports.ProjectReport, current["id"])
            session.add(
                reports.new_message(
                    report,
                    "assistant",
                    "Stored valid document that exceeds total report size",
                    "first",
                    {
                        "section_id": "first",
                        "content": text_document("x" * 700_000),
                        "base_revision": report.revision,
                        "scope_revision": report.scope_revision,
                        "applied_revision": None,
                    },
                )
            )
            await session.commit()
        with self.assertRaises(HTTPException) as rejected:
            await self.chat(current, "Apply latest draft", section_id="first")
        self.assertEqual(rejected.exception.status_code, 422)
        async with self.sessions() as session:
            report = await session.get(reports.ProjectReport, current["id"])
            self.assertEqual(report.revision, current["revision"])
            self.assertEqual(report.sections, near_limit)
            stored = await reports.latest_draft(session, report.id)
            self.assertIsNone(stored.draft["applied_revision"])

    async def test_ambiguous_target_asks_question_without_stored_draft(self):
        current = (await self.initialize())[0]
        with patch.object(
            reports,
            "call_llm",
            new=AsyncMock(
                return_value={
                    "reply": "Which section should change?",
                    "draft_text": None,
                    "draft_section_id": current["sections"][0]["id"],
                    "draft_baseline": "saved",
                    "draft_block_index": None,
                }
            ),
        ):
            result = await self.chat(current, "Change that section")
        self.assertIsNone(result["message"]["draft"])
        self.assertEqual(result["message"]["section_id"], current["sections"][0]["id"])
        self.assertFalse(result["applied"])
        self.assertEqual(result["report"]["sections"], current["sections"])

    async def test_funding_headings_are_fixed_and_free_plan_cannot_generate_funded_writing(self):
        current = await self.funding_report()
        renamed = [{**section, "title": "Unsourced replacement"} for section in current["sections"]]
        async with self.sessions() as session:
            user = await session.get(User, self.user_id)
            with self.assertRaises(HTTPException) as invalid:
                await reports.patch_report(
                    current["id"],
                    reports.ReportPatch(expected_revision=current["revision"], sections=renamed),
                    user,
                    session,
                )
            self.assertEqual(invalid.exception.status_code, 422)
        with patch.object(
            reports,
            "call_llm",
            new=AsyncMock(side_effect=AssertionError("Free funded generation must not call AI")),
        ):
            with self.assertRaises(HTTPException) as denied:
                await self.chat(current)
        self.assertEqual(denied.exception.status_code, 403)
        async with self.sessions() as session:
            report = await session.get(reports.ProjectReport, current["id"])
            self.assertEqual(report.sections, current["sections"])
            self.assertEqual(
                (
                    await session.execute(
                        select(ai.UsageEvent).where(ai.UsageEvent.project_id == self.project_id)
                    )
                )
                .scalars()
                .all(),
                [],
            )

    async def test_viewer_cannot_write_and_stranger_cannot_read_or_export(self):
        first = (await self.initialize())[0]
        async with self.sessions() as session:
            viewer = await session.get(User, self.viewer_id)
            stranger = await session.get(User, self.stranger_id)
            with self.assertRaises(HTTPException) as forbidden:
                await reports.patch_report(
                    first["id"],
                    reports.ReportPatch(
                        expected_revision=first["revision"], sections=first["sections"]
                    ),
                    viewer,
                    session,
                )
            self.assertEqual(forbidden.exception.status_code, 403)
            for method in (reports.get_report, reports.list_report_messages):
                with self.assertRaises(HTTPException) as hidden:
                    await method(first["id"], stranger, session)
                self.assertEqual(hidden.exception.status_code, 404)
            with self.assertRaises(HTTPException) as hidden:
                await reports.export_report(first["id"], "docx", stranger, session)
            self.assertEqual(hidden.exception.status_code, 404)

    async def test_scope_proposal_uses_idea_only_does_not_mutate_project_and_exports_private_records(
        self,
    ):
        first = (await self.initialize())[0]
        async with self.sessions() as session:
            session.add(
                reports.new_message(
                    await session.get(reports.ProjectReport, first["id"]),
                    "user",
                    "PRIVATE_REPORT_ONLY",
                    first["sections"][0]["id"],
                )
            )
            await session.commit()
        completion = AsyncMock(
            return_value={
                "title": "Reviewed proposal",
                "description": "User-owned Türkçe description",
                "country": "",
                "problem": "Unknown",
                "solution": "Known solution",
                "objectives": "Unknown",
            }
        )
        async with self.sessions() as session:
            user = await session.get(User, self.user_id)
            with patch.object(reports, "call_llm", completion):
                result = await reports.propose_scope(
                    self.project_id, reports.ScopeProposal(language="en"), user, session
                )
            self.assertTrue(result["requires_confirmation"])
            self.assertEqual(result["profile_revision"], 2)
            self.assertEqual(result["country"], "")
            self.assertNotIn("PRIVATE_REPORT_ONLY", json.dumps(completion.call_args.args))
            project = await session.get(Project, self.project_id)
            self.assertEqual(project.title, "Original idea")
            exported = await export_workspace(self.workspace_id, user, session)
            self.assertEqual(len(exported["records"]["project_reports"]), 5)
            self.assertEqual(len(exported["records"]["project_report_messages"]), 1)
            await erase_tenant_rows(session, Project.__table__, self.project_id)
            await session.commit()
            self.assertEqual(
                (
                    await session.execute(
                        select(reports.ProjectReport).where(
                            reports.ProjectReport.project_id == self.project_id
                        )
                    )
                )
                .scalars()
                .all(),
                [],
            )
            self.assertEqual(
                (
                    await session.execute(
                        select(reports.ReportMessage).where(
                            reports.ReportMessage.project_id == self.project_id
                        )
                    )
                )
                .scalars()
                .all(),
                [],
            )

    async def test_export_uses_saved_sections_not_unapplied_chat_draft(self):
        first = (await self.initialize())[0]
        with patch.object(
            reports,
            "call_llm",
            new=AsyncMock(
                return_value={
                    "reply": "Draft",
                    "draft_text": "UNAPPLIED_PRIVATE_AI_DRAFT",
                    "draft_section_id": first["sections"][0]["id"],
                    "draft_baseline": "saved",
                    "draft_block_index": None,
                }
            ),
        ):
            await self.chat(first)
        async with self.sessions() as session:
            user = await session.get(User, self.user_id)
            exported = await reports.export_report(first["id"], "docx", user, session)
        with zipfile.ZipFile(io.BytesIO(exported.body)) as archive:
            text = archive.read("word/document.xml").decode()
            self.assertIn("User-owned Türkçe description", text)
            self.assertNotIn("UNAPPLIED_PRIVATE_AI_DRAFT", text)
