# Project agent migration

> Owner script: `scripts/semble-agents.sh`. Contract: DESIGN §9.9 + §11.
> Goal: an agent with a `tools:` allowlist can call the two Semble MCP tools.
> Non-goal: touching anything else in the file.

## Scope

| Scope | Directory | Automatic? |
|-------|-----------|------------|
| `project` (default) | `<projectRoot>/.claude/agents/**/*.md` (recursive) | yes |
| `global` | `<home>/.claude/agents/**/*.md` | never — needs `--scope global` and, for `apply`, `--yes` |

`install` never implies global scope. `audit --scope global` is allowed without `--yes` because it writes nothing.

## The two tool names

`mcp__semble_code__search`, `mcp__semble_code__find_related` — exact, never a wildcard.

## `mcpServers` — deliberate SPEC override

**No `mcpServers` key is ever added.** Claude Code 2.1.223 documents no `mcpServers` frontmatter field for subagents; subagents inherit the session's MCP servers, and an unknown key only risks frontmatter validation noise. This overrides SPEC line 222, whose own wording is conditional ("when explicit self-contained MCP declaration is required by the final design" — it is not).

An **existing** `mcpServers` key is preserved byte-for-byte and left in place. The suite asserts that no file gains one.

## Transformation table

Frontmatter = the block between a line-1 `---` (BOM tolerated) and the next line that is exactly `---`. Only **zero-indent** `tools:` keys count, so a nested `tools:` inside another mapping is ignored.

| `tools:` form | Example in | Example out | Result |
|---------------|-----------|-------------|--------|
| absent | *(no key)* | *(unchanged)* | `unchanged(inherits)` — an agent without `tools:` already inherits every MCP tool |
| flow seq | `tools: [Read, Bash]` | `tools: [Read, Bash, mcp__semble_code__search, mcp__semble_code__find_related]` | `changed(added)` — inserted after the last item, `, ` separated; spacing before `]` kept |
| block seq | `tools:`⏎`  - Read` | + `  - mcp__semble_code__search`⏎`  - mcp__semble_code__find_related` | `changed(added)` — same indent and dash spacing as the last existing item, inserted right after it |
| CSV string | `tools: Read, Bash` | `tools: Read, Bash, mcp__semble_code__search, mcp__semble_code__find_related` | `changed(added)` — appended after the last name, before any inline `#` comment; quoted scalars stay inside their quotes |
| empty, bare key | `tools:` | `tools:`⏎`  - mcp__semble_code__search`⏎`  - mcp__semble_code__find_related` | `changed(added)` + a `note`: the agent now has **only** those two tools. A **block** sequence, not a flow list, so that `--revert` restores the bare key byte-exactly |
| empty, explicit | `tools: []` / `tools: null` / `tools: ~` | `tools: [mcp__semble_code__search, mcp__semble_code__find_related]` | `changed(added)` + the same `note` |
| wildcard | `tools: "*"`, `mcp__*`, `mcp__semble_code__*` | *(unchanged)* | `unchanged(already-allowed)` |
| both present | any form containing both names | *(unchanged)* | `unchanged(already-present)` |
| one present | `tools: [Read, mcp__semble_code__search]` | + the missing name only | `changed(added)`, `added` has exactly 1 entry |
| duplicate `tools:` | two zero-indent `tools:` lines | *(unchanged)* | `skipped(duplicate-tools-key)` |

### Edge rules

| Rule | Behaviour |
|------|-----------|
| CRLF | detected in the first 4 KB; inserted lines reuse the anchor line's ending. The CR count changes by exactly the number of inserted lines and by nothing else. A file never changes EOL style |
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
| `unchanged` | `inherits`, `already-present`, `already-allowed`, `not-present` (revert) | nothing needed doing |
| `conflict` | `disallowed-tools` | a `disallowedTools` entry blocks the tools; nothing written |
| `skipped` | `no-frontmatter`, `unterminated-frontmatter`, `duplicate-tools-key`, `malformed-tools-value`, `too-large`, `symlink`, `not-md` | not a file we may edit |
| `failed` | `write-error`, `verify-mismatch`, `restore-failed`, `read-error` | the write or the post-write verification failed; the original was restored from the backup |

In `audit` the `action` is a **prediction** — nothing is written and `backup` is always `""`. In `apply`, `backup` is `""` for every file that was written and verified (the copy has been removed) and an absolute path only for a `failed` one.

## Byte preservation — how it is proven

1. **Surgical splices.** The file is never re-emitted. The script computes absolute source offsets and splices only inside the `tools:` value; every other byte is the original byte, by construction.
2. **Backup first, transient by design.** `cp <file> <file>.bak.<epoch>` before any write; `.bak.*` files are not `*.md`, so a later run never picks them up. The copy exists **only** across the write+verify window: once `verify()` is clean the backup is `unlink`ed and the entry reports `backup: ""`. Nothing is left next to a git-tracked agent file — `apply`, `apply`, `apply --revert` leaves `.claude/agents/` with exactly the entries it started with (asserted by the suite).
   A backup **survives** exactly when it may still be needed: the write failed, the post-write verification failed (the original is copied back from it), or the process died before the verification. Then `backup` carries its absolute path, the run exits 1, and the file is the user's to inspect and delete. Backups are never written outside the file's own directory, so a read-only or exotic location fails loudly instead of silently relocating the user's data.
3. **Skeleton check after the write.** The file is re-read and re-parsed from disk; the `tools:` declaration is collapsed to a sentinel in both the old and the new text and the two skeletons must be **string-equal**. That covers the body, all other frontmatter keys, comments, blank lines and permissions.
4. **Line-array check.** Every frontmatter line outside the tools region must be byte-identical, in the same order.
5. **Tool presence.** Both names must parse out of the new value (`apply`), or neither (`--revert`).
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
- `toolsStyle` extends the four §9.9 values with `empty` and `wildcard`, which §11.3 requires as distinct forms.
- `note` is additive and optional — present only for the empty-allowlist narrowing, a `conflict` (the offending line) and a `failed` (the underlying error).
- Consumer: `semble-status.sh` maps `inherit = unchanged(inherits)`, `patched = unchanged(already-present|already-allowed)`, `needsPatch = changed` from `audit --json`.

## `--revert`

Removes exactly the two Semble tool names and nothing else — the separator that came with them goes too, so a flow/CSV/block list returns to its pre-apply bytes.

One documented deviation, unavoidable without persisted per-file provenance:

| Case | Result |
|------|--------|
| the user had already listed one or both names before `apply` | they are removed as well — the script cannot tell who authored a name |

Every `tools:` form round-trips byte-exactly, the two empty ones included, and the suite asserts it per file:

| Before `apply` | After `apply` | After `--revert` |
|----------------|---------------|------------------|
| `tools:` | block seq under the bare key | `tools:` |
| `tools: []` | `tools: [<two names>]` | `tools: []` |

The two empty forms only stay distinguishable because the bare key is filled as a **block** sequence — a flow list would make the post-apply bytes identical for both, and one of them would have to be normalised away on revert. `tools: null` / `tools: ~` still revert to `tools: []` (a block sequence under an explicit `null` would not be valid YAML).
