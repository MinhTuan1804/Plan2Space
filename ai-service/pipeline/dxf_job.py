from pipeline.dxf_parser import parse_dxf
from pipeline.gnn_healing import heal_wall_topology
from pipeline.rooms import label_rooms, rooms_from_walls
from pipeline.serializer import serialize_pipeline_result

DXF_SNAP_TOLERANCE_M = 0.005     # CAD input is exact: stay within the ±5 mm spatial tolerance


def process_dxf(path: str) -> dict:
    """A DXF plan to the geometry API's save body: the worker's job, and what the benchmark scores."""
    parsed = parse_dxf(path)
    # A DXF states its openings as gaps in the wall; no symbol detector is involved.
    walls = heal_wall_topology(parsed["walls"], snap_tolerance_m=DXF_SNAP_TOLERANCE_M)
    return serialize_pipeline_result(walls, parsed["openings"], label_rooms(rooms_from_walls(walls), parsed["room_names"]))
