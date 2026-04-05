#!/bin/bash
# Utility script to send WhatsApp messages via the bridge API
# Usage: ./notify.sh <phone> <message>

API_URL="${WA_API_URL:-http://127.0.0.1:3457}"
PHONE="${1:?Usage: notify.sh <phone> <message>}"
shift
MESSAGE="$*"

curl -s -X POST "$API_URL/send" \
  -H "Content-Type: application/json" \
  -d "{\"phone\": \"$PHONE\", \"message\": \"$MESSAGE\"}" | python3 -c "import json,sys; r=json.load(sys.stdin); print('OK' if r.get('ok') else f'Error: {r.get(\"error\")}')" 2>/dev/null
