from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from quant_lab_api.db import get_db
from quant_lab_api.deps import get_current_user
from quant_lab_api.models import Run, User

router = APIRouter(prefix="/signals", tags=["signals"])


@router.get("/daily")
def daily_signals(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    rows = (
        db.query(Run)
        .filter(Run.user_id == user.id, Run.is_subscribed_daily.is_(True))
        .order_by(Run.created_at.desc())
        .limit(50)
        .all()
    )
    return {
        "signals": [
            {
                "run_id": r.id,
                "name": r.name,
                "template": r.template,
                "last_target_weights": r.last_target_weights or {},
                "status": "placeholder",
                "note": "Live EOD feed will refresh rebalance instructions at 16:30 after Step 4.",
            }
            for r in rows
        ],
        "note": "Step 4 placeholder — subscribed strategies only.",
    }
