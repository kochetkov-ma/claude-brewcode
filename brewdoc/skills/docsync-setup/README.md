---
doc_type: user
last_updated: "2026-10-12"
---

# docsync-setup

Project-scoped doc-staleness tracker for Claude Code. Installs three project-local
hooks that log which `.md` docs a session edits and, at the end of a turn, raise the
ones whose `last_updated` is missing, unusable or behind the file. The source of truth
is each doc's own YAML frontmatter — no separate ledger.

## Quick Start

```sh
/brewdoc:docsync-setup                 # not installed -> install; otherwise status
/brewdoc:docsync-setup status          # what is tracked / stale
/brewdoc:docsync-setup install         # wire the hooks into this project
/brewdoc:docsync-setup upgrade         # refresh hooks, keep config + state
/brewdoc:docsync-setup enable          # resume tracking (config.json enabled: true)
/brewdoc:docsync-setup disable         # pause tracking, keep everything wired
/brewdoc:docsync-setup uninstall       # remove hooks + settings entries (non-destructive)
/brewdoc:docsync-setup purge           # uninstall + delete .claude/docsync/
/brewdoc:docsync-setup sync            # sync stale docs (asks which docs to sync first)
/brewdoc:docsync-setup sync --all      # sync every in-scope doc
/brewdoc:docsync-setup reread          # re-read tracked docs to refresh context
/brewdoc:docsync-setup frontmatter     # retro-add frontmatter to in-scope docs (opt-in)
```

The skill is prompt-driven: free text works too (e.g. "which docs are stale",
"set up doc tracking"). It resolves the mode, prints a plan, executes
and verifies the outcome.

## Modes

| Mode | Trigger | What it does |
|------|---------|--------------|
| status | `status` / installed + no args | Lists in-scope docs with `last_updated`, age, and stale/fresh/no-date state. No changes. |
| install | `install` / not installed + no args | Asks threshold (default 7d) + exclude globs (`.claude/**` is always added); copies 3 hooks into `.claude/hooks/`; writes `.claude/docsync/config.json`; merges `.claude/settings.json` in one transaction (rolled back on failure, foreign entries untouched, no backup file). Never adds frontmatter to docs. |
| upgrade | `upgrade` | Re-copies the 3 hooks, rewrites the docsync registrations into the current shape and refreshes the four provenance keys in `config.json`; `enabled`, `threshold_days`, `exclude` and the session logs stay. The first upgrade of a registration without `timeout` also adds `.claude/**` to `exclude`, once. |
| enable | `enable` | Sets `enabled: true` in `config.json` and refreshes the four provenance keys. Nothing else moves. |
| disable | `disable` | Sets `enabled: false` and refreshes the four provenance keys. The hooks stay registered and on disk, the session logs and every `last_updated` survive, and all three hooks no-op from their next invocation, with no session restart. The reversible pause; `uninstall` is the removal. |
| uninstall | `uninstall` | Removes only docsync hook entries from `settings.json` (foreign entries preserved), the 3 hook files, stray nested state dirs and an older docsync's `settings.json.bak` when that loses nothing. Keeps `.claude/docsync/`. |
| purge | `purge` | `uninstall` plus removal of `.claude/docsync/`. |
| sync | `sync [--all]` | Syncs stale docs (or all) per each doc's `sync_procedure`, then bumps `last_updated` to today. It asks via `AskUserQuestion` which listed docs to sync and syncs only the confirmed ones. |
| reread | `reread` | Force re-read of tracked docs to refresh in-context understanding. |
| frontmatter | `frontmatter` | Opt-in retro-add of docsync frontmatter to in-scope docs. Never automatic at install. |

Canonical order: `status | install | upgrade | enable | disable | uninstall | purge`, then the extras above.

Removed aliases: `init`, `on`, `off`, `setup`, `remove`, `reset`, `create`, `update`, `cleanup`.

## Frontmatter schema

Every tracked `.md` carries its own state:

```yaml
---
doc_type: llm                  # optional, UNQUOTED; absent or unrecognized => user. values: llm | user | skip
last_updated: "2026-07-19"     # sole staleness input (YYYY-MM-DD, LOCAL time)
sync_procedure: "what to check / where to look when syncing"   # optional, prose
---
```

- **`last_updated` and `sync_procedure` are quoted; `doc_type` is bare.** The hooks'
  parser strips quotes either way, but a real YAML consumer types an unquoted
  `2026-07-19` as a Date, and `doc_type` is an enum other brewcode tooling matches
  literally as `^doc_type: llm$`.
- Every date is the local calendar day (`date +%F`). The Stop gate compares `last_updated` with the
  file's own modification day; `status` and `sync` age it against today
  (`today - last_updated > threshold_days`). No hashing, no `depends_on`.
- `doc_type: skip` excludes a file entirely; `llm` = deep compress on sync, `user` = light.
  Absent or unrecognized counts as `user`.
- `sync_procedure` is a **model-only hint** — no hook reads it. The gate's block
  message and `sync` mode tell Claude to follow it after reading the doc.

## Scope

All `*.md` in the project, minus the `exclude` globs (chosen at install, plus
`.claude/**`), any file with `doc_type: skip`, and the auto-loaded instruction files
`CLAUDE.md`, `CLAUDE.local.md` and `AGENTS.md` (any depth), which are never tracked,
nudged or gated, whatever `exclude` says. All three hooks apply these filters,
the Stop gate included — marking a doc `skip` mid-session silences it immediately. Only
docs edited through `Write`/`Edit` in the session are raised at the end of a turn; a doc
that was merely read, or changed by Bash or outside Claude Code, never is.

## The three hooks

| File | Event | Matcher | Action |
|------|-------|---------|--------|
| `docsync-track.mjs` | PostToolUse | `Write\|Edit` (two handlers, `Write(**/*.md)` and `Edit(**/*.md)`), 5 s | Logs the edit; nudges to add `last_updated` when it is missing, once per file per session |
| `docsync-watch.mjs` | PostToolUse | `Read(**/*.md)`, 5 s | Logs reads by the main session. Silent and informational only |
| `docsync-gate.mjs` | Stop | none, 10 s | Blocks once for the docs edited since its last ask whose `last_updated` is missing, unusable (not a real date, or in the future) or more than `threshold_days` behind the file's modification day |

After a block the gate stays silent until one of those docs is edited again. Its message
has Claude set a missing or unusable date itself, and also the date of a doc its own
edit already brought up to date. Any other doc needs a sync: Claude decides and syncs it
on its own, and asks first only before deleting or wholesale rewriting content (through
`AskUserQuestion` when that tool is available, otherwise it lists those docs in its
final message and finishes).

Hooks are self-contained ESM (Node built-ins only) and apply in the running session: Claude Code watches the settings files. Restart the session only if they do not fire.
Each carries a
`// brewcode-meta: version=… generated_by=brewdoc:docsync-setup` line on line 2, so
an installed copy can be compared byte-for-byte with the plugin's.

## State / config

`.claude/docsync/`:

- `config.json` — `{ "version": "X.Y.Z", "content_version": "X.Y.Z", "generated_by": "brewdoc:docsync-setup", "last_updated": "YYYY-MM-DD", "enabled": true, "threshold_days": 7, "exclude": ["node_modules/**", ..., ".claude/**"] }`.
  The four provenance keys come first, in that order; `version` is the brewdoc plugin
  version that installed it and `last_updated` the local install/upgrade day. The hooks read only `enabled`, `threshold_days` and `exclude` —
  the provenance keys are inert to them and are what `/brewcode:setup-status` reads the
  installed version from. An absent `enabled` counts as `true`; an absent `exclude`
  means `[".claude/**"]`, and deleting that entry tracks docs under `.claude/`
- `state-<session_id>.jsonl` — one append-only log per session, created by the hooks, so
  concurrent sessions never share a file. One JSON line per event: `edit`, `read`,
  `nudge`, `ask`. The Stop gate prunes logs, the `state*.json` files of earlier versions
  and stray `.tmp` files older than 14 days

## Documentation

Full docs: [docsync-setup](https://doc-claude.brewcode.app/brewdoc/skills/docsync-setup/)
