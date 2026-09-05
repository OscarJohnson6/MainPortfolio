# destination: backend/main.py

from __future__ import annotations

import hmac
import os
import time
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from routers import admin, rhythm_sync, texvoice, wallpaper
from routers.admin import REQUEST_LOGS

app = FastAPI(title="OJ Builds API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.168.1.109:3000",
        "https://oscarjohnson.dev",
        "https://www.oscarjohnson.dev",
        "https://main-portfolio-xi-eight.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "accept-ranges",
        "content-length",
        "content-range",
        "content-type",
        "content-disposition",
    ],
)


def require_backend_admin(
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
) -> None:
    expected_token = os.environ.get("BACKEND_ADMIN_TOKEN", "")
    authorized = (
        bool(expected_token)
        and bool(x_admin_token)
        and hmac.compare_digest(x_admin_token, expected_token)
    )

    if not authorized:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized",
        )


@app.middleware("http")
async def log_requests(request: Request, call_next) -> Response:
    started_at = time.perf_counter()
    response_status = 500

    try:
        response: Response = await call_next(request)
        response_status = response.status_code
        return response
    finally:
        if not request.url.path.startswith("/api/admin/"):
            duration_ms = round((time.perf_counter() - started_at) * 1000)
            timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            REQUEST_LOGS.append(
                f"[{timestamp}] {request.method} {request.url.path} "
                f"{response_status} {duration_ms}ms"
            )


app.include_router(texvoice.router, prefix="/api/texvoice", tags=["texvoice"])
app.include_router(wallpaper.router, prefix="/api/terminalfx", tags=["terminalfx"])
app.include_router(
    rhythm_sync.router,
    prefix="/api/rhythm-sync",
    tags=["rhythm-sync"],
)

app.include_router(
    admin.router,
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(require_backend_admin)],
    include_in_schema=False,
)


@app.get("/api/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok", "service": "oj-builds-api"}
