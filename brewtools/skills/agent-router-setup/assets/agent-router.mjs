#!/usr/bin/env node
// brewcode-meta: version=6.10.0 content_version=6.5.6 generated_by=brewtools:agent-router-setup

// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

// agent-router PreToolUse `Agent`, tier 1 (deterministic): deny a main-loop generic spawn when a project/plugin expert owns
// the task, else nudge; each (session, root, task) denied at most once. Fail-open: exit 0, no stdout.
import {
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
  mkdirSync,
  lstatSync,
  statSync,
  chmodSync,
  rmSync,
  realpathSync,
  appendFileSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const EVENT = 'PreToolUse';
const STATE_ROOT = path.join(os.tmpdir(), 'brewtools-agent-router');
const PROJECT_PREFIX = 'p-'; // <STATE_ROOT>/p-<sha1(real root)[0..16]>/
const VERIFIER_PREFIX = 'hook-agent-'; // agent_id of a `type: "agent"` hook's verifier
const JUDGE_GRACE_MS = 90 * 1000; // 3x the tier-2 timeout: an older unanswered verdict is lost
const STALE_MS = 24 * 60 * 60 * 1000; // prune markers older than ~1 day
const MAX_ROOT_CLIMB = 16;
const PROMPT_SCAN_CHARS = 2000;
const DESC_SCAN_CHARS = 500;
const KEY_PROMPT_CHARS = 600; // raw slice behind the 300-char anti-loop key
const DESC_WORD_CAP = 3; // description-word overlap is noisy; bound its contribution
const MAX_AGENT_DEPTH = 6; // subdir levels under an agents dir; deeper files are missed (fail-open)
const MAX_AGENT_FILES = 500; // .md files read per agents dir
const UID = typeof process.getuid === 'function' ? process.getuid() : null;

// Intent rules (first match wins; config `intents` replaces the table): `match` = STRONG regex (may deny),
// `weakMatch` = bare artifact mention (nudge only), both case-insensitive over the raw task text.
const DEFAULT_INTENTS = [
  {
    label: 'skill authoring',
    expert: 'brewcode:skill-creator',
    match:
      '\\bskill activation\\b' +
      '|\\b(?:creat|writ|author|scaffold|improv|refactor|fix|updat|debug|add)\\w*\\s+' +
      '(?:a\\s+|an\\s+|the\\s+|new\\s+|our\\s+|this\\s+)*(?:[\\w:.-]+\\s+){0,2}?' +
      '(?:claude(?:\\s+code)?\\s+)?(?:skills?|slash[ -]commands?)(?![\\w-])' +
      '|\\bskills?\\s+(?:creation|authoring|scaffold\\w*|definition)\\b',
    weakMatch: '\\bSKILL\\.md\\b|\\bslash[ -]command\\b',
    domain: '\\bskills?(?![\\w-])|\\bSKILL\\.md\\b|\\bslash[ -]commands?(?![\\w-])',
  },
  {
    label: 'agent authoring',
    expert: 'brewcode:agent-creator',
    match:
      '\\bagent (?:definition|frontmatter)\\b' +
      '|\\bsubagent definition\\b' +
      '|\\b(?:creat|writ|author|scaffold|improv|refactor|fix|updat|add)\\w*\\s+' +
      '(?:a\\s+|an\\s+|the\\s+|new\\s+|our\\s+|this\\s+)*(?:[\\w:.-]+\\s+){0,2}?' +
      '(?:sub[- ]?)?agents?(?![\\w-])',
    weakMatch: '\\.claude/agents/|\\bagent (?:roster|file)\\b',
    domain: '\\b(?:sub[- ]?)?agents?(?![\\w-])',
  },
  {
    label: 'hook authoring',
    expert: 'brewcode:hook-creator',
    match:
      '\\b(?:creat|writ|author|debug|fix|improv|updat|instal|regist|add)\\w*\\s+' +
      '(?:a\\s+|an\\s+|the\\s+|new\\s+|our\\s+|this\\s+)*(?:[\\w:.-]+\\s+){0,2}?' +
      '(?:claude(?:\\s+code)?\\s+)?hooks?(?![\\w-]|\\.json)',
    weakMatch:
      '\\bPreToolUse\\b|\\bPostToolUse\\b|\\bSessionStart\\b|\\bUserPromptSubmit\\b' +
      '|\\bSubagentStart\\b|\\bSubagentStop\\b|\\bhookSpecificOutput\\b|\\bhooks\\.json\\b' +
      '|\\bsettings\\.json\\b[^\\n]{0,40}\\bhooks?\\b' +
      '|\\bhooks?\\b[^\\n]{0,40}\\bsettings\\.json\\b',
    domain: '\\bhooks?(?![\\w-])',
  },
  {
    label: 'shell scripting',
    expert: 'brewcode:bash-expert',
    match:
      '\\bshell\\s?script\\b' +
      '|\\b(?:bash|zsh|sh)\\s+script\\b' +
      '|\\bshellcheck\\b' +
      '|\\b(?:writ|creat|fix|debug|refactor|harden|port|updat)\\w*\\s+' +
      '(?:a\\s+|an\\s+|the\\s+|new\\s+|our\\s+|this\\s+)*(?:[\\w:.-]+\\s+){0,2}?' +
      '[\\w./-]*\\.(?:sh|bash|zsh)\\b',
    weakMatch: '#!/(?:usr/bin/env\\s+)?(?:ba|z)?sh\\b',
    domain: '\\b(?:bash|shell|zsh)(?![\\w-])|\\.(?:sh|bash|zsh)\\b',
  },
];

/** Explicit user escape hatch, honored before any matching, on the UNTRUNCATED text. */
const OVERRIDE = /\bagent-router\s*:\s*(?:override|allow|skip)\b/i;

/** Negation applies directionally to an authoring predicate in the current clause. */
const NEGATION =
  /\b(?:do(?:es)?\s+not|don.t|must\s+not|should\s+not|cannot|can.t|(?:there\s+is\s+)?no\s+need\s+to|never|avoid|instead\s+of|rather\s+than|how\s+to|explains?\s+how|without)\b/gi;
const CLAUSE_BOUNDARY = /(?:[.!?;:](?:\s+|$)|[ \t]+[—–][ \t]+|\n+|\b(?:but|however)\b[,:]?[ \t]+)/gi;
const AUTHORING_PREDICATE =
  /\b(?:creat|writ|author|scaffold|improv|refactor|fix|updat|debug|add|instal|regist|harden|port)\w*\b/i;
const AUTHORING_ARTIFACT_PREDICATE_SOURCE =
  '\\b(?:creat|writ|author|scaffold|improv|refactor|fix|updat|debug|add|instal|regist|harden|port)\\w*\\s+' +
  '(?:(?:a|an|the|new|our|this)\\s+)?(?:[\\w:.-]+\\s+){0,2}' +
  '((?:sub[- ]?)?agents?|skills?|hooks?|scripts?|commands?|definitions?|files?)\\b';
const COMPLETED_AUTHORING_PREDICATE = new RegExp(AUTHORING_ARTIFACT_PREDICATE_SOURCE, 'i');

const DEFAULTS = {
  enabled: true,
  level: 'fast',
  genericTypes: ['general-purpose', 'worker'],
  // Never flagged by roster scoring (only an intent rule overrides); normalizeConfig() also adds
  // every intent `expert`, so a redirect target is never itself flagged.
  neverFlag: [
    'Explore', 'Plan', 'statusline-setup', 'output-style-setup',
    'brewcode:agent-creator', 'brewcode:skill-creator', 'brewcode:hook-creator', 'brewcode:bash-expert',
  ],
  minScore: 3,
  margin: 2,
  intents: DEFAULT_INTENTS,
};

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'from', 'by',
  'is', 'are', 'be', 'was', 'were', 'this', 'that', 'these', 'those', 'it', 'its',
  'as', 'at', 'into', 'not', 'no', 'all', 'any', 'we', 'you', 'your', 'our', 'i',
  'use', 'using', 'used', 'make', 'made', 'do', 'does', 'done', 'need', 'needs',
  'should', 'must', 'can', 'will', 'please', 'task', 'work', 'then', 'than', 'if',
  'new', 'add', 'run', 'get', 'set', 'via', 'over', 'up', 'out', 'so', 'but',
  'only', 'also', 'more', 'most', 'each', 'per', 'about', 'after', 'before',
]);

const TAIL = '(Deliberate? retry as-is, or put "agent-router: override" in the prompt.)';

let stateRootOk;

function output(obj) {
  process.stdout.write(JSON.stringify(obj));
}

function readStdinSync() {
  try {
    const raw = readFileSync(0, 'utf8');
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function nonEmpty(v) {
  return typeof v === 'string' && v.trim() !== '';
}

function sha1(s) {
  return createHash('sha1').update(s).digest('hex');
}

// ── project root / config ────────────────────────────────────────────────────

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function exists(p) {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

// Mirrors semble isProfileParent: HOME or the active config dir's parent holds a profile .claude, never a root.
function isProfileParent(dir) {
  const real = (p) => { try { return realpathSync(p); } catch { return ''; } };
  const p = real(dir);
  if (!p) return false;
  if (process.env.HOME && real(process.env.HOME) === p) return true;
  const cfg = process.env.CLAUDE_CONFIG_DIR;
  return Boolean(cfg) && real(cfg) === path.join(p, '.claude');
}

/** Nearest ancestor of `from` (inclusive, <= MAX_ROOT_CLIMB levels) satisfying `hit`. */
function climb(from, hit) {
  let cur = from;
  for (let i = 0; i < MAX_ROOT_CLIMB; i++) {
    if (hit(cur)) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

// Root: CLAUDE_PROJECT_DIR -> nearest ancestor with THIS router's config -> `.git` -> `.claude` -> cwd
// (a nested `.claude` must not mask a root where the router is disabled); `.claude` rungs skip profile parents.
function findRoot(cwd) {
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (env && isDir(env)) return path.resolve(env);
  let dir;
  try {
    dir = path.resolve(cwd || process.cwd());
  } catch {
    return null;
  }
  return (
    climb(dir, (d) => exists(path.join(d, '.claude', 'brewtools', 'agent-router.json')) && !isProfileParent(d)) ||
    climb(dir, (d) => exists(path.join(d, '.git'))) ||
    climb(dir, (d) => isDir(path.join(d, '.claude')) && !isProfileParent(d)) ||
    dir
  );
}

const CONFIG_BROKEN = Symbol('config-broken');

/** Absent config = defaults. Present-but-unparsable = fail open (allow, no output). */
function loadConfig(root) {
  const file = path.join(root, '.claude', 'brewtools', 'agent-router.json');
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return { ...DEFAULTS };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return CONFIG_BROKEN;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return CONFIG_BROKEN;
  return normalizeConfig(parsed);
}

function strList(v, fallback) {
  if (!Array.isArray(v)) return fallback;
  const out = v.filter((s) => typeof s === 'string' && s.trim() !== '');
  return out.length || v.length === 0 ? out : fallback;
}

function normalizeConfig(raw) {
  const cfg = { ...DEFAULTS };
  if (raw.enabled === false) cfg.enabled = false;
  if (typeof raw.level === 'string') cfg.level = raw.level; // tier-2 switch; tier 1 ignores it
  cfg.genericTypes = strList(raw.genericTypes, DEFAULTS.genericTypes);
  cfg.neverFlag = strList(raw.neverFlag, DEFAULTS.neverFlag);
  if (Number.isFinite(raw.minScore) && raw.minScore > 0) cfg.minScore = raw.minScore;
  if (Number.isFinite(raw.margin) && raw.margin >= 0) cfg.margin = raw.margin;
  if (Array.isArray(raw.intents)) {
    cfg.intents = raw.intents
      .filter((r) => r && typeof r === 'object' && nonEmpty(r.match) && nonEmpty(r.expert))
      .map((r) => ({
        label: r.label,
        expert: r.expert,
        match: r.match,
        // optional; an entry without it behaves exactly as before
        ...(nonEmpty(r.weakMatch) ? { weakMatch: r.weakMatch } : {}),
        ...(nonEmpty(r.domain) ? { domain: r.domain } : {}),
      }));
  }
  // An intent's redirect target is by definition already the right expert - it
  // can never be something this hook itself flags, built-in table or user override.
  cfg.neverFlag = [...new Set([...cfg.neverFlag, ...cfg.intents.map((r) => r.expert)])];
  return cfg;
}

// ── roster ───────────────────────────────────────────────────────────────────

/** Lowercase, unicode-safe; punctuation collapses to single spaces. */
function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Both fields are bounded: a multi-megabyte prompt must not turn into a regex bill. */
function taskText(toolInput) {
  const desc = typeof toolInput.description === 'string' ? toolInput.description : '';
  const prompt = typeof toolInput.prompt === 'string' ? toolInput.prompt : '';
  return `${desc.slice(0, DESC_SCAN_CHARS)}\n${prompt.slice(0, PROMPT_SCAN_CHARS)}`;
}

// Frontmatter `name` + `description`; null where Claude Code skips the file (no name/description, bad name).
// `self` (name + description) is matched against an intent rule to check the agent covers it.
function parseAgentFile(file, rel) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!m) return null;
  const fm = m[1];
  const nameM = /^name:\s*(.+)$/m.exec(fm);
  if (!nameM) return null;
  const name = nameM[1].trim().replace(/^["']|["']$/g, '').trim();
  if (!name || name.length > 256 || name.startsWith('-') || name.includes(':')) return null;
  const descM = /^description:\s*(.+)$/m.exec(fm);
  const description = descM ? descM[1].trim().replace(/^["']|["']$/g, '') : '';
  if (!description.trim()) return null;

  const trigM = /triggers:\s*([\s\S]*)$/i.exec(description);
  const triggers = [];
  if (trigM) {
    for (const part of trigM[1].split(/[,;]/)) {
      const t = normalizeText(part);
      if (t) triggers.push(t);
    }
  }
  const body = trigM ? description.slice(0, trigM.index) : description;
  const words = new Set(
    normalizeText(body)
      .split(' ')
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
  );
  return { name, rel, triggers, words: [...words], self: `${name} ${description}` };
}

// Recursive *.md walk: follows symlinks as Claude Code does, each real dir once; skips dot-dirs.
function agentFiles(dir, depth = 0, seen = new Set(), out = []) {
  if (out.length >= MAX_AGENT_FILES) return out;
  let real;
  let entries;
  try {
    real = realpathSync(dir);
    if (seen.has(real)) return out;
    seen.add(real);
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // missing or unreadable dir: nothing to add
  }
  const subdirs = [];
  for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const p = path.join(dir, e.name);
    let isDirectory = e.isDirectory();
    let isFile = e.isFile();
    if (e.isSymbolicLink()) {
      try {
        const st = statSync(p);
        isDirectory = st.isDirectory();
        isFile = st.isFile();
      } catch {
        continue; // dangling link
      }
    }
    if (isFile && e.name.endsWith('.md') && out.length < MAX_AGENT_FILES) out.push(p);
    else if (isDirectory && !e.name.startsWith('.') && depth < MAX_AGENT_DEPTH) subdirs.push(p);
  }
  for (const d of subdirs) agentFiles(d, depth + 1, seen, out);
  return out;
}

/** Identity = frontmatter `name`, never the path; on a duplicate name the first dir wins. */
function readRoster(dirs, base) {
  const agents = [];
  const names = new Set();
  for (const dir of dirs) {
    for (const file of agentFiles(dir)) {
      const a = parseAgentFile(file, path.relative(base, file).split(path.sep).join('/'));
      if (a && !names.has(a.name)) {
        names.add(a.name);
        agents.push(a);
      }
    }
  }
  return agents;
}

// Claude Code loads every `.claude/agents/` from the session dir up to the git root, closest first.
function projectAgentDirs(root) {
  const dirs = [];
  let cur = root;
  for (let i = 0; i < MAX_ROOT_CLIMB; i++) {
    dirs.push(path.join(cur, '.claude', 'agents'));
    if (exists(path.join(cur, '.git'))) return dirs;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return dirs.slice(0, 1); // no git root above: the root's own dir only
}

/** A missing dir is an EMPTY roster, not an error: intent rules still fire. */
function loadRoster(root) {
  return readRoster(projectAgentDirs(root), root);
}

// ── scoring ──────────────────────────────────────────────────────────────────

function scoreAgent(agent, textNorm, tokens) {
  let score = 0;
  for (const t of agent.triggers) {
    if (t.includes(' ')) {
      if (textNorm.includes(t)) score += 3;
    } else if (tokens.has(t)) {
      score += 2;
    }
  }
  let descHits = 0;
  for (const w of agent.words) if (tokens.has(w)) descHits++;
  score += Math.min(descHits, DESC_WORD_CAP);

  const nameNorm = normalizeText(agent.name);
  const parts = nameNorm.split(' ').filter(Boolean);
  if (nameNorm && textNorm.includes(nameNorm)) score += 4;
  else if (parts.length > 1 && parts.every((p) => tokens.has(p))) score += 2;
  return score;
}

// Score with the agent's OWN name struck out (a quoted config value is not expertise),
// unless the name is among its `Triggers:`.
function scoreOn(agent, textNorm) {
  const nameNorm = normalizeText(agent.name);
  const t =
    nameNorm && !agent.triggers.includes(nameNorm) ? textNorm.split(nameNorm).join(' ') : textNorm;
  return scoreAgent(agent, t, new Set(t.split(' ').filter(Boolean)));
}

/** Descending by score, then by name for a deterministic order. */
function rankRoster(roster, text) {
  const textNorm = normalizeText(text);
  return roster
    .map((a) => ({ agent: a, score: scoreOn(a, textNorm) }))
    .sort((x, y) => y.score - x.score || x.agent.name.localeCompare(y.agent.name));
}

// ── tmp state (anti-loop markers + roster cache) ─────────────────────────────

// Shared tmp: accept the root only as a real dir we own with no group/world write (no symlink).
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
      chmodSync(STATE_ROOT, 0o700);
      st = lstatSync(STATE_ROOT);
    }
    stateRootOk = (st.mode & 0o077) === 0;
  } catch {
    stateRootOk = false;
  }
  return stateRootOk;
}

function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, data, { mode: 0o600 });
    renameSync(tmp, file);
    return true;
  } catch {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // ignore
    }
    return false;
  }
}

function listDir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** Per-project state dir, keyed on the real root: purge and prune never reach another project. */
function projectStateDir(root) {
  let real = root;
  try {
    real = realpathSync(root);
  } catch {
    // keep the unresolved path
  }
  return path.join(STATE_ROOT, PROJECT_PREFIX + sha1(real).slice(0, 16));
}

/** Entries of `dir` idle for ~1 day; `keep(name)` exempts some (other projects' dirs). */
function pruneStale(dir, keep) {
  const cutoff = Date.now() - STALE_MS;
  for (const name of listDir(dir)) {
    if (keep && keep(name)) continue;
    const p = path.join(dir, name);
    try {
      const st = lstatSync(p); // lstat, never stat: do not follow a planted symlink
      if (!st.isDirectory()) {
        if (st.mtimeMs < cutoff) rmSync(p, { force: true }); // unlink the link itself
        continue;
      }
      if (UID !== null && st.uid !== UID) continue;
      if (st.mtimeMs >= cutoff) continue;
      rmSync(p, { recursive: true, force: true });
    } catch {
      // ignore individual entries
    }
  }
}

function safeSegment(s) {
  const raw = typeof s === 'number' && Number.isFinite(s) ? String(s) : s;
  if (typeof raw !== 'string') return null;
  const clean = raw.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128);
  return clean && clean !== '.' && clean !== '..' ? clean : null;
}

// True only the FIRST time (session, root, keyText) is seen and the marker persists (else nudge, no loop).
// keyText = description (else prompt head), never body/expert: a retry may reword and pick another expert.
function claimDeny(sessionId, root, keyText) {
  if (!ensureStateRoot()) return false;
  const project = projectStateDir(root);
  const dir = path.join(project, safeSegment(sessionId) || 'nosession');
  const marker = path.join(dir, sha1(keyText).slice(0, 32));
  try {
    lstatSync(marker);
    return false; // already denied once
  } catch {
    // not yet marked
  }
  pruneStale(project);
  // pre-6.5 layout kept session dirs at the top level, shared by every project.
  pruneStale(STATE_ROOT, (name) => name.startsWith(PROJECT_PREFIX));
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch {
    return false;
  }
  return writeAtomic(marker, `${Date.now()}`);
}

// ── tier-2 health (the judge cannot fail closed: count what it was asked and what it answered) ──

/** Appends one timestamp line; telemetry only, a failure here never changes a decision. */
function recordJudge(root, sessionId, kind) {
  if (!ensureStateRoot()) return;
  const dir = path.join(projectStateDir(root), safeSegment(sessionId) || 'nosession');
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    appendFileSync(path.join(dir, `judge-${kind}`), `${Date.now()}\n`, { mode: 0o600 });
  } catch {
    // ignore
  }
}

function stamps(file) {
  try {
    return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(Number);
  } catch {
    return [];
  }
}

/** overdue = verdicts expected more than JUDGE_GRACE_MS ago that never arrived (silent allows). */
function judgeHealth(root) {
  const project = projectStateDir(root);
  const settled = Date.now() - JUDGE_GRACE_MS;
  let expected = 0;
  let due = 0;
  let answered = 0;
  for (const session of listDir(project)) {
    const asked = stamps(path.join(project, session, 'judge-expected'));
    expected += asked.length;
    due += asked.filter((t) => t < settled).length;
    answered += stamps(path.join(project, session, 'judge-answered')).length;
  }
  return { expected, answered, overdue: Math.max(0, due - answered) };
}

// ── redirect-target existence ────────────────────────────────────────────────

// True only when the expert is on disk (project/user agent, `<plugin>:<agent>` in the plugin cache);
// unprovable (`--plugin-dir`, built-in) -> false.
function expertExists(expert, roster) {
  if (roster.some((a) => a.name === expert)) return true;
  if (/[\\/]/.test(expert)) return false;
  const home = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const colon = expert.indexOf(':');
  if (colon < 0) {
    const userDir = path.join(home, 'agents');
    return readRoster([userDir], userDir).some((a) => a.name === expert);
  }
  const plugin = expert.slice(0, colon);
  const file = `${expert.slice(colon + 1)}.md`;
  const cache = path.join(home, 'plugins', 'cache');
  for (const market of listDir(cache)) {
    for (const version of listDir(path.join(cache, market, plugin))) {
      if (exists(path.join(cache, market, plugin, version, 'agents', file))) return true;
    }
  }
  return false;
}

// ── message builders ─────────────────────────────────────────────────────────

function rosterDenyReason(agent, picked) {
  return (
    `agent-router: '${agent.name}' (${agent.rel}) owns this kind of task in this project - its` +
    ` Triggers/description match the task text and ${picked} lacks that domain context` +
    ` - retry with subagent_type: ${agent.name}. ${TAIL}`
  );
}

/** Strong intent, but the named expert is not on disk: say so, block nothing. */
function unverifiedIntentContext(intent, picked) {
  return (
    `agent-router: this looks like ${intent.label} - '${intent.expert}' is the expert for it, but it` +
    ' was not found in this install (project agents, user agents, plugin cache), so this spawn' +
    ` is not blocked; proceeding with ${picked}.`
  );
}

function intentPluginDenyReason(intent, picked) {
  return (
    `agent-router: this looks like ${intent.label} - '${intent.expert}' is the expert for it,` +
    ` not ${picked} - retry with subagent_type: ${intent.expert}. ${TAIL}`
  );
}

function intentProjectDenyReason(intent, agent, picked) {
  return (
    `agent-router: this looks like ${intent.label} - '${agent.name}' (${agent.rel}) is the project` +
    ` expert for it, not ${picked} - retry with subagent_type: ${agent.name}. ${TAIL}`
  );
}

/** Also the wording when the anti-loop marker could not be written - do not claim a cause. */
function repeatContext(expert, picked) {
  return (
    `agent-router: '${expert}' still looks like a better fit than ${picked} for this task,` +
    ' but this spawn is not being blocked (already flagged once, or the anti-loop marker' +
    ' could not be recorded) - proceeding as requested.'
  );
}

/** Weak signal: the task only MENTIONS the artifact - name the expert, block nothing. */
function weakIntentContext(intent, picked) {
  return (
    `agent-router: this task touches ${intent.label} artifacts - '${intent.expert}' is the expert` +
    ` for it. Consider re-spawning with it; proceeding with ${picked}.`
  );
}

function nudgeContext(candidates, picked) {
  const list = candidates.map((c) => `${c.agent.name} (${c.agent.rel})`).join('; ');
  return (
    `agent-router: project agents that may fit this task better than ${picked}: ${list}.` +
    ` Consider re-spawning with one of them; proceeding with ${picked}.`
  );
}

/** Both signals at once - the two nudge paths race otherwise and the specialist is lost. */
function mergedNudgeContext(intent, candidates, picked) {
  const list = candidates.map((c) => `${c.agent.name} (${c.agent.rel})`).join('; ');
  return (
    `agent-router: this task touches ${intent.label} artifacts - '${intent.expert}' is the expert` +
    ` for it; project agents that may also fit better than ${picked}: ${list}.` +
    ` Consider re-spawning with one of them; proceeding with ${picked}.`
  );
}

function emitDeny(reason, expert, picked, sessionId, root, keyText) {
  if (claimDeny(sessionId, root, keyText)) {
    output({
      hookSpecificOutput: {
        hookEventName: EVENT,
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    });
    return;
  }
  output({
    hookSpecificOutput: { hookEventName: EVENT, additionalContext: repeatContext(expert, picked) },
  });
}

function emitContext(text) {
  output({ hookSpecificOutput: { hookEventName: EVENT, additionalContext: text } });
}

// ── main ─────────────────────────────────────────────────────────────────────

function compileIntent(source) {
  try {
    return new RegExp(source, 'i');
  } catch {
    return null; // a bad user regex must not disable the rest of the table
  }
}

function artifactDomain(raw) {
  const artifact = raw.toLowerCase().replace(/[ -]/g, '');
  if (artifact.startsWith('subagent') || artifact.startsWith('agent')) return 'agent';
  if (artifact.startsWith('skill')) return 'skill';
  if (artifact.startsWith('hook')) return 'hook';
  if (artifact.startsWith('script')) return 'script';
  if (artifact.startsWith('command')) return 'command';
  if (artifact.startsWith('definition')) return 'definition';
  return 'file';
}

function authoringArtifactAt(text, index) {
  const match = new RegExp(`^(?:${AUTHORING_ARTIFACT_PREDICATE_SOURCE})`, 'i').exec(text.slice(index));
  return match ? artifactDomain(match[1]) : null;
}

function lastAuthoringArtifact(text) {
  let artifact = null;
  for (const match of text.matchAll(new RegExp(AUTHORING_ARTIFACT_PREDICATE_SOURCE, 'gi'))) {
    artifact = artifactDomain(match[1]);
  }
  return artifact;
}

function negatedAt(text, index) {
  const prefix = text.slice(0, index);
  let clauseStart = 0;
  CLAUSE_BOUNDARY.lastIndex = 0;
  for (let boundary = CLAUSE_BOUNDARY.exec(prefix); boundary; boundary = CLAUSE_BOUNDARY.exec(prefix)) {
    clauseStart = boundary.index + boundary[0].length;
  }
  CLAUSE_BOUNDARY.lastIndex = 0;
  const clause = prefix.slice(clauseStart);
  let nearest = null;
  NEGATION.lastIndex = 0;
  for (let negation = NEGATION.exec(clause); negation; negation = NEGATION.exec(clause)) {
    nearest = negation;
  }
  NEGATION.lastIndex = 0;
  if (!nearest) return false;

  const keyword = nearest[0].toLowerCase();
  const scope = clause.slice(nearest.index + nearest[0].length);
  if (keyword === 'without' && scope.includes(',')) return false;
  if (keyword === 'avoid') {
    if (scope.includes(',')) return false;
    for (const conjunction of scope.matchAll(/\band\b/gi)) {
      if (!AUTHORING_PREDICATE.test(scope.slice(0, conjunction.index))) return false;
    }
  }
  const currentArtifact = authoringArtifactAt(text, index);
  for (const separator of scope.matchAll(/,|\band(?:\s+(?:then|instead))?\b/gi)) {
    const priorScope = scope.slice(0, separator.index);
    if (!COMPLETED_AUTHORING_PREDICATE.test(priorScope)) continue;
    if (/\band\s+(?:then|instead)\b/i.test(separator[0])) return false;
    const priorArtifact = lastAuthoringArtifact(priorScope);
    if (priorArtifact && priorArtifact !== currentArtifact) return false;
  }
  return true;
}

/** Scan non-overlapping matches against the full text; anchors retain their original semantics. */
function strongHit(re, text) {
  if (!re) return false;
  const flags = `${re.flags.replace(/[gy]/g, '')}g`;
  const scan = new RegExp(re.source, flags);
  while (true) {
    const m = scan.exec(text);
    if (!m) return false;
    if (!negatedAt(text, m.index)) return true;
    if (m[0].length === 0) {
      if (m.index >= text.length) return false;
      scan.lastIndex = m.index + (text.codePointAt(m.index) > 0xffff ? 2 : 1);
    }
  }
}

// First STRONG match wins (may deny; its compiled regex is returned for reuse); a weak-only
// match becomes a nudge if nothing else speaks.
function matchIntent(intents, text) {
  let weak = null;
  for (const rule of intents) {
    const label = rule.label || 'specialist work';
    const re = compileIntent(rule.match);
    // Rosters describe OWNERSHIP, not authoring - a project owner never matches the
    // authoring verb pattern. `domain` is the noun-only test used for coverage.
    const coverRe = compileIntent(
      nonEmpty(rule.domain)
        ? rule.domain
        : nonEmpty(rule.weakMatch)
          ? `${rule.match}|${rule.weakMatch}`
          : rule.match,
    );
    if (strongHit(re, text)) return { label, expert: rule.expert, re, coverRe, strong: true };
    // an uncompilable `match` disables the whole rule, weak side included
    if (weak || !re || !nonEmpty(rule.weakMatch)) continue;
    const weakRe = compileIntent(rule.weakMatch);
    if (weakRe && weakRe.test(text)) weak = { label, expert: rule.expert, re, coverRe, strong: false };
  }
  return weak;
}

/** First ranked agent that both scores and covers `intent` in its own words. */
function intentOwner(ranked, intent, minScore) {
  for (const c of ranked) {
    if (c.score < minScore) break; // ranked descending
    const cov = intent.coverRe || intent.re;
    if (cov && cov.test(c.agent.self)) return c.agent;
  }
  return null;
}

/** Tier-2 verdict heartbeat: the judge's verifier answers through `StructuredOutput`. */
function recordVerdict(input) {
  if (typeof input.agent_id !== 'string' || !input.agent_id.startsWith(VERIFIER_PREFIX)) return;
  const root = findRoot(input.cwd);
  if (root) recordJudge(root, input.session_id, 'answered');
}

function main() {
  const input = readStdinSync();

  // 0 - a hook verifier's verdict (heartbeat entry, `level strict` only): count it, decide nothing.
  if (input.tool_name === 'StructuredOutput') return recordVerdict(input);
  // 1 - not an Agent spawn. Hook payloads carry `Agent`; a `Task` matcher never fires.
  if (input.tool_name !== 'Agent') return;

  const root = findRoot(input.cwd);
  if (!root) return;

  // 3a - a config file that exists but cannot be trusted.
  const cfg = loadConfig(root);
  if (cfg === CONFIG_BROKEN) return;
  // Tier 2 fires on EVERY Agent call, subagent-issued and disabled ones too: expect a verdict.
  if (cfg.level === 'strict') recordJudge(root, input.session_id, 'expected');
  // 2 - a subagent (or a hook verifier, `hook-agent-*`) issued this call; `agent_type` is optional.
  if (nonEmpty(input.agent_id)) return;
  // 3b - disabled.
  if (cfg.enabled === false) return;

  const ti = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};
  // an omitted subagent_type IS general-purpose per the Agent tool contract.
  const picked =
    (typeof ti.subagent_type === 'string' ? ti.subagent_type.trim() : '') || 'general-purpose';

  const roster = loadRoster(root);
  // 4 - the model already picked a project expert.
  if (roster.some((a) => a.name === picked)) return;
  // 5 - a plugin specialist / built-in, or explicitly never flagged.
  if (cfg.neverFlag.includes(picked)) return;
  if (!cfg.genericTypes.includes(picked)) return;

  const desc = typeof ti.description === 'string' ? ti.description : '';
  const prompt = typeof ti.prompt === 'string' ? ti.prompt : '';
  const text = taskText(ti);
  if (!text.trim()) return;
  // 6 - the user said so explicitly; honored wherever they wrote it, scan window or not.
  if (OVERRIDE.test(desc) || OVERRIDE.test(prompt)) return;

  // Anti-loop key: the stable half of the decision, never the prompt body. Sliced raw
  // first - an 8 MB prompt must not be normalized in full just to hash 300 chars.
  const keyText =
    normalizeText(desc.slice(0, DESC_SCAN_CHARS)) ||
    normalizeText(prompt.slice(0, KEY_PROMPT_CHARS)).slice(0, 300);
  const ranked = rankRoster(roster, text);
  const best = ranked[0];
  const runnerUp = ranked[1];
  const intent = matchIntent(cfg.intents, text);
  // An expert that cannot be found is never advertised: no deny, no "re-spawn with it".
  const expertReal = !!intent && expertExists(intent.expert, roster);
  const weakSignal = expertReal && !intent.strong && intent.expert !== picked;

  // 7 - strong intent signal; only an agent that COVERS it may outrank the specialist.
  if (intent && intent.strong && intent.expert !== picked) {
    const owner = intentOwner(ranked, intent, cfg.minScore);
    if (owner) {
      emitDeny(
        intentProjectDenyReason(intent, owner, picked),
        owner.name,
        picked,
        input.session_id,
        root,
        keyText,
      );
      return;
    }
    if (!expertReal) {
      emitContext(unverifiedIntentContext(intent, picked));
      return;
    }
    emitDeny(
      intentPluginDenyReason(intent, picked),
      intent.expert,
      picked,
      input.session_id,
      root,
      keyText,
    );
    return;
  }

  // 8 - roster scoring.
  if (best && best.score > 0) {
    const clearWinner =
      best.score >= cfg.minScore && best.score - (runnerUp ? runnerUp.score : 0) >= cfg.margin;
    if (clearWinner) {
      emitDeny(
        rosterDenyReason(best.agent, picked),
        best.agent.name,
        picked,
        input.session_id,
        root,
        keyText,
      );
      return;
    }
    const nudgeFloor = Math.max(1, Math.ceil(cfg.minScore / 2));
    if (best.score >= nudgeFloor) {
      const candidates = ranked.filter((c) => c.score > 0).slice(0, 3);
      emitContext(
        weakSignal
          ? mergedNudgeContext(intent, candidates, picked)
          : nudgeContext(candidates, picked),
      );
      return;
    }
  }

  // 9 - weak signal only, and nothing above spoke: one nudge, never a deny.
  if (weakSignal) emitContext(weakIntentContext(intent, picked));
}

// ── installer CLI (run from the plugin's assets dir; a hook call passes no flag) ──

const SM = 'agent-router: checking agent fit';
const PORTABLE = '${CLAUDE_PROJECT_DIR}/.claude/hooks/agent-router.mjs';

function keysAre(h, keys) {
  return !!h && typeof h === 'object' && !Array.isArray(h) && Object.keys(h).sort().join(',') === keys;
}

/** The one command tuple both the tier-1 and the heartbeat entry carry. */
function exactCommand(h) {
  return (
    keysAre(h, 'args,command,timeout,type') && h.type === 'command' && h.command === 'node' &&
    Array.isArray(h.args) && h.args.length === 1 && h.args[0] === PORTABLE && h.timeout === 5
  );
}

/** Drops the per-release stamp line: never inlined, never compared (same regex as INSTALL.md merge). */
const stripJudgeMeta = (text) => text.replace(/^<!-- brewcode-meta[:][^\n]*-->[ \t]*\r?\n?/gm, '');

/** First word of a shell `command`, unquoted, basename: `node` = direct launch, else a user launcher. */
function launcherOf(h) {
  const m = /^\s*(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(h && typeof h.command === 'string' ? h.command : '');
  return m ? String(m[1] ?? m[2] ?? m[3]).split(/[\\/]/).pop() : '';
}

/** `tier1|legacy|tier2|heartbeat|valid|wrapped`: exact, drifted, and user-launcher (report-only) handlers. */
function probeSettings(file) {
  const judge = stripJudgeMeta(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'judge-prompt.md'), 'utf8'));
  const isJudge = (prompt) => typeof prompt === 'string' && stripJudgeMeta(prompt) === judge;
  let s = {};
  let valid = true;
  try {
    const raw = exists(file) ? readFileSync(file, 'utf8') : '';
    if (raw.trim()) s = JSON.parse(raw);
    if (s === null || typeof s !== 'object' || Array.isArray(s)) valid = false;
  } catch {
    valid = false;
  }
  // Hook path anywhere in `command` + `args`, as setup-status's REG probe reads it.
  const ownsCommand = (h) =>
    !!h && [h.command, ...(Array.isArray(h.args) ? h.args : [])].some((t) => typeof t === 'string' && t.includes('agent-router.mjs'));
  const wrapped = (h) => typeof h.command === 'string' && !/^node(\.exe)?$/i.test(launcherOf(h));
  const ownsJudge = (h) =>
    !!h && typeof h === 'object' &&
    (h.statusMessage === SM || isJudge(h.prompt) ||
      (h.type === 'agent' && typeof h.statusMessage === 'string' && h.statusMessage.startsWith('agent-router:')));
  const n = { tier1: 0, legacy: 0, tier2: 0, heartbeat: 0, wrapped: 0 };
  for (const [event, entries] of Object.entries((valid && s.hooks) || {})) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || !Array.isArray(entry.hooks)) continue;
      const pre = event === 'PreToolUse';
      for (const h of entry.hooks) {
        if (ownsCommand(h)) {
          if (wrapped(h)) n.wrapped += 1;
          else if (pre && entry.matcher === 'Agent' && exactCommand(h)) n.tier1 += 1;
          else if (pre && entry.matcher === 'StructuredOutput' && exactCommand(h)) n.heartbeat += 1;
          else n.legacy += 1;
        } else if (ownsJudge(h)) {
          // any explicit `model` is drift: an omitted model cannot age out.
          const exact =
            pre && entry.matcher === 'Agent' && keysAre(h, 'prompt,statusMessage,timeout,type') &&
            h.type === 'agent' && isJudge(h.prompt) && h.timeout === 30 && h.statusMessage === SM;
          if (exact) n.tier2 += 1;
          else n.legacy += 1;
        }
      }
    }
  }
  return `${n.tier1}|${n.legacy}|${n.tier2}|${n.heartbeat}|${valid ? 'yes' : 'no'}|${n.wrapped}`;
}

function cli(mode, arg) {
  if (!nonEmpty(arg)) throw new Error(`${mode} needs a path argument`);
  if (mode === '--probe') return probeSettings(path.resolve(arg));
  const root = path.resolve(arg);
  if (mode === '--judge-health') {
    const h = judgeHealth(root);
    return `judge_expected=${h.expected} judge_answered=${h.answered} judge_overdue=${h.overdue}`;
  }
  if (mode === '--roster') return String(loadRoster(root).length);
  if (mode === '--purge-state') {
    const dir = projectStateDir(root);
    rmSync(dir, { recursive: true, force: true });
    return `OK purged ${dir}`;
  }
  throw new Error(`unknown mode ${mode}`);
}

if (typeof process.argv[2] === 'string' && process.argv[2].startsWith('--')) {
  try {
    process.stdout.write(`${cli(process.argv[2], process.argv[3])}\n`);
  } catch (e) {
    process.stderr.write(`agent-router: ${e.message}\n`);
    process.exitCode = 1;
  }
} else {
  try {
    main();
  } catch {
    // 11 - fail open: no stdout, no stack trace, exit 0.
  }
}
