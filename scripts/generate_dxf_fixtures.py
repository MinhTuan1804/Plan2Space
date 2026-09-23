# scripts/generate_dxf_fixtures.py  (run once from the repo root, not part of the app)
import ezdxf

# Fixture 1: two raw LWPOLYLINE walls on layer "WALLS"
doc = ezdxf.new()
msp = doc.modelspace()
doc.layers.add(name="WALLS")
msp.add_lwpolyline([(0, 0), (5, 0)], dxfattribs={"layer": "WALLS"})
msp.add_lwpolyline([(5, 0), (5, 4)], dxfattribs={"layer": "WALLS"})
doc.saveas("ai-service/tests/fixtures/simple_walls.dxf")

# Fixture 2 (Review Focus): walls modeled as a BLOCK definition inserted via INSERT,
# which a naive "only read LWPOLYLINE in modelspace" parser will miss entirely.
doc2 = ezdxf.new()
block = doc2.blocks.new(name="WALL_SEGMENT")
block.add_lwpolyline([(0, 0), (3, 0)], dxfattribs={"layer": "WALLS"})
msp2 = doc2.modelspace()
doc2.layers.add(name="WALLS")
msp2.add_blockref("WALL_SEGMENT", insert=(0, 0))
msp2.add_blockref("WALL_SEGMENT", insert=(0, 3))
doc2.saveas("ai-service/tests/fixtures/walls_with_block_inserts.dxf")

# Fixture 3: nested inserts — OUTER places WALL_SEGMENT at (10, 0); modelspace places OUTER at (0, 5).
# The wall must land at (10, 5)-(13, 5): inner transform first, then the outer one.
doc3 = ezdxf.new()
doc3.layers.add(name="WALLS")
seg = doc3.blocks.new(name="WALL_SEGMENT")
seg.add_lwpolyline([(0, 0), (3, 0)], dxfattribs={"layer": "WALLS"})
outer = doc3.blocks.new(name="OUTER")
outer.add_blockref("WALL_SEGMENT", insert=(10, 0))
doc3.modelspace().add_blockref("OUTER", insert=(0, 5))
doc3.saveas("ai-service/tests/fixtures/nested_block_inserts.dxf")

# Fixture 4: block content drawn on layer "0" inherits the INSERT's layer ("A-WALL" here);
# walls also drawn as plain LINE entities and on a Vietnamese-named layer ("TUONG").
doc4 = ezdxf.new()
for name in ("A-WALL", "TUONG", "FURNITURE"):
    doc4.layers.add(name=name)
generic = doc4.blocks.new(name="GENERIC_WALL")
generic.add_line((0, 0), (4, 0), dxfattribs={"layer": "0"})
msp4 = doc4.modelspace()
msp4.add_blockref("GENERIC_WALL", insert=(0, 0), dxfattribs={"layer": "A-WALL"})
msp4.add_line((0, 2), (4, 2), dxfattribs={"layer": "TUONG"})
msp4.add_line((1, 1), (2, 1), dxfattribs={"layer": "FURNITURE"})   # must be ignored
doc4.saveas("ai-service/tests/fixtures/layer0_and_lines.dxf")

# Fixture 5: nothing on any wall-like layer — the parser must fail loudly, not return zero walls.
doc5 = ezdxf.new()
doc5.layers.add(name="SKETCH")
doc5.modelspace().add_line((0, 0), (5, 0), dxfattribs={"layer": "SKETCH"})
doc5.saveas("ai-service/tests/fixtures/no_wall_layers.dxf")

# Fixture 6: drawing in millimetres ($INSUNITS = 4) — output must be project-space metres.
doc6 = ezdxf.new()
doc6.header["$INSUNITS"] = 4
doc6.layers.add(name="WALLS")
doc6.modelspace().add_lwpolyline([(0, 0), (5000, 0)], dxfattribs={"layer": "WALLS"})
doc6.saveas("ai-service/tests/fixtures/walls_in_millimetres.dxf")
