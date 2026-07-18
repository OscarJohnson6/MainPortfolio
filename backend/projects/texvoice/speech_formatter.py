from __future__ import annotations

import re


# ---------------------------------------------------------------------------
# Ordinal labels for list items.
# Past the table we fall back to "Item 13", "Item 14", ... so a 20-item list
# does not say "Next" eight times in a row.
# ---------------------------------------------------------------------------

ORDINALS = [
    "First",
    "Second",
    "Third",
    "Fourth",
    "Fifth",
    "Sixth",
    "Seventh",
    "Eighth",
    "Ninth",
    "Tenth",
    "Eleventh",
    "Twelfth",
    "Thirteenth",
    "Fourteenth",
    "Fifteenth",
    "Sixteenth",
    "Seventeenth",
    "Eighteenth",
    "Nineteenth",
    "Twentieth",
]


def get_ordinal_label(index: int) -> str:
    """Return a spoken ordinal word for a 1-based index."""
    if 1 <= index <= len(ORDINALS):
        return ORDINALS[index - 1]
    return f"Item {index}"


# ---------------------------------------------------------------------------
# Heading marker phrases.
#
# These are the literal phrases that appear at the start of formatted heading
# lines. chapters.py imports HEADING_PHRASES so it has the same source of
# truth for chapter detection — if you change the phrasing here, chapter
# detection follows automatically.
# ---------------------------------------------------------------------------

HEADING_PHRASES: dict[str, dict[str, str]] = {
    "part": {
        "sleep": "Starting a new part",
        "narrated": "New part",
        "literal": "New part",
    },
    "section": {
        "sleep": "Next topic",
        "narrated": "New section",
        "literal": "New section",
    },
    "subsection": {
        "sleep": "Now",
        "narrated": "Subsection",
        "literal": "Subsection",
    },
}


def get_all_heading_phrases() -> dict[str, tuple[str, ...]]:
    """
    Flatten HEADING_PHRASES into {kind: (phrase1, phrase2, ...)} for callers
    (chapters.py, trim helpers) that need to detect any styled heading.
    """
    flat: dict[str, tuple[str, ...]] = {}
    for kind, by_style in HEADING_PHRASES.items():
        unique = tuple(dict.fromkeys(by_style.values()))
        flat[kind] = unique
    return flat


# Phrase used for the trim_script_to_start_at heading detection.
HEADING_PREFIXES: tuple[str, ...] = tuple(
    phrase
    for phrases in get_all_heading_phrases().values()
    for phrase in phrases
)


# ---------------------------------------------------------------------------
# Pause helpers.
#
# edge-tts (and Azure neural voices in general) does not pause on whitespace
# or newlines — pauses come from punctuation. Our previous format relied on
# blank lines around headings, which produced no audible break.
#
# The format below uses an explicit ellipsis ("...") around the heading plus
# a sentence-ending period between the announcement and the title. This
# typically gives a clear audible beat in both the "Aria" / "Jenny" voices
# tested locally without requiring SSML.
# ---------------------------------------------------------------------------

_LONG_PAUSE = "..."
_PART_PAUSE = "..."


# ---------------------------------------------------------------------------
# Lines from upstream we should drop entirely.
# ---------------------------------------------------------------------------

_SKIP_LINE_PREFIXES = (
    "tocsection",
    "tocsubsection",
    "[colback equals",
    "[colframe equals",
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def format_for_speech(
    text: str,
    style: str = "narrated",
    skip_front_matter: bool = True,
) -> str:
    """
    Convert technically cleaned text into a TTS-first speech script.

    This is not meant to be a pretty readable note file.
    The goal is to make the audio sound less robotic.

    skip_front_matter=True skips title/table-of-contents style lines before
    the first real structural marker. This is the right default for long
    LaTeX notes.
    """

    if style == "literal":
        return final_polish(text)

    lines = [line.strip() for line in text.splitlines()]
    output: list[str] = []

    in_list = False
    in_numbered_list = False
    item_index = 0
    found_real_content = not skip_front_matter

    for raw_line in lines:
        line = raw_line.strip()

        if not line:
            continue

        if should_skip_line(line):
            continue

        if skip_front_matter and not found_real_content:
            if line.startswith(("Part break.", "Section.", "Subsection.", "Example.", "List.", "Numbered list.")):
                found_real_content = True
            else:
                # Skip title/TOC front matter like:
                # Biology Notes, PART I, section names, etc.
                continue

        # Part breaks.
        if line.startswith("Part break."):
            title = line.replace("Part break.", "", 1).strip().rstrip(".")
            output.append(format_part(title, style))
            in_list = False
            in_numbered_list = False
            item_index = 0
            continue

        # Sections.
        if line.startswith("Section."):
            title = line.replace("Section.", "", 1).strip().rstrip(".")
            output.append(format_section(title, style))
            in_list = False
            in_numbered_list = False
            item_index = 0
            continue

        # Subsections.
        if line.startswith("Subsection."):
            title = line.replace("Subsection.", "", 1).strip().rstrip(".")
            output.append(format_subsection(title, style))
            in_list = False
            in_numbered_list = False
            item_index = 0
            continue

        # Examples.
        if line == "Example.":
            output.append(format_example(style))
            in_list = False
            in_numbered_list = False
            item_index = 0
            continue

        # Table skips.
        if line == "Table skipped.":
            if style == "literal":
                output.append("Table skipped.")
            continue

        # List start.
        if line == "List.":
            in_list = True
            in_numbered_list = False
            item_index = 0
            output.append(format_list_intro(style))
            continue

        # Numbered list start.
        if line == "Numbered list.":
            in_list = True
            in_numbered_list = True
            item_index = 0
            output.append(format_list_intro(style))
            continue

        # List end.
        if line in {"End of list.", "End of numbered list."}:
            in_list = False
            in_numbered_list = False
            item_index = 0
            output.append("\n")
            continue

        # Explicit item marker.
        if line.startswith("Item."):
            item_text = line.replace("Item.", "", 1).strip()
            item_index += 1
            output.append(format_list_item(item_text, item_index))
            continue

        # Some LaTeX lists may lose "\\item" but still produce list-like lines.
        if in_list and looks_like_list_content(line):
            item_index += 1
            output.append(format_list_item(line, item_index))
            continue

        output.append(ensure_sentence_end(line))

    return final_polish("\n".join(output))


def trim_script_to_start_at(script: str, start_at: str | None) -> str:
    """
    Trim the final speech script so testing can start at a section/subsection.

    Example:
      --start-at Verbs
      --start-at "Properties of Water"
    """

    if not start_at:
        return script

    query = start_at.strip().lower()
    if not query:
        return script

    lines = script.splitlines()

    # Lowercased prefixes we treat as heading lines.
    heading_prefixes_lower = tuple(prefix.lower() for prefix in HEADING_PREFIXES)

    for index, line in enumerate(lines):
        clean = strip_pause_marks(line).strip().lower()
        if not clean:
            continue

        if query in clean and clean.startswith(heading_prefixes_lower):
            return "\n".join(lines[index:]).strip()

    # Fallback: first line containing the query.
    for index, line in enumerate(lines):
        if query in line.lower():
            return "\n".join(lines[index:]).strip()

    return script


def trim_script_to_max_words(script: str, max_words: int | None) -> str:
    """
    Trim a script to roughly N words. Useful for fast voice tests.
    """
    if max_words is None or max_words <= 0:
        return script

    tokens = re.findall(r"\S+\s*", script)
    words_seen = 0
    kept: list[str] = []

    for token in tokens:
        kept.append(token)
        if re.search(r"\w", token):
            words_seen += 1
        if words_seen >= max_words:
            break

    return "".join(kept).strip()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def should_skip_line(line: str) -> bool:
    if line.startswith(_SKIP_LINE_PREFIXES):
        return True

    if "boxrule equals" in line and "colframe equals" in line:
        return True

    return False


def _phrase_for(kind: str, style: str) -> str:
    by_style = HEADING_PHRASES[kind]
    return by_style.get(style, by_style["narrated"])


def format_part(title: str, style: str) -> str:
    phrase = _phrase_for("part", style)
    # Long pause before AND after a part transition. The period after the
    # phrase forces a real beat between the announcement and the title.
    return f"\n\n{_PART_PAUSE} {phrase}. {title}. {_PART_PAUSE}\n\n"


def format_section(title: str, style: str) -> str:
    phrase = _phrase_for("section", style)
    return f"\n\n{_LONG_PAUSE} {phrase}. {title}. {_LONG_PAUSE}\n\n"


def format_subsection(title: str, style: str) -> str:
    phrase = _phrase_for("subsection", style)
    # Subsections are smaller transitions — one trailing pause is enough.
    return f"\n\n{_LONG_PAUSE} {phrase}. {title}.\n\n"


def format_example(style: str) -> str:
    if style == "sleep":
        return "\n\nFor example.\n\n"

    return "\n\nExample.\n\n"


def format_list_intro(style: str) -> str:
    # End with a period (not a colon) so the listener gets a real sentence
    # break before the first item, and the first ordinal does not feel
    # crammed against the intro.
    if style == "sleep":
        return "\n\nA few key points.\n\n"

    return "\n\nThe list is.\n\n"


def format_list_item(text: str, index: int) -> str:
    item_text = smooth_label_colon(text)
    label = get_ordinal_label(index)
    # Period after the label produces a real pause between the ordinal and
    # the content — colon was nearly inaudible.
    return f"\n{label}. {item_text}\n"


def looks_like_list_content(line: str) -> bool:
    if not line:
        return False

    if line.startswith(("Section.", "Subsection.", "Part break.", "Example.")):
        return False

    if line in {"List.", "Numbered list.", "End of list.", "End of numbered list."}:
        return False

    return True


def smooth_label_colon(text: str) -> str:
    """
    For a list item that contains a "Label: explanation" pattern, convert
    the colon to a period so both halves get a real sentence break.

    This used to also do abbreviation/symbol rewriting, but those rules now
    live in speech_rules.apply_speech_rules and run earlier in the pipeline,
    so this function only handles structure.
    """
    if ":" not in text:
        return ensure_sentence_end(text)

    label, rest = text.split(":", 1)
    label = label.strip()
    rest = rest.strip()

    if not label or not rest:
        return ensure_sentence_end(text)

    return f"{ensure_sentence_end(label)} {ensure_sentence_end(rest)}"


def ensure_sentence_end(text: str) -> str:
    text = text.strip()

    if not text:
        return text

    if text.endswith((".", "!", "?", "”", '"', "...")):
        return text

    return text + "."


def strip_pause_marks(line: str) -> str:
    """
    Remove leading/trailing pause ellipses so other code (chapter detection,
    start-at search) can work with the underlying phrase.
    """
    line = line.strip()
    line = re.sub(r"^(?:\.{3,}\s*)+", "", line)
    line = re.sub(r"(?:\s*\.{3,})+$", "", line)
    return line.strip()


def final_polish(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Fix punctuation artifacts that occasionally come out of upstream tools.
    text = text.replace(" —.", ".")
    text = text.replace(":. ", ": ")

    # Drop ":<whitespace>." patterns that come from empty colon-led lines.
    # Use a guard so we do not mistake intentional pause ellipses ("...") for
    # accidental ". ." artifacts — only collapse when there is a single dot
    # on each side.
    text = re.sub(r"(?<!\.)(?<!\.)\.\s+\.(?!\.)(?!\.)", ".", text)

    # Convert em dash separators into sentence pauses.
    text = text.replace(" — ", ". ")

    # Remove periods that got placed before whitespace after colon-heavy lines.
    text = re.sub(r":\.\s*", ": ", text)

    # Remove spaces/tabs before punctuation. Only matches in-line whitespace,
    # never newlines — and the "\.(?!\.)" branch only matches a period that
    # is not the start of an intentional pause ellipsis ("Cell Biology. ..."
    # stays intact instead of collapsing into "Cell Biology....").
    text = re.sub(r"[ \t]+([,;:!?]|\.(?!\.))", r"\1", text)

    # Remove repeated spaces.
    text = re.sub(r"[ \t]+", " ", text)

    # Avoid massive newline stacks.
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()
