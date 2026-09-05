# destination: backend/routers/admin.py

from __future__ import annotations

import asyncio
import os
import socket
import subprocess
import time
import urllib.request
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Form, HTTPException

try:
    import psutil  # type: ignore

    _HAS_PSUTIL = True
except ImportError:
    _HAS_PSUTIL = False

router = APIRouter()
REQUEST_LOGS: deque[str] = deque(maxlen=200)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEPLOYMENT_STATE_DIR = Path(
    os.environ.get(
        "DEPLOYMENT_STATE_DIR",
        "/home/oscarj/.local/state/mainportfolio",
    )
)

_LOCAL_SERVICES = {
    "API": "http://127.0.0.1:8000/api/health",
    "TexVoice": "http://127.0.0.1:8000/api/texvoice/health",
    "Rhythm Sync": "http://127.0.0.1:8000/api/rhythm-sync/health",
}

_SYSTEMD_UNITS = (
    "oj-builds-api.service",
    "cloudflared.service",
    "nginx.service",
)


def _utc_timestamp(timestamp: float | None = None) -> str | None:
    if timestamp is None:
        return None
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat()


def _check_service(name: str, url: str) -> dict:
    started_at = time.perf_counter()
    try:
        request = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(request, timeout=2) as response:
            status = "ok" if response.status == 200 else "degraded"
    except Exception:
        status = "error"

    return {
        "name": name,
        "status": status,
        "latency_ms": round((time.perf_counter() - started_at) * 1000),
    }


def _get_pi_temperature() -> float | None:
    if not _HAS_PSUTIL:
        return None

    try:
        temperatures = psutil.sensors_temperatures()
        for sensor_name in ("cpu_thermal", "cpu-thermal", "coretemp"):
            entries = temperatures.get(sensor_name, [])
            if entries:
                return round(entries[0].current, 1)

        for entries in temperatures.values():
            if entries:
                return round(entries[0].current, 1)
    except Exception:
        pass

    return None


def _format_uptime(uptime_seconds: float) -> str:
    total = int(uptime_seconds)
    days, remainder = divmod(total, 86_400)
    hours, remainder = divmod(remainder, 3_600)
    minutes = remainder // 60

    if days:
        return f"{days}d {hours}h {minutes}m"
    if hours:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def _empty_system_stats() -> dict:
    return {
        "available": False,
        "cpu_percent": 0.0,
        "cpu_count": 0,
        "process_count": 0,
        "memory": {"used_gb": 0.0, "total_gb": 0.0, "percent": 0.0},
        "swap": {"used_gb": 0.0, "total_gb": 0.0, "percent": 0.0},
        "disk": {"used_gb": 0.0, "total_gb": 0.0, "percent": 0.0},
        "temperature": None,
        "uptime_seconds": 0,
        "uptime_label": "unknown",
        "load_avg": [0.0, 0.0, 0.0],
    }


def _get_system_stats() -> dict:
    if not _HAS_PSUTIL:
        return _empty_system_stats()

    memory = psutil.virtual_memory()
    swap = psutil.swap_memory()
    disk = psutil.disk_usage("/")
    uptime = time.time() - psutil.boot_time()

    try:
        load_average = list(psutil.getloadavg())
    except (AttributeError, OSError):
        load_average = [0.0, 0.0, 0.0]

    return {
        "available": True,
        "cpu_percent": round(psutil.cpu_percent(interval=0.1), 1),
        "cpu_count": psutil.cpu_count() or 0,
        "process_count": len(psutil.pids()),
        "memory": {
            "used_gb": round(memory.used / 1_073_741_824, 2),
            "total_gb": round(memory.total / 1_073_741_824, 2),
            "percent": round(memory.percent, 1),
        },
        "swap": {
            "used_gb": round(swap.used / 1_073_741_824, 2),
            "total_gb": round(swap.total / 1_073_741_824, 2),
            "percent": round(swap.percent, 1),
        },
        "disk": {
            "used_gb": round(disk.used / 1_073_741_824, 1),
            "total_gb": round(disk.total / 1_073_741_824, 1),
            "percent": round(disk.percent, 1),
        },
        "temperature": _get_pi_temperature(),
        "uptime_seconds": int(uptime),
        "uptime_label": _format_uptime(uptime),
        "load_avg": [round(value, 2) for value in load_average],
    }


def _systemd_unit_status(unit: str) -> dict:
    command = [
        "systemctl",
        "show",
        unit,
        "--property=ActiveState,SubState,NRestarts,ExecMainStatus,StateChangeTimestamp",
        "--no-pager",
    ]

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            check=False,
            text=True,
            timeout=2,
        )
    except (OSError, subprocess.SubprocessError) as error:
        return {"unit": unit, "active": "unknown", "sub": "unknown", "error": str(error)}

    values: dict[str, str] = {}
    for line in result.stdout.splitlines():
        key, separator, value = line.partition("=")
        if separator:
            values[key] = value

    return {
        "unit": unit,
        "active": values.get("ActiveState", "unknown"),
        "sub": values.get("SubState", "unknown"),
        "restarts": int(values.get("NRestarts", "0") or 0),
        "exit_status": int(values.get("ExecMainStatus", "0") or 0),
        "changed_at": values.get("StateChangeTimestamp") or None,
    }


def _directory_usage(path: Path) -> dict:
    if not path.exists():
        return {
            "path": str(path),
            "exists": False,
            "bytes": 0,
            "size_mb": 0.0,
            "files": 0,
        }

    total_bytes = 0
    file_count = 0
    try:
        for entry in path.rglob("*"):
            if entry.is_file():
                total_bytes += entry.stat().st_size
                file_count += 1
    except OSError:
        pass

    return {
        "path": str(path),
        "exists": True,
        "bytes": total_bytes,
        "size_mb": round(total_bytes / 1_048_576, 2),
        "files": file_count,
    }


def _read_tail(path: Path, line_count: int = 12) -> list[str]:
    try:
        return path.read_text(encoding="utf-8", errors="replace").splitlines()[-line_count:]
    except OSError:
        return []


def _read_git_commit() -> str | None:
    head_path = PROJECT_ROOT / ".git" / "HEAD"
    try:
        head = head_path.read_text(encoding="utf-8").strip()
        if head.startswith("ref: "):
            reference = head.removeprefix("ref: ")
            return (PROJECT_ROOT / ".git" / reference).read_text(encoding="utf-8").strip()
        return head or None
    except OSError:
        return None


def _deployment_info() -> dict:
    commit_file = DEPLOYMENT_STATE_DIR / "current-commit"
    log_file = DEPLOYMENT_STATE_DIR / "deployments.log"

    try:
        recorded_commit = commit_file.read_text(encoding="utf-8").strip() or None
    except OSError:
        recorded_commit = None

    commit = recorded_commit or _read_git_commit()
    return {
        "commit": commit,
        "short_commit": commit[:8] if commit else None,
        "recorded": recorded_commit is not None,
        "log": _read_tail(log_file),
        "log_updated_at": _utc_timestamp(log_file.stat().st_mtime) if log_file.exists() else None,
    }


def _update_info() -> dict:
    apt_history = Path("/var/log/apt/history.log")
    unattended_log = Path("/var/log/unattended-upgrades/unattended-upgrades.log")

    return {
        "reboot_required": Path("/var/run/reboot-required").exists(),
        "apt_history_updated_at": (
            _utc_timestamp(apt_history.stat().st_mtime) if apt_history.exists() else None
        ),
        "apt_history_tail": _read_tail(apt_history, 8),
        "unattended_upgrades_updated_at": (
            _utc_timestamp(unattended_log.stat().st_mtime)
            if unattended_log.exists()
            else None
        ),
    }


def _request_summary() -> dict:
    lines = list(REQUEST_LOGS)
    errors = 0
    for line in lines:
        fields = line.rsplit(" ", 2)
        if len(fields) >= 2 and fields[-2].isdigit() and int(fields[-2]) >= 500:
            errors += 1

    return {"stored": len(lines), "server_errors": errors}


def _send_wol(mac_address: str) -> None:
    clean = mac_address.upper().replace(":", "").replace("-", "").replace(".", "")
    if len(clean) != 12 or not all(character in "0123456789ABCDEF" for character in clean):
        raise ValueError("Invalid MAC address format.")

    packet = b"\xff" * 6 + bytes.fromhex(clean) * 16
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp_socket:
        udp_socket.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        udp_socket.sendto(packet, ("<broadcast>", 9))


async def _service_checks() -> list[dict]:
    return list(
        await asyncio.gather(
            *[
                asyncio.to_thread(_check_service, name, url)
                for name, url in _LOCAL_SERVICES.items()
            ]
        )
    )


@router.get("/overview")
async def admin_overview() -> dict:
    system, services, systemd_units, deployment, updates, storage = await asyncio.gather(
        asyncio.to_thread(_get_system_stats),
        _service_checks(),
        asyncio.gather(*[asyncio.to_thread(_systemd_unit_status, unit) for unit in _SYSTEMD_UNITS]),
        asyncio.to_thread(_deployment_info),
        asyncio.to_thread(_update_info),
        asyncio.gather(
            asyncio.to_thread(_directory_usage, PROJECT_ROOT / "uploads"),
            asyncio.to_thread(_directory_usage, PROJECT_ROOT / "exports"),
            asyncio.to_thread(_directory_usage, PROJECT_ROOT / "imports" / "latex"),
        ),
    )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "hostname": socket.gethostname(),
        "overall": "ok" if all(service["status"] == "ok" for service in services) else "degraded",
        "system": system,
        "services": services,
        "systemd_units": list(systemd_units),
        "deployment": deployment,
        "updates": updates,
        "storage": {
            "uploads": storage[0],
            "exports": storage[1],
            "latex_library": storage[2],
        },
        "requests": _request_summary(),
    }


@router.get("/stats")
async def admin_stats() -> dict:
    return await asyncio.to_thread(_get_system_stats)


@router.get("/services")
async def admin_services() -> dict:
    return {"services": await _service_checks()}


@router.get("/logs")
async def admin_logs(n: int = 50) -> dict:
    count = max(1, min(n, 200))
    return {"lines": list(REQUEST_LOGS)[-count:]}


@router.get("/config")
async def admin_config() -> dict:
    return {
        "wol_mac": os.environ.get("WOL_MAC", ""),
        "hostname": socket.gethostname(),
    }


@router.post("/wol")
async def admin_wol(mac: str = Form(...)) -> dict:
    try:
        await asyncio.to_thread(_send_wol, mac)
        return {"sent": True, "mac": mac}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except OSError as error:
        raise HTTPException(status_code=500, detail="Could not send Wake-on-LAN packet.") from error
