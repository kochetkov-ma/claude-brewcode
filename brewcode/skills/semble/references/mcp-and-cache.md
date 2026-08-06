# MCP registration and cache layout

> Ground truth for `semble_code`: what gets registered, how it is detected, where the index lives, and how a rebuild is guarded.
> Verified against semble **0.5.2** (sdist) and Claude Code **2.1.223**. Owner: `scripts/semble-mcp.sh`, `scripts/semble-cache.sh`, `scripts/semble-state.sh`.

## Constants

| Item | Value |
|------|-------|
| Server name | `semble_code` |
| Pin | `'semble[mcp]==0.5.2'` — always single-quoted (zsh globs `[ ]`), never floating |
| Scope | `user` (CLI default is `local`, so `-s user` is mandatory) |
| Content set | `--content code config` (two argv tokens, this order) |
| Cache env | `SEMBLE_CACHE_LOCATION` — **must be absolute**, a relative value is silently ignored (`cache.py:60-68`) |
| Code root | macOS `$HOME/Library/Caches/semble-code` · Linux `${XDG_CACHE_HOME:-$HOME/.cache}/semble-code` |
| Docs root | same base, `semble-docs` leaf — **reserved only**, never registered in this skill |
| Tools | `mcp__semble_code__search`, `mcp__semble_code__find_related` — exact names, never a wildcard |
| Tool params | `query` (or `file`+`line`) **and a required `repo`**: absolute local path or `http(s)` git URL |
| Result fields | `file_path`, `start_line`, `end_line`, `score`, optional `content` — there is no `line` |

The `[mcp]` extra is not optional: `cli.py:78-80` exits 1 without it.

## Exact commands

Primary — what `sc_mcp_add_cmd` prints and `semble-mcp.sh add` runs:

```bash
claude mcp add semble_code -s user \
  -e SEMBLE_CACHE_LOCATION="$HOME/Library/Caches/semble-code" \
  -- uvx --from 'semble[mcp]==0.5.2' semble --content code config
```

Fallback, used when `add` exits non-zero or when `type`/`env` must be byte-exact:

```bash
claude mcp add-json semble_code -s user '{"type":"stdio","command":"uvx","args":["--from","semble[mcp]==0.5.2","semble","--content","code","config"],"env":{"SEMBLE_CACHE_LOCATION":"<ABSOLUTE CODE ROOT>"}}'
```

Removal: `claude mcp remove semble_code -s user`.

Non-negotiable notes:

- `claude mcp list` / `get` take **no flags and have no `--json`**. Configuration truth is read from `~/.claude.json` and `<root>/.mcp.json` by `sc_mcp_dump`; `get` contributes its **exit status only**, as the `connectivity` signal (`unknown | connected | failed`).
- Direct `~/.claude.json` editing is a recovery-only path: only for `malformed`/`duplicate`, only after `sc_backup`, only via `node -e`, only with the user's confirmation. `~/.claude/*` is harness-protected — user-scope mutation is Bash-only.
- Never run bare `semble` or `semble <unknown-arg>`: any unrecognised argv starts a **blocking** MCP stdio server (`cli.py:63-68`). Safe probes: `--help`, `search`, `find-related`, `clear`, `savings`.
- Never run `semble install` / `semble uninstall` — it writes an unpinned server named `semble` into `~/.claude.json` (`installer/agents.py:28-32`). We only detect it.
- **There is no watcher and no daemon** (README's claim is false; `mcp.py:29,220-240`). Staleness is re-checked inside each tool call behind a `3 x last-build-duration` cooldown. Nothing here starts, stops, or reports a background process.
- The embedding model is pre-loaded at server startup and tool calls block on it. Offline with a cold HF cache = every call errors.
- A newly registered MCP server is not available until a **new** Claude Code session.

## Persistence locations

| Scope | File | Path inside it |
|-------|------|----------------|
| user | `~/.claude.json` | `.mcpServers.semble_code` |
| local | `~/.claude.json` | `.projects["<abs root>"].mcpServers.semble_code` |
| project | `<root>/.mcp.json` | `.mcpServers.semble_code`, gated by `enabledMcpjsonServers` / `disabledMcpjsonServers` in `.projects["<abs root>"]` |

## Detection matrix

`sc_mcp_state` returns exactly one word. Precedence: `malformed` > `duplicate` > `wrong_scope` > `stale_args` > `upstream_unpinned` > `correct` > `absent`.

| State | Definition | Response |
|-------|------------|----------|
| `absent` | no `semble_code` in user/local/project | `setup`: checkpoint -> `claude mcp add` -> `awaiting_reload`. `status`: "not registered", Next Step = setup |
| `correct` | user scope, `command=uvx`, args exactly `--from semble[mcp]==0.5.2 semble --content code config`, `env.SEMBLE_CACHE_LOCATION` == code root, `type` absent or `stdio` | no MCP mutation; continue to verification |
| `stale_args` | present in exactly one scope, but command/args/env/type differ (old pin, floating spec, wrong content set, relative or wrong cache root) | show the exact before/after diff, confirm once, then `remove` + `add-json`, checkpoint, reload |
| `wrong_scope` | args correct but scope is `local` or `project` | report; ask whether to migrate to `user` or keep. Migrate = add at user, remove from the other scope, checkpoint, reload |
| `duplicate` | `semble_code` in more than one scope | ALWAYS ask which to keep; remove the others; back up `~/.claude.json` and `.mcp.json` first |
| `upstream_unpinned` | a server literally named `semble` exists (from `semble install`) — with or without a correct `semble_code` | never auto-remove. Report the conflict: unpinned floating spec, default single-corpus cache root, tools named `mcp__semble__*`. Offer removal as an explicit choice; default is keep-and-warn |
| `malformed` | `~/.claude.json` or `<root>/.mcp.json` is unparseable | **STOP.** Never write. Report the file and the parser message. Next Step = fix it by hand |

Extra signal: `sc_mcp_dump.projectEnabled === false` means the server sits in `disabledMcpjsonServers` — report "disabled at project scope" even when the config is otherwise correct.

## `sc_mcp_dump` output

```json
{"user":{"type":"stdio","command":"uvx","args":["..."],"env":{"SEMBLE_CACHE_LOCATION":"..."}},
 "local":null,"project":null,"upstreamUser":null,"upstreamLocal":null,
 "malformed":[],"projectEnabled":null}
```

## Permissions

Exactly two entries, no wildcard, written into the **project** `.claude/settings.json` by `semble-guidance.sh`:

```json
{"permissions":{"allow":["mcp__semble_code__search","mcp__semble_code__find_related"]}}
```

## Cache layout

| Item | Value |
|------|-------|
| Per-repo dir | `<code root>/<sha256(str(Path(repo).expanduser().resolve()))>` — hex, 64 chars |
| Index files | `<repo dir>/index/{chunks.json,metadata.json,bm25_index/,semantic_index/}` |
| Root extra | `<code root>/savings.jsonl` |
| `metadata.json` | `{root_path,time,model_path,content_type:["code","config"],chunk_size,cache_version:1,files:{<rel>:{mtime_ns,start,count}}}` |
| Reuse condition | `model_path` AND `set(content_type)` AND `chunk_size` AND `cache_version` all match, then every walked file must be present and not newer than `time` |

The shell hash (`sc_repo_hash`) is `printf '%s' "$(cd REPO && pwd -P)" | shasum -a 256`. `cd`+`pwd -P` and `Path.resolve()` agree on symlink expansion, trailing slashes, `.`/`..` and `/`; they differ only for non-existent paths, where `sc_repo_hash` returns exit 1 and callers report `unknown` rather than a wrong hash.

### Why the two roots must differ (the proof)

The per-repo directory name is `sha256(resolved repo path)` and **the content type is not part of it** (`cache.py:27-36`). A `code config` index and a `docs` index of the same repo would therefore land in the *same* directory. `_metadata_matches` compares `set(content_type)`, so each server would judge the other's index invalid and rebuild it — on every call. Separate roots (`semble-code`, `semble-docs`) are the only fix. `semble-cache.sh reserve-docs` creates the docs root with a `RESERVED-FOR-DOCS.txt` marker and nothing else; no command in this skill ever passes it to semble.

### Staleness verdicts (`semble-cache.sh info`)

| Verdict | Condition |
|---------|-----------|
| `absent` | repo dir or `index/` missing |
| `incomplete` | any of the 4 persistence paths missing |
| `unknown` | metadata unreadable, or `SEMBLE_NO_NETWORK=1` |
| `mismatch` | `metadata.content_type` set != `{code,config}`, or `cache_version != 1` |
| `stale` | a file listed in `metadata.files` is missing or newer than `metadata.time` |
| `fresh` | none of the above |

Evaluated in that order. This approximates `get_validated_cache`; report `stale` as "likely stale" and offer a rebuild, never act on it automatically.

## Per-repo rebuild

There is **no CLI for it**: `semble clear index` wipes every index under the root (`cli.py:138-164`). The only correct rebuild is to delete one directory and let the next query rebuild it:

```bash
rm -rf "<code root>/<repo hash>"
```

`semble-cache.sh purge-repo` performs it behind four guards, all mandatory:

1. the hash resolves from the repo path (`sc_repo_hash`, exit 1 otherwise),
2. the leaf matches `^[0-9a-f]{64}$`,
3. the parent is exactly the code cache root,
4. `--yes` was passed (otherwise exit 4, nothing deleted).

`purge-root` additionally requires the root's leaf to be exactly `semble-code` or `semble-docs` and the path to be absolute.

## Script contracts

Common: `--json` prints a single JSON object and nothing else; `-h|--help` prints usage. Exit codes: `0` ok · `1` abort/failure (nothing written) · `2` usage · `3` precondition unmet · `4` confirmation required (`--yes` missing, nothing written). `SEMBLE_DRY_RUN=1` prints every mutating command prefixed `DRY ` and changes nothing.

### `semble-mcp.sh`

```text
semble-mcp.sh detect     [--json]
semble-mcp.sh add        [--scope user|project|local] [--yes] [--json]
semble-mcp.sh repair     [--yes] [--json]
semble-mcp.sh remove     [--scope user|project|local] [--yes] [--json]
semble-mcp.sh checkpoint [--json]
semble-mcp.sh print-cmd  [--json]
```

- `detect --json` -> `{"schema":1,"state":"<matrix word>","dump":{...},"expected":{"command","args","env"},"diff":[{"field","actual","expected"}],"connectivity":"unknown|connected|failed"}`.
- `add` writes the checkpoint (`phase=awaiting_reload`) **before** the add, always; if the checkpoint fails, the add does not run. Already-correct -> `unchanged`, exit 0. Present but different -> exit 3 with "run repair". Missing `--yes` -> exit 4. `claude mcp add` failing is retried once with `add-json`; a second failure reports `failed`, rolls the phase back to `prereq_ready` with a note, and exits 1.
- `repair` backs up `~/.claude.json` (and `.mcp.json` at project scope), removes every scope holding the server, checkpoints, re-registers at user scope with `add-json`, then re-detects and asserts.
- `remove` backs up first and re-detects afterwards to assert the scope is clear.
- `--scope` defaults to `user`; anything else prints a warning that the main workflow expects user scope.
- Mutating subcommands emit `{"schema":1,"status":"ok|unchanged|needs_confirmation|precondition|failed","state":"...","scope":"...","note":"..."}`.

### `semble-cache.sh`

```text
semble-cache.sh info         [--repo PATH] [--json]
semble-cache.sh resolve      [--repo PATH] [--json]
semble-cache.sh reserve-docs [--json]
semble-cache.sh purge-repo   [--repo PATH] --yes [--json]
semble-cache.sh purge-root   [--which code|docs] --yes [--json]
semble-cache.sh list         [--json]
```

`--repo` defaults to the resolved project root. `info --json` is the `cache` object of the status report plus `otherRepos`:

```json
{"codeRoot":"","docsRoot":"","docsReserved":false,"repoHash":"","repoDir":"","present":false,
 "sizeBytes":0,"entries":0,"metadata":null,"staleness":"absent",
 "otherRepos":[{"hash":"","sizeBytes":0,"rootPath":""}]}
```

`entries` counts files (recursively) inside the repo cache dir; `sizeBytes` is their exact total. `otherRepos` lists every other 64-hex entry under the code root with the `root_path` from its own `metadata.json`.

### `semble-state.sh`

```text
semble-state.sh init      [--json]
semble-state.sh get <KEY>
semble-state.sh show      [--json]
semble-state.sh phase <PHASE>
semble-state.sh complete <STEP>...
semble-state.sh patch '<json object>'
semble-state.sh clear --yes
```

State lives in `<projectRoot>/.claude/semble/state.json` (schema 1). Every write goes through `sc_state_patch`: unknown top-level keys are preserved verbatim, `completed` is union-merged, `updatedAt` is refreshed, the file is re-read and every patched key asserted. Unparseable state or a `schema` other than `1` ABORTs with exit 1 and writes nothing.

Legal phase transitions (`absent` is the no-file state; `clear` returns to it):

| From | To |
|------|-----|
| `absent` | `prereq_ready`, `error` |
| `prereq_ready` | `awaiting_reload`, `error` |
| `awaiting_reload` | `verifying`, `prereq_ready` (add rolled back), `error` |
| `verifying` | `ready`, `error` |
| `ready` | `verifying`, `disabled`, `awaiting_reload` (re-registration) |
| `disabled` | `verifying` |
| `error` | `verifying`, `prereq_ready` |

Identity transitions are legal (a re-run is idempotent). Anything else prints `⚠️ illegal phase transition <from> -> <to>; state left unchanged` and exits 1 without writing.

**Self-heal from `absent`.** The state file is created only inside an MCP mutation, so a project that inherits an already-correct **user-scope** registration never gets one — `add` reports `unchanged` and the checkpoint is skipped. `phase awaiting_reload|verifying|ready` therefore initialises the file at `prereq_ready` and walks the forward chain `prereq_ready -> awaiting_reload -> verifying -> ready`, stopping at the requested phase; every hop is checked against the same table and written like any other patch. `--json` reports `"healed":true` with the `walked` array. `disabled` is **not** healable from `absent` (nothing was ever set up to disable) and `prereq_ready`/`error` need no heal — they are already legal from `absent`.

`complete` takes one or more STEPs: separate arguments or a single whitespace-separated string. All tokens are validated first — an unknown one exits 2 naming that token and writes nothing — then the accepted set is union-merged in one patch.

Never store credentials, session ids, transcripts or tool output in the state file; `notes` are authored by the skill, never copied from command output.
