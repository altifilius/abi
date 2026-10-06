from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class IdeaRequest(ApiModel):
    idea_text: str = Field(min_length=1, max_length=20_000)
    stage: Literal["idea", "mvp", "scale"] | None = None
    sector: str | None = Field(default=None, max_length=200)
    budget: str | None = Field(default=None, max_length=200)


class IdeaProfile(ApiModel):
    sector: str | None = None
    target_customer: str | None = None
    problem: str | None = None
    solution: str | None = None
    revenue_model: str | None = None
    current_stage: str | None = None
    main_risks: list[str] = Field(default_factory=list)
    constraints: dict[str, Any] = Field(default_factory=dict)


class DimensionReport(ApiModel):
    dimension: str
    score: int | None = Field(default=None, ge=0, le=10)
    diagnosis: str | None = None
    recommended_actions: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    notes: str | None = None

class PlaybookStageActions(ApiModel):
    idea: list[str] = Field(default_factory=list)
    mvp: list[str] = Field(default_factory=list)
    scale: list[str] = Field(default_factory=list)


class DimensionPlaybookData(ApiModel):
    dimension: str
    key_questions: list[str] = Field(default_factory=list)
    common_mistakes: list[str] = Field(default_factory=list)
    recommended_actions_by_stage: PlaybookStageActions = Field(
        default_factory=PlaybookStageActions
    )



class AnalyzeIdeaResponse(ApiModel):
    idea_profile: IdeaProfile
    summary: str
    next_steps: list[str]
    dimension_reports: list[DimensionReport]


class IdeaChatMessage(ApiModel):
    role: Literal["user", "assistant", "model"]
    text: str = Field(min_length=1, max_length=12_000)


class IdeaChatRequest(ApiModel):
    messages: list[IdeaChatMessage] = Field(min_length=1, max_length=50)
    mode: Literal["chat", "summary"] = "chat"
    language: Literal["en", "tr"] | None = None
    project_context: str | None = Field(default=None, max_length=2_000)
    stream: bool = False


class IdeaChatResponse(ApiModel):
    reply: str


class FundMatcherRequest(ApiModel):
    description: str = Field(min_length=1, max_length=20_000)


class FundMatchResult(ApiModel):
    fundId: str = Field(min_length=1, max_length=100)
    score: int = Field(ge=0, le=100)
    rationale: str = Field(max_length=4_000)
    eligibilityStatus: Literal["eligible", "conditional", "ineligible"]


class FundMatcherResponse(ApiModel):
    matches: list[FundMatchResult]


class FundCatalogItem(ApiModel):
    id: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)
    institution: Literal["TUBITAK", "KOSGEB", "EU"]
    description: str = Field(min_length=1, max_length=2_000)
    maxBudget: str = Field(min_length=1, max_length=100)
    supportRate: str = Field(min_length=1, max_length=100)
