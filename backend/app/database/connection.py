import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


def test_connection():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))

    return True


def get_db():
    """Dependency de FastAPI: entrega una sesion por request y la cierra al final."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
