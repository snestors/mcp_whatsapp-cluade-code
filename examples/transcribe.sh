#!/bin/bash
# Transcribe audio file using whisper.cpp
# Usage: transcribe.sh <audio_file> [language]
# Returns transcribed text to stdout

WHISPER_DIR="/media/usb/whisper.cpp"
MODEL="$WHISPER_DIR/models/ggml-tiny.bin"
CLI="$WHISPER_DIR/build/bin/whisper-cli"
LANG="${2:-es}"

if [ -z "$1" ] || [ ! -f "$1" ]; then
  echo "Error: file not found: $1" >&2
  exit 1
fi

TMPWAV=$(mktemp /tmp/whisper_XXXXXX.wav)
trap "rm -f '$TMPWAV'" EXIT

# Convert to 16kHz mono WAV
ffmpeg -y -i "$1" -ar 16000 -ac 1 -c:a pcm_s16le "$TMPWAV" 2>/dev/null
if [ $? -ne 0 ]; then
  echo "Error: ffmpeg conversion failed" >&2
  exit 1
fi

# Transcribe (no-timestamps for clean output)
"$CLI" -m "$MODEL" -l "$LANG" -nt -f "$TMPWAV" 2>/dev/null | sed '/^$/d' | sed 's/^ *//'
