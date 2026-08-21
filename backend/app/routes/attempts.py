from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.models import Attempt, Question, User
from app.schemas import AttemptCreate, AttemptOut

router = APIRouter(prefix="/attempts", tags=["attempts"])


@router.post("/", response_model=AttemptOut, status_code=201)
def create_attempt(payload: AttemptCreate, db: Session = Depends(get_db)):
    user = db.get(User, payload.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    question = db.get(Question, payload.question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Pregunta no encontrada")

    is_correct = payload.answer.strip().upper() == question.answer.strip().upper()

    attempt = Attempt(
        user_id=payload.user_id,
        question_id=payload.question_id,
        answer=payload.answer.strip().upper(),
        is_correct=is_correct,
        response_time_ms=payload.response_time_ms,
    )

    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    return attempt


@router.get("/user/{user_id}", response_model=list[AttemptOut])
def list_user_attempts(user_id: str, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    return (
        db.query(Attempt)
        .filter(Attempt.user_id == user_id)
        .order_by(Attempt.created_at.desc())
        .all()
    )


@router.get("/question/{question_id}/stats")
def get_question_stats(question_id: str, db: Session = Depends(get_db)):
    """
    Métricas crudas de una pregunta a partir de los intentos registrados:
    total de intentos, índice de facilidad (% de aciertos) y tiempo
    promedio de respuesta. Esta es la materia prima que el pipeline de
    validación heurística usará más adelante para aceptar o descartar
    preguntas generadas.
    """
    question = db.get(Question, question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Pregunta no encontrada")

    total = db.query(func.count(Attempt.id)).filter(
        Attempt.question_id == question_id
    ).scalar()

    if total == 0:
        return {
            "question_id": question_id,
            "total_attempts": 0,
            "ease_index": None,
            "avg_response_time_ms": None,
        }

    correct = db.query(func.count(Attempt.id)).filter(
        Attempt.question_id == question_id,
        Attempt.is_correct.is_(True),
    ).scalar()

    avg_time = db.query(func.avg(Attempt.response_time_ms)).filter(
        Attempt.question_id == question_id,
        Attempt.response_time_ms.is_not(None),
    ).scalar()

    return {
        "question_id": question_id,
        "total_attempts": total,
        "ease_index": round(correct / total, 4),
        "avg_response_time_ms": round(avg_time, 2) if avg_time is not None else None,
    }
