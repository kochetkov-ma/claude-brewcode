#!/usr/bin/env bash
# semble-status.sh - read-only status/doctor for the brewcode:semble-setup skill.
#
# Usage: semble-status.sh [--json] [--section SECTION] [--strict]
#                         [--section telemetry [--sid ID] [--last N]]
#
# STRICTLY READ-ONLY. It creates, modifies and deletes nothing, anywhere -
# not the state file, not the reminder throttle marker, not the cache dir.
# The report is composed from the sibling scripts; a missing or failing
# sibling yields {"error":"..."} for that section and the run still exits 0.
#
# Never runs bare `semble` (any unknown argv starts a blocking MCP server),
# never `semble install`, never `claude mcp add/remove`.
set -euo pipefail
SC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/semble-common.sh
# shellcheck disable=SC1091  # unit B ships lib/semble-common.sh
. "$SC_DIR/lib/semble-common.sh"

usage() {
  cat <<'EOF'
semble-status.sh [--json] [--section SECTION] [--strict]

  --json             emit a single JSON object (schema: DESIGN 9.1)
  --section SECTION  prereq|mcp|cache|guidance|agents|coverage|state|telemetry|all
                     (default: all; `telemetry` is NOT part of `all`)
  --strict           exit 1 when verdict != ready
  -h, --help         this text

  --section telemetry reads .claude/semble/telemetry.jsonl and reports what the
  hooks actually did. Window flags, telemetry only:
  --sid ID           only records from session ID (default: every session)
  --last N           only the last N records (applied after --sid)

Exit: 0 report produced | 1 strict failure or internal error | 2 bad usage
Read-only: nothing is ever written.
EOF
}

JSON_MODE=0
SECTION="all"
STRICT=0
SID=""
LAST=""

while [ $# -gt 0 ]; do
  case "$1" in
    --json)        JSON_MODE=1 ;;
    --strict)      STRICT=1 ;;
    --section)     shift; SECTION="${1:-}" ;;
    --section=*)   SECTION="${1#--section=}" ;;
    --sid)         shift; SID="${1:-}" ;;
    --sid=*)       SID="${1#--sid=}" ;;
    --last)        shift; LAST="${1:-}" ;;
    --last=*)      LAST="${1#--last=}" ;;
    -h|--help)     usage; exit 0 ;;
    *)             sc_err "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift || true
done

case "$SECTION" in
  prereq|mcp|cache|guidance|agents|coverage|state|telemetry|all) ;;
  *) sc_err "unknown section: ${SECTION:-(empty)}" >&2; usage >&2; exit 2 ;;
esac
if [ "$SECTION" != "telemetry" ] && { [ -n "$SID" ] || [ -n "$LAST" ]; }; then
  sc_err "--sid/--last are only valid with --section telemetry" >&2; usage >&2; exit 2
fi
case "$LAST" in
  ''|*[!0-9]*) [ -z "$LAST" ] || { sc_err "--last must be a non-negative integer: $LAST" >&2; exit 2; } ;;
esac

sc_require_node

want() { [ "$SECTION" = "all" ] || [ "$SECTION" = "$1" ]; }

# ── telemetry (--section telemetry): the reader for semble-stats.mjs ─────────
# Deliberately NOT part of `all`: it answers a different question (did the hooks
# do anything) from a different source (.claude/semble/telemetry.jsonl), and the
# `all` report is an install-health report. Read-only like everything here.
TELEMETRY_READER="$(cat <<'NODEJS'
"use strict";
const fs = require("fs");
const E = process.env;
const file = E.SC_TELEMETRY_FILE;
const jsonMode = E.SC_JSONMODE === "1";
const wantSid = E.SC_SID || "";
const last = E.SC_LAST ? Number(E.SC_LAST) : 0;

function out(s) { fs.writeSync(1, s); }

let raw = null;
try { raw = fs.readFileSync(file, "utf8"); } catch (e) { raw = null; }

const rep = {
  schema: 1,
  file: file,
  present: raw !== null,
  window: { sid: wantSid || null, last: last || null },
  records: 0,
  malformed: 0,
  unknownEv: {},
  hooks: {},
  gate: { fired: 0, skipped: 0, why: {} },
  nudge: { total: 0, main: 0, sub: 0, unknown: 0 },
  call: { total: 0, main: 0, sub: 0, unknown: 0, failed: 0 },
  search: { total: 0, main: 0, sub: 0, unknown: 0 },
  open: { total: 0 },
  // The prefetch hook. `why` is the suppressing clause, so a low fire rate is
  // always attributable; `hits` and `ms` are the cost side.
  prefetch: {
    fired: 0, suppressed: 0, why: {}, hits: 0, injections: 0,
    msMedian: null, msMax: null,
  },
  // Post-release conversion, computable from this JSONL alone:
  //   injectedSessions  - sessions where prefetch injected at least one candidate
  //   openedSessions    - of those, sessions where an injected path was later OPENED
  //   pathsOpened/pathsInjected - the same question per candidate path
  prefetchConversion: {
    injectedSessions: 0, openedSessions: 0, sessionPct: null,
    pathsInjected: 0, pathsOpened: 0, pathPct: null,
  },
  // `sessionsWithNudge`/`sessionsConverted`/`conversionPct` are the LUMPED figures:
  // every nudge-emitting channel share one denominator. They are kept for schema
  // compatibility and they are not a per-channel measurement — reading them as one
  // is what produced the "0/18" claim that retired the reminder hook. The channel a
  // number belongs to lives in `bySource`, keyed by the emitting hook's `src`.
  //
  // `converted` does NOT mean the same thing in every channel, so each entry names
  // its own `measure`:
  //   semble-call-after      a semble MCP call landed later in the same session
  //   injected-path-opened   a path prefetch injected was later actually Read
  // Attribution overlaps by design: one semble call can convert a session for the
  // session channel AND the reminder channel. What must never happen is one
  // channel's firings sitting in another channel's denominator.
  conversion: {
    sessionsWithNudge: 0, sessionsConverted: 0, conversionPct: null,
    callsAfterNudge: 0, callsWithoutNudge: 0,
    bySource: {},
  },
};

// Every channel that can emit a nudge, listed so a channel that fired zero times
// still reports 0/0 instead of vanishing from the output. `explore` is the retired
// SubagentStart/Explore hook: it is NOT listed, so it appears only in a JSONL that
// actually holds its records, and disappears once those age out of the window.
const NUDGE_SOURCES = ["session", "reminder", "subagent", "prefetch"];
const MEASURE = {
  session: "semble-call-after",
  reminder: "semble-call-after",
  subagent: "semble-call-after",
  explore: "semble-call-after",
  prefetch: "injected-path-opened",
};
function srcSlot(src) {
  if (!rep.conversion.bySource[src]) {
    rep.conversion.bySource[src] = {
      nudges: 0, sessions: 0, converted: 0, sessionPct: null,
      callsAfter: 0, measure: MEASURE[src] || "semble-call-after",
    };
  }
  return rep.conversion.bySource[src];
}
for (const s of NUDGE_SOURCES) srcSlot(s);
rep.conversion.bySource.reminder.toolUses = 0;
rep.conversion.bySource.subagent.agentTypes = {};

// A truncated final line (the process died mid-append) and a record from a
// future schema are both expected, not exceptional: count and move on.
let recs = [];
if (raw !== null) {
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch (e) { rep.malformed++; continue; }
    if (r === null || typeof r !== "object" || Array.isArray(r)) { rep.malformed++; continue; }
    recs.push(r);
  }
}
if (wantSid) recs = recs.filter(function (r) { return r.sid === wantSid; });
if (last > 0 && recs.length > last) recs = recs.slice(-last);
rep.records = recs.length;

function bump(o, k) { o[k] = (o[k] || 0) + 1; }
function agentOf(r) {
  return (r.agent === "main" || r.agent === "sub") ? r.agent : "unknown";
}

// nudges/calls per session, for the conversion join
const nudgeFirst = {};   // sid -> earliest nudge ts        (all channels lumped)
const nudgeTs = {};      // sid -> sorted-enough list of nudge ts
const callsBySid = {};   // sid -> [ts]
// The same two joins kept PER CHANNEL. Without this split a channel that fires
// often lends its sessions to a channel that never fired, and the quotient stops
// describing either of them.
const srcFirst = {};     // src -> sid -> earliest nudge ts of THAT src
const srcTs = {};        // src -> sid -> [ts]
const reminderTuids = {};// tool_use_id -> 1, so a retried PreToolUse is not double counted
function noteNudge(src, sid, ts) {
  srcSlot(src).nudges++;
  if (!srcFirst[src]) { srcFirst[src] = {}; srcTs[src] = {}; }
  if (!srcTs[src][sid]) srcTs[src][sid] = [];
  srcTs[src][sid].push(ts);
  if (srcFirst[src][sid] === undefined || ts < srcFirst[src][sid]) srcFirst[src][sid] = ts;
}
// prefetch conversion join: sid -> [{p, ts}] injected, sid -> [{f, abs, ts}] opened
const injected = {};
const opened = {};
const msSamples = [];

for (const r of recs) {
  const src = typeof r.src === "string" ? r.src : "unknown";
  bump(rep.hooks, src);
  const sid = typeof r.sid === "string" ? r.sid : "";
  const ts = typeof r.ts === "string" ? r.ts : "";
  switch (r.ev) {
    case "gate": {
      if (r.fired === true) rep.gate.fired++; else rep.gate.skipped++;
      bump(rep.gate.why, typeof r.why === "string" && r.why ? r.why : "unknown");
      break;
    }
    case "nudge": {
      rep.nudge.total++;
      rep.nudge[agentOf(r)]++;
      if (!nudgeTs[sid]) nudgeTs[sid] = [];
      nudgeTs[sid].push(ts);
      if (nudgeFirst[sid] === undefined || ts < nudgeFirst[sid]) nudgeFirst[sid] = ts;
      noteNudge(src, sid, ts);
      const tuid = typeof r.tool_use_id === "string" ? r.tool_use_id : "";
      if (src === "reminder" && tuid) reminderTuids[tuid] = 1;
      const at = typeof r.agent_type === "string" && r.agent_type ? r.agent_type : "unknown";
      if (src === "subagent") bump(rep.conversion.bySource.subagent.agentTypes, at);
      break;
    }
    case "call": {
      rep.call.total++;
      rep.call[agentOf(r)]++;
      if (r.ok === false) rep.call.failed++;
      if (!callsBySid[sid]) callsBySid[sid] = [];
      callsBySid[sid].push(ts);
      break;
    }
    case "search": {
      rep.search.total++;
      rep.search[agentOf(r)]++;
      break;
    }
    case "prefetch": {
      bump(rep.prefetch.why, typeof r.why === "string" && r.why ? r.why : "unknown");
      if (typeof r.ms === "number" && isFinite(r.ms) && r.ms >= 0) msSamples.push(r.ms);
      if (r.fired !== true) { rep.prefetch.suppressed++; break; }
      rep.prefetch.fired++;
      noteNudge("prefetch", sid, ts);   // its own channel, its own denominator
      const paths = Array.isArray(r.paths) ? r.paths.filter(function (p) { return typeof p === "string" && p; }) : [];
      rep.prefetch.hits += (typeof r.n === "number" && isFinite(r.n)) ? r.n : paths.length;
      if (paths.length) rep.prefetch.injections++;
      if (!injected[sid]) injected[sid] = [];
      for (const p of paths) injected[sid].push({ p: p, ts: ts });
      break;
    }
    case "open": {
      rep.open.total++;
      if (!opened[sid]) opened[sid] = [];
      opened[sid].push({
        f: typeof r.f === "string" ? r.f : "",
        abs: typeof r.abs === "string" ? r.abs : "",
        ts: ts,
      });
      break;
    }
    default:
      bump(rep.unknownEv, String(r.ev));
  }
}

// The metric that matters: a nudge only counts if a semble call came AFTER it,
// in the same session. Equal timestamps do not count - same-millisecond means
// the call cannot have been caused by the nudge.
const nudgedSids = Object.keys(nudgeFirst);
rep.conversion.sessionsWithNudge = nudgedSids.length;
rep.conversion.sessionsConverted = nudgedSids.filter(function (sid) {
  return (callsBySid[sid] || []).some(function (t) { return t > nudgeFirst[sid]; });
}).length;
if (nudgedSids.length) {
  rep.conversion.conversionPct =
    Math.round((rep.conversion.sessionsConverted / nudgedSids.length) * 1000) / 10;
}
for (const sid of Object.keys(callsBySid)) {
  for (const t of callsBySid[sid]) {
    const after = (nudgeTs[sid] || []).some(function (n) { return n <= t; });
    if (after) rep.conversion.callsAfterNudge++;
    else rep.conversion.callsWithoutNudge++;
  }
}

// Prefetch conversion. An injected path converts when a LATER `open` in the SAME
// session names it. semble reports repo-relative paths and Claude Code reads with
// an absolute one, so a match is "either recorded form ends with the injected
// path" - the stats hook records both forms precisely so this stays a suffix test
// and never needs a cwd the reader does not have.
const hit = function (sid, rec) {
  return (opened[sid] || []).some(function (o) {
    if (!(o.ts > rec.ts)) return false;
    const cand = [o.f, o.abs];
    return cand.some(function (c) { return c === rec.p || (c && c.endsWith("/" + rec.p)); });
  });
};
const injSids = Object.keys(injected);
rep.prefetchConversion.injectedSessions = injSids.length;
rep.prefetchConversion.openedSessions = injSids.filter(function (sid) {
  return injected[sid].some(function (rec) { return hit(sid, rec); });
}).length;
for (const sid of injSids) {
  for (const rec of injected[sid]) {
    rep.prefetchConversion.pathsInjected++;
    if (hit(sid, rec)) rep.prefetchConversion.pathsOpened++;
  }
}
const pc = rep.prefetchConversion;
if (pc.injectedSessions) pc.sessionPct = Math.round((pc.openedSessions / pc.injectedSessions) * 1000) / 10;
if (pc.pathsInjected) pc.pathPct = Math.round((pc.pathsOpened / pc.pathsInjected) * 1000) / 10;

// Per-channel conversion. Each channel is joined against its OWN nudge timestamps,
// so a channel that never fired reports 0/0 and contributes nothing to any other
// channel's rate. The prefetch channel converts on a path being opened, not on a
// later semble call - it already RAN the search, so "did they call semble after"
// would answer a question nobody asked; its numbers come from prefetchConversion.
for (const src of Object.keys(srcFirst)) {
  const slot = srcSlot(src);
  const sids = Object.keys(srcFirst[src]);
  slot.sessions = sids.length;
  slot.converted = sids.filter(function (sid) {
    return (callsBySid[sid] || []).some(function (t) { return t > srcFirst[src][sid]; });
  }).length;
  for (const sid of Object.keys(callsBySid)) {
    for (const t of callsBySid[sid]) {
      if ((srcTs[src][sid] || []).some(function (n) { return n <= t; })) slot.callsAfter++;
    }
  }
}
rep.conversion.bySource.prefetch.converted = pc.openedSessions;
rep.conversion.bySource.prefetch.sessions = pc.injectedSessions;
rep.conversion.bySource.reminder.toolUses = Object.keys(reminderTuids).length;
for (const src of Object.keys(rep.conversion.bySource)) {
  const slot = rep.conversion.bySource[src];
  slot.sessionPct = slot.sessions
    ? Math.round((slot.converted / slot.sessions) * 1000) / 10
    : null;
}
if (msSamples.length) {
  const s = msSamples.slice().sort(function (a, b) { return a - b; });
  rep.prefetch.msMedian = s[Math.floor((s.length - 1) / 2)];
  rep.prefetch.msMax = s[s.length - 1];
}

if (jsonMode) { out(JSON.stringify(rep) + "\n"); process.exit(0); }

if (!rep.present) {
  out("no telemetry yet - " + file + "\n"
    + "(the stats hook writes on the first tool call after `semble-guidance.sh install`)\n");
  process.exit(0);
}
const L = [];
const pairs = function (o) {
  const k = Object.keys(o).sort();
  return k.length ? k.map(function (x) { return x + "=" + o[x]; }).join(" ") : "-";
};
L.push("# Semble telemetry");
L.push("");
L.push("file:      " + file);
L.push("window:    " + (wantSid ? "sid=" + wantSid : "all sessions")
  + (last > 0 ? " | last " + last : "")
  + " | " + rep.records + " records"
  + (rep.malformed ? " | " + rep.malformed + " malformed (skipped)" : ""));
L.push("hooks:     " + pairs(rep.hooks));
L.push("gate:      " + rep.gate.fired + " fired / " + rep.gate.skipped + " skipped  [" + pairs(rep.gate.why) + "]");
L.push("prefetch:  " + rep.prefetch.fired + " fired / " + rep.prefetch.suppressed + " suppressed"
  + " | " + rep.prefetch.hits + " candidates"
  + (rep.prefetch.msMedian === null ? "" : " | " + rep.prefetch.msMedian + " ms median, "
    + rep.prefetch.msMax + " ms max")
  + "  [" + pairs(rep.prefetch.why) + "]");
L.push("opened:    " + pc.pathsOpened + "/" + pc.pathsInjected + " injected paths"
  + (pc.pathPct === null ? "" : " (" + pc.pathPct + "%)")
  + " | " + pc.openedSessions + "/" + pc.injectedSessions + " sessions"
  + (pc.sessionPct === null ? "" : " (" + pc.sessionPct + "%)")
  + " | " + rep.open.total + " Read calls seen");
L.push("nudge:     " + rep.nudge.total + " total (main " + rep.nudge.main + ", sub " + rep.nudge.sub
  + (rep.nudge.unknown ? ", unknown " + rep.nudge.unknown : "") + ")");
L.push("call:      " + rep.call.total + " semble calls (main " + rep.call.main + ", sub " + rep.call.sub
  + (rep.call.unknown ? ", unknown " + rep.call.unknown : "") + ") | " + rep.call.failed + " failed");
L.push("search:    " + rep.search.total + " search-shaped non-semble (main " + rep.search.main
  + ", sub " + rep.search.sub + (rep.search.unknown ? ", unknown " + rep.search.unknown : "") + ")");
const c = rep.conversion;
L.push("converted: " + c.sessionsConverted + "/" + c.sessionsWithNudge + " nudged sessions"
  + (c.conversionPct === null ? "" : " (" + c.conversionPct + "%)")
  + " | " + c.callsAfterNudge + " calls after a nudge, " + c.callsWithoutNudge + " unprompted"
  + "  [ALL channels lumped - per channel below]");
// One line per channel. A channel that never fired prints 0/0, which is the
// distinction the retirement decision missed: 0/0 is "never delivered", 0/N is
// "delivered and ignored", and only the second is evidence about the advice.
for (const src of Object.keys(c.bySource).sort()) {
  const s = c.bySource[src];
  L.push("  " + (src + "        ").slice(0, 9) + s.converted + "/" + s.sessions + " sessions"
    + (s.sessionPct === null ? "" : " (" + s.sessionPct + "%)")
    + " | " + s.nudges + " fired"
    + (s.toolUses === undefined ? "" : ", " + s.toolUses + " distinct tool_use_id")
    + (s.agentTypes === undefined ? "" : ", agents [" + pairs(s.agentTypes) + "]")
    + " | " + s.measure);
}
const denom = rep.search.total + rep.call.total;
L.push("share:     " + (denom ? Math.round((rep.call.total / denom) * 1000) / 10 : 0)
  + "% of search-shaped tool use went through semble");
if (Object.keys(rep.unknownEv).length) {
  L.push("unknown:   " + pairs(rep.unknownEv) + " (newer schema - skipped)");
}
out(L.join("\n") + "\n");
process.exit(0);
NODEJS
)"

if [ "$SECTION" = "telemetry" ]; then
  SC_TELEMETRY_FILE="$(sc_project_root)/.claude/semble/telemetry.jsonl" \
  SC_JSONMODE="$JSON_MODE" SC_SID="$SID" SC_LAST="$LAST" \
    node -e "$TELEMETRY_READER"
  exit 0
fi

# sibling REL ARGS... -> the sibling's JSON on stdout, or an {"error":...} object.
# Never fails: an absent, crashing or silent sibling degrades to an error object.
sibling() {
  local rel="$1"; shift
  local script="$SC_DIR/$rel" out rc
  if [ ! -f "$script" ]; then
    printf '{"error":%s}' "$(sc_jstr "$rel not found - that unit is not installed")"
    return 0
  fi
  set +e
  out="$(bash "$script" "$@" 2>/dev/null)"
  rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    printf '{"error":%s}' "$(sc_jstr "$rel $* exited $rc")"
    return 0
  fi
  printf '%s' "$out"
}

# ── prereq (only when requested: the uvx probe is the expensive bit) ─────────
BREW_PATH=""; BREW_VER=""
UV_PATH="";   UV_VER=""
UVX_PATH="";  UVX_VER=""
CLAUDE_PATH=""; CLAUDE_VER=""
NODE_PATH="";  NODE_VER=""
SEMBLE_TOOLVER=""; SEMBLE_RESOLVABLE="false"
PREREQ_WANTED=0

if want prereq; then
  PREREQ_WANTED=1
  BREW_PATH="$(sc_brew_path)"
  if [ -n "$BREW_PATH" ]; then
    BREW_VER="$("$BREW_PATH" --version 2>/dev/null | head -1 | awk '{print $NF}' || true)"
  fi
  UV_PATH="$(sc_bin uv)";   UV_VER="$(sc_uv_version)"
  UVX_PATH="$(sc_bin uvx)"; UVX_VER="$(sc_uvx_version)"
  CLAUDE_PATH="$(sc_bin "$(sc_claude_bin)")"
  if [ -n "$CLAUDE_PATH" ]; then
    CLAUDE_VER="$(sc_claude_version)"
  fi
  NODE_PATH="$(sc_bin node)"
  NODE_VER="$(node --version 2>/dev/null || true)"
  SEMBLE_TOOLVER="$(sc_semble_tool_version)"
  if sc_semble_probe; then SEMBLE_RESOLVABLE="true"; fi
fi

# ── sibling sections ────────────────────────────────────────────────────────
# mcp is always gathered: the verdict depends on it.
MCP_JSON="$(sibling semble-mcp.sh detect --json)"
CACHE_JSON=""
GUIDANCE_JSON=""
AGENTS_JSON=""
PROJECT_JSON=""
if want cache;    then CACHE_JSON="$(sibling semble-cache.sh info --json)"; fi
if want guidance; then GUIDANCE_JSON="$(sibling semble-guidance.sh status --json)"; fi
if want agents;   then AGENTS_JSON="$(sibling semble-agents.sh audit --json)"; fi
if want coverage; then PROJECT_JSON="$(sibling semble-project.sh audit --json)"; fi

ASSEMBLER="$(cat <<'NODEJS'
"use strict";
const fs = require("fs");
const E = process.env;
const section = E.SC_SECTION;
const jsonMode = E.SC_JSONMODE === "1";
const TOOLS = [E.SC_TOOL_SEARCH, E.SC_TOOL_RELATED];

function out(s) { fs.writeSync(1, s); }

function parseSection(raw, label) {
  if (raw === undefined || raw === "") return null;
  const t = String(raw).trim();
  if (!t) return { error: label + " produced no output" };
  let v;
  try { v = JSON.parse(t); }
  catch (e) { return { error: label + " emitted invalid JSON: " + e.message }; }
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    return { error: label + " did not emit a JSON object" };
  }
  return v;
}
function isErr(o) { return o !== null && typeof o === "object" && typeof o.error === "string"; }

function readJson(p) {
  if (!p) return { missing: true };
  let raw;
  try {
    const st = fs.statSync(p);
    if (!st.isFile()) return { bad: "not a regular file" };
    raw = fs.readFileSync(p, "utf8");
  } catch (e) { return { missing: true }; }
  if (!raw.trim()) return { value: {} };
  try { return { value: JSON.parse(raw) }; }
  catch (e) { return { bad: e.message }; }
}

function allowFor(p) {
  const r = readJson(p);
  if (!r.value || typeof r.value !== "object") return [];
  const perms = r.value.permissions;
  const allow = (perms && Array.isArray(perms.allow)) ? perms.allow : [];
  return allow.filter(function (x) { return TOOLS.indexOf(x) >= 0; });
}

function fmtBytes(n) {
  const b = Number(n);
  if (!isFinite(b) || b < 0) return "unknown";
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KiB";
  if (b < 1073741824) return (b / 1048576).toFixed(1) + " MiB";
  return (b / 1073741824).toFixed(2) + " GiB";
}
function orAbsent(v) { return (v === undefined || v === null || v === "") ? "absent" : String(v); }

// ── state (read-only, local) ────────────────────────────────────────────────
const stateFile = E.SC_STATE_FILE || "";
const stRead = readJson(stateFile);
let stateSec;
if (stRead.missing) {
  stateSec = { present: false, phase: "absent", enabled: null, completed: [], last_updated: null };
} else if (stRead.bad) {
  stateSec = {
    present: true, phase: "error", enabled: null, completed: [], last_updated: null,
    error: "state file is not valid JSON: " + stRead.bad,
  };
} else {
  const s = (stRead.value && typeof stRead.value === "object" && !Array.isArray(stRead.value)) ? stRead.value : {};
  stateSec = {
    present: true,
    phase: typeof s.phase === "string" ? s.phase : "absent",
    enabled: typeof s.enabled === "boolean" ? s.enabled : null,
    completed: Array.isArray(s.completed) ? s.completed : [],
    last_updated: typeof s.last_updated === "string" ? s.last_updated : null,
  };
}

// ── prereq ─────────────────────────────────────────────────────────────────
let prereqSec = null;
if (E.SC_PREREQ_WANTED === "1") {
  const toolVer = E.SC_SEMBLE_TOOLVER || "";
  const resolvable = E.SC_SEMBLE_RESOLVABLE === "true";
  prereqSec = {
    brew:   { present: !!E.SC_BREW_PATH,   path: E.SC_BREW_PATH   || "", version: E.SC_BREW_VER   || "" },
    uv:     { present: !!E.SC_UV_PATH,     path: E.SC_UV_PATH     || "", version: E.SC_UV_VER     || "" },
    uvx:    { present: !!E.SC_UVX_PATH,    path: E.SC_UVX_PATH    || "", version: E.SC_UVX_VER    || "" },
    claude: { present: !!E.SC_CLAUDE_PATH, path: E.SC_CLAUDE_PATH || "", version: E.SC_CLAUDE_VER || "" },
    node:   { present: !!E.SC_NODE_PATH,   path: E.SC_NODE_PATH   || "", version: E.SC_NODE_VER   || "" },
    semble: {
      present: resolvable || toolVer !== "",
      version: toolVer,
      source: toolVer !== "" ? "uv-tool" : "uvx-ephemeral",
      resolvable: resolvable,
    },
  };
}

// ── mcp (transform of semble-mcp.sh detect --json into the 9.1 shape) ───────
const detect = parseSection(E.SC_MCP_JSON, "semble-mcp.sh detect");
let mcpSec;
if (detect === null) {
  mcpSec = null;
} else if (isErr(detect)) {
  mcpSec = detect;
} else {
  const d = (detect.dump && typeof detect.dump === "object" && !Array.isArray(detect.dump)) ? detect.dump : {};
  mcpSec = {
    state: typeof detect.state === "string" ? detect.state : "unknown",
    scopes: {
      user: d.user === undefined ? null : d.user,
      local: d.local === undefined ? null : d.local,
      project: d.project === undefined ? null : d.project,
    },
    upstream: {
      user: d.upstreamUser === undefined ? null : d.upstreamUser,
      local: d.upstreamLocal === undefined ? null : d.upstreamLocal,
    },
    projectEnabled: d.projectEnabled === undefined ? null : d.projectEnabled,
    malformed: Array.isArray(d.malformed) ? d.malformed : [],
    tools: TOOLS,
    permissions: { project: allowFor(E.SC_PROJECT_SETTINGS), user: allowFor(E.SC_USER_SETTINGS) },
    connectivity: typeof detect.connectivity === "string" ? detect.connectivity : "unknown",
  };
}

// ── cache (pass-through of semble-cache.sh info --json) ─────────────────────
const cacheSec = parseSection(E.SC_CACHE_JSON, "semble-cache.sh info");

// ── guidance (transform of semble-guidance.sh status --json) ────────────────
const guidRaw = parseSection(E.SC_GUIDANCE_JSON, "semble-guidance.sh status");
let guidSec;
if (guidRaw === null || isErr(guidRaw)) {
  guidSec = guidRaw;
} else {
  const h = (guidRaw.hooks && typeof guidRaw.hooks === "object") ? guidRaw.hooks : {};
  const ses = (h.session && typeof h.session === "object") ? h.session : {};
  const pre = (h.prefetch && typeof h.prefetch === "object") ? h.prefetch : {};
  const sta = (h.stats && typeof h.stats === "object") ? h.stats : {};
  const rem = (h.reminder && typeof h.reminder === "object") ? h.reminder : {};
  const sub = (h.subagent && typeof h.subagent === "object") ? h.subagent : {};
  const rule = (guidRaw.rule && typeof guidRaw.rule === "object") ? guidRaw.rule : {};
  const ign = (guidRaw.ignore && typeof guidRaw.ignore === "object") ? guidRaw.ignore : {};
  const cmd = (guidRaw.claudeMd && typeof guidRaw.claudeMd === "object") ? guidRaw.claudeMd : {};
  const perm = (guidRaw.permissions && typeof guidRaw.permissions === "object") ? guidRaw.permissions : {};
  guidSec = {
    rule: typeof rule.state === "string" ? rule.state : "absent",
    ignore: typeof ign.state === "string" ? ign.state : "absent",
    claudeMd: typeof cmd.state === "string" ? cmd.state : "absent",
    settingsFile: typeof h.settingsFile === "string" ? h.settingsFile : "",
    hooks: {
      session: ses.file === "present" ? "present" : "missing",
      prefetch: pre.file === "present" ? "present" : "missing",
      stats: sta.file === "present" ? "present" : "missing",
      reminder: rem.file === "present" ? "present" : "missing",
      subagent: sub.file === "present" ? "present" : "missing",
    },
    // Retired hook files still on disk (v1 installs). Non-empty means the
    // migration has not run yet; `install`/`upgrade` deletes them.
    retired: Array.isArray(h.retired) ? h.retired : [],
    permissionsWired: perm.wired === true,
    // Read the authoritative sibling counts (SessionStart + UserPromptSubmit +
    // PostToolUse + PostToolUseFailure + PreToolUse + SubagentStart). Never
    // re-derive them from the `wired` booleans: stats spans two events, so a
    // half-wired pair loses an entry.
    wiredCount: typeof h.wiredCount === "number" ? h.wiredCount : 0,
    wantCount: typeof h.wantCount === "number" ? h.wantCount : 0,
    staleEntries: typeof h.staleEntries === "number" ? h.staleEntries : 0,
    // The frontmatter `version:` of the installed rule, and the version the plugin
    // on this machine would install. Staleness is otherwise visible only through
    // /brewcode:setup-status, so a project running artifacts from an old release
    // read `ready` in its own status with no prescription. One signal, one fix -
    // the cross-plugin dashboard still owns the per-artifact breakdown.
    version: typeof rule.version === "string" ? rule.version : "",
    pluginVersion: typeof rule.templateVersion === "string" ? rule.templateVersion : "",
  };
}

// ── agents (transform of semble-agents.sh audit --json) ─────────────────────
const agRaw = parseSection(E.SC_AGENTS_JSON, "semble-agents.sh audit");
let agentsSec;
if (agRaw === null || isErr(agRaw)) {
  agentsSec = agRaw;
} else {
  const files = Array.isArray(agRaw.files) ? agRaw.files : [];
  const sum = (agRaw.summary && typeof agRaw.summary === "object") ? agRaw.summary : {};
  const num = function (v) { return typeof v === "number" ? v : 0; };
  agentsSec = {
    total: typeof agRaw.total === "number" ? agRaw.total : files.length,
    // The buckets partition `total` by `action`, so they must be split on
    // action first. `toolsStyle` alone is not a bucket: semble-agents.sh gives
    // skipped entries - and a conflict with no `tools:` key - toolsStyle
    // "absent" too, which double counted them as inherit.
    inherit: files.filter(function (f) {
      return f && f.action === "unchanged" && f.reason === "inherits";
    }).length,
    patched: files.filter(function (f) {
      return f && f.action === "unchanged" && f.reason !== "inherits";
    }).length,
    needsPatch: num(sum.changed),
    conflict: num(sum.conflict),
    skipped: num(sum.skipped),
    files: files,
  };
}

// ── coverage (from semble-project.sh audit --json) ──────────────────────────
const projRaw = parseSection(E.SC_PROJECT_JSON, "semble-project.sh audit");
let covSec;
if (projRaw === null || isErr(projRaw)) {
  covSec = projRaw;
} else if (projRaw.coverage && typeof projRaw.coverage === "object") {
  covSec = projRaw.coverage;
} else {
  covSec = { code: {}, config: {}, docsOnly: {}, excluded: {} };
}

// ── verdict ────────────────────────────────────────────────────────────────
const mcpState = (mcpSec && !isErr(mcpSec)) ? mcpSec.state : "unknown";
const phase = stateSec.phase;
let verdict;
let reason;
if (mcpState === "malformed") { verdict = "error"; reason = "MCP config is unparseable"; }
else if (phase === "error") { verdict = "error"; reason = "state file records phase=error"; }
else if (phase === "disabled" || stateSec.enabled === false) { verdict = "disabled"; reason = "project guidance is switched off"; }
else if (phase === "awaiting_reload") { verdict = "reload_required"; reason = "MCP registered, waiting for a new session"; }
else if (phase === "verifying") { verdict = "verifying"; reason = "registration observed, smoke query not confirmed yet"; }
else if (mcpState === "absent" && (phase === "absent" || phase === "prereq_ready")) { verdict = "not_installed"; reason = "semble_code is not registered"; }
else if (mcpState === "correct" && phase === "ready") { verdict = "ready"; reason = "pinned server registered at user scope and verified"; }
else { verdict = "partial"; reason = "mcp=" + mcpState + ", phase=" + phase; }

// A v1-shaped repo satisfies mcp=correct + phase=ready and would report
// `ready`/`none`, so nobody upgrading would ever be told to migrate. The
// project half of the install is part of the verdict: retired hook files
// still on disk, settings entries pointing at an older plugin version, or a
// missing sibling registration each downgrade `ready` to `partial`.
if (verdict === "ready" && guidSec && !isErr(guidSec)) {
  const retired = Array.isArray(guidSec.retired) ? guidSec.retired : [];
  const stale = typeof guidSec.staleEntries === "number" ? guidSec.staleEntries : 0;
  const wired = typeof guidSec.wiredCount === "number" ? guidSec.wiredCount : 0;
  const want = typeof guidSec.wantCount === "number" ? guidSec.wantCount : 0;
  const why = [];
  if (retired.length) { why.push("retired hooks on disk: " + retired.join(", ")); }
  if (stale > 0) { why.push(stale + " stale settings " + (stale === 1 ? "entry" : "entries")); }
  // want===0 means the wiring counts were not reported at all - never treat an
  // absent count as a defect, or a trimmed report downgrades a healthy repo.
  if (want > 0 && wired !== want) { why.push("hooks wired " + wired + "/" + want); }
  if (why.length) { verdict = "partial"; reason = why.join("; "); }
}

// Stale artifacts: everything is wired and byte-managed, but at the version of an
// older release. Both stamps must be present and readable - an unstamped pre-5.0
// rule reports "" and must never be called stale on a missing value.
let stampStale = false;
if (verdict === "ready" && guidSec && !isErr(guidSec)
    && guidSec.version && guidSec.pluginVersion && guidSec.version !== guidSec.pluginVersion) {
  stampStale = true;
  verdict = "partial";
  reason = "artifacts at " + guidSec.version + ", plugin at " + guidSec.pluginVersion;
}

let nextStep;
if (verdict === "ready") {
  nextStep = "none";
} else if (verdict === "reload_required") {
  nextStep = "Reload Claude Code (new session), then run: /brewcode:semble-setup resume\nCheckpoint: " + stateFile;
} else if (verdict === "error" && mcpState === "malformed") {
  const bad = (mcpSec.malformed && mcpSec.malformed.length) ? mcpSec.malformed.join(", ") : "see mcp.malformed";
  nextStep = "Fix by hand, then re-run /brewcode:semble-setup status: " + bad;
} else if (verdict === "error") {
  nextStep = "Run /brewcode:semble-setup install to repair";
} else if (verdict === "disabled") {
  nextStep = "Run /brewcode:semble-setup enable";
} else if (verdict === "verifying") {
  nextStep = "Run /brewcode:semble-setup resume";
} else if (stampStale) {
  nextStep = "Run /brewcode:semble-setup upgrade";
} else {
  nextStep = "Run /brewcode:semble-setup install";
}

// ── emit ───────────────────────────────────────────────────────────────────
const report = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  platform: E.SC_PLATFORM || "other",
  projectRoot: E.SC_ROOT || "",
  pin: { approved: E.SC_PIN, spec: E.SC_SPEC },
};
function add(key, val) {
  if (val === null) return;
  if (section === "all" || section === key) report[key] = val;
}
add("prereq", prereqSec);
add("mcp", mcpSec);
add("cache", cacheSec);
add("guidance", guidSec);
add("agents", agentsSec);
add("coverage", covSec);
add("state", stateSec);
report.verdict = verdict;
report.nextStep = nextStep;

if (jsonMode) {
  out(JSON.stringify(report) + "\n");
} else {
  const L = [];
  L.push("# Semble status");
  L.push("");
  L.push("project: " + report.projectRoot);
  L.push("pin:     " + report.pin.spec);
  L.push("");
  if (report.prereq) {
    const p = report.prereq;
    L.push("cli:      uv " + orAbsent(p.uv.version || (p.uv.present ? "present" : "")) +
      " | uvx " + orAbsent(p.uvx.version || (p.uvx.present ? "present" : "")) +
      " | semble pin " + E.SC_PIN + " (" + p.semble.source + (p.semble.version ? " " + p.semble.version : "") + ")" +
      " | claude " + orAbsent(p.claude.version));
  }
  if (report.mcp) {
    if (isErr(report.mcp)) {
      L.push("mcp:      error: " + report.mcp.error);
    } else {
      const sc = report.mcp.scopes;
      const where = sc.user ? "user" : (sc.local ? "local" : (sc.project ? "project" : "-"));
      L.push("mcp:      " + report.mcp.state + " @ " + where + "  [" + report.mcp.connectivity + "]");
    }
  }
  if (report.cache) {
    if (isErr(report.cache)) {
      L.push("cache:    error: " + report.cache.error);
    } else {
      const c = report.cache;
      L.push("cache:    " + (c.codeRoot || "unknown") +
        " | repo " + (c.repoHash ? String(c.repoHash).slice(0, 8) : "unknown") +
        " | " + fmtBytes(c.sizeBytes) +
        " | " + (c.staleness || "unknown") +
        " | docs root reserved: " + (c.docsReserved === true ? "yes" : "no"));
    }
  }
  if (report.guidance) {
    if (isErr(report.guidance)) {
      L.push("guidance: error: " + report.guidance.error);
    } else {
      const g = report.guidance;
      const ver = g.version
        ? " | version " + g.version + (g.pluginVersion && g.pluginVersion !== g.version
            ? " (plugin " + g.pluginVersion + " - run /brewcode:semble-setup upgrade)" : "")
        : "";
      L.push("guidance: rule " + g.rule + " | CLAUDE.md " + g.claudeMd +
        " | hooks " + g.wiredCount + "/" + (g.wantCount || 0) + " wired" +
        " | permissions " + (g.permissionsWired ? "yes" : "no") + ver);
    }
  }
  if (report.agents) {
    if (isErr(report.agents)) {
      L.push("agents:   error: " + report.agents.error);
    } else {
      const a = report.agents;
      L.push("agents:   " + a.total + " total | " + a.inherit + " inherit | " + a.patched +
        " patched | " + a.needsPatch + " need patch | " + a.conflict + " conflict | " + a.skipped + " skipped");
    }
  }
  if (report.coverage) {
    if (isErr(report.coverage)) {
      L.push("coverage: error: " + report.coverage.error);
    } else {
      const cv = report.coverage;
      const cnt = function (o) {
        if (!o || typeof o !== "object") return 0;
        return Object.keys(o).reduce(function (n, k) { return n + (typeof o[k] === "number" ? o[k] : 0); }, 0);
      };
      L.push("coverage: code " + cnt(cv.code) + " | config " + cnt(cv.config) +
        " | docs-only " + cnt(cv.docsOnly) + " | excluded " + cnt(cv.excluded));
    }
  }
  if (report.state) {
    const s = report.state;
    L.push("state:    phase=" + s.phase + " enabled=" + String(s.enabled) +
      " completed=[" + s.completed.join(",") + "]");
  }
  L.push("");
  const sym = verdict === "ready" ? "✅" : (verdict === "error" ? "❌" : (verdict === "not_installed" ? "⏭️" : "⚠️"));
  L.push(sym + " " + verdict + " - " + reason);
  L.push("Next Step: " + nextStep.replace(/\n/g, "\n           "));
  out(L.join("\n") + "\n");
}

process.exit(verdict === "ready" ? 0 : 10);
NODEJS
)"

set +e
REPORT="$(
  SC_SECTION="$SECTION" \
  SC_JSONMODE="$JSON_MODE" \
  SC_PLATFORM="$(sc_platform)" \
  SC_ROOT="$(sc_project_root)" \
  SC_PIN="$SEMBLE_PIN_VERSION" \
  SC_SPEC="$SEMBLE_PIN_SPEC" \
  SC_TOOL_SEARCH="$SEMBLE_TOOL_SEARCH" \
  SC_TOOL_RELATED="$SEMBLE_TOOL_RELATED" \
  SC_STATE_FILE="$(sc_state_file)" \
  SC_PROJECT_SETTINGS="$(sc_project_settings)" \
  SC_USER_SETTINGS="$(sc_user_settings)" \
  SC_PREREQ_WANTED="$PREREQ_WANTED" \
  SC_BREW_PATH="$BREW_PATH" SC_BREW_VER="$BREW_VER" \
  SC_UV_PATH="$UV_PATH" SC_UV_VER="$UV_VER" \
  SC_UVX_PATH="$UVX_PATH" SC_UVX_VER="$UVX_VER" \
  SC_CLAUDE_PATH="$CLAUDE_PATH" SC_CLAUDE_VER="$CLAUDE_VER" \
  SC_NODE_PATH="$NODE_PATH" SC_NODE_VER="$NODE_VER" \
  SC_SEMBLE_TOOLVER="$SEMBLE_TOOLVER" SC_SEMBLE_RESOLVABLE="$SEMBLE_RESOLVABLE" \
  SC_MCP_JSON="$MCP_JSON" \
  SC_CACHE_JSON="$CACHE_JSON" \
  SC_GUIDANCE_JSON="$GUIDANCE_JSON" \
  SC_AGENTS_JSON="$AGENTS_JSON" \
  SC_PROJECT_JSON="$PROJECT_JSON" \
  node -e "$ASSEMBLER"
)"
NODE_RC=$?
set -e

printf '%s\n' "$REPORT"

case "$NODE_RC" in
  0)  exit 0 ;;
  10) if [ "$STRICT" = "1" ]; then exit 1; fi; exit 0 ;;
  *)  sc_err "status assembly failed (node exit $NODE_RC)" >&2; exit 1 ;;
esac
