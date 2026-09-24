import hmac
import os

from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import BaseModel

from pipeline.boq_calculator import calculate_boq
from pipeline.export_ifc import export_ifc
from pipeline.export_mesh import CONTENT_TYPES as MESH_CONTENT_TYPES, build_mesh_from_geometry, export_mesh
from pipeline.export_pdf_report import generate_pdf_report
from pipeline.plan_geometry import ExportInputError

router = APIRouter()

CONTENT_TYPES = {**MESH_CONTENT_TYPES, "ifc": "application/x-step", "pdf": "application/pdf"}
DEFAULT_UNIT_PRICES = {"brick_per_unit_vnd": 1200, "paint_per_m2_vnd": 45000, "mortar_per_m3_vnd": 1500000}


class ExportRequest(BaseModel):
    geometry: dict
    format: str


def _render(geometry: dict, fmt: str) -> bytes:
    if fmt == "ifc":
        return export_ifc(geometry)
    if fmt == "pdf":
        if not geometry.get("walls"):
            raise ExportInputError("The plan has no walls — nothing to export")
        return generate_pdf_report(geometry, calculate_boq(geometry, DEFAULT_UNIT_PRICES))
    return export_mesh(build_mesh_from_geometry(geometry), fmt)


@router.post("/export")
def export(req: ExportRequest, x_internal_token: str | None = Header(default=None)):
    # Called only by the .NET API (service-to-service); same shared token as the API's /internal endpoints.
    expected = os.environ.get("P2S_INTERNAL_TOKEN", "")
    if not expected or not hmac.compare_digest(expected, x_internal_token or ""):
        raise HTTPException(status_code=401)
    if req.format not in CONTENT_TYPES:
        raise HTTPException(status_code=422, detail=f"Unsupported export format: {req.format}")
    try:
        data = _render(req.geometry, req.format)
    except ExportInputError as exc:   # client errors only; library failures stay 500
        raise HTTPException(status_code=422, detail=str(exc))
    return Response(content=data, media_type=CONTENT_TYPES[req.format])
