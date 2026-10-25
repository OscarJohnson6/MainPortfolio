from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field, model_validator

from projects.explain import analyze

router = APIRouter()


class EngineSettings(BaseModel):
    recognizeConstants: bool = True
    piMode: Literal["exact", "full", "3.14", "3"] = "exact"
    logBase: Literal["10", "e"] = "10"


class LimitQuery(BaseModel):
    id: str = Field(max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    target: Literal["inf", "-inf"] | float
    side: Literal["both", "left", "right"] = "both"


class Interval(BaseModel):
    a: float
    b: float


class Scan(BaseModel):
    min: float = -20
    max: float = 20

    @model_validator(mode="after")
    def check_range(self) -> "Scan":
        # Every scan samples 4000 points, so a huge range only loses detail.
        if not (self.min < self.max and self.max - self.min <= 2000):
            raise ValueError("scan.min must be below scan.max, at most 2000 apart")
        return self


class AnalyzeRequest(BaseModel):
    expression: str = Field(max_length=500)
    params: dict[str, float | None] = Field(default_factory=dict)
    settings: EngineSettings = Field(default_factory=EngineSettings)
    limits: list[LimitQuery] = Field(default_factory=list, max_length=20)
    points: list[float] = Field(default_factory=list, max_length=20)
    interval: Interval | None = None
    scan: Scan = Field(default_factory=Scan)


# A plain `def` so FastAPI runs the CPU-heavy analysis in its thread pool
# instead of blocking the event loop.
@router.post("/analyze")
def analyze_expression(payload: AnalyzeRequest) -> dict:
    request = payload.model_dump()
    try:
        return analyze(request)
    except Exception as exc:  # noqa: BLE001 — report engine bugs to the UI instead of a bare 500
        return {
            "ok": False,
            "engine": "python",
            "input": payload.expression,
            "diagnostics": [{
                "level": "error",
                "code": "engine-error",
                "message": f"The analysis engine hit an internal error ({type(exc).__name__}). Try a different form of the input.",
            }],
            "steps": [],
            "sections": [],
            "notices": [],
        }
