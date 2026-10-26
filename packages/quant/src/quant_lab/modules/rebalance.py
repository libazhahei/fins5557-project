"""M4 — turn target weights into a rebalance plan / order list."""

from __future__ import annotations

import io
import json
from typing import Any

import pandas as pd

from quant_lab.jobs import JobResult, JobSpec, JobType
from quant_lab.ports import ObjectStore


def run_rebalance_plan(spec: JobSpec, store: ObjectStore) -> JobResult:
    assert spec.job_type == JobType.REBALANCE_PLAN
    params: dict[str, Any] = spec.params
    try:
        weights_uri = params.get("weights_uri") or (spec.input_uris[0] if spec.input_uris else None)
        if not weights_uri:
            return JobResult(
                job_type=JobType.REBALANCE_PLAN, status="failed", error="weights_uri required"
            )
        w = pd.read_csv(io.BytesIO(store.get(weights_uri)), index_col=0).squeeze("columns")
        capital = float(params.get("capital", 5000.0))
        prices: dict[str, float] = params.get("prices") or {}
        # If no live prices, allocate notionally by weight only
        orders = []
        for ticker, weight in w.items():
            target_value = capital * float(weight)
            px = float(prices.get(ticker) or 0.0)
            shares = int(target_value // px) if px > 0 else None
            orders.append(
                {
                    "ticker": str(ticker),
                    "weight": float(weight),
                    "target_value": target_value,
                    "price": px or None,
                    "whole_shares": shares,
                }
            )
        payload = {
            "capital": capital,
            "cash_residual": capital - sum(o["target_value"] for o in orders),
            "orders": orders,
        }
        raw = json.dumps(payload, indent=2).encode()
        uri = store.put("rebalance/plan.json", raw, content_type="application/json")
        return JobResult(
            job_type=JobType.REBALANCE_PLAN,
            status="succeeded",
            output_uris=[uri],
            metrics={"n_orders": len(orders), "uri": uri},
        )
    except Exception as exc:  # noqa: BLE001
        return JobResult(job_type=JobType.REBALANCE_PLAN, status="failed", error=str(exc))
