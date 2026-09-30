---
name: docsync-setup
description: "Installs project-local doc-staleness tracking (hooks) and reports/forces doc sync. Triggers: docsync, track doc staleness, doc sync status, stale docs, doc frontmatter."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|upgrade|enable|disable|uninstall|purge] [sync [--all]|reread|frontmatter]"
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion]
model: sonnet
---
<!-- brewcode-meta: version=6.3.0 content_version=6.3.0 generated_by=brewdoc:docsync-setup -->

# docsync-setup

> Project-scoped doc-staleness tracker. Installs three project-local hooks that
> watch which `.md` docs you touch, then nag (once, at end of turn) when a touched
> doc is stale by date. Source of truth = each doc's own frontmatter. Replaces
> `brewdoc:auto-sync`.

<instructions>

## Prompt contract

Position 1 of `$ARGUMENTS` is a **free-form prompt** (RU/EN) — modes and flags are optional and may
follow in any order. Nobody types keys: resolve mode + scope FROM the prompt.

1. Strip flags. An explicit mode token anywhere wins outright, no scoring.
2. Else score modes by distinct whole-word keyword hits (table below). Highest unique score wins.
   Tie with a destructive mode -> `AskUserQuestion`; tie with `status` -> `status`; tie of two
   mutating modes -> the keyword appearing first; all zero -> `status` if installed, else `install`.
3. Empty arguments -> `status` if installed, else `install`; ask ONE scoping `AskUserQuestion` only
   when the answer changes what gets written. A read-only run asks nothing.
4. Outcome-changing ambiguity -> ONE `AskUserQuestion` (max 4 questions) BEFORE any work.
5. Prose that is not a mode/id/path is still input: extract the id, path or target from it.

Then print this block ONCE, before the first action:

```
PLAN — brewdoc:docsync-setup
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

Labels are literal; values follow the conversation language.

## Standard flow (every run)

1. **Resolve mode** from the free-text prompt (`$ARGUMENTS`) — state which mode and WHY.
2. **Print the PLAN block** (see Prompt contract above) — once, before acting.
3. **Execute** the mode.
4. **Output block** — the standard formatted summary (see Output Format below).
5. **Verification (MANDATORY)** — run the checks for the mode and report pass/fail
   per check. Never claim success unverified.

Run in the main conversation (uses `AskUserQuestion`). No `context: fork`.

> **Project root.** Resolve it ONCE and use it everywhere. The hooks resolve it as
> `CLAUDE_PROJECT_DIR` -> upward walk for `.git`/`.claude` -> hook `cwd`, with NO
> `git rev-parse` rung: they root on the nearest `.git`/`.claude` marker, which for a
> nested `.claude` is the tracker's own project, not the enclosing checkout. The snippet
> below is the skill's own recipe and keeps a `git rev-parse --show-toplevel` rung
> between the env var and the walk; the two agree on every layout except a nested
> `.claude`, where the hooks are the authority for config/state placement.
> `input.cwd` is NOT the project root: it drifts mid-session and the hooks use it for
> one thing only, resolving a relative `tool_input` path. Write the BARE braced
> `${CLAUDE_PROJECT_DIR}` — the `${VAR:-fallback}` form is never substituted and always
> loses to its fallback:
> ```bash
> ROOT="${CLAUDE_PROJECT_DIR}"
> [ -n "$ROOT" ] && [ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
> [ -n "$ROOT" ] || { d=$PWD; until [ -d "$d/.git" ] || [ -d "$d/.claude" ] || [ "$d" = / ]; do d=$(dirname "$d"); done; [ "$d" = / ] && ROOT=$PWD || ROOT=$d; }
> ```

> **Enumerating docs.** Use available native `Glob`/`Grep` tools. If unavailable,
> enumerate `.md` with Bash `find` (below) and search with `rg`; do not infer tool
> availability from the operating system.

## Mode Resolution — prompt-driven

Infer the mode from `$ARGUMENTS` (RU + EN). If a mode is named explicitly, honor
it. Otherwise derive from intent. State the resolved mode and the reason.

Canonical verbs, in order: `status | install | upgrade | enable | disable | uninstall | purge`.
Skill-specific extras come after them: `sync [--all]`, `reread`, `frontmatter`.

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `status` | *(empty)*, status, check, show, what is stale | что устарело, показать, статус | no |
| `install` | install | установи, настрой | yes |
| `upgrade` | upgrade, refresh hooks | обнови хуки, переустанови | yes |
| `enable` | enable, turn back on | включи, включи отслеживание, возобнови | yes |
| `disable` | disable, pause, mute | выключи, приостанови, отключи отслеживание | yes |
| `uninstall` | uninstall | удали docsync, снеси хуки | yes |
| `purge` | purge | вычисти, снеси всё вместе с конфигом | yes, destructive |
| `sync` | sync, sync all, `--all` | синхронизируй, обнови устаревшие | yes |
| `reread` | reread, refresh context | перечитай, освежи | no |
| `frontmatter` | frontmatter, add frontmatter | проставь frontmatter, ретро-разметка | yes |

- `(empty)` AND hooks NOT installed -> `install`. `(empty)` AND hooks installed -> `status`.
- Unrecognized text -> pick the closest mode; if unclear, default to `status`.
- Prose that names no mode/id/path is still input: extract the id/path/target from the sentence,
  never treat its first word as a positional id.
- A missing PLAN block, or one printed after work started, is a defect.

> Removed aliases — `init`, `on`, `off`, `setup`, `remove`, `reset`, `create`,
> `update`, `cleanup` are no longer accepted verbs. Map them to the canonical set
> above (`on` -> `enable`, `off` -> `disable`) and say so in the output. Never print
> a removed alias back to the user as a command.

> `disable` is NOT `uninstall`. It flips one key in `config.json`; the hooks stay
> registered in `settings.json`, the hook files stay on disk, the session state files and every
> `last_updated` you have written stay untouched. `enable` flips it back. Reach for
> `uninstall` only when the hooks should stop existing.

### First-run detection

**EXECUTE** using Bash tool:
```bash
ROOT="${CLAUDE_PROJECT_DIR}"
[ -n "$ROOT" ] && [ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
[ -n "$ROOT" ] || { d=$PWD; until [ -d "$d/.git" ] || [ -d "$d/.claude" ] || [ "$d" = / ]; do d=$(dirname "$d"); done; [ "$d" = / ] && ROOT=$PWD || ROOT=$d; }
if [ -f "$ROOT/.claude/hooks/docsync-gate.mjs" ] && grep -q 'docsync-gate.mjs' "$ROOT/.claude/settings.json" 2>/dev/null; then
  # `"enabled": false` means installed-but-inert, NOT missing. Absent key = enabled.
  if grep -q '"enabled"[[:space:]]*:[[:space:]]*false' "$ROOT/.claude/docsync/config.json" 2>/dev/null; then
    echo "docsync: INSTALLED (DISABLED)"
  else
    echo "docsync: INSTALLED"
  fi
else
  echo "docsync: NOT_INSTALLED"
fi
```

- `NOT_INSTALLED` + no explicit mode -> **install**.
- `INSTALLED` (either state) + no explicit mode -> **status**.
- A `DISABLED` install is still an install: `install` must refuse it and point at
  `enable`; never reinstall over a deliberate pause.

## Frontmatter schema (this system's docs)

```yaml
---
doc_type: llm                  # optional, UNQUOTED; absent or unrecognized => user. values: llm | user | skip
last_updated: "2026-07-19"     # sole staleness input (YYYY-MM-DD, LOCAL time)
sync_procedure: "what to check / where to look when syncing"   # optional, prose
---
```

- **Quote `last_updated` and `sync_procedure`; leave `doc_type` bare.** The hooks'
  frontmatter parser strips surrounding quotes and trailing comments
  (`assets/docsync-gate.mjs:136`, `docsync-track.mjs:114`, `docsync-watch.mjs:109`),
  so either form works for docsync — but a real YAML consumer types an unquoted
  `2026-07-19` as a Date, while `doc_type` is an enum that other brewcode tooling
  matches literally as `^doc_type: llm$`. Existing quoted docs keep working.
- `doc_type` drives compress depth on sync: `llm` = deep, `user` = light.
  Absent or unrecognized is normalized to `user` in code (`docTypeOf()` in all
  three hooks), not just in prose.
- `doc_type: skip` = file excluded from tracking entirely — enforced by all
  three hooks, including the Stop gate, which re-checks it at end of turn.
- `sync_procedure` is a **model-only hint**: NO hook reads it. It is prose the
  gate's block message and the `sync` mode tell Claude to follow after reading the
  doc. Leaving it out costs nothing mechanical.
- Staleness is DATE ONLY, in LOCAL time: `today - last_updated > threshold_days`.
  No hash, no deps.

## The three hooks — exact behavior

| File | Event | Matcher | Behavior |
|------|-------|---------|----------|
| `docsync-track.mjs` | PostToolUse | `Write\|Edit\|MultiEdit` | Records the touched `.md`; injects a nudge when it has no `last_updated` |
| `docsync-watch.mjs` | PostToolUse | `Read` | Records the touched `.md`. SILENT by design — a Read fires constantly |
| `docsync-gate.mjs` | Stop | — | Re-applies scope (`exclude` globs + `doc_type: skip`) to the touched set, then blocks AT MOST ONCE PER SESSION listing every stale AND every undated touched doc |

- The gate's `asked` flag is a single per-session boolean. After the one block,
  docs that go stale or get touched later in that session produce NO further
  signal until the next session. This is deliberate (a Stop hook that blocks
  repeatedly loops), not a bug — say so if a user asks why the nag stopped.
- A doc that is only ever READ and carries no `last_updated` IS reported: the
  gate lists it under `no last_updated`. Only `track` nudges mid-turn.
- All three hooks apply `exclude` and `doc_type: skip`, so marking a doc `skip`
  mid-session silences it at the gate too.

## Enumerate in-scope docs (status / sync --all / reread / frontmatter)

**EXECUTE** using Bash tool (lists project `.md`, minus `.git`; apply `exclude`
globs from config and any `doc_type: skip` in your own reasoning afterward):
```bash
ROOT="${CLAUDE_PROJECT_DIR}"
[ -n "$ROOT" ] && [ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
[ -n "$ROOT" ] || { d=$PWD; until [ -d "$d/.git" ] || [ -d "$d/.claude" ] || [ "$d" = / ]; do d=$(dirname "$d"); done; [ "$d" = / ] && ROOT=$PWD || ROOT=$d; }
cd "$ROOT" && find . -type f -name '*.md' -not -path './.git/*' | sed 's#^\./##' | sort
```

---

## Mode: install

Install the tracking system into THIS project. Never adds frontmatter to docs
(that is the opt-in `frontmatter` mode).

### Step 1: Ask threshold + excludes

**ASK** via `AskUserQuestion` (two questions in one call):

1. "Staleness threshold — after how many days without update is a doc stale?"
   Options: **7 (default)** / **14** / **30** / **Other** (user types a number).
2. "Exclude globs — which `.md` paths to ignore?"
   Options: **Common** (`node_modules/**`, `**/CHANGELOG.md`, `dist/**`, `build/**`, `vendor/**`) / **None** / **Other** (user types comma-separated globs).

Record `THRESHOLD` (integer, default 7) and `EXCLUDE` (comma-separated globs).

### Step 2: Copy hooks + write config + merge settings (idempotent, non-destructive)

**EXECUTE** using Bash tool. Replace `THRESHOLD_VALUE` and `EXCLUDE_JSON` first:
`THRESHOLD_VALUE` = chosen integer; `EXCLUDE_JSON` = JSON array of the chosen globs
(e.g. `["node_modules/**","**/CHANGELOG.md"]`, or `[]` for none).

```bash
ROOT="${CLAUDE_PROJECT_DIR}"
[ -n "$ROOT" ] && [ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
[ -n "$ROOT" ] || { d=$PWD; until [ -d "$d/.git" ] || [ -d "$d/.claude" ] || [ "$d" = / ]; do d=$(dirname "$d"); done; [ "$d" = / ] && ROOT=$PWD || ROOT=$d; }
MODE=install
node - "$ROOT" "${CLAUDE_SKILL_DIR}" "$MODE" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const [root, skill, mode] = process.argv.slice(2);
const names = ['docsync-track', 'docsync-watch', 'docsync-gate'];
const settings = path.join(root, '.claude/settings.json');
const config = path.join(root, '.claude/docsync/config.json');
const planned = [];
const createdDirs = [];
const committed = [];
const temps = [];
function snapshot(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile()) throw new Error(`not a regular file: ${file}`);
    return { bytes: fs.readFileSync(file), mode: stat.mode & 0o7777, atime: stat.atime, mtime: stat.mtime };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
function matches(file, expected) {
  const actual = snapshot(file);
  return expected === null ? actual === null : actual !== null && actual.bytes.equals(expected.bytes) && actual.mode === expected.mode;
}
function plan(file, bytes, before = snapshot(file)) {
  planned.push({ file, before, after: { bytes: Buffer.from(bytes), mode: before?.mode ?? 0o600 } });
}
function mkdir(dir) {
  if (fs.existsSync(dir)) return;
  mkdir(path.dirname(dir));
  fs.mkdirSync(dir);
  createdDirs.push(dir);
}
function atomic(file, state, expected) {
  const temp = `${file}.${process.pid}.${temps.length}.tmp`;
  const fd = fs.openSync(temp, 'wx', state.mode);
  temps.push(temp);
  try { fs.writeFileSync(fd, state.bytes); } finally { fs.closeSync(fd); }
  fs.chmodSync(temp, state.mode);
  if (!matches(file, expected)) throw new Error(`changed during setup: ${file}`);
  fs.renameSync(temp, file);
}
try {
  if (!['install', 'upgrade'].includes(mode)) throw new Error('mode must be install or upgrade');
  const version = JSON.parse(fs.readFileSync(path.join(skill, '../../.claude-plugin/plugin.json'), 'utf8')).version;
  const header = fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8');
  const contentVersion = /brewcode-meta:[^\n]*content_version=([0-9]+\.[0-9]+\.[0-9]+)/.exec(header)?.[1];
  if (!version || !contentVersion) throw new Error('missing plugin/content version');
  const threshold = THRESHOLD_VALUE;
  const exclude = EXCLUDE_JSON;
  if (!Number.isInteger(threshold) || threshold < 1 || !Array.isArray(exclude) || exclude.some(x => typeof x !== 'string')) throw new Error('invalid threshold or exclude list');
  const beforeConfig = snapshot(config);
  const previous = beforeConfig ? JSON.parse(beforeConfig.bytes.toString('utf8').replace(/^\uFEFF/, '')) : {};
  if (!previous || typeof previous !== 'object' || Array.isArray(previous)) throw new Error('config must be an object');
  if (mode === 'upgrade' && !beforeConfig) throw new Error('not installed; run install');
  const { version: oldVersion, content_version, generated_by, last_updated, ...rest } = previous;
  const next = { version, content_version: contentVersion, generated_by: 'brewdoc:docsync-setup', last_updated: new Date().toISOString().slice(0, 10), ...(mode === 'upgrade' ? rest : { enabled: true, threshold_days: threshold, exclude }) };
  const beforeSettings = snapshot(settings);
  const raw = beforeSettings?.bytes.toString('utf8').replace(/^\uFEFF/, '') ?? '';
  const data = raw.trim() ? JSON.parse(raw) : {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('settings must be an object');
  data.hooks ??= {};
  if (!data.hooks || typeof data.hooks !== 'object' || Array.isArray(data.hooks)) throw new Error('settings hooks must be an object');
  for (const [event, matcher, name] of [['PostToolUse', 'Write|Edit|MultiEdit', names[0]], ['PostToolUse', 'Read', names[1]], ['Stop', '', names[2]]]) {
    const groups = data.hooks[event] ??= [];
    if (!Array.isArray(groups) || groups.some(g => !g || !Array.isArray(g.hooks) || g.hooks.some(h => !h || typeof h !== 'object' || (h.args !== undefined && !Array.isArray(h.args))))) throw new Error(`invalid ${event} hooks`);
    if (groups.some(g => g.hooks.some(h => [h.command ?? '', ...(h.args ?? [])].join(' ').includes(`${name}.mjs`)))) continue;
    let group = groups.find(g => (g.matcher ?? '') === matcher);
    if (!group) { group = matcher ? { matcher, hooks: [] } : { hooks: [] }; groups.push(group); }
    group.hooks.push({ type: 'command', command: 'node', args: ['${' + 'CLAUDE_PROJECT_DIR}/.claude/hooks/' + name + '.mjs'] });
  }
  for (const name of names) {
    const source = path.join(skill, 'assets', `${name}.mjs`);
    const checked = spawnSync(process.execPath, ['--check', source], { encoding: 'utf8' });
    if (checked.status !== 0) throw new Error(`invalid hook source: ${source}`);
    plan(path.join(root, '.claude/hooks', `${name}.mjs`), fs.readFileSync(source));
  }
  plan(config, JSON.stringify(next, null, 2) + '\n', beforeConfig);
  // Never overwrite a prior user backup; each rollback uses this run's snapshots.
  if (!fs.existsSync(`${settings}.bak`)) plan(`${settings}.bak`, beforeSettings?.bytes ?? '{}\n', null);
  plan(settings, JSON.stringify(data, null, 2) + '\n', beforeSettings);
  // Validate every input and snapshot every destination before the first mutation.
  for (const entry of planned) {
    mkdir(path.dirname(entry.file));
    atomic(entry.file, entry.after, entry.before);
    committed.push(entry);
  }
  console.log(`docsync ${mode}: hooks, config and settings committed; settings backup: ${settings}.bak`);
} catch (error) {
  console.error(`docsync ${mode} failed: ${error.message}`);
  for (const entry of committed.reverse()) {
    try {
      if (!matches(entry.file, entry.after)) throw new Error('concurrent edit preserved; reconcile manually');
      if (entry.before) {
        atomic(entry.file, entry.before, entry.after);
        fs.utimesSync(entry.file, entry.before.atime, entry.before.mtime);
      } else fs.unlinkSync(entry.file);
    } catch (rollbackError) { console.error(`rollback ${entry.file}: ${rollbackError.message}`); }
  }
  process.exitCode = 1;
} finally {
  for (const temp of temps) { try { fs.unlinkSync(temp); } catch (error) { if (error.code !== 'ENOENT') console.error(`cleanup ${temp}: ${error.message}`); } }
  for (const dir of createdDirs.reverse()) { try { fs.rmdirSync(dir); } catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) console.error(`cleanup ${dir}: ${error.message}`); } }
}
NODE
```

> **STOP on nonzero exit.** Validation errors leave destinations untouched; write
> failures restore each committed file independently, preserving concurrent edits.
> An existing `settings.json.bak` is retained. Never delete session state files.

### Step 3: Report + tell the user

State exactly what changed: 3 hooks copied, `config.json` (threshold + excludes)
written, `settings.json` merged (PostToolUse `Write|Edit|MultiEdit` -> track,
PostToolUse `Read` -> watch, Stop -> gate) with a `.bak` backup. Remind: hooks take
effect on the NEXT session (SessionStart on next `claude` start / `--resume`), and
require `node` on `PATH` for the shell that runs hooks. Suggest running
`frontmatter` next if the project's docs lack `last_updated`.

---

## Mode: upgrade

Refresh an EXISTING install to the current plugin version. Config and state survive.

1. Require `INSTALLED` from first-run detection. If `NOT_INSTALLED` -> say so and
   run `install` instead.
2. Run the complete transaction from install Step 2 with `MODE=upgrade`,
   `THRESHOLD_VALUE=7`, and `EXCLUDE_JSON=[]`. Upgrade uses the existing config's
   private fields, including `threshold_days`, `exclude`, `enabled`, and unknown
   keys; it refreshes all four provenance keys and repairs missing settings entries.
   Source hooks, config, and settings are validated before any destination write.
3. Run the install verification block and report per-check pass/fail, plus
   `threshold_days` + `exclude` + `enabled` unchanged. Session state is untouched.

---

## Mode: status

Report tracked docs and staleness. No changes.

1. Read `$ROOT/.claude/docsync/config.json` (threshold + excludes + `enabled`). If
   missing -> "not installed; run install". If `enabled` is `false`, lead the report
   with **DISABLED — hooks are wired but inert; `enable` resumes them**, then report
   staleness anyway: the numbers stay meaningful while the tracker is paused.
2. Enumerate in-scope docs via the Bash `find` block above; drop `exclude` matches
   and any with `doc_type: skip`.
3. For each, read frontmatter `last_updated`; compute age in days (LOCAL time);
   mark stale when `age > threshold_days`; mark `no-date` when missing.
4. Read `$ROOT/.claude/docsync/state-<session_id>.json` (one file per session; a
   pre-6.0 install may still carry a shared `state.json`) and report the current
   session touched-set.
5. Output the Status table (below).

## Mode: enable / disable

Flip docsync between live and inert WITHOUT unwiring anything. One key,
`"enabled"`, in `.claude/docsync/config.json`:

| | hooks in `settings.json` | hook files | `config.json` | session state | doc frontmatter |
|---|---|---|---|---|---|
| `disable` | kept | kept | `enabled: false` + provenance refreshed | kept | untouched |
| `enable` | kept | kept | `enabled: true` + provenance refreshed | kept | untouched |
| `uninstall` | removed | removed | kept | kept | untouched |
| `purge` | removed | removed | deleted | deleted | untouched |

All three hooks read `enabled` on every invocation (`loadConfig`, absent = `true`),
so the flip takes effect IMMEDIATELY — no session restart, unlike install/uninstall
which change `settings.json`. Disabled means: no touched-set recording, no
frontmatter nudge, and the Stop gate never blocks.

1. Require `INSTALLED` (either state) from first-run detection. `NOT_INSTALLED` ->
   say so and offer `install`; do not write a config for hooks that do not exist.
2. Read the current value. Short-circuit ONLY when it already matches the requested
   verb AND the three provenance keys are current (`version` == plugin version,
   `generated_by` == `brewdoc:docsync-setup`, `last_updated` present) — report
   `already enabled` / `already disabled` and stop, nothing written. A config whose
   value already matches but whose provenance is missing or stale IS rewritten: every
   mode that writes this file stamps it, so a pre-standard config gets backfilled here
   instead of staying unstamped forever.
3. **EXECUTE** using Bash tool (`WANT` = `true` for enable, `false` for disable):
   ```bash
   ROOT="${CLAUDE_PROJECT_DIR}"
   [ -n "$ROOT" ] && [ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
   [ -n "$ROOT" ] || { d=$PWD; until [ -d "$d/.git" ] || [ -d "$d/.claude" ] || [ "$d" = / ]; do d=$(dirname "$d"); done; [ "$d" = / ] && ROOT=$PWD || ROOT=$d; }
   C="$ROOT/.claude/docsync/config.json"
   PJ="${CLAUDE_SKILL_DIR}/../../.claude-plugin/plugin.json"
   SKILL_MD="${CLAUDE_SKILL_DIR}/SKILL.md"
   WANT=true   # <- set to false for `disable`
   [ -f "$C" ] || { echo "❌ $C missing — docsync is not installed"; exit 1; }
   cp "$C" "$C.bak"
   C="$C" WANT="$WANT" PJ="$PJ" SKILL_MD="$SKILL_MD" TODAY="$(date +%F)" node -e '
     const fs = require("fs");
     const c = process.env.C, want = process.env.WANT === "true";
     const v = JSON.parse(fs.readFileSync(process.env.PJ, "utf8")).version;
     if (!v) throw new Error("no version in " + process.env.PJ);
     const header = fs.readFileSync(process.env.SKILL_MD, "utf8").split("\n").find(l => l.includes("brewcode-meta:")) || "";
     const cvm = /content_version=([0-9]+\.[0-9]+\.[0-9]+)/.exec(header);
     if (!cvm) throw new Error("no content_version in " + process.env.SKILL_MD);
     const cv = cvm[1];
     const cfg = JSON.parse(fs.readFileSync(c, "utf8"));
     const was = cfg.enabled !== false;
     const stamped = cfg.version === v && cfg.content_version === cv && cfg.generated_by === "brewdoc:docsync-setup" && /^\d{4}-\d{2}-\d{2}$/.test(cfg.last_updated || "");
     if (was === want && stamped) { console.log(`already ${want ? "enabled" : "disabled"}, provenance current — nothing written`); process.exit(0); }
     cfg.enabled = want;
     const { version, content_version, generated_by, last_updated, ...rest } = cfg;
     const next = { version: v, content_version: cv, generated_by: "brewdoc:docsync-setup", last_updated: process.env.TODAY, ...rest };
     fs.writeFileSync(c, JSON.stringify(next, null, 2) + "\n");
     console.log(`enabled: ${was} -> ${want}; version=${next.version}, content_version=${next.content_version}, generated_by=${next.generated_by}, last_updated=${next.last_updated}; threshold_days=${next.threshold_days}, exclude=${JSON.stringify(next.exclude)} (preserved)`);
   ' && echo "✅ done" || { echo "❌ FAILED"; exit 1; }
   ```
   > **STOP if ❌** — fix before continuing.
4. Verify: `config.json` is still valid JSON, `enabled` holds the requested value,
   `threshold_days` + `exclude` are byte-unchanged, and the three provenance keys are
   present and current (`version` == plugin version, `generated_by` ==
   `brewdoc:docsync-setup`, `last_updated` == today).
5. Report the new state and its reversal verb. After `disable`, say the hooks are
   still registered and `enable` brings them back with zero re-analysis.

---

## Mode: uninstall

Remove docsync from THIS project without touching anything foreign.

### Step 1: Inverse-merge settings.json (remove ONLY docsync entries)

**EXECUTE** using Bash tool:
```bash
ROOT="${CLAUDE_PROJECT_DIR}"
[ -n "$ROOT" ] && [ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
[ -n "$ROOT" ] || { d=$PWD; until [ -d "$d/.git" ] || [ -d "$d/.claude" ] || [ "$d" = / ]; do d=$(dirname "$d"); done; [ "$d" = / ] && ROOT=$PWD || ROOT=$d; }
DST="$ROOT/.claude/hooks"
DOCSYNC="$ROOT/.claude/docsync"
SETTINGS="$ROOT/.claude/settings.json"

# Hook files are deleted ONLY after settings.json is verifiably clean — otherwise
# live registrations would point at missing scripts and every Write/Edit/Read/Stop
# would spawn `node <deleted path>`.
CLEANED=0

if [ -f "$SETTINGS" ]; then
  cp "$SETTINGS" "$SETTINGS.bak"
  if command -v python3 >/dev/null 2>&1; then
    SETTINGS="$SETTINGS" python3 - <<'PY'
import json, os, sys
f = os.environ["SETTINGS"]
with open(f, encoding="utf-8-sig") as fh: raw = fh.read()
if not raw.strip(): sys.exit(0)
try:
    data = json.loads(raw)
except Exception as e:
    sys.stderr.write("docsync: settings.json invalid JSON (%s) — ABORTING\n" % e); sys.exit(1)
hooks = data.get("hooks")
def isds(h):
    # Exec-form entries carry the script path in args, shell-form in command — scan both.
    c = " ".join([h.get("command") or ""] + [str(a) for a in (h.get("args") or [])])
    return any(n in c for n in ("docsync-track.mjs", "docsync-watch.mjs", "docsync-gate.mjs"))
if isinstance(hooks, dict):
    for ev in list(hooks.keys()):
        groups = hooks.get(ev)
        if not isinstance(groups, list): continue
        ng = []
        for g in groups:
            hs = g.get("hooks")
            if isinstance(hs, list):
                g["hooks"] = [h for h in hs if not isds(h)]
            if g.get("hooks"):        # keep group only if it still has hooks
                ng.append(g)
        if ng: hooks[ev] = ng
        else: del hooks[ev]           # prune now-empty event
tmp = f + ".tmp"
json.dump(data, open(tmp, "w"), indent=2)
os.replace(tmp, f)
print("OK")
PY
    [ $? -eq 0 ] && { echo "✅ settings.json cleaned (python3)"; CLEANED=1; } || { echo "❌ clean FAILED — restoring"; cp "$SETTINGS.bak" "$SETTINGS"; }
  elif command -v jq >/dev/null 2>&1; then
    TMP="$(mktemp)"
    jq '
      def isds: [(.command // "")] + ((.args // []) | map(tostring)) | join(" ")
                | test("docsync-(track|watch|gate)\\.mjs");
      .hooks = (
        (.hooks // {})
        | to_entries
        | map(.value = (.value
            | map(.hooks = ((.hooks // []) | map(select(isds | not))))
            | map(select((.hooks // []) | length > 0))))
        | map(select((.value | length) > 0))
        | from_entries )
    ' "$SETTINGS" > "$TMP" && jq empty "$TMP" >/dev/null 2>&1 && mv "$TMP" "$SETTINGS" \
      && { echo "✅ settings.json cleaned (jq)"; CLEANED=1; } || { echo "❌ clean FAILED — backup at $SETTINGS.bak"; rm -f "$TMP"; }
  else
    echo "❌ neither python3 nor jq — remove the three docsync entries from $SETTINGS manually"
  fi
else
  echo "⚠️ no settings.json — nothing to clean"
  CLEANED=1
fi

[ "$CLEANED" = 1 ] || { echo "❌ settings not cleaned — hook files KEPT to avoid broken registrations"; exit 1; }
rm -f "$DST/docsync-track.mjs" "$DST/docsync-watch.mjs" "$DST/docsync-gate.mjs" && echo "✅ hook files removed"
```

> **STOP if ❌ "settings not cleaned"** — nothing was deleted, the install is intact.
> Fix `settings.json` (or install `python3`/`jq`) and re-run `uninstall`.

### Step 2: Ask about state dir

**ASK** via `AskUserQuestion`: "Also delete `.claude/docsync/` (config + state)?"
Options: **Yes, delete** / **Keep config**.

- Yes -> **EXECUTE**: `rm -rf "$ROOT/.claude/docsync" && echo "✅ docsync/ removed"`
- Keep -> leave it (a later `install` reuses the config).

### Step 3: Report

Tell the user exactly what was removed and that the `.bak` backup of settings.json
remains. Removal takes effect next session.

## Mode: purge

`uninstall` with no survivors — for when the project is done with docsync entirely.

1. Run every step of `uninstall` Step 1 (settings inverse-merge + hook file removal),
   INCLUDING its `CLEANED` guard. If Step 1 aborts with `❌ settings not cleaned`,
   purge stops there — do NOT proceed to step 2. Deleting `.claude/docsync/` while
   three registrations still point at the hooks is exactly the state the guard exists
   to prevent.
2. Skip the Step 2 question and **EXECUTE** unconditionally:
   ```bash
   ROOT="${CLAUDE_PROJECT_DIR}"
   [ -n "$ROOT" ] && [ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
   [ -n "$ROOT" ] || { d=$PWD; until [ -d "$d/.git" ] || [ -d "$d/.claude" ] || [ "$d" = / ]; do d=$(dirname "$d"); done; [ "$d" = / ] && ROOT=$PWD || ROOT=$d; }
   rm -rf "$ROOT/.claude/docsync" && echo "✅ .claude/docsync removed"
   ```
3. Report what was removed. The `settings.json` `.bak` backup is deliberately kept —
   purge never touches foreign settings or the backup.

---

> The three modes below are this skill's EXTRAS — they operate the installed
> tracker rather than manage it, and so come after the whole canonical set.

## Mode: sync `[--all]`

Sync stale docs (or ALL in-scope docs with `--all`) WITH confirmation.

1. Build the target set: default = stale docs (as in status); `--all` = every
   in-scope doc (enumerate via the Bash `find` block).
2. **ASK** via `AskUserQuestion`: confirm which docs to sync (list them). Never
   sync without confirmation.
3. For each confirmed doc: READ it, then follow its `sync_procedure` (if present —
   no hook parses it, you do) to refresh content. Apply compression by `doc_type`:
   `llm` = deep, `user` = light, absent = `user`. Preserve author intent.
4. Set `last_updated: "{LAST_UPDATED}"` (quoted; `Bash: date +%F`, LOCAL) in each synced
   doc's frontmatter. A doc that had no `last_updated` gains one here.
5. Output the Sync summary table.

## Mode: reread

Force a re-read of tracked docs to refresh in-context understanding (no writes).

1. Determine scope: docs in the session touched-set, else all in-scope `.md`
   (enumerate via the Bash `find` block).
2. Read each with the Read tool.
3. Output a short list of what was re-read. (The watch hook records these reads.)

## Mode: frontmatter

Opt-in retro-add of docsync frontmatter to in-scope docs. NEVER run automatically
at install.

1. Enumerate in-scope `.md` (via the Bash `find` block, minus excludes). For each,
   detect whether it already has `last_updated`.
2. Show the list of docs missing frontmatter and the fields to add.
3. **ASK** via `AskUserQuestion`: "Add docsync frontmatter to N docs?" Options:
   **Yes, all** / **Review each** / **Cancel**.
4. For approved docs, prepend/merge a YAML frontmatter block with ALL THREE schema
   fields — `sync` mode reads `sync_procedure`, so omitting it here would emit docs
   that `sync` cannot follow:
   ```yaml
   ---
   doc_type: user                   # UNQUOTED; llm for machine-facing docs; skip to exclude
   last_updated: "{LAST_UPDATED}"
   sync_procedure: "<what to re-check for THIS doc, and where>"
   ---
   ```
   Preserve any existing frontmatter keys and append these after them. Resolve
   `{LAST_UPDATED}` with `date +%F`. `last_updated` and `sync_procedure` are
   QUOTED, `doc_type` is bare (see Frontmatter schema). Write a
   real one-line `sync_procedure` derived from what the doc actually documents; if
   a doc genuinely has no procedure worth naming, omit the key rather than emit a
   placeholder, and say which docs you omitted it for.
5. Output the frontmatter summary table.

</instructions>

## Verification (per mode)

Run these after acting and report pass/fail for each check.

| Mode | Checks |
|------|--------|
| install | 3 hook files exist in `.claude/hooks/`; `node --check` each parses; `config.json` valid JSON carrying all three provenance keys (`version` == plugin version, `generated_by` == `brewdoc:docsync-setup`, `last_updated` a `YYYY-MM-DD` date); `settings.json` valid JSON and contains all 3 hook commands; `.bak` backup present |
| upgrade | same checks as `install`, plus `threshold_days` + `exclude` unchanged and the three provenance keys refreshed |
| enable | `config.json` valid JSON with `enabled: true`; hook commands still in `settings.json`; hook files still present; `threshold_days` + `exclude` unchanged; all three provenance keys present and current |
| disable | `config.json` valid JSON with `enabled: false`; same preservation + provenance checks as `enable`; the session state files still present |
| status | config exists; counts add up (tracked = stale + fresh + no-date); the `enabled` state is stated |
| sync | each synced doc's `last_updated` == today; frontmatter still valid |
| reread | each targeted doc was actually read |
| frontmatter | each approved doc now has valid frontmatter with a BARE `doc_type` + a QUOTED `last_updated` (+ `sync_procedure` wherever one was written); pre-existing keys preserved |
| uninstall | no `docsync-*.mjs` command remains in `settings.json`; foreign hooks preserved; hook files gone; `settings.json` still valid JSON |
| purge | all `uninstall` checks, plus `.claude/docsync/` no longer exists |

**EXECUTE** (install/upgrade verification) using Bash tool:
```bash
ROOT="${CLAUDE_PROJECT_DIR}"
[ -n "$ROOT" ] && [ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
[ -n "$ROOT" ] || { d=$PWD; until [ -d "$d/.git" ] || [ -d "$d/.claude" ] || [ "$d" = / ]; do d=$(dirname "$d"); done; [ "$d" = / ] && ROOT=$PWD || ROOT=$d; }
DST="$ROOT/.claude/hooks"; D="$ROOT/.claude/docsync"; S="$ROOT/.claude/settings.json"; ok=1
for f in docsync-track docsync-watch docsync-gate; do
  node --check "$DST/$f.mjs" && echo "✅ $f parses" || { echo "❌ $f parse FAILED"; ok=0; }
done
PJ="${CLAUDE_SKILL_DIR}/../../.claude-plugin/plugin.json"
node -e "
  const fs=require('fs');
  const cfg=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
  const v=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).version;
  if(cfg.version!==v) throw new Error('config version '+cfg.version+' != plugin '+v);
  if(cfg.generated_by!=='brewdoc:docsync-setup') throw new Error('generated_by is '+cfg.generated_by);
  if(!/^\d{4}-\d{2}-\d{2}\$/.test(cfg.last_updated||'')) throw new Error('last_updated not YYYY-MM-DD: '+cfg.last_updated);
  if(!Number.isInteger(cfg.threshold_days)) throw new Error('threshold_days not an integer');
" "$D/config.json" "$PJ" && echo "✅ config.json valid + provenance matches plugin" || { echo "❌ config.json"; ok=0; }
node -e "const s=JSON.stringify(JSON.parse(require('fs').readFileSync('$S','utf8')));['docsync-track','docsync-watch','docsync-gate'].forEach(n=>{if(!s.includes(n))throw new Error('missing '+n)});" \
  && echo "✅ settings.json wired" || { echo "❌ settings.json missing entries"; ok=0; }
[ -f "$S.bak" ] && echo "✅ backup present" || { echo "❌ no .bak backup"; ok=0; }
[ "$ok" = 1 ] && echo "✅ VERIFY OK" || echo "❌ VERIFY FAILED"
```

## Output Format

```markdown
# docsync-setup [MODE]

## Detection
| Field | Value |
|-------|-------|
| Arguments | `$ARGUMENTS` |
| Mode | `[mode]` (reason) |

## Plan
- [what will happen]

## Actions
- [action 1]
- [action 2]

## Status
tracking: enabled | DISABLED (hooks wired but inert — `enable` resumes)

| Doc | doc_type | last_updated | age | state |
|-----|----------|--------------|-----|-------|
| ... | ...      | ...          | ..d | stale/fresh/no-date |

## Verification
| Check | Result |
|-------|--------|
| ...   | ✅/❌   |
```
