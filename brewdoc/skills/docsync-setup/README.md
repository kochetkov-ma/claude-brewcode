---
doc_type: user
last_updated: 2026-07-19
---

# docsync-setup

Project-scoped doc-staleness tracker for Claude Code. Installs three project-local
hooks that watch which `.md` docs you read or edit during a session, then nag once
(at end of turn) when a touched doc is stale by date. The source of truth is each
doc's own YAML frontmatter — no separate ledger. Replaces `brewdoc:auto-sync`.

## Quick Start

```sh
/brewdoc:docsync-setup                 # not installed -> install; otherwise status
/brewdoc:docsync-setup status          # what is tracked / stale
/brewdoc:docsync-setup install         # wire the hooks into this project
/brewdoc:docsync-setup upgrade         # refresh hooks, keep config + state
/brewdoc:docsync-setup uninstall       # remove hooks + settings entries (non-destructive)
/brewdoc:docsync-setup purge           # uninstall + delete .claude/docsync/
/brewdoc:docsync-setup sync            # sync stale docs (with confirmation)
/brewdoc:docsync-setup sync --all      # sync every in-scope doc
/brewdoc:docsync-setup reread          # re-read tracked docs to refresh context
/brewdoc:docsync-setup frontmatter     # retro-add frontmatter to in-scope docs (opt-in)
```

The skill is prompt-driven: free text in RU or EN works too (e.g. "что устарело",
"настрой отслеживание документации"). It resolves the mode, states the plan,
executes, prints a summary, and verifies the outcome.

## Modes

Canonical verbs first, then the skill-specific extras.

| Mode | Trigger | What it does |
|------|---------|--------------|
| status | `status` / installed + no args | Lists in-scope docs with `last_updated`, age, and stale/fresh/no-date state. No changes. |
| install | `install` / not installed + no args | Asks threshold (default 7d) + exclude globs; copies 3 hooks into `.claude/hooks/`; writes `.claude/docsync/config.json`; idempotently + non-destructively merges `.claude/settings.json` (backs up to `.bak`). Never adds frontmatter to docs. |
| upgrade | `upgrade` | Re-copies the 3 hooks and re-runs the settings merge; `config.json` and `state.json` are left untouched. |
| uninstall | `uninstall` | Removes only docsync hook entries from `settings.json` (foreign entries preserved), deletes the 3 hook files, asks about dropping `.claude/docsync/`. |
| purge | `purge` | `uninstall` plus unconditional removal of `.claude/docsync/`. |
| sync | `sync [--all]` | Syncs stale docs (or all) after confirmation, per each doc's `sync_procedure`, then bumps `last_updated` to today. `doc_type` sets compress depth. |
| reread | `reread` | Force re-read of tracked docs to refresh in-context understanding. |
| frontmatter | `frontmatter` | Opt-in retro-add of docsync frontmatter to in-scope docs. Never automatic at install. |

Removed aliases: `init`, `setup`, `on`, `off`, `remove`, `reset`.

## Frontmatter schema

Every tracked `.md` carries its own state:

```yaml
---
doc_type:      llm            # optional; absent => user. values: llm | user | skip
last_updated:  2026-07-19     # sole staleness input (YYYY-MM-DD)
sync_procedure:"what to check / where to look when syncing"   # optional, prose
---
```

- Staleness is DATE ONLY (LOCAL time): `today - last_updated > threshold_days`. No hashing, no `depends_on`.
- `doc_type: skip` excludes a file entirely; `llm` = deep compress on sync, `user` = light.

## Scope

All `*.md` in the project, minus the `exclude` globs chosen at install and any file
with `doc_type: skip`. Only docs you actually read or edit in a session are
candidates for the end-of-turn nag — untouched docs are never nagged.

## The three hooks

| File | Event | Matcher | Action |
|------|-------|---------|--------|
| `docsync-track.mjs` | PostToolUse | `Write\|Edit\|MultiEdit` | Records touched `.md`; nudges to add `last_updated` when missing |
| `docsync-watch.mjs` | PostToolUse | `Read` | Records touched `.md` (silent) |
| `docsync-gate.mjs` | Stop | — | Blocks once if a touched doc is stale; tells Claude to ask about syncing |

Hooks are self-contained ESM (Node built-ins only), read state from
`.claude/docsync/` at runtime, and take effect on the next session.

## State / config

`.claude/docsync/`:

- `config.json` — `{ "threshold_days": 7, "exclude": ["node_modules/**", ...] }`
- `state.json`  — `{ "session_id": "...", "touched": [], "asked": false }` (hook-managed; resets per session)

No registry file — frontmatter is the source of truth.

## Documentation

Full docs: [docsync-setup](https://doc-claude.brewcode.app/brewdoc/skills/docsync-setup/)
