---
name: brewdoc:docsync
description: "Installs project-local doc-staleness tracking (hooks) and reports/forces doc sync. Triggers: docsync, track doc staleness, doc sync status, stale docs, doc frontmatter."
user-invocable: true
argument-hint: "[status] | [sync [--all]] | [reread] | [frontmatter] | [uninstall] | free-text"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
model: sonnet
---

# docsync

> Project-scoped doc-staleness tracker. Installs three project-local hooks that
> watch which `.md` docs you touch, then nag (once, at end of turn) when a touched
> doc is stale by date. Source of truth = each doc's own frontmatter. Replaces
> `brewdoc:auto-sync`.

<instructions>

## Standard flow (every run)

1. **Resolve mode** from the free-text prompt (`$ARGUMENTS`) — state which mode and WHY.
2. **State the plan** — what this mode will do, before acting.
3. **Execute** the mode.
4. **Output block** — the standard formatted summary (see Output Format below).
5. **Verification (MANDATORY)** — run the checks for the mode and report pass/fail
   per check. Never claim success unverified.

Run in the main conversation (uses `AskUserQuestion`). No `context: fork`.

> **Project root.** Resolve it ONCE and use it everywhere (install writes here;
> hooks read from `input.cwd` = project root at runtime, so both must agree even
> when the skill is invoked from a subdirectory):
> ```bash
> ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")}"
> ```

> **Enumerating docs.** Native `Glob`/`Grep` are no-ops on macOS Claude Code
> (removed in CC 2.1.117+). Enumerate `.md` via the **Bash** tool (`find`/bfs), as
> shown below; `Glob **/*.md` is a non-macOS fallback only.

## Mode Resolution — prompt-driven

Infer the mode from `$ARGUMENTS` (RU + EN). If a mode is named explicitly, honor
it. Otherwise derive from intent. State the resolved mode and the reason.

| Intent / keywords (EN + RU) | Mode |
|-----------------------------|------|
| init, setup, install, установи, настрой, включи отслеживание | init |
| status, что устарело, what is stale, check, показать | status |
| sync, синхронизируй, обнови устаревшие, `--all`, sync all | sync |
| reread, перечитай, refresh context, освежи | reread |
| frontmatter, проставь frontmatter, add frontmatter, ретро-разметка | frontmatter |
| uninstall, remove, disable, удали docsync, отключи отслеживание, снеси хуки | uninstall |
| (empty) AND hooks NOT installed | init |
| (empty) AND hooks installed | status |
| unrecognized text | pick the closest mode; if unclear, default to status |

### First-run detection

**EXECUTE** using Bash tool:
```bash
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")}"
if [ -f "$ROOT/.claude/hooks/docsync-gate.mjs" ] && grep -q 'docsync-gate.mjs' "$ROOT/.claude/settings.json" 2>/dev/null; then
  echo "docsync: INSTALLED"
else
  echo "docsync: NOT_INSTALLED"
fi
```

- `NOT_INSTALLED` + no explicit mode -> **init**.
- `INSTALLED` + no explicit mode -> **status**.

## Frontmatter schema (this system's docs)

```yaml
---
doc_type:      llm            # optional; absent => user. values: llm | user | skip
last_updated:  2026-07-19     # sole staleness input (YYYY-MM-DD)
sync_procedure:"what to check / where to look when syncing"   # optional, prose
---
```

- `doc_type` drives compress depth on sync: `llm` = deep, `user` = light.
- `doc_type: skip` = file excluded from tracking entirely.
- Staleness is DATE ONLY, in LOCAL time: `today - last_updated > threshold_days`.
  No hash, no deps.

## Enumerate in-scope docs (status / sync --all / reread / frontmatter)

**EXECUTE** using Bash tool (lists project `.md`, minus `.git`; apply `exclude`
globs from config and any `doc_type: skip` in your own reasoning afterward):
```bash
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")}"
cd "$ROOT" && find . -type f -name '*.md' -not -path './.git/*' | sed 's#^\./##' | sort
```

---

## Mode: init

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
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")}"
SRC="${CLAUDE_SKILL_DIR}/assets"
DST="$ROOT/.claude/hooks"
DOCSYNC="$ROOT/.claude/docsync"
SETTINGS="$ROOT/.claude/settings.json"

mkdir -p "$DST" "$DOCSYNC" \
  && cp "$SRC/docsync-track.mjs" "$SRC/docsync-watch.mjs" "$SRC/docsync-gate.mjs" "$DST/" \
  && echo "✅ hooks copied to $DST" || { echo "❌ copy FAILED"; exit 1; }

# config.json — replace the two placeholders below before running
printf '%s\n' '{ "threshold_days": THRESHOLD_VALUE, "exclude": EXCLUDE_JSON }' > "$DOCSYNC/config.json" \
  && node -e "JSON.parse(require('fs').readFileSync('$DOCSYNC/config.json','utf8'))" \
  && echo "✅ config.json written" || { echo "❌ config.json invalid JSON"; exit 1; }

# fresh state.json (empty touched-set) — only if absent, never clobber a live one
[ -f "$DOCSYNC/state.json" ] || printf '%s\n' '{ "session_id": null, "touched": [], "asked": false }' > "$DOCSYNC/state.json"
echo "✅ state.json ready"

mkdir -p "$(dirname "$SETTINGS")"
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
# Backup BEFORE any write — merge must never lose foreign hooks/permissions/env.
cp "$SETTINGS" "$SETTINGS.bak"

# Portable command strings: $CLAUDE_PROJECT_DIR is substituted by Claude Code at
# hook run time, so committed settings.json works on any machine / CI path.
T_CMD='node "$CLAUDE_PROJECT_DIR/.claude/hooks/docsync-track.mjs"'
W_CMD='node "$CLAUDE_PROJECT_DIR/.claude/hooks/docsync-watch.mjs"'
G_CMD='node "$CLAUDE_PROJECT_DIR/.claude/hooks/docsync-gate.mjs"'

if command -v python3 >/dev/null 2>&1; then
  SETTINGS="$SETTINGS" T_CMD="$T_CMD" W_CMD="$W_CMD" G_CMD="$G_CMD" python3 - <<'PY'
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
def has(event, needle):
    return any(needle in (h.get("command") or "") for g in hooks.get(event, []) for h in g.get("hooks", []))
def add(event, matcher, cmd, needle):
    if has(event, needle): return
    groups = hooks.setdefault(event, [])
    if matcher:
        grp = next((g for g in groups if g.get("matcher") == matcher), None)
    else:
        grp = next((g for g in groups if not g.get("matcher")), None)
    entry = {"type": "command", "command": cmd}
    if grp is not None:
        grp.setdefault("hooks", []).append(entry)
    else:
        groups.append({"matcher": matcher, "hooks": [entry]} if matcher else {"hooks": [entry]})
add("PostToolUse", "Write|Edit|MultiEdit", os.environ["T_CMD"], "docsync-track.mjs")
add("PostToolUse", "Read", os.environ["W_CMD"], "docsync-watch.mjs")
add("Stop", "", os.environ["G_CMD"], "docsync-gate.mjs")
tmp = f + ".tmp"
json.dump(data, open(tmp, "w"), indent=2)
os.replace(tmp, f)
print("OK")
PY
  [ $? -eq 0 ] && echo "✅ settings.json merged (python3)" || { echo "❌ merge FAILED — restoring backup"; cp "$SETTINGS.bak" "$SETTINGS"; }
elif command -v jq >/dev/null 2>&1; then
  TMP="$(mktemp)"
  jq --arg t "$T_CMD" --arg w "$W_CMD" --arg g "$G_CMD" '
    def has(ev; needle): (.hooks[ev] // []) | map(.hooks // [] | map(.command // "") | any(test(needle))) | any;
    def add(ev; matcher; cmd; needle):
      if has(ev; needle) then .
      else
        .hooks[ev] = (.hooks[ev] // [])
        | ( if matcher == "" then (.hooks[ev] | map((.matcher // "") == "") | index(true))
            else (.hooks[ev] | map((.matcher // "") == matcher) | index(true)) end) as $i
        | if $i != null then .hooks[ev][$i].hooks += [{"type":"command","command":cmd}]
          else .hooks[ev] += [ (if matcher == "" then {"hooks":[{"type":"command","command":cmd}]}
                                else {"matcher":matcher,"hooks":[{"type":"command","command":cmd}]} end) ] end
      end;
    .hooks = (.hooks // {})
    | add("PostToolUse"; "Write|Edit|MultiEdit"; $t; "docsync-track\\.mjs")
    | add("PostToolUse"; "Read"; $w; "docsync-watch\\.mjs")
    | add("Stop"; ""; $g; "docsync-gate\\.mjs")
  ' "$SETTINGS" > "$TMP" && jq empty "$TMP" >/dev/null 2>&1 && mv "$TMP" "$SETTINGS" \
    && echo "✅ settings.json merged (jq)" || { echo "❌ merge FAILED — backup at $SETTINGS.bak"; rm -f "$TMP"; }
else
  echo "❌ neither python3 nor jq — add the three entries from assets/INSTALL.md manually"
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

## Mode: status

Report tracked docs and staleness. No changes.

1. Read `$ROOT/.claude/docsync/config.json` (threshold + excludes). If missing ->
   "not installed; run init".
2. Enumerate in-scope docs via the Bash `find` block above; drop `exclude` matches
   and any with `doc_type: skip`.
3. For each, read frontmatter `last_updated`; compute age in days (LOCAL time);
   mark stale when `age > threshold_days`; mark `no-date` when missing.
4. Read `$ROOT/.claude/docsync/state.json` and report the current session touched-set.
5. Output the Status table (below).

## Mode: sync `[--all]`

Sync stale docs (or ALL in-scope docs with `--all`) WITH confirmation.

1. Build the target set: default = stale docs (as in status); `--all` = every
   in-scope doc (enumerate via the Bash `find` block).
2. **ASK** via `AskUserQuestion`: confirm which docs to sync (list them). Never
   sync without confirmation.
3. For each confirmed doc: follow its `sync_procedure` (if present) to refresh
   content. Apply compression by `doc_type`: `llm` = deep, `user` = light.
   Preserve author intent.
4. Set `last_updated:` to today (`Bash: date +%F`, LOCAL) in each synced doc's
   frontmatter.
5. Output the Sync summary table.

## Mode: reread

Force a re-read of tracked docs to refresh in-context understanding (no writes).

1. Determine scope: docs in the session touched-set, else all in-scope `.md`
   (enumerate via the Bash `find` block).
2. Read each with the Read tool.
3. Output a short list of what was re-read. (The watch hook records these reads.)

## Mode: frontmatter

Opt-in retro-add of docsync frontmatter to in-scope docs. NEVER run automatically
at init.

1. Enumerate in-scope `.md` (via the Bash `find` block, minus excludes). For each,
   detect whether it already has `last_updated`.
2. Show the list of docs missing frontmatter and the fields to add.
3. **ASK** via `AskUserQuestion`: "Add docsync frontmatter to N docs?" Options:
   **Yes, all** / **Review each** / **Cancel**.
4. For approved docs, prepend/merge a YAML frontmatter block:
   ```yaml
   ---
   doc_type: user            # choose llm for machine-facing docs; skip to exclude
   last_updated: <today>
   ---
   ```
   Preserve any existing frontmatter keys. Use `date +%F` for `<today>`.
5. Output the frontmatter summary table.

## Mode: uninstall

Remove docsync from THIS project without touching anything foreign.

### Step 1: Inverse-merge settings.json (remove ONLY docsync entries)

**EXECUTE** using Bash tool:
```bash
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")}"
DST="$ROOT/.claude/hooks"
DOCSYNC="$ROOT/.claude/docsync"
SETTINGS="$ROOT/.claude/settings.json"

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
    c = h.get("command") or ""
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
    [ $? -eq 0 ] && echo "✅ settings.json cleaned (python3)" || { echo "❌ clean FAILED — restoring"; cp "$SETTINGS.bak" "$SETTINGS"; }
  elif command -v jq >/dev/null 2>&1; then
    TMP="$(mktemp)"
    jq '
      def isds(c): (c // "") | test("docsync-(track|watch|gate)\\.mjs");
      .hooks = (
        (.hooks // {})
        | to_entries
        | map(.value = (.value
            | map(.hooks = ((.hooks // []) | map(select(isds(.command) | not))))
            | map(select((.hooks // []) | length > 0))))
        | map(select((.value | length) > 0))
        | from_entries )
    ' "$SETTINGS" > "$TMP" && jq empty "$TMP" >/dev/null 2>&1 && mv "$TMP" "$SETTINGS" \
      && echo "✅ settings.json cleaned (jq)" || { echo "❌ clean FAILED — backup at $SETTINGS.bak"; rm -f "$TMP"; }
  else
    echo "❌ neither python3 nor jq — remove the three docsync entries from $SETTINGS manually"
  fi
else
  echo "⚠️ no settings.json — nothing to clean"
fi

# Remove the hook files
rm -f "$DST/docsync-track.mjs" "$DST/docsync-watch.mjs" "$DST/docsync-gate.mjs" && echo "✅ hook files removed"
```

### Step 2: Ask about state dir

**ASK** via `AskUserQuestion`: "Also delete `.claude/docsync/` (config + state)?"
Options: **Yes, delete** / **Keep config**.

- Yes -> **EXECUTE**: `rm -rf "$ROOT/.claude/docsync" && echo "✅ docsync/ removed"`
- Keep -> leave it (re-init later reuses the config).

### Step 3: Report

Tell the user exactly what was removed and that the `.bak` backup of settings.json
remains. Removal takes effect next session.

</instructions>

## Verification (per mode)

Run these after acting and report pass/fail for each check.

| Mode | Checks |
|------|--------|
| init | 3 hook files exist in `.claude/hooks/`; `node --check` each parses; `config.json` valid JSON; `settings.json` valid JSON and contains all 3 hook commands; `.bak` backup present |
| status | config exists; counts add up (tracked = stale + fresh + no-date) |
| sync | each synced doc's `last_updated` == today; frontmatter still valid |
| reread | each targeted doc was actually read |
| frontmatter | each approved doc now has valid frontmatter with `last_updated` |
| uninstall | no `docsync-*.mjs` command remains in `settings.json`; foreign hooks preserved; hook files gone; `settings.json` still valid JSON |

**EXECUTE** (init verification) using Bash tool:
```bash
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")}"
DST="$ROOT/.claude/hooks"; D="$ROOT/.claude/docsync"; S="$ROOT/.claude/settings.json"; ok=1
for f in docsync-track docsync-watch docsync-gate; do
  node --check "$DST/$f.mjs" && echo "✅ $f parses" || { echo "❌ $f parse FAILED"; ok=0; }
done
node -e "JSON.parse(require('fs').readFileSync('$D/config.json','utf8'))" && echo "✅ config.json valid" || { echo "❌ config.json"; ok=0; }
node -e "const s=JSON.stringify(JSON.parse(require('fs').readFileSync('$S','utf8')));['docsync-track','docsync-watch','docsync-gate'].forEach(n=>{if(!s.includes(n))throw new Error('missing '+n)});" \
  && echo "✅ settings.json wired" || { echo "❌ settings.json missing entries"; ok=0; }
[ -f "$S.bak" ] && echo "✅ backup present" || { echo "❌ no .bak backup"; ok=0; }
[ "$ok" = 1 ] && echo "✅ VERIFY OK" || echo "❌ VERIFY FAILED"
```

## Output Format

```markdown
# docsync [MODE]

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
| Doc | doc_type | last_updated | age | state |
|-----|----------|--------------|-----|-------|
| ... | ...      | ...          | ..d | stale/fresh/no-date |

## Verification
| Check | Result |
|-------|--------|
| ...   | ✅/❌   |
```
