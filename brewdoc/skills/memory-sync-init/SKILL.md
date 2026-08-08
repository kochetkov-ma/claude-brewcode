---
name: brewdoc:memory-sync-init
description: "Generates a project-tailored memory-sync skill: memory surface batches, checkable-fact catalogue, non-growth sync, independent verify, self-sync, agent re-audit. Triggers: memory sync init, generate memory sync, sync memory skill, установи memory-sync, синхронизируй память"
user-invocable: true
argument-hint: "[status|init|upgrade] [fine-tune-prompt]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion
model: opus
---

# Memory Sync Generator (brewdoc:memory-sync-init)

**ROLE:** GENERATOR. It analyzes the TARGET project, then WRITES a self-contained, project-local
`.claude/skills/memory-sync/` into that repo. It NEVER syncs memory itself -- it emits the skill that does.

**WHY a generator:** generic memory sync produces generic results. Only a skill that already knows THIS repo's
batches, invariants, fact-verification commands, agent roster and language policy can keep instruction memory
truthful. A generic sweep cannot tell an intentional Russian trigger alias from a language violation, cannot tell
a stale lint-rule claim from a correct one, and cannot prove a removed fact is gone from REALITY rather than
merely deleted from a doc.

**OUTPUT:** `<target>/.claude/skills/memory-sync/` -- `SKILL.md` + `references/memory-guide.md` +
`references/agent-audit.md`. Nothing else is written; no agent is created, no rule is installed, no hook is
registered.

## What the emitted skill does

The emitted `/memory-sync` is a long-running multi-agent coordinator that diffs instruction memory against the
code for a SCOPE and repairs it -- facts FIRST, dedup second, compression third -- under a NON-GROWTH prime
directive (every file ends `<=` its original line count, total delta `<= 0`). It sweeps the WHOLE memory surface
every run; free-form focus text steers EMPHASIS only and never narrows the sweep. Its batches are disjoint by
construction, so parallel edits never collide.

| Axis | Emitted behaviour |
|------|-------------------|
| Scopes | `session` (DEFAULT -- facts from THIS conversation, no gather agent), `branch` (diff vs the derived default branch), `commit <sha>` / `commit <a>..<b>`, `recent[:N]` (default 10), `all` (no diff -- every checkable fact re-verified) |
| Focus | free text after the scope token: emphasis ordering only. Never a filter, never a batch skip |
| Phase GATHER | parallel read-only agents: change-fact list + target inventory BY ENUMERATION (`{ENUMERATION_BASH}`), never a hardcoded file list |
| Phase SYNC | ONE bounded agent per disjoint batch, ALL spawned in ONE message, each with its file list, the change facts and the house invariants |
| Phase VERIFY | independent read-only checkers, one per EDITED batch, never the agent that wrote it: re-verify every added/fixed fact in code, prove every removed fact is gone from REALITY, assert frontmatter/ids/secrets/language |
| Phase SELF-SYNC | the emitted skill re-checks and updates ITSELF: re-enumerated counts, new batches, new sections for memory layers the project gained. Scope DECISIONS (batch table, exclusions) are never rewritten without explicit user instruction |
| Phase PROPOSE | new agent / new skill assessed against `{PROPOSAL_PRECEDENTS}` and PROPOSED in the report -- never auto-created |
| Agents | ALWAYS re-audited against current best practice (`references/agent-audit.md`), not merely fact-checked |
| Report | chat only, no report file; a run that touched only the root CLAUDE.md is an INCOMPLETE run |

**Arguments:** `$ARGUMENTS` -- an optional MODE token (`status` | `init` | `upgrade`) followed by an optional
free-form fine-tune prompt. The prompt is woven into the emitted skill's focus ordering and recorded in
`{FOCUS_EMPHASIS}`.

---

## Modes (deterministic -- resolve BEFORE any work)

The FIRST token of `$ARGUMENTS`, lowercased, is the mode when it matches exactly. Anything else is fine-tune text
and the mode is `init`.

| Mode | Reads | Writes | Does |
|------|-------|--------|------|
| `status` | target + emitted skill | NOTHING | Report whether `<target>/.claude/skills/memory-sync/` exists, its provenance stamp (generator + date + surface counts), and how STALE its surface tables are vs the live repo: per-batch file count baked in vs enumerated now, batches whose paths no longer exist, memory layers the project gained since. Ends with a verdict `IN SYNC` / `STALE (n drifts)` / `NOT INSTALLED` |
| `init` (**DEFAULT**) | target | emits the 3 files | Full Phase 0-5 analysis + emit. Refuses an existing installation (see Error Handling) |
| `upgrade` | target + emitted skill | Edits the emitted skill | Re-scan, then REFRESH an existing installation: re-enumerate the surface, refresh the batch / fact / invariant tables, ADD sections for memory layers the project gained. PRESERVE hand-edits -- the emitted skill is EXPECTED to have self-modified (SELF-SYNC phase). Never blind-overwrite |

ANNOUNCE before any work:

```
[memory-sync-init] MODE: {status|init|upgrade} - {matched token | "no mode token -> default init"}
Target:   {absolute repo root}
Emphasis: {fine-tune prompt interpretation | "none"}
```

> `upgrade` NEVER runs `emit` over a live installation. `emit` refuses to overwrite (`MEMORY_SYNC_FORCE=1` is the
> conscious override, and it DESTROYS hand-edits). Upgrade works through targeted `Edit` calls, section by section.

---

## Execution

### Delegation (applies to every Agent this generator spawns AND to the fan-out it emits)

A big task handed to one agent = an agent gone for an hour: you cannot observe it, cannot correct it, and it
usually drifts off-target. One subagent = ONE bounded unit -- one deliverable (here: ONE batch), ~<=5 files,
~<=10 steps. Bigger MUST be split into N tasks, all spawned in ONE message -- that is exactly why the emitted
skill splits the surface into disjoint batches instead of handing one agent the whole memory tree.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists -- the point beyond the file edit |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, by whom, what runs in parallel -- trimmed to what THIS agent needs |
| CONSUMER | who or what uses the result next, and the shape it must fit |
| DONE | acceptance criteria + the exact report shape you want back |

A bare one-line task is never enough. When filling `{BATCH_TABLE}` in Phase 3, keep every batch small enough to be
one bounded unit -- split an oversized batch (a 26-agent roster, a 20-file rules dir) into two rows rather than
emitting one agent that owns half the surface.

### Phase 0 -- Pre-analysis (read THIS skill's emit material)

Read the emit material this generator ships, relative to `${CLAUDE_SKILL_DIR}`:

- `references/SKILL.md.template` -- the emitted SKILL.md, with `{PLACEHOLDER}` slots
- `references/memory-guide.md` -- where-does-it-belong decision tree, compression patterns, obvious-vs-domain facts
- `references/agent-audit.md` -- the agent/skill re-audit procedure the emitted skill runs every sweep

Confirm the TARGET project is the current working directory. All emitted paths are relative to that repo root.

> Missing template -> ERROR "missing emit material: `<path>` -- reinstall brewdoc" and STOP. Never improvise a
> template body.

### Phase 1 -- Analyze the TARGET project

**EXECUTE** using Bash tool (project scan):
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" scan && echo "✅ scan" || echo "❌ scan FAILED"
```

Search with the **Bash** tool (`grep`->ugrep, `find`->bfs on macOS CC; native Grep/Glob are no-ops there). From the
scan plus your own reads, determine:

| Aspect | How to detect | Drives placeholder |
|--------|---------------|--------------------|
| **Memory surface** | everything auto-loaded into an LLM context: root `CLAUDE.md`, EVERY nested `**/CLAUDE.md` at ANY depth, `CLAUDE.local.md`, `.claude/rules/**`, conventions (`.claude/convention/**`, `CONVENTIONS.md`, `CONTRIBUTING.md`), the `AGENTS.md` family, `.claude/agents/**`, `.claude/skills/**`, and the memory dir | `{BATCH_TABLE}`, `{SURFACE_COUNTS}`, `{ENUMERATION_BASH}` |
| **VERIFY-ONLY surfaces** | `AGENTS.md` that is a SYMLINK into a projection dir (`.codex/**`) or whose body sits inside vendor markers (`<!-- BEGIN:... -->`); any file whose content another tool owns. Flag them: refs are checked for RESOLUTION, content is NEVER edited | `{BATCH_TABLE}` (VERIFY-ONLY column) |
| **Memory dir** | `autoMemoryDirectory` in `.claude/settings*.json`, else `~/.claude/projects/<hash>/memory/`. In scope only if the user confirms (Phase 1.5) | `{MEMORY_DIR}` |
| **Exclusions** | `docs/**` (owned by a separate doc flow -- refs INTO docs are resolution-checked, contents never edited), ALL source code (read-only evidence), secrets dirs, task-board / operational state (`.claude/features/**`), build output, git-ignored scratch | `{EXCLUDED_TABLE}` |
| **Default branch** | DERIVE: `git symbolic-ref --short refs/remotes/origin/HEAD`, else the branch CI checks out. NEVER hardcode `main` -- a repo can promote from `staging`/`develop` | `{DEFAULT_BRANCH}` |
| **Git visibility** | `git ls-files -- .claude '*CLAUDE.md' '*AGENTS.md'` and the `.gitignore` rules behind it. Git-IGNORED surface -> `git status`/`git diff` can NEVER account for a memory edit, so VERIFY must re-read files directly instead of trusting the diff | `{GIT_VISIBILITY}`, `{VERIFY_EXTRA}` |
| **Language policy** | which files legitimately carry non-English trigger aliases (agent/skill `description:`, mode-routing tables, `CLAUDE.local.md`), and which surface is English-only. An intentional alias stripped as a "violation" is a regression | `{LANGUAGE_POLICY}` |
| **Frontmatter conventions** | which of `last_updated`, `doc_type`, `paths:` globs, `[DICT: ...]` headers are in use, and WHERE each belongs | `{INVARIANTS_TABLE}` |
| **Stable numbered ids** | rule files whose rows carry stable numbers, and who cites them POSITIONALLY (a reorder silently repoints every citation). Count them per run, never trust a baked number | `{INVARIANTS_TABLE}` |
| **Reacting hooks** | docsync or other hooks firing on memory edits (`.claude/settings.json`, `.claude/hooks/**`), their config and threshold. Edits WILL trigger them -- expected; hook files are never edited | `{INVARIANTS_TABLE}`, `{TRACKER_NOTE}` |
| **Checkable-fact catalogue** | for THIS project, the CONCRETE claims memory makes and the EXACT shell command verifying each: layer paths, build-tool aliases, lint rule names, scripts, version pins, env-var NAMES (never values), routes/endpoints, migrations/tables, test tiers + gates, CI gates | `{FACT_CATALOGUE}` |
| **Agent roster** | `.claude/agents/*.md` -- name, description, tools, the path group each owns; read-only recon agents flagged as non-builders | `{EXPERT_ROSTER_TABLE}`, `{AGENT_CHECKS_TABLE}` |
| **Skill roster** | `.claude/skills/**/*.md` -- SKILL.md + every `references/*.md`; which modes each body implements | `{SKILL_CHECKS_TABLE}` |
| **Task tracker** | `.claude/features/**` board, an issue tracker, a task rule -- noted so the emitted skill EXCLUDES operational state and says who owns it | `{TRACKER_NOTE}` |
| **Proposal precedents** | the agents and skills this repo already created and WHY -- the bar a new one must clear | `{PROPOSAL_PRECEDENTS}` |

> Every catalogue row must be a command that RUNS in this repo today. A verification command for a manifest or a
> directory the repo does not have is worse than no row: it reports `not run` forever.

### Phase 1.5 -- Clarify genuinely ambiguous params (AskUserQuestion)

Ask ONLY what you cannot reliably infer. Never auto-guess a non-obvious choice. Typical questions:

- **Which convention files count as memory** -- `CONTRIBUTING.md` and `CONVENTIONS.md` are human docs in some
  repos and LLM instructions in others.
- **Is the memory dir in scope** -- syncing `~/.claude/projects/<hash>/memory/` is a legitimate choice and a
  legitimate refusal; `{MEMORY_DIR}` gets the literal `none` when out of scope.
- **Which surfaces are VERIFY-ONLY** -- confirm the symlinked / vendor-marked / doc-owned list.
- **The default branch**, whenever derivation is ambiguous or the repo promotes from a non-default branch.
- **Are the non-English trigger aliases intentional** -- if yes they are NEVER stripped, and `{LANGUAGE_POLICY}`
  says so explicitly with the carriers named.
- **Batch split** when one enumerated group is too big for one bounded unit.

> Weave the fine-tune prompt into the emitted focus ordering (e.g. "weight stale-fact removal over compression",
> "always check version pins first") and record it in `{FOCUS_EMPHASIS}`. Facts stay ahead of dedup and
> compression whatever the emphasis -- the order may be sharpened, never inverted.

### Phase 2 -- Emit (scalar substitution)

Export the SCALAR placeholder values (single-line, sed-substituted), then run the emit step:

```bash
export PROJECT_NAME="<repo name>"
export DEFAULT_BRANCH="<derived default branch, e.g. staging>"
export MEMORY_DIR="<resolved memory dir | none>"
export GIT_VISIBILITY="<e.g. 'entire surface git-ignored (.gitignore:12-15) -- diffs never show memory edits' | 'tracked'>"
export LANGUAGE_POLICY="<e.g. 'English everywhere; RU trigger aliases legal in .claude/agents/** + .claude/skills/** + CLAUDE.local.md'>"
export FOCUS_EMPHASIS="<fine-tune emphasis | 'default ordering: facts > dedup > compression'>"
export SURFACE_COUNTS="<e.g. '68 files: 5 root, 15 rules, 3 conventions, 26 agents, 18 skills, 1 local'>"
export TRACKER_NOTE="<e.g. '.claude/features/** owned by task-tracker + .claude/rules/tasks.md -- excluded' | 'no tracker'>"
```

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" emit && echo "✅ emit" || echo "❌ emit FAILED"
```

> **STOP if ❌** -- verify `${CLAUDE_SKILL_DIR}/references/SKILL.md.template` exists and the target `.claude/` is
> writable. On an existing installation `emit` refuses by design: use `upgrade`.

This writes `<target>/.claude/skills/memory-sync/SKILL.md` with scalars substituted, copies `memory-guide.md` and
`agent-audit.md` into the emitted `references/`, and stamps provenance at the end of the emitted SKILL.md
(generator name + date + `{SURFACE_COUNTS}`) -- that stamp is what `status` and `upgrade` read.

### Phase 3 -- Fill the BLOCK placeholders (AI Edit)

Multi-row tables and multi-line bash cannot go through sed. Using the **Edit** tool, replace every block
placeholder in the EMITTED files with content built from Phase 1 analysis. See the Placeholders section for the
full contract; the substance rules:

| Block | Must contain |
|-------|--------------|
| `{BATCH_TABLE}` | one row per DISJOINT batch: batch id, the concrete files, and which of them are VERIFY-ONLY with the reason. Disjointness is the collision guarantee -- overlapping batches are a defect |
| `{EXCLUDED_TABLE}` | one row per exclusion WITH its reason. A reasonless exclusion gets re-litigated every run |
| `{INVARIANTS_TABLE}` | frontmatter contract, `paths:` glob validation, language policy, doc style, stable numbered ids + their positional citers, reacting hooks. Every cell a FACT read from the repo, source named |
| `{FACT_CATALOGUE}` | `\| claim \| how to verify \|` rows, each verification a real one-line command with today's expected answer where it is short |
| `{ENUMERATION_BASH}` | ONE fenced bash block that re-derives the file list per batch (`ls`, `find ... -name '*.md' \| sort`, `git ls-files`). Counts rot; enumeration does not |
| `{AGENT_CHECKS_TABLE}` | the agent-batch extra checks: `name:` vs filename, description + triggers, `tools:` minimality, ownership globs resolve, MCP prefixes name configured servers, handoff pointers name agents that EXIST |
| `{SKILL_CHECKS_TABLE}` | the skill-batch extra checks: `name:` vs directory, one-line action-first `description:`, `allowed-tools:` matches actual use, `argument-hint:` matches implemented modes, every cited reference exists AND every existing reference is cited |
| `{EXPERT_ROSTER_TABLE}` | the live roster: agent -> owned path group -> specialty, recon agents marked read-only. Drives batch ownership and the re-audit |
| `{PROPOSAL_PRECEDENTS}` | `\| propose \| bar \| precedents \|` -- the bar a new agent/skill must clear HERE, with this repo's own precedents named |
| `{VERIFY_EXTRA}` | the project-specific VERIFY assertions: the git-visibility assertion derived in Phase 1, the secret-value scan, the language scan with its allowed hits, the id-sequence diff |

> Keep every emitted row pointing at a REAL path, a REAL command and a REAL agent (`.claude/agents/` or a built-in
> `Explore`/`Plan`/`general-purpose`). Do NOT invent agents, files or commands.

### Phase 4 -- Validate

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" validate && echo "✅ validate" || echo "❌ validate FAILED"
```

> **STOP if ❌** -- `validate` fails on: any surviving `{PLACEHOLDER}` in an emitted file, a missing emitted asset,
> or a cited `references/*.md` that does not exist. Fix via Edit and re-run.

Then assert by hand (validate cannot resolve agent names): **every agent name the emitted skill spawns resolves**
to a real `<target>/.claude/agents/*.md` or a built-in (`Explore` / `Plan` / `general-purpose`). An invented
`subagent_type` breaks the emitted skill at its first run.

### Phase 5 -- Report

```
memory-sync generated -> <target>/.claude/skills/memory-sync/

Surface:    {SURFACE_COUNTS}
Batches:    {N}  ({batch -> file count}, disjoint)
VERIFY-ONLY:{list + reason, or none}
Excluded:   {list + reason}
Facts:      {N} checkable-fact rows, each with a runnable verification command
Invariants: {N} enforced per batch
Roster:     {N} agents / {N} skills re-audited every sweep
Branch:     {DEFAULT_BRANCH}   Git visibility: {GIT_VISIBILITY}
Memory dir: {MEMORY_DIR}
Language:   {LANGUAGE_POLICY}
Emphasis:   {FOCUS_EMPHASIS}

Files written:
- .claude/skills/memory-sync/SKILL.md
- .claude/skills/memory-sync/references/memory-guide.md
- .claude/skills/memory-sync/references/agent-audit.md

Run it:  /memory-sync                       -> scope session (default), whole surface
         /memory-sync all "only rules"      -> re-verify every fact, emphasis on rules
         /memory-sync branch                -> facts from the branch diff vs {DEFAULT_BRANCH}

Later:   /brewdoc:memory-sync-init status   -> is the emitted skill still true to the repo
         /brewdoc:memory-sync-init upgrade  -> refresh its tables, keep hand-edits
```

Say the exclusions out loud: a user who expects `docs/**` to be synced must learn it is owned elsewhere.

---

## Placeholders

The contract is FIXED and shared verbatim with the templates, the guide, the audit reference and `generate.sh`.
Do not rename, do not add, do not drop. A placeholder named here that the templates never emit is a defect, and so
is a template token absent from this table.

**SCALARS** -- substituted by `generate.sh emit` from environment variables of the SAME name. Single-line values only.

| Placeholder | Value |
|-------------|-------|
| `{PROJECT_NAME}` | repo name (basename of the target root) |
| `{DEFAULT_BRANCH}` | derived default branch -- never hardcoded `main` |
| `{MEMORY_DIR}` | resolved memory dir, or the literal `none` when out of scope |
| `{GIT_VISIBILITY}` | whether the memory surface is git-tracked or git-ignored, and what that implies for VERIFY |
| `{LANGUAGE_POLICY}` | English-only surface vs where non-English trigger aliases are intentional |
| `{FOCUS_EMPHASIS}` | the fine-tune emphasis, or the default ordering |
| `{SURFACE_COUNTS}` | total files + per-batch counts at generation time (a snapshot; the emitted skill re-enumerates) |
| `{TRACKER_NOTE}` | who owns operational task state, and that it is excluded |

**BLOCKS** -- multi-row tables and multi-line bash, filled by the AI in Phase 3 via `Edit`. `generate.sh` never
touches them.

| Placeholder | Fills |
|-------------|-------|
| `{BATCH_TABLE}` | disjoint batches -> files, VERIFY-ONLY marks |
| `{EXCLUDED_TABLE}` | hard exclusions with reasons |
| `{INVARIANTS_TABLE}` | house invariants enforced in every batch |
| `{FACT_CATALOGUE}` | claim -> verification command |
| `{ENUMERATION_BASH}` | the per-run inventory commands |
| `{AGENT_CHECKS_TABLE}` | agent-batch extra checks |
| `{SKILL_CHECKS_TABLE}` | skill-batch extra checks |
| `{EXPERT_ROSTER_TABLE}` | agent -> owned path group -> specialty |
| `{PROPOSAL_PRECEDENTS}` | the bar for a new agent/skill + this repo's precedents |
| `{VERIFY_EXTRA}` | project-specific VERIFY assertions |

> The emitted skill also uses RUNTIME tokens (`{SCOPE}`, `{FOCUS}`, `{BATCH}`, `{FILE_LIST}`, `{DATE}`, `{N}`).
> Those are resolved per RUN by the emitted skill, are allow-listed by `validate`, and MUST remain in the file.

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Emit target | `<cwd>/.claude/skills/memory-sync/` | Where the generated skill is written |
| Emit material | `${CLAUDE_SKILL_DIR}/references/` | `SKILL.md.template`, `memory-guide.md`, `agent-audit.md` |
| Generation script | `${CLAUDE_SKILL_DIR}/scripts/generate.sh` | `scan` \| `emit` \| `validate` \| `status` |
| Mode | `init` | `status` (read-only) \| `init` \| `upgrade` |
| Overwrite | refused | `emit` never overwrites a live installation; `MEMORY_SYNC_FORCE=1` overrides and DESTROYS hand-edits |
| Emitted default scope | `session` | The emitted skill's own default; every scope sweeps the whole surface |
| Non-growth | prime directive | Every emitted-skill run ends each file `<=` its original line count, total delta `<= 0` |
| `docs/**` | excluded | Owned by a separate doc flow; refs INTO docs are resolution-checked, contents never edited |
| Frontmatter `cli` | omitted | The command equals the skill name (`/brewdoc:memory-sync-init`) -- declaring it would be noise |
| Frontmatter `version` | omitted | All behaviour lives inside this skill dir, so the dir hash already changes with it |

---

## Error Handling

| Condition | Action |
|-----------|--------|
| Emit material missing under `${CLAUDE_SKILL_DIR}/references/` | ERROR "missing emit material: `<path>` -- reinstall brewdoc". STOP. Never improvise a template |
| `init` but `<target>/.claude/skills/memory-sync/` already exists | STOP. "memory-sync already installed. Use `upgrade` to refresh it, or `status` to see its drift." Never overwrite |
| `upgrade` but nothing installed | STOP. "Nothing to upgrade -- run `/brewdoc:memory-sync-init` to generate it first" |
| `upgrade` finds hand-edited sections | PRESERVE them. Refresh enumerated tables and ADD new sections; show the diff and AskUserQuestion before REPLACING any section whose content diverges from the template baseline. Declined = no edit, continue cleanly |
| No provenance stamp in the installed skill | Treat as hand-written: `status` reports `UNSTAMPED`, `upgrade` is additive-only and asks before every replacement |
| Target has no `.claude/agents/` | Emit anyway; `{EXPERT_ROSTER_TABLE}` says `none -- batches owned by general-purpose`, the agent batch is dropped from `{BATCH_TABLE}`, and the re-audit reduces to the skill roster |
| Target has no `.claude/rules/` or conventions | Emit with the batches that DO exist; never emit a batch pointing at a nonexistent dir |
| Only a root CLAUDE.md exists | Emit a single-batch skill and say so -- a one-file surface is a legitimate result, an invented batch is not |
| Default branch cannot be derived | ASK (Phase 1.5). Never fall back to `main` silently |
| Memory dir not resolvable | `MEMORY_DIR="none"`; the emitted skill skips that batch and says why |
| `AGENTS.md` is a symlink or vendor-marked | VERIFY-ONLY row in `{BATCH_TABLE}` with the reason. Never an edit target |
| A fact has no verification command | Leave it OUT of `{FACT_CATALOGUE}` and note it in the Phase 5 report as unverifiable -- an invented command reports `not run` forever |
| Unresolved `{PLACEHOLDER}` after Phase 3 | `validate` fails listing them; fix via Edit, re-run |
| An emitted `subagent_type` names no real agent | Replace with a real project agent or a built-in before finishing (Phase 4 assertion) |
| Target `.claude/` not writable | STOP -- ask the user to run from the repo root |
| Asked to make the generator sync memory itself | Refuse. This skill emits; the emitted skill syncs. A generic in-plugin sweep is exactly what it replaces |

---

## References

- `references/SKILL.md.template` -- the emitted SKILL.md (placeholder slots).
- `references/memory-guide.md` -- where-does-it-belong decision tree, compression patterns, obvious vs domain facts (emitted).
- `references/agent-audit.md` -- the agent/skill re-audit procedure the emitted skill runs every sweep (emitted).
- `scripts/generate.sh` -- `scan` / `emit` / `validate` / `status`.

<!--
SKILL METADATA -- brewdoc:memory-sync-init (GENERATOR)

Replaces the old brewdoc:memory (a generic in-plugin memory syncer). Analyzes a target project and emits a
self-contained project-local .claude/skills/memory-sync/ (SKILL.md + memory-guide.md + agent-audit.md). The
plugin never syncs memory itself.

Modes: status (read-only drift report) | init (default, full analysis + emit) | upgrade (re-scan + refresh,
hand-edits preserved -- the emitted skill is expected to have self-modified).

Non-negotiables of the EMITTED skill: NON-GROWTH prime directive (every file <= its original line count, total
delta <= 0); facts before dedup before compression; disjoint batches, one bounded agent each, all spawned in one
message; VERIFY by an independent checker, never the writer; SELF-SYNC (the skill updates itself); PROPOSE never
auto-create; agents re-audited against current best practice every sweep.

Re-run triggers:
- New nested CLAUDE.md / rule / convention file  -> upgrade (surface gained a member)
- New or renamed agent / skill                    -> upgrade (roster + batch tables)
- Stack change, renamed layer, new lint/CI gate   -> upgrade (fact catalogue commands go stale)
- Default branch or .gitignore change             -> upgrade (branch + git-visibility scalars)
- Doc-flow ownership change                       -> upgrade (exclusions)
-->
