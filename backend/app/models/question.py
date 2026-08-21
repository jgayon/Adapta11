from sqlalchemy import ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(
        String,
        primary_key=True
    )

    context_id: Mapped[str] = mapped_column(
        ForeignKey("contexts.id"),
        nullable=False
    )

    question: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )

    options: Mapped[dict] = mapped_column(
        JSON,
        nullable=False
    )

    answer: Mapped[str] = mapped_column(
        String(1),
        nullable=False
    )

    competency: Mapped[str] = mapped_column(
        String,
        nullable=False
    )

    affirmation: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )

    context = relationship(
        "Context",
        back_populates="questions"
    )

    attempts = relationship(
        "Attempt",
        back_populates="question"
    )