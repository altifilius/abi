"""Permanent auth/profile/tenant/revision boundaries; no live services required."""

import os
import unittest
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ.setdefault("OPENAI_API_KEY", "test-key")

from fastapi import HTTPException
from starlette.requests import Request

from backend import workspaces as core


class Result:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value

    def scalar_one(self):
        return self.value


class MemorySession:
    def __init__(self, user=None, auth=None):
        self.user = user
        self.auth = auth
        self.added = []

    async def execute(self, statement):
        return Result(self.auth)

    async def get(self, model, key):
        return self.user if model is core.User else None

    def add(self, value):
        self.added.append(value)

    async def commit(self):
        pass


def project():
    return core.Project(
        id="project",
        workspace_id="workspace",
        title="Idea",
        description="Original",
        profile={},
        revision=2,
        confirmed_revision=2,
        stage="idea",
        created_at=core.utcnow(),
        updated_at=core.utcnow(),
    )


class ProfileBoundaryTests(unittest.TestCase):
    def test_boolean_and_numeric_types_are_not_coerced(self):
        for profile in (
            {"company": {"is_sme": "false"}},
            {"company": {"employee_count": True}},
            {"company": {"employee_count": "2"}},
            {
                "budget": {
                    "items": [
                        {"id": "a", "category": "equipment", "description": "Kit", "amount": 0.1}
                    ]
                }
            },
        ):
            with self.subTest(profile=profile), self.assertRaises(HTTPException) as raised:
                core.validate_profile(profile)
            self.assertEqual(raised.exception.status_code, 422)

    def test_exact_decimal_and_dates(self):
        data = core.validate_profile(
            {
                "company": {
                    "annual_turnover": "9007199254740993.12",
                    "registration_date": "2024-02-29",
                },
                "budget": {
                    "currency": "EUR",
                    "items": [
                        {
                            "id": "a",
                            "category": "personnel",
                            "description": "Work",
                            "amount": "0.10",
                        }
                    ],
                },
            }
        )
        self.assertEqual(data["company"]["annual_turnover"], "9007199254740993.12")
        self.assertEqual(data["budget"]["items"][0]["amount"], "0.10")
        for bad in (
            {"company": {"registration_date": "2023-02-29"}},
            {"company": {"country": "ZZ"}},
            {"project": {"trl": 10}},
            {
                "budget": {
                    "items": [{"id": "a", "category": "other", "description": "x", "amount": "NaN"}]
                }
            },
        ):
            with self.subTest(bad=bad), self.assertRaises(HTTPException):
                core.validate_profile(bad)

    def test_unknown_nested_fields_survive_as_extra_not_eligibility_fields(self):
        data = core.validate_profile(
            {
                "company": {"is_sme": None, "verified": True},
                "custom_fact": {"answer": 1},
                "extra": {"existing": "kept"},
            }
        )
        self.assertIsNone(data["company"]["is_sme"])
        self.assertNotIn("verified", data["company"])
        self.assertEqual(data["extra"]["unknown_company_fields"]["verified"], True)
        self.assertEqual(data["extra"]["unknown_fields"]["custom_fact"], {"answer": 1})
        self.assertEqual(data["extra"]["existing"], "kept")

    def test_duplicate_budget_ids_rejected(self):
        item = {"id": "same", "category": "other", "description": "Item", "amount": "1"}
        with self.assertRaises(HTTPException):
            core.validate_profile({"budget": {"items": [item, item]}})

    def test_scrypt_passwords_are_salted_and_fail_closed(self):
        first = core.hash_password("twelve-char-password")
        second = core.hash_password("twelve-char-password")
        self.assertNotEqual(first, second)
        self.assertTrue(core.verify_password("twelve-char-password", first))
        self.assertFalse(core.verify_password("wrong", first))
        self.assertFalse(core.verify_password("anything", "not-a-password-hash"))


class AuthAndTenantBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def test_anonymous_private_operation_is_unauthorized(self):
        request = Request({"type": "http", "method": "GET", "headers": []})
        with self.assertRaises(HTTPException) as raised:
            await core.require_user(request, MemorySession())
        self.assertEqual(raised.exception.status_code, 401)

    async def test_authenticated_write_requires_session_bound_csrf(self):
        user = core.User(id="user", email="user@example.org", name="User", password_hash="unused")
        auth = core.SessionToken(
            user_id="user", csrf_token="trusted", expires_at=core.utcnow() + timedelta(hours=1)
        )
        request = Request(
            {
                "type": "http",
                "method": "PATCH",
                "scheme": "http",
                "server": ("localhost", 8001),
                "path": "/",
                "headers": [(b"cookie", b"abi_session=raw-token"), (b"x-csrf-token", b"wrong")],
            }
        )
        with self.assertRaises(HTTPException) as raised:
            await core.require_user(request, MemorySession(user, auth))
        self.assertEqual(raised.exception.status_code, 403)

    async def test_wrong_origin_is_rejected_even_with_correct_csrf(self):
        user = core.User(id="user", email="user@example.org", name="User", password_hash="unused")
        auth = core.SessionToken(
            user_id="user", csrf_token="trusted", expires_at=core.utcnow() + timedelta(hours=1)
        )
        request = Request(
            {
                "type": "http",
                "method": "POST",
                "scheme": "http",
                "server": ("localhost", 8001),
                "path": "/",
                "headers": [
                    (b"cookie", b"abi_session=raw-token"),
                    (b"x-csrf-token", b"trusted"),
                    (b"origin", b"https://attacker.example"),
                ],
            }
        )
        with self.assertRaises(HTTPException) as raised:
            await core.require_user(request, MemorySession(user, auth))
        self.assertEqual(raised.exception.status_code, 403)

    async def test_other_workspace_is_not_disclosed(self):
        user = core.User(id="user")
        with self.assertRaises(HTTPException) as raised:
            await core.workspace_access(MemorySession(), user, "someone-elses-workspace")
        self.assertEqual(raised.exception.status_code, 404)

    async def test_stale_project_revision_conflicts(self):
        session = MemorySession(auth=project())
        with (
            patch.object(core, "project_access", AsyncMock(return_value=project())),
            patch.object(core, "locked_workspace", AsyncMock()),
        ):
            with self.assertRaises(HTTPException) as raised:
                await core.locked_project(session, core.User(id="user"), "project", 1)
        self.assertEqual(raised.exception.status_code, 409)

    async def test_confirm_and_edit_revisions_snapshot_and_invalidate(self):
        state = project()
        session = MemorySession()
        user = core.User(id="user")
        with patch.object(core, "locked_project", AsyncMock(return_value=state)):
            confirmed = await core.patch_project(
                "project",
                core.ProjectPatch(expected_revision=2, confirm_profile=True),
                user,
                session,
            )
            self.assertEqual((confirmed["revision"], confirmed["confirmed_revision"]), (3, 3))
            self.assertEqual(session.added[0].snapshot["revision"], 2)
            changed = await core.patch_project(
                "project",
                core.ProjectPatch(expected_revision=3, description="Changed"),
                user,
                session,
            )
            self.assertEqual(changed["revision"], 4)
            self.assertIsNone(changed["confirmed_revision"])
            snapshots = [row for row in session.added if isinstance(row, core.ProjectRevision)]
            self.assertEqual([row.revision for row in snapshots], [2, 3])
            self.assertEqual(snapshots[1].snapshot["description"], "Original")

    async def test_last_owner_cannot_be_demoted(self):
        owner = core.Membership(workspace_id="workspace", user_id="owner", role="owner")
        session = SimpleNamespace(
            get=AsyncMock(return_value=owner), execute=AsyncMock(return_value=Result(1))
        )
        with patch.object(core, "locked_workspace", AsyncMock()):
            with self.assertRaises(HTTPException) as raised:
                await core.change_member_permission(
                    session, "workspace", core.User(id="owner"), "owner", "editor"
                )
        self.assertEqual(raised.exception.status_code, 409)

    async def test_admin_cannot_promote_arbitrary_owner(self):
        admin = core.Membership(workspace_id="workspace", user_id="admin", role="admin")
        target = core.Membership(workspace_id="workspace", user_id="target", role="editor")
        session = SimpleNamespace(get=AsyncMock(side_effect=[admin, target]))
        with patch.object(core, "locked_workspace", AsyncMock()):
            with self.assertRaises(HTTPException) as raised:
                await core.change_member_permission(
                    session, "workspace", core.User(id="admin"), "target", "owner"
                )
        self.assertEqual(raised.exception.status_code, 403)

    async def test_erasure_does_not_delete_quota_ledger_or_other_workspace(self):
        statements = []

        async def capture(statement):
            statements.append(statement)
            return Result(None)

        session = SimpleNamespace(execute=capture)
        await core.erase_tenant_rows(session, core.Workspace.__table__, "target-workspace")
        deletions = [
            statement for statement in statements if getattr(statement, "is_delete", False)
        ]
        self.assertNotIn("usage_events", [statement.table.name for statement in deletions])
        self.assertNotIn("usage_credits", [statement.table.name for statement in deletions])
        for statement in deletions:
            self.assertIn("target-workspace", statement.compile().params.values())
        ledger_updates = [
            statement
            for statement in statements
            if getattr(statement, "is_update", False) and statement.table.name == "usage_events"
        ]
        self.assertEqual(len(ledger_updates), 1)
        self.assertIn({}, ledger_updates[0].compile().params.values())

    async def test_failed_workspace_commit_never_unlinks_private_files(self):
        from backend import applications

        session = SimpleNamespace(commit=AsyncMock(side_effect=RuntimeError("database failure")))
        remove = AsyncMock()
        with (
            patch.object(core, "locked_workspace", AsyncMock()),
            patch.object(core, "erase_tenant_rows", AsyncMock()),
            patch.object(
                applications,
                "list_document_storage_keys",
                AsyncMock(return_value=["workspace/file"]),
            ),
            patch.object(applications, "remove_document_storage_keys", remove),
        ):
            with self.assertRaises(RuntimeError):
                await core.delete_workspace("workspace", core.User(id="owner"), session)
        remove.assert_not_awaited()

    async def test_workspace_limit_reserves_pending_invitations(self):
        session = SimpleNamespace(execute=AsyncMock(side_effect=[Result(1), Result(2)]))
        self.assertEqual(await core.member_seats(session, "workspace"), 3)

    async def test_legacy_metadata_never_becomes_verified_document(self):
        state = project()
        session = MemorySession()
        body = core.LegacyImport(
            expected_revision=2,
            description="Imported",
            documents_metadata=[
                {
                    "name": "Proof.pdf",
                    "verified": True,
                    "status": "verified",
                    "verified_by": "owner",
                    "program_fact": "kept",
                }
            ],
        )
        with patch.object(core, "locked_project", AsyncMock(return_value=state)):
            data = await core.import_legacy("project", body, core.User(id="user"), session)
        metadata = data["profile"]["extra"]["legacy_documents_metadata"][0]
        self.assertEqual(metadata["status"], "unverified")
        self.assertNotIn("verified", metadata["untrusted_metadata"])
        self.assertEqual(metadata["untrusted_metadata"]["program_fact"], "kept")
        self.assertIsNone(data["confirmed_revision"])

    async def test_unverified_invite_cannot_redeem(self):
        invitation = core.WorkspaceInvitation(
            email="member@example.org",
            workspace_id="workspace",
            invited_by="owner",
            role="reviewer",
        )
        session = MemorySession(auth=invitation)
        user = core.User(id="member", email="member@example.org", email_verified_at=None)
        with self.assertRaises(HTTPException) as raised:
            await core.accept_invite(core.TokenInput(token="a" * 32), user, session)
        self.assertEqual(raised.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
