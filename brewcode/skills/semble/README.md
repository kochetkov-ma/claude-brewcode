# Semble

Lifecycle skill for **`semble_code`** — a semantic code-search MCP server ([semble](https://pypi.org/project/semble/), pinned to `0.5.2`) wired into any project: install, audit, configure, repair, update, enable, disable, reindex, remove.

One command covers the whole lifecycle. It always reports the current state **before** it changes anything, and every mutation is delegated to a script — the skill itself only routes.

```
/brewcode:semble                          # status (default, no args, read-only)
/brewcode:semble setup                    # prereqs -> register MCP -> reload checkpoint
/brewcode:semble resume                   # after the reload: verify + wire guidance
/brewcode:semble disable                  # go silent, delete nothing
/brewcode:semble переиндексируй            # free-text intent works (RU + EN)
/brewcode:semble снеси всё                 # -> purge, with a typed confirmation
```

## What it gives you

Two MCP tools, once wired:

| Tool | Purpose |
|------|---------|
| `mcp__semble_code__search` | find code by intent / behavior / name |
| `mcp__semble_code__find_related` | neighbors of a known location, after a useful seed |

Both take a **required `repo`** parameter — the absolute project root or an explicit `https://` git URL. It is never inferred. Results carry `file_path`, `start_line`, `end_line`, `score` and optional `content`; there is **no `line` field**. Defaults: `top_k=5`, `max_snippet_lines=10`.

## Modes

Free text in Russian or English routes to one mode. The full table and the resolution algorithm live in `references/intent-routing.md`.

| Mode | Effect | Mutates |
|------|--------|---------|
| `status` | full report: prereqs, MCP, cache, guidance, agents, coverage, state | no |
| `setup` | install `uv` (and, if you accept, `coreutils`), register `semble_code` at user scope, checkpoint for reload | yes |
| `resume` | after the reload: smoke query, rule + hooks + permissions, agent migration | yes |
| `enable` | back on: verify, warm, `phase=ready` | yes |
| `disable` | `enabled=false` — hooks go silent, nothing is deleted | yes |
| `reindex` | delete exactly this repo's cache dir (confirmed), then warm | yes |
| `optimize` | read-only audit fan-out with concrete recommendations | no |
| `update` | compare the recorded pin with `0.5.2`, re-register if different | yes |
| `remove` | four flavours: `integration` / `mcp` / `cli` / `purge` | yes |
| `purge` | everything, incl. the code cache root — typed confirmation required | yes |

**Empty input is always `status`** — read-only, no questions, no mutation.

## What `setup` installs, and where

| Surface | Location |
|---------|----------|
| MCP server | `~/.claude.json` `.mcpServers.semble_code`, **user scope** (`-s user` is mandatory — the CLI default is `local`) |
| Command | `uvx --from 'semble[mcp]==0.5.2' semble --content code config` |
| Cache root | macOS `~/Library/Caches/semble-code` · Linux `${XDG_CACHE_HOME:-~/.cache}/semble-code` |
| Reserved docs root | same path with a `semble-docs` leaf — created empty, never registered |
| State | `<repo>/.claude/semble/state.json` |
| Rule | `<repo>/.claude/rules/semble-first.md` |
| CLAUDE.md | a marked `<!-- BEGIN brewcode:semble -->` block |
| Hooks | `<repo>/.claude/hooks/semble-session.mjs` (SessionStart) + `semble-reminder.mjs` (PreToolUse, advisory only) |
| Permissions | `<repo>/.claude/settings.json` -> exactly `mcp__semble_code__search` and `mcp__semble_code__find_related`, never a wildcard |
| Agents | `<repo>/.claude/agents/**/*.md` get the two tool names; agents with no `tools:` key inherit and are left untouched. Global agents are never touched by `setup` |

Installation is **uvx-ephemeral** by default: no `semble` on `PATH`. That is deliberate — any unrecognized argv makes `semble` start a *blocking* stdio server, so a stray bare invocation would hang. `uv tool install` is opt-in.

### Prerequisites — one required, one optional

| Package | Gate | If you decline or it is impossible |
|---------|------|------------------------------------|
| `uv` / `uvx` (`brew install uv`) | **required** — setup asks first and stops if you decline; manual fallback `curl -LsSf https://astral.sh/uv/install.sh \| sh` is printed, never run | setup cannot continue |
| `coreutils` (`brew install coreutils` -> `gtimeout`) | **optional** — offered only when no `timeout`/`gtimeout` exists and `brew` does | nothing breaks: the scripts' `sc_timeout` falls back to a pure-bash watchdog, so every shell-out stays time-bounded either way |

`coreutils` is never a hard requirement: no brew, a failed install, `SEMBLE_NO_NETWORK=1` or a declined offer all leave the run at exit `0` with a note. Setup never blocks on it.

## Limits — read before trusting it

| Fact | Consequence |
|------|-------------|
| **No watcher, no daemon.** semble 0.5.2 has no background thread or service (its README says otherwise; the code does not) | Nothing is ever started or stopped. Staleness is re-checked inside each tool call, behind a `3x last-build-duration` cooldown |
| The embedding model is pre-loaded at server start and calls block until it is ready | The **first query on a cold cache downloads hundreds of MB and is slow** — allow up to 600 s. Offline + cold HuggingFace cache = every call errors |
| Corpus is `code config` | `.html`/`.htm` are **not** indexed (they are semble's *docs* bucket), and `.json`/`.json5`/`.csv`/`.tsv`/`.psv` are excluded from **every** content type — unreachable even with `--content all`. Use `rg` for those |
| Adding docs to this corpus is not a fix | The per-repo cache dir is `sha256(repo path)` and does not encode the content type, so a docs index and a code index collide on one directory and invalidate each other on every call. Hence the separately reserved docs root |
| A newly registered MCP server is invisible to the running session | `setup` stops at a reload checkpoint; `/brewcode:semble resume` finishes the job in the new session |
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
| `scripts/semble-guidance.sh` | rule, CLAUDE.md block, hooks, settings + permissions merge |
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
| The tools do not appear after `setup` | the MCP server only loads in a **new** session | reload Claude Code, then `/brewcode:semble resume` |
| First search hangs for minutes | the embedding model is downloading | wait (up to 600 s); it happens once per model |
| Every call errors offline | model pre-load cannot reach HuggingFace | run once online, or set `SEMBLE_NO_NETWORK=1` to skip warm steps |
| `search` rejects the call | `repo` is missing — it is required | pass the absolute project root |
| A `.html` / `.json` file is never found | not in this corpus by design | use `rg` |
| Status says `partial` | half-wired (e.g. hooks 1/3) | `/brewcode:semble setup` re-runs idempotently |
| `malformed` | `~/.claude.json` or `.mcp.json` is not valid JSON | the skill refuses to write; fix that file by hand, then re-run |

## License

MIT — see `LICENSE`.
