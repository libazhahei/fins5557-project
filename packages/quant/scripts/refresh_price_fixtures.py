"""Download OHLCV CSVs into packages/quant/tests/fixtures/prices.

Usage:
  uv run python packages/quant/scripts/refresh_price_fixtures.py
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tests" / "fixtures" / "prices"
TICKERS = (
    "SPY",
    "QQQ",
    "IEF",
    "TLT",
    "GLD",
    "SHY",
    "AAPL",
    "MSFT",
    "NVDA",
    "GOOG",
    "TQQQ",
)
START = "2016-01-01"
END = "2026-10-17"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for t in TICKERS:
        raw = yf.download(t, start=START, end=END, progress=False, auto_adjust=False)
        if raw.empty:
            raise RuntimeError(f"no data for {t}")
        if isinstance(raw.columns, pd.MultiIndex):
            raw.columns = raw.columns.get_level_values(0)
        df = raw.rename(columns={"Adj Close": "AdjClose"}).copy()
        df.index = pd.to_datetime(df.index).tz_localize(None).normalize()
        df.index.name = "Date"
        keep = [c for c in ["Open", "High", "Low", "Close", "AdjClose", "Volume"] if c in df.columns]
        df = df[keep].dropna(subset=["AdjClose"] if "AdjClose" in keep else ["Close"])
        path = OUT / f"{t}.csv"
        df.to_csv(path, index_label="Date")
        print(f"{t}: {len(df)} rows -> {path}")


if __name__ == "__main__":
    main()
