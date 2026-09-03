from __future__ import annotations

import asyncio
import hmac
import os
import time
from datetime import datetime, timezone

from fastapi import ( Depends, FastAPI, Header, HTTPException, Request, status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from routers import admin, rhythm_sync, texvoice, wallpaper
from routers.admin import (
    REQUEST_LOGS, _LOCAL_SERVICES, _check_service, _get_system_stats,
)


app = FastAPI( title="OJ Builds API", version="1.0.0",
)


# ── CORS ────────────────────────────────────────────────────────────────────── These are the
# browser origins allowed to call the public FastAPI routes. The Vercel admin proxy is
# server-to-server and does not depend on CORS.
app.add_middleware( CORSMiddleware, allow_origins=[
        "https://oscarjohnson.dev", "https://www.oscarjohnson.dev", "http://localhost:3000",
        "http://127.0.0.1:3000", "http://192.168.1.109:3000",
    ], allow_credentials=False, allow_methods=[
        "GET", "POST", "HEAD", "OPTIONS",
    ], allow_headers=[
        "Content-Type", "Range",
    ], expose_headers=[
        "Accept-Ranges", "Content-Length", "Content-Range", "Content-Type",
        "Content-Disposition",
    ], )


# ── Admin authentication ────────────────────────────────────────────────────── ADMIN_SECRET
# authenticates you to the Vercel admin page.
#
# BACKEND_ADMIN_TOKEN is a separate server-to-server secret shared only by: 1. The Vercel
#   server-side admin proxy 2. This FastAPI backend
#
# Never expose BACKEND_ADMIN_TOKEN through a NEXT_PUBLIC_* variable.
def require_backend_admin( x_admin_token: str | None = Header(
        default=None, alias="X-Admin-Token",
    ), ) -> None:
    expected_token = os.environ.get("BACKEND_ADMIN_TOKEN", "")

    authorized = ( bool(expected_token) and bool(x_admin_token) and hmac.compare_digest(
            x_admin_token, expected_token,
        ) )

    if not authorized: raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized",
        )


# ── Request logging ─────────────────────────────────────────────────────────── Keeps the
# newest requests in the bounded REQUEST_LOGS deque from admin.py. The log-reading endpoint
# itself is skipped to prevent it from logging its own polling requests continuously.
@app.middleware("http")
async def log_requests(request: Request, call_next) -> Response:
    started_at = time.perf_counter()
    response: Response = await call_next(request)

    if request.url.path != "/api/admin/logs":
        duration_ms = round((time.perf_counter() - started_at) * 1000)
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        REQUEST_LOGS.append(
            f"[{timestamp}] {request.method} {request.url.path} "
            f"{response.status_code} {duration_ms}ms"
        )

    return response

# ── Public project routers ────────────────────────────────────────────────────
app.include_router( texvoice.router, prefix="/api/texvoice", tags=["texvoice"],
)

app.include_router( wallpaper.router, prefix="/api/terminalfx", tags=["terminalfx"],
)

app.include_router( rhythm_sync.router, prefix="/api/rhythm-sync", tags=["rhythm-sync"],
)


# ── Protected admin router ──────────────────────────────────────────────────── Every route
# inside admin.router requires X-Admin-Token.
#
# include_in_schema=False prevents admin routes from appearing in the public FastAPI
# Swagger/OpenAPI documentation. This is not the security mechanism; require_backend_admin is
# the actual protection.
app.include_router( admin.router, prefix="/api/admin", tags=["admin"],
    dependencies=[Depends(require_backend_admin)], include_in_schema=False,
)


# ── Public system endpoints ──────────────────────────────────────────────────
@app.get( "/api/health", tags=["system"],)
def health() -> dict[str, str]:
    """ Lightweight health check used by Vercel, deployment scripts, and monitoring. """

    return { "status": "ok", "service": "oj-builds-api",
    }


@app.get( "/api/status", tags=["system"],)
async def public_status() -> dict:
    """ Limited public Pi status.

    Intentionally excludes: - Memory details - Disk details - Load averages - Hostname - MAC
      addresses - Request logs - Environment variables
    """

    stats = await asyncio.to_thread(_get_system_stats)

    services = await asyncio.gather( *[
            asyncio.to_thread(
                _check_service, service_name, service_url,
            ) for service_name, service_url in _LOCAL_SERVICES.items()
        ] )

    all_services_online = all( service["status"] == "ok" for service in services
    )

    return { "overall": "ok" if all_services_online else "degraded", "services": list(services),
        "cpu_percent": stats["cpu_percent"], "temperature": stats["temperature"],
        "uptime_label": stats["uptime_label"], "uptime_seconds": stats["uptime_seconds"],
        "psutil_available": stats["available"],
    }