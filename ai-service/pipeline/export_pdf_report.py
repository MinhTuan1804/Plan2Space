"""PDF report per the spec: floor plan drawing + room schedule + bill of quantities."""
import os
from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from shapely.geometry import Polygon

from pipeline.plan_geometry import wall_segments, xy

MARGIN = 50
PLAN_BOX_HEIGHT = 300


def _register_fonts() -> tuple[str, str]:
    """A TTF with Vietnamese glyphs (room labels such as "Phòng ngủ"); Helvetica only covers Latin-1.
    DejaVu Sans ships with matplotlib (an ultralytics dependency)."""
    try:
        import matplotlib
        font_dir = os.path.join(matplotlib.get_data_path(), "fonts", "ttf")
        if "P2S-Sans" not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont("P2S-Sans", os.path.join(font_dir, "DejaVuSans.ttf")))
            pdfmetrics.registerFont(TTFont("P2S-Sans-Bold", os.path.join(font_dir, "DejaVuSans-Bold.ttf")))
        return "P2S-Sans", "P2S-Sans-Bold"
    except (ImportError, OSError):
        return "Helvetica", "Helvetica-Bold"


def _draw_floor_plan(c, geometry: dict, top: float, width: float, bold: str, regular: str) -> float:
    c.setFont(bold, 13)
    c.drawString(MARGIN, top, "Floor plan")
    box_top = top - 15
    points = [xy(p) for w in geometry["walls"] for p in w["points"]] + \
             [xy(p) for r in geometry.get("rooms", []) for p in r["points"]]
    if not points:
        return box_top - 20
    minx, maxx = min(p[0] for p in points), max(p[0] for p in points)
    miny, maxy = min(p[1] for p in points), max(p[1] for p in points)
    scale = min(width / max(maxx - minx, 1e-6), PLAN_BOX_HEIGHT / max(maxy - miny, 1e-6))

    def page(p):   # plan y-up maps directly onto PDF y-up
        return MARGIN + (p[0] - minx) * scale, box_top - PLAN_BOX_HEIGHT + (p[1] - miny) * scale

    c.setFont(regular, 8)
    for room in geometry.get("rooms", []):
        pts = [page(xy(p)) for p in room["points"]]
        c.setStrokeColorRGB(0.75, 0.75, 0.75)
        c.setLineWidth(0.5)
        path = c.beginPath()
        path.moveTo(*pts[0])
        for pt in pts[1:]:
            path.lineTo(*pt)
        c.drawPath(path, stroke=1, fill=0)
        cx, cy = Polygon([xy(p) for p in room["points"]]).centroid.coords[0]
        c.setFillColorRGB(0.3, 0.3, 0.3)
        c.drawCentredString(*page((cx, cy)), room.get("label", ""))

    c.setStrokeColorRGB(0, 0, 0)
    for wall in geometry["walls"]:
        c.setLineWidth(max(float(wall["thicknessMeters"]) * scale, 0.5))
        for a, b in wall_segments(wall):
            c.line(*page(a), *page(b))
    c.setFillColorRGB(0, 0, 0)
    return box_top - PLAN_BOX_HEIGHT - 30


def generate_pdf_report(geometry: dict, boq: dict) -> bytes:
    regular, bold = _register_fonts()
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    c.setFont(bold, 16)
    c.drawString(MARGIN, height - 50, "Plan2Space — Bill of Quantities Report")
    y = _draw_floor_plan(c, geometry, height - 85, width - 2 * MARGIN, bold, regular)

    def line(text: str, font: str = regular, size: int = 11, gap: int = 18):
        nonlocal y
        if y < MARGIN:
            c.showPage()
            y = height - MARGIN
        c.setFont(font, size)
        c.drawString(MARGIN, y, text)
        y -= gap

    line("Room schedule", bold, 13, 20)
    rooms = geometry.get("rooms", [])
    if not rooms:
        line("No rooms defined.")
    for room in rooms:
        poly = Polygon([xy(p) for p in room["points"]])
        line(f"{room.get('label', 'Room')}: {poly.area:.2f} m²  (perimeter {poly.length:.2f} m)")

    y -= 8
    line("Bill of quantities", bold, 13, 20)
    for text in [
        f"Wall count: {len(geometry['walls'])}",
        f"Estimated brick count: {boq['brick_count']:,}",
        f"Paint area (both faces): {boq['paint_area_m2']} m²",
        f"Mortar volume: {boq['mortar_volume_m3']} m³",
        f"Estimated total cost: {boq['total_cost_vnd']:,.0f} VND",
    ]:
        line(text)

    c.showPage()
    c.save()
    return buffer.getvalue()
