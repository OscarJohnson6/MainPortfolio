from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import time


@dataclass
class RunLogger:
    verbose: bool = True
    log_file: Path | None = None

    def __post_init__(self) -> None:
        self.started_at = time.perf_counter()

        if self.log_file is not None:
            self.log_file.parent.mkdir(parents=True, exist_ok=True)
            self.log_file.write_text("", encoding="utf-8")

    def elapsed(self) -> str:
        seconds = time.perf_counter() - self.started_at
        minutes = int(seconds // 60)
        secs = seconds % 60

        if minutes:
            return f"{minutes}m {secs:04.1f}s"

        return f"{secs:.1f}s"

    def log(self, message: str) -> None:
        timestamp = datetime.now().strftime("%H:%M:%S")
        line = f"[{timestamp} | +{self.elapsed()}] {message}"

        if self.verbose:
            print(line)

        if self.log_file is not None:
            with self.log_file.open("a", encoding="utf-8") as file:
                file.write(line + "\n")