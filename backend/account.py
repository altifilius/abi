"""Self-service identity, session revocation, and single-use password recovery."""

import asyncio
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Annotated
from urllib.parse import urlencode, urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.encoders import jsonable_encoder
from pydantic import Field, StrictStr, field_validator
from sqlalchemy import DateTime, ForeignKey, String, delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base, get_session
from .notifications import MailDelivery, ensure_mail_configured, queue_email
from .settings import settings
from .workspaces import (
    SessionToken,
    StrictInput,
    User,
    check_auth_origin,
    hash_password,
    new_id,
    normalize_email,
    require_user,
    serialize_user,
    throttle_auth,
    utcnow,
    verify_password,
)


class PasswordReset(Base):
    __tablename__ = "password_resets"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class ProfileInput(StrictInput):
    name: Annotated[StrictStr, Field(min_length=1, max_length=200)]

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name must not be blank")
        return value


class ChangePasswordInput(StrictInput):
    current_password: Annotated[StrictStr, Field(min_length=1, max_length=1024)]
    new_password: Annotated[StrictStr, Field(min_length=12, max_length=1024)]


class ForgotPasswordInput(StrictInput):
    email: Annotated[StrictStr, Field(max_length=320)]
    _email = field_validator("email")(normalize_email)


class ResetPasswordInput(StrictInput):
    token: Annotated[StrictStr, Field(min_length=20, max_length=200)]
    new_password: Annotated[StrictStr, Field(min_length=12, max_length=1024)]


router = APIRouter(prefix="/api", tags=["account"])


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        "abi_session",
        path="/",
        secure=settings.session_cookie_secure,
        httponly=True,
        samesite="lax",
    )


async def lock_user_authentication(session: AsyncSession, request: Request, user: User) -> User:
    """Reauthenticate after the User lock, before sessions or any workspace locks.

    Dependencies can have read a session/password before a concurrent reset commits.
    Reload both under the same lock order used by login and password replacement.
    """
    locked_user = (
        await session.execute(
            select(User)
            .where(User.id == user.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if locked_user is None:
        raise HTTPException(401, "Authentication required")
    token = request.cookies.get("abi_session", "")
    current = (
        await session.execute(
            select(SessionToken)
            .where(
                SessionToken.id == request.state.auth_session.id,
                SessionToken.user_id == locked_user.id,
                SessionToken.token_hash == hashlib.sha256(token.encode()).hexdigest(),
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if current is None or current.expires_at <= utcnow():
        raise HTTPException(401, "Session expired; sign in again")
    check_auth_origin(request)
    if not secrets.compare_digest(
        request.headers.get("x-csrf-token", "").encode(), current.csrf_token.encode()
    ):
        raise HTTPException(403, "Invalid CSRF token")
    request.state.auth_session = current
    return locked_user


async def invalidate_password_resets(session: AsyncSession, user_id: str) -> None:
    await session.execute(
        update(PasswordReset)
        .where(PasswordReset.user_id == user_id, PasswordReset.used_at.is_(None))
        .values(used_at=utcnow())
    )
    # The worker clears delivered content; cancel any still queued recovery secrets.
    await session.execute(
        update(MailDelivery)
        .where(
            MailDelivery.user_id == user_id,
            MailDelivery.kind == "password_reset",
            MailDelivery.status.in_(["queued", "retry", "dead_letter"]),
        )
        .values(status="cancelled", body="", last_error=None)
    )


async def password_reset_delivery_allowed(
    session: AsyncSession, delivery: MailDelivery, user: User
) -> bool:
    """Do not deliver an expired, already consumed, or misattributed recovery link."""
    prefix = "password-reset:"
    if delivery.user_id != user.id or not delivery.dedupe_key.startswith(prefix):
        return False
    reset = await session.get(PasswordReset, delivery.dedupe_key[len(prefix) :])
    return bool(
        reset is not None
        and reset.user_id == user.id
        and reset.used_at is None
        and reset.expires_at > utcnow()
    )


@router.patch("/auth/profile")
async def patch_profile(
    body: ProfileInput,
    request: Request,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    user = await lock_user_authentication(session, request, user)
    user.name = body.name
    await session.commit()
    return serialize_user(user)


@router.post("/auth/change-password", status_code=204)
async def change_password(
    body: ChangePasswordInput,
    request: Request,
    response: Response,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    await throttle_auth(session, request, "change_password", user.email)
    user = await lock_user_authentication(session, request, user)
    if not await asyncio.to_thread(verify_password, body.current_password, user.password_hash):
        raise HTTPException(401, "Invalid current password")
    user.password_hash = await asyncio.to_thread(hash_password, body.new_password)
    await session.execute(delete(SessionToken).where(SessionToken.user_id == user.id))
    await invalidate_password_resets(session, user.id)
    await session.commit()
    clear_session_cookie(response)


@router.post("/auth/forgot-password")
async def forgot_password(
    body: ForgotPasswordInput,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    check_auth_origin(request)
    await throttle_auth(session, request, "forgot_password", body.email)
    # Configuration failures must be identical for both known and unknown emails.
    ensure_mail_configured()
    base = settings.public_app_url.rstrip("/")
    parsed = urlsplit(base)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or any(character.isspace() for character in base)
    ):
        raise HTTPException(503, {"code": "configuration_error", "service": "public_app_url"})
    user = (
        await session.execute(
            select(User)
            .where(User.email == body.email)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if user is not None:
        token = secrets.token_urlsafe(32)
        reset = PasswordReset(
            id=new_id(),
            user_id=user.id,
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            expires_at=utcnow() + timedelta(minutes=60),
        )
        session.add(reset)
        link = f"{base}/auth/reset-password?{urlencode({'token': token})}"
        await queue_email(
            session,
            user.id,
            "Abi: reset your password",
            "Reset your password within 60 minutes using this link:\n"
            f"{link}\n\nIf you did not request this, ignore this email. "
            "Your password has not changed.",
            dedupe_key=f"password-reset:{reset.id}",
            kind="password_reset",
        )
    await session.commit()
    return {"status": "requested"}


@router.post("/auth/reset-password", status_code=204)
async def reset_password(
    body: ResetPasswordInput,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    check_auth_origin(request)
    digest = hashlib.sha256(body.token.encode()).hexdigest()
    await throttle_auth(session, request, "reset_password", digest)
    candidate = (
        await session.execute(
            select(PasswordReset.id, PasswordReset.user_id).where(
                PasswordReset.token_hash == digest
            )
        )
    ).one_or_none()
    error = "Invalid or expired password reset token"
    if candidate is None:
        raise HTTPException(400, error)
    user = (
        await session.execute(
            select(User)
            .where(User.id == candidate.user_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(400, error)
    reset = (
        await session.execute(
            select(PasswordReset)
            .where(PasswordReset.id == candidate.id, PasswordReset.user_id == user.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if reset is None or reset.used_at is not None or reset.expires_at <= utcnow():
        raise HTTPException(400, error)
    password_hash = await asyncio.to_thread(hash_password, body.new_password)
    if reset.expires_at <= utcnow():
        raise HTTPException(400, error)
    user.password_hash = password_hash
    await session.execute(delete(SessionToken).where(SessionToken.user_id == user.id))
    await invalidate_password_resets(session, user.id)
    await session.commit()
    clear_session_cookie(response)


@router.get("/auth/sessions")
async def list_sessions(
    request: Request,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    rows = (
        await session.execute(
            select(SessionToken)
            .where(SessionToken.user_id == user.id, SessionToken.expires_at > utcnow())
            .order_by(SessionToken.expires_at.desc(), SessionToken.id)
        )
    ).scalars()
    return jsonable_encoder(
        [
            {
                "id": row.id,
                "expires_at": row.expires_at,
                "current": row.id == request.state.auth_session.id,
            }
            for row in rows
        ]
    )


@router.delete("/auth/sessions/{session_id}", status_code=204)
async def revoke_session(
    session_id: str,
    request: Request,
    response: Response,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    user = await lock_user_authentication(session, request, user)
    target = (
        await session.execute(
            select(SessionToken)
            .where(SessionToken.id == session_id, SessionToken.user_id == user.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(404, "Session not found")
    is_current = target.id == request.state.auth_session.id
    await session.delete(target)
    await session.commit()
    if is_current:
        clear_session_cookie(response)
