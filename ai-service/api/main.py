from fastapi import FastAPI
from api.routers import copilot, health, staging

app = FastAPI(title="Plan2Space AI Service")
app.include_router(health.router)
app.include_router(copilot.router)
app.include_router(staging.router)
