#!/usr/bin/env bash
# scripts/test-api-container.sh — Phase 1 checkpoint: the api image boots, migrates, and serves auth.
set -euo pipefail
cp -n .env.example .env || true
trap 'docker compose down -v >/dev/null 2>&1' EXIT
docker compose up -d --build api
code=000
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
    -d '{"email":"smoke@plan2space.dev","password":"Str0ngPass!123"}' http://127.0.0.1:5000/api/auth/register || true)
  [ "$code" = "201" ] && break
  sleep 2
done
docker compose ps api
[ "$code" = "201" ] || { docker compose logs api | tail -30; echo "FAIL: register returned $code"; exit 1; }
curl -sf -H 'Content-Type: application/json' -d '{"email":"smoke@plan2space.dev","password":"Str0ngPass!123"}' \
  http://127.0.0.1:5000/api/auth/login | grep -q accessToken
echo "PASS: api container boots, migrates and serves auth"
