"""Deterministic prediction overlays for offline / CI demos."""

from __future__ import annotations

from typing import Any

import pandas as pd

from quant_lab_api.models import Run
from quant_lab_api.services.market_data import load_bars


class FixtureProvider:
    name = "fixture_provider"

    def collect(self, run: Run, *, symbol: str | None = None) -> dict[str, Any]:
        _ = run
        sym = (symbol or "SPY").upper()
        try:
            df = load_bars(sym).df
        except FileNotFoundError:
            return {"prediction_overlays": []}
        close = df["Close"].dropna().tail(40)
        if close.empty:
            return {"prediction_overlays": []}
        last = float(close.iloc[-1])
        band = []
        for idx, val in close.items():
            v = float(val)
            band.append(
                {
                    "timestamp": pd.Timestamp(idx).strftime("%Y-%m-%d"),
                    "mid": v,
                    "upper_1sigma": v * 1.02,
                    "lower_1sigma": v * 0.98,
                    "upper_2sigma": v * 1.04,
                    "lower_2sigma": v * 0.96,
                }
            )
        last_ts = pd.Timestamp(close.index[-1])
        for i in range(1, 6):
            mid = last * (1.0 + 0.001 * i)
            band.append(
                {
                    "timestamp": (last_ts + pd.Timedelta(days=i)).strftime("%Y-%m-%d"),
                    "mid": mid,
                    "upper_1sigma": mid * 1.02,
                    "lower_1sigma": mid * 0.98,
                    "upper_2sigma": mid * 1.05,
                    "lower_2sigma": mid * 0.95,
                }
            )
        overlay = {
            "id": "fixture_price_band_5d",
            "name": "Fixture Price Band (5D)",
            "model_source": "FIXTURE",
            "target_pane": "main_price",
            "render_type": "band",
            "style": {"primary_color": "#2563eb", "fill_opacity": 0.1, "line_style": "dashed"},
            "band_series": band,
        }
        return {"prediction_overlays": [overlay]}
