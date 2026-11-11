"""Demo regime_bg spans from rolling HV terciles (research sketch)."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from quant_lab_api.models import Run
from quant_lab_api.services.market_data import load_bars


class RegimeProvider:
    name = "regime_provider"

    def collect(self, run: Run, *, symbol: str | None = None) -> dict[str, Any]:
        _ = run
        sym = (symbol or "SPY").upper()
        try:
            df = load_bars(sym).df
        except FileNotFoundError:
            return {"prediction_overlays": []}
        close = df["Close"].dropna()
        if len(close) < 40:
            return {"prediction_overlays": []}
        rets = np.log(close / close.shift(1)).dropna()
        hv = rets.rolling(20).std() * np.sqrt(252)
        hv = hv.dropna()
        if hv.empty:
            return {"prediction_overlays": []}
        q33, q66 = hv.quantile([0.33, 0.66]).tolist()
        spans: list[dict[str, Any]] = []
        start = hv.index[0]
        prev = "mid"
        for idx, val in hv.items():
            if val <= q33:
                cur = "low_vol"
            elif val >= q66:
                cur = "high_vol"
            else:
                cur = "mid"
            if cur != prev:
                if prev != "mid":
                    spans.append(
                        {
                            "start_time": pd.Timestamp(start).strftime("%Y-%m-%d"),
                            "end_time": pd.Timestamp(idx).strftime("%Y-%m-%d"),
                            "regime_type": prev,
                            "label": "Low HV" if prev == "low_vol" else "High HV",
                        }
                    )
                start = idx
                prev = cur
        if prev != "mid" and len(spans) < 12:
            spans.append(
                {
                    "start_time": pd.Timestamp(start).strftime("%Y-%m-%d"),
                    "end_time": pd.Timestamp(hv.index[-1]).strftime("%Y-%m-%d"),
                    "regime_type": prev,
                    "label": "Low HV" if prev == "low_vol" else "High HV",
                }
            )
        # Keep last few spans for readability
        spans = spans[-6:]
        if not spans:
            return {"prediction_overlays": []}
        overlay = {
            "id": "fixture_hv_regime",
            "name": "HV Regime (demo)",
            "model_source": "REGIME_HV",
            "target_pane": "main_price",
            "render_type": "regime_bg",
            "style": {"fill_opacity": 0.08},
            "regime_spans": spans,
        }
        return {"prediction_overlays": [overlay]}
