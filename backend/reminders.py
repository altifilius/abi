"""Resumable event/reminder consumer and bounded SMTP delivery worker.

Run ``python -m backend.reminders --once`` or ``--interval 60`` after migrations.
Notification/outbox keys are idempotent; SMTP is at-least-once across a crash
between remote acceptance and database commit (stable Message-ID is retained).
Only aggregate counts and safe error codes are printed, never email data.
"""

import argparse
import asyncio
import json
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import DateTime, ForeignKey, and_, exists, or_, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from .collaboration import TaskItem
from .db import AsyncSessionLocal, Base
from .notifications import (
    MailDelivery,
    MailSendError,
    Notification,
    UserNotificationPreference,
    add_notification,
    email_allowed,
    notify_workspace,
    queue_email,
    send_email,
)
from .settings import settings
from .workspaces import AuditEvent, Membership, User, Workspace, utcnow

MAX_ATTEMPTS = 5
EVENT_BATCH = 500
MAIL_BATCH = 100
EVENT_TYPES = (
    "task.created",
    "task.updated",
    "comment.created",
    "application.review_requested",
    "application.reviewed",
    "document.reviewed",
    "member.invited",
    "member.joined",
    "member.role_updated",
    "member.removed",
    "incorporation.updated",
)


class NotificationEventReceipt(Base):
    __tablename__ = "notification_event_receipts"
    event_id: Mapped[str] = mapped_column(
        ForeignKey("audit_events.id", ondelete="CASCADE"), primary_key=True
    )
    consumed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )


def retry_delay(attempts: int) -> timedelta:
    return timedelta(seconds=min(3600, 60 * (2 ** max(0, attempts - 1))))


async def consume_activity(session: AsyncSession) -> int:
    query = (
        select(AuditEvent)
        .where(
            AuditEvent.event_type.in_(EVENT_TYPES),
            ~exists(
                select(NotificationEventReceipt.event_id).where(
                    NotificationEventReceipt.event_id == AuditEvent.id
                )
            ),
        )
        .order_by(AuditEvent.created_at, AuditEvent.id)
        .limit(EVENT_BATCH)
    )
    events = (await session.execute(query)).scalars().all()
    for event in events:
        detail = {
            key: value
            for key, value in (event.detail or {}).items()
            if key
            in {
                "task_id",
                "comment_id",
                "application_id",
                "document_id",
                "revision",
                "status",
                "assignee_id",
                "approved",
            }
        }
        roles = (
            ["reviewer", "admin", "owner"]
            if event.event_type == "application.review_requested"
            else None
        )
        key = (event.detail or {}).get("notification_event_key") or f"audit:{event.id}"
        await notify_workspace(
            session,
            event.workspace_id,
            event.event_type,
            project_id=event.project_id,
            detail=detail,
            roles=roles,
            exclude_user_id=None if roles else event.actor_id,
            event_key=key,
        )
        await session.execute(
            insert(NotificationEventReceipt)
            .values(event_id=event.id, consumed_at=utcnow())
            .on_conflict_do_nothing(index_elements=[NotificationEventReceipt.event_id])
        )
    return len(events)


async def consume_reminders(session: AsyncSession, now: datetime) -> int:
    # One reminder in the 24-hour window, including recently overdue tasks.
    horizon, oldest = now + timedelta(hours=24), now - timedelta(days=7)
    tasks = (
        (
            await session.execute(
                select(TaskItem)
                .join(Workspace, Workspace.id == TaskItem.workspace_id)
                .where(
                    Workspace.plan == "pro",
                    TaskItem.status != "done",
                    TaskItem.due_at >= oldest,
                    TaskItem.due_at <= horizon,
                )
            )
        )
        .scalars()
        .all()
    )
    total = 0
    for task in tasks:
        query = select(Membership.user_id).where(Membership.workspace_id == task.workspace_id)
        if task.assignee_id:
            query = query.where(Membership.user_id == task.assignee_id)
        else:
            query = query.where(Membership.role.in_(["admin", "owner"]))
        for user_id in (await session.execute(query)).scalars():
            key = f"task-due:{task.id}:{task.due_at.isoformat()}:{task.assignee_id or 'unassigned'}"
            await add_notification(
                session,
                user_id,
                task.workspace_id,
                "task.due",
                key,
                project_id=task.project_id,
                detail={"task_id": task.id, "due_at": task.due_at.isoformat()},
            )
            total += 1
    from .applications import Application
    from .funding import Evaluation, FundingCall

    calls = (
        (
            await session.execute(
                select(FundingCall).where(
                    FundingCall.status == "published",
                    FundingCall.deadline > now,
                    FundingCall.deadline <= horizon,
                )
            )
        )
        .scalars()
        .all()
    )
    for call in calls:
        workspace_query = select(Workspace.id).where(
            (Workspace.id.in_(select(Evaluation.workspace_id).where(Evaluation.call_id == call.id)))
            | (
                Workspace.id.in_(
                    select(Application.workspace_id).where(Application.call_id == call.id)
                )
            )
        )
        for workspace_id in (await session.execute(workspace_query)).scalars():
            await notify_workspace(
                session,
                workspace_id,
                "deadline.due",
                detail={"call_id": call.id, "deadline": call.deadline.isoformat()},
                event_key=f"deadline:{call.id}:{call.version}:{call.deadline.isoformat()}",
            )
            total += 1
    return total


async def materialize_mail(session: AsyncSession) -> int:
    # Every notification is real; absence of SMTP does not fabricate delivery.
    category_enabled = or_(
        and_(
            Notification.event_type.like("task.%"),
            UserNotificationPreference.task_reminders.is_(True),
        ),
        and_(
            Notification.event_type.like("deadline.%"),
            UserNotificationPreference.deadline_reminders.is_(True),
        ),
        and_(
            Notification.event_type.like("application.%"),
            UserNotificationPreference.review_notifications.is_(True),
        ),
        and_(
            ~Notification.event_type.like("task.%"),
            ~Notification.event_type.like("deadline.%"),
            ~Notification.event_type.like("application.%"),
            UserNotificationPreference.activity_notifications.is_(True),
        ),
    )
    query = (
        select(Notification, UserNotificationPreference)
        .join(
            UserNotificationPreference, UserNotificationPreference.user_id == Notification.user_id
        )
        .join(User, User.id == Notification.user_id)
        .join(
            Membership,
            (Membership.workspace_id == Notification.workspace_id)
            & (Membership.user_id == Notification.user_id),
        )
        .where(
            UserNotificationPreference.email_enabled.is_(True),
            User.email_verified_at.is_not(None),
            category_enabled,
            ~exists(select(MailDelivery.id).where(MailDelivery.notification_id == Notification.id)),
        )
        .order_by(Notification.created_at, Notification.id)
        .limit(EVENT_BATCH)
    )
    total = 0
    for notification, pref in (await session.execute(query)).all():
        if not email_allowed(pref, notification.event_type):
            continue
        # No document/comment/task content is copied into email.
        body = (
            "Abi hesabınızda yeni bir bildirim var / You have a new Abi notification.\n\n"
            + settings.public_app_url.rstrip("/")
            + "/\n\n"
            + notification.event_type
        )
        await queue_email(
            session,
            notification.user_id,
            "Abi — bildirim / notification",
            body,
            dedupe_key=f"notification:{notification.id}",
            workspace_id=notification.workspace_id,
            kind="notification",
            notification_id=notification.id,
        )
        total += 1
    return total


async def delivery_allowed(session: AsyncSession, delivery: MailDelivery, user: User) -> bool:
    if delivery.kind != "notification":
        return True
    if not user.email_verified_at or not delivery.workspace_id:
        return False
    membership = await session.get(Membership, (delivery.workspace_id, user.id))
    if membership is None:
        return False
    notification = await session.get(Notification, delivery.notification_id)
    if notification is None:
        return False
    pref = await session.get(UserNotificationPreference, user.id)
    if not email_allowed(pref, notification.event_type):
        return False
    if notification.event_type == "application.review_requested":
        from .applications import Application

        application = await session.get(Application, notification.detail.get("application_id"))
        if (
            membership.role not in {"reviewer", "admin", "owner"}
            or application is None
            or application.state != "review_requested"
            or application.revision != notification.detail.get("revision")
        ):
            return False
    if notification.event_type == "task.due":
        task = await session.get(TaskItem, notification.detail.get("task_id"))
        if task is None or task.status == "done" or task.due_at is None:
            return False
        if task.assignee_id and task.assignee_id != user.id:
            return False
        if not task.assignee_id and membership.role not in {"admin", "owner"}:
            return False
        if task.due_at.isoformat() != notification.detail.get("due_at"):
            return False
        workspace = await session.get(Workspace, delivery.workspace_id)
        if workspace is None or workspace.plan != "pro":
            return False
    if notification.event_type == "deadline.due":
        from .funding import FundingCall

        call = await session.get(FundingCall, notification.detail.get("call_id"))
        if (
            call is None
            or call.status != "published"
            or call.deadline is None
            or call.deadline <= utcnow()
            or call.deadline.isoformat() != notification.detail.get("deadline")
        ):
            return False
    return True


async def deliver_one(now: datetime) -> str | None:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            # Hold a row lock through SMTP so concurrent workers cannot send it.
            query = (
                select(MailDelivery)
                .where(
                    MailDelivery.status.in_(["queued", "retry"]),
                    MailDelivery.next_attempt_at <= now,
                )
                .order_by(MailDelivery.next_attempt_at, MailDelivery.id)
                .limit(1)
                .with_for_update(skip_locked=True)
            )
            delivery = (await session.execute(query)).scalar_one_or_none()
            if delivery is None:
                return None
            user = await session.get(User, delivery.user_id)
            if user is None or not await delivery_allowed(session, delivery, user):
                delivery.status = "cancelled"
                delivery.body = ""
                return "cancelled"
            delivery.attempts += 1
            try:
                await send_email(
                    user.email, delivery.subject, delivery.body, message_key=delivery.dedupe_key
                )
            except HTTPException:
                delivery.last_error = "configuration_error"
            except MailSendError as exc:
                delivery.last_error = str(exc)
            else:
                delivery.status = "sent"
                delivery.sent_at = utcnow()
                delivery.last_error = None
                # Verification links/content need not remain after delivery.
                delivery.body = ""
                return "sent"
            delivery.status = "dead_letter" if delivery.attempts >= MAX_ATTEMPTS else "retry"
            delivery.next_attempt_at = now + retry_delay(delivery.attempts)
            return delivery.status


async def run_once() -> dict:
    counters = {
        "events": 0,
        "reminders_examined": 0,
        "mail_queued": 0,
        "sent": 0,
        "retry": 0,
        "dead_letter": 0,
        "cancelled": 0,
    }
    async with AsyncSessionLocal() as session:
        async with session.begin():
            # Only one consumer materializes reminders; unique keys remain the
            # correctness boundary if another process bypasses this lock.
            acquired = (
                await session.execute(text("SELECT pg_try_advisory_xact_lock(715892341)"))
            ).scalar_one()
            if acquired:
                counters["events"] = await consume_activity(session)
                counters["reminders_examined"] = await consume_reminders(session, utcnow())
                counters["mail_queued"] = await materialize_mail(session)
    for _ in range(MAIL_BATCH):
        result = await deliver_one(utcnow())
        if result is None:
            break
        counters[result] += 1
    return counters


async def run(interval: float | None) -> None:
    while True:
        try:
            print(json.dumps(await run_once(), sort_keys=True), flush=True)
        except (SQLAlchemyError, HTTPException, OSError, ValueError, RuntimeError):
            # No exception text/traceback: drivers and SMTP can include PII.
            print(json.dumps({"error": "worker_failed"}), flush=True)
            if interval is None:
                raise SystemExit(1) from None
        if interval is None:
            return
        await asyncio.sleep(interval)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--once", action="store_true")
    mode.add_argument("--interval", type=float, metavar="SECONDS")
    args = parser.parse_args()
    if args.interval is not None and args.interval < 1:
        parser.error("interval must be at least 1 second")
    asyncio.run(run(args.interval))


if __name__ == "__main__":
    main()
