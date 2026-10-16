"""Official-source funding catalogue and immutable, deterministic assessments.

Seed data is never published automatically. Legal interpretation and award decisions
remain with the funder; reviewer decisions are attributed preparation assessments.
"""

import argparse
import asyncio
import base64
import copy
import difflib
import hashlib
import json
import sys
import uuid
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator, model_validator
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, event, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

# Running the module CLI must not register the same SQLAlchemy models twice
# when the watcher imports the canonical funding module.
if __name__ == "__main__":
    sys.modules["backend.funding"] = sys.modules[__name__]

from .db import AsyncSessionLocal, Base, get_session
from .workspaces import (
    User,
    locked_workspace,
    project_access,
    record_event,
    require_pro,
    require_user,
)

router = APIRouter(prefix="/api", tags=["funding"])
PUBLISH_ACK = "I reviewed the official sources and rules"


def utcnow() -> datetime:
    return datetime.now(UTC)


def new_id() -> str:
    return str(uuid.uuid4())


class Program(Base):
    __tablename__ = "funding_programs"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    code: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    institution: Mapped[str] = mapped_column(String(200), nullable=False)
    country: Mapped[str] = mapped_column(String(2), index=True, nullable=False)
    support_type: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    official_url: Mapped[str] = mapped_column(Text, nullable=False)
    watch_http: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)


class SourceRevision(Base):
    __tablename__ = "source_revisions"
    __table_args__ = (UniqueConstraint("program_id", "version"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    program_id: Mapped[str] = mapped_column(
        ForeignKey("funding_programs.id"), index=True, nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_encoding: Mapped[str] = mapped_column(String(30), default="json_base64", nullable=False)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    publication_status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    published_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class FundingCall(Base):
    __tablename__ = "funding_calls"
    __table_args__ = (UniqueConstraint("program_id", "version"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    program_id: Mapped[str] = mapped_column(
        ForeignKey("funding_programs.id"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    opens_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rule_version: Mapped[str] = mapped_column(String(100), nullable=False)
    source_revision_id: Mapped[str] = mapped_column(
        ForeignKey("source_revisions.id"), nullable=False
    )
    rules: Mapped[list] = mapped_column(JSONB, nullable=False)
    template: Mapped[dict] = mapped_column(JSONB, nullable=False)
    finance: Mapped[dict] = mapped_column(JSONB, nullable=False)
    language: Mapped[str] = mapped_column(String(2), nullable=False)
    portal_url: Mapped[str] = mapped_column(Text, nullable=False)
    validated_source_sha256: Mapped[str | None] = mapped_column(String(64))
    published_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Evaluation(Base):
    __tablename__ = "evaluations"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id"), index=True, nullable=False
    )
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True, nullable=False)
    profile_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    call_id: Mapped[str] = mapped_column(ForeignKey("funding_calls.id"), index=True, nullable=False)
    call_version: Mapped[int] = mapped_column(Integer, nullable=False)
    source_revision_id: Mapped[str] = mapped_column(
        ForeignKey("source_revisions.id"), nullable=False
    )
    rule_version: Mapped[str] = mapped_column(String(100), nullable=False)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    result: Mapped[dict] = mapped_column(JSONB, nullable=False)


@event.listens_for(Evaluation, "before_update")
@event.listens_for(Evaluation, "before_delete")
def immutable_evaluation(mapper, connection, target):
    raise ValueError("Evaluation history is immutable")


@event.listens_for(SourceRevision, "before_update")
def immutable_source(mapper, connection, target):
    from sqlalchemy import inspect

    allowed = {"publication_status", "published_by", "published_at"}
    if any(attr.history.has_changes() for attr in inspect(target).attrs if attr.key not in allowed):
        raise ValueError("Source content history is immutable")


@event.listens_for(FundingCall, "before_update")
def immutable_published_call(mapper, connection, target):
    from sqlalchemy import inspect

    state = inspect(target)
    old_status = state.attrs.status.history.deleted
    was_published = (old_status[0] if old_status else target.status) in {"published", "archived"}
    if was_published and any(
        attr.history.has_changes() for attr in state.attrs if attr.key != "status"
    ):
        raise ValueError("Published call versions are immutable; create a draft version")
    if was_published and target.status not in {"published", "archived"}:
        raise ValueError("Published versions cannot return to draft")


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Rule(StrictModel):
    id: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=1000)
    field: str = Field(pattern=r"^(company|project|team|budget|extra)\.[a-zA-Z0-9_.]+$")
    op: Literal["eq", "in", "gte", "lte", "exists", "review"]
    value_type: Literal["boolean", "number", "string", "date", "list", "object"]
    expected: Any = None
    source_url: str
    source_locator: str = Field(min_length=1, max_length=1000)

    @field_validator("source_url")
    @classmethod
    def official_https(cls, value):
        from .source_watch import validate_url

        validate_url(value)
        return value

    @model_validator(mode="after")
    def expected_type(self):
        if self.op in {"review", "exists"}:
            return self
        if self.op == "in":
            if not isinstance(self.expected, list) or not self.expected:
                raise ValueError("in requires a nonempty expected list")
            for value in self.expected:
                typed_value(value, self.value_type)
        else:
            typed_value(self.expected, self.value_type)
        return self


class Section(StrictModel):
    key: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=1000)
    required: StrictBool
    profile_field: str | None = None
    source_url: str
    source_locator: str
    max_characters: int | None = Field(default=None, gt=0)


class DocumentRequirement(StrictModel):
    key: str
    label: str
    required: StrictBool
    accepted_extensions: list[str]
    source_url: str
    source_locator: str | None = None


class Guidance(StrictModel):
    title: str
    text: str
    url: str


class Template(StrictModel):
    sections: list[Section] = Field(min_length=1)
    documents: list[DocumentRequirement]
    guidance: list[Guidance] = Field(min_length=1)
    official_template_url: str | None
    package_label: str
    prerequisites: list[str] = Field(default_factory=list)
    submission_mode: Literal["portal_fields", "official_form"] = "portal_fields"
    official_template_required: StrictBool = False


class SupportTier(StrictModel):
    prior_count_max: int | None = Field(ge=0)
    rate: str


class Finance(StrictModel):
    currency: Literal["TRY", "EUR", "GBP", "USD", "CAD", "CHF", "NOK", "ISK"]
    support_kind: Literal["grant", "tax_credit", "equity"]
    max_project_budget: str | None = None
    max_support: str | None = None
    support_rate: str | None = None
    equity_rate: str | None = None
    support_tiers: list[SupportTier] = Field(default_factory=list)
    prior_count_field: str | None = None
    eligible_categories: list[
        Literal["personnel", "equipment", "services", "travel", "materials", "other"]
    ]
    notes: str
    source_url: str
    requires_national_confirmation: StrictBool = False
    budget_required: StrictBool = True

    @field_validator("max_project_budget", "max_support", "support_rate", "equity_rate")
    @classmethod
    def valid_decimal(cls, value):
        if value is not None:
            decimal = Decimal(value)
            if not decimal.is_finite() or decimal < 0:
                raise ValueError("Expected finite nonnegative decimal")
        return value

    @model_validator(mode="after")
    def valid_rates(self):
        for value in [
            self.support_rate,
            self.equity_rate,
            *[tier.rate for tier in self.support_tiers],
        ]:
            if value is not None and not Decimal(0) <= Decimal(value) <= Decimal(1):
                raise ValueError("Rates must be fractions between zero and one")
        if self.support_tiers and not self.prior_count_field:
            raise ValueError("Tiered rates require prior_count_field")
        return self


class CallDefinition(StrictModel):
    title: str
    opens_at: datetime | None = None
    deadline: datetime | None = None
    rule_version: str
    rules: list[Rule] = Field(min_length=1)
    template: Template
    finance: Finance
    language: Literal["tr", "en", "de"]
    portal_url: str

    @model_validator(mode="after")
    def validate_definition(self):
        from .source_watch import validate_url

        if len({rule.id for rule in self.rules}) != len(self.rules):
            raise ValueError("Rule IDs must be unique")
        for instant in (self.opens_at, self.deadline):
            if instant is not None and instant.tzinfo is None:
                raise ValueError("Call dates require timezone")
        if self.opens_at and self.deadline and self.opens_at >= self.deadline:
            raise ValueError("Opening must precede deadline")
        if len({section.key for section in self.template.sections}) != len(self.template.sections):
            raise ValueError("Section keys must be unique")
        for url in [
            self.portal_url,
            self.finance.source_url,
            self.template.official_template_url,
            *[x.source_url for x in self.template.sections],
            *[x.source_url for x in self.template.documents],
            *[x.url for x in self.template.guidance],
        ]:
            if url:
                validate_url(url)
        return self


class EvaluateRequest(StrictModel):
    call_id: str


class PublishRequest(StrictModel):
    acknowledgement: Literal["I reviewed the official sources and rules"]


class DraftRequest(PublishRequest):
    definition: CallDefinition


class ReviewDecision(StrictModel):
    condition_id: str
    approved: StrictBool
    notes: str = Field(min_length=10, max_length=3000)


class ReviewRequest(StrictModel):
    decisions: list[ReviewDecision] = Field(min_length=1, max_length=100)


def typed_value(value: Any, value_type: str):
    if value_type == "boolean":
        if type(value) is not bool:
            raise ValueError("Expected boolean, not string or number")
        return value
    if value_type == "number":
        if isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
            raise ValueError("Expected number")
        try:
            number = Decimal(str(value))
        except InvalidOperation as exc:
            raise ValueError("Expected decimal number") from exc
        if not number.is_finite():
            raise ValueError("Non-finite number")
        return number
    if value_type == "string":
        if not isinstance(value, str) or not value.strip():
            raise ValueError("Expected nonempty string")
        return value
    if value_type == "date":
        if not isinstance(value, str):
            raise ValueError("Expected ISO date")
        return datetime.fromisoformat(value).date()
    if value_type == "list" and isinstance(value, list):
        return value
    if value_type == "object" and isinstance(value, dict):
        return value
    raise ValueError("Invalid field type")


def field_value(profile: dict, path: str):
    if path == "budget.total":
        budget = profile.get("budget")
        if (
            not isinstance(budget, dict)
            or not isinstance(budget.get("items"), list)
            or not budget["items"]
        ):
            return None
        try:
            amounts = [typed_value(item["amount"], "number") for item in budget["items"]]
            if any(amount < 0 for amount in amounts):
                return None
            return str(sum(amounts, Decimal(0)))
        except (KeyError, TypeError, ValueError, InvalidOperation):
            return None
    current: Any = profile
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def eligibility_from_conditions(conditions: list[dict], closed: bool = False) -> str:
    if closed:
        return "closed"
    statuses = {condition["status"] for condition in conditions}
    if "fail" in statuses:
        return "ineligible"
    if "missing" in statuses:
        return "information_missing"
    if "review" in statuses:
        return "review_required"
    return "eligible"


def evaluate_rules(
    profile: dict,
    rules: list[dict],
    evaluated_at: datetime,
    opens_at: datetime | None = None,
    deadline: datetime | None = None,
) -> dict:
    """Pure evaluation; no clock, network, model, database or mutating input."""
    if evaluated_at.tzinfo is None:
        raise ValueError("Evaluation time must include timezone")
    conditions = []
    for raw in rules:
        rule = Rule.model_validate(raw)
        actual = field_value(profile, rule.field)
        status = "missing"
        if actual is not None and actual != "" and actual != [] and actual != {}:
            try:
                value = typed_value(actual, rule.value_type)
                if rule.op == "review":
                    status = "review"
                elif rule.op == "exists":
                    status = "pass"
                elif rule.op == "in":
                    status = (
                        "pass"
                        if value in [typed_value(x, rule.value_type) for x in rule.expected]
                        else "fail"
                    )
                else:
                    expected = typed_value(rule.expected, rule.value_type)
                    if rule.op == "eq":
                        matches = value == expected
                    elif rule.op == "gte":
                        matches = value >= expected
                    else:
                        matches = value <= expected
                    status = "pass" if matches else "fail"
            except (ValueError, TypeError, InvalidOperation):
                status = "missing"
        conditions.append(
            {
                "id": rule.id,
                "label": rule.label,
                "status": status,
                "field": rule.field,
                "actual": actual,
                "expected": rule.expected,
                "source_url": rule.source_url,
                "source_locator": rule.source_locator,
            }
        )
    closed = deadline is not None and evaluated_at > deadline
    if opens_at is not None and evaluated_at < opens_at:
        conditions.append(
            {
                "id": "call_not_open",
                "label": "Call has not opened yet",
                "status": "review",
                "field": "call.opens_at",
                "actual": evaluated_at.isoformat(),
                "expected": opens_at.isoformat(),
                "source_url": rules[0]["source_url"],
                "source_locator": "Call timeline",
            }
        )
    deterministic = [
        x for x in conditions if x["id"] not in {r["id"] for r in rules if r["op"] == "review"}
    ]
    passed = sum(x["status"] == "pass" for x in deterministic)
    score = int(Decimal(passed * 100) / Decimal(len(deterministic))) if deterministic else 0
    return {
        "eligibility": eligibility_from_conditions(conditions, closed),
        "conditions": conditions,
        "ranking": {
            "score": score,
            "explanation": f"{passed}/{len(deterministic)} deterministic conditions satisfied; preparation coverage only, not award probability or legal eligibility.",
        },
        "evaluated_at": evaluated_at.isoformat(),
        "assessment_scope": "Source-based application preparation; not an official funding decision",
        "call_state": "closed"
        if closed
        else "not_open"
        if opens_at and evaluated_at < opens_at
        else "open",
    }


def source_digest(snapshots: list[dict]) -> str:
    canonical = [
        {
            "url": x["url"],
            "sha256": hashlib.sha256(
                base64.b64decode(x["content_base64"], validate=True)
            ).hexdigest(),
        }
        for x in snapshots
    ]
    return hashlib.sha256(
        json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def call_definition(call: FundingCall) -> dict:
    return {key: getattr(call, key) for key in CallDefinition.model_fields}


def call_wire(call: FundingCall) -> dict:
    return {
        "id": call.id,
        "program_id": call.program_id,
        "version": call.version,
        "status": call.status,
        "source_revision_id": call.source_revision_id,
        "validated_source_sha256": call.validated_source_sha256,
        **call_definition(call),
    }


def program_wire(program: Program) -> dict:
    return {
        key: getattr(program, key)
        for key in (
            "id",
            "code",
            "name",
            "institution",
            "country",
            "support_type",
            "description",
            "official_url",
        )
    }


def source_wire(source: SourceRevision) -> dict:
    return {
        key: getattr(source, key)
        for key in (
            "id",
            "program_id",
            "version",
            "source_url",
            "sha256",
            "checked_at",
            "publication_status",
            "content_encoding",
            "published_by",
            "published_at",
        )
    }


def evaluation_wire(evaluation: Evaluation, revision: int) -> dict:
    return {
        key: getattr(evaluation, key)
        for key in (
            "id",
            "workspace_id",
            "project_id",
            "profile_revision",
            "call_id",
            "call_version",
            "source_revision_id",
            "rule_version",
            "evaluated_at",
            "result",
        )
    } | {"stale": evaluation.profile_revision != revision}


async def require_admin(user: User = Depends(require_user)) -> User:
    if not user.is_admin:
        raise HTTPException(403, "Global administrator required")
    return user


@router.get("/programs")
async def programs(
    q: str = Query(default="", max_length=200),
    country: str | None = None,
    support_type: str | None = None,
    session: AsyncSession = Depends(get_session),
):
    query = select(Program).order_by(Program.country, Program.code)
    if country:
        query = query.where(Program.country == country.upper())
    if support_type:
        query = query.where(Program.support_type == support_type)
    if q:
        from sqlalchemy import or_

        query = query.where(
            or_(
                Program.name.ilike(f"%{q}%"),
                Program.code.ilike(f"%{q}%"),
                Program.description.ilike(f"%{q}%"),
            )
        )
    selected = (await session.scalars(query)).all()
    calls = (
        (
            await session.scalars(
                select(FundingCall)
                .where(FundingCall.program_id.in_([p.id for p in selected]))
                .order_by(FundingCall.version.desc())
            )
        ).all()
        if selected
        else []
    )
    result = []
    for program in selected:
        own = [
            call for call in calls if call.program_id == program.id and call.status != "archived"
        ]
        current = next(
            (call for call in own if call.status == "published"), own[0] if own else None
        )
        result.append(
            program_wire(program)
            | {
                "catalog_status": current.status if current else "draft",
                "current_call": call_wire(current) if current else None,
            }
        )
    return result


@router.get("/calls/{call_id}")
async def call_detail(call_id: str, session: AsyncSession = Depends(get_session)):
    call = await session.get(FundingCall, call_id)
    if call is None:
        raise HTTPException(404, "Call not found")
    return call_wire(call)


@router.get("/programs/{program_id}")
async def program_detail(program_id: str, session: AsyncSession = Depends(get_session)):
    program = await session.get(Program, program_id)
    if program is None:
        raise HTTPException(404, "Program not found")
    calls = (
        await session.scalars(
            select(FundingCall)
            .where(FundingCall.program_id == program_id)
            .order_by(FundingCall.version.desc())
        )
    ).all()
    sources = (
        await session.scalars(
            select(SourceRevision)
            .where(SourceRevision.program_id == program_id)
            .order_by(SourceRevision.version.desc())
        )
    ).all()
    return program_wire(program) | {
        "calls": [call_wire(x) for x in calls],
        "sources": [source_wire(x) for x in sources],
    }


@router.post("/projects/{project_id}/evaluate", status_code=201)
async def evaluate_project(
    project_id: str,
    body: EvaluateRequest,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    project = await project_access(session, user, project_id, "editor")
    workspace = await locked_workspace(session, user, project.workspace_id, "editor")
    await session.refresh(project, with_for_update=True)
    require_pro(workspace)
    if project.confirmed_revision != project.revision:
        raise HTTPException(409, "Confirm the current project profile before evaluation")
    call = await session.get(FundingCall, body.call_id)
    if call is None or call.status != "published":
        raise HTTPException(409, "A human-published current call is required")
    result = evaluate_rules(project.profile, call.rules, utcnow(), call.opens_at, call.deadline)
    evaluation = Evaluation(
        workspace_id=project.workspace_id,
        project_id=project.id,
        profile_revision=project.revision,
        call_id=call.id,
        call_version=call.version,
        source_revision_id=call.source_revision_id,
        rule_version=call.rule_version,
        evaluated_at=datetime.fromisoformat(result["evaluated_at"]),
        result=result,
    )
    session.add(evaluation)
    await session.flush()
    record_event(
        session,
        project.workspace_id,
        user.id,
        "funding.evaluated",
        project_id=project.id,
        detail={"evaluation_id": evaluation.id, "eligibility": result["eligibility"]},
    )
    await session.commit()
    return evaluation_wire(evaluation, project.revision)


@router.get("/projects/{project_id}/evaluations")
async def project_evaluations(
    project_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    project = await project_access(session, user, project_id)
    values = (
        await session.scalars(
            select(Evaluation)
            .where(Evaluation.project_id == project_id)
            .order_by(Evaluation.evaluated_at.desc(), Evaluation.id.desc())
        )
    ).all()
    return [evaluation_wire(value, project.revision) for value in values]


@router.get("/evaluations/{evaluation_id}")
async def evaluation_detail(
    evaluation_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    evaluation = await session.get(Evaluation, evaluation_id)
    if evaluation is None:
        raise HTTPException(404, "Evaluation not found")
    project = await project_access(session, user, evaluation.project_id)
    return evaluation_wire(evaluation, project.revision)


@router.post("/evaluations/{evaluation_id}/review", status_code=201)
async def review_evaluation(
    evaluation_id: str,
    body: ReviewRequest,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    original = await session.get(Evaluation, evaluation_id)
    if original is None:
        raise HTTPException(404, "Evaluation not found")
    project = await project_access(session, user, original.project_id, "reviewer")
    workspace = await locked_workspace(session, user, project.workspace_id, "reviewer")
    await session.refresh(project, with_for_update=True)
    require_pro(workspace)
    call = await session.get(FundingCall, original.call_id)
    now = utcnow()
    if (
        project.revision != original.profile_revision
        or project.confirmed_revision != project.revision
        or call.status != "published"
    ):
        raise HTTPException(409, "Evaluate the current confirmed profile and published call first")
    if call.deadline and now > call.deadline:
        raise HTTPException(409, "Closed calls cannot be approved")
    if call.opens_at and now < call.opens_at:
        raise HTTPException(409, "Call has not opened")
    result = copy.deepcopy(original.result)
    conditions = {item["id"]: item for item in result["conditions"]}
    if len({item.condition_id for item in body.decisions}) != len(body.decisions):
        raise HTTPException(422, "Duplicate decisions")
    for decision in body.decisions:
        condition = conditions.get(decision.condition_id)
        if (
            condition is None
            or condition["status"] != "review"
            or decision.condition_id == "call_not_open"
        ):
            raise HTTPException(
                422,
                "Only unresolved source interpretation conditions can be reviewed; missing facts cannot be overridden",
            )
        condition["status"] = "pass" if decision.approved else "fail"
        condition["review"] = {
            "actor_id": user.id,
            "approved": decision.approved,
            "notes": decision.notes,
            "reviewed_at": now.isoformat(),
        }
    result.update(
        eligibility=eligibility_from_conditions(result["conditions"]),
        reviewed_from=original.id,
        evaluated_at=now.isoformat(),
    )
    reviewed = Evaluation(
        workspace_id=original.workspace_id,
        project_id=original.project_id,
        profile_revision=original.profile_revision,
        call_id=original.call_id,
        call_version=original.call_version,
        source_revision_id=original.source_revision_id,
        rule_version=original.rule_version,
        evaluated_at=now,
        result=result,
    )
    session.add(reviewed)
    await session.flush()
    record_event(
        session,
        project.workspace_id,
        user.id,
        "funding.reviewed",
        project_id=project.id,
        detail={"evaluation_id": reviewed.id, "original_id": original.id},
    )
    await session.commit()
    return evaluation_wire(reviewed, project.revision)


@router.get("/admin/sources")
async def pending_sources(
    user: User = Depends(require_admin), session: AsyncSession = Depends(get_session)
):
    sources = (
        await session.scalars(
            select(SourceRevision)
            .where(SourceRevision.publication_status == "pending")
            .order_by(SourceRevision.checked_at.desc())
        )
    ).all()
    calls = (await session.scalars(select(FundingCall).where(FundingCall.status == "draft"))).all()
    return [
        source_wire(source)
        | {"draft_call_ids": [call.id for call in calls if call.source_revision_id == source.id]}
        for source in sources
    ]


def snapshot_text(snapshot: dict) -> str:
    raw = base64.b64decode(snapshot["content_base64"], validate=True)
    if raw.startswith(b"%PDF"):
        from io import BytesIO

        from pypdf import PdfReader

        return "\n".join(page.extract_text() or "" for page in PdfReader(BytesIO(raw)).pages)
    return raw.decode("utf-8", errors="replace")


@router.get("/admin/sources/{source_id}/diff")
async def source_diff(
    source_id: str,
    user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    source = await session.get(SourceRevision, source_id)
    if source is None:
        raise HTTPException(404, "Source not found")
    previous = (
        await session.scalars(
            select(SourceRevision)
            .where(
                SourceRevision.program_id == source.program_id,
                SourceRevision.version < source.version,
            )
            .order_by(SourceRevision.version.desc())
            .limit(1)
        )
    ).first()

    def text(value):
        if value is None:
            return []
        return "\n".join(
            x["url"] + "\n" + snapshot_text(x) for x in json.loads(value.content)
        ).splitlines()

    # Extraction is CPU-bound; network watcher never parses legal text into rules.
    before, after = await asyncio.gather(
        asyncio.to_thread(text, previous), asyncio.to_thread(text, source)
    )
    diff = "\n".join(
        difflib.unified_diff(
            before,
            after,
            fromfile=f"v{previous.version if previous else 0}",
            tofile=f"v{source.version}",
            n=3,
        )
    )
    calls = (
        await session.scalars(
            select(FundingCall).where(
                FundingCall.source_revision_id == source.id, FundingCall.status == "draft"
            )
        )
    ).all()
    return {
        "source": source_wire(source),
        "previous_source_id": previous.id if previous else None,
        "diff": diff[:500000],
        "diff_truncated": len(diff) > 500000,
        "draft_call_ids": [call.id for call in calls],
        "source_contents": [
            {"url": x["url"], "sha256": x["sha256"], "media_type": x.get("media_type")}
            for x in json.loads(source.content)
        ],
    }


@router.put("/admin/calls/{call_id}/draft")
async def amend_draft(
    call_id: str,
    body: DraftRequest,
    user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    call = await session.get(FundingCall, call_id, with_for_update=True)
    if call is None or call.status != "draft":
        raise HTTPException(409, "Only unpublished drafts can be edited")
    source = await session.get(SourceRevision, call.source_revision_id)
    validate_source_links(body.definition, source)
    for key, value in body.definition.model_dump(mode="python").items():
        setattr(call, key, value)
    call.validated_source_sha256 = source.sha256
    await session.commit()
    return call_wire(call)


def validate_source_links(definition: CallDefinition, source: SourceRevision):
    captured = {x["url"] for x in json.loads(source.content)}
    evidence = (
        [x.source_url for x in definition.rules]
        + [x.source_url for x in definition.template.sections]
        + [x.source_url for x in definition.template.documents]
        + [definition.finance.source_url]
    )
    if any(url not in captured for url in evidence):
        raise HTTPException(
            422,
            "Each rule, fieldset, requirement and finance source must be captured in this immutable source revision",
        )


@router.post("/admin/calls/{call_id}/publish")
async def publish_call(
    call_id: str,
    body: PublishRequest,
    user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    call = await session.get(FundingCall, call_id)
    if call is None:
        raise HTTPException(404, "Call not found")
    # Lock the program to serialize publication and watcher version allocation.
    await session.get(Program, call.program_id, with_for_update=True)
    await session.refresh(call, with_for_update=True)
    if call.status != "draft":
        raise HTTPException(409, "Only draft calls can be published")
    source = await session.get(SourceRevision, call.source_revision_id)
    definition = CallDefinition.model_validate(call_definition(call))
    validate_source_links(definition, source)
    if call.validated_source_sha256 != source.sha256:
        raise HTTPException(
            409,
            "Source changed: inspect diff and explicitly review/update draft rules before publication",
        )
    for old in (
        await session.scalars(
            select(FundingCall).where(
                FundingCall.program_id == call.program_id, FundingCall.status == "published"
            )
        )
    ).all():
        old.status = "archived"
    now = utcnow()
    call.status, call.published_by, call.published_at = "published", user.id, now
    source.publication_status, source.published_by, source.published_at = "published", user.id, now
    await session.commit()
    return call_wire(call)


def load_seed_catalog(path: Path | None = None) -> dict:
    path = path or Path(__file__).resolve().parents[1] / "data" / "programs.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    registry = data.pop("source_snapshots")
    for entry in data["programs"]:
        entry["sources"] = [registry[source_id] for source_id in entry.pop("source_ids")]
    return data


async def seed_programs(path: Path | None = None) -> list[str]:
    data = load_seed_catalog(path)
    created = []
    async with AsyncSessionLocal() as session:
        from sqlalchemy import text

        await session.execute(text("SELECT pg_advisory_xact_lock(82401625)"))
        for entry in data["programs"]:
            if (
                await session.scalars(select(Program).where(Program.code == entry["code"]))
            ).first():
                continue
            definition = CallDefinition.model_validate(entry["call"])
            snapshots = entry["sources"]
            from .source_watch import validate_url

            for snapshot in snapshots:
                validate_url(snapshot["url"])
                raw = base64.b64decode(snapshot["content_base64"], validate=True)
                if (
                    not raw
                    or len(raw) > 2097152
                    or hashlib.sha256(raw).hexdigest() != snapshot["sha256"]
                ):
                    raise ValueError(f"Invalid real-source content for {entry['code']}")
            digest = source_digest(snapshots)
            program = Program(
                **{
                    key: entry[key]
                    for key in (
                        "code",
                        "name",
                        "institution",
                        "country",
                        "support_type",
                        "description",
                        "official_url",
                    )
                }
            )
            session.add(program)
            await session.flush()
            source = SourceRevision(
                program_id=program.id,
                version=1,
                source_url=snapshots[0]["url"],
                sha256=digest,
                content=json.dumps(snapshots, ensure_ascii=False, separators=(",", ":")),
                checked_at=datetime.fromisoformat(entry["checked_at"]),
                publication_status="pending",
            )
            session.add(source)
            await session.flush()
            validate_source_links(definition, source)
            call = FundingCall(
                program_id=program.id,
                version=1,
                status="draft",
                source_revision_id=source.id,
                validated_source_sha256=digest,
                **definition.model_dump(mode="python"),
            )
            session.add(call)
            created.append(entry["code"])
        await session.commit()
    return created


async def cli():
    parser = argparse.ArgumentParser(
        description="Seed pending official-source programs, or fetch source updates as drafts"
    )
    parser.add_argument("command", choices=["seed", "watch-once", "watch"])
    parser.add_argument("--interval", type=int, default=86400)
    args = parser.parse_args()
    if args.command == "seed":
        print(
            json.dumps(
                {
                    "created_pending_programs": await seed_programs(),
                    "publication": "Explicit human admin required",
                }
            )
        )
    else:
        from .source_watch import watch_once

        if args.interval < 300:
            parser.error("Watch interval must be at least 300 seconds")
        while True:
            print(json.dumps(await watch_once()))
            if args.command == "watch-once":
                break
            await asyncio.sleep(args.interval)


if __name__ == "__main__":
    asyncio.run(cli())
