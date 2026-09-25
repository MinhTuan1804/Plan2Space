import hmac
import os

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from pipeline.generative_staging import suggest_layout

router = APIRouter()


class ItemIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    width_m: float = Field(alias="widthM")
    depth_m: float = Field(alias="depthM")
    against_wall: bool = Field(default=False, alias="againstWall")


class SuggestRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    room_polygon: list[list[float]] = Field(alias="roomPolygon")
    room_label: str = Field(alias="roomLabel")
    items: list[ItemIn] | None = None
    keep_clear: list[list[float]] | None = Field(default=None, alias="keepClear")


@router.post("/staging/suggest")
def suggest(req: SuggestRequest, x_internal_token: str | None = Header(default=None)):
    # Called only by the .NET API (service-to-service); same shared token as the API's /internal endpoints.
    expected = os.environ.get("P2S_INTERNAL_TOKEN", "")
    if not expected or not hmac.compare_digest(expected, x_internal_token or ""):
        raise HTTPException(status_code=401)
    try:
        items = None if req.items is None else [
            {"item": i.id, "width_m": i.width_m, "depth_m": i.depth_m, "against_wall": i.against_wall} for i in req.items]
        return {"items": suggest_layout(req.room_polygon, req.room_label, items, req.keep_clear)}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
