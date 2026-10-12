# Semble

Lifecycle skill for **`semble_code`** — a semantic repository-search MCP server ([semble](https://pypi.org/project/semble/), pinned to exact `semble[mcp]==0.6.2`) wired into any project: install, audit, configure, repair, upgrade, enable, disable, reindex, uninstall.

One command covers the whole lifecycle. It always reports the current state **before** it changes anything, and every mutation is delegated to a script — the skill itself only routes.

```
/brewcode:semble-setup                          # status (default, no args, read-only)
/brewcode:semble-setup install                  # prereqs -> register MCP -> reload checkpoint
/brewcode:semble-setup resume                   # after the reload: verify + wire guidance
/brewcode:semble-setup disable                  # go silent, delete nothing
/brewcode:semble-setup reindex                  # stage and replace the selected variant
/brewcode:semble-setup purge                    # typed confirmation required
```

## What it gives you

Two MCP tools, once wired:

| Tool | Purpose |
|------|---------|
| `mcp__semble_code__search` | find code by intent / behavior / name |
| `mcp__semble_code__find_related` | neighbors of a known location, after a useful seed |

Both take a required `repo` parameter — the absolute project root or an explicit `http://`/`https://` git URL. It is never inferred. They also accept optional `content=code|docs|config|all`; omit it to search the server's registered combined `code docs config` corpus. Results carry `file_path`, `start_line`, `end_line`, `score` and optional result `content`; there is no result `line` field. Defaults: `top_k=5`, `max_snippet_lines=10`.

Routing: intent/behaviour -> semble; symbol definitions, references, call graphs -> LSP; literals, regexes, paths, exhaustive counts -> `rg`.

## Future alternative

[Codebase Memory MCP](https://github.com/DeusData/codebase-memory-mcp) (structural code intelligence: call graphs, impact analysis, dead-code detection, route tracing) is a candidate companion for a future, separate skill. It is not integrated or installed by this skill and is not a replacement for Semble. The engine decision record is `references/engine-landscape.md`.

## Modes

Free text in Russian or English routes to one mode. The full table and the resolution algorithm live in `references/intent-routing.md`.

The seven canonical modes every `-setup` skill shares, in order:

| Mode | Effect | Mutates |
|------|--------|---------|
| `status` | full report: prereqs, MCP, version check (registered vs pin vs upstream), cache, guidance, agents, coverage, state | no |
| `install` | install `uv` (and, if you accept, `coreutils`), register `semble_code` at user scope, **wire the rule, the CLAUDE.md block, the three hooks, the permissions and the agent frontmatter**, checkpoint for reload | yes |
| `upgrade` | re-check prerequisites and the registration (repair to pin `0.6.2` when it differs and you approve), then re-copy the rule, `.sembleignore` and hooks and re-merge the settings. Version-aware: an identical copy is `unchanged`, a stamp-only difference is re-synced, a byte-pristine copy of any v4.5.0-v6.4.0 template is upgraded without `--force` or backup, a hand-edited file is skipped and diffed (`--force` backs up first). Retired hooks are deleted | yes |
| `enable` | back on: verify, warm, `phase=ready` | yes |
| `disable` | `enabled=false` — hooks go silent, nothing is deleted | yes |
| `uninstall` | four flavours: `integration` / `mcp` / `cli` / `purge` | yes |
| `purge` | integration + MCP + CLI + this project's cache entry — typed confirmation required | yes |

Plus three extras specific to a search index:

| Mode | Effect | Mutates |
|------|--------|---------|
| `reindex` | stage and prove a replacement for this repo's `index-code-config-docs`, then swap only that variant | yes |
| `optimize` | read-only audit fan-out with concrete recommendations | no |
| `resume` | after the reload checkpoint: run the workflow-deferred pinned CLI smoke, then a self-repairing re-run of the rule + hooks + permissions + agent migration, then `phase=ready` | yes |

`install` wires everything that does not need a live MCP server. `resume` is idempotent — its merge is field-level and self-repairing, so running it after `install` re-checks the wiring instead of duplicating it. The new session is required for MCP tool visibility only: the smoke uses the pinned CLI and is deferred to `resume`, and the final `ready` phase follows that verification.

**Empty input is always `status`** — read-only, no questions, no mutation. This is the one setup skill that does not fall back to `install` when nothing is installed, because `install` reaches machine-level package management.

## What `install` installs, and where

The project root is the session's start directory (`CLAUDE_PROJECT_DIR`, substituted into every skill block), the same directory Claude Code loads `.claude/settings.json` from; only when it is unset do the scripts fall back to the git toplevel. A session started in a subdirectory therefore wires that subdirectory, not the repo root.

Two scopes that are easy to confuse: the MCP registration is per Claude Code profile (user scope in that profile's config file), while the rule, hooks, CLAUDE.md block and state file are per project. A project wired from one profile reports `version: not registered` in another until `install` runs there. The default profile's file is `~/.claude.json`, addressed only with `CLAUDE_CONFIG_DIR` unset: set to `~/.claude`, Claude Code reads `~/.claude/.claude.json` instead.

| Surface | Location |
|---------|----------|
| MCP server | the active profile's `.claude.json` (default profile: `~/.claude.json`), `.mcpServers.semble_code`, user scope (`-s user`; the CLI default is `local`), with `"alwaysLoad": true` so the tools are never deferred behind `ToolSearch` — a key only `claude mcp add-json` writes |
| Command | `uvx --from 'semble[mcp]==0.6.2' semble --content <SEMBLE_CONTENT_ARGS>` — the registered default content set lives only in `scripts/lib/semble-common.sh`. It selects the combined `index-code-config-docs` variant; `content=all` reuses that variant, while an explicit narrower per-call selection resolves its exact sibling |
| Shared cache root | macOS `~/Library/Caches/semble-code` · Linux `${XDG_CACHE_HOME:-$HOME/.cache}/semble-code`. Each repository gets one hashed directory containing independent exact-content variants: code-only is `index`; other sorted selections are `index-<scope>` |
| State | `<repo>/.claude/semble/state.json` |
| Rule | `<repo>/.claude/rules/semble-first.md` |
| Ignore file | `<repo>/.sembleignore` — read per directory, gitignore syntax (`core.excludesFile` is not honoured). Keeps generated/vendored trees (`.claude/tmp/`, `.claude/reports/`, build output, minified bundles) out of the corpus; deliberately never excludes `.claude/{skills,agents,rules,commands,hooks}/`. Same managed-file policy as the rule: user edits are reported, not clobbered, and `--force` backs up first |
| CLAUDE.md | a marked `<!-- BEGIN brewcode:semble -->` ... `<!-- END brewcode:semble -->` block in the root `CLAUDE.md` (see the marker contract below), plus `install --part claudemd`'s reconcile of the competing search doctrine outside the markers (table below), after a timestamped `.bak` |
| Hooks | `<repo>/.claude/hooks/semble-session.mjs` (SessionStart — state and reload messaging) + `semble-stats.mjs` (PostToolUse + PostToolUseFailure — pure observer, JSONL telemetry) + `semble-subagent.mjs` (SubagentStart, no matcher, so every agent type; silent for an agent whose `tools:` omits semble). Four settings rows, each `timeout: 5`. Retired and deleted by `install`/`upgrade`/`uninstall`, together with their settings rows (any matcher or command form) and the `.reminder-ts`, `.prefetch-ts` and `reminder.json` markers: `semble-explore.mjs` (superseded by `semble-subagent.mjs`), `semble-reminder.mjs` (PreToolUse `Bash\|Grep`) and `semble-prefetch.mjs` (UserPromptSubmit). A same-profile A/B measured no gain from the last two |
| Permissions | `<repo>/.claude/settings.json` -> exactly `mcp__semble_code__search` and `mcp__semble_code__find_related`, never a wildcard. Every settings write (hook entries and permissions, install and removal) holds a `settings.json.lock` directory: 10 s wait, a lock older than 30 s is treated as stale. Hook wiring applies live; `/hooks` shows it, no new session needed |
| Agents | `<repo>/.claude/agents/**/*.md` get the two tool names; agents with no `tools:` key inherit and are left untouched. Global agents are never touched by `install` |

### CLAUDE.md reconcile — what gets touched

| Line matches | Action |
|---|---|
| **denies** semantic search outright (`Grep/Glob are no-ops`, `semantic search is broken`, `never use semble`) | removed **even when the line also scopes the tool** — a denial is false regardless of what else it says |
| puts grep/Bash/rg **first** (`search via the Bash tool`, `grep-first`, `use rg for all searches`) | removed, **unless** the same line scopes the tool (see the row below) |
| a search-titled heading the removal leaves empty | removed with it |
| merely mentions a search tool | reported and left untouched |
| scopes the tool to exact identifiers / regexes / paths / exhaustive enumeration (the skill's own correct guidance) | never touched, not even reported — this exemption shields the **first**-tier match only, never a denial |

**Marker contract.** The marked range belongs to this skill. `install` and `upgrade` replace it in place and never add a second copy; `upgrade` re-creates a deleted block; only `uninstall` removes it. Any other tool that rewrites `CLAUDE.md` must keep the range byte-identical, both marker lines included. An unpaired or duplicated marker is `malformed`: nothing changes (exit `3`) and you fix the file by hand.

Removal is whole lines only, echoed verbatim in the report, and the whole file is backed up to a timestamped `.bak` first. An A/B found no effect of such a line on semble adoption; the scan is kept because the line is worth removing for being false.

### Hooks — what is proven

`SubagentStart` is proven to deliver its text inside a subagent: present with the registration installed, absent with it removed. No hook is proven to change which search tool gets used — there is no controlled measurement, so never quote a conversion percentage for a nudge. The hooks read the project state file (`enabled`, `phase`) and nudge only when `semble_code` is registered for the profile in use; otherwise SessionStart says it is not registered for this profile and the rest stay silent.

### The state file and its phases

`.claude/semble/state.json` (per project) is what `semble-session.mjs` reads, so its `phase` is guarded by a transition machine:

```
absent -> prereq_ready -> awaiting_reload -> verifying -> ready
                                   \                        |
                                    +-> disabled <----------+
```

`ready` is reachable only from `verifying` — there is no `awaiting_reload -> ready` shortcut. `resume` therefore enters `verifying` before it verifies anything and writes `ready` only after, so a run that dies half-way leaves an honest record. Re-registration (`install` / `upgrade`) parks the phase back at `awaiting_reload` from any state where a setup exists, and `disable` reaches `disabled` from any of them too; only `absent -> disabled` stays illegal.

Fields the installer owns — `resumePrompt`, `cacheRoot`, `repoHash`, `approvedVersion`, `projectRoot`, `schema`, plus the artifact metadata `version` / `generated_by` / `last_updated` — are recomputed on every write, so a state file written by an older version stops advertising stale values. Fields you and the run own — `enabled`, `phase`, `completed`, `notes` — are never reset as a side effect.

Installation is uvx-ephemeral by default: no `semble` on `PATH`, because any unrecognized argv makes `semble` start a blocking stdio server and a stray bare invocation would hang. `uv tool install` is opt-in.

### Prerequisites — one required, one optional

| Package | Gate | If you decline or it is impossible |
|---------|------|------------------------------------|
| `uv` / `uvx` (`brew install uv`) | **required** — `install` asks first and stops if you decline; manual fallback `curl -LsSf https://astral.sh/uv/install.sh \| sh` is printed, never run | `install` cannot continue |
| `coreutils` (`brew install coreutils` -> `gtimeout`) | **optional** — offered only when no `timeout`/`gtimeout` exists and `brew` does | nothing breaks: the scripts' `sc_timeout` falls back to a pure-bash watchdog, so every shell-out stays time-bounded either way |

`coreutils` is never a hard requirement: no brew, a failed install, `SEMBLE_NO_NETWORK=1` or a declined offer all leave the run at exit `0` with a note. `install` never blocks on it.

## Limits — read before trusting it

| Fact | Consequence |
|------|-------------|
| **No watcher, no daemon.** semble 0.6.2 has no background thread or service | Nothing is ever started or stopped. Staleness is re-checked inside each tool call, behind a `3x last-build-duration` cooldown |
| The embedding model is pre-loaded at server start and calls block until it is ready | The **first query on a cold cache downloads hundreds of MB and is slow** — allow up to 600 s. Offline + cold HuggingFace cache = every call errors |
| The corpus is exactly `SEMBLE_CONTENT_ARGS` | `.json`/`.json5`/`.csv`/`.tsv`/`.psv` are excluded from **every** content type — unreachable even with `--content all` — and `.mdx`/`.txt` belong to no bucket at all. Use `rg` for those. The per-suffix table is `references/language-coverage.md` |
| Negation bypass | A `!` un-ignore pattern ending in a file extension skips the extension filter, so a negated `.json`/`.png` lands in the index at any `--content` setting. `.sembleignore` re-ignores win, because its lines are concatenated after `.gitignore`'s and the last match decides |
| `config` is part of the corpus on purpose | CI workflows (`.github/workflows/*.yml`) and `docker-compose*.yml` files are the only reachable answers to deployment questions |
| Retrieval split — semble 0.5.4 measurement, 16 questions, not rerun on 0.6.2 | Behaviour and vocabulary-mismatch: semble won 8 of 9. Exhaustive enumeration: semble lost 2 of 5, and `hooks.json` questions were unanswerable because `.json` is unreachable. Hence the routing line above |
| Exact content selections live side by side | Under one hashed repository directory, the registered combined corpus is `index-code-config-docs`, code-only is `index`, and explicit narrower `docs` or `config` searches use sibling variants. `content=all` resolves the same `code docs config` set and reuses `index-code-config-docs`; the variants do not evict one another |
| A newly registered MCP server is invisible to the running session | `install` stops at a reload checkpoint; `/brewcode:semble-setup resume` finishes the job in the new session |
| `semble clear index` wipes **every** index under the shared cache root | There is no per-repo rebuild CLI, so `reindex` builds and proves a private staged `index-code-config-docs`, then replaces only that live variant. **Sibling content variants stay available throughout the swap.** A verified pre-0.5.5 combined corpus at bare `index` is removed only after its replacement is live |
| Staleness detection approximates semble's own validation | It is reported as *likely stale* and always offers `reindex` rather than acting by itself |
| An upstream server named `semble` (written by `semble install`) is unpinned and shares a single-corpus cache root | It is detected and reported as a conflict, **never removed automatically** — other tools may depend on it |
| Windows is unsupported | The skill says so and refuses to mutate |

## Removal

| Flavour | Rule / hooks / CLAUDE.md | MCP | Agent frontmatter | Cache | uv tool |
|---------|--------------------------|-----|-------------------|-------|---------|
| `integration` | removed | kept | semble entries removed | kept | kept |
| `mcp` | kept | removed | kept | kept | kept |
| `cli` | kept | kept | kept | kept | `uv tool uninstall semble` |
| `purge` | removed | removed | removed | this project's entry removed; shared root kept unless empty | `uv tool uninstall semble` |

MCP removal covers the active profile only. `purge` first prints every path it would delete and needs the typed confirmation `purge semble code cache`. The cache root is shared by every project and profile, so `purge` removes only this project's entry under it. Settings entries are unwired before any hook file is deleted; if unwiring fails, nothing is deleted. A clean removal also deletes install's empty stubs (`CLAUDE.md` holding only `# CLAUDE.md`, a blank `.gitignore`, empty `.claude/hooks`/`.claude/rules`, a `.claude/settings.json` that held only semble entries, and an empty `.claude/`). A `settings.json` with other content is kept. `purge` also deletes the MCP rollback copies (`.claude.json.bak.<epoch>`, `.mcp.json.bak.<epoch>`) its own verified removal took; the `mcp` flavour reports them as kept. `disable` is the reversible alternative: nothing is deleted, the hooks go quiet.

Legacy cleanup is narrower: a pre-0.5.5 `semble-docs` directory is removed by `purge` only when it is a real directory whose sole entry is the `RESERVED-FOR-DOCS.txt` ownership marker. Empty directories, symlinks, repurposed directories and directories with any additional content are preserved.

## Files

| Path | What |
|------|------|
| `SKILL.md` | the router: status first, mode selection, delegation |
| `scripts/semble-status.sh` | read-only full report (`--json`, `--section`, `--strict`); `--versions [--all-profiles]` prints one `dir \| registered \| pin \| verdict \| file` row per config dir |
| `scripts/semble-install.sh` | `check` \| `uv` \| `coreutils` \| `semble` \| `all` — `uv` via brew, optional `coreutils`, pin priming through `uvx` |
| `scripts/semble-mcp.sh` | detect / add / repair / remove / checkpoint |
| `scripts/semble-cache.sh` | resolve and inspect exact variants in the shared root; guarded repository/root purge |
| `scripts/semble-state.sh` | `.claude/semble/state.json` read-modify-write |
| `scripts/semble-project.sh` | audit, warm, smoke, enable, disable, reindex |
| `scripts/semble-remove.sh` | the four removal flavours |
| `scripts/semble-guidance.sh` | rule, CLAUDE.md block + competing-doctrine reconcile, hooks, settings + permissions merge |
| `scripts/semble-agents.sh` | project agent frontmatter migration |
| `references/intent-routing.md` | routing table + 5-step resolution + 12 worked examples |
| `references/output-contract.md` | the report template every invocation ends with |
| `references/mcp-and-cache.md` | registration commands, 7-state detection matrix, cache layout |
| `references/language-coverage.md` | which suffixes are indexed, which are not |
| `references/project-agent-migration.md` | agent frontmatter transformation rules |
| `references/engine-landscape.md` | the engine decision record: semble against the alternatives |
| `assets/INSTALL.md` | the runbook for the guidance/hooks install |

Every script takes `--json` and uses the same exit codes: `0` ok · `1` hard failure (earlier writes may survive) · `2` bad usage · `3` recoverable precondition, conflict or skipped verification · `4` confirmation required (nothing written).

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| The tools do not appear after `install` | the MCP server only loads in a **new** session | reload Claude Code, then `/brewcode:semble-setup resume` |
| First search hangs for minutes | the embedding model is downloading | wait (up to 600 s); it happens once per model |
| Every call errors offline | model pre-load cannot reach HuggingFace | run once online, or set `SEMBLE_NO_NETWORK=1` to skip warm steps |
| `search` rejects the call | `repo` is missing — it is required | pass the absolute project root |
| Status prints `retired: <names> - stale (remove via upgrade)` and the project shows `partial` | a 6.4.0 install still has `semble-reminder.mjs` / `semble-prefetch.mjs` (file or settings row), or a prior-release copy of the rule | run `/brewcode:semble-setup upgrade` |
| A `.json` / `.csv` / `.mdx` / `.txt` file is never found | not in this corpus by design (`.html`/`.htm` **is** indexed, in the docs bucket) | use `rg` |
| Status says `partial` | half-wired — `hooks N/4 wired` counts only entries that are present **and** field-conforming; a hook whose `timeout`, `args` or `command` drifted is counted in `driftedCount`, not in `wiredCount` | `/brewcode:semble-setup install` re-runs idempotently and repairs each drifted field in place |
| `hooks 4/4 wired` but a hook never fires | a duplicate entry for the same event/matcher/script — reported as `duplicateCount` with a `drift[]` row, never as `wired` | re-run `install`; the merge collapses duplicates |
| `malformed` | the profile's `.claude.json` or the project `.mcp.json` is not valid JSON | the skill refuses to write; fix that file by hand, then re-run |
| The project is `ready` but the tools are missing in this profile | the server is registered per profile and this one has none — status prints `version: not registered`, the hooks stay silent and SessionStart says `not registered for this profile` | `/brewcode:semble-setup install` from this profile; `scripts/semble-status.sh --versions --all-profiles` lists every profile |

## Documentation

Full docs: [semble-setup](https://doc-claude.brewcode.app/brewcode/skills/semble-setup/)

## License

MIT — see `LICENSE`.
