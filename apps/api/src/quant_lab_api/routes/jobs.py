from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from quant_lab_api.db import SessionLocal, get_db, get_engine
from quant_lab_api.deps import get_current_user, require_service
from quant_lab_api.models import Job, JobEvent, User
from quant_lab_api.services.jobs import create_job, execute_job

router = APIRouter(prefix="/jobs", tags=["jobs"])


class JobCreate(BaseModel):
    job_type: str
    params: dict = Field(default_factory=dict)
    input_uris: list[str] = Field(default_factory=list)
    run_id: str | None = None
    execute_now: bool | None = None


def _job_out(job: Job) -> dict:
    return {
        "id": job.id,
        "job_type": job.job_type,
        "status": job.status,
        "params": job.params,
        "input_uris": job.input_uris,
        "output_uris": job.output_uris,
        "metrics": job.metrics,
        "error": job.error,
        "run_id": job.run_id,
        "created_at": job.created_at.isoformat() if job.created_at else None,
    }


@router.post("")
def post_job(
    body: JobCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    job = create_job(
        db,
        user_id=user.id,
        job_type=body.job_type,
        params=body.params,
        input_uris=body.input_uris,
        run_id=body.run_id,
        execute_now=body.execute_now,
    )
    return _job_out(job)


@router.get("/{job_id}")
def get_job(
    job_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    job = db.get(Job, job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_out(job)


@router.post("/{job_id}/execute")
def post_execute(
    job_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_service),
) -> dict:
    try:
        job = execute_job(db, job_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _job_out(job)


@router.get("/{job_id}/events")
async def job_events_sse(
    job_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = db.get(Job, job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(status_code=404, detail="Job not found")

    async def gen():
        get_engine()
        assert SessionLocal is not None
        last_id = 0
        while True:
            with SessionLocal() as s:
                rows = (
                    s.query(JobEvent)
                    .filter(JobEvent.job_id == job_id, JobEvent.id > last_id)
                    .order_by(JobEvent.id.asc())
                    .all()
                )
                j = s.get(Job, job_id)
                for ev in rows:
                    last_id = ev.id
                    data = {
                        "id": ev.id,
                        "kind": ev.kind,
                        "message": ev.message,
                        "payload": ev.payload,
                        "created_at": ev.created_at.isoformat() if ev.created_at else None,
                    }
                    yield f"event: job\ndata: {json.dumps(data)}\n\n"
                if j and j.status in {"succeeded", "failed"}:
                    yield f"event: done\ndata: {json.dumps({'status': j.status})}\n\n"
                    break
            await asyncio.sleep(0.5)

    return StreamingResponse(gen(), media_type="text/event-stream")
