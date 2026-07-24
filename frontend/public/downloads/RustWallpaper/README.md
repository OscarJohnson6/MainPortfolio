# TerminalFX (Rust Edition)

A high-performance, terminal-based wallpaper animation engine written in Rust. Designed for low CPU/memory overhead, smooth frame rates, and cross-platform terminal compatibility.

---

## 🚀 Quick Start

1. Place `terminal_wallpaper.exe` (or `terminal_wallpaper` on Linux/macOS) in your desired directory.
2. Open your terminal (Windows Terminal, Alacritty, WezTerm, iTerm2, or Kitty recommended).
3. Run the executable directly from your terminal:

```powershell
# Windows PowerShell / Command Prompt
.\terminal_wallpaper.exe

# Linux / macOS
./terminal_wallpaper
```

---

## 🎛️ Command-Line Arguments & Options

Customize performance, rendering modes, and FPS directly from the CLI:

```bash
terminal_wallpaper [OPTIONS]
```

### Available Options

| Option | Short | Description | Default |
| :--- | :--- | :--- | :--- |
| `--mode <MODE>` | `-m` | Select specific animation mode (see list below) | `matrix` |
| `--fps <INT>` | `-f` | Target frames per second (15 - 120) | `60` |
| `--color <SCHEME>`| `-c` | Color palette (`green`, `cyberpunk`, `fire`, `rgb`) | `green` |
| `--help` | `-h` | Print help information and option descriptions | — |
| `--version` | `-V` | Print version information | — |

### Example Usage Commands

```bash
# Launch Matrix Rain mode at 60 FPS
.\terminal_wallpaper.exe --mode matrix --fps 60

# Launch Double Pendulum physics simulation
.\terminal_wallpaper.exe -m pendulum -f 60

# Launch Particle Explosion simulation in Cyberpunk palette
.\terminal_wallpaper.exe -m particles -c cyberpunk
```

---

## 🎨 Available Animation Modes

* `matrix` — Classic cascading digital rain effect with customizable density and speed.
* `pendulum` — Chaos-theory double pendulum physics simulation with motion trails.
* `particles` — Dynamic 2D particle explosion engine with velocity vectors and gravity.
* `orbital` — Multi-body gravitational orbital mechanics simulation.
* `starfield` — 3D parallax starfield warp effect.
* `fire` — Procedural cellular fire simulation with thermal decay.

---

## ⌨️ Interactive Controls

While an animation is actively rendering in your terminal:

| Key | Action |
| :--- | :--- |
| `Q` / `Esc` | Cleanly exit the engine and restore terminal state |
| `Space` | Pause / Resume animation |
| `N` / `Tab` | Cycle to the next animation mode |
| `P` | Cycle to the previous animation mode |
| `+` / `=` | Increase simulation speed / frame rate |
| `-` | Decrease simulation speed / frame rate |

---

## 💻 Recommended Terminal Setup

For the best visual fidelity and sub-millisecond frame pacing:

1. **Terminal Emulator:** Use a modern GPU-accelerated terminal:
   * **Windows:** Windows Terminal, Alacritty, or WezTerm.
   * **Linux:** Alacritty, Kitty, WezTerm, or Foot.
   * **macOS:** iTerm2, Alacritty, or WezTerm.
2. **Font Support:** Use a TrueType/OpenType monospaced font with full Unicode/Nerd Fonts coverage (e.g., *JetBrains Mono*, *Fira Code*, *Cascadia Code*).
3. **Color Depth:** Ensure your terminal environment supports 24-bit TrueColor (`COLORTERM=truecolor`).

---

## ⚙️ Performance & Diagnostics

The Rust implementation leverages `crossterm` / direct ANSI escape buffer writing for minimal latency and flicker-free double buffering.

* **Target CPU Usage:** < 1% on modern multi-core processors at standard terminal dimensions.
* **Memory Footprint:** ~3 MB to 8 MB RSS.

---

## 🔧 Troubleshooting

* **Screen Flickering:** Ensure your terminal window is maximized before launching. If flickering persists, lower the target FPS using `--fps 30`.
* **Garbled Characters / Question Marks:** Ensure your terminal encoding is set to **UTF-8**.
* **Colors Look Flat / Basic 16-Color:** Set your system environment variable `COLORTERM=truecolor` before running.
