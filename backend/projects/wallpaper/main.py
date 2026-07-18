import time
import shutil
import sys

from .ansi import (
    CLEAR,
    HOME,
    HIDE_CURSOR,
    SHOW_CURSOR,
    RESET,
    FPS,
    enable_ansi_on_windows,
)

from .menu import (
    ask_mode,
    ask_speed_factor,
    ask_color_speed_factor,
    ask_color_mode,
)

from .modes import (
    ScrollMode,
    WaveFullMode,
    WaveLineMode,
    MatrixMode,
    FireworksMode,
    BurstsMode,
    ShootingStarMode,
    OrbsMode,
    BounceMode,
    PendulumMode,
    PulseMode,
    WormFieldMode,
    OrbitalsMode,
    SandMode,
    NebulaMode,
    FireMode,
    VillageWorldMode,
    MeteorShowerMode,
)

# Shared mode registry.
#
# The local terminal runner uses this file directly.
# The FastAPI/xterm.js browser runner also imports this dictionary.
# That keeps both runners connected to the same mode list without making
# the individual modes care where their frames are displayed.
MODE_CLASSES = {
    "scroll": ScrollMode,
    "wave_full": WaveFullMode,
    "wave_line": WaveLineMode,
    "matrix": MatrixMode,
    "fireworks": FireworksMode,
    "bursts": BurstsMode,
    "stars": ShootingStarMode,
    "orbs": OrbsMode,
    "bounce": BounceMode,
    "pendulum": PendulumMode,
    "pulse": PulseMode,
    "worm": WormFieldMode,
    "orbitals": OrbitalsMode,
    "sand": SandMode,
    "nebula": NebulaMode,
    "fire": FireMode,
    "village": VillageWorldMode,
    "meteors": MeteorShowerMode,
}


MODE_INFO = {
    "scroll": {
        "label": "Scroll",
        "description": "Fake command output and terminal log motion.",
        "safe_for_web": True,
    },
    "wave_full": {
        "label": "Wave Full",
        "description": "Full-screen sine-wave animation.",
        "safe_for_web": True,
    },
    "wave_line": {
        "label": "Wave Line",
        "description": "Slithering line animation.",
        "safe_for_web": True,
    },
    "matrix": {
        "label": "Matrix",
        "description": "Falling digit rain.",
        "safe_for_web": True,
    },
    "fireworks": {
        "label": "Fireworks",
        "description": "Vertical rockets with particle bursts.",
        "safe_for_web": True,
    },
    "bursts": {
        "label": "Bursts",
        "description": "Random radial particle explosions.",
        "safe_for_web": True,
    },
    "stars": {
        "label": "Shooting Stars",
        "description": "Diagonal shooting stars and background twinkle.",
        "safe_for_web": True,
    },
    "orbs": {
        "label": "Orbs",
        "description": "Colliding/orbiting orb motion.",
        "safe_for_web": True,
    },
    "bounce": {
        "label": "Bounce",
        "description": "Gravity-driven bouncing balls.",
        "safe_for_web": True,
    },
    "pendulum": {
        "label": "Pendulum",
        "description": "Double-pendulum trace.",
        "safe_for_web": True,
    },
    "pulse": {
        "label": "Pulse",
        "description": "Expanding ring animation.",
        "safe_for_web": True,
    },
    "worm": {
        "label": "Worm Field",
        "description": "Flowing worm trails.",
        "safe_for_web": True,
    },
    "orbitals": {
        "label": "Orbitals",
        "description": "Moving orbital particles.",
        "safe_for_web": True,
    },
    "sand": {
        "label": "Sandfall",
        "description": "Falling sand pile simulation.",
        "safe_for_web": True,
    },
    "nebula": {
        "label": "Nebula",
        "description": "Swirling space cloud animation.",
        "safe_for_web": True,
    },
    "fire": {
        "label": "Fire",
        "description": "Campfire / torch flame animation.",
        "safe_for_web": True,
    },
    "village": {
        "label": "Village",
        "description": "Tiny villages growing and fighting.",
        "safe_for_web": False,
    },
    "meteors": {
        "label": "Meteors",
        "description": "Meteor shower and fragments.",
        "safe_for_web": False,
    },
}


def list_modes_for_web(include_unsafe: bool = False) -> list[dict]:
    """
    Router helper.

    The web page can call /api/terminalfx/modes and get a clean list without
    needing to know Python class names or menu aliases.
    """
    modes: list[dict] = []

    for mode_id in sorted(MODE_CLASSES):
        info = MODE_INFO.get(mode_id, {})
        safe_for_web = bool(info.get("safe_for_web", True))

        if not include_unsafe and not safe_for_web:
            continue

        modes.append(
            {
                "id": mode_id,
                "label": str(info.get("label", mode_id.replace("_", " ").title())),
                "description": str(info.get("description", "")),
                "safeForWeb": safe_for_web,
            }
        )

    return modes


def run_mode(mode):
    """
    Run a single mode until the user interrupts (Ctrl+C).

    This stays as the local terminal runner. Do not use this function for the
    browser/xterm.js path because it depends on stdout and terminal sizing.
    """
    sys.stdout.write(HIDE_CURSOR + CLEAR)
    sys.stdout.flush()

    last_time = time.perf_counter()
    start_time = last_time
    frame_time = 1.0 / FPS

    write = sys.stdout.write
    flush = sys.stdout.flush

    try:
        while True:
            now = time.perf_counter()
            dt = now - last_time
            last_time = now
            t_abs = now - start_time

            width, height = shutil.get_terminal_size((80, 24))

            if width < 5 or height < 3:
                time.sleep(0.1)
                continue

            mode.update(dt, width, height, t_abs)
            frame = mode.render(width, height, t_abs)

            write(HOME)
            write(frame)
            write(RESET)
            flush()

            elapsed = time.perf_counter() - now
            sleep_for = frame_time - elapsed
            if sleep_for > 0:
                time.sleep(sleep_for)

    except KeyboardInterrupt:
        return
    except Exception as exc:
        write(RESET + SHOW_CURSOR + "\n")
        flush()
        print(f"\n[ERROR] Mode crashed: {exc}")
        input("Press ENTER to return to the menu...")
        return


def main():
    enable_ansi_on_windows()

    try:
        while True:
            print("Fake Terminal Wallpaper\n")

            mode_name = ask_mode()
            if mode_name is None:
                break
            if mode_name == "q":
                break

            speed_factor = ask_speed_factor()
            color_speed_factor = ask_color_speed_factor()
            color_provider = ask_color_mode(color_speed_factor)

            ModeClass = MODE_CLASSES.get(mode_name)
            if ModeClass is None:
                print(f"Unknown mode '{mode_name}'.")
                time.sleep(1.0)
                continue

            mode = ModeClass(speed_factor, color_provider)
            run_mode(mode)

            sys.stdout.write(SHOW_CURSOR + RESET + "\n")
            sys.stdout.flush()

            choice = input(
                "Press ENTER for another mode, or 'q' to quit: "
            ).strip().lower()
            if choice == "q":
                break

    finally:
        sys.stdout.write(SHOW_CURSOR + RESET + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
