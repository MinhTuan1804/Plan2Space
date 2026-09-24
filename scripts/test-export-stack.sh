#!/usr/bin/env bash
# scripts/test-export-stack.sh — every export format over the real path nginx → API → ai /export → MinIO,
# checked by opening the files with real parsers inside the ai image (trimesh, ifcopenshell, pypdfium2).
# Assumes the stack is up (e.g. KEEP_STACK=1 scripts/test-web-stack.sh).
set -euo pipefail
PY=${PYTHON:-python}
json() { "$PY" -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
BASE=http://127.0.0.1
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT

curl -s -o /dev/null -H 'Content-Type: application/json' -d '{"email":"export-stack@plan2space.dev","password":"Str0ngPass!123"}' $BASE/api/auth/register || true
TOKEN=$(curl -sf -H 'Content-Type: application/json' -d '{"email":"export-stack@plan2space.dev","password":"Str0ngPass!123"}' $BASE/api/auth/login | json 'd["accessToken"]')
AUTH="Authorization: Bearer $TOKEN"
PROJECT=$(curl -sf -H "$AUTH" -H 'Content-Type: application/json' -d '{"name":"Nha Mau"}' $BASE/api/projects | json 'd["id"]')

# L-shaped wall with a door and a window, one room with a Vietnamese label (UTF-8 body from a file).
WALL=$("$PY" -c "import uuid; print(uuid.uuid4())")
cat > "$OUT/geometry.json" <<EOF
{"baseVersion":0,
 "walls":[{"id":"$WALL","points":[{"x":0,"y":0},{"x":5,"y":0},{"x":5,"y":4}],"thicknessMeters":0.2,"heightMeters":2.8}],
 "rooms":[{"label":"Phòng khách","points":[{"x":0,"y":0.2},{"x":4.8,"y":0.2},{"x":4.8,"y":4},{"x":0,"y":4},{"x":0,"y":0.2}]}],
 "openings":[{"wallId":"$WALL","type":"Door","position":{"x":2.5,"y":0},"widthMeters":0.9,"sillHeightMeters":0},
             {"wallId":"$WALL","type":"Window","position":{"x":5,"y":2},"widthMeters":1.2,"sillHeightMeters":0.9}]}
EOF
curl -sf -H "$AUTH" -H 'Content-Type: application/json; charset=utf-8' --data-binary @"$OUT/geometry.json" -X PUT $BASE/api/projects/$PROJECT/geometry >/dev/null

for fmt in glb gltf obj ifc pdf; do
  code=$(curl -s -H "$AUTH" -X POST -d "" -D "$OUT/$fmt.headers" -o "$OUT/plan.$fmt" -w '%{http_code}' "$BASE/api/export/$PROJECT?format=$fmt")
  [ "$code" = "200" ] || { echo "FAIL: export $fmt -> HTTP $code: $(head -c 400 "$OUT/plan.$fmt")"; exit 1; }
  grep -qi "filename=Nha-Mau.$fmt" "$OUT/$fmt.headers" || { echo "FAIL: $fmt download name"; cat "$OUT/$fmt.headers"; exit 1; }
done

# Validate with real parsers in the ai image (same libraries the exporter uses).
docker compose cp "$OUT/." ai:/tmp/exports >/dev/null
docker compose exec -T ai python - <<'PY'
import io, json, trimesh, ifcopenshell, pypdfium2 as pdfium
d = "/tmp/exports/plan."
glb = trimesh.load(d + "glb", force="mesh"); ext = glb.bounds[1] - glb.bounds[0]
assert abs(ext[1] - 2.8) < 1e-3, f"glb not Y-up / wrong height: {ext}"
assert abs(max(ext[0], ext[2]) - 5.1) < 1e-3, f"glb footprint wrong: {ext}"
assert all(b["uri"].startswith("data:") for b in json.load(open(d + "gltf"))["buffers"]), "gltf not self-contained"
assert trimesh.load(d + "obj", force="mesh").volume > 0, "obj empty"
ifc = ifcopenshell.open(d + "ifc")
assert (len(ifc.by_type("IfcWall")), len(ifc.by_type("IfcDoor")), len(ifc.by_type("IfcWindow"))) == (2, 1, 1), "ifc content"
text = pdfium.PdfDocument(d + "pdf")[0].get_textpage().get_text_range()
assert "Phòng khách" in text and "Bill of quantities" in text, "pdf content"
print("ok")
PY

ASSETS=$(docker compose exec -T postgres psql -U p2s -d plan2space -tAc "select count(*) from \"Assets3D\" where \"ProjectId\"='$PROJECT'")
[ "$ASSETS" = "5" ] || { echo "FAIL: expected 5 Asset3D rows, got $ASSETS"; exit 1; }
echo "PASS: glb/gltf/obj/ifc/pdf exported via nginx → API → ai, valid per trimesh/ifcopenshell/pdfium, 5 assets stored"
