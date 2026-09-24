# ai-service/tests/test_exif_orientation.py
# A phone photo stores its rotation as an EXIF tag. Browsers apply it when showing the image (and when the
# editor draws it under the plan); the pipeline must read the same upright picture, or the traced walls
# and the underlay are rotated against each other.
from PIL import Image

from pipeline.raster_input import load_page_image


def test_a_rotated_phone_photo_is_read_upright(tmp_path):
    img = Image.new("L", (300, 200), 255)
    exif = img.getexif()
    exif[0x0112] = 6            # "rotate 90° clockwise to display"
    path = tmp_path / "photo.jpg"
    img.save(path, exif=exif)

    out = load_page_image(str(path), str(tmp_path))

    with Image.open(out) as shown:
        assert shown.size == (200, 300)


def test_an_image_without_a_rotation_tag_is_used_as_is(tmp_path):
    path = tmp_path / "plan.png"
    Image.new("L", (300, 200), 255).save(path)

    assert load_page_image(str(path), str(tmp_path)) == str(path)
