#!/usr/bin/env bash
# run-parallel.sh - runs one command per stdin line (`[VAR=val ...] cmd args`, word-split, no eval), JOBS at a time.
# Prints each log as a CI group with rc and seconds; rc 1 when any command fails or no command is given.
set -uo pipefail

JOBS="${JOBS:-$(nproc 2>/dev/null || sysctl -n hw.ncpu)}"
LOGS="$(mktemp -d)"
# Read loop, not mapfile: macOS /bin/bash 3.2 has no mapfile; keeps an unterminated last line.
LINES=()
while IFS= read -r line || [ -n "$line" ]; do LINES+=("$line"); done < <(grep -vE '^[[:space:]]*(#|$)' || true)
[ "${#LINES[@]}" -gt 0 ] || { echo "::error::run-parallel.sh: no commands on stdin"; exit 1; }

# bash < 4.3 (macOS 3.2) lacks `wait -n`: free a slot by waiting on the oldest running job.
if [ "${BASH_VERSINFO[0]}" -gt 4 ] || { [ "${BASH_VERSINFO[0]}" -eq 4 ] && [ "${BASH_VERSINFO[1]}" -ge 3 ]; }; then
  wait_slot() { wait -n || true; }
else
  wait_slot() { local pid; pid=$(jobs -rp | head -n 1); [ -z "$pid" ] || wait "$pid" || true; }
fi

launch() {
  local i="$1" start rc
  read -ra argv <<< "${LINES[$i]}"
  start=$(date +%s)
  env "${argv[@]}" < /dev/null > "$LOGS/$i.log" 2>&1
  rc=$?
  printf '%s %s\n' "$rc" "$(( $(date +%s) - start ))" > "$LOGS/$i.rc"
}

for i in "${!LINES[@]}"; do
  while [ "$(jobs -rp | wc -l)" -ge "$JOBS" ]; do wait_slot; done
  launch "$i" &
done
wait

fail=0
for i in "${!LINES[@]}"; do
  read -r rc secs < "$LOGS/$i.rc"
  echo "::group::[rc=$rc ${secs}s] ${LINES[$i]}"
  cat "$LOGS/$i.log"
  echo "::endgroup::"
  [ "$rc" -eq 0 ] || { echo "::error::failed (rc=$rc): ${LINES[$i]}"; fail=1; }
done
for i in "${!LINES[@]}"; do
  read -r rc secs < "$LOGS/$i.rc"
  printf '%4ss rc=%s  %s\n' "$secs" "$rc" "${LINES[$i]}"
done
exit "$fail"
