#!/usr/bin/env bash
# scripts/test-copilot-stack.sh — co-pilot path API → ai /copilot/parse over the real network (no LLM key:
# it must answer "not configured", not fail), and only `ai` has outbound internet (celery_worker stays isolated).
# Assumes the stack is up (e.g. KEEP_STACK=1 scripts/test-web-stack.sh or `docker compose up -d nginx celery_worker ai`).
set -euo pipefail
# Never let the test hit a real LLM with a key from the developer's shell environment.
OPENAI_API_KEY= COPILOT_API_KEY= docker compose up -d --build ai >/dev/null 2>&1
for i in $(seq 1 30); do docker compose exec -T ai python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" >/dev/null 2>&1 && break; sleep 2; done
PY=${PYTHON:-python}
json() { "$PY" -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
BASE=http://127.0.0.1

curl -s -o /dev/null -H 'Content-Type: application/json' -d '{"email":"copilot-stack@plan2space.dev","password":"Str0ngPass!123"}' $BASE/api/auth/register || true
TOKEN=$(curl -sf -H 'Content-Type: application/json' -d '{"email":"copilot-stack@plan2space.dev","password":"Str0ngPass!123"}' $BASE/api/auth/login | json 'd["accessToken"]')
AUTH="Authorization: Bearer $TOKEN"
PROJECT=$(curl -sf -H "$AUTH" -H 'Content-Type: application/json' -d '{"name":"Copilot"}' $BASE/api/projects | json 'd["id"]')

BODY=$(curl -sf -H "$AUTH" -H 'Content-Type: application/json' -d "{\"projectId\":\"$PROJECT\",\"message\":\"move the left wall 50cm\"}" $BASE/api/copilot/message)
echo "$BODY" | json 'd["action"]' | grep -qx unknown || { echo "FAIL: unexpected co-pilot reply $BODY"; exit 1; }
echo "$BODY" | grep -q "not configured" || { echo "FAIL: expected 'not configured' reply, got $BODY"; exit 1; }

probe='import socket; socket.create_connection(("1.1.1.1", 443), 5); print("egress")'
docker compose exec -T ai python -c "$probe" | grep -q egress || { echo "FAIL: ai cannot reach the LLM API"; exit 1; }
if docker compose exec -T celery_worker python -c "$probe" >/dev/null 2>&1; then echo "FAIL: celery_worker has internet access"; exit 1; fi

echo "PASS: co-pilot API→ai contract works; only ai has outbound internet"
