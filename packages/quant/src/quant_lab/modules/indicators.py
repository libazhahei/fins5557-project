"""M2 — trend regime, realized vol, optional Hurst."""

from __future__ import annotations

import io
from typing import Any

import numpy as np
import pandas as pd

from quant_lab.jobs import JobResult, JobSpec, JobType
from quant_lab.ports import ObjectStore


def _read_panel(store: ObjectStore, uri: str) -> pd.DataFrame:
    raw = store.get(uri)
    return pd.read_csv(io.BytesIO(raw), parse_dates=["Date"]).set_index("Date").sort_index()


def sma_regime(
    prices: pd.Series,
    window: int = 200,
    buffer: float = 0.01,
    confirm: int = 2,
) -> pd.Series:
    """Boolean risk-on with hysteresis around SMA gap."""
    sma = prices.rolling(window).mean()
    gap = prices / sma - 1.0
    risk_on = pd.Series(False, index=prices.index)
    state = False
    hist: list[bool] = []
    for t, g in gap.items():
        if np.isnan(g):
            risk_on.at[t] = state
            continue
        if state:
            hist.append(g < -buffer)
            if len(hist) >= confirm and all(hist[-confirm:]):
                state = False
                hist = []
        else:
            hist.append(g > buffer)
            if len(hist) >= confirm and all(hist[-confirm:]):
                state = True
                hist = []
        risk_on.at[t] = state
    return risk_on.rename("risk_on")


def realized_vol(returns: pd.Series, lookback: int = 63) -> pd.Series:
    return returns.rolling(lookback).std(ddof=1) * np.sqrt(252)


def run_indicators(spec: JobSpec, store: ObjectStore) -> JobResult:
    assert spec.job_type == JobType.INDICATORS
    params: dict[str, Any] = spec.params
    panel_uri = params.get("panel_uri") or (spec.input_uris[0] if spec.input_uris else None)
    if not panel_uri:
        return JobResult(job_type=JobType.INDICATORS, status="failed", error="panel_uri required")

    try:
        panel = _read_panel(store, panel_uri)
        spy = params.get("regime_asset", "SPY")
        window = int(params.get("trend_days", 200))
        buffer = float(params.get("buffer", 0.01))
        confirm = int(params.get("regime_confirm", 2))
        vol_lb = int(params.get("vol_lookback", 63))

        risk_on = sma_regime(panel[spy], window=window, buffer=buffer, confirm=confirm)
        rets = panel.pct_change()
        vol = realized_vol(rets[spy], lookback=vol_lb).rename("realized_vol")

        out = pd.concat([risk_on, vol], axis=1)
        # per-asset above SMA flags
        for col in panel.columns:
            sma = panel[col].rolling(window).mean()
            out[f"above_sma_{col}"] = panel[col] > sma

        buf = io.BytesIO()
        out.to_csv(buf, index_label="Date")
        uri = store.put("indicators/regime.csv", buf.getvalue(), content_type="text/csv")
        return JobResult(
            job_type=JobType.INDICATORS,
            status="succeeded",
            output_uris=[uri],
            metrics={
                "risk_on_frac": float(risk_on.mean()),
                "trend_days": window,
                "uri": uri,
            },
        )
    except Exception as exc:  # noqa: BLE001
        return JobResult(job_type=JobType.INDICATORS, status="failed", error=str(exc))
