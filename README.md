# OJ Builds

OJ Builds is a personal portfolio and app hub for projects by Oscar Johnson. The goal is to make projects usable from the site when possible, not just display screenshots or link to GitHub.

The site currently focuses on:

- Web apps and browser tools
- Python FastAPI-backed projects
- React/Next.js project pages
- Terminal/ASCII visual experiments
- Real-time WebSocket projects
- Older projects converted, preserved, or archived when useful

The project is intentionally structured so each project can have its own route, UI, and behavior instead of being forced into one generic dynamic project template.

---

## Current status

The portfolio is now more than a static project list. Several projects are being hosted directly inside the site:

- **TexVoice** runs as a real frontend + FastAPI-backed generator workflow. v2 adds react-pdf for document preview, a `generateFromImport` flow that fetches and regenerates archive items, fullscreen PDF, and proper "View TeX / Open PDF" buttons with no auto-download.
- **Terminal FX** streams the Python terminal animation engine into the browser through WebSockets and xterm.js. The Rust/WASM/canvas renderer also runs client-side for pixel-mode experiments.
- **Rhythm Sync** is a playable WebSocket rhythm duel with a campaign-first menu, AI opponents, multiplayer support, western showdown UI, timing-based combat, opponent intent visuals, and fullscreen support.
- **Arcade** replaced the old Wordle project page. It hosts browser games (Blackjack, Snake, Flappy Bird) built from scratch in React and Canvas. Original Wordle source is still on GitHub.
- **Toolbox** collects small utilities that would otherwise be one-off scripts.
- **Admin** is a protected dashboard (cookie auth) for Pi monitoring, service health, and WOL. Only accessible with `ADMIN_SECRET`.
- **Status** is a public read-only system health page showing service uptime, Pi temperature, and CPU.

Target Transmission has been fully replaced by Rhythm Sync.

---

## Current stack

### Frontend

- Next.js App Router
- TypeScript
- React
- JSX for imported/older app projects where TypeScript would add noise
- Tailwind CSS
- xterm.js for browser terminal rendering
- react-pdf for PDF display in TexVoice (uses pdf.js under the hood)
- Geist fonts

### Backend

- Python 3.14
- FastAPI
- WebSockets
- psutil for Pi system monitoring (install: `pip install psutil --break-system-packages`)
- Project-specific routers under `routers/`
- Project logic grouped under `projects/`

### Rust / native

- Rust native terminal wallpaper app (standalone `.exe`)
- Rust/WASM/canvas experiment for pixel-mode rendering in the browser
- Compiled to WASM with wasm-bindgen, served as static files under `frontend/public/wasm/`

---

## Project structure

```txt
frontend/
├── middleware.ts               ← auth gate for /admin routes (root level, not inside src/)
└── src/
    ├── app/
    │   ├── layout.tsx
    │   ├── globals.css
    │   ├── page.tsx
    │   ├── about/
    │   │   └── page.tsx
    │   ├── status/
    │   │   └── page.tsx        ← public system status page
    │   ├── admin/
    │   │   ├── login/
    │   │   │   └── page.tsx
    │   │   └── page.tsx        ← protected admin dashboard
    │   ├── api/
    │   │   ├── admin/
    │   │   │   ├── login/
    │   │   │   │   └── route.ts
    │   │   │   └── logout/
    │   │   │       └── route.ts
    │   │   └── admin-proxy/
    │   │       └── [...path]/  ← literal folder name with brackets
    │   │           └── route.ts
    │   └── project/
    │       ├── layout.tsx
    │       ├── texvoice/
    │       │   ├── page.tsx
    │       │   ├── TexVoiceApp.tsx
    │       │   └── PDFViewer.tsx
    │       ├── terminal-fx/
    │       │   └── page.tsx
    │       ├── rhythm-sync/
    │       │   ├── page.tsx        ← thin wrapper that renders the game
    │       │   └── WildRhythm.jsx  ← single-file client game UI
    │       ├── toolbox/
    │       │   └── page.tsx
    │       └── arcade/
    │           ├── page.tsx
    │           ├── ArcadeApp.tsx
    │           └── games/
    │               ├── Blackjack.tsx
    │               ├── Snake.tsx
    │               └── FlappyBird.tsx
    └── components/
        ├── SiteHeader.tsx      ← extracted client component (mobile hamburger menu)
        └── terminal-fx/
            ├── PythonTerminalDemo.tsx
            ├── TerminalCanvas.tsx
            ├── TerminalFxShowcase.tsx
            └── useCanvasEngine.ts

backend/
├── main.py                     ← includes request log middleware + admin router
├── routers/
│   ├── __init__.py
│   ├── admin.py                ← system stats, service health, WOL, logs, /api/status
│   ├── texvoice.py
│   ├── wallpaper.py
│   └── rhythm_sync.py
└── projects/
    ├── __init__.py
    ├── texvoice/
    ├── wallpaper/
    │   ├── __init__.py
    │   ├── main.py
    │   ├── web_runner.py
    │   ├── ansi.py
    │   ├── color.py
    │   ├── base_mode.py
    │   ├── menu.py
    │   └── modes/
    └── rhythm_sync/
        ├── __init__.py
        ├── server.py
        ├── campaign.py
        └── ai.py

rust/                           ← native Terminal FX app and WASM source
```

---

## Setup

### Frontend

From the `frontend/` folder:

```bash
npm install
npm run dev
```

Default frontend URL:

```
http://localhost:3000
```

Required for TexVoice PDF display:

```bash
npm install react-pdf
```

The react-pdf worker loads from unpkg CDN at runtime — no webpack config needed. If you see canvas-related warnings, add this to `next.config.ts`:

```ts
webpack: (config) => {
  config.resolve.alias.canvas = false;
  return config;
},
```

If xterm.js is not installed:

```bash
npm install @xterm/xterm @xterm/addon-fit
```

Do not run `npm audit fix --force`. It has previously downgraded Next.js to `^9.3.3` while React stayed on 19, which breaks everything. Use `npm audit fix` (without `--force`) or ignore audit warnings for packages without real exploits.

A reasonable dependency set:

```json
{
  "dependencies": {
    "@xterm/addon-fit": "^0.11.0",
    "@xterm/xterm": "^6.0.0",
    "next": "16.2.6",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "react-pdf": "^9.x"
  }
}
```

### Backend

From the `backend/` folder:

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Install psutil for admin/status system monitoring:

```bash
pip install psutil --break-system-packages
```

Expected health route:

```
http://127.0.0.1:8000/api/health
```

Expected public status route:

```
http://127.0.0.1:8000/api/status
```

Expected admin stats route (only reachable via Next.js proxy, blocked externally by nginx):

```
http://127.0.0.1:8000/api/admin/stats
```

---

## Environment variables

### Frontend — `.env.local` (project root, never commit this)

```env
# Backend URL (default is localhost:8000)
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000

# Rhythm Sync WebSocket (derived from API base if not set)
NEXT_PUBLIC_RHYTHM_SYNC_WS_URL=ws://127.0.0.1:8000/api/rhythm-sync/ws

# Admin dashboard token — generate with:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ADMIN_SECRET=your-token-here
```

### Backend — set in environment or systemd service on Pi

```env
# Same token as frontend ADMIN_SECRET
ADMIN_SECRET=your-token-here

# MAC address of main PC for Wake-on-LAN
WOL_MAC=AA:BB:CC:DD:EE:FF
```

### Production / Pi deployment note

Update the CORS regex in `main.py` to include your domain:

```python
allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|yourdomain\.com)(:\d+)?$"
```

Also add this to your nginx config to block external access to admin API routes:

```nginx
# Block direct access to admin backend routes
location /api/admin/ {
    return 403;
}

# Proxy everything else to FastAPI
location /api/ {
    proxy_pass http://localhost:8000;
}
```

---

## Main pages

### Home — `/`

Project overview and portfolio introduction. Not a hype-heavy landing page. The current preferred tone:

```
Web software projects, tools, and experiments.
```

### About — `/about`

Explains the reasoning behind each project without sounding AI-generated. Includes personal context on why things were built and why some older projects were retired.

### Status — `/status`

Public system health page. Shows service uptime indicators, Pi CPU and temperature, and uptime. No auth required. Worth linking from the main nav so visitors can find it.

### Admin — `/admin`

Protected dashboard for Pi management. Requires the `ADMIN_SECRET` cookie. Shows:

- System stats (CPU, RAM, disk, temperature)
- Service health with response times
- System uptime and load averages
- Wake-on-LAN for the main PC
- Live backend request log

The login page is at `/admin/login`. After login, a 7-day HTTP-only cookie is set. The dashboard polls the backend through a Next.js proxy route (`/api/admin-proxy/`) so the admin secret never touches client JavaScript.

---

## Project pages

### TexVoice — `/project/texvoice`

Converts LaTeX or plain text notes into audio with chapters, logs, and browser playback.

**v2 changes:**
- `PDFViewer.tsx` replaces the old iframe. Uses react-pdf with page navigation, fullscreen overlay, and responsive width via `ResizeObserver`.
- "View TeX" opens source in a new tab. "Open PDF" opens PDF in a new tab. No auto-download.
- Library items without audio now show a "Generate audio from example" button that fetches the source file from the import URL and submits it to the generator.
- `generatingFromPdfUrl` preserves the library PDF across generation so the viewer doesn't disappear while audio is being made.
- The `generateAudio` function accepts an optional `customFile` parameter so it can be called from `generateFromImport` without changing file state first.

**Import structure** (add items here to populate the archive):

```
backend/imports/texvoice/<slug>/
    source.tex      ← required for generation
    document.pdf    ← optional, shown in viewer
    audio.mp3       ← optional, played directly
    chapters.json   ← optional, enables timestamps
    preview.txt     ← optional, summary shown in archive list
```

### Terminal FX — `/project/terminal-fx`

Python version streams real ANSI animation frames through FastAPI WebSockets to xterm.js.

Rust/WASM version runs entirely in the browser via canvas — no server involved. Modes are compiled to WASM and served from `public/wasm/`.

Current architecture:

```
Python → mode.update() → mode.render() → FastAPI WebSocket → xterm.js
Rust   → CanvasEngine.update() → CanvasEngine.render_pixels() → WASM → canvas.putImageData()
```

The Python and Rust renderers are mounted in `TerminalFxShowcase.tsx` as a toggle — only one is mounted at a time to avoid running both simultaneously.

### Rhythm Sync — `/project/rhythm-sync`

Real-time rhythm duel game with WebSocket match state, campaign mode, AI personalities, boss abilities, multiplayer, and a western showdown UI.

Originally a school multiplayer/networking project. The current version is rebuilt as a playable portfolio game with a simple mode menu, single-player campaign as the primary path, and a duel scene where the rhythm ring is integrated into the opponent down the road.

Full architecture and implementation notes are in the technical section below.

### Arcade — `/project/arcade`

Browser games built from scratch in React and Canvas. Replaced the old Wordle project page.

Current games:
- **Blackjack** — `useReducer` state machine, chip-based betting, proper dealer draw-to-17 logic
- **Snake** — 20×20 canvas grid, RAF game loop, state in refs so keyboard events never go stale
- **Flappy Bird** — canvas physics, pipe generation, `collidesWithPipe` defined outside the component to keep the RAF loop dependency-free

Adding a new game: create a component in `arcade/games/`, export it, add it to the `GAMES` array in `ArcadeApp.tsx` with a preview element. The selector grid and routing are automatic.

Original Wordle source is still on GitHub as project history. The about page reasoning section still mentions it for that reason.

### Toolbox — `/project/toolbox`

Small browser utilities. Electron shell calculator ported from Python. Even division finder for LED timing and animation steps. Goal is to collect things that would otherwise be one-off scripts.

---

## Admin architecture

### Auth flow

```
Browser → /admin page
          → middleware.ts reads admin_token cookie
          → no token → redirect to /admin/login
          → valid token → allow

Browser → /admin/login form
          → POST /api/admin/login
          → sets HTTP-only admin_token cookie
          → redirect to /admin

Browser (dashboard) → /api/admin-proxy/stats
                     → Next.js route.ts reads cookie server-side
                     → valid → forwards to localhost:8000/api/admin/stats
                     → FastAPI returns data
```

The proxy pattern means the admin secret never appears in client JavaScript. The HTTP-only cookie can't be read by JS at all — it's only sent automatically by the browser on requests to the same origin.

### nginx security

Add this block above the general `/api/` proxy block to prevent direct external access to admin endpoints:

```nginx
location /api/admin/ {
    return 403;
}
```

This means the FastAPI admin endpoints are only reachable server-to-server (Next.js proxy → localhost:8000), not from external clients.

---

## Terminal FX technical notes

### Python mode contract

```python
mode.update(dt, width, height, t_abs)
frame = mode.render(width, height, t_abs)
```

The mode does not need to know whether output goes to a terminal, xterm.js, or a recording. `main.py` is the local runner. `web_runner.py` is the browser/WebSocket path. Keep them separate.

### Rust/WASM lifecycle fix — dlmalloc panic

The Rust/WASM canvas renderer previously could panic on the first switch from the Python renderer to the Rust renderer:

```txt
assertion failed: psize >= size + min_overhead
```

The symptom showed up most often in development after navigating to the Rust renderer for the first time. Refreshing or navigating back could appear to "fix" it because the WASM module and layout state had already settled.

The practical cause was a React/WASM lifecycle race:

- React development mode can mount, clean up, and remount components.
- `useCanvasEngine.ts` was using `mountedRef` as the async guard, but `mountedRef` can become `true` again during a newer mount while an older async WASM initialization is still finishing.
- That older async run could still create or publish a `CanvasEngine` after it should have been dead.
- The engine ref also needs to be freed before replacement or cleanup because the Rust/WASM allocation lives inside the WASM linear memory, not the JavaScript heap.

The fix is now handled inside `useCanvasEngine.ts`.

Core stability rules:

1. `CanvasEngineInstance` includes `free()`.
2. A `runIdRef` marks each engine lifecycle run so old async work cannot publish a stale engine.
3. WASM initialization is shared through one `wasmInitPromiseRef` so development remounts do not overlap `wasm.default()` calls.
4. Engine creation waits briefly for the canvas to have a real layout box before calculating the WASM render size.
5. Existing engines are disposed before restart, cleanup, or replacement.
6. If a frame panics, the current engine is treated as poisoned and disposed before showing the restart overlay.

Important pattern:

```typescript
const runId = runIdRef.current + 1;
runIdRef.current = runId;

function isActiveRun(runId: number) {
  return mountedRef.current && runIdRef.current === runId;
}
```

That guard is more reliable than `mountedRef` alone because it distinguishes the current mount from an older async mount that resumed late.

The renderer toggle in `TerminalFxShowcase.tsx` is still correct: only the Python renderer or Rust renderer is mounted at one time. The lifecycle protection belongs in `useCanvasEngine.ts`, not in the page-level toggle.


### Rust RNG note

This project uses `rand 0.10+` patterns:

```rust
let mut rng = rand::rng();
let value = rng.random_range(0..255);
```

Not the older:

```rust
let mut rng = rand::thread_rng();
let value = rng.gen_range(0..255);
```

---

## Rhythm Sync technical notes

### Architecture

```
React game UI
→ WebSocket messages
→ FastAPI router adapter (rhythm_sync.py)
→ Rhythm Sync server/game loop (server.py)
→ campaign.py for stage metadata
→ ai.py for AI personality decisions
```

### File responsibilities

`server.py` — match engine, WebSocket coordinator, shot resolution, round transitions.

`campaign.py` — campaign stage list, map node data, boss stage metadata, stage lookup helpers.

`ai.py` — personality behavior rules, action pacing, taunt decision logic, shot thresholds, boss ability cooldowns.

`WildRhythm.jsx` is intentionally kept as a single JSX client component for now. It contains the WebSocket hook, menu, combat scene, rhythm target, overlays, history modal, and tutorial modal in one place because this older project is easier to maintain as one cohesive game shell than as many small legacy components.

`page.tsx` should stay thin and only render `<WildRhythm />`; the game component owns the screen layout.

Converting this to TSX before the WebSocket protocol is typed would add noise without much benefit.

### AI personality goals

```
panic:    Erratic. Can act too early but not perfect.
coward:   Defensive. Waits for safer shots, uses trick pressure.
brawler:  Aggressive. Uses pressure tools but does not spam sand.
deadeye:  Patient and accurate. Shoots when odds are actually strong.
legend:   Final boss. Can shift style by round.
```

### Frontend timing rule

The rhythm ring is rendered in the western scene around the opponent. Keep only one static target ring and one animated timing ring; extra decorative rings make the beat target harder to read.

Do not call `Date.now()` during render. Use state-backed time:

```jsx
const [clientNowMs, setClientNowMs] = useState(0);

useEffect(() => {
  const tick = () => setClientNowMs(Date.now());
  tick();
  const id = window.setInterval(tick, 100);
  return () => window.clearInterval(id);
}, []);
```

Pass `clientNowMs` down as props. Do not read mutable refs during render.

---

## Known issues

### Resolved: Terminal FX WASM first Rust mount panic

The previous first-switch Rust/WASM `dlmalloc` panic is fixed in `useCanvasEngine.ts`. Keep this note as historical debugging context, but it is no longer an active known issue.

### Terminal FX fullscreen exit bug

After exiting fullscreen, the xterm terminal may look zoomed or not fit correctly.

Fix direction: call `fitAddon.fit()` multiple times after the `fullscreenchange` event fires. Use `setTimeout` delays (50ms, 200ms, 500ms) and `requestAnimationFrame`. Send a resize to the backend after fitting. Keep `scrollback: 0` on the terminal.

### Terminal FX component import error

```
Element type is invalid: expected a string or class/function but got undefined.
```

This usually means mismatched default vs named export. Pick one style and use it consistently:

```tsx
// Named
export function PythonTerminalDemo() {}
import { PythonTerminalDemo } from "@/components/terminal-fx/PythonTerminalDemo";

// Default
export default function PythonTerminalDemo() {}
import PythonTerminalDemo from "@/components/terminal-fx/PythonTerminalDemo";
```

### Admin dashboard 404s on initial load

If the admin proxy routes return 404, check two things:

1. `middleware.ts` is at the project root (same level as `package.json`), not inside `src/`.
2. The proxy folder is literally named `[...path]` — square brackets included. Next.js uses bracket syntax in the filesystem to define dynamic route segments.

The correct path is: `src/app/api/admin-proxy/[...path]/route.ts`

### Rhythm Sync WebSocket warning on load

Check `http://127.0.0.1:8000/api/rhythm-sync/health`. If it fails, the backend is not running or the router is not mounted. In Next.js dev mode, use `console.warn` instead of `console.error` for expected WebSocket failures — `console.error` triggers a visible error overlay in development.

---

## Development priorities

### Up next

1. Add `/status` link to site nav in `SiteHeader.tsx` and footer in root `layout.tsx`.
2. Set `ADMIN_SECRET` env variable and verify admin login flow end-to-end.
3. Configure nginx on Pi to block `/api/admin/` from external traffic before going live.
4. Update CORS regex in `main.py` for the Pi's domain.
5. Test `generateFromImport` with an actual archive item in TexVoice.

### Near term

1. Add more Arcade games. The selector grid and routing are already built — just add a component to `arcade/games/` and an entry to the `GAMES` array in `ArcadeApp.tsx`.
2. Add Pi-specific systemd service files for uvicorn and Next.js once deployed.
3. Add videos or download placeholders for the native Rust Terminal FX app.
4. Finish Toolbox division finder.

### Later

1. TexVoice v3: parse non-LaTeX file types (Markdown, Word, etc.) for the generator.
2. Add side-ring or echo-beat hazards to Rhythm Sync after the current western duel UI is stable.
3. Add more Rust Canvas/WASM modes. Start with one pixel-friendly mode, not all of them at once.
4. Add highlighted PDF text sync to TexVoice (audio position → PDF section highlight).

---

## Old/legacy project notes

### GenieFit

Legacy Java fitness app. Stack: Java 11, Jersey, Hibernate, MySQL, JSP, JWT, Maven. Worth mentioning in interviews as an older full-stack project but not worth reviving. Outdated architecture, crowded niche, no practical reason to maintain.

### PHP Grocery Store

Old PHP project. Possibly gone. Worth mentioning as an early ambitious attempt. Not worth reviving.

Possible future section name if these get their own page:

```
Retired Projects / The Dungeon
```

Low priority. Keep it short if it happens at all.

---


random learning note, node auto goes to the index file.

## Philosophy / direction

This portfolio should not feel like a generic template or a fake startup dashboard.

It should feel like:

```
a working archive of projects I built,
with enough polish that people can try them,
and enough context that they understand why they exist.
```

The most important principle:

```
Make projects usable when practical, but do not waste time reviving old projects that no longer matter.
```


run this command and update middleware ts to be proxy ts. `npx @next/codemod@canary middleware-to-proxy .`