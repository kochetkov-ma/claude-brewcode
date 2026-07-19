# docsync hooks — install runbook

Self-contained hook assets. The `/brewdoc:docsync` skill copies these into a
target project's `.claude/hooks/` and wires `.claude/settings.json`. All three
files are independent (no shared lib, no plugin-root deps) and read project
state from `<cwd>/.claude/docsync/` at runtime.

| File | Event | Matcher | Action |
|------|-------|---------|--------|
| `docsync-track.mjs` | PostToolUse | `Write\|Edit\|MultiEdit` | Records touched .md; nudges to add `last_updated` frontmatter when missing |
| `docsync-watch.mjs` | PostToolUse | `Read` | Records touched .md (silent) |
| `docsync-gate.mjs` | Stop | — | Blocks once if any touched .md is stale by date; instructs Claude to ask about syncing |

> Scripts are pure ESM, Node built-ins only (`fs`, `path`), no plugin-root / npm
> deps. Each reads stdin, never throws, exits 0 (gate may emit a `block` decision).
> They write state atomically (temp file + rename).

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

- `config.json` — `{ "threshold_days": 7, "exclude": ["node_modules/**", ...] }`
- `state.json`  — `{ "session_id": "...", "touched": [], "asked": false }` (managed by hooks)

---

## settings.json hook entries

Use the `$CLAUDE_PROJECT_DIR` substitution (Claude Code expands it at hook run
time) so committed `settings.json` is path-portable across machines and CI:

```json
{
  "hooks": {
    "PostToolUse": [
      { "matcher": "Write|Edit|MultiEdit", "hooks": [ { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/docsync-track.mjs\"" } ] },
      { "matcher": "Read",                 "hooks": [ { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/docsync-watch.mjs\"" } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/docsync-gate.mjs\"" } ] }
    ]
  }
}
```

Merge is idempotent (entries keyed by hook basename, so re-running init never
duplicates them) and non-destructive: init backs up `settings.json` to
`settings.json.bak` before writing, aborts rather than clobber on a JSON parse
error, and only ever adds the three docsync entries. If neither `python3` nor `jq`
is available, add the entries above by hand.

---

## Uninstall

`/brewdoc:docsync uninstall` reverses the install:

- Backs up `settings.json` to `.bak`, then inverse-merges — removes ONLY hook
  entries whose command contains `docsync-track.mjs` / `docsync-watch.mjs` /
  `docsync-gate.mjs`, and prunes any now-empty matcher group / event array. All
  foreign hooks, permissions, and env are left untouched.
- Deletes the three `.claude/hooks/docsync-*.mjs` files.
- Asks whether to also delete `.claude/docsync/` (config + state).

Takes effect on the next session.
