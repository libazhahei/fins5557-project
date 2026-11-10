"""M5 — lagged weight backtest with turnover costs (ddguard-inspired)."""

from __future__ import annotations

import io
import json
from typing import Any

import numpy as np
import pandas as pd

from quant_lab.jobs import JobResult, JobSpec, JobType
from quant_lab.ports import ObjectStore


def _panel(store: ObjectStore, uri: str) -> pd.DataFrame:
    return pd.read_csv(io.BytesIO(store.get(uri)), parse_dates=["Date"]).set_index("Date").sort_index()


def run_static_backtest(
    prices: pd.DataFrame,
    weights: dict[str, float],
    cost_bps: float = 5.0,
) -> tuple[pd.Series, pd.Series, pd.DataFrame, list[dict[str, Any]], dict[str, float]]:
    """Buy-and-hold mix with one initial trade cost."""
    cols = [c for c in weights if c in prices.columns]
    w = pd.Series({c: weights[c] for c in cols})
    w = w / w.sum()
    rets = prices[cols].pct_change().fillna(0.0)
    port = (rets * w).sum(axis=1)
    turnover = float(w.abs().sum())
    if len(port):
        port.iloc[0] -= turnover * cost_bps / 1e4
    equity = (1 + port).cumprod()
    stats = _stats(port, equity)
    weights_df = pd.DataFrame([w], index=[prices.index[0] if len(prices) else pd.Timestamp("1970-01-01")])
    # Expand to full index for last weights
    full_w = pd.DataFrame(0.0, index=prices.index, columns=list(w.index))
    for c in w.index:
        full_w[c] = w[c]
    markers: list[dict[str, Any]] = []
    if len(prices):
        t0 = prices.index[0]
        for sym, wt in w.items():
            markers.append(
                {
                    "time": int(pd.Timestamp(t0).timestamp()),
                    "symbol": sym,
                    "action": "BUY" if wt > 0 else "HOLD",
                    "weight_before": 0.0,
                    "weight_after": float(wt),
                    "price": float(prices.at[t0, sym]) if sym in prices.columns else None,
                    "fee_bps": cost_bps,
                    "reason": "initial_allocation",
                }
            )
    return equity, port, full_w, markers, stats


def run_trend_vt_backtest(
    prices: pd.DataFrame,
    *,
    risk_assets: list[str],
    cash: str = "SHY",
    trend_days: int = 200,
    vol_target: float = 0.10,
    vol_lookback: int = 63,
    cost_bps: float = 5.0,
    buffer: float = 0.01,
    max_weight: float = 0.40,
) -> tuple[pd.Series, pd.Series, pd.DataFrame, list[dict[str, Any]], dict[str, float]]:
    """Monthly EW among assets above SMA; SPY regime gate; vol targeting into cash."""
    assets = [a for a in risk_assets if a in prices.columns]
    assert cash in prices.columns
    all_cols = assets + [cash]
    px = prices[all_cols].dropna()
    rets = px.pct_change().fillna(0.0)
    sma = px.rolling(trend_days).mean()
    spy = "SPY" if "SPY" in px.columns else assets[0]
    gap = px[spy] / sma[spy] - 1.0

    month_ends = px.groupby([px.index.year, px.index.month]).apply(lambda x: x.index.max())
    rebalance_days = set(pd.DatetimeIndex(month_ends.values))

    weights = pd.DataFrame(0.0, index=px.index, columns=all_cols)
    risk_on = False
    current = pd.Series(0.0, index=all_cols)
    current[cash] = 1.0
    markers: list[dict[str, Any]] = []
    prev = current.copy()

    for t in px.index:
        g = gap.loc[t]
        if not np.isnan(g):
            if risk_on and g < -buffer:
                risk_on = False
            elif (not risk_on) and g > buffer:
                risk_on = True

        if t in rebalance_days:
            if not risk_on:
                current = pd.Series(0.0, index=all_cols)
                current[cash] = 1.0
            else:
                eligible = [a for a in assets if px.at[t, a] > sma.at[t, a]]
                if not eligible:
                    current = pd.Series(0.0, index=all_cols)
                    current[cash] = 1.0
                else:
                    w = pd.Series(0.0, index=all_cols)
                    ew = min(1.0 / len(eligible), max_weight)
                    for a in eligible:
                        w[a] = ew
                    hist = rets[eligible].loc[:t].iloc[-vol_lookback:]
                    if len(hist) > 10:
                        port_ret = (hist * (w[eligible] / w[eligible].sum())).sum(axis=1)
                        vol = float(port_ret.std(ddof=1) * np.sqrt(252))
                        scale = min(1.0, vol_target / vol) if vol > 0 else 1.0
                    else:
                        scale = 1.0
                    w[eligible] = w[eligible] * scale
                    w[cash] = 1.0 - w[eligible].sum()
                    current = w

            # Emit markers for material weight changes
            ts = int(pd.Timestamp(t).timestamp())
            for sym in all_cols:
                before = float(prev.get(sym, 0.0))
                after = float(current.get(sym, 0.0))
                if abs(after - before) < 1e-4:
                    continue
                action = "BUY" if after > before else "REDUCE" if after < before and after > 0 else "SELL"
                markers.append(
                    {
                        "time": ts,
                        "symbol": sym,
                        "action": action,
                        "weight_before": before,
                        "weight_after": after,
                        "price": float(px.at[t, sym]),
                        "fee_bps": cost_bps,
                        "reason": "monthly_rebalance" if risk_on else "risk_off_cash",
                    }
                )
            prev = current.copy()

        weights.loc[t] = current

    lagged = weights.shift(1).fillna(0.0)
    lagged.iloc[0] = weights.iloc[0]
    gross = (rets * lagged).sum(axis=1)
    turnover = lagged.diff().abs().sum(axis=1).fillna(0.0)
    costs = turnover * cost_bps / 1e4
    net = gross - costs
    equity = (1 + net).cumprod()
    stats = _stats(net, equity)
    stats["avg_turnover"] = float(turnover.mean())
    stats["risk_on_frac"] = float((weights[assets].sum(axis=1) > 0.01).mean())
    return equity, net, weights, markers, stats


def _stats(returns: pd.Series, equity: pd.Series) -> dict[str, float]:
    r = returns.dropna()
    n = len(r)
    if n == 0:
        return {}
    years = n / 252.0
    growth = float(equity.iloc[-1] / equity.iloc[0]) if float(equity.iloc[0]) != 0 else float("nan")
    cagr = float(growth ** (1 / years) - 1) if years > 0 else float("nan")
    vol = float(r.std(ddof=1) * np.sqrt(252))
    sharpe = float(r.mean() / r.std(ddof=1) * np.sqrt(252)) if r.std() > 0 else float("nan")
    mdd = float((equity / equity.cummax() - 1.0).min())
    downside = r[r < 0]
    sortino = (
        float(r.mean() / downside.std(ddof=1) * np.sqrt(252))
        if len(downside) and downside.std(ddof=1) > 0
        else float("nan")
    )
    return {
        "cagr": cagr,
        "vol": vol,
        "sharpe": sharpe,
        "sortino": sortino,
        "max_dd": mdd,
        "final_equity": float(equity.iloc[-1]),
        "years": years,
    }


def _spy_benchmark(prices: pd.DataFrame) -> tuple[pd.Series, dict[str, float]]:
    if "SPY" not in prices.columns:
        empty = pd.Series(dtype=float)
        return empty, {}
    spy = prices[["SPY"]].dropna()
    eq, _, _, _, stats = run_static_backtest(spy, {"SPY": 1.0}, cost_bps=0.0)
    return eq, {
        "benchmark_cagr": stats.get("cagr"),
        "benchmark_max_drawdown": stats.get("max_dd"),
        "benchmark_sharpe": stats.get("sharpe"),
        "benchmark_vol": stats.get("vol"),
    }


def run_backtest(spec: JobSpec, store: ObjectStore) -> JobResult:
    assert spec.job_type == JobType.BACKTEST
    params: dict[str, Any] = spec.params
    panel_uri = params.get("panel_uri") or (spec.input_uris[0] if spec.input_uris else None)
    if not panel_uri:
        return JobResult(job_type=JobType.BACKTEST, status="failed", error="panel_uri required")
    try:
        prices = _panel(store, panel_uri)
        start = params.get("start_date")
        end = params.get("end_date")
        if start:
            prices = prices.loc[pd.Timestamp(start) :]
        if end:
            prices = prices.loc[: pd.Timestamp(end)]

        mode = params.get("mode", "trend_vt")
        cost = float(params.get("cost_bps", 5.0))
        if mode == "static":
            weights = params.get("weights") or {"SPY": 0.6, "IEF": 0.4}
            equity, rets, weights_df, markers, stats = run_static_backtest(
                prices, weights, cost_bps=cost
            )
        else:
            risk_assets = list(params.get("risk_assets") or ["SPY", "QQQ", "IEF", "TLT", "GLD"])
            equity, rets, weights_df, markers, stats = run_trend_vt_backtest(
                prices,
                risk_assets=risk_assets,
                cash=params.get("cash", "SHY"),
                trend_days=int(params.get("trend_days", 200)),
                vol_target=float(params.get("vol_target", 0.10)),
                vol_lookback=int(params.get("vol_lookback", 63)),
                cost_bps=cost,
                buffer=float(params.get("buffer", 0.01)),
                max_weight=float(params.get("max_weight", 0.40)),
            )

        bench_eq, bench_stats = _spy_benchmark(prices)
        stats = {**stats, **bench_stats}
        if "avg_turnover" in stats:
            stats["turnover"] = float(stats["avg_turnover"]) * 252  # rough annualized

        uris: list[str] = []
        buf = io.BytesIO()
        equity.rename("equity").to_csv(buf, index_label="Date")
        eq_uri = store.put("backtest/equity.csv", buf.getvalue(), content_type="text/csv")
        uris.append(eq_uri)

        bench_uri = None
        if len(bench_eq):
            buf = io.BytesIO()
            bench_eq.rename("equity").to_csv(buf, index_label="Date")
            bench_uri = store.put("backtest/benchmark_equity.csv", buf.getvalue(), content_type="text/csv")
            uris.append(bench_uri)

        buf = io.BytesIO()
        rets.rename("returns").to_csv(buf, index_label="Date")
        uris.append(store.put("backtest/returns.csv", buf.getvalue(), content_type="text/csv"))

        weights_uri = None
        if weights_df is not None and len(weights_df):
            buf = io.BytesIO()
            weights_df.to_csv(buf, index_label="Date")
            weights_uri = store.put("backtest/weights.csv", buf.getvalue(), content_type="text/csv")
            uris.append(weights_uri)

        markers_uri = store.put(
            "backtest/markers.json",
            json.dumps(markers).encode("utf-8"),
            content_type="application/json",
        )
        uris.append(markers_uri)

        last_w: dict[str, float] = {}
        if weights_df is not None and len(weights_df):
            last_w = {str(k): float(v) for k, v in weights_df.iloc[-1].items() if float(v) > 1e-6}

        return JobResult(
            job_type=JobType.BACKTEST,
            status="succeeded",
            output_uris=uris,
            metrics={
                **stats,
                "equity_uri": eq_uri,
                "benchmark_uri": bench_uri,
                "weights_uri": weights_uri,
                "markers_uri": markers_uri,
                "last_target_weights": last_w,
                "mode": mode,
            },
        )
    except Exception as exc:  # noqa: BLE001
        return JobResult(job_type=JobType.BACKTEST, status="failed", error=str(exc))
