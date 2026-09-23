"""IFC4 export: real wall solids (one IfcWall per centreline segment) with door/window openings.

The brief's version created IfcWall entities with no geometry, units or context, which viewers show as empty.
"""
import math

import numpy as np
import ifcopenshell
from ifcopenshell.api import aggregate, context, geometry as ifc_geometry, project, root, spatial, unit, void

from pipeline.plan_geometry import ExportInputError, nearest_segment, opening_height, openings_of, segment_length, wall_segments, xy


def _placement(origin: tuple[float, float], angle: float, z: float = 0.0) -> np.ndarray:
    matrix = np.eye(4)
    matrix[0, 0], matrix[0, 1] = math.cos(angle), -math.sin(angle)
    matrix[1, 0], matrix[1, 1] = math.sin(angle), math.cos(angle)
    matrix[:3, 3] = [origin[0], origin[1], z]
    return matrix


def _box(model, body, product, length, height, thickness, origin, angle, z=0.0):
    # Profile runs along local +X; offset centres the thickness on the placement line.
    rep = ifc_geometry.add_wall_representation(model, context=body, length=length, height=height,
                                               thickness=thickness, offset=-thickness / 2)
    ifc_geometry.assign_representation(model, product=product, representation=rep)
    ifc_geometry.edit_object_placement(model, product=product, matrix=_placement(origin, angle, z))


def export_ifc(geometry: dict) -> bytes:
    if not any(wall_segments(w) for w in geometry.get("walls", [])):
        raise ExportInputError("The plan has no walls — nothing to export")

    model = project.create_file(version="IFC4")
    ifc_project = root.create_entity(model, ifc_class="IfcProject", name="Plan2Space Export")
    # Metres, m², m³ and radians (without a plane-angle unit, viewers warn and guess).
    unit.assign_unit(model, units=[unit.add_si_unit(model, unit_type=t)
                                   for t in ("LENGTHUNIT", "AREAUNIT", "VOLUMEUNIT", "PLANEANGLEUNIT")])
    model3d = context.add_context(model, context_type="Model")
    body = context.add_context(model, context_type="Model", context_identifier="Body",
                               target_view="MODEL_VIEW", parent=model3d)

    site = root.create_entity(model, ifc_class="IfcSite", name="Site")
    building = root.create_entity(model, ifc_class="IfcBuilding", name="Building")
    storey = root.create_entity(model, ifc_class="IfcBuildingStorey", name="Ground Floor")
    aggregate.assign_object(model, products=[site], relating_object=ifc_project)
    aggregate.assign_object(model, products=[building], relating_object=site)
    aggregate.assign_object(model, products=[storey], relating_object=building)

    for w_index, wall in enumerate(geometry["walls"]):
        segments = wall_segments(wall)
        thickness, height = float(wall["thicknessMeters"]), float(wall["heightMeters"])
        entities = {}
        for s_index, seg in enumerate(segments):
            (ax, ay), (bx, by) = seg
            ifc_wall = root.create_entity(model, ifc_class="IfcWall", name=f"Wall {w_index + 1}.{s_index + 1}")
            spatial.assign_container(model, products=[ifc_wall], relating_structure=storey)
            _box(model, body, ifc_wall, segment_length(seg), height, thickness, (ax, ay), math.atan2(by - ay, bx - ax))
            entities[seg] = ifc_wall

        for o_index, opening in enumerate(openings_of(geometry, wall)):
            centre = xy(opening["position"])
            seg = nearest_segment(segments, centre)
            (ax, ay), (bx, by) = seg
            angle = math.atan2(by - ay, bx - ax)
            width, cut_height = float(opening["widthMeters"]), opening_height(opening)
            start = (centre[0] - math.cos(angle) * width / 2, centre[1] - math.sin(angle) * width / 2)
            sill = float(opening["sillHeightMeters"])

            void_element = root.create_entity(model, ifc_class="IfcOpeningElement", name=f"Opening {w_index + 1}.{o_index + 1}")
            _box(model, body, void_element, width, cut_height, thickness * 2, start, angle, sill)
            void.add_opening(model, opening=void_element, element=entities[seg])

            is_door = str(opening["type"]).lower() == "door"
            filler = root.create_entity(model, ifc_class="IfcDoor" if is_door else "IfcWindow",
                                        name=f"{'Door' if is_door else 'Window'} {w_index + 1}.{o_index + 1}")
            filler.OverallWidth, filler.OverallHeight = width, cut_height
            ifc_geometry.edit_object_placement(model, product=filler, matrix=_placement(start, angle, sill))
            spatial.assign_container(model, products=[filler], relating_structure=storey)
            void.add_filling(model, opening=void_element, element=filler)

    return model.to_string().encode("utf-8")
