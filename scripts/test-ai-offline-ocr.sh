#!/usr/bin/env bash
# scripts/test-ai-offline-ocr.sh — the ai image reads dimension text with NO network (as on p2s_internal).
set -euo pipefail
docker run --rm --network none plan2space-ai python -c "
from PIL import Image, ImageDraw, ImageFont
img = Image.new('L', (400, 100), 255)
ImageDraw.Draw(img).text((40, 20), '3000', fill=0, font=ImageFont.load_default(size=40))
img.save('/tmp/d.png')
from pipeline.ocr_dimensions import extract_dimensions
r = extract_dimensions('/tmp/d.png')
assert [d['text'] for d in r] == ['3000'], r
print('PASS: offline OCR in container')
"
