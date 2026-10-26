from pathlib import Path

from quant_lab.ports import LocalFsStore


def test_local_fs_roundtrip(tmp_path: Path) -> None:
    store = LocalFsStore(tmp_path)
    uri = store.put("runs/demo/out.json", b'{"ok": true}', content_type="application/json")
    assert uri == "local://runs/demo/out.json"
    assert store.exists(uri)
    assert store.get(uri) == b'{"ok": true}'


def test_modules_registry() -> None:
    from quant_lab.jobs import MODULE_IDS, JobType

    assert MODULE_IDS["M1"] == JobType.DATA_FETCH
    assert MODULE_IDS["M5"] == JobType.BACKTEST
    assert len(MODULE_IDS) == 9
