"""Repo path helpers that work from editable src and installed site-packages."""

from __future__ import annotations

import os
from pathlib import Path


def fixture_prices_dir() -> Path:
    env = os.environ.get("QUANT_LAB_FIXTURE_DIR")
    if env:
        return Path(env)

    # Walk up from this file and from CWD looking for monorepo fixtures
    candidates = [Path(__file__).resolve(), Path.cwd().resolve()]
    for start in candidates:
        for parent in [start, *start.parents]:
            hit = parent / "packages" / "quant" / "tests" / "fixtures" / "prices"
            if hit.is_dir() and any(hit.glob("*.csv")):
                return hit

    # Last resort: relative to cwd
    return Path.cwd() / "packages" / "quant" / "tests" / "fixtures" / "prices"
