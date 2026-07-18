# destination: routers/admin.py
#
# FastAPI router for admin and public status endpoints.
#
# Admin endpoints (/api/admin/*) are ONLY called by the Next.js proxy route, which
# validates the admin cookie before forwarding here. nginx should block direct external
# access to /api/admin/* — see the proxy route file for the nginx config snippet.
#
# Public endpoint (/api/status) is safe to expose: returns limited read-only info.
#
# Install psutil before using:
#   pip install psutil --break-system-packages
#
# WOL uses only the standard library (socket module) — no extra package needed.

from __future__ import annotations

import asyncio
import os
import socket
import time
import urllib.error
import urllib.request
from collections import deque
from datetime import datetime

from fastapi import APIRouter, Form, HTTPException

try:
    import psutil  # type: ignore
    _HAS_PSUTIL = True
except ImportError:
    _HAS_PSUTIL = False

router = APIRouter()

# ── In-memory request log ──────────────────────────────────────────────────────
# main.py should add a middleware that appends to this deque.
# See the updated main.py for how to wire this up.
REQUEST_LOGS: deque[str] = deque(maxlen=200)


# ── Services to health-check ───────────────────────────────────────────────────
# Maps display name → URL path on this same server (localhost:8000)
_LOCAL_SERVICES = {
    "API":        "http://localhost:8000/api/health",
    "TexVoice":   "http://localhost:8000/api/texvoice/health",
    "Rhythm Sync":"http://localhost:8000/api/rhythm-sync/health",
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _check_service(name: str, url: str) -> dict:
    """
    Synchronous HTTP health check. Returns a dict with status and latency.
    Run via asyncio.to_thread so the async handler isn't blocked.
    """
    start = time.perf_counter()
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=2) as response:
            latency_ms = round((time.perf_counter() - start) * 1000)
            return {
                "name": name,
                "status": "ok" if response.status == 200 else "degraded",
                "latency_ms": latency_ms,
            }
    except Exception:
        latency_ms = round((time.perf_counter() - start) * 1000)
        return {"name": name, "status": "error", "latency_ms": latency_ms}


def _get_pi_temperature() -> float | None:
    """
    Read CPU temperature from psutil. On Pi 5 the sensor is usually
    'cpu_thermal'. Returns None if unavailable.
    """
    if not _HAS_PSUTIL:
        return None
    try:
        temps = psutil.sensors_temperatures()
        for key in ("cpu_thermal", "cpu-thermal", "coretemp"):
            if key in temps and temps[key]:
                return round(temps[key][0].current, 1)
        # Take the first available sensor if the Pi names differ
        for entries in temps.values():
            if entries:
                return round(entries[0].current, 1)
    except Exception:
        pass
    return None


def _format_uptime(uptime_seconds: float) -> str:
    total = int(uptime_seconds)
    days = total // 86400
    hours = (total % 86400) // 3600
    minutes = (total % 3600) // 60
    if days > 0:
        return f"{days}d {hours}h {minutes}m"
    if hours > 0:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def _send_wol(mac_address: str) -> None:
    """
    Send a Wake-on-LAN magic packet using only the standard library.
    The magic packet is 6 bytes of 0xFF followed by 16 repetitions of the MAC.
    """
    clean = mac_address.upper().replace(":", "").replace("-", "").replace(".", "")
    if len(clean) != 12 or not all(c in "0123456789ABCDEF" for c in clean):
        raise ValueError(f"Invalid MAC address format: {mac_address!r}")

    mac_bytes = bytes.fromhex(clean)
    packet = b"\xff" * 6 + mac_bytes * 16

    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.sendto(packet, ("<broadcast>", 9))


def _get_system_stats() -> dict:
    """Gather all psutil stats. Returns empty/default values if psutil is missing."""
    if not _HAS_PSUTIL:
        return {
            "available": False,
            "cpu_percent": 0.0,
            "memory": {"used_gb": 0.0, "total_gb": 0.0, "percent": 0.0},
            "disk": {"used_gb": 0.0, "total_gb": 0.0, "percent": 0.0},
            "temperature": None,
            "uptime_seconds": 0,
            "uptime_label": "unknown",
            "load_avg": [0.0, 0.0, 0.0],
        }

    cpu = psutil.cpu_percent(interval=0.1)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    boot_time = psutil.boot_time()
    uptime = time.time() - boot_time

    try:
        load = list(psutil.getloadavg())
    except AttributeError:
        # Windows doesn't have getloadavg
        load = [0.0, 0.0, 0.0]

    return {
        "available": True,
        "cpu_percent": round(cpu, 1),
        "memory": {
            "used_gb": round(mem.used / 1_073_741_824, 2),
            "total_gb": round(mem.total / 1_073_741_824, 2),
            "percent": round(mem.percent, 1),
        },
        "disk": {
            "used_gb": round(disk.used / 1_073_741_824, 1),
            "total_gb": round(disk.total / 1_073_741_824, 1),
            "percent": round(disk.percent, 1),
        },
        "temperature": _get_pi_temperature(),
        "uptime_seconds": int(uptime),
        "uptime_label": _format_uptime(uptime),
        "load_avg": [round(x, 2) for x in load],
    }


# ── Admin endpoints (protected by Next.js proxy + nginx block) ─────────────────

@router.get("/stats")
async def admin_stats() -> dict:
    """Full system stats for the admin dashboard."""
    stats = await asyncio.to_thread(_get_system_stats)
    return stats


@router.get("/services")
async def admin_services() -> dict:
    """Health check all registered backend services."""
    results = await asyncio.gather(*[
        asyncio.to_thread(_check_service, name, url)
        for name, url in _LOCAL_SERVICES.items()
    ])
    return {"services": list(results)}


@router.get("/logs")
async def admin_logs(n: int = 50) -> dict:
    """Return the most recent n request log lines."""
    n = max(1, min(n, 200))
    lines = list(REQUEST_LOGS)[-n:]
    return {"lines": lines}


@router.post("/wol")
async def admin_wol(mac: str = Form(...)) -> dict:
    """
    Send a Wake-on-LAN magic packet to the given MAC address.
    Set WOL_MAC in your environment to pre-fill the target.
    Example MAC format: AA:BB:CC:DD:EE:FF
    """
    try:
        await asyncio.to_thread(_send_wol, mac)
        return {"sent": True, "mac": mac}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Could not send packet: {exc}")


# ── Public status endpoint (no auth needed) ────────────────────────────────────
# This is mounted at /api/status (not /api/admin/status) so nginx doesn't block it.
# Mount this router at /api in main.py, NOT at /api/admin.
# See updated main.py for the correct include_router calls.

@router.get("/status")
async def public_status() -> dict:
    """
    Public system status — limited info, safe to expose without auth.
    Omits memory details and load averages; just enough for the /status page.
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


# ── Convenience: default WOL MAC from env ─────────────────────────────────────
@router.get("/config")
async def admin_config() -> dict:
    """Return non-sensitive config the dashboard needs (e.g., default WOL MAC)."""
    return {
        "wol_mac": os.environ.get("WOL_MAC", ""),
        "hostname": socket.gethostname(),
    }
