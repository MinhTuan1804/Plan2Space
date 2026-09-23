# ai-service/tests/test_vectorize_raster.py
import numpy as np
from PIL import Image
from pipeline.vectorize import vectorize_raster

def _write_synthetic_floorplan(path: str, divider: bool = False):
    # 200x200 white image with a single black rectangular wall outline —
    # simple enough that the ViT stub segmenter (Step 3) can be swapped for a
    # deterministic thresholding fallback in test mode, keeping this test fast and offline.
    img = np.full((200, 200), 255, dtype=np.uint8)
    img[40:42, 40:160] = 0
    img[158:160, 40:160] = 0
    img[40:160, 40:42] = 0
    img[40:160, 158:160] = 0
    if divider:
        img[40:160, 99:101] = 0   # interior wall splitting the room in two
    Image.fromarray(img).save(path)

def test_vectorize_raster_extracts_at_least_one_wall(tmp_path):
    image_path = tmp_path / "floorplan.png"
    _write_synthetic_floorplan(str(image_path))

    result = vectorize_raster(str(image_path), use_model=False)  # test-mode: threshold fallback, no ViT weights needed

    assert len(result["walls"]) >= 4
    for wall in result["walls"]:
        assert len(wall["points"]) >= 2

def test_rectangle_yields_exactly_its_four_walls_without_duplicates(tmp_path):
    image_path = tmp_path / "floorplan.png"
    _write_synthetic_floorplan(str(image_path))
    walls = vectorize_raster(str(image_path), use_model=False)["walls"]
    assert len(walls) == 4
    lengths = sorted(round(np.hypot(*np.subtract(w["points"][-1], w["points"][0]))) for w in walls)
    assert all(abs(length - 118) <= 4 for length in lengths)   # 118px centreline sides, ±4px

def test_interior_wall_is_found_once_and_outer_walls_are_not_split(tmp_path):
    image_path = tmp_path / "floorplan.png"
    _write_synthetic_floorplan(str(image_path), divider=True)
    walls = vectorize_raster(str(image_path), use_model=False)["walls"]
    assert len(walls) == 5

def test_model_path_without_checkpoint_degrades_to_threshold(tmp_path):
    # No trained weights are shipped yet: use_model=True must not crash or download anything.
    image_path = tmp_path / "floorplan.png"
    _write_synthetic_floorplan(str(image_path))
    walls = vectorize_raster(str(image_path), use_model=True, checkpoint_path=None)["walls"]
    assert len(walls) == 4
