"""Tenant-scoped collaboration, incorporation self-checks and real calendar export."""

from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import DateTime, ForeignKey, String, Text, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base, get_session
from .notifications import (
    MailDelivery,
    Notification,
    UserNotificationPreference,
    ensure_mail_configured,
    preference_payload,
)
from .workspaces import (
    AuditEvent,
    Membership,
    Project,
    User,
    Workspace,
    new_id,
    project_access,
    record_event,
    require_pro,
    require_user,
    utcnow,
    workspace_access,
)

router = APIRouter(prefix="/api", tags=["collaboration"])


class TaskItem(Base):
    __tablename__ = "tasks"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assignee_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )


class Comment(Base):
    __tablename__ = "comments"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TaskCreate(StrictBody):
    title: str = Field(min_length=1, max_length=300)
    assignee_id: str | None = Field(default=None, max_length=36)
    due_at: datetime | None = None

    @field_validator("title")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Task title cannot be blank")
        return value.strip()

    @field_validator("due_at")
    @classmethod
    def timezone_required(cls, value: datetime | None) -> datetime | None:
        if value is not None:
            if value.tzinfo is None or value.utcoffset() is None:
                raise ValueError("due_at requires a timezone")
            return value.astimezone(UTC)
        return None


class TaskPatch(TaskCreate):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    status: Literal["open", "in_progress", "done"] | None = None

    @field_validator("title")
    @classmethod
    def nonblank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return super().nonblank(value)

    @model_validator(mode="after")
    def required_not_null(self):
        for key in {"title", "status"} & self.model_fields_set:
            if getattr(self, key) is None:
                raise ValueError(f"{key} cannot be null")
        return self


class CommentCreate(StrictBody):
    text: str = Field(min_length=1, max_length=10000)

    @field_validator("text")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Comment cannot be blank")
        return value.strip()


class PreferencePatch(StrictBody):
    email_enabled: bool | None = None
    task_reminders: bool | None = None
    deadline_reminders: bool | None = None
    review_notifications: bool | None = None
    activity_notifications: bool | None = None

    @model_validator(mode="after")
    def no_null(self):
        if any(getattr(self, key) is None for key in self.model_fields_set):
            raise ValueError("Preference cannot be null")
        return self


class NotificationRead(StrictBody):
    read: bool = True


def task_payload(task: TaskItem) -> dict:
    return {
        key: getattr(task, key)
        for key in (
            "id",
            "workspace_id",
            "project_id",
            "title",
            "assignee_id",
            "due_at",
            "status",
            "created_at",
            "updated_at",
        )
    }


def comment_payload(comment: Comment) -> dict:
    return {
        key: getattr(comment, key)
        for key in ("id", "workspace_id", "project_id", "author_id", "text", "created_at")
    }


async def check_assignee(session: AsyncSession, workspace_id: str, user_id: str | None) -> None:
    if user_id is not None:
        membership = await session.get(Membership, (workspace_id, user_id))
        if membership is None or membership.role == "viewer":
            raise HTTPException(422, "Assignee must be an editor or higher in this workspace")


async def pro_project(
    session: AsyncSession, user: User, project_id: str, role: str = "viewer"
) -> Project:
    project = await project_access(session, user, project_id, role)
    require_pro(await workspace_access(session, user, project.workspace_id, role))
    return project


@router.get("/projects/{project_id}/tasks")
async def list_tasks(
    project_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await pro_project(session, user, project_id)
    tasks = (
        await session.execute(
            select(TaskItem)
            .where(TaskItem.project_id == project_id)
            .order_by(TaskItem.created_at, TaskItem.id)
        )
    ).scalars()
    return [task_payload(task) for task in tasks]


@router.post("/projects/{project_id}/tasks", status_code=201)
async def create_task(
    project_id: str,
    body: TaskCreate,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    project = await pro_project(session, user, project_id, "editor")
    await check_assignee(session, project.workspace_id, body.assignee_id)
    task = TaskItem(workspace_id=project.workspace_id, project_id=project.id, **body.model_dump())
    session.add(task)
    await session.flush()
    record_event(
        session,
        project.workspace_id,
        user.id,
        "task.created",
        project_id=project.id,
        detail={"task_id": task.id, "assignee_id": task.assignee_id},
    )
    await session.commit()
    return task_payload(task)


@router.patch("/tasks/{task_id}")
async def update_task(
    task_id: str,
    body: TaskPatch,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    task = (
        await session.execute(select(TaskItem).where(TaskItem.id == task_id).with_for_update())
    ).scalar_one_or_none()
    if task is None:
        raise HTTPException(404, "Task not found")
    await pro_project(session, user, task.project_id, "editor")
    changes = body.model_dump(exclude_unset=True)
    if "assignee_id" in changes:
        await check_assignee(session, task.workspace_id, changes["assignee_id"])
    for key, value in changes.items():
        setattr(task, key, value)
    task.updated_at = utcnow()
    record_event(
        session,
        task.workspace_id,
        user.id,
        "task.updated",
        project_id=task.project_id,
        detail={
            "task_id": task.id,
            "assignee_id": task.assignee_id,
            "changed_fields": sorted(changes),
            "status": task.status,
        },
    )
    await session.commit()
    return task_payload(task)


@router.get("/projects/{project_id}/comments")
async def list_comments(
    project_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await pro_project(session, user, project_id)
    comments = (
        (
            await session.execute(
                select(Comment)
                .where(Comment.project_id == project_id)
                .order_by(Comment.created_at.desc(), Comment.id.desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return [comment_payload(comment) for comment in reversed(comments)]


@router.post("/projects/{project_id}/comments", status_code=201)
async def create_comment(
    project_id: str,
    body: CommentCreate,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    project = await pro_project(session, user, project_id, "editor")
    comment = Comment(
        workspace_id=project.workspace_id, project_id=project.id, author_id=user.id, text=body.text
    )
    session.add(comment)
    await session.flush()
    record_event(
        session,
        project.workspace_id,
        user.id,
        "comment.created",
        project_id=project.id,
        detail={"comment_id": comment.id},
    )
    await session.commit()
    return comment_payload(comment)


@router.get("/workspaces/{workspace_id}/activity")
async def activity(
    workspace_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await workspace_access(session, user, workspace_id)
    events = (
        await session.execute(
            select(AuditEvent)
            .where(AuditEvent.workspace_id == workspace_id)
            .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
            .limit(limit)
        )
    ).scalars()
    return [
        {
            key: getattr(event, key)
            for key in ("id", "event_type", "actor_id", "project_id", "detail", "created_at")
        }
        for event in events
    ]


@router.get("/notifications")
async def notifications(
    limit: int = Query(default=100, ge=1, le=500),
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    # Removed workspace members cannot retain a live read-path into that tenant.
    rows = (
        await session.execute(
            select(Notification)
            .join(
                Membership,
                (Membership.workspace_id == Notification.workspace_id)
                & (Membership.user_id == Notification.user_id),
            )
            .where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .limit(limit)
        )
    ).scalars()
    return [
        {
            key: getattr(row, key)
            for key in (
                "id",
                "workspace_id",
                "project_id",
                "event_type",
                "detail",
                "read_at",
                "created_at",
            )
        }
        for row in rows
    ]


@router.patch("/notifications/{notification_id}")
async def read_notification(
    notification_id: str,
    body: NotificationRead,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    row = (
        await session.execute(
            select(Notification)
            .where(Notification.id == notification_id, Notification.user_id == user.id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "Notification not found")
    await workspace_access(session, user, row.workspace_id)
    row.read_at = (row.read_at or utcnow()) if body.read else None
    await session.commit()
    return {"id": row.id, "read_at": row.read_at}


@router.get("/notification-preferences")
async def get_preferences(
    user: User = Depends(require_user), session: AsyncSession = Depends(get_session)
):
    return preference_payload(await session.get(UserNotificationPreference, user.id))


@router.patch("/notification-preferences")
async def update_preferences(
    body: PreferencePatch,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    from sqlalchemy.dialects.postgresql import insert

    await session.execute(
        insert(UserNotificationPreference)
        .values(user_id=user.id, **preference_payload(None))
        .on_conflict_do_nothing(index_elements=[UserNotificationPreference.user_id])
    )
    pref = (
        await session.execute(
            select(UserNotificationPreference)
            .where(UserNotificationPreference.user_id == user.id)
            .with_for_update()
        )
    ).scalar_one()
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(pref, key, value)
    await session.commit()
    return preference_payload(pref)


@router.get("/mail-deliveries")
async def mail_deliveries(
    limit: int = Query(default=100, ge=1, le=500),
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    rows = (
        await session.execute(
            select(MailDelivery)
            .where(MailDelivery.user_id == user.id)
            .order_by(MailDelivery.created_at.desc())
            .limit(limit)
        )
    ).scalars()
    return [
        {
            key: getattr(row, key)
            for key in (
                "id",
                "kind",
                "status",
                "attempts",
                "last_error",
                "next_attempt_at",
                "created_at",
                "sent_at",
            )
        }
        for row in rows
    ]


@router.get("/mail-status")
async def mail_status(user: User = Depends(require_user)):
    try:
        ensure_mail_configured()
    except HTTPException:
        return {
            "configured": False,
            "error": "configuration_error",
            "delivery_requires_worker": True,
        }
    return {"configured": True, "error": None, "delivery_requires_worker": True}


MERSIS_SOURCE = (
    "https://ticaret.gov.tr/ic-ticaret/ticaret-sicili/merkezi-sicil-kayit-sistemi-mersis"
)
INCORPORATION_STEPS = [
    {
        "key": "company_details",
        "title": "Şirket bilgileri / Company details",
        "title_en": "Company details",
        "description": "Unvan, merkez adresi, ortaklar, temsilciler ve AŞ/LTD tercihini MERSİS başvurusunda hazırlayın; yetki kabulünü doğrulayın.",
        "description_en": "Prepare the company name, registered address, shareholders, representatives and AS/LTD choice in MERSIS; confirm representative acceptance.",
        "source_url": MERSIS_SOURCE,
    },
    {
        "key": "articles",
        "title": "Şirket sözleşmesi / Articles",
        "title_en": "Articles of association",
        "description": "MERSİS üzerinden sözleşmeyi hazırlayın; e-imza/mobil imza veya yetkili ticaret sicili müdürlüğünün güncel imza usulünü takip edin.",
        "description_en": "Prepare the articles through MERSIS and follow the current electronic/mobile signature or competent trade registry signature procedure.",
        "source_url": MERSIS_SOURCE,
    },
    {
        "key": "capital",
        "title": "Sermaye kontrolü / Capital check",
        "title_en": "Capital check",
        "description": "Seçilen şirket türünün güncel sermaye ve ödeme şartlarını resmi mevzuat ile ticaret sicili müdürlüğünden kontrol edin; bu liste rakam veya hukuki uygunluk onayı vermez.",
        "description_en": "Check the selected company form's current capital and payment requirements against official legislation and the trade registry. This checklist does not certify figures or legal compliance.",
        "source_url": "https://mersis.ticaret.gov.tr/",
    },
    {
        "key": "registry",
        "title": "Tescil ve ilan / Registration",
        "title_en": "Registration and publication",
        "description": "Kuruluş başvurusunu MERSİS ve yetkili ticaret sicili müdürlüğü üzerinden tamamlayın; tescil ve Ticaret Sicili Gazetesi ilanını kontrol edin.",
        "description_en": "Complete the incorporation application through MERSIS and the competent trade registry; check the registration and Trade Registry Gazette publication.",
        "source_url": MERSIS_SOURCE,
    },
    {
        "key": "tax_social",
        "title": "Vergi ve SGK / Tax and social security",
        "title_en": "Tax and social security",
        "description": "MERSİS entegrasyonuyla oluşan vergi numarası ve varsa çalışan/SGK e-bildirge bilgilerini kontrol edin; özel durumları mali müşavirinizle doğrulayın.",
        "description_en": "Check the tax number and any employee/social security electronic declaration details exchanged through MERSIS. Confirm specific obligations with your accountant.",
        "source_url": MERSIS_SOURCE,
    },
]
INCORPORATION_KEYS = {step["key"] for step in INCORPORATION_STEPS}


class IncorporationPatch(StrictBody):
    legal_form: Literal["AS", "LTD"] | None = None
    checklist: dict[str, bool] | None = None

    @model_validator(mode="after")
    def check_fields(self):
        if any(getattr(self, key) is None for key in self.model_fields_set):
            raise ValueError("Incorporation field cannot be null")
        if self.checklist is not None and set(self.checklist) - INCORPORATION_KEYS:
            raise ValueError("Unknown checklist step")
        return self


def incorporation_payload(workspace: Workspace) -> dict:
    stored = workspace.incorporation or {}
    return {
        "country": "TR",
        "legal_form": stored.get("legal_form", "LTD"),
        "checklist": {
            key: bool(stored.get("checklist", {}).get(key, False))
            for key in sorted(INCORPORATION_KEYS)
        },
        "steps": INCORPORATION_STEPS,
        "sources": [
            {"title": "T.C. Ticaret Bakanlığı — MERSİS", "url": MERSIS_SOURCE},
            {
                "title": "MERSİS resmi işlem ve mevzuat portalı",
                "url": "https://mersis.ticaret.gov.tr/",
            },
        ],
        "disclaimer": "Kullanıcı öz-kontrol listesi; resmi tescil veya hukuki doğrulama değildir. AŞ/LTD seçimi ve yükümlülükleri yetkili uzman ve sicil müdürlüğüyle doğrulayın. Görev ataması Pro gerektirir.",
        "disclaimer_en": "A user self-checklist, not official registration or legal verification. Confirm AS/LTD choice and obligations with a qualified adviser and trade registry. Task assignment requires Pro.",
        "updated_at": stored.get("updated_at"),
        "updated_by": stored.get("updated_by"),
    }


@router.get("/workspaces/{workspace_id}/incorporation")
async def get_incorporation(
    workspace_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    workspace = await workspace_access(session, user, workspace_id)
    if workspace.country != "TR":
        raise HTTPException(422, "This guide covers Turkish incorporation only")
    return incorporation_payload(workspace)


@router.patch("/workspaces/{workspace_id}/incorporation")
async def update_incorporation(
    workspace_id: str,
    body: IncorporationPatch,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await workspace_access(session, user, workspace_id, "editor")
    workspace = (
        await session.execute(
            select(Workspace).where(Workspace.id == workspace_id).with_for_update()
        )
    ).scalar_one()
    if workspace.country != "TR":
        raise HTTPException(422, "This guide covers Turkish incorporation only")
    old = incorporation_payload(workspace)
    workspace.incorporation = {
        "legal_form": body.legal_form or old["legal_form"],
        "checklist": {**old["checklist"], **(body.checklist or {})},
        "updated_at": utcnow().isoformat(),
        "updated_by": user.id,
    }
    record_event(
        session,
        workspace.id,
        user.id,
        "incorporation.updated",
        detail={
            "legal_form": workspace.incorporation["legal_form"],
            "changed_steps": sorted((body.checklist or {}).keys()),
        },
    )
    await session.commit()
    return incorporation_payload(workspace)


def ics_escape(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\n", "\\n")
        .replace(";", "\\;")
        .replace(",", "\\,")
    )


def ics_fold(line: str) -> str:
    """RFC5545's 75-octet limit, without splitting a UTF-8 character."""
    parts, current, count = [], "", 0
    for char in line:
        size = len(char.encode("utf-8"))
        if count + size > 75:
            parts.append(current)
            current, count = " ", 1
        current += char
        count += size
    parts.append(current)
    return "\r\n".join(parts)


def ics_datetime(value: datetime) -> str:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Calendar dates must have an explicit timezone")
    return value.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def calendar_content(events: list[dict], generated_at: datetime | None = None) -> str:
    stamp = ics_datetime(generated_at or utcnow())
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Abi//Workspace calendar//TR",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ]
    for event in events:
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{event['uid']}@abi",
                f"DTSTAMP:{stamp}",
                f"DTSTART:{ics_datetime(event['when'])}",
                f"DTEND:{ics_datetime(event['when'] + timedelta(minutes=1))}",
                "SUMMARY:" + ics_escape(event["title"]),
                "DESCRIPTION:" + ics_escape(event.get("description", "")),
                "END:VEVENT",
            ]
        )
    lines.append("END:VCALENDAR")
    return "\r\n".join(ics_fold(line) for line in lines) + "\r\n"


async def workspace_deadlines(session: AsyncSession, workspace_id: str) -> list[tuple]:
    # Only calls actually evaluated or made into an application in this workspace.
    from .applications import Application
    from .funding import Evaluation, FundingCall

    query = select(FundingCall).where(
        FundingCall.status == "published",
        FundingCall.deadline.is_not(None),
        (
            FundingCall.id.in_(
                select(Evaluation.call_id).where(Evaluation.workspace_id == workspace_id)
            )
        )
        | (
            FundingCall.id.in_(
                select(Application.call_id).where(Application.workspace_id == workspace_id)
            )
        ),
    )
    return [
        (call.id, call.title, call.deadline, call.version)
        for call in (await session.execute(query)).scalars()
    ]


@router.get("/workspaces/{workspace_id}/calendar.ics")
async def calendar(
    workspace_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await workspace_access(session, user, workspace_id)
    tasks = (
        await session.execute(
            select(TaskItem).where(
                TaskItem.workspace_id == workspace_id,
                TaskItem.due_at.is_not(None),
                TaskItem.status != "done",
            )
        )
    ).scalars()
    events = [
        {
            "uid": "task-" + task.id,
            "when": task.due_at,
            "title": task.title,
            "description": "Workspace task",
        }
        for task in tasks
    ]
    events += [
        {
            "uid": "deadline-" + call_id,
            "when": deadline,
            "title": title,
            "description": "Official funding call deadline — verify current published call guidance",
        }
        for call_id, title, deadline, version in await workspace_deadlines(session, workspace_id)
    ]
    return Response(
        calendar_content(events),
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="abi-calendar.ics"',
            "Cache-Control": "no-store",
        },
    )
