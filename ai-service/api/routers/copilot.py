import hmac
import os

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from pipeline.copilot_intent import parse_intent

router = APIRouter()


class ParseRequest(BaseModel):
    message: str
    geometry: dict


@router.post("/copilot/parse")
def parse(req: ParseRequest, x_internal_token: str | None = Header(default=None)):
    # Called only by the .NET API (service-to-service); same shared token as the API's /internal endpoints.
    expected = os.environ.get("P2S_INTERNAL_TOKEN", "")
    if not expected or not hmac.compare_digest(expected, x_internal_token or ""):
        raise HTTPException(status_code=401)
    return parse_intent(req.message, req.geometry)
