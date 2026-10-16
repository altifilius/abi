"""Authenticated workspace ownership shared by all product services."""

import asyncio
import hashlib
import json
import re
import secrets
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.encoders import jsonable_encoder
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    StrictStr,
    ValidationError,
    field_validator,
)
from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    case,
    delete,
    func,
    or_,
    select,
    update,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base, get_session
from .settings import settings


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class Workspace(Base):
    __tablename__ = "workspaces"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="personal")
    country: Mapped[str] = mapped_column(String(2), nullable=False, default="TR")
    profile: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    plan: Mapped[str] = mapped_column(String(10), nullable=False, default="free")
    ai_policy: Mapped[str] = mapped_column(String(10), nullable=False, default="local")
    incorporation: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=lambda: {"legal_form": "LTD", "checklist": {}}
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class Membership(Base):
    __tablename__ = "memberships"
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="viewer")


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    profile: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    confirmed_revision: Mapped[int | None] = mapped_column(Integer)
    stage: Mapped[str] = mapped_column(String(20), default="idea", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True, nullable=False
    )
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"))
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    detail: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class SessionToken(Base):
    __tablename__ = "session_tokens"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    csrf_token: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


ROLES = {"viewer": 0, "editor": 1, "reviewer": 2, "admin": 3, "owner": 4}


async def require_user(request: Request, session: AsyncSession = Depends(get_session)) -> User:
    token = request.cookies.get("abi_session", "")
    if not token or len(token) > 200:
        raise HTTPException(401, "Authentication required")
    digest = hashlib.sha256(token.encode()).hexdigest()
    auth_session = (
        await session.execute(
            select(SessionToken).where(
                SessionToken.token_hash == digest, SessionToken.expires_at > utcnow()
            )
        )
    ).scalar_one_or_none()
    if auth_session is None:
        raise HTTPException(401, "Session expired; sign in again")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        if origin and origin not in allowed_origins(request):
            raise HTTPException(403, "Invalid request origin")
        supplied_csrf = request.headers.get("x-csrf-token", "")
        if not secrets.compare_digest(supplied_csrf.encode(), auth_session.csrf_token.encode()):
            raise HTTPException(403, "Invalid CSRF token")
    user = await session.get(User, auth_session.user_id)
    if user is None:
        raise HTTPException(401, "Authentication required")
    request.state.auth_session = auth_session
    return user


async def workspace_access(
    session: AsyncSession, user: User, workspace_id: str, min_role: str = "viewer"
) -> Workspace:
    membership = (
        await session.execute(
            select(Membership)
            .where(Membership.workspace_id == workspace_id, Membership.user_id == user.id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    workspace = await session.get(Workspace, workspace_id)
    if workspace is None or membership is None:
        raise HTTPException(404, "Workspace not found")
    if ROLES.get(membership.role, -1) < ROLES[min_role]:
        raise HTTPException(403, "Insufficient workspace permission")
    return workspace


async def project_access(
    session: AsyncSession, user: User, project_id: str, min_role: str = "viewer"
) -> Project:
    project = await session.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found")
    await workspace_access(session, user, project.workspace_id, min_role)
    return project


def require_pro(workspace: Workspace) -> None:
    if workspace.plan != "pro":
        raise HTTPException(403, "This operation requires a Pro workspace")


def record_event(
    session: AsyncSession,
    workspace_id: str,
    actor_id: str | None,
    event_type: str,
    project_id: str | None = None,
    detail: dict | None = None,
) -> None:
    session.add(
        AuditEvent(
            workspace_id=workspace_id,
            actor_id=actor_id,
            event_type=event_type,
            project_id=project_id,
            detail=detail or {},
        )
    )


class ProjectRevision(Base):
    __tablename__ = "project_revisions"
    __table_args__ = (UniqueConstraint("project_id", "revision"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class WorkspaceInvitation(Base):
    __tablename__ = "workspace_invitations"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True, nullable=False
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    invited_by: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class EmailVerification(Base):
    __tablename__ = "email_verifications"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AuthThrottle(Base):
    __tablename__ = "auth_throttles"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False)


router = APIRouter(prefix="/api", tags=["workspaces"])
SUPPORTED_COUNTRIES = frozenset(
    "TR AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE GB US CA CH NO IS LI".split()
)
Currency = Literal["TRY", "EUR", "GBP", "USD", "CAD", "CHF", "NOK", "ISK"]
MemberRole = Literal["viewer", "editor", "reviewer", "admin", "owner"]
InvitedRole = Literal["viewer", "editor", "reviewer", "admin"]


def validate_country(value: str) -> str:
    if value not in SUPPORTED_COUNTRIES:
        raise ValueError("Unsupported country; use an eligible ISO alpha-2 country code")
    return value


def decimal_string(value: str) -> str:
    if len(value) > 80 or not re.fullmatch(r"\d+(?:\.\d+)?", value):
        raise ValueError("Expected a nonnegative decimal string without exponent")
    try:
        number = Decimal(value)
    except InvalidOperation as exc:
        raise ValueError("Invalid decimal") from exc
    if not number.is_finite():
        raise ValueError("Invalid decimal")
    return format(number, "f")


def date_string(value: str) -> str:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("Date must use YYYY-MM-DD")
    return date.fromisoformat(value).isoformat()


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProfileFields(BaseModel):
    model_config = ConfigDict(extra="allow")


class CompanyProfile(ProfileFields):
    name: StrictStr | None = None
    country: StrictStr | None = None
    legal_form: StrictStr | None = None
    is_sme: StrictBool | None = None
    employee_count: Annotated[StrictInt, Field(ge=0)] | None = None
    annual_turnover: StrictStr | None = None
    prior_supported_projects: Annotated[StrictInt, Field(ge=0)] | None = None
    registration_date: StrictStr | None = None
    is_incorporated: StrictBool | None = None
    _country = field_validator("country")(
        lambda value: validate_country(value) if value is not None else None
    )
    _turnover = field_validator("annual_turnover")(
        lambda value: decimal_string(value) if value is not None else None
    )
    _date = field_validator("registration_date")(
        lambda value: date_string(value) if value is not None else None
    )


class ProjectProfile(ProfileFields):
    sector: StrictStr | None = None
    stage: Literal["idea", "mvp", "scale"] | None = None
    trl: Annotated[StrictInt, Field(ge=1, le=9)] | None = None
    problem: StrictStr | None = None
    solution: StrictStr | None = None
    innovation: StrictStr | None = None
    methodology: StrictStr | None = None
    objectives: StrictStr | None = None
    outcomes: StrictStr | None = None
    start_date: StrictStr | None = None
    duration_months: Annotated[StrictInt, Field(ge=1)] | None = None
    _date = field_validator("start_date")(
        lambda value: date_string(value) if value is not None else None
    )


class TeamProfile(ProfileFields):
    description: StrictStr | None = None
    has_qualified_employee: StrictBool | None = None


class BudgetItem(ProfileFields):
    id: Annotated[StrictStr, Field(min_length=1, max_length=200)]
    category: Literal["personnel", "equipment", "services", "travel", "materials", "other"]
    description: StrictStr
    amount: StrictStr

    @field_validator("amount")
    @classmethod
    def exact_cents(cls, value: str) -> str:
        normalized = decimal_string(value)
        whole, _, fraction = normalized.partition(".")
        if len(whole) > 15 or any(character != "0" for character in fraction[2:]):
            raise ValueError("Budget amounts require at most 15 integer digits and exact cents")
        return f"{whole}.{fraction[:2].ljust(2, '0')}"


class BudgetProfile(ProfileFields):
    currency: Currency | None = None
    items: list[BudgetItem] = Field(default_factory=list, max_length=1000)

    @field_validator("items")
    @classmethod
    def unique_ids(cls, items: list[BudgetItem]) -> list[BudgetItem]:
        if len({item.id for item in items}) != len(items):
            raise ValueError("Budget item ids must be unique")
        return items


class StructuredProfile(ProfileFields):
    company: CompanyProfile | None = None
    project: ProjectProfile | None = None
    team: TeamProfile | None = None
    budget: BudgetProfile | None = None
    extra: dict = Field(default_factory=dict)


def validate_profile(profile: dict) -> dict:
    """Validate known fields; retain unknown facts exclusively in namespaced extra."""
    try:
        parsed = StructuredProfile.model_validate(profile)
        json.dumps(profile, allow_nan=False)
        result = parsed.model_dump(exclude_unset=True)
        extra = dict(parsed.extra)
        unknown = dict(parsed.model_extra or {})
        if unknown:
            extra.setdefault("unknown_fields", {})
            if not isinstance(extra["unknown_fields"], dict):
                raise ValueError("extra.unknown_fields must be an object")
            extra["unknown_fields"] = {**extra["unknown_fields"], **unknown}
            for key in unknown:
                result.pop(key, None)
        for section in ("company", "project", "team", "budget"):
            model = getattr(parsed, section)
            if model is None:
                continue
            section_extra = dict(model.model_extra or {})
            if section_extra:
                namespace = f"unknown_{section}_fields"
                previous = extra.get(namespace, {})
                if not isinstance(previous, dict):
                    raise ValueError(f"extra.{namespace} must be an object")
                extra[namespace] = {**previous, **section_extra}
                for key in section_extra:
                    result[section].pop(key, None)
            if section == "budget":
                for index, item in enumerate(model.items):
                    if item.model_extra:
                        namespace = "unknown_budget_item_fields"
                        previous = extra.get(namespace, {})
                        if not isinstance(previous, dict):
                            raise ValueError(f"extra.{namespace} must be an object")
                        extra[namespace] = {**previous, item.id: dict(item.model_extra)}
                        for key in item.model_extra:
                            result[section]["items"][index].pop(key, None)
        result["extra"] = extra
        return result
    except (ValidationError, ValueError, TypeError) as exc:
        if isinstance(exc, ValidationError):
            detail = [
                {"loc": list(error["loc"]), "msg": error["msg"], "type": error["type"]}
                for error in exc.errors()
            ]
        else:
            detail = "Profile must contain valid JSON objects and known field types"
        raise HTTPException(422, detail) from exc


def serialize_user(user: User) -> dict:
    return jsonable_encoder(
        {
            key: getattr(user, key)
            for key in ("id", "email", "name", "is_admin", "email_verified_at", "created_at")
        }
    )


def serialize_workspace(workspace: Workspace, role: str | None = None) -> dict:
    data = {column.name: getattr(workspace, column.name) for column in Workspace.__table__.columns}
    if role is not None:
        data["role"] = role
    return jsonable_encoder(data)


def serialize_project(project: Project) -> dict:
    return jsonable_encoder(
        {column.name: getattr(project, column.name) for column in Project.__table__.columns}
    )


def snapshot_project(session: AsyncSession, project: Project, actor_id: str | None) -> None:
    session.add(
        ProjectRevision(
            project_id=project.id,
            revision=project.revision,
            actor_id=actor_id,
            snapshot=serialize_project(project),
        )
    )


def allowed_origins(request: Request) -> set[str]:
    return set(settings.cors_origin_list) or {settings.public_app_url.rstrip("/")}


def check_auth_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if origin and origin not in allowed_origins(request):
        raise HTTPException(403, "Invalid request origin")


def normalize_email(email: str) -> str:
    email = email.strip().lower()
    if len(email) > 320 or not re.fullmatch(r"[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+", email):
        raise ValueError("Invalid email address")
    return email


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode(), salt=salt, n=16384, r=8, p=1, dklen=64, maxmem=64 * 1024 * 1024
    )
    return f"scrypt$16384$8$1${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, n, r, p, salt, expected = encoded.split("$")
        if scheme != "scrypt" or (n, r, p) != ("16384", "8", "1"):
            return False
        actual = hashlib.scrypt(
            password.encode(),
            salt=bytes.fromhex(salt),
            n=16384,
            r=8,
            p=1,
            dklen=64,
            maxmem=64 * 1024 * 1024,
        )
        return secrets.compare_digest(actual.hex(), expected)
    except (ValueError, TypeError):
        return False


class LoginInput(StrictInput):
    email: Annotated[StrictStr, Field(max_length=320)]
    password: Annotated[StrictStr, Field(min_length=1, max_length=1024)]
    _email = field_validator("email")(normalize_email)


class RegisterInput(LoginInput):
    password: Annotated[StrictStr, Field(min_length=12, max_length=1024)]
    name: Annotated[StrictStr, Field(min_length=1, max_length=200)]


class TokenInput(StrictInput):
    token: Annotated[StrictStr, Field(min_length=20, max_length=200)]


async def throttle_auth(session: AsyncSession, request: Request, action: str, email: str) -> None:
    """Atomic persisted counters; commit independently even for failed credentials."""
    now = utcnow()
    window = datetime.fromtimestamp(int(now.timestamp()) // 900 * 900, UTC)
    ip = request.client.host if request.client else "unknown"
    limits = [
        (f"{action}:ip:{ip}", 60 if action == "login" else 20),
        (f"{action}:email:{email}", 10 if action == "login" else 5),
    ]
    exceeded = False
    for raw_key, limit in limits:
        key = hashlib.sha256(raw_key.encode()).hexdigest()
        statement = pg_insert(AuthThrottle).values(key=key, window_start=window, attempts=1)
        statement = statement.on_conflict_do_update(
            index_elements=[AuthThrottle.key],
            set_={
                "window_start": window,
                "attempts": case(
                    (AuthThrottle.window_start == window, AuthThrottle.attempts + 1), else_=1
                ),
            },
        ).returning(AuthThrottle.attempts)
        count = (await session.execute(statement)).scalar_one()
        exceeded = exceeded or count > limit
    await session.commit()
    if exceeded:
        raise HTTPException(
            429, "Too many authentication attempts; try later", headers={"Retry-After": "900"}
        )


async def user_workspaces(session: AsyncSession, user: User) -> list[dict]:
    rows = (
        await session.execute(
            select(Workspace, Membership.role)
            .join(Membership, Membership.workspace_id == Workspace.id)
            .where(Membership.user_id == user.id)
            .order_by(Workspace.created_at, Workspace.id)
        )
    ).all()
    return [serialize_workspace(workspace, role) for workspace, role in rows]


async def create_auth_session(
    session: AsyncSession, user: User, response: Response
) -> SessionToken:
    token = secrets.token_urlsafe(32)
    lifetime = settings.session_lifetime_hours * 3600
    auth = SessionToken(
        user_id=user.id,
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        csrf_token=secrets.token_urlsafe(32),
        expires_at=utcnow() + timedelta(seconds=lifetime),
    )
    session.add(auth)
    response.set_cookie(
        "abi_session",
        token,
        max_age=lifetime,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )
    return auth


@router.post("/auth/register", status_code=201)
async def register(
    body: RegisterInput,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    check_auth_origin(request)
    await throttle_auth(session, request, "register", body.email)
    password_hash = await asyncio.to_thread(hash_password, body.password)
    user = User(
        id=new_id(), email=body.email, name=body.name, password_hash=password_hash, is_admin=False
    )
    workspace = Workspace(
        id=new_id(),
        name=body.name,
        kind="personal",
        country="TR",
        plan="free",
        ai_policy="local" if settings.local_ai_base_url else "external",
    )
    session.add_all([user, workspace])
    try:
        await session.flush()
        session.add(Membership(workspace_id=workspace.id, user_id=user.id, role="owner"))
        auth = await create_auth_session(session, user, response)
        record_event(
            session, workspace.id, user.id, "workspace.created", detail={"kind": "personal"}
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        response.delete_cookie("abi_session", path="/")
        raise HTTPException(400, "Unable to create account with supplied credentials") from exc
    return {
        "user": serialize_user(user),
        "csrf_token": auth.csrf_token,
        "workspaces": await user_workspaces(session, user),
    }


@router.post("/auth/login")
async def login(
    body: LoginInput,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    check_auth_origin(request)
    await throttle_auth(session, request, "login", body.email)
    user = (
        await session.execute(
            select(User)
            .where(User.email == body.email)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if user is None:
        await asyncio.to_thread(hash_password, body.password)
        raise HTTPException(401, "Invalid email or password")
    if not await asyncio.to_thread(verify_password, body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    auth = await create_auth_session(session, user, response)
    await session.commit()
    return {
        "user": serialize_user(user),
        "csrf_token": auth.csrf_token,
        "workspaces": await user_workspaces(session, user),
    }


@router.get("/auth/session")
async def auth_session(
    request: Request,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    return {
        "user": serialize_user(user),
        "csrf_token": request.state.auth_session.csrf_token,
        "workspaces": await user_workspaces(session, user),
    }


@router.post("/auth/logout", status_code=204)
async def logout(
    request: Request,
    response: Response,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await session.delete(request.state.auth_session)
    await session.commit()
    response.delete_cookie(
        "abi_session",
        path="/",
        secure=settings.session_cookie_secure,
        httponly=True,
        samesite="lax",
    )


@router.post("/auth/request-verification")
async def request_verification(
    request: Request,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    from .notifications import ensure_mail_configured, queue_email

    if user.email_verified_at is not None:
        return {"status": "already_verified"}
    await throttle_auth(session, request, "verify", user.email)
    ensure_mail_configured()
    token = secrets.token_urlsafe(32)
    verification = EmailVerification(
        id=new_id(),
        user_id=user.id,
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        expires_at=utcnow() + timedelta(hours=24),
    )
    await session.execute(delete(EmailVerification).where(EmailVerification.user_id == user.id))
    session.add(verification)
    link = f"{settings.public_app_url.rstrip('/')}/?verify_email_token={token}"
    await queue_email(
        session,
        user.id,
        "Abi: verify your email",
        f"Verify your email within 24 hours: {link}\nIf you did not request this, ignore this email.",
        dedupe_key=f"verify:{verification.id}",
        kind="transactional",
    )
    await session.commit()
    return {"status": "queued"}


@router.post("/auth/verify-email")
async def verify_email(
    body: TokenInput,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    verification = (
        await session.execute(
            select(EmailVerification)
            .where(
                EmailVerification.token_hash == hashlib.sha256(body.token.encode()).hexdigest(),
                EmailVerification.user_id == user.id,
                EmailVerification.expires_at > utcnow(),
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if verification is None:
        raise HTTPException(400, "Invalid or expired verification token")
    user.email_verified_at = utcnow()
    await session.execute(delete(EmailVerification).where(EmailVerification.user_id == user.id))
    await session.commit()
    return {"user": serialize_user(user)}


class WorkspaceCreate(StrictInput):
    name: Annotated[StrictStr, Field(min_length=1, max_length=200)]
    kind: Literal["personal", "company"] = "personal"
    country: StrictStr = "TR"
    _country = field_validator("country")(validate_country)


class WorkspacePatch(StrictInput):
    name: Annotated[StrictStr, Field(min_length=1, max_length=200)] | None = None
    country: StrictStr | None = None
    profile: dict | None = None
    ai_policy: Literal["external", "local"] | None = None
    _country = field_validator("country")(
        lambda value: validate_country(value) if value is not None else None
    )


class ProjectCreate(StrictInput):
    title: Annotated[StrictStr, Field(min_length=1, max_length=200)]
    description: Annotated[StrictStr, Field(max_length=100000)] = ""
    profile: dict = Field(default_factory=dict)


class ProjectPatch(StrictInput):
    expected_revision: Annotated[StrictInt, Field(ge=1)]
    title: Annotated[StrictStr, Field(min_length=1, max_length=200)] | None = None
    description: Annotated[StrictStr, Field(max_length=100000)] | None = None
    profile: dict | None = None
    confirm_profile: StrictBool = False


@router.get("/workspaces")
async def list_workspaces(
    user: User = Depends(require_user), session: AsyncSession = Depends(get_session)
):
    return await user_workspaces(session, user)


@router.post("/workspaces", status_code=201)
async def create_workspace(
    body: WorkspaceCreate,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    workspace = Workspace(
        id=new_id(),
        name=body.name,
        kind=body.kind,
        country=body.country,
        ai_policy="local" if settings.local_ai_base_url else "external",
    )
    session.add(workspace)
    await session.flush()
    session.add(Membership(workspace_id=workspace.id, user_id=user.id, role="owner"))
    record_event(session, workspace.id, user.id, "workspace.created", detail={"kind": body.kind})
    await session.commit()
    return serialize_workspace(workspace, "owner")


@router.get("/workspaces/{workspace_id}")
async def get_workspace(
    workspace_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    workspace = await workspace_access(session, user, workspace_id)
    membership = await session.get(Membership, (workspace_id, user.id))
    return serialize_workspace(workspace, membership.role)


@router.patch("/workspaces/{workspace_id}")
async def patch_workspace(
    workspace_id: str,
    body: WorkspacePatch,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    workspace = await locked_workspace(session, user, workspace_id)
    changes = body.model_dump(exclude_unset=True)
    if any(value is None for value in changes.values()):
        raise HTTPException(422, "Workspace values cannot be null")
    if "profile" in changes:
        changes["profile"] = validate_profile(changes["profile"])
    for key, value in changes.items():
        setattr(workspace, key, value)
    if changes:
        record_event(
            session, workspace_id, user.id, "workspace.updated", detail={"fields": sorted(changes)}
        )
    await session.commit()
    membership = await session.get(Membership, (workspace_id, user.id))
    return serialize_workspace(workspace, membership.role)


@router.get("/workspaces/{workspace_id}/projects")
async def list_projects(
    workspace_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await workspace_access(session, user, workspace_id)
    projects = (
        (
            await session.execute(
                select(Project)
                .where(Project.workspace_id == workspace_id)
                .order_by(Project.updated_at.desc(), Project.id)
            )
        )
        .scalars()
        .all()
    )
    return [serialize_project(project) for project in projects]


@router.post("/workspaces/{workspace_id}/projects", status_code=201)
async def create_project(
    workspace_id: str,
    body: ProjectCreate,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await locked_workspace(session, user, workspace_id, "editor")
    profile = validate_profile(body.profile)
    project = Project(
        workspace_id=workspace_id,
        title=body.title,
        description=body.description,
        profile=profile,
        stage=(profile.get("project") or {}).get("stage") or "idea",
    )
    session.add(project)
    await session.flush()
    record_event(session, workspace_id, user.id, "project.created", project.id)
    await session.commit()
    return serialize_project(project)


@router.get("/projects/{project_id}")
async def get_project(
    project_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    return serialize_project(await project_access(session, user, project_id))


async def locked_project(
    session: AsyncSession, user: User, project_id: str, expected_revision: int
) -> Project:
    accessible = await project_access(session, user, project_id, "editor")
    await locked_workspace(session, user, accessible.workspace_id, "editor")
    project = (
        await session.execute(
            select(Project)
            .where(Project.id == project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if project is None:
        raise HTTPException(404, "Project not found")
    if project.revision != expected_revision:
        raise HTTPException(409, {"code": "stale_revision", "current_revision": project.revision})
    return project


@router.patch("/projects/{project_id}")
async def patch_project(
    project_id: str,
    body: ProjectPatch,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    project = await locked_project(session, user, project_id, body.expected_revision)
    changes = body.model_dump(exclude_unset=True, exclude={"expected_revision", "confirm_profile"})
    if any(value is None for value in changes.values()):
        raise HTTPException(422, "Project values cannot be null")
    if "profile" in changes:
        changes["profile"] = validate_profile(changes["profile"])
    if not changes and not body.confirm_profile:
        return serialize_project(project)
    snapshot_project(session, project, user.id)
    for key, value in changes.items():
        setattr(project, key, value)
    if "profile" in changes:
        project.stage = (project.profile.get("project") or {}).get("stage") or "idea"
    project.revision += 1
    project.confirmed_revision = project.revision if body.confirm_profile else None
    project.updated_at = utcnow()
    record_event(
        session,
        project.workspace_id,
        user.id,
        "project.confirmed" if body.confirm_profile else "project.updated",
        project.id,
        {"revision": project.revision, "fields": sorted(changes)},
    )
    await session.commit()
    return serialize_project(project)


@router.get("/projects/{project_id}/revisions")
async def project_revisions(
    project_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    project = await project_access(session, user, project_id)
    rows = (
        (
            await session.execute(
                select(ProjectRevision)
                .where(ProjectRevision.project_id == project_id)
                .order_by(ProjectRevision.revision)
            )
        )
        .scalars()
        .all()
    )
    return [
        {
            "revision": row.revision,
            "actor_id": row.actor_id,
            "created_at": row.created_at,
            "snapshot": row.snapshot,
        }
        for row in rows
    ] + [
        {
            "revision": project.revision,
            "actor_id": None,
            "created_at": project.updated_at,
            "snapshot": serialize_project(project),
            "current": True,
        }
    ]


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    accessible = await project_access(session, user, project_id, "admin")
    await locked_workspace(session, user, accessible.workspace_id)
    project = (
        await session.execute(
            select(Project)
            .where(Project.id == project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if project is None:
        raise HTTPException(404, "Project not found")
    from .applications import list_document_storage_keys, remove_document_storage_keys

    storage_keys = await list_document_storage_keys(session, project_id=project_id)
    record_event(
        session, project.workspace_id, user.id, "project.deleted", detail={"project_id": project.id}
    )
    await session.flush()
    await erase_tenant_rows(session, Project.__table__, project_id)
    await session.commit()
    await remove_document_storage_keys(storage_keys)


class LegacyImport(StrictInput):
    expected_revision: Annotated[StrictInt, Field(ge=1)]
    description: Annotated[StrictStr, Field(max_length=100000)]
    documents_metadata: list[dict] = Field(default_factory=list, max_length=100)


@router.post("/projects/{project_id}/import-legacy")
async def import_legacy(
    project_id: str,
    body: LegacyImport,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    project = await locked_project(session, user, project_id, body.expected_revision)
    metadata = []
    for item in body.documents_metadata:
        untrusted = {
            key: value
            for key, value in item.items()
            if key not in {"verified", "is_verified", "verified_by", "verified_at", "status"}
        }
        metadata.append(
            {
                "name": str(item.get("name", item.get("original_name", "")))[:500],
                "mime": str(item.get("mime", ""))[:200],
                "untrusted_metadata": untrusted,
                "status": "unverified",
                "origin": "explicit_legacy_import",
            }
        )
    snapshot_project(session, project, user.id)
    profile = validate_profile(project.profile)
    profile["extra"] = {**profile["extra"], "legacy_documents_metadata": metadata}
    project.description = body.description
    project.profile = profile
    project.revision += 1
    project.confirmed_revision = None
    project.updated_at = utcnow()
    record_event(
        session,
        project.workspace_id,
        user.id,
        "project.legacy_imported",
        project.id,
        {"revision": project.revision, "metadata_count": len(metadata)},
    )
    await session.commit()
    return serialize_project(project)


class InvitationInput(StrictInput):
    email: Annotated[StrictStr, Field(max_length=320)]
    role: InvitedRole = "editor"
    _email = field_validator("email")(normalize_email)


class MemberPatch(StrictInput):
    role: MemberRole


class PlanInput(StrictInput):
    plan: Literal["free", "pro"]


async def locked_workspace(
    session: AsyncSession, user: User, workspace_id: str, min_role: str = "admin"
) -> Workspace:
    await workspace_access(session, user, workspace_id, min_role)
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
    await workspace_access(session, user, workspace_id, min_role)
    return workspace


async def member_seats(session: AsyncSession, workspace_id: str) -> int:
    members = (
        await session.execute(
            select(func.count())
            .select_from(Membership)
            .where(Membership.workspace_id == workspace_id)
        )
    ).scalar_one()
    pending = (
        await session.execute(
            select(func.count())
            .select_from(WorkspaceInvitation)
            .where(
                WorkspaceInvitation.workspace_id == workspace_id,
                WorkspaceInvitation.accepted_at.is_(None),
                WorkspaceInvitation.expires_at > utcnow(),
            )
        )
    ).scalar_one()
    return members + pending


@router.get("/workspaces/{workspace_id}/members")
async def list_members(
    workspace_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await workspace_access(session, user, workspace_id)
    rows = (
        await session.execute(
            select(User, Membership.role)
            .join(Membership, Membership.user_id == User.id)
            .where(Membership.workspace_id == workspace_id)
            .order_by(User.name, User.id)
        )
    ).all()
    return [
        {
            "user_id": member.id,
            "name": member.name,
            "email": member.email,
            "email_verified_at": member.email_verified_at,
            "role": role,
        }
        for member, role in rows
    ]


@router.get("/workspaces/{workspace_id}/invitations")
async def list_invitations(
    workspace_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await workspace_access(session, user, workspace_id, "admin")
    rows = (
        (
            await session.execute(
                select(WorkspaceInvitation)
                .where(
                    WorkspaceInvitation.workspace_id == workspace_id,
                    WorkspaceInvitation.accepted_at.is_(None),
                    WorkspaceInvitation.expires_at > utcnow(),
                )
                .order_by(WorkspaceInvitation.created_at)
            )
        )
        .scalars()
        .all()
    )
    return [
        {
            "id": row.id,
            "email": row.email,
            "role": row.role,
            "invited_by": row.invited_by,
            "expires_at": row.expires_at,
            "created_at": row.created_at,
        }
        for row in rows
    ]


@router.post("/workspaces/{workspace_id}/members", status_code=201)
async def invite_member(
    workspace_id: str,
    body: InvitationInput,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    from .notifications import MailSendError, ensure_mail_configured, send_email

    workspace = await locked_workspace(session, user, workspace_id)
    require_pro(workspace)
    membership = await session.get(Membership, (workspace_id, user.id))
    if body.role == "admin" and membership.role != "owner":
        raise HTTPException(403, "Only workspace owners may invite admins")
    if user.email_verified_at is None:
        raise HTTPException(403, "Verify your email before inviting members")
    existing = (
        await session.execute(
            select(User.id)
            .join(Membership, Membership.user_id == User.id)
            .where(Membership.workspace_id == workspace_id, User.email == body.email)
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(409, "This member already belongs to the workspace")
    duplicate = (
        await session.execute(
            select(WorkspaceInvitation.id).where(
                WorkspaceInvitation.workspace_id == workspace_id,
                WorkspaceInvitation.email == body.email,
                WorkspaceInvitation.accepted_at.is_(None),
                WorkspaceInvitation.expires_at > utcnow(),
            )
        )
    ).scalar_one_or_none()
    if duplicate is not None:
        raise HTTPException(409, "A pending invitation already exists")
    if await member_seats(session, workspace_id) >= 3:
        raise HTTPException(
            409, "Pro workspaces permit at most three members including reserved invitations"
        )
    ensure_mail_configured()
    token = secrets.token_urlsafe(32)
    invite = WorkspaceInvitation(
        id=new_id(),
        workspace_id=workspace_id,
        email=body.email,
        role=body.role,
        invited_by=user.id,
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        expires_at=utcnow() + timedelta(days=7),
    )
    session.add(invite)
    await session.flush()
    link = f"{settings.public_app_url.rstrip('/')}/?invite_token={token}"
    try:
        await send_email(
            body.email,
            "Abi: workspace invitation",
            f"You have been invited to an Abi workspace as {body.role}. Sign in with this email and verify it, then accept within seven days: {link}\nIf unexpected, ignore this invitation.",
        )
    except MailSendError as exc:
        await session.rollback()
        raise HTTPException(503, {"code": "email_delivery_failed", "reason": str(exc)}) from exc
    record_event(
        session,
        workspace_id,
        user.id,
        "member.invited",
        detail={"invitation_id": invite.id, "role": body.role},
    )
    await session.commit()
    return {
        "id": invite.id,
        "email": invite.email,
        "role": invite.role,
        "expires_at": invite.expires_at,
        "status": "sent",
    }


@router.delete("/workspaces/{workspace_id}/invitations/{invitation_id}", status_code=204)
async def revoke_invitation(
    workspace_id: str,
    invitation_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await locked_workspace(session, user, workspace_id)
    invitation = await session.get(WorkspaceInvitation, invitation_id)
    if invitation is None or invitation.workspace_id != workspace_id:
        raise HTTPException(404, "Invitation not found")
    if invitation.accepted_at is not None:
        raise HTTPException(409, "Invitation already accepted")
    actor = await session.get(Membership, (workspace_id, user.id))
    if invitation.role == "admin" and actor.role != "owner":
        raise HTTPException(403, "Only owners may revoke admin invitations")
    await session.delete(invitation)
    record_event(
        session,
        workspace_id,
        user.id,
        "member.invitation_revoked",
        detail={"invitation_id": invitation_id},
    )
    await session.commit()


@router.post("/auth/accept-invite")
async def accept_invite(
    body: TokenInput,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    digest = hashlib.sha256(body.token.encode()).hexdigest()
    invitation = (
        await session.execute(
            select(WorkspaceInvitation).where(
                WorkspaceInvitation.token_hash == digest,
                WorkspaceInvitation.expires_at > utcnow(),
                WorkspaceInvitation.accepted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if invitation is None or invitation.email != user.email:
        raise HTTPException(400, "Invalid or expired invitation")
    if user.email_verified_at is None:
        raise HTTPException(403, "Verify your invited email before accepting")
    workspace = (
        await session.execute(
            select(Workspace)
            .where(Workspace.id == invitation.workspace_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if workspace is None:
        raise HTTPException(400, "Invalid or expired invitation")
    invitation = (
        await session.execute(
            select(WorkspaceInvitation)
            .where(WorkspaceInvitation.id == invitation.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if (
        invitation is None
        or invitation.accepted_at is not None
        or invitation.expires_at <= utcnow()
    ):
        raise HTTPException(400, "Invalid or expired invitation")
    require_pro(workspace)
    inviter = await session.get(Membership, (workspace.id, invitation.invited_by))
    if (
        inviter is None
        or ROLES.get(inviter.role, -1) < ROLES["admin"]
        or (invitation.role == "admin" and inviter.role != "owner")
    ):
        raise HTTPException(400, "Invitation issuer no longer authorized")
    if await session.get(Membership, (workspace.id, user.id)) is not None:
        raise HTTPException(409, "Already a workspace member")
    member_count = (
        await session.execute(
            select(func.count())
            .select_from(Membership)
            .where(Membership.workspace_id == workspace.id)
        )
    ).scalar_one()
    if member_count >= 3:
        raise HTTPException(409, "Workspace member limit reached")
    session.add(Membership(workspace_id=workspace.id, user_id=user.id, role=invitation.role))
    invitation.accepted_at = utcnow()
    invitation.accepted_by = user.id
    record_event(
        session,
        workspace.id,
        user.id,
        "member.joined",
        detail={
            "invitation_id": invitation.id,
            "invited_by": invitation.invited_by,
            "role": invitation.role,
        },
    )
    await session.commit()
    return serialize_workspace(workspace, invitation.role)


async def change_member_permission(
    session: AsyncSession, workspace_id: str, actor: User, target_user_id: str, new_role: str | None
) -> Membership:
    await locked_workspace(session, actor, workspace_id)
    acting = await session.get(Membership, (workspace_id, actor.id))
    target = await session.get(Membership, (workspace_id, target_user_id))
    if target is None:
        raise HTTPException(404, "Member not found")
    if acting.role != "owner" and (
        ROLES[target.role] >= ROLES[acting.role]
        or (new_role is not None and ROLES[new_role] >= ROLES[acting.role])
    ):
        raise HTTPException(403, "Only an owner may manage admins or owners")
    if target.role == "owner" and new_role != "owner":
        owners = (
            await session.execute(
                select(func.count())
                .select_from(Membership)
                .where(Membership.workspace_id == workspace_id, Membership.role == "owner")
            )
        ).scalar_one()
        if owners <= 1:
            raise HTTPException(409, "The last workspace owner cannot be removed or demoted")
    return target


@router.patch("/workspaces/{workspace_id}/members/{member_id}")
async def update_member(
    workspace_id: str,
    member_id: str,
    body: MemberPatch,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    target = await change_member_permission(session, workspace_id, user, member_id, body.role)
    target.role = body.role
    record_event(
        session,
        workspace_id,
        user.id,
        "member.role_updated",
        detail={"member_id": member_id, "role": body.role},
    )
    await session.commit()
    return {"user_id": member_id, "role": target.role}


@router.delete("/workspaces/{workspace_id}/members/{member_id}", status_code=204)
async def remove_member(
    workspace_id: str,
    member_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    target = await change_member_permission(session, workspace_id, user, member_id, None)
    await session.delete(target)
    record_event(session, workspace_id, user.id, "member.removed", detail={"member_id": member_id})
    await session.commit()


@router.post("/admin/workspaces/{workspace_id}/plan")
async def set_workspace_plan(
    workspace_id: str,
    body: PlanInput,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    if not user.is_admin:
        raise HTTPException(403, "Administrator permission required")
    workspace = (
        await session.execute(
            select(Workspace).where(Workspace.id == workspace_id).with_for_update()
        )
    ).scalar_one_or_none()
    if workspace is None:
        raise HTTPException(404, "Workspace not found")
    if body.plan == "free" and await member_seats(session, workspace_id) > 1:
        raise HTTPException(
            409, "Remove additional members and pending invitations before selecting Free"
        )
    old_plan = workspace.plan
    workspace.plan = body.plan
    record_event(
        session,
        workspace_id,
        user.id,
        "workspace.plan_manually_set",
        detail={
            "previous_plan": old_plan,
            "plan": body.plan,
            "billing": "manual_local_entitlement_not_payment",
        },
    )
    await session.commit()
    return {
        "workspace": serialize_workspace(workspace),
        "entitlement_mode": "manual_local",
        "payment_processed": False,
    }


@router.get("/workspaces/{workspace_id}/export")
async def export_workspace(
    workspace_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    workspace = await workspace_access(session, user, workspace_id, "owner")
    project_ids = select(Project.id).where(Project.workspace_id == workspace_id)
    excluded = {
        "workspaces",
        "users",
        "session_tokens",
        "auth_throttles",
        "email_verifications",
        "workspace_invitations",
    }
    records = {}
    for table in Base.metadata.sorted_tables:
        if table.name in excluded:
            continue
        if "workspace_id" in table.c:
            condition = table.c.workspace_id == workspace_id
        elif "project_id" in table.c:
            condition = table.c.project_id.in_(project_ids)
        elif "application_id" in table.c and "applications" in Base.metadata.tables:
            application_table = Base.metadata.tables["applications"]
            condition = table.c.application_id.in_(
                select(application_table.c.id).where(
                    application_table.c.workspace_id == workspace_id
                )
            )
        else:
            continue
        rows = (await session.execute(select(table).where(condition))).mappings().all()
        records[table.name] = [dict(row) for row in rows]
    return jsonable_encoder(
        {
            "format": "abi-workspace-data-v1",
            "exported_at": utcnow(),
            "workspace": serialize_workspace(workspace),
            "members": await list_members(workspace_id, user, session),
            "records": records,
            "original_documents": "Download originals through authenticated /api/documents/{id}/download",
        }
    )


@router.delete("/workspaces/{workspace_id}", status_code=204)
async def delete_workspace(
    workspace_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await locked_workspace(session, user, workspace_id, "owner")
    from .applications import list_document_storage_keys, remove_document_storage_keys

    storage_keys = await list_document_storage_keys(session, workspace_id=workspace_id)
    await erase_tenant_rows(session, Workspace.__table__, workspace_id)
    await session.commit()
    await remove_document_storage_keys(storage_keys)


async def erase_tenant_rows(session: AsyncSession, root_table, root_id: str) -> None:
    """Explicit authorized erasure, including immutable historical rows.

    Follow tenant foreign keys rather than deleting shared global funding sources.
    SQL Core intentionally bypasses ORM historical-mutation listeners for erasure.
    Callers commit successfully before removing any external document storage.
    """
    conditions = {root_table.name: root_table.c.id == root_id}
    usage_table = Base.metadata.tables.get("usage_events")
    if usage_table is not None:
        # Keep successful usage after data erasure; otherwise deleting a Free workspace
        # would reset an account's monthly quota. Null tenant links retain no content.
        if root_table.name == "workspaces":
            await session.execute(
                update(usage_table)
                .where(usage_table.c.workspace_id == root_id)
                .values(workspace_id=None, project_id=None, result={})
            )
        else:
            await session.execute(
                update(usage_table)
                .where(usage_table.c.project_id == root_id)
                .values(project_id=None, result={})
            )
    credit_table = Base.metadata.tables.get("usage_credits")
    if credit_table is not None and root_table.name == "workspaces":
        await session.execute(
            update(credit_table)
            .where(credit_table.c.workspace_id == root_id)
            .values(workspace_id=None, reason="Erased workspace manual grant")
        )

    def condition_for(table, visiting: set[str]):
        if table.name in conditions:
            return conditions[table.name]
        if table.name in visiting:
            return None
        choices = []
        for foreign_key in table.foreign_keys:
            parent = foreign_key.column.table
            parent_condition = condition_for(parent, visiting | {table.name})
            if parent_condition is not None:
                choices.append(
                    foreign_key.parent.in_(select(foreign_key.column).where(parent_condition))
                )
        condition = or_(*choices) if choices else None
        conditions[table.name] = condition
        return condition

    for table in reversed(Base.metadata.sorted_tables):
        if table.name in {"usage_events", "usage_credits"}:
            continue
        condition = condition_for(table, set())
        if condition is not None:
            await session.execute(delete(table).where(condition))


class DeleteAccountInput(StrictInput):
    password: Annotated[StrictStr, Field(min_length=1, max_length=1024)]
    confirmation: Literal["DELETE"]


@router.delete("/auth/account", status_code=204)
async def delete_account(
    body: DeleteAccountInput,
    request: Request,
    response: Response,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    from .account import lock_user_authentication

    await throttle_auth(session, request, "delete_account", user.email)
    user = await lock_user_authentication(session, request, user)
    if not await asyncio.to_thread(verify_password, body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    workspace_ids = (
        (
            await session.execute(
                select(Membership.workspace_id)
                .where(Membership.user_id == user.id)
                .order_by(Membership.workspace_id)
            )
        )
        .scalars()
        .all()
    )
    for workspace_id in workspace_ids:
        await locked_workspace(session, user, workspace_id, "viewer")
        membership = await session.get(Membership, (workspace_id, user.id))
        if membership.role == "owner":
            owner_count = (
                await session.execute(
                    select(func.count())
                    .select_from(Membership)
                    .where(Membership.workspace_id == workspace_id, Membership.role == "owner")
                )
            ).scalar_one()
            if owner_count <= 1:
                raise HTTPException(
                    409,
                    {
                        "code": "last_workspace_owner",
                        "workspace_id": workspace_id,
                        "message": "Export and delete this workspace or appoint another owner before deleting your account",
                    },
                )
    memberships = (
        (await session.execute(select(Membership).where(Membership.user_id == user.id)))
        .scalars()
        .all()
    )
    for membership in memberships:
        record_event(session, membership.workspace_id, user.id, "member.account_deleted")
    usage_table = Base.metadata.tables.get("usage_events")
    if usage_table is not None:
        await session.execute(
            update(usage_table).where(usage_table.c.actor_id == user.id).values(result={})
        )
    await session.flush()
    # Shared organizational content remains; remove identity linkage, not other users' data.
    # Explicit Core updates also handle historic publisher attribution without mutating rules.
    for table in Base.metadata.sorted_tables:
        for foreign_key in table.foreign_keys:
            if foreign_key.column.table.name != "users" or table.name == "users":
                continue
            column = foreign_key.parent
            if column.nullable and foreign_key.ondelete != "CASCADE":
                await session.execute(
                    update(table).where(column == user.id).values({column.name: None})
                )
    await session.execute(delete(User).where(User.id == user.id))
    await session.commit()
    response.delete_cookie(
        "abi_session",
        path="/",
        secure=settings.session_cookie_secure,
        httponly=True,
        samesite="lax",
    )
