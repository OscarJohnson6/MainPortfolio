"""
Markdown front end for TexVoice.

Turns a Markdown file into the same structural markers the LaTeX cleaner
produces ("Section. Title.", "List.", "Item. ...", "Table summary. ..."), so
everything after this step (speech formatting, chapters, list numbers,
headings, caching, timings) is shared with .tex files.

Markdown states its structure outright, so this is a simple line-based
reader rather than a full CommonMark parser.
"""

from __future__ import annotations

import re
from pathlib import Path

from projects.texvoice.speech_rules import apply_speech_rules
from projects.texvoice.tex_cleaner import convert_math_for_speech, latex_to_plain_text, normalize_whitespace

_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
_FENCE = re.compile(r"^(```+|~~~+)\s*([\w+-]*)")
_BULLET = re.compile(r"^(\s*)[-*+]\s+(?:\[[ xX]\]\s+)?(.*)$")
_NUMBERED = re.compile(r"^(\s*)\d+[.)]\s+(.*)$")
_TABLE_SEPARATOR = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$")
_HR = re.compile(r"^\s*([-*_])(\s*\1){2,}\s*$")

# Fenced code in these languages is a diagram, not code to skip.
_DIAGRAM_LANGUAGES = {"mermaid", "plantuml", "dot", "graphviz", "tikz"}


def _speak_math(tex: str) -> str:
    """Math inside $...$ goes through the same rules as LaTeX notes."""
    return latex_to_plain_text(convert_math_for_speech(tex)).strip()


def inline_to_text(text: str) -> str:
    """Strip inline Markdown down to the words that should be spoken."""
    # Math first, so its braces and underscores don't trip the other rules.
    text = re.sub(r"\$\$(.+?)\$\$", lambda m: _speak_math(m.group(1)), text)
    text = re.sub(r"(?<![\\$])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)", lambda m: _speak_math(m.group(1)), text)

    text = re.sub(r"!\[([^\]]*)\]\([^)]*\)", lambda m: f"Image: {m.group(1)}." if m.group(1).strip() else "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)  # [text](url) -> text
    text = re.sub(r"\[([^\]]+)\]\[[^\]]*\]", r"\1", text)  # [text][ref] -> text
    text = re.sub(r"<https?://[^>]+>", "", text)  # bare autolinks aren't worth reading
    text = re.sub(r"<[^>]+>", "", text)  # inline HTML tags
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"(\*\*|__)(.+?)\1", r"\2", text)
    text = re.sub(r"(?<![\w*])([*_])(?!\s)(.+?)(?<!\s)\1(?![\w*])", r"\2", text)
    text = re.sub(r"~~(.+?)~~", r"\1", text)
    text = re.sub(r"\\([\\`*_{}\[\]()#+\-.!|$])", r"\1", text)  # escaped characters
    return re.sub(r"\s+", " ", text).strip()


def _table_cells(line: str) -> list[str]:
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [inline_to_text(cell) for cell in re.split(r"(?<!\\)\|", line)]


def _speak_table(rows: list[list[str]], mode: str) -> str:
    """Same modes and wording as LaTeX tables, so the Tables setting works for both."""
    if mode == "omit":
        return ""
    if mode != "rough":
        return "Table skipped."

    body = rows[1:] if len(rows) > 1 else rows  # first row is the header
    spoken: list[str] = []
    for cells in body:
        cells = [cell for cell in cells if cell]
        if len(cells) < 2:
            continue
        first, rest = cells[0], cells[1:]
        spoken.append(f"{first}: {rest[0]}." if len(rest) == 1 else f"{first}: " + "; ".join(rest) + ".")
    return "Table summary. " + " ".join(spoken) if spoken else "Table skipped."


def _speak_diagram(source: str, mode: str) -> str:
    if mode == "omit":
        return ""
    if mode == "labels":
        # Mermaid-style node labels: A[Text], B(Text), C{Text}, and "quoted" labels.
        labels = re.findall(r"\[([^\]]+)\]|\(\(?([^)]+)\)?\)|\{([^}]+)\}|\"([^\"]+)\"", source)
        words = [next(part for part in group if part).strip() for group in labels]
        words = list(dict.fromkeys(word for word in words if re.search(r"[A-Za-z]{2}", word)))
        if words:
            return "Diagram: " + ". ".join(words) + "."
    return "Diagram skipped."


def markdown_to_speech_text(
    path: str | Path,
    table_mode: str = "announce",
    diagram_mode: str = "announce",
) -> str:
    source = Path(path).read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n")

    # YAML front matter (--- ... ---) at the very top is metadata, not content.
    source = re.sub(r"\A---\n.*?\n---\n", "", source, flags=re.DOTALL)
    # HTML comments.
    source = re.sub(r"<!--.*?-->", "", source, flags=re.DOTALL)

    lines = source.split("\n")
    out: list[str] = []

    # Map heading levels onto parts / sections / subsections, whatever level a
    # file starts at. A single top-level "# Title" is the document's title;
    # several "#" headings mean the file is split into parts.
    levels = sorted({len(m.group(1)) for line in lines if (m := _HEADING.match(line.strip()))})
    h1_count = sum(1 for line in lines if re.match(r"^#\s+\S", line))
    part_level = 1 if h1_count > 1 else None
    body_levels = [level for level in levels if level > 1 or part_level is None and h1_count != 1]
    section_level = min([level for level in body_levels if level != part_level], default=2)

    paragraph: list[str] = []
    list_kind: str | None = None  # "List." or "Numbered list."
    item: list[str] | None = None

    def flush_paragraph() -> None:
        if paragraph:
            text = inline_to_text(" ".join(paragraph))
            if text:
                out.append(text)
            paragraph.clear()

    def flush_item() -> None:
        nonlocal item
        if item is not None:
            out.append("Item. " + inline_to_text(" ".join(item)))
            item = None

    def close_list() -> None:
        nonlocal list_kind
        flush_item()
        if list_kind:
            out.append("End of numbered list." if list_kind == "Numbered list." else "End of list.")
            out.append("")
        list_kind = None

    def emit(text: str) -> None:
        if text:
            out.append("")
            out.append(text)
            out.append("")

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Fenced code blocks (and diagrams written as code).
        fence = _FENCE.match(stripped)
        if fence:
            flush_paragraph()
            close_list()
            marker, language = fence.group(1), fence.group(2).lower()
            body: list[str] = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith(marker[:3]):
                body.append(lines[i])
                i += 1
            i += 1  # closing fence
            if language in _DIAGRAM_LANGUAGES:
                emit(_speak_diagram("\n".join(body), diagram_mode))
            else:
                emit("Code example skipped.")
            continue

        # Display math blocks: $$ on their own lines.
        if stripped.startswith("$$") and not (len(stripped) > 4 and stripped.endswith("$$")):
            flush_paragraph()
            body = [stripped[2:]]
            i += 1
            while i < len(lines) and "$$" not in lines[i]:
                body.append(lines[i])
                i += 1
            if i < len(lines):
                body.append(lines[i].split("$$")[0])
            i += 1
            spoken = _speak_math(" ".join(body))
            if spoken:
                paragraph.append(spoken)
            continue

        if not stripped:
            flush_paragraph()
            # A blank line inside a list doesn't end it; anything else after it will.
            i += 1
            continue

        heading = _HEADING.match(stripped)
        if heading:
            flush_paragraph()
            close_list()
            level, title = len(heading.group(1)), inline_to_text(heading.group(2))
            if level == part_level:
                emit(f"Part break. {title}.")
            elif level == section_level:
                emit(f"Section. {title}.")
            elif level > section_level:
                emit(f"Subsection. {title}.")
            else:
                emit(f"{title}.")  # the document title, read as a plain line
            i += 1
            continue

        # Tables: a header row followed by a |---| separator row.
        if "|" in stripped and i + 1 < len(lines) and _TABLE_SEPARATOR.match(lines[i + 1]):
            flush_paragraph()
            close_list()
            rows = [_table_cells(stripped)]
            i += 2
            while i < len(lines) and "|" in lines[i] and lines[i].strip():
                rows.append(_table_cells(lines[i]))
                i += 1
            emit(_speak_table(rows, table_mode))
            continue

        if _HR.match(stripped):
            flush_paragraph()
            close_list()
            i += 1
            continue

        bullet = _BULLET.match(line)
        numbered = _NUMBERED.match(line)
        if bullet or numbered:
            flush_paragraph()
            kind = "List." if bullet else "Numbered list."
            match = bullet or numbered
            indent = len(match.group(1).expandtabs(4))
            # Nested items are read as items of the same list.
            if list_kind is None or (indent == 0 and kind != list_kind):
                close_list()
                out.append("")
                out.append(kind)
                list_kind = kind
            flush_item()
            item = [match.group(2)]
            i += 1
            continue

        # Indented continuation of a list item.
        if item is not None and line[:1].isspace():
            item.append(stripped)
            i += 1
            continue

        # Blockquotes read as normal text.
        if stripped.startswith(">"):
            stripped = re.sub(r"^(>\s?)+", "", stripped)

        close_list()
        paragraph.append(stripped)
        i += 1

    flush_paragraph()
    close_list()

    text = "\n".join(out)
    text = apply_speech_rules(text)
    return normalize_whitespace(text)
