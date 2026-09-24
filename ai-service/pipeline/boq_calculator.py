from pipeline.plan_geometry import opening_height, openings_of, segment_length, wall_segments

# Vietnam convention: a 110 mm (half-brick) wall takes ~60 bricks/m² and ~0.02 m³ mortar/m²;
# both scale with wall thickness (a 220 mm wall takes twice as many).
BRICKS_PER_M2_PER_100MM = 60
MORTAR_M3_PER_M2_PER_100MM = 0.02


def calculate_boq(geometry: dict, unit_prices: dict) -> dict:
    wall_area_one_face = 0.0      # net of door/window openings
    brick_count = 0.0
    mortar_volume_m3 = 0.0
    for wall in geometry["walls"]:
        length = sum(segment_length(s) for s in wall_segments(wall))   # full polyline, not first→last point
        gross = length * float(wall["heightMeters"])
        openings = sum(float(o["widthMeters"]) * min(opening_height(o), float(wall["heightMeters"]))
                       for o in openings_of(geometry, wall))
        net = max(gross - openings, 0.0)
        thickness_factor = float(wall["thicknessMeters"]) / 0.1
        wall_area_one_face += net
        brick_count += net * BRICKS_PER_M2_PER_100MM * thickness_factor
        mortar_volume_m3 += net * MORTAR_M3_PER_M2_PER_100MM * thickness_factor

    paint_area_m2 = round(wall_area_one_face * 2, 2)   # interior + exterior face
    brick_count = round(brick_count)
    mortar_volume_m3 = round(mortar_volume_m3, 3)
    total_cost_vnd = (
        brick_count * unit_prices["brick_per_unit_vnd"]
        + paint_area_m2 * unit_prices["paint_per_m2_vnd"]
        + mortar_volume_m3 * unit_prices["mortar_per_m3_vnd"]
    )
    return {
        "brick_count": brick_count,
        "paint_area_m2": paint_area_m2,
        "mortar_volume_m3": mortar_volume_m3,
        "total_cost_vnd": round(total_cost_vnd, 0),
    }
