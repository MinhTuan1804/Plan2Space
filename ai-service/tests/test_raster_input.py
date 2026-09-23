# ai-service/tests/test_raster_input.py
from PIL import Image

from pipeline.raster_input import load_page_image

def test_pdf_first_page_is_rasterized(tmp_path):
    pdf = tmp_path / "plan.pdf"
    Image.new("RGB", (300, 200), "white").save(pdf, "PDF", resolution=72)
    png_path = load_page_image(str(pdf), out_dir=str(tmp_path))
    with Image.open(png_path) as img:
        assert img.format == "PNG" and img.width > 0 and img.height > 0

def test_png_is_returned_unchanged(tmp_path):
    png = tmp_path / "plan.png"
    Image.new("L", (10, 10), 255).save(png)
    assert load_page_image(str(png), out_dir=str(tmp_path)) == str(png)
