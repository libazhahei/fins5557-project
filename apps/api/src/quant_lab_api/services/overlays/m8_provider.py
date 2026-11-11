"""Map RV/ML features into volatility PredictionOverlay lines / bands."""

from __future__ import annotations

import io
import json
from typing import Any

import pandas as pd

from quant_lab_api.models import Run
from quant_lab_api.store_factory import get_object_store


class M8RvProvider:
    name = "m8_rv_provider"

    def collect(self, run: Run, *, symbol: str | None = None) -> dict[str, Any]:
        summary = run.summary or {}
        rv = summary.get("rv_ml") or {}
        store = get_object_store()
        feat_uri = rv.get("features_uri")
        if not feat_uri or not store.exists(feat_uri):
            return {"prediction_overlays": []}

        feat = pd.read_csv(io.BytesIO(store.get(feat_uri)), parse_dates=["Date"]).set_index("Date")
        if feat.empty or "rv5" not in feat.columns:
            return {"prediction_overlays": []}

        # Optional filter: RV is usually for a primary symbol stored in metrics
        target_sym = str(rv.get("symbol") or "").upper()
        if symbol and target_sym and target_sym != symbol.upper():
            # Still show on matching symbol only
            return {"prediction_overlays": []}

        tail = feat.tail(60)
        line = [
            {
                "timestamp": idx.strftime("%Y-%m-%d"),
                "value": float(row["rv5"]),
                "label": "RV5",
            }
            for idx, row in tail.iterrows()
            if pd.notna(row["rv5"])
        ]
        band = []
        for idx, row in tail.iterrows():
            if pd.isna(row.get("rv5")):
                continue
            mid = float(row["rv5"])
            rv21 = float(row["rv21"]) if "rv21" in row and pd.notna(row["rv21"]) else mid
            band.append(
                {
                    "timestamp": idx.strftime("%Y-%m-%d"),
                    "mid": mid,
                    "upper_1sigma": max(mid, rv21) * 1.05,
                    "lower_1sigma": min(mid, rv21) * 0.95,
                    "upper_2sigma": max(mid, rv21) * 1.15,
                    "lower_2sigma": min(mid, rv21) * 0.85,
                }
            )
        # Extend forward cone 5 days using last mid
        if band:
            last = band[-1]
            last_ts = pd.Timestamp(last["timestamp"])
            for i in range(1, 6):
                band.append(
                    {
                        "timestamp": (last_ts + pd.Timedelta(days=i)).strftime("%Y-%m-%d"),
                        "mid": last["mid"],
                        "upper_1sigma": last["upper_1sigma"],
                        "lower_1sigma": last["lower_1sigma"],
                        "upper_2sigma": last.get("upper_2sigma"),
                        "lower_2sigma": last.get("lower_2sigma"),
                    }
                )

        overlays = [
            {
                "id": "m8_rv_cone_5d",
                "name": "AI RV Cone (M8)",
                "model_source": "M8_RV_ML",
                "target_pane": "sub_volatility",
                "render_type": "band",
                "style": {"primary_color": "#2563eb", "fill_opacity": 0.15, "line_style": "solid"},
                "band_series": band,
            },
            {
                "id": "m8_rv5_line",
                "name": "RV 5D (M8)",
                "model_source": "M8_RV_ML",
                "target_pane": "sub_volatility",
                "render_type": "line",
                "style": {"primary_color": "#2563eb", "line_style": "solid"},
                "line_series": line,
            },
        ]
        # Attach accuracy note as regime span optional noop
        _ = json.dumps(rv)
        return {"prediction_overlays": overlays}
