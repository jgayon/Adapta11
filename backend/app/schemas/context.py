from pydantic import BaseModel, ConfigDict


class ContextOut(BaseModel):
    """Representación pública de un contexto (texto base de una o más preguntas)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    text: str
    source: str | None = None
