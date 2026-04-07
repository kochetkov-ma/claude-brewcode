#!/bin/sh
# parse-args.sh — Parse image-gen skill arguments
# Usage: parse-args.sh [args...]
# Output: KEY=VALUE pairs to stdout

set -e

PROMPT=""
MODE="generate"
SERVICE="openrouter"
STYLE="photo"
COUNT="1"
OUTPUT=".claude/reports/images/"
SIZE="1024x1024"
EDIT_IMAGE=""
EDIT_INSTRUCTIONS=""

while [ $# -gt 0 ]; do
  case "$1" in
    --edit)
      MODE="edit"
      EDIT_IMAGE="${2:?--edit requires <image_path> <instructions>}"
      EDIT_INSTRUCTIONS="${3:?--edit requires <image_path> <instructions>}"
      shift 3
      ;;
    --config)
      MODE="config"
      shift
      ;;
    --update)
      MODE="update"
      shift
      ;;
    --service|-s)
      SERVICE="${2:?--service requires value: gemini|openrouter|openai}"
      shift 2
      ;;
    --style)
      STYLE="${2:?--style requires value: photo|illustration|art}"
      shift 2
      ;;
    --count|-n)
      COUNT="${2:?--count requires value: 1-10}"
      shift 2
      ;;
    --output|-o)
      OUTPUT="${2:?--output requires value: directory path}"
      shift 2
      ;;
    --size)
      SIZE="${2:?--size requires value: WxH format}"
      shift 2
      ;;
    --*)
      echo "WARNING: Unknown flag: $1" >&2
      shift
      ;;
    *)
      if [ -z "$PROMPT" ]; then
        PROMPT="$1"
      else
        PROMPT="$PROMPT $1"
      fi
      shift
      ;;
  esac
done

# Validate service
case "$SERVICE" in
  gemini|openrouter|openrouter-gpt5|zai|openai) ;;
  *) echo "ERROR: Invalid service: $SERVICE (use: gemini, openrouter, openrouter-gpt5, zai, openai)" >&2; exit 1 ;;
esac

# Validate style
case "$STYLE" in
  photo|illustration|art) ;;
  *) echo "ERROR: Invalid style: $STYLE (use: photo, illustration, art)" >&2; exit 1 ;;
esac

# Validate count is 1-10
if [ "$COUNT" -lt 1 ] 2>/dev/null || [ "$COUNT" -gt 10 ] 2>/dev/null; then
  echo "ERROR: Invalid count: $COUNT (must be 1-10)" >&2
  exit 1
fi
case "$COUNT" in
  [1-9]|10) ;;
  *) echo "ERROR: Invalid count: $COUNT (must be integer 1-10)" >&2; exit 1 ;;
esac

# Validate size format (WxH)
case "$SIZE" in
  *x*)
    WIDTH="${SIZE%%x*}"
    HEIGHT="${SIZE#*x}"
    case "$WIDTH" in
      ''|*[!0-9]*) echo "ERROR: Invalid size width: $SIZE (use WxH format, e.g. 1024x1024)" >&2; exit 1 ;;
    esac
    case "$HEIGHT" in
      ''|*[!0-9]*) echo "ERROR: Invalid size height: $SIZE (use WxH format, e.g. 1024x1024)" >&2; exit 1 ;;
    esac
    ;;
  *) echo "ERROR: Invalid size format: $SIZE (use WxH format, e.g. 1024x1024)" >&2; exit 1 ;;
esac

echo "PROMPT=$PROMPT"
echo "MODE=$MODE"
echo "SERVICE=$SERVICE"
echo "STYLE=$STYLE"
echo "COUNT=$COUNT"
echo "OUTPUT=$OUTPUT"
echo "SIZE=$SIZE"
echo "EDIT_IMAGE=$EDIT_IMAGE"
echo "EDIT_INSTRUCTIONS=$EDIT_INSTRUCTIONS"

if [ -z "$PROMPT" ] && [ "$MODE" = "generate" ]; then
  echo "PROMPT_MISSING=true"
  echo "NOTE: No prompt provided. Will ask user." >&2
else
  echo "PROMPT_MISSING=false"
fi
