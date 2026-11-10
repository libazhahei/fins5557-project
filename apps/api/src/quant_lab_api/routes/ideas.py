from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from quant_lab_api.db import get_db
from quant_lab_api.deps import get_current_user
from quant_lab_api.models import Idea, User

router = APIRouter(prefix="/ideas", tags=["ideas"])


class IdeaIn(BaseModel):
    raw_text: str = Field(min_length=1)
    source_url: str | None = None


@router.post("")
def create_idea(
    body: IdeaIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    row = Idea(
        user_id=user.id,
        raw_text=body.raw_text,
        source_url=body.source_url,
        parsed_dsl_json=None,
        status="draft",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row)


@router.get("")
def list_ideas(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    rows = (
        db.query(Idea)
        .filter(Idea.user_id == user.id)
        .order_by(Idea.created_at.desc())
        .limit(50)
        .all()
    )
    return {"ideas": [_out(r) for r in rows]}


def _out(row: Idea) -> dict:
    return {
        "id": row.id,
        "user_id": row.user_id,
        "raw_text": row.raw_text,
        "source_url": row.source_url,
        "parsed_dsl_json": row.parsed_dsl_json,
        "status": row.status,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "note": "DSL parser unlocks in Step 3; saved as draft only.",
    }
