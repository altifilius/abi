from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class IdeaRequest(BaseModel):
    idea_text: str
    stage: Optional[str] = Field(default=None, description="idea | mvp | scale")
    sector: Optional[str] = None
    budget: Optional[str] = None


class IdeaProfile(BaseModel):
    sector: Optional[str]
    target_customer: Optional[str]
    problem: Optional[str]
    solution: Optional[str]
    revenue_model: Optional[str]
    current_stage: Optional[str]
    main_risks: List[str] = []
    constraints: Dict[str, Any] = {}


class DimensionReport(BaseModel):
    dimension: str
    score: Optional[int] = None
    diagnosis: Optional[str] = None
    recommended_actions: List[str] = []
    risks: List[str] = []
    notes: Optional[str] = None


class AnalyzeIdeaResponse(BaseModel):
    idea_profile: IdeaProfile
    summary: str
    next_steps: List[str]
    dimension_reports: List[DimensionReport]


class IdeaChatMessage(BaseModel):
    role: str
    text: str


class IdeaChatRequest(BaseModel):
    messages: List[IdeaChatMessage]
    mode: str = Field(default="chat", description="chat | summary")


class IdeaChatResponse(BaseModel):
    reply: str


class FundMatcherRequest(BaseModel):
    description: str = Field(..., description="Project 1-pager or summary text")


class FundMatchResult(BaseModel):
    fundId: str
    score: int
    rationale: str
    eligibilityStatus: str


class FundMatcherResponse(BaseModel):
    matches: List[FundMatchResult]
