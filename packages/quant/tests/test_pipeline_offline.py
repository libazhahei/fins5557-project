from pathlib import Path

from quant_lab.jobs import JobSpec, JobType
from quant_lab.ports import LocalFsStore
from quant_lab.runner import run_job

FIXTURES = Path(__file__).parent / "fixtures" / "prices"


def test_offline_fetch_indicators_backtest(tmp_path: Path) -> None:
    store = LocalFsStore(tmp_path)
    fetch = run_job(
        JobSpec(
            job_type=JobType.DATA_FETCH,
            params={
                "source": "csv_dir",
                "csv_dir": str(FIXTURES),
                "tickers": ["SPY", "QQQ", "IEF", "TLT", "GLD", "SHY"],
            },
        ),
        store,
    )
    assert fetch.status == "succeeded", fetch.error
    panel_uri = fetch.metrics["panel_uri"]

    ind = run_job(
        JobSpec(
            job_type=JobType.INDICATORS,
            params={"panel_uri": panel_uri, "trend_days": 200, "regime_confirm": 2},
            input_uris=[panel_uri],
        ),
        store,
    )
    assert ind.status == "succeeded", ind.error
    assert 0.0 <= ind.metrics["risk_on_frac"] <= 1.0

    bt = run_job(
        JobSpec(
            job_type=JobType.BACKTEST,
            params={
                "panel_uri": panel_uri,
                "mode": "trend_vt",
                "vol_target": 0.10,
                "cost_bps": 5.0,
            },
            input_uris=[panel_uri],
        ),
        store,
    )
    assert bt.status == "succeeded", bt.error
    assert bt.metrics["final_equity"] > 0
    assert "max_dd" in bt.metrics

    opt = run_job(
        JobSpec(
            job_type=JobType.PORTFOLIO_OPTIMIZE,
            params={"panel_uri": panel_uri, "method": "ew"},
            input_uris=[panel_uri],
        ),
        store,
    )
    assert opt.status == "succeeded", opt.error

    plan = run_job(
        JobSpec(
            job_type=JobType.REBALANCE_PLAN,
            params={"weights_uri": opt.metrics["uri"], "capital": 5000},
            input_uris=[opt.metrics["uri"]],
        ),
        store,
    )
    assert plan.status == "succeeded", plan.error

    sig = run_job(
        JobSpec(
            job_type=JobType.SIGNAL_DAILY,
            params={"panel_uri": panel_uri, "method": "ew"},
            input_uris=[panel_uri],
        ),
        store,
    )
    assert sig.status == "succeeded", sig.error
    assert "weights" in sig.metrics


def test_static_60_40(tmp_path: Path) -> None:
    store = LocalFsStore(tmp_path)
    fetch = run_job(
        JobSpec(
            job_type=JobType.DATA_FETCH,
            params={"source": "csv_dir", "csv_dir": str(FIXTURES), "tickers": ["SPY", "IEF", "SHY"]},
        ),
        store,
    )
    bt = run_job(
        JobSpec(
            job_type=JobType.BACKTEST,
            params={
                "panel_uri": fetch.metrics["panel_uri"],
                "mode": "static",
                "weights": {"SPY": 0.6, "IEF": 0.4},
            },
        ),
        store,
    )
    assert bt.status == "succeeded", bt.error
    assert bt.metrics["years"] > 1
