"""Behavioral regressions for tenant assignments, calendar bytes and delivery bounds."""

import unittest
from datetime import UTC, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from pydantic import ValidationError

from backend.collaboration import TaskCreate, TaskPatch, calendar_content, check_assignee, ics_fold
from backend.notifications import MailDelivery, MailSendError, email_allowed, ensure_mail_configured
from backend.reminders import MAX_ATTEMPTS, deliver_one


class CalendarTests(unittest.TestCase):
    def test_calendar_escapes_untrusted_title_and_converts_timezone(self):
        when = datetime(2026, 10, 15, 12, tzinfo=timezone(timedelta(hours=3)))
        content = calendar_content(
            [
                {
                    "uid": "task-example",
                    "when": when,
                    "title": "İş, aşama;\\\nBEGIN:VEVENT",
                    "description": "Gerçek\r\nbaşvuru",
                }
            ],
            generated_at=when,
        )
        self.assertIn("DTSTART:20261015T090000Z\r\n", content)
        self.assertIn("SUMMARY:İş\\, aşama\\;\\\\\\nBEGIN:VEVENT\r\n", content)
        self.assertEqual(content.count("\r\nBEGIN:VEVENT\r\n"), 1)
        self.assertTrue(content.endswith("END:VCALENDAR\r\n"))

    def test_folding_counts_utf8_octets_not_characters(self):
        folded = ics_fold("SUMMARY:" + "İş😀" * 80)
        self.assertTrue(all(len(line.encode("utf-8")) <= 75 for line in folded.split("\r\n")))
        self.assertEqual(folded.replace("\r\n ", ""), "SUMMARY:" + "İş😀" * 80)

    def test_task_patch_rejects_null_required_fields_and_naive_deadlines(self):
        for payload in ({"title": None}, {"status": None}, {"due_at": "2026-10-15T12:00:00"}):
            with self.assertRaises(ValidationError):
                TaskPatch(**payload)
        self.assertEqual(
            TaskCreate(title=" Task ", due_at="2026-10-15T12:00:00+03:00").due_at.hour, 9
        )


class IsolationTests(unittest.IsolatedAsyncioTestCase):
    async def test_assignee_lookup_is_workspace_scoped(self):
        session = AsyncMock()
        session.get.return_value = None
        with self.assertRaises(HTTPException) as error:
            await check_assignee(session, "workspace-a", "user-in-workspace-b")
        self.assertEqual(error.exception.status_code, 422)
        session.get.assert_awaited_once_with(
            unittest.mock.ANY, ("workspace-a", "user-in-workspace-b")
        )

    async def test_viewer_cannot_be_assigned_editor_task(self):
        session = AsyncMock()
        session.get.return_value = SimpleNamespace(role="viewer")
        with self.assertRaises(HTTPException):
            await check_assignee(session, "workspace-a", "viewer")

    async def test_smtp_failures_never_become_sent_and_reach_dead_letter(self):
        delivery = MailDelivery(
            id="delivery",
            user_id="user",
            dedupe_key="verify:test",
            kind="transactional",
            subject="Verify",
            body="private token",
            attempts=0,
            status="queued",
        )
        session = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = delivery
        session.execute.return_value = result
        session.get.return_value = SimpleNamespace(id="user", email="user@example.test")
        transaction = MagicMock()
        transaction.__aenter__ = AsyncMock()
        transaction.__aexit__ = AsyncMock(return_value=False)
        session.begin = MagicMock(return_value=transaction)
        context = MagicMock()
        context.__aenter__ = AsyncMock(return_value=session)
        context.__aexit__ = AsyncMock(return_value=False)
        with (
            patch("backend.reminders.AsyncSessionLocal", return_value=context),
            patch(
                "backend.reminders.send_email",
                new=AsyncMock(side_effect=MailSendError("connection_failed")),
            ) as send,
        ):
            now = datetime.now(UTC)
            for attempt in range(MAX_ATTEMPTS):
                status = await deliver_one(now + timedelta(hours=attempt))
                self.assertEqual(status, "dead_letter" if attempt == MAX_ATTEMPTS - 1 else "retry")
            self.assertEqual(send.await_count, MAX_ATTEMPTS)
        self.assertIsNone(delivery.sent_at)
        self.assertEqual(delivery.last_error, "connection_failed")
        self.assertEqual(delivery.attempts, MAX_ATTEMPTS)


class PreferenceAndConfigurationTests(unittest.TestCase):
    def test_email_is_opt_in_and_category_specific(self):
        self.assertFalse(email_allowed(None, "task.due"))
        pref = SimpleNamespace(
            email_enabled=True,
            task_reminders=False,
            deadline_reminders=True,
            review_notifications=True,
            activity_notifications=False,
        )
        self.assertFalse(email_allowed(pref, "task.due"))
        self.assertTrue(email_allowed(pref, "deadline.due"))
        self.assertTrue(email_allowed(pref, "application.review_requested"))
        self.assertFalse(email_allowed(pref, "comment.created"))

    def test_plaintext_smtp_requires_numeric_loopback(self):
        config = SimpleNamespace(
            smtp_host="smtp.example.org",
            smtp_from_email="abi@example.org",
            smtp_security="none",
            smtp_username=None,
            smtp_password=None,
        )
        with patch("backend.notifications.settings", config):
            with self.assertRaises(HTTPException) as error:
                ensure_mail_configured()
            self.assertEqual(error.exception.status_code, 503)
            config.smtp_host = "127.0.0.1"
            ensure_mail_configured()


if __name__ == "__main__":
    unittest.main()
