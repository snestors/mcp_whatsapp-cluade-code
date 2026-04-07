#!/bin/bash
# Cron script: checks F1 download progress and notifies via WhatsApp when complete
# Add to crontab: */5 * * * * /media/hdd/mcp-whatsapp/cron-f1-check.sh

API_URL="http://127.0.0.1:3457"
QB_URL="http://192.168.1.57:8080"
PHONE="51922743968"
DONE_FLAG="/tmp/f1-download-notified"

# Skip if already notified
[ -f "$DONE_FLAG" ] && exit 0

# Check F1 torrent progress
PROGRESS=$(curl -s "$QB_URL/api/v2/torrents/info" 2>/dev/null | python3 -c "
import json,sys
try:
  for t in json.load(sys.stdin):
    if 'F1' in t['name']:
      print(f\"{t['progress']*100:.1f}\")
      break
except: pass
" 2>/dev/null)

[ -z "$PROGRESS" ] && exit 0

# If 100%, notify and set flag
if [ "$PROGRESS" = "100.0" ]; then
  /media/hdd/mcp-whatsapp/notify.sh "$PHONE" "La pelicula F1 ya termino de descargar! Lista para ver."
  touch "$DONE_FLAG"
fi
