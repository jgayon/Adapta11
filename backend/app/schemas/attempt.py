from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AttemptCreate(BaseModel):
    """
    Datos que envía el cliente al registrar la respuesta de un estudiante
    a una pregunta. response_time_ms es opcional para no romper clientes
    que todavía no lo midan, pero es clave para el pipeline de validación
    (índice de facilidad + tiempo relativo al promedio), así que conviene
    empezar a enviarlo desde ya.
    """

    user_id: str
    question_id: str
    answer: str = Field(min_length=1, max_length=1)
    response_time_ms: int | None = Field(default=None, ge=0)


class AttemptOut(BaseModel):
    """Resultado de un intento, ya evaluado contra la respuesta correcta."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    question_id: str
    answer: str
    is_correct: bool
    response_time_ms: int | None
    created_at: datetime
