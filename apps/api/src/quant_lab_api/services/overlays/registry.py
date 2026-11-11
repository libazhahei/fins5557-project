"""Overlay provider registry and aggregation."""

from __future__ import annotations

from typing import Any

from quant_lab_api.models import Run
from quant_lab_api.services.overlays.fixture_provider import FixtureProvider
from quant_lab_api.services.overlays.m6_provider import M6McProvider
from quant_lab_api.services.overlays.m8_provider import M8RvProvider
from quant_lab_api.services.overlays.markers_adapter import MarkersAdapter
from quant_lab_api.services.overlays.regime_provider import RegimeProvider


class OverlayRegistry:
    def __init__(self) -> None:
        self._providers = [
            MarkersAdapter(),
            M6McProvider(),
            M8RvProvider(),
            RegimeProvider(),
            FixtureProvider(),
        ]

    def collect(self, run: Run, *, symbol: str | None = None) -> dict[str, Any]:
        trade_logs: list[dict] = []
        prediction_overlays: list[dict] = []
        sources: list[str] = []
        for p in self._providers:
            try:
                part = p.collect(run, symbol=symbol) or {}
            except Exception:  # noqa: BLE001
                continue
            if part.get("trade_logs"):
                trade_logs.extend(part["trade_logs"])
                sources.append(p.name)
            if part.get("prediction_overlays"):
                # Prefer real M6/M8; keep fixture only if no model overlays yet
                if p.name == "fixture_provider" and prediction_overlays:
                    continue
                prediction_overlays.extend(part["prediction_overlays"])
                sources.append(p.name)
        return {
            "trade_logs": trade_logs,
            "prediction_overlays": prediction_overlays,
            "sources": sorted(set(sources)),
        }


_REGISTRY = OverlayRegistry()


def collect_overlays_for_run(run: Run, *, symbol: str | None = None) -> dict[str, Any]:
    return _REGISTRY.collect(run, symbol=symbol)
