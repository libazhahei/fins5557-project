"""SQLAlchemy engine / session (lazy init so tests can set DATABASE_URL first)."""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from quant_lab_api.settings import get_settings


class Base(DeclarativeBase):
    pass


_engine: Engine | None = None
SessionLocal: sessionmaker[Session] | None = None


def get_engine() -> Engine:
    global _engine, SessionLocal
    if _engine is None:
        settings = get_settings()
        url = settings.database_url
        connect_args = {}
        if url.startswith("sqlite"):
            connect_args["check_same_thread"] = False
        _engine = create_engine(url, future=True, pool_pre_ping=True, connect_args=connect_args)
        if url.startswith("sqlite"):

            @event.listens_for(_engine, "connect")
            def _fk(dbapi_conn, _):  # noqa: ANN001
                dbapi_conn.execute("PRAGMA foreign_keys=ON")

        SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False, future=True)
    return _engine


def reset_engine() -> None:
    global _engine, SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine = None
    SessionLocal = None


def _sqlite_add_missing_columns(eng: Engine) -> None:
    """Best-effort ALTER for Step1 schema additions when create_all is a no-op."""
    from sqlalchemy import inspect, text

    insp = inspect(eng)
    wanted: dict[str, list[tuple[str, str]]] = {
        "runs": [
            ("guest_session_id", "VARCHAR(64)"),
            ("steps_trace", "JSON"),
            ("benchmark_uri", "VARCHAR(512)"),
            ("markers_uri", "VARCHAR(512)"),
            ("is_subscribed_daily", "BOOLEAN DEFAULT 0"),
            ("last_target_weights", "JSON"),
        ],
        "jobs": [
            ("guest_session_id", "VARCHAR(64)"),
        ],
    }
    with eng.begin() as conn:
        for table, cols in wanted.items():
            if table not in insp.get_table_names():
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            for name, ddl in cols:
                if name in existing:
                    continue
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


GUEST_USERNAME = "__guest__"


def ensure_guest_user() -> str:
    """Shared DB user for anonymous runs; scoped by guest_session_id."""
    from quant_lab_api.models import User
    from quant_lab_api.security import hash_password

    get_engine()
    assert SessionLocal is not None
    db = SessionLocal()
    try:
        row = db.query(User).filter(User.username == GUEST_USERNAME).one_or_none()
        if row is None:
            row = User(username=GUEST_USERNAME, password_hash=hash_password("guest-disabled"))
            db.add(row)
            db.commit()
            db.refresh(row)
        return row.id
    finally:
        db.close()


def init_db() -> None:
    from quant_lab_api import models  # noqa: F401

    eng = get_engine()
    Base.metadata.create_all(bind=eng)
    if str(eng.url).startswith("sqlite"):
        _sqlite_add_missing_columns(eng)
    ensure_guest_user()


def get_db() -> Generator[Session, None, None]:
    get_engine()
    assert SessionLocal is not None
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
