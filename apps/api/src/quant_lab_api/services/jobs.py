"""Create / execute / event jobs."""

from __future__ import annotations

from sqlalchemy.orm import Session

from quant_lab.jobs import JobSpec, JobType
from quant_lab.runner import run_job
from quant_lab_api.models import Job, JobEvent, Run
from quant_lab_api.settings import get_settings
from quant_lab_api.store_factory import get_object_store


def append_event(db: Session, job: Job, kind: str, message: str = "", payload: dict | None = None) -> JobEvent:
    ev = JobEvent(job_id=job.id, kind=kind, message=message, payload=payload or {})
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


def create_job(
    db: Session,
    *,
    user_id: str,
    job_type: str,
    params: dict,
    input_uris: list[str] | None = None,
    run_id: str | None = None,
    execute_now: bool | None = None,
) -> Job:
    settings = get_settings()
    if execute_now is None:
        execute_now = settings.job_sync_default
    job = Job(
        user_id=user_id,
        job_type=job_type,
        status="queued",
        params=params or {},
        input_uris=input_uris or [],
        run_id=run_id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    append_event(db, job, "queued", "Job queued")
    if execute_now:
        execute_job(db, job.id)
        db.refresh(job)
    return job


def execute_job(db: Session, job_id: str) -> Job:
    job = db.get(Job, job_id)
    if job is None:
        raise ValueError("job not found")
    job.status = "running"
    db.commit()
    append_event(db, job, "running", f"Executing {job.job_type}")

    try:
        spec = JobSpec(
            job_type=JobType(job.job_type),
            params=job.params or {},
            input_uris=job.input_uris or [],
        )
    except ValueError:
        job.status = "failed"
        job.error = f"unknown job type: {job.job_type}"
        db.commit()
        append_event(db, job, "failed", job.error)
        return job

    nested_params = dict(spec.params)
    spec = JobSpec(job_type=spec.job_type, params=nested_params, input_uris=spec.input_uris)

    from quant_lab_api.services.prefixed_store import PrefixedStore

    job_store = PrefixedStore(get_object_store(), f"jobs/{job.id}")
    result = run_job(spec, job_store)

    job.status = result.status
    job.output_uris = result.output_uris
    job.metrics = result.metrics
    job.error = result.error
    db.commit()
    append_event(
        db,
        job,
        result.status,
        result.error or "done",
        {"metrics": result.metrics, "output_uris": result.output_uris},
    )

    if job.run_id and result.status == "succeeded":
        run = db.get(Run, job.run_id)
        if run is not None:
            if job.job_type == JobType.DATA_FETCH.value:
                run.panel_uri = result.metrics.get("panel_uri")
            if job.job_type == JobType.BACKTEST.value:
                run.equity_uri = result.metrics.get("equity_uri")
                run.summary = {**run.summary, **{k: v for k, v in result.metrics.items() if k != "equity_uri"}}
                run.status = "succeeded"
            if job.job_type == JobType.REPORT.value:
                run.report_uri = (result.output_uris or [None])[0]
            db.commit()
    return job


def claim_next_queued(db: Session) -> Job | None:
    try:
        job = (
            db.query(Job)
            .filter(Job.status == "queued")
            .order_by(Job.created_at.asc())
            .with_for_update(skip_locked=True)
            .first()
        )
    except Exception:
        db.rollback()
        job = None
    if job is None:
        job = db.query(Job).filter(Job.status == "queued").order_by(Job.created_at.asc()).first()
    return job
