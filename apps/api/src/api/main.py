from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.auth import AuthenticatedUser, get_current_user
from api.config import Settings, get_settings
from api.runtime import router as runtime_router
from api.workflows import router as workflow_router


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Workflow Engine API",
        summary="Foundation service for the async workflow engine.",
        version="0.1.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            settings.web_app_url,
            "http://127.0.0.1:3000",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(workflow_router)
    app.include_router(runtime_router)

    @app.get("/", tags=["system"])
    def root(config: Settings = Depends(get_settings)) -> dict:
        return {
            "service": config.app_name,
            "environment": config.app_env,
            "message": "Workflow Engine API foundation is running.",
        }

    @app.get("/healthz", tags=["system"])
    def healthcheck(config: Settings = Depends(get_settings)) -> dict:
        return {
            "status": "ok",
            "webAppUrl": config.web_app_url,
            "rabbitmqConfigured": bool(config.rabbitmq_url),
            "databaseConfigured": bool(config.workflow_database_url),
        }

    @app.get("/api/v1/me", tags=["auth"])
    def who_am_i(user: AuthenticatedUser = Depends(get_current_user)) -> dict:
        return {
            "userId": user.user_id,
            "email": user.email,
            "claims": user.payload,
        }

    @app.get("/api/v1/foundation", tags=["workflow"])
    def foundation_snapshot(config: Settings = Depends(get_settings)) -> dict:
        return {
            "status": "active",
            "stack": {
                "api": "FastAPI",
                "frontend": "Next.js",
                "auth": "Better Auth",
                "queue": "RabbitMQ",
                "database": "PostgreSQL",
            },
            "capabilities": [
                "better-auth-jwt-verification",
                "react-flow-workflow-preview",
                "email-password-login-shell",
                "workflow-definition-crud",
                "runtime-task-actions",
                "docker-compose-infra",
            ],
            "webAppUrl": config.web_app_url,
        }

    return app


app = create_app()


def main() -> None:
    import uvicorn

    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=True)
