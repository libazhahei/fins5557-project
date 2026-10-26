"""M5 — lagged weight backtest with turnover costs (ddguard-inspired)."""

from __future__ import annotations

import io
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
) -> tuple[pd.Series, pd.Series, dict[str, float]]:
    """Buy-and-hold mix with one initial trade cost."""
    cols = [c for c in weights if c in prices.columns]
    w = pd.Series({c: weights[c] for c in cols})
    w = w / w.sum()
    rets = prices[cols].pct_change().fillna(0.0)
    port = (rets * w).sum(axis=1)
    # charge cost on day 1
    turnover = float(w.abs().sum())
    if len(port):
        port.iloc[0] -= turnover * cost_bps / 1e4
    equity = (1 + port).cumprod()
    stats = _stats(port, equity)
    return equity, port, stats


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
) -> tuple[pd.Series, pd.Series, pd.DataFrame, dict[str, float]]:
    """Monthly EW among assets above SMA; SPY regime gate; vol targeting into cash."""
    assets = [a for a in risk_assets if a in prices.columns]
    assert cash in prices.columns
    all_cols = assets + [cash]
    px = prices[all_cols].dropna()
    rets = px.pct_change().fillna(0.0)
    sma = px.rolling(trend_days).mean()
    spy = "SPY" if "SPY" in px.columns else assets[0]
    gap = px[spy] / sma[spy] - 1.0

    # month-end rebalance dates
    month_ends = px.groupby([px.index.year, px.index.month]).apply(lambda x: x.index.max())
    rebalance_days = set(pd.DatetimeIndex(month_ends.values))

    weights = pd.DataFrame(0.0, index=px.index, columns=all_cols)
    risk_on = False
    current = pd.Series(0.0, index=all_cols)
    current[cash] = 1.0

    for t in px.index:
        # regime with 1-day buffer confirm simplified
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
                    # vol target on risk sleeve
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
        weights.loc[t] = current

    # lag weights by 1 day (signal at close t earns t+1)
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
    return equity, net, weights, stats


def _stats(returns: pd.Series, equity: pd.Series) -> dict[str, float]:
    r = returns.dropna()
    n = len(r)
    if n == 0:
        return {}
    years = n / 252.0
    growth = float(equity.iloc[-1] / equity.iloc[0])
    cagr = float(growth ** (1 / years) - 1) if years > 0 else float("nan")
    vol = float(r.std(ddof=1) * np.sqrt(252))
    sharpe = float(r.mean() / r.std(ddof=1) * np.sqrt(252)) if r.std() > 0 else float("nan")
    mdd = float((equity / equity.cummax() - 1.0).min())
    return {
        "cagr": cagr,
        "vol": vol,
        "sharpe": sharpe,
        "max_dd": mdd,
        "final_equity": float(equity.iloc[-1]),
        "years": years,
    }


def run_backtest(spec: JobSpec, store: ObjectStore) -> JobResult:
    assert spec.job_type == JobType.BACKTEST
    params: dict[str, Any] = spec.params
    panel_uri = params.get("panel_uri") or (spec.input_uris[0] if spec.input_uris else None)
    if not panel_uri:
        return JobResult(job_type=JobType.BACKTEST, status="failed", error="panel_uri required")
    try:
        prices = _panel(store, panel_uri)
        mode = params.get("mode", "trend_vt")
        cost = float(params.get("cost_bps", 5.0))
        if mode == "static":
            weights = params.get("weights") or {"SPY": 0.6, "IEF": 0.4}
            equity, rets, stats = run_static_backtest(prices, weights, cost_bps=cost)
            weights_df = None
        else:
            risk_assets = list(params.get("risk_assets") or ["SPY", "QQQ", "IEF", "TLT", "GLD"])
            equity, rets, weights_df, stats = run_trend_vt_backtest(
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

        uris: list[str] = []
        buf = io.BytesIO()
        equity.rename("equity").to_csv(buf, index_label="Date")
        eq_uri = store.put("backtest/equity.csv", buf.getvalue(), content_type="text/csv")
        uris.append(eq_uri)
        buf = io.BytesIO()
        rets.rename("returns").to_csv(buf, index_label="Date")
        uris.append(store.put("backtest/returns.csv", buf.getvalue(), content_type="text/csv"))
        if weights_df is not None:
            buf = io.BytesIO()
            weights_df.to_csv(buf, index_label="Date")
            uris.append(store.put("backtest/weights.csv", buf.getvalue(), content_type="text/csv"))

        return JobResult(
            job_type=JobType.BACKTEST,
            status="succeeded",
            output_uris=uris,
            metrics={**stats, "equity_uri": eq_uri, "mode": mode},
        )
    except Exception as exc:  # noqa: BLE001
        return JobResult(job_type=JobType.BACKTEST, status="failed", error=str(exc))
