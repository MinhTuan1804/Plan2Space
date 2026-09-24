#!/usr/bin/env bash
# scripts/test-staging-stack.sh — furniture staging over the real path nginx → API → ai /staging/suggest.
# Assumes the stack is up (e.g. KEEP_STACK=1 scripts/test-web-stack.sh).
set -euo pipefail
PY=${PYTHON:-python}
json() { "$PY" -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
BASE=http://127.0.0.1
curl -s -o /dev/null -H 'Content-Type: application/json' -d '{"email":"staging-stack@plan2space.dev","password":"Str0ngPass!123"}' $BASE/api/auth/register || true
TOKEN=$(curl -sf -H 'Content-Type: application/json' -d '{"email":"staging-stack@plan2space.dev","password":"Str0ngPass!123"}' $BASE/api/auth/login | json 'd["accessToken"]')

# Body from a UTF-8 file: on Windows, non-ASCII command-line args reach native curl in the ANSI code page.
REQ=$(mktemp)
trap 'rm -f "$REQ"' EXIT
printf '%s' '{"roomPolygon":[[0,0],[4,0],[4,4],[0,4],[0,0]],"roomLabel":"Phòng ngủ"}' > "$REQ"
BODY=$(curl -sf -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json; charset=utf-8' --data-binary @"$REQ" $BASE/api/staging/suggest)

FIRST=$(echo "$BODY" | json 'd["items"][0]["item"]')
[ "$FIRST" = "bed" ] || { echo "FAIL: expected a bed first, got $BODY"; exit 1; }
echo "PASS: staging suggests $(echo "$BODY" | json 'len(d["items"])') items for 'Phòng ngủ' via nginx → API → ai"
