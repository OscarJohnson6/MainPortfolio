"""
Avatar gateway — the always-on brain (runs on your PC now, the Pi later).

- Only accepts requests from your Next.js server (shared secret header).
- Stores avatars, conversations and messages in a single SQLite file.
- Builds each avatar's system prompt: character sheet + style dials + live
  context (date/time, model, stats from the previous reply).
- Picks the best healthy worker (PC first, Pi fallback) and streams its
  NDJSON through to the browser, saving the reply when it finishes.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import sqlite3
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Literal
from zoneinfo import ZoneInfo

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel, Field

load_dotenv()

GATEWAY_SECRET = os.environ.get("GATEWAY_SECRET", "")
WORKER_TOKEN = os.environ.get("WORKER_TOKEN", "")
WORKER_URLS = [u.strip().rstrip("/") for u in os.environ.get("WORKER_URLS", "").split(",") if u.strip()]
DB_PATH = Path(os.environ.get("DB_PATH", Path(__file__).with_name("avatars.db")))
PERSONA_FILE = Path(os.environ.get("PERSONA_FILE", Path(__file__).with_name("persona.md")))
TIMEZONE = ZoneInfo(os.environ.get("TIMEZONE", "America/Chicago"))
MAX_HISTORY = int(os.environ.get("MAX_HISTORY", "24"))
MAX_MESSAGE_CHARS = int(os.environ.get("MAX_MESSAGE_CHARS", "8000"))
HEALTH_TTL_S = float(os.environ.get("HEALTH_TTL_S", "10"))

if len(GATEWAY_SECRET) < 16:
    raise RuntimeError("GATEWAY_SECRET must be set (16+ chars). Run setup_avatar_env.py.")
if len(WORKER_TOKEN) < 16:
    raise RuntimeError("WORKER_TOKEN must be set (16+ chars), matching the worker's.")
if not WORKER_URLS:
    raise RuntimeError("WORKER_URLS must list at least one worker, e.g. http://127.0.0.1:8100")

WORKER_HEADERS = {"Authorization": f"Bearer {WORKER_TOKEN}"}


# ======================================================================== db

SCHEMA = """
CREATE TABLE IF NOT EXISTS avatars (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    persona     TEXT NOT NULL,
    emoji       TEXT NOT NULL DEFAULT '',
    color       TEXT NOT NULL DEFAULT '#6366f1',
    settings    TEXT NOT NULL DEFAULT '{}',
    created_at  REAL NOT NULL,
    updated_at  REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
    id          TEXT PRIMARY KEY,
    avatar_id   TEXT NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    created_at  REAL NOT NULL,
    updated_at  REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_avatar ON conversations(avatar_id, updated_at);
CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    thinking        TEXT NOT NULL DEFAULT '',
    stats           TEXT,
    model           TEXT,
    created_at      REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id);
CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

db: sqlite3.Connection  # opened in lifespan; all endpoints are async, so it's only used from one thread


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def seed_default_avatar() -> None:
    if db.execute("SELECT COUNT(*) FROM avatars").fetchone()[0]:
        return
    try:
        persona = "\n".join(
            line for line in PERSONA_FILE.read_text(encoding="utf-8").splitlines()
            if not line.startswith("(Edit this file")
        ).strip()
    except FileNotFoundError:
        persona = "You are Nova, a friendly, curious companion."
    now = time.time()
    db.execute(
        "INSERT INTO avatars VALUES (?,?,?,?,?,?,?,?,?)",
        (new_id(), "Nova", "Curious, warm, a little playful.", persona, "✨", "#6366f1",
         json.dumps(AvatarSettings().model_dump()), now, now),
    )
    db.commit()


# ==================================================================== models

HEX_COLOR = r"^#[0-9a-fA-F]{6}$"


class AvatarSettings(BaseModel):
    temperature: float = Field(0.8, ge=0, le=2)
    thinking: Literal["auto", "on", "off"] = "auto"   # auto = worker profile default
    humor: int = Field(5, ge=0, le=10)
    verbosity: int = Field(4, ge=0, le=10)
    formality: int = Field(3, ge=0, le=10)
    warmth: int = Field(6, ge=0, le=10)
    model: str | None = None                          # override the worker's model


class AvatarIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    description: str = Field("", max_length=2000)
    persona: str = Field(min_length=1, max_length=20000)
    emoji: str = Field("", max_length=8)
    color: str = Field("#6366f1", pattern=HEX_COLOR)
    settings: AvatarSettings = AvatarSettings()


class AvatarPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=40)
    description: str | None = Field(None, max_length=2000)
    persona: str | None = Field(None, min_length=1, max_length=20000)
    emoji: str | None = Field(None, max_length=8)
    color: str | None = Field(None, pattern=HEX_COLOR)
    settings: AvatarSettings | None = None


KEEP_ALIVE = {"5m": "5m", "30m": "30m", "2h": "2h", "forever": -1}


class GlobalSettings(BaseModel):
    fast_model: str | None = Field(None, max_length=200)    # answers directly
    think_model: str | None = Field(None, max_length=200)   # reasons first
    num_ctx: int | None = Field(None, ge=2048, le=131072)   # None = worker profile default
    keep_alive: Literal["5m", "30m", "2h", "forever"] | None = None
    warmup: bool = True


def ollama_overrides() -> dict[str, Any]:
    """Advanced settings from the web UI, passed to the worker (which falls back to models.yaml)."""
    g = get_global_settings()
    out: dict[str, Any] = {}
    if g.num_ctx:
        out["num_ctx"] = g.num_ctx
    if g.keep_alive:
        out["keep_alive"] = KEEP_ALIVE[g.keep_alive]
    return out


def get_global_settings() -> GlobalSettings:
    rows = db.execute("SELECT key, value FROM app_settings").fetchall()
    data = {r["key"]: json.loads(r["value"]) for r in rows}
    return GlobalSettings(**{k: v for k, v in data.items() if k in GlobalSettings.model_fields})


def resolve_model(avatar_settings: dict[str, Any], think: bool) -> tuple[str | None, bool | None]:
    """Which model to use and what thinking flag to send.

    None for the model means "the worker's default"; None for the flag means
    "let the worker's profile decide".
    """
    if avatar_settings.get("model"):          # avatar pinned to a specific model
        return avatar_settings["model"], think
    g = get_global_settings()
    if think:
        return g.think_model, True
    if g.fast_model:
        return g.fast_model, False
    # No fast model chosen yet: sending think=false to an always-thinking model
    # would leak its reasoning into the reply, so let the worker decide.
    return None, None


class PersonaReq(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    description: str = Field(min_length=1, max_length=2000)
    settings: AvatarSettings = AvatarSettings()


class WarmupReq(BaseModel):
    avatar_id: str
    think: bool | None = None


class ChatReq(BaseModel):
    avatar_id: str
    conversation_id: str | None = None
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    think: bool | None = None   # the brain toggle; None = avatar's default


def avatar_row(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    d["settings"] = AvatarSettings(**json.loads(d["settings"] or "{}")).model_dump()
    return d


def get_avatar(avatar_id: str) -> dict[str, Any]:
    row = db.execute("SELECT * FROM avatars WHERE id = ?", (avatar_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Avatar not found")
    return avatar_row(row)


# ===================================================================== app


def require_secret(x_gateway_secret: str = Header(default="")) -> None:
    if not secrets.compare_digest(x_gateway_secret.encode(), GATEWAY_SECRET.encode()):
        raise HTTPException(status_code=401, detail="unauthorized")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global db
    db = sqlite3.connect(DB_PATH, check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript(SCHEMA)
    seed_default_avatar()
    app.state.http = httpx.AsyncClient(
        timeout=httpx.Timeout(connect=3.0, read=300.0, write=30.0, pool=5.0)
    )
    print(f"[gateway] db={DB_PATH.name} workers={WORKER_URLS}")
    yield
    await app.state.http.aclose()
    db.close()


app = FastAPI(title="Avatar gateway", lifespan=lifespan, dependencies=[Depends(require_secret)])


def ndjson(obj: dict[str, Any]) -> bytes:
    return (json.dumps(obj) + "\n").encode()


# ================================================================= workers

_health: dict[str, tuple[float, dict[str, Any] | None]] = {}


async def check_worker(http: httpx.AsyncClient, url: str) -> dict[str, Any] | None:
    now = time.monotonic()
    cached = _health.get(url)
    if cached and now - cached[0] < HEALTH_TTL_S:
        return cached[1]
    try:
        r = await http.get(f"{url}/health", headers=WORKER_HEADERS, timeout=2.0)
        info = r.json() if r.status_code == 200 else None
        if info is not None and not info.get("ok"):
            info = None
    except (httpx.HTTPError, ValueError):
        info = None
    _health[url] = (now, info)
    return info


async def pick_worker(http: httpx.AsyncClient) -> tuple[str, dict[str, Any]]:
    for url in WORKER_URLS:
        info = await check_worker(http, url)
        if info:
            return url, info
    raise HTTPException(status_code=503, detail="No worker online. Is the worker terminal running?")


async def stream_worker(http: httpx.AsyncClient, url: str, payload: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    try:
        async with http.stream("POST", f"{url}/generate", json=payload, headers=WORKER_HEADERS) as r:
            if r.status_code != 200:
                _health.pop(url, None)
                yield {"type": "error", "message": f"Worker returned {r.status_code}"}
                return
            async for line in r.aiter_lines():
                if line.strip():
                    yield json.loads(line)
    except httpx.HTTPError:
        _health.pop(url, None)  # force a fresh health check next request
        yield {"type": "error", "message": "Lost connection to the worker mid-reply."}


# ================================================================== prompts


def dial(value: int, low: str, high: str) -> str:
    if value <= 2:
        return f"very {low}"
    if value <= 4:
        return f"somewhat {low}"
    if value <= 6:
        return "balanced"
    if value <= 8:
        return f"somewhat {high}"
    return f"very {high}"


def style_line(s: dict[str, Any]) -> str:
    return (
        f"humor: {dial(s['humor'], 'serious', 'playful')}; "
        f"reply length: {dial(s['verbosity'], 'brief', 'detailed')}; "
        f"tone: {dial(s['formality'], 'casual', 'formal')}; "
        f"warmth: {dial(s['warmth'], 'reserved', 'warm')}"
    )


def length_guidance(verbosity: int) -> str:
    # Concrete targets work far better than "somewhat brief".
    if verbosity <= 1:
        return "one short sentence"
    if verbosity <= 3:
        return "one or two sentences"
    if verbosity <= 5:
        return "two to four sentences"
    if verbosity <= 7:
        return "one or two short paragraphs"
    return "several detailed paragraphs when the topic allows"


def build_system_prompt(avatar: dict[str, Any], model: str, last_stats: dict[str, Any] | None) -> str:
    now = datetime.now(TIMEZONE)
    when = f"{now:%A, %B} {now.day}, {now.year}, {now.strftime('%I:%M %p').lstrip('0')}"
    context = [
        f"- Current date and time: {when} ({TIMEZONE.key})",
        f"- You are running locally on the user's own PC, using the open-weight model {model}.",
    ]
    if last_stats and last_stats.get("tokens"):
        parts = [f"{last_stats['tokens']} tokens"]
        if last_stats.get("duration_s"):
            parts.append(f"{last_stats['duration_s']}s total")
        if last_stats.get("tokens_per_s"):
            parts.append(f"{last_stats['tokens_per_s']} tokens/sec")
        context.append(f"- Your previous reply took: {', '.join(parts)}")
    return (
        f"{avatar['persona'].strip()}\n\n"
        f"## Style dials (current settings, follow them)\n{style_line(avatar['settings'])}\n"
        f"Typical reply length: {length_guidance(avatar['settings']['verbosity'])}. "
        "If the user asks for more or less detail, follow their request instead.\n\n"
        "## Conversation rules\n"
        "- Respond directly to what the user just said, in character.\n"
        "- Don't repeat the example lines from your character sheet word for word; vary your phrasing.\n\n"
        "## Live context (provided by the app; always accurate)\n"
        + "\n".join(context)
        + "\nUse this context when it's relevant. Don't recite it unprompted."
    )


PERSONA_WRITER = """You write character sheets for AI companions. Given a name, a short description and personality dials, write a vivid character sheet that the companion will use as its system prompt.

Rules:
- Write in second person ("You are ...").
- Use exactly these markdown sections: ## Identity, ## Personality, ## How you talk, ## Quirks, ## With the user
- 150-300 words total. Concrete and specific; no generic filler.
- In "How you talk", include 3 example lines in the character's voice, each answering a different kind of question: one short, one medium, and one 2-3 sentences long. Vary the length so the character doesn't sound like it only speaks in one-liners.
- In "With the user", make clear the character actually engages with what the user says and answers their questions, even while staying in character.
- The character is honest: it doesn't invent facts about the real world and says when it doesn't know something.
- Output only the character sheet. No preamble, no closing remarks."""


# ================================================================== routes


@app.get("/status")
async def status(request: Request):
    try:
        _, info = await pick_worker(request.app.state.http)
    except HTTPException:
        return {"online": False}
    return {"online": True, **{k: info.get(k) for k in ("worker", "model", "profile", "vram_mb")}}


@app.get("/models")
async def models(request: Request):
    http: httpx.AsyncClient = request.app.state.http
    url, _ = await pick_worker(http)
    r = await http.get(f"{url}/models", headers=WORKER_HEADERS, timeout=5.0)
    return r.json()


# ---- global settings


@app.get("/settings")
async def read_settings():
    return get_global_settings()


@app.put("/settings")
async def write_settings(body: GlobalSettings):
    for key, value in body.model_dump().items():
        if value is not None and value != "":
            db.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", (key, json.dumps(value)))
        else:
            db.execute("DELETE FROM app_settings WHERE key = ?", (key,))
    db.commit()
    return get_global_settings()


# ---- avatars


@app.get("/avatars")
async def list_avatars():
    rows = db.execute("SELECT * FROM avatars ORDER BY created_at").fetchall()
    return [avatar_row(r) for r in rows]


@app.post("/avatars")
async def create_avatar(body: AvatarIn):
    now = time.time()
    avatar_id = new_id()
    db.execute(
        "INSERT INTO avatars VALUES (?,?,?,?,?,?,?,?,?)",
        (avatar_id, body.name.strip(), body.description.strip(), body.persona.strip(), body.emoji.strip(),
         body.color, json.dumps(body.settings.model_dump()), now, now),
    )
    db.commit()
    return get_avatar(avatar_id)


@app.get("/avatars/{avatar_id}")
async def read_avatar(avatar_id: str):
    return get_avatar(avatar_id)


@app.patch("/avatars/{avatar_id}")
async def update_avatar(avatar_id: str, body: AvatarPatch):
    get_avatar(avatar_id)
    changes = body.model_dump(exclude_none=True)
    if "settings" in changes:
        changes["settings"] = json.dumps(changes["settings"])
    for key in ("name", "description", "persona", "emoji"):
        if key in changes:
            changes[key] = changes[key].strip()
    if changes:
        changes["updated_at"] = time.time()
        cols = ", ".join(f"{k} = ?" for k in changes)  # keys come from the pydantic model, not the client
        db.execute(f"UPDATE avatars SET {cols} WHERE id = ?", (*changes.values(), avatar_id))
        db.commit()
    return get_avatar(avatar_id)


@app.delete("/avatars/{avatar_id}")
async def delete_avatar(avatar_id: str):
    get_avatar(avatar_id)
    db.execute("DELETE FROM avatars WHERE id = ?", (avatar_id,))  # cascades to conversations + messages
    db.commit()
    return {"ok": True}


@app.post("/avatars/generate-persona")
async def generate_persona(body: PersonaReq, request: Request):
    """Streams a character sheet written by the model (thinking + delta events)."""
    http: httpx.AsyncClient = request.app.state.http
    url, _ = await pick_worker(http)
    payload = {
        "messages": [
            {"role": "system", "content": PERSONA_WRITER},
            {"role": "user", "content": (
                f"Name: {body.name}\n"
                f"Description: {body.description}\n"
                f"Personality dials: {style_line(body.settings.model_dump())}"
            )},
        ],
        "temperature": 0.9,
    }
    payload.update(ollama_overrides())
    # Writing a character sheet doesn't need deep reasoning: use the fast model.
    model, think = resolve_model(body.settings.model_dump(), think=False)
    if model:
        payload["model"] = model
    if think is not None:
        payload["think"] = think

    async def stream():
        async for ev in stream_worker(http, url, payload):
            yield ndjson(ev)

    return StreamingResponse(stream(), media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ---- conversations


@app.get("/avatars/{avatar_id}/conversations")
async def list_conversations(avatar_id: str):
    get_avatar(avatar_id)
    rows = db.execute(
        "SELECT * FROM conversations WHERE avatar_id = ? ORDER BY updated_at DESC", (avatar_id,)
    ).fetchall()
    return [dict(r) for r in rows]


@app.get("/conversations/{conversation_id}/messages")
async def list_messages(conversation_id: str):
    if not db.execute("SELECT 1 FROM conversations WHERE id = ?", (conversation_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Conversation not found")
    rows = db.execute(
        "SELECT id, role, content, thinking, stats, model, created_at FROM messages WHERE conversation_id = ? ORDER BY id",
        (conversation_id,),
    ).fetchall()
    return [
        {"id": str(r["id"]), "role": r["role"], "content": r["content"],
         "thinking": r["thinking"], "stats": json.loads(r["stats"]) if r["stats"] else None,
         "model": r["model"], "created_at": r["created_at"]}
        for r in rows
    ]


def fmt_time(ts: float) -> str:
    d = datetime.fromtimestamp(ts, TIMEZONE)
    return f"{d:%b} {d.day}, {d.year} {d.strftime('%I:%M %p').lstrip('0')}"


def stats_text(stats: dict[str, Any] | None) -> str:
    if not stats:
        return ""
    parts = []
    if stats.get("tokens"):
        parts.append(f"{stats['tokens']} tokens")
    if stats.get("tokens_per_s"):
        parts.append(f"{stats['tokens_per_s']} tok/s")
    if stats.get("duration_s"):
        parts.append(f"{stats['duration_s']}s")
    if stats.get("stopped"):
        parts.append("stopped early")
    return " · ".join(parts)


@app.get("/conversations/{conversation_id}/export")
async def export_conversation(conversation_id: str):
    """The whole conversation as Markdown, including every thought process."""
    conv = db.execute("SELECT * FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    avatar = get_avatar(conv["avatar_id"])
    rows = db.execute(
        "SELECT role, content, thinking, stats, model, created_at FROM messages WHERE conversation_id = ? ORDER BY id",
        (conversation_id,),
    ).fetchall()

    out = [
        f"# {conv['title']}",
        "",
        f"- **Avatar:** {avatar['emoji']} {avatar['name']}".replace("  ", " "),
        f"- **Started:** {fmt_time(conv['created_at'])}",
        f"- **Exported:** {fmt_time(time.time())}",
        f"- **Messages:** {len(rows)}",
        "",
        "---",
        "",
    ]
    for r in rows:
        if r["role"] == "user":
            out += [f"## You · {fmt_time(r['created_at'])}", "", r["content"], ""]
            continue
        heading = f"## {avatar['name']} · {fmt_time(r['created_at'])}"
        if r["model"]:
            heading += f" · `{r['model']}`"
        out += [heading, ""]
        if r["thinking"]:
            out += ["**Thought process:**", ""]
            out += [f"> {line}" if line.strip() else ">" for line in r["thinking"].strip().splitlines()]
            out += ["", "**Reply:**", ""]
        out += [r["content"] or "_(no reply text)_", ""]
        stats = stats_text(json.loads(r["stats"]) if r["stats"] else None)
        if stats:
            out += [f"_{stats}_", ""]
    return PlainTextResponse("\n".join(out), media_type="text/markdown; charset=utf-8")


@app.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    db.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
    db.commit()
    return {"ok": True}


def save_message(conversation_id: str, role: str, content: str, thinking: str = "",
                 stats: dict[str, Any] | None = None, model: str | None = None) -> None:
    now = time.time()
    db.execute(
        "INSERT INTO messages (conversation_id, role, content, thinking, stats, model, created_at) "
        "VALUES (?,?,?,?,?,?,?)",
        (conversation_id, role, content, thinking, json.dumps(stats) if stats else None, model, now),
    )
    db.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now, conversation_id))
    db.commit()


def make_title(message: str) -> str:
    title = re.sub(r"\s+", " ", message).strip()
    return title if len(title) <= 60 else title[:57].rstrip() + "…"


# ---- warm-up


@app.post("/warmup")
async def warmup(req: WarmupReq, request: Request):
    """Load the model this avatar will use, so the first reply doesn't wait for it."""
    http: httpx.AsyncClient = request.app.state.http
    avatar = get_avatar(req.avatar_id)
    url, info = await pick_worker(http)
    settings = avatar["settings"]
    wants_think = req.think if req.think is not None else settings.get("thinking") == "on"
    model, _ = resolve_model(settings, wants_think)
    body: dict[str, Any] = {"model": model}
    overrides = ollama_overrides()
    if "keep_alive" in overrides:
        body["keep_alive"] = overrides["keep_alive"]
    try:
        r = await http.post(f"{url}/warmup", json=body, headers=WORKER_HEADERS, timeout=300.0)
    except httpx.HTTPError:
        _health.pop(url, None)
        raise HTTPException(status_code=502, detail="Lost connection to the worker while loading.")
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Worker couldn't load the model ({r.status_code})")
    return r.json()


# ---- chat


@app.post("/chat")
async def chat(req: ChatReq, request: Request):
    http: httpx.AsyncClient = request.app.state.http
    avatar = get_avatar(req.avatar_id)
    url, info = await pick_worker(http)  # fail before saving anything if no worker is up

    conv_id = req.conversation_id
    if conv_id:
        row = db.execute("SELECT avatar_id FROM conversations WHERE id = ?", (conv_id,)).fetchone()
        if not row or row["avatar_id"] != avatar["id"]:
            raise HTTPException(status_code=404, detail="Conversation not found")
        title = None
    else:
        conv_id, title, now = new_id(), make_title(req.message), time.time()
        db.execute("INSERT INTO conversations VALUES (?,?,?,?,?)", (conv_id, avatar["id"], title, now, now))
        db.commit()

    # History (thinking is never fed back in; models do better without it).
    rows = db.execute(
        "SELECT role, content FROM messages WHERE conversation_id = ? AND content != '' "
        "ORDER BY id DESC LIMIT ?", (conv_id, MAX_HISTORY - 1),
    ).fetchall()
    history = [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]
    last = db.execute(
        "SELECT stats FROM messages WHERE conversation_id = ? AND role = 'assistant' AND stats IS NOT NULL "
        "ORDER BY id DESC LIMIT 1", (conv_id,),
    ).fetchone()
    last_stats = json.loads(last["stats"]) if last else None

    save_message(conv_id, "user", req.message)

    settings = avatar["settings"]
    wants_think = req.think if req.think is not None else settings.get("thinking") == "on"
    chosen_model, think = resolve_model(settings, wants_think)
    model = chosen_model or info.get("model") or "unknown"
    payload: dict[str, Any] = {
        "messages": [
            {"role": "system", "content": build_system_prompt(avatar, model, last_stats)},
            *history,
            {"role": "user", "content": req.message},
        ],
        "temperature": settings["temperature"],
        **ollama_overrides(),
    }
    if chosen_model:
        payload["model"] = chosen_model
    if think is not None:
        payload["think"] = think

    async def stream():
        content: list[str] = []
        thinking: list[str] = []
        stats: dict[str, Any] | None = None
        used_model: str | None = None
        yield ndjson({"type": "conversation", "id": conv_id, "title": title})
        try:
            async for ev in stream_worker(http, url, payload):
                kind = ev.get("type")
                if kind == "delta":
                    content.append(ev.get("text", ""))
                elif kind == "thinking":
                    thinking.append(ev.get("text", ""))
                elif kind == "meta":
                    used_model = ev.get("model")
                elif kind == "done":
                    stats = ev.get("stats")
                yield ndjson(ev)
        finally:
            # Runs even if the user hits Stop: keep whatever was generated.
            text, thought = "".join(content), "".join(thinking)
            if text or thought:
                save_message(conv_id, "assistant", text, thought,
                             stats or {"stopped": True}, used_model)

    return StreamingResponse(stream(), media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
