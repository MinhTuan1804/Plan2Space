# paddlepaddle's native library carries its own zlib; zlib-using extensions loaded AFTER it
# (pyclipper, scipy) crash on Linux with "free(): invalid pointer" / zlib stream errors.
# Load them first.
import cv2  # noqa: F401
import pyclipper  # noqa: F401
import scipy.ndimage  # noqa: F401
import shapely  # noqa: F401
import skimage.morphology  # noqa: F401

_OCR_CACHE = None


def _load_ocr():
    global _OCR_CACHE
    if _OCR_CACHE is None:
        from paddleocr import PaddleOCR   # heavy import; models are baked into the image at build time
        _OCR_CACHE = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    return _OCR_CACHE


def extract_dimensions(image_path: str, use_model: bool = True) -> list[dict]:
    if not use_model:
        return []  # deterministic empty result for offline/unit tests

    ocr = _load_ocr()
    raw_results = ocr.ocr(image_path, cls=True)
    dimensions = []
    for line in (raw_results[0] if raw_results else None) or []:
        bbox, (text, _confidence) = line
        if any(ch.isdigit() for ch in text):
            xs = [p[0] for p in bbox]
            ys = [p[1] for p in bbox]
            dimensions.append({"text": text, "bbox_center": [sum(xs) / 4, sum(ys) / 4]})
    return dimensions
