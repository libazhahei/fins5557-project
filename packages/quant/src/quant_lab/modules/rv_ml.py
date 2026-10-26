"""M8 — lightweight RV/ML stub (full legacy pipeline remains in legacy/)."""

from __future__ import annotations

import io
import json
from typing import Any

import numpy as np
import pandas as pd

from quant_lab.jobs import JobResult, JobSpec, JobType
from quant_lab.ports import ObjectStore


def run_rv_ml(spec: JobSpec, store: ObjectStore) -> JobResult:
    assert spec.job_type == JobType.RV_ML
    params: dict[str, Any] = spec.params
    panel_uri = params.get("panel_uri") or (spec.input_uris[0] if spec.input_uris else None)
    if not panel_uri:
        return JobResult(job_type=JobType.RV_ML, status="failed", error="panel_uri required")
    try:
        panel = pd.read_csv(io.BytesIO(store.get(panel_uri)), parse_dates=["Date"]).set_index("Date")
        symbol = params.get("symbol", "SPY")
        if symbol not in panel.columns:
            symbol = panel.columns[0]
        rets = np.log(panel[symbol]).diff().dropna()
        # realized vol 5d / 21d
        rv5 = rets.rolling(5).std() * np.sqrt(252)
        rv21 = rets.rolling(21).std() * np.sqrt(252)
        # naive: predict next rv5 > expanding median
        fwd = rv5.shift(-5)
        thresh = fwd.expanding().median()
        y = (fwd > thresh).astype(int)
        # persistence baseline accuracy
        pred = (rv5 > rv5.shift(1)).astype(int)
        mask = y.notna() & pred.notna()
        acc = float((pred[mask] == y[mask]).mean()) if mask.any() else float("nan")
        payload = {
            "symbol": symbol,
            "baseline": "rv_persistence",
            "accuracy": acc,
            "note": "Stub feature — full Optuna/LightGBM stack lives in legacy/project",
            "n": int(mask.sum()),
        }
        uri = store.put(
            "rv/summary.json",
            json.dumps(payload, indent=2).encode(),
            content_type="application/json",
        )
        feat = pd.DataFrame({"rv5": rv5, "rv21": rv21, "y": y}).dropna()
        buf = io.BytesIO()
        feat.tail(500).to_csv(buf, index_label="Date")
        feat_uri = store.put("rv/features_tail.csv", buf.getvalue(), content_type="text/csv")
        return JobResult(
            job_type=JobType.RV_ML,
            status="succeeded",
            output_uris=[uri, feat_uri],
            metrics=payload,
        )
    except Exception as exc:  # noqa: BLE001
        return JobResult(job_type=JobType.RV_ML, status="failed", error=str(exc))
