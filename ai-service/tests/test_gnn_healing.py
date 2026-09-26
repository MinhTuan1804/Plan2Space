# ai-service/tests/test_gnn_healing.py
from pipeline.gnn_healing import heal_wall_topology

def _wall(*points):
    return {"points": [list(p) for p in points], "thickness_m": 0.2, "height_m": 2.8}

def test_near_miss_endpoints_snap_to_shared_junction():
    # Two wall segments that should meet at (5,0) but are off by 3cm due to
    # vectorization noise — a common ViT-heatmap artifact.
    walls = [
        {"points": [[0.0, 0.0], [5.0, 0.0]], "thickness_m": 0.2, "height_m": 2.8},
        {"points": [[5.03, 0.0], [5.03, 4.0]], "thickness_m": 0.2, "height_m": 2.8},
    ]
    healed = heal_wall_topology(walls, snap_tolerance_m=0.05)

    endpoint_a = healed[0]["points"][-1]
    endpoint_b = healed[1]["points"][0]
    assert endpoint_a == endpoint_b

def test_gap_beyond_tolerance_is_left_unmodified():
    walls = [
        {"points": [[0.0, 0.0], [5.0, 0.0]], "thickness_m": 0.2, "height_m": 2.8},
        {"points": [[5.5, 0.0], [5.5, 4.0]], "thickness_m": 0.2, "height_m": 2.8},
    ]
    healed = heal_wall_topology(walls, snap_tolerance_m=0.05)
    assert healed[0]["points"][-1] == [5.0, 0.0]
    assert healed[1]["points"][0] == [5.5, 0.0]

def test_three_endpoints_near_one_corner_all_meet_at_a_single_point():
    walls = [_wall((0, 0), (5.0, 0.0)), _wall((5.03, 0.0), (5.03, 4)), _wall((5.0, 0.04), (9, 0.04))]
    healed = heal_wall_topology(walls, snap_tolerance_m=0.05)
    assert healed[0]["points"][-1] == healed[1]["points"][0] == healed[2]["points"][0]

def test_endpoint_near_middle_of_another_wall_snaps_onto_it():
    # T-junction: the partition wall stops 3cm short of the long wall.
    walls = [_wall((0, 0), (10, 0)), _wall((4, 0.03), (4, 3))]
    healed = heal_wall_topology(walls, snap_tolerance_m=0.05)
    assert healed[1]["points"][0] == [4.0, 0.0]
    assert healed[0]["points"] == [[0.0, 0.0], [10.0, 0.0]]

def test_input_walls_are_not_mutated():
    walls = [_wall((0, 0), (5.0, 0)), _wall((5.03, 0), (5.03, 4))]
    heal_wall_topology(walls, snap_tolerance_m=0.05)
    assert walls[1]["points"][0] == [5.03, 0]

def test_a_wall_collapsed_to_one_point_by_snapping_is_dropped():
    # A 3 mm stub between two walls that meet: both of its ends join the same corner cluster.
    walls = [_wall((0, 0), (5.0, 0)), _wall((5.0, 0), (5.003, 0)), _wall((5.003, 0), (5.003, 4))]
    healed = heal_wall_topology(walls, snap_tolerance_m=0.005)
    assert len(healed) == 2
    assert all(w["points"][0] != w["points"][-1] for w in healed)
