# ai-service/tests/test_thick_stroke_filter.py
# Without trained weights the raster branch traces every dark pixel; in a furnished plan that turns beds,
# tables, labels and tile hatching into walls. Walls are solid strokes and the rest are hairlines.
import numpy as np
from PIL import Image

from pipeline.vectorize import keep_thick_strokes, vectorize_raster
# tests/ has no __init__.py: pytest puts it on sys.path, and a bare import cannot collide with a
# third-party top-level 'tests' package the way 'tests.raster_fixtures' could.
from raster_fixtures import FURNITURE_BOX, HATCH_BOX, furnished_plan, thin_line_plan, walls_only


def _mask(img: np.ndarray) -> np.ndarray:
    return (img < 128).astype(np.uint8)


def test_furniture_text_and_hatching_are_removed():
    kept = keep_thick_strokes(_mask(furnished_plan()))

    x0, y0, x1, y1 = FURNITURE_BOX
    assert kept[y0:y1, x0:x1].sum() == 0
    x0, y0, x1, y1 = HATCH_BOX
    assert kept[y0:y1, x0:x1].sum() == 0


def test_walls_survive_the_filter():
    walls = _mask(walls_only()).astype(bool)

    kept = keep_thick_strokes(_mask(furnished_plan())).astype(bool)

    assert kept[walls].mean() >= 0.8


def test_a_thin_line_drawing_is_left_untouched():
    # Its walls are two hairlines; opening it would erase every wall.
    mask = _mask(thin_line_plan())

    assert np.array_equal(keep_thick_strokes(mask), mask)


def test_an_empty_mask_stays_empty():
    mask = np.zeros((50, 50), np.uint8)

    assert keep_thick_strokes(mask).sum() == 0


def test_vectorizing_a_furnished_plan_traces_walls_not_furniture(tmp_path):
    path = tmp_path / "furnished.png"
    Image.fromarray(furnished_plan()).save(path)

    walls = vectorize_raster(str(path), use_model=False)["walls"]

    assert len(walls) <= 12   # 4 outer + 2 interior walls, with slack for corner fragments
