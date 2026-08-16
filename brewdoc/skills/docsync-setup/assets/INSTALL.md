# docsync hooks — install runbook

Self-contained hook assets. The `/brewdoc:docsync-setup` skill copies these into a
target project's `.claude/hooks/` and wires `.claude/settings.json`. All three
files are independent (no shared lib, no plugin-root deps) and read project
state from `<projectRoot>/.claude/docsync/` at runtime, where `projectRoot` is
`CLAUDE_PROJECT_DIR` -> upward walk for `.git`/`.claude` -> the hook's `cwd`. The
hook payload's `cwd` drifts mid-session and is used for one thing only: resolving a
relative `tool_input` path.

| File | Event | Matcher | Action |
|------|-------|---------|--------|
| `docsync-track.mjs` | PostToolUse | `Write\|Edit\|MultiEdit` | Records touched .md; nudges to add `last_updated` frontmatter when missing |
| `docsync-watch.mjs` | PostToolUse | `Read` | Records touched .md. Silent by design — a Read fires constantly |
| `docsync-gate.mjs` | Stop | — | Re-applies `exclude` + `doc_type: skip` to the touched set, then blocks AT MOST ONCE PER SESSION listing every stale AND every undated touched .md |

> Scripts are pure ESM, Node built-ins only (`fs`, `path`), no plugin-root / npm
> deps. Each reads stdin, never throws, exits 0 (gate may emit a `block` decision).
> They write state atomically (temp file + rename).

> Line 2 of each file is a `// brewcode-meta: version=<plugin version>
> generated_by=brewdoc:docsync-setup` stamp, baked at release. The files are copied
> BYTE-FOR-BYTE, so an installed copy that differs from the plugin's is out of date —
> never edit an installed copy in place.

> **Requires `node` on `PATH`** for the shell that runs hooks. Under nvm/asdf a
> non-interactive shell may not have `node` — if hooks silently do nothing, ensure
> `node` resolves in the hook's environment (e.g. a system symlink or a login shell).

---

## Target install dir

`.claude/hooks/` under the project root:

- `<repo>/.claude/hooks/docsync-track.mjs`
- `<repo>/.claude/hooks/docsync-watch.mjs`
- `<repo>/.claude/hooks/docsync-gate.mjs`

## State / config dir

`<repo>/.claude/docsync/`:

- `config.json` — `{ "version": "{PLUGIN_VERSION}", "generated_by": "brewdoc:docsync-setup", "last_updated": "{LAST_UPDATED}", "enabled": true, "threshold_days": 7, "exclude": ["node_modules/**", ...] }`.
  The hooks parse it with `JSON.parse` and read only `enabled`, `threshold_days` and
  `exclude`, so the three provenance keys (and any other key) are inert to them.
  `enabled: false` (written by `disable`) makes all three hooks return an empty result
  immediately — registered, wired, inert. An absent `enabled` key counts as `true`, so
  a config written before this key existed keeps working
- `state-<session_id>.json` — one file PER SESSION, created and owned by the hooks;
  install seeds nothing. Two concurrent sessions in one project no longer reset each
  other's touched-set. Writes go through a pid-unique temp name (`<file>.<pid>.tmp`)
  before the rename, so parallel PostToolUse hooks cannot race each other. The Stop
  gate prunes `state-*.json` and stray `.tmp` files older than 14 days, which is also
  how a pre-6.0 shared `state.json` eventually disappears

---

## settings.json hook entries

Exec form: `command` is the executable, `args` carries the path. Upstream prefers it
for any hook that references a path placeholder, and `${CLAUDE_PROJECT_DIR}` is
substituted per `args` element on every shell — a shell-form `$CLAUDE_PROJECT_DIR`
resolves to `$null` under PowerShell and launches node on `/.claude/hooks/...`.

```json
{
  "hooks": {
    "PostToolUse": [
      { "matcher": "Write|Edit|MultiEdit", "hooks": [ { "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/docsync-track.mjs"] } ] },
      { "matcher": "Read",                 "hooks": [ { "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/docsync-watch.mjs"] } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/docsync-gate.mjs"] } ] }
    ]
  }
}
```

Merge is idempotent (entries keyed by hook basename, matched across `command` AND
`args`, so re-running install never duplicates them and an older shell-form entry is
still recognised) and non-destructive: install backs up `settings.json` to
`settings.json.bak` before writing, aborts rather than clobber on a JSON parse
error, and only ever adds the three docsync entries. If neither `python3` nor `jq`
is available, add the entries above by hand.

---

## Uninstall

`/brewdoc:docsync-setup uninstall` reverses the install:

- Backs up `settings.json` to `.bak`, then inverse-merges — removes ONLY hook
  entries whose command contains `docsync-track.mjs` / `docsync-watch.mjs` /
  `docsync-gate.mjs`, and prunes any now-empty matcher group / event array. All
  foreign hooks, permissions, and env are left untouched.
- Deletes the three `.claude/hooks/docsync-*.mjs` files — but ONLY after the clean
  verifiably succeeded. If neither `python3` nor `jq` is available, or the inverse
  merge fails and the backup is restored, uninstall aborts with the hook files intact
  rather than leave live registrations pointing at deleted scripts.
- Asks whether to also delete `.claude/docsync/` (config + state).

Takes effect on the next session.
