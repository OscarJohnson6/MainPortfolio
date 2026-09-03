from __future__ import annotations

import asyncio
import json
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
import shutil
import subprocess
import time
from urllib.parse import quote
from uuid import uuid4
import os

from fastapi import File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi import APIRouter

from projects.texvoice.chapters import estimate_chapters_from_script, write_chapter_files
from projects.texvoice.cli import PROFILES, VOICE_PRESETS, build_default_base_name, effective_wpm
from projects.texvoice.speech_formatter import (
    format_for_speech,
    trim_script_to_max_words,
    trim_script_to_start_at,
)
from projects.texvoice.speech_rules import apply_speech_rules
from projects.texvoice.tex_cleaner import tex_to_speech_text
from projects.texvoice.tts import ESTIMATED_KB_PER_WORD, text_to_mp3


ROOT_DIR = Path(__file__).resolve().parents[2]

# Keep these at the portfolio repo root so generated files stay outside source code.
UPLOADS_DIR = ROOT_DIR / "uploads"
EXPORTS_DIR = ROOT_DIR / "exports"
IMPORTS_DIR = ROOT_DIR / "imports"

TEXVOICE_EXPORTS_DIR = EXPORTS_DIR / "texvoice"

# Your current imported LaTeX/PDF archive lives here:
LATEX_IMPORTS_DIR = IMPORTS_DIR / "latex"

for directory in (UPLOADS_DIR, EXPORTS_DIR, IMPORTS_DIR, TEXVOICE_EXPORTS_DIR, LATEX_IMPORTS_DIR):
    directory.mkdir(parents=True, exist_ok=True)

# Drop completed/errored jobs from JOBS after this many seconds. Files remain on
# disk; this only keeps the in-memory status table from growing forever.
_JOB_TTL_SECONDS = 60 * 60  # 1 hour
_JOB_SWEEP_INTERVAL_SECONDS = 5 * 60  # check every 5 minutes

# File cleanup keeps temporary uploads and generated exports from growing forever.
# Imported examples are curated project content and are never auto-deleted.
_FILE_SWEEP_INTERVAL_SECONDS = 30 * 60  # check every 30 minutes
_UPLOAD_TTL_SECONDS = 24 * 60 * 60  # delete uploaded source files after 24 hours
_EXPORT_TTL_SECONDS = 2 * 24 * 60 * 60  # delete generated TexVoice runs after 2 days


@dataclass
class JobState:
    id: str
    status: str = "queued"
    message: str = "Queued."
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    progress: float = 0.0
    word_count: int = 0
    estimated_minutes: float = 0.0

    estimated_audio_bytes: int = 0
    generated_audio_bytes: int = 0
    actual_audio_bytes: int = 0

    run_id: str | None = None
    run_dir: str | None = None
    manifest_url: str | None = None
    audio_url: str | None = None
    script_url: str | None = None
    chapters_url: str | None = None
    chapters_json_url: str | None = None
    log_url: str | None = None
    source_url: str | None = None
    pdf_url: str | None = None
    highlight_map_url: str | None = None

    logs: list[str] = field(default_factory=list)
    error: str | None = None


JOBS: dict[str, JobState] = {}

router = APIRouter()

# Static file access for generated and imported TexVoice files. If your main.py
# already mounts /exports, this does not hurt; the frontend receives URLs from
# this router, so it does not need to guess where files are served from.
router.mount("/static/exports", StaticFiles(directory=EXPORTS_DIR), name="texvoice_exports")
router.mount("/static/imports", StaticFiles(directory=IMPORTS_DIR), name="texvoice_imports")

_SAFE_FILENAME_KEEP = {".", "-", "_"}
_SAFE_SLUG_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]*$")

PUBLIC_API_BASE_URL = os.getenv(
    "PUBLIC_API_BASE_URL",
    "http://127.0.0.1:8000",
).rstrip("/")


def safe_filename(name: str) -> str:
    keep: list[str] = []
    for char in name:
        if char.isalnum() or char in _SAFE_FILENAME_KEEP:
            keep.append(char)
        else:
            keep.append("_")

    cleaned = "".join(keep)
    cleaned = re.sub(r"_+", "_", cleaned)
    cleaned = cleaned.strip("._")
    return cleaned or f"upload_{uuid4().hex}.txt"


def safe_slug(slug: str) -> str:
    cleaned = slug.strip()
    if not _SAFE_SLUG_RE.fullmatch(cleaned):
        raise HTTPException(status_code=400, detail="Invalid library slug")
    return cleaned


def resolve_voice(profile: str, voice_preset: str | None, voice: str | None) -> str:
    if voice:
        return voice

    if voice_preset:
        if voice_preset not in VOICE_PRESETS:
            raise HTTPException(status_code=400, detail=f"Unknown voice preset: {voice_preset}")
        return VOICE_PRESETS[voice_preset]

    return PROFILES[profile]["voice"]

def public_api_url(*parts: str) -> str:
    cleaned = "/".join(part.strip("/") for part in parts if part)
    return f"{PUBLIC_API_BASE_URL}/api/texvoice/{cleaned}"


def public_export_url(path: Path) -> str:
    relative = path.relative_to(EXPORTS_DIR).as_posix()
    return public_api_url("exports", relative)


def public_import_url(path: Path) -> str:
    relative = path.relative_to(IMPORTS_DIR).as_posix()
    return public_api_url("imports", relative)


def now_label() -> str:
    return datetime.now().strftime("%H:%M:%S")


def update_job(job: JobState, message: str, *, status: str | None = None, progress: float | None = None) -> None:
    if status is not None:
        job.status = status

    if progress is not None:
        job.progress = max(0.0, min(100.0, progress))

    job.message = message
    job.updated_at = time.time()

    line = f"[{now_label()}] {message}"
    job.logs.append(line)
    job.logs = job.logs[-60:]


def write_log_file(log_path: Path, job: JobState) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text("\n".join(job.logs) + "\n", encoding="utf-8")


def file_size(path: Path) -> int:
    try:
        if path.exists() and path.is_file():
            return path.stat().st_size
    except OSError:
        return 0

    return 0


def read_text_file(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def apply_script_audio_options(
    script: str,
    *,
    announce_headings: bool = True,
    speak_list_ordinals: bool = True,
) -> str:
    """Apply final user-facing speech preferences without changing parsing.

    The chapter detector relies on the structured heading phrases produced by
    format_for_speech, so callers should estimate chapters from the original
    formatted script before applying these output-only preferences.
    """
    lines: list[str] = []

    heading_pattern = re.compile(
        r"^(?P<pause>\.{3,}\s*)?(?P<prefix>Starting a new part|New part|Next topic|New section|Now|Subsection)\.\s+(?P<title>.+?)(?P<trailing>\.\s*\.{3,})?$",
        re.IGNORECASE,
    )
    ordinal_pattern = re.compile(
        r"^(First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|Eleventh|Twelfth|Thirteenth|Fourteenth|Fifteenth|Sixteenth|Seventeenth|Eighteenth|Nineteenth|Twentieth|Item\s+\d+)\.\s+",
        re.IGNORECASE,
    )

    for raw_line in script.splitlines():
        line = raw_line
        stripped = line.strip()

        if not announce_headings and stripped:
            match = heading_pattern.match(stripped)
            if match:
                title = match.group("title").strip().rstrip(".")
                line = f"... {title}. ..."

        if not speak_list_ordinals and stripped:
            line = ordinal_pattern.sub("", line.strip())

        lines.append(line)

    cleaned = "\n".join(lines)
    cleaned = re.sub(r"\n{4,}", "\n\n\n", cleaned)
    return cleaned.strip()


def media_type_for_path(path: Path) -> str:
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        return "application/pdf"
    if suffix == ".mp3":
        return "audio/mpeg"
    if suffix == ".json":
        return "application/json"
    if suffix in {".tex", ".txt", ".log"}:
        return "text/plain; charset=utf-8"

    return "application/octet-stream"


def inline_file_response(path: Path) -> FileResponse:
    safe_name = quote(path.name)

    return FileResponse(
        path,
        media_type=media_type_for_path(path),
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{safe_name}",
            "X-Content-Type-Options": "nosniff",
        },
    )


def attachment_file_response(path: Path) -> FileResponse:
    safe_name = quote(path.name)

    return FileResponse(
        path,
        media_type=media_type_for_path(path),
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{safe_name}",
            "X-Content-Type-Options": "nosniff",
        },
    )


def compile_tex_to_pdf(source_path: Path, output_path: Path, timeout_seconds: int = 90) -> tuple[bool, str]:
    """
    Compile a .tex file into a PDF beside the generated TexVoice run files.

    This is intentionally best-effort for the web app:
    - If latexmk/pdflatex is missing, audio generation can still continue.
    - If the .tex has package/path issues, the job logs the PDF error but still
      generates speech/audio from the cleaner pipeline.
    """
    source_path = source_path.resolve()
    output_path = output_path.resolve()
    work_dir = source_path.parent

    latexmk = shutil.which("latexmk")
    pdflatex = shutil.which("pdflatex")

    if latexmk:
        command = [
            latexmk,
            "-pdf",
            "-interaction=nonstopmode",
            "-halt-on-error",
            f"-outdir={work_dir}",
            source_path.name,
        ]
        runs = [command]
    elif pdflatex:
        command = [
            pdflatex,
            "-interaction=nonstopmode",
            "-halt-on-error",
            f"-output-directory={work_dir}",
            source_path.name,
        ]
        # Two passes helps TOC/references without requiring latexmk.
        runs = [command, command]
    else:
        return False, "No LaTeX compiler found. Install latexmk or pdflatex to generate PDF previews."

    try:
        combined_output: list[str] = []

        for command in runs:
            completed = subprocess.run(
                command,
                cwd=work_dir,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                check=False,
            )

            combined_output.append(completed.stdout[-4000:])
            combined_output.append(completed.stderr[-4000:])

            if completed.returncode != 0:
                message = "\n".join(part for part in combined_output if part.strip()).strip()
                return False, message or f"LaTeX exited with code {completed.returncode}."

        produced_pdf = work_dir / f"{source_path.stem}.pdf"

        if not produced_pdf.exists():
            return False, "LaTeX command finished but no PDF was produced."

        if produced_pdf.resolve() != output_path:
            shutil.move(str(produced_pdf), str(output_path))

        # Clean noisy build artifacts, but keep source/log/pdf/manifest files.
        for suffix in (".aux", ".fls", ".fdb_latexmk", ".out", ".toc", ".synctex.gz"):
            artifact = work_dir / f"{source_path.stem}{suffix}"
            if artifact.exists():
                artifact.unlink(missing_ok=True)

        return True, f"Generated PDF preview: {output_path.name}"

    except subprocess.TimeoutExpired:
        return False, f"LaTeX PDF generation timed out after {timeout_seconds} seconds."
    except OSError as exc:
        return False, f"LaTeX PDF generation failed: {exc}"


def _is_terminal_status(status: str) -> bool:
    return status in {"done", "error"}


async def _sweep_old_jobs() -> None:
    while True:
        try:
            await asyncio.sleep(_JOB_SWEEP_INTERVAL_SECONDS)
            cutoff = time.time() - _JOB_TTL_SECONDS
            stale_ids = [
                job_id
                for job_id, job in JOBS.items()
                if _is_terminal_status(job.status) and job.updated_at < cutoff
            ]
            for job_id in stale_ids:
                JOBS.pop(job_id, None)
        except asyncio.CancelledError:
            return
        except Exception:
            continue


def _is_path_active_for_job(path: Path) -> bool:
    resolved = path.resolve()

    for job in JOBS.values():
        if not job.run_dir:
            continue

        try:
            run_dir = Path(job.run_dir).resolve()
        except OSError:
            continue

        if resolved == run_dir or run_dir in resolved.parents:
            return not _is_terminal_status(job.status)

    return False


def _delete_old_files_in_dir(base_dir: Path, ttl_seconds: int) -> None:
    if not base_dir.exists():
        return

    cutoff = time.time() - ttl_seconds

    # Reverse sorting removes child files/directories before parent directories.
    for path in sorted(base_dir.rglob("*"), reverse=True):
        try:
            if _is_path_active_for_job(path):
                continue

            if path.is_file():
                if path.stat().st_mtime < cutoff:
                    path.unlink(missing_ok=True)

            elif path.is_dir():
                if path.stat().st_mtime < cutoff:
                    try:
                        path.rmdir()
                    except OSError:
                        # Directory is not empty. Leave it.
                        pass

        except OSError:
            continue


async def _sweep_old_files() -> None:
    while True:
        try:
            await asyncio.sleep(_FILE_SWEEP_INTERVAL_SECONDS)

            _delete_old_files_in_dir(UPLOADS_DIR, _UPLOAD_TTL_SECONDS)
            _delete_old_files_in_dir(TEXVOICE_EXPORTS_DIR, _EXPORT_TTL_SECONDS)

        except asyncio.CancelledError:
            return
        except Exception:
            continue


@router.on_event("startup")
async def _start_sweeper() -> None:
    asyncio.create_task(_sweep_old_jobs())
    asyncio.create_task(_sweep_old_files())


def build_run_manifest(
    *,
    job: JobState,
    source_filename: str,
    profile: str,
    style: str,
    selected_voice: str,
    selected_rate: str,
    selected_volume: str,
    selected_pitch: str,
    tables: str,
    max_words: int | None,
    start_at: str | None,
    announce_headings: bool = True,
    speak_list_ordinals: bool = True,
) -> dict:
    return {
        "kind": "generated",
        "runId": job.run_id,
        "jobId": job.id,
        "title": source_filename,
        "createdAt": datetime.now().isoformat(timespec="seconds"),
        "status": job.status,
        "message": job.message,
        "wordCount": job.word_count,
        "estimatedMinutes": job.estimated_minutes,
        "estimatedAudioBytes": job.estimated_audio_bytes,
        "actualAudioBytes": job.actual_audio_bytes,
        "settings": {
            "profile": profile,
            "style": style,
            "voice": selected_voice,
            "rate": selected_rate,
            "volume": selected_volume,
            "pitch": selected_pitch,
            "tables": tables,
            "maxWords": max_words,
            "startAt": start_at,
            "announceHeadings": announce_headings,
            "speakListOrdinals": speak_list_ordinals,
        },
        "files": {
            "source": job.source_url,
            "script": job.script_url,
            "audio": job.audio_url,
            "chaptersText": job.chapters_url,
            "chaptersJson": job.chapters_json_url,
            "log": job.log_url,
            "pdf": job.pdf_url,
            "highlightMap": job.highlight_map_url,
        },
    }


def write_run_manifest(manifest_path: Path, **kwargs) -> None:
    manifest = build_run_manifest(**kwargs)
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


async def run_generation_job(
    job: JobState,
    upload_path: Path,
    source_filename: str,
    profile: str,
    style: str,
    selected_voice: str,
    selected_rate: str,
    selected_volume: str,
    selected_pitch: str,
    tables: str,
    limit: int | None,
    max_words: int | None,
    start_at: str | None,
    remove_exam_notes: bool,
    words_per_minute: int,
    announce_headings: bool = True,
    speak_list_ordinals: bool = True,
) -> None:
    manifest_kwargs = {
        "job": job,
        "source_filename": source_filename,
        "profile": profile,
        "style": style,
        "selected_voice": selected_voice,
        "selected_rate": selected_rate,
        "selected_volume": selected_volume,
        "selected_pitch": selected_pitch,
        "tables": tables,
        "max_words": max_words,
        "start_at": start_at,
        "announce_headings": announce_headings,
        "speak_list_ordinals": speak_list_ordinals,
    }

    try:
        run_id = job.id
        run_dir = TEXVOICE_EXPORTS_DIR / run_id
        run_dir.mkdir(parents=True, exist_ok=True)

        base_name = safe_filename(build_default_base_name(upload_path, profile, style, selected_voice))

        source_path = run_dir / f"source{upload_path.suffix.lower()}"
        script_path = run_dir / "script.txt"
        chapters_json_path = run_dir / "chapters.json"
        chapters_txt_path = run_dir / "chapters.txt"
        audio_path = run_dir / "audio.mp3"
        pdf_path = run_dir / "document.pdf"
        log_path = run_dir / "job.log"
        manifest_path = run_dir / "manifest.json"

        shutil.copyfile(upload_path, source_path)

        job.run_id = run_id
        job.run_dir = str(run_dir)
        job.source_url = public_export_url(source_path)
        job.script_url = public_export_url(script_path)
        job.chapters_url = public_export_url(chapters_txt_path)
        job.chapters_json_url = public_export_url(chapters_json_path)
        job.audio_url = public_export_url(audio_path)
        job.log_url = public_export_url(log_path)
        job.manifest_url = public_export_url(manifest_path)

        write_run_manifest(manifest_path, **manifest_kwargs)

        eff_wpm = effective_wpm(words_per_minute, selected_rate)
        suffix = upload_path.suffix.lower()

        if suffix == ".tex":
            update_job(job, "Compiling LaTeX PDF preview.", status="formatting", progress=5)
            write_log_file(log_path, job)

            pdf_ok, pdf_message = compile_tex_to_pdf(source_path, pdf_path)
            update_job(job, pdf_message, progress=7)

            if pdf_ok:
                job.pdf_url = public_export_url(pdf_path)

            write_log_file(log_path, job)
            write_run_manifest(manifest_path, **manifest_kwargs)

        if suffix == ".tex":
            update_job(job, "Parsing LaTeX source.", status="parsing", progress=8)
            write_log_file(log_path, job)

            speech_base_text = tex_to_speech_text(
                upload_path,
                table_mode=tables,
                remove_exam_notes=remove_exam_notes,
            )

            update_job(job, "Formatting final speech script.", status="formatting", progress=18)
            write_log_file(log_path, job)

            speech_script = format_for_speech(
                speech_base_text,
                style=style,
                skip_front_matter=True,
            )

        elif suffix == ".txt":
            update_job(job, "Reading plain text source.", status="parsing", progress=8)
            write_log_file(log_path, job)

            raw_text = read_text_file(upload_path)
            speech_base_text = apply_speech_rules(raw_text)

            update_job(job, "Formatting plain text into speech script.", status="formatting", progress=18)
            write_log_file(log_path, job)

            speech_script = format_for_speech(
                speech_base_text,
                style=style,
                skip_front_matter=False,
            )

        else:
            raise ValueError("Only .tex and .txt files are supported right now.")

        if start_at:
            update_job(job, f'Trimming script to start near "{start_at}".', progress=22)
            speech_script = trim_script_to_start_at(speech_script, start_at)

        if max_words is not None:
            update_job(job, f"Trimming script to about {max_words} words.", progress=24)
            speech_script = trim_script_to_max_words(speech_script, max_words)

        if limit is not None:
            update_job(job, f"Applying character limit: {limit}.", progress=25)
            speech_script = speech_script[:limit]

        chapter_script = speech_script
        speech_script = apply_script_audio_options(
            speech_script,
            announce_headings=announce_headings,
            speak_list_ordinals=speak_list_ordinals,
        )

        script_path.write_text(speech_script, encoding="utf-8")

        job.word_count = len(speech_script.split())
        job.estimated_minutes = round(job.word_count / eff_wpm, 1) if eff_wpm > 0 else 0
        job.estimated_audio_bytes = int(job.word_count * ESTIMATED_KB_PER_WORD * 1024)

        update_job(
            job,
            f"Speech script ready: {job.word_count:,} words, "
            f"~{job.estimated_minutes:.1f} min at {eff_wpm:.0f} effective wpm, "
            f"estimated audio size {job.estimated_audio_bytes / (1024 * 1024):.2f} MB.",
            progress=30,
        )
        write_log_file(log_path, job)
        write_run_manifest(manifest_path, **manifest_kwargs)

        chapters = estimate_chapters_from_script(
            chapter_script,
            words_per_minute=int(round(eff_wpm)),
        )
        write_chapter_files(chapters, chapters_json_path, chapters_txt_path)

        update_job(job, "Saved timestamp files.", progress=35)
        write_log_file(log_path, job)
        write_run_manifest(manifest_path, **manifest_kwargs)

        def progress_callback(message: str) -> None:
            job.generated_audio_bytes = file_size(audio_path)

            if job.estimated_audio_bytes > 0:
                audio_percent = min(99.0, (job.generated_audio_bytes / job.estimated_audio_bytes) * 100)
            else:
                audio_percent = 0.0

            total_progress = 35.0 + (audio_percent * 0.63)

            update_job(job, message, status="generating", progress=total_progress)
            write_log_file(log_path, job)
            write_run_manifest(manifest_path, **manifest_kwargs)

        update_job(job, "Starting TTS generation.", status="generating", progress=35)
        write_log_file(log_path, job)
        write_run_manifest(manifest_path, **manifest_kwargs)

        await text_to_mp3(
            text=speech_script,
            out_path=audio_path,
            voice=selected_voice,
            rate=selected_rate,
            volume=selected_volume,
            pitch=selected_pitch,
            progress_callback=progress_callback,
        )

        job.generated_audio_bytes = file_size(audio_path)
        job.actual_audio_bytes = job.generated_audio_bytes

        update_job(
            job,
            f"Done. Final audio size {job.actual_audio_bytes / (1024 * 1024):.2f} MB.",
            status="done",
            progress=100,
        )
        write_log_file(log_path, job)
        write_run_manifest(manifest_path, **manifest_kwargs)

    except Exception as exc:
        job.error = str(exc)
        update_job(job, f"Generation failed: {exc}", status="error", progress=0)
        if job.log_url:
            try:
                log_name = job.log_url.rsplit("/", 1)[-1]
                log_path = Path(job.run_dir or TEXVOICE_EXPORTS_DIR) / log_name
                write_log_file(log_path, job)
            except Exception:
                pass


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/preview-pdf")
async def create_pdf_preview_job(file: UploadFile = File(...)) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    lower_filename = file.filename.lower()
    if not lower_filename.endswith(".tex"):
        raise HTTPException(status_code=400, detail="Only .tex files can be previewed as PDFs")

    safe_name = safe_filename(file.filename)
    job_id = uuid4().hex
    run_dir = TEXVOICE_EXPORTS_DIR / job_id
    run_dir.mkdir(parents=True, exist_ok=True)

    source_path = run_dir / f"source{Path(safe_name).suffix.lower() or '.tex'}"
    pdf_path = run_dir / "document.pdf"
    log_path = run_dir / "job.log"
    manifest_path = run_dir / "manifest.json"

    with source_path.open("wb") as out_file:
        shutil.copyfileobj(file.file, out_file)

    job = JobState(id=job_id)
    JOBS[job_id] = job
    job.run_id = job_id
    job.run_dir = str(run_dir)
    job.source_url = public_export_url(source_path)
    job.log_url = public_export_url(log_path)
    job.manifest_url = public_export_url(manifest_path)

    update_job(job, f"Created PDF preview job for {safe_name}.", status="formatting", progress=10)
    pdf_ok, pdf_message = compile_tex_to_pdf(source_path, pdf_path)

    if pdf_ok:
        job.pdf_url = public_export_url(pdf_path)
        update_job(job, pdf_message, status="done", progress=100)
    else:
        update_job(job, pdf_message, status="error", progress=0)
        job.error = pdf_message

    write_log_file(log_path, job)

    manifest = {
        "kind": "pdf-preview",
        "runId": job.run_id,
        "jobId": job.id,
        "title": safe_name,
        "createdAt": datetime.now().isoformat(timespec="seconds"),
        "status": job.status,
        "message": job.message,
        "files": {
            "source": job.source_url,
            "pdf": job.pdf_url,
            "log": job.log_url,
        },
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    data = asdict(job)
    data["ageSeconds"] = round(time.time() - job.created_at, 1)
    return data


@router.post("/generate")
async def create_generation_job(
    file: UploadFile = File(...),
    profile: str = Form("sleep"),
    style: str = Form("sleep"),
    voice_preset: str | None = Form(None),
    voice: str | None = Form(None),
    rate: str | None = Form(None),
    volume: str | None = Form(None),
    pitch: str | None = Form(None),
    tables: str = Form("announce"),
    limit: int | None = Form(None),
    max_words: int | None = Form(None),
    start_at: str | None = Form(None),
    remove_exam_notes: bool = Form(False),
    words_per_minute: int = Form(150),
    announce_headings: bool = Form(True),
    speak_list_ordinals: bool = Form(True),
) -> dict[str, str]:
    if profile not in PROFILES:
        raise HTTPException(status_code=400, detail=f"Unknown profile: {profile}")

    if style not in {"literal", "narrated", "sleep"}:
        raise HTTPException(status_code=400, detail=f"Unknown style: {style}")

    if tables not in {"announce", "omit", "rough"}:
        raise HTTPException(status_code=400, detail=f"Unknown table mode: {tables}")

    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    lower_filename = file.filename.lower()
    if not lower_filename.endswith(".tex") and not lower_filename.endswith(".txt"):
        raise HTTPException(status_code=400, detail="Only .tex and .txt files are supported right now")

    safe_name = safe_filename(file.filename)
    upload_path = UPLOADS_DIR / f"{uuid4().hex}_{safe_name}"

    with upload_path.open("wb") as out_file:
        shutil.copyfileobj(file.file, out_file)

    selected_voice = resolve_voice(profile, voice_preset, voice)
    selected_rate = rate if rate is not None else PROFILES[profile]["rate"]
    selected_volume = volume if volume is not None else PROFILES[profile]["volume"]
    selected_pitch = pitch if pitch is not None else PROFILES[profile]["pitch"]

    job_id = uuid4().hex
    job = JobState(id=job_id)
    JOBS[job_id] = job

    update_job(job, f"Queued generation for {safe_name}.", status="queued", progress=2)

    asyncio.create_task(
        run_generation_job(
            job=job,
            upload_path=upload_path,
            source_filename=safe_name,
            profile=profile,
            style=style,
            selected_voice=selected_voice,
            selected_rate=selected_rate,
            selected_volume=selected_volume,
            selected_pitch=selected_pitch,
            tables=tables,
            limit=limit,
            max_words=max_words,
            start_at=start_at,
            remove_exam_notes=remove_exam_notes,
            words_per_minute=words_per_minute,
            announce_headings=announce_headings,
            speak_list_ordinals=speak_list_ordinals,
        )
    )

    return {"jobId": job_id}


@router.post("/library/{slug}/generate")
async def create_library_generation_job(
    slug: str,
    profile: str = Form("sleep"),
    style: str = Form("sleep"),
    voice_preset: str | None = Form(None),
    voice: str | None = Form(None),
    rate: str | None = Form(None),
    volume: str | None = Form(None),
    pitch: str | None = Form(None),
    tables: str = Form("announce"),
    limit: int | None = Form(None),
    max_words: int | None = Form(None),
    start_at: str | None = Form(None),
    remove_exam_notes: bool = Form(False),
    words_per_minute: int = Form(150),
    announce_headings: bool = Form(True),
    speak_list_ordinals: bool = Form(True),
) -> dict[str, str]:
    """
    Generate temporary preview audio from an imported archive source.

    This intentionally writes to exports/texvoice/<job_id>/ rather than
    imports/latex/. Curated archive files are not overwritten by normal users.
    """
    slug = safe_slug(slug)

    if profile not in PROFILES:
        raise HTTPException(status_code=400, detail=f"Unknown profile: {profile}")

    if style not in {"literal", "narrated", "sleep"}:
        raise HTTPException(status_code=400, detail=f"Unknown style: {style}")

    if tables not in {"announce", "omit", "rough"}:
        raise HTTPException(status_code=400, detail=f"Unknown table mode: {tables}")

    source_path = LATEX_IMPORTS_DIR / f"{slug}.tex"
    if not source_path.exists() or not source_path.is_file():
        raise HTTPException(status_code=404, detail="Archive source file not found")

    selected_voice = resolve_voice(profile, voice_preset, voice)
    selected_rate = rate if rate is not None else PROFILES[profile]["rate"]
    selected_volume = volume if volume is not None else PROFILES[profile]["volume"]
    selected_pitch = pitch if pitch is not None else PROFILES[profile]["pitch"]

    job_id = uuid4().hex
    job = JobState(id=job_id)
    JOBS[job_id] = job

    update_job(job, f"Queued temporary archive preview for {source_path.name}.", status="queued", progress=2)

    asyncio.create_task(
        run_generation_job(
            job=job,
            upload_path=source_path,
            source_filename=source_path.name,
            profile=profile,
            style=style,
            selected_voice=selected_voice,
            selected_rate=selected_rate,
            selected_volume=selected_volume,
            selected_pitch=selected_pitch,
            tables=tables,
            limit=limit,
            max_words=max_words,
            start_at=start_at,
            remove_exam_notes=remove_exam_notes,
            words_per_minute=words_per_minute,
            announce_headings=announce_headings,
            speak_list_ordinals=speak_list_ordinals,
        )
    )

    return {"jobId": job_id}


@router.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    data = asdict(job)
    data["ageSeconds"] = round(time.time() - job.created_at, 1)
    return data


@router.get("/exports/{file_path:path}")
def get_export(file_path: str) -> FileResponse:
    path = (EXPORTS_DIR / file_path).resolve()
    try:
        path.relative_to(EXPORTS_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid export path")

    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Export file not found")

    return inline_file_response(path)


@router.get("/imports/{file_path:path}")
def get_import(file_path: str) -> FileResponse:
    path = (IMPORTS_DIR / file_path).resolve()
    try:
        path.relative_to(IMPORTS_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid import path")

    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Import file not found")

    return inline_file_response(path)


@router.get("/download/{filename}")
def download_export(filename: str) -> FileResponse:
    # Legacy flat-export route. Keep this so older generated links do not break.
    path = EXPORTS_DIR / safe_filename(filename)

    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(path, filename=path.name)


def title_from_stem(stem: str) -> str:
    nice_names = {
        "BioNotes": "Biology Notes",
        "netNotes": "Networking Notes",
        "coding": "Coding Notes",
        "finance": "Finance Notes",
        "hardware": "Hardware Notes",
        "language": "Language Notes",
        "security": "Security Notes",
        "Statistics": "Statistics Notes",
        "troubleshooting": "Troubleshooting Notes",
    }

    if stem in nice_names:
        return nice_names[stem]

    spaced = re.sub(r"(?<!^)(?=[A-Z])", " ", stem)
    spaced = spaced.replace("_", " ").replace("-", " ")
    return spaced.title()


def scan_latex_library() -> list[dict]:
    """
    Auto-discover imported LaTeX/PDF note pairs from:

      imports/latex/

    Current supported flat naming:

      BioNotes.tex
      BioNotes.pdf
      BioNotes.mp3                 optional later
      BioNotes-chapters.json       optional later
      BioNotes-highlight-map.json  optional later
    """
    items: list[dict] = []

    if not LATEX_IMPORTS_DIR.exists():
        return items

    for tex_path in sorted(LATEX_IMPORTS_DIR.glob("*.tex")):
        stem = tex_path.stem

        pdf_path = LATEX_IMPORTS_DIR / f"{stem}.pdf"
        audio_path = LATEX_IMPORTS_DIR / f"{stem}.mp3"
        chapters_path = LATEX_IMPORTS_DIR / f"{stem}-chapters.json"
        highlight_map_path = LATEX_IMPORTS_DIR / f"{stem}-highlight-map.json"
        preview_path = LATEX_IMPORTS_DIR / f"{stem}-preview.txt"

        summary = (
            preview_path.read_text(encoding="utf-8", errors="replace").strip()
            if preview_path.exists()
            else "Imported LaTeX/PDF note used as a TexVoice archive example."
        )

        items.append(
            {
                "slug": stem,
                "title": title_from_stem(stem),
                "course": "Archive",
                "summary": summary,
                "tags": ["latex", "pdf", "notes"],
                "sourceUrl": public_import_url(tex_path),
                "pdfUrl": public_import_url(pdf_path) if pdf_path.exists() else None,
                "audioUrl": public_import_url(audio_path) if audio_path.exists() else None,
                "chaptersUrl": public_import_url(chapters_path) if chapters_path.exists() else None,
                "highlightMapUrl": public_import_url(highlight_map_path) if highlight_map_path.exists() else None,
            }
        )

    return items


@router.get("/library")
def list_library() -> dict:
    return {"items": scan_latex_library()}


@router.get("/library/{slug}")
def get_library_item(slug: str) -> dict:
    # Your existing safe_slug is strict enough for stems like BioNotes, coding, netNotes.
    slug = safe_slug(slug)

    for item in scan_latex_library():
        if item.get("slug") == slug:
            return item

    raise HTTPException(status_code=404, detail="Library item not found")