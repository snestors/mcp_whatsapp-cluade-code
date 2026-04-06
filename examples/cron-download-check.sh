#!/bin/bash
# Example cron script: checks download progress and notifies via WhatsApp when complete
# Add to crontab: */5 * * * * /path/to/cron-download-check.sh
#
# Customize SEARCH_TERM, QB_URL, and PHONE for your use case.

API_URL="${WA_API_URL:-http://127.0.0.1:3457}"
QB_URL="${QB_API_URL:-http://127.0.0.1:8080}"
PHONE="${NOTIFY_PHONE:?Set NOTIFY_PHONE env var}"
SEARCH_TERM="${SEARCH_TERM:-MyDownload}"
DONE_FLAG="/tmp/download-notified-$(echo "$SEARCH_TERM" | tr ' ' '_')"

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Skip if already notified
[ -f "$DONE_FLAG" ] && exit 0

# Check torrent progress via qBittorrent API
PROGRESS=$(curl -s "$QB_URL/api/v2/torrents/info" 2>/dev/null | python3 -c "
import json,sys
try:
  for t in json.load(sys.stdin):
    if '$SEARCH_TERM' in t['name']:
      print(f\"{t['progress']*100:.1f}\")
      break
except: pass
" 2>/dev/null)

[ -z "$PROGRESS" ] && exit 0

# If 100%, notify and set flag
if [ "$PROGRESS" = "100.0" ]; then
  "$SCRIPT_DIR/notify.sh" "$PHONE" "$SEARCH_TERM ya termino de descargar!"
  touch "$DONE_FLAG"
fi
