#!/usr/bin/env bash
# Usage: ./register_voice.sh /path/to/main_sample.wav
SRC="$1"
if [ -z "$SRC" ]; then
  echo "Usage: $0 /path/to/main_sample.wav"
  exit 1
fi
DEST="./tts_service/voices"
mkdir -p "$DEST"
cp "$SRC" "$DEST/main_sample.wav"
echo "Copied to $DEST/main_sample.wav"

# Example: if your TTS requires creating a speaker embedding file or running a separate
# adaptation step, add commands here. For many Coqui models you can pass speaker_wav
# directly to inference functions and no extra step is required.
