from __future__ import annotations

import io
import json

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from quant_lab_api.db import get_db
from quant_lab_api.deps import Actor, get_actor, get_current_user, get_owned_run
from quant_lab_api.models import Run, User
from quant_lab_api.services.pipeline import TEMPLATES, start_template_run
from quant_lab_api.store_factory import get_object_store

router = APIRouter(prefix="/runs", tags=["runs"])


class TemplateRunIn(BaseModel):
    template: str | None = None
    template_id: str | None = None
    symbols: list[str] | None = None
    start_date: str | None = None
    end_date: str | None = None
    cost_bps: float | None = None
    strategy_params: dict | None = None
    use_fixtures: bool = True
    enable_mc: bool = False
    enable_rv_ml: bool = False
    locale: str = "en"


class SubscribeIn(BaseModel):
    subscribed: bool = True


@router.get("/templates")
def list_templates(locale: str = Query("en")) -> dict:
    zh = locale.lower().startswith("zh")
    return {
        "templates": [
            {
                "id": k,
                "name": v["name_zh"] if zh else v["name"],
                "tickers": v["tickers"],
            }
            for k, v in TEMPLATES.items()
        ]
    }


@router.post("/from-template")
def create_from_template(
    body: TemplateRunIn,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_actor),
) -> dict:
    template = body.template_id or body.template
    if not template:
        raise HTTPException(status_code=400, detail="template_id (or template) required")
    try:
        run = start_template_run(
            db,
            user_id=actor.user_id,
            guest_session_id=actor.guest_session_id,
            template=template,
            use_fixtures=body.use_fixtures,
            symbols=body.symbols,
            start_date=body.start_date,
            end_date=body.end_date,
            cost_bps=body.cost_bps,
            strategy_params=body.strategy_params,
            enable_mc=body.enable_mc,
            enable_rv_ml=body.enable_rv_ml,
            locale=body.locale,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _run_out(run)


@router.get("/compare")
def compare_runs(
    ids: str = Query(..., description="Comma-separated run ids"),
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_actor),
) -> dict:
    id_list = [x.strip() for x in ids.split(",") if x.strip()]
    if len(id_list) < 2:
        raise HTTPException(status_code=400, detail="need at least two ids")
    store = get_object_store()
    runs_out = []
    equity_map: dict[str, list[dict]] = {}
    for rid in id_list[:5]:
        run = get_owned_run(db, rid, actor)
        runs_out.append(
            {
                "id": run.id,
                "name": run.name,
                "template": run.template,
                "params": run.params,
                "summary": run.summary,
                "job_spec": run.params,
            }
        )
        equity_map[run.id] = _equity_series(store, run.equity_uri)

    base = runs_out[0]
    param_diff = []
    keys = sorted(
        set(list((base.get("params") or {}).keys()) + list((runs_out[1].get("params") or {}).keys()))
    )
    for key in keys:
        vals = [r.get("params", {}).get(key) for r in runs_out]
        if any(v != vals[0] for v in vals[1:]):
            param_diff.append({"key": key, "values": {r["id"]: r.get("params", {}).get(key) for r in runs_out}})

    kpi_keys = ["total_return", "cagr", "vol", "max_dd", "sharpe", "benchmark_total_return"]
    kpi_diff = []
    for k in kpi_keys:
        row = {"metric": k, "values": {}}
        for r in runs_out:
            summary = r.get("summary") or {}
            row["values"][r["id"]] = summary.get(k)
        kpi_diff.append(row)

    # Align equity on union of timestamps (forward-fill sparse)
    all_times = sorted({pt["time"] for series in equity_map.values() for pt in series})
    aligned = []
    cursors = {rid: {p["time"]: p["value"] for p in series} for rid, series in equity_map.items()}
    last_vals = {rid: None for rid in equity_map}
    for t in all_times:
        point = {"time": t, "values": {}}
        for rid in equity_map:
            if t in cursors[rid]:
                last_vals[rid] = cursors[rid][t]
            point["values"][rid] = last_vals[rid]
        aligned.append(point)

    return {
        "runs": runs_out,
        "param_diff": param_diff,
        "kpi_diff": kpi_diff,
        "equity_aligned": aligned,
    }


@router.get("")
def list_runs(
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_actor),
) -> dict:
    q = db.query(Run)
    if actor.user is not None:
        q = q.filter(Run.user_id == actor.user.id, Run.guest_session_id.is_(None))
    else:
        q = q.filter(Run.guest_session_id == actor.guest_session_id)
    rows = q.order_by(Run.created_at.desc()).limit(50).all()
    return {"runs": [_run_out(r) for r in rows]}


@router.get("/{run_id}")
def get_run(
    run_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_actor),
) -> dict:
    run = get_owned_run(db, run_id, actor)
    return _run_out(run)


@router.get("/{run_id}/overlays")
def get_overlays(
    run_id: str,
    symbol: str | None = Query(None),
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_actor),
) -> dict:
    from quant_lab_api.services.overlays.registry import collect_overlays_for_run

    run = get_owned_run(db, run_id, actor)
    store = get_object_store()
    equity = _equity_series(store, run.equity_uri)
    benchmark_equity = _equity_series(store, run.benchmark_uri)
    markers: list[dict] = []
    if run.markers_uri and store.exists(run.markers_uri):
        try:
            markers = json.loads(store.get(run.markers_uri).decode("utf-8"))
        except Exception:  # noqa: BLE001
            markers = []
    # Pad marker schema fields (legacy)
    normalized = []
    for m in markers:
        normalized.append(
            {
                "time": m.get("time"),
                "symbol": m.get("symbol"),
                "action": m.get("action"),
                "weight_before": m.get("weight_before"),
                "weight_after": m.get("weight_after"),
                "price": m.get("price"),
                "fee_bps": m.get("fee_bps"),
                "reason": m.get("reason"),
            }
        )
    packed = collect_overlays_for_run(run, symbol=symbol)
    return {
        "run_id": run.id,
        "equity": equity,
        "benchmark_equity": benchmark_equity,
        "markers": normalized,
        "trade_logs": packed.get("trade_logs") or [],
        "prediction_overlays": packed.get("prediction_overlays") or [],
        "overlay_sources": packed.get("sources") or [],
        "mc_paths": [],
        "rv_predictions": (run.summary or {}).get("rv_ml") and [(run.summary or {}).get("rv_ml")] or [],
        "summary": run.summary,
        "panel_uri": run.panel_uri,
    }


@router.get("/{run_id}/report")
def get_report(
    run_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_actor),
) -> dict:
    run = get_owned_run(db, run_id, actor)
    store = get_object_store()
    text = ""
    if run.report_uri and store.exists(run.report_uri):
        text = store.get(run.report_uri).decode("utf-8", errors="replace")
    return {
        "run_id": run.id,
        "report": text,
        "summary": run.summary,
        "narrative": (run.summary or {}).get("narrative"),
    }


@router.post("/{run_id}/subscribe")
def subscribe_run(
    run_id: str,
    body: SubscribeIn = SubscribeIn(),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    run = db.get(Run, run_id)
    if not run or run.user_id != user.id:
        raise HTTPException(status_code=404, detail="Run not found")
    run.is_subscribed_daily = body.subscribed
    db.commit()
    return {
        "run_id": run.id,
        "is_subscribed_daily": run.is_subscribed_daily,
        "message": "Subscribed for daily signals (live feed activates in Step 4)"
        if body.subscribed
        else "Unsubscribed",
    }


def _equity_series(store, uri: str | None) -> list[dict]:
    if not uri or not store.exists(uri):
        return []
    eq = pd.read_csv(io.BytesIO(store.get(uri)), parse_dates=["Date"])
    col = "equity" if "equity" in eq.columns else eq.columns[-1]
    return [{"time": int(r.Date.timestamp()), "value": float(getattr(r, col))} for r in eq.itertuples()]


def _run_out(run: Run) -> dict:
    return {
        "id": run.id,
        "name": run.name,
        "template": run.template,
        "status": run.status,
        "params": run.params,
        "summary": run.summary,
        "steps_trace": run.steps_trace or [],
        "panel_uri": run.panel_uri,
        "equity_uri": run.equity_uri,
        "benchmark_uri": run.benchmark_uri,
        "weights_uri": run.weights_uri,
        "report_uri": run.report_uri,
        "is_subscribed_daily": bool(run.is_subscribed_daily),
        "last_target_weights": run.last_target_weights,
        "created_at": run.created_at.isoformat() if run.created_at else None,
    }
