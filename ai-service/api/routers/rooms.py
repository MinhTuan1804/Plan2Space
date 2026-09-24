import hmac
import os

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from pipeline.rooms import rooms_from_walls

router = APIRouter()


class WallIn(BaseModel):
    points: list[list[float]]


class DeriveRequest(BaseModel):
    walls: list[WallIn]


@router.post("/rooms/derive")
def derive(req: DeriveRequest, x_internal_token: str | None = Header(default=None)):
    # Called only by the .NET API (service-to-service); same shared token as the API's /internal endpoints.
    expected = os.environ.get("P2S_INTERNAL_TOKEN", "")
    if not expected or not hmac.compare_digest(expected, x_internal_token or ""):
        raise HTTPException(status_code=401)
    walls = [{"points": w.points} for w in req.walls if len(w.points) >= 2]
    return {"rooms": rooms_from_walls(walls)}
