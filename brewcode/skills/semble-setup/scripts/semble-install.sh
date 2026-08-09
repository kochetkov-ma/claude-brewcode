#!/usr/bin/env bash
# semble-install.sh - prerequisite installer for the brewcode:semble-setup skill.
#
# Usage: semble-install.sh <check|uv|coreutils|semble|all> [--yes] [--json] [--tool]
#
#   check     nothing mutating; prints the prereq object. Exit 3 if uv/uvx absent.
#   uv        `brew install uv`. Needs --yes (else exit 4). No brew -> exit 3 and
#             the manual instruction is PRINTED, never executed.
#   coreutils `brew install coreutils` -> gtimeout, so sc_timeout bounds its
#             shell-outs with a real binary instead of the bash watchdog. Soft:
#             a missing brew or a failed install is a warning, never a failure,
#             and never changes `all`'s exit code. Skipped when a timeout binary
#             already exists. Needs --yes when invoked directly.
#   semble    primes the pinned uvx environment with
#             `uvx --from 'semble[mcp]==0.5.4' semble --version`.
#             --tool additionally runs `uv tool install 'semble[mcp]==0.5.4'`.
#   all       check -> uv -> coreutils -> semble.
#
# Default mode is uvx-ephemeral: no `uv tool install`, so no `semble` lands on
# PATH (a bare `semble` invocation starts a blocking MCP server).
# Safe probes are exactly those argv in semble's CLI dispatch set. `--version`
# joined it in 0.5.4 (cli.py:25) and is preferred: same cost as `--help` but it
# prints the resolved X.Y.Z, so the prime run also proves WHICH build uvx served.
# The argv is picked from the pin by sc_semble_probe_arg, not tried and fallen
# back from: on an older SEMBLE_PIN_VERSION override `--version` is unrecognised
# argv and would start the blocking server, so those pins get `--help` instead.
#
# Exit: 0 ok | 1 failed | 2 bad usage | 3 precondition | 4 confirmation needed
set -euo pipefail
SC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/semble-common.sh
# shellcheck disable=SC1091  # unit B ships lib/semble-common.sh
. "$SC_DIR/lib/semble-common.sh"

usage() {
  cat <<'EOF'
semble-install.sh <check|uv|coreutils|semble|all> [--yes] [--json] [--tool]

  check      read-only prereq report (exit 3 when uv/uvx missing)
  uv         brew install uv                (requires --yes)
  coreutils  brew install coreutils -> gtimeout (requires --yes; never fatal)
  semble     prime the pinned uvx env       (--tool also does uv tool install)
  all        check -> uv -> coreutils -> semble

  --yes    confirm the mutating steps
  --json   emit a single JSON object (schema: DESIGN 9.2)
  --tool   also `uv tool install 'semble[mcp]==0.5.4'` (requires --yes)
  -h/--help

Honours SEMBLE_DRY_RUN=1 (print DRY <cmd>, change nothing) and
SEMBLE_NO_NETWORK=1 (skip every brew/uvx call, report precondition).
EOF
}

MODE=""
YES=0
JSON_MODE=0
TOOL=0

while [ $# -gt 0 ]; do
  case "$1" in
    check|uv|coreutils|semble|all)
      if [ -n "$MODE" ]; then sc_err "only one subcommand is allowed" >&2; exit 2; fi
      MODE="$1" ;;
    --yes|-y)  YES=1 ;;
    --json)    JSON_MODE=1 ;;
    --tool)    TOOL=1 ;;
    -h|--help) usage; exit 0 ;;
    *)         sc_err "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if [ -z "$MODE" ]; then sc_err "a subcommand is required" >&2; usage >&2; exit 2; fi

sc_require_node

DRY="${SEMBLE_DRY_RUN:-}"
NONET="${SEMBLE_NO_NETWORK:-}"

STATUS="ok"           # ok | needs_confirmation | precondition | failed
NOTE=""
COMMANDS=""           # newline separated, verbatim
UV_BEFORE=""
UV_AFTER=""
UV_CHANGED="false"
SEMBLE_RESOLVABLE="false"
SEMBLE_TOOL_INSTALLED="false"
SEMBLE_CHANGED="false"
# coreutils step: present | installed | needs_confirmation | skipped | failed.
# `present` is the no-op case (a timeout binary already backs sc_timeout).
COREUTILS_STATUS="present"
COREUTILS_REASON=""
COREUTILS_CHANGED="false"

record() { COMMANDS="${COMMANDS}${COMMANDS:+$'\n'}$1"; }

# Severity ladder: failed > needs_confirmation > precondition > ok.
rank() {
  case "$1" in
    failed)             printf '4\n' ;;
    needs_confirmation) printf '3\n' ;;
    precondition)       printf '2\n' ;;
    *)                  printf '1\n' ;;
  esac
}
raise() {
  local new="$1" msg="${2:-}"
  if [ "$(rank "$new")" -gt "$(rank "$STATUS")" ]; then STATUS="$new"; fi
  if [ -n "$msg" ]; then NOTE="${NOTE:+$NOTE; }$msg"; fi
}

probe_uv()  { sc_bin uv; }
probe_uvx() { sc_bin uvx; }

UV_BEFORE="$(sc_uv_version)"

# ── check ───────────────────────────────────────────────────────────────────
CHECK_RAISED=0
do_check() {
  if [ -z "$(probe_uv)" ] || [ -z "$(probe_uvx)" ]; then
    CHECK_RAISED=1
    raise precondition "uv/uvx not on PATH"
  fi
}

# ── uv ──────────────────────────────────────────────────────────────────────
do_uv() {
  local brew_path
  if [ -n "$(probe_uv)" ] && [ -n "$(probe_uvx)" ]; then
    UV_AFTER="$UV_BEFORE"
    return 0
  fi
  record "brew install uv"
  if [ "$YES" != "1" ]; then
    raise needs_confirmation "brew install uv needs --yes"
    return 0
  fi
  brew_path="$(sc_brew_path)"
  if [ -z "$brew_path" ]; then
    raise precondition "brew is not installed - run this by hand: curl -LsSf https://astral.sh/uv/install.sh | sh"
    return 0
  fi
  if [ "$DRY" = "1" ]; then
    sc_dry "brew install uv" >&2
    return 0
  fi
  if [ "$NONET" = "1" ]; then
    raise precondition "SEMBLE_NO_NETWORK=1 - brew install uv was not run"
    return 0
  fi
  if "$brew_path" install uv >&2; then
    UV_AFTER="$(sc_uv_version)"
    if [ -n "$UV_AFTER" ] && [ "$UV_AFTER" != "$UV_BEFORE" ]; then UV_CHANGED="true"; fi
  else
    raise failed "brew install uv failed"
  fi
}

# ── coreutils ───────────────────────────────────────────────────────────────
# `ok` never outranks anything, so this records a note without escalating.
note() { raise ok "$1"; }

# $1 = "soft" inside `all`: even the missing --yes stays a note there, because a
# degraded bound is still a bound (sc_timeout falls back to its bash watchdog)
# and must not cost `all` its exit 0.
do_coreutils() {
  local soft="${1:-}" brew_path
  if [ "$(sc_timeout_backend)" != "none" ]; then
    COREUTILS_STATUS="present"
    COREUTILS_REASON="$(sc_timeout_backend) already backs sc_timeout"
    return 0
  fi
  record "brew install coreutils"
  if [ "$YES" != "1" ]; then
    COREUTILS_STATUS="needs_confirmation"
    COREUTILS_REASON="brew install coreutils needs --yes"
    if [ "$soft" = "soft" ]; then note "$COREUTILS_REASON (optional)"
    else raise needs_confirmation "$COREUTILS_REASON"; fi
    return 0
  fi
  brew_path="$(sc_brew_path)"
  if [ -z "$brew_path" ]; then
    COREUTILS_STATUS="skipped"
    COREUTILS_REASON="brew is not installed - sc_timeout keeps using its bash watchdog"
    note "coreutils skipped: $COREUTILS_REASON"
    return 0
  fi
  if [ "$DRY" = "1" ]; then
    sc_dry "brew install coreutils" >&2
    COREUTILS_STATUS="skipped"
    COREUTILS_REASON="SEMBLE_DRY_RUN=1"
    return 0
  fi
  if [ "$NONET" = "1" ]; then
    COREUTILS_STATUS="skipped"
    COREUTILS_REASON="SEMBLE_NO_NETWORK=1 - brew install coreutils was not run"
    note "coreutils skipped: $COREUTILS_REASON"
    return 0
  fi
  if "$brew_path" install coreutils >&2; then
    if [ "$(sc_timeout_backend)" != "none" ]; then
      COREUTILS_STATUS="installed"
      COREUTILS_CHANGED="true"
      COREUTILS_REASON=""
    else
      COREUTILS_STATUS="skipped"
      COREUTILS_REASON="brew install coreutils succeeded but no gtimeout landed on PATH"
      note "coreutils: $COREUTILS_REASON"
    fi
  else
    COREUTILS_STATUS="failed"
    COREUTILS_REASON="brew install coreutils failed - sc_timeout keeps using its bash watchdog"
    note "coreutils: $COREUTILS_REASON"
  fi
}

# ── semble ──────────────────────────────────────────────────────────────────
do_semble() {
  local before_tool
  before_tool="$(sc_semble_tool_version)"
  if [ -n "$before_tool" ]; then SEMBLE_TOOL_INSTALLED="true"; fi

  local probe_arg; probe_arg="$(sc_semble_probe_arg)"
  record "uvx --from '$SEMBLE_PIN_SPEC' semble $probe_arg"
  if [ "$TOOL" = "1" ]; then record "uv tool install '$SEMBLE_PIN_SPEC'"; fi

  if [ -z "$(probe_uvx)" ]; then
    raise precondition "uvx is not on PATH - install uv first"
    return 0
  fi
  if [ "$TOOL" = "1" ] && [ "$YES" != "1" ]; then
    raise needs_confirmation "uv tool install needs --yes"
    return 0
  fi
  if [ "$DRY" = "1" ]; then
    sc_dry "uvx --from '$SEMBLE_PIN_SPEC' semble $probe_arg" >&2
    if [ "$TOOL" = "1" ]; then sc_dry "uv tool install '$SEMBLE_PIN_SPEC'" >&2; fi
    return 0
  fi
  if [ "$NONET" = "1" ]; then
    raise precondition "SEMBLE_NO_NETWORK=1 - the pin was not resolved"
    return 0
  fi
  # Deliberately UNBOUNDED, unlike sc_semble_probe: this is the priming run, and
  # on a cold uv cache it downloads 52 packages (semble-grammars alone is 6.9 MiB).
  # A 60 s bound would turn a slow but healthy first install into a hard failure.
  # Safe to leave unbounded only because probe_arg is dispatch-set argv for THIS
  # pin — see sc_semble_probe_arg; unrecognised argv would block forever here.
  local got=""
  if got="$(uvx --from "$SEMBLE_PIN_SPEC" semble "$probe_arg" 2>/dev/null)"; then
    SEMBLE_RESOLVABLE="true"
    # Free extra check the old `--help` probe could not make: the prime run now
    # reports which build uvx actually served.
    if [ "$probe_arg" = "--version" ] && [ "$got" != "$SEMBLE_PIN_VERSION" ]; then
      sc_warn "uvx resolved '$SEMBLE_PIN_SPEC' but semble reports '$got', not $SEMBLE_PIN_VERSION" >&2
    fi
  else
    # semble 0.5.4 depends on semble-grammars, which ships WHEELS ONLY: macOS
    # x86_64/arm64, manylinux2014 x86_64/aarch64, win amd64/arm64. No sdist and
    # no musllinux wheel, so on Alpine there is nothing to install and nothing to
    # build. Naming it here saves the user a hunt through a pip resolver dump.
    local musl="" f
    for f in /lib/ld-musl-*.so.1; do [ -e "$f" ] && musl=1 || true; done
    if [ -n "$musl" ]; then
      raise failed "uvx could not resolve $SEMBLE_PIN_SPEC - this host is musl (Alpine), and semble >= 0.5.3 depends on semble-grammars, which publishes no musllinux wheel and no sdist. Use a glibc image."
    else
      raise failed "uvx could not resolve $SEMBLE_PIN_SPEC"
    fi
    return 0
  fi
  if [ "$TOOL" = "1" ]; then
    if uv tool install "$SEMBLE_PIN_SPEC" >&2; then
      local after_tool
      after_tool="$(sc_semble_tool_version)"
      if [ -n "$after_tool" ]; then SEMBLE_TOOL_INSTALLED="true"; fi
      if [ "$after_tool" != "$before_tool" ]; then SEMBLE_CHANGED="true"; fi
    else
      raise failed "uv tool install $SEMBLE_PIN_SPEC failed"
    fi
  fi
}

case "$MODE" in
  check)     do_check ;;
  uv)        do_uv ;;
  coreutils) do_coreutils ;;
  semble)    do_semble ;;
  all)
    do_check
    do_uv
    do_coreutils soft
    # A missing confirmation or a failed uv step makes the semble step
    # pointless - report what we have instead of chasing a broken PATH.
    if [ "$STATUS" = "ok" ] || [ "$STATUS" = "precondition" ]; then do_semble; fi
    ;;
esac

# `all` runs do_check against the pre-install PATH, and `raise` only escalates,
# so the provisional "uv/uvx not on PATH" would outlive a successful install and
# turn the happy path into exit 3. Clear it only once the end state is healthy.
# Nothing else can leave STATUS=precondition with a resolvable pin: every other
# precondition (no brew, SEMBLE_NO_NETWORK, uvx absent) returns before the pin
# is resolved, so dropping the whole note here cannot swallow a second message.
if [ "$MODE" = "all" ] && [ "$CHECK_RAISED" = "1" ] && [ "$STATUS" = "precondition" ] \
   && [ -n "$(probe_uv)" ] && [ -n "$(probe_uvx)" ] && [ "$SEMBLE_RESOLVABLE" = "true" ]; then
  STATUS="ok"
  NOTE=""
fi

if [ -z "$UV_AFTER" ]; then UV_AFTER="$(sc_uv_version)"; fi
if [ -n "$UV_AFTER" ] && [ "$UV_AFTER" != "$UV_BEFORE" ]; then UV_CHANGED="true"; fi

BREW_PATH="$(sc_brew_path)"
TIMEOUT_BACKEND="$(sc_timeout_backend)"
TIMEOUT_PATH="$(sc_timeout_path)"
# Modes that never run the step still report it honestly: `present` only when a
# binary really is there, otherwise `skipped` with the mode as the reason.
if [ "$MODE" != "coreutils" ] && [ "$MODE" != "all" ]; then
  if [ "$TIMEOUT_BACKEND" = "none" ]; then
    COREUTILS_STATUS="skipped"
    COREUTILS_REASON="the coreutils step does not run in mode $MODE"
  else
    COREUTILS_REASON="$TIMEOUT_BACKEND already backs sc_timeout"
  fi
fi
UVX_PATH="$(probe_uvx)"
UVX_VER="$(sc_uvx_version)"
SEMBLE_TOOLVER="$(sc_semble_tool_version)"
if [ -n "$SEMBLE_TOOLVER" ]; then SEMBLE_TOOL_INSTALLED="true"; fi

EMITTER="$(cat <<'NODEJS'
"use strict";
const fs = require("fs");
const E = process.env;
const cmds = (E.SI_COMMANDS || "").split("\n").filter(function (s) { return s.length > 0; });
const report = {
  schema: 1,
  mode: E.SI_MODE,
  brew: { present: !!E.SI_BREW_PATH, path: E.SI_BREW_PATH || "" },
  uv: { before: E.SI_UV_BEFORE || "", after: E.SI_UV_AFTER || "", changed: E.SI_UV_CHANGED === "true" },
  uvx: { present: !!E.SI_UVX_PATH, version: E.SI_UVX_VER || "" },
  // `bounded` is the invariant callers care about: sc_timeout enforces the bound
  // with a binary when there is one and with its bash watchdog when there is not.
  timeout: {
    backend: E.SI_TMO_BACKEND,
    path: E.SI_TMO_PATH || "",
    bounded: true,
    coreutils: {
      status: E.SI_CU_STATUS,
      reason: E.SI_CU_REASON || "",
      changed: E.SI_CU_CHANGED === "true",
    },
  },
  semble: {
    pin: E.SI_PIN,
    spec: E.SI_SPEC,
    resolvable: E.SI_RESOLVABLE === "true",
    toolInstalled: E.SI_TOOL_INSTALLED === "true",
    changed: E.SI_SEMBLE_CHANGED === "true",
  },
  commands: cmds,
  status: E.SI_STATUS,
};
if (E.SI_NOTE) report.note = E.SI_NOTE;

if (E.SI_JSONMODE === "1") {
  fs.writeSync(1, JSON.stringify(report) + "\n");
} else {
  const L = [];
  const sym = { ok: "✅", needs_confirmation: "⚠️", precondition: "⏭️", failed: "❌" }[report.status] || "⚠️";
  L.push("# Semble install (" + report.mode + ")");
  L.push("");
  L.push("brew:   " + (report.brew.present ? report.brew.path : "absent"));
  L.push("uv:     " + (report.uv.after || "absent") + (report.uv.changed ? "  (installed now)" : ""));
  L.push("uvx:    " + (report.uvx.present ? (report.uvx.version || "present") : "absent"));
  const t = report.timeout;
  L.push("timeout: " + (t.backend === "none" ? "none (bash watchdog)" : t.backend + " " + t.path) +
    " | bounded " + (t.bounded ? "yes" : "no") +
    " | coreutils " + t.coreutils.status + (t.coreutils.reason ? " - " + t.coreutils.reason : ""));
  L.push("semble: pin " + report.semble.pin +
    " | resolvable " + report.semble.resolvable +
    " | uv-tool " + (report.semble.toolInstalled ? "yes" : "no (uvx-ephemeral)"));
  L.push("");
  L.push("commands:");
  if (cmds.length === 0) L.push("  none");
  for (const c of cmds) L.push("  " + c);
  L.push("");
  L.push(sym + " " + report.status + (report.note ? " - " + report.note : ""));
  fs.writeSync(1, L.join("\n") + "\n");
}
NODEJS
)"

SI_MODE="$MODE" \
SI_JSONMODE="$JSON_MODE" \
SI_STATUS="$STATUS" \
SI_NOTE="$NOTE" \
SI_COMMANDS="$COMMANDS" \
SI_BREW_PATH="$BREW_PATH" \
SI_UV_BEFORE="$UV_BEFORE" SI_UV_AFTER="$UV_AFTER" SI_UV_CHANGED="$UV_CHANGED" \
SI_UVX_PATH="$UVX_PATH" SI_UVX_VER="$UVX_VER" \
SI_TMO_BACKEND="$TIMEOUT_BACKEND" SI_TMO_PATH="$TIMEOUT_PATH" \
SI_CU_STATUS="$COREUTILS_STATUS" SI_CU_REASON="$COREUTILS_REASON" SI_CU_CHANGED="$COREUTILS_CHANGED" \
SI_PIN="$SEMBLE_PIN_VERSION" SI_SPEC="$SEMBLE_PIN_SPEC" \
SI_RESOLVABLE="$SEMBLE_RESOLVABLE" \
SI_TOOL_INSTALLED="$SEMBLE_TOOL_INSTALLED" \
SI_SEMBLE_CHANGED="$SEMBLE_CHANGED" \
node -e "$EMITTER"

case "$STATUS" in
  ok)                 exit 0 ;;
  needs_confirmation) exit 4 ;;
  precondition)       exit 3 ;;
  failed)             exit 1 ;;
esac
