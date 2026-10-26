"""Storage and persistence ports (swap Local ↔ GCS / Cloud SQL later)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import BinaryIO


class ObjectStore(ABC):
    """Artifact blob store. URI scheme: local://path or gs://bucket/key."""

    @abstractmethod
    def put(self, key: str, data: bytes, *, content_type: str = "application/octet-stream") -> str:
        """Write bytes; return stable URI."""

    @abstractmethod
    def get(self, uri: str) -> bytes:
        """Read bytes by URI."""

    @abstractmethod
    def open_read(self, uri: str) -> BinaryIO:
        """Open a readable stream."""

    @abstractmethod
    def exists(self, uri: str) -> bool: ...


class LocalFsStore(ObjectStore):
    def __init__(self, root: Path | str) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        key = key.lstrip("/")
        path = (self.root / key).resolve()
        if not str(path).startswith(str(self.root)):
            raise ValueError(f"path escapes store root: {key}")
        return path

    def put(self, key: str, data: bytes, *, content_type: str = "application/octet-stream") -> str:
        del content_type  # metadata later
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return f"local://{key}"

    def get(self, uri: str) -> bytes:
        return self._path(self._key_from_uri(uri)).read_bytes()

    def open_read(self, uri: str) -> BinaryIO:
        return self._path(self._key_from_uri(uri)).open("rb")

    def exists(self, uri: str) -> bool:
        return self._path(self._key_from_uri(uri)).exists()

    @staticmethod
    def _key_from_uri(uri: str) -> str:
        if uri.startswith("local://"):
            return uri[len("local://") :]
        raise ValueError(f"unsupported URI for LocalFsStore: {uri}")


class GcsStore(ObjectStore):
    """Placeholder — implement when deploying to GCS (Phase 5)."""

    def __init__(self, bucket: str) -> None:
        self.bucket = bucket
        raise NotImplementedError("GcsStore lands in Phase 5; use LocalFsStore locally")

    def put(self, key: str, data: bytes, *, content_type: str = "application/octet-stream") -> str:
        raise NotImplementedError

    def get(self, uri: str) -> bytes:
        raise NotImplementedError

    def open_read(self, uri: str) -> BinaryIO:
        raise NotImplementedError

    def exists(self, uri: str) -> bool:
        raise NotImplementedError
