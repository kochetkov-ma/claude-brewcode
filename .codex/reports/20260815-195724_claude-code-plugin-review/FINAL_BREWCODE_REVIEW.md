# Final BREWCODE Review

**Review date:** 2026-08-15  
**Product baseline:** Claude Code 2.1.233  
**Disposition:** Review-only. No fixes were applied.  
**Consensus rule:** Every retained item was independently confirmed by two agents. Any dissent, ambiguity, unsupported premise, style preference, or speculative hardening proposal was excluded.

## Executive verdict

BREWCODE is operational, but the review retained **66 unique, two-agent-confirmed findings worth fixing** after one explicit deduplication: 15 High, 40 Medium, and 11 Low. Forty of those are current-knowledge defects in the three authoring agents (`agent-creator`, `hook-creator`, and `skill-creator`), not failures in an already-generated artifact. They matter first because these agents continuously reproduce their assumptions into new project agents, hooks, and skills.

The highest-priority runtime cluster is Semble lifecycle integrity: all five generated hook assets follow mutable cwd instead of the stable project root; status can call an incomplete or unverified installation ready; an offline reindex can delete the usable index and still report ready; agent removal can delete pre-existing user agents; MCP reinstall has no rollback; and conflict resolution can discard a valid offline guidance rule. Core SessionStart also replaces an unrelated `.claude/plans/LATEST.md` without proving ownership.

The remaining operational findings are narrower but concrete: plugin-agent management resolves against the target cwd; global rules are generated as lazy conditional rules; specialized-rule and team-roster values can escape their intended directories; freshness comparisons create false or permanent stale loops; a hand-written `intent-guard` can be overwritten; npm publication is broken; and several inventory/status paths report materially false state.

This is not a redesign recommendation. Every retained item has a direct correction. No UI issue, Codex projection, repository-documentation preference, rejected hypothesis, or unconfirmed upstream claim appears below.

## Re-verification summary

Every ID above was re-checked twice: a first verification pass (`V01`-`V07`) and an adversarial
double-check (`D1`-`D4`) that overrides it. Precedence applied throughout: D-file ruling > V-file
verdict > original report claim. Every finding below now carries `VERDICT`, `SEVERITY (final)`,
`WHY`, and `FIX DIRECTION (decided)`.

**By verdict (66 IDs):** CONFIRMED 52 | NARROWED 13 | REFUTED 1.

**By final severity (66 IDs):** High 12 | Medium 28 | Low 26.

High (12): H01, H02, H03, H08, F1, BC-A01, BC-H02, BCOP08, BCOP09, SS01, SS03, SS06.

**Severity changes — raised (3):**

| ID | Was | Final |
|---|---|---|
| H03 | Medium | **High** |
| BCOP08 | Medium | **High** |
| BCOP09 | Medium | **High** |

**Severity changes — lowered (19):**

| ID | Was | Final |
|---|---|---|
| A3 | High | Low |
| A8 | Medium | Low |
| H06 | High | Medium |
| H09 | Medium | Low |
| H12 | Medium | Low |
| F2 | Medium | Low |
| F4 | High | Medium |
| F7 | Medium | Low |
| F8 | Medium | Low |
| F9 | High | Medium |
| BC-A02 | Medium | Low |
| BC-A03 | Medium | Low |
| BC-H01 | Medium | Low |
| BCOP01 | Medium | Low |
| BCOP02 | Medium | Low |
| BCOP06 | Medium | Low |
| SS04 | High | Low |
| SS08 | High | Medium |
| SS09 | Medium | Low |

The remaining 44 IDs keep the severity printed in their row.

## Evidence lock

This report is immutable against the following evidence snapshot:

- Installed runtime: `claude --version` -> `2.1.233 (Claude Code)`.
- Downloaded npm artifact: `.claude/tmp/claude-upstream-20260815/npm/anthropic-ai-claude-code-2.1.233.tgz`.
- npm identity: `@anthropic-ai/claude-code` version `2.1.233`; SHA-256 `8374c351e69df31b77b56464a90be6b468bc77cba7ee9c1f86570178fafd5f3e`.
- Extracted npm package and types: `.claude/tmp/claude-upstream-20260815/npm/package-2.1.233/`, including `sdk-tools.d.ts`.
- Claude Code source snapshot: `.claude/tmp/claude-upstream-20260815/claude-code` at `0fa8c19d50f70f9f383fb6ff5ce5209575267d21`, committed `2026-08-14T22:20:50Z`.
- Official plugins snapshot: `.claude/tmp/claude-upstream-20260815/claude-plugins-official` at `09041ee686e7ba8be1b5b34a0852959991481cce`, committed `2026-08-15T13:48:26-05:00`. The only change after the initially reviewed `263bb97c0d28fa15b411af908694964616524396` snapshot is a SumUp marketplace dependency-pin bump; it does not affect this repository or any retained finding.
- Official skills snapshot: `.claude/tmp/claude-upstream-20260815/skills` at `f6656c1256d5a8adfa37db9110046ef20bac644c`, committed `2026-08-13T11:09:54-07:00`.
- Current official references: `.claude/tmp/claude-upstream-20260815/docs/sub-agents.md`, `hooks.md`, `skills.md`, `plugins-reference.md`, `settings.md`, and related linked references.
- Historical local lead only: `user/references/AGENT-REFERENCE.md`, modified `2026-07-19`. It did not override current official behavior.

Where the local creator text, an older issue, and the current official source disagreed, current official 2.1.233 documentation, downloaded types, and reproducible runtime behavior controlled the verdict.

Path notation is repo-relative. For compact tables, `docs/<file>` expands to `.claude/tmp/claude-upstream-20260815/docs/<file>`; `npm/package-2.1.233/<file>` expands to `.claude/tmp/claude-upstream-20260815/npm/package-2.1.233/<file>`; a bare creator filename expands to `brewcode/agents/<file>`; and `scripts/`, `tests/`, `references/`, or a bare generated asset inside the Semble section expands from `brewcode/skills/semble-setup/`. Line suffixes apply after that exact expansion.

## Scope and exclusions

Included:

- `brewcode/agents/*.md`, with first priority on `agent-creator.md`, `hook-creator.md`, and `skill-creator.md`.
- BREWCODE plugin manifest/package metadata, operational skills, templates, scripts, and core hooks.
- `brewcode/skills/semble-setup/**`, including install, status, repair, reindex, remove, agents, MCP, guidance, hook assets, and tests.
- Current Claude Code agent, hook, skill, plugin, permission, path, worktree, and runtime behavior needed to judge those surfaces.

Excluded:

- UI and presentation-only behavior.
- README/site prose and documentation-only inconsistencies unless the prose is executable agent/skill instruction.
- all `.codex` compatibility/projection behavior and all Codex assumptions.
- implementation, release, publication, cleanup, or external-state mutation.
- Semble 0.5.5 changes as defects; they are update intelligence only.
- rejected or one-agent-only candidates, style preferences, unsupported hypotheticals, and generic overengineering proposals.

## Validation performed

- `claude plugin validate ./brewcode --strict` -> passed.
- `bash -n` passed for the affected rules, teams, superreview, convention, and Semble shell scripts checked during the review.
- `node --check` passed for `brewcode/hooks/session-start.mjs`, `brewcode/hooks/lib/utils.mjs`, and reviewed JavaScript hook assets.
- `npm run build` in `brewcode/` reproduced `cd: runtime: No such file or directory`; `npm pack --dry-run --ignore-scripts` enumerated 152 files and no `runtime/` entries.
- E2E mode detection reproduced `PLUGIN_VERSION:5.7.0` with `CONTENT_VERSION:5.6.0`.
- Convention scan reported `total_files: 3203`; the same full `find` predicate counted 3550 files.
- The Semble aggregate suite passed 144/145 checks; the sole failure was the stale `guidance.rule` integration expectation confirmed below as SS09.
- Semble failure paths were inspected through their exact status, warm, enable, reindex, remove, MCP, guidance, and agent plan transitions; destructive reproductions were not run against user data.
- No plugin code was changed.

# Part I — Creator knowledge and current-feature coverage

## Coverage matrix

Status meanings: **Aware** = materially current; **Partial** = useful coverage with missing exceptions; **Missing** = absent; **Wrong** = current guidance would generate incorrect behavior.

| Creator | Current feature group | Status | Evidence and retained IDs |
|---|---|---|---|
| agent-creator | Scope, recursive discovery, cwd walk-up | Aware | `brewcode/agents/agent-creator.md:155-176`; current walk-up behavior at `docs/sub-agents.md:155-179` |
| agent-creator | Managed-agent precedence | Wrong | Managed priority is absent at `agent-creator.md:155-162`; official priority is `docs/sub-agents.md:157-165,221-225` (A8) |
| agent-creator | Core frontmatter: name, model, effort, maxTurns, tools, memory | Partial | Most fields appear at `agent-creator.md:45-103`; tool resolution, the subagent-limit claim, and scope exceptions are stale (A3-A5, A9) |
| agent-creator | Foreground/background, fork mode, permission prompts | Wrong | `agent-creator.md:59,98,259-267`; official precedence and surfaced prompts at `docs/sub-agents.md:788-804` (A1) |
| agent-creator | Skill preload and runtime Skill invocation | Wrong | `agent-creator.md:199,209,470,476`; official `docs/sub-agents.md:287-293,337-353` (A2) |
| agent-creator | Real foreground/background tool pools | Wrong | Static list at `agent-creator.md:125-135`; official filters at `docs/sub-agents.md:335-353` (A3-A4) |
| agent-creator | Agent teams, nesting, cross-session/task tools | Partial | Nesting is covered, but Task availability and current limits are not; `agent-creator.md:191-213,269-282` (A4-A5) |
| agent-creator | Main-session invocation and `initialPrompt` | Partial | Local-only claim at `agent-creator.md:63,103,480`; official main-session semantics at `docs/sub-agents.md:279-300` (A7) |
| agent-creator | Frontmatter hooks and trust/context exceptions | Wrong | Three-event/local-only model at `agent-creator.md:137-153`; official all-event/context behavior at `docs/sub-agents.md:631-680` (A9) |
| agent-creator | Worktree isolation | Aware | Worktree frontmatter is correctly supported and treated as optional |
| agent-creator | Remote isolation | Wrong | `agent-creator.md:60,99,111,481` says unusable everywhere; invocation type supports gated `remote` at `npm/package-2.1.233/sdk-tools.d.ts:500-527` (A11) |
| agent-creator | Authoring validation and proportional workflow | Partial | Validation is useful, but mandatory 4+ explorers/checkpointing and contradictory description rules are not proportional (A6, A10) |
| hook-creator | Hook lifecycle/event inventory | Partial | 27 rows plus four “unverified” rows at `hook-creator.md:112-177`; current schemas now exist for all four (H09-H12) |
| hook-creator | Common input, matchers, tool/MCP scoping | Partial | Broad matcher table exists, but PermissionDenied and plugin MCP scoping are wrong/missing (H02, H07) |
| hook-creator | Exit codes and per-event decision control | Wrong | PermissionRequest and PreCompact are materially wrong (H01, H08) |
| hook-creator | Event-specific input/output schemas | Wrong | UserPromptSubmit, AskUserQuestion, PermissionDenied, PostToolUse, and four newer events need correction (H02-H13) |
| hook-creator | Handler types and async execution | Partial | Five types are listed, but `async`/`asyncRewake` applicability is too broad (H14) |
| hook-creator | Settings locations, trust, headless, reload | Wrong | Nonexistent user-local settings path, incorrect trust/headless claims, and overbroad reload expectations (H05, H06, H15) |
| hook-creator | Plugin paths/data and exec form | Wrong | `${CLAUDE_PLUGIN_DATA}` is incorrectly discouraged and exec-form `args` is absent (H16-H17) |
| hook-creator | Output ceilings | Wrong | 50K history claim conflicts with current 10K cap (H18) |
| skill-creator | Skill scopes and discovery | Wrong | It documents scopes but always creates project scope at `skill-creator.md:574-576` (F3) |
| skill-creator | Supported frontmatter schema | Wrong | Unsupported `cli`/`version` are made mandatory; hooks are limited to three events (F2, F5) |
| skill-creator | Invocation control | Partial | User/model invocation flags are covered; percentage and “100%” guarantees are unsupported (F12) |
| skill-creator | Tool permissions | Wrong | `allowed-tools` is described as a restriction instead of one-turn preapproval (F1) |
| skill-creator | Agent/Skill orchestration | Wrong | Current nested Agent and runtime Skill capabilities are rejected (F4) |
| skill-creator | Fork/background/checkpoint behavior | Wrong | Key exceptions, narrower background tools, and rewind boundary are absent (F9) |
| skill-creator | String substitution/dynamic context | Partial | Basic forms exist; current variables, cwd, failure, policy, and multiline behavior are missing (F10) |
| skill-creator | Supporting-resource paths | Wrong | Bare relative Read paths are promised to resolve from the skill directory; only Markdown links do so reliably (F6) |
| skill-creator | Plugin skill naming | Wrong | It requires `name == directory`; plugin frontmatter may intentionally replace the final command segment (F8) |
| skill-creator | Evaluation | Partial | Quick tests exist without the required fresh with-skill/without-skill baseline (F7) |

## Agent creator — confirmed corrections A1-A11

All rows below are **2/2 confirmed**.

| ID | Severity | Local evidence | Current 2.1.233 behavior, concrete failure, and minimal fix |
|---|---:|---|---|
| A1 | Medium | `brewcode/agents/agent-creator.md:59,98,259-267` | The file reduces mode selection to “unset = background” and says background permission requests auto-deny. Current precedence is fork-mode/environment/team dependent, and since 2.1.186 background permission prompts surface in the main session (`docs/sub-agents.md:788-804`). Generated agents can be needlessly forced foreground or designed around a denial that no longer occurs. Replace the table with current precedence and surfaced-prompt semantics. |
| A2 | Medium | `agent-creator.md:199,209,470,476` | It says the Skill tool is unavailable in subagents and only startup preload works. Current background pool explicitly includes `Skill`, while `skills:` remains preload (`docs/sub-agents.md:287-293,337-353`). This prevents valid runtime composition. Distinguish preload from runtime invocation and retain only actual invocation restrictions. |
| A3 | High | `agent-creator.md:125-135` | The static tool list includes universally removed tools (`AskUserQuestion`, `TaskOutput`) and omits current tools such as `PowerShell`, `TodoWrite`, `Skill`, `ToolSearch`, worktree, monitor, messaging, and artifact tools. Tool resolution differs for foreground, background, forks, teams, and enabled features (`docs/sub-agents.md:335-353`). A generated allowlist can fail launch or silently lose required capabilities. Generate against the runtime pool and explain the two filters. |
| A4 | Medium | `agent-creator.md:132,211-213` | Task tools are presented as generally present. In 2.1.233 they depend on the session/model, and teammates receive an expanded task/cron set (`docs/sub-agents.md:351-353`). A coordinator can be generated around unavailable Task APIs. Make TaskGraph guidance conditional and require a fallback when Task tools are absent. |
| A5 | Low | `agent-creator.md:269-282` | It advertises `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION=200`. Current official behavior has no total-per-session limit; only concurrent and nesting limits apply (`docs/sub-agents.md:928-939`). Capacity planning and validation become falsely restrictive. Remove the 200-cap claim. |
| A6 | Medium | `agent-creator.md:35-43,79-82,302-335,441-445` | The file simultaneously recommends about 80-100 characters, permits about 200 tokens plus examples, recommends multi-line examples for ambiguous agents, and then bans examples/multiline descriptions in validation. A valid agent can fail its own creator checklist, or trigger quality can be reduced to satisfy it. Choose one evidence-based description policy and make exceptions explicit. |
| A7 | Low | `agent-creator.md:63,103,480` | `initialPrompt` is called local-only and silently dropped for plugin agents. Current semantics are execution-context based: it is auto-submitted only when the definition runs as the main session through `--agent` or the `agent` setting (`docs/sub-agents.md:279-300`), including a plugin definition selected there; it is irrelevant on ordinary subagent spawn. Document the main-session boundary instead of file origin. |
| A8 | Medium | `agent-creator.md:155-162` | Managed definitions are omitted from precedence. They are the highest-priority organization scope (`docs/sub-agents.md:157-165,221-225`). A creator can claim a project or CLI definition is authoritative while a managed agent wins. Add managed scope at priority 1 and preserve scoped plugin names. |
| A9 | Medium | `agent-creator.md:137-153,217-233` | It limits frontmatter hooks to PreToolUse/PostToolUse/Stop and describes context inheritance too broadly. Current local/user/CLI agents support all hook events; Stop is converted to SubagentStop when spawned; the same file can run as main session; project hooks require exact-folder trust; Explore/Plan skip parts of normal context (`docs/sub-agents.md:631-680,943-963`). Generated hooks can be omitted or placed in the wrong context. Replace the three-event table with the all-event lifecycle and trust/context exceptions. |
| A10 | Low, narrowed | `agent-creator.md:380-404` | “Launch 4+ Explore agents” and checkpoint every generated agent are mandatory even for one small definition. That is disproportionate, but exploration/checkpointing remain valid for broad or long work. Make fan-out and checkpoints risk/size based; do not remove them wholesale. |
| A11 | Low | `agent-creator.md:60,99,111,481`; `npm/package-2.1.233/sdk-tools.d.ts:500-527` | `remote` is correctly invalid in agent frontmatter, whose documented value remains `worktree`, but it is not unusable everywhere: Agent invocation accepts gated `isolation:"remote"` and always backgrounds it. The current text hides a real invocation capability. Keep frontmatter validation worktree-only and document remote as invocation-only, availability-gated behavior. |

### Re-verification — A1-A11

**A1** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** `AC:59,98,264` reduce mode selection to a two-value table while `sa:795-798` defines four-case precedence and `sa:793` surfaces background prompts since 2.1.186.
**FIX DIRECTION (decided):** Replace the Execution Modes table and the `background` row with the four-case precedence; delete the `false` = force-foreground claim.

**A2** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** `sa:292` states subagents can invoke unlisted skills through the `Skill` tool and `sa:349` lists `Skill` in the background pool; the arbiter subagent's own toolset contains it.
**FIX DIRECTION (decided):** Split preload (`skills:` frontmatter) from runtime invocation (`Skill` tool, available); retire the issue-#4182 row as historical.

**A3** — **VERDICT:** NARROWED | **SEVERITY (final):** Low (was High)
**WHY:** Narrowed claim — `AskUserQuestion` is removed from every subagent even when declared, but the removal is silent and no launch fails, so a stale `tools:` entry is inert clutter, not breakage; the load-bearing risk lives in `brewtools` agent prose, not in the two brewcode declarations.
**FIX DIRECTION (decided):** Rewrite `AC` "Available TLs" as the two documented filters and list the nine always-removed tools; drop `AskUserQuestion` from `agent-creator.md:7` and `skill-creator.md:7`. The `ssh-admin`/`deploy-admin` confirmation-contract defect is tracked in the brewtools report, not here.

**A4** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** `AC:131,132,213` present Task tools as generally available; `sa:349,351,353` make them teammate/foreground-conditional and add cron tools for teammates.
**FIX DIRECTION (decided):** Make Task-tool guidance conditional, add the cron tools, delete `TaskOutput`, and require an explicit no-Task-tool fallback.

**A5** — **VERDICT:** NARROWED | **SEVERITY (final):** Low
**WHY:** The claim survives — there is no per-session cap in 2.1.233 — but the report's and the first pass's framing ("undocumented", "never retracted") is wrong: the cap was added at 2.1.212 and explicitly removed at 2.1.224 (`CHANGELOG.md:191`), with `sa:930` agreeing.
**FIX DIRECTION (decided):** Delete the `AC:281` row; if kept as history, write "added 2.1.212, removed 2.1.224" and never "undocumented/unenforced".

**A6** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** Purely internal contradiction, re-derived on disk: `AC:37,38,41,43,82,310,333,444` cannot all be satisfied by one description.
**FIX DIRECTION (decided):** Make `AC:37-43` the normative policy, point `AC:82` and `AC:444` at it, and state the example-block exception explicitly.

**A7** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Low
**WHY:** Evidence strengthened rather than weakened: `sa:225` enumerates the plugin-ignored set exhaustively as `hooks`/`mcpServers`/`permissionMode`, so `AC:103` "PLG: not read, no warn" is affirmatively false, not merely unproven.
**FIX DIRECTION (decided):** Restate `initialPrompt` as execution-context based (main session via `--agent` or the `agent` setting; ignored on subagent spawn) and delete the "PLG: not read" clause as false.

**A8** — **VERDICT:** NARROWED | **SEVERITY (final):** Low (was Medium)
**WHY:** The missing Managed row is real (`AC:157-162` has 4 rows vs `sa:161-166` Managed=1 ... plugin=5), but no generated artifact is wrong — only a precedence explanation. The first pass's deflation rationale ("no managed dir on this machine") is itself invalid: `agent-creator` is a distributed artifact whose consumers include enterprise users.
**FIX DIRECTION (decided):** Insert Managed as priority 1, renumber to 5 rows, keep the walk-up section unchanged.

**A9** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** `hooks:652` states verbatim "All hook events are supported", against the three-event restriction at `AC:152,144-145,221`; `sa:956` adds the Explore/Plan context exception.
**FIX DIRECTION (decided):** Replace the three-event table with "all events, these three are common", plus exact-folder trust, `Stop`->`SubagentStop`, and the Explore/Plan exception.

**A10** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Low
**WHY:** `AC:382` step 1 and `AC:389` are genuinely unconditional; the attempted refutation (internal contradiction with the `AC:23` scope guard) does not hold, and no upstream rule is violated — this is proportionality, not a correction.
**FIX DIRECTION (decided):** Gate step 1 and checkpointing on scope, keep both as defaults. Must not gate the fix wave and must not be labelled a correction.

**A11** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Low
**WHY:** `sdk-tools.d.ts:527` carries `isolation?: "worktree" | "remote"` verbatim and the value is live in the current Agent schema, so `AC:111,481` ("not a valid choice anywhere", "gated off in the binary") is wrong.
**FIX DIRECTION (decided):** Keep frontmatter validation worktree-only; rewrite `AC:111`/`AC:481` to "invocation-level, availability-gated".

## Hook creator — confirmed corrections H01-H18

All rows below are **2/2 confirmed**.

| ID | Severity | Local evidence | Current behavior, failure, and minimal fix |
|---|---:|---|---|
| H01 | High | `brewcode/agents/hook-creator.md:101-106` | PermissionRequest is listed among events blocked by exit 2. Current `docs/hooks.md:829` says exit 2 is not honored; permission flow continues. A generated deny gate fails open. Require the event-specific `hookSpecificOutput.decision` object. |
| H02 | High | `hook-creator.md:87,144,316` | PermissionDenied is marked blocking/no-matcher and retry is emitted as top-level `{"retry":true}`. It matches tool name and accepts `hookSpecificOutput.retry`; exit/stderr are ignored, and no-verdict denials cannot retry (`docs/hooks.md:306,842,988-989,2068-2109`). The advertised recovery hook silently does nothing. Correct matcher, input, nesting, and no-verdict rule. |
| H03 | Medium | `hook-creator.md:120` | The stdin field is `prompt`, not `user_prompt`. Any validator reading the documented field sees empty input and may pass or reject the wrong request. Replace the field and add a schema fixture. |
| H04 | Medium | `hook-creator.md:108-110,325-328` | The AskUserQuestion example replaces tool input with singular `question`/`answer`. PreToolUse `updatedInput` replaces the complete tool argument object, so it must preserve the current `questions` array and return the actual supported answer structure. The sample can make the tool call invalid. Show a full-object transformation; retain single-writer advice only for replacement conflicts. |
| H05 | Low | `hook-creator.md:225-239` | `~/.claude/settings.local.json` is listed as a user-global location. Current locations include user `~/.claude/settings.json` and project `.claude/settings.local.json`; no user-local twin exists (`docs/hooks.md:250-260,681-685`). Authors can write a file Claude never reads. Remove the nonexistent location. |
| H06 | High | `hook-creator.md:239,300` | Workspace-trust/headless and protected-path claims are overgeneralized and partly invented. Current trust differs for settings hooks, skill hooks, project subagent hooks, user/CLI scopes, and `-p`; `${CLAUDE_PLUGIN_DATA}` is an official writable persistent plugin directory (`docs/hooks.md:645-673`; `docs/plugins-reference.md:660-748`). Security hooks can be skipped unexpectedly or persistence redirected to brittle paths. Replace with the official per-source trust table and remove the claimed blanket write prohibition. |
| H07 | Medium | `hook-creator.md:483-502` | Generic MCP examples omit plugin scoping. Bundled tools use `mcp__plugin_<plugin>_<server>__<tool>`, and `mcp_tool.server` uses `plugin:<plugin>:<server>` (`docs/hooks.md:353-369`; `docs/plugins-reference.md:146`). Bare matchers never fire. Add plugin-scoped examples to matcher and handler validation. |
| H08 | High | `hook-creator.md:84,129,173,480` | PreCompact is called non-blocking and its `custom_instructions` field is missing. Current 2.1.233 accepts exit 2 or top-level `decision:"block"` and supplies `trigger` plus `custom_instructions` (`docs/hooks.md:2846-2874`). A handoff gate designed from this creator cannot stop unsafe compaction or honor `/compact` instructions. Correct schema and block contract. |
| H09 | Medium | `hook-creator.md:146-151,177` | Setup remains “unverified.” Current schema has `trigger:init|maintenance`, context-only output, no blocking, `CLAUDE_ENV_FILE`, and command/mcp_tool types only (`docs/hooks.md:1177-1229`). Without it, generated setup hooks can choose unsupported decisions/types. Replace the placeholder row. |
| H10 | Medium | `hook-creator.md:146-151,177` | UserPromptExpansion remains “unverified.” Current input and routing are documented: blocking uses top-level `decision:"block"` plus `reason`, while context uses `hookSpecificOutput.additionalContext` (`docs/hooks.md:1328-1374`). A generated command-expansion hook has no reliable schema. Add it. |
| H11 | Medium | `hook-creator.md:146-151,177` | PostToolBatch remains “unverified.” Current input batches tool results, supports no matcher, and can block/stop the loop before the next model call (`docs/hooks.md:2011-2066`). Batch validators cannot be authored correctly. Add the input schema, explicitly record that no matcher is supported, and add decision behavior. |
| H12 | Medium | `hook-creator.md:146-151,177` | DirectoryAdded remains “unverified.” It is post-add, non-blocking, and has source-dependent output routing (`docs/hooks.md:2650-2693`). Authors may incorrectly treat it as a pre-add gate. Add the current schema and post-event semantics. |
| H13 | Medium | `hook-creator.md:77-79,314` | PostToolUse is described as feedback-only and `updatedToolOutput` ignored. Current top-level `decision:"block"` adds feedback and `updatedToolOutput` can replace what Claude sees, subject to output-shape validation (`docs/hooks.md:1879-1946`). Redaction/normalization hooks are needlessly impossible under current guidance. Document both, noting side effects already occurred. |
| H14 | Medium | `hook-creator.md:203-214,460-472` | `async` and `asyncRewake` are assigned to command/http/mcp_tool. Current handler schema exposes them only on command hooks (`docs/hooks.md:448-464`). Invalid fields are generated for other types. Restrict both fields and explain `asyncRewake` exit-2 wake behavior. |
| H15 | Low, narrowed | `hook-creator.md:223-241` | The creator lacks the narrow reload boundary: skill text is live; plugin hooks, agents, MCP, and LSP require `/reload-plugins` or restart; monitors require restart; existing running paths can remain on the old version (`docs/plugins-reference.md:389-391,699`). This is activation guidance, not a runtime hook-schema defect. Add a concise component reload table. |
| H16 | Medium | `hook-creator.md:289-300` | `${CLAUDE_PLUGIN_DATA}` is described as effectively read-only/brittle. Officially it is the persistent plugin-owned directory for dependencies, generated files, caches, and state, surviving updates until last-scope uninstall (`docs/plugins-reference.md:665,705-748`). Authors are pushed toward project pollution. Replace the claim with lifecycle and uninstall semantics. |
| H17 | Medium | `hook-creator.md:251-271` | Every example uses shell-form `command`; exec-form `args` is absent. Current exec form spawns an executable directly and safely preserves path arguments (`docs/hooks.md:448-487`). Plugin paths containing shell-sensitive characters remain unnecessarily fragile. Prefer exec form for bundled scripts and keep shell form for actual pipelines. |
| H18 | Low | `hook-creator.md:596` | The history claims a 50K spill threshold. Current output strings are capped at 10,000 characters and then saved with preview/path (`docs/hooks.md:885,964`). Capacity advice and tests use the wrong boundary. Replace with 10K and test at 9,999/10,001 characters. |

### Re-verification — H01-H18

**H01** — **VERDICT:** CONFIRMED | **SEVERITY (final):** High
**WHY:** `HC:105` lists PermissionRequest in the exit-2 blocking row against `hooks:829` verbatim "Exit code 2 isn't honored for this event and the permission flow proceeds unchanged" — a generated deny gate fails open.
**FIX DIRECTION (decided):** Delete PermissionRequest from the exit-2 row and move it to Non-blocking with a pointer to the event-specific `decision` object. Test-worthy.

**H02** — **VERDICT:** CONFIRMED | **SEVERITY (final):** High
**WHY:** Both sharpest halves re-confirmed: `hooks:306` makes the PermissionDenied matcher the tool name (vs `HC:502` "No matcher"), and `hooks:836` states exit code and stderr are ignored and retry must be `hookSpecificOutput.retry` (vs top-level `retry` at `HC:316`).
**FIX DIRECTION (decided):** One-pass rewrite of all five PermissionDenied touchpoints from `hooks:2068-2114` — matcher, input, nesting, and the no-verdict rule. Test-worthy.

**H03** — **VERDICT:** CONFIRMED | **SEVERITY (final):** High (was Medium)
**WHY:** `grep user_prompt` over `docs/hooks.md` returns zero hits; the field is `prompt` (`hooks:1280,1282`). Aggravator: `HC:187` says the field is named `prompt` "in the POSTed payload", which implies the non-http name differs and resolves the internal contradiction the wrong way, reinforcing the error.
**FIX DIRECTION (decided):** Replace `user_prompt` -> `prompt` at `HC:120`, rewrite `HC:187` so it stops implying an http-only rename, and add the field to the JS template's per-event comment. Test-worthy.

**H04** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** `hooks:1714` states `updatedInput` replaces the entire tool-input object, so the singular `question`/`answer` sample at `HC:325-328` produces an invalid call.
**FIX DIRECTION (decided):** Show a full-object transform, `{...tool_input, answers:{"<question>":"<label>"}}`, and keep single-writer advice only for replacement conflicts.

**H05** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Low
**WHY:** `~/.claude/settings.local.json` exists nowhere upstream (`hooks:250-257`, `settings:695-707`), so `HC:225,236` names a file Claude never reads.
**FIX DIRECTION (decided):** Delete the row, drop the path from the precedence sentence, renumber.

**H06** — **VERDICT:** NARROWED | **SEVERITY (final):** Medium (was High)
**WHY:** Narrowed claim — half (a), the per-source trust split, is upheld (`HC:239` vs `hooks:671,673,3364-3370`); half (b) is overturned: `v3.4.70` is a real **brewcode** git tag and `RELEASE-NOTES.md:2348` documents the protected-path finding as empirically verified in headless `claude -p`. The surviving defects are version-namespace ambiguity and a stale April-2026 empirical basis, not fabrication.
**FIX DIRECTION (decided):** Replace `HC:239` per `hooks:3364-3370` + `671-673`; do not delete `HC:300` as fabricated — qualify the tag as `brewcode v3.4.70`, re-date the finding against 2.1.233, and apply the same qualification to `.claude/rules/avoid.md:6`. Writability itself is settled by D1 (see the correction below).

**H07** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** `hooks:369` and `plugins-reference:146` define the plugin-scoped forms `mcp__plugin_<plugin>_<server>__<tool>` and `plugin:<plugin>:<server>`, absent from `HC:198,487`, so bare matchers never fire.
**FIX DIRECTION (decided):** Add scoped forms to `HC:487` and `HC:198` and note that the trailing `.*` is mandatory.

**H08** — **VERDICT:** CONFIRMED | **SEVERITY (final):** High
**WHY:** `hooks:846` reads verbatim "`PreCompact` | **Yes** | Blocks compaction", against four places in `HC` (`:84,106,129,173`) calling it non-blocking; `custom_instructions` is absent entirely.
**FIX DIRECTION (decided):** Flip PreCompact to blocking in all four tables, add `custom_instructions`, and note that `systemMessage`/`continue` are discarded. Test-worthy.

**H09** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Low (was Medium)
**WHY:** `HC:146,151,177` withhold a contract rather than state a wrong one, and Setup is non-blocking (`hooks:848`) — placeholder on a non-blocking event rates Low, matching H12.
**FIX DIRECTION (decided):** Fill all four placeholder rows plus the exit-code row and delete the `HC:151` "unverified" caveat.

**H10** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** UserPromptExpansion is blocking (`hooks:831`) with matcher = command name (`hooks:320`), both absent from `HC:147`.
**FIX DIRECTION (decided):** Fill row 29 and the routing-matrix row with the documented blocking/context split.

**H11** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** PostToolBatch blocks and stops the agentic loop (`hooks:841`) and is explicitly in the no-matcher group (`hooks:323`), neither recorded at `HC:148`.
**FIX DIRECTION (decided):** Fill row 30 with Matcher = None (unsupported), the batch input schema, decision behavior, and the `tool_response`-shape divergence.

**H12** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Low (was Medium)
**WHY:** `hooks:847` marks DirectoryAdded non-blocking ("the directory is already added") with matcher `slash_command`/`register_repo_root`; a placeholder on a non-blocking event rates Low.
**FIX DIRECTION (decided):** Fill row 31 with one sentence: post-add only, cannot block, `continue` discarded.

**H13** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** `hooks:1913-1920` gives PostToolUse four output fields including `decision:"block"` and `updatedToolOutput`, against `HC:81` "no decision field".
**FIX DIRECTION (decided):** Rewrite the PostToolUse row, add an output-schema row under section 6, and carry the "side effects already occurred" caveat. Fix in lockstep with N6 (`skill-creator:414`).

**H14** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** `hooks:414-427` limits common handler fields to `type,if,timeout,statusMessage,once`; `async`/`asyncRewake` appear only under command fields at `hooks:442-450`. `HC:612` already contradicts `HC:212-213`.
**FIX DIRECTION (decided):** Change "Applies to" to `command` on both rows and expand the `asyncRewake` exit-2 wake behavior.

**H15** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Low
**WHY:** `grep -n reload` over `hook-creator.md` returns zero hits; the boundary is documented at `plugins-reference:389-391,699`. Activation guidance, not a runtime schema defect.
**FIX DIRECTION (decided):** Add a three-row live/reload/restart table to section 4.

**H16** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** Upheld exactly as written: `plugins-reference:665,705,721` and `skills.md:401` establish `${CLAUDE_PLUGIN_DATA}` as the official persistent writable plugin directory, and Anthropic's own `project-artifact` skill Writes there. `hook-creator.md:300`'s "blocked in ALL modes" is false — the tool-level classification is an ASK, not a block.
**FIX DIRECTION (decided):** Replace the `HC:289-300` block with the D1 text: sensitive-path ASK, `.claude/` carve-outs (`skills`, `agents`, `commands`, `worktrees`, `scheduled_tasks.json`), prompt in default/acceptEdits/plan, auto-approved under bypass, hard-fail in headless `-p`; and prefer `${CLAUDE_PROJECT_DIR}/.claude/<subdir>/` for unattended state.

**H17** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** `grep '"args"'` over `hook-creator.md` returns zero hits; exec form is documented at `hooks:445,456-490` and safely preserves path arguments.
**FIX DIRECTION (decided):** Add `args` to the command-fields table plus one exec-form example, and link the dangling `HC:246` v2.1.207 note to it.

**H18** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Low
**WHY:** `hooks:885` caps output strings at 10,000 characters (restated at `hooks:964`), against "50K" at `HC:596`.
**FIX DIRECTION (decided):** 50K -> 10,000 at `HC:596`, repeat the cap in section 9, and test at 9,999/10,001 characters.

## Skill creator — confirmed corrections F1-F10 and F12

All rows below are **2/2 confirmed**. F11 was rejected and is intentionally absent.

| ID | Severity | Local evidence | Current behavior, failure, and minimal fix |
|---|---:|---|---|
| F1 | High | `brewcode/agents/skill-creator.md:233-244,347-351,618` | `allowed-tools` is described as restricting the tool pool. It only pre-approves matching tools for the invocation turn; every other tool remains callable under normal permissions (`docs/skills.md:511-525`). A “read-only” skill can still write. Use `disallowed-tools` or permission rules for restriction and label `allowed-tools` as a temporary grant. |
| F2 | Medium | `skill-creator.md:141-157,171-207,246-258,608-611,721-724` | Unsupported `cli` and `version` keys are invented, then made conditionally mandatory. They are absent from the current Claude Code skill schema (`docs/skills.md:320-353`). Creators add inert metadata and validators reject valid skills that omit it. Remove both from the Claude Code contract; custom registry data belongs under supported `metadata`. |
| F3 | Medium | `skill-creator.md:574-576` | Creation always runs `mkdir -p .claude/skills/...` despite personal, plugin, and managed scopes being real (`docs/skills.md:111-167,818-824`). A personal/plugin request silently becomes project-local. Ask or infer scope, then write to the matching supported location; managed deployment is an admin workflow, not a local mkdir. |
| F4 | High | `skill-creator.md:305-336,384-401` | It says Skill from a subagent never works and Agent/Task is main-only. Current subagents can invoke Skill, and Agent is available until the nesting/filter boundary; actual tools vary by mode (`docs/sub-agents.md:287-293,335-353,405-413`). Valid nested workflows are rejected while invalid assumptions replace runtime checks. Describe conditional capability and keep flat fan-out as a preference, not a false platform prohibition. |
| F5 | Medium | `skill-creator.md:403-415` | Skill hooks are limited to PreToolUse/PostToolUse/Stop. Current skill frontmatter supports all hook events, registered for the rest of the session, with optional `once:true` (`docs/hooks.md:645-671`). Needed lifecycle hooks are omitted. Replace the three-event list with the shared hook schema and lifecycle. |
| F6 | Medium | `skill-creator.md:496-529` | It promises bare relative Read instructions resolve from the skill base. Runtime tool paths resolve from session cwd; Markdown links are the relative-to-SKILL.md mechanism, while executable references should use substitutions (`docs/skills.md:390-415,438-460`). A generated skill can read the wrong project file or fail outside its source directory. Use Markdown links for supporting docs and `${CLAUDE_SKILL_DIR}` for runtime paths. |
| F7 | Medium | `skill-creator.md:444-447,637-643` | Trigger queries and quick evals run only with the skill present. Official evaluation requires fresh-session paired runs with and without the skill (`docs/skills.md:790-816`). The creator can call ordinary model ability a skill improvement. Add paired baselines and compare pass rate, tokens, and time. |
| F8 | Medium | `skill-creator.md:141,608` | It requires `name == directory`. For plugin skills, frontmatter `name` may intentionally replace the final command segment while retaining the plugin namespace (`docs/skills.md:368-384`). Valid plugin skills fail validation. Apply equality only where the command comes from the directory; validate plugin naming by resolved command. |
| F9 | High | `skill-creator.md:116,267-303,718` | Fork/background guidance omits noninteractive/scheduled/duplicate-run exceptions, the narrower background tool pool, and the fact that background edits lie outside session checkpoints (`docs/skills.md:667-695`). A mutating fork may lack required tools and `/rewind` will not undo it. Select background from dependency/tool/edit semantics, not phase count, and warn about the checkpoint boundary. |
| F10 | Medium | `skill-creator.md:353-371` | The substitution table omits `$ARGUMENTS[N]`, `${CLAUDE_EFFORT}`, `${CLAUDE_PROJECT_DIR}`, and `${CLAUDE_PLUGIN_DATA}`; dynamic-context guidance omits multiline syntax, whitespace recognition, policy disablement, mutable cwd, timeout/output behavior, and failure-aborts-invocation (`docs/skills.md:390-419,586-665`). Generated skills can use unstable paths or disappear on an expected nonzero command. Expand the current contract and test failure modes. |
| F12 | Low, narrowed | `skill-creator.md:70-92,633-635,754-771,784` | Hard-coded activation percentages and `/name` “100%” guarantees are unsupported. Explicit invocation can still fail from malformed metadata, collision, visibility, or invocation settings; official troubleshooting is observational (`docs/skills.md:1017-1045`). Keep the useful trigger advice, remove percentages/guarantees, and diagnose through `/skills`, `/doctor`, debug logs, and paired evals. |

### Re-verification — F1-F10, F12

**F1** — **VERDICT:** CONFIRMED | **SEVERITY (final):** High
**WHY:** The first pass's deflation to Medium is overturned. `skills:333,513` are categorical — `allowed-tools` "does not restrict which tools are available: every tool remains callable" and grants unprompted use — while `SC:237,349,618` teach the exact inverse. The destructive path has already shipped: 24 of 27 `SKILL.md` list bare `Bash`, most also `Write`/`Edit`/`Agent`, and zero declare `disallowed-tools`.
**FIX DIRECTION (decided):** Relabel `allowed-tools` as turn-scoped pre-approval that restricts nothing, point restriction at `disallowed-tools` + permission rules, rewrite `SC:349` entirely, drop "Minimal set" — then audit the 27 shipped `allowed-tools` lines as a separate repo-wide task. Test-worthy.

**F2** — **VERDICT:** NARROWED | **SEVERITY (final):** Low (was Medium)
**WHY:** Narrowed claim — `cli`/`version` are genuinely unsupported and genuinely made mandatory in the creator, but no shipped skill carries them in frontmatter (all four grep hits are body-level template text at lines 106-357, frontmatter ends at line 9) and `validate-skill.sh` has no such check. The hard error is confined to claude.ai upload / Skills API / `package_skill.py` (`skills:357-363`); Claude Code accepts every documented field (`skills:352`).
**FIX DIRECTION (decided):** Delete the "Ownership + Change Signal" section and both checklist rows; if registry semantics are wanted, move them under the supported `metadata` map and state that Claude Code ignores it.

**F3** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** `SC:576` hard-codes `.claude/skills/...` against the four scopes the same file documents at `SC:531-543`; the repo's own dominant case is a plugin skill.
**FIX DIRECTION (decided):** Add a scope question to Step 1 and branch Step 3 on the answer; managed deployment stays an admin workflow, not a local `mkdir`.

**F4** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium (was High)
**WHY:** Falsified empirically, not by inference: a 2.1.233 subagent's own toolset contains both `Agent` and `Skill`, against `SC:388` and `SC:399`. Deflated to Medium because the consequence is lost capability plus self-contradiction with `SC:307`/`SC:7` — nothing breaks.
**FIX DIRECTION (decided):** Delete `SC:388`/`SC:399`, replace with the depth-limit rule, and keep "spawn from main" as an explicitly labelled brewcode preference. Resolve as one pass with F6 and N7.

**F5** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** `hooks:652` "All hook events are supported" against the three-event list at `SC:405-414`. One additional error the first pass missed: `SC:414` labels `PostToolUse` "(non-blockable)", which `hooks:1913-1920` refutes.
**FIX DIRECTION (decided):** Replace with "all hook events" plus `once: true` and the session-lifetime note, fix the `PostToolUse` blockability label on the same line, keep the #17688 caveat.

**F6** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** Sharper than reported: `SC:508-511` and `SC:529` agree the `${CLAUDE_PLUGIN_ROOT}/skills/.../y.sh` form is wrong but prescribe two different replacements (`${CLAUDE_SKILL_DIR}/scripts/foo.sh` vs bare `scripts/y.sh`), so an author cannot satisfy both.
**FIX DIRECTION (decided):** One rule — Markdown links for prose references, `${CLAUDE_SKILL_DIR}` for anything executed or Read at runtime, `${CLAUDE_PLUGIN_ROOT}` for cross-skill plugin resources; rewrite the `:529` row to match.

**F7** — **VERDICT:** NARROWED | **SEVERITY (final):** Low (was Medium)
**WHY:** Narrowed claim — the missing fresh-session paired baseline is real (`skills:788-790`) for the output-quality half only; the trigger half is inert for this repo because all 27 skills are `disable-model-invocation: true`, which `skills:331` confirms also blocks subagent preload.
**FIX DIRECTION (decided):** Split the step — `DMI:true` skills get paired with/without fresh-session runs on output quality and drop the trigger question; keep trigger measurement for the rare `DMI:false` skill; point at `skill-creator@claude-plugins-official` for the heavyweight loop.

**F8** — **VERDICT:** NARROWED | **SEVERITY (final):** Low (was Medium)
**WHY:** Narrowed claim — upstream does permit `name` != directory (`skills:326`, where `name` defaults to the directory and is a display label), but `name == dir` is a documented brewcode invariant enforced by `validate-skill.sh:70`. The report reads a house rule as a platform error.
**FIX DIRECTION (decided):** Keep the check, relabel it "brewcode house rule", add one line on upstream's laxer rule. Do not relax `validate-skill.sh`.

**F9** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium (was High)
**WHY:** All three gaps verified verbatim at `skills:672-687` — the four wait-anyway cases, the narrower background tool set, and edits landing outside session checkpoints. Deflated because git is the backstop, so the consequence is recoverable.
**FIX DIRECTION (decided):** Add a "fork/background caveats" block carrying all three; drive fork choice from tool needs and edit semantics, keeping phase count only as a memory warning.

**F10** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** `SC:353-371` lists 5 of 9 substitutions, and `skills:390-419,586-665` document the multiline form, cwd, timeout, and the rule that a non-zero exit aborts the invocation.
**FIX DIRECTION (decided):** Add the four missing variables plus the escape rule, and expand the dynamic-context section with the abort semantics and the `|| true` remedy.

**F12** — **VERDICT:** NARROWED | **SEVERITY (final):** Low
**WHY:** Substance survives — the 20% / 50-72% / 100% table at `SC:70-92` is unsourced and the malformed-metadata justification is contradicted upstream — but the report's citation is wrong: `skills.md:1005-1012` is a Python codebase-map script. The statement is at `skills.md:1028`.
**FIX DIRECTION (decided):** Strip the numeric activation-rate columns, keep the ordinal claim, and replace the "100% guarantee" with the real `/name` caveats (`user-invocable: false`, `skillOverrides: "off"`, same-name higher-precedence override, lowercase `skill.md`). The fix wave must cite `skills:1028`.

# Part II — Confirmed BREWCODE operational findings

## Agent-definition surface BC-A01-A05

All rows are **2/2 confirmed**. `BC-A04` is merged with `BCOP03` below to avoid reporting the same global-rule defect twice.

| ID | Severity | Evidence | Trigger/state and actual outcome | Blast radius and minimal fix |
|---|---:|---|---|---|
| BC-A01 | High, narrowed | `brewcode/agents/hook-creator.md:370-391,394-429`, specifically placeholders at `:382` and `:415` | An author follows either template and uncomments a later structured decision without deleting the earlier `echo '{}'`/`output({})`. The hook emits two JSON objects, so structured control is invalid or ignored. | Generated enforcement hooks can fail open. Make the placeholder a mutually exclusive return branch or remove the unconditional output from decision templates. This finding is limited to the two exact template placeholders, not every hook the agent might author. |
| BC-A02 | Medium | `hook-creator.md:446-456,537` | “Always output `{}` on error” and “default to allow” are applied to a security/invariant gate. Malformed input or an internal exception becomes permission to continue. | Policy hooks generated by this agent. Require the author to choose fail-open vs fail-closed from the protected invariant; retain fail-open only for advisory hooks. |
| BC-A03 | Medium | `brewcode/agents/bc-rules-organizer.md:34-36,67,159-170`; `brewcode/skills/rules/SKILL.md:184-190` | The agent claims it can extract CLAUDE.md rules into path-specific files but categorically skips every concept already in CLAUDE.md and is told never to edit CLAUDE.md. A migration request produces no migrated rules. | Rule extraction/migration only. Add an explicit transactional migration mode that writes the target rule and removes/updates the source after confirmation, or remove the capability claim. |
| BC-A04 / BCOP03 | Medium | `bc-rules-organizer.md:78,99-119,173-189,245-252,267-273`; `brewcode/skills/rules/scripts/rules.sh:115-133`; official `docs/hooks.md:1231-1247` | The organizer correctly says global safeguards need no `paths`, then its checklist requires `paths` on all files; the script renders `avoid.md` and `best-practice.md` with `paths:["**/*"]`. In 2.1.233 conditional rules load on `path_glob_match`, not at session start. | Project-wide safeguards can be absent during initial planning/search/delegation. Omit `paths` for main rules and reserve it for specialized files; test `InstructionsLoaded.load_reason=session_start`. |
| BC-A05 | Medium | `brewcode/agents/bash-expert.md:100-103` | With `jq` absent, the Python fallback is shown without redirecting `file.json` to stdin; if Python is also unavailable, the last fallback uses GNU-only `grep -P` despite the agent targeting macOS. JSON extraction fails or waits on the wrong stdin. | Every generated portable shell script using this fallback. Use one available parser with explicit stdin/file argv and fail clearly; do not pretend regex is a JSON parser. |

### Re-verification — BC-A01-BC-A05

**BC-A01** — **VERDICT:** CONFIRMED | **SEVERITY (final):** High
**WHY:** Template status verified: `HC:382` `echo '{}'` and `HC:415` `output({});` are both unconditional and both sit inside the fenced "### Bash Hook Template" / "### JS/mjs Hook Template" blocks the agent copies into every generated hook, violating `HC:451` ("exactly ONE JSON object to stdout"). Bash has `set -euo pipefail` and no `exit` after `:382`, so both objects really do print.
**FIX DIRECTION (decided):** Make the placeholder mutually exclusive rather than additive — comment out `:382`/`:415` so exactly one branch must be uncommented, or wrap in `if/else`. Test-worthy: emit both templates with one decision branch enabled and assert stdout parses as exactly one JSON object.

**BC-A02** — **VERDICT:** NARROWED | **SEVERITY (final):** Low (was Medium)
**WHY:** Narrowed claim — `HC:450,456,537` all sit under "Best Practices / Fail-Safe Design", and upstream offers no fail-closed rule (`hooks:880` only warns against mixing exit codes with JSON). Fail-open is the Claude Code idiomatic default; what is missing is a carve-out, not a wrong default.
**FIX DIRECTION (decided):** Add one sentence — fail-open for advisory/context hooks; a hook enforcing a hard invariant emits the deny with the exception as `reason`. Do not restructure the section.

**BC-A03** — **VERDICT:** NARROWED | **SEVERITY (final):** Low (was Medium)
**WHY:** Narrowed claim — the capability claim at `bc-rules-organizer.md:35` is a pure no-op, not a data hazard: `:67`, `:165`, `:169`, `:233` all forbid CLAUDE.md as a source, `:18` caps write access at `.claude/rules/`, `/brewcode:rules` has no migration mode, and the dedup check fires first in every branch. No path writes a CLAUDE.md-sourced rule; nothing is touched.
**FIX DIRECTION (decided):** Reword `:35` to name CLAUDE.md as the dedup baseline, never a source. The transactional-migration option stays rejected — it needs a new mode, new write scope, and rollback semantics that do not exist.

**BC-A04 / BCOP03** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** Re-read against disk: `bc-rules-organizer.md:271` demands `paths:` on all files while `:103,115-119,175-176,251` say main rules carry none, and `rules.sh` renders both main files with `paths: ["**/*"]`, which in 2.1.233 loads on `path_glob_match` rather than at session start.
**FIX DIRECTION (decided):** Emit main `avoid.md`/`best-practice.md` with no `paths:` line, fix checklist `:271`, and extend `validate_file`'s repo-wide rejection to `main`, inverted. Test with `InstructionsLoaded.load_reason=session_start`.

**BC-A05** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** The first pass's deflation rested on Claude Code's ugrep shadow rescuing the script; it does not. `grep` is a non-exported shell function, so a generated `#!/bin/bash` script run from inside the Bash tool resolves `/usr/bin/grep` and dies `invalid option -- P`, rc=2. The Python link is independently broken: reading `file.json` from stdin hangs (rc=124 under `timeout 3`). Two of three documented fallback links are non-functional.
**FIX DIRECTION (decided):** Rewrite `:102` as an explicit-argv chain with a hard failure — `jq -r '.key' file.json` -> `python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["key"])' file.json` -> `echo "need jq or python3" >&2; exit 1`. Drop `grep -oP` entirely.

## General operational findings BCOP01-BCOP10

All rows are **2/2 confirmed**. `BCOP03` is the combined `BC-A04 / BCOP03` row above.

| ID | Severity | Evidence | Trigger/state and actual outcome | Blast radius and minimal fix |
|---|---:|---|---|---|
| BCOP01 | Medium, npm-only | `brewcode/package.json:17-35` | Normal `npm publish` runs `prepublishOnly`, whose build executes `cd runtime`; that directory does not exist. Repository metadata also points to `github.com/user/...`. Claude plugin loading does not run this lifecycle. | npm distribution only, not installed Claude runtime. Remove obsolete runtime/build entries and correct URL, or restore the pinned runtime. Add lifecycle-enabled `npm pack` CI. |
| BCOP02 | Medium | `brewcode/skills/agents/SKILL.md:44-51,191-210`; official `docs/plugins-reference.md:658-666` | In an ordinary target project, listing reads `<cwd>/brewcode/agents` and plugin-scope creation writes there. Shipped plugin agents under the installed root are missed. | Agent inventory and plugin-scope create/improve. List `${CLAUDE_PLUGIN_ROOT}/agents`; remove installed-cache mutation or make plugin-authoring scope explicitly development-only. |
| BCOP04 | Medium | `brewcode/skills/rules/scripts/rules.sh:260-305` | Prefix `../../outside` creates rule files outside `.claude/rules` when those targets are absent. | Two newly created Markdown files can escape into project/parent paths. Enforce a simple identifier and canonical containment before writing. |
| BCOP05 | Low | `brewcode/skills/skills/scripts/list-skills.sh:44-59,98-115`; official `docs/skills.md:320-337` | An omitted `user-invocable` is treated false although the default is true; accepted values such as `yes/on/1` are also misread. Ordinary skills are labeled AI-only. | Inventory/status accuracy. Normalize official booleans and documented defaults. |
| BCOP06 | Medium | `brewcode/skills/setup-status/SKILL.md:69-88,482-492,510-564,652-656`; `brewcode/.claude-plugin/plugin.json:1-4` | Fresh/current artifacts with `content_version=5.6.0` under plugin 5.7.0 are compared to release-wide 5.7.0 and reported stale even when the current plugin source carries the same 5.6.0. | Teams, superreview, and other stamped setup rows; unnecessary repair/upgrade advice. Compare installed content version to the same artifact's current source carrier, using plugin release only as legacy fallback. |
| BCOP07 | Medium | `brewcode/skills/e2e/SKILL.md:10,65-78`; `scripts/detect-mode.sh:33-43,97-101`; `references/mode-install.md:142-178`; `mode-status.md:21-32,79-95`; `mode-rules.md:16-20,135-149` | Fresh install stamps plugin 5.7.0/content 5.6.0; status compares content to plugin and recommends rules; rules omits content_version from its restamp table, so the next status repeats forever. | Every current E2E install/status cycle; unnecessary research and rewrites. Compare to `CONTENT_VERSION` and explicitly preserve/restamp it on every listed artifact. |
| BCOP08 | Medium | `brewcode/skills/teams-setup/scripts/toggle-team.sh:35-61`; `verify-team.sh:169-205`; `references/cleanup-flow.md:107-119,138-162` | A roster row such as `../../README` is interpolated into move/read/delete paths. Disable can move `README.md`; uninstall/purge can delete it despite the confirmation naming only team agents. | Reachable `.md` files in the project or parents. Validate agent identifiers and canonical containment before dry-run, verification, move, or delete. |
| BCOP09 | Medium | `brewcode/skills/superreview-setup/scripts/generate.sh:375-408,467-559`; `brewcode/skills/teams-setup/SKILL.md:289-310` | A valid unstamped hand-written `intent-guard` containing `{REQUEST_ID}` is classified BROKEN before provenance is checked and is replaced from the template without file-specific confirmation. | Complete loss of that user-authored agent. Determine ownership first; unknown/foreign nonempty files must be reused or reported as conflicts, never overwritten. |
| BCOP10 | Low | `brewcode/skills/convention/scripts/convention.sh:118-148`; `brewcode/skills/convention/SKILL.md:86-99` | `total_files` sums only the top ten extension buckets. This repository reports 3203 versus 3550 matching files; a sufficiently polyglot repository can also miss the >1000 scoped-mode warning. | Convention scope metrics and guidance. Compute total from the full stream and truncate only the histogram. |

### Re-verification — BCOP01-BCOP10

**BCOP01** — **VERDICT:** NARROWED | **SEVERITY (final):** Low (was Medium)
**WHY:** Narrowed claim — the package was never published (`npm view` -> E404, registry HTTP 404), so the failure is deferred to the first `npm publish` rather than live. It is still a real defect: `package.json` ships inside the plugin and `bump-version.sh` rewrites two of its fields every release, while its script block has been dead since the runtime was dropped, and `repository.url` is the placeholder `github.com/user/...`.
**FIX DIRECTION (decided):** Local four-line JSON edit — delete `scripts.build` and `scripts.prepublishOnly`, delete the two `runtime/*` entries from `files[]`, set `repository.url` to `https://github.com/kochetkov-ma/claude-brewcode.git`. Restoring a runtime is rejected. Do not add lifecycle-enabled `npm pack` CI before this edit.

**BCOP02** — **VERDICT:** NARROWED | **SEVERITY (final):** Low (was Medium)
**WHY:** Narrowed claim — the report's "installed-cache mutation" is false: `rg 'CLAUDE_PLUGIN_ROOT|plugins/cache' brewcode/skills/agents/` returns zero hits. The only literals are cwd-relative (`SKILL.md:50` list globs, `:192` create-scope option), so neither the plugin root nor the install cache is ever resolved. The real, smaller defect is that in a consumer repo `brewcode/agents/` does not exist, hiding shipped plugin agents from list/status, and the "Plugin" create option writes a junk `<cwd>/brewcode/agents/<name>.md`.
**FIX DIRECTION (decided):** Add `${CLAUDE_PLUGIN_ROOT}/agents/` as a read-only fourth list source; gate the "Plugin" create option on `test -d brewcode/.claude-plugin`, otherwise drop the option.

**BCOP04** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** Re-reproduced: `rules.sh create-specialized '../../../escaped' '["src/**"]'` lands two files one level above the project root. The escalation route is closed — `create_specialized` guards both renders with `if [ ! -f "$file" ]` and prints "Preserved: … (exists)", so it litters but never clobbers. The only value filter is the `**/*` paths check, which never inspects `$prefix`.
**FIX DIRECTION (decided):** Reject a prefix not matching `^[a-z0-9][a-z0-9-]*$` before `mkdir`/render, mirroring the existing `-z "$prefix"` guard — one `case` plus `exit 1`.

**BCOP05** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Low
**WHY:** Both halves now verified from the shipped native binary (the npm tarball is a wrapper, which is why the first pass found nothing): `user-invocable === void 0 ? true : oRr(...)` confirms default true, and `Ln`/`af` accept `1|true|yes|on` and `0|false|no|off` case-insensitively. `list-skills.sh:46-58` tests `== "true"` only, so absent, `yes`, `on`, `1`, `True`, `TRUE` are all mislabeled AI-only — including for third-party skills, since the script also scans `~/.claude/skills` and the whole plugin cache.
**FIX DIRECTION (decided):** Match Claude Code exactly — absent -> `true`; otherwise lowercase-trim and test against `1|true|yes|on`. Same shape for `disable-model-invocation` (absent -> `false`, falsy set `0|false|no|off`).

**BCOP06** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Low (was Medium)
**WHY:** The false `BEHIND` is live today and the count is exactly 7: `brewcode/skills/{e2e,teams-setup,superreview-setup}`, `brewdoc/skills/{docsync-setup,md-to-pdf,memory-sync-setup}`, `brewtools/skills/task-board-setup` carry `content_version=5.6.0` under `version=5.7.0`, with zero at 5.7.0. Installers self-locate `{CONTENT_VERSION}` off the same line-10 marker, so a fresh, fully current install is stamped 5.6.0 and `stamp_one` prints `BEHIND 5.6.0 -> 5.7.0`. Low because the consequence is a wrong status label plus unnecessary repair advice. Note the stamp lives in the `<!-- brewcode-meta: … -->` marker, not YAML frontmatter.
**FIX DIRECTION (decided):** Add a plugin-side source path per `STAMPS` row (same shape as the existing `cmp` pairs), read that file's `content_version`, compare installed-vs-source, and keep `$PLUGIN_VER` only as the fallback for unwired rows.

**BCOP07** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** All three legs re-verified: `detect-mode.sh` emits 5.7.0/5.6.0; `mode-status.md:25-32` compares the stamped `content_version` against the `PLUGIN_VERSION:` line, so its recommendation always fires; and `mode-rules.md:139-143` omits `content_version` from all four restamp rows, so `rules` cannot clear what `status` flagged. The same file's `:145-149` note states the loop-avoidance intent the table defeats.
**FIX DIRECTION (decided):** Two one-line edits — point `mode-status.md` T3 and its recommendation at the `CONTENT_VERSION:` line (which `mode-rules.md` L1 already uses correctly), and add `content_version` to all four rows of the L5 restamp table.

**BCOP08** — **VERDICT:** CONFIRMED | **SEVERITY (final):** High (was Medium)
**WHY:** Reproduced independently against the canonical roster shape (`references/framework-files.md:34`, Agent = column 1): a row `| ../../../outside/README |` produced `MOVED:.claude/agents/../../../outside/README.md -> ….md.disabled`, renaming a file outside the project while the run printed a cheerful `MOVED:`. Depth arithmetic confirmed by execution — 3+ levels leave the project. `intent-guard` is the only filtered value, by exact string match at `toggle-team.sh:51`. Raised to High for consistency with BCOP09: same class, destructive to user files, no confirmation. Additional note: the parse is column-position-based, so roster column drift is a separate silent-misparse bug on the same line.
**FIX DIRECTION (decided):** One shared guard in the roster loop before any probe/move/delete — `case "$agent" in ''|*/*|*..*|.*) echo "SKIP:invalid agent id"; continue;; esac` plus `^[a-z0-9][a-z0-9-]*$` — mirrored into the `cleanup-flow.md` delete/purge steps. Test-worthy: fixture `team.md` in canonical 7-column shape with `../../../x`, assert nothing outside `.claude/agents/` is moved or removed.

**BCOP09** — **VERDICT:** CONFIRMED | **SEVERITY (final):** High (was Medium)
**WHY:** Reproduced with a control that isolates the cause. A 10-line hand-written `intent-guard.md` with correct frontmatter and one `{REQUEST_ID}` token went to 199 lines with zero backups; the byte-identical control with the token replaced by prose returned `REUSE`, md5 unchanged. `_ig_kind` (`:399-409`) tests `! -s` / missing `name:` / `_scan_tokens` before the stamp probes, so `FOREIGN` at `:408` is unreachable for any token-bearing file, and `write_intent_guard` falls through BROKEN to a bare `mv` at `:557`. Deliberate design, still unannounced data loss.
**FIX DIRECTION (decided):** Order provenance first — no current tail anchor and no retired stamp -> FOREIGN -> REUSE untouched, report the tokens as a conflict. Reserve BROKEN for files that are ours (stamp present) or empty. If recreation is kept, `cp` to `<path>.bak-<ts>` and require explicit per-file confirmation. Test-worthy: unstamped `intent-guard.md` containing a `{TOKEN}` must be byte-identical after `emit-agent`.

**BCOP10** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Low
**WHY:** Numbers reproduce to the digit: `convention.sh scan` -> `"total_files": 3203`; the identical `find` predicate without `head -10` -> 3550. `convention.sh:119-132` sums from the already-truncated top-10 histogram and feeds the `> 1000` gate at `SKILL.md:86`.
**FIX DIRECTION (decided):** Count once from the full stream and apply `head -10` to the histogram only.

## Semble setup findings SS01-SS10

All rows are **2/2 confirmed**. Semble 0.5.5 is not a finding; see non-findings.

| ID | Severity | Evidence | Trigger/state and actual outcome | Blast radius and minimal fix |
|---|---:|---|---|---|
| SS01 | High | `brewcode/skills/semble-setup/scripts/lib/semble-common.sh:66-72,310-313`; generated assets `semble-session.mjs:153-164`, `semble-reminder.mjs:448-459`, `semble-prefetch.mjs:581-592`, `semble-stats.mjs:221-232`, `semble-subagent.mjs:177-188`; stable-root instructions `docs/hooks.md:708-718`, `skills.md:390-417,641-646` | After session cwd moves into a nested package, all five hook assets resolve config/state/cache relative to mutable cwd and can create/read a second nested `.claude/semble`. | The complete Semble hook suite can silently stop using the installed root. Capture/pass `${CLAUDE_PROJECT_DIR}` or a self-located canonical root; use event cwd only for relative tool inputs. |
| SS02 | Medium | `scripts/semble-status.sh:554-573,720-769,899,935-938`; required skipped-smoke behavior at `brewcode/skills/semble-setup/SKILL.md:487` | Status reports ready from `mcp=correct` plus `phase=ready`, then checks only a limited retired/stale/wiring/content-version subset. It reads but does not use completed state, smoke, permissions, guidance rule/file, cache, or agent readiness. An incomplete or unverified installation can therefore report ready and pass strict status; skipped smoke is one direct contradictory case. | Status and automation can proceed on an installation that has not passed the required checks. Derive one authoritative readiness predicate from every required check and use it for display and strict exit. |
| SS03 | High | `scripts/semble-project.sh:231-243,577-617,638-680,734-765` | Reindex deletes the current index, then an offline package warm returns `skipped/0`; warm accepts `ok|skipped`, enable ignores `SP_FAILED`, and state is written ready. | Usable index loss plus a false-ready installation. Never delete the live index before a staged replacement is ready; treat skipped/0 and sub-process failure as non-ready and restore/preserve the prior index. |
| SS04 | High | `scripts/semble-agents.sh:23-25,209-233,302-310,379-410`; `tests/suite-agents.sh:426-477` | The plan promises owned-only cleanup, but add cannot record which same-name files pre-existed and remove strips all planned agents. A user agent that existed before setup can be deleted. | Pre-existing `.claude/agents/*.md` sharing generated names. Record ownership/hash before add and remove only files proven generated and unchanged; update the test that currently codifies loss. |
| SS05 | Medium, narrowed | `scripts/semble-mcp.sh:68-79,361-390`; `scripts/semble-remove.sh:236-249,311-329,369-390` | Unqualified remove/purge defaults to user scope and removes only the selected/detected registration, potentially leaving another project/local registration active while reporting removal. Explicit `mcp --scope X` may intentionally target one scope and is not defective. | Lifecycle completeness for unqualified remove/purge. Enumerate all installed scopes, show them, and remove the confirmed set; keep explicit-scope behavior. |
| SS06 | High | `scripts/semble-mcp.sh:169-179,337-345`; tests `:990-1023` | Reinstall backs up config, destructively removes all MCP entries, then a failed add exits without restoring the backup. Existing working registration is lost. | Semble MCP availability across the affected scope. Stage/validate the new registration or restore the backup on every add failure; add the missing rollback test. |
| SS07 | Medium, narrowed | `scripts/semble-mcp.sh:303-309,351-354`; hook suppressions `semble-reminder.mjs:313-315`, `semble-prefetch.mjs:334-336`, `semble-subagent.mjs:121-123` | In missing/legacy/self-healed state, successful repair does not patch the completed `mcp` flag, so hooks continue suppressing behavior even though MCP now works. Ordinary prior installs retain the flag, and resume later may self-heal it; those cases are excluded. | Repaired legacy/missing-state installations only. On successful repair, update completed state atomically and run the same readiness check used by add/resume. |
| SS08 | High | `scripts/semble-guidance.sh:778-800,832-850,863-903` | Conflict cleanup applies generalized tool-first regexes and a `KEEP` keyword whitelist line by line. A conditional offline fallback is removed when its line matches a generalized tool-first regex and lacks a whitelisted keyword, even though its condition makes it semantically compatible. | The active `semble-first` guidance rule and offline search fallback. Classify conditional fallback lines before regex deletion, preserve compatible unique behavior, and require explicit resolution for semantic conflicts. |
| SS09 | Medium | `scripts/semble-status.sh:674-675`; `tests/suite-integration.mjs:445-449` | Runtime now returns `content_version` and `templateContentVersion`; the integration test expects the older exact object and fails. Aggregate result is 144/145. | CI signal only, not runtime setup behavior. Update the exact expected shape and retain assertions for both new keys. |
| SS10 | Low | `scripts/semble-mcp.sh:190`; `tests/run.sh` | `# shellcheck disable=SC2086 -- explanation` is malformed ShellCheck directive syntax, so adding ShellCheck fails on the directive instead of the script. Existing test runner has no shell lint gate. | Shell validation/CI. Use a valid directive with explanation on a separate comment line and add a targeted ShellCheck step. |

### Re-verification — SS01-SS10

**SS01** — **VERDICT:** CONFIRMED | **SEVERITY (final):** High
**WHY:** Reproduced verbatim, and stronger than reported: `rg CLAUDE_PROJECT_DIR` over the whole skill returns zero hits, so setting the variable today changes nothing. With cwd moved to a nested package all three probed hooks return bare `{}`, no second `.claude/semble` is created, and telemetry is silently dropped. The shell half has the same shape — `sc_project_root()` = `${SEMBLE_PROJECT_ROOT:-$PWD}`.
**FIX DIRECTION (decided):** One resolver per asset, `CLAUDE_PROJECT_DIR -> selfLocate() -> input.cwd -> process.cwd()`, replicated across the same five `.mjs` files in the same `main()` position; self-location is free because install wires the hooks by absolute path under `$(sc_project_root)/.claude/hooks`. Extend the same resolver to `sc_project_root()` in the same commit. Stays one work unit — a shared module is rejected. Test-worthy.

**SS02** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** The verdict ladder at `semble-status.sh:720-732` reads only `mcpSec.state` and `stateSec.phase`; `stateSec.completed`, `guidSec.rule`, `guidSec.claudeMd`, `guidSec.permissionsWired`, `cacheSec` and `agentsSec` are assembled and never consulted, and `SKILL.md:487`'s required `partial — smoke skipped (<reason>)` string is structurally unreachable. Corroborated live by the SS03 repro, where `completed=[mcp,warm,smoke]` survived a reindex that rebuilt nothing.
**FIX DIRECTION (decided):** Extend the same `if (verdict === "ready")` downgrade chain with the checks already assembled, driving both the printed verdict and the exit code from one `required[]` predicate. Purely additive; `suite-status.mjs` fixtures that reach `ready` on a partial state must be updated. Test-worthy.

**SS03** — **VERDICT:** CONFIRMED | **SEVERITY (final):** High
**WHY:** Reproduced byte for byte: `✅ semble reindex: ok`, `phase: ready`, `EXIT=0`, with the index gone and `completed` untouched. The four-place claim is confirmed — `case "$status" in ok|skipped)` at `:596`, `:635`, `:675`, `:760` — and `sp_mode_enable` derives `final` from the warm status alone, so an `sp_failed` from guidance or agents cannot make the run non-ready.
**FIX DIRECTION (decided):** Verify reachability and warm into a staging location before deleting; delete only on proven success. One `sp_status_ready()` predicate accepting `ok` only, used in all four places; fold `SP_FAILED` into `final` in `sp_mode_enable`; on a skip leave index and phase untouched and say why. Test-worthy.

**SS04** — **VERDICT:** REFUTED (as written) | **SEVERITY (final):** Low (was High)
**WHY:** Nothing in the skill deletes or truncates an agent file — the only `fs.unlink` is `:528`, removing the script's own `.bak.<epoch>` after a clean verify; a full apply/revert cycle went 2 files in, 2 files out. The report's cited evidence `tests/suite-agents.sh` does not exist and `scripts/semble-agents.sh:23-25` is inside `usage()`. The surviving narrowed claim: `apply --revert` strips `mcp__semble_code__*` names from a `tools:` list the user authored before install, because `planAdd` records nothing on the `already-present` branch and `planRemove` strips unconditionally. Full refutation evidence in "Rejected on re-verification"; removed from the destructive batch.
**FIX DIRECTION (decided):** Record `agentsPreExisting: {"<relpath>":["<name>"]}` in `.claude/semble/state.json` on the `already-present`/`already-allowed` branches of `planAdd`; `planRemove` subtracts only names this skill inserted, and declines to strip when the map is missing. Flip the two `revert.preExisting*` assertions in `suite-agents.mjs` from "documented loss" to "preserved". Test-worthy.

**SS05** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** Strengthened from a static argument to a live repro: with only project scope holding `semble_code`, `remove --yes --json` printed `{"status":"ok","scope":"user",...}` and exit 0 while `.mcp.json` came out byte-identical — the registration keeps serving while the caller is told removal succeeded. `mcp_scopes()` already enumerates all three scopes and is used by `repair`, just not by `remove`.
**FIX DIRECTION (decided):** Unqualified `remove`/`purge` iterates `mcp_scopes "$DUMP"`, prints the full scope list in the confirmation plan, removes the confirmed set, and re-verifies all of them; explicit `--scope X` stays single-scope. Now rated test-worthy (overriding the first pass): a false `ok` plus exit 0 is exactly what a fixture pins, at ~5 lines of fix and ~10 of test.

**SS06** — **VERDICT:** CONFIRMED | **SEVERITY (final):** High
**WHY:** Both halves reproduced in one isolated run: `repair --yes --json` with a failing `add-json` exited 1 with `mcpServers` empty and no restore, and the backup path was written to disk but never printed — `mcp_backup_configs:169-179` gates both echoes on `[ "$JSON" = "0" ]` and `result_json:213-217` has no backup field, while every in-skill caller passes `--json`. Both failure exits are rollback-free. Unrelated `.claude.json` keys survived, so the blast radius is the `semble_code` entry.
**FIX DIRECTION (decided):** Restore both backups on every non-success exit of `repair` (trap or explicit rollback), re-run `sc_mcp_state` after restoring, and add a `backups:[…]` array to `result_json` so the path is emitted in both modes. Suite case: force `run_add_json` to fail and assert the pre-repair config is byte-restored. Test-worthy.

**SS07** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium
**WHY:** Reproduced. `completed:["mcp"]` has exactly one writer tree-wide — `semble-mcp.sh:308`, the `add` success branch — and `repair` calls `mcp_checkpoint` (phase only). Three hooks carry byte-identical gates (`semble-reminder.mjs:314`, `semble-prefetch.mjs:335`, `semble-subagent.mjs:122`); on a state file shaped as `mcp_checkpoint` writes it the subagent hook returns `{}`, and adding `completed:["mcp"]` restores the full brief. `semble-session.mjs` is ungated and fires either way, which disguises the failure as partial health.
**FIX DIRECTION (decided):** On a successful `repair`, patch `{scope,cacheRoot,completed:["mcp"]}` with the same payload `add` uses, re-run `sc_mcp_state`, and only then emit `ok`. Now rated test-worthy (overriding the first pass): the gate is duplicated in three assets against a single-line writer.

**SS08** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Medium (was High)
**WHY:** Reproduced verbatim — the unique conditional line ("When the semble MCP is offline or the index is cold…") was deleted while the redundant line survived and a near-identical third line landed in the existing `W`/weak bucket and was preserved. Deflated to Medium because every mitigation checks out: `sc_backup "$CLAUDEMD"` runs before the write, each cut is announced, a post-write re-read plus marker-count guard aborts on mismatch, and scope is project `CLAUDE.md` prose only. Attempted re-inflation via `sp_mode_enable` discarding guidance output was rejected — the `.bak.<epoch>` still lands next to the file.
**FIX DIRECTION (decided):** Route a leading conditional (`when/if/unless/while/on <state>/fallback/offline/cold/unavailable` before the tool-first clause) into the existing `weak`/`W` bucket ahead of the drop decision. Separately, stop swallowing guidance output in `sp_mode_enable`. Test-worthy.

**SS09** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Low (was Medium)
**WHY:** Re-ran the suite: the sole failure across 1790 assertions is `FAIL guidance: keys`, with `actual` carrying `content_version` + `templateContentVersion` and the expected list at `suite-integration.mjs:445-449` missing both. The assertion's own message string already describes the new stamp pair, which is positive proof of a stale fixture rather than a runtime defect. CI signal only.
**FIX DIRECTION (decided):** Add both keys to the expected list plus two value assertions (both non-empty; equal on a fresh install) so the pair cannot silently drop out.

**SS10** — **VERDICT:** CONFIRMED | **SEVERITY (final):** Low
**WHY:** Substance holds — exactly one malformed directive tree-wide at `semble-mcp.sh:190`, and `tests/run.sh:38-59` iterates only `suite-*.mjs` with no shell-lint step. One metric corrected: shellcheck 0.11.0 reports **2** errors (SC1073 + SC1072), not 4; the default formatter prints those 2 findings across 4 output lines. Every other shell file is clean.
**FIX DIRECTION (decided):** Split into a bare `# shellcheck disable=SC2086` plus a separate `#` comment line, and add `shellcheck -S error scripts/*.sh scripts/lib/*.sh tests/run.sh` to `run.sh`, guarded by `command -v shellcheck` (skip-not-fail when absent).

## Core hooks BC-H01-BC-H02

Both rows are **2/2 confirmed**. BC-H01 is intentionally separate and narrower than canonical Semble SS01.

| ID | Severity | Evidence | Trigger/state and actual outcome | Blast radius and minimal fix |
|---|---:|---|---|---|
| BC-H01 | Medium, narrowed | `brewcode/hooks/session-start.mjs:214-234`; `brewcode/hooks/lib/utils.mjs:80-100,173-223` | After `cd`, stateful core SessionStart paths accept hook input cwd as project root. Config, version state, logs, and `/clear` plan-link work can move under a nested `.claude`. Forced-eval and role-recall do not broadly disappear, so the defect is limited to stateful consumers of shared utils. | Core status/config/log/plan-link state. Capture the stable project root once and pass it to shared stateful helpers; retain current cwd only where semantically required. |
| BC-H02 | High | `brewcode/hooks/session-start.mjs:37-65,229-234` | On `/clear` with a fresh global plan, `linkLatestPlan()` unconditionally `unlinkSync`s `.claude/plans/LATEST.md` and replaces it without `lstat`, ownership marker, target validation, or backup. A regular user file or foreign symlink at that exact path is deleted. | One user-owned project file/link per clear. Replace only a symlink proven to have been created by this hook; otherwise report conflict and preserve it. |

### Re-verification — BC-H01-BC-H02

**BC-H01** — **VERDICT:** NARROWED | **SEVERITY (final):** Low (was Medium)
**WHY:** Narrowed claim — the mechanism is real (`session-start.mjs:222` `cwd = input.cwd || process.cwd()` threaded into `loadConfig`/`getState`/`saveState`/`log`/`linkLatestPlan` at `lib/utils.mjs:90,175,199,216`, with zero `CLAUDE_PROJECT_DIR` hits under `brewcode/hooks/`), but the consequence is bounded, self-healing and non-destructive: misplaced config/state/log files, nothing lost.
**FIX DIRECTION (decided):** One line, per D1's canonical recipe — resolve a `projectRoot` once (`CLAUDE_PROJECT_DIR` -> git toplevel -> upward `.git`/`.claude` walk -> `cwd`) and pass it to all five helpers instead of `cwd`; keep `input.cwd` only for resolving relative paths out of `tool_input`. Same edit supplies the stable root BC-H02's fix needs.

**BC-H02** — **VERDICT:** CONFIRMED | **SEVERITY (final):** High
**WHY:** Reproduced end to end against a redirected `HOME`: a hand-written regular file at `<cwd>/.claude/plans/LATEST.md` was deleted and replaced by a symlink, with no backup, no prompt, and the hook logging it as SUCCESS. All five preconditions isolated by negative control (`source: startup` survives, plan mtime >60 s survives, a directory at the path survives). The cross-repo case reproduces too — one project's `LATEST.md` destroyed and repointed at another project's plan. Same defect class as BCOP09 and strictly worse on trigger: it fires on a bare `/clear`, driven by a global freshness gate the project does not control.
**FIX DIRECTION (decided):** Before deleting, `lstatSync(latestLink)` and proceed only if `isSymbolicLink()` and `readlinkSync()` resolves inside the plans dir this hook owns; anything else is left in place with `log('warn', …)`. Replace the bare `catch {}` with a logged catch, and fold in the `plansDirectory` fix (see new findings). Test-worthy, destructive class.

## Deduplication decisions

- `BC-A04` and `BCOP03` are one finding: contradictory creator guidance is the authoring cause; `rules.sh` is the concrete emitted behavior. It is counted once.
- Canonical-root defect `SS01` covers all five Semble hook assets. `BC-H01` remains separate only for stateful core SessionStart/shared-utils consumers and does not claim all core hooks disappear.
- Agent-creator scope/cwd guidance is not repeated as BCOP02: A8 concerns definition precedence; BCOP02 concerns a literal operational path in `/brewcode:agents`.
- `BCOP06` and `BCOP07` are separate: the first is the shared setup-status comparator; the second is a self-contained E2E install/status/remedy loop.

## Direct preventive tests to add

Only tests that directly prevent a retained defect are listed.

1. **Creator contract fixtures**
   - Parse every generated agent/skill frontmatter field against the 2.1.233 accepted schema for local and plugin scopes.
   - Resolve tool pools for foreground, background, fork, teammate, and no-Task-tool sessions.
   - Exercise hook event fixtures for H01-H14, including exact input/output schema validation and plugin-scoped MCP names.
   - Run skill eval cases in fresh paired sessions with and without the skill.

2. **Rules and agent management**
   - Observe main rules loading with `InstructionsLoaded.load_reason=session_start`; specialized rules must load on `path_glob_match`.
   - Reject `../x`, `a/b`, absolute, and control-character rule prefixes and roster agent names; assert an external sentinel remains byte-identical.
   - Invoke `/brewcode:agents` from a fixture project outside the plugin checkout and assert shipped agents are listed without creating `fixture/brewcode/`.

3. **Freshness/status contracts**
   - Installed content version equal to current source content version, both below plugin release, must be current.
   - E2E install -> status -> rules -> status must remain current before and after rules.
   - Skill inventory fixtures must cover omitted and every accepted boolean spelling.
   - Convention fixture with >1000 files across >10 extensions must return the exact total and scoped-mode warning.

4. **Ownership and destructive lifecycle**
   - Foreign `intent-guard` containing `{REQUEST_ID}` must return REUSE and preserve its hash.
   - Foreign team agents and `.claude/plans/LATEST.md` must survive disable/remove/clear unless a valid ownership marker proves BREWCODE ownership.
   - MCP add failure after removal must restore the exact previous registration.
   - Agent add/remove must preserve pre-existing same-name files.

5. **Semble root/state transitions**
   - Run each of the five hooks after cwd changes and assert every config/state/cache path stays under one canonical project root.
   - Offline reindex with a healthy prior index must preserve the old index and report non-ready/failure, never ready.
   - A fixture with `phase=ready` and correct MCP but skipped smoke, missing permissions/rule/file/cache/agents, or incomplete completed state must report partial/not-ready and fail strict status.
   - Repair of missing/legacy state must atomically set completed MCP and immediately unsuppress hooks.
   - Guidance conflict fixtures must retain a valid offline fallback unless the user explicitly rejects it.

6. **Packaging and shell gates**
   - Run lifecycle-enabled `npm pack` in CI.
   - Add ShellCheck for Semble shell scripts with valid directive syntax.
   - Test hook output at 9,999 and 10,001 characters and exec-form paths containing spaces/apostrophes.

## Recommended correction order

1. **Update the three creator agents first.** Fix A3-A4, H01-H14, F1/F4/F9, then regenerate or manually reconcile their reference tables. Otherwise new artifacts will continue reproducing stale contracts.
2. **Protect destructive and data-loss boundaries.** Fix SS03, SS04, SS06, BC-H02, BCOP08, and BCOP09 before status/cosmetic accuracy work.
3. **Stabilize Semble project-root and readiness semantics.** Fix SS01, SS02, SS07, and SS08 around one canonical root and one authoritative state transition model.
4. **Correct generated global rules and traversal boundaries.** Fix combined BC-A04/BCOP03, BCOP04, and BCOP02.
5. **Eliminate false status loops.** Fix BCOP06, BCOP07, BCOP05, BCOP10, SS09, and BC-H01.
6. **Close bounded distribution/portability gaps.** Fix BCOP01, BC-A05, SS05, SS10, and the remaining Low creator-knowledge items.

## Rejected items and non-findings

- **F11 packaging/distribution duplication:** rejected as scope creep; it is not in the retained ledger.
- **Semble 0.5.5:** update intelligence only. No defect is inferred merely because a newer Semble package exists.
- **SS05 explicit scope removal:** `mcp --scope X` may intentionally remove only X. The finding applies only to unqualified removal/purge that presents itself as complete.
- **SS07 ordinary prior installs:** they retain completed MCP state and resume may later patch it. The finding is limited to missing/legacy/self-healed state.
- **BCOP01 Claude runtime:** the missing npm runtime does not break Claude Code loading of the repository/marketplace plugin; the defect is npm publication only.
- **BCOP10 current threshold:** this repository's undercount still exceeds 1000, so the warning currently fires. The exact metric is still false, and the threshold can fail in a distributed-extension fixture.
- **BC-A01 broad hook output claim:** only the exact unconditional placeholders at `hook-creator.md:382` and `:415` are retained.
- **BC-H01 broad core-hook disappearance:** rejected. Only stateful SessionStart/shared-utils consumers are retained.
- **Global-rule duplicates:** creator inconsistency and concrete `rules.sh` output are one finding, not two.
- **Plugin validators and syntax checks:** they pass. This does not reject semantic findings whose trigger lies beyond manifest/parser validation.
- Every other hypothesis that one verifier rejected, could not reproduce, or could support only as a preference was dropped rather than downgraded to “suspected.”

## Corrections to this report's own evidence

Errors in this report's own citations and metrics, found by re-verification. Each correction is
binding on the fix wave; the finding it belongs to keeps its ID.

| # | Report claim | Correction |
|---|---|---|
| 1 | "The Semble aggregate suite passed 144/145 checks" (Validation performed) | Wrong as an aggregate. 144/145 is `suite-integration` alone. The true aggregate is **1789/1790 across 7 suites** (agents 243, core 335, hooks 557, integration 145, project 124, status 278, telemetry 108); the sole failure is `guidance: keys` = SS09. |
| 2 | SS04 evidence `tests/suite-agents.sh:426-477` | That path does not exist — the file is `tests/suite-agents.mjs`. The cited script lines `scripts/semble-agents.sh:23-25` are inside `usage()`; the real mechanism is `planAdd` at `:302-310` and `planRemove` at `:379-410`. |
| 3 | SS10 "adding ShellCheck fails" implying 4 errors | Two errors, SC1073 + SC1072, on the single malformed directive at `semble-mcp.sh:190`. The default formatter prints those two findings across four output lines, which is where the count of 4 came from. Every other shell file is clean at `-S error`. |
| 4 | F12 evidence `skills.md:1005-1012` | Points at a Python codebase-map script. The malformed-frontmatter statement is at **`skills.md:1028`** ("Claude Code loads the skill body with empty metadata, so `/skill-name` still works but Claude has no `description` to match against"). |
| 5 | H06 "v3.4.70 is a non-existent Claude Code version" | False. `v3.4.70` is a **brewcode** git tag; `RELEASE-NOTES.md:2341` carries `## v3.4.70 (2026-04-11)` and `:2348` documents the protected-path finding as verified empirically in headless `claude -p`. Real provenance, so H06 drops High -> Medium and survives only as version-namespace ambiguity (a brewcode version sitting among Claude Code versions in the same tables) plus a stale April-2026 empirical basis needing re-verification on 2.1.233. |
| 6 | A5 "the 200-cap is current-but-undocumented / was never retracted" | The cap **was removed**. `npm/package-2.1.233/CHANGELOG.md:191` under `## 2.1.224`: "Removed the 200-subagent-per-session spawn cap." Added at 2.1.212, removed at 2.1.224; `docs/sub-agents.md:930` agrees. The report's framing and the first pass were both wrong; the fix must not write "undocumented" or "unenforced". |
| 7 | BCOP02 "remove installed-cache mutation" | The installed-cache mutation does not exist: zero `CLAUDE_PLUGIN_ROOT` or `plugins/cache` references anywhere in `brewcode/skills/agents/`. Only the cwd-relative list/create paths are real. |
| 8 | H16 / `hook-creator.md:300` "blocked in ALL modes" | `${CLAUDE_PLUGIN_DATA}` IS the official persistent writable plugin directory. A `Write`/`Edit` there is classified sensitive and routed to an **ASK** — prompt in default/acceptEdits/plan, auto-approved under `bypassPermissions`, hard-fail in headless `-p` — not a block. `hook-creator.md:300` carries the wrong rule and is the only carrier of it; the `avoid.md` provenance the first pass looked for does not exist. |
| 9 | A3 "the static tool list can fail launch or silently lose required capabilities" | Declaring `AskUserQuestion` in a subagent's `tools:` is **silent and inert** — the removal reports no error and a launch fails only when nothing in `tools:` resolves, which is never the case in the five declaring agents. No failure today, so A3 is Low/cosmetic, not High. The real defect is that `ssh-admin` and `deploy-admin` route their entire destructive-op confirmation contract through a tool subagents never receive; that belongs to the brewtools report. |

## New findings from re-verification

IDs the original audit missed, discovered while re-verifying. Numbering is new and does not collide
with any existing ID.

| ID | Defect | Severity | Evidence | Fix |
|---|---|---:|---|---|
| N1 | SessionStart matcher list missing `fork` | Low | `hook-creator.md:119` lists `startup,resume,clear,compact`; `docs/hooks.md:307` adds `fork` | Add `fork`. Note that the repo's own `role-recall.mjs`/`compact-recall.mjs` match only `compact`, so a `fork` session gets no re-anchor today |
| N2 | StopFailure error-type list missing 3 values, in **two** places | Low | `hook-creator.md:140` and `:500` both omit `overloaded`, `oauth_org_not_allowed`, `model_not_found` vs `docs/hooks.md:319` | Add all three to both rows; the first pass flagged the omission but not the duplication |
| N3 | Notification type list missing **five** values | Low | `hook-creator.md:496` has 4 (`permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`); `docs/hooks.md:310` has 9 — missing `elicitation_url_dialog`, `elicitation_complete`, `elicitation_response`, `agent_needs_input`, `agent_completed` | Add all five |
| N4 | Stale `Ref ver: 2.1.223` in **both** creator agents | Low | `hook-creator.md:21` and `skill-creator.md:19`; `agent-creator.md` has no Ref line but pins "v2.1.223 binary" in prose at `:86` and `:486` | Move all to 2.1.233 in one pass and re-stamp `content_version` |
| N5 | `PostToolBatch` missing from the "No matcher" row | Low | `hook-creator.md:502` lists 9 no-matcher events and omits `PostToolBatch`, which `docs/hooks.md:323` explicitly places in that group | Add `PostToolBatch` to `:502` while filling row 30; compounds H11 |
| N6 | `skill-creator.md:414` mislabels `PostToolUse` "(non-blockable)" | Medium | Contradicted by `docs/hooks.md:1913-1920` (`decision:"block"`) — the same fact H13 raises against `hook-creator`, so the wrong claim is mirrored across two of the three creators | Fix in lockstep with H13, or the agents disagree with each other |
| N7 | Three `skill-creator` self-contradictions | Medium | `:307` (depth 3) vs `:399` (a subagent cannot spawn); `:7` (`tools:` declares `Agent`) vs `:399` (that declaration is ignored); `:508-511` vs `:529` (two different prescribed replacements, see F6) | Resolve as one pass with F4 and F6; checkable with zero upstream evidence and the cheapest regression guard for this file |
| N8 | `linkLatestPlan` hardcodes `join(homedir(), '.claude', 'plans')` and ignores the `plansDirectory` setting | Low | `brewcode/hooks/session-start.mjs:38`; `rg plansDirectory brewcode/` -> zero hits in shipped code; `docs/settings.md:308` documents the setting, default `~/.claude/plans`, path relative to project root | With `plansDirectory` set, the hook scans a directory the user no longer writes to and the whole feature silently no-ops. Read the setting (settings precedence) and resolve it against the project root before scanning — same edit as BC-H02 |

Test-worthiness re-rated (overriding the first pass): **SS05** and **SS07** are now TEST-WORTHY. SS05
because a false `ok` plus exit 0 on an incomplete removal is exactly what a fixture pins, at ~5 lines
of fix and ~10 of test; SS07 because the suppression gate is duplicated byte-identically across three
hook assets against a single-line writer, so one fixture pinning "repair leaves the hooks live" stops
a silent regression cheaply.

## Rejected on re-verification

One finding did not survive as written.

**SS04 — "Agent removal can delete pre-existing user agents." REJECTED as written.**

Refutation evidence:

- **No deletion path exists.** The only `fs.unlink` in `scripts/semble-agents.sh` is `:528`, which
  removes the script's own `.bak.<epoch>` after a clean verify. An exhaustive search for
  `rm`/`unlink`/`delete`/`rename` against any `agents/` path, across all ten shell scripts plus
  `lib/semble-common.sh` and the embedded JS, returns zero hits. `scripts/semble-remove.sh:211-232`
  is the only consumer in the uninstall/purge flavours and does exactly one thing: shell out to
  `semble-agents.sh apply --revert`.
- **Empirically 2 in, 2 out.** A full apply/apply/revert cycle started with `mine.md plain.md` and
  ended with `mine.md plain.md`. The suite already pins this invariant at `suite-agents.mjs:455-462`
  (`cycle.noBakResidue`) and `:463-466` (`cycle.noBakSiblings`).
- **The failure path is non-destructive too.** A `verify()` mismatch restores from the backup
  (`:524-527`) and reports `verify-mismatch`.
- **The cited evidence is wrong.** `tests/suite-agents.sh:426-477` does not exist — the file is
  `tests/suite-agents.mjs`, whose `:430-478` revert block codifies the tool-name loss as intended.
  `scripts/semble-agents.sh:23-25` is inside `usage()`.

**The narrowed successor claim stays in the body** (see the SS04 row and its re-verification block):
`apply --revert` strips `mcp__semble_code__search` / `mcp__semble_code__find_related` from a `tools:`
list that carried them **before** install, because `planAdd` returns `unchanged/already-present`
without recording authorship and `planRemove` strips every `WANT` name unconditionally. Bounded:
triggered only by `apply --revert` under `uninstall`/`purge`, never by install/upgrade/enable/resume;
damage is one or two tool names in a frontmatter list; a file that never had them is byte-restored;
recovery is git, since the `.bak` is unlinked on clean verify. **Re-rated Low and removed from the
destructive batch** — it does not belong beside SS03 and SS06, which lose an index and an MCP
registration with no announcement and no rollback.

## Final disposition

BREWCODE does not need architectural replacement. It needs a creator-knowledge refresh locked to Claude Code 2.1.233, followed by a bounded set of lifecycle, ownership, canonical-root, and status corrections. No change was applied in this review; this report is the decision input for the next implementation phase.
