---
name: docsync-setup
description: "Installs project-local doc-staleness tracking (hooks) and reports/forces doc sync. Triggers: docsync, track doc staleness, doc sync status, stale docs, doc frontmatter."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|upgrade|enable|disable|uninstall|purge] [sync [--all]|reread|frontmatter]"
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion]
model: sonnet
---
<!-- brewcode-meta: version=6.0.0 content_version=6.0.0 generated_by=brewdoc:docsync-setup -->

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

> **Enumerating docs.** Native `Glob`/`Grep` are no-ops on macOS Claude Code
> (removed in CC 2.1.117+). Enumerate `.md` via the **Bash** tool (`find`/bfs), as
> shown below; `Glob **/*.md` is a non-macOS fallback only.

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
SRC="${CLAUDE_SKILL_DIR}/assets"
DST="$ROOT/.claude/hooks"
DOCSYNC="$ROOT/.claude/docsync"
SETTINGS="$ROOT/.claude/settings.json"

# Plugin version by skill self-location — NEVER hardcode it. config.json is the anchor
# artifact other tooling (e.g. /brewcode:setup-status) reads the installed version from.
PLUGIN_JSON="${CLAUDE_SKILL_DIR}/../../.claude-plugin/plugin.json"
PV=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).version||'')" "$PLUGIN_JSON" 2>/dev/null || true)
[ -n "$PV" ] || { echo "❌ cannot read version from $PLUGIN_JSON — reinstall brewdoc"; exit 1; }

# content_version — this SKILL.md's own header marker, self-located the same way PV is.
SKILL_MD="${CLAUDE_SKILL_DIR}/SKILL.md"
CV=$(grep -m1 'brewcode-meta:' "$SKILL_MD" | sed -n 's/.*content_version=\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*/\1/p')
[ -n "$CV" ] || { echo "❌ cannot read content_version from $SKILL_MD — reinstall brewdoc"; exit 1; }

# What existed BEFORE this run — a failed settings merge rolls back only what it created,
# never a working install's files (install Step 2 is re-run verbatim by `upgrade`).
HOOKS_EXISTED=1
for f in docsync-track docsync-watch docsync-gate; do [ -f "$DST/$f.mjs" ] || HOOKS_EXISTED=0; done
[ -f "$DOCSYNC/config.json" ] && CFG_EXISTED=1 || CFG_EXISTED=0

mkdir -p "$DST" "$DOCSYNC" \
  && cp "$SRC/docsync-track.mjs" "$SRC/docsync-watch.mjs" "$SRC/docsync-gate.mjs" "$DST/" \
  && echo "✅ hooks copied to $DST" || { echo "❌ copy FAILED"; exit 1; }

rollback() {
  cp "$SETTINGS.bak" "$SETTINGS" 2>/dev/null
  [ "$HOOKS_EXISTED" = 1 ] || rm -f "$DST/docsync-track.mjs" "$DST/docsync-watch.mjs" "$DST/docsync-gate.mjs"
  [ "$CFG_EXISTED" = 1 ] || rm -f "$DOCSYNC/config.json"
  echo "↩️ rolled back — settings restored, nothing half-installed left behind"
}

# config.json — replace the two placeholders below before running.
# The four provenance keys come first, in the standard order, then the skill-private ones.
printf '{ "version": "%s", "content_version": "%s", "generated_by": "brewdoc:docsync-setup", "last_updated": "%s", "enabled": true, "threshold_days": THRESHOLD_VALUE, "exclude": EXCLUDE_JSON }\n' "$PV" "$CV" "$(date +%F)" > "$DOCSYNC/config.json" \
  && node -e "JSON.parse(require('fs').readFileSync('$DOCSYNC/config.json','utf8'))" \
  && echo "✅ config.json written (version $PV, content_version $CV)" || { echo "❌ config.json invalid JSON"; exit 1; }

# State files are per session (`state-<session_id>.json`) and owned by the hooks —
# install seeds nothing. A pre-6.0 `state.json` is left alone; the gate prunes it.
mkdir -p "$(dirname "$SETTINGS")"
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
# Backup BEFORE any write — merge must never lose foreign hooks/permissions/env.
cp "$SETTINGS" "$SETTINGS.bak"

# Exec form (upstream's stated preference for any hook referencing a path placeholder):
# the placeholder is substituted per `args` element on every shell, whereas a shell-form
# `$CLAUDE_PROJECT_DIR` resolves to $null under PowerShell and launches node on "/.claude/…".
# The token is ASSEMBLED here on purpose — written literally it would be substituted into
# this machine's absolute path by the skill loader and the committed settings.json would
# stop being portable.
D='$'; PD="${D}{CLAUDE_PROJECT_DIR}"
T_ARG="$PD/.claude/hooks/docsync-track.mjs"
W_ARG="$PD/.claude/hooks/docsync-watch.mjs"
G_ARG="$PD/.claude/hooks/docsync-gate.mjs"

if command -v python3 >/dev/null 2>&1; then
  SETTINGS="$SETTINGS" T_ARG="$T_ARG" W_ARG="$W_ARG" G_ARG="$G_ARG" python3 - <<'PY'
import json, os, sys
f = os.environ["SETTINGS"]
raw = ""
if os.path.exists(f):
    with open(f, encoding="utf-8-sig") as fh:  # BOM-tolerant
        raw = fh.read()
if raw.strip():
    try:
        data = json.loads(raw)
    except Exception as e:
        sys.stderr.write("docsync: settings.json is not valid JSON (%s) — ABORTING, not clobbering\n" % e)
        sys.exit(1)
else:
    data = {}
hooks = data.setdefault("hooks", {})
# Idempotency scans command AND args — exec-form entries carry the path in args.
def text(h):
    return " ".join([h.get("command") or ""] + [str(a) for a in (h.get("args") or [])])
def has(event, needle):
    return any(needle in text(h) for g in hooks.get(event, []) for h in g.get("hooks", []))
def add(event, matcher, arg, needle):
    if has(event, needle): return
    groups = hooks.setdefault(event, [])
    if matcher:
        grp = next((g for g in groups if g.get("matcher") == matcher), None)
    else:
        grp = next((g for g in groups if not g.get("matcher")), None)
    entry = {"type": "command", "command": "node", "args": [arg]}
    if grp is not None:
        grp.setdefault("hooks", []).append(entry)
    else:
        groups.append({"matcher": matcher, "hooks": [entry]} if matcher else {"hooks": [entry]})
add("PostToolUse", "Write|Edit|MultiEdit", os.environ["T_ARG"], "docsync-track.mjs")
add("PostToolUse", "Read", os.environ["W_ARG"], "docsync-watch.mjs")
add("Stop", "", os.environ["G_ARG"], "docsync-gate.mjs")
tmp = f + ".tmp"
json.dump(data, open(tmp, "w"), indent=2)
os.replace(tmp, f)
print("OK")
PY
  [ $? -eq 0 ] && echo "✅ settings.json merged (python3)" || { echo "❌ merge FAILED"; rollback; exit 1; }
elif command -v jq >/dev/null 2>&1; then
  TMP="$(mktemp)"
  jq --arg t "$T_ARG" --arg w "$W_ARG" --arg g "$G_ARG" '
    def text: [(.command // "")] + ((.args // []) | map(tostring)) | join(" ");
    def has(ev; needle): (.hooks[ev] // []) | map(.hooks // [] | map(text) | any(test(needle))) | any;
    def entry(arg): {"type":"command","command":"node","args":[arg]};
    def add(ev; matcher; arg; needle):
      if has(ev; needle) then .
      else
        .hooks[ev] = (.hooks[ev] // [])
        | ( if matcher == "" then (.hooks[ev] | map((.matcher // "") == "") | index(true))
            else (.hooks[ev] | map((.matcher // "") == matcher) | index(true)) end) as $i
        | if $i != null then .hooks[ev][$i].hooks += [entry(arg)]
          else .hooks[ev] += [ (if matcher == "" then {"hooks":[entry(arg)]}
                                else {"matcher":matcher,"hooks":[entry(arg)]} end) ] end
      end;
    .hooks = (.hooks // {})
    | add("PostToolUse"; "Write|Edit|MultiEdit"; $t; "docsync-track\\.mjs")
    | add("PostToolUse"; "Read"; $w; "docsync-watch\\.mjs")
    | add("Stop"; ""; $g; "docsync-gate\\.mjs")
  ' "$SETTINGS" > "$TMP" && jq empty "$TMP" >/dev/null 2>&1 && mv "$TMP" "$SETTINGS" \
    && echo "✅ settings.json merged (jq)" || { echo "❌ merge FAILED"; rm -f "$TMP"; rollback; exit 1; }
else
  # Not a failure to roll back: the files must stay so the user can wire them by hand.
  echo "❌ neither python3 nor jq — hooks + config KEPT; add the three entries from assets/INSTALL.md manually"
fi
```

> **STOP if ❌** — the pre-write backup is at `$SETTINGS.bak`. See
> `${CLAUDE_SKILL_DIR}/assets/INSTALL.md` for the manual entries.

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
2. Re-copy the three hook files from `${CLAUDE_SKILL_DIR}/assets` over
   `$ROOT/.claude/hooks/` (same `cp` as install Step 2), leaving the session state
   files untouched.
3. Refresh ONLY the three provenance keys in `.claude/docsync/config.json` —
   `version`, `generated_by`, `last_updated`. `threshold_days`, `exclude` and
   `enabled` are preserved verbatim: upgrading a DISABLED install must leave it
   disabled.

   **EXECUTE** using Bash tool:
   ```bash
   ROOT="${CLAUDE_PROJECT_DIR}"
   [ -n "$ROOT" ] && [ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
   [ -n "$ROOT" ] || { d=$PWD; until [ -d "$d/.git" ] || [ -d "$d/.claude" ] || [ "$d" = / ]; do d=$(dirname "$d"); done; [ "$d" = / ] && ROOT=$PWD || ROOT=$d; }
   C="$ROOT/.claude/docsync/config.json"
   PJ="${CLAUDE_SKILL_DIR}/../../.claude-plugin/plugin.json"
   SKILL_MD="${CLAUDE_SKILL_DIR}/SKILL.md"
   node -e '
     const fs = require("fs");
     const [c, pj, today, skillMd] = process.argv.slice(1);
     const v = JSON.parse(fs.readFileSync(pj, "utf8")).version;
     if (!v) throw new Error("no version in " + pj);
     const header = fs.readFileSync(skillMd, "utf8").split("\n").find(l => l.includes("brewcode-meta:")) || "";
     const cvm = /content_version=([0-9]+\.[0-9]+\.[0-9]+)/.exec(header);
     if (!cvm) throw new Error("no content_version in " + skillMd);
     const cv = cvm[1];
     const cfg = JSON.parse(fs.readFileSync(c, "utf8"));
     const was = cfg.version || "(none)";
     const { version, content_version, generated_by, last_updated, ...rest } = cfg;
     const next = { version: v, content_version: cv, generated_by: "brewdoc:docsync-setup", last_updated: today, ...rest };
     fs.writeFileSync(c, JSON.stringify(next, null, 2) + "\n");
     console.log(`config.json version ${was} -> ${v}; content_version=${next.content_version}, generated_by=${next.generated_by}, last_updated=${next.last_updated}; enabled=${next.enabled !== false}, threshold_days=${next.threshold_days}, exclude=${JSON.stringify(next.exclude)}`);
   ' "$C" "$PJ" "$(date +%F)" "$SKILL_MD" && echo "✅ config provenance refreshed" || { echo "❌ config provenance refresh FAILED"; exit 1; }
   ```
4. Re-run the settings merge from install Step 2 — it is idempotent, so it only
   restores entries a user or another tool dropped.
5. Run the install verification block and report per-check pass/fail, plus
   `threshold_days` + `exclude` + `enabled` unchanged.

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
