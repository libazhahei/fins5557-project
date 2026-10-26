from __future__ import annotations

import io

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from quant_lab_api.db import get_db
from quant_lab_api.deps import get_current_user
from quant_lab_api.models import Run, User
from quant_lab_api.services.pipeline import TEMPLATES, start_template_run
from quant_lab_api.store_factory import get_object_store

router = APIRouter(prefix="/runs", tags=["runs"])


class TemplateRunIn(BaseModel):
    template: str
    use_fixtures: bool = True


@router.get("/templates")
def list_templates() -> dict:
    return {
        "templates": [
            {"id": k, "name": v["name"], "tickers": v["tickers"]} for k, v in TEMPLATES.items()
        ]
    }


@router.post("/from-template")
def create_from_template(
    body: TemplateRunIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    try:
        run = start_template_run(
            db, user_id=user.id, template=body.template, use_fixtures=body.use_fixtures
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _run_out(run)


@router.get("")
def list_runs(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    rows = db.query(Run).filter(Run.user_id == user.id).order_by(Run.created_at.desc()).limit(50).all()
    return {"runs": [_run_out(r) for r in rows]}


@router.get("/{run_id}")
def get_run(
    run_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    run = db.get(Run, run_id)
    if not run or run.user_id != user.id:
        raise HTTPException(status_code=404, detail="Run not found")
    return _run_out(run)


@router.get("/{run_id}/overlays")
def get_overlays(
    run_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    run = db.get(Run, run_id)
    if not run or run.user_id != user.id:
        raise HTTPException(status_code=404, detail="Run not found")
    store = get_object_store()
    equity = []
    markers = []
    if run.equity_uri and store.exists(run.equity_uri):
        eq = pd.read_csv(io.BytesIO(store.get(run.equity_uri)), parse_dates=["Date"])
        equity = [
            {"time": int(r.Date.timestamp()), "value": float(r.equity)}
            for r in eq.itertuples()
        ]
    # Weight changes as rebalance markers if weights artifact exists
    weights_uri = None
    for u in [] if not run.summary else []:
        pass
    # Find weights from related job outputs via summary
    if run.summary.get("mode") == "trend_vt":
        # try common path pattern from last backtest job folder — scan summary
        pass
    return {
        "run_id": run.id,
        "equity": equity,
        "markers": markers,
        "summary": run.summary,
        "panel_uri": run.panel_uri,
    }


@router.get("/{run_id}/report")
def get_report(
    run_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    run = db.get(Run, run_id)
    if not run or run.user_id != user.id:
        raise HTTPException(status_code=404, detail="Run not found")
    store = get_object_store()
    text = ""
    if run.report_uri and store.exists(run.report_uri):
        text = store.get(run.report_uri).decode("utf-8", errors="replace")
    return {"run_id": run.id, "report": text, "summary": run.summary}


def _run_out(run: Run) -> dict:
    return {
        "id": run.id,
        "name": run.name,
        "template": run.template,
        "status": run.status,
        "params": run.params,
        "summary": run.summary,
        "panel_uri": run.panel_uri,
        "equity_uri": run.equity_uri,
        "report_uri": run.report_uri,
        "created_at": run.created_at.isoformat() if run.created_at else None,
    }
