from fastapi import FastAPI
from api.routers import health

app = FastAPI(title="Plan2Space AI Service")
app.include_router(health.router)
