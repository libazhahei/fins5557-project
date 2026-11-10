"""FastAPI dependencies."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from quant_lab_api.db import get_db
from quant_lab_api.models import Run, User
from quant_lab_api.security import decode_token
from quant_lab_api.settings import get_settings

bearer = HTTPBearer(auto_error=False)


@dataclass
class Actor:
    """Authenticated user and/or anonymous guest session."""

    user: User | None = None
    guest_session_id: str | None = None

    @property
    def user_id(self) -> str | None:
        return self.user.id if self.user else None

    @property
    def is_authenticated(self) -> bool:
        return self.user is not None


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(creds.credentials)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db.get(User, payload["sub"])
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def get_optional_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User | None:
    if creds is None:
        return None
    payload = decode_token(creds.credentials)
    if not payload or "sub" not in payload:
        return None
    return db.get(User, payload["sub"])


def get_actor(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
    x_guest_session: str | None = Header(default=None, alias="X-Guest-Session"),
) -> Actor:
    user = None
    if creds is not None:
        payload = decode_token(creds.credentials)
        if payload and "sub" in payload:
            user = db.get(User, payload["sub"])
    guest = (x_guest_session or "").strip() or None
    if user is None and not guest:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Provide Bearer token or X-Guest-Session",
        )
    return Actor(user=user, guest_session_id=None if user else guest)


def require_service(x_service_secret: str | None = Header(default=None)) -> None:
    settings = get_settings()
    if not x_service_secret or x_service_secret != settings.service_shared_secret:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid service secret")


def run_visible_to(run: Run, actor: Actor) -> bool:
    if actor.user is not None and run.user_id == actor.user.id and not run.guest_session_id:
        return True
    if actor.user is not None and run.user_id == actor.user.id:
        return True
    if (
        actor.user is None
        and actor.guest_session_id
        and run.guest_session_id == actor.guest_session_id
    ):
        return True
    return False


def get_owned_run(db: Session, run_id: str, actor: Actor) -> Run:
    run = db.get(Run, run_id)
    if not run or not run_visible_to(run, actor):
        raise HTTPException(status_code=404, detail="Run not found")
    return run
