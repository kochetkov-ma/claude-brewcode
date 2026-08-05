# 01 -- Step 1: Multi-agent repo analysis

[DICT: DOM=domain id segment, EXCL=source-path exclusions, REL=release style, FINDINGS=integrated result object]

Goal: inspect the TARGET repo and produce a FINDINGS object, then CONFIRM it with the user before any generation.

## Spawn (parallel -- one message, multiple Task calls)

Spawn these in a SINGLE message so they run concurrently. Use `subagent_type` shown; fall back to `general-purpose` if an agent is unavailable.

> Sizing: one agent = ONE analysis dimension — ~<=10 steps; a dimension too big for that is split further and all parts fanned out in the SAME message.

### Agent A -- domains + release style  (`Plan`)

```
Task(subagent_type="Plan", prompt="
GOAL: deploying a file-based Kanban into the repo at TARGET=<abs path>. You are scoping its id scheme —
  every emitted artifact is parametrized from this, so a wrong domain list produces broken ids repo-wide.
ROLE: you own DOMAINS + RELEASE_STYLE. Analyze and report only — do NOT create, write or edit any file, and
  do NOT report exclusions, doc language or the doc inventory (Agent B owns those).
SCOPE: in — read TARGET: top-level source dirs, module/package names, bounded contexts, `git tag -l | head`,
  CI config, CLAUDE.md release section. Out — writing anything; .claude/features/**.
CONTEXT: nothing has been generated yet; this is the first pass, running in parallel with Agent B
  (exclusions + doc inventory). The user reviews your output in an AskUserQuestion and may override it
  before generation.
CONSUMER: DOMAINS becomes the allowed id-segment enum in the emitted task-tracker agent, the tasks.md rule
  and every minted id (<PREFIX>-<DOMAIN>-<SLUG>); RELEASE_STYLE picks the closing-marker wording. Both are
  shown to the user verbatim, so keep each segment short and self-explanatory.
DONE: return ONLY this block, no prose:

DOMAINS:
- 6-12 SHORT UPPER-KEBAB segments naming the repo's functional areas (the first kebab segment after an id prefix). Derive from top-level source dirs, module names, package names, bounded contexts, major features. Example shape (brewpage): HTML, KV, JSON, FILES, SITE, SEO, ABUSE, PREVIEW, DEDUP, SWEEP. Yours must reflect THIS repo.

RELEASE_STYLE: one of
  vtag  -- repo ships via semver tags vX.Y.Z (look: `git tag` has vN.N.N, CI on tag, CLAUDE.md release flow mentions tags)
  sha   -- repo closes work by bare commit SHA / merge, no version tags
  none  -- no discernible release ritual
  Cite the evidence (1 line: tags found / CI trigger / CLAUDE.md section).

Evidence: bullet the files/commands you used (git tag -l | head, package.json/build files, CLAUDE.md release section).
")
```

### Agent B -- exclusions + doc inventory  (`Explore`)

```
Task(subagent_type="Explore", prompt="
GOAL: deploying a file-based Kanban into the repo at TARGET=<abs path>. The curator agent that ships with it
  must never write outside .claude/features/, and the board must be seeded from the task docs the repo already
  has — both come from this inventory.
ROLE: you own EXCLUSIONS + LANG + DOCS. Explore and report only — do NOT create, write or edit any file, and
  do NOT propose domains or a release style (Agent A owns those).
SCOPE: in — read anywhere under TARGET to inventory it. Out — writing anything; classifying or rewriting the
  legacy docs you find (a later sweep does that).
CONTEXT: nothing has been generated yet; this is the first pass, running in parallel with Agent A (domains +
  release style). The user reviews your output in an AskUserQuestion and may override it before generation.
CONSUMER: EXCLUSIONS is pasted verbatim into the emitted task-tracker agent + tasks.md rule as a hard
  never-write list, and into every sweep agent's prompt; DOCS is the migration inventory the doc-sweep agents
  are partitioned over — a doc you miss never reaches the board. Keep both as plain path lists.
DONE: return ONLY this block, no prose:

EXCLUSIONS:
- The top-level SOURCE / build / test dirs a docs-only curator agent must NEVER write to. Include things like src/, app/, backend/, frontend/, lib/, e2e-tests/, tests/, docs/, and any language/build dirs. List the ACTUAL dirs present in this repo.

LANG:
- The dominant human language of the repo's existing docs/READMEs (English unless clearly otherwise).

DOCS:
- Every existing file that tracks backlog / features / tasks / roadmap / TODO. Search: TODO.md, ROADMAP.md, BACKLOG.md, FEATURES*, .claude/features/**, docs/**/*todo*, *task*, *backlog*, any 'planned'/'wishlist' lists. For each: path + one-line what-it-holds + rough item count. This is the migration inventory for the doc sweep.
")
```

## Integrate

Merge A + B into FINDINGS:
```
DOMAINS    = <A.DOMAINS>
EXCLUSIONS = <B.EXCLUSIONS>
REL_STYLE  = <A.RELEASE_STYLE>   # vtag | sha | none
LANG       = <B.LANG>
DOCS       = <B.DOCS>
```

## Confirm with the user (AskUserQuestion -- MANDATORY before generating)

Present FINDINGS compactly, then ask. Confirm DOMAINS and EXCLUSIONS especially -- these parametrize every emitted artifact.

> **Confirm the task-board setup for `<repo name>`:**
>
> **Domains** (id segments): `D1, D2, D3, ...`
> **Exclusions** (never written by task-tracker): `src/, tests/, docs/, ...`
> **Release style:** `vtag` (vX.Y.Z) | `sha` | `none` -- *<evidence line>*
> **Doc language:** `English`
> **Docs to migrate:** `N files` -- *<one-line list>*
>
> Options:
> 1. Looks right -- generate
> 2. Edit domains (give the list)
> 3. Edit exclusions (give the list)
> 4. Change release style
> 5. Change language

Apply edits, re-show if substantial, proceed only on explicit "generate". If the user gives a custom domain/exclusion list, use it verbatim (UPPER-KEBAB the domains).

> **Empty DOMAINS edge:** if analysis yields no domains, do NOT proceed with an empty `{{DOMAINS}}` (it would produce broken ids like `T--SLUG`); ask the user to name at least one domain via AskUserQuestion, or fall back to a single `CORE` domain.

## Output contract handed to P2-P4

A confirmed FINDINGS object with: `DOMAINS` (UPPER-KEBAB list), `EXCLUSIONS` (dir list), `REL_STYLE` (enum), `LANG` (string), `DOCS` (inventory for sweep).
