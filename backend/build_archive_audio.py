"""
Build the "official" audio for the TexVoice archive notes in imports/latex/.

For each note, writes the files the website's archive looks for:

    imports/latex/BioNotes.mp3              the audio
    imports/latex/BioNotes-chapters.json    chapter timestamps
    imports/latex/BioNotes-timings.json     sentence timings (read-along highlighting)

It runs the same generation job as the website, so archive audio sounds the
same as audio made on the site. Notes are only regenerated when the .tex file
or the settings below change (tracked in imports/latex/.archive-audio.json),
so it's safe to run on every deploy.

Run from the backend folder:

    python build_archive_audio.py               build new or changed notes
    python build_archive_audio.py --force       rebuild every note
    python build_archive_audio.py calculus      only these notes (by file name)
    python build_archive_audio.py --max-words 0 read whole notes instead of a preview
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import shutil
import sys
from pathlib import Path

from routers.texvoice import LATEX_IMPORTS_DIR, JobState, run_generation_job
from projects.texvoice.cli import PROFILES

STATE_PATH = LATEX_IMPORTS_DIR / ".archive-audio.json"

# Same defaults as the website's form, so the archive matches what visitors hear
# before they change anything.
PROFILE = "sleep"
SETTINGS = {
    "profile": PROFILE,
    "style": "sleep",
    "voice": PROFILES[PROFILE]["voice"],
    "rate": PROFILES[PROFILE]["rate"],
    "volume": PROFILES[PROFILE]["volume"],
    "pitch": PROFILES[PROFILE]["pitch"],
    "tables": "announce",
    "diagrams": "announce",
    "announceHeadings": True,
    "speakListOrdinals": True,
}


def source_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def outputs_for(stem: str) -> dict[str, Path]:
    return {
        "audio.mp3": LATEX_IMPORTS_DIR / f"{stem}.mp3",
        "chapters.json": LATEX_IMPORTS_DIR / f"{stem}-chapters.json",
        "timings.json": LATEX_IMPORTS_DIR / f"{stem}-timings.json",
    }


def load_state() -> dict:
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


async def build_note(tex_path: Path, max_words: int | None) -> tuple[bool, str]:
    job = JobState(id=f"archive-{tex_path.stem}")
    await run_generation_job(
        job=job,
        upload_path=tex_path,
        source_filename=tex_path.name,
        profile=SETTINGS["profile"],
        style=SETTINGS["style"],
        selected_voice=SETTINGS["voice"],
        selected_rate=SETTINGS["rate"],
        selected_volume=SETTINGS["volume"],
        selected_pitch=SETTINGS["pitch"],
        tables=SETTINGS["tables"],
        limit=None,
        max_words=max_words,
        start_at=None,
        remove_exam_notes=False,
        words_per_minute=150,
        announce_headings=SETTINGS["announceHeadings"],
        speak_list_ordinals=SETTINGS["speakListOrdinals"],
        diagrams=SETTINGS["diagrams"],
    )

    if job.status != "done" or not job.run_dir:
        return False, job.error or job.message

    # Copy the finished files next to the note, then drop the temporary run.
    run_dir = Path(job.run_dir)
    for name, destination in outputs_for(tex_path.stem).items():
        shutil.copyfile(run_dir / name, destination)
    shutil.rmtree(run_dir, ignore_errors=True)
    return True, f"{job.word_count:,} words, {job.actual_audio_bytes / 1024:.0f} KB"


def main() -> int:
    parser = argparse.ArgumentParser(description="Build TexVoice archive audio for imports/latex notes.")
    parser.add_argument("notes", nargs="*", help="Only these notes, by file name without .tex (default: all).")
    parser.add_argument("--max-words", type=int, default=200, help="Words per preview clip (0 = whole note). Default 200.")
    parser.add_argument("--force", action="store_true", help="Rebuild even if nothing changed.")
    args = parser.parse_args()

    max_words = args.max_words if args.max_words > 0 else None
    settings = {**SETTINGS, "maxWords": max_words}

    notes = sorted(LATEX_IMPORTS_DIR.glob("*.tex"))
    if args.notes:
        wanted = {name.removesuffix(".tex") for name in args.notes}
        notes = [path for path in notes if path.stem in wanted]
        missing = wanted - {path.stem for path in notes}
        if missing:
            print(f"Not found in {LATEX_IMPORTS_DIR}: {', '.join(sorted(missing))}")

    state = load_state()
    built = skipped = failed = 0

    for tex_path in notes:
        stem = tex_path.stem
        record = {"source": source_hash(tex_path), "settings": settings}
        have_outputs = all(path.exists() for path in outputs_for(stem).values())

        if not args.force and have_outputs and state.get(stem) == record:
            skipped += 1
            print(f"  unchanged  {stem}")
            continue

        print(f"  building   {stem} ...", flush=True)
        ok, message = asyncio.run(build_note(tex_path, max_words))
        if ok:
            built += 1
            state[stem] = record
            # Save after each note, so an interrupted run keeps what it finished.
            STATE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")
            print(f"  done       {stem} ({message})")
        else:
            failed += 1
            print(f"  FAILED     {stem}: {message}")

    print(f"\nArchive audio: {built} built, {skipped} unchanged, {failed} failed.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
