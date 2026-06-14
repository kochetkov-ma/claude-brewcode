# 01 -- Step 1: Multi-agent repo analysis

[DICT: DOM=domain id segment, EXCL=source-path exclusions, REL=release style, FINDINGS=integrated result object]

Goal: inspect the TARGET repo and produce a FINDINGS object, then CONFIRM it with the user before any generation.

## Spawn (parallel -- one message, multiple Task calls)

Spawn these in a SINGLE message so they run concurrently. Use `subagent_type` shown; fall back to `general-purpose` if an agent is unavailable.

### Agent A -- domains + release style  (`brewcode:architect`)

```
Task(subagent_type="brewcode:architect", prompt="
Analyze the repo at TARGET=<abs path>. You are scoping a file-based Kanban id scheme. Return ONLY this block, no prose:

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
Explore the repo at TARGET=<abs path>. Return ONLY this block, no prose:

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
