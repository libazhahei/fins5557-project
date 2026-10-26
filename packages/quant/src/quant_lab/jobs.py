"""Job type registry and shared I/O contract for pipeline steps."""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class JobType(StrEnum):
    DATA_FETCH = "data.fetch"
    INDICATORS = "indicators.compute"
    PORTFOLIO_OPTIMIZE = "portfolio.optimize"
    REBALANCE_PLAN = "rebalance.plan"
    BACKTEST = "backtest.run"
    MONTE_CARLO = "montecarlo.run"
    SIGNAL_DAILY = "signal.daily"
    RV_ML = "rv.ml"
    REPORT = "report.build"


class JobSpec(BaseModel):
    """One pipeline step: inputs + params → outputs + metrics."""

    job_type: JobType
    params: dict[str, Any] = Field(default_factory=dict)
    input_uris: list[str] = Field(default_factory=list)
    idempotency_key: str | None = None


class JobResult(BaseModel):
    job_type: JobType
    status: str  # succeeded | failed
    output_uris: list[str] = Field(default_factory=list)
    metrics: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None


# Module id ↔ job type (PRD / refactor G1)
MODULE_IDS: dict[str, JobType] = {
    "M1": JobType.DATA_FETCH,
    "M2": JobType.INDICATORS,
    "M3": JobType.PORTFOLIO_OPTIMIZE,
    "M4": JobType.REBALANCE_PLAN,
    "M5": JobType.BACKTEST,
    "M6": JobType.MONTE_CARLO,
    "M7": JobType.SIGNAL_DAILY,
    "M8": JobType.RV_ML,
    "M9": JobType.REPORT,
}
