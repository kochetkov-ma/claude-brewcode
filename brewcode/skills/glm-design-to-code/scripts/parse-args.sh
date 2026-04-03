#!/bin/sh
# parse-args.sh — Parse glm-design-to-code skill arguments
# Usage: parse-args.sh [args...]
# Output: KEY=VALUE pairs to stdout

set -e

IMAGE=""
RESULT_IMAGE=""
INPUT_TYPE=""
FRAMEWORK="html"
PROFILE="max"
PROVIDER="zai"
OUTPUT="./d2c-output"
REVIEW="false"
MODE="create"
FIX_TEXT=""
REVIEW_FILE=""
MODEL=""
MAX_TOKENS=""

while [ $# -gt 0 ]; do
  case "$1" in
    --framework|-f)
      FRAMEWORK="${2:?--framework requires value: html|react|flutter|custom}"
      shift 2
      ;;
    --profile|-p)
      PROFILE="${2:?--profile requires value: max|optimal|efficient}"
      shift 2
      ;;
    --provider)
      PROVIDER="${2:?--provider requires value: zai|openrouter}"
      shift 2
      ;;
    --output|-o)
      OUTPUT="${2:?--output requires value: directory path}"
      shift 2
      ;;
    --review|-r)
      MODE="review"
      REVIEW="true"
      shift
      ;;
    --fix)
      MODE="fix"
      # Check if next arg is a value (not a flag)
      if [ $# -gt 1 ] && [ "${2#-}" = "$2" ]; then
        FIX_TEXT="$2"
        shift
      fi
      shift
      ;;
    --review-file)
      REVIEW_FILE="${2:?--review-file requires a path}"
      shift 2
      ;;
    --model|-m)
      MODEL="${2:?--model requires a model ID}"
      shift 2
      ;;
    --*)
      echo "WARNING: Unknown flag: $1" >&2
      shift
      ;;
    *)
      if [ -z "$IMAGE" ]; then
        IMAGE="$1"
      elif [ -z "$RESULT_IMAGE" ]; then
        RESULT_IMAGE="$1"
      else
        echo "WARNING: Extra argument ignored: $1" >&2
      fi
      shift
      ;;
  esac
done

# Detect input type from IMAGE value
if [ -n "$IMAGE" ]; then
  case "$IMAGE" in
    http://*|https://*)
      INPUT_TYPE="url"
      ;;
    *.png|*.jpg|*.jpeg|*.webp|*.gif)
      INPUT_TYPE="image"
      ;;
    *.html|*.htm)
      INPUT_TYPE="html"
      ;;
    *)
      # If it's a file that exists and is an image, treat as image
      if [ -f "$IMAGE" ] && file --mime-type "$IMAGE" 2>/dev/null | grep -qE ': image/'; then
        INPUT_TYPE="image"
      elif [ -f "$IMAGE" ]; then
        # Existing file but not image — treat as HTML/text file
        INPUT_TYPE="html"
      else
        # Not a file, not a URL — treat as text description
        INPUT_TYPE="text"
      fi
      ;;
  esac
fi

# Validate framework
case "$FRAMEWORK" in
  html|react|flutter|custom) ;;
  *) echo "ERROR: Invalid framework: $FRAMEWORK (use: html, react, flutter, custom)" >&2; exit 1 ;;
esac

# Validate profile
case "$PROFILE" in
  max|optimal|efficient) ;;
  *) echo "ERROR: Invalid profile: $PROFILE (use: max, optimal, efficient)" >&2; exit 1 ;;
esac

# Map profile to max_tokens
case "$PROFILE" in
  max) MAX_TOKENS=32768 ;;
  optimal) MAX_TOKENS=16384 ;;
  efficient) MAX_TOKENS=8192 ;;
esac

# Validate provider
case "$PROVIDER" in
  zai|openrouter) ;;
  *) echo "ERROR: Invalid provider: $PROVIDER (use: zai, openrouter)" >&2; exit 1 ;;
esac

echo "IMAGE=$IMAGE"
echo "FRAMEWORK=$FRAMEWORK"
echo "PROFILE=$PROFILE"
echo "PROVIDER=$PROVIDER"
echo "OUTPUT=$OUTPUT"
echo "REVIEW=$REVIEW"
echo "MODE=$MODE"
echo "FIX_TEXT=$FIX_TEXT"
echo "RESULT_IMAGE=$RESULT_IMAGE"
echo "REVIEW_FILE=$REVIEW_FILE"
echo "MODEL=$MODEL"
echo "INPUT_TYPE=$INPUT_TYPE"
echo "MAX_TOKENS=$MAX_TOKENS"

if [ -z "$IMAGE" ]; then
  echo "IMAGE_MISSING=true"
  echo "NOTE: No screenshot path provided. Will ask user." >&2
fi
