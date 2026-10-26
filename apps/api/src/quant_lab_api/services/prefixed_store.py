from __future__ import annotations

from typing import BinaryIO

from quant_lab.ports import ObjectStore


class PrefixedStore(ObjectStore):
    """Write under a key prefix; read any local:// URI via the inner store."""

    def __init__(self, inner: ObjectStore, prefix: str) -> None:
        self.inner = inner
        self.prefix = prefix.strip("/") + "/"

    def put(self, key: str, data: bytes, *, content_type: str = "application/octet-stream") -> str:
        return self.inner.put(f"{self.prefix}{key.lstrip('/')}", data, content_type=content_type)

    def get(self, uri: str) -> bytes:
        return self.inner.get(uri)

    def open_read(self, uri: str) -> BinaryIO:
        return self.inner.open_read(uri)

    def exists(self, uri: str) -> bool:
        return self.inner.exists(uri)
