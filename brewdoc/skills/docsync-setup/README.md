---
doc_type: user
last_updated: "2026-08-08"
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
/brewdoc:docsync-setup enable          # resume tracking (config.json enabled: true)
/brewdoc:docsync-setup disable         # pause tracking, keep everything wired
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
| upgrade | `upgrade` | Re-copies the 3 hooks and re-runs the settings merge; only the three provenance keys in `config.json` are refreshed — `enabled`, `threshold_days`, `exclude` and the session state files are left untouched. |
| enable | `enable` / включи | Sets `enabled: true` in `config.json`. Nothing else moves. |
| disable | `disable` / выключи | Sets `enabled: false`. The hooks stay registered in `settings.json` and on disk, the session state files and every `last_updated` survive, and all three hooks no-op on their next invocation — effective immediately, no session restart. The reversible pause; `uninstall` is the removal. |
| uninstall | `uninstall` | Removes only docsync hook entries from `settings.json` (foreign entries preserved), deletes the 3 hook files, asks about dropping `.claude/docsync/`. |
| purge | `purge` | `uninstall` plus unconditional removal of `.claude/docsync/`. |
| sync | `sync [--all]` | Syncs stale docs (or all) after confirmation, per each doc's `sync_procedure` (prose Claude reads and follows — no hook parses it), then bumps `last_updated` to today. `doc_type` sets compress depth. |
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
  literally as `^doc_type: llm$`. Quoted docs already in your repo keep working.
- Staleness is DATE ONLY (LOCAL time): `today - last_updated > threshold_days`. No hashing, no `depends_on`.
- `doc_type: skip` excludes a file entirely; `llm` = deep compress on sync, `user` = light.
  Absent or unrecognized is normalized to `user` by the hooks, not just in docs.
- `sync_procedure` is a **model-only hint** — no hook reads it. The gate's block
  message and `sync` mode tell Claude to follow it after reading the doc.

## Scope

All `*.md` in the project, minus the `exclude` globs chosen at install and any file
with `doc_type: skip`. All three hooks apply both filters, the Stop gate included —
marking a doc `skip` mid-session silences it immediately. Only docs you actually
read or edit in a session are candidates for the end-of-turn nag — untouched docs
are never nagged.

## The three hooks

| File | Event | Matcher | Action |
|------|-------|---------|--------|
| `docsync-track.mjs` | PostToolUse | `Write\|Edit\|MultiEdit` | Records touched `.md`; nudges to add `last_updated` when missing |
| `docsync-watch.mjs` | PostToolUse | `Read` | Records touched `.md`. Silent by design (a Read fires constantly) |
| `docsync-gate.mjs` | Stop | — | Blocks AT MOST ONCE PER SESSION, listing every stale AND every undated touched doc; tells Claude to ask about syncing |

The gate's "asked" flag is one boolean per session: after that single block, docs
that go stale later in the same session produce no further signal until the next
session. Deliberate — a Stop hook that blocks repeatedly loops. A doc that is only
ever READ and has no date is still reported, by the gate, under `no last_updated`.

Hooks are self-contained ESM (Node built-ins only), read state from
`.claude/docsync/` at runtime, and take effect on the next session. Each carries a
`// brewcode-meta: version=… generated_by=brewdoc:docsync-setup` line on line 2, so
an installed copy can be compared byte-for-byte with the plugin's.

## State / config

`.claude/docsync/`:

- `config.json` — `{ "version": "X.Y.Z", "generated_by": "brewdoc:docsync-setup", "last_updated": "YYYY-MM-DD", "enabled": true, "threshold_days": 7, "exclude": ["node_modules/**", ...] }`.
  The three provenance keys come first, in that order; `version` is the brewdoc plugin
  version that installed it, read from `plugin.json` by skill self-location, and
  `last_updated` is the install/upgrade date from `date +%F`. `upgrade` refreshes all
  three and leaves `enabled` + `threshold_days` + `exclude` verbatim. The hooks read only
  `enabled`, `threshold_days` and `exclude` — the provenance keys are inert to them and
  are what `/brewcode:setup-status` reads the installed version from. `enabled` is the
  `disable`/`enable` switch: `false` makes every hook a no-op on its next invocation
  (immediately, no session restart), absent counts as `true`
- `state-<session_id>.json` — one file PER SESSION, created and owned by the hooks;
  install seeds nothing, so two concurrent sessions in one project cannot reset each
  other's touched-set. Writes land on a pid-unique temp name before the rename. The
  Stop gate prunes state files older than 14 days, which is also how a pre-6.0 shared
  `state.json` disappears

No registry file — frontmatter is the source of truth.

## Documentation

Full docs: [docsync-setup](https://doc-claude.brewcode.app/brewdoc/skills/docsync-setup/)
