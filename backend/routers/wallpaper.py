from __future__ import annotations

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from projects.wallpaper.main import MODE_CLASSES
from projects.wallpaper.color import STATIC_PALETTES, THEME_PATHS
from projects.wallpaper.web_runner import TerminalFxConfig, stream_terminalfx


router = APIRouter()


@router.get("/modes")
def list_modes() -> dict:
    return {
        "modes": [
            {"id": mode_name, "label": mode_name.replace("_", " ").title()}
            for mode_name in sorted(MODE_CLASSES)
        ],
        "colorModes": ["rainbow", "static", "spectrum"],
        "staticPalettes": sorted(STATIC_PALETTES.keys()),
        "spectrumThemes": sorted(THEME_PATHS.keys()),
    }


@router.websocket("/ws")
async def terminalfx_ws(
    websocket: WebSocket,
    mode: str = Query("bounce"),
    width: int = Query(100, ge=20, le=220),
    height: int = Query(32, ge=8, le=80),
    fps: int = Query(24, ge=1, le=60),
    speed: float = Query(1.0, ge=0.1, le=10.0),
    color_mode: str = Query("rainbow"),
    static_palette: str | None = Query(None),
    spectrum_theme: str | None = Query(None),
    color_speed: float = Query(1.0, ge=0.0, le=10.0),
) -> None:
    await websocket.accept()

    config = TerminalFxConfig(
        mode_name=mode,
        width=width,
        height=height,
        fps=fps,
        speed_factor=speed,
        color_mode=color_mode,
        static_palette=static_palette,
        spectrum_theme=spectrum_theme,
        color_speed_factor=color_speed,
    )

    try:
        await stream_terminalfx(websocket, config)
    except WebSocketDisconnect:
        return
