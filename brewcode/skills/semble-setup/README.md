# Semble

Lifecycle skill for **`semble_code`** — a semantic code-search MCP server ([semble](https://pypi.org/project/semble/), pinned to `0.5.4`) wired into any project: install, audit, configure, repair, upgrade, enable, disable, reindex, uninstall.

One command covers the whole lifecycle. It always reports the current state **before** it changes anything, and every mutation is delegated to a script — the skill itself only routes.

```
/brewcode:semble-setup                          # status (default, no args, read-only)
/brewcode:semble-setup install                  # prereqs -> register MCP -> reload checkpoint
/brewcode:semble-setup resume                   # after the reload: verify + wire guidance
/brewcode:semble-setup disable                  # go silent, delete nothing
/brewcode:semble-setup переиндексируй            # free-text intent works (RU + EN)
/brewcode:semble-setup снеси всё                 # -> purge, with a typed confirmation
```

## What it gives you

Two MCP tools, once wired:

| Tool | Purpose |
|------|---------|
| `mcp__semble_code__search` | find code by intent / behavior / name |
| `mcp__semble_code__find_related` | neighbors of a known location, after a useful seed |

Both take a **required `repo`** parameter — the absolute project root or an explicit `https://` git URL. It is never inferred. Results carry `file_path`, `start_line`, `end_line`, `score` and optional `content`; there is **no `line` field**. Defaults: `top_k=5`, `max_snippet_lines=10`.

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
| `upgrade` | compare the recorded pin with `0.5.4`, re-register if different | yes |
| `enable` | back on: verify, warm, `phase=ready` | yes |
| `disable` | `enabled=false` — hooks go silent, nothing is deleted | yes |
| `uninstall` | four flavours: `integration` / `mcp` / `cli` / `purge` | yes |
| `purge` | everything, incl. the code cache root — typed confirmation required | yes |

Plus three extras specific to a search index:

| Mode | Effect | Mutates |
|------|--------|---------|
| `reindex` | delete exactly this repo's cache dir (confirmed), then warm | yes |
| `optimize` | read-only audit fan-out with concrete recommendations | no |
| `resume` | after the reload checkpoint: the smoke query that needs a live server, then a self-repairing re-run of the rule + hooks + permissions + agent migration, then `phase=ready` | yes |

`install` no longer leaves the hooks hostage to `resume`: everything that does not need a live MCP server is wired by `install` itself. `resume` stays fully idempotent — its merge is field-level and self-repairing, so running it after `install` re-checks the wiring instead of duplicating it. Only the smoke query and the final `ready` phase wait for the new session.

**Empty input is always `status`** — read-only, no questions, no mutation. This is the one setup skill that does not fall back to `install` when nothing is installed, because `install` reaches machine-level package management.

## What `install` installs, and where

| Surface | Location |
|---------|----------|
| MCP server | `~/.claude.json` `.mcpServers.semble_code`, **user scope** (`-s user` is mandatory — the CLI default is `local`), with `"alwaysLoad": true` so the two tools are never deferred behind `ToolSearch`. Only `claude mcp add-json` can write that key, so that is the form the skill uses |
| Command | `uvx --from 'semble[mcp]==0.5.4' semble --content <SEMBLE_CONTENT_ARGS>` — the content set lives in `scripts/lib/semble-common.sh` as `SEMBLE_CONTENT_ARGS` and is deliberately not repeated here. Every consumer must pass exactly that set: semble keys its cache directory by project path alone but rejects a cached index whose stored content set differs, so two consumers with different sets evict each other on every call |
| Cache root | macOS `~/Library/Caches/semble-code` · Linux `${XDG_CACHE_HOME:-~/.cache}/semble-code` |
| Reserved docs root | same path with a `semble-docs` leaf — created empty, never registered |
| State | `<repo>/.claude/semble/state.json` |
| Rule | `<repo>/.claude/rules/semble-first.md` |
| Ignore file | `<repo>/.sembleignore` — read per-directory by `semble/index/file_walker.py:_load_ignore_for_dir` (gitignore syntax via `pathspec`; `core.excludesFile` is NOT honoured). Keeps generated/vendored trees (`.claude/tmp/`, `.claude/reports/`, build output, minified bundles) out of the corpus; deliberately never excludes `.claude/{skills,agents,rules,commands,hooks}/`. Same managed-file policy as the rule: user edits are reported, not clobbered, and `--force` backs up first |
| CLAUDE.md | a marked `<!-- BEGIN brewcode:semble -->` block — **plus a reconcile of the competing doctrine around it.** `install --part claudemd` scans the root CLAUDE.md **outside** the semble markers, backs the whole file up to a timestamped `.bak` first, and reconciles it to one doctrine. Kept on honest ground even though the A/B below found no adoption effect: a false statement in CLAUDE.md is worth removing because it is false, not because removing it converts anyone |
| Hooks | `<repo>/.claude/hooks/semble-session.mjs` (SessionStart — state and reload messaging) + `semble-prefetch.mjs` (UserPromptSubmit — runs one semble search on the prompt and injects the top-3 candidate **paths**, never snippets) + `semble-stats.mjs` (PostToolUse + PostToolUseFailure — pure observer, JSONL telemetry) + `semble-reminder.mjs` (PreToolUse `Bash\|Grep` — fires on every eligible search, `N = state.reminderEvery`, DEF 1, counter in `.claude/semble/reminder.json` — project-global and persisted across sessions, so at N = 1 it throttles nothing) + `semble-subagent.mjs` (SubagentStart, no matcher, so every agent type). `semble-explore.mjs` is retired for good, superseded by `semble-subagent.mjs`; `install`/`upgrade` deletes that file and replaces its settings row |
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
| Reminder injection cost | 29 tokens, was 65 |
| Search traffic inside a subagent | 90.6% (3084 sub / 321 main) |
| Subagents opening with semble as first tool | 8 of 8 |
| Gate replay, 2543 recorded calls | old 230 eligible / 32 fired; 5.2.3 1024 / 204; current 14 / 14 |
| Gate precision, 80 hand-labelled commands | of 40 the 5.2.3 gate fired on and the new one suppresses, 37 are exact/exhaustive lookups where grep is right, 1 behavioural, 2 ambiguous; of 40 both suppress, zero behavioural |
| Reminder fire rate, 7 sessions / 59 evaluated calls | 0 nudges - conversion after a nudge is undefined (0/0); control conversion 8/59; rule of three puts the 95% upper bound on the fire rate at 5.1% |

Delivery inside a subagent is **proven**, not merely assumed: in-band capture joined by `tool_use_id`, telemetry `agent:"sub"`; the 82-attachments-across-436-files figure is a storage gap, not a delivery gap. The channel that actually works is `SubagentStart` — the routing win comes from the subagent briefing and the auto-loaded `semble-first.md` rule, not from the PreToolUse reminder, which is low-cost insurance against a bad grep. Never report a conversion percentage for the reminder.

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
| **No watcher, no daemon.** semble 0.5.4 has no background thread or service | Nothing is ever started or stopped. Staleness is re-checked inside each tool call, behind a `3x last-build-duration` cooldown |
| The embedding model is pre-loaded at server start and calls block until it is ready | The **first query on a cold cache downloads hundreds of MB and is slow** — allow up to 600 s. Offline + cold HuggingFace cache = every call errors |
| The corpus is exactly `SEMBLE_CONTENT_ARGS` | `.json`/`.json5`/`.csv`/`.tsv`/`.psv` are excluded from **every** content type — unreachable even with `--content all` — and `.mdx`/`.txt` belong to no bucket at all. Use `rg` for those. The per-suffix table is `references/language-coverage.md` |
| One exception, and it is not configurable away | A `!` un-ignore pattern ending in a file extension skips the extension filter, so a negated `.json`/`.png` lands in the index at any `--content` setting — 5.9% of this workspace's index was one such lockfile, plus 143 chunks of decoded PNG. `.sembleignore` re-ignores win, because its lines are concatenated after `.gitignore`'s and the last match decides |
| `--content config` is 0.57% of the corpus and stays | Those 53 chunks are all six `.github/workflows/*.yml` and four `docker-compose*.yml` — the whole CI/CD surface, and the only reachable answer to the deployment questions. It was never what pulled the lockfile in |
| semble wins behaviour, `rg` wins enumeration — measured, 16 questions | Behaviour and vocabulary-mismatch: semble 8 of 9. Exhaustive enumeration: semble lost 2 of 5, and `hooks.json` questions are unanswerable in principle because `.json` is unreachable |
| Adding docs to this corpus is not a fix | The per-repo cache dir is `sha256(repo path)` and does not encode the content type, so a docs index and a code index collide on one directory and invalidate each other on every call. Hence the separately reserved docs root |
| A newly registered MCP server is invisible to the running session | `install` stops at a reload checkpoint; `/brewcode:semble-setup resume` finishes the job in the new session |
| `semble clear index` wipes **every** index under the cache root | There is no per-repo rebuild CLI, so `reindex` deletes exactly one resolved `<code root>/<64-hex>` directory, guarded and confirmed |
| Staleness detection approximates semble's own validation | It is reported as *likely stale* and always offers `reindex` rather than acting by itself |
| An upstream server named `semble` (written by `semble install`) is unpinned and shares a single-corpus cache root | It is detected and reported as a conflict, **never removed automatically** — other tools may depend on it |
| Windows is unsupported | The skill says so and refuses to mutate |

## Removal

| Flavour | Rule / hooks / CLAUDE.md | MCP | Agent frontmatter | Cache | uv tool |
|---------|--------------------------|-----|-------------------|-------|---------|
| `integration` | removed | kept | semble entries removed | kept | kept |
| `mcp` | kept | removed | kept | kept | kept |
| `cli` | kept | kept | kept | kept | `uv tool uninstall semble` |
| `purge` | removed | removed | removed | code root removed | confirmed |

`purge` needs a typed confirmation naming every directory it deletes. `disable` is the reversible alternative: nothing is deleted, the hooks simply go quiet.

## Files

| Path | What |
|------|------|
| `SKILL.md` | the router: status first, mode selection, delegation |
| `scripts/semble-status.sh` | read-only full report (`--json`, `--section`, `--strict`) |
| `scripts/semble-install.sh` | `check` \| `uv` \| `coreutils` \| `semble` \| `all` — `uv` via brew, optional `coreutils`, pin priming through `uvx` |
| `scripts/semble-mcp.sh` | detect / add / repair / remove / checkpoint |
| `scripts/semble-cache.sh` | resolve, inspect, reserve the docs root, guarded purge |
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
| A `.json` / `.csv` / `.mdx` / `.txt` file is never found | not in this corpus by design (`.html`/`.htm` **is** indexed, in the docs bucket) | use `rg` |
| Status says `partial` | half-wired — `hooks N/6 wired` counts only entries that are present **and** field-conforming; a hook whose `timeout`, `args` or `command` drifted is counted in `driftedCount`, not in `wiredCount` | `/brewcode:semble-setup install` re-runs idempotently and repairs each drifted field in place |
| `hooks 6/6 wired` but a hook never fires | a duplicate entry for the same event/matcher/script — reported as `duplicateCount` with a `drift[]` row, never as `wired` | re-run `install`; the merge collapses duplicates |
| `malformed` | `~/.claude.json` or `.mcp.json` is not valid JSON | the skill refuses to write; fix that file by hand, then re-run |

## Documentation

Full docs: [semble-setup](https://doc-claude.brewcode.app/brewcode/skills/semble-setup/)

## License

MIT — see `LICENSE`.
