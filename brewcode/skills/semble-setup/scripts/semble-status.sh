#!/usr/bin/env bash
# semble-status.sh - STRICTLY READ-ONLY doctor (--help); failing sibling -> {"error"} section, exit 0; !=bare `semble`, `semble install`, `claude mcp add/remove`
set -euo pipefail
SC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/semble-common.sh
# shellcheck disable=SC1091  # unit B ships lib/semble-common.sh
. "$SC_DIR/lib/semble-common.sh"

usage() {
  cat <<'EOF'
semble-status.sh [--json] [--section SECTION] [--strict]

  --json             emit a single JSON object (schema: DESIGN 9.1)
  --section SECTION  prereq|mcp|versions|cache|guidance|agents|coverage|state|telemetry|all
                     (default: all; `telemetry` is NOT part of `all`)
  --strict           exit 1 when verdict != ready
  -h, --help         this text

  --versions [--all-profiles] [--json] [--strict]
  Version check only: pin vs the user-scope registration vs upstream latest.
  Text: one `# semble-versions ...` header, then one row per config dir:
    <dir> | <registered spec|none> | <pin> | <verdict> | <config file>
  verdict: ok | stale | ahead | drift | unpinned | not_registered | malformed
  Default: the active config dir (CLAUDE_CONFIG_DIR, else ~/.claude -> ~/.claude.json).
  --all-profiles adds ~/.claude and every ~/.claude-*/ holding a .claude.json.
  Upstream is advisory: offline prints upstream=unknown and never fails.
  --strict exits 1 when any listed row is not `ok`.

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
VERSIONS=0
ALL_PROFILES=0
SID=""
LAST=""

while [ $# -gt 0 ]; do
  case "$1" in
    --json)        JSON_MODE=1 ;;
    --strict)      STRICT=1 ;;
    --versions)    VERSIONS=1 ;;
    --all-profiles) ALL_PROFILES=1 ;;
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
  prereq|mcp|versions|cache|guidance|agents|coverage|state|telemetry|all) ;;
  *) sc_err "unknown section: ${SECTION:-(empty)}" >&2; usage >&2; exit 2 ;;
esac
if [ "$ALL_PROFILES" = "1" ] && [ "$VERSIONS" != "1" ]; then
  sc_err "--all-profiles is only valid with --versions" >&2; usage >&2; exit 2
fi
if [ "$SECTION" != "telemetry" ] && { [ -n "$SID" ] || [ -n "$LAST" ]; }; then
  sc_err "--sid/--last are only valid with --section telemetry" >&2; usage >&2; exit 2
fi
case "$LAST" in
  ''|*[!0-9]*) [ -z "$LAST" ] || { sc_err "--last must be a non-negative integer: $LAST" >&2; exit 2; } ;;
esac

sc_require_node

want() { [ "$SECTION" = "all" ] || [ "$SECTION" = "$1" ]; }

# ── --versions: machine-readable pin/registration/upstream report ───────────
# Never fails on a missing profile, a broken file or no network; rc 1 only with --strict.
if [ "$VERSIONS" = "1" ]; then
  ALL=""; [ "$ALL_PROFILES" = "1" ] && ALL="all"
  VJSON="$(sc_versions_json "$ALL")"
  SC_V="$VJSON" SC_JSONMODE="$JSON_MODE" SC_STRICT="$STRICT" node -e '
const v=JSON.parse(process.env.SC_V),u=v.upstream;
if(process.env.SC_JSONMODE==="1"){process.stdout.write(JSON.stringify(v)+"\n")}
else{
  const L=["# semble-versions schema="+v.schema+" pin="+v.pin+" upstream="+(u.latest||"unknown")
    +" upstream_status="+u.status+" reason="+u.reason];
  for(const r of v.profiles)L.push([r.dir,r.registered===null?"none":r.registered,r.pin,r.verdict,r.file].join(" | "));
  process.stdout.write(L.join("\n")+"\n");
}
const bad=v.profiles.some(function(r){return r.verdict!=="ok"});
process.exit(process.env.SC_STRICT==="1"&&bad?1:0);'
  exit $?
fi

# ── telemetry (--section telemetry): read-only reader of semble-stats.mjs .claude/semble/telemetry.jsonl ──
# NOT part of `all` (install health); answers "did the hooks do anything".
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
  // Pre-agent_id-fix `sub` records (no `aid`; `--agent` main thread was stamped `sub`): untrusted split,
  // counted, never averaged in.
  legacyAgent: 0,
  // The prefetch hook. `why` is the suppressing clause, so a low fire rate is
  // always attributable; `hits` and `ms` are the cost side.
  prefetch: {
    fired: 0, suppressed: 0, why: {}, hits: 0, injections: 0,
    msMedian: null, msMax: null,
  },
  // Prefetch conversion from this JSONL: sessions with an injection -> of those, an injected path later OPENED;
  // pathsOpened/pathsInjected = same per candidate path.
  prefetchConversion: {
    injectedSessions: 0, openedSessions: 0, sessionPct: null,
    pathsInjected: 0, pathsOpened: 0, pathPct: null,
  },
  // sessionsWithNudge/sessionsConverted/conversionPct = LUMPED (schema compat, !=per channel); per channel: `bySource[src]`
  // with own `measure` (semble-call-after | injected-path-opened); overlap ok, never in another channel denominator.
  conversion: {
    sessionsWithNudge: 0, sessionsConverted: 0, conversionPct: null,
    callsAfterNudge: 0, callsWithoutNudge: 0,
    bySource: {},
  },
};

// Nudge channels listed so a zero-fire one still reports 0/0. Retired `explore` NOT listed:
// shown only while its records stay in the window.
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
// Same two joins PER CHANNEL, so a busy channel never lends sessions to a silent one.
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
  // Only the stats writer stamps `aid`, so only its records can be audited this way.
  if (src === "stats" && r.agent === "sub" && typeof r.aid !== "string") rep.legacyAgent++;
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

// Nudge counts only if a semble call came strictly AFTER it in the same session (equal ts != caused).
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

// Prefetch conversion: injected path converts on a LATER same-session `open` naming it; suffix match on
// either recorded form (repo-relative vs absolute), so no cwd needed.
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

// Per-channel conversion against its OWN nudge ts (never-fired = 0/0). Prefetch already RAN the search,
// so it converts on a path opened (prefetchConversion), not a later semble call.
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
// One line per channel: 0/0 = never delivered, 0/N = delivered and ignored (only the latter is evidence).
for (const src of Object.keys(c.bySource).sort()) {
  const s = c.bySource[src];
  L.push("  " + (src + "        ").slice(0, 9) + s.converted + "/" + s.sessions + " sessions"
    + (s.sessionPct === null ? "" : " (" + s.sessionPct + "%)")
    + " | " + s.nudges + " fired"
    + (s.toolUses === undefined ? "" : ", " + s.toolUses + " distinct tool_use_id")
    + (s.agentTypes === undefined ? "" : ", agents [" + pairs(s.agentTypes) + "]")
    + " | " + s.measure);
}
if (rep.legacyAgent) {
  L.push("suspect:   " + rep.legacyAgent + " stats records stamped sub before the agent_id fix"
    + " - treat every main/sub number above as an upper bound on sub");
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
VERSIONS_JSON=""
# Never fatal: a failed check degrades to an error object for that section only.
if want versions; then
  VERSIONS_JSON="$(sc_versions_json 2>/dev/null)" || VERSIONS_JSON='{"error":"version check failed"}'
fi
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
// Sibling JSON arrives on stdin, NUL-terminated in this order (a bash string never holds NUL).
const [rawMcp, rawVersions, rawCache, rawGuidance, rawAgents, rawProject] = fs.readFileSync(0, "utf8").split("\0");

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
const detect = parseSection(rawMcp, "semble-mcp.sh detect");
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
    permissions: { project: allowFor(E.SC_PROJECT_SETTINGS), user: allowFor(E.SC_USER_SETTINGS),
      local: allowFor(E.SC_PROJECT_LOCAL_SETTINGS) },
    connectivity: typeof detect.connectivity === "string" ? detect.connectivity : "unknown",
  };
}

// ── versions (active config dir slice of sc_versions_json) ─────────────────
const verRaw = parseSection(rawVersions, "version check");
let versionsSec;
if (verRaw === null || isErr(verRaw)) {
  versionsSec = verRaw;
} else {
  const rows = Array.isArray(verRaw.profiles) ? verRaw.profiles : [];
  const a = rows.filter(function (r) { return r && r.active === true; })[0] || {};
  versionsSec = {
    pin: verRaw.pin, pinSpec: verRaw.pinSpec,
    configDir: a.dir || "", configFile: a.file || "",
    registered: a.registered === undefined ? null : a.registered,
    registeredVersion: a.registeredVersion === undefined ? null : a.registeredVersion,
    verdict: a.verdict || "unknown", detail: a.detail || "", action: a.action || "none",
    upstream: verRaw.upstream || { latest: null, status: "unknown", reason: "unparseable", advisory: "" },
  };
}
// A pinned registration at another X.Y.Z is a pin transition: `upgrade` owns it.
const pinMoved = !!mcpSec && !isErr(mcpSec) && mcpSec.state === "stale_args"
  && !!versionsSec && !isErr(versionsSec)
  && (versionsSec.verdict === "stale" || versionsSec.verdict === "ahead");

// ── cache (pass-through of semble-cache.sh info --json) ─────────────────────
const cacheSec = parseSection(rawCache, "semble-cache.sh info");

// ── guidance (transform of semble-guidance.sh status --json) ────────────────
const guidRaw = parseSection(rawGuidance, "semble-guidance.sh status");
let guidSec;
let absoluteOnly = false;
if (guidRaw === null || isErr(guidRaw)) {
  guidSec = guidRaw;
} else {
  const h = (guidRaw.hooks && typeof guidRaw.hooks === "object") ? guidRaw.hooks : {};
  const ses = (h.session && typeof h.session === "object") ? h.session : {};
  const sta = (h.stats && typeof h.stats === "object") ? h.stats : {};
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
      stats: sta.file === "present" ? "present" : "missing",
      subagent: sub.file === "present" ? "present" : "missing",
    },
    // Retired hooks (explore, reminder, prefetch) on disk / still registered: `upgrade` removes both.
    retired: Array.isArray(h.retired) ? h.retired : [],
    retiredWired: Array.isArray(h.retiredWired) ? h.retiredWired : [],
    // P3: granted by any settings layer CC reads (project, local, user); source = the granting layers.
    permissionsWired: perm.wired === true,
    permissionsSource: Array.isArray(perm.source) ? perm.source : [],
    // Authoritative sibling counts (SessionStart, PostToolUse, PostToolUseFailure, SubagentStart);
    // never re-derived from `wired` booleans (stats spans two events).
    wiredCount: typeof h.wiredCount === "number" ? h.wiredCount : 0,
    wantCount: typeof h.wantCount === "number" ? h.wantCount : 0,
    staleEntries: typeof h.staleEntries === "number" ? h.staleEntries : 0,
    // <= 6.5.0 absolute hook args (subset of staleEntries); `upgrade` rewrites them in place.
    absoluteCount: typeof h.absoluteCount === "number" ? h.absoluteCount : 0,
    // content_version = PRIMARY staleness signal (artifact-metadata.md section 6); `version` = informational
    // install release. Surfaced here too so old artifacts !=`ready`; /brewcode:setup-status keeps the breakdown.
    content_version: typeof rule.content_version === "string" ? rule.content_version : "",
    templateContentVersion: typeof rule.templateContentVersion === "string" ? rule.templateContentVersion : "",
    version: typeof rule.version === "string" ? rule.version : "",
    pluginVersion: typeof rule.templateVersion === "string" ? rule.templateVersion : "",
  };
  // P2: a missing content_version is OLDER than any template stamp; same rule for every dashboard.
  guidSec.ruleStampStale = !!guidSec.templateContentVersion && guidSec.rule !== "absent"
    && guidSec.content_version !== guidSec.templateContentVersion;
  // Absolute-only hook drift: every stale entry absolute, every unwired row drifted on `args` alone (abs -> portable).
  const drift = Array.isArray(h.drift) ? h.drift : [];
  const absArg = function (d) {
    const m = d && Array.isArray(d.actual) && d.actual.length === 1 && typeof d.actual[0] === "string"
      ? /^(?:\/|[A-Za-z]:[\\/]).*[\\/]\.claude[\\/]hooks[\\/]([^\\/]+)$/.exec(d.actual[0]) : null;
    return d.field === "args" && !!m && m[1] === d.script;
  };
  absoluteOnly = guidSec.absoluteCount > 0 && guidSec.staleEntries === guidSec.absoluteCount
    && h.missingCount === 0 && h.duplicateCount === 0
    && h.driftedCount === guidSec.wantCount - guidSec.wiredCount
    && drift.length === h.driftedCount && drift.every(absArg);
}

// ── agents (transform of semble-agents.sh audit --json) ─────────────────────
const agRaw = parseSection(rawAgents, "semble-agents.sh audit");
let agentsSec;
if (agRaw === null || isErr(agRaw)) {
  agentsSec = agRaw;
} else {
  const files = Array.isArray(agRaw.files) ? agRaw.files : [];
  const sum = (agRaw.summary && typeof agRaw.summary === "object") ? agRaw.summary : {};
  const num = function (v) { return typeof v === "number" ? v : 0; };
  agentsSec = {
    total: typeof agRaw.total === "number" ? agRaw.total : files.length,
    // Buckets partition `total` by `action` first; `toolsStyle` "absent" alone also marks skipped/conflict
    // entries (double-counted as inherit).
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
const projRaw = parseSection(rawProject, "semble-project.sh audit");
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

// `ready` = every required check, not phase alone (v1 repo / unsmoked install): each unmet one -> own clause, `partial`.
// Unreadable section never downgrades (absent measurement != defect, see want===0).
const INSTALL_STEPS = ["prereq", "mcp", "permissions", "guidance", "agents"];
// `verifyWhy` holds the warm/smoke clauses only: when they are the WHOLE reason,
// `resume` closes the gap, otherwise `install` owns the repair.
const why = [];
// Retired hook leftovers (file or registration); `upgrade` removes them.
const retiredLeft = (guidSec && !isErr(guidSec))
  ? Array.from(new Set(guidSec.retired.concat(guidSec.retiredWired))) : [];
const verifyWhy = [];
// Clauses outside verifyWhy that `resume` still fixes: its warm builds a missing index variant.
let resumeWhy = 0;
// Clauses that are absolute-path hook drift alone (stale entries, hooks wired): `upgrade` migrates them.
let absWhy = 0;
// Other clauses `upgrade` closes by itself (agent patching, a stale rule stamp): no reinstall needed.
let upgradeWhy = 0;
let stampStale = false;
if (verdict === "ready") {
  if (guidSec && !isErr(guidSec)) {
    const stale = typeof guidSec.staleEntries === "number" ? guidSec.staleEntries : 0;
    const wired = typeof guidSec.wiredCount === "number" ? guidSec.wiredCount : 0;
    const want = typeof guidSec.wantCount === "number" ? guidSec.wantCount : 0;
    if (retiredLeft.length) { why.push("stale (remove via upgrade): " + retiredLeft.join(", ")); }
    if (stale > 0) {
      why.push(stale + " stale settings " + (stale === 1 ? "entry" : "entries"));
      if (absoluteOnly) absWhy += 1;
    }
    if (guidSec.rule === "stale") { why.push("semble-first rule is a prior-release copy"); }
    // want===0 means the wiring counts were not reported at all - never treat an
    // absent count as a defect, or a trimmed report downgrades a healthy repo.
    if (want > 0 && wired !== want) {
      why.push("hooks wired " + wired + "/" + want);
      if (absoluteOnly) absWhy += 1;
    }
    // `user_modified` is a supported state (the user owns their edits); only a
    // rule that is not on disk at all leaves the guidance half uninstalled.
    if (guidSec.rule === "absent") { why.push("semble-first rule absent"); }
    if (guidSec.permissionsWired !== true) { why.push("MCP tool permissions not wired"); }
  } else if (isErr(guidSec)) {
    // Errored guidance probe = rule, hooks, permissions unproven -> clause; NULL = not requested (--section mcp).
    // cacheSec/agentsSec stay lenient: one optional fact each, error kept in the section (test 55).
    why.push("guidance probe failed: " + guidSec.error);
  }
  // phase===ready proves state parsed -> recorded steps authoritative; warm/smoke missing from `completed`
  // = skipped verification (SKILL.md Step 4.3).
  const done = stateSec.completed;
  const missVerify = ["warm", "smoke"].filter(function (s) { return done.indexOf(s) < 0; });
  if (missVerify.length) {
    verifyWhy.push(missVerify.join(" and ") + " not recorded in state.completed");
  }
  // pushed here, not appended at the end, to keep the fixed display order
  why.push.apply(why, verifyWhy);
  const missInstall = INSTALL_STEPS.filter(function (s) { return done.indexOf(s) < 0; });
  if (missInstall.length) { why.push("install steps not recorded: " + missInstall.join(", ")); }
  if (cacheSec && !isErr(cacheSec) && cacheSec.present === false) {
    why.push("no current content variant in the shared cache");
    resumeWhy += 1;
  }
  if (agentsSec && !isErr(agentsSec) && typeof agentsSec.needsPatch === "number" && agentsSec.needsPatch > 0) {
    why.push(agentsSec.needsPatch + (agentsSec.needsPatch === 1 ? " agent needs" : " agents need") + " patching");
    upgradeWhy += 1;   // upgrade runs `semble-agents.sh apply` (Step 3.2b)
  }
  // Stale stamp (artifact-metadata.md section 6; P2: unstamped = older); a prior-release copy has its own clause.
  if (guidSec && !isErr(guidSec) && guidSec.ruleStampStale && guidSec.rule !== "stale") {
    stampStale = true;
    upgradeWhy += 1;
    why.push("artifacts at content_version " + (guidSec.content_version || "none") +
      ", plugin at " + guidSec.templateContentVersion +
      (guidSec.version ? " (version " + guidSec.version + ")" : ""));
  }
  if (why.length) { verdict = "partial"; reason = why.join("; "); }
}

// A hand-edited rule keeps its old stamp through `upgrade` (never overwritten): plain `upgrade` would loop.
const editedRuleOnly = stampStale && why.length === 1 && guidSec.rule === "user_modified"
  && !pinMoved && !retiredLeft.length;
if (editedRuleOnly) {
  reason = "semble-first rule is hand-edited at content_version " + (guidSec.content_version || "none") +
    ", plugin at " + guidSec.templateContentVersion + "; upgrade keeps it as is";
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
} else if (editedRuleOnly) {
  // P1: user decision only; the skill never edits a hand-edited rule, nor invites a hand merge.
  nextStep = "User review (the skill never edits a hand-edited rule): diff -u " + E.SC_RULE_FILE + " " + E.SC_RULE_TEMPLATE +
    "\nTo replace it with the template: /brewcode:semble-setup upgrade --force (backs up " + E.SC_RULE_FILE + ".bak.<epoch> first)";
} else if (pinMoved || retiredLeft.length || (guidSec && guidSec.rule === "stale")) {
  nextStep = "Run /brewcode:semble-setup upgrade";
} else if ((absWhy || upgradeWhy) && absWhy + upgradeWhy + verifyWhy.length + resumeWhy === why.length) {
  // Only absolute hook args, agent patching or a stale stamp (plus resume-owned gaps): `upgrade` closes them.
  nextStep = "Run /brewcode:semble-setup upgrade";
} else if ((verifyWhy.length || resumeWhy) && verifyWhy.length + resumeWhy === why.length) {
  // Installed and wired; only warm/smoke unproven or the index variant missing.
  // `resume` re-runs exactly that (warm builds the index), `install` would redo the whole thing.
  nextStep = "Run /brewcode:semble-setup resume";
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
add("versions", versionsSec);
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
  if (report.versions) {
    if (isErr(report.versions)) {
      L.push("version:  error: " + report.versions.error);
    } else {
      const v = report.versions;
      const head = v.verdict === "ok" ? "ok (registered " + v.registered + " = pin " + v.pin + ")"
        : (v.verdict === "not_registered" ? "not registered (pin " + v.pin + ")" : v.verdict + " (" + v.detail + ")");
      L.push("version:  " + head + (v.action === "none" ? "" : " -> run: " + v.action) + "  [" + v.configFile + "]");
      const u = v.upstream;
      L.push("upstream: " + (u.latest
        ? u.latest + " - " + (u.advisory || "pin current")
        : "unknown (" + String(u.reason).replace(/_/g, " ") + ")"));
    }
  }
  if (report.cache) {
    if (isErr(report.cache)) {
      L.push("cache:    error: " + report.cache.error);
    } else {
      const c = report.cache;
      L.push("cache:    " + (c.codeRoot || "unknown") +
        " | repo " + (c.repoHash ? String(c.repoHash).slice(0, 8) : "unknown") +
        " | variant " + (c.indexLeaf || "unknown") +
        " | " + fmtBytes(c.sizeBytes) +
        " | " + (c.staleness || "unknown"));
    }
  }
  if (report.guidance) {
    if (isErr(report.guidance)) {
      L.push("guidance: error: " + report.guidance.error);
    } else {
      const g = report.guidance;
      const ver = g.content_version
        ? " | content_version " + g.content_version + (g.templateContentVersion && g.templateContentVersion !== g.content_version
            ? " (plugin " + g.templateContentVersion + " - run /brewcode:semble-setup upgrade)" : "")
            + (g.version ? " [version " + g.version + "]" : "")
        : (g.version ? " | version " + g.version : "") + (g.ruleStampStale
            ? " | content_version none (plugin " + g.templateContentVersion + ")" : "");
      L.push("guidance: rule " + g.rule + " | CLAUDE.md " + g.claudeMd +
        " | hooks " + g.wiredCount + "/" + (g.wantCount || 0) + " wired" +
        " | permissions " + (g.permissionsWired ? "yes" : "no") + ver);
      if (retiredLeft.length) L.push("retired:  " + retiredLeft.join(", ") + " - stale (remove via upgrade)");
      if (g.absoluteCount) L.push("portable:  " + g.absoluteCount + " absolute-path hook entr"
        + (g.absoluteCount === 1 ? "y" : "ies") + " (break every other clone) - run /brewcode:semble-setup upgrade");
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
# Sibling JSON rides stdin: in argv/env it hits E2BIG past ARG_MAX, and env bytes shrink V8's stack.
REPORT="$(
  printf '%s\0' "$MCP_JSON" "$VERSIONS_JSON" "$CACHE_JSON" "$GUIDANCE_JSON" "$AGENTS_JSON" "$PROJECT_JSON" |
  SC_SECTION="$SECTION" \
  SC_JSONMODE="$JSON_MODE" \
  SC_PLATFORM="$(sc_platform)" \
  SC_ROOT="$(sc_project_root)" \
  SC_PIN="$SEMBLE_PIN_VERSION" \
  SC_SPEC="$SEMBLE_PIN_SPEC" \
  SC_TOOL_SEARCH="$SEMBLE_TOOL_SEARCH" \
  SC_TOOL_RELATED="$SEMBLE_TOOL_RELATED" \
  SC_STATE_FILE="$(sc_state_file)" \
  SC_RULE_FILE="$(sc_rule_file)" \
  SC_RULE_TEMPLATE="$(cd "$SC_DIR/.." && pwd)/assets/semble-first.md.template" \
  SC_PROJECT_SETTINGS="$(sc_project_settings)" \
  SC_USER_SETTINGS="$(sc_user_settings)" \
  SC_PROJECT_LOCAL_SETTINGS="$(sc_project_root)/.claude/settings.local.json" \
  SC_PREREQ_WANTED="$PREREQ_WANTED" \
  SC_BREW_PATH="$BREW_PATH" SC_BREW_VER="$BREW_VER" \
  SC_UV_PATH="$UV_PATH" SC_UV_VER="$UV_VER" \
  SC_UVX_PATH="$UVX_PATH" SC_UVX_VER="$UVX_VER" \
  SC_CLAUDE_PATH="$CLAUDE_PATH" SC_CLAUDE_VER="$CLAUDE_VER" \
  SC_NODE_PATH="$NODE_PATH" SC_NODE_VER="$NODE_VER" \
  SC_SEMBLE_TOOLVER="$SEMBLE_TOOLVER" SC_SEMBLE_RESOLVABLE="$SEMBLE_RESOLVABLE" \
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
