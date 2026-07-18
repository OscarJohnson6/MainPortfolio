from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import re
from pathlib import Path

from projects.texvoice.speech_formatter import get_all_heading_phrases, strip_pause_marks


@dataclass
class Chapter:
    title: str
    start_seconds: int
    end_seconds: int | None
    kind: str = "section"
    word_count: int = 0


def format_timestamp(total_seconds: int) -> str:
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60

    if hours:
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"

    return f"{minutes:02d}:{seconds:02d}"


def count_words(text: str) -> int:
    return len(re.findall(r"\b[\w'-]+\b", text))


# Build heading-detection regexes once at module load. We accept both the
# new ellipsis format ("Next topic. Cell Biology. ...") and the legacy
# colon format ("Next topic: Cell Biology.") so older scripts replayed
# through --from-script still produce chapter timestamps.
_HEADING_REGEXES: list[tuple[str, re.Pattern[str]]] = []

for _kind, _phrases in get_all_heading_phrases().items():
    for _phrase in _phrases:
        _escaped = re.escape(_phrase)
        # New format: "<phrase>. <title>" — title may or may not end with a period.
        _HEADING_REGEXES.append((
            _kind,
            re.compile(rf"^{_escaped}\.\s+(.+?)\.?$", re.IGNORECASE),
        ))
        # Legacy format: "<phrase>: <title>"
        _HEADING_REGEXES.append((
            _kind,
            re.compile(rf"^{_escaped}:\s*(.+?)\.?$", re.IGNORECASE),
        ))


def get_heading(line: str) -> tuple[str, str] | None:
    """
    Detect a structural heading line.

    Returns (kind, title) where kind is "part" / "section" / "subsection",
    or None if the line is not a heading.

    Handles:
      - new ellipsis format: "... Starting a new part. Cell Biology. ..."
      - legacy colon format: "Starting a new part: Cell Biology."
    """
    clean = strip_pause_marks(line).strip()
    if not clean:
        return None

    for kind, pattern in _HEADING_REGEXES:
        match = pattern.match(clean)
        if match:
            title = match.group(1).strip().rstrip(".").strip()
            if title:
                return (kind, title)

    return None


def estimate_chapters_from_script(script: str, words_per_minute: int = 150) -> list[Chapter]:
    """
    Estimate timestamps from the final speech script.

    This is not sample-accurate. It provides useful bookmarks before
    chunked audio generation exists.

    Pass words_per_minute as the EFFECTIVE rate (base WPM adjusted for the
    edge-tts rate setting), not the base 150. Otherwise timestamps will be
    systematically off by however much the rate differs from 100%.
    """

    if words_per_minute <= 0:
        words_per_minute = 150

    lines = [line.strip() for line in script.splitlines()]
    chapters: list[Chapter] = []

    current_title = "Beginning"
    current_kind = "section"
    current_words = 0
    elapsed_seconds = 0

    for line in lines:
        if not line:
            continue

        heading = get_heading(line)

        if heading is not None:
            if current_words > 0 or chapters:
                duration = max(3, round((current_words / words_per_minute) * 60))
                chapters.append(
                    Chapter(
                        title=current_title,
                        start_seconds=elapsed_seconds,
                        end_seconds=elapsed_seconds + duration,
                        kind=current_kind,
                        word_count=current_words,
                    )
                )
                elapsed_seconds += duration

            current_kind, current_title = heading
            # Count the words in the heading title itself toward the next chapter
            # so a long title does not get effectively zero seconds in some cases.
            current_words = count_words(current_title)
            continue

        current_words += count_words(line)

    if current_words > 0 or not chapters:
        duration = max(3, round((current_words / words_per_minute) * 60))
        chapters.append(
            Chapter(
                title=current_title,
                start_seconds=elapsed_seconds,
                end_seconds=elapsed_seconds + duration,
                kind=current_kind,
                word_count=current_words,
            )
        )

    return chapters


def write_chapter_files(chapters: list[Chapter], json_path: str | Path, txt_path: str | Path) -> None:
    json_path = Path(json_path)
    txt_path = Path(txt_path)

    json_path.parent.mkdir(parents=True, exist_ok=True)
    txt_path.parent.mkdir(parents=True, exist_ok=True)

    json_path.write_text(
        json.dumps([asdict(chapter) for chapter in chapters], indent=2),
        encoding="utf-8",
    )

    lines = []
    for chapter in chapters:
        lines.append(f"{format_timestamp(chapter.start_seconds)}  {chapter.title}")

    txt_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
