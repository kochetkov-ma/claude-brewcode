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
    if (writing && current_file != "") {
      close(current_file)
      print "WARNING: Truncated file (no ===END_FILE===): " fname > "/dev/stderr"
    }
    print "Extracted " file_count " file(s)" > "/dev/stderr"
  }
  ' "$TMPFILE"
else
  echo "No ===FILE: markers found. Trying code block extraction..." >&2

  # Extract all fenced code blocks with language tags
  BLOCK_NUM=0
  printf '%s\n' "$CONTENT" | awk -v outdir="$OUTPUT_DIR" '
  BEGIN {
    # Language to default filename mapping
    map["html"] = "index.html"
    map["htm"] = "index.html"
    map["css"] = "styles.css"
    map["js"] = "script.js"
    map["javascript"] = "script.js"
    map["jsx"] = "App.jsx"
    map["tsx"] = "App.tsx"
    map["ts"] = "main.ts"
    map["typescript"] = "main.ts"
    map["dart"] = "main.dart"
    map["yaml"] = "pubspec.yaml"
    map["yml"] = "pubspec.yaml"
    map["json"] = "package.json"
    map[""] = "index.html"
  }
  /^```[a-zA-Z]/ {
    lang = $0
    sub(/^```/, "", lang)
    sub(/[^a-zA-Z0-9].*/, "", lang)
    lang = tolower(lang)
    in_block = 1
    content = ""
    next
  }
  /^```$/ && in_block {
    in_block = 0
    if (content != "") {
      # Determine filename
      base = map[lang]
      if (base == "") base = "file." lang

      # Handle duplicates
      if (seen[base]++) {
        ext_pos = index(base, ".")
        if (ext_pos > 0) {
          name_part = substr(base, 1, ext_pos - 1)
          ext_part = substr(base, ext_pos)
          base = name_part seen[base] ext_part
        } else {
          base = base seen[base]
        }
      }

      fname = outdir "/" base
      printf "%s", content > fname
      close(fname)
      lines_count = split(content, arr, "\n") - 1
      print "  " base " (" lines_count " lines)" > "/dev/stderr"
      file_count++
    }
    next
  }
  in_block {
    content = content $0 "\n"
  }
  END {
    if (file_count > 0) {
      print "Extracted " file_count " file(s) from code blocks" > "/dev/stderr"
    }
  }
  '

  # Check if any files were extracted
  EXTRACTED=$(find "$OUTPUT_DIR" -type f 2>/dev/null | wc -l | tr -d ' ')

  if [ "$EXTRACTED" -eq 0 ]; then
    echo "WARNING: No code blocks found. Saving raw content as index.html" >&2
    printf '%s\n' "$CONTENT" > "$OUTPUT_DIR/index.html"
    echo "  index.html ($(printf '%s\n' "$CONTENT" | wc -l | tr -d ' ') lines)" >&2
    echo "Extracted 1 file(s) (raw fallback)" >&2
  fi
fi

echo "" >&2
echo "Output directory: $OUTPUT_DIR" >&2
ls -la "$OUTPUT_DIR" >&2
