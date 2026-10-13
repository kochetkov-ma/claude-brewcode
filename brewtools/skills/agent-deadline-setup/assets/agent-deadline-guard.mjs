#!/usr/bin/env node
// brewcode-meta: version=6.5.2 content_version=6.5.0 generated_by=brewtools:agent-deadline-setup

// agent-deadline PreToolUse: soft wall-clock budget per subagent (agent_id AND agent_type), warn 80%, finalize-only past 100%.
// State <os.tmpdir()>/brewtools-agent-deadline/<session_id>/<agent_id>.json; sampled only at tool calls; fail-open `{}`.
import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  readdirSync,
  lstatSync,
  chmodSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const STATE_ROOT = path.join(os.tmpdir(), 'brewtools-agent-deadline');
const STALE_MS = 24 * 60 * 60 * 1000; // prune session dirs older than ~1 day
const WARN_RATIO = 0.8;
const DEFAULT_MINUTES = 20;
// Past this multiple of the budget the allow-list shrinks to bare persistence:
// a looping agent must not be able to burn unbounded time inside finalize tools.
const DEFAULT_HARD_STOP_RATIO = 2;
// Re-notice at most once per this budget fraction: a one-shot warning is lost when another
// hook or permission rule denies its carrying call.
const RENOTICE_RATIO = 0.1;
// Stop mark younger than this = same piece of work (clock keeps running); older = a later
// resume (fresh window). Stop -> next call measured 2.2-2.9 s live, with margin for a long turn.
const RESUME_GRACE_MS = 5 * 60 * 1000;
const PRUNE_MAX = 64; // entries examined per prune pass: bounded work per hook call
const MAX_CONFIG_CLIMB = 16;
const UID = typeof process.getuid === 'function' ? process.getuid() : null;

// Over-budget allow-list: re-read notes, persist the artifact, close/hand over tasks, report
// (SubagentHandback = the auto-mode report). AskUserQuestion and new work stay denied.
const FINALIZE_TOOLS = new Set([
  'Read',
  'Write',
  'Edit',
  'NotebookEdit',
  'TodoWrite',
  'TaskUpdate',
  'TaskCreate',
  'SubagentHandback',
]);
// Advertised core set: TaskCreate is allowed but deliberately unlisted (README.md, INSTALL.md,
// verbatim in tests/suite.mjs).
const FINALIZE_LIST = 'Read, Write, Edit, NotebookEdit, TodoWrite, TaskUpdate, SubagentHandback';

// Second threshold: only raw persistence and the report call survive.
const HARD_STOP_TOOLS = new Set(['Write', 'Edit', 'SubagentHandback']);
const HARD_STOP_LIST = [...HARD_STOP_TOOLS].join(', ');

// Agent types with no Write/Edit; override with config `readOnlyAgentTypes`.
const DEFAULT_READ_ONLY_TYPES = ['Explore', 'Plan'];

let configMemo; // per-process cache (hook is one-shot, but keeps reads at <=2)
let configFile = null; // path of the config that produced configMemo
let stateRootOk; // per-process cache of the tmp-root safety check

function output(obj) {
  process.stdout.write(JSON.stringify(obj));
}

function readStdinSync() {
  try {
    const raw = readFileSync(0, 'utf8');
    if (!raw.trim()) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// Nearest project config (walked up from cwd: a subdir cwd hid the root config) wins over global;
// absent/invalid config = feature off.
function loadConfig(cwd) {
  if (configMemo !== undefined) return configMemo;
  const globals = globalDirs();
  let dir = cwd || process.env.CLAUDE_PROJECT_DIR;
  if (dir) {
    dir = path.resolve(dir);
    for (let i = 0; i < MAX_CONFIG_CLIMB; i++) {
      // A global dir ends the climb: ~/.claude must not outrank $CLAUDE_CONFIG_DIR.
      if (globals.includes(path.join(dir, '.claude'))) break;
      const file = path.join(dir, '.claude', 'agent-deadline.json');
      const cfg = readJson(file);
      // An array is a JSON object to typeof; accepting one froze the walk on a file
      // that can never carry `enabled`, silently disabling the feature.
      if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
        configMemo = cfg;
        configFile = file;
        return cfg;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  for (const globalDir of globals) {
    const file = path.join(globalDir, 'agent-deadline.json');
    const cfg = readJson(file);
    if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
      configMemo = cfg;
      configFile = file;
      return cfg;
    }
  }
  configMemo = null;
  return null;
}

// Global config dirs, nearest first: $CLAUDE_CONFIG_DIR (the active profile) when set,
// then ~/.claude, so a profile that only registers the hooks keeps one shared config.
function globalDirs() {
  const dirs = [];
  const env = process.env.CLAUDE_CONFIG_DIR;
  if (typeof env === 'string' && env.trim()) dirs.push(path.resolve(env));
  try {
    const legacy = path.join(os.homedir(), '.claude');
    if (!dirs.includes(legacy)) dirs.push(legacy);
  } catch {
    // homedir unavailable -> project config and CLAUDE_CONFIG_DIR only
  }
  return dirs;
}

function budgetMinutes(cfg, agentType) {
  const overrides = cfg.byAgentType;
  if (overrides && typeof overrides === 'object' && agentType) {
    const v = overrides[agentType];
    if (Number.isFinite(v) && v > 0) return v;
  }
  const d = cfg.defaultMinutes;
  if (Number.isFinite(d) && d > 0) return d;
  return DEFAULT_MINUTES;
}

function hardStopRatio(cfg) {
  const v = cfg.hardStopRatio;
  return Number.isFinite(v) && v > 1 ? v : DEFAULT_HARD_STOP_RATIO;
}

// The payload carries no tool inventory, so "cannot write" comes from a config list.
function isReadOnly(cfg, agentType) {
  const list = Array.isArray(cfg.readOnlyAgentTypes) ? cfg.readOnlyAgentTypes : DEFAULT_READ_ONLY_TYPES;
  return list.includes(agentType);
}

// Test seam: AGENT_DEADLINE_NOW (epoch ms) pins the clock so suites assert exact values.
function clockNow() {
  const v = Number(process.env.AGENT_DEADLINE_NOW);
  return Number.isFinite(v) && v > 0 ? v : Date.now();
}

// Symlink-free spelling of the governing config path; uninstall/purge match state on it.
function canonicalPath(file) {
  if (!file) return null;
  try {
    return path.join(realpathSync(path.dirname(file)), path.basename(file));
  } catch {
    return path.resolve(file);
  }
}

/** Keep ids usable as path segments; reject anything that could escape. */
function safeSegment(s) {
  const raw = typeof s === 'number' && Number.isFinite(s) ? String(s) : s;
  if (typeof raw !== 'string') return null;
  const clean = raw.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128);
  return clean && clean !== '.' && clean !== '..' ? clean : null;
}

// Shared tmp: accept the root only as a real dir we own, no group/world write (a planted symlink
// would turn prune into rm -rf). Memoized per process.
function ensureStateRoot() {
  if (stateRootOk !== undefined) return stateRootOk;
  stateRootOk = false;
  try {
    mkdirSync(STATE_ROOT, { recursive: true, mode: 0o700 });
  } catch {
    // may already exist; validated below either way
  }
  try {
    let st = lstatSync(STATE_ROOT);
    if (!st.isDirectory() || (UID !== null && st.uid !== UID)) return stateRootOk;
    if ((st.mode & 0o077) !== 0) {
      chmodSync(STATE_ROOT, 0o700); // heal roots left 0755 by older versions
      st = lstatSync(STATE_ROOT);
    }
    stateRootOk = (st.mode & 0o077) === 0;
  } catch {
    stateRootOk = false;
  }
  return stateRootOk;
}

/** Best-effort, only called when a brand-new agent state file is created. */
function pruneStale(now) {
  const cutoff = now - STALE_MS;
  let names;
  try {
    names = readdirSync(STATE_ROOT);
  } catch {
    return;
  }
  for (const name of names.slice(0, PRUNE_MAX)) {
    const p = path.join(STATE_ROOT, name);
    try {
      const st = lstatSync(p); // lstat, never stat: a symlink must not be followed
      if (!st.isDirectory()) {
        if (st.mtimeMs < cutoff) rmSync(p, { force: true }); // unlink the link itself
        continue;
      }
      if (UID !== null && st.uid !== UID) continue;
      if (st.mtimeMs < cutoff) rmSync(p, { recursive: true, force: true });
    } catch {
      // ignore individual entries
    }
  }
}

const STATE_MISSING = Symbol('missing');
const STATE_UNREADABLE = Symbol('unreadable');

/** Distinguishes "no file yet" (start the clock) from "unreadable" (skip). */
function readState(file) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (e) {
    return e && e.code === 'ENOENT' ? STATE_MISSING : STATE_UNREADABLE;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : STATE_UNREADABLE;
  } catch {
    return STATE_UNREADABLE;
  }
}

/** Atomic: temp file + rename, so a parallel hook never reads a half-written file. */
function saveState(file, obj) {
  const temp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify(obj), { mode: 0o600 });
    renameSync(temp, file);
    return true;
  } catch {
    try {
      rmSync(temp, { force: true });
    } catch {
      // ignore
    }
    return false;
  }
}

/** Age of the last notice; mtime of the state file is bumped by every save. */
function lastNoticeAgeMs(file, now) {
  try {
    return now - lstatSync(file).mtimeMs;
  } catch {
    return 0; // unknown -> do not re-notice
  }
}

// A read-only agent cannot persist anything: it is never told to write a file.
function closing(readOnly) {
  return readOnly
    ? 'Return what you have now as your final report: what was done, what was not done, next steps.'
    : 'Save what you have to a file if the task expects one, then return your final report: ' +
        'what was done, what was not done, next steps.';
}

function warnText(elapsedMin, budget, readOnly) {
  return (
    `Time budget notice (agent-deadline hook): ${elapsedMin} of ${budget} min used. ` +
    `Finish the step in flight and prepare your final report. ` +
    (readOnly ? '' : `Save results you already have to a file if the task expects one. `) +
    `Once the budget is spent, only these tools stay available: ${FINALIZE_LIST}.`
  );
}

function expiredContext(elapsedMin, budget, readOnly) {
  return (
    `Time budget spent (${elapsedMin} of ${budget} min; agent-deadline hook). ` +
    `Still available: ${FINALIZE_LIST}. ${closing(readOnly)}`
  );
}

// Past the hard stop advertise HARD_STOP_LIST, never FINALIZE_LIST (no "Read available" then deny).
function hardExpiredContext(elapsedMin, budget, readOnly) {
  return (
    `Time budget far exceeded (${elapsedMin} of ${budget} min; agent-deadline hook). ` +
    `Still available: ${HARD_STOP_LIST}. ${closing(readOnly)}`
  );
}

function denyText(toolName, elapsedMin, budget, readOnly) {
  return (
    `Time budget spent (${elapsedMin} of ${budget} min; agent-deadline hook), so "${toolName}" ` +
    `is blocked and a retry will be blocked too. Still available: ${FINALIZE_LIST}. ` +
    closing(readOnly)
  );
}

function hardDenyText(toolName, elapsedMin, budget, readOnly) {
  return (
    `Time budget far exceeded (${elapsedMin} of ${budget} min; agent-deadline hook), so ` +
    `"${toolName}" is blocked and a retry will be blocked too. Still available: ` +
    `${HARD_STOP_LIST}. ${closing(readOnly)}`
  );
}

function main() {
  const input = readStdinSync();

  // Subagent only when BOTH ids are present: a build that starts stamping
  // agent_id on the main session must never make this guard block the user.
  const agentId = safeSegment(input.agent_id);
  const agentType = typeof input.agent_type === 'string' ? input.agent_type.trim() : '';
  if (!agentId || !agentType) {
    output({}); // main session, or unusable id -> never interfere
    return;
  }

  const cfg = loadConfig(input.cwd);
  if (!cfg || cfg.enabled !== true) {
    output({});
    return;
  }

  const sessionId = safeSegment(input.session_id) || 'nosession';
  const budget = budgetMinutes(cfg, agentType);
  const budgetMs = budget * 60000;
  const readOnly = isReadOnly(cfg, agentType);
  const dir = path.join(STATE_ROOT, sessionId);
  const stateFile = path.join(dir, `${agentId}.json`);

  const loaded = readState(stateFile);
  const now = clockNow();

  // Unreadable but present: skip this call. Treating it as "first call" would
  // rewrite start=now and hand the agent a fresh full budget.
  if (loaded === STATE_UNREADABLE) {
    output({});
    return;
  }

  let state = loaded;
  // SubagentStop left a stop mark. Older than the grace = a later resume -> fresh window.
  const stoppedAt = loaded !== STATE_MISSING && Number.isFinite(state.stopped) ? state.stopped : null;
  const resumedLate = stoppedAt !== null && now - stoppedAt >= RESUME_GRACE_MS;
  if (loaded === STATE_MISSING || !Number.isFinite(state.start) || resumedLate) {
    // First observed tool call of this agent (or of a late resume) = start of its clock.
    if (ensureStateRoot()) {
      try {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        const fresh = { start: now, warned: false, expired: false, config: canonicalPath(configFile) };
        if (saveState(stateFile, fresh)) pruneStale(now);
      } catch {
        // cannot persist -> silently disable for this agent
      }
    }
    output({});
    return;
  }

  const save = (patch) => {
    state = { ...state, ...patch };
    saveState(stateFile, state);
  };

  // Stopped moments ago and working again (blocked by another hook, harness nudge):
  // same piece of work, so the original clock keeps running; only the mark goes.
  if (stoppedAt !== null) {
    state = Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'stopped'));
    saveState(stateFile, state);
  }

  // A start in the future (clock jump, restored snapshot, hand-edited state) made
  // every ratio negative and disabled the deadline permanently; re-anchor it.
  if (state.start > now) save({ start: now });

  const elapsedMs = now - state.start;
  const rawMin = Math.max(0, elapsedMs / 60000);
  // one decimal below 10 min so sub-minute budgets do not all report "0"
  const elapsedMin = rawMin >= 10 ? Math.round(rawMin) : Math.round(rawMin * 10) / 10;
  const ratio = elapsedMs / budgetMs;
  const renoticeMs = budgetMs * RENOTICE_RATIO;
  const toolName = typeof input.tool_name === 'string' ? input.tool_name : '';

  if (ratio >= 1) {
    const hardStopped = ratio >= hardStopRatio(cfg);
    const allowed = hardStopped ? HARD_STOP_TOOLS : FINALIZE_TOOLS;
    if (allowed.has(toolName)) {
      if (!state.expired || lastNoticeAgeMs(stateFile, now) >= renoticeMs) {
        save({ expired: true, warned: true });
        output({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            additionalContext: hardStopped
              ? hardExpiredContext(elapsedMin, budget, readOnly)
              : expiredContext(elapsedMin, budget, readOnly),
          },
        });
        return;
      }
      output({}); // finalization tools always pass, quietly between notices
      return;
    }
    if (!state.expired) save({ expired: true, warned: true });
    const reason = hardStopped
      ? hardDenyText(toolName || 'this tool', elapsedMin, budget, readOnly)
      : denyText(toolName || 'this tool', elapsedMin, budget, readOnly);
    output({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    });
    return;
  }

  if (ratio >= WARN_RATIO && (!state.warned || lastNoticeAgeMs(stateFile, now) >= renoticeMs)) {
    save({ warned: true });
    output({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: warnText(elapsedMin, budget, readOnly),
      },
    });
    return;
  }

  output({});
}

try {
  main();
} catch {
  output({});
}
