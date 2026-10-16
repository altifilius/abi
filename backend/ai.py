"""Authenticated authoring, policy isolation and atomic successful-use accounting."""

import asyncio
import json
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func, select, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from .db import AsyncSessionLocal, Base, get_session
from .services.chat import build_chat_messages, run_idea_chat
from .services.llm import AIError, AIProviderError, call_llm, get_ai_config
from .services.reports import analyze_idea_with_report
from .settings import settings
from .workspaces import (
    ConversationMessage,
    Membership,
    Project,
    User,
    Workspace,
    new_id,
    project_access,
    record_event,
    require_pro,
    require_user,
    snapshot_project,
    utcnow,
    validate_profile,
    workspace_access,
)

router = APIRouter(prefix="/api", tags=["AI authoring"])
LIMITS = {"free": {"chat": 100, "write": 10}, "pro": {"chat": 500, "write": 50}}


class UsageEvent(Base):
    __tablename__ = "usage_events"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    workspace_id: Mapped[str | None] = mapped_column(
        ForeignKey("workspaces.id", ondelete="SET NULL"), index=True
    )
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), index=True
    )
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    month: Mapped[str] = mapped_column(String(7), index=True, nullable=False)
    plan: Mapped[str] = mapped_column(String(10), nullable=False)
    category: Mapped[str] = mapped_column(String(10), nullable=False)
    operation: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="reserved")
    profile_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    ai_policy: Mapped[str] = mapped_column(String(10), nullable=False)
    model: Mapped[str] = mapped_column(String(200), nullable=False)
    result: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    error_code: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class UsageCredit(Base):
    __tablename__ = "usage_credits"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    workspace_id: Mapped[str | None] = mapped_column(
        ForeignKey("workspaces.id", ondelete="SET NULL"), index=True
    )
    actor_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    granted_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    plan: Mapped[str] = mapped_column(String(10), nullable=False)
    month: Mapped[str] = mapped_column(String(7), index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(10), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )


class AIRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    language: Literal["tr", "en"] = "tr"


class ChatRequest(AIRequest):
    text: str = Field(min_length=1, max_length=12_000)


class WriteRequest(AIRequest):
    instruction: str = Field(default="", max_length=4000)


class ReportRequest(AIRequest):
    report_id: str | None = Field(default=None, min_length=1, max_length=200)


class CreditRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    category: Literal["chat", "write"]
    amount: int = Field(gt=0, le=100_000, strict=True)
    reason: str = Field(min_length=1, max_length=500)
    month: str | None = Field(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


def month_key(now: datetime | None = None) -> str:
    return (now or utcnow()).astimezone(UTC).strftime("%Y-%m")


def ai_http_error(error: AIError) -> HTTPException:
    return HTTPException(error.status_code, {"code": error.code, "message": str(error)})


async def lock_workspace(session: AsyncSession, workspace_id: str) -> Workspace:
    workspace = (
        await session.execute(
            select(Workspace)
            .where(Workspace.id == workspace_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if workspace is None:
        raise HTTPException(404, "Workspace not found")
    return workspace


async def lock_usage_scope(session: AsyncSession, user_id: str, workspace_id: str) -> Workspace:
    # A Free user's allowance spans all Free workspaces. Lock order is always user -> workspace.
    await session.execute(select(User.id).where(User.id == user_id).with_for_update())
    return await lock_workspace(session, workspace_id)


async def expire_reservations(session: AsyncSession, workspace_id: str, user_id: str) -> None:
    await session.execute(
        update(UsageEvent)
        .where(
            (
                (UsageEvent.workspace_id == workspace_id)
                | ((UsageEvent.actor_id == user_id) & (UsageEvent.plan == "free"))
            ),
            UsageEvent.status == "reserved",
            UsageEvent.expires_at <= utcnow(),
        )
        .values(status="failed", error_code="reservation_expired", completed_at=utcnow())
    )


async def usage_payload(
    session: AsyncSession, workspace: Workspace, user_id: str
) -> dict[str, Any]:
    month = month_key()
    event_scope = (
        UsageEvent.actor_id == user_id
        if workspace.plan == "free"
        else UsageEvent.workspace_id == workspace.id
    )
    credit_scope = (
        UsageCredit.actor_id == user_id
        if workspace.plan == "free"
        else UsageCredit.workspace_id == workspace.id
    )
    counts = (
        await session.execute(
            select(UsageEvent.category, UsageEvent.status, func.count())
            .where(
                event_scope,
                UsageEvent.plan == workspace.plan,
                UsageEvent.month == month,
                UsageEvent.status.in_(["reserved", "succeeded"]),
            )
            .group_by(UsageEvent.category, UsageEvent.status)
        )
    ).all()
    credits = dict(
        (
            await session.execute(
                select(UsageCredit.category, func.sum(UsageCredit.amount))
                .where(
                    credit_scope,
                    UsageCredit.plan == workspace.plan,
                    UsageCredit.month == month,
                )
                .group_by(UsageCredit.category)
            )
        ).all()
    )
    result: dict[str, Any] = {
        "month": month,
        "plan": workspace.plan,
        "scope": "user" if workspace.plan == "free" else "workspace",
    }
    for category, base_limit in LIMITS[workspace.plan].items():
        extra_credits = credits.get(category, 0)
        limit = base_limit + extra_credits
        used = next(
            (count for kind, status, count in counts if kind == category and status == "succeeded"),
            0,
        )
        reserved = next(
            (count for kind, status, count in counts if kind == category and status == "reserved"),
            0,
        )
        result[category] = {
            "base_limit": base_limit,
            "extra_credits": extra_credits,
            "limit": limit,
            "used": used,
            "reserved": reserved,
            "remaining": max(0, limit - used - reserved),
        }
    return result


def message_payload(message: ConversationMessage) -> dict[str, Any]:
    return {
        "id": message.id,
        "project_id": message.project_id,
        "role": message.role,
        "text": message.text,
        "created_at": message.created_at,
    }


def project_payload(project: Project) -> dict[str, Any]:
    return {
        "id": project.id,
        "workspace_id": project.workspace_id,
        "title": project.title,
        "description": project.description,
        "profile": project.profile,
        "revision": project.revision,
        "confirmed_revision": project.confirmed_revision,
        "stage": project.stage,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
    }


async def recent_history(session: AsyncSession, project_id: str) -> list[dict[str, Any]]:
    # Full history remains persisted; only model context is bounded, never supplied by the client.
    messages = list(
        (
            await session.execute(
                select(ConversationMessage)
                .where(ConversationMessage.project_id == project_id)
                .order_by(ConversationMessage.created_at.desc(), ConversationMessage.id.desc())
                .limit(200)
            )
        )
        .scalars()
        .all()
    )
    return [{"role": message.role, "text": message.text} for message in reversed(messages)]


async def reserve_usage(
    session: AsyncSession,
    user: User,
    workspace_id: str,
    project_id: str,
    profile_revision: int,
    operation: str = "application_write",
    category: str = "write",
    purpose: str = "idea",
) -> UsageEvent:
    workspace = await lock_usage_scope(session, user.id, workspace_id)
    await workspace_access(session, user, workspace.id, "editor")
    project = await project_access(session, user, project_id, "editor")
    if project.workspace_id != workspace_id:
        raise HTTPException(404, "Project not found in this workspace")
    if operation in {"analyze_report", "application_write", "document_analyze"}:
        require_pro(workspace)
    if operation == "analyze_report":
        get_ai_config(workspace.ai_policy, "embedding")
    config = get_ai_config(workspace.ai_policy, purpose)
    await expire_reservations(session, workspace.id, user.id)
    usage = await usage_payload(session, workspace, user.id)
    if usage[category]["remaining"] == 0:
        raise HTTPException(
            429,
            {
                "code": "quota_exceeded",
                "message": "The successful-use allowance is exhausted for the UTC month. Manual edits and exports remain available.",
                "usage": usage,
            },
        )
    duration = getattr(settings, "ai_request_timeout_seconds", 180) * 12 + 60
    event = UsageEvent(
        id=new_id(),
        workspace_id=workspace.id,
        project_id=project_id,
        actor_id=user.id,
        month=month_key(),
        plan=workspace.plan,
        category=category,
        operation=operation,
        profile_revision=profile_revision,
        ai_policy=workspace.ai_policy,
        model=config.model,
        expires_at=utcnow() + timedelta(seconds=duration),
    )
    session.add(event)
    await session.flush()
    return event


async def reserve_operation(
    session: AsyncSession, user: User, project_id: str, operation: str, text: str | None = None
) -> tuple[UsageEvent, dict[str, Any], list[dict[str, Any]], ConversationMessage | None]:
    accessible = await project_access(session, user, project_id, "editor")
    event = await reserve_usage(
        session,
        user,
        accessible.workspace_id,
        project_id,
        accessible.revision,
        operation=operation,
        category="chat" if operation == "chat" else "write",
        purpose="chat" if operation == "analyze_report" else "idea",
    )
    project = (
        await session.execute(
            select(Project)
            .where(Project.id == project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    event.profile_revision = project.revision
    user_message = None
    if text is not None:
        user_message = ConversationMessage(
            id=new_id(), project_id=project.id, role="user", text=text
        )
        session.add(user_message)
    await session.flush()
    history = await recent_history(session, project.id)
    data = {
        "id": project.id,
        "title": project.title,
        "description": project.description,
        "profile": project.profile,
        "revision": project.revision,
    }
    await session.commit()
    return event, data, history, user_message


async def refund_operation(event_id: str, workspace_id: str | None, code: str) -> None:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            event = await session.get(UsageEvent, event_id)
            if event is None:
                return
            if event.actor_id:
                await session.execute(
                    select(User.id).where(User.id == event.actor_id).with_for_update()
                )
            if event.workspace_id:
                await lock_workspace(session, event.workspace_id)
            await session.execute(
                update(UsageEvent)
                .where(UsageEvent.id == event_id, UsageEvent.status == "reserved")
                .values(
                    status="failed",
                    error_code=code,
                    completed_at=utcnow(),
                    result={},
                )
            )


async def complete_usage(
    session: AsyncSession, user: User, event_id: str, result: dict[str, Any] | None = None
) -> dict[str, Any]:
    initial = await session.get(UsageEvent, event_id)
    if initial is None or initial.actor_id != user.id or initial.workspace_id is None:
        raise HTTPException(404, "Usage reservation not found")
    workspace = await lock_usage_scope(session, user.id, initial.workspace_id)
    await workspace_access(session, user, workspace.id, "editor")
    event = (
        await session.execute(
            select(UsageEvent)
            .where(UsageEvent.id == event_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    if event.status != "reserved" or event.expires_at <= utcnow():
        raise HTTPException(
            503,
            {
                "code": "reservation_expired",
                "message": "The AI operation expired without consuming an allowance.",
            },
        )
    if workspace.ai_policy != event.ai_policy or workspace.plan != event.plan:
        raise HTTPException(
            409,
            {
                "code": "ai_policy_changed",
                "message": "Workspace AI policy or plan changed; the response was discarded without charge.",
            },
        )
    event.status = "succeeded"
    event.completed_at = utcnow()
    event.result = result or {}
    record_event(
        session,
        workspace.id,
        user.id,
        f"ai.{event.operation}.completed",
        project_id=event.project_id,
        detail={
            "usage_event_id": event.id,
            "profile_revision": event.profile_revision,
            "ai_policy": event.ai_policy,
        },
    )
    await session.flush()
    return await usage_payload(session, workspace, user.id)


async def finalize_operation(
    session: AsyncSession, user: User, event: UsageEvent, result: dict[str, Any]
) -> dict[str, Any]:
    result["usage"] = await complete_usage(
        session,
        user,
        event.id,
        {
            key: value
            for key, value in result.items()
            if key not in {"message", "project", "user_message"}
        },
    )
    current_event = await session.get(UsageEvent, event.id)
    project = (
        await session.execute(
            select(Project)
            .where(Project.id == event.project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if project is None or project.revision != current_event.profile_revision:
        raise HTTPException(
            409,
            {
                "code": "stale_project",
                "message": "The project changed while AI was responding; this response was not applied or charged.",
            },
        )
    if current_event.operation == "chat":
        message = ConversationMessage(
            id=new_id(), project_id=project.id, role="assistant", text=result["reply"]
        )
        session.add(message)
        await session.flush()
        result["message"] = message_payload(message)
    elif current_event.operation == "write":
        snapshot_project(session, project, user.id)
        project.description = result["description"]
        project.revision += 1
        project.confirmed_revision = None
        project.updated_at = utcnow()
        result["project"] = project_payload(project)
    result["profile_revision"] = project.revision
    await session.commit()
    return result


def nullable(kind: str, **constraints: Any) -> dict[str, Any]:
    return {"type": [kind, "null"], **constraints}


def strict_object(properties: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


PROFILE_SCHEMA = {
    "name": "project_profile_proposal",
    "schema": strict_object(
        {
            "profile": strict_object(
                {
                    "company": strict_object(
                        {
                            "name": nullable("string"),
                            "country": nullable("string", pattern="^[A-Z]{2}$"),
                            "legal_form": nullable("string"),
                            "is_sme": nullable("boolean"),
                            "employee_count": nullable("integer", minimum=0),
                            "annual_turnover": nullable("string"),
                            "prior_supported_projects": nullable("integer", minimum=0),
                            "registration_date": nullable("string"),
                            "is_incorporated": nullable("boolean"),
                        }
                    ),
                    "project": strict_object(
                        {
                            "sector": nullable("string"),
                            "stage": {
                                "type": ["string", "null"],
                                "enum": ["idea", "mvp", "scale", None],
                            },
                            "trl": nullable("integer", minimum=1, maximum=9),
                            "problem": nullable("string"),
                            "solution": nullable("string"),
                            "innovation": nullable("string"),
                            "methodology": nullable("string"),
                            "objectives": nullable("string"),
                            "outcomes": nullable("string"),
                            "start_date": nullable("string"),
                            "duration_months": nullable("integer", minimum=1),
                        }
                    ),
                    "team": strict_object(
                        {
                            "description": nullable("string"),
                            "has_qualified_employee": nullable("boolean"),
                        }
                    ),
                    "budget": strict_object(
                        {
                            "currency": {
                                "type": ["string", "null"],
                                "enum": [
                                    "TRY",
                                    "EUR",
                                    "GBP",
                                    "USD",
                                    "CAD",
                                    "CHF",
                                    "NOK",
                                    "ISK",
                                    None,
                                ],
                            },
                            "items": {
                                "type": "array",
                                "items": strict_object(
                                    {
                                        "id": {"type": "string"},
                                        "category": {
                                            "type": "string",
                                            "enum": [
                                                "personnel",
                                                "equipment",
                                                "services",
                                                "travel",
                                                "materials",
                                                "other",
                                            ],
                                        },
                                        "description": {"type": "string"},
                                        "amount": {
                                            "type": "string",
                                            "pattern": "^[0-9]+(\\.[0-9]+)?$",
                                        },
                                    }
                                ),
                            },
                        }
                    ),
                }
            ),
        }
    ),
}


def prune_unknown(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: prune_unknown(item) for key, item in value.items() if item is not None}
    return value


async def extract_profile(
    data: dict[str, Any], history: list[dict[str, Any]], policy: str, language: str
) -> dict[str, Any]:
    messages = build_chat_messages(
        history,
        "Extract only known project facts into the required profile schema. Unknown facts must be null; do not assume legal eligibility, dates, employee qualifications, incorporation or SME status. "
        "Preserve explicit existing facts. Numeric money is a decimal string with no invented currency or exchange rate. "
        f"Use {'Turkish' if language == 'tr' else 'English'} for prose values. Return a user-confirmed proposal only.",
        json.dumps(data, ensure_ascii=False),
    )
    response = await call_llm(
        messages,
        policy=policy,
        purpose="idea",
        response_format="json_schema",
        json_schema=PROFILE_SCHEMA,
    )
    proposed = prune_unknown(response["profile"])
    proposed["extra"] = data["profile"].get("extra", {})
    try:
        proposed = validate_profile(proposed)
    except HTTPException:
        raise AIProviderError("The AI provider returned invalid project facts.") from None
    if not any(
        proposed.get(section) for section in ("company", "project", "team")
    ) and not proposed.get("budget", {}).get("items"):
        raise AIProviderError("The AI provider returned no extractable project facts.")
    return {"profile": proposed, "requires_confirmation": True}


async def perform_operation(
    session: AsyncSession, user: User, project_id: str, operation: str, payload: AIRequest
) -> dict[str, Any]:
    event_id = None
    workspace_id = None
    try:
        event, data, history, user_message = await reserve_operation(
            session, user, project_id, operation, getattr(payload, "text", None)
        )
        event_id, workspace_id = event.id, event.workspace_id
        async with asyncio.timeout(getattr(settings, "ai_request_timeout_seconds", 180) * 12):
            if operation in {"chat", "write"}:
                reply = await run_idea_chat(
                    history,
                    policy=event.ai_policy,
                    mode=operation,
                    language=payload.language,
                    project_context=json.dumps(data, ensure_ascii=False),
                    instruction=getattr(payload, "instruction", ""),
                )
                result = {"reply" if operation == "chat" else "description": reply}
                if user_message:
                    result["user_message"] = message_payload(user_message)
            elif operation == "extract_profile":
                result = await extract_profile(data, history, event.ai_policy, payload.language)
            else:
                result = await analyze_idea_with_report(
                    session,
                    data,
                    policy=event.ai_policy,
                    language=payload.language,
                    report_id=payload.report_id,
                )
            return await finalize_operation(session, user, event, result)
    except BaseException as error:
        await session.rollback()
        if event_id is not None:
            code = (
                error.code
                if isinstance(error, AIError)
                else (
                    error.detail.get("code", "request_failed")
                    if isinstance(error, HTTPException) and isinstance(error.detail, dict)
                    else "request_failed"
                )
            )
            await asyncio.shield(refund_operation(event_id, workspace_id, code))
        if isinstance(error, AIError):
            raise ai_http_error(error) from None
        if isinstance(error, TimeoutError):
            raise HTTPException(
                502,
                {
                    "code": "provider_error",
                    "message": "The configured AI provider timed out; no allowance was consumed.",
                },
            ) from None
        raise


@router.get("/workspaces/{workspace_id}/usage")
async def workspace_usage(
    workspace_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await workspace_access(session, user, workspace_id)
    workspace = await lock_usage_scope(session, user.id, workspace_id)
    await expire_reservations(session, workspace.id, user.id)
    result = await usage_payload(session, workspace, user.id)
    await session.commit()
    return result


@router.get("/projects/{project_id}/messages")
async def project_messages(
    project_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await project_access(session, user, project_id)
    messages = list(
        (
            await session.execute(
                select(ConversationMessage)
                .where(ConversationMessage.project_id == project_id)
                .order_by(ConversationMessage.created_at, ConversationMessage.id)
            )
        )
        .scalars()
        .all()
    )
    return {"messages": [message_payload(message) for message in messages]}


@router.post("/projects/{project_id}/chat")
async def project_chat(
    project_id: str,
    payload: ChatRequest,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    return await perform_operation(session, user, project_id, "chat", payload)


@router.post("/projects/{project_id}/write")
async def project_write(
    project_id: str,
    payload: WriteRequest,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    return await perform_operation(session, user, project_id, "write", payload)


@router.post("/projects/{project_id}/extract-profile")
async def project_extract_profile(
    project_id: str,
    payload: AIRequest,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    return await perform_operation(session, user, project_id, "extract_profile", payload)


@router.post("/projects/{project_id}/analyze-report")
async def project_report_analysis(
    project_id: str,
    payload: ReportRequest,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    return await perform_operation(session, user, project_id, "analyze_report", payload)


def credit_payload(credit: UsageCredit) -> dict[str, Any]:
    return {
        "id": credit.id,
        "workspace_id": credit.workspace_id,
        "actor_id": credit.actor_id,
        "granted_by": credit.granted_by,
        "plan": credit.plan,
        "month": credit.month,
        "category": credit.category,
        "amount": credit.amount,
        "reason": credit.reason,
        "created_at": credit.created_at,
    }


async def credit_owner(session: AsyncSession, workspace: Workspace) -> str | None:
    if workspace.plan == "pro":
        return None
    owners = list(
        (
            await session.execute(
                select(Membership.user_id).where(
                    Membership.workspace_id == workspace.id, Membership.role == "owner"
                )
            )
        )
        .scalars()
        .all()
    )
    if len(owners) != 1:
        raise HTTPException(
            409, "A Free workspace requires exactly one owner for user-scoped credits"
        )
    return owners[0]


@router.get("/admin/workspaces/{workspace_id}/credits")
async def admin_credit_ledger(
    workspace_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    if not user.is_admin:
        raise HTTPException(403, "Administrator access required")
    workspace = await session.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(404, "Workspace not found")
    owner_id = await credit_owner(session, workspace)
    scope = (
        UsageCredit.actor_id == owner_id
        if workspace.plan == "free"
        else UsageCredit.workspace_id == workspace.id
    )
    credits = list(
        (
            await session.execute(
                select(UsageCredit)
                .where(scope, UsageCredit.plan == workspace.plan)
                .order_by(UsageCredit.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return {
        "credits": [credit_payload(credit) for credit in credits],
        "billing_status": "not_configured",
        "scope": "user" if workspace.plan == "free" else "workspace",
    }


@router.post("/admin/workspaces/{workspace_id}/credits")
async def admin_grant_credits(
    workspace_id: str,
    payload: CreditRequest,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    if not user.is_admin:
        raise HTTPException(403, "Administrator access required")
    initial = await session.get(Workspace, workspace_id)
    if initial is None:
        raise HTTPException(404, "Workspace not found")
    owner_id = await credit_owner(session, initial)
    workspace = await lock_usage_scope(session, owner_id or user.id, workspace_id)
    if await credit_owner(session, workspace) != owner_id:
        raise HTTPException(409, "Workspace ownership changed; retry the manual grant")
    credit = UsageCredit(
        id=new_id(),
        workspace_id=workspace.id,
        actor_id=owner_id,
        granted_by=user.id,
        plan=workspace.plan,
        month=payload.month or month_key(),
        category=payload.category,
        amount=payload.amount,
        reason=payload.reason,
    )
    session.add(credit)
    record_event(
        session,
        workspace.id,
        user.id,
        "usage.credit.manual_grant",
        detail={
            "category": payload.category,
            "amount": payload.amount,
            "month": credit.month,
            "credit_id": credit.id,
            "billing_status": "not_configured",
        },
    )
    await session.flush()
    result = {
        "credit": credit_payload(credit),
        "billing_status": "not_configured",
        "scope": "user" if workspace.plan == "free" else "workspace",
    }
    await session.commit()
    return result
