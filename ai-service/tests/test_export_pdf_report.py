# ai-service/tests/test_export_pdf_report.py
import pypdfium2 as pdfium

from pipeline.boq_calculator import calculate_boq
from pipeline.export_pdf_report import generate_pdf_report

PRICES = {"brick_per_unit_vnd": 1200, "paint_per_m2_vnd": 45000, "mortar_per_m3_vnd": 1500000}


def test_generate_pdf_report_produces_valid_pdf_bytes():
    geometry = {"walls": [{"points": [[0, 0], [5, 0]], "thicknessMeters": 0.2, "heightMeters": 2.8}], "rooms": [], "openings": []}
    boq = calculate_boq(geometry, {"brick_per_unit_vnd": 1200, "paint_per_m2_vnd": 45000, "mortar_per_m3_vnd": 1500000})

    pdf_bytes = generate_pdf_report(geometry, boq)

    assert pdf_bytes[:4] == b"%PDF"
    assert len(pdf_bytes) > 500


def test_report_has_floor_plan_room_schedule_and_boq_with_vietnamese_labels():
    # Spec: "PDF report (BOQ + floor plan image + room schedule)".
    geometry = {
        "walls": [{"id": "w1", "points": [{"x": 0, "y": 0}, {"x": 4, "y": 0}], "thicknessMeters": 0.2, "heightMeters": 2.8},
                  {"id": "w2", "points": [{"x": 4, "y": 0}, {"x": 4, "y": 4}], "thicknessMeters": 0.2, "heightMeters": 2.8}],
        "rooms": [{"id": "r", "label": "Phòng ngủ",
                   "points": [{"x": 0, "y": 0}, {"x": 4, "y": 0}, {"x": 4, "y": 4}, {"x": 0, "y": 4}, {"x": 0, "y": 0}]}],
        "openings": [],
    }
    pdf = pdfium.PdfDocument(generate_pdf_report(geometry, calculate_boq(geometry, PRICES)))
    page = pdf[0]
    text = page.get_textpage().get_text_range()

    assert "Phòng ngủ" in text                     # label renders (font with Vietnamese glyphs)
    assert "16.00" in text                         # room area, m²
    assert "Floor plan" in text and "Room schedule" in text and "Bill of quantities" in text
    paths = [o for o in page.get_objects() if o.type == pdfium.raw.FPDF_PAGEOBJ_PATH]
    assert len(paths) >= 2                         # the walls are drawn
