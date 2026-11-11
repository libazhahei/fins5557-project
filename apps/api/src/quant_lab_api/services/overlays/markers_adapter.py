"""Adapt markers.json into ChartTradeLogMarker[]."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from quant_lab_api.models import Run
from quant_lab_api.store_factory import get_object_store


def _ts_to_date(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str) and len(value) >= 10 and value[4] == "-":
        return value[:10]
    try:
        ts = int(value)
        return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
    except Exception:  # noqa: BLE001
        return str(value)[:10]


class MarkersAdapter:
    name = "markers_adapter"

    def collect(self, run: Run, *, symbol: str | None = None) -> dict[str, Any]:
        store = get_object_store()
        markers: list[dict] = []
        if run.markers_uri and store.exists(run.markers_uri):
            try:
                markers = json.loads(store.get(run.markers_uri).decode("utf-8"))
            except Exception:  # noqa: BLE001
                markers = []

        logs: list[dict[str, Any]] = []
        for i, m in enumerate(markers):
            sym = str(m.get("symbol") or "").upper()
            if symbol and sym and sym != symbol.upper():
                continue
            action = str(m.get("action") or "REBALANCE").upper()
            if action not in {"BUY", "SELL", "REBALANCE", "STOP_LOSS"}:
                # Heuristic from weight delta
                wb = float(m.get("weight_before") or 0)
                wa = float(m.get("weight_after") or 0)
                action = "BUY" if wa > wb else "SELL" if wa < wb else "REBALANCE"
            reason = str(m.get("reason") or "")
            wb = float(m.get("weight_before") or 0)
            wa = float(m.get("weight_after") or 0)
            delta_pct = (wa - wb) * 100
            short = reason[:48] if reason else f"{action} {delta_pct:+.0f}% wt"
            logs.append(
                {
                    "id": f"{run.id}:{i}:{sym}:{m.get('time')}",
                    "timestamp": _ts_to_date(m.get("time")),
                    "symbol": sym or (symbol or ""),
                    "action": action,
                    "price": float(m.get("price") or 0),
                    "shares_delta": m.get("shares_delta"),
                    "weight_before": wb,
                    "weight_after": wa,
                    "reason_short": short,
                    "reason_detail": reason or short,
                }
            )
        return {"trade_logs": logs}
