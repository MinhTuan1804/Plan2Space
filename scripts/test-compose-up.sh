#!/usr/bin/env bash
# scripts/test-compose-up.sh
set -euo pipefail
cp .env.example .env
docker compose up -d postgres redis rabbitmq minio
for i in $(seq 1 30); do
  healthy=$(docker compose ps --format json | grep -c '"Health":"healthy"' || true)
  [ "$healthy" -ge 3 ] && break
  sleep 2
done
docker compose ps
docker compose exec -T postgres pg_isready -U p2s
docker compose down -v
echo "PASS: infra services start and report healthy"
