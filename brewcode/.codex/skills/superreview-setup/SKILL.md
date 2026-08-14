---
name: superreview-setup
description: "Generates a project-tailored deep-review skill: domain-expert routing + scope discipline (blast radius, delivery, closeout) + mechanical gates + adversarial validation. Triggers: superreview, generate review skill, deep review skill, scope discipline review"
---

# Project-tailored review

Inspect repository instructions, architecture, tests, and recent changes, then create a focused Codex review skill in the user-selected project `.codex/skills/` path. Encode evidence-based checks, severity guidance, and verification commands. Validate the generated skill and do not create Markdown agent definitions.

## Complete native workflow

Follow every phase below. When a phase delegates work, use Codex collaboration with only `task_name` and `message`; treat each "Codex delegation brief" block as role and message content, not executable syntax. Use `request_user_input` for the documented user gates. Resolve `<skill-directory>`, `<plugin-root>`, `<project-root>`, and `<arguments>` before running commands.

<!-- brewcode-meta: version=5.6.1 content_version=5.6.0 generated_by=brewcode:superreview-setup -->

# Super Review Generator (brewcode:superreview-setup)

**ROLE:** GENERATOR. This skill is HUMAN-invoked. It analyzes the TARGET project, then WRITES a self-contained,
project-local `.codex/skills/superreview/` into that project — the merged deep-review skill (`review` + `standards-review`
folded into one). It does NOT review code itself; it EMITS the skill that does.

**OUTPUT:** A project-local skill at `<target>/.codex/skills/superreview/` (SKILL.md + references) PLUS a project
agent at `<target>/.codex/agents/intent-guard.toml`, modeled exactly on the canonical shape: deterministic MODE
resolution + semantic DEPTH resolution -> MECHANICAL GATES -> ANNOUNCE -> the INTENT pass (`intent-guard`, both
depths) -> [EXTENDED only:] route changed files to project DOMAIN-EXPERT agents selected at RUNTIME -> resolve the
SANCTIONED SCOPE baseline -> reference (not restate) the project's `.codex/rules` + convention files -> ONE
targeted parallel fan-out (domain experts + 2 scope passes + intent) -> per-finding adversarial VALIDATION gate ->
scope gate (request_user_input) -> ONE merged P0-P3 report at
`.codex/reports/{TIMESTAMP}_superreview/REPORT.md`, READ-ONLY (recommends `/simplify`, never edits).

> **Three things make or break the emitted skill:**
> **(1) DOMAIN EXPERTS** — a review routed to generic agents finds generic issues. Phase 1.6 below is mandatory:
> discover the experts, and CREATE the missing ones before emitting.
> **(2) SCOPE DISCIPLINE** — the emitted skill measures every change against the SANCTIONED baseline (task + issue
> + recorded decisions): creep, blast radius, under-delivery, closeout. Phase 1.5 wires it to the target's tracker.
> **(3) THE INTENT PASS** — `intent-guard` answers "was the DELIVERED thing the ASKED thing?". It runs at BOTH
> depths and is the whole review at `QUICK`. Phase 1.6 + Phase 3 wire it to this project's real invariants.

> **The emitted skill has TWO orthogonal axes.** `{MODE}` selects SCOPE (`FULL_PROJECT` / `EXPLICIT` /
> `UNCOMMITTED` / `LAST_COMMITS`). `{DEPTH}` selects EFFORT: **`QUICK`** (the DEFAULT and common case — mechanical
> gates + the intent pass, ONE spawn, no domain experts) or **`EXTENDED`** (the full fan-out + validation + scope
> gate, plus the intent pass). Depth is inferred SEMANTICALLY from the user's prompt, exactly like the `{MODE}`
> whole-project rule — **there is no `--fast`, no flag and no CLI token, and you must not add one.**

> The emitted skill is generic-capable (Java/Kotlin, Node/TS, Python, Go) and self-contained — NO plugin dependency,
> NO sibling-skill orchestration once generated.

**Arguments:** `<arguments>` — `<fine-tune-prompt>` (free text: what to emphasize in the emitted skill's focus ordering)
plus optional `[scope]` hint. The fine-tune prompt is woven into the emitted skill's Focus ordering + emphasis.

---

## Prompt contract

Position 1 of `<arguments>` is a **free-form prompt** (RU/EN) — verbs and flags are optional and may
follow in any order. Nobody types keys: resolve the verb + fine-tune focus FROM the prompt.

1. Strip flags. An explicit verb token anywhere wins outright, no scoring — the seven canonical verbs
   are in the Verb routing table below.
2. Else score verbs by distinct whole-word keyword hits (Verb routing table below). Highest unique
   score wins. Tie involving `purge` (destructive) -> `request_user_input`; tie with `status` ->
   `status`; tie of two mutating verbs -> the keyword appearing first; all zero -> `status` if
   `.codex/skills/superreview/SKILL.md` or its `.disabled` twin exists, else `install`.
3. Empty arguments -> the default above; ask ONE scoping `request_user_input` only when the answer
   changes what gets written. `status` asks nothing.
4. Outcome-changing ambiguity -> ONE `request_user_input` (max 4 questions) BEFORE any work.
5. Prose that names no verb is the fine-tune prompt, not an error — it is woven into the emitted
   skill's Focus ordering (Phase 1.5), never treated as the verb by its first word.

Then print this block ONCE, before the resolved verb runs:

```
PLAN — brewcode:superreview-setup
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved verb> — <explicit | matched keyword: X | default>
SCOPE:  <target repo, fine-tune focus, scope hint>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

Labels are literal; values follow the conversation language.

---

## What the emitted skill merges (review + standards-review)

| Source | What it contributes to the emitted skill |
|--------|------------------------------------------|
| `review` engine | Canonical STRUCTURE: deterministic mode, two-phase **find -> validate**, single merged P0-P3 report, agent prompt contract, report scaffolding |
| `standards-review` | The **reuse/duplication** focus (rank 3: search-first 90/70/50% reuse matrix), tech-stack detection, file-grouping-by-type, per-stack reviewer guidelines, `/simplify` hand-off |
| `setup` Phase 3.5 | Tech-specific check tables (Java/Node/Python/Go) folded into the per-stack reference docs; the placeholder -> concrete generation mechanism |
| Scope discipline | `references/scope.md.template`: sanctioned-baseline resolution + precedence, ownership map + always-shared surfaces, the 6-shape creep taxonomy, the delivery map D1-D5 with PROOF OF ABSENCE, the closeout map C1-C4, the NOT-creep exclusion list, the Phase 3b user gate |
| Runtime expertise | `references/agent-prompt.md`: live-roster expert selection, recon-agent exclusion, DEGRADED marking when a surface has no owner |
| Execution ground truth | Mechanical gates -> `CONFIRMED-BY-EXECUTION`, the only non-adversarial verdict; `UNVALIDATED` -> the run is `INCOMPLETE` |

> Reconcile rule: the canonical shape is the STRUCTURE; `standards-review` + the `review` template supply the
> per-stack checks, the reuse matrix and the report scaffolding baked INTO it; the scope + expert-selection
> references supply the two axes that make the review project-specific rather than generic.

---

## Execution

### Verb routing — resolve FIRST, before anything else

`<arguments>` may start with one of the seven canonical verbs, in this order:
`status | install | upgrade | enable | disable | uninstall | purge`. Anything else is the fine-tune
prompt and takes the free-form path. Strip the verb before using the rest as the fine-tune prompt.

Removed aliases that must never be accepted or printed: `init`, `on`, `off`, `setup`, `remove`,
`reset`, `create`, `update`, `cleanup`. Recognize them in free text, echo the canonical verb back.

| Verb | EN keywords | RU keywords | What runs | Mutates? |
|------|-------------|-------------|-----------|----------|
| `status` | *(empty)*, `status`, `check`, `show` | `статус`, `проверь`, `покажи` | read-only: is `.codex/skills/superreview/` there, is it ENABLED or parked, is `.codex/agents/intent-guard.toml` present, is `.template-baseline/` there? Then `generate.sh validate` and report. **STOP** — no phases run | no |
| `install` | `install`, `setup`, `generate`, `set up`, `create` | `настрой`, `установи`, `сгенерируй` | the full generate flow, Phase 0 -> Phase 4 below | yes |
| `upgrade` | `upgrade`, `update`, `refresh templates` | `обнови`, `апгрейд` | Phase 2b only (`generate.sh upgrade`), then Phase 3 for any `MISSING -> restored` asset, then Phase 4 `validate`. **STOP** | live files only via targeted Edit |
| `enable` | `enable`, `on`, `turn on`, `activate` | `включи`, `активируй` | `generate.sh enable` — un-parks the installed skill. **STOP** | one rename |
| `disable` | `disable`, `off`, `turn off`, `pause` | `выключи`, `отключи`, `пауза` | `generate.sh disable` — parks the installed skill without deleting anything. **STOP** | one rename |
| `uninstall` | `uninstall`, `remove`, `delete skill` | `удали`, `убери` | `generate.sh uninstall` — deletes the generated skill dir, KEEPS the reports and `intent-guard.toml`. Confirm once. **STOP** | deletes |
| `purge` | `purge`, `wipe`, `remove everything`, `nuke` | `вычисти`, `удали полностью` | `generate.sh purge` — uninstall + deletes `.codex/reports/*_superreview/`. Still keeps `intent-guard.toml`. Confirm once, naming the report count. **STOP** | deletes, destructive |
| *(no args at all)* | — | — | `status` when `.codex/skills/superreview/` exists, otherwise `install` | status: no |
| *(no verb, but a prompt)* | — | — | same as `install`; the whole `<arguments>` is the fine-tune prompt | yes |

Print the PLAN block (Prompt contract above) now, before running the resolved verb.

**EXECUTE** using shell (`status` only):
```bash
if test -f .codex/skills/superreview/SKILL.md; then echo "installed: enabled"
elif test -f .codex/skills/superreview/SKILL.md.disabled; then echo "installed: DISABLED (parked as SKILL.md.disabled — run 'enable' to restore)"
elif test -d .codex/skills/superreview; then echo "installed: BROKEN (dir present, no SKILL.md and no SKILL.md.disabled)"
else echo "not_installed"; fi
test -f .codex/agents/intent-guard.toml && echo "intent-guard: present" || echo "intent-guard: MISSING"
test -d .codex/skills/superreview/.template-baseline && echo "baseline: present" || echo "baseline: absent (pre-baseline install)"
echo "reports: $({ find .codex/reports -maxdepth 1 -type d -name '*_superreview' 2>/dev/null || true; } | wc -l | tr -d ' ') dir(s) — deleted by 'purge', kept by 'uninstall'"
bash "<skill-directory>/scripts/generate.sh" validate && echo "✅ validate" || echo "❌ validate FAILED"
```

> `status` never writes and never asks. `not_installed` -> report it and offer `install`; nothing else.
> `installed: DISABLED` is a state, not a fault — report it and offer `enable`. `validate` fails on a
> disabled install (it looks for `SKILL.md`); say so rather than presenting it as a broken installation.

---

### Modes: enable | disable | uninstall | purge

| Mode | Generated skill dir | `references/` + `.template-baseline/` | Phase 3 tailoring | `.codex/reports/*_superreview/` | `intent-guard.toml` |
|------|--------------------|---------------------------------------|-------------------|----------------------------------|-------------------|
| `enable` | `SKILL.md.disabled` -> `SKILL.md` | kept | kept | kept | kept |
| `disable` | `SKILL.md` -> `SKILL.md.disabled` | kept | kept | kept | kept |
| `uninstall` | **deleted** | deleted with it | lost | **kept** | kept |
| `purge` | **deleted** | deleted with it | lost | **deleted** | kept |

**How the toggle works.** Codex discovers a project skill only through `<dir>/SKILL.md`.
`disable` renames that ONE file to `SKILL.md.disabled`, so `/superreview` stops being offered while
`references/`, `.template-baseline/` and every Phase 3 tailoring stay byte-identical on disk. `enable`
renames it back. Nothing is regenerated in either direction, so no `version` is bumped and no
self-synced edit is at risk. Use `disable` to park a review setup that is temporarily noisy; use
`uninstall` when it should really go. Both take effect in the NEXT session — skills are discovered at
session start.

**`intent-guard` is never touched by any of the four.** `generate.sh` (`emit`/`emit-agent`) is its
only writer, and it is shared with `$brewcode:teams-setup`, which may have put it there. Deleting or
parking it would silently break an unrelated team install. All four modes print it as `KEPT`.

**Confirm before deleting.** `uninstall` and `purge` each `request_user_input` exactly once, listing the
real paths (`find .codex/skills/superreview -type f | sort`) and, for `purge`, the number of review
reports being destroyed, with `uninstall` offered as the keep-the-reports alternative. A declined
confirmation ends the run cleanly — delete nothing.

**EXECUTE** using shell (the chosen verb, after confirmation where required):
```bash
bash "<skill-directory>/scripts/generate.sh" MODE_HERE && echo "✅ MODE_HERE" || echo "❌ MODE_HERE FAILED"
```

Then report the script's `MOVED:` / `REMOVED:` / `KEPT:` lines verbatim. Not installed at all ->
say so and **STOP**; never "disable" or "purge" something that was never emitted.


### Delegation (applies to every sub-agent task this generator spawns AND to the fan-out it emits)

A big task handed to one agent = an agent gone for an hour: you cannot observe it, cannot correct
it, and it usually drifts off-target. One subagent = ONE bounded unit — one deliverable
(here: ONE file group's review), ~<=5 files, ~<=10 steps. Bigger MUST be split into N tasks, all
spawned in ONE message — that is why the emitted skill routes file GROUPS to domain owners.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists — the point beyond the file edit |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, by whom, what runs in parallel — trimmed to what THIS agent needs |
| CONSUMER | who or what uses the result next, and the shape it must fit |
| DONE | acceptance criteria + the exact report shape you want back |

A bare one-line task is never enough. When filling `{FILE_GROUP_MAP}` in Phase 3, keep every group
small enough to be one bounded unit — split an oversized group into two rows rather than emitting a
single agent that owns half the repo.

### Phase 0 — Pre-analysis (read THIS skill's emit material)

1. Read the emit templates this generator ships (relative to `<skill-directory>`):
   - `references/SKILL.md.template` — the emitted SKILL.md (with `{PLACEHOLDER}` slots)
   - `references/agent-prompt.md` — runtime expert selection + domain-owner prompt contract (emitted, substituted)
   - `references/scope.md.template` — scope-discipline reference (emitted as the target's `references/scope.md`)
   - `references/intent-guard.md.template` — the anti-drift agent (emitted as `<target>/.codex/agents/intent-guard.toml`;
     READ it before Phase 3 — you fill three BLOCKs in it). Its own header comment documents every placeholder;
     `generate.sh` STRIPS that header on emit
   - `references/report-template.md` — emitted report layout
   - `references/{python,java-kotlin,typescript-react,go}.md` — per-stack reference docs (one is emitted)
2. Confirm the TARGET project is the current working directory (the repo to be reviewed). All emitted paths are
   relative to that repo root.

### Phase 1 — Analyze the TARGET project

Gather everything the emitted skill must be wired to. Explore the code with Bash search (`grep`->ugrep / `find`->bfs
on macOS CC; native Grep/Glob are no-ops there).

**EXECUTE** using shell (project scan):
```bash
bash "<skill-directory>/scripts/generate.sh" scan && echo "✅ scan" || echo "❌ scan FAILED"
```

The scan reports: build files, `.codex/agents/*`, `.codex/rules/*` + `.codex/convention/*`, test dirs, source dirs.
From it (plus your own reads) determine:

| Aspect | How to detect | Drives placeholder |
|--------|---------------|--------------------|
| Tech stack | build files: `pom.xml`/`build.gradle*` -> Java/Kotlin; `package.json`+react/ts -> Node/TS; `pyproject.toml`/`requirements*.txt` -> Python; `go.mod` -> Go | `STACK_LABEL`, `STACK_REF`, `SOURCE_GLOB`, `PATHSPEC_GLOBS` |
| Project agents | `.codex/agents/*.toml` (name + description); map each to the path group it owns; flag READ-ONLY recon agents (cloud/SaaS/tracker consoles) as NON-reviewers | `DOMAIN_AGENTS_TABLE`, `FILE_GROUP_MAP`, `GENERAL_AGENTS_TABLE` |
| Arbiter / validator | an architecture/reviewer agent in `.codex/agents/`, else built-in `general-purpose` | `ARBITER_AGENT`, `VALIDATOR_AGENT` |
| Rule + convention files | `.codex/rules/*.md` + `.codex/convention/*.md` + `AGENTS.md` | `RULE_POINTER_TABLE`, `RULE_PREFLIGHT_LIST` |
| Source path groups | top-level source dirs / service dirs / module layout | `FILE_GROUP_MAP` |
| **Mechanical gates** | the REAL build/lint/type/test commands (`package.json` scripts, Makefile, gradle tasks, `pytest`, `go test`), plus where they run from | `GATE_COMMANDS` |
| **Scope tracker** | `.codex/features/**` board, `gh` + `.github/`, Jira/Linear config, branch naming `<type>/<issue>-<slug>` | `TRACKER_LABEL`, `BASELINE_RESOLUTION_BASH`, `SANCTION_PRECEDENCE_TABLE`, `SCOPE_AGENT_A/B` |
| **Shared surfaces** | public API/contract dirs, DB migrations, schema/registry files, CI workflows, dependency manifests, design tokens | `SHARED_SURFACES_TABLE`, `OWNERSHIP_SIGNALS_BASH` |
| Team parallelism | contributors in `git shortlog -sn --since=3.months`, owner columns on the board | `TEAM_NOTE` |
| DB / test stack | testcontainers, JPA/JOOQ, pytest, jest, etc. | folded into the per-stack reference note |
| **Intent tier sources** | Tier 2 = spec/design-doc dirs (`.codex/specs/**`, `docs/specs/**`, an ADR dir); Tier 3 = plan / task board / task graph (`.codex/features/**`, `TASKS.md`); Tier 4 = policy (root + nested `AGENTS.md`, `.codex/rules/**`, `.codex/convention/**`). Tier 1 is `TRACKER_LABEL`, already detected. Absent -> the literal string `none` | `SPEC_LOCATION`, `PLAN_LOCATION`, `POLICY_LOCATION` |
| **Project invariants** | READ them, do not guess: PLANNED SCALE (users/RPS/data volume stated in README/AGENTS.md/specs — "personal tool" and "10k RPS" produce opposite drift verdicts); TESTING POLICY (the project's own testing rule: few scenario tests vs full-coverage); DEPENDENCY POLICY (pinning rule, "reuse before adding", vendored/allowed sets); FILE-LAYOUT POLICY (one-file-per-what, module boundaries, naming conventions); ARCHITECTURE STANCE (the pattern the project actually committed to, and what it explicitly rejected) | `PROJECT_INVARIANTS_TABLE` |
| **Known drift instances** | past over-engineering in this repo's history + what its rules explicitly FORBID (an `avoid.md` row IS a drift class someone already hit) + the vocabulary this team uses for it | `DRIFT_EXAMPLES_TABLE` |
| **Cheap evidence commands** | this repo's real one-liners: `git diff --stat` on the resolved range, the dependency-manifest diff for THIS manifest (`package.json` / `pom.xml` / `pyproject.toml` / `go.mod`), new-file listing, test-file count under the real test dirs | `EVIDENCE_COMMANDS_BASH` |

**Multi-stack repos:** if more than one stack is detected, pick the DOMINANT one for the emitted `STACK_REF`, and note
the secondary stack(s) in `DOMAIN_AGENTS_TABLE` / `FILE_GROUP_MAP`. (One stack reference doc is emitted; the rule
pointers cover the rest.)

### Phase 1.5 — Clarify genuinely ambiguous params (request_user_input)

Use request_user_input ONLY for params you cannot reliably infer. Never auto-guess a non-obvious choice. Typical questions:

- **The scope baseline** — which tracker sanctions work (file board / GitHub issues / Jira / none), and the
  branch -> issue convention. Without it the emitted skill caps every scope finding at P2, so ASK when unsure.
- **Always-shared surfaces** — confirm the list whose edit widens blast radius across the whole team.
- Which agent is the **architecture arbiter / Phase-3 validator** when several plausible reviewer/architect agents exist.
- The **domain-owner mapping** when an agent's owned path group is unclear.
- Confirm the **dominant stack** when the repo is genuinely multi-stack.
- Confirm the **mechanical gate commands** when several plausible ones exist (CI is the tie-break: use what CI runs).

> Weave the `<fine-tune-prompt>` argument into the emitted Focus ordering: if the user said "focus on X / weight Y
> higher", reorder/emphasize the emitted `FOCUS_TABLE` accordingly (e.g. push security to P0-always, or raise reuse to
> rank 1). Record the emphasis in `FOCUS_EMPHASIS`. Scope discipline stays inside rank 1 whatever the emphasis —
> it may be raised, never dropped.

### Phase 1.6 — DOMAIN EXPERTS (mandatory — the review is only as good as these)

A superreview routed to generic agents produces generic findings. Before emitting, PROVE that every source group
in `FILE_GROUP_MAP` has a real owner:

1. **Classify the live roster** from the Phase 1 scan: for each `.codex/agents/*.toml`, does its `description` claim
   a concrete path/responsibility in this repo? Exclude READ-ONLY recon agents (they inspect live external systems,
   never source files) — they may never own a review group.
2. **Find the gaps** — every group with no confident owner. A gap means the emitted skill falls back to `Explore`
   for that surface, i.e. a permanently DEGRADED axis.
3. **Fill the gaps (default action).** request_user_input listing the uncovered groups, recommending "create the
   missing domain experts". On approval, spawn `brewcode:agent-creator` — ONE agent per missing domain, ALL in ONE
   message — each with the group's paths, the project rules that bind it, and the responsibility it owns. Then
   re-run the roster scan so the new agents enter `DOMAIN_AGENTS_TABLE` / `FILE_GROUP_MAP`.
4. **If the user declines**, emit anyway but mark each uncovered group DEGRADED in `DOMAIN_AGENTS_TABLE`, and say
   so in the Phase 5 summary. `generate.sh validate` fails when NO project expert is wired at all — pass
   `SUPERREVIEW_ALLOW_NO_EXPERTS=1` to accept that consciously.
5. **Never invent an agent name.** Every emitted `subagent_type` must resolve to a real file in `.codex/agents/`
   or a built-in (`Explore`/`Plan`/`general-purpose`) — `validate` enforces it.

> Scope passes need owners too: `SCOPE_AGENT_A` = the agent that owns the task board / tracker read path (e.g. a
> `task-tracker` agent from `$brewtools:task-board-setup`), else `Explore`. `SCOPE_AGENT_B` = a read-only searcher —
> `Explore` is the correct default, since pass B's job is proving an ABSENCE across the corpus.

#### 1.6b — `intent-guard` (create-or-reuse; ONE writer, no gate)

`intent-guard` is NOT a domain expert and is NOT part of the roster-gap procedure above. It is spawned
unconditionally by the emitted skill at BOTH depths, so the emitted skill is broken without it.

| Rule | Detail |
|------|--------|
| **Single writer** | `scripts/generate.sh` is the ONLY writer of `.codex/agents/intent-guard.toml`, via ONE shared implementation exposed as two subcommands: `emit` (full generation, Phase 2) and `emit-agent` (the agent alone, no superreview skill involved — this is what `$brewcode:teams-setup` calls instead of authoring its own copy). **Never hand-write the file.** `brewcode:agent-creator` may only ADAPT the seeded BLOCKs of an already-written file; it may never author it |
| **Reuse wins** | a USABLE file already exists -> the writer prints `INTENT_GUARD: REUSE <path>` and leaves it BYTE-UNTOUCHED. An existing intent-guard is the project's own tuned version (or a sibling generator's) and outranks this template. Do not "refresh" it, do not diff-merge it, do not fill BLOCKs in it. "Usable" = non-empty AND carrying `name: intent-guard` frontmatter AND free of unresolved `{UPPER_SNAKE}` tokens; an empty, truncated or placeholder-laden file is treated as ABSENT and recreated |
| **Migrate, never re-emit** | a file carrying the RETIRED `<!-- intent-guard template vN -->` stamp is ours but pre-standard: the writer prints `INTENT_GUARD: MIGRATED <path>` and restamps METADATA ONLY — the four frontmatter keys and the tail anchor. Every tailored line survives byte-for-byte, so this is the `upgrade restamps it` path, not a regeneration. A file with NO stamp of either generation is the project's own hand-written agent and is only ever REUSED |
| **No request_user_input** | creation is not gated. Do not ask whether to create it; it is part of the emitted artifact, like `references/scope.md` |
| **Roster scan** | note in Phase 1 whether the file is present (`generate.sh scan` reports it) so the Phase 5 summary can say CREATED vs REUSED |
| **Not an expert** | never count it toward the domain-expert requirement, never put it in `DOMAIN_AGENTS_TABLE` / `FILE_GROUP_MAP` / `SIMPLIFY_AGENTS`, never make it `VALIDATOR_AGENT` or a scope-pass owner. `generate.sh validate` excludes it from the expert count for exactly this reason |

### Phase 2 — Resolve placeholders + emit (scalar substitution)

Export the SCALAR placeholder values, then run the emit step (mirrors `setup.sh copy_review_skill()` — sed with a
control-char separator; values MUST be single-line):

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
export TRACKER_LABEL="<e.g. '.codex/features board + GitHub issues (read-only)' | 'GitHub issues only' | 'none'>"
# intent-guard tier sources — `none` is a legitimate value; an absent source is REPORTED, never invented
export SPEC_LOCATION="<e.g. '.codex/specs/**' | 'docs/adr/*.md' | 'none'>"
export PLAN_LOCATION="<e.g. '.codex/features/**' | 'TASKS.md' | 'none'>"
export POLICY_LOCATION="<e.g. 'AGENTS.md, .codex/rules/**, .codex/convention/**' | 'AGENTS.md' | 'none'>"
```

**EXECUTE** using shell:
```bash
bash "<skill-directory>/scripts/generate.sh" emit && echo "✅ emit" || echo "❌ emit FAILED"
```

> **STOP if ❌ — UNLESS the message is `already installed`.** That refusal is the EXPECTED path on a live
> installation: it exits 1 by design, prints no `INTENT_GUARD:` line at all, and means **go to Phase 2b** (run
> `upgrade`), not stop. Any other ❌ is a real failure: verify
> `<skill-directory>/references/SKILL.md.template` exists and the target `.codex/` is writable.

This writes `<target>/.codex/skills/superreview/SKILL.md` (scalars substituted), copies `agent-prompt.md`,
`report-template.md`, `scope.md` and the chosen `${STACK_REF}` (all scalar-substituted) into the emitted
`references/`, saves the pristine templates to `.codex/skills/superreview/.template-baseline/` (what `upgrade`
later diffs against), and **creates-or-reuses `<target>/.codex/agents/intent-guard.toml`** (template header
stripped, provenance stamp kept). Every emitted artifact is stamped with the four standard metadata fields —
`doc_type: llm`, `version`, `generated_by: brewcode:superreview-setup`, `last_updated` — in its frontmatter;
you export NOTHING for them. `version` is read out of the plugin's own `.codex-plugin/plugin.json` by script
self-location and `last_updated` is `date +%F`. Both stay `{PLUGIN_VERSION}` / `{LAST_UPDATED}` in the raw
`.template-baseline/` copies, so a plain version bump makes `upgrade` report IDENTICAL, never a diff.
> `disable-model-invocation` MUST NOT be set on the emitted skill: the model invoking it mid-plan is a
> first-class path, alongside the user typing `/superreview`.

Key off the ONE machine-readable status line the writer prints — the
`already installed` refusal path prints NO status line, because nothing was written:

| Status line | Meaning |
|-------------|---------|
| `INTENT_GUARD: CREATED .codex/agents/intent-guard.toml` | written from the template with SEEDED-DEFAULT BLOCKs — you MUST adapt all three in Phase 3 |
| `INTENT_GUARD: REUSE .codex/agents/intent-guard.toml` | the file is the project's own — touch NOTHING in it, skip its Phase 3 table |
| `INTENT_GUARD: MIGRATED .codex/agents/intent-guard.toml` | a pre-standard file of ours was restamped in place (metadata only, tailored body preserved) — treat it exactly like REUSE: skip its Phase 3 table, edit nothing |

> The same writer is available standalone as `generate.sh emit-agent` (agent only, no superreview skill required,
> same env overrides `PROJECT_NAME` / `TRACKER_LABEL` / `SPEC_LOCATION` / `PLAN_LOCATION` / `POLICY_LOCATION`,
> same three status lines). `$brewcode:teams-setup` uses it; this generator does not need it, `emit` covers it.

### Phase 2b — Already installed? `upgrade`, never re-emit

The emitted skill **self-modifies**: its Phase 4b SELF-SYNC corrects its own routing table, dead gates, scope
baseline and shared surfaces in place on every `EXTENDED` run. A blind re-emit erases all of it, so `emit`
REFUSES on a live installation. When it does:

**EXECUTE** using shell:
```bash
bash "<skill-directory>/scripts/generate.sh" upgrade && echo "✅ upgrade" || echo "❌ upgrade FAILED"
```

It rewrites no live file's CONTENT — the one thing it does write into a live file is the metadata restamp below.
It stages a fresh emit at `.codex/skills/superreview/.upgrade-staging/` (with the raw new
templates under `.upgrade-staging/.template/`) and compares the NEW TEMPLATE against the pristine copies `emit`
saved in `.codex/skills/superreview/.template-baseline/` — **never the live file against a template**, because a
live file legitimately carries Phase 3 tailoring and Phase 4b self-sync edits that no template ever knew about.
One line per asset:

| Line | Meaning | What you do |
|------|---------|-------------|
| `IDENTICAL (template unchanged since install)` | no template delta | nothing — but the file is still restamped, see below |
| `DIFFERS (<n> template line(s))` | the TEMPLATE really changed | run the printed `diff <baseline> <new template>`, then port ONLY those changes into the LIVE file with targeted **Edit** calls, keeping every tailored + self-synced line |
| `MISSING -> restored RAW (NEEDS PHASE 3: scalar AND block placeholders)` | a deleted asset was restored from the RAW template | **go to Phase 3 for that file** and fill BOTH kinds of placeholder — the SCALARS too (`{PROJECT_NAME}`, `{STACK_LABEL}`, `{ARBITER_AGENT}`, …), because `upgrade` runs with a bare environment and deliberately does NOT re-guess them. `validate` lists every one by name |
| `NO BASELINE - full diff, tailoring included` | install predates the baseline | the count is NOT a template delta; review the staged copy by hand and port only genuine template changes |

**The stack is re-derived, never re-defaulted.** The first line `upgrade` prints is
`UPGRADE_STACK=<name>.md (derived from the installed tree)`. The per-stack reference was a Phase 1 DECISION
(`STACK_REF`), and `upgrade` runs with a bare environment, so it reads that decision back out of the installed tree —
whichever of `python.md` / `typescript-react.md` / `go.md` / `java-kotlin.md` is present in
`references/` or in `.template-baseline/references/` — instead of falling back to a default. Everything below
iterates that name: a wrong one would leave the project's real reference behind at the old version forever while
restamping a file the project does not have, so `$brewcode:setup-status` would report `stale` after every
successful upgrade. More than one present = a multi-stack install, and all of them are restamped. None
determinable prints `UPGRADE_STACK=none — ❌ NO per-stack reference found` and skips the stack doc only; the other
four artifacts are still restamped. `STACK_REF=<name>.md` in the environment overrides the derivation.

**The restamp — one `RESTAMP:` line per live file, and it is unconditional.** After the delta report, `upgrade`
refreshes `version` / `generated_by` / `last_updated` in the frontmatter of every live emitted file, in place:

```
RESTAMP: .codex/skills/superreview/SKILL.md version "A.B.C" -> "X.Y.Z", generated_by/last_updated refreshed (body untouched)
```

It is deliberately NOT gated on the verdict above. A plain version bump moves no template line, so every asset
reports `IDENTICAL` — and the emitted `SKILL.md` frontmatter `version:` is exactly what `$brewcode:setup-status`
reads to decide `stale`. An `upgrade` that skipped it reported success and left the stamp where it was, so the
next `status` printed `stale` again, forever. Nothing else in the file is touched: `doc_type` is preserved when
present (it is user-owned), the body is compared byte-for-byte afterwards, and any mismatch aborts the run before
anything is written — Phase 3 tailoring and Phase 4b self-sync edits survive intact. A second `upgrade` on the
same version is a no-op apart from `last_updated`.

Then, once the delta is applied (and any restored file has been through Phase 3), promote the new templates to the
baseline and clean up with the command the script printed:
`rm -rf <baseline> && mv <staging>/.template <baseline> && rm -rf <staging>` — after which go to Phase 4. Both
directories carry a `.gitignore` of `*`, so they never enter the user's commits.

> `SUPERREVIEW_FORCE=1 ... emit` overwrites and **destroys** those corrections — use it only when the user asks
> for a clean regeneration. `emit-agent` is unaffected: it is already create-or-reuse.

### Phase 3 — Adapt the BLOCK placeholders (AI Edit)

Multi-row tables and multi-line bash cannot go through sed (newlines). Using the **Edit** tool, replace each block
placeholder in the EMITTED files with content you build from Phase 1 analysis.

**In `<target>/.codex/skills/superreview/SKILL.md`:**

| Block placeholder | Replace with |
|-------------------|--------------|
| `{DOMAIN_AGENTS_TABLE}` | one row per project domain expert: `\| <agent> \| Domain owner — <path glob>: <responsibility> \|`; mark any uncovered group `DEGRADED -> Explore` (Phase 1.6) |
| `{GENERAL_AGENTS_TABLE}` | the `{0,1,2}` cross-cutting agents: `<reviewer>` (quality/correctness 2nd pass) + `<ARBITER_AGENT>` (boundary/architecture arbiter + Phase-3 validator), each with an "include WHEN" rule |
| `{RULE_POINTER_TABLE}` | one row per real `.codex/rules/*.md` + `.codex/convention/*.md`: `\| <file> \| <one-line gist> \|` — REFERENCE, never restate |
| `{RULE_PREFLIGHT_LIST}` | the bash `for f in ...; do [ -f "$f" ] || echo "WARN missing rule: $f"; done` listing the SAME real rule files |
| `{FILE_GROUP_MAP}` | one row per source group: `\| <group> \| <path pattern> \| <subagent_type> \|`; tests group -> the test agent (with test-bloat audit); build group -> the CI/build agent |
| `{GATE_COMMANDS}` | the REAL gate block: captured exit codes, a subshell for any `cd`, a guard that SKIPS the gates when the toolchain/deps are missing, and one `GATE <name> OK\|FAIL (exit N)` line per gate. Never a bare `cmd \| tail && echo OK` (that reports `tail`'s status) |
| `{FOCUS_TABLE}` | the ranked focus ordering (default: 1 correctness, 2 architecture/boundary, 3 reuse, 4 version pins, 5 business-reqs), REORDERED per the `<fine-tune-prompt>` |
| `{FOCUS_EMPHASIS}` | one-line note capturing the fine-tune-prompt emphasis (or "default ordering" if none) |
| `{SIMPLIFY_AGENTS}` | comma list of the domain-expert agents the fix-session should delegate to |

**In `<target>/.codex/skills/superreview/references/scope.md`:**

| Block placeholder | Replace with |
|-------------------|--------------|
| `{TEAM_NOTE}` | one line on why blast radius matters HERE — e.g. "N people work this repo in parallel" (from `git shortlog -sn --since=3.months`), or "the shared surfaces below are consumed by other services" for a solo repo |
| `{BASELINE_RESOLUTION_BASH}` | the REAL resolution block: derive the issue id from the branch with an ANCHORED pattern (`^[a-z]+/([0-9]+)(-.*)?$`, never a bare digit run), read the task file / board, read the issue + its declared neighbours READ-ONLY, read the PR, read the decisions log, and read commit intent from `$RANGE` (report "not read" when unset). ALSO parse the matched task file's `## Scope` table when it has one (`id \| block \| in/out \| status`, ids `S1..Sn`, status `not-started\|in-progress\|done`) into the baseline — that is pass B's delivery checklist. The parse must be a SILENT no-op when the section, the task file or the whole board is absent: no `WARN`, no cap, no output line. Degrade to `UNKNOWN` instead of inventing |
| `{SANCTION_PRECEDENCE_TABLE}` | the precedence table for THIS project: user directive (1) > recorded decision / issue comment (2) > issue body + task acceptance (3) > docs decision log (4) > PR body / commit message (5, sanctions NOTHING — it is the artefact under review) |
| `{OWNERSHIP_SIGNALS_BASH}` | the runtime ownership probe: recent authors (`git log -5 --format='%an' -- "$f"`) + any other task claiming the file, with a declared truncation bound |
| `{SHARED_SURFACES_TABLE}` | the concrete always-shared surfaces of THIS repo (public API/contract dirs, migrations, schema/registry files, CI workflows, dependency manifests, design tokens) |

**In `<target>/.codex/agents/intent-guard.toml` — ONLY when the writer printed `INTENT_GUARD: CREATED`. On
`INTENT_GUARD: REUSE` or `INTENT_GUARD: MIGRATED`, SKIP this table entirely and edit nothing in that file.**

> **The three BLOCK placeholders are already gone by now** — emit replaced each with a runnable GENERIC DEFAULT
> block that ends in its own marker line. Key every Edit on the marker, not on the old `{TOKEN}`: your
> `old_string` is the seeded block PLUS its marker line, and your `new_string` is the project-specific
> replacement WITHOUT any marker (a surviving marker makes `validate` report the agent `UNTAILORED`).

| Seeded block (find by its marker line) | Replace the block AND the marker with |
|-------------------|--------------|
| `<!-- SEEDED-DEFAULT: project-invariants ... -->` | a `\| Invariant \| This project \| Drift signal \|` table with ONE row each for: **planned scale** (the real user/RPS/data figure or "personal tool, single user" — this is what makes `intent#scale` checkable), **testing policy** (the project's own rule, cited by file), **dependency policy** (pinning + reuse-before-adding, cited), **file-layout policy** (module boundaries, one-file-per-what, naming), **architecture stance** (the pattern committed to, and the one explicitly rejected). Every cell is a FACT read from the repo with its source file named — never a plausible-sounding guess. Unknown -> write `not stated in this project` and say what would make it checkable |
| `<!-- SEEDED-DEFAULT: drift-examples ... -->` | 3-6 rows, `\| Rule \| Looks like HERE \|`, each mapping one `intent#<class>` onto this repo's real vocabulary and paths (e.g. `intent#deps \| a new HTTP client when the project already ships <the one it uses>`). Mine them from the repo's own `avoid`/rules files (a forbidden practice IS a drift class someone already hit) and from its history. Concrete paths and real library names only — a generic row teaches nothing |
| `<!-- SEEDED-DEFAULT: evidence-commands ... -->` | ONE fenced bash block of this repo's cheap evidence commands, runnable as-written: `git diff --stat` over the resolved range, `git log --oneline`, the manifest diff for THIS project's real manifest, the new-file listing, the test-file count under the REAL test dirs. Read-only, no build, no test run, each a single line. Never emit a command for a manifest or a directory this repo does not have |

> These three make the generic drift classes checkable HERE. A project whose planned scale is "one user, local
> script" and one serving 10k RPS produce OPPOSITE verdicts on the same caching layer — that fact belongs in the
> invariants table or the intent pass is guessing.

> Keep every emitted row pointing at a REAL agent (`.codex/agents/` or built-in `Explore`/`Plan`/`general-purpose`), a
> REAL rule file, a REAL path and a REAL command. Do NOT invent agents, rules or gate scripts. Built-in `Explore` is
> the only allowed fallback for an unavailable domain agent.

### Phase 4 — Validate (NO `{PLACEHOLDER}` may remain)

**EXECUTE** using shell:
```bash
bash "<skill-directory>/scripts/generate.sh" validate && echo "✅ validate" || echo "❌ validate FAILED"
```

> **STOP if ❌** — validate reports these classes of failure: an unresolved setup-time `{PLACEHOLDER}` (runtime
> tokens like `{MODE}`, `{DEPTH}`, `{COUNT}`, `{FILE_LIST}`, `{SCOPE_BASELINE}` are allow-listed and expected to
> remain), an agent name that resolves to nothing, a missing OR unusable emitted asset (`.codex/agents/intent-guard.toml`
> counts as unusable when empty or missing its `name: intent-guard` frontmatter), an unresolved placeholder or a
> surviving TEMPLATE HEADER in that agent file (it has NO runtime tokens — every `{...}` in it must be gone), and
> **no project domain expert wired at all** (`intent-guard` is excluded from that count — it is not an expert; the
> count only credits an agent that appears in a ROUTING row — the group/agent tables or a `task_role=`). Fix
> via Edit (or go back to Phase 1.6 and create the experts), then re-run validate.

> The template checks above run ONLY against an agent file carrying the template stamp. A REUSED hand-written
> intent-guard is byte-untouchable by contract, so validate says so and does not judge it by template rules.

> **Shell expansions are NOT placeholders.** The scan strips every `${UPPER_SNAKE}` before looking for tokens, so
> Phase 3 evidence commands may freely use `${BASE}`, `${HOME}`, `<plugin-root>` or any other variable —
> only a BARE `{TOKEN}` is reported, and it is reported by name with no surrounding characters. Do not work around
> a false positive by adding the variable's name to the runtime allow-list.

> **`⚠️ UNTAILORED` is a WARNING, not a failure** (exit code unaffected): the agent still carries seeded generic
> BLOCK defaults, i.e. the Phase 3 adaptation was skipped or incomplete. Go back to Phase 3, replace each named
> block AND its marker, and re-run — never ship an UNTAILORED agent silently.

> Ordering matters: `emit` writes `.codex/agents/intent-guard.toml` BEFORE `validate` runs, which is what lets the
> `subagent_type` allowlist accept `intent-guard` — it is a real project agent by then. Never run `validate` on a
> target that was never emitted.

### Phase 5 — Report

Print the generation summary:

```
superreview generated -> <target>/.codex/skills/superreview/

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
- .codex/skills/superreview/SKILL.md
- .codex/skills/superreview/references/agent-prompt.md
- .codex/skills/superreview/references/scope.md
- .codex/skills/superreview/references/report-template.md
- .codex/skills/superreview/references/{STACK_REF}
- .codex/skills/superreview/.template-baseline/  (pristine templates for `upgrade`; git-ignored)
- .codex/agents/intent-guard.toml          {created | REUSED, not written}

Run it:  /superreview "<focus>" [scope]              -> QUICK: intent + gates, 1 agent
         /superreview "deep review of <focus>"       -> EXTENDED: full expert fan-out + validation
```

> Say the depth axis out loud in the summary: users who expect the old always-full behaviour must learn that a
> plain `/superreview` is now the cheap intent run and that a depth word escalates it. There is no flag to mention.

---

## How the emitted skill behaves (what you are generating)

Recap of the canonical shape the emitted SKILL.md implements (full text in `references/SKILL.md.template`):

| Phase | Behavior |
|-------|----------|
| Mode detection | Deterministic `FULL_PROJECT \| EXPLICIT \| UNCOMMITTED \| LAST_COMMITS`, COMPUTED not guessed; corpus = git-tracked-or-will-be (ignored = OUT) |
| **Depth detection** | SEMANTIC, from the prompt, right after the mode: `QUICK` (DEFAULT — depth words absent, or a speed word present) \| `EXTENDED` (the prompt asks for depth/completeness/expertise, any language). **No flag, no CLI token.** Depth words are consumed here and stripped before the rest becomes `{FOCUS}`. Orthogonal to mode; both ANNOUNCEd, along with how to escalate |
| Mechanical gates | Real build/lint/type/test run FIRST (BOTH depths); their output is `CONFIRMED-BY-EXECUTION`, passed to every agent so nobody re-runs them |
| **Intent pass** | `intent-guard` spawned at BOTH depths, unconditionally, never via the roster procedure. Rows carry `CONFIRMED-BY-EVIDENCE` (verbatim ASKED quote + source tier + delivered path/count) and BYPASS the adversarial validator by design; category `intent`, rules `intent#<class>`. At `QUICK` it is the entire review |
| Scope baseline | `EXTENDED` only. sub-agent task + issue + recorded decisions resolved read-only; no baseline -> `UNKNOWN` and a PERMANENT P2 cap on scope findings. At `QUICK` it is skipped — intent-guard resolves its own tiers |
| Routing | `EXTENDED` only. Experts selected at RUNTIME from the live roster; enable ONLY non-empty groups; recon agents excluded; no owner -> `Explore` + DEGRADED marker; add `{0,1,2}` general agents by judgement |
| Fan-out | ONE parallel message. `QUICK`: `intent-guard` alone. `EXTENDED`: `intent-guard` + domain experts + scope pass A (diff side, shapes 1-6) + scope pass B (baseline side, delivery D1-D5 + closeout C1-C4); shared JSON finding contract; search-first before flagging reuse/duplication |
| Validation | `EXTENDED` only. A NON-OWNING validator reverse-validates EVERY verdictless candidate (adversarial, per-finding gate, batched <=40), merges + de-dups + prioritizes P0-P3; unvalidatable -> `UNVALIDATED` and the run is `INCOMPLETE`. At `QUICK` the pool is entirely self-verdicted, so the coordinator merges + ranks in-session and the run is NOT `INCOMPLETE` |
| Scope gate | `EXTENDED` only. `request_user_input` on unsanctioned expansion / unproven absence; rewrites priorities only, never adds findings, never lifts the UNKNOWN cap. Intent rows never enter it |
| **Self-sync** | `EXTENDED` only, coordinator only, after the report: Phase 4b corrects the emitted SKILL.md + `references/scope.md` IN PLACE from data already in context — routing table vs the live roster, a gate that reported `not run` because the command does not exist, an `UNKNOWN`/mismatched scope baseline, a shared surface a scope finding named. Line delta `<= 0`, facts only; DECISIONS, missing experts and `intent-guard.toml` are PROPOSALS printed in the summary, never writes |
| Report | ONE merged report at `.codex/reports/{TIMESTAMP}_superreview/REPORT.md`, sorted P0->P3, every row carrying its verdict, with a Scope Discipline / Blast Radius section; READ-ONLY; recommends `/simplify` + a Manager-mode fix session; never edits code |

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Emit target | `<cwd>/.codex/skills/superreview/` | Where the generated skill is written |
| Emit templates | `<skill-directory>/references/` | Source templates for the generation |
| Generation script | `<skill-directory>/scripts/generate.sh` | `scan` \| `emit` \| `emit-agent` \| `upgrade` \| `enable` \| `disable` \| `uninstall` \| `purge` \| `validate`. `emit-agent` writes ONLY `.codex/agents/intent-guard.toml` (shared writer, no superreview skill required) — that is the entry point `$brewcode:teams-setup` calls |
| Disabled marker | `<target>/.codex/skills/superreview/SKILL.md.disabled` | What `disable` renames `SKILL.md` to. Its presence IS the disabled state — there is no config file. `enable` renames it back; `uninstall`/`purge` delete the whole dir either way |
| Re-generation | `upgrade` (Phase 2b) | `emit` refuses on a live installation because the emitted skill self-syncs; `upgrade` stages the new templates and never writes a live file. `SUPERREVIEW_FORCE=1` overwrites and destroys self-synced edits |
| Template baseline | `<target>/.codex/skills/superreview/.template-baseline/` | Pristine copies of the templates `emit` generated from (git-ignored via its own `.gitignore`). `upgrade` diffs the NEW template against them, so the reported delta is the TEMPLATE's change and never the Phase 3 tailoring the live files carry. Absent (pre-baseline install) -> `upgrade` reports `NO BASELINE` and falls back to a live-vs-template diff |
| Stack reference | one of `python.md \| java-kotlin.md \| typescript-react.md \| go.md` | Emitted per the dominant detected stack |
| Domain experts | MANDATORY (Phase 1.6) | gaps are filled via `brewcode:agent-creator`; `validate` fails with zero experts unless `SUPERREVIEW_ALLOW_NO_EXPERTS=1`. `intent-guard` never counts as one |
| Review depth | `QUICK` (emitted default) | Resolved SEMANTICALLY per run by the emitted skill from the user's prompt. `EXTENDED` on a depth request. No flag exists and none may be added |
| `intent-guard` | created-or-reused at emit (Phase 1.6b) | `scripts/generate.sh` (`emit` \| `emit-agent`, one shared implementation) is the ONLY writer of `.codex/agents/intent-guard.toml`; a usable existing file is REUSED byte-untouched. Runs at BOTH depths |
| Intent tier sources | `TRACKER_LABEL` / `SPEC_LOCATION` / `PLAN_LOCATION` / `POLICY_LOCATION` | T1/T2/T3/T4 scalars baked into the agent; T5 (session transcript) is runtime-only. Defaults `.codex/specs/**`, `.codex/features/**`, `` `AGENTS.md`, `.codex/rules/**` `` |
| Scope reference | `references/scope.md` (always emitted) | baseline + ownership + taxonomy + delivery + closeout + gate |
| Scope agents | `SCOPE_AGENT_A` tracker owner, `SCOPE_AGENT_B` read-only searcher | default `Explore` for both |
| Block placeholders | AI-filled (Edit) | Tables + bash blocks that cannot go through sed; validated post-emit |

---

## Error Handling

| Condition | Action |
|-----------|--------|
| No `.codex/agents/` in target | Phase 1.6: offer to CREATE the domain experts (`brewcode:agent-creator`). Declined -> emit with `Explore`/`general-purpose`, mark every group DEGRADED, and run validate with `SUPERREVIEW_ALLOW_NO_EXPERTS=1` |
| Some groups have no owner | Create the missing experts (Phase 1.6); declined -> that group is `Explore` + DEGRADED in `DOMAIN_AGENTS_TABLE` and in the Phase 5 summary |
| Only recon agents match a group | Never route source review to them — treat the group as uncovered (create an expert or mark DEGRADED) |
| No tracker / no issues in target | `TRACKER_LABEL="none"`; emit the scope reference anyway — the emitted skill resolves `UNKNOWN` and caps scope findings at P2 (documented, not silent) |
| Gate commands unclear | Ask (Phase 1.5); CI config is the tie-break. Never emit an invented script name — an emitted gate that does not exist reports `not run` forever |
| No `.codex/rules/`/`.codex/convention/` | Emit a minimal rule-pointer table (`AGENTS.md` only); WARN; the emitted skill degrades gracefully (preflight WARN) |
| Unknown / unsupported stack | Emit with the closest per-stack ref + project rules only; warn |
| Multi-stack repo | Pick dominant stack for `STACK_REF`; note secondaries in the agent/group tables |
| `.codex/agents/intent-guard.toml` already exists | REUSE it — the writer prints `INTENT_GUARD: REUSE <path>` and does not write the file. Never overwrite, never diff it into shape, never ask. Skip the Phase 3 BLOCK adaptation for it |
| `.codex/agents/intent-guard.toml` exists but is EMPTY / has no `name: intent-guard` frontmatter | Not a reusable file — the writer says so and RECREATES it from the template. Then the Phase 3 adaptation applies as for any CREATED file |
| `.codex/agents/intent-guard.toml` carries the retired `intent-guard template vN` stamp | Pre-standard file of ours. The writer prints `INTENT_GUARD: MIGRATED <path>`: the four metadata keys and the tail anchor are restamped, the tailored body is untouched. Do NOT run Phase 3 on it and do NOT re-emit it |
| `enable`/`disable`/`uninstall`/`purge` but nothing installed | The script exits 1 with `❌ not installed` (or `⚠️ nothing to uninstall`). Report it and **STOP** — never emit a fresh install as a "fix" for a removal verb |
| `enable` on a live install, `disable` on a parked one | The script prints `✅ already {enabled\|disabled}` and exits 0. Report it and **STOP**; do not rename |
| `validate` fails right after `disable` | Expected: `validate` looks for `SKILL.md`, which is now `SKILL.md.disabled`. Say "disabled, not broken" and offer `enable`. Never re-`emit` to "repair" it — that would destroy the Phase 4b self-synced edits the parked file still holds |
| `.codex/skills/superreview/` present with neither `SKILL.md` nor `SKILL.md.disabled` | Genuinely broken (a half-deleted install). Report the dir contents, offer `uninstall` then a fresh `install`. Do not guess which file to recreate |
| `validate` prints `⚠️ UNTAILORED` | The Phase 3 BLOCK adaptation was skipped or partial (seeded markers survive). Warning, not a failure: go back to Phase 3, replace each seeded block + marker, re-run validate |
| No tracker AND no spec/plan/policy dirs | Emit anyway with the defaults; the agent falls back to T5 (the session transcript) and reports its tier in every finding. Do NOT invent paths and do NOT skip the agent |
| Target has no writable `.codex/agents/` | `emit` does `mkdir -p .codex/agents` first; a failure there is the same STOP as an unwritable `.codex/` |
| Asked to add a `--fast`/`--deep` flag | Refuse — depth is inferred from the prompt by design. A flag would freeze the axis the emitted skill must read semantically |
| Unresolved `{PLACEHOLDER}` after Phase 3 | `validate` fails listing them (including any left in the emitted `intent-guard.toml`); fix via Edit, re-run validate |
| `emit` refuses — superreview already installed | Expected, not an error: the live skill carries Phase 4b self-sync corrections, and the refusal prints NO `INTENT_GUARD:` line. Go to Phase 2b and run `upgrade`. Only `SUPERREVIEW_FORCE=1` overwrites, and only on an explicit request for a clean regeneration |
| `upgrade` says `DIFFERS` on a file the user hand-edited | `DIFFERS` counts TEMPLATE lines (new template vs `.template-baseline/`), never the user's tailoring. Port that template change onto the live file with Edit; never replace the file with the staged copy. Conflicting section -> ask before replacing it |
| `upgrade` says `NO BASELINE` | The install predates `.template-baseline/`, so the printed count is a live-vs-template diff that INCLUDES Phase 3 tailoring — do not treat it as a template delta. Review the staged copy by hand, port only what the template really changed, then promote `.upgrade-staging/.template` to the baseline (command printed by the script) |
| `upgrade` says `MISSING -> restored RAW` | The restored file is a RAW template: BOTH its BLOCK placeholders AND its scalars (`{PROJECT_NAME}`, `{STACK_LABEL}`, `{SOURCE_GLOB}`, the agent names) are unresolved, on purpose — `upgrade` has no environment to resolve them from and re-defaulting them would bake `this project` / `general-purpose` into a live file that `validate` then passes. Run Phase 3 on it BEFORE Phase 4; `validate` names every token |
| `upgrade` prints `UPGRADE_STACK=none — ❌ NO per-stack reference found` | The install carries none of `python.md` / `typescript-react.md` / `go.md` / `java-kotlin.md` (emitted without one, or it was deleted). The other four artifacts are still restamped; nothing is guessed. Re-run as `STACK_REF=<name>.md generate.sh upgrade` to restore the right one — it then reports `MISSING -> restored RAW` |
| Target `.codex/` not writable | STOP — ask the user to run from the repo root |
| Arguments are prose, not a verb | Extract the target/scope from the prose; never treat the first word as the verb |
| PLAN block missing, or printed after Phase 0 started | Defect — reprint it before continuing |

---

## References

- `references/SKILL.md.template` — the emitted SKILL.md (placeholder slots).
- `references/agent-prompt.md` — runtime expert-selection procedure + domain-owner prompt contract (emitted).
- `references/scope.md.template` — scope discipline: baseline, ownership, taxonomy, delivery, closeout, gate (emitted).
- `references/intent-guard.md.template` — the anti-drift agent (asked vs delivered), emitted to `.codex/agents/intent-guard.toml` create-or-reuse.
- `references/report-template.md` — emitted merged-report layout.
- `references/{python,java-kotlin,typescript-react,go}.md` — per-stack reference docs (one is emitted).
- `scripts/generate.sh` — `scan` / `emit` / `emit-agent` / `upgrade` / `enable` / `disable` / `uninstall` /
  `purge` / `validate` (validate also enforces the
  domain-expert requirement; `emit-agent` is the shared intent-guard writer used standalone by `$brewcode:teams-setup`;
  `upgrade` refreshes a live installation without destroying its self-synced edits, diffing the NEW template
  against the pristine `.template-baseline/` copies `emit` saved).

<!--
SKILL NOTES — brewcode:superreview-setup (GENERATOR)

HUMAN-invoked generator. Analyzes a target project and emits a self-contained project-local deep-review skill
(review + standards-review merged) on the canonical shape. Stack-generic (Java/Kotlin, Node/TS, Python, Go).
The EMITTED skill is the one that reviews code; this skill only writes it.

Three non-negotiables: DOMAIN EXPERTS (Phase 1.6 discovers gaps and creates the missing agents; validate enforces
>=1 wired expert), SCOPE DISCIPLINE (references/scope.md.template — baseline, ownership, 6-shape taxonomy,
delivery D1-D5 with proof-of-absence, closeout C1-C4, Phase 3b gate), and the INTENT PASS (Phase 1.6b emits
.codex/agents/intent-guard.toml create-or-reuse; the emitted skill spawns it at BOTH depths, unconditionally).

The emitted skill carries TWO orthogonal axes: MODE = what to review (FULL_PROJECT | EXPLICIT | UNCOMMITTED |
LAST_COMMITS), DEPTH = how hard (QUICK default = intent + gates, 1 spawn | EXTENDED = the full expert fan-out).
DEPTH is inferred semantically from the user's prompt — there is deliberately NO flag and no CLI token.

Re-run triggers (an INSTALLED skill is refreshed with `upgrade`, never re-emitted — its Phase 4b SELF-SYNC already
corrects the roster, dead gates, the scope baseline and shared surfaces in place on every EXTENDED run):
- New rule/convention file, stack change, new source group -> upgrade (pointers, PATHSPEC, group map)
- Tracker / branch convention changed, task files gain or lose the `## Scope` id+status -> upgrade (baseline block)
- Template itself moved (this generator was updated)       -> upgrade (ports the delta, keeps self-synced edits)
-->

