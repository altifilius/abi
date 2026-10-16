"""Real migrated-PostgreSQL boundaries; set ABI_TEST_DATABASE_URL to a dedicated database."""

import os
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import delete, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from backend.applications import (
    Application,
    ApprovalRequest,
    Document,
    EditApplication,
    RevisionRequest,
    application_check,
    approve_application,
    edit_application,
    export_application,
    import_project_budget,
    submit_review,
)
from backend.collaboration import (
    TaskCreate,
    TaskItem,
    TaskPatch,
    calendar,
    create_task,
    delete_task,
    update_task,
)
from backend.funding import Evaluation, FundingCall, Program, SourceRevision, programs
from backend.menu_api import calendar as calendar_json
from backend.menu_api import document_detail, overview, task_detail, task_history, tasks
from backend.operations import WorkerHeartbeat, health_payload
from backend.settings import settings
from backend.workspaces import Membership, Project, User, Workspace, new_id, utcnow


@unittest.skipUnless(
    os.environ.get("ABI_TEST_DATABASE_URL"), "Requires dedicated migrated PostgreSQL"
)
class PostgreSQLMenuBoundaries(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine(os.environ["ABI_TEST_DATABASE_URL"])
        self.connection = await self.engine.connect()
        self.transaction = await self.connection.begin()
        self.session = AsyncSession(
            bind=self.connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        self.user = User(
            id=new_id(),
            email=new_id() + "@example.test",
            name="Reviewer",
            password_hash="unused",
            is_admin=False,
        )
        self.workspace = Workspace(
            id=new_id(),
            name="Budget review",
            kind="personal",
            country="TR",
            plan="pro",
            ai_policy="local",
        )
        self.session.add_all([self.user, self.workspace])
        await self.session.flush()
        self.session.add(
            Membership(workspace_id=self.workspace.id, user_id=self.user.id, role="owner")
        )
        self.budget = {
            "currency": "TRY",
            "items": [
                {
                    "id": "engineer",
                    "category": "personnel",
                    "description": "Research",
                    "amount": "100.00",
                }
            ],
        }
        self.project = Project(
            id=new_id(),
            workspace_id=self.workspace.id,
            title="Confirmed project",
            description="Research",
            profile={"budget": self.budget},
            revision=1,
            confirmed_revision=1,
            stage="idea",
        )
        self.program = Program(
            id=new_id(),
            code=new_id(),
            name="Source-backed grant",
            institution="Funder",
            country="TR",
            support_type="grant",
            description="Official call",
            official_url="https://example.test/call",
        )
        self.session.add_all([self.project, self.program])
        await self.session.flush()
        self.source = SourceRevision(
            id=new_id(),
            program_id=self.program.id,
            version=1,
            source_url="https://example.test/call",
            sha256="a" * 64,
            content="{}",
            checked_at=utcnow(),
            publication_status="published",
        )
        self.session.add(self.source)
        await self.session.flush()
        self.template = {
            "language": "tr",
            "sections": [
                {
                    "key": "purpose",
                    "label": "Purpose",
                    "required": True,
                    "source_url": self.source.source_url,
                }
            ],
            "documents": [],
        }
        self.call = FundingCall(
            id=new_id(),
            program_id=self.program.id,
            title="Selected published version",
            version=1,
            status="published",
            opens_at=utcnow() - timedelta(days=1),
            deadline=utcnow() + timedelta(days=10),
            rule_version="1",
            source_revision_id=self.source.id,
            rules=[],
            template=self.template,
            finance={
                "currency": "TRY",
                "support_kind": "grant",
                "budget_required": True,
                "eligible_categories": ["personnel"],
                "support_rate": "0.75",
            },
            language="tr",
            portal_url="https://example.test/submit",
        )
        self.session.add(self.call)
        await self.session.flush()
        self.evaluation = Evaluation(
            id=new_id(),
            workspace_id=self.workspace.id,
            project_id=self.project.id,
            profile_revision=1,
            call_id=self.call.id,
            call_version=1,
            source_revision_id=self.source.id,
            rule_version="1",
            evaluated_at=utcnow(),
            result={"eligibility": "eligible", "conditions": []},
        )
        self.application = Application(
            id=new_id(),
            workspace_id=self.workspace.id,
            project_id=self.project.id,
            call_id=self.call.id,
            call_version=1,
            source_revision_id=self.source.id,
            rule_version="1",
            profile_revision=1,
            revision=1,
            state="draft",
            template_snapshot=self.template,
            data={
                "sections": {"purpose": "Human reviewed purpose"},
                "attachments": {},
                "budget": self.budget,
            },
        )
        self.session.add_all([self.evaluation, self.application])
        await self.session.flush()

    async def asyncTearDown(self):
        await self.session.close()
        await self.transaction.rollback()
        await self.connection.close()
        await self.engine.dispose()

    async def test_eligible_application_cannot_submit_divergent_budget_and_explicit_import_restores_it(
        self,
    ):
        result, _, _, _ = await application_check(self.session, self.application, self.project)
        self.assertEqual(result["errors"], [])
        divergent = {**self.budget, "items": [{**self.budget["items"][0], "amount": "120.00"}]}
        self.application.data = {**self.application.data, "budget": divergent}
        await self.session.flush()
        with self.assertRaises(HTTPException) as raised:
            await submit_review(
                self.application.id, RevisionRequest(expected_revision=1), self.user, self.session
            )
        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn(
            {"code": "budget_profile_mismatch", "field": "project.budget"},
            [
                {"code": item["code"], "field": item["field"]}
                for item in raised.exception.detail["errors"]
            ],
        )
        imported = await import_project_budget(
            self.application.id, RevisionRequest(expected_revision=1), self.user, self.session
        )
        self.assertEqual(imported["data"]["budget"], self.budget)
        self.assertEqual(imported["revision"], 2)
        self.assertEqual(imported["state"], "draft")
        reviewed = await submit_review(
            self.application.id, RevisionRequest(expected_revision=2), self.user, self.session
        )
        self.assertEqual(reviewed["state"], "review_requested")

    async def test_decimal_formatting_does_not_change_eligibility_budget(self):
        self.project.profile = {
            "budget": {**self.budget, "items": [{**self.budget["items"][0], "amount": "100.000"}]}
        }
        result, _, _, _ = await application_check(self.session, self.application, self.project)
        self.assertEqual(result["errors"], [])

    async def test_import_refuses_currency_conversion_and_stale_profile(self):
        self.project.profile = {"budget": {**self.budget, "currency": "EUR"}}
        await self.session.flush()
        with self.assertRaises(HTTPException) as raised:
            await import_project_budget(
                self.application.id, RevisionRequest(expected_revision=1), self.user, self.session
            )
        self.assertEqual(raised.exception.detail["code"], "currency_mismatch")
        self.project.revision = 2
        self.project.confirmed_revision = 2
        await self.session.flush()
        with self.assertRaises(HTTPException) as raised:
            await import_project_budget(
                self.application.id, RevisionRequest(expected_revision=1), self.user, self.session
            )
        self.assertEqual(raised.exception.detail["code"], "stale_profile")

    async def test_published_call_with_missing_date_is_pending_not_open(self):
        missing_dates = FundingCall(
            id=new_id(),
            program_id=self.program.id,
            title="Published legacy call with unknown opening",
            version=2,
            status="published",
            opens_at=None,
            deadline=self.call.deadline,
            rule_version=self.call.rule_version,
            source_revision_id=self.source.id,
            rules=self.call.rules,
            template=self.call.template,
            finance=self.call.finance,
            language=self.call.language,
            portal_url=self.call.portal_url,
        )
        self.session.add(missing_dates)
        await self.session.flush()
        pending = await programs(
            self.program.code, None, None, "pending", "deadline", 100, 0, self.session
        )
        self.assertEqual([item["id"] for item in pending], [self.program.id])
        self.assertEqual(pending[0]["current_call"]["state"], "pending")
        opened = await programs(
            self.program.code, None, None, "open", "deadline", 100, 0, self.session
        )
        self.assertEqual(opened, [])

    async def test_legacy_missing_timeline_cannot_review_approve_or_export(self):
        await self.session.execute(
            update(FundingCall).where(FundingCall.id == self.call.id).values(opens_at=None)
        )
        await self.session.refresh(self.call)
        result, _, _, _ = await application_check(self.session, self.application, self.project)
        self.assertFalse(result["ready_for_review"])
        self.assertIn("call_dates_pending", [error["code"] for error in result["errors"]])
        with self.assertRaises(HTTPException) as raised:
            await submit_review(
                self.application.id, RevisionRequest(expected_revision=1), self.user, self.session
            )
        self.assertEqual(raised.exception.status_code, 422)
        self.application.state = "review_requested"
        await self.session.flush()
        with self.assertRaises(HTTPException) as raised:
            await approve_application(
                self.application.id,
                ApprovalRequest(expected_revision=1, approved=True, confirmed_language="tr"),
                self.user,
                self.session,
            )
        self.assertEqual(raised.exception.status_code, 422)
        self.application.state = "approved"
        await self.session.flush()
        with self.assertRaises(HTTPException) as raised:
            await export_application(self.application.id, "zip", 1, self.user, self.session)
        self.assertEqual(raised.exception.status_code, 409)
        self.assertIn(
            "call_dates_pending", [error["code"] for error in raised.exception.detail["errors"]]
        )

    async def test_overview_review_count_matches_persisted_state(self):
        self.application.state = "review_requested"
        await self.session.flush()
        data = await overview(self.workspace.id, self.user, self.session)
        self.assertEqual(data["counts"]["review_pending"], 1)
        self.assertIn(
            self.application.id, [action.get("application_id") for action in data["next_actions"]]
        )

    async def test_missing_worker_is_degraded_but_storage_outage_is_not_ready(self):
        await self.session.execute(delete(WorkerHeartbeat))
        await self.session.flush()

        def actual_session():
            return AsyncSession(
                bind=self.connection,
                expire_on_commit=False,
                join_transaction_mode="create_savepoint",
            )

        with (
            tempfile.TemporaryDirectory() as root,
            patch("backend.operations.AsyncSessionLocal", actual_session),
            patch.object(settings, "storage_root", Path(root)),
            patch.object(settings, "local_ai_base_url", None),
            patch.object(settings, "openai_api_key", ""),
        ):
            health = await health_payload()
            self.assertTrue(health["ready"])
            self.assertTrue(health["degraded"])
            workers = [
                service for service in health["services"] if service["code"].startswith("worker_")
            ]
            self.assertTrue(all(service["available"] is False for service in workers))
            with patch.object(settings, "storage_root", Path(root) / "missing"):
                outage = await health_payload()
                self.assertFalse(outage["ready"])

    async def test_preregistration_mine_and_selected_json_ics_match_without_legacy_backfill(self):
        import json
        from datetime import datetime

        from backend.funding import load_seed_catalog, source_digest

        entry = next(item for item in load_seed_catalog()["programs"] if item["code"] == "TR-1501")
        milestone = entry["call"]["template"]["milestones"][0]
        due = datetime.fromisoformat(milestone["at"])
        start, end = due - timedelta(hours=1), due + timedelta(hours=1)
        other = User(
            id=new_id(), email=new_id() + "@example.test", name="Other", password_hash="unused"
        )
        outsider = User(
            id=new_id(),
            email=new_id() + "@example.test",
            name="Outsider",
            password_hash="unused",
            is_admin=True,
        )
        self.session.add_all([other, outsider])
        await self.session.flush()
        self.session.add(
            Membership(workspace_id=self.workspace.id, user_id=other.id, role="editor")
        )
        source = SourceRevision(
            id=new_id(),
            program_id=self.program.id,
            version=2,
            source_url=milestone["source_url"],
            sha256=source_digest(entry["sources"]),
            content=json.dumps(entry["sources"]),
            checked_at=utcnow(),
            publication_status="published",
        )
        self.session.add(source)
        await self.session.flush()
        published = FundingCall(
            id=new_id(),
            program_id=self.program.id,
            title="Reviewed preregistration version",
            version=2,
            status="published",
            opens_at=due - timedelta(days=10),
            deadline=due + timedelta(days=4),
            rule_version="2",
            source_revision_id=source.id,
            rules=[],
            template={**self.template, "milestones": [milestone]},
            finance=self.call.finance,
            language="tr",
            portal_url=self.call.portal_url,
        )
        self.session.add(published)
        await self.session.flush()
        self.session.add(
            Evaluation(
                id=new_id(),
                workspace_id=self.workspace.id,
                project_id=self.project.id,
                profile_revision=1,
                call_id=published.id,
                call_version=2,
                source_revision_id=source.id,
                rule_version="2",
                evaluated_at=utcnow(),
                result={},
            )
        )
        draft = FundingCall(
            id=new_id(),
            program_id=self.program.id,
            title="Unreviewed milestone version",
            version=3,
            status="draft",
            opens_at=None,
            deadline=None,
            rule_version="3",
            source_revision_id=source.id,
            rules=[],
            template={**self.template, "milestones": [milestone]},
            finance=self.call.finance,
            language="tr",
            portal_url=self.call.portal_url,
        )
        foreign_workspace = Workspace(
            id=new_id(), name="Foreign", kind="personal", country="TR", plan="pro"
        )
        self.session.add_all([draft, foreign_workspace])
        await self.session.flush()
        foreign_project = Project(
            id=new_id(),
            workspace_id=foreign_workspace.id,
            title="Foreign project",
            profile={},
            stage="idea",
        )
        self.session.add(foreign_project)
        self.session.add(
            Evaluation(
                id=new_id(),
                workspace_id=self.workspace.id,
                project_id=self.project.id,
                profile_revision=1,
                call_id=draft.id,
                call_version=3,
                source_revision_id=source.id,
                rule_version="3",
                evaluated_at=utcnow(),
                result={},
            )
        )
        mine = TaskItem(
            id=new_id(),
            workspace_id=self.workspace.id,
            project_id=self.project.id,
            title="My dated task",
            due_at=due + timedelta(minutes=1),
            status="open",
            assignee_id=self.user.id,
        )
        theirs = TaskItem(
            id=new_id(),
            workspace_id=self.workspace.id,
            project_id=self.project.id,
            title="Other dated task",
            due_at=due + timedelta(minutes=2),
            status="open",
            assignee_id=other.id,
        )
        self.session.add_all([mine, theirs])
        await self.session.flush()
        filters = dict(
            workspace_id=self.workspace.id,
            project_id=self.project.id,
            from_at=start,
            to_at=end,
            types="task,preregistration",
            user=self.user,
            session=self.session,
        )
        data = await calendar_json(**filters, mine=True)
        expected_ids = {
            "task-" + mine.id,
            f"preregistration-preregistration-{published.id}-{self.project.id}",
        }
        self.assertEqual({event["id"] for event in data["events"]}, expected_ids)
        self.assertEqual({event["kind"] for event in data["events"]}, {"task", "preregistration"})
        reminder = next(event for event in data["events"] if event["kind"] == "preregistration")
        self.assertEqual(reminder["start_at"], due)
        self.assertEqual(reminder["source_url"], milestone["source_url"])
        self.assertEqual(reminder["project_id"], self.project.id)
        self.assertIn("§6 p.3", reminder["source_locator"])
        exported = await calendar(**filters, mine=True)
        text = exported.body.decode().replace("\r\n ", "")
        self.assertEqual(text.count("BEGIN:VEVENT"), 2)
        self.assertIn("DTSTART:20261022T205959Z", text)
        self.assertIn(milestone["source_url"], text)
        self.assertIn("Project: " + self.project.id, text)
        for event_id in expected_ids:
            self.assertIn("UID:" + event_id + "@abi", text)
        self.assertNotIn(theirs.id, text)
        all_events = await calendar_json(**filters)
        self.assertEqual(len(all_events["events"]), 3)
        selected = sorted(expected_ids)
        selected_json = await calendar_json(**filters, selected_ids=selected)
        self.assertEqual({event["id"] for event in selected_json["events"]}, expected_ids)
        selected_ics = await calendar(**filters, selected_ids=selected)
        self.assertEqual(selected_ics.body.decode().count("BEGIN:VEVENT"), 2)
        self.assertNotIn(theirs.id, selected_ics.body.decode())
        legacy = await calendar_json(
            **{**filters, "types": "preregistration", "from_at": None, "to_at": None}
        )
        self.assertEqual([event["call_id"] for event in legacy["events"]], [published.id])
        self.assertNotIn("milestones", self.call.template)
        for endpoint in (calendar_json, calendar):
            for override, status in (
                ({"user": outsider}, 404),
                ({"project_id": foreign_project.id}, 404),
                ({"assignee_id": outsider.id}, 404),
                ({"mine": True, "assignee_id": other.id}, 422),
                ({"mine": True, "selected_ids": ["task-" + theirs.id]}, 404),
                ({"selected_ids": ["task-" + new_id()]}, 404),
                ({"selected_ids": ["task-" + mine.id] * 101}, 422),
            ):
                with (
                    self.subTest(endpoint=endpoint.__name__, override=override),
                    self.assertRaises(HTTPException) as raised,
                ):
                    await endpoint(**{**filters, **override})
                self.assertEqual(raised.exception.status_code, status)
        at_boundary = await calendar_json(
            **{
                **filters,
                "types": "preregistration",
                "from_at": due,
                "to_at": due + timedelta(seconds=1),
            }
        )
        self.assertEqual(len(at_boundary["events"]), 1)
        before_boundary = await calendar_json(
            **{**filters, "types": "preregistration", "to_at": due}
        )
        self.assertEqual(before_boundary["events"], [])

    async def test_calendar_json_and_ics_share_selection_and_reject_foreign_project(self):
        due = utcnow() + timedelta(days=2)
        task = TaskItem(
            id=new_id(),
            workspace_id=self.workspace.id,
            project_id=self.project.id,
            title="Dated review, with punctuation",
            description="Actual task",
            due_at=due,
            status="open",
        )
        undated = TaskItem(
            id=new_id(),
            workspace_id=self.workspace.id,
            project_id=self.project.id,
            title="Undated task",
            status="open",
        )
        self.session.add_all([task, undated])
        await self.session.flush()
        start, end = due - timedelta(hours=1), due + timedelta(hours=1)
        data = await calendar_json(
            self.workspace.id, self.project.id, start, end, "task", self.user, self.session
        )
        self.assertEqual([event["task_id"] for event in data["events"]], [task.id])
        exported = await calendar(
            self.workspace.id, self.project.id, start, end, "task", self.user, self.session
        )
        text = exported.body.decode()
        self.assertEqual(text.count("BEGIN:VEVENT"), 1)
        self.assertIn("UID:task-" + task.id + "@abi", text)
        self.assertNotIn("deadline-", text)
        with self.assertRaises(HTTPException) as raised:
            await calendar_json(
                self.workspace.id, new_id(), start, end, "task", self.user, self.session
            )
        self.assertEqual(raised.exception.status_code, 404)

    async def test_free_historical_reads_do_not_allow_new_task_and_viewer_cannot_edit(self):
        existing = TaskItem(
            id=new_id(),
            workspace_id=self.workspace.id,
            project_id=self.project.id,
            title="Historical task",
            description="Preserved after downgrade",
            status="open",
        )
        self.session.add(existing)
        self.workspace.plan = "free"
        await self.session.flush()
        rows = await tasks(
            self.workspace.id, None, None, None, None, 100, 0, self.user, self.session
        )
        self.assertEqual([row["id"] for row in rows], [existing.id])
        self.assertEqual(rows[0]["description"], "Preserved after downgrade")
        with self.assertRaises(HTTPException) as raised:
            await create_task(
                self.project.id, TaskCreate(title="Cannot create free"), self.user, self.session
            )
        self.assertEqual(raised.exception.status_code, 403)
        self.workspace.plan = "pro"
        membership = await self.session.get(Membership, (self.workspace.id, self.user.id))
        membership.role = "viewer"
        await self.session.flush()
        with self.assertRaises(HTTPException) as raised:
            await create_task(
                self.project.id,
                TaskCreate(title="Cannot create as viewer"),
                self.user,
                self.session,
            )
        self.assertEqual(raised.exception.status_code, 403)

    async def test_global_admin_has_no_tenant_content_access_without_membership(self):
        document = Document(
            id=new_id(),
            workspace_id=self.workspace.id,
            project_id=self.project.id,
            uploader_id=self.user.id,
            original_name="private.txt",
            mime="text/plain",
            size=12,
            sha256="b" * 64,
            storage_key=new_id(),
            text="Private text",
            metadata_json={},
            status="uploaded",
        )
        self.session.add(document)
        outsider = User(
            id=new_id(),
            email=new_id() + "@example.test",
            name="Global admin",
            password_hash="unused",
            is_admin=True,
        )
        self.session.add(outsider)
        await self.session.flush()
        with self.assertRaises(HTTPException) as raised:
            await document_detail(self.workspace.id, document.id, outsider, self.session)
        self.assertEqual(raised.exception.status_code, 404)
        owned = await document_detail(self.workspace.id, document.id, self.user, self.session)
        self.assertEqual(owned["text_content"], "Private text")
        self.assertEqual(owned["used_by"], [])

    async def test_task_references_require_same_project_and_workspace_and_survive_roundtrip(self):
        other_workspace = Workspace(
            id=new_id(),
            name="Other tenant",
            kind="personal",
            country="TR",
            plan="pro",
        )
        self.session.add(other_workspace)
        await self.session.flush()
        other_projects = [
            Project(id=new_id(), workspace_id=workspace_id, title="Other project", profile={})
            for workspace_id in (self.workspace.id, other_workspace.id)
        ]
        self.session.add_all(other_projects)
        await self.session.flush()
        documents = []
        applications = []
        for project in [self.project, *other_projects]:
            document = Document(
                id=new_id(),
                workspace_id=project.workspace_id,
                project_id=project.id,
                original_name="Evidence.txt",
                mime="text/plain",
                size=5,
                sha256="c" * 64,
                storage_key=new_id(),
                metadata_json={},
                text="Proof",
            )
            application = Application(
                id=new_id(),
                workspace_id=project.workspace_id,
                project_id=project.id,
                call_id=self.call.id,
                call_version=1,
                source_revision_id=self.source.id,
                rule_version="1",
                profile_revision=1,
                revision=1,
                data=self.application.data,
                template_snapshot=self.template,
            )
            documents.append(document)
            applications.append(application)
        self.session.add_all(documents + applications)
        await self.session.flush()
        for field, records in (("application_id", applications), ("document_id", documents)):
            for foreign_record in records[1:]:
                with self.assertRaises(HTTPException) as raised:
                    await create_task(
                        self.project.id,
                        TaskCreate(title="Invalid reference", **{field: foreign_record.id}),
                        self.user,
                        self.session,
                    )
                self.assertEqual(raised.exception.status_code, 422)
        created = await create_task(
            self.project.id,
            TaskCreate(
                title="Linked task", application_id=applications[0].id, document_id=documents[0].id
            ),
            self.user,
            self.session,
        )
        result = await task_detail(created["id"], self.user, self.session)
        self.assertEqual(result["application_id"], applications[0].id)
        self.assertEqual(result["application_title"], self.call.title)
        self.assertEqual(result["document_id"], documents[0].id)
        self.assertEqual(result["document_name"], "Evidence.txt")
        for field, records in (("application_id", applications), ("document_id", documents)):
            for foreign_record in records[1:]:
                with self.assertRaises(HTTPException) as raised:
                    await update_task(
                        created["id"],
                        TaskPatch(**{field: foreign_record.id}),
                        self.user,
                        self.session,
                    )
                self.assertEqual(raised.exception.status_code, 422)
        await self.session.delete(applications[0])
        await self.session.delete(documents[0])
        await self.session.flush()
        self.session.expire_all()
        await self.session.refresh(self.user)
        result = await task_detail(created["id"], self.user, self.session)
        self.assertIsNone(result["application_id"])
        self.assertIsNone(result["document_id"])

    async def test_responsible_requires_current_editor_and_invalidates_revision_approval(self):
        responsible = User(
            id=new_id(),
            email=new_id() + "@example.test",
            name="Responsible editor",
            password_hash="unused",
        )
        self.session.add(responsible)
        await self.session.flush()
        membership = Membership(
            workspace_id=self.workspace.id, user_id=responsible.id, role="viewer"
        )
        self.session.add(membership)
        await self.session.flush()
        for role in ("viewer", None):
            if role is None:
                await self.session.delete(membership)
                await self.session.flush()
            with self.assertRaises(HTTPException) as raised:
                await edit_application(
                    self.application.id,
                    EditApplication(expected_revision=1, responsible_id=responsible.id),
                    self.user,
                    self.session,
                )
            self.assertEqual(raised.exception.status_code, 422)
        membership = Membership(
            workspace_id=self.workspace.id, user_id=responsible.id, role="editor"
        )
        self.session.add(membership)
        self.application.state = "approved"
        original_data = self.application.data
        await self.session.flush()
        result = await edit_application(
            self.application.id,
            EditApplication(expected_revision=1, responsible_id=responsible.id),
            self.user,
            self.session,
        )
        self.assertEqual(result["responsible_id"], responsible.id)
        self.assertEqual(result["responsible_name"], responsible.name)
        self.assertEqual(result["revision"], 2)
        self.assertEqual(result["state"], "draft")
        self.assertEqual(result["data"], original_data)
        with self.assertRaises(HTTPException) as raised:
            await edit_application(
                self.application.id,
                EditApplication(expected_revision=1, responsible_id=None),
                self.user,
                self.session,
            )
        self.assertEqual(raised.exception.status_code, 409)
        await self.session.delete(membership)
        await self.session.flush()
        # Historical ownership remains visible and does not prevent unrelated content saves.
        result = await edit_application(
            self.application.id,
            EditApplication(expected_revision=2, responsible_id=responsible.id, data=original_data),
            self.user,
            self.session,
        )
        self.assertEqual(result["responsible_name"], "Responsible editor")
        cleared = await edit_application(
            self.application.id,
            EditApplication(expected_revision=3, responsible_id=None),
            self.user,
            self.session,
        )
        self.assertIsNone(cleared["responsible_id"])
        self.assertIsNone(cleared["responsible_name"])

    async def test_task_history_is_attributed_ordered_paginated_and_tenant_scoped(self):
        task = await create_task(
            self.project.id, TaskCreate(title="Actual task"), self.user, self.session
        )
        await create_task(
            self.project.id, TaskCreate(title="Unrelated task"), self.user, self.session
        )
        await update_task(task["id"], TaskPatch(status="done"), self.user, self.session)
        await delete_task(task["id"], self.user, self.session)
        events = await task_history(task["id"], 50, 0, self.user, self.session)
        self.assertEqual(
            [event["event_type"] for event in events],
            ["task.deleted", "task.updated", "task.created"],
        )
        self.assertTrue(all(event["detail"]["task_id"] == task["id"] for event in events))
        self.assertTrue(all(event["actor_name"] == self.user.name for event in events))
        self.assertEqual(events[1]["detail"]["changed_fields"], ["status"])
        page = await task_history(task["id"], 1, 1, self.user, self.session)
        self.assertEqual(page, events[1:2])
        outsider = User(
            id=new_id(),
            email=new_id() + "@example.test",
            name="Global admin",
            password_hash="unused",
            is_admin=True,
        )
        self.session.add(outsider)
        await self.session.flush()
        with self.assertRaises(HTTPException) as raised:
            await task_history(task["id"], 50, 0, outsider, self.session)
        self.assertEqual(raised.exception.status_code, 404)

    async def test_task_assignee_requires_current_editor_and_preserves_historical_assignment(self):
        assignee = User(
            id=new_id(),
            email=new_id() + "@example.test",
            name="Task editor",
            password_hash="unused",
        )
        self.session.add(assignee)
        await self.session.flush()
        with self.assertRaises(HTTPException) as raised:
            await create_task(
                self.project.id,
                TaskCreate(title="Unknown assignee", assignee_id=assignee.id),
                self.user,
                self.session,
            )
        self.assertEqual(raised.exception.status_code, 422)
        membership = Membership(workspace_id=self.workspace.id, user_id=assignee.id, role="viewer")
        self.session.add(membership)
        await self.session.flush()
        with self.assertRaises(HTTPException) as raised:
            await create_task(
                self.project.id,
                TaskCreate(title="Viewer assignee", assignee_id=assignee.id),
                self.user,
                self.session,
            )
        self.assertEqual(raised.exception.status_code, 422)
        membership.role = "editor"
        await self.session.flush()
        task = await create_task(
            self.project.id,
            TaskCreate(title="Editor assigned", assignee_id=assignee.id),
            self.user,
            self.session,
        )
        result = await task_detail(task["id"], self.user, self.session)
        self.assertEqual(result["assignee_name"], "Task editor")
        await self.session.delete(membership)
        await self.session.flush()
        result = await update_task(
            task["id"],
            TaskPatch(title="Historical assignee", assignee_id=assignee.id),
            self.user,
            self.session,
        )
        self.assertEqual(result["assignee_id"], assignee.id)
        await update_task(task["id"], TaskPatch(assignee_id=None), self.user, self.session)
        with self.assertRaises(HTTPException) as raised:
            await update_task(
                task["id"],
                TaskPatch(assignee_id=assignee.id),
                self.user,
                self.session,
            )
        self.assertEqual(raised.exception.status_code, 422)
