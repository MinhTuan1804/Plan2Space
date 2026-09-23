#!/usr/bin/env bash
# scripts/smoke-test-full-stack.sh — whole stack from a clean build, runnable locally and in CI:
# register → login → project → upload DXF → vectorize → job Completed (status API and WebSocket via nginx)
# → geometry has the DXF's walls → export glTF and PDF.
#
# Runs as its own compose project on its own port, without docker-compose.override.yml and with
# .env.example, so it never touches a developer's running stack or their .env.
set -euo pipefail
cd "$(dirname "$0")/.."

if python3 -c "" >/dev/null 2>&1; then PY=${PYTHON:-python3}; else PY=${PYTHON:-python}; fi   # Windows has a python3 stub
export COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-p2s-smoke}
export P2S_HTTP_PORT=${P2S_HTTP_PORT:-8088}
export OPENAI_API_KEY="" COPILOT_API_KEY=""          # never call a real LLM from the smoke test
COMPOSE=(docker compose -f docker-compose.yml --env-file .env.example)
BASE=http://127.0.0.1:$P2S_HTTP_PORT
OUT=$(mktemp -d)
json() { "$PY" -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

cleanup() {
  status=$?
  if [ $status -ne 0 ]; then "${COMPOSE[@]}" logs --tail 40 api celery_worker nginx 2>/dev/null || true; fi
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$OUT"
  exit $status
}
trap cleanup EXIT

"${COMPOSE[@]}" up -d --build --wait nginx celery_worker

echo "Waiting for the API through nginx..."
for i in $(seq 1 60); do
  curl -sf "$BASE/api/health" >/dev/null 2>&1 && break
  sleep 3
done
curl -sf "$BASE/api/health" >/dev/null || { echo "FAIL: /api/health never became ready"; exit 1; }

EMAIL="smoke-$(date +%s)@plan2space.dev"
PASSWORD="Str0ngPass!123"
curl -sf -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" >/dev/null
TOKEN=$(curl -sf -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | json 'd["accessToken"]')
AUTH="Authorization: Bearer $TOKEN"

PROJECT_ID=$(curl -sf -X POST "$BASE/api/projects" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Smoke Test House"}' | json 'd["id"]')
FILE_ID=$(curl -sf -X POST "$BASE/api/projects/$PROJECT_ID/files" -H "$AUTH" \
  -F "file=@ai-service/tests/fixtures/sample_house_plan.dxf" | json 'd["fileId"]')
JOB_ID=$(curl -sf -X POST "$BASE/api/ai/vectorize" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"projectId\":\"$PROJECT_ID\",\"fileId\":\"$FILE_ID\"}" | json 'd["jobId"]')

STATUS=""
for i in $(seq 1 60); do
  BODY=$(curl -sf "$BASE/api/ai/job/$JOB_ID/status" -H "$AUTH")
  STATUS=$(echo "$BODY" | json 'd["status"]')
  [ "$STATUS" = "Completed" ] || [ "$STATUS" = "Failed" ] && break
  sleep 2
done
[ "$STATUS" = "Completed" ] || { echo "FAIL: job ended as: $BODY"; exit 1; }

# The job WebSocket through nginx, authenticated with ?access_token=: a finished job sends its final state and closes.
# Uses the ai image (it has `websockets`) as a throwaway client on the public network.
docker run --rm --network "${COMPOSE_PROJECT_NAME}_p2s_public" -e URL="ws://nginx/ws/job/$JOB_ID?access_token=$TOKEN" \
  plan2space-ai python -c "
import asyncio, json, os, websockets
async def main():
    async with websockets.connect(os.environ['URL']) as ws:
        frame = json.loads(await asyncio.wait_for(ws.recv(), 10))
        assert frame == {'status': 'Completed', 'progressPercent': 100}, frame
asyncio.run(main())
" || { echo "FAIL: job WebSocket via nginx"; exit 1; }

WALL_COUNT=$(curl -sf "$BASE/api/projects/$PROJECT_ID/geometry" -H "$AUTH" | json 'len(d["walls"])')
[ "$WALL_COUNT" -eq 6 ] || { echo "FAIL: expected the DXF's 6 walls, got $WALL_COUNT"; exit 1; }

curl -sf -o "$OUT/export.gltf" -X POST -d "" "$BASE/api/export/$PROJECT_ID?format=gltf" -H "$AUTH"
"$PY" -c "import json,sys; d=json.load(open(sys.argv[1])); assert d['meshes'], 'no meshes'" "$OUT/export.gltf" \
  || { echo "FAIL: gltf export"; exit 1; }
curl -sf -o "$OUT/report.pdf" -X POST -d "" "$BASE/api/export/$PROJECT_ID?format=pdf" -H "$AUTH"
[ "$(head -c 4 "$OUT/report.pdf")" = "%PDF" ] || { echo "FAIL: pdf export"; exit 1; }

echo "PASS: full-stack smoke test succeeded end to end"
