# Semble

Lifecycle skill for **`semble_code`** — a semantic repository-search MCP server ([semble](https://pypi.org/project/semble/), pinned to exact `semble[mcp]==0.5.5`) wired into any project: install, audit, configure, repair, upgrade, enable, disable, reindex, uninstall.

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

Both take a **required `repo`** parameter — the absolute project root or an explicit `http://`/`https://` git URL. It is never inferred. Since 0.5.5 they also accept optional `content=code|docs|config|all`; omit it to search the server's registered combined `code docs config` corpus. Results carry `file_path`, `start_line`, `end_line`, `score` and optional result `content`; there is **no result `line` field**. Defaults: `top_k=5`, `max_snippet_lines=10`.

## Future alternative

[Codebase Memory MCP](https://github.com/DeusData/codebase-memory-mcp) is a candidate companion or fallback for a future skill. Its main advantage is structural code intelligence — call graphs, impact analysis, dead-code detection, route tracing and architecture queries — rather than Semble's focused intent and semantic search.

It is **not integrated or installed by this skill**, and it is not currently a replacement for Semble. If adopted, it should get a separate pinned lifecycle skill, isolated cache and a narrow MCP tool profile. Public benchmark results are not directly comparable: Semble's published Codebase Memory baseline exercises its fast lexical graph search, not its current semantic-query path.

## Modes

Free text in Russian or English routes to one mode. The full table and the resolution algorithm live in `references/intent-routing.md`.

The seven canonical modes every `-setup` skill shares, in order:

| Mode | Effect | Mutates |
|------|--------|---------|
| `status` | full report: prereqs, MCP, cache, guidance, agents, coverage, state | no |
| `install` | install `uv` (and, if you accept, `coreutils`), register `semble_code` at user scope, **wire the rule, the CLAUDE.md block, the five hooks, the permissions and the agent frontmatter**, checkpoint for reload | yes |
| `upgrade` | compare the recorded pin with `0.5.5`, re-register if different | yes |
| `enable` | back on: verify, warm, `phase=ready` | yes |
| `disable` | `enabled=false` — hooks go silent, nothing is deleted | yes |
| `uninstall` | four flavours: `integration` / `mcp` / `cli` / `purge` | yes |
| `purge` | everything, including the shared cache root — typed confirmation required | yes |

Plus three extras specific to a search index:

| Mode | Effect | Mutates |
|------|--------|---------|
| `reindex` | stage and prove a replacement for this repo's `index-code-config-docs`, then swap only that variant | yes |
| `optimize` | read-only audit fan-out with concrete recommendations | no |
| `resume` | after the reload checkpoint: run the workflow-deferred pinned CLI smoke, then a self-repairing re-run of the rule + hooks + permissions + agent migration, then `phase=ready` | yes |

`install` no longer leaves the hooks hostage to `resume`: everything that does not need a live MCP server is wired by `install` itself. `resume` stays fully idempotent — its merge is field-level and self-repairing, so running it after `install` re-checks the wiring instead of duplicating it. The new session is required for MCP tool visibility. The smoke uses the pinned CLI and is technically scriptable before reload, but the workflow deliberately defers it to `resume`; the final `ready` phase follows that verification.

**Empty input is always `status`** — read-only, no questions, no mutation. This is the one setup skill that does not fall back to `install` when nothing is installed, because `install` reaches machine-level package management.

## What `install` installs, and where

| Surface | Location |
|---------|----------|
| MCP server | `~/.claude.json` `.mcpServers.semble_code`, **user scope** (`-s user` is mandatory — the CLI default is `local`), with `"alwaysLoad": true` so the two tools are never deferred behind `ToolSearch`. Only `claude mcp add-json` can write that key, so that is the form the skill uses |
| Command | `uvx --from 'semble[mcp]==0.5.5' semble --content <SEMBLE_CONTENT_ARGS>` — the registered default content set lives only in `scripts/lib/semble-common.sh`. It selects the combined `index-code-config-docs` variant; `content=all` reuses that variant, while an explicit narrower per-call selection resolves its exact sibling |
| Shared cache root | macOS `~/Library/Caches/semble-code` · Linux `${XDG_CACHE_HOME:-$HOME/.cache}/semble-code`. Each repository gets one hashed directory containing independent exact-content variants: code-only is `index`; other sorted selections are `index-<scope>` |
| State | `<repo>/.claude/semble/state.json` |
| Rule | `<repo>/.claude/rules/semble-first.md` |
| Ignore file | `<repo>/.sembleignore` — read per-directory by `semble/index/file_walker.py:_load_ignore_for_dir` (gitignore syntax via `pathspec`; `core.excludesFile` is NOT honoured). Keeps generated/vendored trees (`.claude/tmp/`, `.claude/reports/`, build output, minified bundles) out of the corpus; deliberately never excludes `.claude/{skills,agents,rules,commands,hooks}/`. Same managed-file policy as the rule: user edits are reported, not clobbered, and `--force` backs up first |
| CLAUDE.md | a marked `<!-- BEGIN brewcode:semble -->` block — **plus a reconcile of the competing doctrine around it.** `install --part claudemd` scans the root CLAUDE.md **outside** the semble markers, backs the whole file up to a timestamped `.bak` first, and reconciles it to one doctrine. Kept on honest ground even though the A/B below found no adoption effect: a false statement in CLAUDE.md is worth removing because it is false, not because removing it converts anyone |
| Hooks | `<repo>/.claude/hooks/semble-session.mjs` (SessionStart — state and reload messaging) + `semble-prefetch.mjs` (UserPromptSubmit — runs one semble search on the prompt and injects the top-3 candidate **paths**, never snippets) + `semble-stats.mjs` (PostToolUse + PostToolUseFailure — pure observer, JSONL telemetry) + `semble-reminder.mjs` (PreToolUse `Bash\|Grep` — fires on every eligible search, `N = state.reminderEvery`, DEF 1, counter in `.claude/semble/reminder.json` — project-global and persisted across sessions, so at N = 1 it throttles nothing) + `semble-subagent.mjs` (SubagentStart, no matcher, so every agent type). Prefetch declares the index ready only when the current `index-code-config-docs` variant is complete; it deliberately ignores a bare pre-0.5.5 combined `index`. `semble-explore.mjs` is retired for good, superseded by `semble-subagent.mjs`; `install`/`upgrade` deletes that file and replaces its settings row |
| Permissions | `<repo>/.claude/settings.json` -> exactly `mcp__semble_code__search` and `mcp__semble_code__find_related`, never a wildcard |
| Agents | `<repo>/.claude/agents/**/*.md` get the two tool names; agents with no `tools:` key inherit and are left untouched. Global agents are never touched by `install` |

### CLAUDE.md reconcile — what gets touched

| Line matches | Action |
|---|---|
| **denies** semantic search outright (`Grep/Glob are no-ops`, `semantic search is broken`, `never use semble`) | removed **even when the line also scopes the tool** — a denial is false regardless of what else it says |
| puts grep/Bash/rg **first** (`search via the Bash tool`, `grep-first`, `use rg for all searches`) | removed, **unless** the same line scopes the tool (see the row below) |
| a search-titled heading the removal leaves empty | removed with it |
| merely mentions a search tool | reported and left untouched |
| scopes the tool to exact identifiers / regexes / paths / exhaustive enumeration (the skill's own correct guidance) | never touched, not even reported — this exemption shields the **first**-tier match only, never a denial |

Removal is whole lines only, echoed verbatim in the report, and the whole file is backed up to a timestamped `.bak` first.

An A/B on the hypothesis that a contradicting CLAUDE.md line suppresses semble adoption came back negative: with the contradicting directive present, 5 semble calls / 14 searches = 36%; with it removed, 4/18 = 22%; Fisher exact two-sided p = 0.45, n = 32, and the "clean" arm was nominally worse. The scan is kept anyway — the line is worth removing because it is false, not because removing it converts anyone.

### Hooks — measured evidence

| Finding | Number |
|---|---|
| Reminder injection cost | 36 tokens, was 65 (42 while the index is cold) |
| `SubagentStart` delivery | 8/8 with the registration installed, **0/6** with it removed — a negative control; 36/36 over 6 agent types in a 525-transcript corpus |
| Gate replay, 2543 recorded calls | old 230 eligible / 32 fired; 5.2.3 1024 / 204; current 14 / 14 |
| Gate precision, 80 hand-labelled commands | of 40 the 5.2.3 gate fired on and the new one suppresses, 37 are exact/exhaustive lookups where grep is right, 1 behavioural, 2 ambiguous; of 40 both suppress, zero behavioural |
| Reminder fire rate, 7 sessions / 59 Bash calls | 0 nudges - conversion after a nudge is undefined (0/0); no control figure exists; rule of three puts the 95% upper bound on the fire rate over that traffic mix at 5.1% |

The 59 is every **Bash** call, not 59 searches the gate judged: the matcher is `Bash|Grep`, so a row is written per Bash call whatever it contains. 13 held no search binary, 13 were `find`, 33 were `rg`/`grep` on a single-token identifier, and **zero** were the multi-word behaviour phrase the gate fires on. "0 fires" is therefore evidence neither of a broken hook nor of a valuable one.

Delivery inside a subagent is **proven**, not merely assumed: in-band capture joined by `tool_use_id`, telemetry `agent:"sub"`; the 92-attachments-across-852-files figure is a storage gap, not a delivery gap. What `SubagentStart` is proven to do is **deliver its text**, 8/8 installed against 0/6 removed. It is not proven to change tool choice: every spawn prompt in both arms already ordered the subagent to open with semble, first-tool semble was 14/14 either way, and the brief's causal effect is untested. Never report a conversion percentage for the reminder.

Two figures published in v5.3.0 are **withdrawn**: a control conversion of "8/59" (unreproducible — the scoring script's own rule yields 0/32 and 0/27, and the design has no arm without a semble instruction), and "90.6% of search traffic is subagent traffic" (computed from `agentOf()` in `semble-stats.mjs`, which mislabels the main thread of an `--agent` session as `sub`; there is no corrected percentage).

### The state file and its phases

`.claude/semble/state.json` is what `semble-session.mjs` and `semble-prefetch.mjs` read, so its `phase` is a claim about reality and is guarded by a transition machine:

```
absent -> prereq_ready -> awaiting_reload -> verifying -> ready
                                   \                        |
                                    +-> disabled <----------+
```

`ready` is reachable **only** from `verifying` — there is no `awaiting_reload -> ready` shortcut. `resume` therefore enters `verifying` before it verifies anything and writes `ready` only after, so a run that dies half-way leaves an honest record rather than a phase that claims a verification nobody performed. Re-registration (`install` / `upgrade`) parks the phase back at `awaiting_reload` from any state where a setup exists, and `disable` reaches `disabled` from any of them too; only `absent -> disabled` stays illegal.

Fields the installer owns — `resumePrompt`, `cacheRoot`, `repoHash`, `approvedVersion`, `projectRoot`, `schema`, plus the artifact metadata `version` / `generated_by` / `last_updated` — are recomputed on **every** write, not just when the file is created, so a state file written by an older version stops advertising stale values. Fields you and the run own — `enabled`, `phase`, `completed`, `notes` — are never reset as a side effect.

Installation is **uvx-ephemeral** by default: no `semble` on `PATH`. That is deliberate — any unrecognized argv makes `semble` start a *blocking* stdio server, so a stray bare invocation would hang. `uv tool install` is opt-in.

### Prerequisites — one required, one optional

| Package | Gate | If you decline or it is impossible |
|---------|------|------------------------------------|
| `uv` / `uvx` (`brew install uv`) | **required** — `install` asks first and stops if you decline; manual fallback `curl -LsSf https://astral.sh/uv/install.sh \| sh` is printed, never run | `install` cannot continue |
| `coreutils` (`brew install coreutils` -> `gtimeout`) | **optional** — offered only when no `timeout`/`gtimeout` exists and `brew` does | nothing breaks: the scripts' `sc_timeout` falls back to a pure-bash watchdog, so every shell-out stays time-bounded either way |

`coreutils` is never a hard requirement: no brew, a failed install, `SEMBLE_NO_NETWORK=1` or a declined offer all leave the run at exit `0` with a note. `install` never blocks on it.

## Limits — read before trusting it

| Fact | Consequence |
|------|-------------|
| **No watcher, no daemon.** semble 0.5.5 has no background thread or service | Nothing is ever started or stopped. Staleness is re-checked inside each tool call, behind a `3x last-build-duration` cooldown |
| The embedding model is pre-loaded at server start and calls block until it is ready | The **first query on a cold cache downloads hundreds of MB and is slow** — allow up to 600 s. Offline + cold HuggingFace cache = every call errors |
| The corpus is exactly `SEMBLE_CONTENT_ARGS` | `.json`/`.json5`/`.csv`/`.tsv`/`.psv` are excluded from **every** content type — unreachable even with `--content all` — and `.mdx`/`.txt` belong to no bucket at all. Use `rg` for those. The per-suffix table is `references/language-coverage.md` |
| Negation bypass — Semble 0.5.4 measurement, 2026-08-08; behavior reverified on 0.5.5 | A `!` un-ignore pattern ending in a file extension skips the extension filter, so a negated `.json`/`.png` lands in the index at any `--content` setting. In the historical measurement, one lockfile contributed 5.9% and decoded PNGs contributed 143 chunks; those counts were not rerun on 0.5.5. `.sembleignore` re-ignores win, because its lines are concatenated after `.gitignore`'s and the last match decides |
| `config` value — Semble 0.5.4 measurement, 2026-08-08 | The historical corpus contained 53 config chunks, 0.57% of the total: all six `.github/workflows/*.yml` and four `docker-compose*.yml`. These were the whole CI/CD surface and the only reachable answers to the deployment questions; the counts were not rerun on 0.5.5 |
| Retrieval split — Semble 0.5.4 measurement, 2026-08-08; 16 questions | Behaviour and vocabulary-mismatch: semble won 8 of 9. Exhaustive enumeration: semble lost 2 of 5, and `hooks.json` questions were unanswerable because `.json` was unreachable. This benchmark was not rerun on 0.5.5 |
| 0.5.5 keeps exact content selections side by side | Under one hashed repository directory, the registered combined corpus is `index-code-config-docs`, code-only is `index`, and explicit narrower `docs` or `config` searches use sibling variants. `content=all` resolves the same `code docs config` set and reuses `index-code-config-docs`; the variants do not evict one another |
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
| `purge` | removed | removed | removed | shared root removed | confirmed |

`purge` needs a typed confirmation naming every directory it deletes. `disable` is the reversible alternative: nothing is deleted, the hooks simply go quiet.

Historical cleanup is deliberately narrower than current cache removal. Pre-0.5.5 installs could leave an unused `semble-docs` directory. `purge` removes it only when it is a real directory whose sole entry is the expected `RESERVED-FOR-DOCS.txt` ownership marker. Empty directories, symlinks, repurposed directories and directories with any additional content are preserved.

## Files

| Path | What |
|------|------|
| `SKILL.md` | the router: status first, mode selection, delegation |
| `scripts/semble-status.sh` | read-only full report (`--json`, `--section`, `--strict`) |
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
| `assets/INSTALL.md` | the runbook for the guidance/hooks install |

Every script takes `--json` and uses the same exit codes: `0` ok · `1` hard failure (nothing written) · `2` bad usage · `3` precondition unmet · `4` confirmation required (nothing written).

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| The tools do not appear after `install` | the MCP server only loads in a **new** session | reload Claude Code, then `/brewcode:semble-setup resume` |
| First search hangs for minutes | the embedding model is downloading | wait (up to 600 s); it happens once per model |
| Every call errors offline | model pre-load cannot reach HuggingFace | run once online, or set `SEMBLE_NO_NETWORK=1` to skip warm steps |
| `search` rejects the call | `repo` is missing — it is required | pass the absolute project root |
| Prefetch stays silent although a bare `index` exists | it may be a pre-0.5.5 combined corpus, not the current exact variant | run `resume` to build the current `index-code-config-docs`, or use confirmed `reindex` for a staged replacement |
| A `.json` / `.csv` / `.mdx` / `.txt` file is never found | not in this corpus by design (`.html`/`.htm` **is** indexed, in the docs bucket) | use `rg` |
| Status says `partial` | half-wired — `hooks N/6 wired` counts only entries that are present **and** field-conforming; a hook whose `timeout`, `args` or `command` drifted is counted in `driftedCount`, not in `wiredCount` | `/brewcode:semble-setup install` re-runs idempotently and repairs each drifted field in place |
| `hooks 6/6 wired` but a hook never fires | a duplicate entry for the same event/matcher/script — reported as `duplicateCount` with a `drift[]` row, never as `wired` | re-run `install`; the merge collapses duplicates |
| `malformed` | `~/.claude.json` or `.mcp.json` is not valid JSON | the skill refuses to write; fix that file by hand, then re-run |

## Documentation

Full docs: [semble-setup](https://doc-claude.brewcode.app/brewcode/skills/semble-setup/)

## License

MIT — see `LICENSE`.
