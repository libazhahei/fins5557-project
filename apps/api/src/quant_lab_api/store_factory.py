from __future__ import annotations

from quant_lab.ports import LocalFsStore, ObjectStore
from quant_lab_api.settings import get_settings


def get_object_store() -> ObjectStore:
    settings = get_settings()
    return LocalFsStore(settings.object_store_root)
