#!/usr/bin/env bash
# scripts/test-ai-queue-bridge.sh — a raw-JSON job (exactly what the .NET API publishes) reaches
# the Celery worker over real RabbitMQ and runs vectorize_job.
set -euo pipefail
cp -n .env.example .env || true
trap 'docker compose down -v >/dev/null 2>&1' EXIT
docker compose up -d --wait rabbitmq redis
docker compose up -d celery_worker
for i in $(seq 1 60); do docker compose logs celery_worker 2>/dev/null | grep -q "ready\." && break; sleep 2; done
docker compose exec -T celery_worker python - <<'PY'
import json, os, pika
conn = pika.BlockingConnection(pika.URLParameters(os.environ["RABBITMQ_URL"].rstrip("/") + "/%2F"))
ch = conn.channel()
ch.queue_declare("ai.vectorize.jobs", durable=True)
ch.basic_publish("", "ai.vectorize.jobs", json.dumps({
    "job_id": "00000000-0000-0000-0000-00000000b1d9",
    "project_id": "11111111-1111-1111-1111-111111111111",
    "file_object_key": "projects/x/y.png"}),
    pika.BasicProperties(content_type="application/json", delivery_mode=2))
conn.close()
PY
for i in $(seq 1 30); do
  docker compose logs celery_worker 2>/dev/null | grep -q "vectorize_job\[.*\] succeeded" && { echo "PASS: raw JSON job bridged to vectorize_job"; exit 0; }
  sleep 2
done
docker compose logs celery_worker | tail -30
echo "FAIL: vectorize_job never ran"; exit 1
