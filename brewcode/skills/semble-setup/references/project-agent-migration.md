# Project agent migration

> Owner script: `scripts/semble-agents.sh`.
> Goal: an agent with a `tools:` allowlist can call the two Semble MCP tools.
> Non-goal: touching anything else in the file.

## Scope

| Scope | Directory | Automatic? |
|-------|-----------|------------|
| `project` (default) | `<projectRoot>/.claude/agents/**/*.md` (recursive) | yes |
| `global` | `<config dir>/agents/**/*.md` (`CLAUDE_CONFIG_DIR`, default `<home>/.claude`) | never — needs `--scope global` and, for `apply`, `--yes` |

`install` never implies global scope. `audit --scope global` is allowed without `--yes` because it writes nothing.

## The two tool names

`mcp__semble_code__search`, `mcp__semble_code__find_related` — exact, never a wildcard.

## No `mcpServers`

The helper never adds `mcpServers`: a subagent reaches the session's `semble_code` tools once its `tools:` allowlist names them, and plugin agents ignore `mcpServers` anyway. Existing `mcpServers` stays byte-identical; the suite asserts no file gains one.

## Transformation table

Frontmatter = the block between a line-1 `---` (BOM tolerated) and the next line that is exactly `---`. Only **zero-indent** `tools:` keys count, so a nested `tools:` inside another mapping is ignored.

| `tools:` form | Example in | Example out | Result |
|---------------|-----------|-------------|--------|
| absent | *(no key)* | *(unchanged)* | `unchanged(inherits)` — an agent without `tools:` already inherits every MCP tool |
| flow seq | `tools: [Read, Bash]` | `tools: [Read, Bash, mcp__semble_code__search, mcp__semble_code__find_related]` | `changed(added)` — inserted after the last item, `, ` separated; spacing before `]` kept |
| block seq | `tools:`⏎`  - Read` | + `  - mcp__semble_code__search`⏎`  - mcp__semble_code__find_related` | `changed(added)` — same indent and dash spacing as the last existing item, inserted right after it |
| CSV string | `tools: Read, Bash` | `tools: Read, Bash, mcp__semble_code__search, mcp__semble_code__find_related` | `changed(added)` — appended after the last name, before any inline `#` comment; quoted scalars stay inside their quotes |
| empty, bare key | `tools:` | `tools:`⏎`  - mcp__semble_code__search`⏎`  - mcp__semble_code__find_related` | `changed(added)` + a `note`: the agent now has only those two tools. A block sequence, not a flow list, so `--revert` restores the bare key byte-exactly |
| empty, explicit | `tools: []` / `tools: null` / `tools: ~` | `tools: [mcp__semble_code__search, mcp__semble_code__find_related]` | `changed(added)` + the same `note` |
| wildcard | `tools: "*"`, `mcp__*`, `mcp__semble_code__*` | *(unchanged)* | `unchanged(already-allowed)` |
| both present | any form containing both names | *(unchanged)* | `unchanged(already-present)` |
| one present | `tools: [Read, mcp__semble_code__search]` | + the missing name only | `changed(added)`, `added` has exactly 1 entry |
| duplicate `tools:` | two zero-indent `tools:` lines | *(unchanged)* | `skipped(duplicate-tools-key)` |

### Edge rules

| Rule | Behaviour |
|------|-----------|
| CRLF | detected in the first 4 KB; inserted lines reuse the anchor line's ending, so a file never changes EOL style (proof: EOL arithmetic below) |
| final newline | preserved as found (a file with no trailing newline keeps none) |
| BOM | tolerated on line 1 and preserved |
| inline comments | never lost — CSV/empty insertions land before the ` #` comment, flow insertions before `]` |
| `disallowedTools` | if it lists either tool name, `mcp__semble_code__*`, `mcp__*` or `*` -> `conflict`, nothing written, the exact offending line is reported in `note`. Changing an intentional deny requires an explicit user decision (one AskUserQuestion for all conflicting files together) |
| multi-line flow seq | supported (closing `]` searched inside the frontmatter). A `#` inside the brackets -> `skipped(malformed-tools-value)` |
| block scalar (`tools: >` / `\|`) | `skipped(malformed-tools-value)` |
| symlinked `*.md` | `skipped(symlink)` — never followed, never written |
| `> 512 KB` | `skipped(too-large)` |
| non-regular `*.md` (e.g. a directory) | `skipped(not-md)` |
| idempotency | a second `apply` reports `unchanged` everywhere and produces byte-identical files |

**Precedence** when several rules match: `symlink`/`too-large`/`not-md` -> `no-frontmatter` -> `unterminated-frontmatter` -> `duplicate-tools-key` / `malformed-tools-value` -> `conflict` -> the tools-form table.

## Result vocabulary (per file)

| `action` | `reason` values | Meaning |
|----------|-----------------|---------|
| `changed` | `added`, `removed` (revert) | the `tools:` value was edited and verified |
| `unchanged` | `inherits`, `already-present`, `already-allowed`, `not-present` / `not-owned` (revert) | nothing needed doing, or no ownership record (`not-owned`) |
| `conflict` | `disallowed-tools` | a `disallowedTools` entry blocks the tools; nothing written |
| `skipped` | `no-frontmatter`, `unterminated-frontmatter`, `duplicate-tools-key`, `malformed-tools-value`, `too-large`, `symlink`, `not-md` | not a file we may edit |
| `failed` | `write-error`, `verify-mismatch`, `restore-failed`, `read-error` | read/write/verification failed; restoration is attempted when possible. `restore-failed` means it was not proven; retain/report the backup |

`audit`: `action` is a prediction, nothing is written, `backup` is always `""`. `apply`: `backup` is `""` for every written and verified file (copy removed), an absolute path only for a `failed` one.

## Byte preservation — how it is proven

1. **Surgical splices.** The file is never re-emitted: splices at absolute source offsets, only inside the `tools:` value; every other byte is original by construction.
2. **Transient backup.** `cp <file> <file>.bak.<epoch>` before any write (`.bak.*` is not `*.md`, so no later run picks it up); after a clean `verify()` it is `unlink`ed, entry `backup: ""`. `apply`, `apply`, `apply --revert` leaves `.claude/agents/` with exactly its starting entries (suite-asserted).
   A backup survives only when still needed — failed write, failed post-write verification (original copied back from it), process killed before verification: `backup` carries its absolute path, the run exits 1, the user inspects and deletes it. Backups stay in the file's own directory: a read-only location fails loudly instead of relocating user data.
3. **Skeleton check after the write.** Re-read and re-parsed from disk; with the `tools:` declaration collapsed to a sentinel in old and new text, the two skeletons must be string-equal (body, other frontmatter keys, comments, blank lines, permissions).
4. **Line-array check.** Every frontmatter line outside the tools region must be byte-identical, in the same order.
5. **Tool presence.** Both names must parse out of the new value (`apply`), or only the kept user-authored ones (`--revert`).
6. **EOL arithmetic.** `Δ"\n"` must equal the number of inserted lines and `Δ"\r\n"` must equal the same number on a CRLF file, `0` on an LF file.

Any mismatch -> restore from the backup, report `failed`, exit 1.

## CLI

```text
semble-agents.sh audit  [--scope project|global] [--json]
semble-agents.sh apply  [--scope project|global] [--yes] [--revert] [--json]
```

| Exit | When |
|------|------|
| 0 | success / report produced |
| 1 | at least one file `failed` |
| 2 | bad usage (unknown subcommand, flag or scope; `--revert` on `audit`) |
| 3 | `apply` found `conflict` files — a user decision is required |
| 4 | `apply` without `--yes` — the plan was printed, nothing was written |

`SEMBLE_DRY_RUN=1` prints every mutation prefixed `DRY `, writes nothing, exits 0.
Test injection: `SEMBLE_PROJECT_ROOT`, `SEMBLE_TEST_HOME`.

## `--json` schema

```json
{"schema":1,"scope":"project","root":"/abs","total":0,
 "files":[{"path":".claude/agents/x.md","action":"changed","reason":"added",
           "toolsStyle":"absent|flow|block|csv|empty|wildcard","added":["..."],"backup":"","note":"optional"}],
 "summary":{"changed":0,"unchanged":0,"conflict":0,"skipped":0,"failed":0}}
```

- `path` is relative to `root` when inside it, otherwise absolute; `files` is sorted by `path`.
- `note` is optional — only for the empty-allowlist narrowing, a `conflict` (offending line) and a `failed` (underlying error).
- Consumer: `semble-status.sh` maps `inherit = unchanged(inherits)`, `patched = unchanged(already-present|already-allowed)`, `needsPatch = changed` from `audit --json`.

## `--revert`

Removes only the Semble tool names this skill added, with their separator, so a flow/CSV/block list returns to its pre-apply bytes. Authorship comes from the ownership record a write-mode `apply` leaves in `state.json` (`agentsPreExisting`, keyed by scope, then path; the first observation wins). A name the user listed before `apply` is kept (`note`: `kept … — authored before install`); a file with no record is left alone (`unchanged(not-owned)`). `uninstall` (`integration` flavour) and `purge` delete the record with the state dir.

Every `tools:` form round-trips byte-exactly, the two empty ones included (suite-asserted per file):

| Before `apply` | After `apply` | After `--revert` |
|----------------|---------------|------------------|
| `tools:` | block seq under the bare key | `tools:` |
| `tools: []` | `tools: [<two names>]` | `tools: []` |

The two empty forms stay distinguishable only because the bare key is filled as a block sequence (a flow list would make both post-apply bytes identical). `tools: null` / `tools: ~` still revert to `tools: []` (a block sequence under an explicit `null` would not be valid YAML).
