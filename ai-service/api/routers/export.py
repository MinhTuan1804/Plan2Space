import hmac
import os

from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import BaseModel

from pipeline.export_mesh import CONTENT_TYPES, build_mesh_from_geometry, export_mesh

router = APIRouter()


class ExportRequest(BaseModel):
    geometry: dict
    format: str


@router.post("/export")
def export(req: ExportRequest, x_internal_token: str | None = Header(default=None)):
    # Called only by the .NET API (service-to-service); same shared token as the API's /internal endpoints.
    expected = os.environ.get("P2S_INTERNAL_TOKEN", "")
    if not expected or not hmac.compare_digest(expected, x_internal_token or ""):
        raise HTTPException(status_code=401)
    try:
        data = export_mesh(build_mesh_from_geometry(req.geometry), req.format)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return Response(content=data, media_type=CONTENT_TYPES[req.format])
