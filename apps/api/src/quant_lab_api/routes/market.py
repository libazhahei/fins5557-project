"""Market search, overview, bars, watchlist, drawings."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from quant_lab_api.db import get_db
from quant_lab_api.deps import Actor, get_actor
from quant_lab_api.models import Drawing, Run, Watchlist
from quant_lab_api.services import market_data
from quant_lab_api.services.overlays.registry import collect_overlays_for_run

router = APIRouter(prefix="/market", tags=["market"])


class WatchlistIn(BaseModel):
    groups: list[dict[str, Any]] = Field(default_factory=list)


class DrawingsIn(BaseModel):
    overlays: list[dict[str, Any]] = Field(default_factory=list)


def _watchlist_query(db: Session, actor: Actor):
    q = db.query(Watchlist)
    if actor.user is not None:
        return q.filter(Watchlist.user_id == actor.user.id, Watchlist.guest_session_id.is_(None))
    return q.filter(Watchlist.guest_session_id == actor.guest_session_id)


def _drawing_query(db: Session, actor: Actor, symbol: str):
    q = db.query(Drawing).filter(Drawing.symbol == symbol.upper())
    if actor.user is not None:
        return q.filter(Drawing.user_id == actor.user.id, Drawing.guest_session_id.is_(None))
    return q.filter(Drawing.guest_session_id == actor.guest_session_id)


@router.get("/search")
def search(
    q: str = Query(..., min_length=1),
    _: Actor = Depends(get_actor),
) -> dict:
    return {"results": market_data.search_tickers(q)}


@router.get("/tickers/{symbol}/overview")
def ticker_overview(
    symbol: str,
    prefer_live: bool = Query(False),
    _: Actor = Depends(get_actor),
) -> dict:
    try:
        return market_data.build_overview(symbol, prefer_live=prefer_live)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/tickers/{symbol}/bars")
def ticker_bars(
    symbol: str,
    interval: str = Query("1d"),
    start: str | None = None,
    end: str | None = None,
    limit: int = Query(800, ge=50, le=5000),
    run_id: str | None = None,
    include_predictions: bool = Query(True),
    prefer_live: bool = Query(False),
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_actor),
) -> dict:
    _ = interval  # Step 2.1 daily only
    try:
        result = market_data.load_bars(symbol, prefer_live=prefer_live, start=start, end=end)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    trade_logs: list[dict] = []
    prediction_overlays: list[dict] = []
    if run_id and include_predictions:
        run = db.get(Run, run_id)
        if run is not None:
            # Ownership soft-check: guest/user isolation
            owned = False
            if actor.user is not None and run.user_id == actor.user.id and run.guest_session_id is None:
                owned = True
            if actor.guest_session_id and run.guest_session_id == actor.guest_session_id:
                owned = True
            if owned:
                packed = collect_overlays_for_run(run, symbol=symbol.upper())
                trade_logs = packed.get("trade_logs") or []
                prediction_overlays = packed.get("prediction_overlays") or []

    return {
        "symbol": symbol.upper(),
        "interval": interval,
        "data_source": result.data_source,
        "bars": market_data.bars_to_payload(result.df, limit=limit),
        "trade_logs": trade_logs,
        "prediction_overlays": prediction_overlays,
    }


@router.get("/watchlist")
def get_watchlist(
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_actor),
) -> dict:
    row = _watchlist_query(db, actor).one_or_none()
    groups = row.groups if row and row.groups else market_data.default_watchlist_groups()
    return {"groups": groups}


@router.put("/watchlist")
def put_watchlist(
    body: WatchlistIn,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_actor),
) -> dict:
    row = _watchlist_query(db, actor).one_or_none()
    if row is None:
        row = Watchlist(
            user_id=actor.user_id if actor.user else None,
            guest_session_id=None if actor.user else actor.guest_session_id,
            groups=body.groups,
        )
        db.add(row)
    else:
        row.groups = body.groups
    db.commit()
    db.refresh(row)
    return {"groups": row.groups}


@router.get("/drawings/{symbol}")
def get_drawings(
    symbol: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_actor),
) -> dict:
    row = _drawing_query(db, actor, symbol).one_or_none()
    return {"symbol": symbol.upper(), "overlays": (row.overlays if row else []) or []}


@router.put("/drawings/{symbol}")
def put_drawings(
    symbol: str,
    body: DrawingsIn,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_actor),
) -> dict:
    sym = symbol.upper()
    row = _drawing_query(db, actor, sym).one_or_none()
    if row is None:
        row = Drawing(
            user_id=actor.user_id if actor.user else None,
            guest_session_id=None if actor.user else actor.guest_session_id,
            symbol=sym,
            overlays=body.overlays,
        )
        db.add(row)
    else:
        row.overlays = body.overlays
    db.commit()
    db.refresh(row)
    return {"symbol": sym, "overlays": row.overlays}
