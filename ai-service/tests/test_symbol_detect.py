# ai-service/tests/test_symbol_detect.py
import math
from types import SimpleNamespace

import torch

from pipeline.symbol_detect import detect_symbols, symbols_from_obb

def test_detect_symbols_test_mode_returns_expected_shape(tmp_path):
    from PIL import Image
    import numpy as np
    img_path = tmp_path / "plan.png"
    Image.fromarray(np.full((100, 100), 255, dtype="uint8")).save(img_path)

    result = detect_symbols(str(img_path), use_model=False)

    assert isinstance(result, list)
    for symbol in result:
        assert symbol["type"] in ("door", "window")
        assert "bbox_center" in symbol and "angle_deg" in symbol and "confidence" in symbol

def _obb(cls_id, cx, cy, rot_rad, conf):
    return SimpleNamespace(cls=torch.tensor([cls_id]), conf=torch.tensor([conf]),
                           xywhr=torch.tensor([[cx, cy, 30.0, 8.0, rot_rad]]))

def test_obb_boxes_map_to_symbols_with_angle_in_degrees():
    boxes = [_obb(0, 50.0, 60.0, math.pi / 2, 0.9), _obb(1, 10.0, 20.0, 0.0, 0.8)]
    symbols = symbols_from_obb(boxes, {0: "door", 1: "window"})
    assert symbols[0]["type"] == "door"
    assert symbols[0]["bbox_center"] == [50.0, 60.0]
    assert math.isclose(symbols[0]["angle_deg"], 90.0, abs_tol=1e-4)
    assert math.isclose(symbols[0]["confidence"], 0.9, abs_tol=1e-6)
    assert symbols[1]["type"] == "window"

def test_classes_other_than_door_or_window_are_skipped():
    symbols = symbols_from_obb([_obb(2, 1.0, 1.0, 0.0, 0.9)], {0: "door", 1: "window", 2: "toilet"})
    assert symbols == []

def test_missing_weights_degrade_to_no_symbols_instead_of_failing_the_job(tmp_path):
    from PIL import Image
    import numpy as np
    img_path = tmp_path / "plan.png"
    Image.fromarray(np.full((100, 100), 255, dtype="uint8")).save(img_path)
    assert detect_symbols(str(img_path), use_model=True, weights_path=str(tmp_path / "missing.pt")) == []
