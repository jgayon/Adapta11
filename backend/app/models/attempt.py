import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Attempt(Base):
    __tablename__ = "attempts"

    id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id"),
        nullable=False
    )

    question_id: Mapped[str] = mapped_column(
        ForeignKey("questions.id"),
        nullable=False
    )

    answer: Mapped[str] = mapped_column(
        String(1),
        nullable=False
    )

    is_correct: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False
    )

    # Tiempo que tardó el estudiante en responder, en milisegundos.
    # Es la métrica que alimentará el pipeline de validación heurística
    # (tiempo de respuesta relativo al promedio) y el ajuste de dificultad.
    response_time_ms: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )

    user = relationship(
        "User",
        back_populates="attempts"
    )

    question = relationship(
        "Question",
        back_populates="attempts"
    )