from __future__ import annotations

import re


SCIENTIFIC_ACRONYMS = {
    "DNA": "D N A",
    "RNA": "R N A",
    "mRNA": "messenger R N A",
    "tRNA": "transfer R N A",
    "rRNA": "ribosomal R N A",
    "ATP": "A T P",
    "ADP": "A D P",
    "AMP": "A M P",
    "NADH": "N A D H",
    "NAD+": "N A D plus",
    "NADP+": "N A D P plus",
    "NADPH": "N A D P H",
    "FADH2": "F A D H two",
    "CO2": "C O two",
    "CO_2": "C O two",
    "O2": "O two",
    "O_2": "O two",
    "H2O": "H two O",
    "H_2O": "H two O",
    "Pi": "inorganic phosphate",
}


# Single source of truth for spoken-form abbreviations.
# Both the LaTeX pipeline and the plain-text pipeline route through here.
SPEECH_ABBREVIATIONS = {
    "e.g.": "for example",
    "i.e.": "that is",
    "etc.": "etcetera",
    "vs.": "versus",
    "vs": "versus",
    "Fig.": "Figure",
    "fig.": "figure",
    "Dr.": "Doctor",
    "Mr.": "Mister",
    "Mrs.": "Misses",
    "Ms.": "Miss",
    "approx.": "approximately",
    "approx": "approximately",
}


SYMBOL_REPLACEMENTS = {
    r"\quad": " ",
    r"\&": " and ",
    r"\%": " percent ",
    "→": " becomes ",
    "⟶": " becomes ",
    "←": " comes from ",
    "↔": " is reversible with ",
    "⇌": " is in equilibrium with ",
    "≤": " less than or equal to ",
    "≥": " greater than or equal to ",
    "≠": " not equal to ",
    "×": " times ",
    "µ": " micro ",
    "δ": " delta ",
    "λ": " lambda ",
    "σ": " sigma ",
    "ρ": " rho ",
    "β": " beta ",
    "α": " alpha ",
    "γ": " gamma ",
    "θ": " theta ",
    "Δ": " delta ",
    "Σ": " sigma ",
    "^": " to the exponent of ",
    "/": " divided by ",
    "·": " multiplied by ",
    "~": " approximately ",
    "≈": " approximately ",
    "∞": " infinity ",
}


def remove_toc_artifacts(text: str) -> str:
    """
    Remove table-of-contents helper artifacts that were intended for visual/PDF navigation,
    not spoken audio.
    """
    text = re.sub(r"\btocsection\s*", "\n\n", text)
    text = re.sub(r"\btocsubsection\s*", "\n", text)
    text = re.sub(r"\btocsubsubsection\s*", "\n", text)
    return text


def remove_dimension_artifacts(text: str) -> str:
    """
    Remove leftover LaTeX dimensions like 0.8pt, 12pt, 1.2em, etc.
    These should almost never be spoken.
    """
    text = re.sub(r"(?m)^\s*\d+(\.\d+)?\s*(pt|em|ex|mm|cm|in)\s*$", "", text)
    return text


def remove_known_style_artifacts(text: str) -> str:
    """
    Remove known visual/style artifacts that can leak out of custom LaTeX commands.
    """
    artifacts = [
        "part2bgsectiongreen",
        "part2bgsectionblue",
        "part2bgsectionpurple",
        "part2bgsectionorange",
        "part2bgsectionred",
        "part2bgsectionteal",
        "part2bgsectionbrown",
        "part2bgsectiongray",
        "part2bgsectiongrey",
        "part1bgsectiongreen",
        "part1bgsectionblue",
        "part1bgsectionpurple",
        "part1bgsectionorange",
        "part1bgsectionred",
        "part1bgsectionteal",
        "part1bgsectionbrown",
        "part1bgsectiongray",
        "part1bgsectiongrey",
    ]

    for artifact in artifacts:
        text = text.replace(artifact, "")

    return text


def apply_abbreviation_rules(text: str) -> str:
    """
    Replace common abbreviations with their spoken forms.

    Uses lookarounds for whole-token matching so we don't turn "vase" into
    "vaseusee" or break words containing "vs" as a substring.
    """
    for raw, spoken in sorted(SPEECH_ABBREVIATIONS.items(), key=lambda pair: len(pair[0]), reverse=True):
        pattern = r"(?<![A-Za-z0-9])" + re.escape(raw) + r"(?![A-Za-z0-9])"
        text = re.sub(pattern, spoken, text)

    return text


def apply_acronym_rules(text: str) -> str:
    """
    Spell common scientific acronyms instead of expanding them into definitions.

    This keeps the audio generator from changing the educational content.
    """
    for raw, spoken in sorted(SCIENTIFIC_ACRONYMS.items(), key=lambda pair: len(pair[0]), reverse=True):
        pattern = rf"(?<![A-Za-z0-9]){re.escape(raw)}(?![A-Za-z0-9])"
        text = re.sub(pattern, spoken, text)

    return text


def apply_symbol_rules(text: str) -> str:
    for raw, spoken in SYMBOL_REPLACEMENTS.items():
        text = text.replace(raw, spoken)

    # 1. Binary Minus (Spaced)
    # Catches equations with spaces (e.g., "n - 1", "PMT - 1") to avoid breaking
    # hyphenated words like "table-of-contents" or "COVID-19".
    text = re.sub(r"(?<=[a-zA-Z0-9\)\]}])\s+-\s+(?=[a-zA-Z0-9\(\[\{])", " minus ", text)

    # 2. Binary Minus (Unspaced but strictly mathematical bounds)
    # Catches unspaced minus involving digits on both sides or involving brackets.
    text = re.sub(r"(?<=\d)-(?=\d)", " minus ", text)
    text = re.sub(r"(?<=\))-(?=[a-zA-Z0-9\(\[\{])", " minus ", text)
    text = re.sub(r"(?<=[a-zA-Z0-9\)\]}])-(?=\()", " minus ", text)

    # 3. Unary Negative
    # Matches a hyphen preceded by the start of the string, a space, or an opening bracket.
    text = re.sub(r"(^|[\s\(\[\{])-(?=[a-zA-Z0-9])", r"\1negative ", text)

    # Handle other math-ish symbols more carefully after special replacements.
    text = re.sub(r"\s*=\s*", " equals ", text)
    text = re.sub(r"\s*\+\s*", " plus ", text)
    text = re.sub(r"\s*<\s*", " less than ", text)
    text = re.sub(r"\s*>\s*", " greater than ", text)

    return text


def apply_math_shape_rules(text: str) -> str:
    # Handle negative exponents specifically (e.g., ^-n or ^-1)
    text = re.sub(r"\^\s*-\s*([a-zA-Z0-9]+)", r" to the exponent of negative \1", text)

    # Standard exponents (e.g., 2^3, r^n)
    text = re.sub(r"([a-zA-Z0-9]+)\s*\^\s*([a-zA-Z0-9]+)", r"\1 to the exponent of \2", text)

    # Common chemical/math shapes
    text = re.sub(r"H\s*\^\s*\+", "H plus", text)
    text = re.sub(r"OH\s*\^\s*-", "O H minus", text)

    # Convert simple subscripts like X_2 if not already handled.
    text = re.sub(r"([A-Za-z]+)_\{?(\d+)\}?", r"\1 sub \2", text)

    return text


def normalize_spacing_around_punctuation(text: str) -> str:
    """
    Trim accidental spaces before punctuation. Used inside speech_rules
    so the formatter can stay focused on structure.
    """
    text = text.replace(" .", ".")
    text = text.replace(" ,", ",")
    text = text.replace(" ;", ";")
    text = text.replace(" :", ":")
    return text


def final_rule_cleanup(text: str) -> str:
    # Convert slashes between sentence examples into sentence breaks.
    text = re.sub(r"\s+/\s+", ". ", text)

    # Clean common math/text artifacts that can leak out of pylatexenc.
    text = re.sub(r"\bln\s+", "natural log of ", text)
    text = re.sub(r"\blim[_\s]*", "limit as ", text)
    text = re.sub(r"\bsub\s+0\b", "sub zero", text)
    text = re.sub(r"less than\s+ref\s+greater than", "reference", text, flags=re.IGNORECASE)

    # Clean repeated spaces.
    text = re.sub(r"[ \t]+", " ", text)

    # Clean spacing before punctuation.
    text = re.sub(r"\s+([.,;:!?])", r"\1", text)

    # Fix common awkward punctuation after replacements.
    text = text.replace(" plus  plus ", " plus ")
    text = text.replace(" equals  equals ", " equals ")

    return text.strip()


def apply_speech_rules(text: str) -> str:
    """
    Convert LaTeX/PDF leftovers, abbreviations, symbols, and science acronyms
    into a TTS-friendly speech script.

    This is the single source of truth for inline text-to-speech rewrites.
    Both the .tex pipeline (via tex_cleaner) and the .txt pipeline (via the
    backend) route through this function so the same rules apply everywhere.
    """
    text = remove_toc_artifacts(text)
    text = remove_dimension_artifacts(text)
    text = remove_known_style_artifacts(text)

    # Process specific math shapes BEFORE general symbols
    # to keep the '^' and '-' context intact for exponents.
    text = apply_math_shape_rules(text)

    text = apply_abbreviation_rules(text)
    text = apply_symbol_rules(text)
    text = apply_acronym_rules(text)
    text = normalize_spacing_around_punctuation(text)
    text = final_rule_cleanup(text)

    return text
