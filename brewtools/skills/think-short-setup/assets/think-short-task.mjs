#!/usr/bin/env node
// brewcode-meta: version=5.3.0 generated_by=brewtools:think-short-setup
/**
 * think-short — PreToolUse hook for Task|Agent (self-contained, no plugin-root deps).
 *
 * Injects the FULL think-short prompt into the spawned subagent's prompt via
 * hookSpecificOutput.updatedInput.prompt (permissionDecision:"allow") — the
 * documented, reliable channel to reach a SUBAGENT prompt on PreToolUse:Task.
 * The injected block is the entire think-short-prompt.md MINUS its first line
 * (the `<!-- think-short -->` HTML-comment marker — never send a comment into a
 * subagent prompt). No "lite"/truncated variant: the subagent gets the same
 * full body that SessionStart / UserPromptSubmit inject.
 *
 * COEXISTENCE SAFETY (why this file is careful):
 *   Verified on CC 2.1.195 (bundle disassembly + live runs): when multiple
 *   PreToolUse hooks both match the same tool and both return `updatedInput`,
 *   Claude Code runs them IN PARALLEL and applies LAST-WINS — a
 *   non-deterministic race. The edits do NOT chain or merge; one hook randomly
 *   clobbers the others. To never destroy a payload we cannot reconstruct, this
 *   hook DETECTS other Task|Agent PreToolUse hooks and:
 *     - any UNKNOWN/foreign Task hook present -> YIELD (emit `{}`).
 *     - none present -> FIRE: emit `thinkShortBody + "\n\n" + original`.
 *
 * Fail-open: never throws, always exits 0. On any error / no prompt -> `{}`.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF_BASENAME = path.basename(fileURLToPath(import.meta.url)); // think-short-task.mjs
const PROMPT_PATH = path.join(HERE, 'think-short-prompt.md');
const CACHE_DIR = path.join(os.homedir(), '.claude', 'plugins', 'cache');

// Sibling brewcode-family plugins; their own Task hooks are known/benign, so
// think-short fires alongside them rather than yielding.
const FAMILY_PLUGINS = ['brewcode', 'brewtools', 'brewdoc'];

// Hook files the brewcode family actually ships. None of them returns
// `updatedInput`, so none can clobber our prompt edit — seeing one of these in a
// PreToolUse entry is NOT a reason to yield. Matched by basename, because the
// setup skills install project-local copies whose paths carry no plugin marker
// (e.g. `<cwd>/.claude/hooks/agent-router.mjs`).
//
// A STEM prefix set, not a file list: every family hook is named after the setup
// skill that installs it, so a hook added, renamed or retired inside an existing
// family is matched without editing this file. An exact list rotted exactly that
// way — it named hooks semble had dropped and never learned the ones it added,
// and semble has since retired one name and restored two others.
// Adding a whole NEW family (a new setup skill with a new hook name stem) is the
// only edit this still needs.
const FAMILY_HOOK_STEMS = [
  'semble',          // brewcode:semble-setup   — semble-session/-prefetch/-stats/-reminder/-subagent
  'docsync',         // brewdoc:docsync-setup   — docsync-track/-watch/-gate
  'think-short',     // brewtools:think-short-setup
  'agent-deadline',  // brewtools:agent-deadline-setup
  'agent-router',    // brewtools:agent-router-setup
  'manager-prompt',  // brewtools plugin hook
  'manager-state',   // brewtools:manager-setup — copied beside the guard
  'hardmode-guard',  // brewtools:manager-setup
  'forced-eval',     // brewcode plugin hook
  'session-start',   // brewcode + brewtools plugin hooks
];

// Anchored on a path/quote/space boundary so `foo-semble-x.mjs` is not a match,
// and applied to the JSON-serialised hook entry, where separators are `/` or `\\`.
const FAMILY_HOOK_RE = new RegExp(
  `(?:^|[^A-Za-z0-9_-])(?:${FAMILY_HOOK_STEMS.join('|')})[A-Za-z0-9-]*\\.mjs`
);

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function output(obj) {
  process.stdout.write(JSON.stringify(obj));
}

// FULL prompt body minus the leading `<!-- think-short -->` comment line.
function loadInjection() {
  let text;
  try {
    text = fs.readFileSync(PROMPT_PATH, 'utf8');
  } catch {
    return null;
  }
  const lines = text.split('\n');
  if (lines.length && /^\s*<!--/.test(lines[0])) lines.shift();
  const body = lines.join('\n').trim();
  return body || null;
}

function safeReadJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// A matcher "hits" Task when it (as a regex) matches "Task" or "Agent", OR when
// it is absent/empty (a matcher-less PreToolUse entry fires on every tool,
// including Task — so it could also rewrite the prompt).
function matcherHitsTask(matcher) {
  if (matcher == null || matcher === '') return true;
  try {
    const re = new RegExp(matcher);
    return re.test('Task') || re.test('Agent');
  } catch {
    return /Task|Agent/.test(String(matcher));
  }
}

// Classify a single PreToolUse entry that hits Task. Returns 'self' | 'family'
// | 'unknown'. `sourcePath` is the file the entry came from (helps identify a
// family plugin hook by its cache path).
function classifyEntry(entry, sourcePath) {
  const ref = JSON.stringify((entry && entry.hooks) || []);
  if (ref.includes(SELF_BASENAME)) return 'self';
  // A shipped family hook file, wherever it was installed from.
  if (FAMILY_HOOK_RE.test(ref)) return 'family';
  // Anything else coming out of a family plugin's own cache directory.
  for (const plugin of FAMILY_PLUGINS) {
    const marker = path.join('claude-brewcode', plugin);
    if ((sourcePath && sourcePath.includes(marker)) || ref.includes(marker)) return 'family';
  }
  return 'unknown';
}

// Collect kinds of OTHER Task|Agent PreToolUse hooks across all sources.
// Returns { hasUnknown }. Best-effort: every read is guarded; a
// missing/unparseable source simply contributes nothing.
function collectOtherTaskHooks(cwd) {
  let hasUnknown = false;
  const unknown = [];

  const scan = (settings, sourcePath) => {
    const pre = settings && settings.hooks && settings.hooks.PreToolUse;
    if (!Array.isArray(pre)) return;
    for (const entry of pre) {
      if (!entry || !matcherHitsTask(entry.matcher)) continue;
      const kind = classifyEntry(entry, sourcePath);
      if (kind === 'self' || kind === 'family') continue;
      hasUnknown = true;
      unknown.push({ source: sourcePath, matcher: entry.matcher ?? '(none)' });
    }
  };

  // 1) project settings (cwd) + 2) user settings
  const sources = [
    path.join(cwd || process.cwd(), '.claude', 'settings.json'),
    path.join(os.homedir(), '.claude', 'settings.json'),
  ];
  for (const f of sources) scan(safeReadJSON(f), f);

  // 3) enabled plugin hooks: any hooks/hooks.json under the plugin cache.
  for (const hj of findPluginHooksFiles()) scan(safeReadJSON(hj), hj);

  return { hasUnknown, unknown };
}

// A silent yield used to look identical to a healthy install (status still read
// hook_files=3/3), so the no-op was invisible. Announce it ONCE per session via
// `systemMessage`; the marker keeps every later Task spawn quiet.
function announceOnce(sessionId, message) {
  try {
    const marker = path.join(os.tmpdir(), `think-short-yield-${String(sessionId || 'nosession').replace(/[^\w.-]/g, '_')}`);
    if (fs.existsSync(marker)) return {};
    fs.writeFileSync(marker, String(Date.now()), 'utf8');
    return { systemMessage: message };
  } catch {
    return {};
  }
}

// Walk the plugin cache (bounded depth) collecting every hooks/hooks.json.
// Handles both cache/<mp>/<plugin>/hooks/... and the real, deeper
// cache/<mp>/<plugin>/<version>/hooks/... layout.
function findPluginHooksFiles() {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 4) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name === 'hooks') {
        const hj = path.join(dir, 'hooks', 'hooks.json');
        try {
          if (fs.existsSync(hj)) found.push(hj);
        } catch {
          /* ignore */
        }
        continue;
      }
      walk(path.join(dir, e.name), depth + 1);
    }
  };
  walk(CACHE_DIR, 0);
  return found;
}

async function main() {
  try {
    const input = await readStdin();
    const tool_input = input && input.tool_input;

    // Only act when there is a subagent prompt to prepend to.
    if (!tool_input || typeof tool_input.prompt !== 'string') {
      output({});
      return;
    }

    const injection = loadInjection();
    if (!injection) {
      output({});
      return;
    }

    const { hasUnknown, unknown } = collectOtherTaskHooks(input.cwd);

    // Respect foreign hooks: never clobber a Task hook whose payload we cannot
    // reconstruct. Say so, once, instead of failing silently.
    if (hasUnknown) {
      const where = unknown.map(u => `${u.source} (matcher: ${u.matcher})`).join('; ');
      output(announceOnce(
        input.session_id,
        `think-short: subagent prompt injection YIELDED — a foreign PreToolUse Task/Agent hook is registered and could clobber the edit: ${where}. Run \`node ${fileURLToPath(import.meta.url)} --check\` for details.`
      ));
      return;
    }

    // FIRE. Prepend the think-short prompt body to the subagent prompt.
    const newPrompt = `${injection}\n\n${tool_input.prompt}`;

    output({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        updatedInput: {
          ...tool_input,
          prompt: newPrompt,
        },
      },
    });
  } catch {
    output({});
  }
}

// `--check [cwd]` — diagnostic for the skill's status block: reports whether the
// hook would actually inject, and names any foreign Task hook that suppresses it.
function check(cwd) {
  const { hasUnknown, unknown } = collectOtherTaskHooks(cwd);
  return {
    prompt_file: fs.existsSync(PROMPT_PATH),
    injects: !hasUnknown && Boolean(loadInjection()),
    yielded_to: unknown,
  };
}

if (process.argv.includes('--check')) {
  const cwdArg = process.argv[process.argv.indexOf('--check') + 1];
  output(check(cwdArg && !cwdArg.startsWith('-') ? cwdArg : process.cwd()));
  process.stdout.write('\n');
} else {
  main();
}
