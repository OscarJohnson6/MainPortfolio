from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

from fastapi import WebSocket

from .ansi import CLEAR, HIDE_CURSOR, HOME, RESET
from .color import ColorProvider
from .main import MODE_CLASSES


@dataclass
class TerminalFxConfig:
    mode_name: str = "bounce"
    width: int = 100
    height: int = 32
    fps: int = 24
    speed_factor: float = 1.0
    color_mode: str = "rainbow"
    static_palette: str | None = None
    spectrum_theme: str | None = None
    color_speed_factor: float = 1.0


def clamp_int(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def clamp_float(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def sanitize_config(config: TerminalFxConfig) -> TerminalFxConfig:
    config.width = clamp_int(config.width, 20, 220)
    config.height = clamp_int(config.height, 8, 80)
    config.fps = clamp_int(config.fps, 1, 60)
    config.speed_factor = clamp_float(config.speed_factor, 0.1, 10.0)
    config.color_speed_factor = clamp_float(config.color_speed_factor, 0.0, 10.0)

    if config.color_mode not in {"static", "rainbow", "spectrum"}:
        config.color_mode = "rainbow"

    if config.mode_name not in MODE_CLASSES:
        config.mode_name = "bounce"

    return config


def build_color_provider(config: TerminalFxConfig) -> ColorProvider:
    if config.color_mode == "static":
        return ColorProvider(
            "static",
            config.static_palette or "cyan",
            None,
            config.color_speed_factor,
        )

    if config.color_mode == "spectrum":
        return ColorProvider(
            "spectrum",
            None,
            config.spectrum_theme or "ocean",
            config.color_speed_factor,
        )

    return ColorProvider("rainbow", None, None, config.color_speed_factor)


def build_mode(config: TerminalFxConfig):
    ModeClass = MODE_CLASSES[config.mode_name]
    color_provider = build_color_provider(config)
    return ModeClass(config.speed_factor, color_provider)


async def receive_controls(websocket: WebSocket, config: TerminalFxConfig) -> None:
    """
    Receives optional client control messages while frames are streaming.

    Expected JSON examples:
      {"type":"resize","width":120,"height":36}
      {"type":"settings","fps":30,"speedFactor":1.5}
      {"type":"mode","mode":"matrix"}
      {"type":"color","colorMode":"spectrum","spectrumTheme":"ocean"}
    """
    while True:
        data = await websocket.receive_json()
        message_type = data.get("type")

        if message_type == "resize":
            config.width = clamp_int(int(data.get("width", config.width)), 20, 220)
            config.height = clamp_int(int(data.get("height", config.height)), 8, 80)

        elif message_type == "settings":
            config.fps = clamp_int(int(data.get("fps", config.fps)), 1, 60)
            config.speed_factor = clamp_float(
                float(data.get("speedFactor", config.speed_factor)),
                0.1,
                10.0,
            )
            config.color_speed_factor = clamp_float(
                float(data.get("colorSpeedFactor", config.color_speed_factor)),
                0.0,
                10.0,
            )

        elif message_type == "mode":
            next_mode = str(data.get("mode", config.mode_name))
            if next_mode in MODE_CLASSES:
                config.mode_name = next_mode

        elif message_type == "color":
            color_mode = str(data.get("colorMode", config.color_mode))
            if color_mode in {"static", "rainbow", "spectrum"}:
                config.color_mode = color_mode
            config.static_palette = data.get("staticPalette", config.static_palette)
            config.spectrum_theme = data.get("spectrumTheme", config.spectrum_theme)


async def stream_terminalfx(websocket: WebSocket, config: TerminalFxConfig) -> None:
    """
    Browser/xterm runner for TerminalFX.

    This bypasses terminal input(), shutil.get_terminal_size(), stdout, and the
    local menu loop. Modes still use the same update/render abstraction as the
    normal terminal version.
    """
    config = sanitize_config(config)
    mode = build_mode(config)

    last_mode_name = config.mode_name
    last_speed_factor = config.speed_factor
    last_color_key = (
        config.color_mode,
        config.static_palette,
        config.spectrum_theme,
        config.color_speed_factor,
    )

    last_time = time.perf_counter()
    start_time = last_time

    await websocket.send_text(HIDE_CURSOR + CLEAR + HOME)

    control_task = asyncio.create_task(receive_controls(websocket, config))

    try:
        while True:
            if control_task.done():
                control_task.result()

            color_key = (
                config.color_mode,
                config.static_palette,
                config.spectrum_theme,
                config.color_speed_factor,
            )

            if (
                config.mode_name != last_mode_name
                or config.speed_factor != last_speed_factor
                or color_key != last_color_key
            ):
                mode = build_mode(config)
                last_mode_name = config.mode_name
                last_speed_factor = config.speed_factor
                last_color_key = color_key
                await websocket.send_text(CLEAR + HOME)

            now = time.perf_counter()
            dt = now - last_time
            last_time = now
            t_abs = now - start_time

            if config.width < 5 or config.height < 3:
                await asyncio.sleep(0.1)
                continue

            mode.update(dt, config.width, config.height, t_abs)
            frame = mode.render(config.width, config.height, t_abs)

            await websocket.send_text(HOME + frame + RESET)

            frame_delay = 1.0 / max(1, config.fps)
            elapsed = time.perf_counter() - now
            sleep_for = frame_delay - elapsed
            if sleep_for > 0:
                await asyncio.sleep(sleep_for)
            else:
                await asyncio.sleep(0)

 
    finally:
        control_task.cancel()
        try:
            await websocket.send_text(RESET)
        except Exception:
            pass  # client already disconnected — nothing to send
