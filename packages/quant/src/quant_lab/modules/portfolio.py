"""M3 — portfolio weights (HRP when riskfolio present, else equal-weight)."""

from __future__ import annotations

import io
from typing import Any

import pandas as pd

from quant_lab.jobs import JobResult, JobSpec, JobType
from quant_lab.ports import ObjectStore

try:
    import riskfolio as rp
except Exception:  # pragma: no cover
    rp = None


def equal_weight(cols: list[str]) -> pd.Series:
    return pd.Series({c: 1.0 / len(cols) for c in cols})


def hrp_weights(ret: pd.DataFrame, max_weight: float = 0.40) -> pd.Series:
    cols = list(ret.columns)
    if len(cols) == 1:
        return pd.Series({cols[0]: 1.0})
    if rp is None or len(ret) < 80:
        return equal_weight(cols)
    try:
        port = rp.HCPortfolio(returns=ret, w_max=max_weight, w_min=0.0)
        w = port.optimization(
            model="HRP",
            codependence="pearson",
            rm="vol",
            method_cov="ledoit",
            linkage="ward",
            max_k=10,
        )
        if w is None:
            raise ValueError("HRP returned None")
        series = w["weights"].reindex(cols).fillna(0.0).clip(lower=0.0)
        if series.sum() <= 0:
            raise ValueError("empty HRP")
        return series / series.sum()
    except Exception:
        return equal_weight(cols)


def run_portfolio_optimize(spec: JobSpec, store: ObjectStore) -> JobResult:
    assert spec.job_type == JobType.PORTFOLIO_OPTIMIZE
    params: dict[str, Any] = spec.params
    panel_uri = params.get("panel_uri") or (spec.input_uris[0] if spec.input_uris else None)
    if not panel_uri:
        return JobResult(
            job_type=JobType.PORTFOLIO_OPTIMIZE, status="failed", error="panel_uri required"
        )
    try:
        panel = pd.read_csv(io.BytesIO(store.get(panel_uri)), parse_dates=["Date"]).set_index("Date")
        assets = list(params.get("risk_assets") or [c for c in panel.columns if c != "SHY"])
        lookback = int(params.get("lookback", 252))
        method = params.get("method", "hrp")
        max_w = float(params.get("max_weight", 0.40))
        ret = panel[assets].pct_change().dropna().iloc[-lookback:]
        if method == "ew":
            w = equal_weight(assets)
        else:
            w = hrp_weights(ret, max_weight=max_w)
        buf = io.BytesIO()
        w.to_csv(buf, header=["weight"])
        uri = store.put("portfolio/weights.csv", buf.getvalue(), content_type="text/csv")
        return JobResult(
            job_type=JobType.PORTFOLIO_OPTIMIZE,
            status="succeeded",
            output_uris=[uri],
            metrics={"weights": w.to_dict(), "method": method, "uri": uri, "riskfolio": rp is not None},
        )
    except Exception as exc:  # noqa: BLE001
        return JobResult(job_type=JobType.PORTFOLIO_OPTIMIZE, status="failed", error=str(exc))
