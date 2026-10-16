"""Opt-in PostgreSQL regressions against an already migrated dedicated test database."""

import asyncio
import os
import unittest
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend import ai
from backend.workspaces import Membership, Project, ProjectRevision, User, Workspace, new_id, utcnow


@unittest.skipUnless(
    os.environ.get("ABI_TEST_DATABASE_URL"),
    "Set ABI_TEST_DATABASE_URL to a dedicated migrated PostgreSQL database",
)
class QuotaTransactionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine(os.environ["ABI_TEST_DATABASE_URL"])
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        (
            self.user_id,
            self.workspace_id,
            self.second_workspace_id,
            self.project_id,
            self.second_project_id,
        ) = (new_id() for _ in range(5))
        async with self.sessions() as session:
            session.add(
                User(
                    id=self.user_id,
                    email=f"{self.user_id}@quota-test.invalid",
                    name="Quota regression",
                    password_hash="unused-test-account",
                )
            )
            session.add_all(
                [
                    Workspace(
                        id=self.workspace_id, name="Quota test", plan="free", ai_policy="local"
                    ),
                    Workspace(
                        id=self.second_workspace_id,
                        name="Second Free workspace",
                        plan="free",
                        ai_policy="local",
                    ),
                ]
            )
            await session.flush()
            session.add_all(
                [
                    Membership(workspace_id=workspace_id, user_id=self.user_id, role="owner")
                    for workspace_id in (self.workspace_id, self.second_workspace_id)
                ]
            )
            session.add(
                Project(
                    id=self.project_id,
                    workspace_id=self.workspace_id,
                    title="Quota regression",
                    description="Original description",
                    revision=1,
                    profile={},
                )
            )
            session.add(
                Project(
                    id=self.second_project_id,
                    workspace_id=self.second_workspace_id,
                    title="Second quota regression",
                    description="Second description",
                    revision=1,
                    profile={},
                )
            )
            await session.commit()

    async def asyncTearDown(self):
        async with self.sessions() as session:
            await session.execute(
                delete(ai.UsageEvent).where(ai.UsageEvent.actor_id == self.user_id)
            )
            await session.execute(
                delete(ai.UsageCredit).where(ai.UsageCredit.actor_id == self.user_id)
            )
            await session.execute(
                delete(ProjectRevision).where(
                    ProjectRevision.project_id.in_([self.project_id, self.second_project_id])
                )
            )
            await session.execute(
                delete(Project).where(Project.id.in_([self.project_id, self.second_project_id]))
            )
            await session.execute(delete(Membership).where(Membership.user_id == self.user_id))
            await session.execute(
                delete(Workspace).where(
                    Workspace.id.in_([self.workspace_id, self.second_workspace_id])
                )
            )
            await session.execute(delete(User).where(User.id == self.user_id))
            await session.commit()
        await self.engine.dispose()

    async def seed_used(self, amount, category="chat"):
        async with self.sessions() as session:
            session.add_all(
                [
                    ai.UsageEvent(
                        workspace_id=self.workspace_id,
                        project_id=self.project_id,
                        actor_id=self.user_id,
                        month=ai.month_key(),
                        plan="free",
                        category=category,
                        operation="chat",
                        status="succeeded",
                        profile_revision=1,
                        ai_policy="local",
                        model="historical-local-model",
                        expires_at=utcnow() + timedelta(minutes=5),
                        completed_at=utcnow(),
                    )
                    for _ in range(amount)
                ]
            )
            await session.commit()

    async def reserve(self, workspace_id, category="chat"):
        async with self.sessions() as session:
            user = await session.get(User, self.user_id)
            project_id = (
                self.project_id if workspace_id == self.workspace_id else self.second_project_id
            )
            event = await ai.reserve_usage(
                session, user, workspace_id, project_id, 1, operation="chat", category=category
            )
            await session.commit()
            return event.id

    async def test_concurrent_last_free_slot_is_shared_across_workspaces(self):
        await self.seed_used(99)
        results = await asyncio.gather(
            self.reserve(self.workspace_id),
            self.reserve(self.second_workspace_id),
            return_exceptions=True,
        )
        self.assertEqual(sum(isinstance(result, str) for result in results), 1)
        failure = next(result for result in results if isinstance(result, HTTPException))
        self.assertEqual(failure.status_code, 429)
        async with self.sessions() as session:
            workspace = await session.get(Workspace, self.workspace_id)
            usage = await ai.usage_payload(session, workspace, self.user_id)
        self.assertEqual(usage["chat"]["used"], 99)
        self.assertEqual(usage["chat"]["reserved"], 1)
        self.assertEqual(usage["chat"]["remaining"], 0)

    async def test_failure_refund_and_deleted_workspace_do_not_reset_used_count(self):
        await self.seed_used(99)
        event_id = await self.reserve(self.workspace_id)
        # Same durable refund path as the API, against this test database only.
        original_sessions = ai.AsyncSessionLocal
        ai.AsyncSessionLocal = self.sessions
        try:
            await ai.refund_operation(event_id, self.workspace_id, "provider_error")
        finally:
            ai.AsyncSessionLocal = original_sessions
        async with self.sessions() as session:
            event = await session.get(ai.UsageEvent, event_id)
            self.assertEqual(event.status, "failed")
            # Erasure preserves counting while removing tenant references/private content.
            await session.execute(
                ai.UsageEvent.__table__.update()
                .where(ai.UsageEvent.actor_id == self.user_id)
                .values(workspace_id=None, project_id=None, result={})
            )
            await session.commit()
            workspace = await session.get(Workspace, self.second_workspace_id)
            usage = await ai.usage_payload(session, workspace, self.user_id)
        self.assertEqual(usage["chat"]["used"], 99)
        self.assertEqual(usage["chat"]["reserved"], 0)
        self.assertEqual(usage["chat"]["remaining"], 1)

    async def test_stale_written_response_never_overwrites_manual_revision(self):
        event_id = await self.reserve(self.workspace_id, "write")
        async with self.sessions() as session:
            event = await session.get(ai.UsageEvent, event_id)
            event.operation = "write"
            project = await session.get(Project, self.project_id)
            project.description = "Manually updated description"
            project.revision = 2
            await session.commit()
        async with self.sessions() as session:
            user = await session.get(User, self.user_id)
            event = await session.get(ai.UsageEvent, event_id)
            with self.assertRaises(HTTPException) as failure:
                await ai.finalize_operation(session, user, event, {"description": "Stale AI draft"})
            self.assertEqual(failure.exception.status_code, 409)
            await session.rollback()
        async with self.sessions() as session:
            project = await session.get(Project, self.project_id)
            event = await session.get(ai.UsageEvent, event_id)
            self.assertEqual(project.description, "Manually updated description")
            self.assertEqual(project.revision, 2)
            self.assertNotEqual(event.status, "succeeded")
