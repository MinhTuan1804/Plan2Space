# ai-service/tests/raster_fixtures.py
"""Floor-plan images generated in code: the tests need furniture, text and hatching around solid
walls without committing anyone's real drawing."""
import cv2
import numpy as np

WALL_PX = 10
# Regions that contain only hairlines (x0, y0, x1, y1): nothing in them may survive the filter.
FURNITURE_BOX = (45, 55, 156, 206)
HATCH_BOX = (219, 39, 372, 102)


def _blank() -> np.ndarray:
    return np.full((300, 400), 255, np.uint8)


def _draw_walls(img: np.ndarray) -> None:
    cv2.rectangle(img, (20, 20), (380, 280), 0, WALL_PX)
    cv2.line(img, (200, 20), (200, 120), 0, WALL_PX)
    cv2.line(img, (200, 170), (200, 280), 0, WALL_PX)     # 50 px doorway


def walls_only() -> np.ndarray:
    img = _blank()
    _draw_walls(img)
    return img


def furnished_plan() -> np.ndarray:
    """Two rooms of solid 10 px walls, with a bed, a table, a label and tile hatching drawn in 1 px lines."""
    img = walls_only()
    cv2.rectangle(img, (50, 60), (150, 200), 0, 1)       # bed
    cv2.rectangle(img, (60, 70), (140, 110), 0, 1)       # pillows
    cv2.circle(img, (290, 150), 30, 0, 1)                # round table
    cv2.putText(img, "PHONG NGU", (230, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.5, 0, 1)
    for x in range(220, 371, 12):                        # tile hatching
        cv2.line(img, (x, 40), (x, 100), 0, 1)
    for y in range(40, 101, 12):
        cv2.line(img, (220, y), (370, y), 0, 1)
    return img


def thin_line_plan() -> np.ndarray:
    """Walls drawn as two 1 px face lines 8 px apart: a drawing with nothing thick in it."""
    img = _blank()
    for offset in (0, 8):
        cv2.rectangle(img, (20 + offset, 20 + offset), (380 - offset, 280 - offset), 0, 1)
    return img
