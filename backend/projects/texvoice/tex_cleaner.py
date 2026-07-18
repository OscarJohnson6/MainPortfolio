from __future__ import annotations

import re
from pathlib import Path

from pylatexenc.latex2text import LatexNodes2Text

from projects.texvoice.speech_rules import apply_speech_rules


def read_tex_file(path: str | Path) -> str:
    path = Path(path)
    return path.read_text(encoding="utf-8", errors="replace")


def strip_preamble(tex: str) -> str:
    """
    Keep only content after \\begin{document}.
    """
    match = re.search(r"\\begin\{document\}", tex)
    if match:
        tex = tex[match.end():]

    tex = re.sub(r"\\end\{document\}", "", tex)
    return tex


def remove_comments(tex: str) -> str:
    """
    Remove LaTeX comments, but avoid treating escaped \\% as a comment.
    """
    lines = []
    for line in tex.splitlines():
        cleaned = re.sub(r"(?<!\\)%.*$", "", line)
        lines.append(cleaned)
    return "\n".join(lines)


def remove_tcolorbox_options(tex: str) -> str:
    """
    Remove leftover tcolorbox-style option blocks that are visual-only.

    Example:
    [colback=..., colframe=..., title=..., arc=..., boxrule=...]

    These are useful for the PDF but terrible for audio.
    """
    tex = re.sub(
        r"\[\s*(?:colback|colframe|title|fonttitle|boxrule|arc|left|right|top|bottom|breakable)[^\]]*\]",
        "",
        tex,
        flags=re.DOTALL,
    )

    return tex


def convert_custom_structure(tex: str) -> str:
    """
    Convert custom LaTeX commands into speech-friendly structural markers before
    pylatexenc flattens everything.
    """

    # \partbanner{bg}{color}{Title}
    tex = re.sub(
        r"\\partbanner\{[^{}]*\}\{[^{}]*\}\{([^{}]*)\}",
        r"\n\nPart break. \1.\n\n",
        tex,
        flags=re.DOTALL,
    )

    # Common custom colored section commands:
    # \part2bgsectiongreen{Title}
    # \sectiongreen{Title}
    tex = re.sub(
        r"\\(?:part\d*bg)?section(?:green|blue|purple|orange|red|teal|brown|gray|grey)\{([^{}]*)\}",
        r"\n\nSection. \1.\n\n",
        tex,
        flags=re.DOTALL,
    )

    tex = re.sub(
        r"\\(?:part\d*bg)?subsection(?:green|blue|purple|orange|red|teal|brown|gray|grey)\{([^{}]*)\}",
        r"\n\nSubsection. \1.\n\n",
        tex,
        flags=re.DOTALL,
    )

    # \section*{Title} or \section{Title}
    tex = re.sub(
        r"\\section\*?\{([^{}]*)\}",
        r"\n\nSection. \1.\n\n",
        tex,
        flags=re.DOTALL,
    )

    # \subsection*{Title} or \subsection{Title}
    tex = re.sub(
        r"\\subsection\*?\{([^{}]*)\}",
        r"\n\nSubsection. \1.\n\n",
        tex,
        flags=re.DOTALL,
    )

    # \subsubsection
    tex = re.sub(
        r"\\subsubsection\*?\{([^{}]*)\}",
        r"\n\nSubsection. \1.\n\n",
        tex,
        flags=re.DOTALL,
    )

    # \example{...}
    tex = re.sub(
        r"\\example\{",
        r"\n\nExample.\n",
        tex,
    )

    return tex


def convert_lists(tex: str) -> str:
    """
    Make itemize/enumerate sound like spoken lists.
    """

    tex = re.sub(r"\\begin\{itemize\}(\[[^\]]*\])?", "\n\nList.\n", tex)
    tex = re.sub(r"\\end\{itemize\}", "\nEnd of list.\n\n", tex)

    tex = re.sub(r"\\begin\{enumerate\}(\[[^\]]*\])?", "\n\nNumbered list.\n", tex)
    tex = re.sub(r"\\end\{enumerate\}", "\nEnd of numbered list.\n\n", tex)

    tex = re.sub(r"\\item\s*", "\nItem. ", tex)

    return tex


def convert_tables_basic(tex: str, mode: str = "announce") -> str:
    """
    Handle LaTeX tables.

    v1 table modes:
    - omit: remove tables silently
    - announce: say a table was skipped
    - rough: attempt a rough row-based conversion for simple tabular tables

    Rough mode is intentionally conservative.
    """

    def rough_table_to_text(match: re.Match) -> str:
        table_tex = match.group(0)

        body = re.sub(r"\\begin\{tabularx?\}(\{[^{}]*\}){1,3}", "", table_tex, flags=re.DOTALL)
        body = re.sub(r"\\end\{tabularx?\}", "", body, flags=re.DOTALL)

        body = re.sub(r"\\hline|\\toprule|\\midrule|\\bottomrule", "\n", body)
        body = re.sub(r"\\textbf\{([^{}]*)\}", r"\1", body)
        body = re.sub(r"\\emph\{([^{}]*)\}", r"\1", body)

        rows = [row.strip() for row in body.split(r"\\") if row.strip()]

        spoken_rows: list[str] = []
        for row in rows:
            if row.count("\\") > 4:
                continue

            cells = [cell.strip() for cell in row.split("&")]
            cells = [cell for cell in cells if cell]

            if len(cells) < 2:
                continue

            first = cells[0]
            rest = cells[1:]

            if len(rest) == 1:
                spoken_rows.append(f"{first}: {rest[0]}.")
            else:
                spoken_rows.append(f"{first}: " + "; ".join(rest) + ".")

        if not spoken_rows:
            return "\n\nTable skipped.\n\n"

        return "\n\nTable summary. " + " ".join(spoken_rows) + "\n\n"

    table_pattern = r"\\begin\{tabularx?\}.*?\\end\{tabularx?\}"

    if mode == "omit":
        return re.sub(table_pattern, "\n\n", tex, flags=re.DOTALL)

    if mode == "rough":
        return re.sub(table_pattern, rough_table_to_text, tex, flags=re.DOTALL)

    return re.sub(table_pattern, "\n\nTable skipped.\n\n", tex, flags=re.DOTALL)


def remove_visual_commands(tex: str) -> str:
    """
    Remove commands that mostly affect PDF appearance.
    """

    commands_without_args = [
        "bluesections",
        "greensections",
        "purplesections",
        "orangesections",
        "tealsections",
        "redsections",
        "greysections",
        "graysections",
        "brownsections",
        "divider",
        "newpage",
        "clearpage",
        "tableofcontents",
        "maketitle",
    ]

    for command in commands_without_args:
        tex = re.sub(rf"\\{command}\b", "", tex)

    tex = re.sub(r"\\vspace\{[^{}]*\}", "\n", tex)
    tex = re.sub(r"\\hspace\{[^{}]*\}", " ", tex)

    return tex


def remove_exam_note_blocks(tex: str) -> str:
    """
    Optional cleanup for obvious exam-management notes.

    This is intentionally conservative. It only removes short standalone lines
    that look like reminders rather than note content.
    """

    lines = []
    for line in tex.splitlines():
        stripped = line.strip().lower()

        skip_phrases = [
            "exam note:",
            "exam notes:",
            "for exam:",
            "for the exam:",
            "test note:",
            "quiz note:",
        ]

        if any(stripped.startswith(phrase) for phrase in skip_phrases):
            continue

        lines.append(line)

    return "\n".join(lines)


def convert_math_for_speech(tex: str) -> str:
    """Conservative LaTeX math rewrites before pylatexenc flattens text.

    This is intentionally not a full math parser. It catches common constructs
    that otherwise become awkward strings like "lim_ ... 01 divided by tln".
    """
    tex = re.sub(r"\\label\{[^{}]*\}", "", tex)
    tex = re.sub(r"Table\s+\\ref\{[^{}]*\}", "the referenced table", tex)
    tex = re.sub(r"table\s+\\ref\{[^{}]*\}", "the referenced table", tex)
    tex = re.sub(r"\\ref\{[^{}]*\}", "the reference", tex)

    # Simple fractions. Run a few times for nested/simple repeated cases.
    frac_pattern = re.compile(r"\\frac\{([^{}]+)\}\{([^{}]+)\}")
    for _ in range(4):
        next_tex = frac_pattern.sub(r"\1 divided by \2", tex)
        if next_tex == tex:
            break
        tex = next_tex

    tex = re.sub(r"\\lim_\{([^{}]+)\}", r"limit as \1", tex)
    tex = re.sub(r"\\to\b", " approaches ", tex)
    tex = re.sub(r"\\infty\b", " infinity ", tex)
    tex = re.sub(r"\\approx\b", " approximately ", tex)
    tex = re.sub(r"\\ln\b", " natural log of ", tex)

    # Norm bars around a simple expression, e.g. \|\delta Z_0\|.
    tex = re.sub(r"\\\|([^|]+?)\\\|", r"magnitude of \1", tex)

    # Common Greek commands not always read cleanly after generic conversion.
    greek = {
        r"\\lambda\b": " lambda ",
        r"\\sigma\b": " sigma ",
        r"\\rho\b": " rho ",
        r"\\beta\b": " beta ",
        r"\\alpha\b": " alpha ",
        r"\\gamma\b": " gamma ",
        r"\\delta\b": " delta ",
        r"\\theta\b": " theta ",
    }
    for pattern, replacement in greek.items():
        tex = re.sub(pattern, replacement, tex)

    tex = tex.replace(r"\left", " ").replace(r"\right", " ")
    return tex


def latex_to_plain_text(tex: str) -> str:
    """
    Use pylatexenc for generic LaTeX-to-text conversion after custom preprocessing.
    """

    converter = LatexNodes2Text(
        math_mode="text",
        keep_comments=False,
        strict_latex_spaces=False,
    )

    return converter.latex_to_text(tex)


def normalize_whitespace(text: str) -> str:
    """
    Clean spacing while preserving paragraph breaks.
    """

    text = text.replace("\r\n", "\n").replace("\r", "\n")

    lines = [line.strip() for line in text.splitlines()]
    text = "\n".join(lines)

    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def tex_to_speech_text(
    path: str | Path,
    table_mode: str = "announce",
    remove_exam_notes: bool = False,
) -> str:
    tex = read_tex_file(path)

    tex = strip_preamble(tex)
    tex = remove_comments(tex)
    tex = remove_tcolorbox_options(tex)
    tex = convert_custom_structure(tex)
    tex = convert_lists(tex)
    tex = convert_tables_basic(tex, mode=table_mode)
    tex = remove_visual_commands(tex)
    tex = convert_math_for_speech(tex)

    if remove_exam_notes:
        tex = remove_exam_note_blocks(tex)

    text = latex_to_plain_text(tex)
    text = apply_speech_rules(text)
    text = normalize_whitespace(text)

    return text