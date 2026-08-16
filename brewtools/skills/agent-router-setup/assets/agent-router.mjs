#!/usr/bin/env node
// brewcode-meta: version=6.1.4 content_version=6.1.4 generated_by=brewtools:agent-router-setup
/**
 * agent-router - PreToolUse hook for the `Agent` tool (Node built-ins only, ESM).
 *
 * The main loop habitually spawns a generic agent (`general-purpose`) when a real
 * expert exists: a project agent in `<root>/.claude/agents/*.md`, or a plugin
 * specialist. This hook catches that and redirects. Tier 1 = deterministic only:
 * no network, no LLM, single-digit milliseconds on the common path.
 *
 * Decision order (allow silently = exit 0, no stdout, as early as possible):
 *   1. tool_name !== 'Agent'                     -> allow  (`Task` normalizes to `Agent`)
 *   2. agent_id present (subagent-issued call)   -> allow  (only the main loop is policed)
 *   3. config enabled:false / config unparsable  -> allow
 *   4. subagent_type is a project agent          -> allow  (an expert was already picked)
 *      (an omitted subagent_type normalizes to general-purpose before steps 4-5)
 *   5. subagent_type not generic / in neverFlag  -> allow  (config owns the generic list)
 *   6. "agent-router: override|allow|skip" in the task text -> allow (escape hatch)
 *   7. STRONG intent rule fires + picked is generic -> DENY, naming the expert: the
 *      first ranked project agent that scores AND whose own frontmatter matches the
 *      same rule, else the plugin specialist. An agent that outranks everyone but
 *      does not cover the intent is not the expert - it just had its name in the
 *      prompt (the plan-engine incident).
 *   8. roster scoring: one clear winner          -> DENY, naming it. Every agent is
 *      scored on the text with its OWN NAME struck out, so a name quoted in the prompt
 *      (a config value: ARBITER_AGENT="plan-engine") earns nothing; an agent that
 *      declares its name among its `Triggers:` keeps those hits -> nudge
 *      several plausible / weak best             -> additionalContext nudge, allow
 *      nothing scores                            -> fall through
 *   9. WEAK intent signal (a bare artifact mention: SKILL.md, hooks.json, a shebang):
 *      never denies. If step 8 nudged, the two are MERGED into one message naming both
 *      the specialist and the candidates; otherwise it nudges alone.
 *  10. anti-loop: a given (session, root, task) is denied AT MOST ONCE; the retry is
 *      allowed with additionalContext instead. A deny returns to the model as a tool
 *      error; denying the retry too would loop forever.
 *  11. fail open, always: any throw / bad stdin / bad config / bad roster ->
 *      exit 0, no stdout. Never breaks the user's tool call.
 *
 * Channels:
 *   deny  : hookSpecificOutput.permissionDecision = "deny" + permissionDecisionReason
 *   nudge : hookSpecificOutput.additionalContext, NO permissionDecision (an `allow`
 *           here would bypass the user's own deny rules)
 *
 * State: <os.tmpdir()>/brewtools-agent-router/<session_id>/<sha1(root+key)[0..32]>
 *        one empty-ish marker file per (session, root, task) already denied once.
 *        `key` is the DESCRIPTION (the prompt's first 300 normalized chars only when
 *        there is no description) and deliberately ignores both the prompt body and the
 *        expert named: the model rewrites the prompt when it retries and the second pass
 *        can land on a different expert, and either one minted a fresh key - so the
 *        retry was denied too. Accepted trade-off: two distinct descriptionless tasks
 *        behind the same boilerplate prompt header share one marker; anti-loop errs
 *        toward allowing. Nothing else lives there, and nothing is written under
 *        ~/.claude (harness-protected
 *        path). If the state root is unusable (read-only, foreign-owned tmp) EVERY
 *        deny degrades to a nudge - without a marker we cannot guarantee the loop
 *        terminates.
 */
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
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';

const EVENT = 'PreToolUse';
const STATE_ROOT = path.join(os.tmpdir(), 'brewtools-agent-router');
const STALE_MS = 24 * 60 * 60 * 1000; // prune markers older than ~1 day
const MAX_ROOT_CLIMB = 16;
const PROMPT_SCAN_CHARS = 2000;
const DESC_SCAN_CHARS = 500;
const KEY_PROMPT_CHARS = 600; // raw slice behind the 300-char anti-loop key
const DESC_WORD_CAP = 3; // description-word overlap is noisy; bound its contribution
const UID = typeof process.getuid === 'function' ? process.getuid() : null;

/**
 * Intent rules: data, not control flow. `match` is a regex source string (compiled
 * case-insensitive, run over the RAW task text), `expert` the agent to redirect to,
 * `label` the human phrase used in the deny reason. First match wins. A config
 * `intents` array REPLACES this table wholesale.
 *
 * `match` carries only STRONG signals - an authoring verb aimed at the artifact.
 * `weakMatch` (optional) carries bare mentions: naming SKILL.md or hooks.json, or a
 * shebang inside a pasted command, says the task TOUCHES the artifact, not that it
 * authors one. A weak hit can only nudge; running a vendor generator must not be
 * blocked because its output path ends in SKILL.md.
 */
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

/**
 * A strong hit right after one of these is talk ABOUT the artifact, not a request to
 * author one ("do not create a new agent here", "explains how to create a skill").
 */
const NEGATION =
  /\b(?:do(?:es)?\s+not|don.t|never|avoid|instead\s+of|rather\s+than|how\s+to|explains?\s+how|without)\b[^\n]{0,20}$/i;

const DEFAULTS = {
  enabled: true,
  level: 'fast',
  genericTypes: ['general-purpose', 'worker'],
  // Explore is the right tool for search, Plan for planning - never flagged by
  // roster scoring. Only an explicit intent rule may override that. The four
  // intent experts are also here explicitly, and normalizeConfig() below unions
  // this list with every configured intent's `expert` - a router redirect target
  // can never itself be flagged, built-in or user-defined.
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

/**
 * Project root, canonical recipe (D1 Q5) plus an ownership check:
 * `CLAUDE_PROJECT_DIR` -> nearest ancestor carrying THIS router's config ->
 * nearest ancestor with `.git` -> nearest ancestor with `.claude` -> cwd unchanged.
 *
 * Directory existence alone is not ownership. Stopping at the first `.claude` let any
 * nested package/fixture directory mask the real root: config and roster both went
 * missing, the built-in defaults applied, and a router the user had explicitly
 * DISABLED at the real root kept denying spawns from a nested cwd (BT-F24).
 */
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
    climb(dir, (d) => exists(path.join(d, '.claude', 'brewtools', 'agent-router.json'))) ||
    climb(dir, (d) => exists(path.join(d, '.git'))) ||
    climb(dir, (d) => isDir(path.join(d, '.claude'))) ||
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

/**
 * Frontmatter `name` + `description`; anything malformed yields null (file skipped).
 * `self` is the agent's own words (name + full description incl. its triggers) - an
 * intent rule is run against it to ask whether this agent actually covers the intent.
 */
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
  if (!name) return null;
  const descM = /^description:\s*(.+)$/m.exec(fm);
  const description = descM ? descM[1].trim().replace(/^["']|["']$/g, '') : '';

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

function readRoster(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return []; // no roster dir: intents still apply, scoring simply finds nothing
  }
  const agents = [];
  for (const n of names.sort()) {
    if (!n.endsWith('.md')) continue;
    const a = parseAgentFile(path.join(dir, n), `.claude/agents/${n}`);
    if (a) agents.push(a);
  }
  return agents;
}

/** A missing dir is an EMPTY roster, not an error: intent rules still fire. */
function loadRoster(root) {
  return readRoster(path.join(root, '.claude', 'agents'));
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

/**
 * Every agent is scored on the text with its OWN name struck out: a name quoted as a
 * config value is not expertise (the plan-engine incident). Exception - an agent that
 * publishes its name among its `Triggers:` has earned those hits as real evidence.
 */
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

/**
 * os.tmpdir() is world-writable, so the root can be pre-created by another user as
 * a symlink. Accept it only as a real directory we own with no group/world write.
 */
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

function pruneStale() {
  const cutoff = Date.now() - STALE_MS;
  let names;
  try {
    names = readdirSync(STATE_ROOT);
  } catch {
    return;
  }
  for (const name of names) {
    const p = path.join(STATE_ROOT, name);
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

/**
 * True the FIRST time this (session, root, keyText) is seen; false afterwards, and false
 * whenever the marker cannot be persisted - a deny we cannot record is a deny that could
 * loop, so it degrades to a nudge instead. `keyText` is the stable part of the decision
 * (see the header): neither the prompt body nor the named expert is hashed, since the
 * retry may reword the prompt and land on a different expert.
 */
function claimDeny(sessionId, root, keyText) {
  if (!ensureStateRoot()) return false;
  const session = safeSegment(sessionId) || 'nosession';
  const dir = path.join(STATE_ROOT, session);
  const marker = path.join(dir, sha1(`${root}\0${keyText}`).slice(0, 32));
  try {
    lstatSync(marker);
    return false; // already denied once
  } catch {
    // not yet marked
  }
  pruneStale();
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch {
    return false;
  }
  return writeAtomic(marker, `${Date.now()}`);
}

// ── message builders ─────────────────────────────────────────────────────────

function rosterDenyReason(agent, picked) {
  return (
    `agent-router: '${agent.name}' (${agent.rel}) matches this task better than ${picked}` +
    ` - retry with subagent_type: ${agent.name}. ${TAIL}`
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

/** A strong match counts only when it is not negated by the words just before it. */
function strongHit(re, text) {
  if (!re) return false;
  const m = re.exec(text);
  return !!m && !NEGATION.test(text.slice(0, m.index));
}

/**
 * First STRONG match wins and may deny; a weak-only match is remembered and, if nothing
 * else speaks, becomes a nudge. The compiled strong regex travels with the result -
 * step 7 reuses it per roster agent instead of recompiling inside that loop.
 */
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

function main() {
  const input = readStdinSync();

  // 1 - not an Agent spawn (`Task` is an alias that normalizes to `Agent`).
  if (input.tool_name !== 'Agent') return;
  // 2 - a subagent issued this call; only the main loop is policed.
  if (nonEmpty(input.agent_id)) return;

  const root = findRoot(input.cwd);
  if (!root) return;

  // 3 - disabled, or a config file that exists but cannot be trusted.
  const cfg = loadConfig(root);
  if (cfg === CONFIG_BROKEN || cfg.enabled === false) return;

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
  const weakSignal = !!intent && !intent.strong && intent.expert !== picked;

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

try {
  main();
} catch {
  // 11 - fail open: no stdout, no stack trace, exit 0.
}
