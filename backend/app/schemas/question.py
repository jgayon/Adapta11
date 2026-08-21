from pydantic import BaseModel, ConfigDict


class QuestionPublic(BaseModel):
    """
    Lo que ve el estudiante al resolver una pregunta.
    Deliberadamente NO incluye 'answer' para no filtrar la respuesta correcta
    al front-end.
    """

    model_config = ConfigDict(from_attributes=True)

    id: str
    context_id: str
    question: str
    options: dict[str, str]
    competency: str
    affirmation: str
