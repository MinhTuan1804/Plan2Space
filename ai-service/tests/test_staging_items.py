# ai-service/tests/test_staging_items.py
# The client's catalog is the single source of truth: it sends the items, staging only positions them.
import math

from shapely import affinity
from shapely.geometry import Point, Polygon, box

from pipeline.generative_staging import WALL_CLEARANCE_M, suggest_layout

ROOM = [[0, 0], [4, 0], [4, 4], [0, 4]]
BED = {"item": "bed_double", "width_m": 1.6, "depth_m": 2.0, "against_wall": True}
TABLE = {"item": "coffee_table", "width_m": 1.0, "depth_m": 0.6, "against_wall": False}


def _footprint(p):
    x, y = p["position"]
    shape = box(x - p["width_m"] / 2, y - p["depth_m"] / 2, x + p["width_m"] / 2, y + p["depth_m"] / 2)
    return affinity.rotate(shape, p["rotation_deg"], origin=(x, y))


def test_the_given_items_are_placed_inside_the_room_without_overlap():
    placed = suggest_layout(ROOM, "Phòng ngủ", items=[BED, TABLE])
    assert [p["item"] for p in placed] == ["bed_double", "coffee_table"]
    shapes = [_footprint(p) for p in placed]
    assert all(Polygon(ROOM).buffer(1e-6).contains(s) for s in shapes)
    assert shapes[0].intersection(shapes[1]).area < 1e-6


def test_an_against_wall_item_has_its_back_to_a_wall_and_faces_into_the_room():
    [bed] = suggest_layout(ROOM, "Phòng ngủ", items=[BED])
    x, y = bed["position"]
    boundary = Polygon(ROOM).exterior
    theta = math.radians(bed["rotation_deg"])
    front = (math.sin(theta), -math.cos(theta))           # local -y after rotation
    reach = BED["depth_m"] / 2 + WALL_CLEARANCE_M
    behind = Point(x - front[0] * reach, y - front[1] * reach)
    assert behind.distance(boundary) < 0.01                # its back is against a wall
    ahead = Point(x + front[0] * (BED["depth_m"] / 2 + 0.3), y + front[1] * (BED["depth_m"] / 2 + 0.3))
    assert Polygon(ROOM).contains(ahead)                    # and its front faces into the room


def test_nothing_is_placed_in_front_of_a_door():
    door_zone = [2.0, 0.0, 0.9]
    placed = suggest_layout(ROOM, "Phòng ngủ", items=[BED, TABLE], keep_clear=[door_zone])
    zone = Point(2.0, 0.0).buffer(0.9)
    assert all(not _footprint(p).intersects(zone) for p in placed)


def test_grid_items_go_near_the_middle_of_the_room():
    [table] = suggest_layout(ROOM, "Phòng khách", items=[TABLE])
    assert math.dist(table["position"], (2, 2)) < 0.5


def test_without_items_the_built_in_catalog_still_works():
    assert len(suggest_layout(ROOM, "Bedroom")) > 0


def test_against_wall_item_that_fits_no_wall_is_skipped_not_dropped_in_the_middle():
    # Every edge of this 16-sided room is 1.17 m: a 1.5 m wardrobe fits no wall, though the middle is free.
    ring = [[3 * math.cos(2 * math.pi * k / 16), 3 * math.sin(2 * math.pi * k / 16)] for k in range(16)]
    wardrobe = {"item": "wardrobe", "width_m": 1.5, "depth_m": 0.5, "against_wall": True}
    assert suggest_layout(ring, "Phòng ngủ", items=[wardrobe, TABLE]) == [
        p for p in suggest_layout(ring, "Phòng ngủ", items=[TABLE])]


def test_grid_search_is_bounded_for_huge_rooms():
    # An uncalibrated plan (pixels read as metres) must not build millions of candidate spots.
    from pipeline.generative_staging import MAX_GRID_SPOTS, _grid_spots
    huge = Polygon([[0, 0], [1000, 0], [1000, 1000], [0, 1000]])
    assert len(list(_grid_spots(huge, 1.0, 0.6))) <= MAX_GRID_SPOTS
    [placed] = suggest_layout([[0, 0], [1000, 0], [1000, 1000], [0, 1000]], "x", items=[TABLE])
    assert math.dist(placed["position"], (500, 500)) < 1
