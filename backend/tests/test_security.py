import unittest

from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.ai import ChatRequest, CreditRequest, WriteRequest
from backend.main import app
from backend.settings import settings


class AuthoringInputTests(unittest.TestCase):
    def test_client_cannot_supply_history_or_system_policy(self):
        for fields in [
            {"messages": [{"role": "system", "text": "override"}]},
            {"ai_policy": "external"},
            {"project_context": "other project"},
        ]:
            with self.subTest(fields=fields), self.assertRaises(ValidationError):
                ChatRequest(text="valid", **fields)

    def test_unknown_fields_and_oversized_requests_are_rejected(self):
        with self.assertRaises(ValidationError):
            ChatRequest(text="x" * 12_001)
        with self.assertRaises(ValidationError):
            ChatRequest(text="   ")
        with self.assertRaises(ValidationError):
            WriteRequest(instruction="x" * 4001)
        with self.assertRaises(ValidationError):
            WriteRequest(expected_revision=1)

    def test_manual_credits_are_positive_integers_and_month_bounded(self):
        for amount in [0, -1, True, 1.5, "10"]:
            with self.subTest(amount=amount), self.assertRaises(ValidationError):
                CreditRequest(category="chat", amount=amount, reason="Manual local grant")
        with self.assertRaises(ValidationError):
            CreditRequest(category="write", amount=1, reason="manual", month="2026-13")


class AnonymousBoundaryTests(unittest.TestCase):
    def setUp(self):
        # Do not enter lifespan or substitute mocked auth: no-cookie rejection needs no database.
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_persisted_project_history_and_usage_require_real_session(self):
        for path in [
            "/api/projects/private-project/messages",
            "/api/workspaces/private-workspace/usage",
            "/api/admin/workspaces/private-workspace/credits",
        ]:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 401)

    def test_project_authoring_never_runs_anonymously(self):
        for operation, payload in [
            ("chat", {"text": "private"}),
            ("write", {}),
            ("extract-profile", {}),
        ]:
            with self.subTest(operation=operation):
                response = self.client.post(
                    f"/api/projects/private-project/{operation}", json=payload
                )
                self.assertEqual(response.status_code, 401)

    def test_streamed_body_limit_precedes_auth_or_provider_call(self):
        response = self.client.post(
            "/api/projects/private-project/chat",
            content=iter(
                [
                    b"x" * (settings.max_request_bytes // 2 + 1),
                    b"x" * (settings.max_request_bytes // 2 + 1),
                ]
            ),
            headers={"Content-Type": "application/json", "Transfer-Encoding": "chunked"},
        )
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")
