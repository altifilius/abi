"""Strict source-grounded report schemas (workspace AI requests live in ai.py)."""

from pydantic import BaseModel, ConfigDict, Field


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class PlaybookStageActions(ApiModel):
    idea: list[str]
    mvp: list[str]
    scale: list[str]


class DimensionPlaybookData(ApiModel):
    dimension: str = Field(min_length=1)
    key_questions: list[str]
    common_mistakes: list[str]
    recommended_actions_by_stage: PlaybookStageActions


class EvidenceCitation(ApiModel):
    chunk_id: str = Field(min_length=1)
    quote: str = Field(min_length=1, max_length=1200)


class DimensionReport(ApiModel):
    dimension: str = Field(min_length=1)
    score: int | None = Field(ge=0, le=10)
    diagnosis: str = Field(min_length=1)
    recommended_actions: list[str]
    risks: list[str]
    notes: str = Field(min_length=1)
    citations: list[EvidenceCitation] = Field(min_length=1)


class ReportSummary(ApiModel):
    summary: str = Field(min_length=1)
    next_steps: list[str]
