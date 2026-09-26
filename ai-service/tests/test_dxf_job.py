from pipeline.dxf_job import process_dxf
from pipeline.dxf_parser import parse_dxf
from pipeline.gnn_healing import heal_wall_topology
from pipeline.rooms import label_rooms, rooms_from_walls
from pipeline.serializer import serialize_pipeline_result

FIXTURE = "tests/fixtures/plan_with_wall_openings.dxf"


def test_process_dxf_matches_worker_chain():
    parsed = parse_dxf(FIXTURE)
    walls = heal_wall_topology(parsed["walls"], snap_tolerance_m=0.005)
    by_hand = serialize_pipeline_result(walls, parsed["openings"],
                                        label_rooms(rooms_from_walls(walls), parsed["room_names"]))
    result = process_dxf(FIXTURE)
    assert set(result) >= {"walls", "openings", "rooms"}
    assert len(result["walls"]) == len(by_hand["walls"])
    assert sorted(r["label"] for r in result["rooms"]) == sorted(r["label"] for r in by_hand["rooms"])
    assert sorted(o["type"] for o in result["openings"]) == sorted(o["type"] for o in by_hand["openings"])
