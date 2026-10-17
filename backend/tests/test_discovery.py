"""Country-route evidence and persisted preparation-selection consumer boundaries."""

import base64
import json
import os
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from backend.discovery import (
    ProjectFundingSelection,
    SelectionRequest,
    country_classification,
    funding_discovery,
    funding_selections,
    project_country,
    recommendation,
    select_funding,
)
from backend.funding import (
    FundingCall,
    Program,
    SourceRevision,
    funding_call_state,
    load_seed_catalog,
    new_id,
    utcnow,
)
from backend.workspaces import Membership, Project, User, Workspace

SOURCE_URL = "https://www.gov.uk/claim-employment-allowance/eligibility"


def country_rule(country="TR", field="company.country", label="Applicant established in country"):
    return {
        "id": "country",
        "label": label,
        "field": field,
        "op": "eq",
        "value_type": "string",
        "expected": country,
        "source_url": SOURCE_URL,
        "source_locator": "Who can apply",
    }


def source_record(publication="pending", snapshots=None):
    return SourceRevision(
        id=new_id(),
        program_id=new_id(),
        version=1,
        source_url=SOURCE_URL,
        content=json.dumps(snapshots if snapshots is not None else [{"url": SOURCE_URL}]),
        sha256="a" * 64,
        checked_at=utcnow(),
        publication_status=publication,
    )


def call_record(rules, source, **changes):
    return FundingCall(
        **{
            "id": new_id(),
            "program_id": source.program_id,
            "title": "Recorded call",
            "version": 1,
            "status": "draft",
            "source_revision_id": source.id,
            "rules": rules,
            "rule_version": "1",
            "template": {
                "sections": [
                    {
                        "key": "purpose",
                        "label": "Purpose",
                        "required": True,
                        "source_url": SOURCE_URL,
                        "source_locator": "Section 1",
                    }
                ],
                "documents": [],
                "guidance": [],
                "language": "en",
            },
            "finance": {},
            "language": "en",
            "portal_url": SOURCE_URL,
            "opens_at": None,
            "deadline": None,
            **changes,
        }
    )


def project_record(country="TR", **changes):
    return Project(
        **{
            "id": new_id(),
            "workspace_id": new_id(),
            "title": "Actual project",
            "profile": {"project": {"country": country}},
            "revision": 2,
            "confirmed_revision": 2,
            **changes,
        }
    )


class CountryEvidenceTests(unittest.TestCase):
    def test_country_uses_confirmed_scope_then_explicit_legacy_company_fact(self):
        project = project_record(
            profile={"project": {"country": "DE"}, "company": {"country": "TR"}}
        )
        self.assertEqual(project_country(project), ("DE", "project.country"))
        project.profile = {"company": {"country": "TR"}}
        self.assertEqual(project_country(project), ("TR", "company.country"))
        project.profile = {"project": {"country": ""}, "company": {"country": "TR"}}
        self.assertEqual(project_country(project), (None, None))
        project.profile = {}
        self.assertEqual(project_country(project), (None, None))
        project.profile = {"project": {"country": "TR"}}
        project.confirmed_revision = 1
        self.assertEqual(project_country(project), (None, None))

    def test_foreign_program_country_alone_never_proves_participation(self):
        program = Program(country="US")
        source = source_record()
        call = call_record([], source)
        self.assertEqual(country_classification("TR", program, call, source), ("unknown", []))

    def test_captured_direct_rule_preserves_pending_source_status(self):
        source = source_record()
        call = call_record([country_rule("TR")], source)
        program = Program(country="EU")
        rec = recommendation(project_record(), program, call, source)
        self.assertEqual(rec["classification"], "direct")
        self.assertEqual(rec["source_urls"], [SOURCE_URL])
        self.assertTrue(rec["recommended"])
        self.assertTrue(rec["preparation_only"])
        self.assertEqual(funding_call_state(call, False), "pending")
        self.assertTrue(
            any("human review/publication" in item for item in rec["missing_information"])
        )
        self.assertTrue(any("deadline" in item for item in rec["missing_information"]))

    def test_uncaptured_country_rule_never_proves_route(self):
        source = source_record(snapshots=[])
        call = call_record([country_rule("TR")], source)
        self.assertEqual(
            country_classification("TR", Program(country="EU"), call, source)[0], "unknown"
        )

    def test_establishment_requires_company_rule_not_project_location_or_scope_filter(self):
        source = source_record()
        for rule, expected in [
            (country_rule("DE"), "establish"),
            (country_rule("DE", "project.country"), "unknown"),
            (country_rule("DE", label="Selected applicant scope"), "unknown"),
            (country_rule("DE", "extra.eurostars_lead_country"), "unknown"),
        ]:
            with self.subTest(rule=rule):
                call = call_record([rule], source)
                self.assertEqual(
                    country_classification("TR", Program(country="DE"), call, source)[0], expected
                )

    def test_contradictory_country_rules_cannot_be_direct(self):
        source = source_record()
        call = call_record([country_rule("TR"), country_rule("DE") | {"id": "second"}], source)
        self.assertEqual(
            country_classification("TR", Program(country="EU"), call, source)[0], "unknown"
        )

    def test_worldwide_application_statement_is_captured_and_does_not_remove_restructure_review(
        self,
    ):
        source = source_record(
            snapshots=[
                {
                    "url": SOURCE_URL,
                    "content_base64": base64.b64encode(
                        b"<p>We have startups that apply to YC from all around the world</p>"
                    ).decode(),
                }
            ]
        )
        rules = [
            {
                "id": "restructure",
                "label": "Accepted parent corporation structure requires review",
                "field": "extra.structure",
                "op": "review",
                "value_type": "string",
                "expected": None,
                "source_url": SOURCE_URL,
                "source_locator": "Incorporating",
            }
        ]
        call = call_record(rules, source)
        rec = recommendation(project_record(), Program(country="US"), call, source)
        self.assertEqual(rec["classification"], "direct")
        self.assertEqual(rec["conditions"][0]["status"], "missing")
        self.assertIn("world", rec["country_evidence"][0]["label"])
        source.content = json.dumps(
            [
                {
                    "url": SOURCE_URL,
                    "content_base64": base64.b64encode(
                        b"Applicants cannot apply worldwide."
                    ).decode(),
                }
            ]
        )
        self.assertEqual(
            country_classification("TR", Program(country="US"), call, source)[0], "unknown"
        )

    def test_unknown_country_never_becomes_domestic_and_failed_facts_not_recommended(self):
        source = source_record()
        program = Program(country="TR")
        call = call_record([country_rule("TR")], source)
        unknown = recommendation(project_record(confirmed_revision=None), program, call, source)
        self.assertEqual(unknown["classification"], "unknown")
        self.assertFalse(unknown["recommended"])
        project = project_record(
            profile={"project": {"country": "TR"}, "company": {"country": "DE"}}
        )
        self.assertFalse(recommendation(project, program, call, source)["recommended"])

    def test_actual_captured_catalogue_country_routes_never_invent_foreign_eligibility(self):
        entries = {entry["code"]: entry for entry in load_seed_catalog()["programs"]}
        expected = {
            "TR-1501": ("DE", "establish"),
            "EUROSTARS-EU": ("DE", "direct"),
            "YC-US": ("TR", "direct"),
            "YC-LI": ("TR", "unknown"),
            "GB-MERGED-RDEC": ("TR", "unknown"),
            "TR-BIGG-1812": ("DE", "unknown"),
        }
        for code, (country, classification) in expected.items():
            with self.subTest(code=code):
                entry = entries[code]
                source = source_record(snapshots=entry["sources"])
                call = call_record(entry["call"]["rules"], source)
                actual, evidence = country_classification(
                    country, Program(country=entry["country"]), call, source
                )
                self.assertEqual(actual, classification)
                if classification != "unknown":
                    self.assertTrue(evidence)
                    self.assertTrue(
                        all(
                            item["source_url"] in {snapshot["url"] for snapshot in entry["sources"]}
                            for item in evidence
                        )
                    )


class DiscoveryPermissionTests(unittest.IsolatedAsyncioTestCase):
    async def test_foreign_project_access_failure_stops_discovery_and_selection_queries(self):
        session = AsyncMock()
        with patch(
            "backend.discovery.project_access", side_effect=HTTPException(404, "Project not found")
        ):
            with self.assertRaises(HTTPException):
                await funding_discovery("foreign", user=User(id="user"), session=session)
            session.execute.assert_not_called()

    async def test_free_workspace_cannot_select_even_a_source_draft(self):
        project = project_record()
        session = AsyncMock()
        with (
            patch("backend.discovery.project_access", return_value=project),
            patch("backend.discovery.locked_workspace", return_value=Workspace(plan="free")),
        ):
            with self.assertRaises(HTTPException) as raised:
                await select_funding(
                    project.id, SelectionRequest(call_id="call"), User(id="user"), session
                )
        self.assertEqual(raised.exception.status_code, 403)
        session.get.assert_not_called()
        session.commit.assert_not_called()


@unittest.skipUnless(
    os.environ.get("ABI_TEST_DATABASE_URL"), "Requires dedicated migrated PostgreSQL"
)
class PersistedFundingSelections(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine(os.environ["ABI_TEST_DATABASE_URL"])
        self.connection = await self.engine.connect()
        self.transaction = await self.connection.begin()
        self.session = AsyncSession(
            bind=self.connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        self.user = User(
            id=new_id(),
            email=f"{new_id()}@example.test",
            name="Owner",
            password_hash="unused",
            is_admin=False,
        )
        self.workspace = Workspace(
            id=new_id(),
            name="Funding",
            plan="pro",
            kind="personal",
            country="GB",
            ai_policy="local",
        )
        self.session.add_all([self.user, self.workspace])
        await self.session.flush()
        self.session.add(
            Membership(workspace_id=self.workspace.id, user_id=self.user.id, role="owner")
        )
        self.project = project_record(workspace_id=self.workspace.id)
        self.program = Program(
            id=new_id(),
            code=new_id(),
            name="Recorded support",
            institution="Funder",
            country="TR",
            support_type="grant",
            description="Sourced programme",
            official_url=SOURCE_URL,
        )
        self.session.add_all([self.project, self.program])
        await self.session.flush()
        self.source = source_record()
        self.source.program_id = self.program.id
        self.session.add(self.source)
        await self.session.flush()
        self.calls = [
            call_record([country_rule()], self.source, version=version) for version in (1, 2)
        ]
        self.session.add_all(self.calls)
        await self.session.flush()

    async def asyncTearDown(self):
        await self.session.close()
        await self.transaction.rollback()
        await self.connection.close()
        await self.engine.dispose()

    async def test_multiple_pending_calls_persist_idempotently_with_isolated_report_groups(self):
        first = await select_funding(
            self.project.id, SelectionRequest(call_id=self.calls[0].id), self.user, self.session
        )
        again = await select_funding(
            self.project.id, SelectionRequest(call_id=self.calls[0].id), self.user, self.session
        )
        second = await select_funding(
            self.project.id, SelectionRequest(call_id=self.calls[1].id), self.user, self.session
        )
        self.assertEqual(first["id"], again["id"])
        self.assertEqual(first["report_id"], again["report_id"])
        self.assertNotEqual(first["report_id"], second["report_id"])
        self.assertEqual(first["call_state"], "pending")
        self.assertTrue(first["preparation_only"])
        rows = await funding_selections(self.project.id, self.user, self.session)
        self.assertEqual({row["call_id"] for row in rows}, {call.id for call in self.calls})
        self.assertTrue(all(row["workspace_id"] == self.workspace.id for row in rows))
        saved = (
            await self.session.scalars(
                select(ProjectFundingSelection).where(
                    ProjectFundingSelection.project_id == self.project.id
                )
            )
        ).all()
        self.assertEqual(len(saved), 2)
        for call in self.calls:
            await self.session.refresh(call)
            self.assertEqual(call.status, "draft")

    async def test_project_country_not_workspace_default_drives_domestic_discovery(self):
        result = await funding_discovery(
            self.project.id,
            region="domestic",
            all=False,
            q="",
            user=self.user,
            session=self.session,
        )
        self.assertEqual(result["country"], "TR")
        self.assertEqual(result["country_source"], "project.country")
        item = next(item for item in result["items"] if item["id"] == self.program.id)
        self.assertEqual(item["recommendation"]["classification"], "domestic")
        self.assertEqual(item["current_call"]["state"], "pending")
        self.assertEqual(item["current_call"]["id"], self.calls[1].id)

    async def test_show_all_never_bypasses_region_or_invents_unknown_country_route(self):
        abroad = await funding_discovery(
            self.project.id,
            region="international",
            route="direct",
            all=True,
            q="",
            user=self.user,
            session=self.session,
        )
        self.assertFalse(any(item["id"] == self.program.id for item in abroad["items"]))
        self.project.profile = {"project": {"country": "DE"}}
        await self.session.flush()
        domestic = await funding_discovery(
            self.project.id, region="domestic", all=True, q="", user=self.user, session=self.session
        )
        self.assertFalse(any(item["id"] == self.program.id for item in domestic["items"]))
        establish = await funding_discovery(
            self.project.id,
            region="international",
            route="establish",
            all=True,
            q="",
            user=self.user,
            session=self.session,
        )
        self.assertTrue(any(item["id"] == self.program.id for item in establish["items"]))
        self.project.profile = {"project": {"country": ""}}
        await self.session.flush()
        unknown = await funding_discovery(
            self.project.id, region="domestic", all=True, q="", user=self.user, session=self.session
        )
        self.assertEqual(unknown["items"], [])
        self.assertGreaterEqual(unknown["unclassified_count"], 1)

    async def test_viewer_cannot_add_selection_and_free_member_can_still_discover(self):
        membership = await self.session.scalar(
            select(Membership).where(
                Membership.user_id == self.user.id, Membership.workspace_id == self.workspace.id
            )
        )
        membership.role = "viewer"
        await self.session.flush()
        with self.assertRaises(HTTPException) as raised:
            await select_funding(
                self.project.id, SelectionRequest(call_id=self.calls[0].id), self.user, self.session
            )
        self.assertEqual(raised.exception.status_code, 403)
        self.workspace.plan = "free"
        await self.session.flush()
        result = await funding_discovery(
            self.project.id,
            region="domestic",
            all=False,
            q="",
            user=self.user,
            session=self.session,
        )
        self.assertTrue(any(item["id"] == self.program.id for item in result["items"]))

    async def test_tenant_membership_is_required_for_list_and_selection(self):
        outsider = User(
            id=new_id(),
            email=f"{new_id()}@example.test",
            name="Outsider",
            password_hash="unused",
            is_admin=False,
        )
        self.session.add(outsider)
        await self.session.flush()
        for operation in (
            funding_selections(self.project.id, outsider, self.session),
            select_funding(
                self.project.id, SelectionRequest(call_id=self.calls[0].id), outsider, self.session
            ),
        ):
            with self.assertRaises(HTTPException) as raised:
                await operation
            self.assertEqual(raised.exception.status_code, 404)
