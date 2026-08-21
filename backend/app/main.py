from fastapi import FastAPI
from app.database.connection import test_connection
from app.routes import api_router

app = FastAPI(
    title="ADAPTA-11 API",
    version="1.0.0"
)

app.include_router(api_router)


@app.get("/")
def root():
    return {
        "message": "ADAPTA-11 API funcionando"
    }


@app.get("/health/database")
def database_health():
    try:
        test_connection()

        return {
            "status": "ok",
            "database": "conectada"
        }

    except Exception as error:
        return {
            "status": "error",
            "database": "no conectada",
            "detail": str(error)
        }