# ai-service/tests/test_ocr_dimensions.py
from pipeline.ocr_dimensions import extract_dimensions

def test_extract_dimensions_test_mode_returns_expected_shape(tmp_path):
    from PIL import Image
    import numpy as np
    img_path = tmp_path / "plan.png"
    Image.fromarray(np.full((100, 100), 255, dtype="uint8")).save(img_path)

    result = extract_dimensions(str(img_path), use_model=False)

    assert isinstance(result, list)
    for dim in result:
        assert "text" in dim and "bbox_center" in dim

def test_real_ocr_reads_a_dimension_label_and_ignores_plain_words(tmp_path):
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new("L", (400, 160), 255)
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default(size=40)
    draw.text((40, 20), "3000", fill=0, font=font)
    draw.text((40, 90), "KITCHEN", fill=0, font=font)
    img_path = tmp_path / "dims.png"
    img.save(img_path)

    result = extract_dimensions(str(img_path), use_model=True)

    assert [d["text"] for d in result] == ["3000"]
    cx, cy = result[0]["bbox_center"]
    assert 40 <= cx <= 200 and 20 <= cy <= 80
