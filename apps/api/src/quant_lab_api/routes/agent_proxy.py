"""Proxy agent HTTP + SSE so the browser only talks to api."""

from __future__ import annotations

import json

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from quant_lab_api.db import get_db
from quant_lab_api.deps import get_current_user
from quant_lab_api.models import AgentSession, User
from quant_lab_api.settings import get_settings

router = APIRouter(prefix="/agent", tags=["agent"])


class SessionCreate(BaseModel):
    provider: str | None = None
    model: str | None = None


class MessageIn(BaseModel):
    message: str = Field(min_length=1)
    provider: str | None = None
    model: str | None = None


@router.post("/sessions")
async def create_session(
    body: SessionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    settings = get_settings()
    provider = body.provider or settings.llm_default_provider
    model = body.model or settings.llm_primary_model
    row = AgentSession(user_id=user.id, provider=provider, model=model)
    db.add(row)
    db.commit()
    db.refresh(row)

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            res = await client.post(
                f"{settings.agent_base_url}/sessions",
                headers={"X-Service-Secret": settings.service_shared_secret},
                json={"session_id": row.id, "provider": provider, "model": model, "user_id": user.id},
            )
            res.raise_for_status()
            data = res.json()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"agent unavailable: {exc}") from exc

    row.pi_session_id = data.get("pi_session_id") or data.get("id")
    db.commit()
    return {"id": row.id, "provider": provider, "model": model, "pi_session_id": row.pi_session_id}


@router.post("/sessions/{session_id}/messages")
async def post_message(
    session_id: str,
    body: MessageIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    settings = get_settings()
    row = db.get(AgentSession, session_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    auth = request.headers.get("authorization") or ""
    user_token = auth.removeprefix("Bearer ").strip()

    async with httpx.AsyncClient(timeout=None) as client:
        try:
            res = await client.post(
                f"{settings.agent_base_url}/sessions/{session_id}/messages",
                headers={"X-Service-Secret": settings.service_shared_secret},
                json={
                    "message": body.message,
                    "provider": body.provider or row.provider,
                    "model": body.model or row.model,
                    "user_token": user_token,
                },
            )
            if res.status_code >= 400:
                raise HTTPException(status_code=res.status_code, detail=res.text)
            return res.json()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"agent error: {exc}") from exc


@router.get("/sessions/{session_id}/events")
async def session_events(
    session_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    settings = get_settings()
    row = db.get(AgentSession, session_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    async def gen():
        async with httpx.AsyncClient(timeout=None) as client:
            try:
                async with client.stream(
                    "GET",
                    f"{settings.agent_base_url}/sessions/{session_id}/events",
                    headers={"X-Service-Secret": settings.service_shared_secret},
                ) as res:
                    async for line in res.aiter_lines():
                        if await request.is_disconnected():
                            break
                        yield line + "\n"
            except httpx.HTTPError as exc:
                yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")
