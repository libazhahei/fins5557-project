"""FastAPI entry."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from quant_lab_api import __version__
from quant_lab_api.db import init_db
from quant_lab_api.routes import agent_proxy, auth, bars, jobs, runs
from quant_lab_api.settings import get_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title=settings.app_name, version=__version__, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(jobs.router)
app.include_router(runs.router)
app.include_router(bars.router)
app.include_router(agent_proxy.router)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "api",
        "version": __version__,
        "environment": settings.environment,
        "models": {
            "primary": settings.llm_primary_model,
            "lite": settings.llm_lite_model,
            "lite_roles": ["test", "context_compact"],
            "default_provider": settings.llm_default_provider,
            "deepseek_model": settings.llm_deepseek_model,
        },
    }


@app.get("/ready")
def ready() -> dict:
    return {"status": "ready", "database": "ok"}


def run() -> None:
    import uvicorn

    uvicorn.run("quant_lab_api.main:app", host="0.0.0.0", port=8080, reload=True)


if __name__ == "__main__":
    run()
