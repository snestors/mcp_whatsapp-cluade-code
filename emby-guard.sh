#!/bin/bash
# emby-guard.sh - Pausa descargas qBittorrent cuando Emby está transmitiendo
# Detecta sesiones activas via API de Emby (Sessions con NowPlayingItem)

QBIT_URL="http://127.0.0.1:8080"
EMBY_URL="http://127.0.0.1:8096"
EMBY_TOKEN_FILE="/home/nestor/.emby_guard_token"
CHECK_INTERVAL=20  # segundos entre checks
LOG_TAG="emby-guard"

# --- Obtener token Emby (si está guardado) ---
get_emby_token() {
    if [ -f "$EMBY_TOKEN_FILE" ]; then
        cat "$EMBY_TOKEN_FILE"
    fi
}

# --- Verificar si hay streams activos ---
is_streaming() {
    local token=$(get_emby_token)

    if [ -n "$token" ]; then
        # Usar API de Sessions para detectar NowPlayingItem
        local sessions
        sessions=$(curl -sf --max-time 5 "$EMBY_URL/Sessions?api_key=$token" 2>/dev/null)
        if [ $? -eq 0 ] && [ -n "$sessions" ]; then
            local playing
            playing=$(echo "$sessions" | python3 -c "
import json, sys
try:
    sessions = json.load(sys.stdin)
    playing = [s for s in sessions if s.get('NowPlayingItem')]
    print(len(playing))
except:
    print(-1)
" 2>/dev/null)
            if [ "$playing" -gt 0 ] 2>/dev/null; then
                return 0  # streaming
            elif [ "$playing" -eq 0 ] 2>/dev/null; then
                return 1  # no streaming
            fi
            # Si falla el parse, caer a método alternativo
        fi
    fi

    # Método de respaldo: contar conexiones ESTABLISHED a puerto 8096 desde IPs LAN
    local lan_conns
    lan_conns=$(ss -tn state established 2>/dev/null | awk '{print $4}' | grep ':8096$' | grep -v '127\.0\.0\.1\|::1' | wc -l)
    [ "$lan_conns" -gt 1 ]
}

# --- Control qBittorrent ---
pause_downloads() {
    curl -sf -X POST "$QBIT_URL/api/v2/torrents/pause" --data "hashes=all" > /dev/null 2>&1
    logger -t "$LOG_TAG" "Emby streaming detectado — descargas PAUSADAS"
}

resume_downloads() {
    curl -sf -X POST "$QBIT_URL/api/v2/torrents/resume" --data "hashes=all" > /dev/null 2>&1
    logger -t "$LOG_TAG" "Sin streaming — descargas REANUDADAS"
}

get_qbit_state() {
    curl -sf --max-time 5 "$QBIT_URL/api/v2/torrents/info?filter=downloading" 2>/dev/null | \
        python3 -c "import json,sys; d=json.load(sys.stdin); states=set(t.get('state','') for t in d); print('paused' if all('Paused' in s or 'paused' in s for s in states) and states else 'active')" 2>/dev/null
}

# --- Loop principal ---
logger -t "$LOG_TAG" "Iniciado — monitoreando sesiones Emby cada ${CHECK_INTERVAL}s"
prev_state=""

while true; do
    if is_streaming; then
        if [ "$prev_state" != "paused" ]; then
            pause_downloads
            prev_state="paused"
        fi
    else
        if [ "$prev_state" != "active" ]; then
            resume_downloads
            prev_state="active"
        fi
    fi
    sleep "$CHECK_INTERVAL"
done
