#!/bin/bash
# deploy-common.sh -- shared helpers for the brewtools:deploy scripts.
#
# Source, never execute:
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   . "$SCRIPT_DIR/lib/deploy-common.sh"
#
# Why this exists: GNU `timeout` is Homebrew-only on macOS, which is this
# plugin's primary local platform. `timeout 30 gh ...` on a stock Mac exits 127
# before gh ever runs, and every caller used to render that as "the GitHub API
# is unavailable" or "FAILED trigger" -- a dispatch that was never attempted.
# `ght` always enforces the bound (real binary when present, built-in watchdog
# otherwise) and `ght_reason` keeps a missing tool distinguishable from a
# genuine remote failure.

dc_have() { command -v "$1" >/dev/null 2>&1; }

# ght_backend -- which watchdog backs `ght`: timeout | gtimeout | bash.
# `bash` is the built-in watchdog below, NOT an unbounded run: on stock macOS it
# is the normal answer, never a degraded one. DEPLOY_TIMEOUT_BIN overrides the
# detection; `none` forces the built-in path (used by the test suite).
ght_backend() {
    local ovr="${DEPLOY_TIMEOUT_BIN:-}"
    if [ -n "$ovr" ]; then
        if [ "$ovr" != "none" ] && dc_have "$ovr"; then printf '%s\n' "${ovr##*/}"; else printf 'bash\n'; fi
        return 0
    fi
    if dc_have timeout; then printf 'timeout\n'
    elif dc_have gtimeout; then printf 'gtimeout\n'
    else printf 'bash\n'; fi
}

# ght_watch SECONDS CMD [ARG...] -- dependency-free stand-in for GNU `timeout`.
# `set -m` puts the child in its own process group so the whole tree dies, not
# just the wrapper. The deadline is WALL CLOCK from bash's own $SECONDS (summing
# requested sleeps is not the same number under load). `-gt` not `-ge`: $SECONDS
# is captured inside a second, so `-ge` could fire almost a full second early.
# 124 is reported only when the deadline passed AND the child died of a signal.
ght_watch() {
    local secs="${1:?ght needs seconds}"; shift
    local had_m=0; case "$-" in *m*) had_m=1 ;; esac
    set -m
    "$@" &
    local pid=$!
    [ "$had_m" = "1" ] || set +m
    local t0=$SECONDS slept=0 step=1 timedout=0 rc=0
    while kill -0 "$pid" 2>/dev/null; do
        if [ "$(( SECONDS - t0 ))" -gt "$secs" ]; then timedout=1; break; fi
        sleep "$(printf '0.%02d' "$step")" 2>/dev/null || sleep 1
        slept=$(( slept + step ))
        if   [ "$slept" -ge 100 ]; then step=25
        elif [ "$slept" -ge 10 ];  then step=5
        fi
    done
    exec 3>&2 2>/dev/null
    if [ "$timedout" = "1" ]; then
        kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
        sleep 0.1
        kill -KILL "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
    fi
    wait "$pid" 2>/dev/null || rc=$?
    exec 2>&3 3>&-
    if [ "$timedout" = "1" ] && [ "$rc" -ge 128 ]; then rc=124; fi
    return "$rc"
}

# ght SECONDS CMD [ARG...] -- run CMD under an upper bound that is ALWAYS
# enforced. Every argument stays its own argv element, so nothing is re-parsed
# by a shell. Exit: 124 = timed out (GNU convention), else CMD's own status.
ght() {
    local secs="${1:?ght needs seconds}"; shift
    local backend; backend="$(ght_backend)"
    case "$backend" in
        bash) ght_watch "$secs" "$@" ;;
        *)    "$backend" "$secs" "$@" ;;
    esac
}

# ght_reason RC -- classify a bounded run so callers never collapse four
# distinct outcomes into one sentinel:
#   ok | timeout | no_tool (the command itself is not installed) | failed.
ght_reason() {
    case "${1:-1}" in
        0)   printf 'ok\n' ;;
        124) printf 'timeout\n' ;;
        127) printf 'no_tool\n' ;;
        *)   printf 'failed\n' ;;
    esac
}
