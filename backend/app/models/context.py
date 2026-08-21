from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Context(Base):
    __tablename__ = "contexts"

    id: Mapped[str] = mapped_column(
        String,
        primary_key=True
    )

    title: Mapped[str] = mapped_column(
        String,
        nullable=False
    )

    text: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )

    source: Mapped[str | None] = mapped_column(
        String,
        nullable=True
    )

    questions = relationship(
        "Question",
        back_populates="context"
    )