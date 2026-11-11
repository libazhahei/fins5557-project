"""Step 2 market + overlay contract tests (fixture-backed)."""

from __future__ import annotations

import os

# Ensure sqlite before engine init
os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./var/test_step2.db")

from fastapi.testclient import TestClient

from quant_lab_api.db import init_db, reset_engine
from quant_lab_api.main import app
from quant_lab_api.services.market_data import build_overview, search_tickers
from quant_lab_api.services.overlays.markers_adapter import MarkersAdapter
from quant_lab_api.services.overlays.fixture_provider import FixtureProvider
from quant_lab_api.services.overlays.regime_provider import RegimeProvider
from quant_lab_api.models import Run


def setup_module(_module=None):
    reset_engine()
    init_db()


def _client() -> TestClient:
    return TestClient(app)


def test_search_includes_demo_equities():
    hits = search_tickers("NVDA")
    assert any(h["symbol"] == "NVDA" for h in hits)
    hits2 = search_tickers("AAPL")
    assert any(h["symbol"] == "AAPL" for h in hits2)


def test_overview_schema_aapl():
    ov = build_overview("AAPL")
    assert ov["symbol"] == "AAPL"
    assert "quote" in ov and "last_price" in ov["quote"]
    assert "volatility_metrics" in ov
    assert "hv_20d" in ov["volatility_metrics"]
    assert "fundamentals" in ov
    assert "extra_sections" in ov


def test_market_routes_guest():
    c = _client()
    headers = {"X-Guest-Session": "test-guest-step2"}
    r = c.get("/market/search", params={"q": "MSFT"}, headers=headers)
    assert r.status_code == 200
    assert any(x["symbol"] == "MSFT" for x in r.json()["results"])

    r2 = c.get("/market/tickers/TQQQ/overview", headers=headers)
    assert r2.status_code == 200
    body = r2.json()
    assert body["symbol"] == "TQQQ"
    assert body["quote"]["last_price"] > 0

    r3 = c.get("/market/tickers/GOOG/bars", params={"limit": 50}, headers=headers)
    assert r3.status_code == 200
    assert len(r3.json()["bars"]) > 10
    assert "trade_logs" in r3.json()
    assert "prediction_overlays" in r3.json()

    r4 = c.put(
        "/market/watchlist",
        headers=headers,
        json={"groups": [{"id": "custom", "title": "Custom", "symbols": ["NVDA", "AAPL"]}]},
    )
    assert r4.status_code == 200
    r5 = c.get("/market/watchlist", headers=headers)
    assert r5.status_code == 200
    assert r5.json()["groups"][0]["symbols"] == ["NVDA", "AAPL"]

    r6 = c.put(
        "/market/drawings/NVDA",
        headers=headers,
        json={"overlays": [{"name": "trendLine", "points": [{"timestamp": 1, "value": 1}]}]},
    )
    assert r6.status_code == 200
    r7 = c.get("/market/drawings/NVDA", headers=headers)
    assert r7.status_code == 200
    assert len(r7.json()["overlays"]) == 1


def test_markers_adapter_and_fixture_overlay():
    run = Run(id="dummy", name="t", params={}, summary={})
    logs = MarkersAdapter().collect(run, symbol="SPY")
    assert logs["trade_logs"] == []
    ov = FixtureProvider().collect(run, symbol="SPY")
    assert ov["prediction_overlays"]
    band = ov["prediction_overlays"][0]
    assert band["render_type"] == "band"
    assert band["band_series"]
    assert "upper_1sigma" in band["band_series"][0]


def test_regime_provider_spans():
    run = Run(id="dummy", name="t", params={}, summary={})
    ov = RegimeProvider().collect(run, symbol="SPY")
    preds = ov.get("prediction_overlays") or []
    assert preds, "expected HV regime demo overlay"
    reg = preds[0]
    assert reg["render_type"] == "regime_bg"
    assert reg["target_pane"] == "main_price"
    assert reg["regime_spans"]
    assert "start_time" in reg["regime_spans"][0]


def test_ready_features_step2():
    c = _client()
    r = c.get("/ready")
    assert r.status_code == 200
    body = r.json()
    assert body["features"]["enable_mc"] == "wired"
    assert body["features"]["market_workspace"] == "step2"
    assert "AAPL" in body["data_source"]["fixture_symbols"]


def test_pipeline_overlays_and_compare():
    c = _client()
    headers = {"X-Guest-Session": "test-guest-mc"}
    r1 = c.post(
        "/runs/from-template",
        headers=headers,
        json={
            "template_id": "buy_hold",
            "symbols": ["SPY", "SHY"],
            "use_fixtures": True,
            "enable_mc": True,
            "enable_rv_ml": True,
            "start_date": "2020-01-01",
            "end_date": "2022-12-31",
            "locale": "en",
        },
    )
    assert r1.status_code == 200
    body = r1.json()
    assert body["status"] == "succeeded"
    steps = {s["module_id"]: s["status"] for s in body["steps_trace"]}
    assert steps["M6"] == "completed"
    assert steps["M8"] == "completed"
    assert "mc" in (body.get("summary") or {})

    ov = c.get(f"/runs/{body['id']}/overlays", params={"symbol": "SPY"}, headers=headers)
    assert ov.status_code == 200
    preds = ov.json().get("prediction_overlays") or []
    pred_ids = [p["id"] for p in preds]
    assert "m6_mc_equity_band" in pred_ids
    m6 = next(p for p in preds if p["id"] == "m6_mc_equity_band")
    assert m6["target_pane"] == "equity_chart"
    assert any(x.startswith("m8_") for x in pred_ids)
    assert any(p["target_pane"] == "sub_volatility" for p in preds if p["id"].startswith("m8_"))
    assert any(p.get("render_type") == "regime_bg" for p in preds)

    r2 = c.post(
        "/runs/from-template",
        headers=headers,
        json={
            "template_id": "sixty_forty",
            "symbols": ["SPY", "IEF", "SHY"],
            "use_fixtures": True,
            "start_date": "2020-01-01",
            "end_date": "2022-12-31",
            "locale": "en",
        },
    )
    assert r2.status_code == 200
    cmp = c.get(
        "/runs/compare",
        params={"ids": f"{body['id']},{r2.json()['id']}"},
        headers=headers,
    )
    assert cmp.status_code == 200
    payload = cmp.json()
    assert "param_diff" in payload and "kpi_diff" in payload and "equity_aligned" in payload
    assert len(payload["kpi_diff"]) >= 1
