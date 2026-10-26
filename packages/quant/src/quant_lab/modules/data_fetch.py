"""M1 — fetch OHLCV / adjusted close into the object store."""

from __future__ import annotations

import io
from typing import Any

import pandas as pd

from quant_lab.jobs import JobResult, JobSpec, JobType
from quant_lab.ports import ObjectStore

DEFAULT_TICKERS = ("SPY", "QQQ", "IEF", "TLT", "GLD", "SHY")


def fetch_yfinance(
    tickers: list[str],
    start: str,
    end: str | None = None,
) -> dict[str, pd.DataFrame]:
    import yfinance as yf

    out: dict[str, pd.DataFrame] = {}
    for t in tickers:
        raw = yf.download(t, start=start, end=end, progress=False, auto_adjust=False)
        if raw.empty:
            raise RuntimeError(f"no data for {t}")
        if isinstance(raw.columns, pd.MultiIndex):
            raw.columns = raw.columns.get_level_values(0)
        df = raw.rename(columns={"Adj Close": "AdjClose"}).copy()
        df.index = pd.to_datetime(df.index).tz_localize(None).normalize()
        df.index.name = "Date"
        keep = [c for c in ["Open", "High", "Low", "Close", "AdjClose", "Volume"] if c in df.columns]
        out[t] = df[keep].dropna(subset=["AdjClose"] if "AdjClose" in keep else ["Close"])
    return out


def load_csv_dir(path: str, tickers: list[str]) -> dict[str, pd.DataFrame]:
    from pathlib import Path

    root = Path(path)
    frames: dict[str, pd.DataFrame] = {}
    for t in tickers:
        p = root / f"{t}.csv"
        df = pd.read_csv(p, parse_dates=["Date"]).set_index("Date").sort_index()
        frames[t] = df
    return frames


def run_data_fetch(spec: JobSpec, store: ObjectStore) -> JobResult:
    assert spec.job_type == JobType.DATA_FETCH
    params: dict[str, Any] = spec.params
    tickers = list(params.get("tickers") or DEFAULT_TICKERS)
    start = params.get("start") or "2016-01-01"
    end = params.get("end")
    source = params.get("source", "yfinance")  # yfinance | csv_dir

    try:
        if source == "csv_dir":
            frames = load_csv_dir(params["csv_dir"], tickers)
        else:
            frames = fetch_yfinance(tickers, start=start, end=end)

        by_ticker: dict[str, str] = {}
        uri_list: list[str] = []
        for t, df in frames.items():
            buf = io.BytesIO()
            df.to_csv(buf, index_label="Date")
            key = f"data/{t}.csv"
            uri = store.put(key, buf.getvalue(), content_type="text/csv")
            uri_list.append(uri)
            by_ticker[t] = uri

        # Combined adj-close panel
        panel = pd.DataFrame({t: frames[t]["AdjClose"] for t in tickers if "AdjClose" in frames[t]}).dropna()
        buf = io.BytesIO()
        panel.to_csv(buf, index_label="Date")
        panel_uri = store.put("data/adj_close_panel.csv", buf.getvalue(), content_type="text/csv")
        uri_list.append(panel_uri)

        return JobResult(
            job_type=JobType.DATA_FETCH,
            status="succeeded",
            output_uris=uri_list,
            metrics={
                "tickers": tickers,
                "rows": int(len(panel)),
                "start": str(panel.index.min().date()) if len(panel) else None,
                "end": str(panel.index.max().date()) if len(panel) else None,
                "panel_uri": panel_uri,
                "by_ticker": by_ticker,
            },
        )
    except Exception as exc:  # noqa: BLE001
        return JobResult(job_type=JobType.DATA_FETCH, status="failed", error=str(exc))
