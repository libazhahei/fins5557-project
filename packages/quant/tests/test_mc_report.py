from pathlib import Path

from quant_lab.jobs import JobSpec, JobType
from quant_lab.ports import LocalFsStore
from quant_lab.runner import run_job

FIXTURES = Path(__file__).parent / "fixtures" / "prices"


def test_mc_and_report(tmp_path: Path) -> None:
    store = LocalFsStore(tmp_path)
    fetch = run_job(
        JobSpec(
            job_type=JobType.DATA_FETCH,
            params={"source": "csv_dir", "csv_dir": str(FIXTURES), "tickers": ["SPY", "IEF", "SHY"]},
        ),
        store,
    )
    assert fetch.status == "succeeded"
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
    assert bt.status == "succeeded"
    returns_uri = next(u for u in bt.output_uris if "returns" in u)
    mc = run_job(
        JobSpec(
            job_type=JobType.MONTE_CARLO,
            params={"returns_uri": returns_uri, "n_paths": 40, "block": 10},
            input_uris=[returns_uri],
        ),
        store,
    )
    assert mc.status == "succeeded", mc.error
    assert "terminal_p50" in mc.metrics

    rep = run_job(
        JobSpec(
            job_type=JobType.REPORT,
            params={"metrics": bt.metrics, "template": "sixty_forty"},
        ),
        store,
    )
    assert rep.status == "succeeded"
    assert store.get(rep.output_uris[0]).startswith(b"#")
