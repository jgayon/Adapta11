from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


class UserCreate(BaseModel):
    """Datos de entrada para registrar a un voluntario del grupo de prueba."""

    name: str
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("La contraseña debe tener al menos 8 caracteres.")
        return value


class UserOut(BaseModel):
    """Lo que se devuelve al cliente. Nunca incluye la contraseña."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    email: EmailStr
