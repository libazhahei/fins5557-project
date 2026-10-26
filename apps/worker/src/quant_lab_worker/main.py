"""Worker — poll queued jobs or execute a single job id (Cloud Run Jobs style)."""

from __future__ import annotations

import argparse
import json
import time

from quant_lab_worker import __version__


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="quant-lab-worker")
    parser.add_argument("--health", action="store_true")
    parser.add_argument("--job-id", type=str, default=None)
    parser.add_argument("--once", action="store_true", help="Process one queued job then exit")
    parser.add_argument("--loop", action="store_true", help="Poll queue forever")
    parser.add_argument("--poll-seconds", type=float, default=2.0)
    args = parser.parse_args(argv)

    if args.health and not args.job_id and not args.once and not args.loop:
        print(json.dumps({"status": "ok", "service": "worker", "version": __version__}))
        return 0

    # Lazy import so --health stays light
    from quant_lab_api.db import SessionLocal, get_engine, init_db
    from quant_lab_api.services.jobs import claim_next_queued, execute_job

    init_db()
    get_engine()
    assert SessionLocal is not None

    if args.job_id:
        with SessionLocal() as db:
            job = execute_job(db, args.job_id)
            print(json.dumps({"id": job.id, "status": job.status, "error": job.error}))
            return 0 if job.status == "succeeded" else 1

    def process_one() -> bool:
        with SessionLocal() as db:
            job = claim_next_queued(db)
            if job is None:
                return False
            job.status = "running"
            db.commit()
            execute_job(db, job.id)
            return True

    if args.once:
        ok = process_one()
        print(json.dumps({"processed": ok}))
        return 0

    if args.loop:
        print(json.dumps({"status": "looping", "poll": args.poll_seconds}))
        while True:
            if not process_one():
                time.sleep(args.poll_seconds)
        return 0

    print(json.dumps({"status": "ok", "service": "worker", "version": __version__}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
