# MCP registration and cache layout

Ground truth for `semble_code`: registration, detection, exact 0.5.5 cache variants, and guarded rebuild/removal. Owners: `scripts/semble-mcp.sh`, `scripts/semble-cache.sh`, `scripts/semble-project.sh`, `scripts/semble-remove.sh`, and `scripts/lib/semble-common.sh`.

Verified against the `semble` 0.5.5 wheel. Claude Code `alwaysLoad` behavior and `add-json` limitation were verified on 2.1.226.

## Approved registration

| Item | Contract |
|---|---|
| Server | `semble_code`, stdio |
| Package | `'semble[mcp]==0.5.5'`; exact pin, single-quoted in shell because zsh globs brackets |
| Scope | `user`; Claude CLI defaults to `local`, so `-s user` is mandatory |
| Default corpus | `--content code docs config`, in that argv order; `docs` makes Markdown searchable |
| Cache | one absolute `SEMBLE_CACHE_LOCATION`: macOS `$HOME/Library/Caches/semble-code`; Linux `${XDG_CACHE_HOME:-$HOME/.cache}/semble-code` |
| Visibility | top-level `alwaysLoad: true`; only `add-json` can preserve it |
| Tools | `mcp__semble_code__search`, `mcp__semble_code__find_related`; never wildcard permissions |

The `[mcp]` package extra is required; the CLI exits non-zero without it.

Primary registration:

```bash
claude mcp add-json semble_code -s user '{"type":"stdio","command":"uvx","args":["--from","semble[mcp]==0.5.5","semble","--content","code","docs","config"],"env":{"SEMBLE_CACHE_LOCATION":"<ABSOLUTE SHARED ROOT>"},"alwaysLoad":true}'
```

Degraded fallback when `add-json` fails:

```bash
claude mcp add semble_code -s user \
  -e SEMBLE_CACHE_LOCATION="$HOME/Library/Caches/semble-code" \
  -- uvx --from 'semble[mcp]==0.5.5' semble --content code docs config
```

The fallback cannot set `alwaysLoad`; detection therefore returns `stale_args` and the next repair must use `add-json`. `add-json` does not overwrite an existing entry, so repair removes every `semble_code` scope before re-adding user scope. Removal is `claude mcp remove semble_code -s user`.

This is a local stdio child and has no server authentication secret. The registration stores only the absolute cache path. Never copy credentials, auth state, histories, or tokens into MCP config or setup state.

## Tool schema

Both tools require `repo`: an absolute local root or explicit `http(s)` Git URL. It is never inferred.

| Parameter | Contract |
|---|---|
| `content` | Optional `code | docs | config | all`; omitted uses registered `code docs config`. `all` currently resolves to those same three types |
| `top_k` | Default `5`, minimum `1` |
| `max_snippet_lines` | Default `10`; `0` returns locations only; `None` returns the full chunk |
| Results | `file_path`, `start_line`, `end_line`, `score`, optional result `content`; there is no result field named `line` |

Each per-call content selection addresses its own on-disk and in-memory variant. A `docs` query does not evict `code`, and omitting `content` returns to the registered combined variant.

## Configuration authority and detection

| Scope | Storage |
|---|---|
| user | `~/.claude.json` → `.mcpServers.semble_code` |
| local | `~/.claude.json` → `.projects["<absolute root>"].mcpServers.semble_code` |
| project | `<root>/.mcp.json` → `.mcpServers.semble_code`, plus the project's enabled/disabled MCP lists |

`sc_mcp_dump` reads those files; `claude mcp list/get` take no diagnostic flags, expose no JSON mode, and are not configuration authority. `get` contributes only a bounded connectivity exit status. Direct `~/.claude.json` editing is recovery-only: malformed/duplicate repair, explicit confirmation, backup first, Node JSON rewrite, then re-read verification.

`sc_mcp_state` precedence:

`malformed > duplicate > wrong_scope > stale_args > upstream_unpinned > correct > absent`

| State | Meaning |
|---|---|
| `correct` | One user entry; no upstream `semble` conflict; `uvx`; exact 0.5.5 args/default corpus/shared root; `type` absent or `stdio`; `alwaysLoad === true` |
| `stale_args` | Pin, command, env, type, content argv, or `alwaysLoad` differs |
| `wrong_scope` | One local/project entry; scope precedence wins even if its args also drift |
| `duplicate` | More than one `semble_code` scope; ask which to keep and back up affected config files |
| `upstream_unpinned` | A server literally named `semble` exists, with or without `semble_code`; it uses a floating package, default code-only corpus, and `mcp__semble__*` names; report, never auto-remove |
| `malformed` | A config file is unparseable; stop and write nothing |
| `absent` | No `semble_code` entry |

`projectEnabled === false` is a separate disabled-at-project signal. A newly registered server needs a fresh Claude Code session.

Never run bare `semble`, an unknown argument, or `semble install/uninstall`: unrecognized argv starts the blocking MCP server, while upstream install writes a floating server named `semble`. Safe version probing uses `--version` only for pins `>=0.5.4`; older pins use `--help`. The server has no watcher/daemon; local staleness is checked during calls behind an upstream cooldown, and the embedding model is loaded at startup. Offline calls fail when that model is absent from the local Hugging Face cache.

Project permissions contain exactly:

```json
{"permissions":{"allow":["mcp__semble_code__search","mcp__semble_code__find_related"]}}
```

## One shared cache, exact variants

There is one current root and no reserved docs root.

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

Semble 0.5.5 names an exact variant as follows:

1. deduplicate and sort the selected content values;
2. join them with `-`;
3. use `index` only when the scope is exactly `code`; otherwise use `index-<scope>`.

`SEMBLE_CONTENT_ARGS="code docs config"` is the default-corpus source of truth. `sc_content_scope`, `sc_index_leaf`, the MCP registration, CLI warm/smoke, prefetch hook, and staged reindex must agree. Do not hardcode a second default corpus.

Every variant contains `chunks.json`, `metadata.json`, `bm25_index/`, and `semantic_index/`. Metadata includes `root_path`, `time`, `model_path`, `content_type`, `chunk_size`, `cache_version`, and the file manifest. Reuse requires matching model, content set, chunk size, cache version, and current walked files.

### Historical layouts

- Before 0.5.5, every content selection used bare `index`. Alternating content sets could invalidate and rebuild the same directory. The current reader never accepts a combined `code docs config` bare index as the 0.5.5 combined variant.
- Older Brewcode installs also created an unused marker-only `<cache base>/semble-docs`. It is not a current cache surface. Full purge removes it only when the path is a real non-symlink directory whose sole entry is a regular `RESERVED-FOR-DOCS.txt`; empty, repurposed, unreadable, or symlink-shaped paths survive.

Historical isolated measurement on the old single-index layout: alternating `code config` and default `code` rebuilt in 1.99/1.78/1.91/1.95 seconds; one shared `code docs config` corpus was 5.43 seconds cold and 0.74/0.81/0.74 seconds warm. These numbers explain the old failure mode; 0.5.5 variants remove that collision.

## Cache commands

```text
semble-cache.sh info       [--repo PATH] [--json]
semble-cache.sh resolve    [--repo PATH] [--json]
semble-cache.sh list       [--json]
semble-cache.sh purge-repo [--repo PATH] --yes [--json]
semble-cache.sh purge-root --yes [--json]
```

`reserve-docs` and `--which docs` no longer exist. `--repo` defaults to the resolved project root.

### Read operations

- `resolve` returns the shared root, repo hash/dir, selected `indexLeaf`/`indexDir`, and migration-only `legacyIndexDir`.
- `info` inspects every `index`/`index-*` sibling and returns `repoPresent`, selected-variant `present`, `variants[]`, selected metadata, `legacyPresent`, whole-repo size/count, staleness, and variant names for `otherRepos`.
- `list` returns every 64-hex repo entry and all variants beneath it; it never collapses or deletes siblings.

Representative `info --json` shape:

```json
{
  "codeRoot": "<shared root>",
  "repoHash": "<64 hex>",
  "repoDir": "<shared root>/<hash>",
  "repoPresent": true,
  "indexLeaf": "index-code-config-docs",
  "indexDir": "<repo dir>/index-code-config-docs",
  "legacyIndexDir": "<repo dir>/index",
  "legacyPresent": false,
  "present": true,
  "variants": [{"name":"index-code-config-docs","desired":true,"legacyCombined":false,"state":"fresh"}],
  "metadata": {},
  "staleness": "fresh",
  "otherRepos": []
}
```

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
- `purge-root` deletes the entire absolute shared root—every repo and variant—only when its leaf is exactly `semble-code` and `--yes` is present.
- `semble clear index` is not a per-repo alternative: upstream scans every `*/index*` and removes their repo directories. `clear orphans`, introduced in 0.5.4, is also root-wide and only removes entries whose recorded local root no longer exists.

Dry run prints `DRY <command>` and mutates nothing. Unknown `--which` values, including the removed `docs` selector, fail before deletion.

## Selective staged reindex

`semble-project.sh reindex` is the safe one-variant rebuild:

1. Resolve `<shared root>/<hash>/<selected leaf>` and require `--yes`.
2. Build the same content set under `<shared root>/.staging.<pid>/<hash>/<selected leaf>`.
3. Require a real successful search and the staged selected-variant directory; skipped, empty, failed, or missing staging preserves live state.
4. Move only the live selected variant aside inside staging, move the verified replacement into place, and restore the previous variant when the swap fails.
5. Preserve every sibling variant, including a valid code-only bare `index`.
6. Remove bare `index` only when its metadata proves it is the pre-0.5.5 combined `code docs config` cache and the new combined variant is already live.
7. Remove staging, record `warm`, and advance state to ready.

Never rebuild by deleting the hashed repo directory first. The preview names `indexDir`, `wouldDelete`, whether `legacyCombined` was verified, and the staged search command.

## Script and state safety

All JSON modes emit one JSON object. Common exits: `0` success, `1` guarded failure, `2` usage, `3` precondition, `4` confirmation required. Malformed JSON/state stops before writes; every configuration mutation is backed up and re-read.

State lives at `<project>/.claude/semble/state.json` (schema 1). `sc_state_patch` preserves unknown keys, union-merges `completed`, refreshes plugin artifact metadata, and verifies the written keys. Store no credentials, session IDs, transcripts, or tool output there. Legal phase flow remains:

```text
absent -> prereq_ready | error
prereq_ready -> awaiting_reload | error
awaiting_reload -> verifying | prereq_ready | error
verifying -> ready | error
ready -> verifying | disabled | awaiting_reload
disabled -> verifying
error -> verifying | prereq_ready
```

Identity transitions are idempotent. Forward closeout phases can self-heal from absent by creating `prereq_ready` and walking the same graph; absent cannot self-heal to disabled. Illegal transitions write nothing.
