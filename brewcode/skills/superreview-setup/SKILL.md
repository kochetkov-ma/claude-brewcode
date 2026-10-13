---
name: superreview-setup
description: "Generates a project-tailored deep-review skill: domain-expert routing + scope discipline (blast radius, delivery, closeout) + mechanical gates + adversarial validation. Triggers: superreview, generate review skill, deep review skill, scope discipline review"
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|upgrade|enable|disable|uninstall|purge] [scope]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion]
model: opus
---
<!-- brewcode-meta: version=6.5.1 content_version=6.5.0 generated_by=brewcode:superreview-setup -->

# Super Review Generator (brewcode:superreview-setup)

A human-invoked generator: it analyzes the TARGET project, then writes a self-contained project-local review skill
into it. It does not review code itself; the emitted skill does.

**Output:** `<target>/.claude/skills/superreview/` (SKILL.md + references) plus the project agent
`<target>/.claude/agents/intent-guard.md`. The emitted skill references (never restates) the project's
`.claude/rules` + convention files, is read-only, stack-generic (Java/Kotlin, Node/TS, Python, Go) and
self-contained — no plugin dependency, no sibling-skill orchestration once generated. Its flow is the table under
"How the emitted skill behaves".

Three things make or break the emitted skill:

1. **Domain experts** — a review routed to generic agents finds generic issues. Phase 1.6 below is mandatory: discover the experts and create the missing ones before emitting.
2. **Scope discipline** — the emitted skill measures every change against the sanctioned baseline (task + issue + recorded decisions): creep, blast radius, under-delivery, closeout. Phase 1.5 wires it to the target's tracker.
3. **The intent pass** — `intent-guard` answers "was the DELIVERED thing the ASKED thing?". It runs at both depths and is the whole review at `QUICK`. Phase 1.6 + Phase 3 wire it to this project's real invariants.

The emitted skill has two orthogonal axes. `{MODE}` selects scope (`FULL_PROJECT` / `EXPLICIT` / `UNCOMMITTED` /
`LAST_COMMITS`). `{DEPTH}` selects effort: `QUICK` (the default and common case — mechanical gates + the intent
pass, one spawn, no domain experts) or `EXTENDED` (the full fan-out + validation + scope gate, plus the intent
pass). Depth is inferred semantically from the user's prompt, exactly like the `{MODE}` whole-project rule: there
is no `--fast`, no flag and no CLI token, and you must not add one.

**Arguments:** the prompt — `<fine-tune-prompt>` (free text, woven into the emitted skill's Focus ordering +
emphasis) plus optional `[scope]` hint.

---

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; verb tokens and flags may sit anywhere in it.

1. Verb: an explicit verb token wins outright (the seven canonical verbs: Verb routing table below);
   else the most distinct whole-word keyword hits in that table. Tie with `purge` (destructive) ->
   `AskUserQuestion`; with `status` -> `status`; of two mutating verbs -> the keyword that comes
   first. No hit or empty -> `status` if `.claude/skills/superreview/SKILL.md` or its `.disabled`
   twin exists, else `install`.
2. Scope: prose that names no verb is the fine-tune prompt, not an error — it is woven into the
   emitted skill's Focus ordering (Phase 1.5), never treated as the verb by its first word.
3. Ask: at most ONE `AskUserQuestion` (max 4 questions) to resolve mode and scope, before any work, only when the answer
   changes what gets written. `status` asks nothing.

Print once, before the resolved verb runs (labels literal, values in the conversation language):

```
PLAN — brewcode:superreview-setup
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved verb> — <explicit | matched keyword: X | default>
SCOPE:  <target repo, fine-tune focus, scope hint>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

---

## Execution

### Verb routing — resolve FIRST, before anything else

The prompt may start with one of the seven canonical verbs, in this order:
`status | install | upgrade | enable | disable | uninstall | purge`. Strip the verb; the rest — or everything,
when no verb is named — is the fine-tune prompt. Removed aliases, never accepted as a verb token or printed:
`init`, `on`, `off`, `setup`, `remove`, `reset`, `create`, `update`, `cleanup` — recognize them in free text and
echo the canonical verb back.

| Verb | EN keywords | RU keywords | What runs | Mutates? |
|------|-------------|-------------|-----------|----------|
| `status` | *(empty)*, `status`, `check`, `show` | `статус`, `проверь`, `покажи` | read-only: is `.claude/skills/superreview/` there, is it ENABLED or parked, is `.claude/agents/intent-guard.md` present, is `.template-baseline/` there? Then `generate.sh validate` and report. **STOP** — no phases run | no |
| `install` | `install`, `setup`, `generate`, `set up`, `create` | `настрой`, `установи`, `сгенерируй` | the full generate flow, Phase 0 -> Phase 4 below | yes |
| `upgrade` | `upgrade`, `update`, `refresh templates` | `обнови`, `апгрейд` | Phase 2b only (`generate.sh upgrade`), then Phase 3 for any `MISSING -> restored` asset, then Phase 4 `validate`. **STOP** | live files only via targeted Edit |
| `enable` | `enable`, `on`, `turn on`, `activate` | `включи`, `активируй` | `generate.sh enable` — un-parks the installed skill. **STOP** | one rename |
| `disable` | `disable`, `off`, `turn off`, `pause` | `выключи`, `отключи`, `пауза` | `generate.sh disable` — parks the installed skill without deleting anything. **STOP** | one rename |
| `uninstall` | `uninstall`, `remove`, `delete skill` | `удали`, `убери` | `generate.sh uninstall` — deletes the generated skill dir, KEEPS the reports and `intent-guard.md`. Confirm once. **STOP** | deletes |
| `purge` | `purge`, `wipe`, `remove everything`, `nuke` | `вычисти`, `удали полностью` | `generate.sh purge` — uninstall + deletes `.claude/reports/*_superreview/`. Still keeps `intent-guard.md`. Confirm once, naming the report count. **STOP** | deletes, destructive |
| *(no args at all)* | — | — | `status` when `.claude/skills/superreview/` exists, otherwise `install` | status: no |
| *(no verb, but a prompt)* | — | — | same as `install`; the whole prompt is the fine-tune prompt | yes |

Print the PLAN block (Prompt contract above) now, before running the resolved verb.

**EXECUTE** using Bash tool (`status` only):
```bash
if test -f .claude/skills/superreview/SKILL.md; then echo "installed: enabled"
elif test -f .claude/skills/superreview/SKILL.md.disabled; then echo "installed: DISABLED (parked as SKILL.md.disabled — run 'enable' to restore)"
elif test -d .claude/skills/superreview; then echo "installed: BROKEN (dir present, no SKILL.md and no SKILL.md.disabled)"
else echo "not_installed"; fi
test -f .claude/agents/intent-guard.md && echo "intent-guard: present" || echo "intent-guard: MISSING"
test -d .claude/skills/superreview/.template-baseline && echo "baseline: present" || echo "baseline: absent (pre-baseline install)"
echo "reports: $({ find .claude/reports -maxdepth 1 -type d -name '*_superreview' 2>/dev/null || true; } | wc -l | tr -d ' ') dir(s) — deleted by 'purge', kept by 'uninstall'"
bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" validate && echo "✅ validate" || echo "❌ validate FAILED"
```

> `status` never writes and never asks. `not_installed` -> report it and offer `install`; nothing else.
> `installed: DISABLED` is a state, not a fault — report it and offer `enable`. `validate` fails on a
> disabled install (it looks for `SKILL.md`); say so rather than presenting it as a broken installation.

### Modes: enable | disable | uninstall | purge

| Mode | Generated skill dir | `references/` + `.template-baseline/` | Phase 3 tailoring | `.claude/reports/*_superreview/` | `intent-guard.md` |
|------|--------------------|---------------------------------------|-------------------|----------------------------------|-------------------|
| `enable` | `SKILL.md.disabled` -> `SKILL.md` | kept | kept | kept | kept |
| `disable` | `SKILL.md` -> `SKILL.md.disabled` | kept | kept | kept | kept |
| `uninstall` | deleted | deleted with it | lost | kept | kept |
| `purge` | deleted | deleted with it | lost | deleted | kept |

**Toggle.** Claude Code discovers a project skill only through `<dir>/SKILL.md`, so `disable` renames that one
file to `SKILL.md.disabled` (`/superreview` stops being offered) and `enable` renames it back. Nothing is
regenerated in either direction, so no `version` is bumped and no self-synced edit is at risk. `disable` parks a
review setup that is temporarily noisy; `uninstall` is for one that should really go.

**`intent-guard.md` is touched by none of the four** — each prints it as `KEPT`. It is shared with
`/brewcode:teams-setup`, which may have put it there, so deleting or parking it would silently break an unrelated
team install.

**Confirm before deleting.** `uninstall` and `purge` each `AskUserQuestion` exactly once, listing the
real paths (`find .claude/skills/superreview -type f | sort`) and, for `purge`, the number of review
reports being destroyed, with `uninstall` offered as the keep-the-reports alternative. A declined
confirmation ends the run cleanly — delete nothing.

**EXECUTE** using Bash tool (the chosen verb, after confirmation where required):
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" MODE_HERE && echo "✅ MODE_HERE" || echo "❌ MODE_HERE FAILED"
```

Then report the script's `MOVED:` / `REMOVED:` / `KEPT:` lines verbatim. Not installed at all ->
say so and **STOP**; never "disable" or "purge" something that was never emitted.

### Delegation (applies to every Agent this generator spawns AND to the fan-out it emits)

One subagent owns one bounded file-group review: one deliverable, ~<=5 files, ~<=10 steps.
Split larger groups into N disjoint tasks, all spawned in one message, so progress stays observable.

Every spawn brief carries six labeled fields, since a subagent starts with an empty context: GOAL (task + why), ROLE (owns, must not touch), SCOPE (paths/commands in and out), CONTEXT (done, by whom, in parallel), CONSUMER (who uses the result + its shape), DONE (acceptance + return: verdict first, evidence, bounded; long output to a file, path returned).

A bare one-line task is never enough. When filling `{FILE_GROUP_MAP}` in Phase 3, keep every group
small enough to be one bounded unit — split an oversized group into two rows rather than emitting a
single agent that owns half the repo.

### Phase 0 — Pre-analysis (read THIS skill's emit material)

1. Read the emit templates this generator ships (relative to `${CLAUDE_SKILL_DIR}`):
   - `references/SKILL.md.template` — the emitted SKILL.md (with `{PLACEHOLDER}` slots)
   - `references/agent-prompt.md` — runtime expert selection + domain-owner prompt contract (emitted, substituted)
   - `references/scope.md.template` — scope-discipline reference (emitted as the target's `references/scope.md`)
   - `references/intent-guard.md.template` — the anti-drift agent (emitted as `<target>/.claude/agents/intent-guard.md`); you fill three BLOCKs in it in Phase 3. Its header comment documents every placeholder; `generate.sh` strips that header on emit
   - `references/report-template.md` — emitted report layout
   - `references/{python,java-kotlin,typescript-react,go}.md` — per-stack reference docs (one is emitted)
2. Confirm the TARGET project is the current working directory (the repo to be reviewed); all emitted paths are relative to that repo root.

### Phase 1 — Analyze the TARGET project

Gather the emitted skill's inputs with Bash `rg`/`find`, or native `Grep`/`Glob` where the session has them.

**EXECUTE** using Bash tool (project scan):
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" scan && echo "✅ scan" || echo "❌ scan FAILED"
```

The scan reports: build files, `.claude/agents/**`, `.claude/rules/*` + `.claude/convention/*`, test dirs, source dirs.
From it (plus your own reads) determine:

| Aspect | How to detect | Drives placeholder |
|--------|---------------|--------------------|
| Tech stack | build files: `pom.xml`/`build.gradle*` -> Java/Kotlin; `package.json`+react/ts -> Node/TS; `pyproject.toml`/`requirements*.txt` -> Python; `go.mod` -> Go | `STACK_LABEL`, `STACK_REF`, `SOURCE_GLOB`, `PATHSPEC_GLOBS` |
| Project agents | `.claude/agents/**/*.md` (recursive, name + description); map each to the path group it owns; flag READ-ONLY recon agents (cloud/SaaS/tracker consoles) as NON-reviewers | `DOMAIN_AGENTS_TABLE`, `FILE_GROUP_MAP`, `GENERAL_AGENTS_TABLE` |
| Arbiter / validator | an architecture/reviewer agent in `.claude/agents/`, else built-in `general-purpose` | `ARBITER_AGENT`, `VALIDATOR_AGENT` |
| Rule + convention files | `.claude/rules/*.md` + `.claude/convention/*.md` + `CLAUDE.md` | `RULE_POINTER_TABLE`, `RULE_PREFLIGHT_LIST` |
| Source path groups | top-level source dirs / service dirs / module layout | `FILE_GROUP_MAP` |
| **Mechanical gates** | the REAL build/lint/type/test commands (`package.json` scripts, Makefile, gradle tasks, `pytest`, `go test`), plus where they run from | `GATE_COMMANDS` |
| **Scope tracker** | `.claude/features/**` board, `gh` + `.github/`, Jira/Linear config, branch naming `<type>/<issue>-<slug>` | `TRACKER_LABEL`, `BASELINE_RESOLUTION_BASH`, `SANCTION_PRECEDENCE_TABLE`, `SCOPE_AGENT_A/B` |
| **Shared surfaces** | public API/contract dirs, DB migrations, schema/registry files, CI workflows, dependency manifests, design tokens | `SHARED_SURFACES_TABLE`, `OWNERSHIP_SIGNALS_BASH` |
| Team parallelism | contributors in `git shortlog -sn --since=3.months`, owner columns on the board | `TEAM_NOTE` |
| DB / test stack | testcontainers, JPA/JOOQ, pytest, jest, etc. | folded into the per-stack reference note |
| **Intent tier sources** | Tier 2 = spec/design-doc dirs (`.claude/specs/**`, `docs/specs/**`, an ADR dir); Tier 3 = plan / task board / task graph (`.claude/features/**`, `TASKS.md`); Tier 4 = policy (root + nested `CLAUDE.md`, `.claude/rules/**`, `.claude/convention/**`). Tier 1 is `TRACKER_LABEL`, already detected. Absent -> the literal string `none` | `SPEC_LOCATION`, `PLAN_LOCATION`, `POLICY_LOCATION` |
| **Project invariants** | Read them, do not guess — each cited by source file: planned scale (users/RPS/data volume stated in README/CLAUDE.md/specs — "personal tool" and "10k RPS" produce opposite drift verdicts); testing policy (the project's own rule: few scenario tests vs full-coverage); dependency policy (pinning rule, "reuse before adding", vendored/allowed sets); file-layout policy (one-file-per-what, module boundaries, naming conventions); architecture stance (the pattern committed to, and what it explicitly rejected) | `PROJECT_INVARIANTS_TABLE` |
| **Known drift instances** | past over-engineering in this repo's history + what its rules explicitly forbid (an `avoid.md` row is a drift class someone already hit) + the vocabulary this team uses for it | `DRIFT_EXAMPLES_TABLE` |
| **Cheap evidence commands** | this repo's real one-liners: `git diff --stat` on the resolved range, the dependency-manifest diff for THIS manifest (`package.json` / `pom.xml` / `pyproject.toml` / `go.mod`), new-file listing, test-file count under the real test dirs | `EVIDENCE_COMMANDS_BASH` |

**Multi-stack repos:** pick the dominant stack for the emitted `STACK_REF` and note the secondary stack(s) in
`DOMAIN_AGENTS_TABLE` / `FILE_GROUP_MAP`. One stack reference doc is emitted; the rule pointers cover the rest.

### Phase 1.5 — Clarify genuinely ambiguous params (AskUserQuestion)

Ask only for params you cannot reliably infer; never auto-guess a non-obvious choice. Typical questions:

- **Scope baseline** — which tracker sanctions work (file board / GitHub issues / Jira / none), and the branch -> issue convention. Without it the emitted skill caps every scope finding at P2, so ask when unsure.
- **Always-shared surfaces** — the list whose edit widens blast radius across the whole team.
- **Architecture arbiter / Phase-3 validator** — when several plausible reviewer/architect agents exist.
- **Domain-owner mapping** — when an agent's owned path group is unclear.
- **Dominant stack** — when the repo is genuinely multi-stack.
- **Mechanical gate commands** — when several plausible ones exist (CI is the tie-break: use what CI runs).

> Weave the `<fine-tune-prompt>` argument into the emitted Focus ordering: if the user said "focus on X / weight Y
> higher", reorder/emphasize the emitted `FOCUS_TABLE` accordingly (e.g. push security to P0-always, or raise reuse to
> rank 1). Record the emphasis in `FOCUS_EMPHASIS`. Scope discipline stays inside rank 1 whatever the emphasis —
> it may be raised, never dropped.

### Phase 1.6 — DOMAIN EXPERTS (mandatory — the review is only as good as these)

Before emitting, prove that every source group in `FILE_GROUP_MAP` has a real owner:

1. **Classify the live roster** from the Phase 1 scan: does each `.claude/agents/**/*.md` `description` claim a concrete path/responsibility in this repo? READ-ONLY recon agents inspect live external systems, never source files, so they never own a review group.
2. **Find the gaps** — every group with no confident owner. A gap makes the emitted skill fall back to `Explore` for that surface: a permanently DEGRADED axis.
3. **Fill the gaps (default action).** AskUserQuestion listing the uncovered groups, recommending "create the missing domain experts". On approval, spawn `brewcode:agent-creator` — one agent per missing domain, all in one message — each with the group's paths, the project rules that bind it, and the responsibility it owns. Then re-run the roster scan so the new agents enter `DOMAIN_AGENTS_TABLE` / `FILE_GROUP_MAP`.
4. **If the user declines**, emit anyway, mark each uncovered group DEGRADED in `DOMAIN_AGENTS_TABLE` and say so in the Phase 5 summary. `generate.sh validate` fails when no project expert is wired at all; `SUPERREVIEW_ALLOW_NO_EXPERTS=1` accepts that consciously.
5. **Never invent an agent name.** Every emitted `subagent_type` must resolve to a real file in `.claude/agents/` or a built-in (`Explore`/`Plan`/`general-purpose`) — `validate` enforces it.

> Scope passes need owners too: `SCOPE_AGENT_A` = the agent that owns the task board / tracker read path (e.g. a
> `task-tracker` agent from `/brewtools:task-board-setup`), else `Explore`. `SCOPE_AGENT_B` = a read-only searcher —
> `Explore` by default, since pass B's job is proving an absence across the corpus.

#### 1.6b — `intent-guard` (create-or-reuse; ONE writer, no gate)

`intent-guard` is not a domain expert and not part of the roster-gap procedure above. The emitted skill spawns it
unconditionally at both depths, so it is broken without it.

| Rule | Detail |
|------|--------|
| **Single writer** | `scripts/generate.sh` is the only writer of `.claude/agents/intent-guard.md`, via one shared implementation exposed as two subcommands: `emit` (full generation, Phase 2) and `emit-agent` (the agent alone, no superreview skill involved — what `/brewcode:teams-setup` calls instead of authoring its own copy). Never hand-write the file. `brewcode:agent-creator` may only adapt the seeded BLOCKs of an already-written file, never author it |
| **Reuse wins** | an existing file is the project's own tuned version (or a sibling generator's) and outranks this template: the writer prints `INTENT_GUARD: REUSE <path>` and leaves it byte-untouched — no refresh, no diff-merge, no BLOCK filling. A file without our stamp is reused whatever it contains (unresolved-looking `{UPPER_SNAKE}` tokens are only reported). Recreated, after a `.bak-<ts>` copy: an empty file, or a stamped file of ours that lost its `name: intent-guard` frontmatter or still carries unresolved `{UPPER_SNAKE}` tokens |
| **Migrate, never re-emit** | a file carrying the retired `<!-- intent-guard template vN -->` stamp is ours but pre-standard: the writer prints `INTENT_GUARD: MIGRATED <path>` and restamps metadata only — the frontmatter metadata keys and the tail anchor; every tailored line survives byte-for-byte. A file with no stamp of either generation is the project's own hand-written agent and is only ever reused |
| **No AskUserQuestion** | creation is not gated: it is part of the emitted artifact, like `references/scope.md` |
| **Roster scan** | note in Phase 1 whether the file is present (`generate.sh scan` reports it) so the Phase 5 summary can say CREATED vs REUSED |
| **Not an expert** | never count it toward the domain-expert requirement, never put it in `DOMAIN_AGENTS_TABLE` / `FILE_GROUP_MAP` / `SIMPLIFY_AGENTS`, never make it `VALIDATOR_AGENT` or a scope-pass owner. `generate.sh validate` excludes it from the expert count |

### Phase 2 — Resolve placeholders + emit (scalar substitution)

Export the scalar placeholder values, then run the emit step (sed with a control-char separator, so every value
is single-line):

```bash
export PROJECT_NAME="<repo name>"
export STACK_LABEL="<Java/Kotlin | Node/TypeScript | Python | Go>"
export STACK_REF="<python.md | java-kotlin.md | typescript-react.md | go.md>"
export SOURCE_GLOB="<*.py | *.java | *.ts | *.go ...>"
export PATHSPEC_GLOBS="<'*.py' 'requirements*.txt' 'pyproject.toml' 'Dockerfile*' 'docker-compose.yml' '.github/workflows/*.yml'>"
export ARBITER_AGENT="<project architect agent | general-purpose>"
export VALIDATOR_AGENT="<project arbiter agent | general-purpose>"
export SCOPE_AGENT_A="<task-board/tracker agent | Explore>"
export SCOPE_AGENT_B="<read-only searcher | Explore>"
export TRACKER_LABEL="<e.g. '.claude/features board + GitHub issues (read-only)' | 'GitHub issues only' | 'none'>"
# intent-guard tier sources — `none` is a legitimate value; an absent source is REPORTED, never invented
export SPEC_LOCATION="<e.g. '.claude/specs/**' | 'docs/adr/*.md' | 'none'>"
export PLAN_LOCATION="<e.g. '.claude/features/**' | 'TASKS.md' | 'none'>"
export POLICY_LOCATION="<e.g. 'CLAUDE.md, .claude/rules/**, .claude/convention/**' | 'CLAUDE.md' | 'none'>"
```

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" emit && echo "✅ emit" || echo "❌ emit FAILED"
```

> **STOP if ❌** — unless the message is `already installed`: that refusal is the expected path on a live
> installation (exit 1 by design, no `INTENT_GUARD:` line) and means go to Phase 2b (`upgrade`). Any other ❌ is
> a real failure: verify `${CLAUDE_SKILL_DIR}/references/SKILL.md.template` exists and the target `.claude/` is
> writable.

`emit` writes `<target>/.claude/skills/superreview/SKILL.md`, copies `agent-prompt.md`, `report-template.md`,
`scope.md` and the chosen `${STACK_REF}` into the emitted `references/` (all scalar-substituted), saves the
pristine templates to `.claude/skills/superreview/.template-baseline/` (what `upgrade` later diffs against) and
creates-or-reuses `<target>/.claude/agents/intent-guard.md` (template header stripped, provenance stamp kept).
Every emitted artifact carries the standard metadata in its frontmatter — `doc_type: llm`, `version`,
`content_version`, `generated_by: brewcode:superreview-setup`, `last_updated` — and you export nothing for it:
`version` comes from the plugin's own `.claude-plugin/plugin.json`, `content_version` from this skill's stamp
line (both by script self-location), `last_updated` is `date +%F`. They stay `{PLUGIN_VERSION}` /
`{LAST_UPDATED}` tokens in the raw `.template-baseline/` copies, so a plain version bump makes `upgrade` report
IDENTICAL, never a diff.
> `disable-model-invocation` MUST NOT be set on the emitted skill: the model invoking it mid-plan is a
> first-class path, alongside the user typing `/superreview`.

Key off the one machine-readable status line the writer prints (the `already installed` refusal prints none,
because nothing was written):

| Status line | Meaning |
|-------------|---------|
| `INTENT_GUARD: CREATED .claude/agents/intent-guard.md` | written from the template with SEEDED-DEFAULT BLOCKs — adapt all three in Phase 3 |
| `INTENT_GUARD: REUSE .claude/agents/intent-guard.md` | the file is the project's own — touch nothing in it, skip its Phase 3 table |
| `INTENT_GUARD: MIGRATED .claude/agents/intent-guard.md` | a pre-standard file of ours was restamped in place (metadata only, tailored body preserved) — treat it like REUSE: skip its Phase 3 table, edit nothing |

> `generate.sh emit-agent` is the same writer standalone (agent only, no superreview skill required, same env
> overrides `PROJECT_NAME` / `TRACKER_LABEL` / `SPEC_LOCATION` / `PLAN_LOCATION` / `POLICY_LOCATION`, same three
> status lines); this generator does not need it, `emit` covers it.

### Phase 2b — Already installed? `upgrade`, never re-emit

The emitted skill **self-modifies**: its Phase 4b SELF-SYNC corrects its own routing table, dead gates, scope
baseline and shared surfaces in place on every `EXTENDED` run. A blind re-emit erases all of it, so `emit`
REFUSES on a live installation. When it does:

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" upgrade && echo "✅ upgrade" || echo "❌ upgrade FAILED"
```

It rewrites no live file's content; its one write into a live file is the metadata restamp below. It stages a
fresh emit at `.claude/skills/superreview/.upgrade-staging/` (raw new templates under
`.upgrade-staging/.template/`) and compares the new template against the pristine copies `emit` saved in
`.claude/skills/superreview/.template-baseline/` — never the live file against a template, because a live file
carries Phase 3 tailoring and Phase 4b self-sync edits that no template knows. One line per asset:

| Line | Meaning | What you do |
|------|---------|-------------|
| `IDENTICAL (template unchanged since install — live file untouched)` | no template delta | nothing — the file is still restamped, see below |
| `DIFFERS (<n> template line(s))` | the template really changed | run the printed `diff <baseline> <new template>`, then port only those changes into the live file with targeted **Edit** calls, keeping every tailored + self-synced line |
| `MISSING -> restored RAW (NEEDS PHASE 3: scalar AND block placeholders)` | a deleted asset was restored from the raw template | run Phase 3 on that file before Phase 4 and fill both kinds of placeholder — the scalars too (`{PROJECT_NAME}`, `{STACK_LABEL}`, `{SOURCE_GLOB}`, `{ARBITER_AGENT}`, …): `upgrade` runs with a bare environment and does not re-guess them, since a re-default would bake `this project` / `general-purpose` into a live file that `validate` then passes. `validate` lists every one by name |
| `NO BASELINE - full diff, tailoring included` | the install predates `.template-baseline/` | the count is a live-vs-template diff that includes Phase 3 tailoring, not a template delta; review the staged copy by hand, port only genuine template changes, then promote `.upgrade-staging/.template` to the baseline (command below) |

**Stack.** `upgrade` first prints `UPGRADE_STACK=<name>.md (derived from the installed tree)`: it runs with a
bare environment, so it reads the Phase 1 `STACK_REF` decision back from whichever of `python.md` /
`typescript-react.md` / `go.md` / `java-kotlin.md` is present in `references/` or in
`.template-baseline/references/` instead of defaulting — a wrong name would restamp a file the project lacks and
leave its real reference at the old version, so `/brewcode:setup-status` would report `stale` after every
upgrade. More than one present = a multi-stack install, all restamped. None determinable prints
`UPGRADE_STACK=none — ❌ NO per-stack reference found` and skips the stack doc only; the other four artifacts are
still restamped. `STACK_REF=<name>.md` in the environment overrides the derivation.

**Restamp.** After the delta report `upgrade` refreshes `version` / `content_version` / `generated_by` /
`last_updated` in the frontmatter of every live emitted file, in place, one `RESTAMP:` line each:

```
RESTAMP: .claude/skills/superreview/SKILL.md version "A.B.C" -> "X.Y.Z", content_version -> "P.Q.R", generated_by/last_updated refreshed (body untouched)
```

It is unconditional, not gated on the verdict above: a plain version bump moves no template line (every asset
reports `IDENTICAL`), yet the emitted `SKILL.md` frontmatter `version:` is what `/brewcode:setup-status` reads to
decide `stale`. Nothing else in the file is touched: `doc_type` is preserved when present (it is user-owned), the
body is compared byte-for-byte afterwards, and any mismatch aborts the run before anything is written. A second
`upgrade` on the same version changes only `last_updated`.

Once the delta is applied (and any restored file has been through Phase 3), promote the new templates to the
baseline with the command the script printed —
`rm -rf <baseline> && mv <staging>/.template <baseline> && rm -rf <staging>` — then go to Phase 4. Both
directories carry a `.gitignore` of `*`, so they never enter the user's commits.

> `SUPERREVIEW_FORCE=1 ... emit` overwrites and destroys those corrections — only when the user asks for a clean
> regeneration. `emit-agent` is unaffected: it is already create-or-reuse.

### Phase 3 — Adapt the BLOCK placeholders (AI Edit)

Multi-row tables and multi-line bash cannot go through sed (newlines). Using the **Edit** tool, replace each block
placeholder in the EMITTED files with content you build from Phase 1 analysis.

**In `<target>/.claude/skills/superreview/SKILL.md`:**

| Block placeholder | Replace with |
|-------------------|--------------|
| `{DOMAIN_AGENTS_TABLE}` | one row per project domain expert: `\| <agent> \| Domain owner — <path glob>: <responsibility> \|`; mark any uncovered group `DEGRADED -> Explore` (Phase 1.6) |
| `{GENERAL_AGENTS_TABLE}` | the `{0,1,2}` cross-cutting agents: `<reviewer>` (quality/correctness 2nd pass) + `<ARBITER_AGENT>` (boundary/architecture arbiter + Phase-3 validator), each with an "include WHEN" rule |
| `{RULE_POINTER_TABLE}` | one row per real `.claude/rules/*.md` + `.claude/convention/*.md`: `\| <file> \| <one-line gist> \|` — REFERENCE, never restate |
| `{RULE_PREFLIGHT_LIST}` | the bash `for f in ...; do [ -f "$f" ] || echo "WARN missing rule: $f"; done` listing the SAME real rule files |
| `{FILE_GROUP_MAP}` | one row per source group: `\| <group> \| <path pattern> \| <subagent_type> \|`; tests group -> the test agent (with test-bloat audit); build group -> the CI/build agent |
| `{GATE_COMMANDS}` | the REAL gate block: captured exit codes, a subshell for any `cd`, a guard that SKIPS the gates when the toolchain/deps are missing, and one `GATE <name> OK\|FAIL (exit N)` line per gate. Never a bare `cmd \| tail && echo OK` (that reports `tail`'s status) |
| `{FOCUS_TABLE}` | the ranked focus ordering (default: 1 correctness, 2 architecture/boundary, 3 reuse, 4 version pins, 5 business-reqs), REORDERED per the `<fine-tune-prompt>` |
| `{FOCUS_EMPHASIS}` | one-line note capturing the fine-tune-prompt emphasis (or "default ordering" if none) |
| `{SIMPLIFY_AGENTS}` | comma list of the domain-expert agents the fix-session should delegate to |

**In `<target>/.claude/skills/superreview/references/scope.md`:**

| Block placeholder | Replace with |
|-------------------|--------------|
| `{TEAM_NOTE}` | one line on why blast radius matters HERE — e.g. "N people work this repo in parallel" (from `git shortlog -sn --since=3.months`), or "the shared surfaces below are consumed by other services" for a solo repo |
| `{BASELINE_RESOLUTION_BASH}` | the REAL resolution block: derive the issue id from the branch with an ANCHORED pattern (`^[a-z]+/([0-9]+)(-.*)?$`, never a bare digit run), read the task file / board, read the issue + its declared neighbours READ-ONLY, read the PR, read the decisions log, and read commit intent from `$RANGE` (report "not read" when unset). ALSO parse the matched task file's `## Scope` table when it has one (`id \| block \| in/out \| status`, ids `S1..Sn`, status `not-started\|in-progress\|done`) into the baseline — that is pass B's delivery checklist. The parse must be a SILENT no-op when the section, the task file or the whole board is absent: no `WARN`, no cap, no output line. Degrade to `UNKNOWN` instead of inventing |
| `{SANCTION_PRECEDENCE_TABLE}` | the precedence table for THIS project: user directive (1) > recorded decision / issue comment (2) > issue body + task acceptance (3) > docs decision log (4) > PR body / commit message (5, sanctions NOTHING — it is the artefact under review) |
| `{OWNERSHIP_SIGNALS_BASH}` | the runtime ownership probe: recent authors (`git log -5 --format='%an' -- "$f"`) + any other task claiming the file, with a declared truncation bound |
| `{SHARED_SURFACES_TABLE}` | the concrete always-shared surfaces of THIS repo (public API/contract dirs, migrations, schema/registry files, CI workflows, dependency manifests, design tokens) |

**In `<target>/.claude/agents/intent-guard.md` — only when the writer printed `INTENT_GUARD: CREATED`; on
`REUSE` or `MIGRATED` skip this table and edit nothing in that file.**

Emit already replaced each of the three BLOCK placeholders with a runnable generic default block ending in its
own marker line, so key every Edit on the marker, not on the old `{TOKEN}`: `old_string` = the seeded block plus
its marker line, `new_string` = the project-specific replacement without a marker (a surviving marker makes
`validate` report the agent `UNTAILORED`).

| Seeded block (find by its marker line) | Replace the block AND the marker with |
|-------------------|--------------|
| `<!-- SEEDED-DEFAULT: project-invariants ... -->` | a `\| Invariant \| This project \| Drift signal \|` table with one row each for the five Phase 1 invariants: **planned scale** (the real user/RPS/data figure or "personal tool, single user" — what makes `intent#scale` checkable), **testing policy**, **dependency policy**, **file-layout policy**, **architecture stance**. Every cell is a fact read from the repo with its source file named, never a plausible-sounding guess. Unknown -> write `not stated in this project` and say what would make it checkable |
| `<!-- SEEDED-DEFAULT: drift-examples ... -->` | 3-6 rows, `\| Rule \| Looks like HERE \|`, each mapping one `intent#<class>` onto this repo's real vocabulary and paths (e.g. `intent#deps \| a new HTTP client when the project already ships <the one it uses>`), built from the Phase 1 drift instances. Concrete paths and real library names only — a generic row teaches nothing |
| `<!-- SEEDED-DEFAULT: evidence-commands ... -->` | one fenced bash block of this repo's cheap evidence commands, runnable as-written: `git diff --stat` over the resolved range, `git log --oneline`, the manifest diff for this project's real manifest, the new-file listing, the test-file count under the real test dirs. Read-only, no build, no test run, each a single line. Never emit a command for a manifest or a directory this repo does not have |

> Every emitted row points at a real agent (`.claude/agents/` or built-in `Explore`/`Plan`/`general-purpose`), a
> real rule file, a real path and a real command; invent no agent, rule or gate script. Built-in `Explore` is the
> only allowed fallback for an unavailable domain agent.

### Phase 4 — Validate (NO `{PLACEHOLDER}` may remain)

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" validate && echo "✅ validate" || echo "❌ validate FAILED"
```

> **STOP if ❌** — fix via Edit (or go back to Phase 1.6 and create the experts), then re-run validate. It fails on:

| Failure | Detail |
|---------|--------|
| an unresolved setup-time `{PLACEHOLDER}` | runtime tokens like `{MODE}`, `{DEPTH}`, `{COUNT}`, `{FILE_LIST}`, `{SCOPE_BASELINE}` are allow-listed and expected to remain |
| an agent name that resolves to nothing | — |
| a missing or unusable emitted asset | `.claude/agents/intent-guard.md` is unusable when empty or missing its `name: intent-guard` frontmatter |
| an unresolved placeholder or a surviving TEMPLATE HEADER in that agent file | it has no runtime tokens: every `{...}` in it must be gone. Checked only on a file carrying the template stamp — a reused hand-written intent-guard is byte-untouchable, so validate says so and does not judge it by template rules |
| no project domain expert wired at all | `intent-guard` is excluded (not an expert); only an agent in a routing row — the group/agent tables or a `subagent_type=` — counts |

- Shell expansions are not placeholders: the scan strips every `${UPPER_SNAKE}` first, so Phase 3 evidence commands may use `${BASE}`, `${HOME}` or any other variable. Only a bare `{TOKEN}` is reported, by name; do not silence a false positive by adding the variable's name to the runtime allow-list.
- `⚠️ UNTAILORED` is a warning (exit code unaffected): the agent still carries seeded generic BLOCK defaults, so the Phase 3 adaptation was skipped or incomplete. Replace each named block and its marker, then re-run — an UNTAILORED agent gives generic drift verdicts.
- Order: `emit` writes `.claude/agents/intent-guard.md` before `validate` runs, which is what lets the `subagent_type` allowlist accept `intent-guard`. Never run `validate` on a target that was never emitted.

### Phase 5 — Report

Print the generation summary:

```
superreview generated -> <target>/.claude/skills/superreview/

Stack:          {STACK_LABEL}  (reference: {STACK_REF})
Domain experts: {N} wired ({list}){; created this run: <list>}{; DEGRADED groups: <list>}
General agents: {reviewer?}, {ARBITER_AGENT} (arbiter + validator)
Intent guard:   {CREATED from template | REUSED (already existed — left untouched)}
                tiers: T1={TRACKER_LABEL} / T2={SPEC_LOCATION} / T3={PLAN_LOCATION} / T4={POLICY_LOCATION}
Depth axis:     QUICK (default — intent + gates, 1 spawn) | EXTENDED (full fan-out), inferred from the prompt
Scope baseline: {TRACKER_LABEL}; passes A={SCOPE_AGENT_A} / B={SCOPE_AGENT_B}
Shared surfaces: {N} listed in references/scope.md
Mechanical gates: {list of commands}
Rule pointers:  {N} files referenced (not restated)
File groups:    {N}  ({group->agent})
Focus:          {resolved ordering — fine-tune: <emphasis>}

Files written:
- .claude/skills/superreview/SKILL.md
- .claude/skills/superreview/references/agent-prompt.md
- .claude/skills/superreview/references/scope.md
- .claude/skills/superreview/references/report-template.md
- .claude/skills/superreview/references/{STACK_REF}
- .claude/skills/superreview/.template-baseline/  (pristine templates for `upgrade`; git-ignored)
- .claude/agents/intent-guard.md          {created | REUSED, not written}

Run it:  /superreview "<focus>" [scope]              -> QUICK: intent + gates, 1 agent
         /superreview "deep review of <focus>"       -> EXTENDED: full expert fan-out + validation
```

> Name the depth axis in the summary: a plain `/superreview` is the cheap intent run and a depth word escalates
> it. There is no flag to mention.

## How the emitted skill behaves (what you are generating)

Recap of the shape the emitted SKILL.md implements (full text in `references/SKILL.md.template`):

| Phase | Behavior |
|-------|----------|
| Mode detection | Deterministic `FULL_PROJECT \| EXPLICIT \| UNCOMMITTED \| LAST_COMMITS`, computed not guessed; corpus = git-tracked-or-will-be (ignored = OUT) |
| Depth detection | Semantic, from the prompt, after the mode: `QUICK` (default — no depth word, or a speed word) \| `EXTENDED` (depth/completeness/expertise asked, any language). Depth words are stripped before the rest becomes `{FOCUS}`; both axes are announced, with how to escalate |
| Mechanical gates | Real build/lint/type/test first, both depths; output = `CONFIRMED-BY-EXECUTION`, passed to every agent so nobody re-runs it |
| Intent pass | `intent-guard`, both depths, unconditional, never via the roster procedure; the entire review at `QUICK`. Rows are `CONFIRMED-BY-EVIDENCE` (verbatim ASKED quote + source tier + delivered path/count) and bypass the adversarial validator by design; category `intent`, rules `intent#<class>` |
| Scope baseline | `EXTENDED` only (at `QUICK` intent-guard resolves its own tiers). Task + issue + recorded decisions, read-only; none -> `UNKNOWN` and a permanent P2 cap on scope findings |
| Routing | `EXTENDED` only. Experts picked at runtime from the live roster; non-empty groups only; recon agents excluded; no owner -> `Explore` + DEGRADED marker; `{0,1,2}` general agents by judgement |
| Fan-out | One parallel message. `QUICK`: `intent-guard` alone. `EXTENDED`: + domain experts + scope pass A (diff side, creep shapes 1-6 minus the NOT-creep exclusion list) + scope pass B (baseline side, delivery D1-D5 with proof of absence + closeout C1-C4); shared JSON finding contract; search-first before a reuse/duplication finding (rank 3, 90/70/50% reuse matrix) |
| Validation | `EXTENDED` only. A non-owning validator reverse-validates every verdictless candidate (per finding, batched <=40), merges + de-dups + prioritizes P0-P3; unvalidatable -> `UNVALIDATED` and the run is `INCOMPLETE`. `QUICK` rows are all self-verdicted: the coordinator merges + ranks in-session and the run is never `INCOMPLETE` |
| Scope gate (Phase 3b) | `EXTENDED` only. `AskUserQuestion` on unsanctioned expansion / unproven absence; rewrites priorities only — adds no finding, never lifts the UNKNOWN cap; intent rows never enter it |
| Self-sync (Phase 4b) | `EXTENDED` only, coordinator only, after the report: corrects the emitted SKILL.md + `references/scope.md` in place from data already in context (routing table vs live roster, a gate `not run` because its command is missing, an `UNKNOWN`/mismatched scope baseline, a shared surface a scope finding named). Line delta `<= 0`, facts only; decisions, missing experts and `intent-guard.md` are proposals in the summary, never writes |
| Report | One merged report at `.claude/reports/{TIMESTAMP}_superreview/REPORT.md`, sorted P0->P3, a verdict on every row, plus a Scope Discipline / Blast Radius section; read-only: recommends `/simplify` + a Manager-mode fix session, never edits code |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Emit target | `<cwd>/.claude/skills/superreview/` | Where the generated skill is written |
| Generation script | `${CLAUDE_SKILL_DIR}/scripts/generate.sh` | `scan` \| `emit` \| `emit-agent` \| `upgrade` \| `enable` \| `disable` \| `uninstall` \| `purge` \| `validate`. `emit-agent` writes only `.claude/agents/intent-guard.md` (shared writer, no superreview skill required) — the entry point `/brewcode:teams-setup` calls |
| Disabled marker | `<target>/.claude/skills/superreview/SKILL.md.disabled` | Its presence is the disabled state — there is no config file |
| Intent tier sources | `TRACKER_LABEL` / `SPEC_LOCATION` / `PLAN_LOCATION` / `POLICY_LOCATION` | T1/T2/T3/T4 scalars baked into the agent; T5 (session transcript) is runtime-only. Defaults `.claude/specs/**`, `.claude/features/**`, `` `CLAUDE.md`, `.claude/rules/**` `` |
| Re-run triggers | `upgrade`, never a re-emit | new rule/convention file, stack change, new source group (pointers, PATHSPEC, group map); tracker / branch convention changed, task files gain or lose the `## Scope` id+status (baseline block); this generator's templates changed (ports the delta, keeps self-synced edits) |

## Error Handling

| Condition | Action |
|-----------|--------|
| No `.claude/agents/` in target | Phase 1.6: offer to create the domain experts (`brewcode:agent-creator`). Declined -> emit with `Explore`/`general-purpose`, mark every group DEGRADED, and run validate with `SUPERREVIEW_ALLOW_NO_EXPERTS=1` |
| Only recon agents match a group | Never route source review to them — treat the group as uncovered (create an expert or mark DEGRADED) |
| No tracker / no issues in target | `TRACKER_LABEL="none"`; emit the scope reference anyway — the emitted skill resolves `UNKNOWN` and caps scope findings at P2 (documented, not silent) |
| Gate commands unclear | Ask (Phase 1.5); CI config is the tie-break. Never emit an invented script name — an emitted gate that does not exist reports `not run` forever |
| No `.claude/rules/`/`.claude/convention/` | Emit a minimal rule-pointer table (`CLAUDE.md` only) and warn; the emitted skill degrades to a preflight WARN |
| Unknown / unsupported stack | Emit with the closest per-stack ref + project rules only; warn |
| `enable`/`disable`/`uninstall`/`purge` but nothing installed | `enable`/`disable` exit 1 with `❌ not installed`; `uninstall`/`purge` print `⚠️ nothing to uninstall` (or `purge`) and exit 0. Report it and **STOP** — never emit a fresh install as a "fix" for a removal verb |
| `enable` on a live install, `disable` on a parked one | The script prints `✅ already {enabled\|disabled}` and exits 0. Report it and **STOP**; do not rename |
| `validate` fails right after `disable` | Expected (see the `status` note): say "disabled, not broken" and offer `enable`. Never re-`emit` to "repair" it — that destroys the Phase 4b self-synced edits the parked file still holds |
| `.claude/skills/superreview/` present with neither `SKILL.md` nor `SKILL.md.disabled` | A half-deleted install. Report the dir contents, offer `uninstall` then a fresh `install`. Do not guess which file to recreate |
| No tracker AND no spec/plan/policy dirs | Emit anyway with the defaults; the agent falls back to T5 (the session transcript) and reports its tier in every finding. Invent no paths and do not skip the agent |
| Asked to add a `--fast`/`--deep` flag | Refuse — depth is inferred from the prompt by design; a flag would freeze the axis the emitted skill must read semantically |
| `upgrade` says `DIFFERS` on a file the user hand-edited | `DIFFERS` counts template lines (new template vs `.template-baseline/`), never the user's tailoring. Port that template change onto the live file with Edit; never replace the file with the staged copy. Conflicting section -> ask before replacing it |
| `upgrade` prints `UPGRADE_STACK=none — ❌ NO per-stack reference found` | The install carries no per-stack reference (emitted without one, or it was deleted); nothing is guessed. Re-run as `STACK_REF=<name>.md generate.sh upgrade` to restore the right one — it then reports `MISSING -> restored RAW` |
| Target `.claude/` not writable | STOP — ask the user to run from the repo root. `emit` does `mkdir -p .claude/agents` first; a failure there is the same STOP |
| PLAN block missing, or printed after Phase 0 started | Defect — reprint it before continuing |
