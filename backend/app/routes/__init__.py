from fastapi import APIRouter

from app.routes.contexts import router as contexts_router
from app.routes.questions import router as questions_router
from app.routes.users import router as users_router
from app.routes.attempts import router as attempts_router

api_router = APIRouter()
api_router.include_router(contexts_router)
api_router.include_router(questions_router)
api_router.include_router(users_router)
api_router.include_router(attempts_router)
