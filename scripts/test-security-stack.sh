#!/usr/bin/env bash
# scripts/test-security-stack.sh — through the public nginx: security headers, per-IP login throttling with
# the real client address (a spoofed X-Forwarded-For must not buy a fresh budget), admin endpoints gated by role.
# Assumes the stack is up (e.g. KEEP_STACK=1 scripts/test-web-stack.sh). Spends this IP's login budget for ~1 min.
set -euo pipefail
BASE=http://127.0.0.1

headers=$(curl -s -D - -o /dev/null $BASE/)
for h in "X-Content-Type-Options: nosniff" "X-Frame-Options: DENY" "Referrer-Policy: strict-origin-when-cross-origin"; do
  echo "$headers" | grep -qi "$h" || { echo "FAIL: missing header '$h'"; exit 1; }
done

# Standard user is forbidden from admin endpoints.
curl -s -o /dev/null -H 'Content-Type: application/json' -d '{"email":"sec-user@plan2space.dev","password":"Str0ngPass!123"}' $BASE/api/auth/register || true
TOKEN=$(curl -sf -H 'Content-Type: application/json' -d '{"email":"sec-user@plan2space.dev","password":"Str0ngPass!123"}' $BASE/api/auth/login \
  | python -c "import json,sys; print(json.load(sys.stdin)['accessToken'])")
code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" $BASE/api/admin/users)
[ "$code" = "403" ] || { echo "FAIL: standard user got $code from /api/admin/users"; exit 1; }

# Brute force: each attempt claims a different X-Forwarded-For; nginx appends the real address and the API uses it.
last=000
for i in $(seq 1 12); do
  last=$(curl -s -o /dev/null -w '%{http_code}' -H "X-Forwarded-For: 203.0.113.$i" -H 'Content-Type: application/json' \
    -d "{\"email\":\"victim@plan2space.dev\",\"password\":\"guess$i\"}" $BASE/api/auth/login)
done
[ "$last" = "429" ] || { echo "FAIL: login attempt 12 returned $last, expected 429"; exit 1; }

echo "PASS: security headers, admin gated by role, login throttled per real client IP"
