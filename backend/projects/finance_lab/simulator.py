from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .market_data import get_or_create_history, latest_price, nearest_price_on_or_after, normalize_symbol


@dataclass
class PositionState:
    id: str
    symbol: str
    buy_date: str
    input_mode: str
    input_amount: float
    shares: float
    buy_price: float
    resolved_buy_date: str
    latest_price: float
    latest_date: str
    cost_basis: float
    current_value: float


def simulate_scenario(scenario: dict, cache_dir: Path) -> dict:
    starting_cash = float(scenario.get("startingCash") or 0)
    cash_policy = scenario.get("cashPolicy") or "strict"
    benchmark_symbol = normalize_symbol(scenario.get("benchmarkSymbol") or "VOO")
    raw_positions = scenario.get("positions") or []

    cash = starting_cash
    invested = 0.0
    states: list[PositionState] = []
    warnings: list[str] = []
    histories: dict[str, dict] = {}

    def history(symbol: str) -> dict:
        symbol = normalize_symbol(symbol)
        if symbol not in histories:
            histories[symbol] = get_or_create_history(cache_dir, symbol)
        return histories[symbol]

    for raw in raw_positions:
        symbol = normalize_symbol(raw.get("symbol"))
        buy_date = raw.get("buyDate")
        input_mode = "shares" if raw.get("inputMode") == "shares" else "dollars"
        input_amount = max(0.0, float(raw.get("inputAmount") or 0))

        hist = history(symbol)
        buy_row = nearest_price_on_or_after(hist, buy_date)
        latest_row = latest_price(hist)
        buy_price = float(buy_row["adjustedClose"])
        current_price = float(latest_row["adjustedClose"])

        requested_cost = input_amount * buy_price if input_mode == "shares" else input_amount
        actual_cost = requested_cost

        if cash_policy == "strict" and actual_cost > cash + 0.0001:
            warnings.append(f"Skipped {symbol}: buy cost exceeds remaining cash.")
            continue

        if cash_policy == "auto-trim" and actual_cost > cash:
            actual_cost = max(0.0, cash)
            warnings.append(f"Trimmed {symbol} to remaining cash.")

        shares = actual_cost / buy_price if input_mode == "dollars" else input_amount
        if input_mode == "shares" and cash_policy == "auto-trim" and requested_cost > cash:
            shares = actual_cost / buy_price

        cost_basis = shares * buy_price
        current_value = shares * current_price
        cash -= cost_basis
        invested += cost_basis

        states.append(
            PositionState(
                id=raw.get("id") or f"pos_{symbol}",
                symbol=symbol,
                buy_date=buy_date,
                input_mode=input_mode,
                input_amount=input_amount,
                shares=shares,
                buy_price=buy_price,
                resolved_buy_date=buy_row["date"],
                latest_price=current_price,
                latest_date=latest_row["date"],
                cost_basis=cost_basis,
                current_value=current_value,
            )
        )

    portfolio_value = cash + sum(p.current_value for p in states)
    gain_loss = portfolio_value - starting_cash
    gain_loss_percent = (gain_loss / starting_cash * 100) if starting_cash else 0

    timeline = build_timeline(states, histories, benchmark_symbol, starting_cash, cash, cache_dir)

    return {
        "source": "backend simulation using cached/demo daily price files",
        "warnings": warnings,
        "summary": {
            "startingCash": round(starting_cash, 2),
            "invested": round(invested, 2),
            "cash": round(cash, 2),
            "portfolioValue": round(portfolio_value, 2),
            "gainLoss": round(gain_loss, 2),
            "gainLossPercent": round(gain_loss_percent, 2),
        },
        "positions": [serialize_position(p, portfolio_value) for p in states],
        "timeline": timeline,
    }


def serialize_position(p: PositionState, portfolio_value: float) -> dict:
    gain_loss = p.current_value - p.cost_basis
    gain_loss_percent = (gain_loss / p.cost_basis * 100) if p.cost_basis else 0
    allocation = (p.current_value / portfolio_value * 100) if portfolio_value else 0
    return {
        "id": p.id,
        "symbol": p.symbol,
        "buyDate": p.buy_date,
        "resolvedBuyDate": p.resolved_buy_date,
        "inputMode": p.input_mode,
        "inputAmount": round(p.input_amount, 4),
        "shares": round(p.shares, 6),
        "buyPrice": round(p.buy_price, 2),
        "latestPrice": round(p.latest_price, 2),
        "latestDate": p.latest_date,
        "costBasis": round(p.cost_basis, 2),
        "currentValue": round(p.current_value, 2),
        "gainLoss": round(gain_loss, 2),
        "gainLossPercent": round(gain_loss_percent, 2),
        "allocation": round(allocation, 2),
    }


def build_timeline(states: list[PositionState], histories: dict[str, dict], benchmark_symbol: str, starting_cash: float, final_cash: float, cache_dir: Path) -> list[dict]:
    if not states:
        return []

    start_date = min(p.resolved_buy_date for p in states)
    all_dates = sorted({row["date"] for hist in histories.values() for row in hist.get("prices", []) if row["date"] >= start_date})
    if len(all_dates) > 260:
        step = max(1, len(all_dates) // 220)
        all_dates = all_dates[::step] + ([all_dates[-1]] if all_dates[-1] not in all_dates[::step] else [])

    price_lookup = {
        symbol: {row["date"]: float(row["adjustedClose"]) for row in hist.get("prices", [])}
        for symbol, hist in histories.items()
    }

    benchmark_hist = get_or_create_history(cache_dir, benchmark_symbol)
    benchmark_prices = {row["date"]: float(row["adjustedClose"]) for row in benchmark_hist.get("prices", [])}
    benchmark_start = next((benchmark_prices.get(d) for d in all_dates if d in benchmark_prices), None)

    rows = []
    for day in all_dates:
        cash = starting_cash
        cost_basis = 0.0
        row = {"date": day}
        position_value_total = 0.0

        for p in states:
            if day < p.resolved_buy_date:
                continue
            cash -= p.cost_basis
            cost_basis += p.cost_basis
            price = price_lookup.get(p.symbol, {}).get(day)
            if price is None:
                continue
            value = p.shares * price
            row[f"pos_{p.symbol}"] = round(value, 2)
            position_value_total += value

        row["cash"] = round(cash, 2)
        row["costBasis"] = round(cost_basis, 2)
        row["portfolioValue"] = round(cash + position_value_total, 2)

        bench_price = benchmark_prices.get(day)
        if benchmark_start and bench_price:
            row["benchmarkValue"] = round(starting_cash * (bench_price / benchmark_start), 2)

        rows.append(row)

    return rows
