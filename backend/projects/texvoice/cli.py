from __future__ import annotations

import argparse
import asyncio
import re
from pathlib import Path

import edge_tts

from projects.texvoice.chapters import estimate_chapters_from_script, write_chapter_files
from projects.texvoice.logger import RunLogger
from projects.texvoice.speech_formatter import (
    format_for_speech,
    trim_script_to_max_words,
    trim_script_to_start_at,
)
from projects.texvoice.tex_cleaner import tex_to_speech_text
from projects.texvoice.tts import text_to_mp3


# User-preferred defaults from voice testing:
#   rate "+10%"  — fast enough to follow comfortably without sounding rushed.
#   pitch "-7Hz" — drops a touch below baseline; avoids peaking on bright
#                  syllables and is less fatiguing on long listens.

PROFILES = {
    "default": {
        "voice": "en-US-AriaNeural",
        "rate": "+10%",
        "volume": "+0%",
        "pitch": "-7Hz",
        "description": "Balanced default mode for listenable notes.",
    },
    "sleep": {
        "voice": "en-US-AriaNeural",
        "rate": "+10%",
        "volume": "+0%",
        "pitch": "-7Hz",
        "description": "Default smooth listening mode.",
    },
    "study": {
        "voice": "en-US-AriaNeural",
        "rate": "+5%",
        "volume": "+0%",
        "pitch": "-5Hz",
        "description": "Clearer pace for active studying.",
    },
    "fast": {
        "voice": "en-US-AriaNeural",
        "rate": "+18%",
        "volume": "+0%",
        "pitch": "-5Hz",
        "description": "Faster review mode.",
    },
}


VOICE_PRESETS = {
    "aria": "en-US-AriaNeural",
    "jenny": "en-US-JennyNeural",
    "guy": "en-US-GuyNeural",
    "davis": "en-US-DavisNeural",
    "ava": "en-US-AvaNeural",
    "andrew": "en-US-AndrewNeural",
    "emma": "en-US-EmmaNeural",
    "brian": "en-US-BrianNeural",
}


def short_voice_name(voice: str) -> str:
    name = voice.split("-")[-1]
    return name.replace("Neural", "")


def build_default_base_name(input_path: Path, profile: str, style: str, voice: str) -> str:
    voice_short = short_voice_name(voice)
    return f"{input_path.stem}-{profile}-{style}-{voice_short}"


_RATE_PATTERN = re.compile(r"^([+-]?)(\d+(?:\.\d+)?)%$")


def parse_rate_percent(rate: str | None) -> float:
    """
    Convert an edge-tts rate string like "+10%" or "-5%" into a multiplier.

    "+10%" -> 1.10
    "-5%"  -> 0.95
    "0%" / None / unparseable -> 1.0

    This is used to compute the *effective* words-per-minute for chapter
    timestamps and listening-time estimates. Without it, a script run at
    "+10%" rate has timestamps systematically about 10% long.
    """
    if not rate:
        return 1.0

    match = _RATE_PATTERN.match(rate.strip())
    if not match:
        return 1.0

    sign, value = match.groups()
    delta = float(value) / 100

    if sign == "-":
        return max(0.1, 1.0 - delta)

    return 1.0 + delta


def effective_wpm(base_wpm: int, rate: str | None) -> float:
    """Return the rate-adjusted words-per-minute for timing math."""
    if base_wpm <= 0:
        base_wpm = 150
    return base_wpm * parse_rate_percent(rate)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="projects.texvoice",
        description="Convert LaTeX notes or a saved speech script into natural speech audio.",
    )

    parser.add_argument("input", nargs="?", help="Path to a .tex file or speech script .txt file.")

    parser.add_argument("--from-script", action="store_true", help="Treat input as an already-prepared speech script.")
    parser.add_argument("--out", default=None, help="Output MP3 path.")
    parser.add_argument("--preview", action="store_true", help="Print the final speech script instead of generating audio.")
    parser.add_argument("--script-out", default=None, help="Save the final speech script to a .txt file.")
    parser.add_argument("--preview-out", default=None, help="Alias for --script-out.")
    parser.add_argument("--no-auto-script-out", action="store_true", help="Do not automatically save the speech script.")

    parser.add_argument("--profile", choices=sorted(PROFILES.keys()), default="sleep")
    parser.add_argument("--style", choices=["literal", "narrated", "sleep"], default=None)
    parser.add_argument("--voice", default=None)
    parser.add_argument("--voice-preset", choices=sorted(VOICE_PRESETS.keys()), default=None)
    parser.add_argument("--rate", default=None, help='Override speech rate, such as "+10%%".')
    parser.add_argument("--volume", default=None, help='Override volume, such as "+0%%".')
    parser.add_argument("--pitch", default=None, help='Override pitch, such as "-7Hz".')

    parser.add_argument("--tables", choices=["announce", "omit", "rough"], default="announce")
    parser.add_argument("--remove-exam-notes", action="store_true")
    parser.add_argument("--include-front-matter", action="store_true", help="Include title/table-of-contents style front matter.")
    parser.add_argument("--start-at", default=None, help='Start generated script/audio near a heading or phrase, e.g. --start-at "Verbs".')
    parser.add_argument("--max-words", type=int, default=None, help="Limit final speech script to roughly N words.")
    parser.add_argument("--limit", type=int, default=None, help="Limit final speech script to first N characters.")
    parser.add_argument("--words-per-minute", type=int, default=150, help="Base words-per-minute. Effective WPM is adjusted by --rate.")
    parser.add_argument("--no-chapters", action="store_true")
    parser.add_argument("--log", default=None)
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--list-voices", action="store_true")

    return parser


async def list_english_voices() -> None:
    voices = await edge_tts.list_voices()
    english_voices = [voice for voice in voices if voice.get("Locale", "").startswith("en-")]

    for voice in english_voices:
        name = voice.get("ShortName", "")
        locale = voice.get("Locale", "")
        gender = voice.get("Gender", "")
        friendly = voice.get("FriendlyName", "")
        print(f"{name:32} {locale:8} {gender:8} {friendly}")


def read_script_file(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def resolve_script_out_path(args: argparse.Namespace, base_name: str) -> Path | None:
    if args.script_out:
        return Path(args.script_out)

    if args.preview_out:
        return Path(args.preview_out)

    if args.no_auto_script_out:
        return None

    return Path("exports") / f"{base_name}-script.txt"


def resolve_voice(args: argparse.Namespace, profile: dict[str, str]) -> str:
    if args.voice is not None:
        return args.voice

    if args.voice_preset is not None:
        return VOICE_PRESETS[args.voice_preset]

    return profile["voice"]


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.list_voices:
        asyncio.run(list_english_voices())
        return

    if not args.input:
        parser.error("input is required unless using --list-voices")

    input_path = Path(args.input)

    if not input_path.exists():
        raise FileNotFoundError(f"Could not find input file: {input_path}")

    profile = PROFILES[args.profile]

    voice = resolve_voice(args, profile)
    rate = args.rate if args.rate is not None else profile["rate"]
    volume = args.volume if args.volume is not None else profile["volume"]
    pitch = args.pitch if args.pitch is not None else profile["pitch"]
    style = args.style if args.style is not None else ("sleep" if args.profile == "sleep" else "narrated")

    base_name = build_default_base_name(input_path, args.profile, style, voice)

    log_path = Path(args.log) if args.log else Path("exports") / f"{base_name}.log"
    logger = RunLogger(verbose=not args.quiet, log_file=log_path)

    out_path = Path(args.out) if args.out else Path("exports") / f"{base_name}.mp3"
    script_out_path = resolve_script_out_path(args, base_name)

    chapter_json_path = Path("exports") / f"{base_name}-chapters.json"
    chapter_txt_path = Path("exports") / f"{base_name}-chapters.txt"

    # Effective WPM accounts for the rate setting, so chapter timestamps and
    # the listening-time estimate match what the user actually hears.
    eff_wpm = effective_wpm(args.words_per_minute, rate)

    logger.log("Starting projects.texvoice.run.")
    logger.log(f"Input file: {input_path}")
    logger.log(f"Input mode: {'speech script' if args.from_script else 'LaTeX'}")
    logger.log(f"Profile: {args.profile} - {profile['description']}")
    logger.log(f"Speech script style: {style}")
    logger.log(f"Voice: {voice}")
    logger.log(f"Rate: {rate} (effective WPM: {eff_wpm:.0f}, base {args.words_per_minute})")
    logger.log(f"Volume: {volume}")
    logger.log(f"Pitch: {pitch}")
    logger.log(f"Include front matter: {args.include_front_matter}")
    logger.log(f"Start at: {args.start_at if args.start_at else 'beginning'}")

    if not args.from_script:
        logger.log(f"Table mode: {args.tables}")
        logger.log(f"Remove exam notes: {args.remove_exam_notes}")
        logger.log("Parsing and cleaning LaTeX...")

        speech_base_text = tex_to_speech_text(
            input_path,
            table_mode=args.tables,
            remove_exam_notes=args.remove_exam_notes,
        )

        logger.log("Formatting final speech script...")
        speech_script = format_for_speech(
            speech_base_text,
            style=style,
            skip_front_matter=not args.include_front_matter,
        )

    else:
        logger.log("Reading existing speech script...")
        speech_script = read_script_file(input_path)

    speech_script = trim_script_to_start_at(speech_script, args.start_at)
    speech_script = trim_script_to_max_words(speech_script, args.max_words)

    if args.limit is not None:
        logger.log(f"Applying character limit: {args.limit}")
        speech_script = speech_script[: args.limit]

    char_count = len(speech_script)
    word_count = len(speech_script.split())
    estimated_minutes = word_count / eff_wpm if eff_wpm > 0 else 0

    logger.log(f"Speech script characters: {char_count:,}")
    logger.log(f"Speech script words: {word_count:,}")
    logger.log(f"Estimated listening time at {eff_wpm:.0f} effective wpm: {estimated_minutes:.1f} minutes")

    if script_out_path is not None:
        script_out_path.parent.mkdir(parents=True, exist_ok=True)
        script_out_path.write_text(speech_script, encoding="utf-8")
        logger.log(f"Saved speech script: {script_out_path}")

    if not args.no_chapters:
        chapters = estimate_chapters_from_script(speech_script, words_per_minute=int(round(eff_wpm)))
        write_chapter_files(chapters, chapter_json_path, chapter_txt_path)
        logger.log(f"Saved chapter timestamps: {chapter_txt_path}")
        logger.log(f"Saved chapter data: {chapter_json_path}")

    if args.preview:
        logger.log("Preview mode enabled. Printing final speech script.")
        print()
        print(speech_script)
        logger.log("Preview complete.")
        logger.log(f"Saved log: {log_path}")
        return

    logger.log(f"Output audio path: {out_path}")
    logger.log("Starting TTS generation...")

    asyncio.run(
        text_to_mp3(
            text=speech_script,
            out_path=out_path,
            voice=voice,
            rate=rate,
            volume=volume,
            pitch=pitch,
            progress_callback=logger.log,
        )
    )

    logger.log(f"Saved audio: {out_path}")
    logger.log(f"Saved log: {log_path}")
    logger.log("Done.")
