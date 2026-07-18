from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any
import re


@dataclass
class TexVoiceLibraryItem:
    slug: str
    title: str
    source_filename: str | None
    pdf_filename: str | None
    audio_filename: str | None
    chapters_filename: str | None
    highlight_map_filename: str | None
    source_url: str | None
    pdf_url: str | None
    audio_url: str | None
    chapters_json_url: str | None
    highlight_map_url: str | None


_SAFE_SLUG_RE = re.compile(r"[^A-Za-z0-9._-]+")


def safe_slug(value: str) -> str:
    cleaned = _SAFE_SLUG_RE.sub("_", value).strip("._-")
    return cleaned or "untitled"


def title_from_stem(stem: str) -> str:
    known = {
        "BioNotes": "Biology Notes",
        "netNotes": "Networking Notes",
    }

    if stem in known:
        return known[stem]

    spaced = re.sub(r"[_-]+", " ", stem).strip()
    return spaced[:1].upper() + spaced[1:] if spaced else stem


def _url_or_none(base_url: str, relative_path: str, path: Path) -> str | None:
    if not path.exists() or not path.is_file():
        return None
    normalized = relative_path.replace("\\", "/")
    return f"{base_url.rstrip('/')}/{normalized}"


def scan_flat_latex_imports(imports_dir: Path, public_import_base_url: str) -> list[dict[str, Any]]:
    """
    Scan a flat imports/latex folder and group files by stem.

    Expected current layout:
      imports/latex/BioNotes.tex
      imports/latex/BioNotes.pdf
      imports/latex/BioNotes.mp3                optional later
      imports/latex/BioNotes-chapters.json      optional later
      imports/latex/BioNotes-highlight-map.json optional later

    This intentionally avoids SQL and avoids requiring subfolders.
    """
    latex_dir = imports_dir / "latex"
    if not latex_dir.exists():
        return []

    items: list[TexVoiceLibraryItem] = []

    for tex_path in sorted(latex_dir.glob("*.tex"), key=lambda p: p.stem.lower()):
        stem = tex_path.stem
        slug = safe_slug(stem)

        pdf_path = latex_dir / f"{stem}.pdf"
        audio_path = latex_dir / f"{stem}.mp3"
        chapters_path = latex_dir / f"{stem}-chapters.json"
        highlight_map_path = latex_dir / f"{stem}-highlight-map.json"

        item = TexVoiceLibraryItem(
            slug=slug,
            title=title_from_stem(stem),
            source_filename=tex_path.name,
            pdf_filename=pdf_path.name if pdf_path.exists() else None,
            audio_filename=audio_path.name if audio_path.exists() else None,
            chapters_filename=chapters_path.name if chapters_path.exists() else None,
            highlight_map_filename=highlight_map_path.name if highlight_map_path.exists() else None,
            source_url=_url_or_none(public_import_base_url, f"latex/{tex_path.name}", tex_path),
            pdf_url=_url_or_none(public_import_base_url, f"latex/{pdf_path.name}", pdf_path),
            audio_url=_url_or_none(public_import_base_url, f"latex/{audio_path.name}", audio_path),
            chapters_json_url=_url_or_none(public_import_base_url, f"latex/{chapters_path.name}", chapters_path),
            highlight_map_url=_url_or_none(public_import_base_url, f"latex/{highlight_map_path.name}", highlight_map_path),
        )

        items.append(item)

    return [asdict(item) for item in items]


def resolve_import_path(imports_dir: Path, file_path: str) -> Path:
    """
    Safely resolve a requested import file under imports_dir.
    Prevents path traversal such as ../../some-secret-file.
    """
    root = imports_dir.resolve()
    target = (imports_dir / file_path).resolve()

    try:
        target.relative_to(root)
    except ValueError as exc:
        raise ValueError("Invalid import path") from exc

    return target
