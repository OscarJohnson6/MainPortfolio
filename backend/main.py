# destination: main.py (replace existing)
#
# Changes from original:
# 1. Imports admin router (mounted at /api/admin — protected by nginx)
# 2. Imports shared helpers from admin.py for the public /api/status endpoint
# 3. Adds RequestLogMiddleware that feeds the admin /logs endpoint
# 4. CORS note: update allow_origin_regex when deploying to Pi with a domain

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import asyncio
import time
from datetime import datetime

from routers import rhythm_sync, texvoice, wallpaper, admin
from routers.admin import REQUEST_LOGS, _get_system_stats, _check_service, _LOCAL_SERVICES

app = FastAPI(title="OJ Builds API")

# ── CORS ───────────────────────────────────────────────────────────────────────
# Dev: only localhost. Production: update this to include your Pi's domain.
# Example: r"^https?://(localhost|127\.0\.0\.1|ojbuilds\.com)(:\d+)?$"
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.168.1.109:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["content-length", "content-type", "content-disposition"],
)


# ── Request log middleware ─────────────────────────────────────────────────────
# Every request gets appended to REQUEST_LOGS in admin.py.
# The admin /logs endpoint reads from that buffer — this is how you get a live
# activity feed in the dashboard without a separate logging library.
@app.middleware("http")
async def log_requests(request: Request, call_next) -> Response:
    start = time.perf_counter()
    response: Response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000)
    timestamp = datetime.now().strftime("%H:%M:%S")

    # Skip the log-reading endpoint itself to avoid a feedback loop
    if not request.url.path.endswith("/logs"):
        line = f"[{timestamp}] {request.method} {request.url.path} {response.status_code} {duration_ms}ms"
        REQUEST_LOGS.append(line)

    return response


# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(texvoice.router,    prefix="/api/texvoice",    tags=["texvoice"])
app.include_router(wallpaper.router,   prefix="/api/terminalfx",  tags=["terminalfx"])
app.include_router(rhythm_sync.router, prefix="/api/rhythm-sync", tags=["rhythm-sync"])

# Admin endpoints: nginx blocks /api/admin/* from external traffic.
# Only the Next.js proxy route (server-side) can reach these.
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])


# ── Public endpoints ───────────────────────────────────────────────────────────

@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "oj-builds-api"}


@app.get("/api/status")
async def public_status() -> dict:
    """
    Public system status for the /status page. No auth needed.
    Returns limited read-only info: service health, CPU, temperature, uptime.
    Disk details, memory, and logs are admin-only.
    """
    stats = await asyncio.to_thread(_get_system_stats)
    services = await asyncio.gather(*[
        asyncio.to_thread(_check_service, name, url)
        for name, url in _LOCAL_SERVICES.items()
    ])

    return {
        "overall": "ok" if all(s["status"] == "ok" for s in services) else "degraded",
        "services": list(services),
        "cpu_percent": stats["cpu_percent"],
        "temperature": stats["temperature"],
        "uptime_label": stats["uptime_label"],
        "uptime_seconds": stats["uptime_seconds"],
        "psutil_available": stats["available"],
    }
