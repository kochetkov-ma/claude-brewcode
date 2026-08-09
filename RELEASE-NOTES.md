# Release Notes

---

## v5.2.2 (2026-08-09)

> Docs: [convention](https://doc-claude.brewcode.app/brewcode/skills/convention/) | [rules](https://doc-claude.brewcode.app/brewcode/skills/rules/) | [teams-setup](https://doc-claude.brewcode.app/brewcode/skills/teams-setup/) | [docsync-setup](https://doc-claude.brewcode.app/brewdoc/skills/docsync-setup/) | [memory-sync-setup](https://doc-claude.brewcode.app/brewdoc/skills/memory-sync-setup/)

> A duplication audit across all 26 skills. Most of what it found was deliberate structure, not redundancy — the entries below are the cases where it found a real defect.

### brewcode

#### Fixed

- **Three scripts stamped a placeholder version instead of hard-failing.** `convention/scripts/convention.sh`, `rules/scripts/rules.sh` and `teams-setup/scripts/verify-team.sh` fell back to `unknown` (or a literal `X.Y.Z`) when the version could not be resolved from `plugin.json`, and stamped it unguarded — the exact failure their five sibling scripts carry a comment warning about, because `sort -V` then reports a confident `AHEAD unknown > X.Y.Z` and staleness detection inverts. All three now use the reference gate and hard-fail. `memory-sync-setup/scripts/generate.sh` is untouched: its `unknown` is a guarded sentinel, checked before use

### brewdoc

#### Fixed

- **`hooks/lib/utils.mjs` was a dead, drifting copy** of `brewtools/hooks/lib/utils.mjs`. brewdoc registers no hooks (`hooks.json` is `{"hooks":{}}`) and nothing imported it — verified zero importers before removal. Deleted; a stale second copy of a logger can no longer be mistaken for the live one
- **`README.md` claimed neither brewdoc setup skill implements `enable`/`disable`.** Both do, and have since v5.1.0 — `docs/commands.md:25` already said so. The sentence and both Arguments cells now match the skills' own `argument-hint`

---

## v5.2.1 (2026-08-09)

> Docs: [semble-setup](https://doc-claude.brewcode.app/brewcode/skills/semble-setup/) | [setup-status](https://doc-claude.brewcode.app/brewcode/skills/setup-status/)

### brewcode

#### Fixed

- **The cache-staleness check was lying on every project.** Both readers compared `metadata.content_type` against a hardcoded `"code,config"` — a literal left over from before the corpus gained `docs`, while the server actually runs `--content code docs config` (sorted: `code,config,docs`). Every project therefore reported `cache: ... | mismatch`, and since that check returns early, the file-mtime freshness loop behind it never ran: `fresh`/`stale` was dead code in practice. The expected set now derives from `SEMBLE_CONTENT_ARGS` in `scripts/lib/semble-common.sh` through a new `sc_content_set_csv()` helper, so the two can no longer drift. Live proof: the status line went from `mismatch` to a genuine `stale`
- **`semble-project.sh` carried an invalid inline shellcheck directive at line 249** that aborted shellcheck's parse of the whole file — and of everything sourced through it. Removed; the file and its dependencies lint again
- **Coverage:** `tests/suite-core.mjs` gains 6 assertions pinning the derived content set, 329 -> 335, all 7 suites green
- **End-to-end hook delivery re-validated** against a 26-file fixture project on CC 2.1.226: 5 of the 6 registrations delivered at 100% — SessionStart 3/3, UserPromptSubmit 1/1, PreToolUse 1/1 (joined by `tool_use_id`), SubagentStart 2/2 (joined by `agent_id`), PostToolUse 18 records with no delivery by design. `PostToolUseFailure` had no failure to fire on in the window, so it is unproven rather than failed. Zero emitted-but-undelivered payloads

---

## v5.2.0 (2026-08-09)

> Docs: [semble-setup](https://doc-claude.brewcode.app/brewcode/skills/semble-setup/) | [setup-status](https://doc-claude.brewcode.app/brewcode/skills/setup-status/) | [full-setup](https://doc-claude.brewcode.app/full-setup/)

### brewcode

#### Added

- **semble-setup: the two advisory hooks are back, and this time delivery is proven rather than assumed.** `semble-reminder.mjs` returns on `PreToolUse` with the single matcher `Bash|Grep`; `semble-subagent.mjs` is new and replaces `semble-explore.mjs` on `SubagentStart`. The want-table goes from **3 hook files / 4 settings entries to 5 files / 6 entries**, all still `timeout: 5` (seconds), and status now prints `hooks <n>/6 wired`
- **`semble-subagent.mjs` carries NO `matcher` key at all.** An absent matcher is what matches every agent type — `"*"` would have been wrong. `semble-explore.mjs` was pinned to `agent_type === 'Explore'` and reached exactly one of them; the replacement was verified live on `Explore`, `Plan` and `general-purpose`, all three quoting the injected text back verbatim
- **The reminder counter is PROJECT-GLOBAL and survives across sessions.** It is not per-session state: a fresh session inherits the residual phase, so the nudge may land on the very first search or only on the fifth. "Every fifth search" is a property of the project, not of the session — documented on the skill page, in `SKILL.md` and in the README

#### Fixed

- **The v5.0.0 retirement rationale was withdrawn: `0/18` measured nothing.** The claim was "0 of 18 conversion on the main channel with delivery independently confirmed". The reminder hook fired **zero times** across those 18 sessions — its own `isExactIntent` gate, self-described as biased to silence, suppressed 74 of 113 evaluations, 37 were `disabled` and 2 throttled, for a lifetime rate of 14 nudges in 2718 evaluations (0.52%). The denominator 18 counted trial *sessions*, not deliveries. `0/11` on the subagent channel WAS a real measurement, but of a single agent type and of text that undercut itself with the phrase "this is a reminder, not a block". The delivery channel itself was never broken: in the CC 2.1.226 binary `PreToolUse` and `SubagentStart` both accept `additionalContext` in the zod union and both reach the model over the same unfiltered path
- **Cadence replaces the throttle.** The 600-second timer and its `.claude/semble/.reminder-ts` marker are retired for good. The hook now fires on every Nth **eligible** search, `N = state.reminderEvery` (default 5), counted in `.claude/semble/reminder.json` with an atomic write and a reset on corruption. Ineligible calls never advance the counter
- **The gate keeps only the strong suppressors** — `-l`/`-L`/`-c`/`-o` and their long forms, `output_mode: files_with_matches|count` on the native `Grep`, `find`/`bfs` filename predicates, a pattern containing `/`, a filename-shaped pattern. Suppression on regex metacharacters, `-F`/`-w`, piping into `wc`/`sort` and short patterns is gone. Replayed on the real historical stream of 2543 recorded search calls: the old gate let 229 through and fired 32; the new one lets 1023 through and fires 204
- **Conversion is now reported per source, not pooled.** `conversion.bySource` splits `session`/`reminder`/`subagent`/`prefetch`/`explore`, each with its own explicit `measure` (`injected-path-opened` for prefetch, `semble-call-after` for the rest). The old single denominator let 126 `SessionStart` firings drown every other channel. A channel that never fired prints `0/0` instead of vanishing — `0/0` is "never delivered", `0/N` is "delivered and ignored", and only the second is evidence about the advice
- **`install` stages every hook asset before wiring it.** The asset is copied to a temporary path, `node --check`ed there, and only then moved into place; `prune_want_table()` drops any row whose file did not land. A corrupt asset can no longer be installed and registered in `settings.json`
- **The settings merge is a reconcile, not an append.** `wanted` is keyed on (event, matcher, path) triples, so a v1-shaped repo has its `SubagentStart`/`Explore` row **replaced** rather than left beside the new one, and its two `PreToolUse` rows (`Bash`, `Grep`) collapse into the single `Bash|Grep` row
- **`.gitignore` gets the directory `.claude/semble/`, not one marker file.** `telemetry.jsonl` (verbatim shell commands and distilled prompt text, trimmed at 2 MB), `state.json` and `reminder.json` all live there and were previously uncovered
- **`semble-prefetch.mjs` argv order corrected** — options first, then `--`, then `query cwd`. A leading-dash one-token query was parsed by argparse as an option, failed, and armed the 600-second cooldown. A completed-but-empty search now writes the marker too, so `no-hits` arms the 30-second throttle and never the cooldown
- **Documentation reconciled at every level against the six-entry world** — `semble-setup.mdx`, `setup-status.mdx`, `full-setup.mdx`, both skill READMEs, `references/output-contract.md` (printed verbatim on every invocation, so its `n/4` legend shipped to the user on each run), `references/hooks-roadmap.md`, `assets/INSTALL.md`, `brewcode/docs/file-tree.md`, and the stale header comments in `semble-guidance.sh`, `semble-state.sh` and `semble-reminder.mjs` (which still claimed it was registered twice)
- **`references/output-contract.md` and the MDX examples now print lines the code can actually emit** — the `agents:` status line was missing the `need patch` field that `semble-status.sh` always writes, and its example numbers contradicted their own Actions text
- **v5.1.0's `setup-status` state list named two verdicts that never existed.** `stale (drift)` and `stale (behind X.Y.Z)` were invented; the four real qualifiers are `stale (X.Y.Z -> A.B.C)`, `stale (legacy stamp)`, `stale (legacy, unstamped)` and `stale (bytes drifted)`. That line in the v5.1.0 body was corrected in place rather than left to mislead
- **`.codex/` mirror generator made shell- and extension-aware.** `/brewcode:x` was blanket-rewritten to `$brewcode:x` including inside `.sh` assets running under `set -eu`, so the mirrored `superreview-setup/generate.sh` died on `uninstall` with an unbound variable and reported `EXIT_CODE=0` — a false success. The mirror's agent count also globbed `-name "*.md"` while codex agents are `.toml`, so it always counted 0 and always printed the DEGRADED warning

#### Changed

- **`suite-integration.mjs` covers all five hook assets** on both the install and the removal path. It previously asserted only three, so an install that silently stopped copying `semble-reminder.mjs` or `semble-subagent.mjs` passed green. Suite total is now 1727 assertions across 7 suites

---

## v5.1.0 (2026-08-09)

> Docs: [semble-setup](https://doc-claude.brewcode.app/brewcode/skills/semble-setup/) | [setup-status](https://doc-claude.brewcode.app/brewcode/skills/setup-status/) | [superreview-setup](https://doc-claude.brewcode.app/brewcode/skills/superreview-setup/) | [teams-setup](https://doc-claude.brewcode.app/brewcode/skills/teams-setup/) | [e2e](https://doc-claude.brewcode.app/brewcode/skills/e2e/) | [rules](https://doc-claude.brewcode.app/brewcode/skills/rules/) | [convention](https://doc-claude.brewcode.app/brewcode/skills/convention/) | [skills](https://doc-claude.brewcode.app/brewcode/skills/skills/) | [brewcode hooks](https://doc-claude.brewcode.app/brewcode/hooks/) | [agent-creator](https://doc-claude.brewcode.app/brewcode/agents/agent-creator/) | [bash-expert](https://doc-claude.brewcode.app/brewcode/agents/bash-expert/) | [hook-creator](https://doc-claude.brewcode.app/brewcode/agents/hook-creator/) | [skill-creator](https://doc-claude.brewcode.app/brewcode/agents/skill-creator/) | [bc-rules-organizer](https://doc-claude.brewcode.app/brewcode/agents/bc-rules-organizer/) | [task-board-setup](https://doc-claude.brewcode.app/brewtools/skills/task-board-setup/) | [manager-setup](https://doc-claude.brewcode.app/brewtools/skills/manager-setup/) | [think-short-setup](https://doc-claude.brewcode.app/brewtools/skills/think-short-setup/) | [agent-deadline-setup](https://doc-claude.brewcode.app/brewtools/skills/agent-deadline-setup/) | [agent-router-setup](https://doc-claude.brewcode.app/brewtools/skills/agent-router-setup/) | [deploy](https://doc-claude.brewcode.app/brewtools/skills/deploy/) | [ssh](https://doc-claude.brewcode.app/brewtools/skills/ssh/) | [text-human](https://doc-claude.brewcode.app/brewtools/skills/text-human/) | [deploy-admin](https://doc-claude.brewcode.app/brewtools/agents/deploy-admin/) | [ssh-admin](https://doc-claude.brewcode.app/brewtools/agents/ssh-admin/) | [text-optimizer](https://doc-claude.brewcode.app/brewtools/agents/text-optimizer/) | [brewtools prompt injection](https://doc-claude.brewcode.app/brewtools/prompt-injection/) | [docsync-setup](https://doc-claude.brewcode.app/brewdoc/skills/docsync-setup/) | [memory-sync-setup](https://doc-claude.brewcode.app/brewdoc/skills/memory-sync-setup/) | [md-to-pdf](https://doc-claude.brewcode.app/brewdoc/skills/md-to-pdf/) | [my-claude](https://doc-claude.brewcode.app/brewdoc/skills/my-claude/) | [full-setup](https://doc-claude.brewcode.app/full-setup/)

> **Two themes.** First, `semble-setup` stops nagging and starts fetching: the two advisory hooks that never once produced a search are deleted, and a prefetch hook that injects real file paths takes their place. Second, every generated and shipped artifact in the suite carries the same four metadata keys — and, more to the point, every `upgrade` can now actually *clear* the stale verdict it is prescribed for. Before this release five setups reported `stale` forever after a successful `upgrade`, and a semble install still shaped like v1 reported `ready` with `nextStep: none`, so nobody mid-migration was ever told to migrate.

### Action required for existing installs

| If you have | Do this | Why |
|-------------|---------|-----|
| `semble-setup` installed in a project | `/brewcode:semble-setup install` once, per project | Migrates you off the two retired hooks and reconciles the settings entries. **There is no manual step** — `install` deletes `semble-reminder.mjs`/`semble-explore.mjs`, purges their settings rows and wires the three live hooks |
| a `semble-setup` install and disk to reclaim | `rm -rf ~/Library/Caches/semble` by hand | Pre-5.0.1 prefetch runs left a stray cache root there, tens of MB depending on repo size. No mode deletes it; the supported cache lives elsewhere |
| `manager-setup`, `task-board-setup`, `superreview-setup`, `memory-sync-setup` or `e2e` installed | run that skill's `upgrade` once | Each one's `upgrade` used to leave the version stamp untouched, so `setup-status` reported `stale` after a successful upgrade, forever. All five now restamp unconditionally |
| `think-short-setup` installed alongside `semble-setup` | `/brewtools:think-short-setup upgrade` | The task hook's family list still named the two hooks retired in 5.0.0 and had never heard of `semble-prefetch.mjs`/`semble-stats.mjs`, so it did not recognise them as family and did not yield to them |
| `docsync-setup` installed | `/brewdoc:docsync-setup upgrade` | Writes the three provenance keys into `config.json` — the only place `setup-status` can read a docsync version from. `enabled`, `threshold_days` and `exclude` are preserved verbatim, so a disabled install stays disabled |
| `agent-deadline-setup` or `agent-router-setup` installed | run that skill's `upgrade` once, per scope | Their configs (`.claude/agent-deadline.json`, `.claude/brewtools/agent-router.json`) gain the three provenance keys in this release. A pre-5.1 config has none, so `status` and `setup-status` report it as unknown/`stale`; only a writing mode (`upgrade`) adds them. Behaviour keys are read back and preserved |
| a `superreview-setup` install | `/brewcode:superreview-setup upgrade` | Repairs retroactively: the stack reference is now derived from the installed tree instead of falling back to `python.md` on every project |
| a team from `teams-setup` | nothing to do | `enable`/`disable` are new capabilities, not migrations. Running `upgrade` back-fills a pre-5.0 `team.md` header if you want the version columns |

### all plugins

#### Added

- **Unified artifact metadata.** Four canonical field names, one order, everywhere: `doc_type` (`llm` | `user` | `skip`, unquoted, `.md` frontmatter only, never in JSON), `version "X.Y.Z"`, `generated_by "<plugin>:<skill>"`, `last_updated "YYYY-MM-DD"` — the last three always quoted, in that order, after the file's own keys. JSON artifacts carry the same three keys as top-level snake_case, in every writing mode, without `doc_type`
- **Five metadata carriers, one vocabulary.** JSON top-level keys; `.md` YAML frontmatter; a `// brewcode-meta:` / `# brewcode-meta:` one-liner on line 2 of byte-copied `.mjs`/`.sh`; a header table (`| Version |`, `| Generated by |`, `| Last update |`) in `team.md`; `<!-- brewcode-meta: ... -->` on line 1 of byte-copied `.md`
- **Versions always come from `.claude-plugin/plugin.json`** — never hardcoded, never written as the literal `unknown`. Two mechanisms, mutually exclusive per file: baked at release (30 assets in `bump-version.sh`'s `STAMPED_FILES`) or substituted at install (exactly three single-brace tokens `{PLUGIN_VERSION}`, `{GENERATED_BY}`, `{LAST_UPDATED}`). A file uses one or the other, never both
- **Six version writers in two shapes.** Four refuse to write at all when the version will not resolve (`teams-setup`/`e2e` `detect-mode.sh`, `superreview-setup/generate.sh`, `semble-common.sh`) rather than stamp a fake. Two use a sentinel: `memory-sync-setup/generate.sh` treats `unknown` as an internal marker and hard-fails on it before writing; `brewtools/hooks/lib/manager-state.mjs` omits the `version` key instead of failing, because it is the off-switch for the manager HARD wall and an abort would lock the user behind an enabled wall
- **Version stamps for teams and agents.** `team.md` carries `| Version |` in its header table, `detect-mode.sh` prints the resolved `PLUGIN_VERSION`, and `setup-status` reads it back. The 8 shipped plugin agents — `brewcode/agents/{agent-creator,bash-expert,bc-rules-organizer,hook-creator,skill-creator}.md` and `brewtools/agents/{deploy-admin,ssh-admin,text-optimizer}.md` — are baked at release as 8 of the 9 `fmd` entries in `STAMPED_FILES` (the ninth is `setup-status/references/artifact-metadata.md`), while the generated `intent-guard` takes the other mechanism and is substituted at install from the `{PLUGIN_VERSION}`/`{GENERATED_BY}`/`{LAST_UPDATED}` tokens in `references/intent-guard.md.template`
- **`references/artifact-metadata.md` under `setup-status` is the normative document** (715 lines, 9 sections): the four fields, the five carriers, the three mechanisms, the writer/reader split, and an explicit exemption list so audits stop re-flagging the artifacts that are unstamped on purpose (`agent-router-setup/assets/judge-prompt.md`, the task-board `SPEC_TEMPLATE.md`/`DESIGN_TEMPLATE.md`, the user-authored manager prompts, and the `.codex/` mirror pinned at `4.0.6+codex.<cachebuster>`)

#### Changed

- **Version resolution is split by role.** A writer resolves from `.claude-plugin/plugin.json` **by self-location** — a cache path is forbidden — and aborts rather than stamping `unknown`; a reader takes the cache-dir basename first, then that root's manifest. Thirteen retired field spellings and eight retired placeholder spellings are tabulated so they stop reappearing
- **Skill Bash blocks resolve the plugin root from `CLAUDE_SKILL_DIR`, not `CLAUDE_PLUGIN_ROOT`.** The old `ROOT="${CLAUDE_PLUGIN_ROOT:-...}"` prelude could never work: the token is a prompt-level text substitution, is never exported into a skill's Bash tool, and a brace-modifier form is not matched by the substitution regex at all — so the expression reached the shell verbatim, the fallback always won, and the script named the *installed* plugin. A `--plugin-dir` dev run resolved to the wrong root every time. Replaced by `$SD/../../.claude-plugin/plugin.json` with a cache glob as last resort and an explicit empty-root abort

#### Fixed

- **A whole defect class: a remedy that could not clear its own verdict.** Every earlier release verified that an artifact is stamped at install; none verified that the stamp can ever change. Five of the ten `-setup` skills reported `stale` and prescribed `upgrade`, and `upgrade` could not fix it. `memory-sync-setup` was a closed loop whose only documented exit destroyed the user's own edits. All ten now close the loop: install at X, bump, `stale`, `upgrade`, `current`, with the artifact body byte-identical and a second `upgrade` idempotent. The new normative rule is that **a remedy must be able to clear the verdict it follows**, and `setup-status` names the findings that have no clearing mode instead of pairing them with a command that cannot help

### brewcode

#### Removed

- **semble-setup: the two advisory hooks are deleted, not deprecated.** `semble-reminder.mjs` (349 lines, PreToolUse on `Bash`/`Grep` plus a UserPromptSubmit row) and `semble-explore.mjs` (150 lines, SubagentStart on `Explore`) both told the model it *should* search semantically. Delivery was verified independently — the text reached the model every time. Conversion was **0 of 18** on the main channel and **0 of 11** on the subagent channel. Not "low"; zero. Advice that is delivered and ignored is a token cost with no output, so both were removed rather than tuned

#### Added

- **semble-setup: `assets/semble-prefetch.mjs` (UserPromptSubmit) replaces them by doing the search itself.** It gates on the prompt, distils a query from it, runs `uvx --from 'semble[mcp]==0.5.4' semble search ... -k 3 --max-snippet-lines 0` and injects the top three `file_path:start_line` candidates with their provenance and a directive — **paths only, no snippets**. The snippet-carrying arm was measured and rejected: it converted 2 of 6 and produced *zero* tool calls in 2 of 6 sessions, i.e. the model answered from the snippet. Paths-only converted 5 of 6 and used fewer tool calls than control in 5 of 6 questions
- **semble-setup: what prefetch buys, measured, and what it does not.** All 18 answers were correct in all three arms. Prefetch buys turns and citation precision; it does **not** buy correctness. The gate (lexical INTENT/DOMAIN/REPOREF signals with SELF/LITERAL/ENUM/TASKREF suppressors, RU+EN) fires on 36% of 61 real user prompts at precision 55% / recall 71% / F1 0.62. The query distiller lifts hit@3 to 11 of 16 from 9 of 16 and MRR to 0.674 from 0.398 (paired: 8 wins, 3 losses, 5 ties)
- **semble-setup: prefetch is bounded by construction** — 30 s throttle, 3 s search timeout, 10 min cooldown after a miss (60 s after a timeout), `SIGKILL` on overrun, and a cold-index short-circuit that spawns no child at all (`why=cold-index`, keyed on `chunks.json`/`metadata.json`/`bm25_index`/`semantic_index`). The repo hash is always recomputed from `realpath(cwd)` and never trusted from `state.json`
- **semble-setup: `assets/semble-stats.mjs` (PostToolUse + PostToolUseFailure) — a telemetry observer.** It always returns `{}` and changes nothing; it appends to `.claude/semble/telemetry.jsonl`, counting semble calls against search-shaped `Bash`/`Grep`/`Glob` use (grep/egrep/fgrep/ugrep/rg/ag/ack/find/bfs) and `Read` opens. The want-table is now **three hook files wired as four settings entries**, all at `timeout: 5` (seconds)
- **semble-setup: `semble-status.sh --section telemetry`** (with `--sid ID` / `--last N`, deliberately excluded from `all`) reports gate/prefetch/nudge/call/search/open counters, prefetch conversion at session and path level, ms median and max, and the share of search-shaped tool use that went through semble
- **semble-setup: a managed `.sembleignore`.** New `assets/sembleignore.template` (196 lines) plus `semble-guidance.sh install --part ignore`. It excludes Claude Code scratch dirs (`.claude/tmp/`, `reports/`, `backups/`, `logs/`, `semble/`, `projects/`, `history/`) while deliberately keeping `.claude/{skills,agents,rules,commands,hooks,scripts,tasks}` indexed, plus build caches semble misses, vendored trees, generated bundles, ~50 binary suffixes and 15 lockfiles
- **semble-setup: `semble-project.sh candidates` measures the repo instead of guessing.** Duplicate trees (>= 5 files, >= 90% duplicated, >= 1% weight), heavy dirs (>= 15%) and heavy files (>= 3%), from exact `index/chunks.json` counts when an index exists and byte share otherwise. `--part ignore` appends the result **commented out** in a delimited block that only ever grows, so the user decides what to exclude. On this workspace (3203 files scanned): `/.codex/` at 13.6% with 102 of 107 files byte-identical to `brewtools`, `RELEASE-NOTES.md` at 5.6% — three mirrors of one plugin tree were 2202 chunks taking 15 of 80 result slots across 16 queries, and a 24k-line changelog was 503 chunks taking 9 of 80
- **setup-status: a stamp reader (Phase 2a).** A `STAMPS` heredoc of `plugin|path|expected-owner` drives 17 carrier lines across all ten setups, with two hard assertions (`TOTAL == 17`, per-plugin 3 brewcode / 11 brewtools / 3 brewdoc) so a silently dropped row fails the dashboard instead of reporting `CURRENT`. Verdicts: `PLACEHLD`, `LEGACY-FMT`, `LEGACY-NONE`, `BEHIND`, `AHEAD`, `CURRENT`, `OWNER-WRONG` (another skill's name is on the file), `OWNER-NONE`. A `.disabled` filename is retried automatically; only `version` and `generated_by` are read
- **setup-status: Phase 1b probes all ten setups**, not five, with a mechanism column and a `no-key` third token. It documents the opposite `enabled`-key defaults explicitly — `agent-deadline` is opt-in (absent key = inert) while `docsync`/`agent-router` are opt-out (absent key = enabled; `manager` has no `enabled` key at all — its off-switch is `.hard` in `.claude/brewtools/manager/state.json`) — which is exactly the asymmetry a dashboard gets backwards
- **teams-setup: `scripts/toggle-team.sh <team> <enable|disable> [--dry-run]`** backs the canonical `enable`/`disable`. It parses the `## Agents` table, parks members as `<name>.md.disabled`, and skips `intent-guard` (`SKIP:intent-guard (shared with superreview-setup)`) so the review-only member stays live. Prints `WOULD:`/`MOVED:`/`NOOP:`/`MISSING:` plus counters, and exits 1 when a member has neither spelling on disk
- **superreview-setup: the canonical set is complete** — `enable | disable | uninstall | purge` added to `generate.sh` and the verb-routing table. `enable`/`disable` park `SKILL.md` <-> `SKILL.md.disabled`, keeping `references/`, `.template-baseline/` and `intent-guard.md` on disk; `purge` additionally deletes `.claude/reports/*_superreview/`. `intent-guard` survives all seven verbs
- **rules: `create-specialized <prefix> [paths]` takes an explicit `paths` glob.** `default_paths_for_prefix()` supplies curated globs for test/e2e/doc/ci/sql/api/ui/infra prefixes and a prefix-derived guess otherwise, printed with a confirm-me warning; `SKILL.md` requires an `AskUserQuestion` about the repo slice first. `["**/*"]` is hard-refused — a "specialized" rule matching everything auto-loads into every request, which is the opposite of specialized
- **rules: `validate` checks frontmatter**, not just the table header — `paths`, `description`, unquoted `doc_type: llm`, quoted `version` X.Y.Z, quoted `last_updated` YYYY-MM-DD, plus the repo-wide-paths rejection
- **convention: `check_doc()` fails a doc that exists but has no frontmatter** or is missing a metadata key, naming the key on stderr. `setup` now returns `{path, version, generated_by, last_updated}`

#### Changed

- **semble-setup: the pin moves `0.5.2` -> `0.5.4`.** No re-index is forced: `cache_version` is still `1`, and an index built by `0.5.2` was read by `0.5.4` and back with every file under `<key>/index/` byte-identical and `metadata.json.time` unchanged. `src/semble/index/` and `src/semble/mcp.py` are byte-identical between the two sdists, so the corpus, the ignore handling, the cache key and both MCP tool shapes are unchanged
- **semble-setup: the pin-resolvability probe is `semble --version`, selected by the pin.** `--version`/`-V` reached semble's CLI dispatch set in `0.5.4`, costs the same (0.26 s warm, 2.5 s cold) and prints the resolved `X.Y.Z`, so the probe proves *which* build was served rather than merely that something resolved. `sc_semble_probe_arg` keeps the always-safe `--help` for any `SEMBLE_PIN_VERSION` below `0.5.4`, where `--version` is unrecognised argv and starts the blocking stdio server
- **semble-setup: never write a `!` negation line into `.sembleignore`.** semble 0.5.4's `file_walker.py` has a negation bypass: a `!` line whose pattern ends in a file extension sets the walker's `found` flag and the extension filter is skipped entirely. That is how one negated `package-lock.json` (552 chunks, 5.9% of the index) and two negated `.png` files (143 chunks of decoded binary) reached an index. The lever the template uses instead is ordering — `.sembleignore` is concatenated *after* `.gitignore` and the last match wins, so a plain re-ignore line beats a `.gitignore` negation without tripping the bypass. The shipped template contains no `!` lines and its per-repo section ships empty
- **semble-setup: the settings merge reconciles instead of appending.** `SG_WANT_TABLE` (`event, matcher, script, timeout`) is the single source of truth; stale entries are purged on the `(event, matcher, path)` triple, an emptied event is deleted rather than left as a `"PreToolUse": []` husk, and `semble-guidance.sh` tracks all five basenames it has ever owned against the three live ones
- **semble-setup: the advertised corpus matches reality.** The report and the injected CLAUDE.md block printed a stale `corpus: code config`; the actual `SEMBLE_CONTENT_ARGS` has been `code docs config` and did not change here — what changed is that the docs stopped misreporting it, which is why nobody knew markdown was searchable. `uncovered:` now names `.json/.json5/.csv/.tsv/.psv` (no content type reaches them) and `.mdx/.txt` (absent from `_EXTENSION_TO_LANGUAGE`), and `references/language-coverage.md` records the decision to keep `config`: 53 of 9307 chunks (0.57%) across 40 files, it made two benchmark questions answerable, and it is not what pulled the lockfile in
- **semble-setup: `assets/semble-first.md.template` carries a measured tool-selection table** — semble wins behaviour and vocabulary-mismatch questions 8 of 9, loses exhaustive enumeration 2 of 5, `rg` wins exact identifiers — and states that `.json`'s absence is load-bearing and that semble does not deduplicate an identical file committed at several paths
- **semble-setup: `sc_timeout_watch` measures its deadline on wall clock** (`$SECONDS`) instead of summed sleeps, so it can no longer fire early; it now fires within `[secs, secs+1)` with a <= 250 ms poll and a 100 ms TERM->KILL grace
- **semble-setup: the awaiting-reload message stopped being wrong.** `semble-session.mjs` used to tell you to run `resume` first; semantic search is usable immediately, so it prints the exact `mcp__semble_code__search` call and warns that the first call rebuilds the index
- **semble-setup: managed-file install/remove refactored** onto generic `install_managed`/`remove_managed` with `meta` and `metaline` strip modes, adding a metadata-only re-sync that needs no `--force` and no backup, collapsing a net-zero-byte change to `unchanged`, and simulating `--part ignore` dry-runs against a temp dir so they never announce a phantom change
- **setup-status: the `installed (version unknown)` state is retired.** Its replacements are specific: `stale (X.Y.Z -> A.B.C)`, `stale (legacy stamp)`, `stale (legacy, unstamped)`, `stale (bytes drifted)`, plus a distinct `version unknown (plugin asset missing)` for the case where the comparison source itself is absent
- **setup-status: Phase 3 classify rewritten from 7 rules to 11, with `disabled` evaluated ahead of `missing`** — a deliberately parked mechanism was being reported as absent
- **setup-status: the report leads with a count** (`N of 10 setups are behind the installed plugin`), gains a Version column with explicit formats (`X.Y.Z`, `X.Y.Z -> A.B.C`, `legacy -> A.B.C`, `unstamped -> A.B.C`, `--`), a mandatory closing run-list, and a *Remedy check* clause on every roster row naming the code that proves that row's `upgrade` restamps. Phase 0's version probes carry `|| true` so `set -euo pipefail` cannot abort the whole dashboard
- **superreview-setup: `upgrade` restamps unconditionally.** A `_restamp_meta()` loop runs over every live artifact after the delta report instead of being gated on IDENTICAL/DIFFERS. It refreshes only version/generated_by/last_updated, preserves an existing `doc_type`, seeds `doc_type: llm` when absent, and byte-compares the body. `GENERATED_AT` is retired for `{PLUGIN_VERSION}`/`{GENERATED_BY}`/`{LAST_UPDATED}`, none env-overridable, with a hard failure on a non-`X.Y.Z` version
- **superreview-setup: the intent-guard state machine migrates instead of re-emitting.** `_ig_usable` becomes `_ig_kind()` returning ABSENT/BROKEN/CURRENT/LEGACY/FOREIGN, and a new `_ig_migrate()` restamps a LEGACY agent in place — four frontmatter keys plus the tail anchor from the substituted template, body preserved, four post-conditions that abort on failure — printing `INTENT_GUARD: MIGRATED <path>`. `validate` now iterates every `references/*.md` rather than a fixed four-file list and treats LEGACY as an error
- **teams-setup: `verify-team.sh` learns two states it could not see.** A metadata layer (`check_agent_meta()`: conforming / malformed / pre-standard, where pre-standard is a WARN not a FAIL) plus per-agent `DISABLED`/`MISSING` verdicts, a `DISABLED_AGENTS:N` line and `VERIFY: PASS (team DISABLED ...)`. `detect-mode.sh` accepts all seven canonical verbs and resolves the version by self-location, hard-failing rather than stamping `unknown`
- **e2e: staleness is `config.version != PLUGIN_VERSION`,** not `lastSetup > 30 days`. `config.json` drops `lastSetup` for the three provenance keys; a missing stamp reports `stale (legacy, unstamped)` and never `unknown`. Every written artifact — config, `e2e-rules.md`, the `e2e-*` agents, `e2e-conventions.md` — carries the four keys, and a new unconditional re-stamp step touches metadata only, leaving bodies byte-identical
- **skills: the metadata contract renames `updated:` to `last_updated:`** and bans `updated`/`updatedAt`/`lastUpdated`, pointing at `setup-status/references/artifact-metadata.md` section 8

#### Fixed

- **semble-setup: a v1-shaped install reported `ready` with `nextStep: none`.** The verdict now downgrades `ready` -> `partial` when a retired hook is still on disk, when a stale settings entry survives, or when `wired !== want`, and the human line prints `hooks n/<wantCount> wired`. A second, independent downgrade covers stale artifact stamps (`artifacts at X, plugin at Y` -> run `upgrade`). Until this release the dashboard actively told people mid-migration that they had nothing to do
- **semble-setup: `upgrade` always reported `changed`** on a zero delta; a second project on the same machine never got a `state.json` at all, because the MCP server is user-scoped and the script short-circuited on it; and `status` showed no version. `upgrade` now has an unconditional project half, and `semble-mcp.sh add` writes the per-project checkpoint itself when the user-scope registration is already correct
- **semble-setup: a pipx or venv install was mislabelled `uvx-ephemeral`** — `sc_semble_tool_version` falls back to `semble --version` (5 s bound) when `uv tool list` reports nothing but a `semble` is on PATH
- **semble-setup: `sc_plugin_version()` hard-fails instead of stamping a placeholder,** and `sc_state_patch` migrates `lastVerifiedAt` -> `last_verified_at` (date only) and drops `updatedAt`
- **semble-setup: stale upstream citations refreshed against the `0.5.4` source** — `clear index` is `_clear_indexes` at `cli.py:147-163`, the savings CLI is `cli.py:166,252,280`, and `semble clear orphans` (new in `0.5.4`, `cli.py:176-199`) is documented as narrower but still not per-repo
- **setup-status read every healthy semble project as `stale`.** `.sembleignore` was in the byte-comparison set even though the installer appends a candidates block to it after copying. The only prescribed remedy was `--force`, which destroyed the user's own exclusions. It is out of the comparison set; its presence is still checked and its stamp is still read
- **setup-status: runtime state is barred from the `STAMPS` table,** and `session-start.mjs`'s TTL marker was renamed `checkedAt` -> `fetchedAtMs` so ephemeral runtime state can no longer trip the legacy-format detector. Old caches simply miss and refetch
- **superreview-setup `upgrade` re-stamped the wrong stack reference.** `STACK_REF` fell back to its default on every project, so `python.md` was restamped whatever the project was and the real stack reference stayed on the old version forever. The stack is now derived from the installed tree, so an existing install is repaired retroactively
- **superreview-setup restored a deleted artifact from the *substituted* copy,** silently baking placeholder defaults (`this project`, `general-purpose`) into a live file — and `validate` passed it. Restoration now copies the raw template and says so (`MISSING -> restored RAW`)
- **superreview-setup: a `${HOME}` in a Phase 3 evidence command destroyed the tailoring.** `{[A-Z_]+}` matches the `{HOME}` inside `${HOME}`, so `_scan_tokens()` classified a perfectly good tailored agent as BROKEN and **recreated it**. Fixed as strip-then-match (`sed 's/\${[A-Z_][A-Z_]*}//g'` first). The same false positive is fixed in `teams-setup/SKILL.md` Step 2, where the `CORRUPT` verdict prescribes `rm -f` and a re-emit — there a false positive deleted a hand-tailored agent
- **teams-setup Step 4 could never pass.** `grep -c 'TEMPLATE HEADER'` also matched the prose that legitimately names the marker, so every healthy install hit the STOP gate and re-ran Step 3. Both counts are now anchored (`^<!-- TEMPLATE HEADER`, `grep -cF '<!-- SEEDED-DEFAULT:'`)
- **teams-setup: purging a *disabled* team left its whole roster on disk.** `cleanup-flow.md`'s delete and purge now `rm -f` both `.claude/agents/{name}.md` and `{name}.md.disabled`
- **rules / convention templates:** `avoid.md.template` and `best-practice.md.template` gain `{PATHS}`, `{DESCRIPTION}`, `{TITLE}` and the four metadata tokens, substituted by a new `render_template()` — previously a plain `cp` plus a single `sed` on the H1

#### Known issues

- **semble-setup on Alpine/musl:** `semble 0.5.4` replaces `tree-sitter` + `tree-sitter-language-pack` with `semble-grammars>=0.1.2`, which publishes **wheels only** — macOS x86_64/arm64, manylinux2014 x86_64/aarch64, win amd64/arm64. There is no sdist and no musllinux wheel, so on a musl host the install hard-fails where `0.5.2` could still build from source. glibc Linux, macOS and Windows are unaffected; use a glibc image. `install` now diagnoses this explicitly instead of failing opaquely

### brewtools

#### Added

- **task-board-setup: `enable` / `disable`.** Phase PE parks `.claude/agents/task-tracker.md`, `.claude/skills/task-board/SKILL.md`, `.claude/skills/task-spec/SKILL.md` and `.claude/rules/tasks.md` as `*.disabled`; `.claude/features/**` is untouched and `enable` re-runs no analysis. `status` gains `machinery: enabled|DISABLED|mixed` and prints `off <path> (parked as ...)` instead of `MISS`. `create`/`update`/`cleanup` join the retired-alias list
- **task-board-setup: nine generated artifacts carry the four metadata keys** — `board.md`, `TRACKER.md`, `INDEX.md`, `PROGRESS.md`, `backlog/README.md`, `task-tracker.md`, `tasks.md` and both generated `SKILL.md` files. `TASK_TEMPLATE.md` and the task cards stay unstamped on purpose: frontmatter there would be inherited by every derived card
- **agent-deadline-setup / agent-router-setup / manager-setup: config and state files carry `version` / `generated_by` / `last_updated`,** written on `install`, `upgrade`, `enable`, `disable` (and both `level` operations for the router), with post-write verification that aborts on a mismatch. `status` prints the config version against the plugin version and a `stale` verdict
- **deploy / ssh: the generated `deploy-admin.md` and `ssh-admin.md` agents get metadata frontmatter,** plus a leftover-placeholder gate that greps both `{{...}}` and `{PLUGIN_VERSION|GENERATED_BY|LAST_UPDATED}`

#### Changed

- **think-short-setup: the family-hook list is now a stem prefix set** — ten `FAMILY_HOOK_STEMS` matched by an anchored regex, replacing a hardcoded 15-entry filename list that still named `semble-reminder.mjs`/`semble-explore.mjs` and had never heard of `semble-prefetch.mjs`/`semble-stats.mjs`
- **agent-router-setup: `status` renames `level` to `level_recorded` and pairs it with `tier2_refs`.** The docs now say plainly that `level` is enforced by nothing and that `tier2_refs` is the authority on whether the LLM judge fires, with an instruction to report the mismatch rather than paper over it
- **manager-setup: `upgrade` stops claiming `stateUntouched`.** It calls `writeState('project', {})` to restamp the metadata trio only, and reports `armStatePreserved` and `stateRestamped` separately; `hard`/`level` still merge through verbatim
- **task-board-setup: placeholder verification greps both brace families** (`\{\{` and `\{(PLUGIN_VERSION|GENERATED_BY|LAST_UPDATED)\}`) — the old `grep -rn '{{'` passed a file holding an unresolved single-brace token. `uninstall`/`purge` and the partial guard now account for `.disabled` twins
- **text-human:** usage examples quote `<text>`; no behaviour change

#### Fixed

- **manager-setup: the documented HARD-wall off-switch silently did nothing on a symlinked path.** `manager-state.mjs` compared raw `process.argv[1]` against `import.meta.url`; on macOS, where `/var` is a symlink to `/private/var`, the direct-invocation check never matched, so `manager-state.mjs set hard=false` exited 0 and wrote nothing. argv[1] is now `realpathSync`'d first
- **manager-setup / task-board-setup: `upgrade` reported success and left the stamp behind.** task-board's stopped at U1 with `no-op, spec layer already installed`; manager's re-copied the guard but never touched `state.json`, which is the first thing `setup-status` reads. Both prescribed an `upgrade` that could not clear the `stale` it produced. task-board gains an always-run restamp step (U5b) plus a U6 stamp gate and a `restamped` report bucket; manager restamps through `writeState`
- **manager-setup stamped the date in UTC** — a day early anywhere west of UTC after roughly 17:00 local, and that date then fed the staleness comparison. Local `YYYY-MM-DD` now, in `manager-state.mjs` and in the `INSTALL.md` blocks
- **manager-state.mjs: `writeState` omits `version` with a stderr note rather than stamping `unknown`,** and never aborts — aborting would leave a user behind an armed wall with no exit. `resolveState` passes unknown project-file keys through and drops the legacy `doc_type` on read as well as write
- **agent-router.mjs: the once-per-deny marker hashed `${root} ${text}` with a space separator,** so a different root/text split could collide. Now NUL-separated
- **deploy-admin and ssh-admin shipped a literal, never-substituted `<!-- last-updated: TIMESTAMP -->` trailer.** Removed, replaced by real frontmatter; `text-optimizer` gained the same frontmatter
- **deploy: the post-release step ran `bash <POST_SCRIPT>` with the literal angle brackets.** It now assigns `POST_SCRIPT="..."` and runs `bash "$POST_SCRIPT"`

### brewdoc

#### Added

- **docsync-setup: `enable` / `disable`** flip one `enabled` key in `.claude/docsync/config.json`. All three hooks re-read it per invocation and return empty immediately, so the pause takes effect with no session restart while `settings.json`, the hook files, `state.json` and every `last_updated` stay exactly where they are
- **docsync-setup: `config.json` leads with three provenance keys,** which is what `/brewcode:setup-status` reads a docsync version from; install aborts if the version cannot be resolved. The hooks carry a `brewcode-meta` stamp on line 2 so an installed copy can be `cmp`'d byte-for-byte against the plugin's
- **memory-sync-setup: `enable` / `disable` / `purge` / `restamp`.** `enable`/`disable` rename `SKILL.md` <-> `SKILL.md.disabled` — the roster reappears next session and the three references plus every SELF-SYNC hand-edit stay byte-identical. `purge` deletes the whole `.claude/skills/memory-sync/` plus any `.memory-sync-emit.*` staging left by a crashed emit; `uninstall` is now manifest-scoped and lists user-added files under `KEPT:`
- **memory-sync-setup: `status` reports what it actually found** — `PLUGIN_VERSION`, `INSTALLED=yes|parked|no`, `STAMP_FORMAT=frontmatter|legacy|none`, the five metadata values, a `PARKED - ` verdict prefix and a `STALE-LEGACY (n drifts)` verdict for pre-5.0 tail stamps
- **my-claude: every generated `.md` under `.claude/brewdoc/my-claude/` opens with provenance frontmatter,** version resolved from the manifest; regeneration refreshes the three quoted values and preserves a hand-set `doc_type`

#### Changed

- **docsync-setup: the Stop gate re-applies scope and reports undated docs.** `exclude` globs and `doc_type: skip` are evaluated again at gate time, so marking a doc `skip` mid-session silences it; and the gate lists `no last_updated: ...` separately from `stale (>Nd): ...` instead of skipping dateless files
- **docsync-setup: frontmatter convention settled** — `last_updated` and `sync_procedure` quoted, `doc_type` bare; documents in either spelling keep parsing. `upgrade` refreshes only the three provenance keys, preserving `enabled`, `threshold_days` and `exclude` verbatim, so a disabled install stays disabled, and first-run detection gains `INSTALLED (DISABLED)` as a third state that `install` refuses to overwrite
- **memory-sync-setup: provenance moved from a tail HTML comment to YAML frontmatter** (five keys, written by an awk stamper), and the stamped version is the brewdoc plugin version resolved from the manifest instead of a hardcoded `VERSION="1.0.0"`. `validate` fails on a stale stamp and names `restamp` as the remedy — explicitly not `emit`, not `MEMORY_SYNC_FORCE=1`
- **memory-sync-setup: the generated `/memory-sync` skill ships `disable-model-invocation: true`,** matching the rest of the suite
- **md-to-pdf: `.claude/md-to-pdf.config.json` writes carry the three provenance keys** on both the engine-choice and styles paths, through an explicit writer with JSON validation

#### Fixed

- **memory-sync-setup: an install one version behind had no route to a fresh stamp.** `upgrade` refreshed the tables, `validate` then hard-failed on the stale version, and the only documented escape was `MEMORY_SYNC_FORCE=1 emit` — which destroys exactly the SELF-SYNC hand-edits `upgrade` exists to preserve. `restamp` closes the loop: it diffs the body before and after and refuses to write unless the only change is the metadata keys
- **memory-sync-setup: `upgrade` never re-copied the three emitted references,** so `setup-status`' `cmp` reported DIFFERS forever with no mode that could clear it. `refresh_refs` re-copies where provably lossless (`REF RECOPIED:`), restores a missing one, and reports `REF DIFFERS:` rather than overwriting otherwise. A pre-5.0 tail stamp is parsed and migrated in the same call
- **docsync-setup: a doc that is only read and carries no `last_updated` produced no signal at all** — the watch hook is silent by design and the gate skipped dateless files. It is now listed by the gate. Separately, `doc_type` was a raw string compare, so an unrecognised or differently cased value was not normalised; all three hooks share `docTypeOf()` (trim, lowercase, absent/unknown -> `user`, only `skip` removes a file)
- **docsync-setup: `frontmatter` mode omitted `sync_procedure`,** so it produced documents that `sync` could not follow; and `enable`/`disable` demanded the metadata trio be byte-identical instead of adding it when absent
- **md-to-pdf: the styles path rewrote the config wholesale and silently dropped the saved `engine` and `pygments_theme`,** resetting the engine choice on every style change. The new merge carries them over

### docs and Codex mirror

#### Changed

- **`semble-setup.mdx`, `setup-status.mdx` and `full-setup.mdx` reconciled** against the retired hook pair, the three live hooks wired as four entries, the new verdict downgrades and the metadata standard
- **`references/output-contract.md` corrected** — pin `0.5.4` in three places, the `hooks n/4 wired` legend rewritten to the four current entries, `corpus:` and `uncovered:` fixed. `references/hooks-roadmap.md` marks its on-disk-state section OBSOLETE, naming `SG_WANT_TABLE` plus `assets/INSTALL.md` as the source of truth; `references/engine-landscape.md` closes its stale-pin defect and records the bidirectional `0.5.2` <-> `0.5.4` cache compatibility
- **`.gitignore`:** the semble marker line follows the hook rename, `.claude/semble/.reminder-ts` -> `.prefetch-ts`

#### Fixed

- **Codex mode parity was worse than measured.** `manager-setup` documented three retired aliases (`on`, `off`, `reset`), `task-board-setup` documented none of the seven canonical modes, and `think-short-setup` documented only `install`/`remove`. All three are at parity, and `validate-compat.mjs` gains a mode-parity gate: a canonical mode declared in a source `argument-hint` and missing from the Codex variant now fails validation
- **The `.codex` generator shipped an unstamped mirror of a stamped asset.** `think-short-prompt.md` is hand-rewritten for Codex and was emitted with a bare `<!-- think-short -->` marker while its source carries a `brewcode-meta` stamp, so the mirror had no version at all. The generator now carries the source's stamp into the marker

---

## v5.0.0 (2026-08-08)

> Docs: [setup-status](https://doc-claude.brewcode.app/brewcode/skills/setup-status/) | [superreview-setup](https://doc-claude.brewcode.app/brewcode/skills/superreview-setup/) | [teams-setup](https://doc-claude.brewcode.app/brewcode/skills/teams-setup/) | [semble-setup](https://doc-claude.brewcode.app/brewcode/skills/semble-setup/) | [e2e](https://doc-claude.brewcode.app/brewcode/skills/e2e/) | [skills](https://doc-claude.brewcode.app/brewcode/skills/skills/) | [convention](https://doc-claude.brewcode.app/brewcode/skills/convention/) | [rules](https://doc-claude.brewcode.app/brewcode/skills/rules/) | [skill-creator](https://doc-claude.brewcode.app/brewcode/agents/skill-creator/) | [hook-creator](https://doc-claude.brewcode.app/brewcode/agents/hook-creator/) | [task-board-setup](https://doc-claude.brewcode.app/brewtools/skills/task-board-setup/) | [manager-setup](https://doc-claude.brewcode.app/brewtools/skills/manager-setup/) | [think-short-setup](https://doc-claude.brewcode.app/brewtools/skills/think-short-setup/) | [agent-deadline-setup](https://doc-claude.brewcode.app/brewtools/skills/agent-deadline-setup/) | [agent-router-setup](https://doc-claude.brewcode.app/brewtools/skills/agent-router-setup/) | [provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/) | [deploy](https://doc-claude.brewcode.app/brewtools/skills/deploy/) | [secrets-scan](https://doc-claude.brewcode.app/brewtools/skills/secrets-scan/) | [text-human](https://doc-claude.brewcode.app/brewtools/skills/text-human/) | [deploy-admin](https://doc-claude.brewcode.app/brewtools/agents/deploy-admin/) | [docsync-setup](https://doc-claude.brewcode.app/brewdoc/skills/docsync-setup/) | [memory-sync-setup](https://doc-claude.brewcode.app/brewdoc/skills/memory-sync-setup/) | [publish](https://doc-claude.brewcode.app/brewdoc/skills/publish/) | [my-claude](https://doc-claude.brewcode.app/brewdoc/skills/my-claude/) | [full-setup](https://doc-claude.brewcode.app/full-setup/) | [faq](https://doc-claude.brewcode.app/faq/)

> **BREAKING.** Ten skills were renamed and one was deleted. There are no back-compat aliases — an old command name is simply not found. Migrate with the table below.

> **This release also carries a review-and-fix pass over every skill, agent and script in the suite.** Several of the bugs it found were *silent* failures that shipped for multiple releases: a mechanism reported itself as working while doing nothing, or did something other than what it told you. If you have existing installs, three of them affect you directly and are called out under **Action required** below.

### Action required for existing installs

| If you have | Do this | Why |
|-------------|---------|-----|
| `manager-setup` installed in a project | `/brewtools:manager-setup upgrade` once, per project | The disarm command changed shape and now needs a `manager-state.mjs` helper copied into the project. `upgrade` backfills it and preserves `hard`/`level` exactly. Without it, disarming fails with `Cannot find module` |
| `think-short-setup` installed alongside `agent-router-setup` or `agent-deadline-setup` | `/brewtools:think-short-setup upgrade` | think-short has been injecting **nothing** while its status block said `3/3 enabled`. See brewtools Fixed |
| a page published with `/brewdoc:publish` and a password | treat it as public; delete and republish | The password header was never actually sent. See brewdoc Fixed |
| a team created by `/brewcode:teams` or `teams-setup` | `/brewcode:teams-setup upgrade <name>` | Existing teams self-heal: the dead trace variable is repaired, so `trace.jsonl` starts recording and `upgrade` stops proposing to delete every agent as inactive |

### Migration

| Old | New |
|-----|-----|
| `/brewcode:teams` | `/brewcode:teams-setup` |
| `/brewcode:semble` | `/brewcode:semble-setup` |
| `/brewcode:superreview` | `/brewcode:superreview-setup` |
| `/brewtools:task-board-init` | `/brewtools:task-board-setup` |
| `/brewtools:think-short` | `/brewtools:think-short-setup` |
| `/brewtools:agent-deadline` | `/brewtools:agent-deadline-setup` |
| `/brewtools:agent-router` | `/brewtools:agent-router-setup` |
| `/brewtools:manager` | `/brewtools:manager-setup` |
| `/brewdoc:memory-sync-init` | `/brewdoc:memory-sync-setup` |
| `/brewdoc:docsync` | `/brewdoc:docsync-setup` |
| `/brewdoc:guide` | deleted — use [doc-claude.brewcode.app](https://doc-claude.brewcode.app/getting-started/) |
| any `init` / `on` / `setup` / `create` argument | `install` |
| any `off` argument | `disable` |
| any `remove` / `cleanup` argument | `uninstall` (or `purge` to also drop config/state) |
| any `reset` argument | `purge` then `install` |
| any `update` argument | `upgrade` |
| `/brewcode:e2e setup` | `/brewcode:e2e install` |
| `/brewtools:provider-switch setup` | `/brewtools:provider-switch install` |

### all plugins

#### Changed
- **The `-setup` suffix now means something.** A skill carries `-setup` when it **installs a mechanism** and you afterwards use what it produced — a generated skill, a hook, an MCP server — not the skill itself. Recurring tools you invoke every day (`text-optimize`, `publish`, `convention`, `rules`, `e2e`) keep bare names. Ten skills were renamed to match: directory, `name:` frontmatter and command string moved together, with no aliases left behind. This is deliberate: an alias would have kept the old vocabulary alive in muscle memory and in every LLM's prior, which is exactly what the rename exists to end
- **One mode vocabulary across every setup skill,** in this exact order: `status | install | upgrade | enable | disable | uninstall | purge`. No argument means `status` when the mechanism is installed and `install` when it is not. One deliberate exception: `semble-setup` always defaults to `status`, because a bare invocation must never kick off a machine-level package install. Removed aliases: `init, on, off, setup, remove, reset, create, update, cleanup`. Skill-specific verbs survive but now come **after** the canonical set — `semble-setup`: `reindex`/`optimize`/`resume`; `agent-router-setup`: `level fast|strict`; `manager-setup`: `level strict|balanced` and `edit`; `docsync-setup`: `sync`/`reread`/`frontmatter`; `teams-setup` keeps its `[name]` positional
- **Frontmatter is uniform across all 26 skills:** keys `name, description, user-invocable, disable-model-invocation, argument-hint, allowed-tools, model` in that order, `allowed-tools` always in bracket-list form, and `disable-model-invocation` always written out
- **All 26 distributed skills are now `user-invocable: true` + `disable-model-invocation: true`, without exception.** They run only when you type `/plugin:skill`; the model never sees their descriptions and never auto-activates one. This is a deliberate design decision about context cost, not a side effect of the frontmatter normalization. A model-visible skill description is paid for in *every* request, forever, purely to stay discoverable — 26 of them is a permanent tax on the context window of every conversation you have. And these skills do not want auto-activation anyway: the ten `-setup` skills are interactive generators that write real files into your repo after asking you real questions, and the recurring tools are things you point at a scope you choose, at a moment you choose. The practical consequence is worth stating plainly: asking "can you sync my docs?" will not trigger `/brewdoc:docsync-setup`. Type the command; tab completion after `/` lists what is installed

### brewcode

#### Fixed
- **`/brewcode:teams-setup purge` installed a team literally named "purge".** `purge` was not a recognized mode, and the unrecognized argument fell through to the `[name]` positional — so the destructive verb quietly ran an interactive install of a team called `purge`, complete with generated agents. `purge` is now implemented (it removes the team plus its archive, trace and state), and `enable`/`disable` are rejected with an error instead of falling through the same way: a team either exists on disk or it does not, there is no armed state to flip
- **Generated team agents traced through a dead variable,** so `trace.jsonl` was always empty. Nothing consumed the trace except `upgrade`'s activity analysis, which read the empty file and concluded every agent in the team was inactive — then proposed deleting all of them. Fixed at the source; **existing teams self-heal on `/brewcode:teams-setup upgrade <name>`**
- **`/brewcode:e2e`'s five generated agents were dead on arrival.** The generator read its agent definitions through a dead variable inside a STOP-if-missing check, so the read returned nothing and generation stopped — every generated agent was empty. Its config also persisted a `plugin://` path that resolves to nothing outside the generating session, so a config written on Monday was unusable on Tuesday. Rules now live at a real project path, `.claude/e2e/e2e-rules.md`
- **`/brewcode:skills`' `list-skills.sh` was blind to every plugin skill** — it enumerated only project-local ones, so `status`, `list` and `review` all under-reported by the entire plugin surface. Separately, the skill carried two contradicting description-length limits (150-250 characters in one place, `<=120` in another); resolved to **`<=120`**
- **`/brewcode:convention`'s `conventions` mode overwrote `.claude/rules/`** despite being documented, in the same file, as the mode that leaves rules alone. Anyone running it to refresh conventions lost hand-written rules. It now skips them, as documented
- **`/brewcode:rules`' `create-specialized` wrote nothing on macOS.** It used bash 4 syntax against the bash 3.2 that ships with macOS; the failure was not surfaced, so the mode reported success and produced no files
- **`skill-creator` agent advertised three built-in agents that do not exist** — `developer`, `tester`, `reviewer`. Generated skills therefore named subagents that could never be resolved, and the failure only appeared later, at the generated skill's first run. Removed; generated skills now name agents that exist
- **`hook-creator` agent taught `matcher: "Task"` into downstream projects.** Every hook it generated for subagent events carried a matcher that does not match, so those hooks never fired in the projects it was used on

#### Added
- **`/brewcode:setup-status` — a read-only cross-plugin dashboard.** It reports which setup skills are installed, stale, partial or missing in the current project and prints the exact command to run for each. It never runs any of them, and that is the design: every setup is an interactive generator that spawns a fan of subagents, so firing several inside one session degrades all of them. Takes an optional plugin or skill filter; no argument gives the full report

#### Changed
- **`teams` -> `teams-setup`, `semble` -> `semble-setup`, `superreview` -> `superreview-setup`,** each with the canonical mode set. `semble-setup` is the sole no-arg-defaults-to-`status` skill in the suite
- **`/brewcode:e2e setup` is now `/brewcode:e2e install`.** `e2e` keeps its bare name — it is a recurring tool, not an installer — but its one installer-shaped verb joins the shared vocabulary

### brewtools

#### Fixed
- **`manager-setup`: the HARD wall could not be disarmed from the main session, and its one exemption was a code-execution hole.** Both halves are closed. The wall blocks `Write`/`Edit`/`Bash` in the main session, so the documented exit — itself a `Bash` call — was denied by the very thing it was meant to exit; the wall was a trap you could only leave by editing state files the wall also protected. The exit is now exactly one command shape, `node <ABS project root>/.claude/brewtools/manager/manager-state.mjs set hard=false`, and `install`/`upgrade` copy that helper into the project so it needs no path resolution. Separately, the old exemption matched loosely enough to execute arbitrary code: it is now granted only when the command starts with `node `, the FIRST argument after `node` is that exact helper path (a `manager-state.mjs` substring elsewhere does not count), and the remainder is the helper's own CLI — with no shell operator outside quotes, no `$` expansion, and no `node` eval flag (`-e`/`--eval`/`-p`/`--print`/`--input-type`/`--require`/`--import`/`--loader`). A `BT_ROOT=` prelude, an `&& echo` tail, a `|| echo` or a `test -f` each turn the exemption off. **Existing installs must run `/brewtools:manager-setup upgrade` once** to get the helper; it never calls `writeState`, so an armed wall stays armed and a disarmed one stays disarmed
- **`manager-setup`: `ALWAYS_ALLOW` audited.** Plan-mode sessions were trapped — the tools a plan-mode session needs were not on the list, so the wall blocked the session's own workflow. Task-tracking tools were unreachable for the same reason, which is perverse in a mechanism whose whole point is delegation and tracking. Both classes are now allowed
- **`think-short-setup` silently stopped injecting the moment any sibling hook registered on the same matcher.** Its yield check looked for a file that was deleted in v4.0.0; finding a *different* hook on the matcher, it deferred and emitted nothing. So every project that installed `agent-router-setup` or `agent-deadline-setup` has been running with think-short doing exactly nothing — while its own status block still reported `3/3 enabled`. That combination, a dead mechanism plus a status display that confirms it is alive, is the worst shape a bug can take, and it shipped for several releases. The yield check now tests for the condition that actually exists. Run `upgrade` on affected projects
- **`deploy`'s release mode hardcoded this repo's private tooling.** The generic release path referenced scripts and paths that exist only in claude-brewcode, so it was unusable in any other project — the exact repos it is meant for. Removed. Three script-level aborts fixed alongside it
- **`provider-switch`: the API key was passed as an argv value,** which puts it in the process table for every user on the machine and in shell history. It is no longer passed as an argument. `remove-key` left the key behind in `~/.zshrc.bak`, world-readable, so "removing" a key published it instead — the backup is now handled properly. `sed -i ''` (a macOS-only spelling) silently misbehaved on Linux and is fixed. `model-check` was unreachable code. `KEY_DEEPSEEK` added
- **`secrets-scan` really filters the file list it claimed to have filtered.** The filter was documented and computed, then the unfiltered list was scanned
- **`text-human`'s `mixed` flow loaded no rules at all** — it ran with an empty rule set and reported success
- **`deploy-admin` agent shipped 5 unsubstituted `{{PLACEHOLDER}}` tokens** in live prose sections, not in template blocks, so the agent was instructing itself with literal placeholder text

#### Changed
- **`task-board-init` -> `task-board-setup`, `think-short` -> `think-short-setup`, `agent-deadline` -> `agent-deadline-setup`, `agent-router` -> `agent-router-setup`, `manager` -> `manager-setup`.** `manager-setup`'s HARD wall loses `on`/`off`/`reset` for `enable`/`disable`/`purge`; `level strict|balanced` and `edit` are unaffected. The `++m`/`++a`/`++rr`/`++r` codewords are hook-driven and independent of the skill name — they keep working untouched
- **`/brewtools:provider-switch setup` is now `/brewtools:provider-switch install`.** The skill keeps its bare name: switching providers is something you do repeatedly, not once

### brewdoc

#### Fixed
- **`/brewdoc:publish` published password-protected pages with no password.** Every curl block referenced `"${PASS_H[@]}"`, an array built from a `$PASSWORD` variable that was never assigned anywhere: the password was resolved interactively in conversation, and each Bash call is a fresh shell, so the header expanded to nothing. The page went out **unprotected** while the skill reported a password back to you — undetectable except by opening the link logged out. All five upload blocks now use a `{password_header}` placeholder that the model substitutes before running (restoring the convention the ancestor skill used), with a mandatory substitution rule at the end of the password step: substitute `-H "X-Password: <pass>"`, or delete the line, and never report a password you did not substitute. **Pages published protected by an earlier version are public** — delete them with their owner token and republish. Also added: `command -v jq` gates on every block (plus `command -v zip` on the site-directory path) so a missing tool aborts instead of half-publishing, and the failure branch no longer echoes the response body, which can contain an `ownerToken`
- **`/brewdoc:my-claude` spawned an agent that does not exist.** Both the internal and the research mode validated their output by spawning `reviewer` — the step that guaranteed "no invented file names" — and no `reviewer` agent exists in any plugin, in the project, or in the built-in set. The validation step therefore never ran, on either path, which is precisely the step whose absence lets invented paths reach the final document. It now uses `Explore` for the read-only path-existence checks and `general-purpose` for the research-mode source re-check, which needs `WebFetch`/`WebSearch`. Separately, `${BD_PLUGIN_DATA}/my-claude/` was offered as an output directory in both `SKILL.md` and `README.md`; nothing has set that variable since v4.0.0, so a run taking that branch created and wrote into a literal directory named `${BD_PLUGIN_DATA}`. Project-relative `.claude/brewdoc/my-claude/` is now the only supported target

#### Removed
- **`/brewdoc:guide` deleted.** The interactive in-session tutorial was a worse copy of [doc-claude.brewcode.app](https://doc-claude.brewcode.app/getting-started/), and it kept drifting — v4.10.0 had to fix a killer-flow topic still teaching skills removed several releases earlier. The site is the single source now. Its pipeline dependency inside the repo-local `/docs` skill went with it: Phase 5.5 (Guide sync) and `references/guide-update.md` are gone

#### Changed
- **`memory-sync-init` -> `memory-sync-setup`, `docsync` -> `docsync-setup`,** both on the canonical mode set
- **`docsync-setup` and `memory-sync-setup` were the last two skills the model could still reach for on its own.** Both rewrite project memory or install hooks, so being model-invocable was a real hazard, not just a context cost. They now match the rest of the suite (see the suite-wide entry under **all plugins**)

### docs

#### Changed
- **Every doc surface follows the rename:** the root `README.md` and `CLAUDE.md`, all four plugin READMEs, the per-skill READMEs, the Astro pages under `web/docs/src/content/docs/**` and `navigation.ts`. Page URLs moved with the skills — `/brewtools/skills/task-board-init/` is now `/brewtools/skills/task-board-setup/`, and so on for all ten. The `-setup` naming rule and the canonical mode vocabulary are documented once, where the skill tables are introduced
- **Counts corrected to the post-rename tree:** brewcode 9 skills / 5 agents / 2 hooks, brewdoc 5 / 0 / 0, brewtools 12 / 3 / 2, brewui 0. Suite total stays 26 skills and 8 agents — brewcode gained `setup-status`, brewdoc lost `guide`
- **[Full Setup](https://doc-claude.brewcode.app/full-setup/) reconciled against the fix wave** and rewritten to answer *why* the setups are run by hand, one at a time: each asks real questions, spawns many subagents, and creates a lot of files, so each wants its own session. Every recommended command now carries a concrete prompt rather than a bare skill name. New sections cover the six `setup-status` verdicts and why `disabled` outranks `partial`/`stale`, `teams-setup`'s `purge` and its rejection of `enable`/`disable`, and how to get back out of the manager wall including the `upgrade` that existing installs need
- **The user-invoked-only invariant is documented once and cross-linked** — a new [FAQ entry](https://doc-claude.brewcode.app/faq/#auto-invoke) explains the context-cost reasoning, with pointers from the root `README`, `CLAUDE.md`, the brewdoc surfaces and Full Setup

---

## v4.10.1 (2026-08-08)

> Docs: [memory-sync-init](https://doc-claude.brewcode.app/brewdoc/skills/memory-sync-init/)

### brewdoc

#### Fixed
- **`memory-sync-init` HARD depth no longer deletes a rule file.** A `paths:` entry pointing at a tree that no longer exists is now `DANGLING`: the dead entry is dropped from the frontmatter list and reported, and the rule file itself is never removed. Path resolution requires **both** probes to come back empty before a verdict is issued — `git ls-files -- ':(glob)<pattern>'` (the `:(glob)` magic stops git's `*` from crossing `/`, unlike a Claude Code `paths:` glob) and a filesystem `find`, so a git-ignored tree no longer reads as dead. Verdicts are per entry, not per file: `OK | TOO_BROAD | TOO_NARROW | DANGLING | MISSING | CORRECTLY_GLOBAL`, and an existing `paths:` key is never stripped
- **PASS B precedence was ambiguous.** The Borderline table now explicitly **overrides** the obvious-knowledge discriminator, and the "inverts the project default" class is stated as a KEEP. The deletion unit is the whole rule — its numbered row plus every continuation line — not a single line. A file cut by more than half is reported with its `lines_before`/`lines_after` ratio
- **Non-growth vs. PASS A frontmatter repair contradicted each other.** PASS A's shrink-only carve-out for repairing `paths:` is now stated at all four sites that assert non-growth, and the ordering check accepts Phase 2 appends and HARD drops while still requiring surviving numbered ids to keep their number and relative order
- **`agent-audit` read every agent as dead** in any repo whose `.gitignore` hides `.claude/` — the ownership probe used `git ls-files`. It now probes the filesystem. Implied-but-unnamed tools and unverifiable command steps are reported, not silently stripped
- **`generate.sh` emit was not atomic.** A mid-emit failure left a half install that every later emit refused, pushing the user toward the destructive `MEMORY_SYNC_FORCE=1`. Emit now stages into a `mktemp -d` inside `.claude/skills/` and lands with a single `rm -rf && mv`
- **Command injection in `generate.sh`:** the skills counter passed a skill-directory name through `eval`; a directory named `x'$(...)'y` executed. Fixed by passing real arguments. Also: repo root resolves via `git rev-parse --show-toplevel` (or `MEMORY_SYNC_ROOT`), branch derivation walks `origin/HEAD` -> any remote HEAD -> a sole local branch -> `UNDERIVABLE`, `status` scans the reference files too and prints an identical key set whether or not the skill is installed, and scalars are flattened of newlines before substitution
- **Emitted skill self-sync covered 2 of 3 references** — `memory-guide.md` was excluded. `memory-guide.md` itself claimed NARROW-to-BROAD ordering (it is BROAD-to-NARROW), and global user-level memory is now marked OUT OF SCOPE: reported, never edited

#### Changed
- **docs:** the `memory-sync-init` page was written against a 3-file draft. It now documents the four emitted files, the six phases (GATHER, SYNC, VERIFY, SELF-SYNC, PROPOSE, REPORT), the twelve AI-filled blocks, a generator tool list without `Write`, `status` actually running `generate.sh status`, and a new **Depth: NORMAL vs HARD** section

---

## v4.10.0 (2026-08-08)

> Docs: [superreview](https://doc-claude.brewcode.app/brewcode/skills/superreview/) | [teams](https://doc-claude.brewcode.app/brewcode/skills/teams/) | [e2e](https://doc-claude.brewcode.app/brewcode/skills/e2e/) | [skills](https://doc-claude.brewcode.app/brewcode/skills/skills/) | [agents](https://doc-claude.brewcode.app/brewcode/skills/agents/) | [task-board-init](https://doc-claude.brewcode.app/brewtools/skills/task-board-init/) | [manager](https://doc-claude.brewcode.app/brewtools/skills/manager/) | [prompt-injection](https://doc-claude.brewcode.app/brewtools/prompt-injection/) | [memory-sync-init](https://doc-claude.brewcode.app/brewdoc/skills/memory-sync-init/)

### brewcode

#### Removed
- **`/brewcode:spec` deleted.** The plugin-level spec skill is gone; the project-generated `/task-spec` emitted by `/brewtools:task-board-init` replaces it and is strictly better — it knows the board, the task ids and the domain agent roster. Everything worth keeping was ported (see brewtools below). `brewcode/docs/flow.md` went with it — the file documented nothing else

#### Added
- **`superreview upgrade`:** a preserve-hand-edits re-generation path. `emit` now refuses on a live install (exit 1, `already installed`) instead of silently overwriting; `SUPERREVIEW_FORCE=1` is the destructive override. `upgrade` stages a fresh emit into `.claude/skills/superreview/.upgrade-staging/`, writes no live file, and reports per asset `IDENTICAL | DIFFERS (n template line(s)) | MISSING -> restored (NEEDS PHASE 3)`. `emit` now also saves pristine templates to `.claude/skills/superreview/.template-baseline/`, so `upgrade` diffs the genuine old->new **template** delta rather than flagging normal project tailoring as a difference; an install predating the baseline reports `NO BASELINE - full diff, tailoring included`. Both directories carry a `.gitignore` containing `*` and produce no git noise
- **`superreview` emitted `Phase 4b - SELF-SYNC`:** after a review completes, the emitted skill corrects itself from data it already has in context — routing-table roster refresh, gate repair, scope baseline, shared-surface append. `EXTENDED` depth only, coordinator only, never inside a subagent. Gate repair fires only when a gate reported `not run` **and** a `command -v` re-test proves the binary is genuinely absent, so a missing toolchain no longer gets misfiled as a missing gate. Non-growth is measured, not asserted: before/after `wc -l` with a printed delta. A carve-out separates facts (correctable) from scope decisions (never rewritten without user instruction). Re-tailoring domain experts and adding drift rows to `intent-guard.md` are printed proposals, never auto-writes
- **Etalon-first in generated agents:** `/brewcode:teams` and `/brewcode:e2e` agents whose domain writes code, scripts, SQL, schemas or infra now carry — before writing a class, module or test, find the closest well-built existing one in the repo (checking `.claude/convention/*` first) and take its principles, **ADDITIVE to conventions/rules/docs, never a replacement**. Gated exactly like the Scope Fit block, so review-only and docs-only agents do not receive it. `brewcode:agent-creator` emits the same line under the same condition
- **`/brewcode:skills` and `/brewcode:agents` auto-sync:** after a `create` or `improve` completes, the existing `sync` engine is dispatched scoped to the newly written artifact only — no full-roster sweep, no second specialist spawn. The coordinator applies the verdicts itself; the non-growth prime directive still holds. Reports `sync: no drift` when clean

### brewtools

#### Added
- **`task-board-init` session progress:** `.claude/features/PROGRESS.md` is created at init in both `SPEC_MODE` states — `Updated`, `In flight`, `Moved since last update`, `Blocked`, `Next`. It tracks the **session's** progress against the board, not the tasks themselves. The injection mechanism is the auto-loaded `.claude/rules/tasks.md` (scoped to `.claude/features/**`), not a hook: in plan mode any plan touching a task must carry an explicit final step to update it. The `task-tracker` agent no longer only creates tasks — it rewrites the five fields from the board on every run, recreating the file if absent
- **`task-board-init` gate `G5`, close-time spec staleness:** when a task closes, the tracker reuses the two spec documents gate `G2` already has open and reconciles the task's `## Scope` `in` ids against the spec's `## Scope coverage`. A `draft` status or an uncovered/partial id emits `SPEC STALE: <ID> …` plus `NEXT: run /task-spec <ID> refresh`. Report-only: it never spawns, never writes a spec document, never touches `## Scope coverage`, never blocks the close. When the board's `progress` count reaches zero it emits `NEXT: run /brewtools:task-board-init <path> upgrade` — only on boards that already carry the spec layer, since `upgrade` forces `SPEC_MODE=on`
- **Generated `/task-spec`, everything worth keeping from the deleted `/brewcode:spec`:** a clarify pass **before** research with a fixed Scope / Constraints / Edge-cases question table, whose answers are injected into every architect spawn as already-settled context; a size advisory that proposes splitting but defers the split to `task-tracker`, which owns the board; a `-n` / `--noask` non-interactive flag suppressing exactly three interactive points (clarify pass, open-questions batch, review escalation) and explicitly **not** the ambiguous-task-id or missing-`## Scope` stops, which fail loud; a bounded self-review fix loop — find, independently verify, then fix-and-re-review while blockers or majors remain, capped at 3 iterations then escalated to the user; a structured final report block replacing the old prose summary; a four-link agent-resolution chain (team > project > plugin > system) reading `.claude/teams/team.md`, with re-delegation on refusal capped at 2 retries; and `Original requirements` (verbatim) plus `User Q&A` sections in the emitted spec template
- **Etalon-first in `++m`, plan-mode `++m` and `++a`:** every spawn brief that writes code or tests must make the agent find the closest well-built counterpart in the repo and follow its principles — **in addition to conventions/rules/docs, never instead**. The three copies of the sentence are byte-identical by construction

#### Fixed
- **`task-board-init upgrade` no longer double-inserts:** the spec layer and the session-progress layer are now two independent MARK/insert sets. Previously a board that already had the spec layer but lacked `PROGRESS.md` failed the combined marker check and re-inserted every already-present spec block. A fresh init and an upgrade now converge on the same final state, verified for all three starting states
- **`--noask` scope was overstated:** it claimed to suppress every question while two blocking stops still asked
- **`think-short` prompt lost a rule:** the etalon rewrite had dropped "check existing **libraries** for the needed functionality", so third-party reuse stopped being prompted. Restored at zero net lines. `think-short` also now states that the prompt is copied at install time, so an existing install needs a re-run to pick up prompt changes
- **`++a` had no additive clause** — the architect directive stated the etalon rule without "additive to conventions/rules/docs", the exact misreading the rule exists to prevent

### brewdoc

#### Removed
- **`/brewdoc:memory` deleted,** superseded by `/brewdoc:memory-sync-init`, which generates a project-local `memory-sync` skill instead of syncing memory from inside the plugin

#### Fixed
- **`brewdoc/docs/commands.md` documented 2 of 6 skills** — `docsync`, `guide`, `md-to-pdf` and `publish` were missing entirely

### docs

#### Fixed
- **A skill that no longer exists was still fully documented:** the `/brewdoc:memory` page, its navigation entry, its rows in the brewdoc skills table and overview, and four cross-reference cards pointing at it
- **Wrong counts across the suite:** brewcode was published as 9 skills / 10 agents / 9 hooks (actual 8 / 5 / 2), brewtools as 11 skills (actual 12), brewdoc as 7 skills at version 4.2.4 (actual 6 at the current version). Corrected in the root README, all four plugin READMEs, `CLAUDE.md`, `brewcode/docs/file-tree.md`, and the getting-started, quickstart, faq, overview and per-plugin skills pages
- **Two skills were missing from their own rosters:** `brewcode:semble` from four lists, `brewtools:agent-router` from the brewtools skills table (which claimed 12 rows and had 11)
- **`brewdoc:guide` killer-flow topic** still taught `spec -> /brewcode:plan -> /brewcode:start`; `plan` and `start` were removed long ago. Rewritten around the real flow

---

## v4.9.0 (2026-08-08)

> Docs: [superreview](https://doc-claude.brewcode.app/brewcode/skills/superreview/) | [teams](https://doc-claude.brewcode.app/brewcode/skills/teams/) | [task-board-init](https://doc-claude.brewcode.app/brewtools/skills/task-board-init/) | [memory-sync-init](https://doc-claude.brewcode.app/brewdoc/skills/memory-sync-init/)

### brewcode

#### Added
- **`intent-guard`:** a new generated agent, an anti-drift review pass comparing what was ASKED against what was DELIVERED. Read-only, invoked explicitly at review time only, never during development. Sources are ranked in a five-tier hierarchy — external/original sources (tracker ticket, Slack thread, quoted requirements, the user's own words) outrank a local spec, a plan/task board, project policy (`CLAUDE.md`, rules) and the session transcript, in that order, with each finding labelled by its tier. Evidence is deliberately cheap: session transcript, file/directory names, `git diff --stat`, `git log`, manifest diffs — never a full source-file read. Twelve named drift classes (`intent#scope`, `intent#scale`, `intent#indirection`, `intent#files`, `intent#tests`, `intent#deps`, `intent#arch`, `intent#policy`, `intent#skip`, `intent#artifacts`, `intent#naming`, `intent#conflict`) are open-ended examples, not a closed checklist. Its `description` is deliberately short so it never competes for auto-activation. It is generated into the user's own project — it does not ship inside the plugin bundle
- **`superreview` DEPTH axis:** every emitted skill now resolves `QUICK` (default) vs `EXTENDED` semantically from the user's prompt — no flag, no CLI token. `QUICK` runs `intent-guard` plus the mechanical gates in a single spawn; `EXTENDED` adds the full domain-expert fan-out, scope passes and adversarial validation. `intent-guard` runs at both depths. New `generate.sh emit-agent` subcommand is the single writer of `.claude/agents/intent-guard.md` (shared with `teams`), create-or-reuse, printing exactly one `INTENT_GUARD: CREATED <path>` / `INTENT_GUARD: REUSE <path>` line on stdout. Seeded blocks carry an `UNTAILORED` marker until adapted to the project
- **`teams` + intent-guard:** every generated team gets `intent-guard` as a fixed review-only member, outside the Minimal/Balanced/Maximum agent counts (those count domain agents only). An existing agent is reused rather than recreated; `teams` calls superreview's `emit-agent` rather than authoring its own copy. `intent-guard` is excluded from the reviewer role, from implementation ownership and from the cleanup sweep. `verify-team.sh` warns instead of failing on teams created before this change

#### Fixed
- **expert-count / routing gate:** now matches a whole markdown-table cell or an explicit `subagent_type=NAME`, not a bare substring anywhere in the file — a substring match was crediting agents that were merely mentioned, not actually routed to
- **`intent-guard.md` self-healing:** a corrupt or placeholder-laden `.claude/agents/intent-guard.md` (empty, missing `name: intent-guard` frontmatter, or unresolved `{PLACEHOLDER}` tokens) is now recreated from the template instead of silently reused as-is

### brewtools

#### Added
- **`task-board-init` `SPEC_MODE`:** optional per-task product spec + design spec layer. Non-trivial tasks additionally get `specs/<ID>-spec.md` + `specs/<ID>-design.md`, a `spec:` frontmatter field, and a generated `task-spec` skill with a mandatory domain-architect fan-out, a coverage gate and a blocking open-questions close gate before a task can start. A new Step-1 domain-agent inventory pass feeds the fan-out. A new `upgrade` directive retrofits the spec layer onto an already-deployed board — strictly additive, gated per file, never renumbers or rewrites existing rows. `SPEC_MODE=off` (the default question's other answer) stays byte-identical to the pre-spec generator

### brewdoc

#### Added
- **`memory-sync-init`:** a new generator skill. It analyzes a target project and writes a self-contained, project-local `.claude/skills/memory-sync/` — the skill that keeps instruction memory (`CLAUDE.md`, rules, conventions, agent and skill rosters) truthful against the code, rather than syncing memory itself. The emitted skill diffs memory against `session` (default), a branch, a commit range, recent N commits, or the whole tree; repairs facts first, then dedup, then compression, under a non-growth rule (every file ends `<=` its original line count); runs disjoint batches in parallel, one bounded agent per batch, all spawned in one message; independently re-verifies every added/fixed/removed fact against the code, never via the agent that wrote it; and re-audits agents against current best practice on every run, not just fact-checks them

### docs

#### Changed
- **superreview, teams, task-board-init pages:** updated for the `intent-guard` agent, the `QUICK`/`EXTENDED` depth axis, and `SPEC_MODE`
- **memory-sync-init page:** new

---

## v4.8.1 (2026-08-07)

> Docs: [skill-creator](https://doc-claude.brewcode.app/brewcode/agents/skill-creator/) | [skills](https://doc-claude.brewcode.app/brewcode/skills/skills/)

### brewcode

#### Added
- **`cli` / `version` frontmatter contract:** both keys documented as OPTIONAL-but-mandatory-in-their-case across `skill-creator` agent and the `skills` authoring skill (FM Reference, checklist, common mistakes, review-prompt checks 23-24). `cli` names the command(s) a skill owns when the invocation isn't spelled like the skill directory name (e.g. `fitness-nutrition` invoked as `fit`); a fixed denylist blocks claiming a generic command (`sh`, `bash`, `ls`, `curl`, `git`, ...) and `cli` must never be inferred from `allowed-tools`. `version` is a free-form, non-semver change signal: bump it whenever a skill's behaviour lives outside its own directory (a binary on PATH, a wrapper baked into an image, a remote service), since editing that behaviour leaves the directory byte-identical and any consumer watching the dir's content hash sees nothing. `updated:` is a human-facing date only and does not substitute. This closes the plugin-side half of the skill-staleness contract: a host orchestrator on the consuming side detects a skill's content change by hash and tells a running agent its cached copy is stale — it needs both keys authored correctly to do that

---

## v4.8.0 (2026-08-06)

> Docs: [hook-creator](https://doc-claude.brewcode.app/brewcode/agents/hook-creator/) | [agent-creator](https://doc-claude.brewcode.app/brewcode/agents/agent-creator/) | [skill-creator](https://doc-claude.brewcode.app/brewcode/agents/skill-creator/) | [agents](https://doc-claude.brewcode.app/brewcode/skills/agents/) | [skills](https://doc-claude.brewcode.app/brewcode/skills/skills/) | [semble](https://doc-claude.brewcode.app/brewcode/skills/semble/) | [agent-router](https://doc-claude.brewcode.app/brewtools/skills/agent-router/) | [agent-deadline](https://doc-claude.brewcode.app/brewtools/skills/agent-deadline/)

### brewcode

#### Changed
- **`hook-creator` agent (759 -> 622 lines):** facts refreshed to CC 2.1.223 — 31 hook events (was 27/25), 5 hook types incl. `http` and `mcp_tool`, `timeout` unit is seconds with per-event floors, managed/enterprise settings are now documented as HIGHEST precedence (was wrongly documented as lowest), new `async`/`asyncRewake`/`shell` fields, v2.1.195 hyphen matcher exact-match, v2.1.207 shell-interpolation change, v2.1.214 `dir/**` glob breaking change, managed-only settings keys `disableAllHooks`/`allowManagedHooksOnly`/`allowedHttpHookUrls`
- **`agent-creator` agent (599 -> 517 lines):** new discovery section — subagents load by walking UP from cwd to repo root scanning every `.claude/agents/`, so an agent under `<repo>/<module>/.claude/agents/` is invisible to a session launched at repo root; recursive subfolders, `name:` is identity, closest-to-cwd wins on collision. Background-by-default since v2.1.198, nested spawn depth default 3 (not 5), `effort` low/medium/high/xhigh/max, 8 color values, `isolation: worktree` only, `name:` rejects `:` since v2.1.218, `TeamCreate`/`TeamDelete` removed v2.1.178
- **`skill-creator` agent (1054 -> 730 lines):** fabricated `once` frontmatter key removed, description caps corrected to 1024/1536 (not 120/250), listing budget is a dynamic 1% via `skillListingBudgetFraction`, reserved names only `anthropic`/`claude`, project/user skill now overrides a bundled skill, `context: fork` runs background by default since v2.1.218, nested `<subdir>:skill` namespacing and symlinks supported, model alias `fable` -> canonical `claude-fable-5`
- **`.claude/skills/claude-plugin-guide` (project setup docs):** `npm` marketplace source is fully implemented, `pip` source never existed and was removed, `git-subdir` source documented, 13 plugin.json/marketplace fields added, hook catalog replaced by a pointer to the canonical list
- **repo-wide:** `Task` -> `Agent` tool rename across 22 agent/skill frontmatter files; semble version markers and agent-deadline runbook bumped to 2.1.223

#### Added
- **`user/features/CLAUDE-CODE-AUTHORING-UPDATE-2.1.223.md`:** verified source-of-truth doc used for every fact change in this release, plus refreshed `HOOKS-REFERENCE.md`, `CLAUDE-SKILL-DIR-GUIDE.md`, `CLAUDE-CODE-SETTINGS-GUIDE.md`

### brewtools

#### Changed
- **`agent-router`, `agent-deadline`:** version markers and referenced CC facts bumped to 2.1.223 alongside the brewcode authoring stack refresh

---

## v4.7.1 (2026-08-06)

> Docs: [agent-router](https://doc-claude.brewcode.app/brewtools/skills/agent-router/)

### brewtools

#### Fixed
- **agent-router:** an agent the router redirects TO can never be an agent the router flags. `neverFlag` now seeds with `brewcode:agent-creator`, `brewcode:skill-creator`, `brewcode:hook-creator`, `brewcode:bash-expert` — spawning one of them is by definition already the right expert. Made structural rather than a hardcoded list: `normalizeConfig` unions `neverFlag` with every `expert` in the effective `intents` table, so a custom `intents` entry exempts its own expert automatically. Tier-2 judge prompt short-circuits on the same set. The install runbook writes the full 8-entry list — a short list there would silently override the code default. 65 tests, all green

> Docs: [agent-router](https://doc-claude.brewcode.app/brewtools/skills/agent-router/) | [agent-deadline](https://doc-claude.brewcode.app/brewtools/skills/agent-deadline/) | [manager](https://doc-claude.brewcode.app/brewtools/skills/manager/) | [semble](https://doc-claude.brewcode.app/brewcode/skills/semble/)

### brewtools

#### Added
- **`/brewtools:agent-router` (EXPERIMENTAL):** installer skill for a project-local `PreToolUse` hook on matcher `Agent`. When the main loop spawns a generic subagent type for a task a real expert owns, the spawn is denied and the expert is named; when the fit is only uncertain the hook appends a nudge instead; otherwise it stays silent. Modes `status | install | level fast | level strict | disable | enable | uninstall | purge`, all idempotent, foreign hooks never touched. Config at `<project>/.claude/brewtools/agent-router.json` (`enabled, level, genericTypes, neverFlag, minScore, margin, intents`)
  - **tier 1** (default, `level fast`): deterministic Node script, zero tokens, ~69 ms median including node startup; scores the project roster in `.claude/agents/` against the task text and routes to a plugin specialist (`skill-creator` / `agent-creator` / `hook-creator` / `bash-expert`) when no project agent fits. A project agent always beats a plugin specialist
  - **tier 2** (opt-in, `level strict`): `type: "agent"` hook, model `claude-haiku-4-5-20251001`, adjudicates ambiguous picks. Wired and installed/stripped correctly, but **not yet behaviorally verified** — treat as untested. Tier 1 cannot gate it: all matching `PreToolUse` hooks run in parallel and none can skip another, which is why tier 2 is opt-in rather than triggered-on-doubt
  - fails open everywhere — bad input, unparsable config, missing roster, unwritable tmp all allow the spawn. Anti-loop guard keyed by (project root, session, normalized task text) so a deny can never deadlock the model: a repeat becomes a notice
  - not registered in `brewtools/hooks/hooks.json`; nothing is installed until the skill is run. 55 tests, all green

#### Fixed
- **hook `timeout` units:** Claude Code hook `timeout` is **seconds**, not milliseconds (default 600). `brewtools/hooks/hooks.json` shipped `2000`/`3000` — 33 and 50 minute ceilings instead of 2 s and 3 s. Now `2`/`3`. Same bug fixed in the `manager` hard-wall installer (`5000` -> `5`) and in the `agent-deadline` runbook (guard `5000` -> `5`, cleanup `3000` -> `3`, both `want=[...]` verify arrays and the prose rationale)

### brewcode

#### Fixed
- **hook `timeout` units:** `brewcode/hooks/hooks.json` `1000`/`3000` -> `2`/`3` (seconds). `semble` runbook, `semble-guidance.sh` verify/repair arrays and the hook contract tests corrected from `5000` to `5`

---

## v4.6.0 (2026-08-05)

> Docs: [agents](https://doc-claude.brewcode.app/brewcode/skills/agents/) | [skills](https://doc-claude.brewcode.app/brewcode/skills/skills/) | [rules](https://doc-claude.brewcode.app/brewcode/skills/rules/) | [spec](https://doc-claude.brewcode.app/brewcode/skills/spec/) | [convention](https://doc-claude.brewcode.app/brewcode/skills/convention/) | [teams](https://doc-claude.brewcode.app/brewcode/skills/teams/) | [e2e](https://doc-claude.brewcode.app/brewcode/skills/e2e/) | [superreview](https://doc-claude.brewcode.app/brewcode/skills/superreview/) | [agent-creator](https://doc-claude.brewcode.app/brewcode/agents/agent-creator/) | [skill-creator](https://doc-claude.brewcode.app/brewcode/agents/skill-creator/) | [bash-expert](https://doc-claude.brewcode.app/brewcode/agents/bash-expert/) | [manager](https://doc-claude.brewcode.app/brewtools/skills/manager/) | [think-short](https://doc-claude.brewcode.app/brewtools/skills/think-short/) | [task-board-init](https://doc-claude.brewcode.app/brewtools/skills/task-board-init/) | [agent-deadline](https://doc-claude.brewcode.app/brewtools/skills/agent-deadline/) | [text-human](https://doc-claude.brewcode.app/brewtools/skills/text-human/) | [text-optimize](https://doc-claude.brewcode.app/brewtools/skills/text-optimize/) | [guide](https://doc-claude.brewcode.app/brewdoc/skills/guide/) | [memory](https://doc-claude.brewcode.app/brewdoc/skills/memory/)

### brewcode

#### Removed
- **generic agents:** `developer`, `architect`, `reviewer`, `tester` deleted. Every project generates its own agents in `.claude/agents/` (via `/brewcode:teams create`), so the generic four were dead weight that competed with the real specialists. brewcode now ships 5: `agent-creator`, `skill-creator`, `hook-creator`, `bash-expert`, `bc-rules-organizer`
- **docs:** the 4 agent pages and their navigation entries removed; agent counts corrected across README, brewcode README, guide catalog and ASCII diagram (12/9 -> 8/5)

#### Changed
- **agent selection:** every internal spawn that named a generic agent now resolves to "the project's agent from `.claude/agents/`, else `general-purpose`" — `skills`, `agents`, `rules` (`review` mode), `spec` (research fan-out + review gate), `teams` (C5/C7/C9 quorum), `convention` (P2 `Explore` x10, P3 `Plan`, P4 writers), `e2e` (`e2e-architect` / `e2e-reviewer` instead of the plugin pair), `brewdoc:memory` sync, `brewtools:text-human` mixed flow, `brewtools:task-board-init` analysis agent A (`Plan`)
- **agent-creator:** new step 6 — emit two guardrail blocks verbatim into every generated agent. `Output Discipline` is unconditional; `Scope Fit` only for agents whose domain writes code/scripts/SQL/schemas/infra/config. Both added to the definition-of-done checklist; agent-creator applies `Output Discipline` to its own report (agent paths + validation verdict, not full bodies)
- **teams agent-template:** generated agents carry `Output Discipline` on completion (decide what the MAIN session needs, return verdict + `file:line`, bulk output -> `.claude/reports/<ts>_<name>/`, return the path) and a `Scope Fit` block that agent-creator strips for research/docs/review-only agents
- **teams:** agent priority table reworded — plugin level is now "plugin specialist", fallback is `Explore` / `Plan` / `general-purpose`

### brewtools

#### Changed
- **manager `++m`:** protocol step 6 — once ALL code is written (not per-piece), file one recommended final task to simplify the whole written code and strip over-engineering, delegated like any other task
- **manager `++r` / `++rr`:** a simplification pass ("over-engineered? simpler?") runs before the review proper
- **think-short:** injected prompt gained "think short: minimal internal reasoning, no exploring aloud" and a post-write "can this be simpler?" pass; em-dash replaced with ASCII
- **task-board-init:** generated `task-tracker` agent gained an `Output discipline` section (verdict + task ids + `file:line`; no BRD/task-body/backlog dumps; bulk -> `.claude/reports/<ts>_<name>/`) plus a matching checklist item; analysis agent A is now `Plan`
- **agent-deadline:** `byAgentType` examples repointed from the deleted `brewcode:developer` to `brewtools:text-optimizer`

### codex

#### Fixed
- **generate-compat.mjs:** the generator is the source of truth for the Codex mirror and had drifted — regenerating silently reverted the v4.5.1/v4.5.2 manager content. Restored and updated, so the mirror now carries bounded-unit sizing, the six-field brief, the branch rule, the simplification step, and the v4.6.0 output-discipline/scope-fit templates
- **mirror sync:** `.codex/plugins/**` and the per-plugin `.codex/**` trees regenerated — catches up superreview (incl. the new `references/scope.md.template`), text-optimize, text-human, agents, teams and task-board-init content that had drifted out of the mirror

#### Changed
- **agents:** managed Codex agent TOMLs 9 -> 4 (`agent-creator`, `bash-expert`, `hook-creator` for brewcode plus the brewdoc/brewtools set); `install-update.mjs` and `validate-compat.mjs` counts updated
- **prompts:** Codex `PROMPT_CONTEXT` replaced the old `[SKILL?]`/`[HINT]` pair with `[ROLE]` / `[SPLIT]` / `[BRANCH]`, matching the Claude `forced-eval` hook; brewtools SessionStart context now states the bounded-unit rule
- **forced-eval:** `$`-prefixed prompts are no longer skipped

---

## v4.5.3 (2026-08-02)

> Docs: [semble](https://doc-claude.brewcode.app/brewcode/skills/semble/)

### brewcode

#### Fixed
- **semble state:** `phase` self-heals from `absent` for `awaiting_reload|verifying|ready` — it writes the canonical init document at `prereq_ready`, then walks the legal chain hop by hop, each hop validated as usual; the legality table is unchanged, so `absent -> ready` is still not a pair and `absent -> disabled` is still refused
- **semble state:** the second project in a session died at close-out with `illegal phase transition absent -> ready` — `init` only ran when MCP registration mutated, and registration is user-scoped, so every project after the first got `unchanged` and never had a state file
- **semble state:** `complete` took one step, so a close-out passing the whole list failed with `unknown step: prereq mcp permissions guidance agents warm smoke`; it now accepts several steps as multiple arguments or as one whitespace-separated string
- **semble state:** an unknown step token now names itself and writes nothing (exit 2) instead of being partially applied
- **semble skill:** step 4.3 printed a shell variable and so reported `completed:` steps that were never recorded; it now reads the state file back and prints what is actually there

#### Changed
- **semble state:** `--json` for `phase` gained `healed` and `walked`; `complete` gained `steps`. Single-step `complete` is byte-compatible with before
- **semble docs:** README notes Codebase Memory MCP as a possible future companion — not integrated, not installed

---

## v4.5.2 (2026-08-02)

> Docs: [semble](https://doc-claude.brewcode.app/brewcode/skills/semble/)

### brewcode

#### Added
- **semble install:** new `coreutils` subcommand runs `brew install coreutils` to provide `gtimeout` on macOS; `all` now runs check -> uv -> coreutils -> semble
- **semble report:** new `timeout` key — `{backend, path, bounded, coreutils:{status,reason,changed}}`; `bounded` is always `true`
- **semble env:** `SEMBLE_TIMEOUT_BIN` seam to point at a specific timeout binary; `SP_SEARCH_TIMEOUT` is now overridable

#### Fixed
- **semble timeout:** `sc_timeout` is unconditionally bounded — `timeout`, else `gtimeout`, else a pure-bash watchdog that kills the whole process group and returns 124
- **semble search:** `sp_run_search` kept its 600 s bound when no timeout binary is present, instead of silently running unbounded
- **semble guidance:** `semble-guidance.sh` JSON output was missing its trailing newline
- **semble skill:** step 3 offers the coreutils install from the report instead of gating on exit 4, so it is no longer silently skipped
- **semble tests:** `suite-hooks` ran `runNode` with cwd at the repo root and read the developer's real `.claude/semble/state.json`

#### Changed
- **semble install:** coreutils is optional and soft — no brew, a failed brew, `SEMBLE_NO_NETWORK`, `SEMBLE_DRY_RUN` or a missing `--yes` inside `all` all yield status ok and exit 0; only a direct `coreutils` without `--yes` exits 4

---

## v4.5.1 (2026-08-02)

> Docs: [brewcode/hooks](https://doc-claude.brewcode.app/brewcode/hooks/) | [brewtools/prompt-injection](https://doc-claude.brewcode.app/brewtools/prompt-injection/) | [brewtools:manager](https://doc-claude.brewcode.app/brewtools/skills/manager/)

### brewcode

#### Added
- **forced-eval hook:** new `[BRANCH]` line — `Stay on the current branch; none chosen -> main. No explicit branch/PR instruction -> work on main and take over ALL workspace changes, incl. from other sessions.` A branch or PR is opt-in and stated by the user, never inferred; without it a session owns the whole working tree, including edits left by other sessions

#### Changed
- **forced-eval hook:** `[SPLIT]` now bounds a unit by time as well as size (`1 deliverable, ~5 files, ~20 min`) and states the fan-out rule explicitly — a dependency must be a REAL data handoff, else parallel. Payload is 3 lines, still far under the 9K cap
- **codex mirror:** `.codex/hooks/lib/prompt-cadence.mjs` carries the same `[SPLIT]` widening and the new `[BRANCH]` line

### brewtools

#### Changed
- **manager `full` + `planmode` blocks (`++m`):** two new paragraphs — widest fan-out (a dependency must be a REAL data handoff, else parallel; size a unit to ~20 min of agent work, longer -> split again) and the branch rule (current branch, none chosen -> main, no explicit branch/PR -> take over all workspace changes). Same additions in the `.codex` manager mirrors

---

## v4.5.0 (2026-08-02)

> Docs: [semble](https://doc-claude.brewcode.app/brewcode/skills/semble/)

### brewcode

#### Added
- **semble skill:** `/brewcode:semble` installs and configures the Semble semantic code-search MCP server for any project — prompt-driven lifecycle (status, setup, resume, enable, disable, reindex, warm, optimize, update, remove, purge), routes free-text RU/EN, empty input defaults to read-only status
- **install:** no Homebrew formula exists for Semble, so setup installs `uv` via brew and runs the exact pin `uvx --from 'semble[mcp]==0.5.2' semble --content code config`; a confirmation gate precedes any machine-level install
- **mcp:** registers `semble_code` at user scope with an absolute `SEMBLE_CACHE_LOCATION`; code and docs cache roots are isolated from the first release — docs is reserved, not registered
- **adoption:** a `semble-first` project rule, a SessionStart hook and an advisory-only PreToolUse search reminder that never blocks exact `rg`/Grep searches; project agents' `tools:` allowlists get both MCP tool names
- **reload boundary:** setup writes a checkpoint before the MCP mutation and stops, because a newly registered MCP server is unusable until a new Claude Code session; `resume` continues at verification
- **limits:** no watcher/daemon exists; `.html`/`.htm` and `.json`/`.json5`/`.csv`/`.tsv`/`.psv` are not in the code corpus; both MCP tools require an absolute `repo` argument and return `start_line`/`end_line` (there is no `line` field)

---

## v4.4.0 (2026-08-02)

> **grepai removed.** The `/brewcode:grepai` skill, the `bc-grepai-configurator` agent, the two project hooks it self-installed, the `grepai-first` rule template and every "use `grepai_search` first" instruction across all four plugins are gone. Every place that pointed at semantic search now points at the Bash search path (`grep`->ugrep, `find`->bfs, `rg`) that this macOS Claude Code build actually has. brewcode is now **8 skills / 9 agents**.

> Docs: [brewcode overview](https://doc-claude.brewcode.app/brewcode/overview/) | [brewcode skills](https://doc-claude.brewcode.app/brewcode/skills/) | [brewcode agents](https://doc-claude.brewcode.app/brewcode/agents/) | [brewcode hooks](https://doc-claude.brewcode.app/brewcode/hooks/) | [spec](https://doc-claude.brewcode.app/brewcode/skills/spec/) | [convention](https://doc-claude.brewcode.app/brewcode/skills/convention/) | [superreview](https://doc-claude.brewcode.app/brewcode/skills/superreview/) | [architect](https://doc-claude.brewcode.app/brewcode/agents/architect/) | [developer](https://doc-claude.brewcode.app/brewcode/agents/developer/) | [reviewer](https://doc-claude.brewcode.app/brewcode/agents/reviewer/) | [skill-creator](https://doc-claude.brewcode.app/brewcode/agents/skill-creator/) | [agent-creator](https://doc-claude.brewcode.app/brewcode/agents/agent-creator/) | [guide](https://doc-claude.brewcode.app/brewdoc/skills/guide/) | [text-human](https://doc-claude.brewcode.app/brewtools/skills/text-human/) | [getting-started](https://doc-claude.brewcode.app/getting-started/) | [installation](https://doc-claude.brewcode.app/installation/) | [quickstart](https://doc-claude.brewcode.app/quickstart/)

### brewcode

#### Removed
- **grepai skill:** `skills/grepai/` deleted whole — SKILL.md, README, `config.yaml.example`, 14 shell scripts, `scripts/lib/index-common.sh`, and the two hook assets (`grepai-session.mjs`, `grepai-reminder.mjs`) it installed into consumer projects
- **bc-grepai-configurator:** the internal config-generating agent is gone; agent roster 10 -> 9
- **docs + template:** `docs/grepai.md` and `templates/rules/grepai-first.md.template` deleted
- **hooks:** `bc-grepai-configurator` dropped from the system-agent allowlist in `hooks/lib/utils.mjs`

#### Changed
- **architect / reviewer agents:** reuse-first discovery and the "similar exists?" check now run through Bash (`grep`/`rg`/`find`) instead of `grepai_search`. The instruction survives — only the tool changed
- **convention skill:** discovery step moved to Bash search + Read; the "grepai unavailable" error row is gone
- **superreview:** Phase 1 exploration, the emitted `SKILL.md.template` search-first rule, the generated report's "Search tool used" field and the TypeScript/React hook-existence check all retargeted to `rg`/`grep`/`git ls-files`
- **skill-creator / agent-creator:** "grepai injection" generalised to "hook context injection" — the claim was always about UserPromptSubmit context, not about grepai
- **docs:** `docs/commands.md` renumbered (grepai was command 2), `docs/file-tree.md` statistics recounted — 9 agents, 8 skills, 9 scripts, 2 templates, 5 docs

### brewdoc

#### Changed
- **guide:** grepai removed from the skills catalog (brewcode 9 -> 8), the agents catalog (15 -> 12 plugin agents), the advanced-topics list (section 1 deleted, 2-4 renumbered), the installation smoke test (now `/brewcode:skills status`) and the overview workflow. The Plugin Suite ASCII diagram was redrawn rather than line-deleted; brewui, which was missing entirely, is now shown

### brewtools

#### Changed
- **text-human:** the semantic-search block in the java/python/typescript references is gone; the grep block is promoted from "fallback" to the primary pattern

### repo

#### Changed
- **docs site:** `brewcode/skills/grepai.mdx` deleted, nav entry removed, 6 dead links to `/brewcode/skills/grepai/` fixed, and Ollama + bge-m3 dropped from the installation prerequisites — they were only ever needed as grepai's embedder. All counts and card grids recomputed; `npm run build` green, 57 pages
- **rules:** `.claude/rules/grepai-first.md` deleted; the `last_index_time` entry in `avoid.md` went with it (the lesson was purely about grepai's own YAML)
- **codex compat:** `.codex/scripts/generate-compat.mjs` no longer enumerates or generates the grepai skill mirror (-132 lines), so regeneration cannot reintroduce it

---

## v4.3.0 (2026-08-02)

> Repo-wide prompt audit (delegation contract, scope guards, dead-weight removal) **plus** subagent resource limits: verified frontmatter contract, calibrated `maxTurns` across all agents, and the new `agent-deadline` skill — a soft wall-clock deadline that forces a subagent to finalize instead of being killed.

> Docs: [brewcode hooks](https://doc-claude.brewcode.app/brewcode/hooks/) | [spec](https://doc-claude.brewcode.app/brewcode/skills/spec/) | [grepai](https://doc-claude.brewcode.app/brewcode/skills/grepai/) | [skills](https://doc-claude.brewcode.app/brewcode/skills/skills/) | [agents](https://doc-claude.brewcode.app/brewcode/skills/agents/) | [rules](https://doc-claude.brewcode.app/brewcode/skills/rules/) | [teams](https://doc-claude.brewcode.app/brewcode/skills/teams/) | [superreview](https://doc-claude.brewcode.app/brewcode/skills/superreview/) | [convention](https://doc-claude.brewcode.app/brewcode/skills/convention/) | [e2e](https://doc-claude.brewcode.app/brewcode/skills/e2e/) | [developer](https://doc-claude.brewcode.app/brewcode/agents/developer/) | [tester](https://doc-claude.brewcode.app/brewcode/agents/tester/) | [reviewer](https://doc-claude.brewcode.app/brewcode/agents/reviewer/) | [architect](https://doc-claude.brewcode.app/brewcode/agents/architect/) | [skill-creator](https://doc-claude.brewcode.app/brewcode/agents/skill-creator/) | [agent-creator](https://doc-claude.brewcode.app/brewcode/agents/agent-creator/) | [hook-creator](https://doc-claude.brewcode.app/brewcode/agents/hook-creator/) | [bash-expert](https://doc-claude.brewcode.app/brewcode/agents/bash-expert/) | [memory](https://doc-claude.brewcode.app/brewdoc/skills/memory/) | [docsync](https://doc-claude.brewcode.app/brewdoc/skills/docsync/) | [my-claude](https://doc-claude.brewcode.app/brewdoc/skills/my-claude/) | [publish](https://doc-claude.brewcode.app/brewdoc/skills/publish/) | [guide](https://doc-claude.brewcode.app/brewdoc/skills/guide/) | [manager](https://doc-claude.brewcode.app/brewtools/skills/manager/) | [prompt-injection](https://doc-claude.brewcode.app/brewtools/prompt-injection/) | [task-board-init](https://doc-claude.brewcode.app/brewtools/skills/task-board-init/) | [text-human](https://doc-claude.brewcode.app/brewtools/skills/text-human/) | [text-optimize](https://doc-claude.brewcode.app/brewtools/skills/text-optimize/) | [provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/) | [secrets-scan](https://doc-claude.brewcode.app/brewtools/skills/secrets-scan/) | [ssh](https://doc-claude.brewcode.app/brewtools/skills/ssh/) | [deploy](https://doc-claude.brewcode.app/brewtools/skills/deploy/) | [think-short](https://doc-claude.brewcode.app/brewtools/skills/think-short/) | [agent-deadline](https://doc-claude.brewcode.app/brewtools/skills/agent-deadline/) | [plugin-update](https://doc-claude.brewcode.app/brewtools/skills/plugin-update/) | [ssh-admin](https://doc-claude.brewcode.app/brewtools/agents/ssh-admin/) | [deploy-admin](https://doc-claude.brewcode.app/brewtools/agents/deploy-admin/) | [text-optimizer](https://doc-claude.brewcode.app/brewtools/agents/text-optimizer/)

### brewcode

#### Added
- **skills:** `## Delegation` section in every subagent-spawning skill (spec, skills, agents, rules, teams) — names the failure mode ("a big task handed to one agent = an agent gone for an hour"), caps one subagent at ONE bounded unit (one deliverable, ~<=5 files, ~<=10 steps), and requires a six-field spawn brief: GOAL / ROLE / SCOPE / CONTEXT / CONSUMER / DONE
- **superreview:** the emitted `references/SKILL.md.template` carries the same Delegation block, so every generated project-local review skill inherits the contract in the user's repo
- **agents:** `## Scope guard` in all 8 shipped agents (developer, tester, reviewer, architect, skill-creator, agent-creator, hook-creator, bash-expert) — size the task before starting; beyond one bounded unit, STOP and return a split proposal of 2-N subtasks with scope and suggested owner instead of grinding for an hour
- **agents:** every agent now carries an explicit `maxTurns` (developer 120, hook/skill/agent-creator 80, reviewer/architect/tester/bash-expert/bc-* 60) plus a role-specific `## Checkpointing` section. Values are calibrated from real subagent transcripts in this repo (observed runs of 12-51 turns at ~10-20 s/turn), sized at ~2-3x a typical run: `maxTurns` is a runaway backstop, not a budget — a tight limit loses the agent's final report, so it always ships paired with checkpointing
- **agent-creator:** new `SA Resource Limits` section — no wall-clock timeout for a subagent exists anywhere (not frontmatter, not `settings.json`, not an env var); table of what actually bounds one (`CLAUDE_CODE_MAX_TURNS`, `API_TIMEOUT_MS`, `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS`, concurrency/session/spawn-depth caps, token caps); `maxTurns` exhaustion behavior (files persist, final report is lost); which hooks fire inside a subagent loop; partial-result recovery via the subagent transcript, `TaskOutput`/`TaskStop`/`SendMessage`. Plus a definition of *turn* (one inference + its tool calls; parallel calls in one message count as one)

#### Fixed
- **agent-creator:** the documented frontmatter contract was inverted and actively harmful. It claimed `effort`/`maxTurns`/`disallowedTools` were "plugin agents only" and told authors to move an agent into plugin scope to make them work. Verified against both agent parsers in the Claude Code v2.1.220 binary, the truth is the reverse: those keys (plus `memory`, `background`, `model`, `skills`) work in **both** scopes, while `permissionMode`/`hooks`/`mcpServers` are the ones ignored in *plugin* agents — the loader emits `Plugin agent file <path> sets <key>, which is ignored for plugin agents` for each. Also documents the previously unlisted keys `skills`, `memory`, `background`, `initialPrompt`, `observer`, `observerMessage`, `observeSubagents`, `isolation: remote` (last five local-only) and the `name` constraints (no leading `-`, no `:`). `isolation` demoted to low priority — not a default
- **agents:** removed the dead keys the contract fix exposed — `mcpServers: [grepai]` from architect/developer/reviewer/bc-grepai-configurator and `permissionMode` from bc-grepai-configurator/bc-rules-organizer/ssh-admin/deploy-admin. Every one was silently ignored and logged a warning at load; `mcpServers` in particular never granted these agents grepai (they inherit the session's MCP servers instead)

#### Changed
- **forced-eval hook:** payload is now the delegation pair only — `[ROLE]` expert-first manager + new `[SPLIT]` bounded-unit/context-handoff line. The `[SKILL?]` skill-activation nudge is gone (modern models pick skills unaided), and the `/`-prefix skip went with it: a slash command can still carry a task worth delegating, so the reminder fires there too. Meta-reply skip list (yes/no/ok/number/single letter) unchanged
- **grepai:** skill description gained `Triggers:` for LLM auto-invocation; install/reindex/init scripts trimmed
- **reviewer agent:** description gained `Triggers: review code, code review, review PR, check architecture, approve changes`

#### Removed
- **agents + skills:** ~1300 net lines of dead weight — stack-detection tables, SOLID/clean-code lectures, and generic command tables the model already knows

### brewdoc

#### Added
- **memory, my-claude:** `## Delegation` section with the six-field spawn brief

#### Changed
- **docsync, guide, publish:** prompt text trimmed; behavior and modes unchanged

### brewtools

#### Added
- **agent-deadline (NEW skill):** soft wall-clock deadline for subagents. Claude Code has no subagent timeout, and `maxTurns` simply aborts the agent and discards its final report — this installs two hooks that force finalization instead. `PreToolUse` warns the agent once at 80% of its budget, blocks everything but the finalization tools at 100%, and past `hardStopRatio` (default 2x) narrows the allowance to `Write`/`Edit`; `SubagentStop` reaps the state. Modes: `status` (default), `install`, `disable`, `enable`, `uninstall`, `purge`; project or global scope; default budget 20 min with optional per-`agent_type` overrides. **Opt-in** — installing the plugin does not enable it. Fail-open by construction: any hook error passes the call through. Honest limit, stated on the page: this is *not* a timeout — elapsed time is sampled only at tool-call boundaries, so a subagent stuck inside one 25-minute `Bash` is invisible until the next call (`BASH_MAX_TIMEOUT_MS` is the mitigation). 169 tests
- **manager:** the `++m` / `++a` / `++rr` / `++r` reference blocks now name the failure mode and carry the six-field spawn brief (GOAL / ROLE / SCOPE / CONTEXT / CONSUMER / DONE). Codewords themselves unchanged
- **task-board-init:** `## Delegation` section, mirrored into the emitted `references/03-task-board-skill.md` so generated task-board skills inherit it
- **text-human:** per-block Delegation contract for the mixed flow
- **agents:** `## Scope guard` in text-optimizer, ssh-admin, deploy-admin — ssh-admin and deploy-admin additionally split per host, repo, and environment

#### Fixed
- **think-short:** the global install/remove merge parsed `settings.json` inside a swallowing `try/catch` and then wrote unconditionally — one stray comma in `~/.claude/settings.json` and the whole file (model, env, the entire `Bash(rm *)` deny-list, every foreign hook) was replaced by the two think-short entries. It now aborts and leaves the file byte-identical. Hook dedupe also compares full paths instead of basenames, so reinstalling into a different hooks dir no longer leaves a settings entry pointing at a deleted file
- **task-board-init:** frontmatter `name:` was bare `task-board-init`, missing the `brewtools:` prefix
- **text-human:** frontmatter was invalid YAML (unquoted `description`/`argument-hint` containing `--` and `:`); both now quoted
- **provider-switch:** `Task` added to `allowed-tools` — phase P9 spawns 5 Tasks and previously could not

#### Changed
- **manager:** skill description 604 -> 231 chars, triggers preserved
- **ssh, deploy, secrets-scan, think-short, text-optimize, plugin-update:** generic `gh` / `docker` / `systemd` command tables and stack-detection boilerplate removed

## v4.2.4 (2026-07-30)

> Docs: [brewcode hooks](https://doc-claude.brewcode.app/brewcode/hooks/)

### brewcode
#### Changed
- **forced-eval:** `[ROLE]` line rewritten to expert-first delegation — `Manager: scan agents (project .claude/agents/ first) — expert for this domain exists -> delegate regardless of size; no expert or trivial one-off -> self.`
#### Removed
- **forced-eval:** `[HINT] Delegate heavy implementation...` line — "heavy" let domain tasks (ssh, deploy, CI) self-execute even when a project expert agent existed; the trigger is now expert match, not task size

## v4.2.3 (2026-07-24)

> Docs: [text-optimize](https://doc-claude.brewcode.app/brewtools/skills/text-optimize/) | [text-optimizer](https://doc-claude.brewcode.app/brewtools/agents/text-optimizer/)

### brewtools
#### Added
- **text-optimize:** new rule category A - Aggressive Lossy (A.1 line fusion, A.2 low-value word drop, A.3 aggressive paraphrase, A.4 common-knowledge elision) — deep/max only; 52 rules / 8 categories (was 48/7)
- **text-optimize:** loss ledger for A.2/A.4 drops; verification label `elided-known` for A.4 counts against the >=95% gate, A.2 is gate-neutral
- **text-optimizer agent:** aggressive lossy pass wired into deep/max compress, verify labels, report loss ledger
#### Changed
- **docs:** rule counts 48 -> 52 across repo/plugin/skill READMEs + docs site pages; standalone sksh copy skills/text-optimizer synced

## v4.2.2 (2026-07-20)

> Docs: [task-board-init](https://doc-claude.brewcode.app/brewtools/skills/task-board-init/) | [bc-grepai-configurator](https://doc-claude.brewcode.app/brewcode/agents/bc-grepai-configurator/)

### brewtools

#### Changed
- **task-board-init:** generated task-tracker agent pinned to model: sonnet

### brewcode

#### Changed
- **bc-grepai-configurator:** model inherit -> sonnet

---

## v4.2.1 (2026-07-20)

> Docs: [text-optimize](https://doc-claude.brewcode.app/brewtools/skills/text-optimize/) | [text-optimizer](https://doc-claude.brewcode.app/brewtools/agents/text-optimizer/)

### brewtools

#### Changed
- **docs:** text-optimize and text-optimizer pages updated for v4.2.0 — five modes incl. opt-in max (`-x`/`--max`), 48 rules across 7 categories, new Deduplication category D.1-D.6, L.1-L.8, per-mode verification gates (standard >=98%, deep >=95%, max >=95% + 100% sub-gate on numbers/names/negations/scope), dedup pass step in the agent flow
- **docs:** agent page now lists the `Bash` tool and the correct `${CLAUDE_PLUGIN_ROOT}` reference path (was a stale `$BT_PLUGIN_ROOT`)
- **docs:** repo README and brewtools README rule count 30+ -> 48, added `-s`/`-x` usage examples and agent documentation links

#### Fixed
- **docs:** 32 MDX pages linked to bare plugin slugs (`/brewtools/`, `/brewcode/`, `/brewdoc/`) that return 404 — all now point at `/{plugin}/overview/`
- **docs:** removed unused `Badge` imports, converted over-long flow paragraphs into mode/rounds/gate tables, escaped globs, GitHub file links use `/blob/`

### brewdoc

#### Changed
- **guide:** skills catalog row for `/brewtools:text-optimize` refreshed (5 modes, smart dedup, up to 4x)

---

## v4.2.0 (2026-07-20)

> Docs: [text-optimize](https://doc-claude.brewcode.app/brewtools/skills/text-optimize/) | [text-optimizer](https://doc-claude.brewcode.app/brewtools/agents/text-optimizer/)

### brewtools

#### Added
- **dedup:** new Deduplication rule category D.1-D.6 in `rules-review.md` — exact/near/cross-format duplicate merge (most-specific variant wins), emphasis cap <=2 per document (full form early + <=1-line echo at end, 3+ collapse to 2), cross-file SSOT dedup with pointer + 1-line summary, wrong-merge guard (different scope/numbers/conditions = different facts). Rule count 42 -> 48, 7 categories
- **loss-budget:** per-mode Loss Budget table — light/medium 100% lossless, standard >=98%, deep >=95%, max >=95% + 100% sub-gate on numbers/names/negations/scope qualifiers; dedup-merged facts count as preserved ((kept+merged)/total)
- **verification:** fact-inventory protocol at all verified modes; medium gains a self-check; max now runs 2 independent rounds — claim inventory (one predicate per claim) + self-QA probe (10-20 questions); dedup ledger with lost/distorted/merged loss-list labels
- **compression:** sentence-level zero-loss pruning + structure-aware compression (standard); Redundancy Factoring (phrase-DICT, path-prefix hoisting, header echo removal, number normalization) + LLMLingua-2 token-class keep/drop heuristics (deep); Chain-of-Density final pass B4 (max); emphasis-inflation downgrade + anti-laziness booster deletion (C.7/T.6)
- **agent:** text-optimizer agent gains `-x`/`--max` mode (opt-in), Step 3a dedup pass, 7-row verification table
- **tests:** `test-optimize.sh` 34 -> 44 checks (D category, `-x` flag, Max/Dedup/Loss Budget sections, L.1-L.8)

#### Fixed
- **skill:** removed stale `$BT_PLUGIN_ROOT` / `pre-task.mjs` references from SKILL.md orchestration (native `${CLAUDE_PLUGIN_ROOT}` substitution)
- **markdown:** escaped raw `|` inside backticked code spans in table cells (GFM cell splits) across rules-review, deep/max-compression
- **standalone:** `skills/text-optimizer` synced — L.8, C.7/C.8/T.10 surfaced in SKILL.md, D category, dedup pass, loss budget, v2.16.0; category table corrected to sum 48

## v4.1.0 (2026-07-19)

> New **`/brewdoc:docsync`** skill replaces the retired `auto-sync`. docsync is a user-run, project-scoped generator: point it at any repo and it installs three project-local hooks (`docsync-track` on Write/Edit/MultiEdit, `docsync-watch` on Read, `docsync-gate` on Stop) plus config into `.claude/`, then tracks documentation staleness by the `last_updated` frontmatter date. When docs you touched this session are stale, the Stop hook blocks once and asks (via AskUserQuestion) whether to sync — never auto-syncs without confirmation. Prompt-driven modes (no rigid flags): `init`, `status`, `sync [--all]`, `reread`, `frontmatter`, `uninstall`. Frontmatter schema: `doc_type` (llm|user|skip), `last_updated`, `sync_procedure`. The settings.json merge is non-clobbering (backup + abort-on-parse-fail + BOM-tolerant), hook paths use `$CLAUDE_PROJECT_DIR` for portability, and `uninstall` removes only docsync entries while preserving foreign hooks — verified against fresh, existing-hooks, and corrupt-settings projects.

> The legacy `auto-sync` skill, its `bd-auto-sync-processor` agent, the old `auto-sync:*` frontmatter tag mechanism (swept from ~44 files), and the skill-creator template injection were removed completely.

> Docs: [docsync](https://doc-claude.brewcode.app/brewdoc/skills/docsync/) | [brewdoc overview](https://doc-claude.brewcode.app/brewdoc/overview/)

### brewdoc
#### Added
- **docsync:** new hook-driven doc-staleness tracker with init/status/sync/reread/frontmatter/uninstall modes, project-local install, and confirm-before-sync gate
#### Removed
- **auto-sync:** retired the skill + `bd-auto-sync-processor` agent + `auto-sync:*` frontmatter tags across the suite; replaced by docsync

---

## v4.0.6 (2026-07-18)

> Infra: production moved off the decommissioned Contabo VPS to Fornex (79.132.136.83, Ubuntu 24.04.4 LTS). The docs site doc-claude.brewcode.app was redeployed on the new host with no plugin behavior changes. SSH reference docs and the eurodns skill example were repointed to the new server IP.

### brewtools
#### Changed
- **ssh:** best-practices `HostName` example repointed to the new Fornex server IP (79.132.136.83)

---

## v4.0.5 (2026-07-05)

> New Manager codeword `++a` (Architecture-first) plus a think-short comment-discipline gate. `++a` is a third independent codeword group alongside `++m` (manager) and `++rr`/`++r` (review): it injects a `[DIRECTIVE: ARCHITECTURE-FIRST]` block that forces an architecture pass before implementation — design fitting the project's existing architecture/patterns/rules, robust + scalable + simple (no over-engineering), reuse-first, clean seams. Mode-agnostic (same block in normal and plan mode; in plan mode it is written into the plan) and combinable with `++m`/`++rr`/`++r`. think-short now tells the model to comment like a human, not an AI — fewer comments, only where non-obvious, docstrings/JavaDoc/PyDoc kept.

> Docs: [manager](https://doc-claude.brewcode.app/brewtools/skills/manager/) | [prompt-injection](https://doc-claude.brewcode.app/brewtools/prompt-injection/) | [think-short](https://doc-claude.brewcode.app/brewtools/skills/think-short/)

### brewtools
#### Added
- **manager:** `++a` codeword — Architecture-first directive. Independent third group (combines with `++m` and the review group); injects `references/architect.md` (`[DIRECTIVE: ARCHITECTURE-FIRST]`); mode-agnostic, written into the plan in plan mode. Hook detection + injection order manager -> architect -> review; `architect` added to `VALID_MODES`

#### Changed
- **think-short:** injected prompt gains a comment-discipline gate — comment like a human not an AI: fewer comments, only non-obvious logic / public APIs / docstrings; stop line-by-line AI-slop narration; docstrings (JavaDoc/PyDoc) kept, just terser

---

## v4.0.4 (2026-07-05)

> Strengthens Manager mode so the role survives the plan/exit boundary. The plan-mode block now forces the role INTO the plan itself (PREAMBLE restating `[ROLE: MANAGER]` + protocol, explicit `STEP 0` = re-assume role + build the whole TaskGraph + delegate on exit), because the injected hook context dies when plan mode ends while the plan document persists. Both `full` and `planmode` prompt blocks recompacted (~35% shorter) without losing meaning. brewcode's `forced-eval` reminder gains a standing `[ROLE]` manager delegation line.

> Docs: [manager](https://doc-claude.brewcode.app/brewtools/skills/manager/)

### brewtools
#### Changed
- **manager:** `planmode` block now bakes the manager role into the plan — PREAMBLE (role + 5-step protocol verbatim) and a literal `STEP 0` (re-assume MANAGER, create the ENTIRE TaskGraph, then delegate) as the first implementation action; fixes the role evaporating on plan exit
- **manager:** `full` + `planmode` prompt blocks recompacted (~35% fewer lines), same protocol and visceral framing preserved

### brewcode
#### Changed
- **forced-eval:** always-on UserPromptSubmit reminder now appends a standing `[ROLE] You are the manager — delegate, do not implement directly.` line alongside the existing `[SKILL?]`/`[HINT]` payload

---

## v4.0.3 (2026-07-01)

> Restricts 15 skills across brewcode/brewdoc/brewtools to user-only invocation (`disable-model-invocation: true`) — side-effect or config-mutating skills (create agent/skill/team, generate spec/e2e/convention docs, sync rules, optimize memory, document installation, manager mode, plugin-update, provider-switch, task-board-init, think-short, guide) no longer auto-trigger from LLM description matching; still callable via `/plugin:skill`.

> Docs: [agents](https://doc-claude.brewcode.app/brewcode/skills/agents/) | [convention](https://doc-claude.brewcode.app/brewcode/skills/convention/) | [e2e](https://doc-claude.brewcode.app/brewcode/skills/e2e/) | [rules](https://doc-claude.brewcode.app/brewcode/skills/rules/) | [skills](https://doc-claude.brewcode.app/brewcode/skills/skills/) | [spec](https://doc-claude.brewcode.app/brewcode/skills/spec/) | [teams](https://doc-claude.brewcode.app/brewcode/skills/teams/) | [guide](https://doc-claude.brewcode.app/brewdoc/skills/guide/) | [memory](https://doc-claude.brewcode.app/brewdoc/skills/memory/) | [my-claude](https://doc-claude.brewcode.app/brewdoc/skills/my-claude/) | [manager](https://doc-claude.brewcode.app/brewtools/skills/manager/) | [plugin-update](https://doc-claude.brewcode.app/brewtools/skills/plugin-update/) | [provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/) | [task-board-init](https://doc-claude.brewcode.app/brewtools/skills/task-board-init/) | [think-short](https://doc-claude.brewcode.app/brewtools/skills/think-short/)

### brewcode
#### Changed
- **agents, convention, e2e, rules, skills, spec, teams:** added `disable-model-invocation: true` — user-invoked only, no more LLM auto-trigger on generic trigger words

### brewdoc
#### Changed
- **guide, memory, my-claude:** added `disable-model-invocation: true` — user-invoked only

### brewtools
#### Changed
- **manager, plugin-update, provider-switch, task-board-init, think-short:** added `disable-model-invocation: true` — user-invoked only, prevents accidental config/hook/provider mutation from ambiguous LLM-detected triggers

---

## v4.0.2 (2026-06-30)

> Patch fix — think-short's own smoke test was broken since the v4.0.0 family-roots purge.

> Docs: [think-short](https://doc-claude.brewcode.app/brewtools/skills/think-short/)

### brewtools
#### Fixed
- **think-short:** `SKILL.md` still listed `family-roots.mjs` as a required asset and smoke-tested it, but the file was deleted in v4.0.0's family-roots purge — every install hit a false `❌ missing family-roots.mjs`. Removed the 3 stale references; asset list and smoke test now match the actual 3-script + prompt.md asset set.

---

## v4.0.1 (2026-06-30)

> Docs-only follow-up to v4.0.0 — purges leftover v3.19.0 task-system documentation debt from the site so docs match the real plugin.

> Docs: [brewcode overview](https://doc-claude.brewcode.app/brewcode/overview/) | [agents](https://doc-claude.brewcode.app/brewcode/agents/) | [grepai](https://doc-claude.brewcode.app/brewcode/skills/grepai/) | [superreview](https://doc-claude.brewcode.app/brewcode/skills/superreview/) | [getting-started](https://doc-claude.brewcode.app/getting-started/) | [quickstart](https://doc-claude.brewcode.app/quickstart/) | [installation](https://doc-claude.brewcode.app/installation/)

### docs
#### Removed
- **workflow page:** deleted `brewcode/workflow.mdx` (described the removed KNOWLEDGE/plan/start/handoff pipeline) + its `navigation.ts` entry
- **dead skill/agent refs:** purged all links to removed skills (`/brewcode:setup`, `/brewcode:plan`, `/brewcode:start`, `/brewcode:standards-review`, `/brewcode:teardown`) and removed agents (`bc-coordinator`, `bc-knowledge-manager`) across getting-started, quickstart, installation, overview, agents, and skill/agent pages
- **task-system framing:** removed dead KNOWLEDGE auto-accumulation / post-task / coordinator-loop / "infinite task" descriptions
#### Changed
- **brewcode counts reconciled:** 9 skills (spec, grepai, convention, rules, superreview, skills, agents, teams, e2e), 10 agents, 2 hooks; suite total 4 hooks
- **grepai:** documented self-install behavior on its MDX page
- **superreview:** now documented as the generator of the project-tailored deep-review skill (review + standards merged)

---

## v4.0.0 (2026-06-30)

> **MAJOR / breaking** — injection-hook architecture removed across all plugins; plugin-root now resolved natively via `${CLAUDE_PLUGIN_ROOT}`.

> Docs: [brewcode hooks](https://doc-claude.brewcode.app/brewcode/hooks/) | [brewcode overview](https://doc-claude.brewcode.app/brewcode/overview/) | [grepai](https://doc-claude.brewcode.app/brewcode/skills/grepai/) | [superreview](https://doc-claude.brewcode.app/brewcode/skills/superreview/) | [skill-creator](https://doc-claude.brewcode.app/brewcode/agents/skill-creator/) | [agent-creator](https://doc-claude.brewcode.app/brewcode/agents/agent-creator/) | [brewdoc hooks](https://doc-claude.brewcode.app/brewdoc/hooks/) | [brewtools hooks](https://doc-claude.brewcode.app/brewtools/hooks/) | [think-short](https://doc-claude.brewcode.app/brewtools/skills/think-short/) | [manager](https://doc-claude.brewcode.app/brewtools/skills/manager/)

### brewcode
#### Removed
- **pre-task.mjs:** deleted; entire family-roots injection machinery removed (`hooks/lib/family-roots.mjs`, `.claude/scripts/check-family-roots.sh` + bump-version drift guard)
- **dead mode system:** `getActiveMode`, `modes.json`, `[MODE:]`/`[EFFORT: terse-light]` injections, SID/teams injection all removed; `getActiveMode` dropped from `hooks/lib/utils.mjs`
- **grepai always-on hooks:** `grepai-session.mjs` + `grepai-reminder.mjs` deregistered from `hooks.json`; orphan sources deleted
- **skills/skills:** Mode Switcher skill-generation pattern removed
#### Changed
- **plugin-root (breaking):** resolved NATIVELY via `${CLAUDE_PLUGIN_ROOT}` substituted in each agent `.md` at Task spawn — no more hook injection of `BC_PLUGIN_ROOT`; all agents converted
- **forced-eval.mjs:** stripped of mode/effort/plugin-root injection — now injects only the constant `[SKILL?]` reminder
- **session-start.mjs:** keeps version-check + plan-symlink + permission tag; mode/effort/root injection removed
- brewcode now registers exactly 2 hooks (forced-eval, session-start)
#### Added
- **grepai self-install:** self-contained assets (`skills/grepai/assets/{grepai-session.mjs,grepai-reminder.mjs,INSTALL.md}`); `/brewcode:grepai` detects + installs hooks into project `.claude/grepai/hooks/` and merges into `.claude/settings.json` (jq + python3, no clobber), default project scope, reports
- **superreview** skill (+ docs page)

### brewdoc
#### Removed
- **pre-task.mjs + lib/family-roots.mjs:** deleted — brewdoc now ships ZERO hooks (`hooks.json` is `{"hooks":{}}`)
#### Changed
- **bd-auto-sync-processor:** resolves its root natively via `${CLAUDE_PLUGIN_ROOT}`

### brewtools
#### Removed
- **pre-task.mjs + lib/family-roots.mjs:** deleted; `skills/think-short/assets/family-roots.mjs` removed
- **skills debate, skill-toggle, agent-toggle:** removed entirely (incl. `_shared/toggle`)
#### Changed
- **session-start.mjs:** stripped of `BT_PLUGIN_ROOT` injection + session-id display (manager HARD-wall awareness kept)
- **think-short:** task hook injects `${injection}\n\n${tool_input.prompt}`, copies 4 files; E2E suite updated (family-roots tests removed)
- brewtools registers 2 hooks (session-start, manager-prompt)

### docs
#### Changed
- root `CLAUDE.md`, all plugin READMEs, `brewcode/docs/*`, `brewdoc/docs/hooks.md`, `web/docs` MDX (hooks/overview/think-short/grepai/skills/agents) and `brewdoc/skills/guide/references/*` updated to new hook inventory + native `${CLAUDE_PLUGIN_ROOT}` + grepai self-install + Mode Switcher removal

---

## v3.19.5 (2026-06-29)

### brewcode
#### Removed
- **session-start.mjs:** dead lock-detection block removed (injected stale bc-coordinator/PLAN.md instructions)
- **utils.mjs:** 16 dead task/lock exported functions removed (backed deleted hooks)
- **docs:** remaining plan/start/KNOWLEDGE/PLAN.md stale refs cleaned from commands.md, file-tree.md, README.md

---

## v3.19.4 (2026-06-29)

### brewcode
#### Removed
- **lib/knowledge.mjs:** deleted (orphaned, zero imports)
- **KNOWLEDGE.jsonl.template + brewcode.config.json knowledge settings:** removed from setup
- **report templates:** brewcode/templates/reports/ deleted (only consumer was bc-coordinator)
- **session-start.mjs:** PLAN.md/KNOWLEDGE.jsonl handoff injection removed
- **utils.mjs:** DEFAULT_CONFIG.knowledge block + validateConfig knowledge checks removed
- all remaining stale references to deleted hooks (post-task, pre-compact, stop) cleaned from docs

---

## v3.19.3 (2026-06-29)

### brewcode
#### Removed
- **bc-coordinator, bc-knowledge-manager agents:** removed (coupled to deleted start skill)
- **setup templates:** PLAN.md.template + phase templates removed; setup now generates SPEC + KNOWLEDGE templates only
- **hooks:** post-task.mjs, pre-compact.mjs, stop.mjs deleted (dead start/coordinator flow); hooks.json PostToolUse/PreCompact/Stop entries removed; pre-task.mjs stripped of lock/KNOWLEDGE injection; utils.mjs isCoordinator() + coordinator system-agent entries removed
- **docs/hooks.md:** removed (entirely about start/coordinator flow)
- all remaining /brewcode:plan and /brewcode:start references purged from agents, README, docs, setup skill

---

## v3.19.2 (2026-06-29)

### brewcode
#### Removed
- **teardown skill:** brewcode:teardown removed

---

## v3.19.1 (2026-06-29)

> Docs: [brewcode overview](https://doc-claude.brewcode.app/brewcode/overview/) | [setup skill](https://doc-claude.brewcode.app/brewcode/skills/setup/) | [convention skill](https://doc-claude.brewcode.app/brewcode/skills/convention/) | [e2e skill](https://doc-claude.brewcode.app/brewcode/skills/e2e/) | [rules skill](https://doc-claude.brewcode.app/brewcode/skills/rules/) | [skills skill](https://doc-claude.brewcode.app/brewcode/skills/skills/) | [agents skill](https://doc-claude.brewcode.app/brewcode/skills/agents/) | [teams skill](https://doc-claude.brewcode.app/brewcode/skills/teams/) | [teardown skill](https://doc-claude.brewcode.app/brewcode/skills/teardown/) | [standards-review skill](https://doc-claude.brewcode.app/brewcode/skills/standards-review/)

> Partial revert of v3.19.0: only `plan` + `start` stay removed. Everything else the strip removed is restored.

### brewcode
#### Restored
- **skills (9):** setup, convention, e2e, rules, skills, agents, teams, teardown, standards-review — re-added; brewcode now ships 11 skills (these + spec + grepai)
- **internal agents:** bc-coordinator, bc-knowledge-manager, bc-rules-organizer
- **hooks:** pre-task.mjs, post-task.mjs, pre-compact.mjs, stop.mjs + lib/knowledge.mjs; session-start.mjs / utils.mjs task/lock/KNOWLEDGE logic
- **templates:** reports/ and skills/review/ template dirs
- **internal docs:** brewcode/docs/{flow,hooks,commands}.md

#### Removed
- **plan + start skills:** stay stripped — infinite task-execution flow retired; spec hands off to the `developer` agent

---

## v3.19.0 (2026-06-29)

> Docs: [brewcode overview](https://doc-claude.brewcode.app/brewcode/overview/) | [spec skill](https://doc-claude.brewcode.app/brewcode/skills/spec/) | [grepai skill](https://doc-claude.brewcode.app/brewcode/skills/grepai/)

### brewcode
#### Removed
- **task execution system:** stripped plan, start, setup, rules, convention, teardown, teams, standards-review, skills, agents, e2e (11 skills removed; 2 kept: spec + grepai)
- **internal agents:** bc-coordinator, bc-knowledge-manager, bc-rules-organizer removed
- **task-system hooks:** pre-task.mjs, post-task.mjs, pre-compact.mjs, stop.mjs removed
- **lib/knowledge.mjs:** removed
- **utils.mjs:** task/lock functions removed; also dropped dead `knowledge`/`agents.system` config and `isSystemAgent`
- **session-start.mjs:** KNOWLEDGE.jsonl + lock-file handoff logic stripped
- **templates:** reports/ and skills/ template dirs removed
- **internal docs:** brewcode/docs/{flow,hooks,commands}.md deleted; file-tree.md + grepai.md rewritten to current state

#### Changed
- **brewcode reframed:** lean skill + prompt-injection toolkit (spec authoring + semantic code search via grepai)
- **spec skill:** no longer depends on `/brewcode:setup` templates or `/brewcode:plan`; hands the finished SPEC to the `developer` agent
- **grepai docs:** injection points updated for macOS CC (PreToolUse:Bash; native Grep/Glob removed)

---

## v3.18.4 (2026-06-27)

> Docs: [brewdoc overview](https://doc-claude.brewcode.app/brewdoc/overview/) | [brewtools overview](https://doc-claude.brewcode.app/brewtools/overview/) | [brewcode overview](https://doc-claude.brewcode.app/brewcode/overview/)

> Native Grep/Glob tools were removed on the macOS Claude Code build (v2.1.117+); code search now runs through Bash (shadow `grep`->ugrep, `find`->bfs, `rg`). Agents that search MUST list `Bash` in their `tools:`.

### brewcode
#### Fixed
- **agent-creator:** added `Bash` to `tools:` — could no longer grep/find without it on macOS CC builds.

### brewdoc
#### Fixed
- **bd-auto-sync-processor:** added `Bash` to `tools:` — search now works on macOS CC builds.

### brewtools
#### Fixed
- **text-optimizer:** added `Bash` to `tools:` — search now works on macOS CC builds.

---

## v3.18.3 (2026-06-27)

> Docs: [brewcode hooks](https://doc-claude.brewcode.app/brewcode/overview/)

### brewcode

#### Fixed
- **grepai-reminder hook:** retargeted from dead `PreToolUse:Glob|Grep` to `PreToolUse:Bash`. Native Grep/Glob tools were removed on the macOS Claude Code build -- code search now runs through Bash (shadow `grep`->ugrep, `find`->bfs, `rg`). The hook now gates on a search-command regex (grep/egrep/fgrep/ugrep/rg/ag/ack/find/bfs) so the grepai reminder still fires only on actual searches; `.grepai/index.gob` guard + 60s throttle preserved.

---

## v3.18.2 (2026-06-27)

> Docs: [brewui overview](https://doc-claude.brewcode.app/brewui/overview/)

Brewui no longer ships any hooks -- they were dead weight (brewui has no skills/agents and never registered hooks in its manifest).

### brewui

#### Removed
- **hooks:** deleted the entire `brewui/hooks/` directory (`hooks.json`, `session-start.mjs`, `pre-task.mjs`, `lib/utils.mjs`). brewui registered no hooks in `plugin.json`, so these files were inert. `BU_PLUGIN_ROOT` is no longer injected (nothing consumed it). Docs scrubbed accordingly (brewui overview, brewui skills page, brewdoc guide hook catalog).

---

## v3.18.1 (2026-06-27)

> Docs: [brewtools prompt-injection](https://doc-claude.brewcode.app/brewtools/prompt-injection/)

The `manager-prompt.mjs` hook now injects BOTH codeword groups (manager + review) together instead of only the first match.

### brewtools

#### Fixed
- **manager hook:** the `manager-prompt.mjs` UserPromptSubmit hook injected only the FIRST matched codeword, so typing both a manager codeword (`++m`/`++mp`) and a review codeword (`++r`/`++rr`) in one prompt silently dropped the review block. Now the two groups are detected independently and BOTH blocks are injected together (manager first, then review), regardless of how many codewords are typed. Longer prefixes still win within each group (`++mp`>`++m`, `++rr`>`++r`).

---

## v3.18.0 (2026-06-27)

> Docs: [brewui overview](https://doc-claude.brewcode.app/brewui/overview/) | [brewui skills](https://doc-claude.brewcode.app/brewui/skills/) | [brewcode agents](https://doc-claude.brewcode.app/brewcode/agents/) | [brewdoc auto-sync](https://doc-claude.brewcode.app/brewdoc/skills/auto-sync/)

Documentation sync to reality: internal agents hidden from public docs, brewui shipped as an empty-but-installable placeholder, and skill/agent counts recomputed across all doc levels. Skill total is now 32; shipped agents 16.

### brewui

#### Changed
- **plugin:** now ships as an empty, installable placeholder for future UI/visual/creative tools. The `image-gen` skill was removed and `skills/` is empty. Installing brewui still registers its hooks and reserves the `/brewui:*` namespace, with no commands yet.
- **docs:** overview, skills, and agents pages rewritten to a "coming soon" placeholder; README, plugin manifest, and marketplace entry updated to the placeholder description.

### brewcode

#### Changed
- **agents:** `bc-coordinator`, `bc-knowledge-manager`, `bc-grepai-configurator`, and `bc-rules-organizer` are now documented as internal (spawned only by skills and hooks). Their dedicated doc pages were removed; summary tables, navigation, the architecture overview, and the README mark them internal with no deep links.
- **docs:** removed a spurious `/brewcode:debate` row from the skill tables (debate is a brewtools skill); the brewcode skill count stays 13 and the suite total is recomputed to 32.

### brewdoc

#### Changed
- **agents:** `bd-auto-sync-processor` documented as internal across the README, overview, the auto-sync skill page, and the guide catalog.

### brewtools

#### Changed
- **skill-toggle:** running example updated from the removed `brewui:image-gen` to the existing `brewdoc:md-to-pdf`.

---

## v3.17.0 (2026-06-27)

> Docs: [brewcode hooks](https://doc-claude.brewcode.app/brewcode/hooks/) | [brewtools manager](https://doc-claude.brewcode.app/brewtools/skills/manager/)

Hook modernization for Claude Code SDK 2.1.195. All changes are backward-compatible and presence-guarded -- zero behavior regression.

### brewcode

#### Changed
- **hooks:** `session-start` now logs `permission_mode` for audit and bounds its `additionalContext` to ~9K (10K disk-spill safety threshold, CC 2.1.174). `pre-task` skips KNOWLEDGE injection when `permission_mode === 'plan'`. `forced-eval` bounds its `additionalContext` to ~9K.

#### Fixed
- **post-task:** hardened subagent-failure detection to read `tool_result ?? tool_response` -- the legacy field stays primary (zero regression) while future-proofing against the documented SDK field rename.

### brewtools

#### Changed
- **hooks:** `session-start` logs `permission_mode`. `manager-prompt` bounds injected `additionalContext` to ~9K at both output sites (codeword detection + HARD-wall logic UNCHANGED). `hardmode-guard` re-verified on 2026-06-27 that the `agent_id`/`agent_type` main-vs-subagent discriminator still HOLDS on CC 2.1.195 (defensive comment added).

### brewui

#### Changed
- **hooks:** `session-start` logs `permission_mode`.

---

## v3.16.6 (2026-06-27)

> Docs: [hook-creator](https://doc-claude.brewcode.app/brewcode/agents/hook-creator/) | [brewcode hooks](https://doc-claude.brewcode.app/brewcode/hooks/)

### brewcode

#### Changed
- **docs:** hooks reference synced to Claude Code 2.1.195 (empirically verified). Documented all **5 hook entry types** -- added the previously-missing `mcp_tool` (invokes + awaits a configured MCP server tool; `server`/`tool`/`input` with `${...}` interpolation; returned text parsed as command-style stdout JSON), and **corrected `prompt`/`agent`** to allow/block **gates** (LLM evaluates allow vs block+reason; their text is NOT injected into model context) rather than context injectors. Clarified `http` (POSTs full payload via axios, blocks for JSON response; user-prompt field named `prompt`). Added control facts: hooks cannot select/change the model; `updatedInput` rewrites tool args on PreToolUse only (silently ignored on UserPromptSubmit). `pre-task`/`post-task` matchers shown as `Task|Agent`.

---

## v3.16.5 (2026-06-18)

`brewdoc:publish` now auto-renders Markdown files as styled pages. A `.md`/`.markdown` file path is published via `/api/html?format=markdown` (pretty rendered) instead of `/api/files` (raw download). All other file types are unchanged — only Markdown files switch to the rendered path.

---

## v3.16.4 (2026-06-17)

Provider-switch model-data accuracy pass: refreshed every provider model in the docs, not just GLM. Updated to Claude Opus 4.8, corrected GPT-5.5 to native OpenAI API (was mislabeled OpenRouter-only) and added GPT-5.5 Codex, set GLM-5.2 to 1M context with SWE-bench Pro 62.1% (self-reported) and dropped the unverified "#1" claim, and fixed MiniMax to MiniMax-M3 (1M). All vendor SWE-bench figures now carry a "(self-reported)" label since independent leaderboards had not yet listed the newest 2026 models.

---

## v3.16.3 (2026-06-17)

Hotfix: finalizes the mobile horizontal-overflow fix.

- Moved the wide SWE-bench comparison table out of the DaisyUI `.alert` callout on the provider-switch page so it renders as a plain table that scrolls horizontally within itself, eliminating page-level overflow at mobile widths. Verified at 390px (page scrollWidth == viewport width).

---

## v3.16.2 (2026-06-17)

Hotfix: completes the mobile horizontal-overflow fix from v3.16.1.

- Wide tables inside DaisyUI `.alert` callouts (e.g. the provider-switch SWE-bench table) now scroll within the callout instead of forcing page-level horizontal overflow at mobile widths.

---

## v3.16.1 (2026-06-17)

Docs-only release: full 3-level documentation sync.

- Reconciled skill/agent/hook counts across all docs to ground truth (33 skills, 16 agents, 9 lifecycle hooks).
- Fixed provider-switch web-doc alias: `claudedeepseek` -> `claudeds` (matches the real skill alias).
- Fixed mobile horizontal-overflow on documentation pages (DaisyUI `.alert` grid now uses `minmax(0, 1fr)` + `min-width: 0`).
- Removed final GLM/Z.ai residue (`cogview`) from image-gen provider discovery.

---

## v3.16.0 (2026-06-17)

### brewui

#### Changed
- **provider-switch model refresh:** updated the model catalog -- GLM bumped to GLM 5.2, Qwen to Qwen 3.7-plus, MiniMax to MiniMax-M3; DeepSeek stays on deepseek-v4-pro (unchanged); OpenRouter catalog refreshed.

#### Removed
- **complete GLM Vision removal:** dropped the `glm-design-to-code` skill, the `glm-zai-specialist` and `glm-openrouter-specialist` agents, the `glm-design-to-code-trial`, and the Z.ai provider from image-gen.

---

## v3.15.0 (2026-06-14)

> Docs: [brewtools:manager](https://doc-claude.brewcode.app/brewtools/skills/manager/) | [brewtools prompt-injection](https://doc-claude.brewcode.app/brewtools/prompt-injection/)

### brewtools

#### Added
- **manager:** two new prompt-injection codewords. `++rr` (Regression Review) injects anti-regression review discipline -- after each significant phase, review for no-regression + project standard + correctness, two-phase review->double-check->fix, with a mandatory final cross-review at task end. `++r` (Review) injects a lighter two-phase multi-agent review (review->double-check->fix) after each significant change. Both are codeword-only (no ambient/HARD-wall injection); detection order is `++mp` -> `++m` -> `++rr` -> `++r` (longest-prefix first).

#### Changed
- **manager docs:** every codeword table across all doc levels (manager skill page, prompt-injection concept page, SKILL.md, READMEs, CLAUDE.md) now carries a plain-English decode for all four codewords (`++m` = Manager, `++mp` = Manager for Plan, `++rr` = Regression Review, `++r` = Review).

---

## v3.14.5 (2026-06-14)

> Docs: [brewtools:manager](https://doc-claude.brewcode.app/brewtools/skills/manager/) | [brewtools:think-short](https://doc-claude.brewcode.app/brewtools/skills/think-short/)

### brewtools

#### Fixed
- **docs:** removed Russian text that had leaked into rendered examples and trigger tables on the manager and think-short pages -- all examples and invocations are now English. The skills still accept Russian natural language; that is now noted in one English line per page pointing to the skill's SKILL.md for the full RU+EN trigger list. Repo-wide sweep confirms zero Cyrillic in any docs MDX.

---

## v3.14.4 (2026-06-14)

> Docs: [brewtools:manager](https://doc-claude.brewcode.app/brewtools/skills/manager/)

### brewtools

#### Changed
- **docs (manager):** surfaced the HARD wall for non-technical readers -- new visible "The HARD wall" section with a plain-language Callout, a concrete blocked-edit example (main session tries to edit a file -> blocked with a deny message -> delegates to a subagent that has full freedom), and an at-a-glance allowed/blocked table. Deep mechanics remain in the technical spoiler.

---

## v3.14.3 (2026-06-14)

> Docs: [brewtools:manager](https://doc-claude.brewcode.app/brewtools/skills/manager/) | [Prompt Injection](https://doc-claude.brewcode.app/brewtools/prompt-injection/)

### brewtools

#### Changed
- **docs (manager):** rewrote the manager page user-first. The top now shows only the essentials -- a plain-language intro, a highlighted before/after example (you type `++m <task>` -> Claude receives an injected Manager contract + your task), simple codeword and everyday-command tables. All deep technical detail (HARD wall internals, tool buckets, strict/balanced, prompt-resolution chains, scopes, full intent reference) moved under collapsible `<details>` spoilers so a non-technical reader can ignore it.

---

## v3.14.2 (2026-06-14)

> Docs: [Prompt Injection](https://doc-claude.brewcode.app/brewtools/prompt-injection/)

### docs-site

#### Fixed
- **Tabs component:** tab panels now initialize on direct page loads, not only on view-transition navigations. The init logic was extracted into `initTabs()` and is invoked immediately AND on `astro:page-load` (idempotent via the `dataset.initialized` guard). Previously, on a hard load the tab group never hydrated -- both panels rendered stacked and tab switching was inert. Fixes the Tabs on the new Prompt Injection page plus installation and brewcode overview.

---

## v3.14.1 (2026-06-14)

> Docs: [Prompt Injection](https://doc-claude.brewcode.app/brewtools/prompt-injection/) | [brewtools:manager](https://doc-claude.brewcode.app/brewtools/skills/manager/)

### brewtools

#### Added
- **docs:** new "Prompt Injection" concept page explaining the `++m`/`++mp` codeword mechanism -- how the `UserPromptSubmit` hook injects a full Manager operating contract via `additionalContext` (invisible to the user, fully in the model's context), the prompt-resolution fallback chain, and the codeword/HARD-wall trigger table. Two-way cross-links with the manager skill page.

#### Fixed
- **docs:** deduped brewtools skill sidebar `order` frontmatter (3119 collision -> unique 3120-3125).

---

## v3.14.0 (2026-06-14)

> Docs: [brewtools:task-board-init](https://doc-claude.brewcode.app/brewtools/skills/task-board-init/) | [brewtools:manager](https://doc-claude.brewcode.app/brewtools/skills/manager/)

### brewtools

#### Added
- **task-board-init:** generator skill that deploys a self-contained file-based Kanban into ANY target repo via multi-agent analysis. Four steps: (1) multi-agent repo analysis -> domains/id-prefixes, source-path exclusions, release style, doc language (confirmed via AskUserQuestion); (2) generates a parametrized `.claude/agents/task-tracker.md` curator; (3) generates an on-demand `.claude/skills/task-board/` dashboard (view/add/move/backlog/groom, delegates heavy passes to task-tracker); (4) writes a paths-scoped `.claude/rules/tasks.md` (board canonical, folder==status, lifecycle, + run-task-tracker-at-task-start rule kept out of CLAUDE.md), scaffolds `.claude/features/**`, and runs a multi-agent doc sweep that migrates legacy backlog/feature docs into the board. Mirrors the brewpage-app/yasna-bot etalons.

#### Changed
- **docs:** full 4-level documentation pass for task-board-init (new MDX page, navigation.ts, plugin + repo README, guide catalog) and manager (clarified hard-one-shot auto-revert + manager-run no-wall-toggle distinction).

---

## v3.13.0 (2026-06-14)

> Docs: [brewtools:manager](https://doc-claude.brewcode.app/brewtools/skills/manager/)

### brewtools

#### Added
- **manager:** HARD Delegation Mode — opt-in PreToolUse wall installed per-project via `/brewtools:manager on`. Blocks Write/Edit/NotebookEdit/WebFetch/MCP-write and mutating Bash in the main session; subagents stay free (agent_id linchpin). Self-contained guard (zero plugin imports), fail-open.
- **manager:** new intents `on` (install+arm), `off` (disarm, state-only), `uninstall` (deregister), `level <strict|balanced>` (Bash/WebSearch/MCP policy). Install-once + state-gate: guard registered in `.claude/settings.local.json`, runtime-gated by project `state.json {hard, level}`. Wall is PROJECT-ONLY.
- **manager:** session-start banner `⛔ MANAGER HARD wall ON` when armed.

#### Changed
- **manager:** `++m`/`++mp` codewords now ALWAYS fire (removed the `enabled` state gate); when the wall is armed the Manager (full) block also auto-injects every turn. `status` rewritten as the main explainer (codewords + wall state + level + toggle).

#### Notes
- Migration: legacy `state.json {enabled}` is ignored; the wall defaults OFF (opt-in). Re-run `/brewtools:manager on` to arm.

---

## v3.12.3 (2026-06-14)

> Docs: [brewcode/hooks](https://doc-claude.brewcode.app/brewcode/hooks/)

> **Theme:** doc-accuracy follow-up to v3.12.2 — the public hooks page still described `forced-eval` via the old `updatedInput` channel. Found by a project-wide final review that otherwise confirmed all 15 hooks, agents, and manifests are clean.

### brewcode

#### Changed
- **Docs match code:** the `brewcode/hooks` MDX page documented `forced-eval` as emitting `updatedInput` and "returning the modified prompt" — wrong since v3.12.2. Corrected to `additionalContext` (UserPromptSubmit cannot rewrite the prompt), and the payload description updated to the current default (`[SKILL?]` skill-check always-on + light `[HINT]`; full Manager mode on-demand via `++m`).
- **Guide tightened:** `topic-customization` no longer implies UserPromptSubmit can transform the prompt, and scopes `updatedInput` to PreToolUse/PermissionRequest.

> Final-review result: no remaining hook output-channel bugs across brewcode/brewdoc/brewtools/brewui; `hook-creator`/`agent-creator` agent guidance verified authoritative; all hook registrations and custom user hooks valid.

---

## v3.12.2 (2026-06-14)

> Docs: [brewcode/agents/hook-creator](https://doc-claude.brewcode.app/brewcode/agents/hook-creator/)

> **Theme:** fix a silent `UserPromptSubmit` hook bug found via live debug-log analysis, and correct the hook-creator agent's output-channel guidance so the bug can't recur.

### brewcode

#### Fixed
- **`forced-eval.mjs` skill-activation hook now actually reaches the model.** It injected its `[SKILL?]` skill-check reminder via `updatedInput.prompt`, which Claude Code 2.1.x **silently ignores on `UserPromptSubmit`** (confirmed in a live debug log: `unrecognized keys (ignored): updatedInput`). Migrated to the supported `hookSpecificOutput.additionalContext` channel — the reminder now lands every turn. All skip logic (slash-commands, meta-replies, empty prompts) and the effort-level prefix are preserved.
- **Softer default reminder.** The hook's default (no active mode) no longer asserts a hard always-on `[DELEGATE] You are a MANAGER … never implement directly`; it now emits a light `[HINT]` to prefer delegation, with full Manager framing left to the on-demand `++m` codeword (`brewtools:manager`). Removes redundancy with the manager skill and global instructions.

#### Changed
- **`hook-creator` agent corrected.** Its per-event output-channel reference was inaccurate (implied `updatedInput` was a general context channel). Replaced with an authoritative per-event matrix: `additionalContext` for SessionStart/UserPromptSubmit/PreToolUse/PostToolUse, `updatedInput` only for PreToolUse/PermissionRequest, `updatedToolOutput` for PostToolUse, and `Stop`/`SubagentStop` accept `additionalContext` since CC 2.1.163 — preventing this class of bug in generated hooks. An audit of all 15 hooks across the four plugins confirmed no other channel violations.

---

## v3.12.1 (2026-06-13)

> Docs: [brewtools/skills/manager](https://doc-claude.brewcode.app/brewtools/skills/manager/)

> **Theme:** multi-agent review hardening of v3.12.0 `brewtools:manager` — security + correctness fixes and repo-wide count consistency.

### brewtools

#### Fixed
- **Path-traversal guard:** `resolvePromptPath` (and `resolvePrompt`) now validate `scope` and `mode` against an allowlist before building a filesystem path — closes a traversal vector reachable via the skill's `edit`/`reset` actions (which call `unlinkSync`/`writeFileSync`).
- **Lock safety:** `writeState` now throws instead of writing unlocked if the lock was not acquired, and `releaseLock` never unlinks a lock it does not own. Same guard applied to the shared `_shared/toggle/deny.mjs` (agent-toggle) which carried the identical latent bug.
- **Codeword anchoring:** `++m`/`++mp` now match only as standalone tokens (anchored regex), so prompts like `++money` or `x++mx` no longer trigger Manager injection. `++mp`-before-`++m` ordering preserved.
- **Override robustness:** the prompt-text extractor accepts both ` ``` ` and `~~~` fences, and the skill's `edit` action seeds overrides un-wrapped — fixing silent truncation when an override contained a backtick fence.
- **Honest mode state:** invalid `mode` in a state file is clamped to `full`; `status` now labels the stored mode as an informational default (the codeword alone selects the injected block) instead of an inert "active mode".

#### Changed
- **Count consistency:** corrected stale skill/agent/hook counts across `brewtools/README.md` (version + skills), root `README.md` (brewtools 12 skills, missing rows added), `getting-started.mdx`, `brewtools/skills.mdx` (reconciled to all 12 skills incl. manager), `installation.mdx` (suite aggregate), the guide hook catalog (brewtools 3 hooks + `manager-prompt.mjs`), and project `CLAUDE.md`.

---

## v3.12.0 (2026-06-13)

> Docs: [brewtools/skills/manager](https://doc-claude.brewcode.app/brewtools/skills/manager/)

> **Theme:** new `brewtools:manager` skill + a `UserPromptSubmit` hook that turns a short codeword into an on-demand, auto-injected "delegate-everything" Manager prompt — controllable by natural language, editable, and surviving plugin updates.

### brewtools

#### Added
- **`brewtools:manager` skill** — intent-driven control plane (RU+EN) for Manager mode. Turns natural language into `on` / `off` / `status` / `mode <full|planmode>` / `edit` / `reset` (with `--scope project|global`), and runs any bare prompt as an inline Manager (builds a TaskGraph, delegates to the best-matching agent). `status` prints the live state and the exact English block injected for each codeword.
- **`UserPromptSubmit` hook (`manager-prompt.mjs`)** — detects a codeword anywhere in the prompt and injects the matching Manager block via `additionalContext` for the same turn: `++m` -> full Manager block, `++mp` -> full + Plan Mode addon (`++mp` is tested before `++m` to avoid prefix collision). State-gated (`enabled !== false`), zero overhead when off or no codeword, and fully fail-safe — any error injects nothing and never breaks the prompt.
- **Editable, update-proof prompts.** State resolves project (`.claude/brewtools/manager/state.json`) -> global (`~/.claude/manager/state.json`) -> default `{enabled:true, mode:"full"}`. Prompt text resolves project override -> global override -> plugin default (`references/{full,planmode}.md`). Global writes go through bundled Node helpers (atomic lock + tmp + rename) since `~/.claude/*` is protected for the Write/Edit tools.

## v3.11.0 (2026-06-12)

> Docs: [brewtools/skills/text-human](https://doc-claude.brewcode.app/brewtools/skills/text-human/)

> **Theme:** rebuild `brewtools:text-human` from a code-only cleaner into a universal, context-aware, flow-based humanizer backed by web-researched and adversarially-validated pattern catalogs.

### brewtools

#### Changed
- **text-human is now universal:** works on source code, comments, docstrings/JavaDoc, technical docs, commits/PRs, published articles, and reddit/chat text -- not just code. A greedy flow-detection phase picks ONE of five domain flows from context (prompt + extension + content sniff) and announces it: `code`, `docs`, `social`, `article`, `mixed`.
- **Two-pass model:** PASS 1 strips validated AI tells, tiered by reliability -- HIGH-tier acts on a single hit, MED-tier acts only on co-occurring density, and behaviour-changing items (hallucinated refs, fabricated tickets, try/except-everything) are surfaced for review and never auto-edited. PASS 2 injects register-fit human style, gated per domain.
- **Hard guards:** human-injection is OFF for code / API docs / formal-contract; a global guard forbids injecting typos, errors, or fabricated references in any flow. Positioned honestly as "removes AI surface artifacts and fits register" -- it does not claim to detect authorship.
- **Universal arguments:** accepts a path, commit hash, folder, free-text prompt, path + prompt, or no args. The prompt both selects/overrides the flow and adds custom rules.

#### Added
- **Validated pattern catalogs** (`reference/ai-patterns.md`, `reference/human-patterns.md`) and five flow references (`reference/flows/{code,docs,social,article,mixed}.md`). Catalogs are sourced from corpus studies, Wikipedia AI-cleanup consensus, and practitioner research, then filtered to drop high-false-positive folklore (em-dash, rule-of-three, smart quotes, "too clean" code). The existing per-language references (java/python/typescript) are retained and used by the `code` flow.

---

## v3.10.0 (2026-06-11)

> Docs: [brewcode/agents/skill-creator](https://doc-claude.brewcode.app/brewcode/agents/skill-creator/) | [brewcode/agents/agent-creator](https://doc-claude.brewcode.app/brewcode/agents/agent-creator/) | [brewcode/agents/hook-creator](https://doc-claude.brewcode.app/brewcode/agents/hook-creator/) | [brewcode/hooks](https://doc-claude.brewcode.app/brewcode/hooks/) | [brewtools/skills/plugin-update](https://doc-claude.brewcode.app/brewtools/skills/plugin-update/) | [faq](https://doc-claude.brewcode.app/faq/) | [installation](https://doc-claude.brewcode.app/installation/)

> **Theme:** sync the plugin suite with Claude Code 2.1.144-2.1.173 — remove false platform claims, document new features, shorten skill/agent descriptions, and deep-compress LLM-facing docs.

### repo

#### Fixed
- **plugin list claim was false:** the suite documented that `claude plugin list` does not exist. It has existed since CC 2.1.163. `brewtools:plugin-update` now uses `claude plugin list --json` as the **primary** discovery path (objects: `id, version, scope, enabled, installPath, installedAt, lastUpdated, mcpServers?`; `version` may be `"unknown"`; prefix `unset CLAUDECODE &&` inside a session). `discover-plugins.sh` is kept as the **fallback** for CC < 2.1.163. Fixed in SKILL.md, references, README, `faq.mdx`, `installation.mdx`, and the plugin-update MDX page.
- **"subagents cannot spawn subagents" was false:** CC 2.1.172 allows nesting up to 5 levels. Corrected in `CLAUDE.md`, `agent-creator`, `skill-creator`, guide refs, and MDX. Framed correctly: CC allows it, but the **brewcode workflow** still requires spawning from the main conversation (the 2-step report protocol binds the lock to one session and delivers report/coordinator instructions there; nested spawns bypass session binding, KNOWLEDGE injection, and the coordinator loop).
- **"Stop additionalContext does nothing" was false:** Stop and SubagentStop hooks support `hookSpecificOutput.additionalContext` since CC 2.1.163. Corrected in `hook-creator` and `hooks.mdx`.

### brewcode

#### Added
- **CC 2.1.144-2.1.173 platform facts** across creator agents: `disallowed-tools` skill frontmatter (2.1.152), `/reload-skills` (2.1.152), root-level `SKILL.md` with no `skills/` subdir (2.1.142), `MessageDisplay` hook event (2.1.152), SessionStart `reloadSkills` / `sessionTitle` outputs (2.1.152), `--safe-mode` / `CLAUDE_CODE_SAFE_MODE` and `disableBundledSkills` / `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS` (2.1.169), post-session hook (2.1.169, self-hosted runner only — NOT a hooks.json event), and **Fable 5** (`claude-fable-5`, Mythos-class above Opus, CC 2.1.170) added to agent model lists.
- **session-start hook sets sessionTitle:** `session-start.mjs` now sets `hookSpecificOutput.sessionTitle` to the active brewcode task name when a task lock exists (CC 2.1.152; ignored by older CC).

#### Changed
- **Shorter skill/agent descriptions:** every skill description trimmed to <= 120 chars (optimal ~100) and every agent description to <= 100 chars (optimal ~80), keeping the strongest distinct trigger keywords (EN + RU where present). `<example>` blocks removed from creator-agent frontmatter. The skill/agent generators (skill-creator, agent-creator, `skills`, `agents`, `teams`, `setup`, `e2e`) now emit descriptions within these caps.

### Optimization

#### Changed
- **Deep/standard token compression of LLM-facing docs.** Top files compressed (chars, deep batch + key agents):

| File | Before | After | Saved |
|------|--------|-------|-------|
| brewcode/docs/flow.md | ~72.3K | ~57.5K | -20% |
| brewcode/docs/grepai.md | ~49.2K | ~16.8K | -66% |
| brewcode/docs/commands.md | ~39.4K | ~17.5K | -55% |
| brewcode/docs/hooks.md | ~30.7K | ~12.5K | -58% |
| brewcode/agents/skill-creator.md | ~50.8K | ~38.6K | -25% |
| brewcode/agents/hook-creator.md | ~44.8K | ~26.2K | -43% |
| brewcode/agents/agent-creator.md | ~30.1K | ~21.8K | -23% |
| brewui/skills/glm-design-to-code/SKILL.md | ~34.4K | ~21.5K | -37% |

  Plus standard-mode passes on the remaining top-25 + Phase 1-2 touched files. Deep+key set: ~430.9K -> ~330.8K chars (~25K tokens, **-23%**). Frontmatter and all facts preserved; every compressed file passed a comprehension gate (32/32 questions) and path-existence check.

### Next (deferred)
- `MessageDisplay` hook adoption in brewcode hooks (2.1.152) — documented, not yet wired.
- Nested subagents inside the brewcode workflow (2.1.172) — requires session-aware lock handling in `pre-task.mjs`/`post-task.mjs` first.

---

## v3.9.2 (2026-05-16)

### repo

#### Fixed
- **version sync restored:** v3.9.1 was tagged with only `brewdoc/.claude-plugin/plugin.json` bumped to 3.9.1; the other 5 version files (brewcode/brewtools/brewui `plugin.json`, `.claude-plugin/marketplace.json`, `brewcode/package.json`) stayed on 3.9.0, breaking the cross-plugin version check used by `/brewtools:plugin-update`. v3.9.2 re-runs `bump-version.sh` so all 6 JSON files share one version. No code changes in any plugin — version-sync release only.

---

## v3.9.1 (2026-05-15)

### brewdoc

#### Changed
- **publish skill — owner-token semantics:** `brewdoc/skills/publish/SKILL.md` HEADER comment in 5 history-file scaffolds now reads `Owner tokens allow delete (no in-place PUT for sites; html/json/kv support PUT). Keep this file private.` (was `Owner tokens allow update/delete. ...`). AI agents reading the prior wording inferred `PUT /api/sites/{ns}/{id}` exists and hit 405; the corrected text disambiguates which resources accept PUT.

---

## v3.9.0 (2026-05-12)

> Docs: [brewcode/skills/start](https://doc-claude.brewcode.app/brewcode/skills/start/) | [brewcode/agents/reviewer](https://doc-claude.brewcode.app/brewcode/agents/reviewer/) | [brewcode/agents/architect](https://doc-claude.brewcode.app/brewcode/agents/architect/) | [brewcode/agents/developer](https://doc-claude.brewcode.app/brewcode/agents/developer/) | [brewtools/skills/plugin-update](https://doc-claude.brewcode.app/brewtools/skills/plugin-update/)

### brewcode

#### Added
- **effort.level propagation:** `pre-task.mjs` and `forced-eval.mjs` now read effort.level from session state and prepend an idempotent `[EFFORT: <level> | MODE: terse-<variant>]` line to delegated prompts. Downstream subagents inherit the parent's effort budget without explicit relay.
- **`/goal` anchor in start:** `brewcode/skills/start/SKILL.md` Step 2 now anchors the user-stated goal as `/goal` for stable reference across phases and handoffs.
- **CRITICAL: PRESERVE handoff emphasis:** `pre-compact.mjs` writes handoff blocks with `CRITICAL: PRESERVE` prefix; the summarizer empirically retains prefixed content at higher fidelity. Wording softened to avoid alarmist tone while keeping the emphasis hook.
- **❌ CRITICAL KNOWLEDGE prefix:** `pre-task.mjs` prefixes injected KNOWLEDGE entries with `❌ CRITICAL:` for `❌` priority items, improving recall in long contexts.
- **mcpServers frontmatter (CLI-direct fallback):** `reviewer.md`, `architect.md`, `developer.md`, `bc-grepai-configurator.md` now declare `mcpServers: [grepai]` so the agent inherits the MCP server even when launched via CLI-direct flow (bypassing the parent session's auto-load).

### brewtools

#### Added
- **plugin-update Phase 2b (token-details table):** `plugin-update/SKILL.md` adds a per-plugin token-cost table populated from `claude plugin --help` exit-code precheck; degrades gracefully if `--help` is unavailable on the running CC version.
- **plugin-update Phase 5b (prune):** post-update prune of stale plugin cache versions, gated by the same `--help` precheck. No-op on unsupported CC versions.
- **effort=low auto-enables think-short=light:** `brewtools/hooks/session-start.mjs` and `pre-task.mjs` detect effort.level=low at session/task boundaries and auto-enable `think-short=light` for the session, guarded by a session-marker to stay idempotent across reruns.

### docs

#### Added
- **agent/skill/hook-creator MDX:** worktree.baseRef and bypassPermissions callouts added to `web/docs/src/content/docs/brewcode/agents/{agent,skill,hook}-creator.mdx` clarifying baseRef pin semantics and the bypassPermissions guard interplay.

### Notes
- **v3.8.0 Migration & Rollback corrected post-release:** the project-scope backup path (`<cwd>/.claude/brewtools/toggle-state.json.bak.pre-migration-<TS>`) was added, and the unverified `claude plugin update --version` flag was replaced with a marketplace tag-ref pin (`marketplace add ...#vX.Y.Z`). No code change in v3.8.0; doc-only correction applied before this release.

---

## v3.8.0 (2026-05-12)

> Docs: [brewtools/skills/skill-toggle](https://doc-claude.brewcode.app/brewtools/skills/skill-toggle/) | [brewcode/skills/grepai](https://doc-claude.brewcode.app/brewcode/skills/grepai/) | [brewcode/skills/teardown](https://doc-claude.brewcode.app/brewcode/skills/teardown/)

### All plugins

#### Fixed
- **hooks.json exec form (CRITICAL):** all four plugins (`brewcode`, `brewdoc`, `brewtools`, `brewui`) had `hooks.json` entries using the broken dual `command`+`args` form which Claude Code 2.1.139 silently ignored. Converted every entry to the proper exec form: `"command":"node","args":["${CLAUDE_PLUGIN_ROOT}/hooks/<file>.mjs"]`. Restores SessionStart, PreToolUse, PostToolUse, PreCompact, Stop hook dispatch across the suite.

### brewtools

#### Added
- **skill-toggle settings.json migration (CC 2.1.115+):** skill enable/disable now uses the official `~/.claude/settings.json` `skillOverrides` mechanism instead of file-rename (`SKILL.md` ⇄ `_SKILL.md`). Atomic writes (`tmp + fsync + rename`), lock-file identity check (PID + start-time), stale-lock recovery on crashed sessions. Survives plugin updates without filesystem mutation.
- **reapply-disables embedded migrator:** one-shot SessionStart migrator detects legacy `toggle-state.json` skill entries and rewrites them into `skillOverrides`. Writes pre-migration backup `toggle-state.json.bak.pre-migration-<TS>` BEFORE any deletion. Idempotent — no-op on subsequent sessions.

#### Changed
- **skill-toggle helpers:** new `helpers/` directory consolidating settings.json read/write, lock management, and migration probes.

### brewcode

#### Added
- **grepai `alwaysLoad:true`:** `mcp-check.sh` now sets `alwaysLoad:true` on the grepai MCP server via CLI-first / JSON-patch fallback (handles both `claude mcp` CLI presence and direct settings.json editing). Ensures grepai is hot at session-start without manual `/mcp` invocation.
- **teardown `--full` mode (CC 2.1.115+):** `claude project purge` integration with inline `PURGE` confirmation prompt, Claude Code version probe (`claude --version`), and partial-recoverability backup. Removes plugin data + project state in one atomic flow when user explicitly opts in.

#### Changed
- **teardown SKILL.md:** documents `--full` flag, version-gate behavior, and recovery path.

#### Migration & Rollback
- **Auto-migration:** On first SessionStart after upgrade, brewtools `reapply-disables` hook migrates legacy `toggle-state.json` skill entries to `~/.claude/settings.json` `skillOverrides`. A backup is written to `toggle-state.json.bak.pre-migration-<TS>` BEFORE deletion.
- **Backup locations (BOTH scopes):**
  - Global scope: `~/.claude/plugins/data/brewtools-claude-brewcode/toggle-state.json.bak.pre-migration-<TS>`
  - Project scope: `<cwd>/.claude/brewtools/toggle-state.json.bak.pre-migration-<TS>` (one per project that had local skill disables)
- **Downgrade to v3.7.x — steps:**
  1. Restore the pre-migration backup in whichever scope(s) you used: `cp toggle-state.json.bak.pre-migration-<TS> toggle-state.json` at the matching path above.
  2. (Optional) Manually remove the now-stale `skillOverrides` block from `~/.claude/settings.json` — v3.7.x ignores it, but the entries persist and may confuse future migrations or audits.
  3. Re-pin to v3.7.19 by re-adding the marketplace at the tag ref: `claude plugin marketplace remove claude-brewcode && claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode.git#v3.7.19 && claude plugin update brewtools@claude-brewcode` (the `--version` flag on `claude plugin update` is not a verified subcommand option — use the marketplace tag-ref pin instead).
- **agent-toggle unaffected** — agent state still uses file-rename approach.

---

## v3.7.19 (2026-05-12)

> Docs: [brewtools/skills/think-short](https://doc-claude.brewcode.app/brewtools/skills/think-short/) | [brewtools/plugin](https://doc-claude.brewcode.app/brewtools/)

### brewtools

#### Fixed
- **plugin schema:** removed `config` block from `plugin.json` (Claude Code 2.1.139 dropped support; was a BLOCKER causing schema validation to fail). think-short defaults relocated to inline `DEFAULT_THINK_SHORT` constant in `helpers/state.mjs`. Env-var override `THINK_SHORT_DEFAULT` and global/project state files unchanged.
- **think-short env:** `process.env.CLAUDE_SESSION_ID` → `process.env.CLAUDE_CODE_SESSION_ID` (3 sites in `SKILL.md`). Template variable `${CLAUDE_SESSION_ID}` unchanged.
- **docs:** updated fallback-chain documentation in MDX and SKILL.md to reflect removed plugin.json config block.

---

## v3.7.18 (2026-05-12)

> Docs: [brewcode:setup](https://doc-claude.brewcode.app/brewcode/skills/setup/)

### brewcode
#### Fixed
- **setup.sh:** `bash setup.sh review` (and `collect_agents` for global/plugin agents) aborted with rc=1 on the happy path under `set -euo pipefail`. The trailing filter pipelines at L164 (placeholder-warning filter) and L240/241/255/258 (agent-frontmatter `grep | head | sed | tr | xargs`) returned rc=1 when there was nothing to filter (no unresolved placeholders, no `name:`/`description:` line), `pipefail` propagated through `$(...)`, and the bare assignment tripped errexit. Appended `|| true` to each pipeline. Downstream `[ -n "$_unresolved" ]` / `[ -n "$name" ]` already gate on empty result; defense-in-depth `test -f .../SKILL.md` at L183 still catches missing output. Completes v3.7.15 direction.

---

## v3.7.17 (2026-05-01)

> Docs: [brewdoc:publish](https://doc-claude.brewcode.app/brewdoc/skills/publish/)

### brewdoc
#### Fixed
- **publish docs:** TTL default in `publish.mdx` (L15, L78) and `README.md` (4 occurrences) said `5 days` — server truth is `15` (verified vs `brewpage-app application.yml: default-ttl-days: 15`). Aligned with SKILL.md fixed in v3.7.16.
#### Added
- **publish docs:** "Companion tools" CardGrid section on the publish skill page — links to `brewpage-mcp` (npm MCP server, multi-file support), OpenAPI Scalar spec at `kochetkov-ma.github.io/brewpage-openapi`, and the REST API base at `brewpage.app/api`. Lets users discover non-Claude-Code paths to BrewPage Sites API.

---

## v3.7.16 (2026-05-01)

> Docs: [brewdoc:publish](https://doc-claude.brewcode.app/brewdoc/skills/publish/)

### brewdoc
#### Fixed
- **publish:** `$PASS_H` was defined as a single line OUTSIDE bash code fences while referenced INSIDE 5 separate curl blocks — each block ran in its own shell, so the variable was empty and password protection silently dropped on every upload. Replaced with per-block `PASS_H=()` bash-array definition and `"${PASS_H[@]}"` quoted expansion in curl. Also fixed embedded-quote bug in the original `echo "-H \"X-Password: ...\""` form (curl rejects the literal-quoted single arg).
- **publish:** TTL default corrected from `5` (stale doc) to `15` to match server config (`brewpage-app application.yml: default-ttl-days: 15`). Aligned in mode rules and limits sections.
- **publish:** mode-detection rule tightened — explicit `ZIP → SITE / Directory → SITE / Single file → FILE` and explicit fail-loud on directory with no `.html` (no silent guess).
#### Changed
- **publish:** trimmed redundant intro/duplicate notes (User-Agent note, duplicated ownerToken warning, etc.) to keep SKILL.md within line budget after PASS_H array additions across 5 blocks.

---

## v3.7.15 (2026-04-29)

> Docs: [brewcode:setup](https://doc-claude.brewcode.app/brewcode/skills/setup/) | [bc-rules-organizer](https://doc-claude.brewcode.app/brewcode/agents/bc-rules-organizer/)

### brewcode
#### Fixed
- **setup.sh:** placeholder warning now excludes known runtime placeholders (`{TIMESTAMP}`, `{CONFIRMED_FINDINGS_JSON}`, etc.) — previously every setup run emitted spurious "unresolved placeholders" warning even when all setup-time vars were resolved
- **README.md:** `bc-rules-organizer` agent table row corrected from `sonnet` to `haiku` (was inconsistent with the actual agent frontmatter changed in v3.7.14)
#### Changed
- **setup.sh:** added inline comment documenting single-line constraint on env vars passed to `copy_review_skill` (newlines in values break sed line-by-line substitution)

---

## v3.7.14 (2026-04-29)

> Docs: [brewcode:setup](https://doc-claude.brewcode.app/brewcode/skills/setup/) | [bc-rules-organizer](https://doc-claude.brewcode.app/brewcode/agents/bc-rules-organizer/) | [bc-coordinator](https://doc-claude.brewcode.app/brewcode/agents/bc-coordinator/)

### brewcode
#### Fixed
- **bc-rules-organizer:** model downgraded `sonnet` → `haiku` — Sonnet inherited 1M context from parent session, triggering `/extra-usage` gate on Pro/Max OAuth accounts; Haiku is sufficient for rules classification
- **bc-coordinator:** finalize mode now verifies artifact files exist on disk before building FINAL.md index; missing files marked `❌ missing`, status downgraded to `failed` (was silently ignored)
- **setup:** `copy_review_skill` replaced `cp` with `sed` substitution — 13 setup-time placeholders (`{DETECTED_TECH}`, `{AGENT_COUNT}`, etc.) are now resolved at copy time; unresolved-placeholder warning added; sed delimiter switched from `|` to `\x01` to avoid collision with markdown table values
- **setup SKILL.md:** ToolSearch preflight added at two sites (Phase 0 Step 2.5 + Phase 5) to load deferred `AskUserQuestion` schema (required for Claude Code v2.1.107+)
#### Changed
- **README:** version field corrected from stale `3.4.29` to current `3.7.14`
- **bump-version.sh:** now also updates `brewcode/README.md` version table row and verifies it in the summary

---

## v3.7.13 (2026-04-29)

> Docs: [brewtools:provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

### brewtools
#### Changed
- **provider-switch:** DeepSeek alias renamed from `claudedeepseek` to `claudeds` (shorter, consistent with "Claude DS" naming)

---

## v3.7.12 (2026-04-24)

> Docs: [brewtools:provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

### brewtools
#### Changed
- **provider-switch docs:** top callout now includes a full SWE-bench snapshot table (Verified + Pro columns) for April 2026. Reflects GPT-5.5 (released April 23) as the new #1 on Verified at 88.7%; Opus 4.7 still wins Pro at 64.3%.
- **provider-switch docs:** DeepSeek V4 card — concrete scores added: Verified 80.6%, Pro 55.4%. "Top open-source SWE-bench" simplified to "Top open-source".
- **provider-switch docs:** OpenRouter card — now explicitly mentions GPT-5.5, GPT-5.3 Codex, Gemini 3.1 Pro as routable via `claudeor`.

---

## v3.7.11 (2026-04-24)

> Docs: [brewtools:provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

### brewtools
#### Changed
- **provider-switch docs:** added [SWE-bench Verified leaderboard](https://www.swebench.com/) link in the top "NEW DeepSeek" callout (with current top-3 scores) and in the DeepSeek card. Lets readers cross-check model rankings against the canonical source before switching providers.

---

## v3.7.10 (2026-04-24)

> Docs: [brewtools:provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

### brewtools
#### Changed
- **provider-switch docs:** top "NEW — DeepSeek V4" callout announcing the April 24 priority addition. Highlights 1.6T MoE, 1M context, thinking modes, verified 90% cache discount, no compat flags.
- **provider-switch docs:** SWE-bench badges realigned with actual April 2026 leaderboards. GLM "#1 SWE-bench" -> "Strong coding perf" (Opus 4.7 leads at 87.6%). DeepSeek V4 tagged "Top open-source SWE-bench".
- **provider-switch docs:** all four alt providers now marked "Cache verified". DeepSeek V4 — automatic 90% discount, DeepSeek API docs. Qwen — implicit 20% / explicit 10% per Alibaba billing. GLM — native backend auto-cache. MiniMax — documented pricing/TTL. Cost-per-request table updated with DeepSeek cached row.

---

## v3.7.9 (2026-04-24)

> Docs: [brewtools:provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

### brewtools
#### Added
- **provider-switch:** DeepSeek V4 as priority default provider. New reference `references/deepseek.md`. Endpoint `https://api.deepseek.com/anthropic`, model `deepseek-v4-pro` (1.6T MoE, 1M context). Alias `claudedeepseek`, key var `DEEPSEEK_API_KEY`. No compatibility flags required (DeepSeek silently ignores `anthropic-beta`/`anthropic-version`). Verified via live API call (HTTP 200).
- **provider-switch:** new mode keywords `deepseek|ds|dpsk|дипсик` -> `provider-deepseek`. Updated `detect-mode.sh`, `check-status.sh` (new `ALIAS_DEEPSEEK`/`KEY_DEEPSEEK` fields, `api.deepseek.com` -> provider=deepseek mapping), `verify-providers.sh` (new `run_deepseek`).

#### Fixed
- **provider-switch/verify-providers.sh:** replaced `source ~/.zshrc` (failed under bash with `set -euo pipefail` when zshrc contained zsh-only syntax) with `grep ^export` + `eval` for API-key vars only. Script no longer aborts before reaching curl.

---

## v3.7.8 (2026-04-23)

> Docs: plugin hooks internals — no user-facing skill/agent doc changes.

### All plugins
#### Changed
- **Unified logging directory:** all plugin hook logs now land in `.claude/logs/{plugin}.log` (brewcode, brewdoc, brewtools, brewui). Previously brewtools/brewui wrote `.claude/brewtools.log` / `.claude/brewui.log` in the `.claude/` root; brewcode wrote `.claude/tasks/logs/brewcode.log`; brewdoc had no file logging. Single gitignored directory for all four.
- **Shared log-level config:** single source of truth is `.claude/tasks/cfg/brewcode.config.json` -> `logging.level` (already used by brewcode). brewdoc/brewtools/brewui now read the same file. Override via env `BREWCODE_LOG_LEVEL`. Precedence: env > config > `info`. Levels: `error|warn|info|debug|trace`.
- **brewdoc:** gained file logging (was stderr-only) and stderr format aligned with other plugins (no leading level tag).
- **teardown.sh:** removes `.claude/logs/` (new unified dir) on brewcode teardown.

---

## v3.7.7 (2026-04-22)

> Docs: [brewtools:think-short](https://doc-claude.brewcode.app/brewtools/skills/think-short/) | [brewtools:agent-toggle](https://doc-claude.brewcode.app/brewtools/skills/agent-toggle/) | [brewtools:skill-toggle](https://doc-claude.brewcode.app/brewtools/skills/skill-toggle/) | [brewui:glm-design-to-code](https://doc-claude.brewcode.app/brewui/skills/glm-design-to-code/) | [brewui:image-gen](https://doc-claude.brewcode.app/brewui/skills/image-gen/) | [brewtools:text-optimizer](https://doc-claude.brewcode.app/brewtools/agents/text-optimizer/) | [brewui:glm-zai-specialist](https://doc-claude.brewcode.app/brewui/agents/glm-zai-specialist/) | [brewcode:hook-creator](https://doc-claude.brewcode.app/brewcode/agents/hook-creator/) | [brewcode:skill-creator](https://doc-claude.brewcode.app/brewcode/agents/skill-creator/) | [brewcode:agent-creator](https://doc-claude.brewcode.app/brewcode/agents/agent-creator/) | [brewcode:tester](https://doc-claude.brewcode.app/brewcode/agents/tester/) | [brewcode:developer](https://doc-claude.brewcode.app/brewcode/agents/developer/)

### brewtools
#### Changed
- **think-short:** profile directives compressed with zero semantic loss. `light` ~35 -> ~20 tok, `medium` ~70 -> ~35 tok, `aggressive` ~200 -> ~120 tok. Removed redundant phrase examples, README-level justifications after dashes, duplicated directives. Critical `User instructions always override these rules` retained in aggressive. All profiles now ASCII-only (em-dash -> hyphen), matching the profile's own rule.
- **think-short (SKILL.md):** description frontmatter compressed ~480 -> ~60 tokens. English-only triggers. Lead sentence <=160 chars.
- **agent-toggle / skill-toggle (SKILL.md):** descriptions compressed ~255 -> ~45 tokens each. English-only triggers.
- **text-optimizer (agent):** description tuned to ~170 tokens - kept 2 examples since it is a frequently invoked agent.
- **session-start hook:** dropped redundant `brewtools: active | session: X` line from `additionalContext` (retained in `systemMessage` UI log). Saves ~30 tokens per session.

### brewui
#### Changed
- **glm-design-to-code / image-gen (SKILL.md):** descriptions compressed ~55% each. English-only triggers.
- **glm-zai-specialist (agent):** description compressed ~247 -> ~50 tokens.
- **session-start hook:** same cleanup as brewtools - removed `active | session:` line from `additionalContext`.

### brewcode
#### Changed
- **hook-creator / skill-creator / agent-creator (agents):** descriptions tuned to ~180 tokens each with 2 high-signal examples - these agents are frequently invoked so examples retained intentionally.
- **tester / developer (agents):** descriptions compressed ~35%, example blocks removed (triggers already convey intent).
- **skill-creator / agent-creator:** new "Description Budget" section enforces <=100 tok (skills) / <=150 tok (agents) default, English-only triggers, <=1 example for future creations.
- **skills/skills/SKILL.md / skills/agents/SKILL.md:** creation flows now carry the same description-budget rule inline.

---

## v3.7.6 (2026-04-21)

> Docs: [brewtools:think-short](https://doc-claude.brewcode.app/brewtools/skills/think-short/)

### brewtools
#### Changed
- **think-short:** profiles extended with tool discipline and "think before acting" directives. `light` now includes "think through edits before executing"; `medium` gains Grep-before-Read, Edit-over-Write, parallel independent calls, no re-Read of just-edited files; `aggressive` adds bundle-edits, `replace_all` for N-identical edits, and gather-then-parallel-Edits pattern. Output-style directives retained in all profiles. Injection points unchanged (SessionStart + PreToolUse:Task). README profile table updated with new token estimates.

---

## v3.7.5 (2026-04-20)

> Docs: [brewtools:think-short](https://doc-claude.brewcode.app/brewtools/skills/think-short/)

### brewtools
#### Fixed
- **think-short:** SKILL.md Bash examples now work when invoked via slash command from the main conversation. Fixes: (1) `$CLAUDE_PLUGIN_ROOT` not inherited by Bash tool — added dynamic `BT_ROOT` resolver (glob newest cache dir, no hardcoded version), (2) imports realigned with actual helper exports (`writeState`, `resolveEffectiveState`, `getPaths`, `safeWriteJson`), (3) removed double `think-short think-short:` log prefix by switching to the `log` re-export from `state.mjs`, (4) P2 mutation simplified to a single `writeState(scope, patch, cwd)` call. Smoke-test block appended at the end of SKILL.md. Hooks and helpers unchanged.

---

## v3.7.4 (2026-04-20)

> Docs: [brewtools:think-short](https://doc-claude.brewcode.app/brewtools/skills/think-short/)

### brewtools
#### Added
- **think-short:** new skill — toggle terse-output mode for Claude Code sessions. Injects brevity directives into the main conversation (SessionStart hook) and into sub-agent prompts (PreToolUse:Task hook). 3 profiles — `light` / `medium` / `aggressive`. Commands: `on`, `off`, `profile X`, `status`, `blacklist add|remove`. NL parsing (RU+EN): `включись`, `уровень 3`, `агрессивный`, `level 2`, `максимально`, etc. Default blacklist skips agents that need verbose output (`debate`, `docs-writer`, `architect`). State merged via chain `env → project → global → plugin.json → hardcoded`. Atomic state writes (O_NOFOLLOW, 0600). Cache-friendly — SessionStart profile is injected once and cached; PreToolUse:Task prepends first 2 lines of the profile fresh per sub-agent spawn. Disabled by default.

---

## v3.7.3 (2026-04-19)

> Docs: [brewtools:provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

### brewtools
#### Added
- **provider-switch:** compatibility flags table added to SKILL.md — documents required `CLAUDE_ENABLE_BYTE_WATCHDOG=0` and `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` flags per provider
- **provider-switch (Z.ai/GLM):** reference file now includes compatibility flags in documentation and alias template
- **provider-switch (MiniMax):** reference file now includes compatibility flags in documentation and alias template
- **provider-switch (Qwen/DashScope):** reference file now includes `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` in documentation and alias template

### brewdoc / brewpage-publish
#### Changed
- **publish:** improved URL handling and verification flow

---

## v3.7.2 (2026-04-18)

> Docs: [brewdoc:publish](https://doc-claude.brewcode.app/brewdoc/skills/publish/)

### brewdoc
#### Fixed
- **publish (SITE):** strip trailing slash from `.link` returned by `/api/sites` — appending `/` routes to brewpage.app's own landing page instead of the uploaded site, and the JS redirect that rescues the no-slash form does not fire for the slash-dir form. URL is now stored and printed exactly as-is.
- **publish (SITE):** output now includes an explicit warning not to append a trailing slash when sharing the URL.
- **publish (SITE):** Notes clarified that `curl`-based verification is unreliable for SITE uploads (BrewPage landing serves a browser-only JS redirect) — use Playwright/browser_navigate or fetch `<url>/index.html` explicitly.

---

## v3.7.1 (2026-04-17)

> Docs: [brewcode skills](https://doc-claude.brewcode.app/brewcode/skills/) | [brewcode agents](https://doc-claude.brewcode.app/brewcode/agents/) | [brewtools skills](https://doc-claude.brewcode.app/brewtools/skills/) | [brewdoc skills](https://doc-claude.brewcode.app/brewdoc/skills/) | [brewui skills](https://doc-claude.brewcode.app/brewui/skills/)

### brewcode / brewdoc / brewtools / brewui
#### Changed
- **docs:** simplified H1 headings on all 48 skill/agent pages — name + optional 2–4 word subtitle, no invented slogans
- **docs:** removed all Russian text (рецепт/рецепты/скиллы/субагенты) from every MDX page
- **docs:** removed brewery metaphor (Recipe=Skill, Ingredients=KNOWLEDGE) from all doc rules and agent instructions

---

## v3.7.0 (2026-04-17)

> Docs: [brewcode skills](https://doc-claude.brewcode.app/brewcode/skills/) | [brewcode agents](https://doc-claude.brewcode.app/brewcode/agents/) | [brewtools skills](https://doc-claude.brewcode.app/brewtools/skills/) | [brewdoc skills](https://doc-claude.brewcode.app/brewdoc/skills/) | [brewui skills](https://doc-claude.brewcode.app/brewui/skills/)

### brewcode / brewdoc / brewtools / brewui
#### Changed
- **docs:** full rewrite of all 45 legacy skill/agent MDX pages on the site to the new user-first etalon format. Every page now leads with one-line headline, Callout context, Quick reference table, When to use, Examples (≤8 line blocks), and a visual Flow timeline via `<Steps>`. All bash/code internals moved into collapsed `<details>` spoilers so new users get an onboarding-friendly surface while technical readers still have full reference on demand.
- **docs:** standardized section ordering and cross-link `<CardGrid>` at the bottom of every page. Fixed MDX parser issues (brace/tilde/angle-bracket escaping) across the tree.

---

## v3.6.2 (2026-04-16)

> Docs: [skill-toggle](https://doc-claude.brewcode.app/brewtools/skills/skill-toggle/) | [agent-toggle](https://doc-claude.brewcode.app/brewtools/skills/agent-toggle/)

### brewtools
#### Added
- **skill-toggle / agent-toggle:** interactive flow when invoked without explicit args. Phase I1 asks op (`status`/`disable`/`enable`/`list`), Phase I2 prints the full catalog as a single space-separated line of `plugin:name` tokens for Ctrl+F search, Phase I3 resolves + confirms once only if ambiguous (fuzzy phrase, duplicate name), Phase I4 always ends with a current-status dump. Explicit commands (`disable brewui:image-gen`) skip the flow entirely.
- **shared reference:** `brewtools/skills/_shared/toggle/interactive-flow.md` — full spec with decision matrix and anti-patterns, linked from both SKILL.md files.

---

## v3.6.1 (2026-04-16)

> Docs: [skill-toggle](https://doc-claude.brewcode.app/brewtools/skills/skill-toggle/) | [agent-toggle](https://doc-claude.brewcode.app/brewtools/skills/agent-toggle/)

### brewtools
#### Fixed
- **docs:** `skill-toggle` and `agent-toggle` MDX pages rewritten in English to match site language (v3.6.0 shipped them in Russian).

---

## v3.6.0 (2026-04-16)

> Docs: [skill-toggle](https://doc-claude.brewcode.app/brewtools/skills/skill-toggle/) | [agent-toggle](https://doc-claude.brewcode.app/brewtools/skills/agent-toggle/)

### brewtools
#### Added
- **skill-toggle:** disable/enable individual plugin skills by renaming `SKILL.md` ⇄ `_SKILL.md` in the plugin cache. Two-tier scope (global `$BT_PLUGIN_DATA/toggle-state.json` + project `<cwd>/.claude/brewtools/toggle-state.json`, project overrides global). Operations: `disable`, `enable`, `status`, `list`, `reapply`, `prune`. Addresses targets as `plugin:name` (e.g. `brewui:image-gen`).
- **agent-toggle:** symmetric skill for agents — renames `<name>.md` ⇄ `_<name>.md` under `agents/`. Same operations and scope model.
- **reapply-disables SessionStart hook:** re-applies disables on the latest plugin version after `claude plugin update` (new version dir ⇒ entry files reappear). Early-exit <500ms on empty state; reports drift (`plugin_not_installed`, `file_missing`) via `additionalContext`.
- **shared toggle library:** `skills/_shared/toggle/{state,cache,apply}.mjs` — atomic tmp+rename state writes, semver-latest selection across all marketplaces, idempotent rename primitives.

Workaround for upstream [#47747](https://github.com/anthropics/claude-code/issues/47747), [#22345](https://github.com/anthropics/claude-code/issues/22345) (no native per-skill/agent disable).

---

## v3.5.2 (2026-04-12)

> Docs: [provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

### brewtools
#### Added
- **provider-switch:** prompt caching documentation — new Spoiler section on docs page with provider support table, MiniMax verified cache pricing, cost comparison
- **provider-switch:** MiniMax card badge `Prompt Cache` — verified Anthropic-style prompt caching with documented pricing, response fields, TTL
- **provider-switch:** MiniMax reference file — added "Prompt Caching (Verified)" section: cache read $0.06/M (80% savings), write $0.375/M, TTL 5 min, min 512 tokens

---

## v3.5.1 (2026-04-12)

> Docs: [provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

### brewtools
#### Fixed
- **provider-switch:** detect-mode.sh — fuzzy typo matching before status fallback (`model-cehck` → `model-check`, `setuo` → `setup`, etc.)
- **provider-switch:** model-check mode — all 5 diagnostic questions sent in single prompt; model answers itself, user sees only Q&A table + verdict

---

## v3.5.0 (2026-04-12)

> Docs: [provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

### brewtools
#### Changed
- **provider-switch:** unified alias template — all providers now use `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_API_KEY=""` (Bearer token + OAuth block). Z.ai switched from x-api-key to Bearer (verified both work)
- **provider-switch:** new `verify` mode — tests all configured tokens against endpoints with HTTP status report
- **provider-switch:** new `model-check` mode — 5 diagnostic questions to identify which model is responding (runs inside provider session)
- **provider-switch:** Qwen Singapore region requirement — callout, step-by-step key generation, format validation (`sk-ws-` = wrong region)
- **provider-switch:** updated docs — MDX page, skill README, plugin README with new modes and Qwen instructions

---

## v3.4.82 (2026-04-12)

### brewtools
#### Fixed
- **provider-switch:** fixed all provider dashboard links — Z.ai: z.ai/subscribe, Qwen: bailian.console.alibabacloud.com, MiniMax: platform.minimax.io. All English, all verified in browser with Login/Sign Up buttons.

---

## v3.4.81 (2026-04-12)

### docs
#### Fixed
- **Spoiler component:** tables inside collapsed Spoiler now have horizontal scroll on mobile (`overflow-x: auto`). Prevents wide tables from breaking page layout.

---

## v3.4.80 (2026-04-12)

> Docs: [provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

### brewtools
#### Changed
- **provider-switch docs:** complete page redesign — marketing-first structure. Problem/solution hero, weekly timeline visualization, cost comparison cards, prominent alias showcase, 3-step setup, provider cards with sign-up links. Technical details collapsed in Spoiler. Mobile-optimized, 102 lines vs 163 before.

---

## v3.4.79 (2026-04-12)

> Docs: [brewtools overview](https://doc-claude.brewcode.app/brewtools/overview/) | [provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

### brewtools
#### Fixed
- **docs audit:** added missing provider-switch to CLAUDE.md skills table, overview.mdx (card + command + architecture tree), fixed stale README version (3.4.73 → 3.4.78). All 5 doc levels now consistent: 8 skills, 3 agents across filesystem, README, navigation.ts, MDX, guide catalog.

---

## v3.4.78 (2026-04-12)

> Docs: [provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

### brewtools
#### Changed
- **provider-switch:** removed claude-max alias (unnecessary — open new terminal instead), no-dash alias names (claudeglm, claudeqwen, claudeminimax, claudeor), aliases launch claude automatically (one command), alias name customizable via AskUserQuestion during setup.
- **docs:** updated README and MDX to reflect all alias changes across all doc levels.

---

## v3.4.77 (2026-04-12)

> Docs: [provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

### brewtools
#### Changed
- **docs:** provider-switch — single top model for all roles, updated OpenRouter model list (removed stale free models, added validated custom ID flow), corrected provider tables in README and MDX.

---

## v3.4.76 (2026-04-12)

### brewtools
#### Fixed
- **provider-switch:** single top model for all 3 Claude Code roles (opus/sonnet/haiku). Never split across weaker models. GLM = glm-5.1 everywhere, Qwen = qwen3.6-plus[1m] everywhere, OpenRouter = one user-selected model everywhere.

---

## v3.4.75 (2026-04-12)

### brewtools
#### Added
- **provider-switch:** hidden `update` mode for maintainer — spawns per-provider research agents, fetches latest models/pricing from official sources, diffs against current references, applies updates. Auto-sync frontmatter on all 5 provider reference files. Update protocol reference with per-provider sources and live test templates.

---

## v3.4.74 (2026-04-12)

> Docs: [provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

### brewtools
#### Added
- **docs:** full documentation for `/brewtools:provider-switch` — skill README, Astro MDX page, navigation.ts entry, plugin README row, guide catalog row. Quorum-reviewed (3 agents, 11 findings, 4 confirmed + fixed).

---

## v3.4.73 (2026-04-12)

> Docs: [brewtools:provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

### brewtools
#### Added
- **provider-switch skill:** new skill `/brewtools:provider-switch` — configure Claude Code alternative API providers (Z.ai/GLM, Qwen/DashScope, MiniMax, OpenRouter). Interactive setup via AskUserQuestion: language selection (EN/RU/PT), provider selection, API key input, model selection for OpenRouter. Creates isolated shell aliases in ~/.zshrc with backup. Modes: status, setup, help, provider-specific. 6 reference files + 3 scripts.

### brewcode
#### Changed
- **agents:** added protected-path v3.4.70 warnings to agent-creator, hook-creator, skill-creator agents — document Write restrictions for `~/.claude/*` paths.

---

## v3.4.72 (2026-04-11)

> Docs: [getting-started](https://doc-claude.brewcode.app/) | [installation](https://doc-claude.brewcode.app/installation/) | [quickstart](https://doc-claude.brewcode.app/quickstart/)

### docs
#### Fixed
- **external link targeting:** Added `rehype-external-links` plugin to `astro.config.mjs` — all markdown/MDX links with absolute `http(s)://` URLs now automatically get `target="_blank" rel="noopener noreferrer"`. Internal relative links (`/path/`) open in the same tab.
- **Card.astro link targeting:** Overlay (`absolute inset-0`) and title `<a>` now detect external hrefs via `/^https?:\/\//` and apply `target="_blank" rel="noopener noreferrer"` only when the href points to a different domain. Internal hrefs open in the same tab.

---

## v3.4.71 (2026-04-11)

> Docs: [getting-started](https://doc-claude.brewcode.app/) | [installation](https://doc-claude.brewcode.app/installation/)

### docs
#### Fixed
- **Card broken layout:** `Card.astro` rendered as `<a>` when `href` is set, causing nested `<a>` tags when slot content contained markdown links. Browser closed outer anchor early — card icon/title separated from description and content leaked outside the card. Fixed with stretched-link overlay pattern: card is now always a `div`; an `absolute inset-0 z-0` anchor covers the full card surface; slot content gets `relative z-[1]` so inner links intercept clicks correctly.
- **getting-started, installation:** restored inline links (`setup`, `spec`, `plan`, `start`) inside Quick Start card — they were the trigger for the layout bug but are correct content; fix is in the component, not the content.

---

## v3.4.70 (2026-04-11)

> Docs: [brewdoc:my-claude](https://doc-claude.brewcode.app/brewdoc/skills/my-claude/) | [brewdoc:guide](https://doc-claude.brewcode.app/brewdoc/skills/guide/) | [brewdoc:auto-sync](https://doc-claude.brewcode.app/brewdoc/skills/auto-sync/)

### brewdoc
#### Fixed
- **hook parity:** `brewdoc/hooks/pre-task.mjs` now injects `BD_PLUGIN_DATA=${CLAUDE_PLUGIN_DATA}` into subagent prompts, matching the pattern already used by brewcode/brewtools/brewui hooks. Previously brewdoc only exposed `BD_PLUGIN_ROOT`, breaking parity.
- **skill outputs migrated to project-relative paths:** `/brewdoc:my-claude`, `/brewdoc:guide`, and `/brewdoc:auto-sync` now write to `.claude/brewdoc/` and `.claude/auto-sync/` inside the target project instead of `~/.claude/brewdoc/` / `~/.claude/auto-sync/`. Reason: Claude Code's protected-path policy blocks Write to `~/.claude/*` in every permission mode, including `bypassPermissions`. The hook-based permission layer runs AFTER the protected-path check, so no whitelist can override it. Verified empirically in headless `claude -p`.
- **legacy read-only fallback:** my-claude documents a one-shot merge from `~/.claude/brewdoc/INDEX.jsonl` into the new project INDEX when the new location is empty. Legacy file is never written.
- **guide progress path:** `brewdoc/skills/guide/scripts/progress.sh` now prefers `${CLAUDE_PROJECT_DIR:-.}/.claude/brewdoc/guide-progress.json` and falls back to `${BD_PLUGIN_DATA:-$HOME/.claude/brewdoc}/guide-progress.json` only when the project dir is not writable.

### brewcode
#### Changed
- **permission-guard.sh whitelist:** project-local `.claude/brewdoc/` and `.claude/auto-sync/` added to both the `is_allowed_path()` helper (Bash tool) and the Edit/Write/MultiEdit case statement, mirroring the existing pattern for `.claude/tasks/`, `.claude/reports/`, etc.

### Known limitation
- `$CLAUDE_PLUGIN_DATA` (persistent plugin-state directory, `~/.claude/plugins/data/<plugin-id>/`) is **not usable as a Write target in headless `claude -p`** due to the harness protected-path policy. PermissionRequest hooks cannot override — the check happens earlier in the pipeline. Until Anthropic relaxes this for `~/.claude/plugins/data/`, all skill outputs must target project-relative paths. Workaround documented per-skill; feedback filed upstream.

---

## v3.4.69 (2026-04-11)

> Docs: [brewdoc:my-claude](https://doc-claude.brewcode.app/brewdoc/skills/my-claude/)

### brewdoc
#### Changed
- **my-claude:** repositioned as extended alternative to built-in `/team-onboarding` (new in Claude Code 2.1.101). Added "vs /team-onboarding" section, updated description to emphasize web research, EXTERNAL/RESEARCH modes, and citation tracking.

### Compatibility
- **Claude Code 2.1.101:** verified — subagent MCP tool inheritance fix benefits `bc-coordinator` and other Task-spawned agents (none of our agents currently reference MCP tools directly, so no silent regressions). `context: fork` skills (`brewcode:setup`, `brewcode:teardown`) confirmed — neither declares an `agent:` field, so the 2.1.101 frontmatter fix is a no-op for us. Settings resilience to unknown hook events benefits users running older vs newer Claude Code versions.
- **Claude Code 2.1.98:** Bash permission hardening verified compatible — all skills use plain compound patterns (`cmd && echo "✅" || echo "❌"`), no env-var prefix bypasses, no `/dev/tcp/` redirects, no backslash-escaped flags.
- **Monitor tool (2.1.98):** evaluated as simplification opportunity for `brewcode:start` polling loop. Deferred — current flow uses single-pass `bc-coordinator` delegation, not polling, so Monitor doesn't cleanly replace existing logic.

---

## v3.4.68 (2026-04-11)

> Docs: [review (dynamic)](https://doc-claude.brewcode.app/brewcode/skills/review/) | [setup](https://doc-claude.brewcode.app/brewcode/skills/setup/) | [debate](https://doc-claude.brewcode.app/brewtools/skills/debate/)

### docs
#### Added
- **New page: `/brewcode/skills/review/` — the dynamic per-project review skill.** Until now this skill was mentioned but undocumented on the site (because it's generated into each target project by `/brewcode:setup`, not shipped with the plugin). New page covers: overview and clean distinction vs `/brewcode:standards-review`; full 7-phase pipeline (codebase study → group formation → parallel review → quorum collection → DoubleCheck → optional Critic + DoubleCheck-Critic → report); parameter reference (`-q N-M`, `-q G-N-M`, `-c/--critic`, default `-q 3-2`); quorum semantics (±5 line tolerance, ≥0.6 semantic similarity, merge rules); generation flow (Phase 3.5 of setup, 8 template placeholders, output in `.claude/skills/brewcode-review/`); tech-specific check tabs for Java/Spring, Node/TS, Python, Go; cross-links to setup, standards-review, reviewer agent, and brewtools/debate `--review` flag.
- **Navigation:** `review (dynamic)` added to the Brewcode → Skills sidebar as a 14th entry under standards-review.
- **Cross-links added:** quickstart.mdx (Project setup Result list → `/brewcode/skills/review/`), brewcode/skills/setup.mdx (Phase 4 Templates table + Verification table row), brewcode/skills.mdx (summary table adds a ★ "review (dynamic)" row + card + description paragraph), brewtools/skills/debate.mdx (Phase 8 bullet and `--review` flag table entry now link to the new page).

---

## v3.4.67 (2026-04-11)

> Docs: [doc site](https://doc-claude.brewcode.app/)

### docs
#### Added
- **Cross-entity linking across the whole site.** Ran five parallel agents over the MDX content to convert plain-text skill/agent mentions into active Markdown links, including cross-plugin references (e.g. brewdoc `my-claude` → brewcode `reviewer` agent, brewtools `deploy` → `deploy-admin` agent + `ssh` skill, brewui `glm-design-to-code` reviews → agents). Roughly **80 new links across 37 MDX files**, covering every plugin's overview/skills/agents pages plus Getting Started / Installation / Quickstart / FAQ. Rules: first occurrence per H2 section, never inside code fences, never self-linking. Link style is plain Markdown — Tailwind prose handles hover underline, no custom classes or colors.
- **Broken-link sweep:** full dist HTML scanned — 0 broken internal links out of 63 unique URLs.

#### Fixed
- **`/brewcode:review` vs `/brewcode:standards-review` disambiguation.** `/brewcode:review` is a **per-project dynamic skill** created by `/brewcode:setup`, not a static page. One sub-agent incorrectly linked it to a non-existent `/brewcode/skills/review/` URL. Reverted all `/brewcode:review` mentions to plain inline code (no link) in `brewtools/skills/debate.mdx` and `brewcode/skills/setup.mdx`.

---

## v3.4.66 (2026-04-11)

### docs
#### Changed
- **Search ranking — body downweighted to 0.2.** v3.4.65 boosted titles via weight 10 + 30× duplication, but BM25 TF-saturation capped the score so pages with dozens of body mentions of common words ("start", "spec") still out-ranked the actual skill pages. Added a `data-pagefind-weight="0.2"` wrapper around the whole article slot (via `display: contents` div so prose layout is unchanged). Net effect: title boost is ~50× stronger than body prose, which lets `/brewcode/skills/start/`, `/brewcode/skills/spec/` etc. beat pages that mention those words many times.

---

## v3.4.65 (2026-04-11)

### docs
#### Fixed
- **Search result labels corrupted by title-boost span.** v3.4.63's title boost used `data-pagefind-meta="title"` on the duplicated span, which told Pagefind "this element IS the page title" — so result labels showed as `"Agent Creator Agent Creator Agent Creator …"` 10×. Removed the `meta` attribute; Pagefind now falls back to the `<h1>` heading for the real title. Bumped title duplicates from 10× to 30× to further push BM25 term-frequency on title-matching queries.

---

## v3.4.64 (2026-04-11)

> Docs: [Quickstart](https://doc-claude.brewcode.app/quickstart/) | [Brewdoc Skills](https://doc-claude.brewcode.app/brewdoc/skills/)

### docs
#### Fixed
- **Steps component — nested list numbering corruption.** `Steps.astro` used `.steps-timeline :global(li)` which matched **every** descendant `<li>`, so any `<ul>`/`<ol>` inside a step body (e.g. the "Result: file list" in Quickstart Step 1) was treated as a continuation step — complete with circle counter, timeline bar, and broken grid layout. Rewrote the selector to direct-child only (`:global(.steps-timeline > li)`), explicitly restored `list-style: disc/decimal` + `display: list-item` for nested `ul`/`ol`/`li`, and added counter-reset so only top-level steps increment. Quickstart timeline now renders cleanly: "1 Project setup" with a bulleted file list inside, no fake steps 2–5.
- **Steps grid layout** — title and body paragraph selectors tightened to direct children so nested prose keeps normal prose styling.

#### Changed
- **Brewdoc sidebar structure aligned with other plugins.** Brewdoc skill pages previously lived flat under `/brewdoc/<skill>/` (auto-sync, my-claude, memory, md-to-pdf, publish, guide), while brewcode/brewtools/brewui use `/<plugin>/skills/<skill>/` with a dedicated **Skills** sidebar group. Moved all 6 brewdoc skill pages into `content/docs/brewdoc/skills/`, added `brewdoc/skills.mdx` index page, updated `navigation.ts` to use a `Skills` children group, fixed 15+ internal links in `brewdoc/overview.mdx` and cross-page cards. All 65 pages build clean.

### rules
#### Added
- `.claude/rules/astro-avoid.md` — four new rules (#8–#10) covering Steps component nesting semantics, the direct-child selector fix history, and the plugin-skills directory convention. Agents editing MDX will pick them up via the `web/**/*.mdx` path glob.

---

## v3.4.63 (2026-04-11)

> Docs: [Introduction](https://doc-claude.brewcode.app/getting-started/)

### docs
#### Changed
- **Search ranking — title boost amplified to ~100×:** v3.4.62 added `data-pagefind-weight="10"` on a single sr-only title element, but Pagefind's max weight (10) + one heading match still lost to pages with many body mentions of the same word. Verified on live site: `"start"` put the actual `/brewcode:start` skill page at rank 7, behind Agent Creator, Hook Creator, Guide, etc. Fix: duplicate the page title 10× inside the weighted sr-only element (`{Array(10).fill(title).join(' ')}`), yielding an effective ~100× BM25 boost. Title-matching pages should now consistently rank first.

## v3.4.62 (2026-04-11)

> Docs: [Introduction](https://doc-claude.brewcode.app/getting-started/)

### docs
#### Changed
- **Search ranking — titles boosted 10×:** Pagefind previously ranked pages by raw BM25 across body content, so typing `"start"` surfaced every page that mentioned "start" in prose before the actual `/brewcode:start` skill page. Added an `sr-only` element inside `<article data-pagefind-body>` in `DocsLayout.astro` with `data-pagefind-weight="10"` and `data-pagefind-meta="title"` holding the page title. Result: page whose title matches the query ranks above body-only hits. Verified test cases: `start`, `plan`, `debate`, `image` all surface their respective skill/agent pages first.

---

## v3.4.61 (2026-04-11)

> Docs: [Introduction](https://doc-claude.brewcode.app/getting-started/) | [Quickstart](https://doc-claude.brewcode.app/quickstart/)

### docs
#### Fixed
- **Card icons:** `<Card icon="image">`, `<Card icon="plus">`, and `<Card icon="warning">` rendered the literal words "image", "plus", "warning" in the UI (visible on the Introduction page for `brewui`), because `Card.astro`'s `iconMap` was a strict whitelist that fell through to `rawIcon` on miss. Root cause + remediation:
  - Extended `iconMap` to 65 entries — added `image 🖼️`, `plus ➕`, `warning ⚠️`, plus 30 more common icons (bell, bolt, bug, calendar, clock, cloud, database, gear, globe, graph, hammer, key, label, magic, megaphone, note, phone, pin, refresh, robot, scroll, shieldCheck, ship, target, test, tool, trophy, zap, …) so future pages have breathing room.
  - Unknown icon names now render a **deterministic fallback** (hash → stable pick from the map) **and** log `console.warn` in build + browser, instead of leaking raw text into prose. A missing icon is visible and noisy without breaking the page.
  - Verified by independent re-scan: 38/38 icon names used across content are now present in `iconMap` — zero missing.

### rules
#### Added
- `.claude/rules/astro-avoid.md#5,#6,#7` — new path-scoped rules (now covering `web/**/*.mdx`) that explicitly forbid unlisted `Card` icons and raw exotic emoji in MDX, and require adding to `iconMap` before use. Agents touching Astro/MDX pages will pick this up automatically via the glob.

---

## v3.4.60 (2026-04-11)

> Docs: [doc site](https://doc-claude.brewcode.app/)

### docs
#### Changed
- **Search highlights:** Pagefind default `<mark>` background was saturated browser-yellow, visually harsh against the dark theme. Overridden in `<style is:global>` to `oklch(var(--p) / 0.22)` — soft DaisyUI primary tint, inherit text color, 2px padding + radius. Stays on-brand and legible without shouting.

---

## v3.4.59 (2026-04-11)

> Docs: [Introduction](https://doc-claude.brewcode.app/getting-started/)

### docs
#### Changed
- **Introduction page:** restructured to lead with the pitch, not the install command. Install prompt moved into a prominent `<Spoiler title="📦 How to install Brewcode — click to expand install instructions">` block below the feature cards and plugin matrix, so first-time readers see "what is this" before "how to set it up". Added a "Four plugins, one suite" card grid as the headline section; refreshed counts to 28 skills / 18 agents.

---

## v3.4.58 (2026-04-11)

> Docs: [doc site](https://doc-claude.brewcode.app/)

### docs
#### Fixed
- **Search styling:** Pagefind UI was rendering raw/unstyled (browser-default input outline, bare "Clear" button, no result separators) because `@pagefind/default-ui/css/ui.css` was never imported. Added explicit `import '@pagefind/default-ui/css/ui.css'` in `Search.astro` script so Vite bundles the stylesheet; DaisyUI token overrides in `<style is:global>` still apply on top.
- **Header logo wrap on mobile:** DaisyUI `.btn` defaults to `flex-wrap: wrap`, so "Brewcode Docs" text wrapped under the logo image on narrow viewports, pushing the whole header onto two rows. Added `flex-nowrap whitespace-nowrap min-w-0` + `shrink-0` on logo img + `truncate` on label; also `min-w-0` on the flex-1 Logo wrapper in `Header.astro` so child can shrink.

---

## v3.4.57 (2026-04-11)

> Docs: [doc site](https://doc-claude.brewcode.app/)

### docs
#### Fixed
- **Search:** docs search was completely non-functional — `Search.astro` listened only to `astro:page-load`, but the project does not enable Astro ViewTransitions, so neither PagefindUI nor button/shortcut handlers ever initialized. Rewrote client init to use `DOMContentLoaded`/immediate branch, split button listeners from the lazy `@pagefind/default-ui` import so clicks work before Pagefind loads, and added a `processTerm` query normalizer (lowercase, strip diacritics, strip punctuation, collapse whitespace) so `"GLM-design, to code!"` matches `"glm design to code"`. Cmd/Ctrl+K toggle and Escape close restored.
- **Search CSS:** switched Pagefind CSS variables to DaisyUI `oklch(var(--p/--bc/--b2/--b3))` tokens and added `--pagefind-ui-scale: 0.9` below 640px for mobile modal sizing.
- **GitHubBadge mobile:** star badge was hidden entirely on `<640px` (`hidden sm:inline-flex`). Added a compact mobile variant (`inline-flex sm:hidden`) with the GitHub Octocat icon + star count, tappable to the repo. A single `fetch` now updates both desktop and mobile counters.

---

## v3.4.56 (2026-04-10)

> Docs: [FAQ](https://doc-claude.brewcode.app/faq/)

### docs
#### Fixed
- **FAQ:** restored right-side Table of Contents for spoiler-only layout. New `tocItems` frontmatter field on docs schema lets pages declare TOC entries explicitly when content uses components instead of markdown headings; merged into `[...id].astro` heading list. FAQ now lists 8 questions in TOC, each anchor opens the matching `<Spoiler>` automatically.

#### Changed
- **Spoiler component:** accepts `id` prop, rendered on the `<details>` element. Auto-open script simplified — hash directly targets the spoiler element, scrolls into view smoothly, works via `DOMContentLoaded` fallback (project does not enable Astro ViewTransitions).
- **TableOfContents:** IntersectionObserver now also watches `details.spoiler[id]` so the active TOC item highlights as users scroll past spoilers.
- **FAQ:** removed `## Question` markdown headings — questions live solely in `<Spoiler title="...">`. Cleaner layout, no duplicated text above each spoiler.

---

## v3.4.55 (2026-04-10)

> Docs: [FAQ](https://doc-claude.brewcode.app/faq/) | [installation](https://doc-claude.brewcode.app/installation/) | [brewcode overview](https://doc-claude.brewcode.app/brewcode/overview/) | [brewcode skills](https://doc-claude.brewcode.app/brewcode/skills/) | [brewdoc overview](https://doc-claude.brewcode.app/brewdoc/overview/) | [brewtools overview](https://doc-claude.brewcode.app/brewtools/overview/) | [brewui overview](https://doc-claude.brewcode.app/brewui/overview/)

### docs
#### Added
- **FAQ:** new spoiler "My install is too old — the skill isn't available" with bootstrap prompt for very old installs. First question now leads with the skill (Callout) and falls back to the prompt block. Every skill mention is an active link to its doc page.

#### Changed
- **FAQ:** "Shortcut" prose lines extracted into green `<Callout type="tip">` blocks pointing to `/brewtools:plugin-update`. Install/update prompts now have explanatory intro and post-install Callout pointing to the skill.
- **installation:** `/brewcode:setup` and `/brewtools:plugin-update` mentions converted to active links to their skill pages.
- **brewcode/overview:** Card and Tab content links `/brewcode:setup`, `/brewcode:start`, `/brewcode:standards-review`, `/brewcode:teams` to skill pages.
- **brewcode/skills:** summary table — both the `Skill` and `Command` columns are now links to the per-skill page.
- **brewdoc/overview, brewtools/overview, brewui/overview:** Commands tables — every skill cell is an active link.

---

## v3.4.54 (2026-04-10)

> Docs: [guide](https://doc-claude.brewcode.app/brewdoc/guide/) | [FAQ](https://doc-claude.brewcode.app/faq/)

### brewdoc
#### Changed
- **guide:** refresh reference topics to current suite state — 4 plugins, 28 skills, 18 agents. Added `/brewtools:plugin-update` row to skills catalog, hooks subsection listing all 12 shipped hooks in `topic-customization.md`, renamed "Three Plugins Overview" → "Four Plugins Overview" across SKILL.md, welcome menu, overview/installation/agents-catalog/skills-catalog topic files. Fixed stale counts: Brewtools Skills (6 → 7), Plugin Agents (17 → 18), Skills Catalog menu (27 → 28).
- **guide README:** updated descriptions to include brewui, corrected skill/agent counts.

### docs
#### Added
- **Spoiler component:** collapsible `<details>`-based spoiler with animated chevron, hover state, and accessible focus outline — usable in any MDX page.
- **FAQ page:** all 7 questions wrapped in collapsed spoilers so users can scan titles and expand only what they need. Added intro hint "Click any question to expand the answer."

#### Changed
- **brewdoc/guide page:** synced with skill changes — "Four Plugins Overview", all 4 plugins, all 28 skills, all 18 agents.

---

## v3.4.53 (2026-04-10)

> Docs: [plugin-update](https://doc-claude.brewcode.app/brewtools/skills/plugin-update/) | [brewtools overview](https://doc-claude.brewcode.app/brewtools/overview/)

### brewtools
#### Added
- **plugin-update:** skill-level `README.md` with Quick Start, Modes, Examples, Discovery Method, Tips.

#### Changed
- **README.md:** refresh skills table (3 → 7 entries), agents table (1 → 3), architecture tree, quick start, docs links, header tagline, stats.

### docs
#### Changed
- **brewtools/skills/plugin-update:** expanded page — accurate 6-phase Steps flow, full `Quick reference`, status-table example, Troubleshooting table, embedded `InstallPrompt` update prompt, explicit reload Callout, warning about non-existent `claude plugin list` CLI.
- **brewtools/overview:** add plugin-update card to skills grid, Commands table row, architecture tree entry.

---

## v3.4.52 (2026-04-10)

> Docs: [plugin-update](https://doc-claude.brewcode.app/brewtools/skills/plugin-update/) | [FAQ](https://doc-claude.brewcode.app/faq/) | [installation](https://doc-claude.brewcode.app/installation/) | [guide](https://doc-claude.brewcode.app/brewdoc/skills/guide/)

### brewtools
#### Added
- **plugin-update:** new skill — checks installed plugins, installs missing brewcode plugins, updates outdated ones, reports versions. Interactive (default) or args `check|update|all`. Uses filesystem discovery (not `claude plugin list`, which does not exist).

### brewdoc
#### Changed
- **guide:** Phase 0.5 plugin freshness check — offers to update outdated/missing brewcode plugins before starting the guide.

### docs
#### Added
- **FAQ:** new page answering top install/update questions with copy-paste prompts
- **Header:** FAQ button between Search and GitHub badge
- **InstallPrompt component:** shared MDX component rendering coercive install/update prompts on every plugin overview and installation page
- **UpdateNotice component:** footer callout on every skill page pointing to `/brewtools:plugin-update`

#### Changed
- **installation:** promote Updating section, add Callouts, tag `--plugin-dir` as developers-only

### README
#### Added
- **Install in 30 seconds:** copyable install/update prompts at top of root README and each per-plugin README
- Fix missing `brewui` row and update skill counts

### 🔄 How to update brewcode plugins

Paste this prompt into a Claude Code session (it forces Claude to run the full command chain):

~~~
Execute these commands in this session, one by one, show full output for each, do not skip any:

1. claude plugin marketplace update claude-brewcode
2. claude plugin update brewcode@claude-brewcode
3. claude plugin update brewdoc@claude-brewcode
4. claude plugin update brewtools@claude-brewcode
5. claude plugin update brewui@claude-brewcode

After all 5 commands succeed, run `/reload-plugins` (or type `exit` then `claude` to restart). Do not summarize — run the commands now.
~~~

Or, if brewtools is already installed, just run `/brewtools:plugin-update`.

---

## v3.4.51 (2026-04-09)

> Docs: [e2e](https://doc-claude.brewcode.app/brewcode/skills/e2e/)

### docs
#### Fixed
- **e2e page:** timeline (Steps) broken — replaced markdown numbered lists with explicit JSX `<li>` elements

---

## v3.4.50 (2026-04-09)

> Docs: [debate](https://doc-claude.brewcode.app/brewtools/skills/debate/) | [brewtools](https://doc-claude.brewcode.app/brewtools/overview/) | [brewcode skills](https://doc-claude.brewcode.app/brewcode/skills/)

### brewcode
#### Changed
- **skills:** moved debate to brewtools plugin (13 skills remaining)
- **docs:** removed all "moved" stub pages (10 files deleted)

### brewtools
#### Added
- **skills:** debate — multi-agent evidence-based debate orchestrator (moved from brewcode, now 6 skills)

### docs
#### Added
- **all pages:** GitHub link cards on all 60 doc pages (Latest Release + View on GitHub)
- **overview pages:** installation guide quick-reference cards
#### Changed
- **navigation:** cleaned up all "(Moved)" entries
- **all pages:** updated plugin counts to 4 plugins, 27 skills, 17 agents
- **guide:** updated to cover all 4 plugins including brewui
#### Fixed
- **license:** corrected author name to Maksim Kochetkov
- **debate:** fixed /brewtools:review → /brewcode:review references
- **imports:** removed all unused MDX component imports

---

## v3.4.49 (2026-04-08)

> Docs: [brewui image-gen](https://doc-claude.brewcode.app/brewui/skills/image-gen/)

### brewui
#### Changed
- **image-gen:** unified anti-slop strategy — merged forbidden patterns, story-first methodology, and style constraints into a single `anti-slop.md` reference

---

## v3.4.48 (2026-04-07)

> Docs: [brewcode](https://doc-claude.brewcode.app/plugin/brewcode/)

### brewui
#### Changed
- **docs:** added copyright notice © 2026 to docs site footer

---

## v3.4.47 (2026-04-07)

> Docs: [brewtools ssh](https://doc-claude.brewcode.app/brewtools/skills/ssh/) | [brewtools deploy](https://doc-claude.brewcode.app/brewtools/skills/deploy/) | [brewui glm-design-to-code](https://doc-claude.brewcode.app/brewui/skills/glm-design-to-code/) | [brewtools ssh-admin](https://doc-claude.brewcode.app/brewtools/agents/ssh-admin/) | [brewtools deploy-admin](https://doc-claude.brewcode.app/brewtools/agents/deploy-admin/) | [brewui glm-openrouter-specialist](https://doc-claude.brewcode.app/brewui/agents/glm-openrouter-specialist/) | [brewui glm-zai-specialist](https://doc-claude.brewcode.app/brewui/agents/glm-zai-specialist/)

### brewcode
#### Changed
- **skills:** moved `glm-design-to-code` to brewui plugin (visual/creative tools)
- **skills:** moved `ssh` and `deploy` to brewtools plugin (universal utilities)
- **agents:** moved `glm-openrouter-specialist` and `glm-zai-specialist` to brewui
- **agents:** moved `ssh-admin` and `deploy-admin` to brewtools
- **docs:** old brewcode pages replaced with redirect stubs pointing to new locations

### brewtools
#### Added
- **skills:** `ssh` -- SSH server management (moved from brewcode)
- **skills:** `deploy` -- GitHub Actions deployment (moved from brewcode)
- **agents:** `ssh-admin` -- SSH server administrator (moved from brewcode)
- **agents:** `deploy-admin` -- GitHub Actions administrator (moved from brewcode)
- **hooks:** `pre-task.mjs` -- injects `BT_PLUGIN_ROOT` into subagent prompts

### brewui
#### Added
- **skills:** `glm-design-to-code` -- GLM vision design-to-code (moved from brewcode)
- **agents:** `glm-openrouter-specialist` -- OpenRouter API routing (moved from brewcode)
- **agents:** `glm-zai-specialist` -- Z.ai GLM API expert (moved from brewcode)
- **hooks:** `pre-task.mjs` -- injects `BU_PLUGIN_ROOT` into subagent prompts

---

## v3.4.46 (2026-04-07)

> Docs: [deploy skill](https://doc-claude.brewcode.app/brewcode/skills/deploy/) | [deploy-admin agent](https://doc-claude.brewcode.app/brewcode/agents/deploy-admin/)

### brewcode
#### Added
- **deploy skill:** GitHub Actions deployment -- workflows, releases, GHCR, CI/CD with safety gates
- **deploy skill:** 6 modes: setup, create, release, deploy, monitor, update-agent
- **deploy skill:** 4 scripts: detect-mode, gh-env-check, workflow-discover, deploy-local-ops (CLAUDE.local.md CRUD)
- **deploy skill:** Safety classification: READ/CREATE (free), MODIFY/SERVICE (confirm), DELETE/PRIVILEGE (always confirm)
- **deploy skill:** 4 workflow templates: Build+Push GHCR, Deploy VPS, Release, Security Scan
- **deploy skill:** CLAUDE.local.md GitHub Config + Workflows sections (coexists with SSH sections)
- **deploy skill:** Dynamic deploy-admin agent generation from template with live workflow data
- **deploy skill:** SSH skill integration for VPS deploy targets and health checks
- **deploy-admin agent:** GitHub Actions and deployment agent with live workflow inventory, release flow, Docker/GHCR patterns

---

## v3.4.45 (2026-04-07)

> Docs: [image-gen](https://doc-claude.brewcode.app/brewui/skills/image-gen/)

### brewui
#### Changed
- **image-gen:** Z.ai provider upgraded from CogView-4 to GLM-image (flagship model, top-tier quality, same $0.015/image)
- **image-gen:** Z.ai endpoint migrated from `open.bigmodel.cn` to `api.z.ai`
- **image-gen:** Default Z.ai size updated to 1280x1280 with custom size support (512-2048px, multiples of 32)
- **image-gen:** Docs page updated with GLM-image promotional badge and Z.ai docs link

---

## v3.4.44 (2026-04-07)

> Docs: [ssh skill](https://doc-claude.brewcode.app/brewcode/skills/ssh/) | [ssh-admin agent](https://doc-claude.brewcode.app/brewcode/agents/ssh-admin/) | [image-gen](https://doc-claude.brewcode.app/brewui/skills/image-gen/)

### brewcode
#### Added
- **ssh skill:** Remote server management -- connect, configure, deploy, administer Linux servers with safety gates
- **ssh skill:** 5 modes: setup, connect, configure, execute, update-agent
- **ssh skill:** 4 scripts: detect-mode, ssh-env-check, server-discover, claude-local-ops (CLAUDE.local.md CRUD)
- **ssh skill:** Safety classification: READ/CREATE (free), MODIFY/SERVICE (confirm), DELETE/PRIVILEGE (always confirm)
- **ssh skill:** Server auto-discovery: OS, kernel, Docker, containers, disks, services, ports
- **ssh skill:** CLAUDE.local.md persistent config (gitignored) with server inventory
- **ssh skill:** Dynamic ssh-admin agent generation from template with live server data
- **ssh skill:** Robustness: fail-fast, loop protection (max retries), timeouts, manual fallback strategy
- **ssh-admin agent:** Linux server administrator -- SSH, Docker, Compose, systemd, Caddy/Nginx, security hardening

### brewui
#### Changed
- **image-gen:** Added Brewpage publish tip for remote/headless image viewing

---

## v3.4.43 (2026-04-07)

> Docs: [brewui overview](https://doc-claude.brewcode.app/brewui/overview/) | [image-gen](https://doc-claude.brewcode.app/brewui/skills/image-gen/)

### brewui (NEW PLUGIN)
#### Added
- **brewui plugin:** New plugin for UI/visual/creative tools
- **image-gen:** AI image generation via 5 providers (Gemini Imagen 4, OpenRouter Gemini 2.5 Flash, OpenRouter GPT-5, Z.ai CogView-4, OpenAI DALL-E 3)
- **anti-slop:** Style-aware prompt engineering (photo, illustration, art)
- **multi-mode:** generate, edit, config, update

---

## v3.4.42 (2026-04-06)

> Docs: [publish](https://doc-claude.brewcode.app/brewdoc/publish/)

### brewdoc
#### Added
- **publish:** Multi-file site upload support — directories and ZIP archives via `/api/sites` endpoint
- **publish:** `--entry <filename>` argument for custom entry point override
- **publish:** SITE content type with auto-detection (directory → ZIP + upload, `.zip` → direct upload)
- **publish:** Entry file auto-detection: `--entry` flag > `index.html` > first `.html` alphabetically
- **publish:** Site pre-publish stats showing file count, total size, and detected entry file
- **publish:** History table extended with Type column (`html`, `json`, `file`, `site (N files)`)

---

## v3.4.41 (2026-04-06)

> Docs: [publish](https://doc-claude.brewcode.app/brewdoc/publish/)

### brewdoc
#### Changed
- **publish:** Reverted model from sonnet back to haiku for publish skill

---

## v3.4.39 (2026-04-06)

> Docs: [publish](https://doc-claude.brewcode.app/brewdoc/publish/)

### brewdoc
#### Changed
- **publish:** Atomic token handling — ownerToken never in conversation output, saved directly to history file
- **publish:** Namespace auto-suggestion generates meaningful slugs from content context (e.g. `api-docs`, `pricing`)

---

## v3.4.37 (2026-04-06)

> Docs: [teams](https://doc-claude.brewcode.app/brewcode/skills/teams/) | [hooks](https://doc-claude.brewcode.app/brewcode/hooks/) | [agents](https://doc-claude.brewcode.app/brewcode/agents/) | [auto-sync](https://doc-claude.brewcode.app/brewdoc/auto-sync/)

### brewcode
#### Fixed
- **agents:** Added `*_PLUGIN_ROOT` guard to `glm-zai-specialist`, `glm-openrouter-specialist`, `bc-coordinator` — stop with clear error if plugin root missing from prompt context
- **docs:** CLAUDE.md Architecture table — matcher updated to `PreToolUse:Task|Agent`

#### Changed
- **rules:** `best-practice.md` — added release docs links requirement (#8), autonomous release flow (#9), plugin root guard pattern (#10)
- **release process:** CLAUDE.md Version Sync — autonomous commit/push/deploy, mandatory `> Docs:` links in RELEASE-NOTES.md

### brewdoc
#### Fixed
- **agents:** Added `BD_PLUGIN_ROOT` guard to `bd-auto-sync-processor` — stop with clear error if plugin root missing

---

## v3.4.36 (2026-04-06)

> Docs: [teams](https://doc-claude.brewcode.app/brewcode/skills/teams/) | [hooks](https://doc-claude.brewcode.app/brewcode/hooks/)

### brewcode
#### Fixed
- **hooks:** `hooks.json` matcher `"Task"` changed to `"Task|Agent"` — pre-task.mjs and post-task.mjs now fire on Agent tool calls (renamed from Task in Claude Code ~v2.1.63)
- **teams:** Agent template `agent-template.md` — trace-ops.sh calls made optional (1 attempt max, skip silently on failure). Agents no longer hang when `BC_PLUGIN_ROOT` is unavailable as shell env var
- **teams:** `BC_PLUGIN_ROOT` usage clarified as prompt-injected plain text, not shell env var — agents instructed to read value from prompt context and substitute literally

---

## v3.4.35 (2026-04-06)

> Docs: [teams](https://doc-claude.brewcode.app/brewcode/skills/teams/) | [skills](https://doc-claude.brewcode.app/brewcode/skills/) | [skill-creator](https://doc-claude.brewcode.app/brewcode/agents/skill-creator/) | [guide](https://doc-claude.brewcode.app/brewdoc/guide/)

### brewcode
#### Changed
- **teams:** Added Review and Fix Pipeline (C5-C9) after agent creation — 3 parallel quorum reviewers, 2/3 consensus filter, verification, fix critical/important issues, re-verify with max 2 retry cycles. Flags: `--skip-review`, `--review`

### docs
#### Changed
- **skills overview:** Added Lifecycle timeline, Skill Management cross-refs, Independent Skills cards
- **skills skill:** Removed large bash scripts, added Cards for modes, Steps for 7-phase workflow, Tabs for details
- **skill-creator:** Added CardGrid for Skill Anatomy and Design Patterns, Steps for creation process, See Also cross-refs
- **guide:** Fixed Steps div wrappers, added domain CardGrid, Steps for How It Works flow
- **publish:** Fixed Steps div wrappers
- **Card component:** Extended iconMap with heart, money, library, fire, handshake, rocket, package
- **all pages:** Replaced raw emoji hex codes with named icons across getting-started, quickstart, installation, debate

#### Added
- **README sync:** All 28 README files synced with docs site (root, 3 plugins, 21 skills)

### chore
- `.gitignore`: ignore `*.png` and `.playwright-mcp/`, untracked stale screenshots

---

## v3.4.29 (2026-04-06)

> Docs: [skills](https://doc-claude.brewcode.app/brewcode/skills/skills/) | [skill-creator](https://doc-claude.brewcode.app/brewcode/agents/skill-creator/)

### brewcode
#### Changed
- **skills:** Unified create/up flow with 7-phase pipeline (Discovery → User Interaction → Create/Improve → Validate → Review → E2E Testing → Summary). Added testing depth selection (Quick/Standard/Deep), review orchestration (Simple/Quorum with DoubleCheck verification), E2E testing via `claude -p`, and structured summary reports
- **skill-creator:** Added Step 5.7 (unit test generation for scripts/), Step 5.8 (README generation from template), pre-filled values support, Bash tool in agent toolset
- **permission-guard:** Added `.claude/teams/` and `.claude/memory/` to auto-allowed directories

#### Added
- **skills/references:** 4 new templates — `review-prompt.md` (quality review checklist), `e2e-template.md` (E2E test scenarios), `readme-template.md` (skill README with auto-sync), `summary-template.md` (Phase 6 report)

---

## v3.4.28 (2026-04-05)

> Docs: [debate](https://doc-claude.brewcode.app/brewcode/skills/debate/)

### brewcode
#### Added
- **debate:** New `/brewcode:debate` skill — evidence-based multi-agent debate orchestration with Discovery phase (parallel codebase + web research before every debate), 3 modes (Challenge, Strategy, Critic), dynamic agent generation (2-5 agents), mandatory source citations for all arguments, sequential debates with JSONL logging, secretary summaries, and judge decisions

---

## v3.4.26 (2026-04-04)

> Docs: [glm-design-to-code](https://doc-claude.brewcode.app/brewcode/skills/glm-design-to-code/)

### brewcode
#### Added
- **glm-design-to-code-trial:** Standalone trial skill for `npx skills` distribution (README.md + SKILL.md)
- **gitignore:** `d2c-output/` excluded from repo (generated test artifact)

---

## v3.4.25 (2026-04-04)

> Docs: [glm-design-to-code](https://doc-claude.brewcode.app/brewcode/skills/glm-design-to-code/)

### brewcode
#### Added
- **glm-design-to-code:** Smart intent detection — Opus auto-classifies user intent (reproduce, creative, enhance, modify, convert) from prompt text
- **glm-design-to-code:** Dual input for HTML — screenshots HTML file and sends both image + HTML source to GLM for better conversion
- **glm-design-to-code:** Custom instruction support — `GLM_INSTRUCTION` passed to scripts as param 8, replaces hardcoded prompts

#### Changed
- **glm-design-to-code:** Profile prompts are now quality-only (no intent coupling) — `profile-max.md`, `profile-optimal.md`, `profile-efficient.md`
- **glm-design-to-code:** `glm-build-request.sh` — params 8 (instruction) + 9 (html_source), rawfile for user_text, dual jq template
- **glm-design-to-code:** `glm-build-text-request.sh` — param 8 (instruction), rawfile for user_text (ARG_MAX safety)
- **glm-design-to-code:** Resolved Configuration table shows Intent, Instruction, Dual Input rows
- **glm-design-to-code:** Step 3 payload routing: 5-way table (image/html-dual/html-text/text/url)

---

## v3.4.24 (2026-04-03)

> Docs: [glm-design-to-code](https://doc-claude.brewcode.app/brewcode/skills/glm-design-to-code/)

### brewcode
#### Changed
- **glm-design-to-code:** Removed `disable-model-invocation` — skill now auto-triggers on natural phrases ("convert screenshot to code", "turn design into React")
- **glm-design-to-code:** Optimized description for LLM auto-invocation (3 natural examples, explicit "external GLM API" signal)
- **glm-design-to-code:** Mandatory resolved configuration output before every API call (all modes: CREATE, REVIEW, FIX)
- **glm-design-to-code:** Parameter priority: prompt flags > inline text > `.env` > defaults; raw text scanning for inline keys and model names
- **glm-design-to-code:** `--model` auto-prefix `z-ai/` for OpenRouter, auto-strip for Z.ai

---

## v3.4.23 (2026-04-03)

> Docs: [glm-design-to-code](https://doc-claude.brewcode.app/brewcode/skills/glm-design-to-code/)

### brewcode
#### Fixed
- **glm-design-to-code:** Context window corrected to 202K (was 128K) across SKILL.md, README, docs
- **glm-design-to-code:** Replaced phantom model `glm-4.5-air:free` with `glm-4.6v-flash` in key validation
- **glm-design-to-code:** Standardized pricing across all documentation ($0.01-0.08 range by profile)
- **glm-design-to-code:** API key flow now validates before saving to `.env` (prevents invalid key persistence)
- **glm-design-to-code:** Split API key provider choice and key entry into separate AskUserQuestion steps
- **glm-design-to-code:** Settings dialog now loops for multiple changes before confirming
- **glm-design-to-code:** REVIEW mode uses parsed `RESULT_IMAGE` instead of hardcoded path
- **Scripts:** All 6 scripts now have +x execute permissions
- **Scripts:** `glm-request.sh` curl timeout increased to 600s for large payloads
- **Scripts:** `glm-request.sh` adds `HTTP-Referer` and `X-Title` headers for OpenRouter requests
- **Scripts:** `glm-extract.sh` allows spaces in output directory paths
- **Scripts:** `glm-extract.sh` awk `system()` call now quotes directory paths
- **Scripts:** `glm-verify.sh` background timer PID tracked and cleaned up on `--kill`

### docs
#### Enhanced
- **glm-design-to-code.mdx:** Added Design2Code Benchmark Comparison section (GLM-5V-Turbo 94.8 vs Claude Opus 4.6 77.3)
- **glm-design-to-code.mdx:** Added Our Research Results section with per-framework Tabs (HTML 9.5, React 8.0, Flutter 9.0)
- **glm-design-to-code.mdx:** Added External Resources CardGrid (Z.ai docs, OpenRouter, BenchLM, The Decoder)
- **glm-design-to-code.mdx:** Expanded Pipeline Flow Steps to 7 detailed steps
- **glm-design-to-code.mdx:** Updated GLM Models table context window to 202K

---

## v3.4.22 (2026-04-03)

### brewcode
#### Added
- **New skill:** `glm-design-to-code` — GLM vision model-powered design-to-code generator
  - Three modes: CREATE (any input to code: screenshots, text descriptions, HTML, URLs), REVIEW (compare original vs result), FIX (apply feedback)
  - Supports HTML/CSS, React 18, Flutter Web, custom frameworks
  - Three quality profiles: maximum (pixel-perfect), optimal (balanced), efficient (fast)
  - Dual provider support: Z.ai (direct) and OpenRouter
  - Full pipeline: argument parsing, API key setup, payload build, API request, file extraction, build, verification
  - Scripts: parse-args.sh, glm-build-request.sh, glm-build-text-request.sh, glm-request.sh, glm-extract.sh, glm-verify.sh
- **Updated agents:** `glm-zai-specialist`, `glm-openrouter-specialist` — migrated script paths to plugin directory

---

## v3.4.21 (2026-04-03)

### docs
#### Added
- **`/brewdoc:guide` docs page** — guide.mdx with 9 topics, 3 domains, progress tracking, environment health check
- Updated brewdoc overview.mdx: 6 skills, guide card + command row + directory tree entry
- Updated navigation.ts: guide link in Brewdoc section

---

## v3.4.20 (2026-04-02)

### brewdoc
#### Added
- **`/brewdoc:guide` skill** — interactive teaching skill for the brewcode plugin suite: 9 topics across 3 domains (Getting Started, Core Workflow, Mastery), haiku-powered, progress tracking with JSON persistence, multilingual (EN/RU/PT), environment validation, section-by-section delivery with AskUserQuestion navigation
- **Guide scripts** — `validate.sh` (docs site, GitHub releases, installed versions, auto-update status), `progress.sh` (CRUD for guide progress JSON at `~/.claude/brewdoc/`)
- **11 reference files** — welcome banner + menu, ASCII architecture diagrams, 9 topic files covering all 22+ skills, 14+ agents, 9 hooks, killer flow pipeline, dynamic teams, customization, project integration, and power features

---

## v3.4.19 (2026-04-02)

### brewcode
#### Added
- **`/brewcode:e2e` skill** — full-cycle E2E testing orchestration: 6 modes (setup, create, update, review, rules, status), 5 runtime agents created via agent-creator, BDD scenarios with YAML frontmatter, layered test architecture (stack-agnostic), quorum review (3 reviewers, 2/3 consensus), MAX_CYCLES=3 review loops
- **E2E references** — `e2e-rules.md` (24 rules, 6 categories), `e2e-architecture.md` (layered diagram + 4-stack mapping), `agent-template.md` (Rules Loading + Self-Check protocols), 6 mode flow files
- **`detect-mode.sh`** — POSIX sh argument parser for e2e skill (6 keywords, smart default: status if agents exist, setup otherwise)

### docs
#### Updated
- New `/brewcode/skills/e2e` docs page with modes, agents, architecture, quorum review
- Updated skills.mdx (13 skills), overview.mdx (13 skills, e2e in directory tree + Components), navigation.ts

---

## v3.4.17 (2026-04-02)

### brewpage-publish
#### Fixed
- **Security: W007 Insecure Credential Handling** — ownerToken no longer appears in conversation output; curl + jq parsing + history save now execute atomically inside a single bash block; LLM only sees the published URL; password column removed from history table

---

## v3.4.16 (2026-04-02)

### brewcode
#### Changed
- **Merged `/brewcode:install` into `/brewcode:setup`** — prerequisites check (brew, coreutils, jq, grepai) now runs automatically as Phase 0 before project analysis; if all required tools are present, Phase 0 is skipped silently; interactive prompts via AskUserQuestion for missing components and optional grepai install

#### Removed
- **`/brewcode:install` skill** — deleted; all functionality absorbed by `/brewcode:setup` Phase 0

---

## v3.4.15 (2026-04-02)

### brewcode
#### Changed
- **Teams: session-scoped trace system** — replaced 3 Markdown files (`tracking.md`, `issues.md`, `insights.md`) with single `trace.jsonl`; write via `trace-ops.sh add` (Bash append, ~96% token savings vs Edit); cursor-based incremental reads for `update` mode
- **`trace-ops.sh`** — new POSIX sh utility: `add` (JSONL append), `read` (jq/grep filter), `cursor` (incremental bookmark), `migrate` (Markdown-to-JSONL conversion with `.bak` backup)
- **SID injection in `pre-task.mjs`** — session ID (8 chars) auto-injected into all agent prompts when `.claude/teams/` exists
- **`verify-team.sh`** — checks `trace.jsonl` instead of 3 MD files; detects legacy files and suggests migration

---

## v3.4.14 (2026-04-02)

### brewcode
#### Added
- **`/brewcode:teams`** — new skill: creates and manages dynamic teams of domain-specific agents; modes: `create`, `update`, `status`, `cleanup`; generates agent roster with tracking framework in `.claude/teams/`
- **Mode Switcher** — skills can toggle persistent session-level behavioral modes via `brewcode.state.json`; hooks inject mode instructions on every event (`forced-eval.mjs`, `session-start.mjs`, `pre-task.mjs`)
- **`getActiveMode()` utility** in `hooks/lib/utils.mjs` — reads active mode and loads instructions from `modes/{name}.md`
- **`brewcode/modes/` directory** — mode instruction files; ships with `manager.md` default
- **Mode Switcher design pattern** added to `skill-creator` agent and `hook-creator` agent
- **Step 2.5** in `/brewcode:skills create` — auto-detects mode-switching intent and suggests Mode Switcher pattern
- **Dynamic Agent Resolution** in `/brewcode:plan` — checks `.claude/teams/` roster before plugin agents; priority: team > project > plugin > system

#### Changed
- `hook-creator` agent: updated to Claude Code v2.1.89+ — added `PermissionDenied` event (26 events total), `defer` support in PreToolUse, `retry` response for PermissionDenied

### brewtools
#### Added
- **NEW plugin** — universal text utilities extracted from brewcode
- Skills: `text-optimize`, `text-human`, `secrets-scan`
- Agent: `text-optimizer`
- `BT_PLUGIN_ROOT` injected by SessionStart hook
- Install: `claude plugin install brewtools@claude-brewcode`

### brewcode (removed)
- `text-optimize`, `text-human`, `secrets-scan` skills — moved to brewtools
- `text-optimizer` agent — moved to brewtools
- Fallback added to `convention/SKILL.md` P5 when brewtools not installed

---

## v3.4.13 (2026-04-01)

### docs
#### Fixed
- Steps timeline layout on publish docs page

---

## v3.4.12 (2026-03-31)

### docs
#### Fixed
- Steps alignment on brewpage/publish page — removed Badge tags and div wrappers

---

## v3.4.11 (2026-03-31)

### brewdoc
#### Added
- **brewpage skill** — publish text, markdown, JSON, or files to brewpage.app; interactive namespace + password selection; owner token saved to `.claude/brewpage-history.md`; model: haiku

### skills (marketplace)
#### Added
- **brewpage skill** — standalone marketplace skill with advertising footer; same functionality as brewdoc:brewpage

### docs
#### Added
- **brewdoc/brewpage** docs page — full documentation with Steps, content-type table, namespace/password sections, owner token & history
- **brewpage.app** link and Callout on the brewpage docs page

#### Changed
- brewdoc overview updated: 5 skills, brewpage card, command row

---

## v3.4.10 (2026-03-31)

### brewcode
#### Added
- **15 individual skill pages** -- full content from SKILL.md sources (setup, spec, plan, start, convention, rules, grepai, install, teardown, text-optimize, text-human, standards-review, skills, agents, secrets-scan)
- **13 individual agent pages** -- full system prompt content (developer, tester, reviewer, architect, skill-creator, agent-creator, hook-creator, text-optimizer, bash-expert, bc-coordinator, bc-knowledge-manager, bc-grepai-configurator, bc-rules-organizer)
- **permission-guard hook** documented in hooks page (9th hook)

### brewdoc
#### Added
- **my-claude dedicated page** -- moved from inline section in overview to standalone page

### docs
#### Changed
- **Collapsible sidebar** -- Skills (15) and Agents (13) groups with `<details>/<summary>`, auto-expand on current page
- **Index pages** -- skills.mdx and agents.mdx converted from Tabs to CardGrid links
- **Site expanded** from 12 to 41 content pages (29 new)

---

## v3.4.9 (2026-03-31)

### brewcode
#### Changed
- **hook-creator agent** -- synced with HOOKS-REFERENCE: 14 to 25 events, version history, lifecycle diagrams, channel reliability matrix, expanded matcher patterns, output schemas, async recommendations
- **agent-creator agent** -- synced with AGENT-REFERENCE: added `initialPrompt`, `isolation`, `mcpServers`, `color`, `memory` fields; 10 bugs table; version history; architectural limitations; expanded validation checklist (6 to 12 items); debugging section
- **skill-creator agent** -- synced with SKILL-REFERENCE: 10 bugs table; version history; `effort` max value; `CLAUDE_SKILL_DIR` version fix (v2.1.69 to v2.1.71); 250-char description truncation; `once` field; architectural limitations
- **permission-guard hook** -- added Bash tool to PermissionRequest matcher; network/dangerous command blocklist; restricted `rm` to safe dirs; added `.claude/tmp/`, `/tmp/`, `/private/tmp/` to allowed paths

#### Added
- **Reference auto-sync dependents** -- `dependents` field in reference frontmatter for cascading updates to creator agents
- **Downstream tracking** -- each reference document now lists dependent plugin artifacts

---

## v3.4.8 (2026-03-30)

### brewcode
#### Added
- **permission-guard hook** -- PermissionRequest hook auto-allows Edit/Write for project `.claude/` subdirectories (tasks, reports, rules, skills, scripts, agents, hooks, private, convention, plans, settings, TASK.md, CLAUDE.md). Global `~/.claude/` excluded
- **forced-eval hook** -- added `[DELEGATE]` manager reminder to UserPromptSubmit alongside existing skill check

---

## v3.4.6 (2026-03-13)

### brewdoc
#### Changed
- **memory skill** — support for `autoMemoryDirectory` from `.claude/settings.json` instead of hardcoded legacy path

### Other
- `.gitignore` — added `.claude/memory/`

---

## v3.4.5 (2026-03-12)

### brewcode
#### Changed
- **skill-creator agent** — added Skill Design Patterns section: Progressive Disclosure, Reference Splitting, Agents-as-References, Dynamic Context, Context Fork, Executable Bash, Skill Chaining, Background Knowledge, Pushy Description, Preloaded Skills

---

## v3.4.4 (2026-03-06)

### brewcode
#### Fixed
- **Silent remote version check failure** -- no message shown when GitHub API check times out (previously showed "(remote check failed)")

---

## v3.4.2 (2026-03-05)

Main changes in [v3.4.0](https://github.com/kochetkov-ma/claude-brewcode/releases/tag/v3.4.0).

### brewcode
#### Added
- **Claude Code version check** -- session-start hook also checks npm registry for newer Claude Code CLI version
- **Version notifications in UI** -- update messages now shown in `systemMessage` (visible to user), not just `additionalContext`

#### Changed
- **Version checks run in parallel** -- brewcode + Claude Code checks via `Promise.all` for minimal latency
- **Regex version parsing** -- `claude -v` output parsed with `\d+\.\d+\.\d+` regex instead of split

---

## v3.4.1 (2026-03-05)

Patch release. Main changes in [v3.4.0](https://github.com/kochetkov-ma/claude-brewcode/releases/tag/v3.4.0).

### brewcode
#### Fixed
- **CI workflows** -- codeql, semgrep, gitleaks now run only on branch push/PR, not on version tags

---

## v3.4.0 (2026-03-05)

### brewcode
#### Added
- **Version check on session start** -- `session-start.mjs` checks GitHub latest release; shows update notification if newer version available, fallback link on timeout/error

#### Changed
- **Skills migrated to `${CLAUDE_SKILL_DIR}`** -- convention, grepai, install, rules, teardown skills now use `${CLAUDE_SKILL_DIR}/scripts/...` instead of relative `scripts/...` paths
- **skill-creator agent** -- documented `${CLAUDE_SKILL_DIR}` variable, updated resource path resolution section, added common mistakes
- **bash-expert agent** -- updated plugin path guidance to distinguish `${CLAUDE_SKILL_DIR}` (skills) vs `$BC_PLUGIN_ROOT` (agents)
- **hooks.md** -- updated path resolution table with `${CLAUDE_SKILL_DIR}` context

#### Fixed
- **pre-task.mjs** -- grepai detection now checks `index.gob` existence, not just `.grepai/` directory

---

## v3.3.2 (2026-03-05)

### brewcode
#### Added
- **brewcode:convention skill** -- Deep project analyzer that extracts etalon classes, patterns, and architecture by layer
  - 4 modes: `full`, `conventions`, `rules`, `paths <p1,p2>`
  - 20-layer analysis framework (14 main + 6 test) with multi-stack support
  - 10 parallel agents for layer analysis → etalon selection → 3 convention docs generation
  - Interactive rules extraction with batched AskUserQuestion flow
  - CLAUDE.md update with etalon quick-reference table
  - POSIX-compliant `convention.sh` script for stack detection, scanning, validation
- **brewcode:agents skill** -- Interactive agent creation and improvement orchestrator
  - Create mode: 3-question interactive setup (scope, model, CLAUDE.md update)
  - Improve mode: improve existing agent by name or path
  - Delegates to `agent-creator` agent for quality agent generation
  - Applies `text-optimize` after creation/improvement
  - Optional CLAUDE.md agents table update
- **bump-version.sh** -- Single command to bump version across all 4 JSON files

#### Changed
- Updated CLAUDE.md: Version Sync section now uses `bump-version.sh`, Update flow includes CLI commands

#### Fixed
- **release.yml** -- `git branch --contains` unreliable on detached HEAD; replaced with `git merge-base --is-ancestor`
- **gitleaks.yml** -- SARIF upload/artifact steps now skip when `results.sarif` not produced
- `convention.sh`: dotnet monorepo module detection (`.sln`/`.csproj` in `has_build_file()`)

### brewdoc
#### Changed
- **session-start hook removed** -- brewdoc no longer injects `BD_PLUGIN_ROOT` at session start
- **pre-task hook retained** -- `BD_PLUGIN_ROOT` still injected into subagent prompts for `bd-auto-sync-processor`
- **Skills use relative paths** -- `my-claude` uses plain relative paths; `md-to-pdf` and `auto-sync` bash commands use `${CLAUDE_SKILL_DIR}`
- Updated `docs/hooks.md`: rewritten to reflect 1 hook (was 2)
- Updated `README.md`, `docs/commands.md`: removed stale `BD_PLUGIN_ROOT` references
- Version unified with brewcode suite (was 1.1.1)

#### Fixed
- **AskUserQuestion compliance** -- `skills/my-claude/SKILL.md`: added `AskUserQuestion` to `allowed-tools`, INDEX update prompt rewritten with explicit header/question/options

---

## v3.0.2 (2026-02-28)

### brewcode
#### Fixed
- **AskUserQuestion compliance** -- Added `AskUserQuestion` to `allowed-tools` / `tools` in all files that require user interaction
  - `skills/text-human/SKILL.md` -- missing tool + explicit instructions at lines 31, 35
  - `skills/grepai/SKILL.md` -- missing tool + Mode: prompt rewritten with 4-option AskUserQuestion
  - `skills/start/SKILL.md` -- missing tool in escalation path (3 fails)
  - `skills/skills/SKILL.md` -- `create` mode now asks invocation type before spawning skill-creator
  - `agents/skill-creator.md` -- clarified foreground-only context for AskUserQuestion
  - `agents/agent-creator.md` -- missing tool added to `tools:`

---

## v3.0.1 (2026-02-28) -- Failure Path & Deadlock Fixes

### brewcode
#### Fixed

- **post-task.mjs** -- branched success/failure messages: on failure, instructs retry/escalate instead of "write report + call coordinator" (P1-1 critical)
- **start/SKILL.md** -- failure cascade to transitive dependents when escalation exhausted; deadlock detection safety net in execution loop (P1-2 critical)
- **start/SKILL.md** -- persist failure to KNOWLEDGE.jsonl before retry for post-compact context (P1-3 critical)
- **start/SKILL.md** -- fixed "ISSUES_TABLE from coordinator output" -> "from verification report" (P1-4)
- **stop.mjs** -- catch block no longer deletes lock on transient error; preserves lock for recovery (P1-5)
- **bc-coordinator.md, PLAN.md.template** -- documented Task API as source of truth; fixed misleading terminal status docs (P1-6)
- **start/SKILL.md** -- added is_error guard for coordinator call: log warning, proceed to TaskUpdate (P1-7)
- **start/SKILL.md** -- moved phase-to-TaskID mapping from NOTE to explicit Sub-step 4a (P1-8)
- **stop.mjs** -- added defense-in-depth comment for redundant validateTaskPath (P1-9)
- **pre-compact.mjs** -- changed artifact validation log level from warn -> debug with "(agent may still be executing)" (P1-10)
- **pre-compact.mjs** -- fixed terminal status check: `=== 'finished'` -> `TERMINAL_STATUSES.has()` (regression fix from review)
- **bc-coordinator.md** -- finalize mode now accepts `status` parameter ("finished" default, "failed" for deadlock/cascade)

#### Updated Files

- `brewcode/hooks/post-task.mjs`
- `brewcode/hooks/stop.mjs`
- `brewcode/hooks/pre-compact.mjs`
- `brewcode/agents/bc-coordinator.md`
- `brewcode/skills/start/SKILL.md`
- `brewcode/skills/setup/templates/PLAN.md.template`

---

## v3.0.0 (2026-02-28) -- Task API Architecture

### brewcode
#### Breaking Changes

- **PLAN.md format** -- new 3-line header (status, current_phase, total_phases)
- **Phase details** -- moved from inline PLAN.md to `phases/` directory
- **Re-run `/brewcode:setup`** to get new templates

#### Added

- **Task API integration** -- TaskCreate/TaskUpdate/TaskList for phase management
- **`phases/` directory** -- individual phase files for agents (`1-research.md`, `1V-verify-research.md`, `FR-final-review.md`, etc.)
- **Phase Registry table** -- slim overview in PLAN.md for manager (replaces inline phase details)
- **Parallel execution** -- tasks in same Parallel group spawn simultaneously via multiple TaskCreate calls
- **Lighter coordinator** -- bc-coordinator now handles knowledge extraction + report verification only
- **Fix phase protocol** -- automatic `{N}F-fix-{name}.md` file generation on verification failure
- **`phase.md.template`** -- execution phase template
- **`phase-verify.md.template`** -- verification phase template
- **`phase-fix.md.template`** -- fix phase template (dynamic)
- **`phase-final-review.md.template`** -- final review template

#### Changed

- **pre-task.mjs** -- v3 task context injection (phase file reminder for agents)
- **post-task.mjs** -- Task API instructions for manager
- **pre-compact.mjs** -- v3-aware handoff message
- **session-start.mjs** -- Task API reminder on active v3 task
- **plan/SKILL.md** -- generates `phases/` directory alongside slim PLAN.md
- **start/SKILL.md** -- uses Task API instead of reading phases inline; manager never reads `phases/` files
- **docs/commands.md** -- updated plan and start sections for v3
- **docs/file-tree.md** -- added `phases/` directory to task structure
- **README.md** -- v3 flow description, updated task structure

#### Backward Compatibility

- v2 tasks continue working (parseTask fallback, hooks detect v3 via `phases/` directory presence)
- No changes to: SPEC skill, KNOWLEDGE format, grepai hooks, review skill, teardown skill

---

## v2.16.4 (2026-02-28)

### brewcode
#### Added

- **bc-knowledge-manager** -- new `prune-rules` mode: removes avoids/best-practice entries from KNOWLEDGE.jsonl after export to rules, leaves only info entries
- **start/SKILL.md** -- Step 5 (Complete): added mandatory `bc-knowledge-manager` call with `prune-rules` mode after `brewcode:rules`

#### Changed

- **docs/flow.md** -- added section g) KNOWLEDGE Pipeline with full lifecycle diagram
- **docs/commands.md** -- `/brewcode:start` section supplemented with "KNOWLEDGE -> Rules (automatic)" subsection
- **skills/start/README.md** -- steps 7-8 describe actualization and cleanup of KNOWLEDGE
- **README.md** (root) -- "Knowledge lifecycle" section describes accumulation and conversion of KNOWLEDGE

---

## v2.16.3 (2026-02-28)

### brewcode
#### Added

- **standards-review SKILL.md** -- Phase 0: asks user via `AskUserQuestion` before analysis -- whether to run `/simplify` at the end or not
- **standards-review SKILL.md** -- Phase 7: conditional `Skill(simplify)` invocation after report if user chose "Yes"
- **standards-review SKILL.md** -- added `AskUserQuestion` and `Skill` to `allowed-tools`

---

## v2.16.2 (2026-02-28)

### brewcode
#### Fixed

- **spec SKILL.md** -- Feature Splitting Check now numbered as step 2.5 in the ordered workflow instead of a floating section
- **spec SKILL.md** -- reviewer loop capped at MAX 3 iterations with user escalation
- **SPEC-creation.md** -- added Scope row to Consolidation Rules table
- **SPEC-creation.md** -- fixed timing estimate from "3 turns" to "5-8 turns depending on review iterations"
- **SPEC-creation.md** -- fixed `Task(agent=...)` to `Task(subagent_type=...)` for Claude Code Task tool API consistency
- **plan SKILL.md** -- fixed `subagent_type="reviewer"` to `subagent_type="brewcode:reviewer"` in traceability check (Step 7)
- **plan SKILL.md** -- added Lightweight Plan Review step (2 agents, 2/2 consensus) to Plan Mode workflow
- **plan SKILL.md** -- clarified KNOWLEDGE.jsonl creation as 0-byte empty file with explicit `touch` command
- **plan SKILL.md** -- added gap remediation instruction after traceability check (Step 7)

---

## v2.16.1 (2026-02-28)

### brewcode
#### Added

- **SPEC.md.template** -- added Success Metrics, Non-Functional Requirements, and Acceptance Criteria sections
  - Success Metrics: measurable targets with how-to-measure column
  - NFR: Performance, Security, Scalability, Reliability with specific targets
  - Acceptance Criteria: Given/When/Then format for verifiable conditions
- **spec SKILL.md** -- enhanced requirements gathering and feature splitting
  - Expanded from 1-4 to 3-7 questions, batched up to 4 per AskUserQuestion call
  - 5 mandatory question categories: Scope, NFR, Acceptance Criteria, Constraints, Edge cases
  - Feature Splitting Check: auto-suggests task split when scope >3 areas or >12 phases
  - Added NFR/Quality row to partition research areas table
- **SPEC-creation.md** -- added NFR category, AC consolidation guidance, updated example partition
- **PLAN.md.template** -- added Technology Choices section (decision, rationale, alternatives)
- **plan SKILL.md** -- improved quorum review and traceability
  - Mixed quorum: Plan + architect + reviewer (replaces 3x Plan agents)
  - Technology Choices substep (5.5) for documenting non-trivial decisions
  - Traceability check: Scope items, Acceptance Criteria, NFR all mapped to phases

#### Updated Files

| File | Change |
|------|--------|
| `skills/setup/templates/SPEC.md.template` | +3 sections: Success Metrics, NFR, Acceptance Criteria |
| `skills/spec/SKILL.md` | Enhanced questions, feature splitting, NFR/Quality area |
| `skills/spec/references/SPEC-creation.md` | NFR category, AC guidance, updated example |
| `skills/plan/SKILL.md` | Mixed quorum, tech choices step, traceability |
| `skills/setup/templates/PLAN.md.template` | +Technology Choices section |
| `plugin.json` | Version 2.16.0 -> 2.16.1 |

---

## v2.16.0 (2026-02-28)

### brewcode
#### Removed

- **`brewcode:auto-sync` skill** -- moved to dedicated `brewdoc` plugin
- **`bd-auto-sync-processor` agent** -- moved to `brewdoc` plugin

#### Notes

- Users of `/brewcode:auto-sync` should install `brewdoc` plugin and use `/brewdoc:auto-sync`

### brewdoc
#### New Skills
- `brewdoc:md-to-pdf` -- Markdown to PDF converter with dual engine support (reportlab/weasyprint), style customization, test mode, dependency management

#### Initial Release (v1.0.0)

- `brewdoc:auto-sync` -- Universal documentation sync (moved from brewcode)
- `brewdoc:my-claude` -- Generate Claude Code installation docs
- `brewdoc:memory` -- Optimize Claude Code memory files interactively

---

## v2.15.7 (2026-02-26)

### brewcode
#### Fixed

- **plugin.json** -- removed explicit `"hooks": "./hooks/hooks.json"` from manifest
  - `hooks/hooks.json` is auto-discovered by Claude Code, explicit declaration caused duplicate loading error
  - Error: "Duplicate hooks file detected: ./hooks/hooks.json resolves to already-loaded file"

#### Updated Files

| File | Change |
|------|--------|
| `plugin.json` | Removed `hooks` field (auto-discovered) |

---

## v2.15.6 (2026-02-21)

### brewcode
#### Changed

- **agent-creator agent** -- added "Reference-Aware Skills" section
  - Guidance for agents spawned from skills with `references/` directories
  - Size-based approach: <50 lines inline into prompt, >50 lines use `$BC_PLUGIN_ROOT` path
- **skill-creator agent** -- added "Reference Splitting Strategy" section
  - When to split references into per-mode files (criteria & thresholds)
  - Loading patterns: conditional (lazy), unconditional single, unconditional multi
  - 3-step pattern template (detect -> read -> validate)
  - New anti-pattern: "All references loaded unconditionally in multi-mode skill"

#### Updated Files

| File | Change |
|------|--------|
| `agents/agent-creator.md` | Reference-Aware Skills section |
| `agents/skill-creator.md` | Reference Splitting Strategy section, loading patterns, anti-pattern |

---

## v2.15.5 (2026-02-20)

### brewcode
#### Changed

- **auto-sync** -- `<auto-sync-override>` body block replaced with frontmatter field `auto-sync-override:` (multiline YAML)
- **bd-auto-sync-processor** -- reads override from frontmatter; optionally synthesizes and writes `auto-sync-override:` to frontmatter when not defined by prompt or file body
- **sync-doc/agent/skill/rule** -- `preserve:` references updated to frontmatter field
- **skills skill** -- renamed from `skillsup` to `skills` for naming consistency

---

## [2.15.4] - 2026-02-19

### brewcode
#### Added

- **spec/plan SKILL.md** -- `-n`/`--noask` flag to skip all user questions and auto-approve defaults
  - `spec`: skips AskUserQuestion in requirements gathering and SPEC validation steps
  - `plan`: skips phase-split presentation and review result confirmation
  - Argument hint updated: `[-n] <description>` for spec, `[-n] [task-dir|SPEC.md|plan-file]` for plan

#### Fixed

- **auto-sync review fixes** -- 11 issues resolved from code review
  - C10: Removed dead code in `index-ops.sh` (macOS date detection, both branches identical)
  - C3: Agent description "sub-agents" -> "direct tool calls" in `bd-auto-sync-processor.md`
  - C16: Override wording "augment (not replace)" -> "augment or selectively override"
  - C18: Fixed misleading coordinator comment (post-task.mjs skip note)
  - C7: Removed NEXT ACTION section (no task directory for standalone auto-sync)
  - C4: Replaced unreachable `claude-code-guide` references with `Grep` across 6 files
  - C5: INDEX update now conditional on error status (errors skip update for retry)
  - C17: Added `preserve:` override guidance to all 5 instruction files
  - C2: Wired optimize flag end-to-end (SKILL.md -> agent -> instructions)
  - PLUGIN_ROOT: Fixed input format -- `{plugin_root}` -> `$BC_PLUGIN_ROOT` (hook-injected)
  - Tool column: Removed stale `Explore (...)` wrapper from 5 instruction files

#### Updated Files

| File | Change |
|------|--------|
| `agents/bd-auto-sync-processor.md` | 7 fixes: description, trust table, override, coordinator, NEXT ACTION, optimize, PLUGIN_ROOT |
| `skills/auto-sync/SKILL.md` | Error-conditional INDEX update, optimize flag pass-through |
| `skills/auto-sync/scripts/index-ops.sh` | Dead code removal |
| `skills/auto-sync/instructions/sync-skill.md` | Tool names, preserve guidance |
| `skills/auto-sync/instructions/sync-agent.md` | Tool names, preserve guidance |
| `skills/auto-sync/instructions/sync-config.md` | Tool names, preserve guidance |
| `skills/auto-sync/instructions/sync-doc.md` | Tool names, preserve guidance |
| `skills/auto-sync/instructions/sync-rule.md` | Tool names, preserve guidance |

---

## [2.15.3] - 2026-02-18

### brewcode
#### Fixed

- **update-plugin.sh** -- `claude plugin` commands reset stdout in non-TTY
  - Output buffered to `/tmp/brewcode-update.log` via `tee`
  - Uninstall+install flow when cache is missing (`update` skips reinstall)
  - Version match check (plugin.json <-> marketplace.json) before start
  - Filesystem verification after install (cache dir + file count)
  - `jq` for JSON parsing instead of fragile `grep+sed`
- **clean-plugin-cache.sh** -- added `--all` flag for full cache wipe
  - Fixed `${@}` crash with `set -u` when no arguments passed

#### Updated Files

| File | Change |
|------|--------|
| `.claude/scripts/update-plugin.sh` | Log buffering, uninstall+install, jq, verification |
| `.claude/scripts/clean-plugin-cache.sh` | `--all` flag, `set -euo pipefail`, ERR trap |

---

## [2.15.2] - 2026-02-18

### brewcode
#### Changed

- **Documentation** -- translated all docs from Russian to English
  - `INSTALL.md`, `README.md`, `grepai.md` -- full translation
  - `docs/commands.md`, `docs/file-tree.md`, `docs/flow.md`, `docs/hooks.md` -- full translation
- **README.md** -- added 6 missing skills to commands table
  - `mcp-config`, `secrets-scan`, `skillsup`, `standards-review`, `text-optimize`, `text-human`

#### Updated Files

| File | Change |
|------|--------|
| `README.md` | Added missing skills, fixed doc link text |
| `brewcode/INSTALL.md` | RU -> EN |
| `brewcode/README.md` | RU -> EN |
| `brewcode/docs/commands.md` | RU -> EN |
| `brewcode/docs/file-tree.md` | RU -> EN |
| `brewcode/docs/flow.md` | RU -> EN |
| `brewcode/docs/hooks.md` | RU -> EN |
| `brewcode/grepai.md` | RU -> EN |

---

## [2.15.1] - 2026-02-16

### brewcode
#### Added

- **forced-eval hook** -- auto-skill activation via plugin hooks
  - `hooks/forced-eval.mjs` -- UserPromptSubmit hook (84% skill activation rate)
  - Reminder: `[SKILL?] Check available skills. If one matches this request, use Skill tool before responding.`
  - No manual installation required -- works automatically with plugin

#### Changed

- **skillsup skill** -- removed `setup` mode (hook now in plugin)
  - Modes: `list`, `up`, `create` (was: `list`, `setup`, `up`, `create`)

#### Removed

- `skillsup/scripts/install-hook.sh` -- moved to plugin hooks
- `skillsup/references/forced-eval-hook.mjs` -- moved to plugin hooks
- `setup/references/forced-eval-hook.mjs` -- not needed (plugin hook)
- Phase 5 from setup skill -- hook installation not needed

---

## [2.15.0] - 2026-02-15

### brewcode
#### Changed

- **Distribution** -- plugin renamed `focus-task` -> `brewcode`, marketplace re-registered
  - `repository` URL fixed: `user/` -> `kochetkov-ma/`
  - Added `homepage`, `author.url`, `tags`, `metadata` block to marketplace.json
  - Removed placeholder `owner.email`
- **CLAUDE.md** -- added Distribution section, fixed skills count (10 -> 15)
- **update-plugin.sh** -- fixed path `plugins/brewcode/` -> `brewcode/`
- **claude-plugin-guide skill** -- major update (v2.0.0)
  - Fixed: `agents` field IS supported in plugin.json
  - Added: all 14 hook events, hook types (command/prompt/agent)
  - Added: auto-update, team config, marketplace restrictions
  - Updated: official docs URLs (code.claude.com)

#### Files

- `.claude-plugin/marketplace.json` -- full metadata, correct URLs
- `brewcode/.claude-plugin/plugin.json` -- added homepage, author.url
- `.claude/scripts/update-plugin.sh` -- fixed version path
- `.claude/skills/claude-plugin-guide/SKILL.md` -- v2.0.0
- `CLAUDE.md` -- Distribution section

---

## [2.14.3] - 2026-02-13

### brewcode
#### Changed

- **auto-sync skill** -- excluded managed directories from auto-scan
  - `rules/`, `agents/`, `skills/` no longer scanned in PROJECT/GLOBAL modes
  - Explicit path required: `/brewcode:auto-sync .claude/rules`
  - Prevents unintended mass updates to structured content

#### Files

- `skills/auto-sync/SKILL.md` -- added managed directories documentation
- `skills/auto-sync/scripts/discover.sh` -- added exclusion logic

---

## [2.14.2] - 2026-02-13

### brewcode
#### Changed

- **text-optimize skill** -- description converted to one-line format
  - Matches agent description style: `"Optimizes text/docs for LLM efficiency. Triggers: ..."`
  - Removed multi-line `|` YAML block, replaced with single quoted string

#### Files

- `skills/text-optimize/SKILL.md` -- description field

---

## [2.14.1] - 2026-02-13

### brewcode
#### Changed

- **skill-creator agent** -- description rules tightened
  - ONE line only (no multiline `|` in YAML)
  - 150-300 chars limit (was 1024)
  - Template: `[What it does]. Use when - [scenarios]. Trigger keywords - [keywords].`
  - `Triggers -` section dropped (saves ~80 chars)
  - All examples updated to single-line format
  - Validation checklists updated

#### Files

- `agents/skill-creator.md` -- 10 edits across description rules, template, examples, validation

---

## [2.14.0] - 2026-02-13

### brewcode
#### Added

- **text-optimize rules** -- 4 new rules from multi-agent research (8 parallel agents)
  - S.7: Consistent Terminology -- one term per concept, no synonyms. Source: agent-skills best-practices (official)
  - S.8: One-Level Reference Depth -- no ref chaining A->B->C. Source: agent-skills best-practices (official)
  - P.5: Instruction Order (Anchoring) -- critical constraints first. Source: ACM FAT 2025 (peer-reviewed)
  - P.6: Default Over Options -- recommend one default, exceptions only. Source: agent-skills best-practices (official)
  - 2 new anti-patterns: overloading single prompts, over-focusing on wording
  - Total rules: 27 -> 31 (27 verified, 4 conditional)

#### Changed

- **text-optimizer agent** -- Step 0 validation rewritten
  - Removed Bash `test -f` (agent doesn't have Bash tool)
  - Now uses Read tool + header verification (`## C - Claude Behavior`, `## Summary`)
  - Explicit stop condition if read fails or headers missing
- **text-optimizer agent** -- Step 2 rule ranges updated (S.1-S.8, P.1-P.6)
- **text-optimize SKILL.md** -- Rule ID Quick Reference, ID-to-Rule Mapping, Mode-to-Rules updated for new rules

#### Files

- `skills/text-optimize/references/rules-review.md` -- +4 rules, +2 anti-patterns, +1 source
- `skills/text-optimize/SKILL.md` -- updated tables and mappings
- `agents/text-optimizer.md` -- Step 0 rewrite, Step 2 range update

---

## [2.13.2] - 2026-02-13

### brewcode
#### Fixed

- **skill-creator agent** -- path resolution rules clarified
  - Added `CRITICAL: USE RELATIVE PATHS!` warning
  - Direct calls (Read, Bash in SKILL.md) -> relative paths (`scripts/foo.sh`)
  - Exception: passing path to agent via Task tool -> use `$BC_PLUGIN_ROOT`
  - Table with NEVER / ALWAYS examples

- **skillsup skill** -- fixed absolute paths bug
  - Changed `$BC_PLUGIN_ROOT/skills/skillsup/scripts/...` -> `scripts/...`
  - 3 bash commands now use relative paths

#### Files

- `agents/skill-creator.md` -- Resource Path Resolution section rewritten
- `skills/skillsup/SKILL.md` -- relative paths for bash commands

---

## [2.13.1] - 2026-02-13

### brewcode
#### Changed

- **skill-creator agent** -- invocation type awareness
  - Added `AskUserQuestion` tool for clarifying who invokes skill
  - User-only skills (`disable-model-invocation: true`) get simple one-liner description
  - LLM-invocable skills require full trigger optimization
  - Decision table: user-only vs LLM-only vs both

- **skillsup skill** -- simplified description
  - One-liner description (user-invocable only, no triggers needed)
  - Added `AskUserQuestion` to allowed-tools

#### Files

- `agents/skill-creator.md` -- invocation type section, description optimization split
- `skills/skillsup/SKILL.md` -- simplified frontmatter

---

## [2.13.0] - 2026-02-13

### brewcode
#### Added

- **skillsup skill** -- skill management with 84% activation rate
  - `list` mode: scan global/project/plugin skills as markdown table
  - `setup` mode: install forced-eval hook (UserPromptSubmit) + settings.json
  - `up` mode: improve skills via skill-creator agent (parallel for folders)
  - `create` mode: research (Explore + WebSearch) then create skill
  - Shorthand: `/skillsup <path>` defaults to `up` mode
  - Based on Scott Spence forced-eval technique

#### Files

- `skills/skillsup/SKILL.md` -- main skill with 4 modes
- `skills/skillsup/README.md` -- documentation
- `skills/skillsup/scripts/list-skills.sh` -- scans 3 locations
- `skills/skillsup/scripts/install-hook.sh` -- installs hook + updates settings
- `skills/skillsup/references/forced-eval-hook.mjs` -- UserPromptSubmit hook

---

## [2.12.4] - 2026-02-13

### brewcode
#### Changed

- **skill-creator agent** -- major update for activation reliability
  - Added "Activation Reality" section: 20-50% baseline rate, GitHub issues
  - Added "Criticality Strategy": Critical -> slash command (100%), Important -> optimized (50-72%)
  - Added "Description Optimization": trigger keywords pattern, "Use when:" template
  - Added "Activation Checklist" in validation step
  - Added "Troubleshooting Activation" section with debug steps
  - Updated all examples with optimized descriptions
  - Verified all GitHub issues are OPEN: #10768, #13919, #15136, #9716
  - Removed closed/duplicate issues: #12679, #4182, #17283

#### Sources

- [#10768 - Intent Matching Broken](https://github.com/anthropics/claude-code/issues/10768)
- [#13919 - Context loss](https://github.com/anthropics/claude-code/issues/13919)
- [#15136 - Fails to invoke](https://github.com/anthropics/claude-code/issues/15136)

---

## [2.12.3] - 2026-02-12

### brewcode
#### Changed

- **Skill path normalization** -- all skills now use relative paths
  - Removed unreliable `$FT_PLUGIN` variable (bash isolation issues)
  - Removed non-existent `$CLAUDE_PLUGIN_ROOT` references
  - Removed cache path hacks (`ls -vd ~/.claude/plugins/cache/...`)
  - Skills reference own resources via relative paths: `scripts/`, `references/`

- **Agent path normalization** -- agents use injected `$BC_PLUGIN_ROOT`
  - Removed `{PLUGIN_ROOT}` placeholders from agent docs
  - Agents receive `BC_PLUGIN_ROOT` via pre-task.mjs injection
  - Fixed bc-coordinator.md and bash-expert.md

- **File reorganization** -- templates moved to skill directories
  - `scripts/teardown.sh` -> `skills/teardown/scripts/teardown.sh`
  - `templates/SPEC-creation.md` -> `skills/spec/references/SPEC-creation.md`
  - `templates/*.template` (4 files) -> `skills/setup/templates/`
  - `setup.sh` updated to use new `SETUP_TEMPLATES` path

#### Updated Files

| File | Change |
|------|--------|
| `skills/teardown/SKILL.md` | Relative `scripts/teardown.sh` |
| `skills/text-optimize/SKILL.md` | `$BC_PLUGIN_ROOT` + context instruction |
| `skills/standards-review/SKILL.md` | Relative `references/` paths |
| `skills/grepai/SKILL.md` | Relative paths (13 scripts) + agent context |
| `skills/setup/SKILL.md` | Relative paths (7 scripts) + agent context |
| `skills/spec/SKILL.md` | Agent context instructions |
| `skills/plan/SKILL.md` | Agent context instructions |
| `skills/auto-sync/SKILL.md` | Relative paths + agent context |
| `skills/rules/SKILL.md` | Relative paths + agent context |
| `skills/text-human/SKILL.md` | Agent context instructions |
| `skills/install/SKILL.md` | Relative paths (8 scripts) |
| `skills/setup/scripts/setup.sh` | `SETUP_TEMPLATES` variable |
| `agents/bc-coordinator.md` | `$BC_PLUGIN_ROOT` for templates |
| `agents/bash-expert.md` | `$BC_PLUGIN_ROOT` instructions |

---

## [2.12.2] - 2026-02-12

### brewcode
#### Added

- **skill-creator agent** -- "Resource Path Resolution" section
  - Documents that skills receive base directory at execution
  - Relative paths to resources (references/, scripts/, assets/) resolve automatically

#### Updated Files

| File | Change |
|------|--------|
| `agents/skill-creator.md` | Added Resource Path Resolution section |

---

## [2.12.1] - 2026-02-12

### brewcode
#### Added

- **BC_PLUGIN_ROOT injection** -- plugin root path available to skills and agents
  - `session-start.mjs`: injects `BC_PLUGIN_ROOT` into `additionalContext` for main conversation
  - `pre-task.mjs`: injects `BC_PLUGIN_ROOT` as first injection for ALL subagents
  - Enables skills to reference plugin files: `$BC_PLUGIN_ROOT/skills/text-optimize/references/...`

#### Updated Files

| File | Change |
|------|--------|
| `hooks/session-start.mjs` | `BC_PLUGIN_ROOT` in additionalContext |
| `hooks/pre-task.mjs` | `BC_PLUGIN_ROOT` injection for all agents |
| `docs/hooks.md` | "BC_PLUGIN_ROOT variable" section |
| `CLAUDE.md` | "Plugin Variables" section |

---

## [2.12.0] - 2026-02-11

### brewcode
#### Fixed

- **Skill frontmatter** -- removed invalid `context: session` from 5 skills
  - auto-sync, grepai, spec, plan, start -- now use inline mode (required for Task tool)

- **EXECUTE markers** -- added missing markers to bash blocks
  - auto-sync: 3 blocks in sync phase (Setup INDEX, discover.sh, index-ops.sh)
  - secrets-scan: Phase 1 setup block

- **STOP conditions** -- added after critical bash blocks
  - secrets-scan: `> **STOP if ERROR** -- must run in git repository`

- **text-optimize** -- fixed `subagent_type: "brewcode:text-optimizer"` -> `"text-optimizer"`

#### Added

- **spec/references/SPEC-creation.md** -- parallel research instructions and consolidation rules (125 lines)
- **scripts/teardown.sh** -- restored plugin-level cleanup script

#### Changed

- **spec/SKILL.md** -- references updated to `references/SPEC-creation.md`
- **teardown** -- script moved from skill directory to `brewcode/scripts/`

#### Structure Improvements

| Skill | Before | After |
|-------|--------|-------|
| spec | 78% | 90% |
| auto-sync | 85% | 100% |
| secrets-scan | 71% | 97% |
| teardown | 60% | 90% |

---

## [2.10.0] - 2026-02-11

### brewcode
#### Added

- **Agent documentation enriched** -- 3 agents updated with official plugin-dev content

| Agent | New Sections | Examples |
|-------|--------------|----------|
| `agent-creator.md` | Agent Architect Process (6 steps), System Prompt Patterns (4 archetypes), Color Semantics, Triggering Examples Guide | code-reviewer, test-generator, doc-generator, security-analyzer |
| `skill-creator.md` | Official Six-Step Creation Process, Word Budget (1,500-2,000), Scripts Design guidance | commit, pr-review, codebase-qa, deploy |
| `hook-creator.md` | 10 Hook Patterns (Official), Advanced Techniques (Multi-Stage, State Sharing, Caching), Hook Type Selection, Lifecycle Note | Security Gate, Test Enforcement, Context Injection, Tool Logger |

#### Changed

- **skill-creator.md** -- Creation Process section rewritten to Official Six-Step format
  - Step 2: Plan Reusable Contents (scripts, reference docs, assets)
  - Step 5: Validate and Test with detailed checklist
  - Word budget: 1,500-2,000 words target

#### Sources

- `claude-plugins-official/plugins/plugin-dev/skills/agent-development/`
- `claude-plugins-official/plugins/plugin-dev/skills/skill-development/`
- `claude-plugins-official/plugins/plugin-dev/skills/hook-development/`

---

## [2.9.5] - 2026-02-11

### brewcode
#### Fixed

- **setup SKILL.md Phase 5** -- explicit instructions to use script output verbatim
  - Added CRITICAL warning: DO NOT add agents manually
  - Step 1: clarified output is ready-to-insert content
  - Step 4: must read `/tmp/agents-section.md` and use EXACT content
  - Prevents LLM from ignoring script output and adding internal agents

---

## [2.9.4] - 2026-02-11

### brewcode
#### Changed

- **setup.sh `agents` mode** -- excludes internal plugin agents from listing
  - Internal agents (bc-coordinator, bc-grepai-configurator, bc-knowledge-manager) not shown
  - These agents are only called by the plugin itself, not by users

#### Updated Files

- `skills/setup/scripts/setup.sh` -- INTERNAL_AGENTS filter added

---

## [2.9.2] - 2026-02-11

### brewcode
#### Added

- **setup.sh `agents` mode** -- collects agents for CLAUDE.md update
  - Outputs LLM-optimized table with 3 columns: Name, Scope, Purpose
  - Collects: system agents (hardcoded), global (~/.claude/agents/), plugin (PLUGIN_ROOT/agents/)
  - Purpose truncated to 5 words for token efficiency
- **SKILL.md Phase 5** -- Update Global CLAUDE.md Agents
  - Collects agents via `setup.sh agents`
  - LLM analyzes existing CLAUDE.md to find agent sections
  - User confirmation before replacement
  - Edit-based replacement preserves non-agent content

#### Updated Files

| File | Change |
|------|--------|
| `skills/setup/scripts/setup.sh` | Added `collect_agents()` function, `agents` mode |
| `skills/setup/SKILL.md` | Added Phase 5 with 4 steps |

---

## [2.9.1] - 2026-02-10

### brewcode
#### Fixed

- **hooks.md** -- synchronized handoff entry type documentation
  - `writeHandoffEntry()` uses `"t":"check"` for priority during compactification
  - Documentation incorrectly stated `"t":"info"`

---

## [2.9.0] - 2026-02-10

### brewcode
#### Added

- **bc-rules-organizer agent** -- plugin agent for rules organization
  - Moved from global `~/.claude/agents/rules-organizer.md` to plugin `agents/bc-rules-organizer.md`
  - Added `Bash` tool, `permissionMode: acceptEdits`
  - Aligned table formats with rules skill: `| # | Avoid | Instead | Why |`, `| # | Practice | Context | Source |`
  - Numbered entries, max 20 rows, semantic deduplication, specialized `{prefix}-*.md` files

#### Changed

- **Rules skill -> delegator** -- skill delegates all work to `bc-rules-organizer` agent
  - Removed `context: session` (inline, can spawn agents via Task)
  - `allowed-tools`: `Read, Write, Edit, Glob, Grep, Bash` -> `Read, Bash, Task`
  - Skill handles: mode detection, knowledge preparation, agent spawn
  - Agent handles: extraction, optimization, file creation, validation
- **Removed `rules-organizer` from global agents** -- no longer in system agents list
  - Updated `hooks/lib/utils.mjs`, `templates/brewcode.config.json.template`, `docs/hooks.md`

#### Updated Files

| File | Change |
|------|--------|
| `agents/bc-rules-organizer.md` | NEW -- moved from global, `ft-` prefix, Bash tool |
| `skills/rules/SKILL.md` | Rewrite: thin delegator to bc-rules-organizer |
| `hooks/lib/utils.mjs` | Removed `rules-organizer` from system agents |
| `templates/brewcode.config.json.template` | Removed `rules-organizer` from agents |
| `docs/hooks.md` | Removed `rules-organizer` from default agents |

---

## [2.8.0] - 2026-02-10

### brewcode
#### Added

- **Rules skill enhanced** -- 4 modes for flexible rule management
  - `session` -- Extract from conversation context (default)
  - `file` -- Extract from KNOWLEDGE.jsonl file
  - `prompt` -- Targeted update with instruction (`/brewcode:rules <path> <prompt>`)
  - `list` -- Show all existing rule files
- **Specialized rule files** -- prefix-based rules for domain separation
  - Pattern: `{prefix}-avoid.md`, `{prefix}-best-practice.md`
  - Examples: `test-avoid.md`, `sql-best-practice.md`, `security-avoid.md`
  - Auto-created when prompt mode detects target domain

#### Changed

- **rules.sh** -- added `list_rules()` and `create_specialized()` functions
- **SKILL.md** -- updated `argument_hint: "[mode] [path] [prompt]"`, new mode detection table

#### Updated Files

| File | Change |
|------|--------|
| `skills/rules/SKILL.md` | 4 modes, specialized files docs, prompt mode logic |
| `skills/rules/scripts/rules.sh` | `list_rules()`, `create_specialized()`, updated validation |

---

## [2.7.2] - 2026-02-09

### brewcode
#### Fixed

- **Hook message routing** -- fixed `systemMessage` vs `additionalContext` across 4 hooks
  - `session-start.mjs`: added `systemMessage` with plugin path + session ID for user console
  - `grepai-session.mjs`: moved "USE grepai_search FIRST" from `systemMessage` to `additionalContext`
  - `pre-compact.mjs`: replaced `<ft-handoff>` XML block with short status in `systemMessage`
  - `stop.mjs`: split block `reason` (user) from `additionalContext` (Claude instructions)
- **docs/hooks.md** -- 16 discrepancies fixed via multi-agent verification
  - Removed undocumented session mapping feature (4 references)
  - Fixed post-task timeout: 30s -> 5s (matched hooks.json)
  - Fixed all post-task prompts: `systemMessage` -> `additionalContext`
  - Added PID-file detection for watch/mcp-serve (v2.7.0 feature)
  - Added grepai-reminder 60s throttle documentation
  - Updated role detection patterns (added qa, sdet, auditor, engineer, builder, fixer)
  - Removed `cat` field from KNOWLEDGE.jsonl format (removed in v2.7.0)
  - Fixed TASK.md -> PLAN.md in stop block message and lifecycle diagram

#### Updated Files

| File | Change |
|------|--------|
| `hooks/session-start.mjs` | Added `systemMessage` with plugin path |
| `hooks/grepai-session.mjs` | Reminder -> `additionalContext` |
| `hooks/pre-compact.mjs` | Short status instead of XML block |
| `hooks/stop.mjs` | Split reason/additionalContext |
| `docs/hooks.md` | 16 fixes across all sections |

---

## [2.7.1] - 2026-02-09

### brewcode
#### Fixed

- **Review skill `context: fork` -> `session`** -- review template had `context: fork` which prevents Task tool usage; review is built entirely on parallel agent spawning via Task tool, so `fork` made it non-functional
  - File: `templates/skills/review/SKILL.md.template`

---

## [2.7.0] - 2026-02-09

### brewcode
#### Added

- **docs/ directory** -- 4 comprehensive documentation files extracted from README.md
  - `commands.md`, `file-tree.md`, `flow.md`, `hooks.md` (~166KB total)
- **llm-text-rules.md** -- shared LLM text rules for auto-sync instructions (DRY)
- **HOOKS-REFERENCE.md** -- Claude Code hooks reference (`user/features/`)
- **Security hardening** -- path traversal protection, atomic lock/state writes, bind race detection
  - `validateTaskPath()`, `createLock()` with tmp+rename pattern
  - Lock schema validation with auto-cleanup of corrupted locks
- **Config recursion guard** -- prevents infinite loop in `loadConfig()` via `_loadingConfig` flag
- **Deep merge for nested config** -- `knowledge.validation`, `agents.system` properly merged
- **Grepai reminder throttling** -- max once per 60s via `.grepai/.reminder-ts`
- **PID-file-based process detection** -- `watch.pid`/`mcp-serve.pid` before pgrep fallback
- **Expanded status model** -- `cancelled`, `error` statuses in bc-coordinator; `handoff` at init
- **Handoff-after-compact context** -- session-start injects re-read instruction on compact source
- **Teardown confirmation** -- `AskUserQuestion` prompt for non-dry-run teardown
- **`<instructions>` tags** -- added to spec, plan, start SKILL.md for proper skill boundaries

#### Changed

- **README.md rewritten** -- 836 -> 101 lines; detailed docs moved to `docs/`
- **KNOWLEDGE.jsonl schema simplified** -- removed `cat` (category) and `scope` fields
- **MANIFEST.md eliminated** -- all references removed from coordinator, templates, hooks
- **Scope-aware retention removed** -- flat `maxEntries=100` replaces global:50/task:20 split
- **Compact threshold** -- 50% -> 80% of maxEntries
- **Hook output routing** -- multiple hooks switched to `hookSpecificOutput.additionalContext`
- **SessionStart hooks split** -- session-start.mjs and grepai-session.mjs run independently
- **Phase detection improved** -- h2/h3 support, excludes verification phases, checkbox counting
- **Constraint injection expanded** -- ALL constraints for every non-system agent; expanded role regex
- **Shell script hardening** -- `set -euo pipefail`, `command -v` replacing `which`, curl timeouts
- **bc-coordinator** -- simplified status updates, removed MANIFEST, `cat` field removed
- **bc-knowledge-manager** -- removed scope/categories, dedup key 100 chars, maxEntries 100
- **Config simplified** -- removed `autoCompactThreshold`, `retention`, `stop.maxAttempts`
- **PLAN.md.template** -- simplified metadata, added `r` (R&D) iteration type, removed MANIFEST
- **SPEC.md.template** -- added Scope section, simplified headers
- **Rule templates** -- removed `description:` from YAML frontmatter
- **package.json** -- version synced to 2.7.0, author name corrected
- **install.sh** -- `|| true` for version extractions, `mktemp` for temp files

#### Fixed

- **Config recursion infinite loop** -- `log -> shouldLog -> getLogLevel -> loadConfig -> log`
- **Config cache never populated** -- `cachedConfigCwd` placed after unreachable validation
- **Shallow config merge** -- nested keys (`knowledge.validation`, `agents.system`) lost
- **Lock bind race condition** -- atomic tmp+rename with ownership verification
- **State file corruption** -- `saveState()` now uses atomic writes
- **Path traversal in TASK.md** -- rejects `..`, anchors regex
- **stop.mjs crash** -- `typeof` guard on `session_id`, error handler cleans lock
- **stop.mjs references TASK.md** -- corrected to PLAN.md
- **pre-compact null task** -- added null check for `parseTask()` return
- **install.sh pipeline failures** -- `|| true` prevents silent exits under `set -euo pipefail`
- **grepai index error swallowed** -- now reports "error" and logs warning

#### Removed

- **`templates/hooks/grepai-session.mjs.template`** -- built-in hook replaces template
- **`templates/reports/MANIFEST.md.template`** -- MANIFEST concept removed
- **`templates/review-report.md.template`** -- review reporting simplified
- **6 exported functions** -- `extractStatus`, `findCurrentPhase`, `writeSessionInfo`, `getTaskDirFromSession`, `classifyScope`, `appendKnowledgeValidated`
- **`cat`/`scope` fields** from KNOWLEDGE.jsonl schema
- **Config keys** -- `autoCompactThreshold`, `retention`, `stop.maxAttempts`, `removeOrphansAfterDays`
- **`.claude/tasks/specs/` directory** creation in setup.sh

#### Breaking Changes

- KNOWLEDGE.jsonl: `cat` and `scope` fields no longer written (existing entries tolerated)
- MANIFEST.md no longer created/maintained
- 6 functions removed from public API (validateEntry, classifyScope, etc.)
- `getReportsDir()` signature: `cwd` parameter removed

---

## [2.6.0] - 2026-02-08

### brewcode
#### Added

- **2-stage creation flow** -- `spec` -> `plan` (replaces monolithic `create`)
  - `/brewcode:spec` -- Creates SPEC through research + AskUserQuestion interaction
  - `/brewcode:plan` -- Creates PLAN from SPEC or Plan Mode file with user approval
  - `/brewcode:create` -- **Removed** (use `spec` + `plan` separately)
- **User interaction during creation** -- AskUserQuestion for clarifying scope, validating decisions
- **Task directory structure** -- All task files grouped in `{TS}_{NAME}_task/` directory
- **Session mapping** -- `sessions/{session_id}.info` for O(1) task lookup
- **Per-task lock** -- `.lock` inside task directory (was global `cfg/.brewcode.lock`)

#### Breaking Changes

- Task files moved from flat `.claude/tasks/` to `.claude/tasks/{TS}_{NAME}_task/`
- `TASK.md` renamed to `PLAN.md`
- SPEC moved from `specs/` to task directory
- `KNOWLEDGE.jsonl` moved to task directory
- Reports directory renamed to `artifacts/` inside task directory
- Phase directory naming: `phase_{P}/iter_{N}_{type}/` -> `{P}-{N}{T}/`
- `TASK.md.template` renamed to `PLAN.md.template`

#### Updated Files

| File | Change |
|------|--------|
| `skills/spec/SKILL.md` | NEW -- spec creation skill (7-step workflow) |
| `skills/plan/SKILL.md` | NEW -- plan creation skill (dual input: SPEC/Plan Mode) |
| `skills/create/` | **Removed** (replaced by spec + plan) |
| `templates/PLAN.md.template` | NEW -- renamed from TASK.md.template |
| `templates/SPEC.md.template` | Rewrite: analytical format (91 -> 42 lines) |
| `templates/SPEC-creation.md` | Updated paths and section names |
| `hooks/lib/utils.mjs` | Major refactor: 5 new functions, per-task lock |
| `hooks/pre-compact.mjs` | Compact phase dirs, artifacts/ |
| `hooks/stop.mjs` | Per-task lock path |
| `hooks/session-start.mjs` | Session mapping |
| `hooks/pre-task.mjs` | Absolute path fix for knowledge |
| `agents/bc-coordinator.md` | Artifacts paths, PLAN.md refs |
| `agents/bd-auto-sync-processor.md` | Artifacts path |
| `templates/reports/MANIFEST.md.template` | **Removed** |
| `templates/reports/FINAL.md.template` | Artifacts index |
| `templates/instructions-template.md` | Full path migration |
| `templates/rules/post-agent-protocol.md.template` | Path glob fix |
| `skills/start/SKILL.md` | PLAN.md, artifacts paths |
| `skills/setup/SKILL.md` | PLAN.md.template refs |
| `skills/setup/scripts/setup.sh` | PLAN.md.template sync |
| `skills/teardown/SKILL.md` | Task dir structure |
| `skills/teardown/teardown.sh` | Task dir references |
| `README.md` | Full path migration (20+ refs) |

#### Migration

Existing tasks are not automatically migrated. New tasks use the new structure.
Run `/brewcode:setup` to update adapted templates.

---

## [2.5.0] - 2026-02-08

### brewcode
#### Changed

- **Auto-sync INDEX v2** -- simplified from 8 fields to 4 (`p`, `t`, `u`, `pr`)
  - Removed: `m` (mtime), `h` (hash), `v` (version), `s` (status)
  - Dates: ISO8601 -> `YYYY-MM-DD`
  - Protocol values: `default`/`custom` -> `default`/`override`
  - New type: `config` (for `CLAUDE.md` files)
- **Auto-sync instructions system** -- type-specific sync instructions
  - New: `instructions/sync-{skill,agent,doc,rule,config}.md` -- per-type verification checklists and research directions
  - Processor loads instructions dynamically instead of hardcoded logic
  - `<auto-sync-protocol>` -> `<auto-sync-override>` with 3 fields: `sources`, `focus`, `preserve`
- **Auto-sync SKILL.md rewrite** -- simplified phases, added `-o`/`--optimize` flag
  - `context: fork` -> `context: session` (access to conversation context)
  - Added `Skill` to allowed-tools
  - INIT mode simplified (no custom protocol prompt generation)
- **bd-auto-sync-processor rewrite** -- 364 -> 135 lines (-63%)
  - Removed `Task` tool dependency -- direct Glob/Grep/Read/WebFetch calls
  - Loads per-type instruction files for verification checklist
  - Model: opus -> sonnet
- **bc-coordinator: inline compaction** -- removed `Task` tool from agent tools
  - Auto-compact now inline: read -> dedupe -> sort -> trim -> write
  - No longer spawns bc-knowledge-manager for compaction
- **bc-grepai-configurator: direct tool calls** -- removed `Task` tool dependency
  - Phase 2: Explore agents -> direct Glob/Grep/Read calls
- **Skills context: `fork` -> `session`** -- auto-sync, create, grepai skills now run in session context
- **detect-mode.sh: FLAGS support** -- 3-field output `MODE|ARG|FLAGS`, `-o`/`--optimize` flag
- **index-ops.sh simplified** -- removed `query`, `hash`, `mtime` commands; added `threshold_date` helper; macOS/Linux date compatibility
- **Review skill: Critic mode** -- new `-c`/`--critic` flag for Devil's Advocate phase
  - Phase 5.5 Critic + Phase 5.75 DoubleCheck Critic
  - P0 priority for verified critic findings
  - Auto-enable via keywords: critic
  - Visual ASCII workflow diagrams in README

#### Added

- `skills/auto-sync/instructions/` -- 5 type-specific instruction files
- `autoSync` config section -- `intervalDays`, `retention`, `optimize`, `parallelAgents`
- Validation for `autoSync` numeric fields in `utils.mjs`

#### Fixed

- **Agent name typo** -- `prompt-optimizer` -> `text-optimizer` in config and hooks
- **Removed stale PROTOCOL_REMINDER** -- pre-agent priming string removed from `pre-task.mjs`

#### Removed

- `skills/auto-sync/references/doc-types.md` (replaced by instructions/)
- `skills/auto-sync/references/protocol-default.md` (replaced by instructions/)
- `user/CLAUDE-CODE-RELEASES-2025-2026.md`
- `user/CLAUDE-CODE-TASK-MANAGER-GUIDE.md`
- `user/CONTEXT-INJECTION-GUIDE.md`

#### Updated Files

| File | Change |
|------|--------|
| `skills/auto-sync/SKILL.md` | Rewrite: simplified phases, `-o` flag, `context: session` |
| `skills/auto-sync/README.md` | Updated to match new INDEX format and override block |
| `skills/auto-sync/scripts/detect-mode.sh` | 3-field output with FLAGS |
| `skills/auto-sync/scripts/discover.sh` | Updated type detection |
| `skills/auto-sync/scripts/index-ops.sh` | Simplified commands, date compat |
| `agents/bd-auto-sync-processor.md` | Rewrite: direct tools, instruction loading |
| `agents/bc-coordinator.md` | Inline compaction, removed Task tool |
| `agents/bc-grepai-configurator.md` | Direct tool calls, removed Task tool |
| `hooks/lib/utils.mjs` | `autoSync` config, agent name fix |
| `hooks/pre-task.mjs` | Removed PROTOCOL_REMINDER |
| `skills/create/SKILL.md` | `context: fork` -> `session` |
| `skills/grepai/SKILL.md` | `context: fork` -> `session` |
| `templates/auto-sync/INDEX.jsonl.template` | 4-field format |
| `templates/brewcode.config.json.template` | `autoSync` section |
| `templates/skills/review/SKILL.md.template` | Critic phase, argument-hint |
| `templates/skills/review/references/agent-prompt.md` | Critic prompt |
| `templates/skills/review/references/report-template.md` | P0 priority section |
| `README.md` | Critic mode docs, workflow diagrams |

---

## [2.4.1] - 2026-02-06

### brewcode
#### Fixed
- **C1: Role detection false positive** -- `name.includes('arch')` -> `name.includes('architect')` in `pre-task.mjs`
  - "search", "research", "archive" no longer misclassified as DEV role
- **C2: INIT casing bug** -- sed now strips first word unconditionally (was `[Ii]nit` only)
  - `INIT path.md` and `iNiT path.md` now correctly output `INIT|path.md`
- **H1: Stale `/brewcode:doc` in CLAUDE.md** -- replaced with `/brewcode:auto-sync`
- **H2: Phantom `sync` mode in description** -- replaced with actual 6 modes
- **M1: Bare `init` error** -- `detect-mode.sh` now exits with error for `init` without path
- **M2: Phase ordering** -- STATUS/INIT phases moved before Phase 1 Setup in SKILL.md
- **M3: Agent count** -- README.md updated to 4 agents (added bd-auto-sync-processor)
- **M4: Historical accuracy** -- [2.3.0] modes list shows original values with note
- **M5: `ARGS_HERE` placeholder** -- replaced with `$ARGUMENTS` in SKILL.md
- **L1: Dead code** -- collapsed identical if/else FILE detection branches
- **L2: discover.sh JSON bug** -- replaced pipe subshell with sed (comma separator fix)
- **L3: Invalid hex hash** -- `d4e5f6g7` -> `d4e5f607` in INDEX.jsonl.template
- **L4: Related docs** -- added auto-sync skill and bd-auto-sync-processor agent links

---

## [2.4.0] - 2026-02-06

### brewcode
#### Changed
- **Auto-sync modes** -- removed CREATE mode, added STATUS + INIT
  - Removed: `create skill`, `create agent`, `create doc` modes
  - Added: `status` -- diagnostic report of INDEX state + non-indexed files
  - Added: `init <path> [prompt]` -- add auto-sync tag + custom protocol to existing document
  - INIT supports LLM-optimized `<auto-sync-protocol>` block generation
  - Phases renumbered: 6 -> 5 (CREATE phase removed)
  - Modes: `status`, `init`, `global`, `project` (default), `file`, `folder`

#### Updated Files

| File | Change |
|------|--------|
| `skills/auto-sync/SKILL.md` | Removed Phase 2 CREATE, added STATUS + INIT phases, renumbered |
| `skills/auto-sync/scripts/detect-mode.sh` | Removed CREATE detection, added STATUS + INIT |
| `skills/auto-sync/README.md` | Updated docs, flow diagram, phase numbering |
| `README.md` | Updated auto-sync description and mode table |
| `RELEASE-NOTES.md` | Updated modes list |

---

## [2.3.1] - 2026-02-05

### brewcode
#### Changed
- **Auto-tagging** -- `/brewcode:auto-sync` adds `auto-sync: enabled` to .md files
  - PROJECT/FOLDER/GLOBAL modes find ALL .md files and tag them
  - SKILL.md/agent.md -> YAML frontmatter
  - Other .md -> `<!-- auto-sync:enabled -->` after title
  - No manual migration required

---

## [2.3.0] - 2026-02-05

### brewcode
#### Features
- **KILLER FEATURE**: `/brewcode:auto-sync` - Universal documentation system
  - Replaces `/brewcode:doc`
  - Modes (v2.3.0): `create skill|agent|doc`, `sync`, `global`, `project`, `path` (CREATE removed in 2.4.0)
  - LLM-optimized JSONL INDEX for tracking documents
  - Auto-detects document types (skill, agent, doc, rule)
  - Parallel processing with `bd-auto-sync-processor` agent
  - Custom protocols via `<auto-sync-protocol>` block
  - Stale detection (7 days threshold)

#### Added
- `bd-auto-sync-processor` agent for document processing
- INDEX.jsonl.template for tracking synced documents
- Scripts: `discover.sh`, `index-ops.sh`, `detect-mode.sh`
- References: `protocol-default.md`, `doc-types.md`

#### Removed
- `/brewcode:doc` skill (replaced by `/brewcode:auto-sync`)

#### Migration
If you were using `/brewcode:doc`, use `/brewcode:auto-sync` instead:
- `/brewcode:doc update` -> `/brewcode:auto-sync`
- `/brewcode:doc sync` -> `/brewcode:auto-sync`

---

## v2.2.0 (2026-02-04)

### brewcode
#### Added

- **Role-based constraint injection** -- auto-injection of constraints into agent prompts
  - New tags in TASK.md: `<!-- ALL -->`, `<!-- DEV -->`, `<!-- TEST -->`, `<!-- REVIEW -->`
  - `pre-task.mjs`: role detection by agent name (developer->DEV, tester->TEST, reviewer->REVIEW)
  - Constraints injected at prompt start before execution

- **Knowledge validation** -- filter useless entries
  - Blocklist: "Working on...", "Let me...", "Looks good", "Phase N", etc.
  - Min 15 chars, technical density check
  - `validateEntry()`, `appendKnowledge()` (with validation)

- **Scope-aware retention** -- separate global/task storage
  - Auto-classification: avoids->global, handoff->task, arch/config/api->global
  - Compaction retains: global:50, task:20 entries

#### Changed

| File | Change |
|------|--------|
| `TASK.md.template` | Added Role Constraints section with examples |
| `brewcode.config.json.template` | `knowledge.validation`: enabled, blocklist, densityCheck; `knowledge.retention`: global:50, task:20; `constraints.enabled`: true |

#### Updated Files

| File | Change |
|------|--------|
| `hooks/pre-task.mjs` | Role detection, constraint injection |
| `hooks/lib/knowledge.mjs` | validateEntry, appendKnowledge, localCompact |
| `templates/TASK.md.template` | Role Constraints section |
| `templates/brewcode.config.json.template` | validation, retention, constraints |
| `agents/bc-coordinator.md` | Updated for constraints |
| `agents/bc-knowledge-manager.md` | Scope documentation |

---

## v2.1.2 (2026-02-02)

### brewcode
#### Changed

- **Review skill consolidation** -- removed duplicate, kept only template
  - Removed: `skills/review/` (static version)
  - Kept: `templates/skills/review/SKILL.md.template` (generated)
  - Added: `templates/skills/review/references/` (agent-prompt.md, report-template.md)
  - Updated: SKILL.md.template (+quorum algorithm, matching/merge rules, DoubleCheck prompt, error handling)
  - Updated: setup.sh (copies references/)
  - Updated: README.md (link to template)

---

## v2.1.1 (2026-02-01)

### brewcode
#### Fixed

- **Agent triggers YAML** -- replaced `Trigger:` with `Triggers -` in agent descriptions
  - bc-coordinator.md, bc-knowledge-manager.md
  - Colon in value broke YAML parsing

---

## v2.1.0 (2026-02-01)

### brewcode
#### Changed

- **Documentation sync** -- major documentation update
  - README.md: PostToolUse hook, NEXT ACTION protocol, hook matrix (7 hooks)
  - CLAUDE.md: hook documentation, skill namespacing table
  - grepai.md: line refs, timeout info
  - user/coordinator.md: complete rewrite with NEXT ACTION

- **Template namespacing** -- skill names in templates
  - `templates/skills/review/SKILL.md.template`: `brewcode:review`
  - `templates/review-report.md.template`: `brewcode:review`

- **Protocol terminology** -- unified `WRITE report -> CALL bc-coordinator`

#### Updated Files

| File | Change |
|------|--------|
| `README.md` | PostToolUse, NEXT ACTION, hook matrix |
| `grepai.md` | line refs `:24`, timeout `(1s)` |
| `templates/skills/review/SKILL.md.template` | `name: brewcode:review` |
| `templates/review-report.md.template` | `brewcode:review` footer |
| `skills/review/references/report-template.md` | `brewcode:review` |
| `CLAUDE.md` (root) | 7 hooks documentation |

---

## v2.0.73 (2026-02-01)

### brewcode
#### Changed

- **Skill namespacing** -- added remaining skills
  - `create` -> `brewcode:create`
  - `doc` -> `brewcode:doc`

#### Updated Files

| File | Change |
|------|--------|
| `skills/create/SKILL.md` | name: `brewcode:create` |
| `skills/doc/SKILL.md` | name: `brewcode:doc` |

---

## v2.0.72 (2026-02-01)

### brewcode
#### Changed

- **Skill namespacing** -- unified skill names with namespace `brewcode:`
  - `review` -> `brewcode:review`
  - `rules` -> `brewcode:rules`
  - `start` -> `brewcode:start`
- **Skill descriptions** -- formatting
  - Removed colons after "Triggers" in all skills
  - Simplified argument-hint for `doc` and `rules`

#### Updated Files

| File | Change |
|------|--------|
| `skills/review/SKILL.md` | name: `brewcode:review` |
| `skills/rules/SKILL.md` | name: `brewcode:rules`, argument-hint |
| `skills/start/SKILL.md` | name: `brewcode:start` |
| `skills/create/SKILL.md` | triggers formatting |
| `skills/doc/SKILL.md` | triggers formatting, argument-hint |

---

## v2.0.71 (2026-02-01)

### brewcode
#### Fixed

- **Skill argument hints** -- improved argument hints
  - `doc`: description lists modes `Modes - create, update, analyze, sync, all`
  - `doc`: argument-hint simplified to `[create|update|analyze|sync] <path>`
  - `rules`: argument-hint shows session mode `[<path>] (empty = session mode)`

#### Updated Files

| File | Change |
|------|--------|
| `skills/doc/SKILL.md` | description + argument-hint |
| `skills/rules/SKILL.md` | argument-hint |

---

## v2.0.68 (2026-02-01)

### brewcode
#### Fixed

- **skills/install/SKILL.md** -- Output Rules for correct display
  - Added Output Rules section: show FULL output, preserve tables
  - Each phase has `-> Show:` and `-> Explain:` hints
  - Phase 5 skipped if grepai already installed

---

## v2.0.67 (2026-02-01)

### brewcode
#### Fixed

- **Plugin installation** -- version bump to apply pending changes from v2.0.66

---

## v2.0.66 (2026-02-01)

### brewcode
#### Changed

- **skills/install/SKILL.md** -- token optimization (-42%)
  - Added triggers: "install brewcode", "setup prerequisites"
  - Replaced verbose JSON with compact tables
- **skills/install/scripts/install.sh** -- improved summary
  - New format: `| Component | Status | Installed | Latest |`
  - Shows installed AND latest available version
  - Logs performed actions (Actions Performed)
  - Helper functions: `log_action()`, `clear_actions()`

#### Removed

- **skills/install/scripts/** -- removed 8 duplicate scripts (all in install.sh)

---

## v2.0.65 (2026-02-01)

### brewcode
#### Added

- **skills/install** -- new interactive plugin installer
  - Single script `install.sh` with parameters (state, required, grepai, etc.)
  - AskUserQuestion for optional components (ollama, grepai)
  - Required timeout symlink with confirmation
  - Helper functions: `ollama_running()`, `wait_for_ollama()`, `get_grepai_versions()`

#### Fixed

| File | Fix |
|------|-----|
| `grepai/upgrade.sh` | `grepai --version` -> `grepai version` |
| `grepai/infra-check.sh` | `grepai --version` -> `grepai version` |
| `bc-grepai-configurator.md` | `grepai --version` -> `grepai version` |

- **install.sh** -- security & reliability fixes:
  - curl with `--connect-timeout 2 --max-time 5`
  - `NONINTERACTIVE=1` for Homebrew
  - Retry loop for ollama start (10 attempts)
  - Guard for `ollama list` (check `command -v ollama`)
  - Symlink safety check (do not overwrite regular files)
  - Version fallback `${VER:-unknown}`

#### Changed

- **grepai skill** -- removed `install` mode, now separate skill `/install`
- **detect-mode.sh** -- removed `install` mode from grepai

---

## v2.0.64 (2026-02-01)

### brewcode
#### Fixed

- **grepai-reminder.mjs** -- added async/stdin pattern
  - Reads `input.cwd` from stdin instead of `process.cwd()`
  - Added try/catch with `output({})` on errors
  - Consistency with other hooks (grepai-session, pre-task)

- **grepai-session.mjs** -- added MCP server check
  - New function `checkMcpServer()` checks `grepai mcp-serve`
  - `additionalContext` injected only if MCP server available
  - Prevents useless grepai_search calls

- **mcp-check.sh** -- 4 security/reliability fixes
  - `mkdir -p` before creating settings.json
  - `trap 'rm -f "$TMP_FILE"' EXIT` for temp file cleanup
  - Path injection fix: path via `os.environ['SETTINGS_FILE']`
  - JSON validation after each write

- **create-rule.sh** -- fallback frontmatter fix
  - `globs:` -> `paths:` (Claude Code format)
  - Removed `alwaysApply:` (Cursor-only field)

- **grepai.md** -- documentation frontmatter fix
  - 3 places: `globs:` -> `paths:`, `alwaysApply:` -> removed

- **SKILL.md** -- simplified ARGS instruction
  - Removed confusing `ARGS_HERE` placeholder
  - Direct use of `$ARGUMENTS`

#### Changed

- **All 12 grepai scripts** -- added `set -euo pipefail`
  - detect-mode.sh, infra-check.sh, init-index.sh, start.sh, stop.sh
  - reindex.sh, optimize.sh, upgrade.sh, status.sh, verify.sh
  - create-rule.sh, mcp-check.sh

---

## v2.0.63 (2026-02-01)

### brewcode
#### Changed

- **pre-task.mjs** -- removed `systemMessage` from UI
  - grepai reminder and knowledge injection in agent prompts works as before
  - Logging to `brewcode.log` preserved
  - UI no longer shows "brewcode: grepai: injected"

---

## v2.0.62 (2026-02-01)

### brewcode
#### Changed

- **create-rule.sh** -- grepai rule always rewritten from template
  - Removed file existence check
  - Each `/brewcode:grepai setup` updates rule to current version

---

## v2.0.61 (2026-02-01)

### brewcode
#### Fixed

- **pre-task.mjs** -- grepai reminder injected for ALL agents
  - Previously Explore, Plan, Bash, etc. were in system agents list -> skipped
  - Now: grepai reminder -> ALL agents, knowledge injection -> only non-system
  - Fixed syntax (unclosed if block)

---

## v2.0.60 (2026-02-01)

### brewcode
#### Fixed

- **pre-task.mjs** -- critical JSON structure fix
  - `updatedInput` moved inside `hookSpecificOutput` (per docs)
  - Added `permissionDecision: 'allow'` to apply changes
  - Without this fix, injection into agent prompts did NOT work

---

## v2.0.59 (2026-02-01)

### brewcode
#### Fixed

- **Hooks use correct fields** -- fixed per Claude Code docs
  - `systemMessage` -> shown to user
  - `additionalContext` -> goes to Claude context
  - For agents: reminder injected in `updatedInput.prompt`
- **grepai-session.mjs** -- `hookSpecificOutput.additionalContext` for SessionStart
- **grepai-reminder.mjs** -- `hookSpecificOutput.additionalContext` for PreToolUse Glob/Grep
- **pre-task.mjs** -- reminder in agent prompt (not in parent's additionalContext)

---

## v2.0.58 (2026-02-01)

### brewcode
#### Changed

- **grepai reminder everywhere** -- single imperative message
  - `grepai: USE grepai_search FIRST for code exploration`
- **grepai-session.mjs** -- reminder at session start (when grepai ready)
- **pre-task.mjs** -- reminder for ALL agents (Explore, developer, etc.)
- **grepai-reminder.mjs** -- strengthened: `consider` -> `USE FIRST`
- **create-rule.sh** -- adds Code Search section to project CLAUDE.md

---

## v2.0.57 (2026-02-01)

### brewcode
#### Changed

- **grepai-reminder.mjs** -- systemMessage instead of console.log
  - Claude now sees reminder in context
  - Message: `grepai MCP available -- consider FIRST!`

---

## v2.0.56 (2026-02-01)

### brewcode
#### Changed

- **mcp-check.sh** -- automatic `allowedTools` setup for grepai
  - Adds `mcp__grepai__*` to `~/.claude/settings.json`
  - Removes `[destructive]` prompts for read-only tools
- **grepai-first.md.template** -- shortened and improved
  - Removed duplication with MCP descriptions
  - Added inline call->response examples
  - Reference to MCP: "Params -> MCP descriptions"
- **status.sh, verify.sh** -- show Permissions status

#### Updated Files

| File | Change |
|------|--------|
| `skills/grepai/scripts/mcp-check.sh` | allowedTools auto-config |
| `skills/grepai/scripts/status.sh` | Permissions status |
| `skills/grepai/scripts/verify.sh` | Permissions check |
| `skills/grepai/SKILL.md` | Phase 2 docs |
| `templates/rules/grepai-first.md.template` | inline examples, no MCP duplication |

---

## v2.0.55 (2026-01-31)

### brewcode
#### Changed

- **setup.sh** -- `grepai-first.md` synced on every setup
  - Uses `sync_template` (updates if changed)
  - No manual deletion needed for updates

#### Updated Files

| File | Change |
|------|--------|
| `skills/setup/scripts/setup.sh` | sync grepai-first.md on setup |

---

## v2.0.54 (2026-01-31)

### brewcode
#### Changed

- **grepai-first.md.template** -- complete rewrite
  - Tools table with params `limit?`, `compact?`
  - `<examples>` with JSON responses for search/callers/graph
  - Table `limit + compact` -> response -> workflow
  - Removed obvious content (Grep/Glob -- Claude knows)

#### Updated Files

| File | Change |
|------|--------|
| `templates/rules/grepai-first.md.template` | search types, compact mode, examples |

---

## v2.0.53 (2026-01-31)

### brewcode
#### Added

- **grepai-reminder hook** -- PreToolUse hook for Glob/Grep tools
  - Reminds Claude to prefer `grepai_search` when `.grepai/` exists
  - Debug logging via `log()` utility
  - Non-blocking (exit 0), soft reminder only

#### Updated Files

| File | Change |
|------|--------|
| `hooks/grepai-reminder.mjs` | New hook script |
| `hooks/hooks.json` | Added PreToolUse matcher for `Glob\|Grep` |

---

## v2.0.52 (2026-01-31)

### brewcode
#### Fixed

- **grepai indexing uses `grepai watch`** -- `grepai init` does NOT build index, only creates config
  - `reindex.sh`: complete rewrite -- uses `grepai watch`, polls for "Initial scan complete"
  - `init-index.sh`: rewritten -- uses `grepai watch`, skips if index exists
  - Added .grepai directory validation to init-index.sh
  - Dynamic timeouts based on file count (2 min to 60 min)

#### Changed

- **Log paths** -- all scripts use `.grepai/logs/grepai-watch.log`
- **Documentation** -- updated SKILL.md and bc-grepai-configurator.md with correct `grepai watch` references

#### Updated Files

| File | Change |
|------|--------|
| `skills/grepai/scripts/reindex.sh` | Complete rewrite for `grepai watch` |
| `skills/grepai/scripts/init-index.sh` | Rewritten with validation |
| `skills/grepai/SKILL.md` | Updated log paths, watch references |
| `agents/bc-grepai-configurator.md` | Updated Phase 5, troubleshooting |

---

## v2.0.51 (2026-01-31)

### brewcode
#### Fixed

- **reindex.sh index.gob wait** -- wait up to 30s for index.gob after watch starts
  - Fixes race condition where "index.gob missing" shown before watch creates it
  - Shows progress: "Waiting for index.gob (watch is building)..."

---

## v2.0.50 (2026-01-31)

### brewcode
#### Fixed

- **grepai indexing synchronous** -- scripts wait for `grepai init` to complete before starting watch
  - `init-index.sh`: runs init synchronously with `tee` to log, then starts watch
  - `reindex.sh`: same fix -- waits for init, logs to `.grepai/logs/grepai-init.log`
  - `SKILL.md`: updated warnings to reflect synchronous behavior
  - `bc-grepai-configurator.md`: updated Phase 5 indexing notes

#### Changed

- **Log output** -- init progress goes to `.grepai/logs/grepai-init.log` with timestamps
- **Duration tracking** -- scripts show actual indexing time on completion

#### Updated Files

| File | Change |
|------|--------|
| `skills/grepai/scripts/init-index.sh` | Synchronous init with logging |
| `skills/grepai/scripts/reindex.sh` | Synchronous init with logging |
| `skills/grepai/SKILL.md` | Updated async->sync warnings |
| `agents/bc-grepai-configurator.md` | Updated Phase 5 notes |

---

## v2.0.49 (2026-01-31)

### brewcode
#### Added

- **grepai gitignore docs** -- documented gitignore behavior and limitations
  - `bc-grepai-configurator.md`: new "## gitignore Behavior" section
  - Explains 3 layers: global gitignore -> local -> config.yaml `ignore:`
  - Workarounds table, diagnostic commands
  - Updated Phase 2 agent #5 to check global gitignore

- **grepai indexing time estimates** -- scripts show file count and ETA
  - `init-index.sh`: counts files, shows ETA, background indexing notice
  - `reindex.sh`: same improvements
  - `status.sh`: shows "indexing in progress" from log activity
  - `SKILL.md`: warnings after Phase 4 and reindex mode
  - `bc-grepai-configurator.md`: indexing time table in Phase 5

#### Changed

- **grepai-first.md** -- added Limitations section (gitignore behavior)
- **CLAUDE.md** -- added "### Limitations (gitignore)" in grepai section

#### Updated Files

| File | Change |
|------|--------|
| `agents/bc-grepai-configurator.md` | gitignore docs, indexing time table |
| `skills/grepai/SKILL.md` | async indexing warnings |
| `skills/grepai/scripts/init-index.sh` | file count, ETA, progress commands |
| `skills/grepai/scripts/reindex.sh` | file count, ETA, progress commands |
| `skills/grepai/scripts/status.sh` | indexing progress detection |
| `.claude/rules/grepai-first.md` | gitignore limitations |
| `CLAUDE.md` | gitignore limitations |

---

## v2.0.47 (2026-01-31)

### brewcode
#### Removed

- **Symlinks** -- removed all symlink-related functionality
  - Claude Code fixed plugin skill display ([#18949](https://github.com/anthropics/claude-code/issues/18949))
  - Removed Phase 5 (Enable Autocomplete) from `/brewcode:setup`
  - Removed `link` mode from setup skill
  - Removed symlink creation from `setup.sh`
  - Removed symlink removal from `/brewcode:teardown`

#### Changed

- **Skill triggers** -- updated to colon syntax
  - `/brewcode-*` -> `/brewcode:*` (plugin namespace)
  - `brewcode-review` directory remains for project-local skill

#### Updated Files

| File | Change |
|------|--------|
| `skills/setup/SKILL.md` | Removed Phase 5, link mode, symlink output |
| `skills/setup/scripts/setup.sh` | Removed `symlinks` mode and functions |
| `skills/teardown/SKILL.md` | Removed symlink mentions |
| `skills/teardown/teardown.sh` | Removed symlink removal loop |
| `skills/review/SKILL.md` | Updated trigger to `:review` |
| `skills/doc/SKILL.md` | Updated trigger to `:doc` |
| `agents/bc-coordinator.md` | Updated skill references |
| `templates/instructions-template.md` | Updated all skill references |
| `README.md` | Removed symlink references, updated examples |
| `CLAUDE.md` | Updated `/brewcode:setup` description |

---

## v2.0.46 (2026-01-31)

### brewcode
#### Fixed

- **status.sh** -- version detection for grepai CLI
  - Fixed: `grepai version` (subcommand) instead of `--version` (flag)
  - Fixed: macOS compatibility (removed `timeout` command)
  - Shows: `grepai: v0.25.0 (brew: v0.24.1)`

---

## v2.0.45 (2026-01-31)

### brewcode
#### Added

- **grepai skill** -- `upgrade` mode for CLI updates via Homebrew
  - `scripts/upgrade.sh` -- version check + brew upgrade
  - Keywords: upgrade, brew
- **status.sh** -- version comparison (current vs latest)
  - Shows `v0.23.0 (v0.24.0 available)` when outdated

#### Changed

- **bc-grepai-configurator** -- optimized for LLM (-32% tokens)
  - Fixed MCP paths (`~/.claude.json` instead of `~/.claude/mcp.json`)
  - Added `compact` param to `grepai_trace_graph`
  - Added MCP Integration phase (Phase 4)
- **grepai-first.md.template** -- improved clarity
  - Fixed `--compact` syntax (was `compact:true`)
  - Added WebSearch row to decision table
  - Removed unverified "3-7 words" guideline
- **grepai-session.mjs** -- Windows compatibility
  - Added platform check for `pgrep` (macOS/Linux only)
  - Documented limitation in header comment
- **SKILL.md** -- removed unused `Glob` from allowed-tools

#### Fixed

- **init-index.sh** -- added explicit `exit 0`
- **detect-mode.sh** -- added `(unrecognized text) -> prompt` to Mode Reference

#### Updated Files

| File | Change |
|------|--------|
| `agents/bc-grepai-configurator.md` | MCP paths, trace params, -32% tokens |
| `templates/rules/grepai-first.md.template` | --compact, WebSearch, clarity |
| `skills/grepai/SKILL.md` | upgrade mode, allowed-tools |
| `skills/grepai/scripts/upgrade.sh` | NEW -- brew upgrade |
| `skills/grepai/scripts/status.sh` | version comparison |
| `skills/grepai/scripts/detect-mode.sh` | upgrade keywords |
| `skills/grepai/scripts/init-index.sh` | exit 0 |
| `hooks/grepai-session.mjs` | Windows check |

---

## v2.0.44 (2026-01-30)

### brewcode
#### Added

- **bc-grepai-configurator** -- added "Supported File Extensions" section
  - Full list of 50+ extensions from [`indexer/scanner.go`](https://github.com/yoanbernabeu/grepai/blob/main/indexer/scanner.go)
  - Explicit `.mjs`/`.cjs`/`.mts`/`.cts` NOT supported warning
  - Auto-excluded files list (minified, bundles, binaries, >1MB)

#### Changed

- **bc-grepai-configurator** -- updated `.mjs` constraint with source link to scanner.go

#### Updated Files

| File | Change |
|------|--------|
| `agents/bc-grepai-configurator.md` | Added extensions table, source links |

---

## v2.0.43 (2026-01-30)

### brewcode
#### Added

- **Setup `link` mode** -- quick symlink refresh without full setup
  - Usage: `/brewcode:setup link`
  - Use after plugin update to refresh `~/.claude/skills/brewcode-*` symlinks
- **RELEASE-NOTES.md** -- changelog with format and protocol

#### Changed

- **CLAUDE.md** -- added requirement to update RELEASE-NOTES.md before plugin version bump

#### Updated Files

| File | Change |
|------|--------|
| `skills/setup/SKILL.md` | Added `link` mode with Mode Detection section |
| `RELEASE-NOTES.md` | New file |

---

## v2.0.42 (2026-01-30)

### brewcode
#### Fixed

- **Rules frontmatter documentation** -- corrected invalid fields
  - `globs` -> NOT supported (was incorrectly used)
  - `alwaysApply` -> NOT supported (Cursor field, not Claude Code)
  - `paths` -> Only valid field for conditional loading

#### Updated Files

| File | Change |
|------|--------|
| `skills/rules/SKILL.md` | Added frontmatter reference section |
| `agents/bc-knowledge-manager.md` | Added rules frontmatter reference |

#### Known Issues

- **Bug #16299**: Lazy loading not working -- all rules load at session start regardless of `paths`
  - Source: [github.com/anthropics/claude-code/issues/16299](https://github.com/anthropics/claude-code/issues/16299)

#### Documentation Sources

| Topic | URL |
|-------|-----|
| Official Rules Docs | [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory.md#path-specific-rules) |
| YAML Syntax Fix | [Issue #13905](https://github.com/anthropics/claude-code/issues/13905) |
| Lazy Loading Bug | [Issue #16299](https://github.com/anthropics/claude-code/issues/16299) |

---

## v2.0.41 and earlier

See git history for previous changes.

---

## Format

```
## vX.Y.Z (YYYY-MM-DD)

### Added | Changed | Fixed | Removed | Deprecated | Security

- **Feature/Component** -- description
  - Details if needed

### Updated Files (optional)
### Known Issues (optional)
### Breaking Changes (if any)
```

## Protocol

| Rule | Description |
|------|-------------|
| **Versioning** | SemVer: MAJOR.MINOR.PATCH |
| **MAJOR** | Breaking changes, incompatible API |
| **MINOR** | New features, backward compatible |
| **PATCH** | Bug fixes, documentation |
| **Order** | Newest first |
| **Sources** | Link to issues/docs when relevant |
