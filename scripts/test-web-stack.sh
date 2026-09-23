#!/usr/bin/env bash
# scripts/test-web-stack.sh — the public entrypoint (nginx :80) serves the SPA, deep links, and proxies /api.
set -euo pipefail
cp .env.example .env
trap '[ -z "${KEEP_STACK:-}" ] && docker compose down -v >/dev/null 2>&1' EXIT
docker compose up -d --build nginx celery_worker

for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
    -d '{"email":"stack@plan2space.dev","password":"Str0ngPass!123"}' http://127.0.0.1/api/auth/register || true)
  [ "$code" = "201" ] && break
  sleep 2
done
[ "$code" = "201" ] || { docker compose logs nginx web api | tail -40; echo "FAIL: /api via nginx returned $code"; exit 1; }
curl -sf http://127.0.0.1/ | grep -q '<div id="root">' || { echo "FAIL: SPA index not served"; exit 1; }
curl -sf http://127.0.0.1/studio/some-project-id | grep -q '<div id="root">' || { echo "FAIL: deep link not served by SPA fallback"; exit 1; }
echo "PASS: nginx serves the SPA (incl. deep links) and proxies /api"
