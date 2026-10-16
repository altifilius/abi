"""Account consumer boundaries on an opt-in, already migrated PostgreSQL test DB."""

import asyncio
import hashlib
import os
import secrets
import threading
import unittest
from datetime import timedelta
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlsplit

import httpx
from fastapi import HTTPException, Response
from pydantic import ValidationError
from sqlalchemy import delete, event, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from starlette.requests import Request

from backend import account, reminders, workspaces
from backend.db import get_session
from backend.main import app
from backend.notifications import MailDelivery
from backend.settings import settings


class AccountInputTests(unittest.TestCase):
    def test_password_limits_and_types_are_strict(self):
        for value in ("short", "x" * 1025, 123456789012, None):
            with self.subTest(value_type=type(value).__name__), self.assertRaises(ValidationError):
                account.ResetPasswordInput(token="t" * 43, new_password=value)
        for value in ("x" * 12, "x" * 1024):
            account.ChangePasswordInput(current_password="old", new_password=value)

    def test_profile_is_name_only_and_rejects_blank_names(self):
        for body in ({"name": "   "}, {"name": "User", "email": "other@example.org"}):
            with self.subTest(body=body), self.assertRaises(ValidationError):
                account.ProfileInput.model_validate(body)
        self.assertEqual(account.ProfileInput(name="  Renamed  ").name, "Renamed")

    def test_recovery_email_rejects_header_injection(self):
        for value in ("user@example.org\r\nBcc: victim@example.org", "user\n@example.org"):
            with self.assertRaises(ValidationError):
                account.ForgotPasswordInput(email=value)


@unittest.skipUnless(
    os.environ.get("ABI_TEST_DATABASE_URL"),
    "Set ABI_TEST_DATABASE_URL to a dedicated migrated PostgreSQL database",
)
class AccountTransactionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine(os.environ["ABI_TEST_DATABASE_URL"])
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        self.user_id, self.foreign_user_id = workspaces.new_id(), workspaces.new_id()
        self.email = f"{self.user_id}@account-test.invalid"
        self.foreign_email = f"{self.foreign_user_id}@account-test.invalid"
        self.unknown_email = f"unknown-{self.user_id}@account-test.invalid"
        self.ip = f"account-test-{self.user_id}"
        self.password = "original-account-password"
        self.new_password = "replacement-account-password"
        self.tokens = {
            name: secrets.token_urlsafe(32) for name in ("current", "other", "foreign", "expired")
        }
        self.session_ids = {name: workspaces.new_id() for name in self.tokens}
        self.csrf = {name: secrets.token_urlsafe(32) for name in self.tokens}
        self.reset_tokens = []
        self.workspace_ids = []
        password_hash = await asyncio.to_thread(workspaces.hash_password, self.password)
        async with self.sessions() as session:
            session.add_all(
                [
                    workspaces.User(
                        id=self.user_id,
                        email=self.email,
                        name="Account test",
                        password_hash=password_hash,
                    ),
                    workspaces.User(
                        id=self.foreign_user_id,
                        email=self.foreign_email,
                        name="Other account",
                        password_hash=password_hash,
                    ),
                ]
            )
            await session.flush()
            for name, token in self.tokens.items():
                session.add(
                    workspaces.SessionToken(
                        id=self.session_ids[name],
                        user_id=self.foreign_user_id if name == "foreign" else self.user_id,
                        token_hash=hashlib.sha256(token.encode()).hexdigest(),
                        csrf_token=self.csrf[name],
                        expires_at=workspaces.utcnow()
                        + timedelta(hours=-1 if name == "expired" else 1),
                    )
                )
            await session.commit()

        async def test_session():
            async with self.sessions() as session:
                yield session

        app.dependency_overrides[get_session] = test_session
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app, client=(self.ip, 12345)),
            base_url=settings.public_app_url,
        )
        self.mail_config = patch.multiple(
            "backend.notifications.settings",
            smtp_host="127.0.0.1",
            smtp_port=11025,
            smtp_from_email="abi@localhost",
            smtp_security="none",
            smtp_username=None,
            smtp_password=None,
        )
        self.mail_config.start()

    async def asyncTearDown(self):
        self.mail_config.stop()
        await self.client.aclose()
        app.dependency_overrides.pop(get_session, None)
        async with self.sessions() as session:
            for workspace_id in self.workspace_ids:
                await session.execute(
                    delete(workspaces.Workspace).where(workspaces.Workspace.id == workspace_id)
                )
            await session.execute(
                delete(workspaces.User).where(
                    workspaces.User.id.in_([self.user_id, self.foreign_user_id])
                )
            )
            keys = []
            for action in (
                "login",
                "forgot_password",
                "reset_password",
                "change_password",
                "delete_account",
            ):
                keys.append(hashlib.sha256(f"{action}:ip:{self.ip}".encode()).hexdigest())
                targets = [self.email, self.foreign_email, self.unknown_email]
                targets.extend(
                    hashlib.sha256(token.encode()).hexdigest() for token in self.reset_tokens
                )
                keys.extend(
                    hashlib.sha256(f"{action}:email:{target}".encode()).hexdigest()
                    for target in targets
                )
            await session.execute(
                delete(workspaces.AuthThrottle).where(workspaces.AuthThrottle.key.in_(keys))
            )
            await session.commit()
        await self.engine.dispose()

    async def request(self, method, path, *, body=None, auth="current", csrf=True, headers=None):
        request_headers = {"cookie": ""}
        if auth is not None:
            request_headers["cookie"] = f"abi_session={self.tokens[auth]}"
            if csrf:
                request_headers["x-csrf-token"] = self.csrf[auth]
        request_headers.update(headers or {})
        return await self.client.request(method, path, json=body, headers=request_headers)

    async def seed_reset(self, *, expires_at=None, used_at=None, queued=False):
        token, reset_id = secrets.token_urlsafe(32), workspaces.new_id()
        self.reset_tokens.append(token)
        async with self.sessions() as session:
            session.add(
                account.PasswordReset(
                    id=reset_id,
                    user_id=self.user_id,
                    token_hash=hashlib.sha256(token.encode()).hexdigest(),
                    expires_at=expires_at or workspaces.utcnow() + timedelta(minutes=60),
                    used_at=used_at,
                )
            )
            if queued:
                session.add(
                    MailDelivery(
                        user_id=self.user_id,
                        dedupe_key=f"password-reset:{reset_id}",
                        kind="password_reset",
                        subject="Password reset",
                        body=f"Bearer recovery link: {token}",
                    )
                )
            await session.commit()
        return token, reset_id

    async def assert_password(self, password):
        async with self.sessions() as session:
            user = await session.get(workspaces.User, self.user_id)
            self.assertTrue(
                await asyncio.to_thread(workspaces.verify_password, password, user.password_hash)
            )

    async def test_profile_is_self_service_without_owner_membership_and_email_is_readonly(self):
        response = await self.request(
            "PATCH", "/api/auth/profile", body={"name": "  Updated user  "}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["name"], "Updated user")
        self.assertEqual(response.json()["email"], self.email)
        self.assertNotIn("password_hash", response.json())
        rejected = await self.request(
            "PATCH", "/api/auth/profile", body={"name": "Changed", "email": self.foreign_email}
        )
        self.assertEqual(rejected.status_code, 422)
        async with self.sessions() as session:
            self.assertEqual(
                (await session.get(workspaces.User, self.user_id)).name, "Updated user"
            )
            self.assertEqual(
                (await session.get(workspaces.User, self.foreign_user_id)).name, "Other account"
            )

    async def test_profile_write_requires_current_csrf_and_correct_origin(self):
        for headers, csrf in (({}, False), ({"origin": "https://attacker.invalid"}, True)):
            response = await self.request(
                "PATCH",
                "/api/auth/profile",
                body={"name": "Unauthorized"},
                csrf=csrf,
                headers=headers,
            )
            self.assertEqual(response.status_code, 403)
        async with self.sessions() as session:
            self.assertEqual(
                (await session.get(workspaces.User, self.user_id)).name, "Account test"
            )

    async def test_session_metadata_is_private_and_revocation_is_owned(self):
        response = await self.request("GET", "/api/auth/sessions")
        self.assertEqual(response.status_code, 200)
        rows = response.json()
        self.assertEqual(
            {row["id"] for row in rows}, {self.session_ids["current"], self.session_ids["other"]}
        )
        for row in rows:
            self.assertEqual(set(row), {"id", "expires_at", "current"})
            self.assertEqual(row["current"], row["id"] == self.session_ids["current"])
            self.assertTrue(row["expires_at"].endswith(("Z", "+00:00")))
        foreign = await self.request("DELETE", f"/api/auth/sessions/{self.session_ids['foreign']}")
        self.assertEqual(foreign.status_code, 404)
        self.assertEqual(
            (await self.request("GET", "/api/auth/session", auth="foreign")).status_code, 200
        )
        revoked = await self.request("DELETE", f"/api/auth/sessions/{self.session_ids['other']}")
        self.assertEqual(revoked.status_code, 204)
        self.assertEqual(
            (await self.request("GET", "/api/auth/session", auth="other")).status_code, 401
        )
        self.assertEqual((await self.request("GET", "/api/auth/session")).status_code, 200)
        current = await self.request("DELETE", f"/api/auth/sessions/{self.session_ids['current']}")
        self.assertEqual(current.status_code, 204)
        self.assertIn("Max-Age=0", current.headers["set-cookie"])
        self.assertEqual((await self.request("GET", "/api/auth/session")).status_code, 401)

    async def test_wrong_current_password_cannot_change_credentials_or_revoke_sessions(self):
        response = await self.request(
            "POST",
            "/api/auth/change-password",
            body={"current_password": "wrong", "new_password": self.new_password},
        )
        self.assertEqual(response.status_code, 401)
        await self.assert_password(self.password)
        self.assertEqual(
            (await self.request("GET", "/api/auth/session", auth="other")).status_code, 200
        )

    async def test_change_password_revokes_all_sessions_and_pending_recovery(self):
        token, reset_id = await self.seed_reset(queued=True)
        response = await self.request(
            "POST",
            "/api/auth/change-password",
            body={"current_password": self.password, "new_password": self.new_password},
        )
        self.assertEqual(response.status_code, 204)
        self.assertIn("Max-Age=0", response.headers["set-cookie"])
        for auth in ("current", "other", "expired"):
            self.assertEqual(
                (await self.request("GET", "/api/auth/session", auth=auth)).status_code, 401
            )
        self.assertEqual(
            (await self.request("GET", "/api/auth/session", auth="foreign")).status_code, 200
        )
        async with self.sessions() as session:
            self.assertIsNotNone((await session.get(account.PasswordReset, reset_id)).used_at)
            delivery = (
                await session.execute(
                    select(MailDelivery).where(
                        MailDelivery.dedupe_key == f"password-reset:{reset_id}"
                    )
                )
            ).scalar_one()
            self.assertEqual((delivery.status, delivery.body), ("cancelled", ""))
        reused = await self.request(
            "POST",
            "/api/auth/reset-password",
            auth=None,
            body={"token": token, "new_password": self.password},
        )
        self.assertEqual(reused.status_code, 400)
        for password, status in ((self.password, 401), (self.new_password, 200)):
            login = await self.request(
                "POST",
                "/api/auth/login",
                auth=None,
                body={"email": self.email, "password": password},
            )
            self.assertEqual(login.status_code, status)

    async def test_forgot_password_is_enumeration_neutral_and_queues_a_trusted_link(self):
        with patch.object(account.settings, "public_app_url", "https://abi.example.org"):
            known = await self.request(
                "POST",
                "/api/auth/forgot-password",
                auth=None,
                body={"email": self.email.upper()},
                headers={"host": "attacker.invalid"},
            )
            unknown = await self.request(
                "POST", "/api/auth/forgot-password", auth=None, body={"email": self.unknown_email}
            )
        self.assertEqual((known.status_code, known.json()), (unknown.status_code, unknown.json()))
        self.assertEqual((known.status_code, known.json()), (200, {"status": "requested"}))
        async with self.sessions() as session:
            resets = (
                (
                    await session.execute(
                        select(account.PasswordReset).where(
                            account.PasswordReset.user_id == self.user_id
                        )
                    )
                )
                .scalars()
                .all()
            )
            deliveries = (
                (
                    await session.execute(
                        select(MailDelivery).where(MailDelivery.user_id == self.user_id)
                    )
                )
                .scalars()
                .all()
            )
            self.assertEqual(len(resets), 1)
            self.assertEqual(len(deliveries), 1)
            self.assertEqual(
                (deliveries[0].kind, deliveries[0].status), ("password_reset", "queued")
            )
            link = next(
                line for line in deliveries[0].body.splitlines() if line.startswith("https://")
            )
            parsed = urlsplit(link)
            self.assertEqual(
                (parsed.netloc, parsed.path), ("abi.example.org", "/auth/reset-password")
            )
            token = parse_qs(parsed.query)["token"][0]
            self.reset_tokens.append(token)
            self.assertNotIn(token, known.text)
            self.assertEqual(resets[0].token_hash, hashlib.sha256(token.encode()).hexdigest())
            self.assertGreater((resets[0].expires_at - resets[0].created_at).total_seconds(), 3590)
            self.assertLessEqual(
                (resets[0].expires_at - resets[0].created_at).total_seconds(), 3600
            )

    async def test_unconfigured_mail_is_identical_for_known_and_unknown_accounts(self):
        with patch("backend.notifications.settings.smtp_host", None):
            known = await self.request(
                "POST", "/api/auth/forgot-password", auth=None, body={"email": self.email}
            )
            unknown = await self.request(
                "POST", "/api/auth/forgot-password", auth=None, body={"email": self.unknown_email}
            )
        self.assertEqual((known.status_code, known.json()), (unknown.status_code, unknown.json()))
        self.assertEqual(known.status_code, 503)
        async with self.sessions() as session:
            self.assertIsNone(
                (
                    await session.execute(
                        select(account.PasswordReset).where(
                            account.PasswordReset.user_id == self.user_id
                        )
                    )
                ).scalar_one_or_none()
            )

    async def test_forgot_throttle_is_durable_for_unknown_emails_and_untrusted_forwarding(self):
        responses = []
        for attempt in range(6):
            responses.append(
                await self.request(
                    "POST",
                    "/api/auth/forgot-password",
                    auth=None,
                    body={"email": self.unknown_email},
                    headers={"x-forwarded-for": f"192.0.2.{attempt + 1}"},
                )
            )
        self.assertEqual([response.status_code for response in responses], [200] * 5 + [429])
        key = hashlib.sha256(f"forgot_password:email:{self.unknown_email}".encode()).hexdigest()
        async with self.sessions() as session:
            self.assertEqual((await session.get(workspaces.AuthThrottle, key)).attempts, 6)

    async def test_forged_expired_and_consumed_tokens_never_replace_passwords(self):
        forged = secrets.token_urlsafe(32)
        self.reset_tokens.append(forged)
        expired, _ = await self.seed_reset(expires_at=workspaces.utcnow() - timedelta(seconds=1))
        used, _ = await self.seed_reset(used_at=workspaces.utcnow())
        responses = [
            await self.request(
                "POST",
                "/api/auth/reset-password",
                auth=None,
                body={"token": token, "new_password": self.new_password},
            )
            for token in (forged, expired, used)
        ]
        self.assertEqual([response.status_code for response in responses], [400, 400, 400])
        self.assertEqual(responses[0].json(), responses[1].json())
        self.assertEqual(responses[1].json(), responses[2].json())
        await self.assert_password(self.password)
        self.assertEqual((await self.request("GET", "/api/auth/session")).status_code, 200)

    async def test_successful_reset_is_single_use_revokes_siblings_and_all_cookies(self):
        first, first_id = await self.seed_reset(queued=True)
        sibling, sibling_id = await self.seed_reset(queued=True)
        response = await self.request(
            "POST",
            "/api/auth/reset-password",
            auth=None,
            body={"token": first, "new_password": self.new_password},
        )
        self.assertEqual(response.status_code, 204)
        await self.assert_password(self.new_password)
        for token in (first, sibling):
            retry = await self.request(
                "POST",
                "/api/auth/reset-password",
                auth=None,
                body={"token": token, "new_password": self.password},
            )
            self.assertEqual(retry.status_code, 400)
        for auth in ("current", "other", "expired"):
            self.assertEqual(
                (await self.request("GET", "/api/auth/session", auth=auth)).status_code, 401
            )
        self.assertEqual(
            (await self.request("GET", "/api/auth/session", auth="foreign")).status_code, 200
        )
        async with self.sessions() as session:
            for reset_id in (first_id, sibling_id):
                self.assertIsNotNone((await session.get(account.PasswordReset, reset_id)).used_at)
            deliveries = (
                (
                    await session.execute(
                        select(MailDelivery).where(MailDelivery.user_id == self.user_id)
                    )
                )
                .scalars()
                .all()
            )
            self.assertTrue(
                all(
                    delivery.body == "" and delivery.status == "cancelled"
                    for delivery in deliveries
                )
            )

    async def test_reset_expiring_during_hashing_is_rejected_without_side_effects(self):
        now = workspaces.utcnow()
        token, reset_id = await self.seed_reset(expires_at=now + timedelta(seconds=1))
        with patch.object(account, "utcnow", side_effect=[now, now + timedelta(seconds=2)]):
            response = await self.request(
                "POST",
                "/api/auth/reset-password",
                auth=None,
                body={"token": token, "new_password": self.new_password},
            )
        self.assertEqual(response.status_code, 400)
        await self.assert_password(self.password)
        async with self.sessions() as session:
            self.assertIsNone((await session.get(account.PasswordReset, reset_id)).used_at)
        self.assertEqual((await self.request("GET", "/api/auth/session")).status_code, 200)

    async def test_concurrent_same_token_resets_have_one_winner(self):
        token, _ = await self.seed_reset()
        results = await asyncio.wait_for(
            asyncio.gather(
                *[
                    self.request(
                        "POST",
                        "/api/auth/reset-password",
                        auth=None,
                        body={"token": token, "new_password": password},
                    )
                    for password in (self.new_password, "different-replacement-password")
                ]
            ),
            timeout=10,
        )
        self.assertEqual(sorted(response.status_code for response in results), [204, 400])
        winner = (
            self.new_password if results[0].status_code == 204 else "different-replacement-password"
        )
        await self.assert_password(winner)

    async def test_concurrent_distinct_tokens_cannot_both_succeed(self):
        first, _ = await self.seed_reset()
        sibling, _ = await self.seed_reset()
        results = await asyncio.wait_for(
            asyncio.gather(
                *[
                    self.request(
                        "POST",
                        "/api/auth/reset-password",
                        auth=None,
                        body={"token": token, "new_password": self.new_password},
                    )
                    for token in (first, sibling)
                ]
            ),
            timeout=10,
        )
        self.assertEqual(sorted(response.status_code for response in results), [204, 400])

    async def test_password_change_rechecks_csrf_after_the_auth_dependency(self):
        request = Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/api/auth/change-password",
                "scheme": "http",
                "server": ("localhost", 8001),
                "client": (self.ip, 12345),
                "headers": [
                    (b"cookie", f"abi_session={self.tokens['current']}".encode()),
                    (b"x-csrf-token", self.csrf["current"].encode()),
                ],
            }
        )
        async with self.sessions() as stale:
            cached_user = await workspaces.require_user(request, stale)
            async with self.sessions() as other:
                auth = await other.get(workspaces.SessionToken, self.session_ids["current"])
                auth.csrf_token = "replaced-csrf-token"
                await other.commit()
            with self.assertRaises(HTTPException) as rejected:
                await account.change_password(
                    account.ChangePasswordInput(
                        current_password=self.password, new_password=self.new_password
                    ),
                    request,
                    Response(),
                    cached_user,
                    stale,
                )
            self.assertEqual(rejected.exception.status_code, 403)
        await self.assert_password(self.password)

    async def test_login_waiting_for_reset_cannot_create_an_old_password_session(self):
        token, _ = await self.seed_reset()
        loop = asyncio.get_running_loop()
        entered = asyncio.Event()
        release = threading.Event()
        attempted_login_lock = asyncio.Event()

        def observe_lock(_connection, _cursor, statement, _parameters, _context, _many):
            if "FOR UPDATE" in statement and "users.email =" in statement:
                attempted_login_lock.set()

        real_hash = account.hash_password

        def held_hash(password):
            loop.call_soon_threadsafe(entered.set)
            if not release.wait(10):
                raise RuntimeError("Password race barrier timed out")
            return real_hash(password)

        event.listen(self.engine.sync_engine, "before_cursor_execute", observe_lock)
        try:
            with patch.object(account, "hash_password", held_hash):
                reset = asyncio.create_task(
                    self.request(
                        "POST",
                        "/api/auth/reset-password",
                        auth=None,
                        body={"token": token, "new_password": self.new_password},
                    )
                )
                try:
                    await asyncio.wait_for(entered.wait(), timeout=10)
                    login = asyncio.create_task(
                        self.request(
                            "POST",
                            "/api/auth/login",
                            auth=None,
                            body={"email": self.email, "password": self.password},
                        )
                    )
                    await asyncio.wait_for(attempted_login_lock.wait(), timeout=10)
                    release.set()
                    reset_response, login_response = await asyncio.wait_for(
                        asyncio.gather(reset, login), timeout=10
                    )
                finally:
                    release.set()
        finally:
            event.remove(self.engine.sync_engine, "before_cursor_execute", observe_lock)
        self.assertEqual(reset_response.status_code, 204)
        self.assertEqual(login_response.status_code, 401)
        async with self.sessions() as session:
            self.assertIsNone(
                (
                    await session.execute(
                        select(workspaces.SessionToken).where(
                            workspaces.SessionToken.user_id == self.user_id
                        )
                    )
                ).scalar_one_or_none()
            )

    async def test_dependency_cached_before_reset_is_reauthenticated_for_password_and_deletion(
        self,
    ):
        token, _ = await self.seed_reset()
        request = Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/api/auth/change-password",
                "scheme": "http",
                "server": ("localhost", 8001),
                "client": (self.ip, 12345),
                "headers": [
                    (b"cookie", f"abi_session={self.tokens['current']}".encode()),
                    (b"x-csrf-token", self.csrf["current"].encode()),
                ],
            }
        )
        async with self.sessions() as stale:
            cached_user = await workspaces.require_user(request, stale)
            response = await self.request(
                "POST",
                "/api/auth/reset-password",
                auth=None,
                body={"token": token, "new_password": self.new_password},
            )
            self.assertEqual(response.status_code, 204)
            with self.assertRaises(HTTPException) as changed:
                await account.change_password(
                    account.ChangePasswordInput(
                        current_password=self.password, new_password="another-replacement-password"
                    ),
                    request,
                    Response(),
                    cached_user,
                    stale,
                )
            self.assertEqual(changed.exception.status_code, 401)
        async with self.sessions() as stale:
            user = await stale.get(workspaces.User, self.user_id)
            with self.assertRaises(HTTPException) as deleted:
                await workspaces.delete_account(
                    workspaces.DeleteAccountInput(
                        password=self.new_password, confirmation="DELETE"
                    ),
                    request,
                    Response(),
                    user,
                    stale,
                )
            self.assertEqual(deleted.exception.status_code, 401)
        await self.assert_password(self.new_password)

    async def test_account_deletion_preserves_last_workspace_owner_protection(self):
        workspace_id = workspaces.new_id()
        self.workspace_ids.append(workspace_id)
        async with self.sessions() as session:
            session.add(workspaces.Workspace(id=workspace_id, name="Protected workspace"))
            await session.flush()
            session.add(
                workspaces.Membership(user_id=self.user_id, workspace_id=workspace_id, role="owner")
            )
            await session.commit()
        response = await self.request(
            "DELETE",
            "/api/auth/account",
            body={"password": self.password, "confirmation": "DELETE"},
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"]["code"], "last_workspace_owner")
        self.assertEqual((await self.request("GET", "/api/auth/session")).status_code, 200)
        async with self.sessions() as session:
            self.assertIsNotNone(await session.get(workspaces.Workspace, workspace_id))

    async def test_worker_cancels_expired_recovery_and_clears_bearer_content(self):
        token, reset_id = await self.seed_reset(
            expires_at=workspaces.utcnow() - timedelta(seconds=1), queued=True
        )
        async with self.sessions() as session:
            delivery = (
                await session.execute(
                    select(MailDelivery).where(
                        MailDelivery.dedupe_key == f"password-reset:{reset_id}"
                    )
                )
            ).scalar_one()
            user = await session.get(workspaces.User, self.user_id)
            self.assertFalse(await reminders.delivery_allowed(session, delivery, user))
            foreign = await session.get(workspaces.User, self.foreign_user_id)
            self.assertFalse(
                await account.password_reset_delivery_allowed(session, delivery, foreign)
            )
        with (
            patch.object(reminders, "AsyncSessionLocal", self.sessions),
            patch.object(reminders, "send_email", AsyncMock()) as send_email,
        ):
            result = await reminders.deliver_one(workspaces.utcnow())
        self.assertEqual(result, "cancelled")
        send_email.assert_not_awaited()
        async with self.sessions() as session:
            delivery = (
                await session.execute(
                    select(MailDelivery).where(
                        MailDelivery.dedupe_key == f"password-reset:{reset_id}"
                    )
                )
            ).scalar_one()
            self.assertEqual(
                (delivery.status, delivery.body, delivery.attempts), ("cancelled", "", 0)
            )
            self.assertNotIn(token, delivery.body)

    async def test_worker_consumed_recovery_link_is_not_deliverable(self):
        _token, reset_id = await self.seed_reset(queued=True, used_at=workspaces.utcnow())
        async with self.sessions() as session:
            delivery = (
                await session.execute(
                    select(MailDelivery).where(
                        MailDelivery.dedupe_key == f"password-reset:{reset_id}"
                    )
                )
            ).scalar_one()
            user = await session.get(workspaces.User, self.user_id)
            self.assertFalse(await reminders.delivery_allowed(session, delivery, user))

    async def test_worker_clears_recovery_link_only_after_successful_delivery(self):
        token, reset_id = await self.seed_reset(queued=True)
        with (
            patch.object(reminders, "AsyncSessionLocal", self.sessions),
            patch.object(reminders, "send_email", AsyncMock()) as send_email,
        ):
            result = await reminders.deliver_one(workspaces.utcnow())
        self.assertEqual(result, "sent")
        send_email.assert_awaited_once()
        self.assertEqual(send_email.call_args.args[0], self.email)
        self.assertIn(token, send_email.call_args.args[2])
        async with self.sessions() as session:
            delivery = (
                await session.execute(
                    select(MailDelivery).where(
                        MailDelivery.dedupe_key == f"password-reset:{reset_id}"
                    )
                )
            ).scalar_one()
            self.assertEqual((delivery.status, delivery.body, delivery.attempts), ("sent", "", 1))
            self.assertIsNotNone(delivery.sent_at)

    async def test_validation_errors_never_echo_password_or_email_injection(self):
        private_value = "secret\r\nBcc: victim@example.org"
        changed = await self.request(
            "POST",
            "/api/auth/change-password",
            body={"current_password": private_value, "new_password": "short"},
        )
        forgot = await self.request(
            "POST", "/api/auth/forgot-password", auth=None, body={"email": private_value}
        )
        self.assertEqual(changed.status_code, 422)
        self.assertEqual(forgot.status_code, 422)
        for response in (changed, forgot):
            self.assertNotIn(private_value, response.text)
            self.assertNotIn("victim@example.org", response.text)


if __name__ == "__main__":
    unittest.main()
