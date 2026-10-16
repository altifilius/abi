"""Private notifications and a durable, real-SMTP outbox; never log message data."""

import asyncio
import hashlib
import ipaddress
import smtplib
import ssl
from datetime import datetime
from email.message import EmailMessage
from email.utils import format_datetime, parseaddr
from urllib.parse import quote

from fastapi import HTTPException
from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    select,
)
from sqlalchemy.dialects.postgresql import JSONB, insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base
from .settings import settings
from .workspaces import Membership, new_id, utcnow


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (UniqueConstraint("user_id", "event_key", name="uq_notification_user_event"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    event_key: Mapped[str] = mapped_column(String(250), nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    detail: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class UserNotificationPreference(Base):
    __tablename__ = "user_notification_preferences"
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    email_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    task_reminders: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    deadline_reminders: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    review_notifications: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    activity_notifications: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class MailDelivery(Base):
    __tablename__ = "mail_deliveries"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    dedupe_key: Mapped[str] = mapped_column(String(250), unique=True, nullable=False)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    workspace_id: Mapped[str | None] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE")
    )
    notification_id: Mapped[str | None] = mapped_column(
        ForeignKey("notifications.id", ondelete="CASCADE")
    )
    kind: Mapped[str] = mapped_column(String(30), nullable=False, default="transactional")
    subject: Mapped[str] = mapped_column(String(250), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued", index=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, index=True
    )
    last_error: Mapped[str | None] = mapped_column(String(60))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


def notification_payload(notification: Notification) -> dict:
    detail = {
        key: value
        for key, value in (notification.detail or {}).items()
        if key
        in {
            "task_id",
            "comment_id",
            "application_id",
            "document_id",
            "call_id",
            "revision",
            "status",
            "assignee_id",
            "approved",
            "due_at",
            "deadline",
        }
    }
    workspace = quote(notification.workspace_id, safe="")
    target = f"/w/{workspace}/overview"
    if notification.event_type.startswith("task.") and isinstance(detail.get("task_id"), str):
        target = f"/w/{workspace}/tasks?task={quote(detail['task_id'], safe='')}"
    elif notification.event_type.startswith("application.") and isinstance(
        detail.get("application_id"), str
    ):
        target = f"/w/{workspace}/applications/{quote(detail['application_id'], safe='')}/review"
    elif notification.event_type.startswith("document.") and isinstance(
        detail.get("document_id"), str
    ):
        target = f"/w/{workspace}/documents?document={quote(detail['document_id'], safe='')}"
    elif notification.event_type.startswith("deadline.") and isinstance(detail.get("call_id"), str):
        target = f"/w/{workspace}/funding/calls/{quote(detail['call_id'], safe='')}"
    elif notification.project_id:
        target = f"/w/{workspace}/projects/{quote(notification.project_id, safe='')}/overview"
    elif notification.event_type.startswith("member."):
        target = f"/w/{workspace}/workspace/team"
    elif notification.event_type.startswith("incorporation."):
        target = f"/w/{workspace}/workspace/incorporation"
    return {
        key: getattr(notification, key)
        for key in ("id", "workspace_id", "project_id", "event_type", "read_at", "created_at")
    } | {"detail": detail, "target_url": target}


PREFERENCE_FIELDS = (
    "email_enabled",
    "task_reminders",
    "deadline_reminders",
    "review_notifications",
    "activity_notifications",
)


def preference_payload(pref: UserNotificationPreference | None) -> dict:
    return {
        name: getattr(pref, name) if pref else name != "email_enabled" for name in PREFERENCE_FIELDS
    }


def email_allowed(pref: UserNotificationPreference | None, event_type: str) -> bool:
    values = preference_payload(pref)
    category = (
        "task_reminders"
        if event_type.startswith("task.")
        else "deadline_reminders"
        if event_type.startswith("deadline.")
        else "review_notifications"
        if event_type.startswith("application.")
        else "activity_notifications"
    )
    return values["email_enabled"] and values[category]


async def notify_workspace(
    session: AsyncSession,
    workspace_id: str,
    event_type: str,
    *,
    project_id: str | None = None,
    detail: dict | None = None,
    roles: list[str] | None = None,
    exclude_user_id: str | None = None,
    event_key: str | None = None,
) -> None:
    query = select(Membership.user_id).where(Membership.workspace_id == workspace_id)
    if roles is not None:
        query = query.where(Membership.role.in_(roles))
    if exclude_user_id is not None:
        query = query.where(Membership.user_id != exclude_user_id)
    key = event_key or new_id()
    for user_id in (await session.execute(query)).scalars():
        await add_notification(
            session, user_id, workspace_id, event_type, key, project_id=project_id, detail=detail
        )


async def add_notification(
    session: AsyncSession,
    user_id: str,
    workspace_id: str,
    event_type: str,
    event_key: str,
    *,
    project_id: str | None = None,
    detail: dict | None = None,
) -> None:
    await session.execute(
        insert(Notification)
        .values(
            id=new_id(),
            user_id=user_id,
            workspace_id=workspace_id,
            project_id=project_id,
            event_type=event_type,
            event_key=event_key,
            detail=detail or {},
            created_at=utcnow(),
        )
        .on_conflict_do_nothing(constraint="uq_notification_user_event")
    )


class MailSendError(Exception):
    """Only a safe error code is exposed; SMTP replies can contain addresses."""


def ensure_mail_configured() -> None:
    host = getattr(settings, "smtp_host", None)
    sender = getattr(settings, "smtp_from_email", None)
    security = getattr(settings, "smtp_security", "starttls")
    username = getattr(settings, "smtp_username", None)
    password = getattr(settings, "smtp_password", None)
    if (
        not host
        or not sender
        or security not in {"starttls", "tls", "none"}
        or bool(username) != bool(password)
    ):
        raise HTTPException(503, {"code": "configuration_error", "service": "smtp"})
    if security == "none":
        try:
            loopback = ipaddress.ip_address(host).is_loopback
        except ValueError:
            loopback = False
        if not loopback:
            raise HTTPException(503, {"code": "configuration_error", "service": "smtp"})
    if (
        any(char in str(host) + str(sender) for char in "\r\n")
        or parseaddr(sender)[1] != sender
        or "@" not in sender
    ):
        raise HTTPException(503, {"code": "configuration_error", "service": "smtp"})
    if host.lower() in {"smtp.example.com", "example.com", "your-smtp-host"} or (
        password and password.lower() in {"your-password", "changeme", "replace-me"}
    ):
        raise HTTPException(503, {"code": "configuration_error", "service": "smtp"})


def _send_email(recipient: str, subject: str, body: str, message_key: str) -> None:
    ensure_mail_configured()
    if (
        any(char in recipient + subject for char in "\r\n")
        or parseaddr(recipient)[1] != recipient
        or "@" not in recipient
    ):
        raise MailSendError("invalid_message")
    message = EmailMessage()
    message["From"] = settings.smtp_from_email
    message["To"] = recipient
    message["Subject"] = subject
    message["Date"] = format_datetime(utcnow())
    message["Message-ID"] = (
        f"<{hashlib.sha256(message_key.encode()).hexdigest()}@{settings.smtp_from_email.rsplit('@', 1)[1]}>"
    )
    message.set_content(body)
    factory = smtplib.SMTP_SSL if settings.smtp_security == "tls" else smtplib.SMTP
    options = {"timeout": settings.smtp_timeout_seconds}
    if settings.smtp_security == "tls":
        options["context"] = ssl.create_default_context()
    try:
        with factory(settings.smtp_host, settings.smtp_port, **options) as smtp:
            if settings.smtp_security == "starttls":
                smtp.ehlo()
                smtp.starttls(context=ssl.create_default_context())
                smtp.ehlo()
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            refused = smtp.send_message(message)
            if refused:
                raise MailSendError("recipient_rejected")
    except smtplib.SMTPAuthenticationError:
        raise MailSendError("authentication_failed") from None
    except smtplib.SMTPRecipientsRefused:
        raise MailSendError("recipient_rejected") from None
    except smtplib.SMTPException:
        raise MailSendError("smtp_failed") from None
    except (OSError, TimeoutError):
        raise MailSendError("connection_failed") from None


async def send_email(
    recipient: str, subject: str, body: str, *, message_key: str | None = None
) -> None:
    await asyncio.to_thread(_send_email, recipient, subject, body, message_key or new_id())


async def queue_email(
    session: AsyncSession,
    user_id: str,
    subject: str,
    body: str,
    *,
    dedupe_key: str,
    workspace_id: str | None = None,
    kind: str = "transactional",
    notification_id: str | None = None,
) -> MailDelivery:
    await session.execute(
        insert(MailDelivery)
        .values(
            id=new_id(),
            dedupe_key=dedupe_key,
            user_id=user_id,
            workspace_id=workspace_id,
            notification_id=notification_id,
            kind=kind,
            subject=subject,
            body=body,
            status="queued",
            attempts=0,
            next_attempt_at=utcnow(),
            created_at=utcnow(),
        )
        .on_conflict_do_nothing(index_elements=[MailDelivery.dedupe_key])
    )
    return (
        await session.execute(select(MailDelivery).where(MailDelivery.dedupe_key == dedupe_key))
    ).scalar_one()
