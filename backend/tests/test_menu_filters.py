"""Server-side menu filters must run before pagination and remain source-backed."""

import os
import unittest
from datetime import timedelta

from backend.applications import Application
from backend.funding import FundingCall, programs
from backend.menu_api import applications
from backend.tests import test_menu_postgres
from backend.workspaces import utcnow


@unittest.skipUnless(
    os.environ.get("ABI_TEST_DATABASE_URL"), "Requires dedicated migrated PostgreSQL"
)
class MenuFilterBoundaries(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.fixture = test_menu_postgres.PostgreSQLMenuBoundaries()
        await self.fixture.asyncSetUp()

    async def asyncTearDown(self):
        await self.fixture.asyncTearDown()

    async def test_application_deadline_and_responsible_filters_precede_pagination(self):
        fixture = self.fixture
        early = utcnow() + timedelta(days=1)
        call = FundingCall(
            program_id=fixture.program.id,
            title="Earlier real call",
            version=2,
            status="published",
            opens_at=early - timedelta(days=2),
            deadline=early,
            rule_version="2",
            source_revision_id=fixture.source.id,
            rules=[],
            template=fixture.template,
            finance=fixture.call.finance,
            language="tr",
            portal_url=fixture.call.portal_url,
        )
        fixture.session.add(call)
        await fixture.session.flush()
        selected = Application(
            workspace_id=fixture.workspace.id,
            project_id=fixture.project.id,
            call_id=call.id,
            call_version=2,
            source_revision_id=fixture.source.id,
            rule_version="2",
            profile_revision=1,
            revision=1,
            state="draft",
            responsible_id=fixture.user.id,
            template_snapshot=fixture.template,
            data=fixture.application.data,
            created_at=utcnow() - timedelta(days=2),
        )
        fixture.session.add(selected)
        await fixture.session.flush()
        rows = await applications(
            fixture.workspace.id,
            None,
            None,
            "",
            1,
            0,
            fixture.user,
            fixture.session,
            due_before=early.date(),
            responsible_id=fixture.user.id,
        )
        self.assertEqual([row["id"] for row in rows], [selected.id])
        self.assertEqual(rows[0]["responsible_name"], fixture.user.name)
        outside = await applications(
            fixture.workspace.id,
            None,
            None,
            "",
            100,
            0,
            fixture.user,
            fixture.session,
            due_before=(early - timedelta(days=1)).date(),
        )
        self.assertEqual(outside, [])

    async def test_applicant_filter_uses_recorded_source_conditions(self):
        fixture = self.fixture
        # A new immutable published version supplies the actual SME condition.
        call = FundingCall(
            program_id=fixture.program.id,
            title="SME source scope",
            version=2,
            status="published",
            opens_at=fixture.call.opens_at,
            deadline=fixture.call.deadline,
            rule_version="2",
            source_revision_id=fixture.source.id,
            rules=[
                {
                    "id": "sme",
                    "field": "company.is_sme",
                    "op": "eq",
                    "expected": True,
                    "value_type": "boolean",
                    "label": "SME",
                    "source_url": fixture.source.source_url,
                    "source_locator": "Source condition",
                }
            ],
            template=fixture.template,
            finance=fixture.call.finance,
            language="tr",
            portal_url=fixture.call.portal_url,
        )
        fixture.session.add(call)
        await fixture.session.flush()
        sme = await programs(
            fixture.program.code, None, None, None, "name", 100, 0, fixture.session, applicant="sme"
        )
        individual = await programs(
            fixture.program.code,
            None,
            None,
            None,
            "name",
            100,
            0,
            fixture.session,
            applicant="individual",
        )
        self.assertEqual([row["id"] for row in sme], [fixture.program.id])
        self.assertEqual(individual, [])
