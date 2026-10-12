# MCP registration and cache layout

`semble_code` registration, detection, cache variants, guarded rebuild/removal. Owners: `scripts/semble-mcp.sh`, `scripts/semble-cache.sh`, `scripts/semble-project.sh`, `scripts/semble-remove.sh`, and `scripts/lib/semble-common.sh`.

Verified against the `semble` 0.6.2 wheel (cache naming and metadata unchanged since 0.5.5) and Claude Code 2.1.296.

## Approved registration

| Item | Contract |
|---|---|
| Server | `semble_code`, stdio |
| Package | `'semble[mcp]==0.6.2'`; exact pin, single-quoted in shell because zsh globs brackets |
| Scope | `user`; Claude CLI defaults to `local`, so `-s user` is mandatory |
| Default corpus | `--content code docs config`, in that argv order; `docs` makes Markdown searchable |
| Cache | one absolute `SEMBLE_CACHE_LOCATION`: macOS `$HOME/Library/Caches/semble-code`; Linux `${XDG_CACHE_HOME:-$HOME/.cache}/semble-code` |
| Visibility | top-level `alwaysLoad: true`; only `add-json` can set it (`claude mcp add` has no flag for it) |
| Tools | `mcp__semble_code__search`, `mcp__semble_code__find_related`; never wildcard permissions |

The `[mcp]` extra is required: without it the CLI exits non-zero.

Primary registration:

```bash
claude mcp add-json semble_code -s user '{"type":"stdio","command":"uvx","args":["--from","semble[mcp]==0.6.2","semble","--content","code","docs","config"],"env":{"SEMBLE_CACHE_LOCATION":"<ABSOLUTE SHARED ROOT>"},"alwaysLoad":true}'
```

Degraded fallback when `add-json` fails:

```bash
claude mcp add semble_code -s user \
  -e SEMBLE_CACHE_LOCATION="$HOME/Library/Caches/semble-code" \
  -- uvx --from 'semble[mcp]==0.6.2' semble --content code docs config
```

The fallback cannot set `alwaysLoad`; detection therefore returns `stale_args` and the next repair must use `add-json`. `add-json` does not overwrite an existing entry: approved repair removes `semble_code` from EVERY detected scope (`claude mcp remove semble_code -s <scope>`), then re-adds user scope. `-s user` alone removes only the user entry.

A local stdio child has no auth secret; the registration stores only the absolute cache path. Never copy credentials, auth state, histories, or tokens into MCP config or setup state.

## Tool schema

Both tools require `repo`, never inferred: an absolute local root or explicit `http(s)` Git URL.

| Parameter | Contract |
|---|---|
| `content` | Optional `code | docs | config | all`; omitted uses registered `code docs config`. `all` currently resolves to those same three types |
| `top_k` | Default `5`, minimum `1` |
| `max_snippet_lines` | Default `10`; `0` returns locations only; `None` returns the full chunk |
| Results | `file_path`, `start_line`, `end_line`, `score`, optional result `content`; no result field named `line` |

Each per-call content selection addresses its own on-disk and in-memory variant: a `docs` query does not evict `code`; omitting `content` returns to the registered combined variant.

## Configuration authority and detection

| Scope | Storage |
|---|---|
| user | active config file → `.mcpServers.semble_code` |
| local | active config file → `.projects["<absolute root>"].mcpServers.semble_code` |
| project | `<root>/.mcp.json` → `.mcpServers.semble_code`, plus the project's enabled/disabled MCP lists |

Active config file = `$CLAUDE_CONFIG_DIR/.claude.json` when the variable is set (also for `~/.claude`), else `~/.claude.json` (`sc_claude_json`). `sc_mcp_dump` reads those files; `claude mcp list/get` take no diagnostic flags, expose no JSON mode, and are not configuration authority. `get` contributes only a bounded connectivity exit status. Direct config-file editing is recovery-only: malformed/duplicate repair, explicit confirmation, backup first, Node JSON rewrite, then re-read verification.

`sc_mcp_state` precedence:

`malformed > duplicate > wrong_scope > stale_args > upstream_unpinned > correct > absent`

| State | Meaning |
|---|---|
| `correct` | One user entry; no upstream `semble` conflict; `uvx`; exact 0.6.2 args/default corpus/shared root; `type` absent or `stdio`; `alwaysLoad === true` |
| `stale_args` | Pin, command, env, type, content argv, or `alwaysLoad` differs |
| `wrong_scope` | One local/project entry; scope precedence wins even if its args also drift |
| `duplicate` | More than one `semble_code` scope; show ALL removals + the user-scoped replacement, back up affected config files, repair only after approval. Keeping local/project skips repair and reports the gap |
| `upstream_unpinned` | A server literally named `semble` exists, with or without `semble_code`; it uses a floating package, default code-only corpus, and `mcp__semble__*` names; report, never auto-remove |
| `malformed` | A config file is unparseable; stop, write nothing |
| `absent` | No `semble_code` entry |

Version check (`sc_versions_json`, `semble-status.sh --versions [--all-profiles] [--json]`): the pin is declared once in `scripts/lib/semble-common.sh` (`SEMBLE_PIN_VERSION`). It is compared with the user-scope entry of the active config file and, advisory only, with PyPI latest (`SEMBLE_UPSTREAM_TIMEOUT`, default 4 s; offline -> `unknown`).

| Verdict | Meaning | Fix |
|---|---|---|
| `ok` | registered spec = pin, approved form | none |
| `stale` / `ahead` | registered at another exact `X.Y.Z` | `upgrade` |
| `drift` | pin matches, another field differs | `upgrade` |
| `unpinned` | spec carries no exact `X.Y.Z` | `upgrade` |
| `not_registered` | no user-scope `semble_code` there | `install` |
| `malformed` | the file is not valid JSON | by hand |

`projectEnabled === false` is a separate disabled-at-project signal. A newly registered server needs a new session.

Never run bare `semble`, an unknown argument, or `semble install/uninstall`: unrecognized argv starts the blocking MCP server, while upstream install writes a floating server named `semble` (0.6.2 also a `~/.claude/CLAUDE.md` block and `~/.claude/agents/semble-search.md`). Safe version probing uses `--version` only for pins `>=0.5.4`; older pins use `--help`. The server has no watcher/daemon; local staleness is checked during calls behind an upstream cooldown, and the embedding model is loaded at startup. Offline calls fail when that model is absent from the local Hugging Face cache.

Project permissions contain exactly:

```json
{"permissions":{"allow":["mcp__semble_code__search","mcp__semble_code__find_related"]}}
```

## One shared cache, exact variants

```text
<shared root>/
├── savings.jsonl
└── <sha256(source key)>/
    ├── index/                         # code only
    ├── index-config/                  # per-call config
    ├── index-docs/                    # per-call docs
    └── index-code-config-docs/        # registered default and content=all
```

For local repos, the key is SHA-256 of `str(Path(repo).expanduser().resolve())`. `sc_repo_hash` matches it with `cd REPO && pwd -P`; a missing path returns failure instead of inventing a hash.

Semble >= 0.5.5 names an exact variant:

1. deduplicate and sort the selected content values;
2. join them with `-`;
3. use `index` only when the scope is exactly `code`; otherwise use `index-<scope>`.

`SEMBLE_CONTENT_ARGS="code docs config"` is the default-corpus source of truth. `sc_content_scope`, `sc_index_leaf`, the MCP registration, CLI warm/smoke, prefetch hook, and staged reindex must agree. Do not hardcode a second default corpus.

Every variant contains `chunks.json`, `metadata.json`, `bm25_index/`, and `semantic_index/`. Metadata includes `root_path`, `time`, `model_path`, `content_type`, `chunk_size`, `cache_version`, and the file manifest. Reuse requires matching model, content set, chunk size, cache version, and the same walked file set with unchanged `mtime_ns`.

### Legacy layouts still handled

- Before 0.5.5, every content selection used bare `index`. The reader never accepts a combined `code docs config` bare index as the current combined variant.
- Older Brewcode installs created an unused marker-only `<cache base>/semble-docs`. `purge` removes it only when the path is a real non-symlink directory whose sole entry is a regular `RESERVED-FOR-DOCS.txt`; empty, repurposed, unreadable, or symlink-shaped paths survive.

## Cache commands

```text
semble-cache.sh info       [--repo PATH] [--json]
semble-cache.sh resolve    [--repo PATH] [--json]
semble-cache.sh list       [--json]
semble-cache.sh purge-repo [--repo PATH] --yes [--json]
semble-cache.sh purge-root --yes [--json]
```

`--repo` defaults to the resolved project root.

### Read operations

- `resolve` returns the shared root, repo hash/dir, selected `indexLeaf`/`indexDir`, and migration-only `legacyIndexDir`.
- `info` inspects every `index`/`index-*` sibling and returns `codeRoot`, `repoHash`, `repoDir`, `repoPresent`, `indexLeaf`/`indexDir`, `legacyIndexDir`/`legacyPresent`, selected-variant `present`, `variants[]` (`name`, `desired`, `legacyCombined`, `state`), selected `metadata`, whole-repo size/count, `staleness`, and variant names for `otherRepos`.
- `list` returns every 64-hex repo entry and all variants beneath it; it never collapses or deletes siblings.

Selected-variant staleness is evaluated in order:

| Verdict | Condition |
|---|---|
| `absent` | selected variant missing and no verified legacy combined bare index |
| `legacy` | selected variant missing; bare `index` metadata names exactly `code docs config` |
| `incomplete` | any required persistence path missing |
| `unknown` | metadata unreadable or `SEMBLE_NO_NETWORK=1` |
| `mismatch` | selected metadata content set or cache version differs |
| `stale` | recorded source missing or newer than metadata time |
| `fresh` | none of the above |

### Purge operations

- `purge-repo` deletes the exact hashed repo directory and therefore all its variants. Guards require an absolute shared root ending in `semble-code`, a directly nested 64-hex repo leaf, a resolvable repo path, and `--yes`.
- `purge-root` deletes the entire absolute shared root—every repo and variant—only when its leaf is exactly `semble-code` and `--yes` is present. No mode calls it: the root is shared by every project and config dir, so `semble-remove.sh purge` deletes only this project's `<root>/<hash>`, and the root only once empty.
- `semble clear index` is not a per-repo alternative: upstream scans every `*/index*` and removes their repo directories. `clear orphans` is also root-wide and only removes entries whose recorded local root no longer exists.

Dry run prints `DRY <command>` and mutates nothing. Unknown `--which` values (including the removed `docs`) and the removed `reserve-docs` command fail before deletion.

## Selective staged reindex

`semble-project.sh reindex` rebuilds one variant:

1. Resolve `<shared root>/<hash>/<selected leaf>` and require `--yes`.
2. Build the same content set under `<shared root>/.staging.<pid>/<hash>/<selected leaf>`.
3. Require a real successful search and the staged variant directory; otherwise live state is preserved.
4. Move only the live selected variant aside inside staging, move the replacement in; a failed swap restores the previous variant.
5. Preserve every sibling variant, including a valid code-only bare `index`; remove bare `index` only when its metadata proves the pre-0.5.5 combined `code docs config` cache and the new combined variant is live.
6. Remove staging, record `warm`, advance state to ready.

Never rebuild by deleting the hashed repo directory first. Preview names `indexDir`, `wouldDelete`, whether `legacyCombined` was verified, and the staged search command.

## Script and state safety

JSON modes emit one object. Exits: `0` success, `1` guarded failure, `2` usage, `3` precondition, `4` confirmation required. Malformed JSON/state stops before writes; every config mutation is backed up and re-read.

State lives at `<project>/.claude/semble/state.json` (schema 1). `sc_state_patch` preserves unknown keys, union-merges `completed`, refreshes artifact metadata, verifies the written keys. Store no credentials, session IDs, transcripts, or tool output there. Legal phase flow:

```text
absent -> prereq_ready | error
prereq_ready -> awaiting_reload | error
awaiting_reload -> verifying | prereq_ready | error
verifying -> ready | error
ready -> verifying | disabled | awaiting_reload
disabled -> verifying
error -> verifying | prereq_ready
```

Identity transitions are idempotent. Forward closeout phases self-heal from absent via `prereq_ready` along the same graph; absent never self-heals to disabled. Illegal transitions write nothing.
