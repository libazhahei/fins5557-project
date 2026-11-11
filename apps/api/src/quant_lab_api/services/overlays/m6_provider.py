"""Map Monte Carlo summary into a PredictionOverlay band on equity scale (price proxy)."""

from __future__ import annotations

import io
from typing import Any

import pandas as pd

from quant_lab_api.models import Run
from quant_lab_api.store_factory import get_object_store


class M6McProvider:
    name = "m6_mc_provider"

    def collect(self, run: Run, *, symbol: str | None = None) -> dict[str, Any]:
        _ = symbol
        summary = run.summary or {}
        mc = summary.get("mc") or {}
        store = get_object_store()
        # Prefer equity series for timestamps; attach cone near the end
        if not run.equity_uri or not store.exists(run.equity_uri):
            return {"prediction_overlays": []}
        eq = pd.read_csv(io.BytesIO(store.get(run.equity_uri)), parse_dates=["Date"])
        if eq.empty:
            return {"prediction_overlays": []}
        col = "equity" if "equity" in eq.columns else eq.columns[-1]
        last_rows = eq.tail(30)
        last_val = float(last_rows.iloc[-1][col])
        p5 = float(mc.get("terminal_p5") or last_val * 0.9)
        p50 = float(mc.get("terminal_p50") or last_val)
        p95 = float(mc.get("terminal_p95") or last_val * 1.1)
        # Scale terminal percentiles into a short forward band relative to last equity
        scale_lo = p5 / p50 if p50 else 0.9
        scale_hi = p95 / p50 if p50 else 1.1
        band = []
        for _, row in last_rows.iterrows():
            mid = float(row[col])
            band.append(
                {
                    "timestamp": pd.Timestamp(row["Date"]).strftime("%Y-%m-%d"),
                    "mid": mid,
                    "upper_1sigma": mid * (1 + (scale_hi - 1) * 0.5),
                    "lower_1sigma": mid * (1 + (scale_lo - 1) * 0.5),
                    "upper_2sigma": mid * scale_hi,
                    "lower_2sigma": mid * scale_lo,
                }
            )
        # Extend 5 synthetic future days from last close
        last_ts = pd.Timestamp(last_rows.iloc[-1]["Date"])
        for i in range(1, 6):
            mid = last_val * (p50 / last_val) ** (i / 5) if last_val else last_val
            band.append(
                {
                    "timestamp": (last_ts + pd.Timedelta(days=i)).strftime("%Y-%m-%d"),
                    "mid": mid,
                    "upper_1sigma": mid * (1 + (scale_hi - 1) * 0.5),
                    "lower_1sigma": mid * (1 + (scale_lo - 1) * 0.5),
                    "upper_2sigma": mid * scale_hi,
                    "lower_2sigma": mid * scale_lo,
                }
            )
        overlay = {
            "id": "m6_mc_equity_band",
            "name": "Monte Carlo Equity Band (M6)",
            "model_source": "M6_MC",
            "target_pane": "main_price",
            "render_type": "band",
            "style": {"primary_color": "#2563eb", "fill_opacity": 0.12, "line_style": "dashed"},
            "band_series": band,
        }
        return {"prediction_overlays": [overlay]}
