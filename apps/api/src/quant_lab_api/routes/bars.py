from __future__ import annotations

import io
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query

from quant_lab_api.deps import get_current_user
from quant_lab_api.models import User
from quant_lab_api.store_factory import get_object_store

router = APIRouter(prefix="/bars", tags=["bars"])

FIXTURE_DIR = Path(__file__).resolve().parents[5] / "packages/quant/tests/fixtures/prices"


@router.get("")
def get_bars(
    symbol: str = Query(..., min_length=1),
    panel_uri: str | None = None,
    limit: int = Query(800, ge=50, le=5000),
    _: User = Depends(get_current_user),
) -> dict:
    symbol = symbol.upper()
    store = get_object_store()
    df: pd.DataFrame | None = None

    if panel_uri and store.exists(panel_uri):
        panel = pd.read_csv(io.BytesIO(store.get(panel_uri)), parse_dates=["Date"]).set_index("Date")
        if symbol in panel.columns:
            # synthetic OHLC from adj close for charting
            close = panel[symbol].dropna()
            df = pd.DataFrame(
                {
                    "Open": close,
                    "High": close * 1.002,
                    "Low": close * 0.998,
                    "Close": close,
                    "Volume": 0,
                },
                index=close.index,
            )

    if df is None:
        # try per-ticker artifact under any job is hard; fall back to fixtures
        path = FIXTURE_DIR / f"{symbol}.csv"
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"No bars for {symbol}")
        raw = pd.read_csv(path, parse_dates=["Date"]).set_index("Date").sort_index()
        close_col = "AdjClose" if "AdjClose" in raw.columns else "Close"
        df = pd.DataFrame(
            {
                "Open": raw.get("Open", raw[close_col]),
                "High": raw.get("High", raw[close_col]),
                "Low": raw.get("Low", raw[close_col]),
                "Close": raw[close_col],
                "Volume": raw.get("Volume", 0),
            },
            index=raw.index,
        )

    df = df.dropna().iloc[-limit:]
    candles = [
        {
            "time": int(idx.timestamp()),
            "open": float(row.Open),
            "high": float(row.High),
            "low": float(row.Low),
            "close": float(row.Close),
        }
        for idx, row in df.iterrows()
    ]
    return {"symbol": symbol, "bars": candles}
