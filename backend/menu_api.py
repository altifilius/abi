"""Membership-scoped menu read models and content-free global operations console."""

from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy import cast, func, select
from sqlalchemy.dialects.postgresql import JSONPATH
from sqlalchemy.ext.asyncio import AsyncSession

from .ai import UsageEvent
from .applications import Application, Document, application_payload, document_payload
from .collaboration import TaskItem, task_payload, workspace_calendar_events
from .db import get_session
from .funding import FundingCall, Program, require_admin
from .notifications import MailDelivery
from .operations import ai_configuration, health_payload
from .workspaces import (
    AuditEvent,
    Membership,
    Project,
    User,
    Workspace,
    project_access,
    require_user,
    utcnow,
    workspace_access,
)

router = APIRouter(prefix="/api", tags=["menu"])


async def scoped_project(session: AsyncSession, workspace_id: str, project_id: str | None) -> None:
    if project_id is not None and not await session.scalar(
        select(Project.id).where(Project.id == project_id, Project.workspace_id == workspace_id)
    ):
        raise HTTPException(404, "Project not found in workspace")


@router.get("/workspaces/{workspace_id}/applications")
async def applications(
    workspace_id: str,
    project_id: str | None = None,
    state: str | None = None,
    q: str = Query(default="", max_length=200),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
    due_before: date | None = None,
    responsible_id: str | None = None,
):
    await workspace_access(session, user, workspace_id)
    await scoped_project(session, workspace_id, project_id)
    query = (
        select(
            Application,
            Project.title,
            FundingCall.title,
            Program.name,
            FundingCall.deadline,
            User.name,
        )
        .join(Project, Project.id == Application.project_id)
        .join(FundingCall, FundingCall.id == Application.call_id)
        .join(Program, Program.id == FundingCall.program_id)
        .outerjoin(User, User.id == Application.responsible_id)
        .where(Application.workspace_id == workspace_id, Project.workspace_id == workspace_id)
    )
    if project_id:
        query = query.where(Application.project_id == project_id)
    if state:
        query = query.where(Application.state == state)
    if q:
        query = query.where(Project.title.ilike(f"%{q}%") | FundingCall.title.ilike(f"%{q}%"))
    if due_before is not None:
        if due_before == date.max:
            query = query.where(FundingCall.deadline.is_not(None))
        else:
            end = datetime.combine(due_before + timedelta(days=1), datetime.min.time(), tzinfo=UTC)
            query = query.where(FundingCall.deadline < end)
    if responsible_id:
        query = query.where(Application.responsible_id == responsible_id)
    rows = (
        await session.execute(
            query.order_by(Application.created_at.desc(), Application.id)
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return [
        application_payload(item)
        | {
            "project_title": project_title,
            "call_title": call_title,
            "program_name": program_name,
            "deadline": deadline,
            "responsible_name": responsible_name,
        }
        for item, project_title, call_title, program_name, deadline, responsible_name in rows
    ]


@router.get("/workspaces/{workspace_id}/documents")
async def documents(
    workspace_id: str,
    project_id: str | None = None,
    state: str | None = None,
    type: str | None = Query(default=None, max_length=150),
    q: str = Query(default="", max_length=200),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await workspace_access(session, user, workspace_id)
    await scoped_project(session, workspace_id, project_id)
    query = (
        select(
            Document.id,
            Document.workspace_id,
            Document.project_id,
            Document.original_name,
            Document.mime,
            Document.size,
            Document.sha256,
            Document.status,
            Document.verified_by,
            Document.verified_at,
            Document.created_at,
            Project.title.label("project_title"),
        )
        .join(Project, Project.id == Document.project_id)
        .where(Document.workspace_id == workspace_id, Project.workspace_id == workspace_id)
    )
    if project_id:
        query = query.where(Document.project_id == project_id)
    if state:
        query = query.where(Document.status == state)
    if type:
        query = query.where(Document.mime.startswith(type, autoescape=True))
    if q:
        query = query.where(Document.original_name.ilike(f"%{q}%"))
    return [
        dict(row)
        for row in (
            await session.execute(
                query.order_by(Document.created_at.desc(), Document.id).limit(limit).offset(offset)
            )
        ).mappings()
    ]


@router.get("/workspaces/{workspace_id}/documents/{document_id}")
async def document_detail(
    workspace_id: str,
    document_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await workspace_access(session, user, workspace_id)
    row = (
        await session.execute(
            select(Document, Project.title)
            .join(Project, Project.id == Document.project_id)
            .where(
                Document.id == document_id,
                Document.workspace_id == workspace_id,
                Project.workspace_id == workspace_id,
            )
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(404, "Document not found")
    document, title = row
    # JSONB containment locates actual attachment values without disclosing unrelated projects.
    uses = (
        await session.execute(
            select(Application.id, FundingCall.title, Application.state)
            .join(FundingCall, FundingCall.id == Application.call_id)
            .where(
                Application.workspace_id == workspace_id,
                Application.project_id == document.project_id,
                func.jsonb_path_exists(
                    Application.data,
                    cast("$.attachments.* ? (@ == $document)", JSONPATH),
                    func.jsonb_build_object("document", document.id),
                ),
            )
            .order_by(Application.created_at.desc())
            .limit(100)
        )
    ).all()
    return document_payload(document) | {
        "project_title": title,
        "text_content": document.text or "",
        "used_by": [
            {"id": id, "call_title": call_title, "state": state} for id, call_title, state in uses
        ],
    }


def task_query():
    return (
        select(TaskItem, Project.title, User.name, FundingCall.title, Document.original_name)
        .select_from(TaskItem)
        .join(Project, Project.id == TaskItem.project_id)
        .outerjoin(User, User.id == TaskItem.assignee_id)
        .outerjoin(
            Application,
            (Application.id == TaskItem.application_id)
            & (Application.workspace_id == TaskItem.workspace_id)
            & (Application.project_id == TaskItem.project_id),
        )
        .outerjoin(FundingCall, FundingCall.id == Application.call_id)
        .outerjoin(
            Document,
            (Document.id == TaskItem.document_id)
            & (Document.workspace_id == TaskItem.workspace_id)
            & (Document.project_id == TaskItem.project_id),
        )
    )


def task_wire(row) -> dict:
    task, title, name, application_title, document_name = row
    return task_payload(task) | {
        "project_title": title,
        "assignee_name": name,
        "application_title": application_title,
        "document_name": document_name,
    }


@router.get("/workspaces/{workspace_id}/tasks")
async def tasks(
    workspace_id: str,
    project_id: str | None = None,
    assignee_id: str | None = None,
    status: Literal["open", "in_progress", "done"] | None = None,
    due: Literal["overdue", "upcoming", "undated"] | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await workspace_access(session, user, workspace_id)
    await scoped_project(session, workspace_id, project_id)
    query = task_query().where(
        TaskItem.workspace_id == workspace_id, Project.workspace_id == workspace_id
    )
    if project_id:
        query = query.where(TaskItem.project_id == project_id)
    if assignee_id:
        query = query.where(TaskItem.assignee_id == assignee_id)
    if status:
        query = query.where(TaskItem.status == status)
    now = utcnow()
    if due == "overdue":
        query = query.where(TaskItem.due_at < now, TaskItem.status != "done")
    elif due == "upcoming":
        query = query.where(TaskItem.due_at >= now, TaskItem.status != "done")
    elif due == "undated":
        query = query.where(TaskItem.due_at.is_(None))
    return [
        task_wire(row)
        for row in (
            await session.execute(
                query.order_by(
                    TaskItem.due_at.asc().nulls_last(), TaskItem.created_at.desc(), TaskItem.id
                )
                .limit(limit)
                .offset(offset)
            )
        ).all()
    ]


@router.get("/tasks/{task_id}")
async def task_detail(
    task_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    # Membership is part of the query, so a global administrator cannot read a tenant by id.
    row = (
        await session.execute(
            task_query()
            .join(Membership, Membership.workspace_id == TaskItem.workspace_id)
            .where(
                TaskItem.id == task_id,
                Membership.user_id == user.id,
                Project.workspace_id == TaskItem.workspace_id,
            )
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(404, "Task not found")
    return task_wire(row)


@router.get("/tasks/{task_id}/history")
async def task_history(
    task_id: str,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    # Audit evidence keeps deleted tasks readable only to current workspace members.
    query = (
        select(AuditEvent, User.name)
        .join(Membership, Membership.workspace_id == AuditEvent.workspace_id)
        .join(
            Project,
            (Project.id == AuditEvent.project_id)
            & (Project.workspace_id == AuditEvent.workspace_id),
        )
        .outerjoin(User, User.id == AuditEvent.actor_id)
        .where(
            Membership.user_id == user.id,
            AuditEvent.event_type.in_(["task.created", "task.updated", "task.deleted"]),
            AuditEvent.detail["task_id"].as_string() == task_id,
        )
    )
    if not await session.scalar(query.with_only_columns(AuditEvent.id).limit(1)):
        # Older records may legitimately have no task audit events.
        await task_detail(task_id, user, session)
    rows = (
        await session.execute(
            query.order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return [
        {
            "id": event.id,
            "event_type": event.event_type,
            "actor_id": event.actor_id,
            "actor_name": name,
            "created_at": event.created_at,
            "detail": event.detail,
        }
        for event, name in rows
    ]


@router.get("/workspaces/{workspace_id}/calendar")
async def calendar(
    workspace_id: str,
    project_id: str | None = None,
    from_at: datetime | None = None,
    to_at: datetime | None = None,
    types: str = "task,deadline,opening,preregistration",
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
    mine: bool = False,
    assignee_id: str | None = None,
    selected_ids: Annotated[list[str] | None, Query(max_length=100)] = None,
):
    await workspace_access(session, user, workspace_id)
    if mine:
        if assignee_id is not None and assignee_id != user.id:
            raise HTTPException(422, "Mine cannot select another assignee")
        assignee_id = user.id
    return {
        "events": await workspace_calendar_events(
            session,
            workspace_id,
            project_id=project_id,
            from_at=from_at,
            to_at=to_at,
            types=types,
            assignee_id=assignee_id,
            selected_ids=selected_ids,
        )
    }


@router.get("/workspaces/{workspace_id}/overview")
async def overview(
    workspace_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await workspace_access(session, user, workspace_id)
    counts = {}
    for name, model in (
        ("projects", Project),
        ("documents", Document),
        ("applications", Application),
        ("tasks", TaskItem),
    ):
        counts[name] = await session.scalar(
            select(func.count()).select_from(model).where(model.workspace_id == workspace_id)
        )
    counts["open_tasks"] = await session.scalar(
        select(func.count(TaskItem.id)).where(
            TaskItem.workspace_id == workspace_id, TaskItem.status != "done"
        )
    )
    for state in ("draft", "review_requested", "approved"):
        counts["application_" + state] = await session.scalar(
            select(func.count(Application.id)).where(
                Application.workspace_id == workspace_id, Application.state == state
            )
        )
    counts["review_pending"] = counts["application_review_requested"]
    events = (
        await session.execute(
            select(AuditEvent, User.name)
            .outerjoin(User, User.id == AuditEvent.actor_id)
            .where(AuditEvent.workspace_id == workspace_id)
            .order_by(AuditEvent.created_at.desc(), AuditEvent.id)
            .limit(20)
        )
    ).all()
    activity = [
        {
            **{
                key: getattr(event, key)
                for key in ("id", "event_type", "actor_id", "project_id", "detail", "created_at")
            },
            "actor_name": actor_name,
        }
        for event, actor_name in events
    ]
    upcoming = await workspace_calendar_events(
        session, workspace_id, from_at=utcnow(), to_at=utcnow() + timedelta(days=90)
    )
    projects = (
        await session.execute(
            select(Project.id)
            .where(
                Project.workspace_id == workspace_id,
                Project.confirmed_revision.is_distinct_from(Project.revision),
            )
            .order_by(Project.updated_at.desc())
            .limit(5)
        )
    ).scalars()
    next_actions = [
        {
            "kind": "confirm_profile",
            "label": "Confirm the current project profile",
            "project_id": id,
        }
        for id in projects
    ]
    pending = (
        await session.execute(
            select(Application.id, Application.project_id)
            .where(
                Application.workspace_id == workspace_id, Application.state == "review_requested"
            )
            .order_by(Application.created_at.desc())
            .limit(5)
        )
    ).all()
    next_actions.extend(
        {
            "kind": "review_application",
            "label": "Review the saved application",
            "project_id": project_id,
            "application_id": id,
        }
        for id, project_id in pending
    )
    drafts = (
        await session.execute(
            select(Application.id, Application.project_id)
            .where(Application.workspace_id == workspace_id, Application.state == "draft")
            .order_by(Application.created_at.desc())
            .limit(5)
        )
    ).all()
    next_actions.extend(
        {
            "kind": "check_application",
            "label": "Check the saved application",
            "project_id": project_id,
            "application_id": id,
        }
        for id, project_id in drafts
    )
    return {
        "counts": counts,
        "recent_activity": activity,
        "upcoming": [
            {
                "id": event["id"],
                "kind": event["kind"],
                "title": event["title"],
                "at": event["start_at"],
                **{
                    key: event[key]
                    for key in ("project_id", "call_id", "application_id", "task_id")
                    if key in event
                },
            }
            for event in upcoming[:10]
        ],
        "next_actions": next_actions,
    }


async def operation_rows(
    session: AsyncSession, workspace_id: str, project_id: str | None, limit: int, offset: int
):
    query = select(UsageEvent).where(UsageEvent.workspace_id == workspace_id)
    if project_id:
        query = query.where(UsageEvent.project_id == project_id)
    rows = (
        await session.execute(
            query.order_by(UsageEvent.created_at.desc(), UsageEvent.id).limit(limit).offset(offset)
        )
    ).scalars()
    return [
        {
            key: getattr(row, key)
            for key in (
                "id",
                "workspace_id",
                "project_id",
                "actor_id",
                "category",
                "operation",
                "status",
                "profile_revision",
                "ai_policy",
                "model",
                "error_code",
                "created_at",
                "expires_at",
                "completed_at",
                "result",
            )
        }
        for row in rows
    ]


@router.get("/workspaces/{workspace_id}/operations")
async def workspace_operations(
    workspace_id: str,
    project_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await workspace_access(session, user, workspace_id)
    await scoped_project(session, workspace_id, project_id)
    return await operation_rows(session, workspace_id, project_id, limit, offset)


@router.get("/projects/{project_id}/operations")
async def project_operations(
    project_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    project = await project_access(session, user, project_id)
    return await operation_rows(session, project.workspace_id, project_id, limit, offset)


@router.get("/workspaces/{workspace_id}/ai-configuration")
async def workspace_ai_configuration(
    workspace_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await workspace_access(session, user, workspace_id)
    return ai_configuration()


@router.get("/ready")
async def ready():
    health = await health_payload()
    # Public dependency status contains no worker detail, endpoints, model identifiers or credentials.
    return JSONResponse(
        status_code=200 if health["ready"] else 503,
        content={
            "ready": health["ready"],
            "degraded": health["degraded"],
            "services": health["services"],
        },
    )


@router.get("/admin/workspaces")
async def admin_workspaces(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    members = (
        select(func.count(Membership.user_id))
        .where(Membership.workspace_id == Workspace.id)
        .correlate(Workspace)
        .scalar_subquery()
    )
    projects = (
        select(func.count(Project.id))
        .where(Project.workspace_id == Workspace.id)
        .correlate(Workspace)
        .scalar_subquery()
    )
    rows = (
        await session.execute(
            select(
                Workspace.id,
                Workspace.name,
                Workspace.kind,
                Workspace.country,
                Workspace.plan,
                Workspace.ai_policy,
                Workspace.created_at,
                members.label("member_count"),
                projects.label("project_count"),
            )
            .order_by(Workspace.created_at.desc(), Workspace.id)
            .limit(limit)
            .offset(offset)
        )
    ).mappings()
    return [dict(row) for row in rows]


@router.get("/admin/operations")
async def admin_operations(
    user: User = Depends(require_admin), session: AsyncSession = Depends(get_session)
):
    counts = {}
    for name, model in (
        ("users", User),
        ("workspaces", Workspace),
        ("projects", Project),
        ("documents", Document),
        ("applications", Application),
        ("tasks", TaskItem),
    ):
        counts[name] = await session.scalar(select(func.count()).select_from(model))
    operations = (
        await session.execute(select(UsageEvent.status, func.count()).group_by(UsageEvent.status))
    ).all()
    mail = (
        await session.execute(
            select(MailDelivery.status, func.count()).group_by(MailDelivery.status)
        )
    ).all()
    return {
        "counts": counts,
        "operations": [{"status": status, "count": count} for status, count in operations],
        "mail": [{"status": status, "count": count} for status, count in mail],
        "health": await health_payload(),
    }
