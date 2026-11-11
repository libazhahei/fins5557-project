"""Market search / overview / bars with fixture-first + optional Yahoo live."""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from quant_lab_api.paths import fixture_prices_dir
from quant_lab_api.services.pipeline import CORE_ETFS, DEMO_EQUITIES, FIXTURE_SYMBOLS

# symbol -> (name, asset_type)
KNOWN_META: dict[str, tuple[str, str]] = {
    "SPY": ("SPDR S&P 500 ETF Trust", "ETF"),
    "QQQ": ("Invesco QQQ Trust", "ETF"),
    "IEF": ("iShares 7-10 Year Treasury Bond ETF", "ETF"),
    "TLT": ("iShares 20+ Year Treasury Bond ETF", "ETF"),
    "GLD": ("SPDR Gold Shares", "ETF"),
    "SHY": ("iShares 1-3 Year Treasury Bond ETF", "ETF"),
    "AAPL": ("Apple Inc.", "EQUITY"),
    "MSFT": ("Microsoft Corporation", "EQUITY"),
    "NVDA": ("NVIDIA Corporation", "EQUITY"),
    "GOOG": ("Alphabet Inc. Class C", "EQUITY"),
    "TQQQ": ("ProShares UltraPro QQQ", "ETF"),
}

# Simple in-process caches
_bars_cache: dict[str, tuple[float, pd.DataFrame, str]] = {}
_overview_cache: dict[str, tuple[float, dict]] = {}
_BARS_TTL = 3600.0
_OVERVIEW_TTL = 86400.0


@dataclass
class BarsResult:
    df: pd.DataFrame
    data_source: str


def yahoo_available() -> bool:
    try:
        import yfinance  # noqa: F401

        return True
    except Exception:  # noqa: BLE001
        return False


def search_tickers(q: str, limit: int = 20) -> list[dict[str, str]]:
    needle = (q or "").strip().upper()
    if not needle:
        return []
    hits: list[dict[str, str]] = []
    for sym in sorted(FIXTURE_SYMBOLS):
        name, asset_type = KNOWN_META.get(sym, (sym, "EQUITY"))
        if needle in sym or needle in name.upper():
            hits.append({"symbol": sym, "name": name, "asset_type": asset_type})
    if len(hits) < limit and yahoo_available():
        try:
            import yfinance as yf

            # Best-effort Yahoo search via ticker info probe for exact symbol
            if needle.isalpha() and 1 <= len(needle) <= 6 and all(h["symbol"] != needle for h in hits):
                t = yf.Ticker(needle)
                info = getattr(t, "fast_info", None)
                last = None
                try:
                    last = info.last_price if info is not None else None
                except Exception:  # noqa: BLE001
                    last = None
                if last is not None:
                    long_name = needle
                    try:
                        long_name = (t.info or {}).get("shortName") or (t.info or {}).get("longName") or needle
                    except Exception:  # noqa: BLE001
                        pass
                    quote_type = "EQUITY"
                    try:
                        qt = (t.info or {}).get("quoteType") or ""
                        if "ETF" in str(qt).upper():
                            quote_type = "ETF"
                    except Exception:  # noqa: BLE001
                        pass
                    hits.append({"symbol": needle, "name": str(long_name), "asset_type": quote_type})
        except Exception:  # noqa: BLE001
            pass
    return hits[:limit]


def _load_fixture_df(symbol: str) -> pd.DataFrame | None:
    path = fixture_prices_dir() / f"{symbol.upper()}.csv"
    if not path.exists():
        return None
    raw = pd.read_csv(path, parse_dates=["Date"]).set_index("Date").sort_index()
    close_col = "AdjClose" if "AdjClose" in raw.columns else "Close"
    return pd.DataFrame(
        {
            "Open": raw.get("Open", raw[close_col]),
            "High": raw.get("High", raw[close_col]),
            "Low": raw.get("Low", raw[close_col]),
            "Close": raw[close_col],
            "Volume": raw.get("Volume", 0),
        },
        index=raw.index,
    ).dropna()


def _load_yahoo_df(symbol: str, start: str | None = None, end: str | None = None) -> pd.DataFrame | None:
    if not yahoo_available():
        return None
    try:
        import yfinance as yf

        raw = yf.download(
            symbol,
            start=start or "2016-01-01",
            end=end,
            progress=False,
            auto_adjust=False,
        )
        if raw is None or raw.empty:
            return None
        if isinstance(raw.columns, pd.MultiIndex):
            raw.columns = raw.columns.get_level_values(0)
        df = raw.rename(columns={"Adj Close": "AdjClose"}).copy()
        df.index = pd.to_datetime(df.index).tz_localize(None).normalize()
        close_col = "AdjClose" if "AdjClose" in df.columns else "Close"
        return pd.DataFrame(
            {
                "Open": df.get("Open", df[close_col]),
                "High": df.get("High", df[close_col]),
                "Low": df.get("Low", df[close_col]),
                "Close": df[close_col],
                "Volume": df.get("Volume", 0),
            },
            index=df.index,
        ).dropna()
    except Exception:  # noqa: BLE001
        return None


def load_bars(
    symbol: str,
    *,
    prefer_live: bool = False,
    start: str | None = None,
    end: str | None = None,
) -> BarsResult:
    key = f"{symbol.upper()}|{prefer_live}|{start}|{end}"
    now = time.time()
    cached = _bars_cache.get(key)
    if cached and now - cached[0] < _BARS_TTL:
        return BarsResult(df=cached[1], data_source=cached[2])

    sym = symbol.upper()
    df: pd.DataFrame | None = None
    source = "fixture"

    if prefer_live:
        df = _load_yahoo_df(sym, start=start, end=end)
        source = "yahoo_live" if df is not None else "fixture"
    if df is None:
        df = _load_fixture_df(sym)
        source = "fixture"
    if df is None:
        df = _load_yahoo_df(sym, start=start, end=end)
        source = "yahoo_live" if df is not None else "fixture"
    if df is None or df.empty:
        raise FileNotFoundError(f"No bars for {sym}")

    if start:
        df = df[df.index >= pd.Timestamp(start)]
    if end:
        df = df[df.index <= pd.Timestamp(end)]

    _bars_cache[key] = (now, df, source)
    return BarsResult(df=df, data_source=source)


def _ann_vol(returns: pd.Series, window: int) -> float:
    if len(returns) < window + 2:
        return float("nan")
    return float(returns.tail(window).std() * math.sqrt(252))


def _atr(df: pd.DataFrame, window: int = 14) -> float:
    if len(df) < window + 1:
        return float("nan")
    high, low, close = df["High"], df["Low"], df["Close"]
    prev_close = close.shift(1)
    tr = pd.concat([(high - low), (high - prev_close).abs(), (low - prev_close).abs()], axis=1).max(axis=1)
    return float(tr.tail(window).mean())


def _max_drawdown(close: pd.Series) -> float:
    if close.empty:
        return float("nan")
    peak = close.cummax()
    dd = close / peak - 1.0
    return float(dd.min())


def _hv_percentile(returns: pd.Series, window: int = 20) -> float:
    if len(returns) < 252:
        return float("nan")
    hv = returns.rolling(window).std() * math.sqrt(252)
    hv = hv.dropna()
    if hv.empty:
        return float("nan")
    current = hv.iloc[-1]
    return float((hv.tail(252) <= current).mean() * 100)


def _beta_vs_spy(sym_rets: pd.Series) -> float | None:
    try:
        spy = load_bars("SPY").df["Close"].pct_change().dropna()
        aligned = pd.concat([sym_rets, spy], axis=1, join="inner").dropna()
        if len(aligned) < 60:
            return None
        aligned.columns = ["a", "b"]
        cov = np.cov(aligned["a"], aligned["b"])[0, 1]
        var = float(np.var(aligned["b"]))
        if var <= 0:
            return None
        return float(cov / var)
    except Exception:  # noqa: BLE001
        return None


def _yahoo_fundamentals(symbol: str) -> dict[str, Any]:
    out: dict[str, Any] = {}
    if not yahoo_available():
        return out
    try:
        import yfinance as yf

        info = yf.Ticker(symbol).info or {}
        out = {
            "name": info.get("shortName") or info.get("longName"),
            "asset_type": "ETF" if str(info.get("quoteType", "")).upper() == "ETF" else "EQUITY",
            "currency": info.get("currency") or "USD",
            "market_cap": info.get("marketCap"),
            "pe_ttm": info.get("trailingPE"),
            "pe_forward": info.get("forwardPE"),
            "pb_ratio": info.get("priceToBook"),
            "dividend_yield": info.get("dividendYield"),
            "expense_ratio": info.get("annualReportExpenseRatio") or info.get("netExpenseRatio"),
        }
    except Exception:  # noqa: BLE001
        pass
    return out


def build_overview(symbol: str, *, prefer_live: bool = False) -> dict[str, Any]:
    sym = symbol.upper()
    now = time.time()
    cached = _overview_cache.get(sym)
    if cached and now - cached[0] < _OVERVIEW_TTL and not prefer_live:
        return cached[1]

    bars = load_bars(sym, prefer_live=prefer_live)
    df = bars.df
    close = df["Close"]
    rets = close.pct_change().dropna()
    last = float(close.iloc[-1])
    prev = float(close.iloc[-2]) if len(close) > 1 else last
    change = last - prev
    change_pct = change / prev if prev else 0.0
    week_52 = close.tail(252) if len(close) >= 252 else close
    hi = float(week_52.max())
    lo = float(week_52.min())

    name, asset_type = KNOWN_META.get(sym, (sym, "EQUITY" if sym not in CORE_ETFS else "ETF"))
    fund = {
        "market_cap": None,
        "pe_ttm": None,
        "pe_forward": None,
        "pb_ratio": None,
        "dividend_yield": None,
        "expense_ratio": None,
        "week_52_high": hi,
        "week_52_low": lo,
    }
    yahoo = _yahoo_fundamentals(sym) if (prefer_live or bars.data_source == "yahoo_live") else {}
    if yahoo.get("name"):
        name = str(yahoo["name"])
    if yahoo.get("asset_type"):
        asset_type = str(yahoo["asset_type"])
    for k in ("market_cap", "pe_ttm", "pe_forward", "pb_ratio", "dividend_yield", "expense_ratio"):
        if yahoo.get(k) is not None:
            fund[k] = yahoo[k]

    # Fixture-friendly synthetic PE placeholders for demo equities when Yahoo skipped
    if fund["pe_ttm"] is None and sym in DEMO_EQUITIES:
        fund["pe_ttm"] = {"AAPL": 28.5, "MSFT": 32.1, "NVDA": 55.0, "GOOG": 24.2, "TQQQ": None}.get(sym)

    payload = {
        "symbol": sym,
        "name": name,
        "asset_type": asset_type,
        "currency": yahoo.get("currency") or "USD",
        "data_source": bars.data_source,
        "quote": {
            "last_price": last,
            "change": change,
            "change_pct": change_pct,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        "fundamentals": fund,
        "volatility_metrics": {
            "hv_20d": _ann_vol(rets, 20),
            "hv_60d": _ann_vol(rets, 60),
            "hv_percentile_1y": _hv_percentile(rets, 20),
            "atr_14d": _atr(df, 14),
            "beta_spy": _beta_vs_spy(rets),
            "max_drawdown_1y": _max_drawdown(close.tail(252) if len(close) >= 252 else close),
        },
        "extra_sections": [],
    }
    _overview_cache[sym] = (now, payload)
    return payload


def default_watchlist_groups() -> list[dict[str, Any]]:
    return [
        {
            "id": "core_etfs",
            "title": "Core ETFs",
            "symbols": list(CORE_ETFS),
        },
        {
            "id": "demo_equities",
            "title": "Demo Equities",
            "symbols": list(DEMO_EQUITIES),
        },
        {
            "id": "custom",
            "title": "Custom Watchlist",
            "symbols": [],
        },
    ]


def bars_to_payload(df: pd.DataFrame, limit: int = 800) -> list[dict[str, Any]]:
    slice_df = df.dropna().iloc[-limit:]
    out = []
    for idx, row in slice_df.iterrows():
        out.append(
            {
                "time": int(pd.Timestamp(idx).timestamp()),
                "timestamp": pd.Timestamp(idx).strftime("%Y-%m-%d"),
                "open": float(row.Open),
                "high": float(row.High),
                "low": float(row.Low),
                "close": float(row.Close),
                "volume": float(row.Volume) if hasattr(row, "Volume") else 0.0,
            }
        )
    return out
