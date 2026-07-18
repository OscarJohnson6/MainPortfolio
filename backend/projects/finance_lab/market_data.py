from __future__ import annotations

import hashlib
import math
from datetime import date, datetime, timedelta
from pathlib import Path

from .storage import read_json, write_json_locked


def today_iso() -> str:
    return date.today().isoformat()


def parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def normalize_symbol(symbol: str) -> str:
    cleaned = str(symbol or "").strip().upper()
    if not cleaned or len(cleaned) > 12:
        raise ValueError("Invalid symbol")
    allowed = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-")
    if any(ch not in allowed for ch in cleaned):
        raise ValueError("Invalid symbol")
    return cleaned


def symbol_seed(symbol: str) -> int:
    digest = hashlib.sha256(symbol.encode("utf-8")).hexdigest()
    return int(digest[:8], 16)


def is_weekday(day: date) -> bool:
    return day.weekday() < 5


def generate_demo_history(symbol: str, start: str = "2020-01-01", end: str | None = None) -> dict:
    """
    Deterministic demo-source data. This keeps the simulator working without an API key.
    Replace this provider later with Alpha Vantage/Finnhub/Stooq, then keep the same cache shape.
    """
    symbol = normalize_symbol(symbol)
    start_day = parse_date(start)
    end_day = parse_date(end or today_iso())
    seed = symbol_seed(symbol)

    base = 25 + (seed % 260)
    trend = ((seed // 17) % 90 - 20) / 10000
    volatility = 0.015 + ((seed // 31) % 25) / 1000

    prices = []
    idx = 0
    current = float(base)
    day = start_day

    while day <= end_day:
        if is_weekday(day):
            wave = math.sin(idx / 11) * volatility + math.sin(idx / 37) * volatility * 0.6
            drift = trend
            current = max(1.0, current * (1 + drift + wave))
            close = round(current, 2)
            open_price = round(close * (1 - wave * 0.35), 2)
            high = round(max(open_price, close) * 1.012, 2)
            low = round(min(open_price, close) * 0.988, 2)
            prices.append(
                {
                    "date": day.isoformat(),
                    "open": open_price,
                    "high": high,
                    "low": low,
                    "close": close,
                    "adjustedClose": close,
                    "volume": int(1_000_000 + (seed % 9_000_000) + idx * 1000),
                }
            )
            idx += 1
        day += timedelta(days=1)

    return {
        "symbol": symbol,
        "source": "demo-source",
        "updatedAt": datetime.now().isoformat(timespec="seconds"),
        "timezone": "US/Eastern",
        "prices": prices,
    }


def history_path(cache_dir: Path, symbol: str) -> Path:
    symbol = normalize_symbol(symbol)
    return cache_dir / f"{symbol}.daily.json"


def get_or_create_history(cache_dir: Path, symbol: str) -> dict:
    path = history_path(cache_dir, symbol)
    cached = read_json(path, None)
    if cached and cached.get("prices"):
        return cached

    history = generate_demo_history(symbol)
    write_json_locked(path, history)
    return history


def nearest_price_on_or_after(history: dict, requested_date: str) -> dict:
    prices = history.get("prices") or []
    for row in prices:
        if row.get("date") >= requested_date:
            return row
    if prices:
        return prices[-1]
    raise ValueError("No price history available")


def latest_price(history: dict) -> dict:
    prices = history.get("prices") or []
    if not prices:
        raise ValueError("No price history available")
    return prices[-1]
