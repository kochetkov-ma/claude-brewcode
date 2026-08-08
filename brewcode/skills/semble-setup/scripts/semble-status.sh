#!/usr/bin/env bash
# semble-status.sh - read-only status/doctor for the brewcode:semble-setup skill.
#
# Usage: semble-status.sh [--json] [--section SECTION] [--strict]
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
  --section SECTION  prereq|mcp|cache|guidance|agents|coverage|state|all
                     (default: all)
  --strict           exit 1 when verdict != ready
  -h, --help         this text

Exit: 0 report produced | 1 strict failure or internal error | 2 bad usage
Read-only: nothing is ever written.
EOF
}

JSON_MODE=0
SECTION="all"
STRICT=0

while [ $# -gt 0 ]; do
  case "$1" in
    --json)        JSON_MODE=1 ;;
    --strict)      STRICT=1 ;;
    --section)     shift; SECTION="${1:-}" ;;
    --section=*)   SECTION="${1#--section=}" ;;
    -h|--help)     usage; exit 0 ;;
    *)             sc_err "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift || true
done

case "$SECTION" in
  prereq|mcp|cache|guidance|agents|coverage|state|all) ;;
  *) sc_err "unknown section: ${SECTION:-(empty)}" >&2; usage >&2; exit 2 ;;
esac

sc_require_node

want() { [ "$SECTION" = "all" ] || [ "$SECTION" = "$1" ]; }

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
  stateSec = { present: false, phase: "absent", enabled: null, completed: [], updatedAt: null };
} else if (stRead.bad) {
  stateSec = {
    present: true, phase: "error", enabled: null, completed: [], updatedAt: null,
    error: "state file is not valid JSON: " + stRead.bad,
  };
} else {
  const s = (stRead.value && typeof stRead.value === "object" && !Array.isArray(stRead.value)) ? stRead.value : {};
  stateSec = {
    present: true,
    phase: typeof s.phase === "string" ? s.phase : "absent",
    enabled: typeof s.enabled === "boolean" ? s.enabled : null,
    completed: Array.isArray(s.completed) ? s.completed : [],
    updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : null,
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
  const rem = (h.reminder && typeof h.reminder === "object") ? h.reminder : {};
  const exp = (h.explore && typeof h.explore === "object") ? h.explore : {};
  const rule = (guidRaw.rule && typeof guidRaw.rule === "object") ? guidRaw.rule : {};
  const cmd = (guidRaw.claudeMd && typeof guidRaw.claudeMd === "object") ? guidRaw.claudeMd : {};
  const perm = (guidRaw.permissions && typeof guidRaw.permissions === "object") ? guidRaw.permissions : {};
  guidSec = {
    rule: typeof rule.state === "string" ? rule.state : "absent",
    claudeMd: typeof cmd.state === "string" ? cmd.state : "absent",
    settingsFile: typeof h.settingsFile === "string" ? h.settingsFile : "",
    hooks: {
      session: ses.file === "present" ? "present" : "missing",
      reminder: rem.file === "present" ? "present" : "missing",
      explore: exp.file === "present" ? "present" : "missing",
    },
    permissionsWired: perm.wired === true,
    // Read the authoritative sibling count (SessionStart + PreToolUse/Bash +
    // PreToolUse/Grep + SubagentStart/Explore). Never re-derive it from the
    // `wired` booleans: the reminder spans two matchers, so a half-wired
    // reminder loses one entry.
    wiredCount: typeof h.wiredCount === "number" ? h.wiredCount : 0,
    staleEntries: typeof h.staleEntries === "number" ? h.staleEntries : 0,
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
      L.push("guidance: rule " + g.rule + " | CLAUDE.md " + g.claudeMd +
        " | hooks " + g.wiredCount + "/4 wired" +
        " | permissions " + (g.permissionsWired ? "yes" : "no"));
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
