#!/bin/sh
# save-image.sh — Download/decode image and create metadata sidecar
# Usage: save-image.sh <source> <output_dir> <title> <service> <prompt> [style] [size]
# Source: URL (http...), base64 file path, or image file path
# Output: saved file path to stdout

set -e

SOURCE="${1:?Usage: save-image.sh <source> <output_dir> <title> <service> <prompt> [style] [size]}"
OUTPUT_DIR="${2:?Usage: save-image.sh <source> <output_dir> <title> <service> <prompt> [style] [size]}"
TITLE="${3:?Usage: save-image.sh <source> <output_dir> <title> <service> <prompt> [style] [size]}"
SERVICE="${4:?Usage: save-image.sh <source> <output_dir> <title> <service> <prompt> [style] [size]}"
PROMPT="${5:?Usage: save-image.sh <source> <output_dir> <title> <service> <prompt> [style] [size]}"
STYLE="${6:-}"
SIZE="${7:-1024x1024}"

# Platform detection for base64
OS=$(uname -s)
case "$OS" in
  Darwin) BASE64_DECODE="base64 -D" ;;
  *)      BASE64_DECODE="base64 -d" ;;
esac

# Map service to model name
case "$SERVICE" in
  gemini)          MODEL_NAME="imagen-4.0-generate-001" ;;
  openrouter)      MODEL_NAME="gemini-2.5-flash-image" ;;
  openrouter-gpt5) MODEL_NAME="gpt-5-image" ;;
  zai)             MODEL_NAME="cogview-4-250304" ;;
  openai)          MODEL_NAME="dall-e-3" ;;
  *)               MODEL_NAME="unknown" ;;
esac

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Generate title in kebab-case, max 30 chars
SAFE_TITLE=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')
SAFE_TITLE=$(echo "$SAFE_TITLE" | cut -c1-30 | sed 's/-$//')

# Generate timestamp
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")

# Auto-increment version
VERSION=1
while true; do
  FILENAME="${TIMESTAMP}_${SAFE_TITLE}_${SERVICE}_v${VERSION}.png"
  FILEPATH="${OUTPUT_DIR}/${FILENAME}"
  if [ ! -f "$FILEPATH" ]; then
    break
  fi
  VERSION=$((VERSION + 1))
done

# Acquire image based on source type
case "$SOURCE" in
  http://*)
    echo "Downloading image from URL..." >&2
    curl -s -L --max-time 60 -o "$FILEPATH" "$SOURCE" || { echo "ERROR: Failed to download: $SOURCE" >&2; exit 1; }
    ;;
  https://*)
    echo "Downloading image from URL..." >&2
    curl -s -L --max-time 60 -o "$FILEPATH" "$SOURCE" || { echo "ERROR: Failed to download: $SOURCE" >&2; exit 1; }
    ;;
  *)
    if [ ! -f "$SOURCE" ]; then
      echo "ERROR: Source file not found: $SOURCE" >&2
      exit 1
    fi
    # Detect binary image vs base64 text via magic bytes
    HEADER=$(head -c 4 "$SOURCE" | od -A n -t x1 | tr -d ' ')
    if echo "$HEADER" | grep -qE '^(89504e47|ffd8ff)'; then
      echo "Copying image file..." >&2
      cp "$SOURCE" "$FILEPATH"
    else
      echo "Decoding base64 image..." >&2
      $BASE64_DECODE < "$SOURCE" > "$FILEPATH" || { echo "ERROR: Failed to decode base64 from: $SOURCE" >&2; exit 1; }
    fi
    ;;
esac

# Verify the output file was created and is non-empty
if [ ! -s "$FILEPATH" ]; then
  echo "ERROR: Output file is empty: $FILEPATH" >&2
  exit 1
fi

# Generate ISO 8601 timestamp
ISO_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Create metadata sidecar JSON
SIDECAR="${FILEPATH%.png}.json"

# Escape prompt for JSON (handle quotes and backslashes)
ESCAPED_PROMPT=$(printf '%s' "$PROMPT" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g')

cat > "$SIDECAR" <<ENDJSON
{
  "prompt": "$ESCAPED_PROMPT",
  "provider": "$SERVICE",
  "model": "$MODEL_NAME",
  "style": "$STYLE",
  "timestamp": "$ISO_TIMESTAMP",
  "filename": "$FILENAME",
  "size": "$SIZE"
}
ENDJSON

echo "Metadata saved: $SIDECAR" >&2

# Print saved file path to stdout
echo "$FILEPATH"
