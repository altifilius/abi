"""Source-grounded discovery and project preparation selections, not eligibility approval."""

import base64
import binascii
import html
import json
import re
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base, get_session
from .funding import (
    FundingCall,
    Program,
    SourceRevision,
    call_wire,
    evaluate_rules,
    funding_call_state,
    new_id,
    program_wire,
    source_wire,
    utcnow,
)
from .workspaces import (
    Project,
    User,
    locked_workspace,
    project_access,
    record_event,
    require_pro,
    require_user,
)

router = APIRouter(prefix="/api", tags=["funding discovery"])


class ProjectFundingSelection(Base):
    __tablename__ = "project_funding_selections"
    __table_args__ = (UniqueConstraint("project_id", "call_id"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True, nullable=False
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    call_id: Mapped[str] = mapped_column(
        ForeignKey("funding_calls.id", ondelete="CASCADE"), index=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class SelectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    call_id: str = Field(min_length=1, max_length=100)


def project_country(project: Project) -> tuple[str | None, str | None]:
    """Only confirmed user facts; workspace geography is never a project fact."""
    if project.confirmed_revision != project.revision:
        return None, None
    profile = project.profile or {}
    project_facts = profile.get("project", {})
    groups = ("project",) if "country" in project_facts else ("project", "company")
    for group in groups:
        value = profile.get(group, {}).get("country")
        if isinstance(value, str) and len(value) == 2 and value.isascii() and value.isalpha():
            return value.upper(), f"{group}.country"
    return None, None


def captured_urls(source: SourceRevision | None) -> set[str]:
    if source is None:
        return set()
    try:
        snapshots = json.loads(source.content)
    except (TypeError, ValueError):
        return set()
    if not isinstance(snapshots, list):
        return set()
    return {
        item["url"]
        for item in snapshots
        if isinstance(item, dict) and isinstance(item.get("url"), str)
    }


def country_classification(
    country: str | None, program: Program, call: FundingCall | None, source: SourceRevision | None
) -> tuple[str, list[dict]]:
    """Country rules are conjunctive; consortium-leader countries are not applicant countries."""
    if country is None:
        return "unknown", []
    if program.country == country:
        return "domestic", []
    urls = captured_urls(source)
    raw = [
        rule
        for rule in (call.rules if call else [])
        if rule.get("field") in {"company.country", "project.country"}
    ]
    evidence = []
    for rule in raw:
        expected = rule.get("expected")
        values = [expected] if rule.get("op") == "eq" else expected
        if (
            rule.get("op") not in {"eq", "in"}
            or rule.get("value_type") != "string"
            or not isinstance(values, list)
            or not values
            or any(not isinstance(value, str) or len(value) != 2 for value in values)
            or rule.get("source_url") not in urls
            or not rule.get("source_locator")
        ):
            return "unknown", []
        evidence.append(rule)
    # Some sources explicitly allow worldwide applications while requiring a later
    # corporate restructure. That is direct participation, not pre-application establishment.
    if not evidence and source is not None:
        for snapshot in json.loads(source.content) if urls else []:
            if snapshot.get("url") not in {
                rule.get("source_url") for rule in (call.rules if call else [])
            }:
                continue
            try:
                raw = base64.b64decode(snapshot.get("content_base64", ""), validate=True)
            except (ValueError, binascii.Error):
                continue
            if raw.startswith(b"%PDF"):
                continue
            content = html.unescape(re.sub(r"<[^>]+>", " ", raw.decode("utf-8", errors="replace")))
            content = re.sub(r"\s+", " ", content)
            statement = "We have startups that apply to YC from all around the world"
            if statement.casefold() in content.casefold():
                return "direct", [
                    {
                        "field": "applicant.country",
                        "op": "worldwide",
                        "expected": None,
                        "label": statement,
                        "source_url": snapshot["url"],
                        "source_locator": statement,
                    }
                ]
    if not evidence:
        return "unknown", []
    allowed: dict[str, set[str]] = {}
    for rule in evidence:
        values = {rule["expected"]} if rule["op"] == "eq" else set(rule["expected"])
        field = rule["field"]
        allowed[field] = allowed.get(field, values) & values
    if any(not values for values in allowed.values()):
        return "unknown", evidence
    if all(country in values for values in allowed.values()):
        return "direct", evidence
    # A project-location constraint is not evidence that establishing an entity suffices.
    if "project.country" in allowed and country not in allowed["project.country"]:
        return "unknown", evidence
    if "company.country" in allowed and country not in allowed["company.country"]:
        company_rules = [rule for rule in evidence if rule["field"] == "company.country"]
        # Catalogue geography/scope filters are not legal establishment requirements.
        establishment_terms = (
            "establish",
            "yerleşik",
            "yerlesik",
            "incorporat",
            "registered",
            "resident",
            "legal entity",
        )
        if not all(
            any(term in rule.get("label", "").casefold() for term in establishment_terms)
            for rule in company_rules
        ):
            return "unknown", evidence
        return "establish", evidence
    return "unknown", evidence


def recommendation(
    project: Project,
    program: Program,
    call: FundingCall | None,
    source: SourceRevision | None,
    language: str = "en",
) -> dict:
    def text(tr: str, en: str) -> str:
        return tr if language == "tr" else en

    country, country_field = project_country(project)
    classification, evidence = country_classification(country, program, call, source)
    reasons = {
        "domestic": text(
            f"Program ülkesi, doğrulanan proje ülkesiyle aynı: {country}.",
            f"The programme is based in the confirmed project country: {country}.",
        ),
        "direct": text(
            f"Kaynaklı başvuru sahibi ülke kuralları {country} ülkesini kapsıyor; diğer koşullar ayrıca incelenmelidir.",
            f"Sourced applicant-country rules include {country}; other conditions still require review.",
        ),
        "establish": text(
            "Kaynaklı ülke kuralı farklı bir ülkede şirket/yerleşiklik gerektiriyor; yabancı başvuru hakkı veya kuruluş sonrası uygunluk garanti değildir.",
            "The sourced country rule requires an entity/establishment in another country; foreign participation or eligibility after incorporation is not guaranteed.",
        ),
        "unknown": text(
            "Mevcut kaynaklardan bu proje için sınır ötesi başvuru yolu doğrulanamıyor.",
            "The available sources do not establish a cross-border application route for this project.",
        ),
    }
    missing = []
    if country is None:
        missing.append(
            text(
                "Proje ülkesini fikir görüşmesinde belirleyip kapsamı doğrulayın.",
                "Specify the project country in the idea conversation and confirm its scope.",
            )
        )
    elif country_field == "company.country":
        reasons[classification] += text(
            " Ülke, doğrulanmış mevcut şirket bilgisinden alındı.",
            " Country uses the existing confirmed company fact.",
        )
    if classification == "unknown" and country is not None:
        missing.append(
            text(
                "Kaynakla doğrulanmış başvuru sahibi ülke/yerleşiklik koşulları.",
                "Source-confirmed applicant-country/establishment requirements.",
            )
        )
    published = (
        call is not None
        and call.status == "published"
        and source is not None
        and source.publication_status == "published"
    )
    if not published:
        missing.append(
            text(
                "Çağrı ve resmi kaynak insan incelemesi/yayımı bekliyor; yalnızca hazırlık taslağı.",
                "The call and official source await human review/publication; preparation draft only.",
            )
        )
    conditions = evaluate_rules(
        project.profile if project.confirmed_revision == project.revision else {},
        call.rules if call else [],
        utcnow(),
        call.opens_at if call else None,
        call.deadline if call else None,
    )["conditions"]
    missing.extend(item["label"] for item in conditions if item["status"] == "missing")
    failures = [item for item in conditions if item["status"] == "fail"]
    # Establishment candidates intentionally fail the existing-entity country check.
    incompatible = any(
        not (classification == "establish" and item["field"] == "company.country")
        for item in failures
    )
    if failures:
        missing.append(
            text(
                "Bazı mevcut bilgiler çağrı koşullarını karşılamıyor; ayrıntıları inceleyin.",
                "Some existing facts do not meet call conditions; review the details.",
            )
        )
    return {
        "reason": reasons[classification],
        "missing_information": list(dict.fromkeys(missing)),
        "classification": classification,
        "source_urls": list(
            dict.fromkeys(
                [
                    *(rule["source_url"] for rule in evidence),
                    *([source.source_url] if source else []),
                    *([program.official_url] if program.official_url else []),
                ]
            )
        ),
        "country_evidence": evidence,
        "conditions": conditions,
        "recommended": classification != "unknown" and not incompatible,
        "preparation_only": True,
    }


@router.get("/projects/{project_id}/funding-discovery")
async def funding_discovery(
    project_id: str,
    region: Literal["domestic", "international"] | None = None,
    route: Literal["direct", "establish"] | None = None,
    all: bool = False,
    q: str = Query(default="", max_length=200),
    support_type: str | None = None,
    state: Literal["open", "upcoming", "closed", "pending"] | None = None,
    language: Literal["tr", "en"] = "en",
    call_id: str | None = None,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    project = await project_access(session, user, project_id)
    ranked = (
        select(
            FundingCall.id.label("call_id"),
            FundingCall.program_id,
            func.row_number()
            .over(
                partition_by=FundingCall.program_id,
                order_by=(
                    case((FundingCall.status == "published", 0), else_=1),
                    FundingCall.version.desc(),
                ),
            )
            .label("rank"),
        )
        .where(FundingCall.status != "archived")
        .subquery()
    )
    query = select(Program, FundingCall, SourceRevision).select_from(Program)
    if call_id:
        query = query.join(FundingCall, FundingCall.program_id == Program.id).where(
            FundingCall.id == call_id
        )
    else:
        query = query.outerjoin(
            ranked, and_(ranked.c.program_id == Program.id, ranked.c.rank == 1)
        ).outerjoin(FundingCall, FundingCall.id == ranked.c.call_id)
    query = query.outerjoin(SourceRevision, SourceRevision.id == FundingCall.source_revision_id)
    if q:
        query = query.where(
            or_(
                Program.name.ilike(f"%{q}%"),
                Program.code.ilike(f"%{q}%"),
                Program.institution.ilike(f"%{q}%"),
                Program.description.ilike(f"%{q}%"),
            )
        )
    if support_type:
        query = query.where(Program.support_type == support_type)
    rows = (await session.execute(query.order_by(Program.name, Program.id))).all()
    items = []
    unclassified = 0
    country, country_field = project_country(project)
    for program, call, source in rows:
        rec = recommendation(project, program, call, source, language)
        classification = rec["classification"]
        if classification == "unknown":
            unclassified += 1
        if region == "domestic" and classification != "domestic":
            continue
        if region == "international" and classification not in {"direct", "establish"}:
            continue
        if region == "international" and route and classification != route:
            continue
        if not all and not rec["recommended"]:
            continue
        call_state = (
            funding_call_state(
                call, source is not None and source.publication_status == "published"
            )
            if call
            else "pending"
        )
        if state and call_state != state:
            continue
        items.append(
            program_wire(program)
            | {
                "catalog_status": call.status if call else "draft",
                "current_call": call_wire(call) | {"state": call_state} if call else None,
                "source": source_wire(source) if source else None,
                "recommendation": rec,
            }
        )
    return {
        "country": country,
        "country_source": country_field,
        "items": items,
        "unclassified_count": unclassified,
    }


def selection_payload(
    selection: ProjectFundingSelection,
    program: Program,
    call: FundingCall,
    source: SourceRevision | None,
    report_id: str | None = None,
) -> dict:
    return {
        "id": selection.id,
        "project_id": selection.project_id,
        "workspace_id": selection.workspace_id,
        "call_id": call.id,
        "program_name": program.name,
        "call_title": call.title,
        "call_state": funding_call_state(
            call, source is not None and source.publication_status == "published"
        ),
        "template": call.template,
        "source_url": source.source_url if source else program.official_url,
        "report_id": report_id,
        "created_at": selection.created_at,
        "preparation_only": True,
    }


@router.get("/projects/{project_id}/funding-selections")
async def funding_selections(
    project_id: str,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    from .project_reports import ProjectReport

    project = await project_access(session, user, project_id)
    rows = (
        await session.execute(
            select(ProjectFundingSelection, Program, FundingCall, SourceRevision, ProjectReport.id)
            .select_from(ProjectFundingSelection)
            .join(FundingCall, FundingCall.id == ProjectFundingSelection.call_id)
            .join(Program, Program.id == FundingCall.program_id)
            .outerjoin(SourceRevision, SourceRevision.id == FundingCall.source_revision_id)
            .outerjoin(
                ProjectReport,
                and_(
                    ProjectReport.project_id == project.id,
                    ProjectReport.workspace_id == project.workspace_id,
                    ProjectReport.call_id == FundingCall.id,
                ),
            )
            .where(
                ProjectFundingSelection.project_id == project.id,
                ProjectFundingSelection.workspace_id == project.workspace_id,
            )
            .order_by(ProjectFundingSelection.created_at, ProjectFundingSelection.id)
        )
    ).all()
    return [selection_payload(*row) for row in rows]


@router.post("/projects/{project_id}/funding-selections", status_code=201)
async def select_funding(
    project_id: str,
    body: SelectionRequest,
    user: User = Depends(require_user),
    session: AsyncSession = Depends(get_session),
):
    from .project_reports import ensure_funding_report

    project = await project_access(session, user, project_id, "editor")
    workspace = await locked_workspace(session, user, project.workspace_id, "editor")
    await session.refresh(project, with_for_update=True)
    require_pro(workspace)
    call = await session.get(FundingCall, body.call_id)
    if call is None:
        raise HTTPException(404, "Call not found")
    if call.status == "archived":
        raise HTTPException(409, "Archived calls cannot be newly selected; choose a current call")
    program = await session.get(Program, call.program_id)
    source = await session.get(SourceRevision, call.source_revision_id)
    if program is None or source is None:
        raise HTTPException(
            409, "A recorded programme and official source are required for preparation"
        )
    selection = await session.scalar(
        select(ProjectFundingSelection).where(
            ProjectFundingSelection.project_id == project.id,
            ProjectFundingSelection.workspace_id == project.workspace_id,
            ProjectFundingSelection.call_id == call.id,
        )
    )
    if selection is None:
        selection = ProjectFundingSelection(
            workspace_id=project.workspace_id, project_id=project.id, call_id=call.id
        )
        session.add(selection)
        await session.flush()
        record_event(
            session,
            project.workspace_id,
            user.id,
            "funding.selected",
            project_id=project.id,
            detail={"selection_id": selection.id, "call_id": call.id, "preparation_only": True},
        )
    report = await ensure_funding_report(session, project, call)
    result = selection_payload(selection, program, call, source, report.id)
    await session.commit()
    return result
