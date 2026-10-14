# Mode: INSTALL, phases C1-C3

Read from SKILL.md `## Mode: INSTALL` and executed in order; C4 and the C5-C9 review pointer follow
there.

### C1: Project Analysis

Spawn 3-5 Explore agents in ONE message via Agent tool:

| # | Focus |
|---|-------|
| 1 | Code structure: modules, packages, domains, architectural layers |
| 2 | Existing agents (`.claude/agents/`, plugin agents, `~/.claude/agents/`) + Claude Code infrastructure |
| 3 | Tech stack: build files, frameworks, dependencies, languages |
| 4 | CI/CD, testing, deploy, infrastructure |
| 5 (optional) | Domain boundaries: business logic, API, data layer, UI |

All via `Agent(subagent_type="Explore")`. Consolidate into single analysis document.

Under the default `required` policy, also harvest the intent-guard facts (explicit asks in the prompts
of agents #1 and #4). They fill the `intent-guard.md.template` placeholders in C3; an unharvested fact
is `none` / `not present in this project`, never invented:

| Fact | Fills | Where to look |
|------|-------|---------------|
| Project name | `{PROJECT_NAME}` | repo dir, root `CLAUDE.md`, `package.json`/build file |
| Where original requirements live (tracker, issues, Slack, "chat only") | `{TRACKER_LABEL}` | `CLAUDE.md`, `.github/`, issue templates, CI links |
| Spec / design-doc paths or globs | `{SPEC_LOCATION}` | `.claude/specs/**`, `docs/`, `adr/` |
| Plan / task-board / task-graph paths | `{PLAN_LOCATION}` | `.claude/features/**`, `TASKS.md`, board files |
| Policy paths: root + nested `CLAUDE.md`, rules, conventions | `{POLICY_LOCATION}` | `CLAUDE.md`, `.claude/rules/**` |
| Planned scale / user count, testing policy, dependency policy, file-layout policy, architecture stance | `{PROJECT_INVARIANTS_TABLE}` | `CLAUDE.md`, rules, test dirs, manifests, module layout |
| 3-6 plausible drift instances in this repo's vocabulary | `{DRIFT_EXAMPLES_TABLE}` | derived from the invariants above |
| Cheap evidence commands (diffstat, manifest diff, test-file count, new-file list) for this stack | `{EVIDENCE_COMMANDS_BASH}` | build/test tooling found by agent #3 and #4 |

Also resolve, validate and store `REPORT_ROOT` from root/nested project guidance (Phase 1 rule) before
C2.6; equal-specificity conflicting report-root directives -> STOP.

### C2: Team Proposal (interactive)

Based on analysis + PROMPT (if provided), propose 3 variants via AskUserQuestion.

New installs use `INTENT_GUARD_POLICY=required`: show `intent-guard` as a fixed review-only anti-drift
member (asked-vs-delivered) in every variant; the 5 / 10-12 / 15-20 counts are domain agents only:

```
Fixed member (every variant, not counted):
| Agent | Domain | Mission |
| intent-guard | -- (review-only) | Compares what was ASKED vs what was DELIVERED; explicit invocation only |

Minimal (5 domain agents + intent-guard):
| Agent | Domain | Mission |

Balanced (10-12 domain agents + intent-guard) -- Recommended:
| Agent | Domain | Mission |

Maximum (15-20 domain agents + intent-guard):
| Agent | Domain | Mission |
```

Options: "Minimal (5)" | "Balanced (recommended)" | "Maximum (15-20)" | "Custom -- I'll specify"

If "Custom" -- second AskUserQuestion for free input; the new-install `required` policy stays fixed.
Final confirmation of agent list before proceeding. Existing `legacy-absent` teams are handled only by
UPGRADE and retain their explicit policy without adding `intent-guard`.

> If `.claude/agents/intent-guard.md` already exists (e.g. `/brewcode:superreview-setup` created it),
> label the fixed row `reuse (already present)` — C3-IG's `emit-agent` call will report `REUSE` and
> leave the file untouched.

**Agent names are unique across teams: reject a name another team already owns.** Two teams listing one
agent share one file: one team's `upgrade` rewrites the other's member, and the ownership check
(`cleanup-flow.md` Step 3 step 0c) then blocks the other's `uninstall`/`purge`, leaving an undeletable
roster row. Before showing the variants, run from the project root for every proposed name except
`intent-guard` (shared by design):

```bash
for a in {PROPOSED_NAMES}; do
  o=$(bash "${CLAUDE_SKILL_DIR}/scripts/agent-owners.sh" "$a") && echo "TAKEN $a <- $o"
done; echo "OK"
```

| Exit | Meaning | Do |
|------|---------|----|
| 0, a `generator:<plugin>:<skill>` line | **FOREIGN**: another generator owns `.claude/agents/{name}.md` by its `generated_by` stamp or a reserved name (`task-tracker` <- `brewtools:task-board-setup`) | never a member: drop it from every variant, no rename; that setup keeps the domain |
| 0 (team owners only) | **TAKEN** | drop it and propose a distinct name (`{name}-{TEAM_NAME}` or another domain word); never reuse or "join" the other team's agent |
| 2 (no owner) | free | use it |
| 1 (refusal, reason on stderr) | TAKEN until the reason is fixed | report the stderr line, do not guess |

Say which names were renamed and why in the confirmation before C3.

### C2.5: Model Selection (AskUserQuestion)

"Default model for domain agents: Opus (most reliable)."

| Model | Best for | Cost |
|-------|----------|------|
| opus | Complex domains, architecture, critical logic | High |
| sonnet | Standard domains, CRUD, testing, utilities | Medium |
| haiku | Simple utility agents, formatting, validation | Low |

Options: "Opus (recommended)" | "Sonnet" | "Haiku" | "Mixed -- I'll choose per agent"

If "Mixed" -- ask model per agent in C3. Store as `DEFAULT_MODEL` (default: opus).

> `DEFAULT_MODEL` applies to DOMAIN agents only. `intent-guard` keeps the `model: sonnet` its shared
> template ships — do not ask about it, do not override it.

### C2.6: Shared Contract Bootstrap (before agent discovery)

This gate MUST finish before any team-owned `.claude/agents/{name}.md` is written. An interrupted install
may leave a partial roster, but no discoverable compact profile may ever point at a missing shared contract.

1. Create `.claude/teams/{TEAM_NAME}/`.
2. Read `${CLAUDE_SKILL_DIR}/references/framework-files.md`; write `team.md` with substituted metadata,
   validated `REPORT_ROOT`, `INTENT_GUARD_POLICY=required`, the byte-faithful `## Shared Agent Contract`,
   exact "`intent-guard` is review-only, keeps its own output contract, and never implements." substitution,
   the `## Agents` header,
   and only the required fixed `intent-guard` row. Do not add domain-agent rows yet; C4 finalizes the
   successfully created roster.
3. Create empty `trace.jsonl`; copy the project-local `trace-ops.sh` and make it executable.
4. Gate before C3: `team.md` exists, contains `## Shared Agent Contract`, the project-local tracer path,
   and `A task traced \`took\` ends with exactly one terminal track: \`completed\` or \`failed\`.`

**STOP on any failure. Do not spawn or write an agent.** Resume by repairing this bootstrap first; never
strip shared rules from a profile until its target `team.md` passes the gate.

### C3: Agent Creation (agent-creator x N)

1. Read `${CLAUDE_SKILL_DIR}/references/agent-template.md`
1a. Confirm C2.6 completed. `.claude/teams/{TEAM_NAME}/team.md` is already written and gated; if missing
   or incomplete, **STOP before the first spawn** and repair the bootstrap.
1b. **Re-run the C2 uniqueness check on the final confirmed roster, immediately before the first spawn**
   (names typed in the "Custom" branch never passed it). Any `TAKEN` name -> **do not spawn**; rename it
   with the user first. A `FOREIGN` name leaves the roster, never renamed. Also refuse a name whose
   `.claude/agents/{name}.md.disabled` exists with no live file: it is another install's parked agent,
   and writing the live path recreates the dual-copy state both `enable` and `disable` refuse.
2. For each agent, spawn `Agent(subagent_type="brewcode:agent-creator")` — ONE agent file per spawn, never a whole team. Prompt carries GOAL (build this one `{TEAM_NAME}` roster member; siblings own other domains), ROLE (owns `.claude/agents/{name}.md` only), SCOPE (that file; other agents, `team.md`, project source out), CONTEXT (settled mission/domain/project analysis, selected model, 3-4 sibling names; no trigger/domain overlap; the gated shared contract already exists), CONSUMER (C4 adds the final roster row; C5 reviews; the roster routes work), DONE:
   - `description` <=100 chars (optimal ~80), single-line role + 2-3 triggers, no `<example>`;
   - body <=3200 bytes and <=800 exact `tiktoken==0.13.0` `o200k_base` tokens, with exactly these ordered headings and no others: `## Mission`, `## Owned surfaces`, `## Exclusions`, `## Must-load references`, `## Unique invariants`, `## Unique verification`;
   - `## Must-load references` names `.claude/teams/{TEAM_NAME}/team.md` first;
   - profile contains only domain-unique facts. `Task Acceptance Protocol`, `Return Contract`, `Trace Instructions`, `Colleagues`, `Scope Fit`, shared routing, and shared output rules stay only in `team.md`;
   - placeholders substituted; return file path + description line.

   Every spawn prompt also carries the template path and the four metadata lines below, with
   `{PLUGIN_VERSION}` and `{LAST_UPDATED}` **replaced by the literal Phase 1 `PLUGIN_VERSION:` /
   `LAST_UPDATED:` values before you send it**: the subagent cannot see Phase 1's output, and a token
   that reaches it ships verbatim (`setup-status` then reports that agent `partial`). Single-brace
   spellings only, never an angle or double-brace form:

   ```
   CONTEXT (cont.): structure from ${CLAUDE_SKILL_DIR}/references/agent-template.md — read it first.
   DONE (cont.): the frontmatter ends with exactly these four keys, in this order, AFTER the agent's
     own keys (name, description, model, tools — leave those byte-untouched, `tools` above all):
       doc_type: llm
       version: "{PLUGIN_VERSION}"
       generated_by: "brewcode:teams-setup"
       last_updated: "{LAST_UPDATED}"
   ```

   `verify-team.sh` FAILS C4 on a wrong key order, a missing key or wrong quoting in any generated
   agent's frontmatter.
3. Batch 3-4 agents in parallel per message
4. After each batch, light-optimize its `.claude/agents/{agent-name}.md` files without changing the
   six-heading contract, only when the `brewtools:text-optimize` skill is available in this session
   (`--allow-dirty`: this batch was just written):
   `Skill(skill="brewtools:text-optimize", args="<batch agent paths> -l --allow-dirty preserve the exact six ordered headings, team.md reference, names/numbers/negations/scope")`.
   It owns snapshot, `RUN_DIR`, one optimizer per file and its verify gate. Delegates never spawn
   optimizers.
   > Skill unavailable (`brewtools` not installed) -> skip the pass, report the skip (not a blocker).
   > **Never run the optimizer on `.claude/agents/intent-guard.md`**: a reworded or lengthened
   > `description` would make this review-only agent compete for auto-activation.

#### C3-IG: intent-guard (`required` policy, exactly once)

`.claude/agents/intent-guard.md` has exactly one writer: `generate.sh emit-agent`, shared with
`/brewcode:superreview-setup`. Never author it from the template or via a spawned agent (two pipelines
would fork the file); `agent-creator` only post-processes three seeded BLOCKs here.

**Step 1 — emit.** Run from the project root, exporting the C1 facts (unharvested -> `none` /
`not present in this project`; never invent a tracker, path or ticket id).

**EXECUTE** using Bash tool (substitute the C1 values first):
```bash
PROJECT_NAME="PROJECT_NAME_HERE" \
TRACKER_LABEL="TRACKER_LABEL_HERE" \
SPEC_LOCATION="SPEC_LOCATION_HERE" \
PLAN_LOCATION="PLAN_LOCATION_HERE" \
POLICY_LOCATION="POLICY_LOCATION_HERE" \
bash "${CLAUDE_SKILL_DIR}/../superreview-setup/scripts/generate.sh" emit-agent && echo "OK" || echo "FAILED"
```

It creates or reuses only `.claude/agents/intent-guard.md` (superreview need not have run) and prints
exactly one `INTENT_GUARD:` line on stdout: `INTENT_GUARD: CREATED <path>`, `INTENT_GUARD: REUSE <path>`
or `INTENT_GUARD: MIGRATED <path>` (a pre-standard file of ours, restamped in place — metadata only,
tailored body preserved). Diagnostics go to stderr, never as a second status line.
> **STOP if FAILED** -- report the script output; do not fall back to hand-authoring the file.

**Step 2 — sanity-check the emitted file** (a pre-existing file may be empty, truncated or
placeholder-laden; `-f` alone proves nothing). On REUSE `$f` is an already-adapted agent whose evidence
block legitimately holds shell expansions, so the check strips `${VAR}` first (else `${BASE}` scores as
an unresolved placeholder and the `rm -f` remedy below would delete a tailored file).
```bash
f=.claude/agents/intent-guard.md
[ -s "$f" ] && grep -q '^name: intent-guard' "$f" \
  && ! sed 's/\${[A-Z_][A-Z_]*}//g' "$f" | grep -q '{[A-Z_]\{2,\}}' && echo "SANE" || echo "CORRUPT"
grep -qF '<!-- generated_by: brewcode:superreview-setup' "$f" 2>/dev/null && echo "OURS" || echo "FOREIGN"
```
- `CORRUPT` + `OURS` -> this pipeline wrote it: `rm -f .claude/agents/intent-guard.md`, re-run Step 1
  once (a fresh emit is a `CREATED`), re-check. Still `CORRUPT` -> **STOP** and report; no hand patch.
- `CORRUPT` + `FOREIGN` -> **STOP. Never `rm` it.** An unstamped file is the project's own agent and its
  `{TOKENS}` may be its own convention (`emit-agent` REUSED it byte-untouched and printed the tokens as
  a conflict on stderr). Report the path and the tokens and let the user decide.

**Step 3 — adapt the seeded BLOCKs.** Only on `INTENT_GUARD: CREATED`; on `REUSE` or `MIGRATED` skip it:
the existing file is already project-adapted and must not be rewritten or "refreshed".

`emit-agent` seeds three BLOCKs with generic marked defaults. Spawn ONE
`Agent(subagent_type="brewcode:agent-creator")`, alone (not batched with the domain agents), to replace
them with project-specific content:

```
Agent(subagent_type="brewcode:agent-creator", prompt="
  GOAL: team '{TEAM_NAME}' has its fixed review-only member intent-guard — the anti-drift check that
        compares what was ASKED against what was DELIVERED. The file is ALREADY WRITTEN by
        superreview-setup/scripts/generate.sh emit-agent with generic placeholder content in three BLOCKs.
        Your only job is to tailor those three BLOCKs to this project.
  ROLE: you own exactly three marked BLOCKs inside .claude/agents/intent-guard.md:
        PROJECT_INVARIANTS_TABLE, DRIFT_EXAMPLES_TABLE, EVIDENCE_COMMANDS_BASH.
        You do NOT author this agent and you do NOT re-instantiate it from any template.
  SCOPE: Edit only the content of those three BLOCKs, in place.
        EACH REPLACEMENT MUST CONSUME ITS MARKER. Every seeded BLOCK ends in its own
          `<!-- SEEDED-DEFAULT: ... -->` line. Key each Edit on that marker: `old_string` = the
          seeded block PLUS its marker line, `new_string` = your project-specific replacement
          WITHOUT any marker. A surviving marker is what makes a skipped adaptation detectable —
          `generate.sh validate` reports any file that still carries one as UNTAILORED.
        HARD out of bounds — a single byte changed here is a failed task:
          - the frontmatter (name, description, model: sonnet, tools, color, maxTurns). The
            description is <= 100 chars, review-only, explicitly-invoked BY DESIGN; do NOT rewrite,
            lengthen or 'improve' it. This overrides any default description-authoring habit.
          - the file header, every heading, and every other section of the file
          - the shared template, other agent files, team.md, trace.jsonl, project source
  CONTEXT: C1 project analysis is settled — use these facts, invent nothing:
        PROJECT_INVARIANTS_TABLE = from C1: planned scale/user count, testing policy, dependency
                            policy, file-layout policy, architecture stance
        DRIFT_EXAMPLES_TABLE     = 3-6 drift instances in THIS repo's vocabulary
        EVIDENCE_COMMANDS_BASH   = cheap evidence commands for THIS stack (diffstat, manifest diff,
                            test-file count, new-file list)
        Unknown fact -> write 'none' / 'not present in this project'. Never fabricate a tracker,
        a path or a ticket id. Do not add a Scope Fit block, Task Acceptance Protocol, trace
        instructions or a Domain Instructions section — this agent has no code domain.
  CONSUMER: /brewcode:superreview-setup spawns this same file by name during review, and C4 adds its row to
        .claude/teams/{TEAM_NAME}/team.md — the file name and agent name stay exactly 'intent-guard'.
  DONE: three BLOCKs project-specific, all three SEEDED-DEFAULT markers gone (consumed by the
        replacements), everything else byte-identical to what emit-agent wrote.
        Report: path + the three BLOCK contents + confirmation that frontmatter and header are untouched.
")
```

**Step 4 — verify.** Four counts, one grep per line, in this order; run the patterns as written. They
match the artifact, never prose about it: the emitted agent keeps a tail comment naming the stripped
`TEMPLATE HEADER`, so an unanchored `grep -c 'TEMPLATE HEADER'` prints `1` on every healthy file. The
placeholder count strips `${VAR}` first, as in Step 2 (a `$`-guard inside the pattern mis-handles
adjacent tokens). `|| true` on every line: zero matches (rc 1) is the happy path for three of the four
counts, and a count must still print under `set -o pipefail`.

```bash
f=.claude/agents/intent-guard.md
sed 's/\${[A-Z_][A-Z_]*}//g' "$f" | grep -c '{[A-Z_]\{2,\}}' || true   # 0 — unresolved placeholder
grep -c '^<!-- TEMPLATE HEADER' "$f" || true    # 0 — header comment not stripped by emit
grep -c '^name: intent-guard' "$f" || true      # 1 — frontmatter name key intact
grep -cF '<!-- SEEDED-DEFAULT:' "$f" || true    # 0 — every seeded BLOCK marker consumed
```
Must print `0`, `0`, `1`, `0`. A non-zero last count means an adaptation left its marker (or skipped
the block) and `generate.sh validate` will report the agent `UNTAILORED`.
> **STOP if not** -- re-spawn Step 3 once with the offending lines named.

Report `intent-guard: created (adapted)` or `intent-guard: reused (already present)` and continue to
C4; either way a `required` team gets its `team.md` row. Skipped for an existing `legacy-absent` team:
never emit or adapt the agent merely to upgrade it.
