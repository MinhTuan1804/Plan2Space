import logging
import math
import os

logger = logging.getLogger(__name__)

DEFAULT_WEIGHTS = os.environ.get("P2S_YOLO_WEIGHTS", "models/weights/yolo_obb_symbols.pt")
OPENING_TYPES = ("door", "window")

_MODEL_CACHE: dict = {}


def _load_model(weights_path: str):
    if weights_path not in _MODEL_CACHE:
        from ultralytics import YOLO   # heavy import; only when the model path is taken
        _MODEL_CACHE[weights_path] = YOLO(weights_path)
    return _MODEL_CACHE[weights_path]


def symbols_from_obb(boxes, class_names: dict[int, str]) -> list[dict]:
    """Converts ultralytics OBB boxes (xywhr, rotation in radians) into opening symbols."""
    symbols = []
    for box in boxes:
        name = class_names.get(int(box.cls.item()), "").lower()
        if name not in OPENING_TYPES:
            continue
        cx, cy, _w, _h, rotation = box.xywhr[0].tolist()
        symbols.append({
            "type": name,
            "bbox_center": [float(cx), float(cy)],
            "angle_deg": math.degrees(rotation),
            "confidence": float(box.conf.item()),
        })
    return symbols


def detect_symbols(image_path: str, use_model: bool = True, weights_path: str = DEFAULT_WEIGHTS) -> list[dict]:
    if not use_model:
        return []  # deterministic empty result for offline/unit tests
    if not os.path.isfile(weights_path):
        # No trained YOLO-OBB checkpoint shipped yet: walls still vectorize, openings are just not detected.
        logger.warning("YOLO-OBB weights not found at %s; skipping door/window detection", weights_path)
        return []

    model = _load_model(weights_path)
    results = model(image_path, verbose=False)[0]
    return symbols_from_obb(results.obb or [], results.names)
