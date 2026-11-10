"""Template pipelines for MVP runs."""

from __future__ import annotations

import time
from typing import Any

from sqlalchemy.orm import Session

from quant_lab.jobs import JobType
from quant_lab_api.db import ensure_guest_user
from quant_lab_api.models import Run
from quant_lab_api.paths import fixture_prices_dir
from quant_lab_api.services.jobs import create_job

FIXTURE_SYMBOLS = frozenset({"SPY", "QQQ", "IEF", "TLT", "GLD", "SHY"})


def _fixture_dir():
    return fixture_prices_dir()


# Back-compat alias for imports (resolved lazily via property-like call sites)
FIXTURE_DIR = fixture_prices_dir()

TEMPLATES = {
    "buy_hold": {
        "name": "Buy & Hold",
        "name_zh": "买入持有基准",
        "tickers": ["SPY", "SHY"],
        "backtest": {"mode": "static", "weights": {"SPY": 1.0}},
    },
    "sixty_forty": {
        "name": "Classic 60/40",
        "name_zh": "经典 60/40",
        "tickers": ["SPY", "IEF", "SHY"],
        "backtest": {"mode": "static", "weights": {"SPY": 0.6, "IEF": 0.4}},
    },
    "trend_vt": {
        "name": "Trend + Vol Target",
        "name_zh": "趋势 + 波动目标",
        "tickers": ["SPY", "QQQ", "IEF", "TLT", "GLD", "SHY"],
        "backtest": {
            "mode": "trend_vt",
            "vol_target": 0.10,
            "cost_bps": 5.0,
            "trend_days": 200,
            "risk_assets": ["SPY", "QQQ", "IEF", "TLT", "GLD"],
            "cash": "SHY",
        },
    },
}


def validate_fixture_symbols(symbols: list[str]) -> None:
    bad = [s for s in symbols if s.upper() not in FIXTURE_SYMBOLS]
    if bad:
        raise ValueError(
            f"symbols not in fixture universe: {', '.join(bad)}. "
            f"Allowed: {', '.join(sorted(FIXTURE_SYMBOLS))}"
        )


def _trace_step(
    module_id: str,
    name: str,
    status: str,
    duration_ms: int,
    io_summary: str = "",
) -> dict[str, Any]:
    return {
        "module_id": module_id,
        "name": name,
        "status": status,
        "duration_ms": duration_ms,
        "io_summary": io_summary,
    }


def start_template_run(
    db: Session,
    *,
    user_id: str | None = None,
    guest_session_id: str | None = None,
    template: str,
    use_fixtures: bool = True,
    execute_now: bool = True,
    symbols: list[str] | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    cost_bps: float | None = None,
    strategy_params: dict[str, Any] | None = None,
    enable_mc: bool = False,
    enable_rv_ml: bool = False,
    locale: str = "en",
) -> Run:
    if template not in TEMPLATES:
        raise ValueError(f"unknown template: {template}")
    if not user_id and not guest_session_id:
        raise ValueError("user_id or guest_session_id required")

    # SQLite legacy NOT NULL user_id: anonymous runs attach to system guest user
    effective_user_id = user_id or ensure_guest_user()
    effective_guest = None if user_id else guest_session_id

    cfg = TEMPLATES[template]
    tickers = [s.upper() for s in (symbols or list(cfg["tickers"]))]
    if use_fixtures:
        validate_fixture_symbols(tickers)

    bt = {**cfg["backtest"]}
    if cost_bps is not None:
        bt["cost_bps"] = float(cost_bps)
    if strategy_params:
        for key in (
            "vol_target",
            "trend_days",
            "vol_lookback",
            "buffer",
            "max_weight",
            "cash",
            "weights",
            "risk_assets",
            "mode",
            "rebalance",
        ):
            if key in strategy_params:
                bt[key] = strategy_params[key]

    # If symbols override risk sleeve for trend_vt
    if bt.get("mode") == "trend_vt" and symbols:
        cash = bt.get("cash", "SHY")
        risk = [t for t in tickers if t != cash]
        if risk:
            bt["risk_assets"] = risk
        if cash not in tickers:
            tickers = [*tickers, cash]

    locale_norm = "zh-CN" if locale.lower().startswith("zh") else "en"
    run_name = cfg["name_zh"] if locale_norm == "zh-CN" else cfg["name"]

    params: dict[str, Any] = {
        "template": template,
        "tickers": tickers,
        "start_date": start_date or "2018-01-01",
        "end_date": end_date or "2025-12-31",
        "cost_bps": bt.get("cost_bps", 10.0),
        "backtest": bt,
        "use_fixtures": use_fixtures,
        "enable_mc": enable_mc,
        "enable_rv_ml": enable_rv_ml,
        "locale": locale_norm,
        "benchmark": "SPY",
    }

    run = Run(
        user_id=effective_user_id,
        guest_session_id=effective_guest,
        name=run_name,
        template=template,
        status="running",
        params=params,
        steps_trace=[],
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    steps: list[dict[str, Any]] = []

    fetch_params: dict = {
        "tickers": tickers,
        "start": params["start_date"],
        "end": params["end_date"],
    }
    fix = _fixture_dir()
    if use_fixtures and fix.exists():
        fetch_params.update({"source": "csv_dir", "csv_dir": str(fix)})
    else:
        fetch_params.update({"source": "yfinance", "start": params["start_date"]})

    t0 = time.perf_counter()
    fetch_job = create_job(
        db,
        user_id=effective_user_id,
        guest_session_id=effective_guest,
        job_type=JobType.DATA_FETCH.value,
        params=fetch_params,
        run_id=run.id,
        execute_now=execute_now,
    )
    steps.append(
        _trace_step(
            "M1",
            "data.fetch",
            "completed" if fetch_job.status == "succeeded" else "failed",
            int((time.perf_counter() - t0) * 1000),
            f"{','.join(tickers)} ({params['start_date']}–{params['end_date']})",
        )
    )
    if fetch_job.status != "succeeded":
        run.status = "failed"
        run.summary = {"error": fetch_job.error}
        run.steps_trace = steps
        db.commit()
        return run

    panel_uri = fetch_job.metrics.get("panel_uri")
    run.panel_uri = panel_uri
    db.commit()

    # Placeholder capsules for unused modules in the path
    steps.append(_trace_step("M2", "indicators.compute", "skipped", 0, "bundled in M5"))
    steps.append(_trace_step("M3", "portfolio.optimize", "skipped", 0, "template weights"))
    steps.append(_trace_step("M4", "rebalance.plan", "skipped", 0, "bundled in M5"))

    bt_params = {
        **bt,
        "panel_uri": panel_uri,
        "start_date": params["start_date"],
        "end_date": params["end_date"],
        "benchmark": "SPY",
    }
    t1 = time.perf_counter()
    bt_job = create_job(
        db,
        user_id=effective_user_id,
        guest_session_id=effective_guest,
        job_type=JobType.BACKTEST.value,
        params=bt_params,
        input_uris=[panel_uri] if panel_uri else [],
        run_id=run.id,
        execute_now=execute_now,
    )
    steps.append(
        _trace_step(
            "M5",
            "backtest.run",
            "completed" if bt_job.status == "succeeded" else "failed",
            int((time.perf_counter() - t1) * 1000),
            f"mode={bt.get('mode')} cost={bt.get('cost_bps')}bps",
        )
    )
    if bt_job.status != "succeeded":
        run.status = "failed"
        run.summary = {"error": bt_job.error}
        run.steps_trace = steps
        db.commit()
        return run

    # Refresh run after M5 side-effects
    db.refresh(run)

    if enable_mc:
        steps.append(
            _trace_step("M6", "montecarlo.run", "not_implemented_in_step1", 0, "enable_mc=true")
        )
    else:
        steps.append(_trace_step("M6", "montecarlo.run", "placeholder", 0, "disabled"))

    steps.append(_trace_step("M7", "signal.daily", "placeholder", 0, "Step4"))

    if enable_rv_ml:
        steps.append(
            _trace_step("M8", "rv.ml", "not_implemented_in_step1", 0, "enable_rv_ml=true")
        )
    else:
        steps.append(_trace_step("M8", "rv.ml", "placeholder", 0, "disabled"))

    t2 = time.perf_counter()
    report_job = create_job(
        db,
        user_id=effective_user_id,
        guest_session_id=effective_guest,
        job_type=JobType.REPORT.value,
        params={
            "panel_uri": panel_uri,
            "metrics": bt_job.metrics,
            "template": template,
            "locale": locale_norm,
            "params": params,
        },
        input_uris=bt_job.output_uris or [],
        run_id=run.id,
        execute_now=execute_now,
    )
    steps.append(
        _trace_step(
            "M9",
            "report.build",
            "completed" if report_job.status == "succeeded" else "failed",
            int((time.perf_counter() - t2) * 1000),
            f"locale={locale_norm}",
        )
    )

    db.refresh(run)
    # Merge narrative from report metrics into summary
    if report_job.status == "succeeded" and report_job.metrics.get("narrative"):
        run.summary = {**run.summary, "narrative": report_job.metrics["narrative"]}
    run.steps_trace = steps
    if run.status != "failed":
        run.status = "succeeded"
    db.commit()
    db.refresh(run)
    return run
