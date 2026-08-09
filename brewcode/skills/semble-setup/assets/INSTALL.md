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
| `semble-prefetch.mjs` | `<repo>/.claude/hooks/` | UserPromptSubmit | `additionalContext` — top-3 candidate PATHS from a real search |
| `semble-stats.mjs` | `<repo>/.claude/hooks/` | PostToolUse + PostToolUseFailure | **nothing** — appends JSONL telemetry, replies `{}` |

> Retired in 5.0.0: `semble-reminder.mjs` (PreToolUse `Bash`/`Grep`) and
> `semble-explore.mjs` (SubagentStart `Explore`). Both were pure advice and both
> converted at zero; `semble-prefetch.mjs` replaces them. `install` and `upgrade`
> DELETE the two files and un-wire their settings rows — see §4.

> Pure ESM, Node built-ins only, no plugin-root and no npm deps. Each reads
> stdin, never throws, prints exactly one JSON object and exits 0. Only
> `semble-prefetch.mjs` spawns a process, and only a single `uvx … semble search`
> under a hard 3 s `SIGKILL` cap. No hook calls `pgrep` or implies a daemon:
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
| differs | **do not overwrite.** Report `user_modified`, print a unified diff on stderr, exit 0 |

Only `--force` (which the skill passes after an explicit user confirmation in
`install`/`repair`) overwrites, and it takes a `.bak.<epoch>` copy first. Removal
follows the same rule: a managed file is deleted, a user-modified one is backed
up and then deleted.

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
> `rg`/Grep stays for exact identifiers, regexes, paths and exhaustive enumeration.
> Not indexed: `.json`/`.csv`, `.mdx`/`.txt`. Details: `.claude/rules/semble-first.md`.
<!-- END brewcode:semble -->
```

Presence is detected by the literal `<!-- BEGIN brewcode:semble -->`. Re-install
replaces the whole marked range in place — it never appends a second block.
Uninstall deletes the inclusive range plus one trailing blank line, matching on
the exact marker strings, never a regex over the whole file. **BEGIN without END
(or the reverse) reports `malformed marker block` and changes nothing** — fix it
by hand, then re-run.

---

## 3. Hook contracts

### `semble-session.mjs` — SessionStart, no matcher

Reads exactly one file, `<cwd>/.claude/semble/state.json`.

| Condition | Output |
|-----------|--------|
| state file missing or empty | `{}` — total silence. Semble is not configured here; never nag |
| unparseable / not a regular file | `{"systemMessage":"semble: state file is corrupt — run /brewcode:semble-setup status"}` |
| `enabled === false` or `phase === "disabled"` | `semble: disabled for this project` |
| `phase === "awaiting_reload"` | resume nudge + `additionalContext` that verification is pending |
| `phase === "error"` | `semble: error — run /brewcode:semble-setup status` |
| `phase === "ready"` | `semble: ready \| cache <repoHash[0:8]>` + the one-search-then-read directive with `repo=<abs cwd>` |
| any other phase | `semble: <phase>` |

### `semble-prefetch.mjs` — UserPromptSubmit, no matcher

**It replaces the two advisory hooks that shipped before 5.0.0.** They emitted
`additionalContext` telling the model to prefer semble, and converted at
**zero**: 0/18 on the main channel (95% upper bound 15.4%), 0/11 on the
Explore/subagent channel (upper bound 23.8%). Delivery was proven independently
three ways — a transcript `hook_additional_context` attachment record, a canary
session that quoted the injected sentence back verbatim, and 11/11 subagent
initial contexts containing it. The model receives the advice and ignores it.
This hook runs the search itself and hands over the **result** instead: measured
5/6 sessions opened an injected path, 5/6 cited one, at fewer tool calls than
control in 5/6 questions and ~15% lower mean cost.

> **It buys turns and citation precision, not correctness.** All 18 answers were
> correct in all three arms (control, snippet-framing, path-framing). Nothing in
> this skill may claim prefetch makes answers more accurate.

**Advisory only** in the same sense as its predecessors: it emits at most
`hookSpecificOutput.additionalContext`, never `permissionDecision`, never a
deny, never `updatedInput`. It cannot block or rewrite anything.

#### Fail-open is the top-priority property

It runs on **every prompt the user types**. A crash or a hang here is the worst
failure mode in the skill, so every path ends in `{}` on stdout and exit 0:

| Broken input | Behaviour |
|---|---|
| stdin empty / not JSON / not an object | `{}` |
| state file missing, empty, corrupt, a directory | `{}` (skip `no-state` / `corrupt`) |
| `enabled === false`, `phase` `disabled` / `error` / `prereq_ready` | `{}` |
| MCP never registered (`completed` lacks `"mcp"`) | `{}` (skip `no-mcp`) |
| marker file unreadable / malformed JSON | read as `{}` — a corrupt throttle fails **open** |
| marker file unwritable | warn on stderr, continue |
| `uvx` absent (ENOENT) | `{}` + cooldown |
| search exits non-zero, times out, or prints unparseable output | `{}` + cooldown |
| telemetry file unwritable | swallowed; behaviour identical |
| anything else thrown | caught in `main`, `{}` |

Timing is bounded twice. The child is spawned with
`timeout: 3000, killSignal:'SIGKILL'` — under the registered hook timeout of 5
seconds — and any failure writes a `cool` marker that parks the mechanism for
**600 s**. That is what makes a **cold or absent index** safe: semble builds
lazily inside the call and a first build takes minutes, so without the cooldown
every prompt would burn the full 3 s cap. With it the cost is one 3 s stall per
ten minutes until the MCP server has warmed the same cache directory. A separate
`t` marker throttles successful firings to one per **30 s** (anti-storm, not a
rate limiter — the gate already suppresses ~64% of prompts).

Both live in ONE file, `<cwd>/.claude/semble/.prefetch-ts`, holding
`{"t":<epoch-ms>,"cool":<epoch-ms>}`, so the install needs exactly one
`.gitignore` line.

#### Decision order

`stateGate` -> cooldown -> throttle -> `gateV3` -> `distill` -> `search` ->
render. Each step that stops emits exactly one telemetry record with the reason
token, so every silent prompt is attributable to the clause that silenced it.

#### Gate v3 — `INTENT and (DOMAIN or REPOREF)`, minus four suppressors

| Clause | Meaning |
|---|---|
| `INTENT` | an interrogative or an investigative verb, EN + RU |
| `DOMAIN` | a code noun, a backticked span, `snake_case`/`camelCase`, a `.ext` filename, `fn()`, or a path |
| `REPOREF` | the prompt anchors to THIS repo (`в проекте`, `our codebase`, `у нас`) without naming a code noun |
| S1 `self-reference` | about this conversation or what the assistant just did — the answer is in context, not on disk |
| S2 `exact-literal` | an exact path, filename or quoted literal — rg territory (rg won 2/2, 20x faster) |
| S3 `enumeration` | exhaustive listing/counting — rg won 5/5, semble 2/5 |
| S4 `task-reference` | a numbered task or section from the tracker, not code |

Plus the cheap pre-filters `empty`, `slash-command`, `codeword-only`,
`meta-reply`, `too-short` (<30 chars), `too-long` (>2000), `bare-url`,
`bare-path`.

`REPOREF` is the whole of v3. v1 required a code-domain noun, which a
vocabulary-mismatch question by construction never has, and that one clause was
what capped recall.

Two details are load-bearing and were measured that way — changing either
invalidates the numbers below:

- **The four suppressors read the WHOLE trimmed prompt**, codewords included,
  while `INTENT`/`DOMAIN`/`REPOREF` read the codeword-stripped body. A `++m`
  prefix must never flip a verdict.
- The `SELF` regex exempts `как ты думаешь` (an opinion, not a question about the
  transcript) and includes the profanity forms that actually occur in the corpus.

Measured on 61 real user prompts:

| fires | precision | recall | F1 | confusion |
|---|---|---|---|---|
| 22 / 61 (36%) | 55% | 71% | 0.62 | tp 12, fp 10, fn 5, tn 34 |

**55% is the honest ceiling of lexical rules** — roughly half of the firings are
pure overhead. That is affordable only because a firing costs one ~0.6 s search
and ~90 tokens. Do not "improve" the gate without re-running the 61-prompt
corpus.

#### Distiller

The prompt is reduced to at most 9 keywords: code-shaped tokens first
(backticked spans, `.ext` filenames, `kebab`/`snake`, `camelCase`), then content
words minus a bilingual stop-list. Measured against handing semble the raw
prompt: **hit@3 11/16 vs 9/16, MRR 0.674 vs 0.398, paired 8 wins / 3 losses /
5 ties.** The assumption that rewriting the query would hurt is refuted.

#### The search, and why its flags are frozen

```
uvx --from 'semble[mcp]==0.5.4' semble search <query> <cwd> \
    --content code docs config -k 3 --max-snippet-lines 0
```

`PIN_SPEC` and `CONTENT_ARGS` MUST stay byte-identical to the MCP registration
written by `semble-mcp.sh` (`SEMBLE_PIN_SPEC`, `SEMBLE_CONTENT_ARGS` in
`scripts/lib/semble-common.sh`). semble keys its cache directory by project path
ALONE but rejects a cached index whose content-type set differs, so a mismatched
set here would make the hook and the server evict each other's index on every
alternation. `tests/suite-hooks.mjs` asserts the two agree.

`null` from `search()` means "could not be trusted" and starts the cooldown;
`[]` means the search ran and found nothing, which is **not** a failure and must
not park the mechanism.

#### The framing — paths, never snippets

```
Retrieval note (automatic, from a semantic index of THIS repository, built by semble over the working tree).
These candidate locations were ranked for the question above before you started:
  1. path/to/file.ext:120
  2. ...
  3. ...

Open the candidates that look right BEFORE running any search of your own; they are already ranked.
If none of them answers the question, say so and search normally.
Name the file you actually used in your answer.
```

Three parts, all load-bearing: named **provenance** (what produced this and from
what), bare **paths** with no snippet, and an explicit **directive** that
includes permission to reject the candidates.

The snippet exclusion is empirical, not stylistic. With 5 hits carrying
path + lines + snippet and no directive, conversion was **2/6**, and in **2/6
sessions the model answered with ZERO tool calls** straight off the snippets —
the snippet SUBSTITUTES for verification. Three bare paths plus a directive
provoke the read instead. **Never add `content` to this output.**

#### Latency

semble search 727 ms median / 734 ms p90 on a warm index; the hook measured
736 ms when it fires and **2 ms when the gate suppresses** — the common case
costs nothing.

### `semble-stats.mjs` — PostToolUse + PostToolUseFailure, matcher list

The measurement hook. The other two can only prove they *ran*; this one is the
only place where a completed `mcp__semble_code__*` call is observable and the
only place where an opened FILE is observable, so it is what turns "prefetch
fired" into "prefetch converted".

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
otherwise. `agent_id` alone would be the strictly correct test (a `--agent`
session's main thread carries `agent_type` but no `agent_id`), but
`semble-prefetch.mjs` uses the both-keys test and the conversion metric joins a
`prefetch` to a later `open` on this field — the two writers agreeing matters
more than either being right about `--agent` sessions. **Change both or neither.**

`Explore` is deliberately absent from the matcher: it is an agent *type*, not a
tool name — the tool is `Agent` (with `Task` as an alias). Counting `Agent` would
double-count, because the subagent's own `Bash`/`Grep` calls already arrive here
tagged `agent:"sub"`.

Search-shaped filter for the denominator: `Grep` and `Glob` are search tools by
definition and always count. A `Bash` call counts only when `SEARCH_RE` matches
it, so numerator and denominator use one definition of "search-shaped".

`Read` is in the matcher for **one** reason: prefetch conversion. It is never
counted as a search — semble does not displace opening a known file. Every
`Read` emits `ev:"open"` carrying the path in **both** repo-relative (`f`) and
absolute (`abs`) form, because `semble-prefetch.mjs` logs semble's repo-relative
`file_path` while Claude Code reads with an absolute path, and the reader has no
`cwd` at read time. Without this record the conversion number would only ever
exist while somebody was replaying transcripts by hand.

---

## 3a. Telemetry contract

File: `<repo>/.claude/semble/telemetry.jsonl`. One JSON object per line, appended
with a **single `appendFileSync(path, JSON.stringify(rec) + "\n")`** — never
read-modify-write, so concurrent hooks cannot interleave a partial record.

Every record carries `ts` (`new Date().toISOString()`), `ev`, `src`, and `sid`
(the hook input's `session_id`, or `""`).

| `ev` | `src` | Extra fields |
|------|-------|--------------|
| `prefetch` | `prefetch` | `fired` (bool) — **exactly one record per prompt that reached the hook**. When `false`: `why` = the clause that stopped it, plus `phase`/`enabled` on a state skip and `q`/`ms` on `search-failed`/`no-hits`. When `true`: `why` (always `behaviour-or-vocab`), `q` (≤120 chars, the DISTILLED query), `n` (hit count, 1..3), `ms` (whole-hook latency), `paths` (the injected repo-relative paths, in rank order) |
| `open` | `stats` | `f` (repo-relative path, ≤200 chars), `abs` (absolute path, ≤200 chars), `agent` — one per `Read` |
| `call` | `stats` | `tool` (full MCP name), `ok` (bool), `ms` (int, **omitted** when the payload had no `duration_ms`), `agent` |
| `search` | `stats` | `tool`, `q` (≤120 chars), `agent` |

Retired in 5.0.0: `ev:"gate"` and `ev:"nudge"` with `src` `reminder`/`explore`.
The reader still tolerates them in an old log and reports them under a
`[retired hooks]` label; nothing writes them any more.

**The conversion join — computable from the log alone, no re-run.** For each
`prefetch` record with `fired:true`, an injected path CONVERTED when some later
`open` record in the SAME `sid` (strictly `open.ts > prefetch.ts`) has an `f` or
`abs` ending in that path. `semble-status.sh --section telemetry` reports it as
`prefetchConversion`: `pathsInjected`/`pathsOpened`/`pathPct` (per candidate) and
`injectedSessions`/`openedSessions`/`sessionPct` (per session). The
post-release headline number is **sessionPct: the fraction of sessions where an
injected candidate was subsequently opened** — the same quantity that measured
5/6 in the pre-release trial.

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

`<absdir>` = absolute path of the hooks dir the three files were copied into
(`<repo>/.claude/hooks`).

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "node", "args": ["<absdir>/semble-session.mjs"], "timeout": 5 } ] }
    ],
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "node", "args": ["<absdir>/semble-prefetch.mjs"], "timeout": 5 } ] }
    ],
    "PostToolUse": [
      { "matcher": "mcp__semble_code__search|mcp__semble_code__find_related|Bash|Grep|Glob|Read", "hooks": [ { "type": "command", "command": "node", "args": ["<absdir>/semble-stats.mjs"], "timeout": 5 } ] }
    ],
    "PostToolUseFailure": [
      { "matcher": "mcp__semble_code__search|mcp__semble_code__find_related|Bash|Grep|Glob|Read", "hooks": [ { "type": "command", "command": "node", "args": ["<absdir>/semble-stats.mjs"], "timeout": 5 } ] }
    ]
  },
  "permissions": {
    "allow": ["mcp__semble_code__search", "mcp__semble_code__find_related"]
  }
}
```

`timeout` is in SECONDS and is **not optional**: an entry without it inherits
Claude Code's 600 s default, so a hung `node` on `UserPromptSubmit` would stall
every prompt for 10 minutes. 5 s is ~7x the measured p90 of the one hook that
does real work (`semble-prefetch.mjs`, which caps its own child at 3 s) and
~500x the runtime of the other two.

The marker for all semble entries is `args` containing a path whose basename is
one of the **five names this skill has ever owned** —
`semble-session.mjs`, `semble-prefetch.mjs`, `semble-stats.mjs` and the retired
`semble-reminder.mjs`, `semble-explore.mjs`. Ownership (`marks`) and desire
(`live`) are deliberately SEPARATE lists: `wanted` is built from `live` only, so
a retired hook sitting at the CURRENT hooks dir is stale by construction and the
step-2 purge removes it. Building `wanted` from `marks` — the pre-5.0.0 bug —
made every retired row survive forever. A retired basename must never leave
`marks`, or an old install becomes unowned and unremovable. This is also exactly why the
`{hooks:[{type,command:"node",args:[abs],timeout}]}` form is mandatory. An entry
written as `command: "node /abs/x.mjs"` has no `args` and would be invisible to
both the stale-path purge and the uninstall.

### Merge rule, in order — do not reorder

1. **ABORT if `settings.json` exists and is not valid JSON.** Never rewrite a
   file you could not parse; that turns one stray comma into total data loss.
   Nothing is written, exit 1.
2. Drop semble hooks whose `args` path points at a **different** hooks dir
   (stale installs — Claude Code logs a hook failure on every tool call for each
   of them). Match on the FULL path, not the basename. The filter runs **inside
   `entry.hooks[]`, not over the entry array**: a hand-merged entry may hold a
   foreign hook next to a stale semble one, and only the semble one may go. An
   entry dies only once its `hooks[]` is empty. A hook with no semble arg is
   foreign and is **never** touched.
3. **Reconcile each want row against the file — the merge repairs, it does not
   only append.** The key is `event + matcher + full path` (`semble-stats.mjs`
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
   `SessionStart` entry, exactly 1 `UserPromptSubmit` entry, exactly 1
   `PostToolUse`/`<stats matcher>`, exactly 1 `PostToolUseFailure`/`<stats
   matcher>`, each carrying exactly one semble hook deep-equal to the desired
   hook, and each tool name present exactly once in `permissions.allow`.
   Anything else exits 1. The pre-write check is the load-bearing one: a
   post-write-only assert reports the failure *after* it has already saved the
   bad file.
6. **Delete events the purge emptied.** `PreToolUse` and `SubagentStart` exist in
   a v1-shaped settings file only to carry the retired hooks; once step 2 has
   emptied them and they are not in the want table, the empty arrays are removed
   rather than left as `[]` litter. An event that still holds a foreign hook is
   left alone.

**EXECUTE** merge (project, Bash tool). `SETTINGS`/`HOOKS_DIR` are the only
inputs; this is the canonical block — use it, not a hand `Edit`, because it is
the only path that aborts on a broken file, repairs drift, and verifies both
before and after writing:

```
SETTINGS="$PWD/.claude/settings.json" HOOKS_DIR="$PWD/.claude/hooks" node -e '
const fs=require("fs"), path=require("path");
const f=process.env.SETTINGS, dir=process.env.HOOKS_DIR;
// EVERY basename this skill has ever owned - ownership, for isMine/purge/uninstall.
const marks=["semble-session.mjs","semble-prefetch.mjs","semble-stats.mjs",
             "semble-reminder.mjs","semble-explore.mjs"];   // last two retired in 5.0.0
// What is wanted NOW. `wanted` is built from THIS list, not from marks - that is
// what makes a retired hook at the current dir stale and purges it.
const live=["semble-session.mjs","semble-prefetch.mjs","semble-stats.mjs"];
const STATS="mcp__semble_code__search|mcp__semble_code__find_related|Bash|Grep|Glob|Read";
const want=[["SessionStart",null,"semble-session.mjs",5],
            ["UserPromptSubmit",null,"semble-prefetch.mjs",5],
            ["PostToolUse",STATS,"semble-stats.mjs",5],
            ["PostToolUseFailure",STATS,"semble-stats.mjs",5]];
const tools=["mcp__semble_code__search","mcp__semble_code__find_related"];
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
const wanted=new Set(live.map(m=>path.join(dir,m)));   // live, NOT marks
const desiredHook=(full,timeout)=>({type:"command",command:"node",args:[full],timeout});
const hasArg=(h,full)=>((h&&h.args)||[]).filter(a=>typeof a==="string").includes(full);
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
  let dirty=false;
  const hooks=e.hooks.map(h=>{ if(!hasArg(h,full)||deq(h,w)) return h; dirty=true; return w; });
  return dirty?Object.assign({},e,{hooks}):e;
};
const stripHook=(e,full)=>{                            // 2nd+ copy of a row: drop only my hook
  const kept=e.hooks.filter(h=>!hasArg(h,full));
  if(kept.length===e.hooks.length) return e;
  return kept.length?Object.assign({},e,{hooks:kept}):null;
};
const verify=root=>{                                   // 5. null | message; run BEFORE the write
  for(const [ev,matcher,script,timeout] of want){
    const full=path.join(dir,script);
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
for(const ev of Object.keys(s.hooks)){                 // 2. drop stale-path semble hooks, keep foreign ones
  if(!Array.isArray(s.hooks[ev])) continue;
  s.hooks[ev]=s.hooks[ev].map(e=>{                     // filter INSIDE hooks[]: a hand-merged entry
    if(!e||!Array.isArray(e.hooks)) return e;          // may hold a foreign hook next to a stale one
    const kept=e.hooks.filter(h=>{
      const mine=((h&&h.args)||[]).filter(a=>typeof a==="string").filter(isMine);
      return mine.length===0 || mine.every(a=>wanted.has(a));
    });
    if(kept.length===e.hooks.length) return e;
    return kept.length ? Object.assign({},e,{hooks:kept}) : null;   // entry dies only when empty
  }).filter(e=>e!==null);
}
for(const [ev,matcher,script,timeout] of want){        // 3. reconcile THIS event+matcher, do not merely append
  s.hooks[ev]=Array.isArray(s.hooks[ev])?s.hooks[ev]:[];
  const full=path.join(dir,script);
  let seen=0;
  s.hooks[ev]=s.hooks[ev].map(e=>{
    if(!e||!Array.isArray(e.hooks)||matcherOf(e)!==matcher||!argsOf(e).includes(full)) return e;
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
fs.mkdirSync(path.dirname(f),{recursive:true});
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
  "entries": [ { "event": "UserPromptSubmit", "matcher": null,
                 "script": "semble-prefetch.mjs", "count": 1, "state": "drifted" } ],
  "drift":   [ { "event": "UserPromptSubmit", "matcher": null,
                 "script": "semble-prefetch.mjs", "field": "timeout",
                 "expected": 5, "actual": 5000 } ],
  "retired": ["semble-reminder.mjs"]
}
```

`hooks.session.wired` / `hooks.prefetch.wired` / `hooks.stats.wired` and
`hooks.wiredCount` mean **present AND conforming** — a row
with `"timeout": 5000` is `drifted`, counted in `driftedCount`, and is **not**
counted as wired. Reporting it as fully wired is what let two installs sit broken
for days. `wantCount` is the want table's length, so `wiredCount/wantCount` is the
only ratio worth printing — never a hard-coded denominator.

`stats.wired` needs both post-tool events. A half-wired pair is not wired.

`hooks.retired` lists retired basenames still present in `<repo>/.claude/hooks/`.
Non-empty means the migration has not run in this repo yet; `install` and
`upgrade` delete the files and the purge un-wires their rows.

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
cp "$SRC/semble-session.mjs" "$SRC/semble-prefetch.mjs" "$SRC/semble-stats.mjs" "$DST/" && \
rm -f "$DST/semble-reminder.mjs" "$DST/semble-explore.mjs" && \
node --check "$DST/semble-session.mjs" && node --check "$DST/semble-prefetch.mjs" && \
node --check "$DST/semble-stats.mjs" && \
echo "✅ copied + verified in $DST" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing.

### Scope

These hooks are project-scoped by design: `semble-session.mjs` and
`semble-prefetch.mjs` read `<cwd>/.claude/semble/state.json`, so a **global**
install into `~/.claude/` is inert in every project that has no semble state —
silent, but it still pays a Node start-up per prompt and per tool call
everywhere. Install per project. If a global
install is nevertheless wanted, the same block runs with
`SETTINGS="$HOME/.claude/settings.json" HOOKS_DIR="$HOME/.claude/hooks"` and
**must go through the Bash tool only**: `~/.claude/*` is harness-protected, so
`Write`/`Edit`/`MultiEdit` are blocked there in every permission mode, including
`bypassPermissions` and headless. The check runs before hooks; nothing can
override it.

### Throttle marker and `.gitignore`

`semble-prefetch.mjs` writes `<repo>/.claude/semble/.prefetch-ts` next to the
state file: ONE file holding `{"t":<epoch-ms>,"cool":<epoch-ms>}` — the 30 s
throttle and the 600 s failure cooldown share it precisely so the install needs
exactly ONE ignore line. Install appends

```
# brewcode:semble
.claude/semble/.prefetch-ts
```

and, migrating a v1 repo, drops the retired `.claude/semble/.reminder-ts` line.

to `<repo>/.gitignore`. The outcome is **verified by re-reading the file**, never
inferred from the exit status of the write — a silent "unchanged" over a tracked
marker is exactly how the marker ended up committed.

| `.gitignore` | `<repo>/.git` | Outcome |
|--------------|---------------|---------|
| exists, has the line | — | `unchanged` |
| exists, no line | — | append, re-read, confirm the line is there → `changed`, else `failed` |
| absent | present | create it with the two lines, re-read, confirm → `changed` |
| absent | absent | `skipped`, with the reason spelled out — not a git repo, so there is nothing to ignore and creating a `.gitignore` would be litter |

Uninstall removes exactly those two lines — plus the retired `.reminder-ts` line
if a v1 install left one — and re-reads to confirm they are gone;
a `.gitignore` created by install is left in place (it may have grown other
entries since).

---

## 5. DISABLE / ENABLE (no file removal)

Do NOT unwire the hooks to mute them. Flip the project state instead:
`enabled:false` (or `phase:"disabled"`) in `<repo>/.claude/semble/state.json`
makes `semble-session.mjs` and `semble-prefetch.mjs` go quiet immediately
(`semble-stats.mjs` keeps measuring — it is state-independent by design, so a
disabled period is still visible in the log). They read the state on every call,
so no restart is needed. That is what `/brewcode:semble-setup disable` and `enable` do via
`semble-project.sh`; the rule, the CLAUDE.md block, the hook files and the
settings entries all stay in place.

---

## 6. UNINSTALL

`scripts/semble-guidance.sh remove --part all` — or the equivalent by hand. It
strips settings by all **five** owned basenames, retired ones included — **per
hook, inside `entry.hooks[]`**, so a
foreign hook hand-merged into a semble entry survives and the entry is dropped only
once its `hooks[]` is empty — deletes an event array that empties, the
`hooks` object if it empties, only the two permission strings (and `allow` /
`permissions` if they empty), then deletes all five `.mjs` files (the three live
ones and any retired leftover), the managed rule file and the CLAUDE.md marker
range. Foreign hooks and every other
settings key are never touched.

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
             "semble-reminder.mjs","semble-explore.mjs"];
const tools=["mcp__semble_code__search","mcp__semble_code__find_related"];
if(!fs.existsSync(f)){ console.log("no settings to clean: "+f); process.exit(0); }
const raw=fs.readFileSync(f,"utf8");
if(!raw.trim()){ console.log("empty settings, nothing to clean: "+f); process.exit(0); }
let s;
try{ s=JSON.parse(raw); }
catch(e){ console.error("ABORT: "+f+" is not valid JSON ("+e.message+") - fix or delete it; nothing was written"); process.exit(1); }
if(s===null||typeof s!=="object"||Array.isArray(s)){ console.error("ABORT: "+f+" is not a JSON object; nothing was written"); process.exit(1); }
const argsOf=e=>((e&&e.hooks)||[]).flatMap(h=>(h&&h.args)||[]).filter(a=>typeof a==="string");
const isMine=a=>marks.some(m=>a===m||a.endsWith("/"+m)||a.endsWith("\\"+m));
if(s.hooks&&typeof s.hooks==="object"&&!Array.isArray(s.hooks)){
  for(const ev of Object.keys(s.hooks)){
    if(!Array.isArray(s.hooks[ev])) continue;
    s.hooks[ev]=s.hooks[ev].map(e=>{                                   // same discipline as the merge: strip only
      if(!e||!Array.isArray(e.hooks)) return e;                        // the semble hooks, drop the entry once empty
      const kept=e.hooks.filter(h=>!((h&&h.args)||[]).filter(a=>typeof a==="string").some(isMine));
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
fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n");
const back=JSON.parse(fs.readFileSync(f,"utf8"));      // post-write verification
const left=Object.values(back.hooks||{}).flat().filter(e=>argsOf(e).some(isMine)).length;
const perm=((back.permissions&&back.permissions.allow)||[]).filter(x=>tools.includes(x)).length;
if(left!==0||perm!==0){ console.error("ABORT: verification failed - "+left+" hook / "+perm+" permission entries still in "+f); process.exit(1); }
console.log("OK cleaned "+f);
' && rm -f "$HOOKS_DIR/semble-session.mjs" "$HOOKS_DIR/semble-prefetch.mjs" \
     "$HOOKS_DIR/semble-stats.mjs" "$HOOKS_DIR/semble-reminder.mjs" "$HOOKS_DIR/semble-explore.mjs" \
  && test ! -e "$HOOKS_DIR/semble-session.mjs" && test ! -e "$HOOKS_DIR/semble-prefetch.mjs" \
  && test ! -e "$HOOKS_DIR/semble-stats.mjs" && test ! -e "$HOOKS_DIR/semble-reminder.mjs" \
  && test ! -e "$HOOKS_DIR/semble-explore.mjs" \
  && echo "✅ uninstalled from $HOOKS_DIR" || echo "❌ FAILED"
```

> **STOP if ❌** — fix before continuing.

---

## 7. Verify

Synthetic payloads, no session needed. `<absdir>` = the installed hooks dir,
`<repo>` = a project whose `.claude/semble/state.json` has `"phase":"ready"`:

```
# 1. unconfigured project -> must print {} (both hooks)
echo '{"session_id":"S","cwd":"/tmp","hook_event_name":"SessionStart"}' \
  | node <absdir>/semble-session.mjs; echo " exit=$?"
echo '{"session_id":"S","cwd":"/tmp","hook_event_name":"UserPromptSubmit","prompt":"where is the session state written and how is it read back"}' \
  | node <absdir>/semble-prefetch.mjs; echo " exit=$?"

# 2. ready project -> "semble: ready | cache <8 hex>" + additionalContext
echo '{"session_id":"S","cwd":"<repo>","hook_event_name":"SessionStart"}' \
  | node <absdir>/semble-session.mjs; echo " exit=$?"

# 3. gate FIRES -> additionalContext listing up to 3 "path:line" candidates,
#    starting "Retrieval note (automatic, ...". Never a snippet.
echo '{"session_id":"S","cwd":"<repo>","hook_event_name":"UserPromptSubmit","prompt":"where does the installer decide that a managed file was modified by the user"}' \
  | node <absdir>/semble-prefetch.mjs; echo " exit=$?"

# 4. immediately again -> {} (30 s throttle). rm <repo>/.claude/semble/.prefetch-ts
#    to re-arm; that same file holds the 600 s failure cooldown.

# 5. gate SUPPRESSED -> {} (exact literal is rg territory)
echo '{"session_id":"S","cwd":"<repo>","hook_event_name":"UserPromptSubmit","prompt":"where is scripts/semble-guidance.sh referenced from"}' \
  | node <absdir>/semble-prefetch.mjs; echo " exit=$?"

# 6. FAIL-OPEN, the property that matters most. Every one of these must print
#    exactly {} and exit 0 - test by breaking things, not by asserting success.
echo 'not json'   | node <absdir>/semble-prefetch.mjs; echo " exit=$?"   # garbage stdin
echo '[]'         | node <absdir>/semble-prefetch.mjs; echo " exit=$?"   # wrong root type
echo ''           | node <absdir>/semble-prefetch.mjs; echo " exit=$?"   # empty stdin
printf '%s' '{"cwd":"<repo>","hook_event_name":"UserPromptSubmit","prompt":"how does the cache key get derived from the project path"}' \
  | PATH=/nonexistent node <absdir>/semble-prefetch.mjs; echo " exit=$?"  # no uvx -> cooldown

# 7. stats hook is a pure observer -> {} on every event
echo '{"cwd":"<repo>","hook_event_name":"PostToolUse","tool_name":"Read","tool_input":{"file_path":"<repo>/README.md"}}' \
  | node <absdir>/semble-stats.mjs; echo " exit=$?"
```

Full regression: `node tests/suite-hooks.mjs` from the skill dir — it runs the
whole merge/uninstall/hook matrix in an isolated temp HOME and project and never
touches the real `~/.claude` or the repo.

> After install or removal `/reload-plugins` is NOT needed (plain `settings.json`
> hooks, not plugin hooks), but Claude Code loads hook config at session start —
> a NEW session is required for wiring changes. State-value changes (`enabled`,
> `phase`) are read live and need no restart.
