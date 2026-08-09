# 01 -- Step 1: Multi-agent repo analysis

[DICT: DOM=domain id segment, EXCL=source-path exclusions, REL=release style, FINDINGS=integrated result object, AG=agent]

Goal: inspect the TARGET repo and produce a FINDINGS object, then CONFIRM it with the user before any generation.

## Spawn (parallel -- one message, multiple sub-agent calls)

Spawn these in a SINGLE message so they run concurrently. Use `subagent_type` shown; fall back to `general-purpose` if an agent is unavailable.

> Sizing: one agent = ONE analysis dimension -- ~<=10 steps; a dimension too big for that is split further and all parts fanned out in the SAME message.

### Agent A -- domains + release style  (`Plan`)

```
Codex delegation brief (task_role="Plan", message="
GOAL: deploying a file-based Kanban into the repo at TARGET=<abs path>. You are scoping its id scheme --
  every emitted artifact is parametrized from this, so a wrong domain list produces broken ids repo-wide.
ROLE: you own DOMAINS + RELEASE_STYLE. Analyze and report only -- do NOT create, write or edit any file, and
  do NOT report exclusions, doc language or the doc inventory (Agent B owns those), and do NOT inventory the
  repo's agents (Agent C owns that).
SCOPE: in -- read TARGET: top-level source dirs, module/package names, bounded contexts, `git tag -l | head`,
  CI config, AGENTS.md release section. Out -- writing anything; .codex/features/**.
CONTEXT: nothing has been generated yet; this is the first pass, running in parallel with Agent B
  (exclusions + doc inventory) and Agent C (domain-agent inventory). The user reviews your output in an
  request_user_input and may override it before generation.
CONSUMER: DOMAINS becomes the allowed id-segment enum in the emitted task-tracker agent, the tasks.md rule
  and every minted id (<PREFIX>-<DOMAIN>-<SLUG>); RELEASE_STYLE picks the closing-marker wording. Both are
  shown to the user verbatim, so keep each segment short and self-explanatory.
DONE: return ONLY this block, no prose:

DOMAINS:
- 6-12 SHORT UPPER-KEBAB segments naming the repo's functional areas (the first kebab segment after an id prefix). Derive from top-level source dirs, module names, package names, bounded contexts, major features. Example shape (brewpage): HTML, KV, JSON, FILES, SITE, SEO, ABUSE, PREVIEW, DEDUP, SWEEP. Yours must reflect THIS repo.

RELEASE_STYLE: one of
  vtag  -- repo ships via semver tags vX.Y.Z (look: `git tag` has vN.N.N, CI on tag, AGENTS.md release flow mentions tags)
  sha   -- repo closes work by bare commit SHA / merge, no version tags
  none  -- no discernible release ritual
  Cite the evidence (1 line: tags found / CI trigger / AGENTS.md section).

Evidence: bullet the files/commands you used (git tag -l | head, package.json/build files, AGENTS.md release section).
")
```

### Agent B -- exclusions + doc inventory  (`Explore`)

```
Codex delegation brief (task_role="Explore", message="
GOAL: deploying a file-based Kanban into the repo at TARGET=<abs path>. The curator agent that ships with it
  must never write outside .codex/features/, and the board must be seeded from the task docs the repo already
  has -- both come from this inventory.
ROLE: you own EXCLUSIONS + LANG + DOCS. Explore and report only -- do NOT create, write or edit any file, and
  do NOT propose domains or a release style (Agent A owns those), and do NOT inventory .codex/agents/**
  (Agent C owns that).
SCOPE: in -- read anywhere under TARGET to inventory it. Out -- writing anything; classifying or rewriting the
  legacy docs you find (a later sweep does that).
CONTEXT: nothing has been generated yet; this is the first pass, running in parallel with Agent A (domains +
  release style) and Agent C (domain-agent inventory). The user reviews your output in an request_user_input
  and may override it before generation.
CONSUMER: EXCLUSIONS is pasted verbatim into the emitted task-tracker agent + tasks.md rule as a hard
  never-write list, and into every sweep agent's prompt; DOCS is the migration inventory the doc-sweep agents
  are partitioned over -- a doc you miss never reaches the board. Keep both as plain path lists.
DONE: return ONLY this block, no prose:

EXCLUSIONS:
- The top-level SOURCE / build / test dirs a docs-only curator agent must NEVER write to. Include things like src/, app/, backend/, frontend/, lib/, e2e-tests/, tests/, docs/, and any language/build dirs. List the ACTUAL dirs present in this repo.

LANG:
- The dominant human language of the repo's existing docs/READMEs (English unless clearly otherwise).

DOCS:
- Every existing file that tracks backlog / features / tasks / roadmap / TODO. Search: TODO.md, ROADMAP.md, BACKLOG.md, FEATURES*, .codex/features/**, docs/**/*todo*, *task*, *backlog*, any 'planned'/'wishlist' lists. For each: path + one-line what-it-holds + rough item count. This is the migration inventory for the doc sweep.
")
```

### Agent C -- domain agents inventory  (`Explore`)

```
Codex delegation brief (task_role="Explore", message="
GOAL: deploying a file-based Kanban into the repo at TARGET=<abs path>, with a spec + system-design layer on
  top. The design doc is NEVER authored by a lone generalist -- it is fanned out to the repo's OWN domain
  agents, one per touched domain. Which agents exist decides whether that rule can be upheld at all.
ROLE: you own DOMAIN_AGENTS + ARCHITECT_AGENT + AGENT_GAPS. Inventory and report only -- do NOT create, write
  or edit any file, and do NOT propose domains, a release style (Agent A owns those), exclusions, doc language
  or the doc inventory (Agent B owns those).
SCOPE: in -- read TARGET/.codex/agents/**/*.toml (frontmatter name/description/tools + body), plus any
  plugin-provided agents visible to the repo (TARGET/.codex/config.toml enabledPlugins, .codex-plugin/**,
  AGENTS.md agent tables). Out -- writing anything; judging agent quality; rewriting or creating agents.
CONTEXT: nothing has been generated yet; this is the first pass, running in parallel with Agent A (domains +
  release style) and Agent B (exclusions + doc inventory). You do NOT have Agent A's DOMAINS list -- map each
  agent onto YOUR OWN reading of the repo's functional areas; the integrate step reconciles your names with
  A's confirmed DOMAINS. The user reviews your output in an request_user_input and may override it.
CONSUMER: DOMAIN_AGENTS is pasted verbatim into the emitted task-spec skill as the design fan-out roster (one
  agent per touched domain, all spawned in ONE message); ARCHITECT_AGENT is its fallback author; AGENT_GAPS
  tells the skill which domains must fall back to the built-in Plan agent and say so in the design Evidence.
  A missing agent is information the user needs, not a failure -- report gaps plainly.
DONE: return ONLY this block, no prose:

DOMAIN_AGENTS:
- A COMPLETE markdown table -- header row and `|---|` separator included, then one row per agent found. Columns exactly:
      | agent | domains covered | specialty |
      |-------|-----------------|-----------|
      | <name> | <DOMAIN>, <DOMAIN> | <one line> |
  agent = the frontmatter `name` (plugin agents as `plugin:name`). domains covered = the repo areas the agent is competent in, as SHORT UPPER-KEBAB segments, comma-separated. specialty = one line from its description/body. The value is pasted verbatim into the emitted skill, so an incomplete table !=renders.
- If TARGET has no .codex/agents/ (or it holds no agent .toml), return this exact line instead of a table:
  (none found -- fall back to the built-in Plan agent and say so in Evidence)

ARCHITECT_AGENT:
- The single best architecture-capable project agent (system design, planning, cross-cutting review), or the literal `Plan` if none exists. One line of justification.

AGENT_GAPS:
- The repo areas with NO covering agent, one per line, as UPPER-KEBAB segments. These fall back to `Plan` in the design phase and the emitted skill must state that in its Evidence. If DOMAIN_AGENTS is empty, list EVERY area you identified. If nothing is uncovered, write `(none)`.

Evidence: bullet the paths you read (.codex/agents/*.toml, config.toml, AGENTS.md sections, plugin manifests).
")
```

## Integrate

Merge A + B + C into FINDINGS:
```
DOMAINS        = <A.DOMAINS>
EXCLUSIONS     = <B.EXCLUSIONS>
REL_STYLE      = <A.RELEASE_STYLE>   # vtag | sha | none
LANG           = <B.LANG>
DOCS           = <B.DOCS>
DOMAIN_AGENTS  = <C.DOMAIN_AGENTS>   # table, or the literal (none found -- ...) line
ARCHITECT_AGENT= <C.ARCHITECT_AGENT> # project agent name, else Plan
AGENT_GAPS     = <domains in DOMAINS with no agent>
SPEC_MODE      = on | off            # confirmed below
```

> **Reconcile C against A:** C guessed its own area names without seeing DOMAINS. Rewrite each agent's
> "domains covered" onto A's confirmed DOMAINS vocabulary (drop an area that maps to nothing, merge synonyms).
> Then recompute `AGENT_GAPS` = every domain in DOMAINS that no agent covers after the mapping -- C's own gap
> list is only a hint. If DOMAIN_AGENTS is the `(none found ...)` line, AGENT_GAPS = all of DOMAINS.

## Confirm with the user (request_user_input -- MANDATORY before generating)

Present FINDINGS compactly, then ask. Confirm DOMAINS and EXCLUSIONS especially -- these parametrize every emitted artifact.

> **Confirm the task-board setup for `<repo name>`:**
>
> **Domains** (id segments): `D1, D2, D3, ...`
> **Exclusions** (never written by task-tracker): `src/, tests/, docs/, ...`
> **Release style:** `vtag` (vX.Y.Z) | `sha` | `none` -- *<evidence line>*
> **Doc language:** `English`
> **Docs to migrate:** `N files` -- *<one-line list>*
> **Domain agents found:** *<the DOMAIN_AGENTS table, or `none -- design falls back to Plan`>*
> **Domains with no agent:** `<DOMAIN>, <DOMAIN>, ...` -- *design for these runs on the built-in `Plan`*
> **Spec + design layer (SPEC_MODE):** `on` | `off` -- *<why this default>*
>
> Options:
> 1. Looks right -- generate
> 2. Edit domains (give the list)
> 3. Edit exclusions (give the list)
> 4. Change release style
> 5. Change language
> 6. Edit the domain-agent table (add/remove agents, remap domains)
> 7. Toggle SPEC_MODE (on/off)

`SPEC_MODE=on` installs the spec + system-design layer: a `task-spec` skill, the spec/design templates,
spec triage in `task-tracker`, and the coverage + close gates. `SPEC_MODE=off` behaves exactly as today --
one task = one file, nothing extra emitted.

> **SPEC_MODE default:** `on` when the repo has at least one domain agent OR more than one domain.
> Otherwise no default -- ask the user plainly, with a one-line description of each choice.

This confirmation also carries the optional AGENTS.md-optimization question (see SKILL.md P1); ask both in the
same request_user_input, do NOT split into two rounds.

Apply edits, re-show if substantial, proceed only on explicit "generate". If the user gives a custom domain/exclusion list, use it verbatim (UPPER-KEBAB the domains). A user-edited agent table is used verbatim and AGENT_GAPS recomputed from it.

> **Empty DOMAINS edge:** if analysis yields no domains, do NOT proceed with an empty `{{DOMAINS}}` (it would produce broken ids like `T--SLUG`); ask the user to name at least one domain via request_user_input, or fall back to a single `CORE` domain.

> **Total agent gap edge:** `SPEC_MODE=on` with `AGENT_GAPS` covering EVERY domain is allowed, but say so at
> confirmation: the whole design phase then runs on the built-in `Plan`, which is weaker than a domain
> architect. Offer the user the choice to create domain agents first via `$brewcode:agents` and re-run, or
> proceed on `Plan`. Do NOT silently downgrade.

## Output contract handed to P2-P4

A confirmed FINDINGS object with: `DOMAINS` (UPPER-KEBAB list), `EXCLUSIONS` (dir list), `REL_STYLE` (enum), `LANG` (string), `DOCS` (inventory for sweep), `DOMAIN_AGENTS` (table or the `(none found -- ...)` line), `ARCHITECT_AGENT` (agent name or `Plan`), `AGENT_GAPS` (uncovered domain list, may be empty), `SPEC_MODE` (`on` | `off`).
