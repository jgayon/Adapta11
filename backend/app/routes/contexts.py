from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.models import Context
from app.schemas import ContextOut

router = APIRouter(prefix="/contexts", tags=["contexts"])


@router.get("/", response_model=list[ContextOut])
def list_contexts(db: Session = Depends(get_db)):
    return db.query(Context).all()


@router.get("/{context_id}", response_model=ContextOut)
def get_context(context_id: str, db: Session = Depends(get_db)):
    context = db.get(Context, context_id)

    if context is None:
        raise HTTPException(status_code=404, detail="Contexto no encontrado")

    return context
