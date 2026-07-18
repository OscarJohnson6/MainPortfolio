from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from projects.finance_lab.simulator import simulate_scenario
from projects.finance_lab.storage import read_json, safe_id, write_json_locked

# File location assumes this file lives at backend/routers/finance_lab.py
BACKEND_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BACKEND_DIR / "data" / "finance_lab"
SCENARIOS_DIR = DATA_DIR / "scenarios"
PRICE_CACHE_DIR = DATA_DIR / "price_cache"
USAGE_PATH = DATA_DIR / "usage" / "refresh_usage.json"

for directory in (SCENARIOS_DIR, PRICE_CACHE_DIR, USAGE_PATH.parent):
    directory.mkdir(parents=True, exist_ok=True)

router = APIRouter()


class Position(BaseModel):
    id: str | None = None
    symbol: str
    buyDate: str
    inputMode: str = "dollars"
    inputAmount: float = Field(default=0, ge=0)
    thesis: str | None = ""


class Scenario(BaseModel):
    id: str | None = None
    title: str = "Untitled stock test"
    description: str | None = ""
    startingCash: float = Field(default=10_000, ge=0)
    cashPolicy: str = "strict"
    benchmarkSymbol: str = "VOO"
    positions: list[Position] = Field(default_factory=list)
    events: list[dict] = Field(default_factory=list)
    createdAt: str | None = None
    updatedAt: str | None = None


class SimulatePayload(BaseModel):
    scenario: Scenario
    forceRefresh: bool = False


def scenario_path(scenario_id: str) -> Path:
    return SCENARIOS_DIR / f"{safe_id(scenario_id, 'scenario id')}.json"


def normalize_scenario_dict(scenario: Scenario) -> dict:
    now = datetime.now().isoformat(timespec="seconds")
    item = scenario.model_dump()
    item["id"] = item.get("id") or f"scenario_{uuid4().hex}"
    item["createdAt"] = item.get("createdAt") or now
    item["updatedAt"] = now
    return item


def has_refresh_access(key: str | None) -> bool:
    expected = os.getenv("FINANCE_LAB_REFRESH_SECRET") or os.getenv("ADMIN_SECRET")
    if not expected:
        return False
    return bool(key) and key == expected


def public_refresh_allowed(request: Request) -> bool:
    """
    Small quota guard for future expensive refresh calls.
    Current simulator uses cached/demo data, so this is mainly a ready boundary.
    """
    ip = request.client.host if request.client else "unknown"
    today = datetime.now().strftime("%Y-%m-%d")
    usage = read_json(USAGE_PATH, {})
    bucket = usage.setdefault(today, {})
    count = int(bucket.get(ip, 0))
    if count >= 8:
        return False
    bucket[ip] = count + 1
    write_json_locked(USAGE_PATH, usage)
    return True


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "finance-lab"}


@router.post("/simulate")
def simulate(payload: SimulatePayload, request: Request, x_finance_lab_key: str | None = Header(default=None)) -> dict:
    # If you later add force-refresh market calls, gate that branch here.
    if payload.forceRefresh and not (has_refresh_access(x_finance_lab_key) or public_refresh_allowed(request)):
        raise HTTPException(
            status_code=403,
            detail="Fresh market data refresh limit reached. Use cached data or enter a Finance Lab refresh key.",
        )

    try:
        return simulate_scenario(payload.scenario.model_dump(), PRICE_CACHE_DIR)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/scenarios")
def list_scenarios() -> list[dict]:
    items = []
    for path in sorted(SCENARIOS_DIR.glob("*.json")):
        item = read_json(path, None)
        if item:
            items.append(item)
    return items


@router.get("/scenarios/{scenario_id}")
def get_scenario(scenario_id: str) -> dict:
    item = read_json(scenario_path(scenario_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return item


@router.post("/scenarios")
def create_scenario(payload: Scenario) -> dict:
    item = normalize_scenario_dict(payload)
    write_json_locked(scenario_path(item["id"]), item)
    return item


@router.put("/scenarios/{scenario_id}")
def update_scenario(scenario_id: str, payload: Scenario) -> dict:
    path = scenario_path(scenario_id)
    previous = read_json(path, None)
    if not previous:
        raise HTTPException(status_code=404, detail="Scenario not found")

    item = normalize_scenario_dict(payload)
    item["id"] = safe_id(scenario_id, "scenario id")
    item["createdAt"] = previous.get("createdAt") or item["createdAt"]
    write_json_locked(path, item)
    return item


@router.delete("/scenarios/{scenario_id}")
def delete_scenario(scenario_id: str) -> dict[str, str]:
    path = scenario_path(scenario_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Scenario not found")
    path.unlink()
    return {"status": "deleted", "id": scenario_id}
