"""Writes each benchmark house as a DXF drawing plus its answer (truth.json), clean or with a real-world defect."""
import json
import math
import re
import unicodedata
from pathlib import Path

import ezdxf
from shapely.geometry import LineString, MultiLineString, Point, Polygon
from shapely.ops import linemerge, unary_union

from houses import HOUSES, House, Level

EXT_M, INT_M = 0.22, 0.11
MM = 1000.0
TEXT_HEIGHT_MM = 240


def _straight_runs(line: LineString) -> list[list[tuple]]:
    """A merged polyline broken wherever it turns: one wall per straight run."""
    pts = list(line.coords)
    runs, start = [], 0
    for i in range(1, len(pts) - 1):
        (x0, y0), (x1, y1), (x2, y2) = pts[i - 1], pts[i], pts[i + 1]
        if abs((x1 - x0) * (y2 - y1) - (y1 - y0) * (x2 - x1)) > 1e-9:
            runs.append([pts[start], pts[i]])
            start = i
    runs.append([pts[start], pts[-1]])
    return runs


def walls_of(level: Level) -> list[dict]:
    """Every room edge is a wall: 0.11 m where two rooms share it, 0.22 m on the outline.
    Collinear pieces of one thickness are one wall; walls break where another wall meets them."""
    rooms = [Polygon(r.points) for r in level.rooms]
    noded = unary_union([LineString(r.exterior.coords) for r in rooms])
    segments = list(noded.geoms) if isinstance(noded, MultiLineString) else [noded]
    by_thickness: dict[float, list[LineString]] = {EXT_M: [], INT_M: []}
    for seg in segments:
        mid = seg.interpolate(0.5, normalized=True)
        sharing = sum(1 for r in rooms if r.exterior.distance(mid) < 1e-6)
        by_thickness[INT_M if sharing >= 2 else EXT_M].append(seg)
    walls = []
    for t, segs in by_thickness.items():
        if not segs:
            continue
        merged = linemerge(segs)
        for line in (merged.geoms if hasattr(merged, "geoms") else [merged]):
            walls += [{"points": [list(a), list(b)], "thickness": t} for a, b in _straight_runs(line)]
    return walls


def _openings_on(wall: dict, level: Level):
    line = LineString(wall["points"])
    return [o for o in level.openings if line.distance(Point(o.centre)) < 1e-6]


def _level_truth(level: Level, dx: float) -> dict:
    move = lambda p: [round(p[0] + dx, 6), round(p[1], 6)]
    return {
        "walls": [{"points": [move(p) for p in w["points"]], "thickness": w["thickness"]} for w in walls_of(level)],
        "rooms": [{"points": [move(p) for p in r.points], "name": r.name, "type": r.type} for r in level.rooms],
        "openings": [{"type": o.type, "centre": move(o.centre), "width": o.width} for o in level.openings],
    }


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s.replace("đ", "d").replace("Đ", "D"))
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


def _is_stair(name: str) -> bool:
    return re.search(r"\bstair|\bthang\b", _norm(name)) is not None


def _is_light_well(name: str) -> bool:
    return re.search(r"gieng troi|light ?well", _norm(name)) is not None


def _bounds(level: Level, dx: float) -> dict:
    xs = [p[0] + dx for r in level.rooms for p in r.points]
    ys = [p[1] for r in level.rooms for p in r.points]
    return {"minX": min(xs), "minY": min(ys), "maxX": max(xs), "maxY": max(ys)}


def _block_step(house: House) -> float:
    return max(p[0] for r in house.levels[0].rooms for p in r.points) + house.gap_m


def truth_of(house: House) -> dict:
    step = _block_step(house)
    truth = {"walls": [], "rooms": [], "openings": []}
    for i, level in enumerate(house.levels):
        part = _level_truth(level, i * step)
        for k in truth:
            truth[k] += part[k]
    if len(house.levels) == 2:
        lower, upper = house.levels
        wells = [r for r in lower.rooms if _is_stair(r.name) or _is_light_well(r.name)]
        upper_area = unary_union([Polygon(r.points) for r in upper.rooms])
        cut = unary_union([Polygon(r.points) for r in wells]).intersection(upper_area)
        truth["levels"] = {
            "blocks": [_bounds(lower, 0), _bounds(upper, step)],
            "offset": [-step, 0.0],
            "heights": [lower.height, upper.height],
            "stairWell": next(r.points for r in lower.rooms if _is_stair(r.name)),
            "lightWells": [r.points for r in lower.rooms if _is_light_well(r.name)],
            "stairEntry": lower.stair_entry,
            "stairExit": upper.stair_exit,
            "upperFloorArea": round(upper_area.area - cut.area, 6),
        }
    return truth


# --- drawing -------------------------------------------------------------------------------------

def _wall_pieces(wall: dict, level: Level) -> list[tuple[tuple, tuple]]:
    """The wall's centreline less its openings' gaps."""
    line = LineString(wall["points"])
    cuts = sorted((line.project(Point(o.centre)) - o.width / 2, line.project(Point(o.centre)) + o.width / 2)
                  for o in _openings_on(wall, level))
    pieces, at = [], 0.0
    for s, e in cuts:
        if s > at:
            pieces.append((at, s))
        at = e
    if at < line.length:
        pieces.append((at, line.length))
    return [(line.interpolate(s).coords[0], line.interpolate(e).coords[0]) for s, e in pieces]


def _outline(a, b, t) -> list[tuple]:
    (x0, y0), (x1, y1) = a, b
    length = math.hypot(x1 - x0, y1 - y0)
    nx, ny = -(y1 - y0) / length * t / 2, (x1 - x0) / length * t / 2
    return [(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)]


class Drawer:
    """Draws one level into model space; a variant overrides how walls, openings and names are drawn."""

    def __init__(self, doc, unit: float = MM):
        self.doc, self.msp, self.unit = doc, doc.modelspace(), unit

    def u(self, p, dx=0.0):
        return ((p[0] + dx) * self.unit, p[1] * self.unit)

    def wall(self, a, b, t, dx):
        self.msp.add_lwpolyline([self.u(p, dx) for p in _outline(a, b, t)], close=True, dxfattribs={"layer": "WALL"})

    def opening(self, o, wall, dx):
        line = LineString(wall["points"])
        d = line.project(Point(o.centre))
        a, b = line.interpolate(d - o.width / 2).coords[0], line.interpolate(d + o.width / 2).coords[0]
        if o.type == "Door":
            self.msp.add_line(self.u(a, dx), self.u(b, dx), dxfattribs={"layer": "DOOR"})
        else:
            self.msp.add_line(self.u(a, dx), self.u(b, dx), dxfattribs={"layer": "WINDOW"})

    def name(self, text, at, dx):
        self.msp.add_text(text, height=TEXT_HEIGHT_MM * self.unit / MM,
                          dxfattribs={"layer": "TEXT-ROOM", "insert": self.u(at, dx)})

    def level(self, level: Level, dx: float):
        walls = walls_of(level)
        for w in walls:
            for a, b in _wall_pieces(w, level):
                if math.dist(a, b) > 1e-6:
                    self.wall(a, b, w["thickness"], dx)
            for o in _openings_on(w, level):
                self.opening(o, w, dx)
        for r in level.rooms:
            self.name(r.name, Polygon(r.points).representative_point().coords[0], dx)


class TwoLines(Drawer):
    """Walls as two loose parallel face lines instead of a closed outline."""
    def wall(self, a, b, t, dx):
        p = _outline(a, b, t)
        for s, e in ((p[0], p[1]), (p[3], p[2])):
            self.msp.add_line(self.u(s, dx), self.u(e, dx), dxfattribs={"layer": "WALL"})


class Gaps(Drawer):
    """Every wall piece pulled back 5–30 mm at each end: joints that do not quite meet."""
    def __init__(self, doc, rng, **kw):
        super().__init__(doc, **kw)
        self.rng = rng

    def wall(self, a, b, t, dx):
        length = math.dist(a, b)
        s, e = self.rng.uniform(0.005, 0.03), self.rng.uniform(0.005, 0.03)
        if length <= s + e + 0.05:
            return super().wall(a, b, t, dx)
        ux, uy = (b[0] - a[0]) / length, (b[1] - a[1]) / length
        super().wall((a[0] + ux * s, a[1] + uy * s), (b[0] - ux * e, b[1] - uy * e), t, dx)


class DoorBlocks(Drawer):
    """Doors as block inserts (leaf + 90° swing) on an unusual layer."""
    def opening(self, o, wall, dx):
        if o.type != "Door":
            return super().opening(o, wall, dx)
        line = LineString(wall["points"])
        d = line.project(Point(o.centre))
        (ax, ay), (bx, by) = line.interpolate(d - o.width / 2).coords[0], line.interpolate(d + o.width / 2).coords[0]
        name = f"DOOR_{round(o.width * 1000)}"
        if name not in self.doc.blocks:
            blk = self.doc.blocks.new(name)
            w = o.width * self.unit
            blk.add_line((0, 0), (0, w), dxfattribs={"layer": "0"})
            blk.add_arc((0, 0), w, 0, 90, dxfattribs={"layer": "0"})
        angle = math.degrees(math.atan2(by - ay, bx - ax))
        self.msp.add_blockref(name, self.u((ax, ay), dx), dxfattribs={"layer": "A-DOOR", "rotation": angle})


class MtextNames(Drawer):
    """Names as formatted MTEXT with the area on a second line; every third one inside a block."""
    count = 0

    def name(self, text, at, dx):
        MtextNames.count += 1
        content = r"{\fArial|b1;" + text + r"}\P12.5 m²"
        if MtextNames.count % 3:
            self.msp.add_mtext(content, dxfattribs={"layer": "TEXT-ROOM", "insert": self.u(at, dx),
                                                    "char_height": TEXT_HEIGHT_MM * self.unit / MM})
            return
        blk = self.doc.blocks.new(f"LABEL_{MtextNames.count}")
        blk.add_text(text, height=TEXT_HEIGHT_MM * self.unit / MM, dxfattribs={"layer": "TEXT-ROOM"})
        self.msp.add_blockref(blk.name, self.u(at, dx), dxfattribs={"layer": "TEXT-ROOM"})


class OddLayers(Drawer):
    """The layer names of another office: walls on A-WALL, TUONG or 0, names on A-ANNO-ROOM."""
    def __init__(self, doc, wall_layer, **kw):
        super().__init__(doc, **kw)
        self.wall_layer = wall_layer

    def wall(self, a, b, t, dx):
        self.msp.add_lwpolyline([self.u(p, dx) for p in _outline(a, b, t)], close=True,
                                dxfattribs={"layer": self.wall_layer})

    def name(self, text, at, dx):
        self.msp.add_text(text, height=TEXT_HEIGHT_MM * self.unit / MM,
                          dxfattribs={"layer": "A-ANNO-ROOM", "insert": self.u(at, dx)})


class Clutter(Drawer):
    """What else a real plan carries: hatched wet rooms, dimension lines, furniture drawn with lines."""
    def level(self, level, dx):
        super().level(level, dx)
        for r in level.rooms:
            if r.type == "bathroom":
                hatch = self.msp.add_hatch(dxfattribs={"layer": "HATCH"})
                hatch.paths.add_polyline_path([self.u(p, dx) for p in r.points[:-1]], is_closed=True)
        xs = [p[0] for r in level.rooms for p in r.points]
        ys = [p[1] for r in level.rooms for p in r.points]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        for a, b in (((x0, y0 - 1.0), (x1, y0 - 1.0)), ((x0 - 1.0, y0), (x0 - 1.0, y1))):
            self.msp.add_line(self.u(a, dx), self.u(b, dx), dxfattribs={"layer": "DIM"})
            self.msp.add_text(f"{math.dist(a, b) * 1000:.0f}", height=180 * self.unit / MM,
                              dxfattribs={"layer": "DIM", "insert": self.u(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), dx)})
        bedroom = next((r for r in level.rooms if r.type == "bedroom"), None)
        if bedroom:
            cx, cy = Polygon(bedroom.points).representative_point().coords[0]
            bed = [(cx - 0.8, cy - 1.0), (cx + 0.8, cy - 1.0), (cx + 0.8, cy + 1.0), (cx - 0.8, cy + 1.0)]
            for i in range(4):
                self.msp.add_line(self.u(bed[i], dx), self.u(bed[(i + 1) % 4], dx), dxfattribs={"layer": "FURNITURE"})


VARIANTS = ["clean", "two_lines", "gaps", "door_blocks", "mtext_names", "odd_layers", "units_cm", "units_m", "clutter"]
ODD_WALL_LAYERS = ["A-WALL", "TUONG", "0"]


def variants_for(house: House) -> list[str]:
    return list(VARIANTS)


def _drawer(house: House, variant: str, doc) -> Drawer:
    import random
    if variant == "two_lines":
        return TwoLines(doc)
    if variant == "gaps":
        return Gaps(doc, random.Random(f"{house.name}/{variant}"))
    if variant == "door_blocks":
        return DoorBlocks(doc)
    if variant == "mtext_names":
        return MtextNames(doc)
    if variant == "odd_layers":
        return OddLayers(doc, ODD_WALL_LAYERS[HOUSES.index(house) % len(ODD_WALL_LAYERS)])
    if variant == "units_cm":
        return Drawer(doc, unit=100.0)
    if variant == "units_m":
        return Drawer(doc, unit=1.0)
    if variant == "clutter":
        return Clutter(doc)
    return Drawer(doc)


def write_case(house: House, variant: str, out_dir) -> Path:
    if variant not in VARIANTS:
        raise ValueError(f"unknown variant {variant}")
    case = Path(out_dir) / f"{house.name}__{variant}"
    case.mkdir(parents=True, exist_ok=True)
    doc = ezdxf.new("R2010")
    drawer = _drawer(house, variant, doc)
    doc.header["$INSUNITS"] = {MM: 4, 100.0: 5, 1.0: 6}[drawer.unit]
    step = _block_step(house)
    for i, level in enumerate(house.levels):
        drawer.level(level, i * step)
    doc.saveas(case / "drawing.dxf")
    (case / "truth.json").write_text(json.dumps(truth_of(house), indent=1), encoding="utf-8")
    return case


def generate_all(out_dir) -> list[Path]:
    return [write_case(h, v, out_dir) for h in HOUSES for v in variants_for(h)]


if __name__ == "__main__":
    import sys
    print(len(generate_all(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent / "cases")), "cases")
