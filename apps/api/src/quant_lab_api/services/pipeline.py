"""Template pipelines for MVP runs."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from quant_lab.jobs import JobType
from quant_lab_api.models import Run
from quant_lab_api.services.jobs import create_job

# apps/api/src/quant_lab_api/services/pipeline.py → repo root is parents[5]
FIXTURE_DIR = Path(__file__).resolve().parents[5] / "packages/quant/tests/fixtures/prices"

TEMPLATES = {
    "buy_hold": {
        "name": "买入持有基准",
        "tickers": ["SPY", "SHY"],
        "backtest": {"mode": "static", "weights": {"SPY": 1.0}},
    },
    "sixty_forty": {
        "name": "经典 60/40",
        "tickers": ["SPY", "IEF", "SHY"],
        "backtest": {"mode": "static", "weights": {"SPY": 0.6, "IEF": 0.4}},
    },
    "trend_vt": {
        "name": "趋势 + 波动目标",
        "tickers": ["SPY", "QQQ", "IEF", "TLT", "GLD", "SHY"],
        "backtest": {
            "mode": "trend_vt",
            "vol_target": 0.10,
            "cost_bps": 5.0,
            "risk_assets": ["SPY", "QQQ", "IEF", "TLT", "GLD"],
            "cash": "SHY",
        },
    },
}


def start_template_run(
    db: Session,
    *,
    user_id: str,
    template: str,
    use_fixtures: bool = True,
    execute_now: bool = True,
) -> Run:
    if template not in TEMPLATES:
        raise ValueError(f"unknown template: {template}")
    cfg = TEMPLATES[template]
    run = Run(
        user_id=user_id,
        name=cfg["name"],
        template=template,
        status="running",
        params=cfg,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    fetch_params: dict = {"tickers": cfg["tickers"]}
    if use_fixtures and FIXTURE_DIR.exists():
        fetch_params.update({"source": "csv_dir", "csv_dir": str(FIXTURE_DIR)})
    else:
        fetch_params.update({"source": "yfinance", "start": "2018-01-01"})

    fetch_job = create_job(
        db,
        user_id=user_id,
        job_type=JobType.DATA_FETCH.value,
        params=fetch_params,
        run_id=run.id,
        execute_now=execute_now,
    )
    if fetch_job.status != "succeeded":
        run.status = "failed"
        run.summary = {"error": fetch_job.error}
        db.commit()
        return run

    panel_uri = fetch_job.metrics.get("panel_uri")
    run.panel_uri = panel_uri
    db.commit()

    bt_params = {**cfg["backtest"], "panel_uri": panel_uri}
    bt_job = create_job(
        db,
        user_id=user_id,
        job_type=JobType.BACKTEST.value,
        params=bt_params,
        input_uris=[panel_uri] if panel_uri else [],
        run_id=run.id,
        execute_now=execute_now,
    )
    if bt_job.status != "succeeded":
        run.status = "failed"
        run.summary = {"error": bt_job.error}
        db.commit()
        return run

    create_job(
        db,
        user_id=user_id,
        job_type=JobType.REPORT.value,
        params={"panel_uri": panel_uri, "metrics": bt_job.metrics, "template": template},
        input_uris=bt_job.output_uris or [],
        run_id=run.id,
        execute_now=execute_now,
    )
    db.refresh(run)
    return run
