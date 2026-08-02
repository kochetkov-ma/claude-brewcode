#!/usr/bin/env bash
# repo-b fixture entry point - classified only, never executed.
set -euo pipefail

QUEUE_CAPACITY="${QUEUE_CAPACITY:-128}"
echo "starting repo-b worker with capacity ${QUEUE_CAPACITY}"
exec python3 -c "print('entry point main function')"
