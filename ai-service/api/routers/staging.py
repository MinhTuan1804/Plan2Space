import hmac
import os

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from pipeline.generative_staging import suggest_layout

router = APIRouter()


class SuggestRequest(BaseModel):
    room_polygon: list[list[float]] = Field(alias="roomPolygon")
    room_label: str = Field(alias="roomLabel")


@router.post("/staging/suggest")
def suggest(req: SuggestRequest, x_internal_token: str | None = Header(default=None)):
    # Called only by the .NET API (service-to-service); same shared token as the API's /internal endpoints.
    expected = os.environ.get("P2S_INTERNAL_TOKEN", "")
    if not expected or not hmac.compare_digest(expected, x_internal_token or ""):
        raise HTTPException(status_code=401)
    try:
        return {"items": suggest_layout(req.room_polygon, req.room_label)}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
