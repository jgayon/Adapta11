from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.models import Question
from app.schemas import QuestionPublic

router = APIRouter(prefix="/questions", tags=["questions"])


@router.get("/", response_model=list[QuestionPublic])
def list_questions(
    competency: str | None = None,
    context_id: str | None = None,
    db: Session = Depends(get_db),
):
    """
    Lista preguntas del banco (sin la respuesta correcta).
    Se puede filtrar por competencia y/o por contexto.
    """
    query = db.query(Question)

    if competency:
        query = query.filter(Question.competency == competency)

    if context_id:
        query = query.filter(Question.context_id == context_id)

    return query.all()


@router.get("/random", response_model=QuestionPublic)
def get_random_question(
    competency: str | None = None,
    db: Session = Depends(get_db),
):
    """
    Devuelve una pregunta al azar del banco.
    Punto de partida temporal mientras se construye el motor de
    selección adaptativa (que reemplazará esta lógica más adelante).
    """
    query = db.query(Question)

    if competency:
        query = query.filter(Question.competency == competency)

    question = query.order_by(func.random()).first()

    if question is None:
        raise HTTPException(
            status_code=404,
            detail="No hay preguntas disponibles con ese filtro",
        )

    return question


@router.get("/{question_id}", response_model=QuestionPublic)
def get_question(question_id: str, db: Session = Depends(get_db)):
    question = db.get(Question, question_id)

    if question is None:
        raise HTTPException(status_code=404, detail="Pregunta no encontrada")

    return question
