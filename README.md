# OJ Builds

**Live site:** [oscarjohnson.dev](https://oscarjohnson.dev)

OJ Builds is where my projects live and stay usable. Every project here started because I wanted it for something: a lighter desktop background, audio versions of my notes, games without ads. Each one also stands on its own (Terminal FX still runs from a normal terminal, TexVoice has its own CLI). This site connects them, hosts them, and makes them usable from a browser.

Order of priorities:

1. **Useful to me first.** A project earns its place by being something I (or someone else) will actually use.
2. **Usable, not just shown.** If a project can run in the browser or against my server, it does. No screenshot-only cards.
3. **Portfolio second.** Being able to show these in an interview is a nice side effect of building them, not the reason.

---

## Projects

| Project | What it's for | Runs on | Complete | Happy with it |
|---|---|---|---|---|
| [Terminal FX](#terminal-fx) | Lightweight animated wallpaper instead of Wallpaper Engine | Browser + Pi | 9/10 | 9.5/10 |
| [House Rules](#house-rules) | A blackjack roguelite built around what makes a run fun | Browser | 8–9/10 | 9/10 |
| [TexVoice](#texvoice) | Listen to my LaTeX notes; accessible audio for any LaTeX doc | Pi | 8.5/10 | 9.5/10 |
| [Arcade](#arcade) | Games I play, ad-free, with the rules I want | Browser | 8/10 (open-ended) | 9.5/10 |
| [Toolbox](#toolbox) | Small scripts worth keeping in one place | Browser | 8/10 | 7/10 |
| [Rhythm Sync](#rhythm-sync) | Learning real-time WebSockets; networking class project | Pi | 9.75/10 | 2–3/10 |

**In progress:** a math function analyzer (graph, limits, derivatives, step-by-step view) and an AI assistant inside the admin dashboard.

**Parked:** Finance Lab (`/project/finance-lab`) was meant to help me and friends find good stocks, but getting accurate market data was more hassle than it was worth. The page still works with preset values for anyone who finds it; it's intentionally unlisted and its backend router isn't mounted.

### Terminal FX

`/project/terminal-fx`

Started as a Python ASCII wallpaper for the command line so I could drop Wallpaper Engine and get processing power back while still having a background. The Rust version was the upgrade: it draws pixel-sized character blocks so scenes respond to actual pixels instead of ASCII glyphs. On the site, the Python engine runs on the Pi and streams ANSI frames over WebSockets to xterm.js, and some Rust modules are compiled to WebAssembly so they run in the browser as examples.

Still runs standalone from a terminal; the portfolio is just another way to view it.

**Goals / todo**
- Add author/publisher metadata to the downloadable `.exe`/`.zip` so browsers stop flagging it.
- Finish WebAssembly builds for the remaining Rust modules.
- Clean up some of the Python wallpapers.
- Known bug: after leaving fullscreen, xterm can look zoomed. Call `fitAddon.fit()` a few times after `fullscreenchange` (50/200/500 ms) and resend the size to the backend.

### House Rules

`/project/house-rules`

Blackjack, but very different, and meant to hold up as a real standalone game. The point was designing from user stories: what a player would expect, what feels unfair, and what makes a run worth replaying. The card mode is mostly complete; the alphabet mode is out of date.

**Goals / todo**
- Rework the alphabet mode (the main open design problem).
- Playtest runs for feel, pacing, and replay value.
- Keep game logic (`logic/`, `data/`, `bosses/`) independent of React so it could be packaged as a standalone build later (desktop/Steam or mobile).

### TexVoice

`/project/texvoice`

Turns LaTeX (or plain text) notes into audio with chapters, timestamps, a PDF reading view, and logs. I made it so I could listen to my notes while falling asleep. It also works as an accessibility tool: any LaTeX document can ship with an audio version. My own LaTeX notes live here as examples and as an archive (`imports/latex/`).

**Goals / todo**
- Compile LaTeX regardless of which packages a file uses (install a fuller TeX Live on the Pi, or fall back gracefully per package).
- Highlight the text being read in the PDF as audio plays.
- Later: accept other formats (Markdown, Word).

**Note on HTTP 403 during generation:** the TexVoice backend never returns 403. Audio comes from Microsoft's Edge TTS service via `edge-tts`, and that service answers 403 when its signed request token is rejected (Pi clock out of sync with the server, or an outdated `edge-tts`). The generator now retries and reports this clearly. If it keeps happening, check `timedatectl` on the Pi and upgrade `edge-tts`.

### Arcade

`/project/arcade`

Copies of games I play, without ads, with the changes I wanted: six-letter Wordle, hints without watching ads, and so on. Less a standalone project and more a mini-game dashboard.

Current games: Blackjack, Wordle, Letter Connect, Snake, Flappy Bird, 2048.

**Adding a game:** create a component in `arcade/games/` and add an entry to the `GAMES` array in `ArcadeApp.tsx`. The selector grid and routing are automatic.

### Toolbox

`/project/toolbox`

Small scripts from learning a topic or solving a single problem: Electron shell calculator, even division finder (LED timing / animation steps), quick text-to-audio. Simple on purpose; it grows when I write something worth keeping.

### Rhythm Sync

`/project/rhythm-sync`

Built for a networking class that only required a game using sockets. I wanted to actually learn how real-time socket traffic works, so I built a rhythm duel over WebSockets instead of the usual CRUD app. For the portfolio I added a solo campaign with AI opponents and global modifiers (like the Wild West mode) so it can be played without a second person.

Functionally done. I'm not happy with how it's built and a real improvement would mean a rewrite, which I don't plan to do. It stays up as-is.

---

## Site pages

| Route | Purpose |
|---|---|
| `/` | Short intro, then every project in one grid. Each card shows whether it runs in the browser or needs the Pi. |
| `/about` | Why each project exists, how hosting works, resume note. |
| `/admin` | Protected Pi dashboard: CPU/RAM/disk/temp, service health, uptime, Wake-on-LAN, request log. |

The resume is intentionally not posted (it contains my phone number and email). People reviewing my work usually already have it.

---

## Architecture

```txt
Browser ──► Vercel (Next.js)            frontend, browser-only projects, Rust/WASM
   │
   └──────► api.oscarjohnson.dev ──► Cloudflare Tunnel ──► Raspberry Pi 5
                                                            └─ FastAPI (oj-builds-api service)
                                                               ├─ /api/texvoice
                                                               ├─ /api/terminalfx   (WebSocket)
                                                               ├─ /api/rhythm-sync  (WebSocket)
                                                               └─ /api/admin        (token-protected)
```

### Stack

- **Frontend:** Next.js App Router, React, TypeScript (JSX for a couple of older single-file games), Tailwind CSS, xterm.js, react-pdf
- **Backend:** Python, FastAPI, WebSockets, edge-tts, latexmk, psutil
- **Native:** Rust (standalone wallpaper app) compiled to WebAssembly with wasm-bindgen; output in `frontend/public/wasm/`

### Dependencies

Versions are what's installed from `package-lock.json` and `requirements.txt` as of October 2026.

**Frontend** (`frontend/package.json`)

| Package | Version | Used for |
|---|---|---|
| next | 16.2.9 | App Router framework, routing, server routes, `proxy.ts` |
| react / react-dom | 19.2.4 | UI |
| tailwindcss / @tailwindcss/postcss | 4.3.1 | Styling |
| typescript | 5.9.3 | Types |
| @xterm/xterm | 6.0.0 | Terminal FX browser terminal |
| @xterm/addon-fit | 0.11.0 | Resizing the xterm terminal to its container |
| react-pdf | 10.4.1 | TexVoice PDF viewer (pdf.js) |
| recharts | 3.8.1 | Finance Lab charts |
| @vercel/analytics | 2.0.1 | Page analytics on Vercel |
| eslint / eslint-config-next | 9.39.4 / 16.2.6 | Linting |

**Backend** (`backend/requirements.txt`, direct dependencies only; the rest are pulled in by these)

| Package | Version | Used for |
|---|---|---|
| fastapi | 0.136.3 | API and WebSocket routes |
| starlette | 1.3.1 | FastAPI's underlying framework (static files, middleware) |
| uvicorn | 0.49.0 | ASGI server run by the `oj-builds-api` service |
| websockets | 16.0 | WebSocket support in uvicorn (Terminal FX, Rhythm Sync) |
| python-multipart | 0.0.32 | File uploads (TexVoice) |
| pydantic | 2.13.4 | Request models |
| edge-tts | 7.2.8 | TexVoice text-to-speech (Microsoft Edge voices) |
| aiohttp | 3.14.1 | edge-tts networking; TTS retry handling |
| pylatexenc | 2.10 | LaTeX-to-text conversion in TexVoice |
| psutil | 7.2.2 | Pi stats on the admin dashboard |

**System tools on the Pi:** `latexmk` / TeX Live (TexVoice PDFs), `cloudflared` (tunnel), systemd.

### Layout

```txt
frontend/
├── proxy.ts                    auth gate for /admin (Next.js "proxy", formerly middleware)
├── components/                 SiteHeader (nav, theme, backend status), ProjectIntro
├── public/wasm/                compiled Terminal FX WASM
├── public/downloads/           native Rust wallpaper download
└── app/
    ├── page.tsx                home: intro + project grid
    ├── about/  admin/  api/
    └── project/
        ├── terminal-fx/  house-rules/  texvoice/
        ├── arcade/  toolbox/  rhythm-sync/
        └── finance-lab/        parked, preset data only

backend/
├── main.py                     app, CORS, request log, router mounts
├── routers/                    thin HTTP/WebSocket adapters per project
└── projects/                   project logic (each usable on its own)
    ├── texvoice/               also runnable as `python -m projects.texvoice`
    ├── wallpaper/              Terminal FX Python engine (main.py = terminal, web_runner.py = browser)
    ├── rhythm_sync/
    └── finance_lab/

imports/latex/                  TexVoice archive (my notes); PDFs built on deploy
backend-deployment.sh           Pi redeploy script
```

---

## Running locally

**Frontend** (`frontend/`)

```bash
npm install
npm run dev        # http://localhost:3000
```

Don't run `npm audit fix --force`; it has downgraded Next.js and broken the build before.

**Backend** (`backend/`)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Health check: `http://127.0.0.1:8000/api/health`. TexVoice PDF previews need `latexmk` (TeX Live).

### Environment

Frontend (`.env.local`, never committed):

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
NEXT_PUBLIC_RHYTHM_SYNC_WS_URL=ws://127.0.0.1:8000/api/rhythm-sync/ws   # optional, derived otherwise
API_BASE_URL=http://127.0.0.1:8000        # server-side, admin proxy
ADMIN_SECRET=...                          # admin login password
ADMIN_SESSION_SECRET=...                  # signs the admin session cookie
BACKEND_ADMIN_TOKEN=...                   # sent to FastAPI admin routes
```

Backend (systemd service on the Pi):

```env
BACKEND_ADMIN_TOKEN=...                   # must match the frontend
PUBLIC_API_BASE_URL=https://api.oscarjohnson.dev
WOL_MAC=AA:BB:CC:DD:EE:FF
```

CORS origins are listed in `backend/main.py`.

---

## Deploying the backend (Pi)

```bash
git pull
./backend-deployment.sh
```

The script installs pinned requirements, syntax- and import-checks the app, builds the TexVoice archive PDFs, restarts `oj-builds-api`, then checks local and public health. It logs to `~/.local/state/mainportfolio/deployments.log` and refuses to run twice at once.

Reading errors from the deployed API:
- **502 / 530 / "Failed to fetch":** the Pi or the tunnel isn't reachable (service down, Pi off).
- **500:** the backend is up but crashed handling the request; check `journalctl -u oj-builds-api`.
- **4xx with a JSON `detail`:** the backend rejected the request on purpose (bad input, missing file).
- **Error inside a TexVoice job (job status `error`):** a step after the request failed, such as LaTeX compilation or the TTS service.

Recommended: start the service after the clock is synced, since edge-tts signs requests with the current time:

```ini
[Unit]
After=network-online.target time-sync.target
Wants=network-online.target time-sync.target
```

---

## Technical notes

### Terminal FX: Python mode contract

```python
mode.update(dt, width, height, t_abs)
frame = mode.render(width, height, t_abs)
```

Modes don't know whether output goes to a terminal or the browser. `main.py` is the terminal runner, `web_runner.py` is the WebSocket path.

### Terminal FX: WASM lifecycle

`useCanvasEngine.ts` guards each async WASM init with a `runIdRef` so a stale React dev-mode mount can't publish an engine, shares one `wasm.default()` promise, waits for the canvas to have a layout size, and calls `free()` on engines before replacing them. This fixed the old `dlmalloc` "psize >= size + min_overhead" panic on first switch to the Rust renderer. Only one renderer (Python or Rust) is mounted at a time.

Rust uses `rand 0.10+` (`rand::rng()`, `random_range`).

### Rhythm Sync Route

```txt
WildRhythm.jsx ⇄ WebSocket ⇄ routers/rhythm_sync.py ⇄ server.py (match loop)
                                                     ├─ campaign.py (stages, bosses)
                                                     └─ ai.py (panic, coward, brawler, deadeye, legend)
```

`WildRhythm.jsx` stays one file on purpose. Don't call `Date.now()` during render; use a state-backed clock passed down as props.

### Admin auth

`/admin` is gated in `proxy.ts` by a signed, HTTP-only session cookie. The dashboard calls `/api/admin-proxy/[...path]`, which adds `BACKEND_ADMIN_TOKEN` server-side, so no secret reaches client JavaScript. FastAPI rejects admin routes without the token.

---

## Retired projects

- **GenieFit:** Java 11 / Jersey / Hibernate / MySQL fitness app. Outdated architecture, not worth reviving.
- **PHP Grocery Store:** early PHP project, probably gone.
- **Target Transmission:** replaced by Rhythm Sync.
- **Wordle page:** folded into Arcade.
