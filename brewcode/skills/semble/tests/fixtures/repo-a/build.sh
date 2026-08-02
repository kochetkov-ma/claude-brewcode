#!/usr/bin/env bash
# Fixture build script - never executed by the suite, only classified.
set -euo pipefail

TARGET="${1:-all}"

case "$TARGET" in
  all)   echo "building everything" ;;
  api)   echo "building the api module" ;;
  web)   echo "building the web module" ;;
  *)     echo "unknown target: $TARGET" >&2; exit 2 ;;
esac
