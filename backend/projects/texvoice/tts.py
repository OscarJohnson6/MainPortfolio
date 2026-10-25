from __future__ import annotations

from collections import deque
import json
from pathlib import Path
import time
from typing import Callable

import asyncio

import aiohttp
import edge_tts


DEFAULT_VOICE = "en-US-JennyNeural"

# Single source of truth for the audio-size estimate. server.py imports this
# rather than redefining its own copy.
#
# First rough calibration from testing:
# around 1,200 words produced roughly 3.5-4.9 MB depending on voice/rate.
ESTIMATED_KB_PER_WORD = 3.8


# Windowed-average sample window for download-speed reporting. Two seconds
# is long enough to smooth chunk-to-chunk jitter but short enough that the
# reported "current" speed actually reflects what is happening now.
_SPEED_WINDOW_SECONDS = 2.0


# Microsoft's Edge TTS endpoint answers with HTTP 403 when its signed request
# token is rejected. That usually means the Pi's clock disagreed with the
# server, or the token format changed and edge-tts needs an upgrade. It is not
# an error from this backend, so retry a couple of times before giving up.
_TTS_ATTEMPTS = 3

# edge-tts reports boundary offsets and durations in 100-nanosecond ticks.
_TICKS_PER_SECOND = 10_000_000


class TTSRejectedError(RuntimeError):
    """The upstream text-to-speech service refused the connection."""


async def text_to_mp3(
    text: str,
    out_path: str | Path,
    voice: str = DEFAULT_VOICE,
    rate: str = "-10%",
    volume: str = "+0%",
    pitch: str = "+0Hz",
    progress_callback: Callable[[str], None] | None = None,
    timings_path: str | Path | None = None,
) -> Path:
    """
    Convert a speech script to MP3. When timings_path is given, also write a
    JSON file with when each spoken sentence starts and ends in the audio,
    which the web reader uses to highlight the PDF while it plays.
    """
    last_error: Exception | None = None

    for attempt in range(1, _TTS_ATTEMPTS + 1):
        try:
            return await _text_to_mp3_once(
                text, out_path, voice, rate, volume, pitch, progress_callback, timings_path
            )
        except aiohttp.ClientResponseError as exc:
            if exc.status != 403:
                raise
            last_error = exc
            if progress_callback:
                progress_callback(
                    f"TTS service returned 403 (attempt {attempt}/{_TTS_ATTEMPTS}); retrying..."
                )
            await asyncio.sleep(attempt * 2)

    raise TTSRejectedError(
        "The Microsoft Edge TTS service rejected the request (HTTP 403). "
        "This comes from the speech service, not the TexVoice server. "
        "Check the Pi's clock (timedatectl) and that edge-tts is up to date."
    ) from last_error


async def _text_to_mp3_once(
    text: str,
    out_path: str | Path,
    voice: str = DEFAULT_VOICE,
    rate: str = "-10%",
    volume: str = "+0%",
    pitch: str = "+0Hz",
    progress_callback: Callable[[str], None] | None = None,
    timings_path: str | Path | None = None,
) -> Path:
    """
    Convert a speech script to an MP3 file using edge-tts.

    Progress is estimated from word count. It will not be perfect,
    but it gives useful "still working" feedback. Progress messages now
    include a windowed current-speed and an overall-average speed in KB/s.
    """

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    word_count = len(text.split())
    estimated_total_kb = max(1.0, word_count * ESTIMATED_KB_PER_WORD)

    if progress_callback:
        estimated_mb = estimated_total_kb / 1024
        progress_callback(f"Estimated audio size: {estimated_mb:.2f} MB")
        progress_callback("Creating TTS communication object...")

    communicate = edge_tts.Communicate(
        text=text,
        voice=voice,
        rate=rate,
        volume=volume,
        pitch=pitch,
    )

    audio_bytes = 0
    audio_chunks = 0
    last_reported_percent = -1
    sentences: list[dict] = []

    # (timestamp, cumulative_bytes_at_that_time) samples for windowed speed.
    speed_samples: deque[tuple[float, int]] = deque()
    started_at = time.perf_counter()

    if progress_callback:
        progress_callback("Streaming audio from TTS engine...")

    with out_path.open("wb") as audio_file:
        async for chunk in communicate.stream():
            if chunk["type"] == "SentenceBoundary":
                start = chunk["offset"] / _TICKS_PER_SECOND
                sentences.append({
                    "start": round(start, 3),
                    "end": round(start + chunk["duration"] / _TICKS_PER_SECOND, 3),
                    "text": chunk["text"],
                })
                continue

            if chunk["type"] != "audio":
                continue

            data = chunk["data"]
            audio_file.write(data)

            audio_chunks += 1
            audio_bytes += len(data)

            now = time.perf_counter()
            speed_samples.append((now, audio_bytes))

            # Drop samples older than the window.
            cutoff = now - _SPEED_WINDOW_SECONDS
            while speed_samples and speed_samples[0][0] < cutoff:
                speed_samples.popleft()

            received_kb = audio_bytes / 1024
            percent = min(99.0, (received_kb / estimated_total_kb) * 100)
            rounded_percent = int(percent // 5) * 5

            if progress_callback and rounded_percent > last_reported_percent:
                last_reported_percent = rounded_percent
                received_mb = received_kb / 1024
                estimated_mb = estimated_total_kb / 1024

                current_kbps = _windowed_kbps(speed_samples)
                avg_kbps = _average_kbps(audio_bytes, started_at, now)

                progress_callback(
                    f"Generating audio... about {percent:05.1f}% "
                    f"({received_mb:.2f} MB / estimated {estimated_mb:.2f} MB) "
                    f"— now {current_kbps:.0f} KB/s, avg {avg_kbps:.0f} KB/s"
                )

            elif progress_callback and audio_chunks % 150 == 0:
                received_mb = received_kb / 1024
                current_kbps = _windowed_kbps(speed_samples)
                progress_callback(
                    f"Still generating audio... received {received_mb:.2f} MB "
                    f"at {current_kbps:.0f} KB/s"
                )

    if timings_path is not None:
        timings_path = Path(timings_path)
        timings_path.parent.mkdir(parents=True, exist_ok=True)
        timings_path.write_text(
            json.dumps({"version": 1, "sentences": sentences}, ensure_ascii=False),
            encoding="utf-8",
        )
        if progress_callback:
            progress_callback(f"Saved timings for {len(sentences):,} spoken sentences.")

    if progress_callback:
        actual_mb = audio_bytes / (1024 * 1024)
        total_elapsed = max(0.001, time.perf_counter() - started_at)
        avg_kbps = (audio_bytes / 1024) / total_elapsed
        progress_callback(
            f"Finished receiving audio stream: 100.0% ({actual_mb:.2f} MB) "
            f"in {total_elapsed:.1f}s, average {avg_kbps:.0f} KB/s"
        )

    return out_path


def _windowed_kbps(samples: "deque[tuple[float, int]]") -> float:
    """Return KB/s averaged across the samples in the current window."""
    if len(samples) < 2:
        return 0.0

    first_time, first_bytes = samples[0]
    last_time, last_bytes = samples[-1]
    elapsed = last_time - first_time

    if elapsed <= 0:
        return 0.0

    delta_kb = (last_bytes - first_bytes) / 1024
    return delta_kb / elapsed


def _average_kbps(total_bytes: int, started_at: float, now: float) -> float:
    elapsed = now - started_at
    if elapsed <= 0:
        return 0.0
    return (total_bytes / 1024) / elapsed
