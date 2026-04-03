#!/bin/sh
# glm-extract.sh — Extract files from GLM API response
# Usage: glm-extract.sh <response.json> <output_dir>
# Parses ===FILE: path=== ... ===END_FILE=== markers from response content
# Falls back to single index.html if no markers found

set -e

RESPONSE="${1:?Usage: glm-extract.sh <response.json> <output_dir>}"
OUTPUT_DIR="${2:?Usage: glm-extract.sh <response.json> <output_dir>}"

[ -f "$RESPONSE" ] || { echo "ERROR: Response not found: $RESPONSE" >&2; exit 1; }

# Validate OUTPUT_DIR has no shell metacharacters
case "$OUTPUT_DIR" in
  *[\'\"\`\$\;\|\&\(\)\{\}\[\]\#\!\~\\\ ]*)
    echo "ERROR: OUTPUT_DIR contains unsafe characters: $OUTPUT_DIR" >&2
    exit 1
    ;;
esac

CONTENT=$(jq -r '.choices[0].message.content // empty' "$RESPONSE")

if [ -z "$CONTENT" ]; then
  echo "ERROR: No content in response" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

if printf '%s\n' "$CONTENT" | grep -q '===FILE:'; then
  # Extract content to temp file to avoid shell escaping issues
  TMPFILE=$(mktemp)
  trap "rm -f '$TMPFILE'" EXIT
  jq -r '.choices[0].message.content' "$RESPONSE" > "$TMPFILE"

  awk -v outdir="$OUTPUT_DIR" '
  /^===FILE: / {
    fname = $0
    sub(/^===FILE: */, "", fname)
    sub(/ *===.*$/, "", fname)
    sub(/=+$/, "", fname)
    # Sanitize: only allow safe chars in filenames
    gsub(/[^a-zA-Z0-9._\/\-]/, "", fname)
    gsub(/^\/+/, "", fname)
    # Reject any path with .. (traversal attempt)
    if (fname ~ /\.\./) { next }
    if (fname == "") { next }
    current_file = outdir "/" fname
    writing = 1
    next
  }
  /^===END_FILE===/ {
    if (writing && current_file != "") {
      close(current_file)
      file_count++
      print "  " fname " (" lines " lines)" > "/dev/stderr"
      lines = 0
    }
    writing = 0
    next
  }
  writing {
    # Ensure parent directory exists on first write
    if (lines == 0) {
      dir = current_file
      sub(/\/[^\/]*$/, "", dir)
      cmd = "mkdir -p '\''" dir "'\''"
      system(cmd)
      close(cmd)
      printf "" > current_file
      close(current_file)
    }
    print >> current_file
    lines++
  }
  END {
    print "Extracted " file_count " file(s)" > "/dev/stderr"
  }
  ' "$TMPFILE"
else
  echo "No ===FILE: markers found. Trying markdown code block extraction..." >&2

  CLEAN=$(printf '%s\n' "$CONTENT" | sed -n '/^```html/,/^```$/p' | sed '1d;$d')

  if [ -z "$CLEAN" ]; then
    CLEAN="$CONTENT"
    echo "WARNING: No structured format detected. Saving raw content as index.html" >&2
  fi

  printf '%s\n' "$CLEAN" > "$OUTPUT_DIR/index.html"
  echo "Extracted 1 file(s)" >&2
  echo "  index.html ($(printf '%s\n' "$CLEAN" | wc -l | tr -d ' ') lines)" >&2
fi

echo "" >&2
echo "Output directory: $OUTPUT_DIR" >&2
ls -la "$OUTPUT_DIR" >&2
