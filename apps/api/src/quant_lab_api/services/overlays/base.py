from __future__ import annotations

from typing import Any, Protocol

from quant_lab_api.models import Run


class OverlayProvider(Protocol):
    """Pluggable source of trade logs and/or prediction overlays."""

    name: str

    def collect(self, run: Run, *, symbol: str | None = None) -> dict[str, Any]:
        """Return keys: trade_logs?, prediction_overlays?"""
        ...
