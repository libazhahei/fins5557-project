"""Dispatch JobSpec → module implementation."""

from __future__ import annotations

from quant_lab.jobs import JobResult, JobSpec, JobType
from quant_lab.modules.backtest import run_backtest
from quant_lab.modules.data_fetch import run_data_fetch
from quant_lab.modules.indicators import run_indicators
from quant_lab.modules.montecarlo import run_montecarlo
from quant_lab.modules.portfolio import run_portfolio_optimize
from quant_lab.modules.rebalance import run_rebalance_plan
from quant_lab.modules.report import run_report
from quant_lab.modules.rv_ml import run_rv_ml
from quant_lab.modules.signal_daily import run_signal_daily
from quant_lab.ports import ObjectStore

_HANDLERS = {
    JobType.DATA_FETCH: run_data_fetch,
    JobType.INDICATORS: run_indicators,
    JobType.PORTFOLIO_OPTIMIZE: run_portfolio_optimize,
    JobType.REBALANCE_PLAN: run_rebalance_plan,
    JobType.BACKTEST: run_backtest,
    JobType.MONTE_CARLO: run_montecarlo,
    JobType.SIGNAL_DAILY: run_signal_daily,
    JobType.RV_ML: run_rv_ml,
    JobType.REPORT: run_report,
}


def run_job(spec: JobSpec, store: ObjectStore) -> JobResult:
    handler = _HANDLERS.get(spec.job_type)
    if handler is None:
        return JobResult(
            job_type=spec.job_type,
            status="failed",
            error=f"job type not implemented yet: {spec.job_type}",
        )
    return handler(spec, store)
