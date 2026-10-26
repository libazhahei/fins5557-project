from fastapi.testclient import TestClient

from quant_lab_api.main import app


def test_health_models() -> None:
    client = TestClient(app)
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "api"
    assert body["models"]["primary"] == "gemini-3.8-flash"
    assert body["models"]["lite"] == "gemini-3.1-flash-lite"
    assert "context_compact" in body["models"]["lite_roles"]
    assert body["models"]["deepseek_model"] == "deepseek-chat"

