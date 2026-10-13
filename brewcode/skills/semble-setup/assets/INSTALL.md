# semble guidance — install / configure / remove runbook

Self-contained assets for `brewcode:semble-setup`. `scripts/semble-guidance.sh` copies
them into the target project and wires `settings.json`; every block below is the
exact thing that script runs, reproduced so it can be executed by hand or audited.
Opt-in: NOT registered in `brewcode/hooks/hooks.json` — installing the plugin
wires nothing on its own.

| File | Target | Event | Channel |
|------|--------|-------|---------|
| `semble-first.md.template` | `<repo>/.claude/rules/semble-first.md` | — | project rule, always loaded |
| `sembleignore.template` | `<repo>/.sembleignore` | — | read by the indexer, keeps generated junk out of the corpus |
| — (marker block) | `<repo>/CLAUDE.md` | — | 6 lines between HTML markers |
| `semble-session.mjs` | `<repo>/.claude/hooks/` | SessionStart | `systemMessage` + `additionalContext` |
| `semble-stats.mjs` | `<repo>/.claude/hooks/` | PostToolUse + PostToolUseFailure | **nothing** — appends JSONL telemetry, replies `{}` |
| `semble-subagent.mjs` | `<repo>/.claude/hooks/` | SubagentStart (no matcher — every agent type) | `additionalContext` — the semble-first brief inside the subagent's own context; skipped (`agent-no-tool`) when the agent definition's `tools:` omits semble or `disallowedTools` names it |

> Retired for good: `semble-explore.mjs` (superseded by `semble-subagent.mjs`), `semble-reminder.mjs`
> (PreToolUse) and `semble-prefetch.mjs` (UserPromptSubmit): a same-profile A/B measured no gain
> (reminder never fired, prefetch never surfaced the answering file). `install`/`upgrade` and
> `uninstall` DELETE their files, markers and settings rows (any matcher, any command form) — see §4.

> Pure ESM, Node built-ins only, no plugin-root and no npm deps. Each reads
> stdin, never throws, prints exactly one JSON object and exits 0. No hook spawns
> a process. No hook calls `pgrep` or implies a daemon:
> **semble has no watcher and no daemon** — the index is rebuilt inside a tool
> call and cached.

## The one-command path

```
scripts/semble-guidance.sh install [--part rule|ignore|claudemd|hooks|permissions|all] [--force] [--json]
scripts/semble-guidance.sh status  [--json]
scripts/semble-guidance.sh remove  [--part ...|all] [--force] [--json]
```

`install --part all` does, in order: rule -> `.sembleignore` -> CLAUDE.md block
-> copy the three `.mjs` (deleting any retired one) -> `.gitignore` line
-> settings hooks + permissions
merge. Every step is
idempotent and re-runnable. `--json` prints one object
`{schema,mode,part,changed,unchanged,skipped,failed}` and nothing else; a
non-empty `failed` makes the script exit 1.

`SEMBLE_DRY_RUN=1` prints what would change and writes nothing.

---

## 1. The rule file

`<repo>/.claude/rules/semble-first.md`, verbatim from `semble-first.md.template`.
It teaches the three facts that make every generated tool call work:

| Fact | Why it matters |
|------|----------------|
| `repo` is a **required** parameter on `search` AND `find_related` | it is the absolute project root (or an `https://` git URL) and is never inferred — omit it and the call fails |
| results carry `start_line` / `end_line`, **there is no `line` field** | open the hit at `start_line` |
| `.json`/`.json5`/`.csv`/`.tsv`/`.psv` and `.mdx`/`.txt` are outside the corpus — `.html`/`.htm` **are** indexed, in the docs bucket | `rg` is the only way to reach the ones that are not |

**Install policy — never a blind `cp`:**

| Target state | Action |
|--------------|--------|
| absent | write the template |
| byte-equals the template | `unchanged` |
| equal once the stamp metadata is stripped | `re-synced <path> (metadata only)`, no `--force`, no backup |
| byte-pristine copy of a prior release (stamp-stripped sha256 in `SG_PRIOR_RULE`/`SG_PRIOR_IGNORE`, tags v4.5.0..v6.4.0; status state `stale`) | `upgraded <path> (pristine prior-release copy)`, no `--force`, no backup |
| differs otherwise | **do not overwrite.** Report `user_modified`, print a unified diff on stderr, exit 0 |

Only `--force` (which the skill passes after an explicit user confirmation in
`install`/`repair`) overwrites, and it takes a `.bak.<epoch>` copy first. Removal
follows the same rule: a managed or pristine prior-release file is deleted, a
user-modified one is backed up and then deleted.

---

## 1a. The ignore file

`<repo>/.sembleignore`, verbatim from `sembleignore.template`, managed by the
exact same policy table as the rule file above (`--part ignore`).

**Mechanism, verified in source** — `semble/index/file_walker.py`,
`_load_ignore_for_dir()`: for each directory the walker reads exactly
`./.gitignore` and `./.sembleignore` and compiles them with `pathspec`'s
`GitIgnoreSpec`. It never shells out to git, so `core.excludesFile` and
`~/.gitignore_global` are NOT honoured — a repo-local file is the only lever.
Patterns are per-directory, gitignore syntax, `!` un-ignore included.

Two properties of that function decide what the template can do:

- **`.sembleignore` wins ties.** Its lines are appended *after* the sibling
  `.gitignore`'s into one spec, and `_is_ignored` keeps the last pattern that
  matched. A rule here overrides a conflicting `.gitignore` rule, negations
  included.
- **A `!` negation ending in a file extension skips the extension filter**
  (`_is_ignored`'s `found` flag). `!web/docs/package-lock.json` therefore
  indexed a lockfile whose suffix belongs to no content type at all — 552
  chunks, 5.9% of this workspace's index — and `!*.png` negations added 143
  chunks of decoded binary. No `--content` change removes them; only a
  re-ignore does. Full derivation: `references/language-coverage.md`.

Why it ships: without it the index absorbs whatever the tooling wrote into the
repo. On this workspace `.claude/tmp/` (vendored upstream markdown) was 214 of
871 indexed files and semble returned it as evidence about this project.
Installing the template took the index from **871 -> 590 files (-32.3%)** and
**13219 -> 9038 chunks**, and dropped noise hits across 10 real queries from
**18/120 to 0/120**, displacing exactly one legitimate result out of a top-12.

Round 2 (binary + lockfile blocks, plus this repo's per-repo lines) on the same
workspace, isolated cache, 16 questions at `k=5`:

| | Before | After |
|---|---|---|
| Files / chunks / cache | 593 / 9307 / 23 MB | **370 / 5781 / 14 MB** |
| Junk result slots | **24 of 80 (30.0%)** | **0 of 80** |
| Queries with junk in the top 5 | 13 of 16 | 0 of 16 |

Attribution of the 3526 removed chunks: `.codex/` mirrors 2202, lockfile 552,
changelog 503, binaries 143, root `skills/` duplicate 126. The two generic
blocks alone account for 695 chunks (7.5%) and need no per-repo knowledge.

No previously-correct hit was lost. Three queries changed a top-5 member: two
were ties at identical scores swapping equivalent files, and on the third the
*answer* moved up into the top 3 while the implementation file it replaced
stayed at rank 5 at `k=10`. One question that used to fail (P6, "how is the
plugin root path resolved, current and legacy") now lands at rank 3, on a chunk
that had been outranked by a changelog entry and two mirror copies.

The template is **conservative on principle** — excluding something the user
wanted indexed is worse than leaving noise, so every shipped rule has to hold in
any repo, sight unseen:

| Block | Why it is generic |
|-------|-------------------|
| `.claude/{tmp,reports,backups,logs,semble,projects,history,file-history,shell-snapshots,statsig,todos,ide}/` | Machine state and scratch written by the harness itself, identical in every repo. Deliberately NOT `.claude/{skills,agents,rules,commands,hooks,scripts,tasks}/` — those are authored source |
| Build output: `target/ coverage/ htmlcov/ .gradle/ .astro/ .turbo/ .parcel-cache/ .nuxt/ .svelte-kit/ .output/ .docusaurus/ .terraform/ .dart_tool/ _site/` | Tool-owned output directories with fixed names. Does not repeat semble's own `_DEFAULT_IGNORED_DIRS` (`.git`, `node_modules`, `venv`, `dist`, `build`, …), already skipped |
| Vendored trees: `vendor/ third_party/ bower_components/ .yarn/ Godeps/` | Conventional names for "someone else's source, copied in" |
| Minified bundles: `*.min.js *.min.css *.bundle.js *.map` | Generated, unreadable, never authored |
| **Binary suffixes** (`*.png *.pdf *.woff2 *.zip *.so *.sqlite`, ~45 in all) | Zero-risk by construction: none of these suffixes maps to a language, so against a plain `.gitignore` the block is a no-op. It exists solely to cancel a negation bypass, and decoded binary is never the answer to anything |
| **Lockfiles** (`package-lock.json yarn.lock pnpm-lock.yaml Cargo.lock go.sum …`) | Machine-written dependency resolution. `pnpm-lock.yaml` is a `.yaml` and reaches the config bucket outright; the rest arrive only through the bypass |

**What is deliberately NOT shipped**, because no static pattern can recognise it
without knowing the repo:

| Not shipped | Reasoning |
|-------------|-----------|
| Duplicate/mirror trees | The generic form of "this tree is a copy of that tree" is content-hash dedup, not a filename. `.codex/` in particular is another agent runtime's directory — exactly parallel to `.claude/`, whose authored subdirectories we deliberately keep — so blanket-ignoring it by name would contradict the rule right above it. Here it happened to be a generated triplicate (211 files, 2202 chunks, 15 of 80 result slots); in the next repo it is hand-written config |
| `RELEASE-NOTES.md` / `CHANGELOG.md` | Genuinely the right answer to "when did X land" and genuinely ruinous for "how does X work" (503 chunks, 9 of 80 slots here). Which of those a user asks is not knowable from the file |

Both are covered instead by a commented **per-repo section** at the end of the
template: the reasoning, the measured cost, and a copy-pasteable snippet that
prints the 20 files eating the most chunks in *this* repo's cache. The user adds
the lines; nothing ships pre-filled.

> **Follow-up, not implemented here:** the per-repo section is manual because the
> generator (`semble-guidance.sh`) writes the template verbatim and has no
> detection pass. Duplicate-tree detection (hash every indexed file, report paths
> sharing a digest) belongs in `install --part ignore` and would turn that
> commented block into a proposed diff the user confirms.

---

## 2. CLAUDE.md marker block

Appended to `<repo>/CLAUDE.md` (created as `# CLAUDE.md` when absent):

```markdown
<!-- BEGIN brewcode:semble -->
## Code Search

> Semantic search first: ONE `mcp__semble_code__search` with `repo` = absolute project root,
> `top_k=5`, `max_snippet_lines=10` — then open the hit at `start_line`.
> Symbol definitions/references -> LSP; `rg`/Grep stays for literals, regexes, paths and exhaustive enumeration.
> Not indexed: `.json`/`.csv`, `.mdx`/`.txt`. Details: `.claude/rules/semble-first.md`.
<!-- END brewcode:semble -->
```

Presence is detected by the literal `<!-- BEGIN brewcode:semble -->`. Re-install
replaces the whole marked range in place — it never appends a second block.
Uninstall deletes the inclusive range plus one trailing blank line, matching on
the exact marker strings, never a regex over the whole file. **BEGIN without END
(or the reverse), or a second BEGIN/END, reports `malformed marker block` and
changes nothing** — fix it by hand, then re-run.

Contract for every other tool that rewrites CLAUDE.md: the marked range belongs to
this skill. Keep it byte-identical, both marker lines included; `upgrade` re-creates
a deleted block, and only `uninstall` removes it.

### 2a. CLAUDE.md doctrine-reconcile scan (`--part claudemd`)

Runs immediately after the marker block above lands, gated by the same
`want_part claudemd` that `--part all` also satisfies — so a plain `install`
with `claudemd` in scope runs this too (`do_claudemd_conflicts`, called right
after the block write, so the scan excludes the doctrine it just wrote). It
can DELETE whole lines from the project's root CLAUDE.md; read this before
running it unattended.

- Root `<repo>/CLAUDE.md` only — never a nested `CLAUDE.md`.
- Backs up the whole file first: `<repo>/CLAUDE.md.bak.<epoch>`, before any
  write.
- Removes whole lines only, never a clause within a line.
- `SEMBLE_DRY_RUN=1` prints what it would remove and writes nothing.
- Reports three buckets: `changed` (lines removed, echoed verbatim),
  `skipped` (lines flagged for manual review), `unchanged` (no competing
  directive found).

| Line matches | Action |
|---|---|
| denies semble/semantic/MCP search outright ("is broken/unreliable/disabled", "never use semble"), or declares grep/glob "removed/no-op/disabled/gone" | removed, echoed verbatim in the report — even if the same line also names exact/literal/regex/path scoping |
| routes search through grep/bash/rg/ugrep/ripgrep/find/glob first ("TOOL-first", "search via grep", "all code search through rg") and is NOT scoped to exact identifiers / regexes / paths / filenames / exhaustive enumeration / verify / count | removed, echoed verbatim in the report (incl. a search-titled heading the removal leaves empty) |
| merely mentions a search tool, matching neither test above | reported as skipped, left untouched |
| a "TOOL-first" style line that IS scoped to exact identifiers / regexes / paths / filenames / exhaustive enumeration / verify / count | never touched, not even reported |

The exact/literal/regex/path/exhaustive scoping only shields the second
(primacy-claim) row — an outright denial in row one is always removed, scoped
wording or not.

---

## 3. Hook contracts

### `semble-session.mjs` — SessionStart, no matcher

Reads `<root>/.claude/semble/state.json`; before any usability claim, the MCP registration below.

**MCP presence (session, subagent; one identical block).** No hook input reports MCP
registration, so each hook reads the ACTIVE profile: `<CLAUDE_CONFIG_DIR or $HOME>/.claude.json`
`mcpServers.semble_code` (user) or `projects[<root>].mcpServers` (local), else `<root>/.mcp.json` (project);
`projects[<root>].disabledMcpServers` / `disabledMcpjsonServers` veto. Absent -> skip `no-mcp`.
Every steering text ends with the one routing line: `Search routing: intent/behaviour -> semble; symbol definitions/references -> LSP; literals/paths/regex/counts -> rg.`

| Condition | Output |
|-----------|--------|
| state file missing or empty | `{}` — total silence. Semble is not configured here; never nag |
| unparseable / not a regular file | `{"systemMessage":"semble: state file is corrupt — run /brewcode:semble-setup status"}` |
| `enabled === false` or `phase === "disabled"` | `semble: disabled for this project` |
| `awaiting_reload` or `ready`, server not registered for the active profile | `semble: semble_code MCP is not registered for this profile — run /brewcode:semble-setup status`, no `additionalContext` |
| `phase === "awaiting_reload"` | resume nudge + `additionalContext` that verification is pending |
| `phase === "error"` | `semble: error — run /brewcode:semble-setup status` |
| `phase === "ready"` | `semble: ready \| cache <repoHash[0:8]>` + the one-search-then-read directive with `repo=<abs cwd>` |
| any other phase | `semble: <phase>` |

### `semble-stats.mjs` — PostToolUse + PostToolUseFailure, matcher list

The measurement hook: the only place where a completed `mcp__semble_code__*` call
and an opened FILE are observable.

**Pure observer.** It returns the neutral `{}` on every event, always exits 0,
and emits no `additionalContext`, no `permissionDecision`, no `systemMessage`.
Wiring it cannot change what any tool call does. Its only side effect is one
appended JSONL line.

Registered on **both** post-tool events with the **same** matcher:

```
mcp__semble_code__search|mcp__semble_code__find_related|Bash|Grep|Glob|Read
```

Why two rows and not one: on Claude Code 2.1.226 a tool call that errors fires
`PostToolUseFailure` **instead of** `PostToolUse`, never both. A single
`PostToolUse` row would silently drop every failed call — including `grep` with
no matches (exit 1), which is a large and perfectly ordinary slice of the
denominator.

Why `|` and not `,`: the matcher is parsed as an exact name list when it matches
`/^[a-zA-Z0-9_|, -]+$/` at some call sites and the stricter `/^[a-zA-Z0-9_|]+$/`
at others, and as an unanchored regex otherwise. A `|`-only list is an exact list
under both readings; a comma-or-space list is not. The two `mcp__…` names are
safe in a list — Claude Code only warns about an `mcp__x` matcher with a single
`__` segment, and both of these have two.

What the payload really carries on this build (verified against the shipped
binary, not the docs prose):

| Field | Present | Used for |
|-------|---------|----------|
| `tool_name`, `tool_input`, `session_id`, `cwd`, `hook_event_name`, `tool_use_id` | always | routing, `sid`, log path |
| `tool_response` | `PostToolUse` only | `ok` (an explicit `isError`/`is_error` flips it false) |
| `error`, `is_interrupt` | `PostToolUseFailure` only | — (`ok:false` is already implied by the event) |
| `duration_ms` | optional, both events | `ms` — **omitted from the record when absent, never invented** |
| `agent_id` | subagent calls only | `agent: "sub"` |
| `agent_type` | subagent calls, and main thread of a `--agent` session | `agent: "sub"` |

`agent` is `sub` when **either** `agent_id` or `agent_type` is present, `main`
otherwise (the retired prefetch writer used the same both-keys test; old logs stay comparable).

`Explore` is deliberately absent from the matcher: it is an agent *type*, not a
tool name — the tool is `Agent` (with `Task` as an alias). Counting `Agent` would
double-count, because the subagent's own `Bash`/`Grep` calls already arrive here
tagged `agent:"sub"`.

Search-shaped filter for the denominator: `Grep` and `Glob` are search tools by
definition and always count. A `Bash` call counts only when `SEARCH_RE` matches
it, so numerator and denominator use one definition of "search-shaped".

`Read` is never counted as a search. Every `Read` emits `ev:"open"` with the path in
both repo-relative (`f`) and absolute (`abs`) form; it fed the retired prefetch conversion.

---

## 3a. Telemetry contract

File: `<repo>/.claude/semble/telemetry.jsonl`. One JSON object per line, appended
with a **single `appendFileSync(path, JSON.stringify(rec) + "\n")`** — never
read-modify-write, so concurrent hooks cannot interleave a partial record.

Every record carries `ts` (`new Date().toISOString()`), `ev`, `src`, and `sid`
(the hook input's `session_id`, or `""`).

| `ev` | `src` | Extra fields |
|------|-------|--------------|
| `open` | `stats` | `f` (repo-relative path, ≤200 chars), `abs` (absolute path, ≤200 chars), `agent` — one per `Read` |
| `call` | `stats` | `tool` (full MCP name), `ok` (bool), `ms` (int, **omitted** when the payload had no `duration_ms`), `agent` |
| `search` | `stats` | `tool`, `q` (≤120 chars), `agent` |
| `nudge` | `session` | `matcher:"SessionStart"`, `agent:"main"`, `q:""` — one per SessionStart that emitted `additionalContext` |
| `gate` | `subagent` | `fired` (bool), `why` (`ok`, `no-state`, `corrupt`, `disabled`, `error`, `not-registered`, `no-mcp`, `agent-no-tool`), `phase`, `enabled`, `agent_type`, `agent_id` — one per SubagentStart carrying an `agent_type` |
| `nudge` | `subagent` | `matcher:"SubagentStart"`, `agent:"sub"`, `agent_type`, `agent_id`, `q:""` — one per subagent start that was nudged |

`src:"explore"` (before 5.0.0) and `src:"prefetch"`/`src:"reminder"` (`ev` `prefetch`, `gate`, `nudge`;
before 6.5.0) appear only in old logs. The reader still counts them per channel; nothing writes them any more.

**Conversion is reported PER SOURCE, never lumped.** A nudge converts when a
semble `call` in the same `sid` has a `ts` strictly greater than the earliest
nudge *of that source* in that session. `conversion.bySource` carries one slot
per channel (`session`, `subagent`, plus the retired `reminder`/`prefetch`/`explore` slots for old logs)
with `nudges` / `sessions` / `converted` / `sessionPct` / `callsAfter` and a `measure` field
(`semble-call-after`; prefetch: `injected-path-opened`). `subagent` reports `agentTypes`.

The top-level `sessionsWithNudge`/`sessionsConverted`/`conversionPct` fields are
unchanged in shape and still lump every channel together — they are kept for
compatibility, and they are the fields that produced the false "0/18" reading:
one shared denominator hides every channel's own rate.

Writer rules, binding on every hook that logs:

- Every write is wrapped in `try/catch` and swallowed. A telemetry failure must
  never break a tool call or change the hook's output by one byte.
- Size guard, best-effort: over **2 MB**, keep the last **~1000** lines before
  appending. The guard is itself inside a `try/catch` — a failed trim appends
  anyway rather than losing the sample.
- Exit 0 always.

Reader rules (`semble-status.sh --section telemetry`): an absent file reports
"no telemetry yet"; a truncated final line and an unknown `ev` from a future
version are **counted and skipped**, never fatal.

---

## 4. settings.json entry shape

Every `args` path is the literal `${CLAUDE_PROJECT_DIR}/.claude/hooks/<script>`, never an
absolute path: `settings.json` is usually tracked, and an absolute path breaks every other
clone. In exec form Claude Code substitutes the placeholder into each `args` element ("the
project root where the session started"; it does not follow an entered worktree), the same
form docsync, agent-deadline and agent-router write.

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/semble-session.mjs"], "timeout": 5 } ] }
    ],
    "PostToolUse": [
      { "matcher": "mcp__semble_code__search|mcp__semble_code__find_related|Bash|Grep|Glob|Read", "hooks": [ { "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/semble-stats.mjs"], "timeout": 5 } ] }
    ],
    "PostToolUseFailure": [
      { "matcher": "mcp__semble_code__search|mcp__semble_code__find_related|Bash|Grep|Glob|Read", "hooks": [ { "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/semble-stats.mjs"], "timeout": 5 } ] }
    ],
    "SubagentStart": [
      { "hooks": [ { "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/semble-subagent.mjs"], "timeout": 5 } ] }
    ]
  },
  "permissions": {
    "allow": ["mcp__semble_code__search", "mcp__semble_code__find_related"]
  }
}
```

`timeout` is in SECONDS and is **not optional**: an entry without it inherits
Claude Code's 600 s default, so a hung `node` would stall its event for 10 minutes.
5 s is ~500x the runtime of each hook.

A semble entry is a hook whose `args` path, or shell-form `command` (e.g. a quoted
`"$CLAUDE_PROJECT_DIR"/.claude/hooks/...` path), names one of the **six basenames this skill
has ever owned**: live `semble-session.mjs`, `semble-stats.mjs`, `semble-subagent.mjs`; retired
`semble-explore.mjs`, `semble-reminder.mjs`, `semble-prefetch.mjs`. Ownership (`marks`) and
desire (`wanted`) are SEPARATE: `wanted` holds only the want table's `(event, matcher, portable
path)` triples, so every retired registration (any matcher, any path, any command form), and a
live script under a wrong event or matcher, is stale and the step-2 purge removes it. A retired
basename must never leave `marks`, or an old install becomes unremovable. The installer always
writes the exec form `{hooks:[{type,command:"node",args:["${CLAUDE_PROJECT_DIR}/.claude/hooks/<script>"],timeout}]}`.

**Migration (pre-6.5.1 absolute paths).** An arg `<any abs dir>/.claude/hooks/<owned basename>`
is the old form of the same hook: `canon()` maps it to the portable path, so it shares the
portable row's key. `install`/`upgrade` rewrite it in place (position, foreign hooks and foreign
entry keys kept) and never add a second row; a copy in both forms collapses to one.

### Merge rule, in order — do not reorder

1. **ABORT if `settings.json` exists and is not valid JSON.** Never rewrite a
   file you could not parse; that turns one stray comma into total data loss.
   Nothing is written, exit 1.
2. Drop every semble hook whose `(event, matcher, args path)` is not a want row:
   a **different** hooks dir (stale installs — Claude Code logs a hook failure on
   every tool call for each of them), a retired script, a live script on a wrong
   event/matcher, or any shell-form `command`. Match on the canonical path (absolute
   `.claude/hooks/<owned>` -> portable), not the basename. The filter runs **inside
   `entry.hooks[]`, not over the entry array**: a hand-merged entry may hold a
   foreign hook next to a stale semble one, and only the semble one may go. An
   entry dies only once its `hooks[]` is empty. A hook with no semble arg is
   foreign and is **never** touched.
3. **Reconcile each want row against the file — the merge repairs, it does not
   only append.** The key is `event + matcher + canonical path` (`semble-stats.mjs`
   legitimately appears under two events, so deduping on the path alone would
   silently drop the `PostToolUseFailure` registration). For that key:
   - **absent** → append the full desired entry;
   - **present once** → compare MY hook **field by field** against the desired
     hook `{type, command, args, timeout}` and rewrite it in place when *any*
     field differs, including an extra field the desired hook does not have.
     Foreign hooks in the same entry, and foreign keys on the entry itself, are
     left byte-identical. Nothing is rewritten when nothing differs, so a clean
     re-run is a byte-level no-op.
   - **present more than once** → keep and reconcile the first, and strip my
     hook out of every later copy (per-hook again, so a foreign hook riding on
     the duplicate survives). A hand-added duplicate is *repaired*, not a fatal
     error.

   This is what makes a re-run self-healing. A dedupe on presence alone can
   never fix a drifted field: an entry carrying the pre-4.7.0 `"timeout": 5000`
   (~83 minutes, since `timeout` is SECONDS) matched the old key and was
   skipped forever.
4. Merge `permissions.allow` with the two tool names, deduped.
5. **Assert BEFORE the write, then re-read and assert again**: exactly 1
   `SessionStart` entry, exactly 1 `PostToolUse`/`<stats matcher>`, exactly 1
   `PostToolUseFailure`/`<stats matcher>`, exactly 1 unmatched
   `SubagentStart`, each carrying exactly one semble hook deep-equal to the
   desired hook, and each tool name present exactly once in
   `permissions.allow`. Anything else exits 1. The pre-write check is the
   load-bearing one: a post-write-only assert reports the failure *after* it has
   already saved the bad file.
6. **Delete events the purge emptied.** An event array left empty by step 2 and
   absent from the want table is removed rather than left as `[]` litter. An
   event that still holds a foreign hook is left alone: a retired
   `UserPromptSubmit`/`PreToolUse` row goes, a foreign one on the same event stays.

**EXECUTE** merge (project, Bash tool). `SETTINGS` is the only input (`HOOK_REF`
overrides the arg prefix, global install only); this is the canonical block — use it, not a hand `Edit`, because it is
the only path that aborts on a broken file, repairs drift, and verifies both
before and after writing:

```
SETTINGS="$PWD/.claude/settings.json" node -e '
const fs=require("fs"), path=require("path");
const f=process.env.SETTINGS, REF=process.env.HOOK_REF||"${CLAUDE_PROJECT_DIR}/.claude/hooks";   // portable arg
// EVERY basename ever owned (ownership); `wanted` = want-table triples only, so retired rows purge.
const marks=["semble-session.mjs","semble-prefetch.mjs","semble-stats.mjs",
             "semble-reminder.mjs","semble-subagent.mjs","semble-explore.mjs"];
const STATS="mcp__semble_code__search|mcp__semble_code__find_related|Bash|Grep|Glob|Read";
const want=[["SessionStart",null,"semble-session.mjs",5],
            ["PostToolUse",STATS,"semble-stats.mjs",5],
            ["PostToolUseFailure",STATS,"semble-stats.mjs",5],
            ["SubagentStart",null,"semble-subagent.mjs",5]];   // no matcher = every agent type
const tools=["mcp__semble_code__search","mcp__semble_code__find_related"];
function lock(f){                                      // shared <settings>.lock: 10 s wait, >30 s stale
  const l=f+".lock", w=new Int32Array(new SharedArrayBuffer(4));
  for(let i=0;i<100;i++){
    try{ fs.mkdirSync(l); return ()=>{ try{ fs.rmdirSync(l); }catch{} }; }
    catch(e){
      if(e.code!=="EEXIST") throw e;
      try{ if(Date.now()-fs.statSync(l).mtimeMs>30000) fs.rmdirSync(l); }catch{}
      Atomics.wait(w,0,0,100);
    }
  }
  console.error("ABORT: "+l+" is held by another installer; nothing was written"); process.exit(1);
}
fs.mkdirSync(path.dirname(f),{recursive:true});
process.on("exit",lock(f));                            // read+merge+write = one critical section
let s={};
if(fs.existsSync(f)){
  const raw=fs.readFileSync(f,"utf8");
  if(raw.trim()){
    try{ s=JSON.parse(raw); }
    catch(e){ console.error("ABORT: "+f+" is not valid JSON ("+e.message+") - fix or delete it; nothing was written"); process.exit(1); }
    if(s===null||typeof s!=="object"||Array.isArray(s)){ console.error("ABORT: "+f+" is not a JSON object; nothing was written"); process.exit(1); }
  }
}
const argsOf=e=>((e&&e.hooks)||[]).flatMap(h=>(h&&h.args)||[]).filter(a=>typeof a==="string");
const matcherOf=e=>(e&&typeof e.matcher==="string")?e.matcher:null;
const isMine=a=>marks.some(m=>a===m||a.endsWith("/"+m)||a.endsWith("\\"+m));
const cmdMark=c=>typeof c==="string"?marks.find(m=>new RegExp("(^|[\\\\/\"\x27\\s])"+m.replace(/\./g,"\\.")+"([\"\x27\\s]|$)").test(c)):undefined;
const ownedOf=h=>{ const a=((h&&h.args)||[]).filter(x=>typeof x==="string"&&isMine(x));
  const c=cmdMark(h&&h.command); return c?a.concat(["cmd:"+c]):a; };   // shell form: never wanted
const wkey=(ev,m,a)=>JSON.stringify([ev,m,a]);
const wanted=new Set(want.map(w=>wkey(w[0],w[1],REF+"/"+w[2])));   // want triples, NOT marks
// Absolute <x>/.claude/hooks/<owned> = same key as the portable path: rewritten in place, never duplicated.
const canon=a=>{ const m=/^(?:\/|[A-Za-z]:[\\/]).*[\\/]\.claude[\\/]hooks[\\/]([^\\/]+)$/.exec(a);
  return m&&marks.indexOf(m[1])>=0?REF+"/"+m[1]:a; };
const desiredHook=(full,timeout)=>({type:"command",command:"node",args:[full],timeout});
const hasArg=(h,full)=>((h&&h.args)||[]).filter(a=>typeof a==="string").map(canon).includes(full);
const deq=(a,b)=>{                                     // key-order-insensitive deep equal
  if(a===b) return true;
  if(typeof a!=="object"||typeof b!=="object"||a===null||b===null) return false;
  if(Array.isArray(a)!==Array.isArray(b)) return false;
  const ak=Object.keys(a), bk=Object.keys(b);
  if(ak.length!==bk.length) return false;
  return ak.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&deq(a[k],b[k]));
};
const reconcile=(e,full,timeout)=>{                    // rewrite MY hook to the desired object,
  const w=desiredHook(full,timeout);                   // leave foreign hooks and foreign entry keys alone
  let dirty=false, n=0;                                // abs + portable copy in ONE entry: keep the first
  const hooks=e.hooks.filter(h=>!hasArg(h,full)||++n===1||!(dirty=true))
    .map(h=>{ if(!hasArg(h,full)||deq(h,w)) return h; dirty=true; return w; });
  return dirty?Object.assign({},e,{hooks}):e;
};
const stripHook=(e,full)=>{                            // 2nd+ copy of a row: drop only my hook
  const kept=e.hooks.filter(h=>!hasArg(h,full));
  if(kept.length===e.hooks.length) return e;
  return kept.length?Object.assign({},e,{hooks:kept}):null;
};
const verify=root=>{                                   // 5. null | message; run BEFORE the write
  for(const [ev,matcher,script,timeout] of want){
    const full=REF+"/"+script;
    const hits=((root.hooks&&root.hooks[ev])||[]).filter(e=>matcherOf(e)===matcher&&argsOf(e).includes(full));
    if(hits.length!==1) return "verification failed - "+ev+"/"+(matcher||"*")+"/"+script+" present "+hits.length+" times in "+f;
    const mine=((hits[0].hooks)||[]).filter(h=>hasArg(h,full));
    if(mine.length!==1||!deq(mine[0],desiredHook(full,timeout)))
      return "verification failed - "+ev+"/"+(matcher||"*")+"/"+script+" does not match the desired entry in "+f
        +" (got "+JSON.stringify(mine)+")";
  }
  for(const t of tools){
    const n=((root.permissions&&root.permissions.allow)||[]).filter(x=>x===t).length;
    if(n!==1) return "verification failed - permission "+t+" present "+n+" times in "+f;
  }
  return null;
};
s.hooks=(s.hooks&&typeof s.hooks==="object"&&!Array.isArray(s.hooks))?s.hooks:{};
for(const ev of Object.keys(s.hooks)){                 // 2. drop unwanted semble hooks, keep foreign ones
  if(!Array.isArray(s.hooks[ev])) continue;
  s.hooks[ev]=s.hooks[ev].map(e=>{                     // filter INSIDE hooks[]: a hand-merged entry
    if(!e||!Array.isArray(e.hooks)) return e;          // may hold a foreign hook next to a stale one
    const m=matcherOf(e);
    const kept=e.hooks.filter(h=>{
      const mine=ownedOf(h);
      return mine.length===0 || mine.every(a=>wanted.has(wkey(ev,m,canon(a))));
    });
    if(kept.length===e.hooks.length) return e;
    return kept.length ? Object.assign({},e,{hooks:kept}) : null;   // entry dies only when empty
  }).filter(e=>e!==null);
}
for(const [ev,matcher,script,timeout] of want){        // 3. reconcile THIS event+matcher, do not merely append
  s.hooks[ev]=Array.isArray(s.hooks[ev])?s.hooks[ev]:[];
  const full=REF+"/"+script;
  let seen=0;
  s.hooks[ev]=s.hooks[ev].map(e=>{
    if(!e||!Array.isArray(e.hooks)||matcherOf(e)!==matcher||!argsOf(e).map(canon).includes(full)) return e;
    seen++;
    return seen===1?reconcile(e,full,timeout):stripHook(e,full);    // extra copies are repaired away, not aborted on
  }).filter(e=>e!==null);
  if(seen===0){
    const entry={hooks:[desiredHook(full,timeout)]};   // timeout is SECONDS; absent = CC default 600 s
    if(matcher) entry.matcher=matcher;
    s.hooks[ev].push(entry);
  }
}
const wantEvents=new Set(want.map(w=>w[0]));           // 6. drop events the purge emptied
for(const ev of Object.keys(s.hooks))
  if(Array.isArray(s.hooks[ev])&&s.hooks[ev].length===0&&!wantEvents.has(ev)) delete s.hooks[ev];
s.permissions=(s.permissions&&typeof s.permissions==="object"&&!Array.isArray(s.permissions))?s.permissions:{};
const allow=Array.isArray(s.permissions.allow)?s.permissions.allow.slice():[];   // 4. permissions
for(const t of tools) if(!allow.includes(t)) allow.push(t);
s.permissions.allow=allow;
const pre=verify(s);                                   // 5a. validate BEFORE writing
if(pre){ console.error("ABORT: "+pre+"; nothing was written"); process.exit(1); }
fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n");
const post=verify(JSON.parse(fs.readFileSync(f,"utf8")));   // 5b. re-read what actually landed
if(post){ console.error("ABORT: "+post); process.exit(1); }
console.log("OK merged "+f);
' && echo "✅ settings" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing. An ABORT means `settings.json` was left
> EXACTLY as it was: `model`, `env`, `permissions.deny` and every foreign hook
> are intact. Fix the JSON by hand, then re-run.

### Drift, and what `status` must report

Presence is not health. `semble-guidance.sh status --json` compares every want row
against the file field by field and reports the four rows as `wired` / `drifted` /
`duplicate` / `missing`:

```json
"hooks": {
  "wiredCount": 3, "wantCount": 4, "driftedCount": 1, "missingCount": 0, "duplicateCount": 0,
  "entries": [ { "event": "SubagentStart", "matcher": null,
                 "script": "semble-subagent.mjs", "count": 1, "state": "drifted" } ],
  "drift":   [ { "event": "SubagentStart", "matcher": null,
                 "script": "semble-subagent.mjs", "field": "timeout",
                 "expected": 5, "actual": 5000 } ],
  "retired": ["semble-reminder.mjs"], "retiredWired": ["semble-prefetch.mjs", "semble-reminder.mjs"]
}
```

`hooks.session.wired` / `hooks.stats.wired` / `hooks.subagent.wired` and
`hooks.wiredCount` mean **present AND conforming** — a row
with `"timeout": 5000` is `drifted`, counted in `driftedCount`, and is **not**
counted as wired. Reporting it as fully wired is what let two installs sit broken
for days. `wantCount` is the want table's length, so `wiredCount/wantCount` is the
only ratio worth printing — never a hard-coded denominator.

`stats.wired` needs both post-tool events. A half-wired pair is not wired.

`hooks.retired` lists retired basenames still present in `<repo>/.claude/hooks/`;
`hooks.retiredWired` lists retired basenames still registered in `settings.json`
(`staleEntries` counts those rows). Either non-empty = `stale (remove via upgrade)`:
`install`/`upgrade` delete the files and the purge un-wires their rows.

An absolute-path live row (pre-6.5.1) is **stale, not wired**: it fires on this checkout only.
Its want row reads `drifted` with a `drift[]` entry on `args` (expected the portable path), the
row counts in `staleEntries`, and `hooks.absoluteCount` counts such rows. The human line prints
`portable:  N absolute-path hook entries (break every other clone) - run /brewcode:semble-setup upgrade`;
`install` repairs it the same way.

`drift[]` is the machine-readable "what differs": one object per differing field,
naming `event`, `matcher`, `script`, `field`, `expected` and `actual`. A missing row
contributes no `drift[]` entries — its `entries[]` state is `missing`. The fix for
any non-`wired` row is the same: re-run the merge above, which rewrites it in place.

**EXECUTE** copy the three hook files first, and DELETE any retired one left by
an older install — copying without deleting leaves a wired-then-unwired `.mjs`
on disk and `status` reports it under `hooks.retired` forever (project, Bash
tool; `SRC` = the directory holding THIS runbook, i.e. the skill's `assets/`):

```
SRC="$(dirname "$RUNBOOK")"
DST="$PWD/.claude/hooks"
mkdir -p "$DST" && \
cp "$SRC/semble-session.mjs" "$SRC/semble-stats.mjs" "$SRC/semble-subagent.mjs" "$DST/" && \
rm -f "$DST/semble-explore.mjs" "$DST/semble-reminder.mjs" "$DST/semble-prefetch.mjs" && \
rm -f "$PWD/.claude/semble/.reminder-ts" "$PWD/.claude/semble/.prefetch-ts" "$PWD/.claude/semble/reminder.json" && \
node --check "$DST/semble-session.mjs" && node --check "$DST/semble-stats.mjs" && \
node --check "$DST/semble-subagent.mjs" && \
echo "✅ copied + verified in $DST" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing.

### Scope

These hooks are project-scoped by design: `semble-session.mjs` and
`semble-subagent.mjs` read `<cwd>/.claude/semble/state.json`, so a **global**
install into `~/.claude/` is inert in every project that has no semble state —
silent, but it still pays a Node start-up per session, spawn and tool call
everywhere. Install per project. If a global
install is nevertheless wanted, the same block runs with
`SETTINGS="$HOME/.claude/settings.json" HOOK_REF="$HOME/.claude/hooks"` (no
`${CLAUDE_PROJECT_DIR}`: the hooks live in the profile, not the project) and
**must go through the Bash tool only**: `~/.claude/*` is harness-protected, so
`Write`/`Edit` are blocked there in every permission mode, including
`bypassPermissions` and headless. The check runs before hooks; nothing can
override it.

### `.gitignore`

`<repo>/.claude/semble/` holds `state.json` and `telemetry.jsonl` (verbatim shell
commands, trimmed at 2 MB), plus the retired hooks' `.reminder-ts`/`.prefetch-ts`/`reminder.json`
on old installs (install/upgrade delete them). So the ignored unit is the DIRECTORY. Install
appends to `<repo>/.gitignore`

```
# brewcode:semble
.claude/semble/
```

and drops the two lines it supersedes — the retired `.claude/semble/.reminder-ts`
of a v1 repo and the per-marker `.claude/semble/.prefetch-ts` of a 5.1.0 one. The
outcome is **verified by re-reading the file**, never inferred from the exit status of the write — a silent "unchanged" over a tracked
marker is exactly how the marker ended up committed.

| `.gitignore` | `<repo>/.git` | Outcome |
|--------------|---------------|---------|
| exists, has the line | — | `unchanged` |
| exists, no line, a repo `.gitignore` rule already ignores the dir | — | `unchanged: already ignored by <source>:<line>:<pattern>`, nothing appended |
| exists, no line | — | append, re-read, confirm the line is there → `changed`, else `failed` |
| absent, a nested repo `.gitignore` rule already ignores the dir | present | `unchanged`, nothing created |
| absent | present | create it with the two lines, re-read, confirm → `changed` |

"Already ignored" = `git check-ignore -v --no-index` on `state.json`, `telemetry.jsonl` and a probe
name in `.claude/semble/` all resolve to a non-negated rule in a repo `.gitignore` (e.g. `/.claude/`,
`.claude/`, `/.claude/*`). `core.excludesFile` and `.git/info/exclude` do NOT count: they are
per-machine, so another clone would still commit `telemetry.jsonl`.
| absent | absent | `skipped`, with the reason spelled out — not a git repo, so there is nothing to ignore and creating a `.gitignore` would be litter |

Uninstall removes exactly those two lines — plus a retired `.reminder-ts`/`.prefetch-ts`
line an older install left — and re-reads to confirm they are gone;
a `.gitignore` created by install is left in place (it may have grown other
entries since).

---

## 5. DISABLE / ENABLE (no file removal)

Do NOT unwire the hooks to mute them. Flip the project state instead:
`enabled:false` (or `phase:"disabled"`) in `<repo>/.claude/semble/state.json`
makes `semble-session.mjs` and `semble-subagent.mjs` go quiet immediately
(`semble-stats.mjs` keeps measuring — it is state-independent by design, so a
disabled period is still visible in the log). They read the state on every call,
so no restart is needed. That is what `/brewcode:semble-setup disable` and `enable` do via
`semble-project.sh`; the rule, the CLAUDE.md block, the hook files and the
settings entries all stay in place.

---

## 6. UNINSTALL

`scripts/semble-guidance.sh remove --part all` — or the equivalent by hand. It
strips settings by all **six** owned basenames, retired ones included, in `args` or a shell-form `command` — **per
hook, inside `entry.hooks[]`**, so a
foreign hook hand-merged into a semble entry survives and the entry is dropped only
once its `hooks[]` is empty — deletes an event array that empties, the
`hooks` object if it empties, only the two permission strings (and `allow` /
`permissions` if they empty), then deletes all six `.mjs` files (the three live
ones and any retired leftover), the managed rule file and the CLAUDE.md marker
range. Foreign hooks and every other
settings key are never touched. A failure-free `--part all` then deletes install's
leftover stubs: `CLAUDE.md` holding only `# CLAUDE.md`, a blank `.gitignore`, empty
`.claude/hooks`/`.claude/rules`. A `settings.json` that held only semble entries is
deleted, never left as `{}`; a read-only one aborts the unwire. Both settings blocks
take the shared `settings.json.lock` dir (`mkdir`, 10 s wait, older than 30 s = stale)
used by the other setup skills, so concurrent merges never erase each other.

> Removing the files without removing the registration is the one failure that
> hurts: Claude Code then runs `node <deleted path>` on every SessionStart and
> every matching tool call. Settings first, files second.

**EXECUTE** using Bash tool (project):

```
export HOOKS_DIR="$PWD/.claude/hooks" SETTINGS="$PWD/.claude/settings.json"
node -e '
const fs=require("fs");
const f=process.env.SETTINGS;
// Uninstall matches on OWNERSHIP, so the retired names stay - a v1 repo that
// never ran the migrating install still has those rows to clean.
const marks=["semble-session.mjs","semble-prefetch.mjs","semble-stats.mjs",
             "semble-reminder.mjs","semble-subagent.mjs","semble-explore.mjs"];
const tools=["mcp__semble_code__search","mcp__semble_code__find_related"];
if(!fs.existsSync(f)){ console.log("no settings to clean: "+f); process.exit(0); }
const l=f+".lock", w=new Int32Array(new SharedArrayBuffer(4));   // same <settings>.lock as the merge
for(let i=0;;i++){
  try{ fs.mkdirSync(l); process.on("exit",()=>{ try{ fs.rmdirSync(l); }catch{} }); break; }
  catch(e){
    if(e.code!=="EEXIST") throw e;
    if(i>=99){ console.error("ABORT: "+l+" is held by another installer; nothing was written"); process.exit(1); }
    try{ if(Date.now()-fs.statSync(l).mtimeMs>30000) fs.rmdirSync(l); }catch{}
    Atomics.wait(w,0,0,100);
  }
}
const raw=fs.readFileSync(f,"utf8");
if(!raw.trim()){ console.log("empty settings, nothing to clean: "+f); process.exit(0); }
let s;
try{ s=JSON.parse(raw); }
catch(e){ console.error("ABORT: "+f+" is not valid JSON ("+e.message+") - fix or delete it; nothing was written"); process.exit(1); }
if(s===null||typeof s!=="object"||Array.isArray(s)){ console.error("ABORT: "+f+" is not a JSON object; nothing was written"); process.exit(1); }
const orig=JSON.stringify(s);
const argsOf=e=>((e&&e.hooks)||[]).flatMap(h=>(h&&h.args)||[]).filter(a=>typeof a==="string");
const isMine=a=>marks.some(m=>a===m||a.endsWith("/"+m)||a.endsWith("\\"+m));
const cmdMine=c=>typeof c==="string"&&marks.some(m=>new RegExp("(^|[\\\\/\"\x27\\s])"+m.replace(/\./g,"\\.")+"([\"\x27\\s]|$)").test(c));
const mine=h=>((h&&h.args)||[]).some(a=>typeof a==="string"&&isMine(a))||cmdMine(h&&h.command);
if(s.hooks&&typeof s.hooks==="object"&&!Array.isArray(s.hooks)){
  for(const ev of Object.keys(s.hooks)){
    if(!Array.isArray(s.hooks[ev])) continue;
    s.hooks[ev]=s.hooks[ev].map(e=>{                                   // same discipline as the merge: strip only
      if(!e||!Array.isArray(e.hooks)) return e;                        // the semble hooks, drop the entry once empty
      const kept=e.hooks.filter(h=>!mine(h));
      if(kept.length===e.hooks.length) return e;
      return kept.length ? Object.assign({},e,{hooks:kept}) : null;
    }).filter(e=>e!==null);
    if(s.hooks[ev].length===0) delete s.hooks[ev];
  }
  if(Object.keys(s.hooks).length===0) delete s.hooks;
}
if(s.permissions&&typeof s.permissions==="object"&&!Array.isArray(s.permissions)){
  if(Array.isArray(s.permissions.allow)){
    s.permissions.allow=s.permissions.allow.filter(x=>!tools.includes(x));
    if(s.permissions.allow.length===0) delete s.permissions.allow;
  }
  if(Object.keys(s.permissions).length===0) delete s.permissions;
}
if(JSON.stringify(s)===orig){ console.log("nothing to clean: "+f); process.exit(0); }
const gone=Object.keys(s).length===0;                  // held only semble entries -> delete, never leave {}
try{ if(gone){ fs.accessSync(f,fs.constants.W_OK); fs.unlinkSync(f); } else fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n"); }
catch(e){ console.error("ABORT: cannot write "+f+" ("+e.code+"); nothing was written"); process.exit(1); }
const back=gone?{}:JSON.parse(fs.readFileSync(f,"utf8"));   // post-write verification
const left=Object.values(back.hooks||{}).flat().filter(e=>((e&&e.hooks)||[]).some(mine)).length;
const perm=((back.permissions&&back.permissions.allow)||[]).filter(x=>tools.includes(x)).length;
if(left!==0||perm!==0){ console.error("ABORT: verification failed - "+left+" hook / "+perm+" permission entries still in "+f); process.exit(1); }
console.log("OK cleaned "+f);
' && rm -f "$HOOKS_DIR/semble-session.mjs" "$HOOKS_DIR/semble-prefetch.mjs" \
     "$HOOKS_DIR/semble-stats.mjs" "$HOOKS_DIR/semble-reminder.mjs" \
     "$HOOKS_DIR/semble-subagent.mjs" "$HOOKS_DIR/semble-explore.mjs" \
  && test ! -e "$HOOKS_DIR/semble-session.mjs" && test ! -e "$HOOKS_DIR/semble-prefetch.mjs" \
  && test ! -e "$HOOKS_DIR/semble-stats.mjs" && test ! -e "$HOOKS_DIR/semble-reminder.mjs" \
  && test ! -e "$HOOKS_DIR/semble-subagent.mjs" && test ! -e "$HOOKS_DIR/semble-explore.mjs" \
  && echo "✅ uninstalled from $HOOKS_DIR" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing.

---

## 7. Verify

Synthetic payloads, no session needed. `<absdir>` = the installed hooks dir,
`<repo>` = a project whose `.claude/semble/state.json` has `"phase":"ready"`:

```
# 1. unconfigured project -> must print {}
echo '{"session_id":"S","cwd":"/tmp","hook_event_name":"SessionStart"}' \
  | node <absdir>/semble-session.mjs; echo " exit=$?"

# 2. ready project -> "semble: ready | cache <8 hex>" + additionalContext
echo '{"session_id":"S","cwd":"<repo>","hook_event_name":"SessionStart"}' \
  | node <absdir>/semble-session.mjs; echo " exit=$?"

# 3. subagent -> one additionalContext line inside the spawned agent
echo '{"session_id":"S","cwd":"<repo>","hook_event_name":"SubagentStart","agent_type":"Explore","agent_id":"a1"}' \
  | node <absdir>/semble-subagent.mjs; echo " exit=$?"

# 4. FAIL-OPEN: garbage stdin -> {} and exit 0
echo 'not json' | node <absdir>/semble-subagent.mjs; echo " exit=$?"

# 5. stats hook is a pure observer -> {} on every event
echo '{"cwd":"<repo>","hook_event_name":"PostToolUse","tool_name":"Read","tool_input":{"file_path":"<repo>/README.md"}}' \
  | node <absdir>/semble-stats.mjs; echo " exit=$?"
```

Full regression: `node tests/suite-hooks.mjs` from the skill dir — it runs the
whole merge/uninstall/hook matrix in an isolated temp HOME and project and never
touches the real `~/.claude` or the repo.

> After install or removal `/reload-plugins` is NOT needed (plain `settings.json`
> hooks, not plugin hooks): Claude Code watches settings files, so wiring changes
> apply to the running session (`/hooks` shows them). State-value changes
> (`enabled`, `phase`) are read live too.
