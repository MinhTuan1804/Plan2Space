"""The benchmark's houses, as rooms and openings in metres. Walls and answers are derived from these."""
from dataclasses import dataclass, field

Pt = tuple[float, float]


@dataclass
class RoomSpec:
    name: str
    type: str | None          # a web RoomType, or None (stairs, corridors)
    points: list[Pt]          # closed ring


@dataclass
class OpeningSpec:
    type: str                 # 'Door' | 'Window'
    centre: Pt
    width: float


@dataclass
class Level:
    rooms: list[RoomSpec]
    openings: list[OpeningSpec]
    height: float = 3.6
    stair_entry: Pt | None = None           # just inside the stair well's door
    stair_exit: list[Pt] | None = None      # (upper level) where the top of the stair must open


@dataclass
class House:
    name: str
    levels: list[Level]
    gap_m: float = 10.0       # two storeys: how far apart the blocks are drawn
    wall_layers: list[str] = field(default_factory=lambda: ["WALL"])


def R(name: str, type_: str | None, x0: float, y0: float, x1: float, y1: float) -> RoomSpec:
    return RoomSpec(name, type_, [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)])


def P(name: str, type_: str | None, *pts: Pt) -> RoomSpec:
    return RoomSpec(name, type_, [*pts, pts[0]])


def D(x: float, y: float, w: float = 0.9) -> OpeningSpec:
    return OpeningSpec("Door", (x, y), w)


def W(x: float, y: float, w: float = 1.2) -> OpeningSpec:
    return OpeningSpec("Window", (x, y), w)


HOUSES: list[House] = [
    # 1. Tube house, stair core in the middle (5 x 18 m).
    House("case01_nha_ong_loi_giua", [Level([
        R("PHONG KHACH", "living", 0, 0, 5, 6.5),
        R("WC 1", "bathroom", 0, 6.5, 2.4, 8.5),
        R("O CAU THANG", None, 0, 8.5, 2.4, 11.5),
        R("HANH LANG THANG", None, 2.4, 6.5, 5, 11.5),
        R("BEP + PHONG AN", "kitchen", 0, 11.5, 5, 16),
        R("SAN SAU + GIAT", "storage", 0, 16, 5, 18),
    ], [
        D(2.5, 0, 2.4), W(5, 3.5, 1.4), D(3.7, 6.5, 1.2), D(2.4, 7.5), D(2.4, 10.0, 1.0),
        D(3.7, 11.5, 1.2), W(5, 14.0, 1.4), D(2.5, 16, 1.0), D(1.5, 18, 1.0), W(3.8, 18, 1.2),
    ])]),
    # 2. Townhouse, single-flight stair along the side (4 x 15 m).
    House("case02_nha_pho_thang_hong", [Level([
        R("PHONG KHACH", "living", 0, 0, 4, 5.2),
        R("BEP + PHONG AN", "kitchen", 0, 5.2, 4, 9),
        R("WC TRET", "bathroom", 0, 9, 2, 10.8),
        R("KHO", "storage", 2, 9, 4, 10.8),
        R("PHONG NGU 1", "bedroom", 0, 10.8, 4, 15),
    ], [
        D(2.0, 0, 2.2), D(2.0, 5.2, 1.4), D(1.0, 9, 0.8), D(3.0, 9, 0.8),
        D(3.0, 10.8, 0.9), W(2.0, 15, 1.4), W(4, 7.0, 1.2),
    ])]),
    # 3. Single-storey L-shaped house.
    House("case03_nha_cap4_chu_l", [Level([
        R("PHONG KHACH", "living", 0, 0, 6, 5),
        R("PHONG NGU 1", "bedroom", 6, 0, 10, 5),
        R("HANH LANG", None, 0, 5, 6, 6.5),
        R("BEP", "kitchen", 0, 6.5, 3.5, 11),
        R("WC", "bathroom", 3.5, 6.5, 6, 9),
        R("PHONG NGU 2", "bedroom", 3.5, 9, 6, 11),
    ], [
        D(3.0, 0, 1.4), W(8.0, 0, 1.4), D(6, 2.5), D(3.0, 5, 1.2), W(10, 2.5, 1.2),
        D(1.75, 6.5), D(4.75, 6.5, 0.8), D(6, 10.0, 0.8), W(0, 8.5, 1.2), W(1.75, 11, 1.2),
    ])]),
    # 4. House round an inner courtyard.
    House("case04_nha_san_trong_courtyard", [Level([
        R("PHONG KHACH", "living", 0, 0, 9, 4),
        R("PHONG NGU 1", "bedroom", 0, 4, 3, 8),
        R("SAN TRONG", "courtyard", 3, 4, 6, 8),
        R("BEP + AN", "kitchen", 6, 4, 9, 8),
        R("PHONG NGU 2", "bedroom", 0, 8, 5, 11),
        R("WC", "bathroom", 5, 8, 9, 11),
    ], [
        D(4.5, 0, 1.6), W(1.5, 0, 1.2), W(7.5, 0, 1.2), D(1.5, 4), D(4.5, 4, 1.2), D(7.5, 4),
        D(1.5, 8), D(7.0, 8, 0.8), W(0, 6.0, 1.2), W(2.5, 11, 1.2),
    ])]),
    # 5. Two-bedroom apartment.
    House("case05_can_ho_chung_cu_2pn", [Level([
        R("PHONG KHACH", "living", 0, 0, 5, 4.5),
        R("BEP", "kitchen", 5, 0, 8, 3),
        R("LO GIA", "balcony", 5, 3, 8, 4.5),
        R("HANH LANG", None, 0, 4.5, 8, 5.7),
        R("PHONG NGU 1", "bedroom", 0, 5.7, 3.5, 9.5),
        R("WC 1", "bathroom", 3.5, 5.7, 5, 9.5),
        R("PHONG NGU 2", "bedroom", 5, 5.7, 8, 8),
        R("WC 2", "bathroom", 5, 8, 8, 9.5),
    ], [
        D(2.5, 0, 1.0), D(5, 1.5, 0.9), D(6.5, 3, 0.9), D(2.5, 4.5, 1.4), D(1.75, 5.7),
        D(4.25, 5.7, 0.7), D(6.5, 5.7), D(6.5, 8, 0.7), W(0, 7.5, 1.2), W(0, 2.2, 1.6),
    ])]),
    # 6. Open studio.
    House("case06_can_ho_studio_open", [Level([
        R("PHONG KHACH + NGU", "living", 0, 0, 6, 5),
        R("BEP", "kitchen", 0, 5, 3.5, 7.5),
        R("WC", "bathroom", 3.5, 5, 6, 7.5),
    ], [
        D(3.0, 0, 1.0), W(6, 2.5, 1.6), D(1.75, 5, 1.4), D(4.75, 5, 0.8), W(0, 6.25, 1.0),
    ])]),
    # 7. Mini villa, ground floor.
    House("case07_biet_thu_mini_2tang", [Level([
        R("SANH", None, 0, 0, 3, 3),
        R("GARA", "garage", 3, 0, 8, 5),
        R("PHONG KHACH", "living", 0, 3, 3, 9),
        R("PHONG THO", "altar", 3, 5, 5.5, 9),
        R("KHO", "storage", 5.5, 5, 8, 7),
        R("WC", "bathroom", 5.5, 7, 8, 9),
        R("BEP + AN", "kitchen", 0, 9, 8, 12),
    ], [
        D(1.5, 0, 1.2), D(5.5, 0, 2.6), D(1.5, 3, 1.2), D(3, 4.0), D(3, 7.0), D(6.75, 5, 0.8),
        D(6.75, 9, 0.8), D(1.5, 9, 1.2), W(0, 6.0, 1.4), W(4.0, 12, 1.6),
    ])]),
    # 8. Corner lot with a cut corner (a diagonal wall).
    House("case08_nha_lo_goc_vat_xeo", [Level([
        P("PHONG KHACH", "living", (0, 0), (5, 0), (7, 2), (7, 6), (0, 6)),
        R("PHONG NGU 1", "bedroom", 0, 6, 4, 10),
        R("WC", "bathroom", 4, 6, 7, 8),
        R("BEP", "kitchen", 4, 8, 7, 10),
    ], [
        D(2.5, 0, 1.4), W(6.0, 1.0, 1.4), W(7, 4.0, 1.2), D(2.0, 6), D(5.5, 6, 0.8),
        D(4, 9.0), W(2.0, 10, 1.2),
    ])]),
    # 9. Townhouse with a light well.
    House("case09_nha_pho_thong_tang", [Level([
        R("PHONG KHACH", "living", 0, 0, 5, 6),
        R("GIENG TROI", "courtyard", 0, 6, 2, 9),
        R("HANH LANG", None, 2, 6, 5, 9),
        R("BEP + AN", "kitchen", 0, 9, 5, 13),
        R("WC", "bathroom", 0, 13, 5, 15),
    ], [
        D(2.5, 0, 2.2), D(3.5, 6, 1.2), D(2, 7.5, 0.9), D(3.5, 9, 1.2), D(2.5, 13, 0.8), W(2.5, 15, 1.0),
    ])]),
    # 10. Traditional three-bay house.
    House("case10_nha_3_gian_truyen_thong", [Level([
        R("GIAN THO", "altar", 3.5, 0, 7, 5),
        R("GIAN TRAI", "bedroom", 0, 0, 3.5, 5),
        R("GIAN PHAI", "bedroom", 7, 0, 10.5, 5),
        R("HIEN SAU", None, 0, 5, 10.5, 6.5),
        R("BEP", "kitchen", 0, 6.5, 5, 9),
        R("WC", "bathroom", 5, 6.5, 10.5, 9),
    ], [
        D(5.25, 0, 1.6), D(1.75, 0, 1.2), D(8.75, 0, 1.2), D(3.5, 2.5), D(7, 2.5),
        D(5.25, 5, 1.2), D(2.5, 6.5), D(7.75, 6.5, 0.8), W(0, 7.75, 1.2), W(10.5, 7.75, 1.0),
    ])]),
    # 11. Two storeys drawn side by side (after nha_2tang_pa_a): stair well, two light wells.
    House("case11_nha_2_tang_thong_tang", [
        Level([
            R("GARAGE", "garage", 0, 0, 3.4, 5.8),
            R("LIVING ROOM", "living", 3.4, 0, 10, 5.8),
            R("STAIRS", None, 0, 5.8, 2.8, 9.6),
            R("CORRIDOR", None, 2.8, 5.8, 4.4, 9.6),
            R("GUEST WC", "bathroom", 4.4, 5.8, 6.4, 8.4),
            R("LIGHT WELL 1", "courtyard", 4.4, 8.4, 6.4, 9.6),
            R("KITCHEN", "kitchen", 6.4, 5.8, 10, 9.6),
            R("LIGHT WELL 2", "courtyard", 0, 9.6, 1.9, 11),
            P("STORE + LAUNDRY", "storage", (1.9, 9.6), (2.8, 9.6), (2.8, 13.6), (0, 13.6), (0, 11), (1.9, 11)),
            R("BEDROOM 1", "bedroom", 2.8, 9.6, 6.8, 13.6),
            R("WC 1", "bathroom", 6.8, 11.4, 8.8, 13.6),
            P("DINING", "dining", (6.8, 9.6), (10, 9.6), (10, 13.6), (8.8, 13.6), (8.8, 11.4), (6.8, 11.4)),
        ], [
            D(1.7, 0, 2.6), D(6.7, 0, 1.2), D(3.4, 3.0), D(2.8, 7.0), D(4.4, 7.1, 0.8),
            D(8.2, 5.8, 1.2), D(3.6, 9.6), D(2.8, 12.5, 0.8), D(7.8, 11.4, 0.8), D(8.4, 9.6, 1.2),
            W(8.2, 0, 1.4), W(10, 7.7, 1.4), W(4.8, 13.6, 1.4),
        ], stair_entry=(2.5, 7.0)),
        Level([
            R("BEDROOM 3", "bedroom", 0, 0, 3.4, 5.8),
            R("ALTAR ROOM", "altar", 3.4, 0, 6.4, 4.2),
            R("ALTAR STORE", "storage", 3.4, 4.2, 6.4, 5.8),
            P("MASTER BEDROOM", "bedroom", (6.4, 0), (10, 0), (10, 3.6), (8, 3.6), (8, 5.8), (6.4, 5.8)),
            R("WC 2", "bathroom", 8, 3.6, 10, 5.8),
            P("STAIRS / CORRIDOR", None, (0, 5.8), (6.4, 5.8), (6.4, 6.9), (4.4, 6.9), (4.4, 9.6), (0, 9.6)),
            R("WC 3", "bathroom", 4.4, 6.9, 6.4, 8.4),
            R("LIGHT WELL 1", "courtyard", 4.4, 8.4, 6.4, 9.6),
            R("CORRIDOR CROSS", None, 6.4, 5.8, 10, 6.9),
            P("FAMILY AREA", "living", (6.4, 6.9), (10, 6.9), (10, 13.6), (6.8, 13.6), (6.8, 9.6), (6.4, 9.6)),
            R("LIGHT WELL 2", "courtyard", 0, 9.6, 1.9, 11),
            P("DRYING YARD", "storage", (1.9, 9.6), (2.8, 9.6), (2.8, 13.6), (0, 13.6), (0, 11), (1.9, 11)),
            R("BEDROOM 4", "bedroom", 2.8, 9.6, 6.8, 13.6),
        ], [
            D(1.7, 5.8), D(4.9, 5.8), D(5.4, 6.9, 0.8), D(6.4, 6.35, 0.68), D(7.2, 5.8), D(9.0, 5.8, 0.8),
            D(8.2, 6.9, 1.4), D(3.6, 9.6), D(2.8, 12.5, 0.8), D(4.9, 4.2, 0.9),
            W(1.7, 0, 1.4), W(4.9, 0, 1.2), W(8.2, 0, 1.4), W(10, 10.5, 1.4),
        ], stair_exit=[(2.8, 5.8), (6.4, 5.8), (6.4, 6.9), (2.8, 6.9), (2.8, 5.8)]),
    ]),
]
