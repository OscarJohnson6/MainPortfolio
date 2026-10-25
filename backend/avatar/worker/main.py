"""
Avatar worker — runs on the machine with the GPU (your PC), or on the Pi as a fallback.

Wraps Ollama behind a small authenticated API so Ollama itself never has to be
exposed to the network. The gateway only ever talks to this service.

Stream format (NDJSON, one JSON object per line):
  {"type": "meta",  "worker": "pc", "model": "qwen3:8b"}
  {"type": "thinking", "text": "Hmm, "}   (reasoning, if the model thinks)
  {"type": "delta", "text": "Hel"}
  {"type": "done",  "stats": {...}}
  {"type": "error", "message": "..."}
"""

from __future__ import annotations

import json
import os
import secrets
import shutil
import subprocess
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

import httpx
import yaml
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

load_dotenv()

WORKER_TOKEN = os.environ.get("WORKER_TOKEN", "")
WORKER_NAME = os.environ.get("WORKER_NAME", "worker")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
MODELS_FILE = Path(os.environ.get("MODELS_FILE", Path(__file__).with_name("models.yaml")))
PROFILE_OVERRIDE = os.environ.get("WORKER_PROFILE") or None

if len(WORKER_TOKEN) < 16:
    raise RuntimeError("WORKER_TOKEN must be set (16+ chars). See .env.example.")


# ---------------------------------------------------------------- hardware


def detect_vram_mb() -> int | None:
    """Total VRAM of the largest NVIDIA GPU, or None if there isn't one."""
    if not shutil.which("nvidia-smi"):
        return None
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5, check=True,
        ).stdout
        values = [int(v) for v in out.split() if v.strip().isdigit()]
        return max(values) if values else None
    except (subprocess.SubprocessError, OSError, ValueError):
        return None


VRAM_MB = detect_vram_mb()


# ---------------------------------------------------------------- profiles


def load_profiles() -> dict[str, dict[str, Any]]:
    # Re-read every call: the file is tiny, and it means you can edit
    # models.yaml (e.g. after a GPU upgrade) without restarting.
    with MODELS_FILE.open() as f:
        data = yaml.safe_load(f) or {}
    profiles = data.get("profiles") or {}
    if not profiles:
        raise RuntimeError(f"No profiles defined in {MODELS_FILE}")
    return profiles


def get_profile() -> tuple[str, dict[str, Any]]:
    profiles = load_profiles()
    if PROFILE_OVERRIDE:
        if PROFILE_OVERRIDE not in profiles:
            raise RuntimeError(f"WORKER_PROFILE={PROFILE_OVERRIDE!r} not in {MODELS_FILE}")
        return PROFILE_OVERRIDE, profiles[PROFILE_OVERRIDE]
    vram = VRAM_MB or 0
    # Pick the most demanding profile this machine can satisfy.
    eligible = [(p.get("min_vram_mb", 0), name) for name, p in profiles.items()
                if p.get("min_vram_mb", 0) <= vram]
    if not eligible:
        raise RuntimeError("No profile fits this machine; add one with min_vram_mb: 0")
    _, name = max(eligible)
    return name, profiles[name]


# ---------------------------------------------------------------- app


def require_token(authorization: str = Header(default="")) -> None:
    expected = f"Bearer {WORKER_TOKEN}"
    if not secrets.compare_digest(authorization.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="unauthorized")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http = httpx.AsyncClient(
        timeout=httpx.Timeout(connect=5.0, read=300.0, write=30.0, pool=5.0)
    )
    name, prof = get_profile()
    print(f"[worker:{WORKER_NAME}] VRAM={VRAM_MB}MB profile={name} model={prof['chat_model']}")
    yield
    await app.state.http.aclose()


app = FastAPI(title="Avatar worker", lifespan=lifespan, dependencies=[Depends(require_token)])


class Msg(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class GenerateReq(BaseModel):
    messages: list[Msg] = Field(min_length=1)
    model: str | None = None          # override the profile's model
    temperature: float | None = Field(default=None, ge=0, le=2)
    think: bool | None = None         # override the profile's thinking setting
    num_ctx: int | None = Field(default=None, ge=1024, le=131072)  # override context length
    keep_alive: str | int | None = None  # how long Ollama keeps the model loaded ("30m", -1 = forever)


class WarmupReq(BaseModel):
    model: str | None = None
    keep_alive: str | int | None = None


def ndjson(obj: dict[str, Any]) -> bytes:
    return (json.dumps(obj) + "\n").encode()


@app.get("/health")
async def health(request: Request):
    http: httpx.AsyncClient = request.app.state.http
    name, prof = get_profile()
    try:
        r = await http.get(f"{OLLAMA_URL}/api/version", timeout=3.0)
        ollama_ok = r.status_code == 200
    except httpx.HTTPError:
        ollama_ok = False
    return {
        "ok": ollama_ok,
        "worker": WORKER_NAME,
        "profile": name,
        "model": prof["chat_model"],
        "num_ctx": prof.get("num_ctx"),
        "vram_mb": VRAM_MB,
    }


@app.get("/models")
async def models(request: Request):
    http: httpx.AsyncClient = request.app.state.http
    try:
        r = await http.get(f"{OLLAMA_URL}/api/tags", timeout=5.0)
        r.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Ollama unreachable: {e.__class__.__name__}")
    return {"models": sorted(m["name"] for m in r.json().get("models", []))}


@app.post("/warmup")
async def warmup(req: WarmupReq, request: Request):
    """Load a model into memory without generating anything, so the next real
    message doesn't wait for the (slow) load from disk."""
    http: httpx.AsyncClient = request.app.state.http
    _, prof = get_profile()
    model = req.model or prof["chat_model"]
    keep_alive = req.keep_alive if req.keep_alive is not None else prof.get("keep_alive", "30m")
    started = time.monotonic()
    try:
        r = await http.post(
            f"{OLLAMA_URL}/api/chat",
            json={"model": model, "messages": [], "stream": False, "keep_alive": keep_alive},
            timeout=httpx.Timeout(300.0, connect=5.0),
        )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Ollama unreachable: {e.__class__.__name__}")
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Ollama {r.status_code}: {r.text[:200]}")
    return {"model": model, "seconds": round(time.monotonic() - started, 1)}


@app.post("/generate")
async def generate(req: GenerateReq, request: Request):
    http: httpx.AsyncClient = request.app.state.http
    _, prof = get_profile()
    model = req.model or prof["chat_model"]

    payload: dict[str, Any] = {
        "model": model,
        "messages": [m.model_dump() for m in req.messages],
        "stream": True,
        "options": {"num_ctx": req.num_ctx or prof.get("num_ctx", 8192)},
        "keep_alive": req.keep_alive if req.keep_alive is not None else prof.get("keep_alive", "30m"),
    }
    if req.temperature is not None:
        payload["options"]["temperature"] = req.temperature
    elif "temperature" in prof:
        payload["options"]["temperature"] = prof["temperature"]

    # Thinking: the request (avatar setting) wins, then the profile default.
    # With think set, Ollama sends the reasoning in its own field instead of
    # mixing it into the reply, and we stream it as "thinking" events.
    think = req.think if req.think is not None else prof.get("think")
    if think is not None:
        payload["think"] = think

    async def stream():
        yield ndjson({"type": "meta", "worker": WORKER_NAME, "model": model})
        try:
            for attempt in range(2):
                async with http.stream("POST", f"{OLLAMA_URL}/api/chat", json=payload) as r:
                    if r.status_code != 200:
                        body = (await r.aread()).decode(errors="replace")[:300]
                        # Model without thinking support: retry once without the flag.
                        if attempt == 0 and "think" in payload and "think" in body.lower():
                            payload.pop("think")
                            continue
                        yield ndjson({"type": "error", "message": f"Ollama {r.status_code}: {body}"})
                        return
                    async for raw in r.aiter_lines():
                        if not raw.strip():
                            continue
                        chunk = json.loads(raw)
                        if "error" in chunk:
                            yield ndjson({"type": "error", "message": str(chunk["error"])})
                            return
                        msg = chunk.get("message") or {}
                        if msg.get("thinking"):
                            yield ndjson({"type": "thinking", "text": msg["thinking"]})
                        if msg.get("content"):
                            yield ndjson({"type": "delta", "text": msg["content"]})
                        if chunk.get("done"):
                            eval_ns = chunk.get("eval_duration") or 0
                            total_ns = chunk.get("total_duration") or 0
                            tokens = chunk.get("eval_count") or 0
                            yield ndjson({"type": "done", "stats": {
                                "tokens": tokens,
                                "tokens_per_s": round(tokens / (eval_ns / 1e9), 1) if eval_ns else None,
                                "duration_s": round(total_ns / 1e9, 1) if total_ns else None,
                            }})
                            return
                    return
        except httpx.HTTPError as e:
            yield ndjson({"type": "error", "message": f"Worker lost Ollama: {e.__class__.__name__}"})
        # If the client disconnects, Starlette cancels this generator, which
        # closes the Ollama stream and stops generation. No wasted GPU time.

    return StreamingResponse(
        stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
