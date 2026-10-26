from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    db_path = tmp_path / "t.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("OBJECT_STORE_URI", f"local://{tmp_path / 'obj'}")
    monkeypatch.setenv("INVITE_CODE", "quant-lab-invite")
    monkeypatch.setenv("JWT_SECRET", "test-secret")

    from quant_lab_api.db import init_db, reset_engine

    reset_engine()
    init_db()

    from quant_lab_api.main import app

    with TestClient(app) as c:
        yield c
    reset_engine()


def test_register_login_template_run(client: TestClient) -> None:
    reg = client.post(
        "/auth/register",
        json={"username": "alice", "password": "secret12", "invite_code": "quant-lab-invite"},
    )
    assert reg.status_code == 200, reg.text
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    templates = client.get("/runs/templates", headers=headers)
    assert templates.status_code == 200
    assert any(t["id"] == "trend_vt" for t in templates.json()["templates"])

    run = client.post(
        "/runs/from-template",
        headers=headers,
        json={"template": "sixty_forty", "use_fixtures": True},
    )
    assert run.status_code == 200, run.text
    body = run.json()
    assert body["status"] == "succeeded"
    assert body["summary"].get("final_equity")

    bars = client.get("/bars?symbol=SPY&limit=100", headers=headers)
    assert bars.status_code == 200
    assert len(bars.json()["bars"]) > 10

    overlays = client.get(f"/runs/{body['id']}/overlays", headers=headers)
    assert overlays.status_code == 200
    assert len(overlays.json()["equity"]) > 10
