import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from backend.schemas import FundCatalogItem, FundMatchResult
from backend.settings import settings

from .llm import call_llm

logger = logging.getLogger(__name__)

FUNDS_CATALOG_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "funds.json"


@lru_cache
def get_funds_catalog() -> list[FundCatalogItem]:
    if not FUNDS_CATALOG_PATH.exists():
        raise FileNotFoundError(f"Funds catalog file not found: {FUNDS_CATALOG_PATH}")
    raw = json.loads(FUNDS_CATALOG_PATH.read_text(encoding="utf-8"))
    items = [FundCatalogItem.model_validate(item) for item in raw]
    ids = [item.id for item in items]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate fund id found in funds catalog")
    return items


async def run_fund_matcher(description: str) -> list[dict[str, Any]]:
    catalog = get_funds_catalog()
    funds_context = [
        {
            "id": f.id,
            "code": f.code,
            "description": f.description,
            "institution": f.institution,
        }
        for f in catalog
    ]

    schema = {
        "name": "fund_matches",
        "schema": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "fundId": {"type": "string"},
                    "score": {"type": "integer", "minimum": 0, "maximum": 100},
                    "rationale": {"type": "string"},
                    "eligibilityStatus": {
                        "type": "string",
                        "enum": ["eligible", "conditional", "ineligible"],
                    },
                },
                "required": ["fundId", "score", "rationale", "eligibilityStatus"],
                "additionalProperties": False,
            },
        },
    }

    prompt = (
        "You are a grant eligibility assessor for Turkish programs. "
        "Score each available fund for the given project description. "
        "Return a JSON array following the provided schema, one entry per fund, with rationale grounded in the description."
    )

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": prompt},
        {
            "role": "user",
            "content": json.dumps(
                {
                    "project_description": description,
                    "funds": funds_context,
                    "instructions": [
                        "Provide a score 0-100 for every fund id supplied.",
                        "Use concise rationales referencing description keywords.",
                        "Mark eligibilityStatus as eligible, conditional, or ineligible.",
                    ],
                }
            ),
        },
    ]

    data = await call_llm(
        messages,
        response_format="json_schema",
        model=settings.openai_fund_model,
        json_schema=schema,
    )

    if not isinstance(data, list):
        return []

    valid_fund_ids = {f.id for f in catalog}
    cleaned: list[dict[str, Any]] = []
    for item in data:
        try:
            match = FundMatchResult.model_validate(item)
            if match.fundId in valid_fund_ids:
                cleaned.append(match.model_dump())
            else:
                logger.warning("Discarding unknown fundId: %s", match.fundId)
        except (ValidationError, KeyError, TypeError, ValueError) as exc:
            logger.warning("Discarding invalid fund match item: %s", exc)
            continue
    return cleaned
