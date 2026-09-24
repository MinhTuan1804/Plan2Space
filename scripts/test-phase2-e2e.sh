#!/usr/bin/env bash
# scripts/test-phase2-e2e.sh — Phase 2 checkpoint, fully containerised:
# register → project → upload (DXF and PNG) → POST /api/ai/vectorize → worker runs the real pipeline
# → job reaches Completed → GET geometry returns the walls the AI wrote back.
set -euo pipefail
cp .env.example .env
trap 'docker compose down -v >/dev/null 2>&1' EXIT
docker compose up -d --build api celery_worker

API=http://127.0.0.1:5000
PY=${PYTHON:-python}
json() { "$PY" -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
    -d '{"email":"e2e@plan2space.dev","password":"Str0ngPass!123"}' $API/api/auth/register || true)
  [ "$code" = "201" ] && break
  sleep 2
done
[ "$code" = "201" ] || { docker compose logs api | tail -30; echo "FAIL: api not up ($code)"; exit 1; }
for i in $(seq 1 60); do docker compose logs celery_worker 2>/dev/null | grep -q "ready\." && break; sleep 2; done

TOKEN=$(curl -sf -H 'Content-Type: application/json' -d '{"email":"e2e@plan2space.dev","password":"Str0ngPass!123"}' \
  $API/api/auth/login | json 'd["accessToken"]')
AUTH="Authorization: Bearer $TOKEN"

run_job() {   # $1 = file to upload; prints the wall count once the job completes
  local project file job status body
  project=$(curl -sf -H "$AUTH" -H 'Content-Type: application/json' -d '{"name":"E2E"}' $API/api/projects | json 'd["id"]')
  file=$(curl -sf -H "$AUTH" -F "file=@$1" $API/api/projects/$project/files | json 'd["fileId"]')
  job=$(curl -sf -H "$AUTH" -H 'Content-Type: application/json' \
    -d "{\"projectId\":\"$project\",\"fileId\":\"$file\"}" $API/api/ai/vectorize | json 'd["jobId"]')
  for i in $(seq 1 90); do
    body=$(curl -sf -H "$AUTH" $API/api/ai/job/$job/status)
    status=$(echo "$body" | json 'd["status"]')
    [ "$status" = "Completed" ] || [ "$status" = "Failed" ] && break
    sleep 2
  done
  [ "$status" = "Completed" ] || { echo "job for $1 ended as: $body" >&2; docker compose logs celery_worker | tail -40 >&2; return 1; }
  curl -sf -H "$AUTH" $API/api/projects/$project/geometry | json 'len(d["walls"])'
}

dxf_walls=$(run_job ai-service/tests/fixtures/sample_house_plan.dxf)
[ "$dxf_walls" = "6" ] || { echo "FAIL: DXF produced $dxf_walls walls, expected 6"; exit 1; }

"$PY" - <<'PY'
import struct, zlib
w = h = 200
rows = []
for y in range(h):
    row = bytearray([0])
    for x in range(w):
        wall = (40 <= y < 42 or 158 <= y < 160) and 40 <= x < 160 or (40 <= x < 42 or 158 <= x < 160) and 40 <= y < 160
        row.append(0 if wall else 255)
    rows.append(bytes(row))
def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0)) \
      + chunk(b"IDAT", zlib.compress(b"".join(rows))) + chunk(b"IEND", b"")
open(".e2e-room.png", "wb").write(png)
PY
png_walls=$(run_job .e2e-room.png); rm -f .e2e-room.png
[ "$png_walls" = "4" ] || { echo "FAIL: PNG produced $png_walls walls, expected 4"; exit 1; }

echo "PASS: DXF → $dxf_walls walls, PNG → $png_walls walls written back by the AI worker"
