"""M7 — latest target weights / signal snapshot (research only, not orders)."""

from __future__ import annotations

import io
import json
from typing import Any

import pandas as pd

from quant_lab.jobs import JobResult, JobSpec, JobType
from quant_lab.modules.portfolio import equal_weight, hrp_weights
from quant_lab.ports import ObjectStore


def run_signal_daily(spec: JobSpec, store: ObjectStore) -> JobResult:
    assert spec.job_type == JobType.SIGNAL_DAILY
    params: dict[str, Any] = spec.params
    panel_uri = params.get("panel_uri") or (spec.input_uris[0] if spec.input_uris else None)
    if not panel_uri:
        return JobResult(job_type=JobType.SIGNAL_DAILY, status="failed", error="panel_uri required")
    try:
        panel = pd.read_csv(io.BytesIO(store.get(panel_uri)), parse_dates=["Date"]).set_index("Date")
        risk_assets = list(params.get("risk_assets") or ["SPY", "QQQ", "IEF", "TLT", "GLD"])
        cash = params.get("cash", "SHY")
        trend_days = int(params.get("trend_days", 200))
        asof = panel.index.max()
        sma = panel.rolling(trend_days).mean().loc[asof]
        px = panel.loc[asof]
        spy = "SPY" if "SPY" in panel.columns else risk_assets[0]
        risk_on = bool(px[spy] > sma[spy])
        if not risk_on:
            weights = {cash: 1.0}
        else:
            eligible = [a for a in risk_assets if a in panel.columns and px[a] > sma[a]]
            if not eligible:
                weights = {cash: 1.0}
            else:
                ret = panel[eligible].pct_change().dropna().iloc[-252:]
                method = params.get("method", "hrp")
                w = equal_weight(eligible) if method == "ew" else hrp_weights(ret)
                weights = {**w.to_dict(), cash: max(0.0, 1.0 - float(w.sum()))}
        payload = {
            "asof": str(asof.date()),
            "risk_on": risk_on,
            "weights": weights,
            "disclaimer": "research signal only — not a trade order",
        }
        uri = store.put(
            "signal/latest.json",
            json.dumps(payload, indent=2).encode(),
            content_type="application/json",
        )
        return JobResult(
            job_type=JobType.SIGNAL_DAILY,
            status="succeeded",
            output_uris=[uri],
            metrics=payload,
        )
    except Exception as exc:  # noqa: BLE001
        return JobResult(job_type=JobType.SIGNAL_DAILY, status="failed", error=str(exc))
