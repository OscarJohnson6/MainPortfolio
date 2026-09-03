# TexVoice

TexVoice is a LaTeX/text-to-speech study tool that turns `.tex` and `.txt` notes into listenable audio, timestamped chapters, generated scripts, logs, and PDF previews. It is built as part of the OJ Builds portfolio and is designed for long-form study notes where reading, listening, and navigating the source material should happen in one browser UI.

## What it does

- Upload a `.tex` file and preview the compiled PDF without generating audio.
- Upload a `.tex` or `.txt` file and generate speech audio.
- Select an archive note from `imports/latex` and generate temporary preview audio without overwriting the official archive files.
- Preview PDFs inside the app with PDF.js/react-pdf.
- Use fullscreen PDF mode with a compact audio/timestamp side menu.
- Navigate PDFs with single-page, continuous, and auto modes.
- Jump to a page directly.
- Preload nearby pages in single-page mode for smoother navigation.
- Select text in the PDF to fill the `Start at` field.
- Jump audio from timestamp/chapter buttons.
- Auto-follow the active chapter by moving the PDF viewer to the best matching page.
- Toggle speech behavior such as heading announcements and numbered list labels.
- Track backend job progress, logs, estimated audio size, generated size, and download progress.
- Automatically clean temporary generated files.

## Tech stack

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- `react-pdf`
- PDF.js

### Backend

- Python
- FastAPI
- edge-tts
- pylatexenc
- LaTeX compiler support through `latexmk` or `pdflatex`

## Project structure

Typical relevant files:

```txt
frontend/
  app/project/texvoice/
    page.tsx
    TexVoiceApp.tsx
    TexVoicePdfViewer.tsx
    TexVoicePdfViewerClient.tsx
    TexVoiceDocumentPanel.tsx
    TexVoiceLibraryPanel.tsx
    useTexVoiceLibrary.ts
    types.ts

backend/
  main.py
  routers/
    texvoice.py
  projects/texvoice/
    chapters.py
    cli.py
    library.py
    logger.py
    speech_formatter.py
    speech_rules.py
    tex_cleaner.py
    tts.py

imports/
  latex/
    BioNotes.tex
    BioNotes.pdf
    BioNotes.mp3                 optional
    BioNotes-chapters.json       optional
    BioNotes-highlight-map.json  optional

exports/
  texvoice/
    <job-id>/
      source.tex
      document.pdf
      script.txt
      audio.mp3
      chapters.json
      chapters.txt
      job.log
      manifest.json
```

## Core workflow

### 1. PDF-only preview

A user can upload a `.tex` file and preview the generated PDF without creating audio.

```txt
Upload .tex
→ backend compiles PDF
→ frontend displays PDF in the viewer
→ user may stop there or generate audio later
```

This is useful when TexVoice is used as a LaTeX previewer/study reader rather than only a TTS tool.

### 2. Upload and generate audio

```txt
Upload .tex or .txt
→ choose voice/settings
→ generate audio
→ poll backend job status
→ load generated audio, script, chapters, logs, and PDF
```

Generated files are stored under `exports/texvoice/<job-id>`.

### 3. Archive note preview generation

Archive notes live under:

```txt
imports/latex/
```

A selected archive item can generate temporary preview audio using the current voice/settings. This does not overwrite official archive files.

```txt
Select archive note
→ change TTS settings
→ Generate preview audio
→ listen to temporary generated version
→ optionally switch between official archive audio and generated preview
```

## Backend routes

Base URL in development:

```txt
http://localhost:8000/api/texvoice
```

Important endpoints:

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/health` | Backend health check |
| `GET` | `/library` | List archive notes from `imports/latex` |
| `GET` | `/library/{slug}` | Get one archive item |
| `POST` | `/generate` | Generate audio from uploaded `.tex` or `.txt` |
| `POST` | `/library/{slug}/generate` | Generate temporary preview audio from an archive source |
| `POST` | `/preview-pdf` | Compile uploaded `.tex` into a PDF preview without audio |
| `GET` | `/jobs/{job_id}` | Poll job state/progress/logs |
| `GET` | `/imports/{file_path}` | Serve archive/import files inline |
| `GET` | `/exports/{file_path}` | Serve generated files inline |
| `GET` | `/download/{filename}` | Legacy forced-download route |

## File retention

TexVoice intentionally separates curated archive files from temporary generated files.

| Folder | Purpose | Cleanup |
|---|---|---|
| `imports/latex` | Curated archive notes and optional official audio | Never auto-deleted |
| `uploads` | Temporary uploaded source files | Deleted after about 24 hours |
| `exports/texvoice` | Generated runs, preview PDFs, audio, scripts, logs | Deleted after about 2 days |

This keeps the app usable without permanently storing every generated audio preview.

## Setup

### 1. Backend requirements

Install Python dependencies in your backend virtual environment.

Example:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install fastapi uvicorn python-multipart edge-tts pylatexenc
```

If your project has a `requirements.txt`, use:

```powershell
pip install -r requirements.txt
```

### 2. LaTeX compiler

PDF preview/generation requires a local LaTeX compiler.

On Windows, install MiKTeX or TeX Live. Then confirm:

```powershell
pdflatex --version
latexmk --version
```

`latexmk` is preferred, but `pdflatex` can work as a fallback.

On Debian/Raspberry Pi OS:

```bash
sudo apt update
sudo apt install texlive-latex-base texlive-latex-extra latexmk
```

### 3. Run backend

```powershell
cd backend
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Health check:

```txt
http://localhost:8000/api/texvoice/health
```

Expected response:

```json
{
  "status": "ok"
}
```

### 4. Frontend requirements

```powershell
cd frontend
npm install
```

Important PDF package:

```powershell
npm install react-pdf
```

If PDF.js worker versions mismatch, pin `pdfjs-dist` to the version expected by `react-pdf`.

```powershell
npm ls react-pdf pdfjs-dist
```

Then pin only if needed:

```powershell
npm install pdfjs-dist@<matching-version> --save-exact
```

### 5. Environment variables

Create or update:

```txt
frontend/.env.local
```

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### 6. Run frontend

```powershell
cd frontend
npm run dev
```

Open:

```txt
http://localhost:3000/project/texvoice
```

## PDF viewer notes

The PDF viewer uses `react-pdf`, which depends on PDF.js. Because PDF.js uses browser APIs such as `DOMMatrix`, the viewer must be loaded client-side only.

The app keeps this split:

```txt
TexVoiceApp.tsx
  imports TexVoicePdfViewerClient.tsx

TexVoicePdfViewerClient.tsx
  dynamically imports TexVoicePdfViewer.tsx with ssr: false

TexVoicePdfViewer.tsx
  imports react-pdf
```

Do not import `TexVoicePdfViewer.tsx` directly from a server-rendered component.

## PDF viewer features

### View modes

| Mode | Behavior |
|---|---|
| Auto | Uses continuous mode for small PDFs and single-page mode for larger PDFs |
| Single | Shows one page at a time and preloads nearby pages |
| Continuous | Renders all pages for scrolling |

Single-page mode preloads:

```txt
current page - 1
current page
current page + 1
current page + 2
```

This keeps navigation faster without rendering a large PDF all at once.

### Fullscreen mode

Fullscreen mode keeps the PDF as the main surface and adds a compact side menu for:

- current audio state
- play/pause
- current timestamp
- active chapter
- timestamp/chapter buttons
- page navigation

### Start from selected PDF text

Selecting text in the PDF can fill the `Start at` input. The backend then uses that text to trim the generated speech script near the matching heading or phrase.

## Speech formatting options

The frontend exposes speech toggles so the generated audio can be more literal or more guided.

Current behavior includes:

| Toggle | Purpose |
|---|---|
| Announce headings | Adds/removes phrases like “Next topic” before section titles |
| Speak list numbers | Adds/removes labels like “First,” “Second,” and “Third” |

These are helpful because different notes need different listening styles.

## Timestamp behavior

Chapter timestamps are estimated from:

```txt
word count / effective words per minute
```

The app adjusts WPM using the selected speech rate. These timestamps are useful bookmarks, but they are not exact word-level audio timings.

Timestamps may drift when notes contain:

- long equations
- mathematical symbols
- tables
- pauses
- unusual punctuation
- transformed speech text

For this reason, current PDF sync is section-level instead of word-level.

## Current highlight/sync approach

The current viewer uses section/chapter-level matching:

```txt
active chapter title
→ search approximate PDF page
→ move PDF viewer to that page
→ highlight the active reading context
```

This avoids fragile word-by-word sync while still helping users find where the audio is in the PDF.

Future improvement:

```txt
highlight-map.json
```

A generated highlight map could connect:

```txt
script line range
source .tex line range
chapter timestamp
PDF page
PDF text anchor
```

That would make the active PDF section more reliable than frontend-only text matching.

## Known limitations

- PDF/audio sync is approximate.
- TTS timestamps are not sample-accurate.
- Mathematical notation can still need cleanup before it sounds natural.
- Large PDFs may lag in continuous mode.
- LaTeX compilation depends on local LaTeX packages being installed.
- Archive-generated audio is temporary and should not be treated as official archive content.
- PDF.js/react-pdf must remain client-only in Next.js to avoid server-side `DOMMatrix` errors.

## Troubleshooting

### `DOMMatrix is not defined`

Cause: `react-pdf` or PDF.js is being imported during server-side evaluation.

Fix: import the PDF viewer through the client-only wrapper.

```tsx
import TexVoicePdfViewer from "./TexVoicePdfViewerClient";
```

Do not import:

```tsx
import TexVoicePdfViewer from "./TexVoicePdfViewer";
```

directly from `TexVoiceApp.tsx`.

### PDF worker version mismatch

Example error:

```txt
The API version does not match the Worker version
```

Check installed versions:

```powershell
npm ls react-pdf pdfjs-dist
```

Pin `pdfjs-dist` to the version expected by your installed `react-pdf`.

### CORS PDF fetch error

If the frontend cannot fetch PDFs from the backend, make sure the backend CORS config allows:

```txt
http://localhost:3000
http://127.0.0.1:3000
```

and any local network URL you use, such as:

```txt
http://192.168.1.109:3000
```

Also confirm the backend route opens directly:

```txt
http://localhost:8000/api/texvoice/imports/latex/BioNotes.pdf
```

### PDF compiles from terminal but not backend

Check that the backend process can access `latexmk` or `pdflatex`.

```powershell
latexmk --version
pdflatex --version
```

If these work in one terminal but not the backend, restart the backend terminal after installing LaTeX.

## Future improvements

- Generate `highlight-map.json` during backend processing.
- Store script/source/PDF line anchors for better section highlighting.
- Resume reading from the last audio timestamp and PDF page.
- Backtrack resume by 15–30 seconds.
- Add a “Start over” vs “Resume” prompt.
- Improve math parsing for advanced equations.
- Add optional official archive promotion for curated generated audio.
- Add more voice/profile presets.
- Add export bundling for audio + script + chapters.
