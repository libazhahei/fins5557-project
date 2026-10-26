"""M6 — block-bootstrap Monte Carlo stress on strategy returns."""

from __future__ import annotations

import io
from typing import Any

import numpy as np
import pandas as pd

from quant_lab.jobs import JobResult, JobSpec, JobType
from quant_lab.ports import ObjectStore


def block_bootstrap_paths(
    returns: np.ndarray,
    n_paths: int = 100,
    block: int = 21,
    seed: int = 42,
) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = len(returns)
    if n < block + 2:
        block = max(1, n // 4)
    paths = np.zeros((n_paths, n))
    for i in range(n_paths):
        out = []
        while len(out) < n:
            start = int(rng.integers(0, max(1, n - block)))
            out.extend(returns[start : start + block].tolist())
        paths[i] = np.array(out[:n])
    return paths


def run_montecarlo(spec: JobSpec, store: ObjectStore) -> JobResult:
    assert spec.job_type == JobType.MONTE_CARLO
    params: dict[str, Any] = spec.params
    returns_uri = params.get("returns_uri")
    if not returns_uri and spec.input_uris:
        # prefer returns.csv among inputs
        for u in spec.input_uris:
            if "returns" in u:
                returns_uri = u
                break
        returns_uri = returns_uri or spec.input_uris[0]
    if not returns_uri:
        return JobResult(job_type=JobType.MONTE_CARLO, status="failed", error="returns_uri required")
    try:
        df = pd.read_csv(io.BytesIO(store.get(returns_uri)), parse_dates=["Date"]).set_index("Date")
        col = "returns" if "returns" in df.columns else df.columns[0]
        rets = df[col].dropna().to_numpy(dtype=float)
        n_paths = int(params.get("n_paths", 100))
        block = int(params.get("block", 21))
        paths = block_bootstrap_paths(rets, n_paths=n_paths, block=block)
        equity = np.cumprod(1.0 + paths, axis=1)
        terminal = equity[:, -1]
        max_dd = []
        for i in range(n_paths):
            eq = equity[i]
            max_dd.append(float((eq / np.maximum.accumulate(eq) - 1.0).min()))
        summary = {
            "n_paths": n_paths,
            "terminal_p5": float(np.percentile(terminal, 5)),
            "terminal_p50": float(np.percentile(terminal, 50)),
            "terminal_p95": float(np.percentile(terminal, 95)),
            "max_dd_p5": float(np.percentile(max_dd, 5)),
            "max_dd_p50": float(np.percentile(max_dd, 50)),
            "prob_terminal_below_1": float(np.mean(terminal < 1.0)),
        }
        out = pd.DataFrame({"terminal": terminal, "max_dd": max_dd})
        buf = io.BytesIO()
        out.to_csv(buf, index=False)
        uri = store.put("montecarlo/summary.csv", buf.getvalue(), content_type="text/csv")
        return JobResult(
            job_type=JobType.MONTE_CARLO,
            status="succeeded",
            output_uris=[uri],
            metrics={**summary, "uri": uri},
        )
    except Exception as exc:  # noqa: BLE001
        return JobResult(job_type=JobType.MONTE_CARLO, status="failed", error=str(exc))
