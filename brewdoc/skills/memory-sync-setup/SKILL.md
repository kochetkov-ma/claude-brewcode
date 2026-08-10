---
name: memory-sync-setup
description: "Generates a project-tailored memory-sync skill: memory surface batches, checkable-fact catalogue, non-growth sync, independent verify, self-sync, agent re-audit. Triggers: memory sync init, generate memory sync, sync memory skill, установи memory-sync, синхронизируй память"
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|upgrade|enable|disable|uninstall|purge] [fine-tune-prompt]"
allowed-tools: [Read, Edit, Glob, Grep, Bash, Agent, AskUserQuestion]
model: opus
---

# Memory Sync Generator (brewdoc:memory-sync-setup)

**ROLE:** GENERATOR. It analyzes the TARGET project, then WRITES a self-contained, project-local
`.claude/skills/memory-sync/` into that repo. It NEVER syncs memory itself -- it emits the skill that does.

**WHY a generator:** generic memory sync produces generic results. Only a skill that already knows THIS repo's
batches, invariants, fact-verification commands, agent roster and language policy can keep instruction memory
truthful. A generic sweep cannot tell an intentional Russian trigger alias from a language violation, cannot tell
a stale lint-rule claim from a correct one, and cannot prove a removed fact is gone from REALITY rather than
merely deleted from a doc.

**OUTPUT:** `<target>/.claude/skills/memory-sync/` -- `SKILL.md` + `references/memory-guide.md` +
`references/agent-audit.md` + `references/hard-sync.md`. Nothing else is written; no agent is created, no rule is
installed, no hook is registered.

## Prompt contract

Position 1 of `$ARGUMENTS` is a **free-form prompt** (RU/EN) -- modes and the fine-tune text are optional and may
follow in any order. Nobody types keys: resolve mode + scope FROM the prompt.

1. Strip flags. An explicit mode token anywhere wins outright, no scoring.
2. Else score modes by distinct whole-word keyword hits (table in `## Modes` below). Highest unique score wins.
   Tie with a destructive mode -> `AskUserQuestion`; tie with `status` -> `status`; tie of two mutating modes ->
   the keyword appearing first; all zero -> `status` if installed, else `install`.
3. Empty arguments -> `status` if installed, else `install`; ask ONE scoping `AskUserQuestion` only when the
   answer changes what gets written. A read-only run asks nothing.
4. Outcome-changing ambiguity -> ONE `AskUserQuestion` (max 4 questions) BEFORE any work.
5. Prose that is not a mode/id/path is still input: extract the id, path or target from it -- never treat the
   first word of a sentence as a positional id. The remainder becomes the fine-tune prompt / `{FOCUS_EMPHASIS}`.

Then print this block ONCE, before the first action (this replaces the old bare ANNOUNCE line below):

```
PLAN — brewdoc:memory-sync-setup
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  target=<absolute repo root>; emphasis=<fine-tune prompt interpretation | "none">
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

Labels are literal; values follow the conversation language.

## What the emitted skill does

The emitted `/memory-sync` is a long-running multi-agent coordinator that diffs instruction memory against the
code for a SCOPE and repairs it -- facts FIRST, dedup second, compression third -- under a NON-GROWTH prime
directive (every file ends `<=` its original line count, total delta `<= 0`). It sweeps the WHOLE memory surface
every run; free-form focus text steers EMPHASIS only and never narrows the sweep. Its batches are disjoint by
construction, so parallel edits never collide. It carries TWO orthogonal axes: `{SCOPE}` selects WHICH change
facts drive the sweep, `{DEPTH}` selects HOW HARD the surface itself is cut.

| Axis | Emitted behaviour |
|------|-------------------|
| Scopes | `session` (DEFAULT -- facts from THIS conversation, no gather agent), `branch` (diff vs the derived default branch), `commit <sha>` / `commit <a>..<b>`, `recent[:N]` (default 10), `all` (no diff -- every checkable fact re-verified) |
| Depth | `NORMAL` (DEFAULT -- fact sync + dedup + compression) or `HARD` (NORMAL plus the two passes in `references/hard-sync.md`), from the token `hard` or the same intent in prose ("too much context", "aggressive", "почисти жёстко") |
| HARD pass A | rules `paths:` PRECISION audit -- a broad or missing glob loads the rule into EVERY context and is paid for on every turn, so the glob must be the narrowest pattern still covering the rule's real subject. Verdicts `OK` / `TOO_BROAD` / `TOO_NARROW` / `DANGLING` / `MISSING` / `CORRECTLY_GLOBAL`; a genuinely repo-wide subject legitimately carries none and one is never invented |
| HARD pass B | OBVIOUS-KNOWLEDGE PURGE -- anything a competent model already knows is DELETED, not compressed. Keeps only what the model cannot know: decisions that invert a default, domain invariants, environment quirks, explicit prohibitions |
| Focus | free text after the scope token: emphasis ordering only. Never a filter, never a batch skip |
| Phase GATHER | parallel read-only agents: change-fact list + target inventory BY ENUMERATION (`{ENUMERATION_BASH}`), never a hardcoded file list |
| Phase SYNC | ONE bounded agent per disjoint batch, ALL spawned in ONE message, each with its file list, the change facts and the house invariants |
| Phase VERIFY | independent read-only checkers, one per EDITED batch, never the agent that wrote it: re-verify every added/fixed fact in code, prove every removed fact is gone from REALITY, assert frontmatter/ids/secrets/language |
| Phase SELF-SYNC | the emitted skill re-checks and updates ITSELF: re-enumerated counts, new batches, new sections for memory layers the project gained. Scope DECISIONS (batch table, exclusions) are never rewritten without explicit user instruction |
| Phase PROPOSE | new agent / new skill assessed against `{PROPOSAL_PRECEDENTS}` and PROPOSED in the report -- never auto-created |
| Agents | ALWAYS re-audited against current best practice (`references/agent-audit.md`), not merely fact-checked |
| Report | chat only, no report file; a run that touched only the root CLAUDE.md is an INCOMPLETE run |

**Arguments:** `$ARGUMENTS` -- an optional MODE token (`status` | `install` | `upgrade` | `enable` | `disable` |
`uninstall` | `purge`) followed by an optional
free-form fine-tune prompt. The prompt is woven into the emitted skill's focus ordering and recorded in
`{FOCUS_EMPHASIS}`.

---

## Modes (deterministic -- resolve BEFORE any work)

Canonical verbs, in order: `status | install | upgrade | enable | disable | uninstall | purge`.

An explicit mode token anywhere in `$ARGUMENTS`, lowercased, wins outright -- no scoring. Otherwise score every
mode by distinct whole-word keyword hits below; highest unique score wins. Everything that is not a matched
keyword is fine-tune text (`{FOCUS_EMPHASIS}`). No mode token and no keyword match -> `status` when
`<target>/.claude/skills/memory-sync/` exists, `install` when it does not.

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `status` | *(empty when installed)*, status, check, show | статус, проверь, покажи | no |
| `install` | install, setup, generate | установи, настрой, сгенерируй | yes |
| `upgrade` | upgrade, refresh, update | обнови, апгрейд | yes |
| `enable` | enable, turn on | включи, верни | yes |
| `disable` | disable, pause, turn off | выключи, отключи, пауза | yes |
| `uninstall` | uninstall, remove | удали, убери | yes |
| `purge` | purge, wipe | вычисти, снеси | yes, destructive |

Tie-break: a tie involving `purge`/`uninstall` -> `AskUserQuestion` (never guess destructive); a tie with
`status` -> `status`; a tie of two mutating modes -> the keyword appearing first in the prompt.

Removed aliases -- `init`, `on`, `off`, `setup`, `remove`, `reset`, `create`, `update`, `cleanup` are no longer
accepted. Map them onto the canonical set (`init`/`create` -> `install`, `on` -> `enable`, `off` ->
`disable`, `remove`/`reset`/`cleanup` -> `uninstall` or `purge` -- ASK which) and say so in the PLAN block.
Never print a removed alias as a command.

| Mode | Reads | Writes | Does |
|------|-------|--------|------|
| `status` (**DEFAULT when installed**) | target + emitted skill | NOTHING | Report whether `<target>/.claude/skills/memory-sync/` exists, its provenance frontmatter (`doc_type` / `version` / `generated_by` / `last_updated` / `surface_files`), and how STALE its surface tables are vs the live repo: `surface_files` count baked in vs enumerated now, batches whose paths no longer exist, memory layers the project gained since. Ends with a verdict `IN SYNC` / `STALE (n drifts)` / `STALE-LEGACY (n drifts)` (pre-5.0 tail stamp) / `NOT INSTALLED`, each prefixed `PARKED - ` when the install is disabled (`INSTALLED=parked`) -- parked and absent are never collapsed |
| `install` (**DEFAULT when not installed**) | target | emits the 4 files | Full Phase 0-5 analysis + emit. Refuses an existing installation (see Error Handling) |
| `upgrade` | target + emitted skill | Edits the emitted skill | Re-scan, then REFRESH an existing installation: re-enumerate the surface, refresh the batch / fact / invariant tables, ADD sections for memory layers the project gained, and ALWAYS finish with `generate.sh restamp` (see Mode: upgrade). PRESERVE hand-edits -- the emitted skill is EXPECTED to have self-modified (SELF-SYNC phase). Never blind-overwrite |
| `enable` | target | one rename | `generate.sh enable`: `SKILL.md.disabled` -> `SKILL.md`, so `/memory-sync` is offered again. Regenerates nothing, so no provenance stamp and no hand-edit changes |
| `disable` | target | one rename | `generate.sh disable`: `SKILL.md` -> `SKILL.md.disabled`. Claude Code discovers a project skill ONLY through `SKILL.md`, so this withdraws `/memory-sync` from the roster while the 3 references and every SELF-SYNC hand-edit stay byte-identical on disk. Reversible by `enable`; deletes nothing |
| `uninstall` | target | deletes the emit manifest | `generate.sh uninstall`: removes exactly what `emit` wrote -- `SKILL.md` (or its parked form) plus the 3 references -- and nothing it did not. Files a user added to that dir are KEPT and listed. Confirmation first |
| `purge` | target | deletes the whole dir | `generate.sh purge`: removes `<target>/.claude/skills/memory-sync/` outright, user-added files included, plus any `.memory-sync-emit.*` staging a crashed emit left under `.claude/skills/`. Confirmation first |

> **Why `uninstall` and `purge` differ here.** `emit` writes a fixed manifest (`SKILL.md` + the 3 references), and
> that manifest is also the removal manifest: `uninstall` is scoped to it, so a note or an extra reference the user
> dropped into the skill dir is never destroyed by a removal they asked for. `purge` is the "I am done with this
> entirely" verb and takes the directory. The generator registers no hooks, writes no settings and no config, so
> these two paths ARE its whole footprint -- there is nothing else for `purge` to sweep.

Print the PLAN block (see Prompt contract above) before any work.

> `upgrade` NEVER runs `emit` over a live installation. `emit` refuses to overwrite (`MEMORY_SYNC_FORCE=1` is the
> conscious override, and it DESTROYS hand-edits). Upgrade works through targeted `Edit` calls, section by section,
> plus the metadata-only `generate.sh restamp`. `MEMORY_SYNC_FORCE=1` is never the answer to a stale stamp.

FIRST step of `status`, and of `upgrade` before it decides what to refresh -- **EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" status
```

Its machine-greppable KEY=value block and closing verdict (`NOT INSTALLED` / `IN SYNC` / `STALE (<n> drifts)` /
`STALE-LEGACY (<n> drifts)`) ARE the staleness answer: never re-derive them by hand. `status` reports that output
enriched with your own reads and STOPS -- it writes nothing. `upgrade` takes the same drift list as its refresh
worklist and continues to Phase 1; `NOT INSTALLED` there means STOP (see Error Handling).

> **`STAMP_FORMAT=legacy` is NOT a special path.** A pre-5.0 install stamps its provenance as a tail comment
> (`<!-- memory-sync template vX.Y.Z emitted <date> by brewdoc:memory-sync-setup | surface: … -->`) instead of
> frontmatter. `generate.sh restamp` -- the mandatory last step of EVERY `upgrade`, below -- migrates it in one
> call: it writes the five frontmatter keys and DELETES the tail line. Report the migration explicitly when
> `STAMP_FORMAT` came back `legacy`; after `restamp` it must read `frontmatter`. Never hand-`Edit` the stamp.

### Mode: upgrade

Refresh an existing installation against the current repo AND the current plugin version. Every hand-edit
survives: `upgrade` never runs `emit`, never re-copies a file that carries content, and touches the stamp
only through `restamp`, which is proven metadata-only.

1. Run the `status` bash block above. `NOT INSTALLED` -> STOP (see Error Handling). `INSTALLED=parked` ->
   the install is DISABLED, not broken: say so and offer `enable`; upgrading a parked install is a no-op the
   user did not ask for.
2. Take the `status` drift list as the refresh worklist and run Phase 1 (re-scan) -> Phase 3 (targeted
   `Edit`s): re-enumerate the surface, refresh the batch / fact / invariant tables, ADD sections for memory
   layers the project gained. PRESERVE every hand-edited section; `AskUserQuestion` before REPLACING one.
3. **Restamp -- ALWAYS, whatever `STAMP_FORMAT` said, and never skipped because "the format is already
   current".** An install in the current format that is merely a version behind has no other route to a
   fresh stamp, and Phase 4 `validate` hard-fails on a stale one.

   **EXECUTE** using Bash tool:
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" restamp && echo "✅ restamp" || echo "❌ restamp FAILED"
   ```

   > **STOP if ❌** -- it never half-writes: the body is compared before and after and the file is left
   > untouched unless the ONLY change is the metadata block.

   It rewrites `version` / `last_updated` / `surface_files` (and adds `doc_type` / `generated_by` when they
   are missing), drops a surviving pre-5.0 tail stamp, and re-copies a `references/*.md` ONLY when that file's
   sole difference from the plugin source is the release stamp line. Report its `RESTAMPED:` / `REF …` lines
   verbatim. A `REF DIFFERS:` line is a decision for you, not a failure -- `hard-sync.md` always differs
   because Phase 3 filled its two BLOCKs; diff it against the plugin source and port real prose changes by
   hand, never by re-copying over the filled tables.
4. Phase 4 `validate`, then the Phase 5 report.

### Mode: enable / disable

A rename, nothing more. Use `disable` to park a `/memory-sync` that should stop being offered for a while without
losing a single hand-edit; use `uninstall` when it should really go.

1. Run the `status` bash block above. `NOT INSTALLED` -> report "nothing to {enable|disable}" and STOP. Never emit
   a fresh install as a "fix" for a toggle verb.
2. **EXECUTE** using Bash tool (substitute the resolved verb):
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" MODE_HERE && echo "✅ MODE_HERE" || echo "❌ MODE_HERE FAILED"
   ```
3. Report the script's `MOVED:` / `KEPT:` lines verbatim. `✅ already {enabled|disabled}` is a clean no-op, not a
   failure -- report it and STOP.
4. Say that the change lands in the NEXT session: skills are discovered at session start.

> `validate` FAILS on a disabled installation, because it looks for `SKILL.md` and finds `SKILL.md.disabled`.
> That is the toggle working, not a broken install. Never re-`emit` to "repair" it -- `emit` would destroy the
> SELF-SYNC hand-edits the parked file still carries. `enable` is the fix.

### Mode: uninstall / purge

The generator's ONLY footprint in the target is `<target>/.claude/skills/memory-sync/` (plus, after a crashed emit,
a `.memory-sync-emit.*` staging dir beside it) -- it registers no hooks, writes no settings and touches no config.
`uninstall` removes exactly the emit manifest; `purge` removes the directory outright.

1. Run the `status` bash block above. `NOT INSTALLED` -> report "nothing to {uninstall|purge}" and STOP.
2. List what is there -- **EXECUTE** using Bash tool:
   ```bash
   ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")}"
   find "$ROOT/.claude/skills/memory-sync" -type f | sort
   ```
3. **ASK** via `AskUserQuestion`, ONCE, naming the real count:
   - `uninstall`: "Delete the 4 emitted files under `<target>/.claude/skills/memory-sync/` (N files present)?
     Hand-edits to them are lost; anything you added yourself is kept."
     Options: **Yes, uninstall** / **Purge instead (deletes the whole dir)** / **Cancel**.
   - `purge`: "Delete `<target>/.claude/skills/memory-sync/` entirely (N files)? Nothing is recoverable."
     Options: **Yes, purge** / **Uninstall instead (keeps files I added)** / **Cancel**.

   Anything but the affirmative -> switch to the other verb or **STOP**. A declined confirmation deletes nothing.
4. On confirmation -- **EXECUTE** using Bash tool (substitute the confirmed verb):
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" MODE_HERE && echo "✅ MODE_HERE" || echo "❌ MODE_HERE FAILED"
   ```
5. Report the script's `REMOVED:` / `KEPT:` lines verbatim. After `uninstall`, any `KEPT:` list is the exact reason
   to offer `purge`. `/memory-sync` disappears on the next session reload.

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
- `references/hard-sync.md` -- the two `HARD`-depth deletion passes (`paths:` precision audit + obvious-knowledge
  purge) and their reporting contract; it holds TWO of the twelve BLOCK placeholders

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
| **`paths:` precision** | `scan` prints `path :: lines :: paths:` for EVERY `.claude/rules/*.md`. Per rule: name its real subject in one phrase, derive the narrowest glob covering it, compare with the declared one, and resolve it against the repo with BOTH probes exactly as `references/hard-sync.md` prescribes -- `git ls-files -- ':(glob)<glob>'` (plain git `*` crosses `/`, so a broken glob still "matches") AND a filesystem `find` (`git ls-files` is blind to git-ignored trees: a `.gitignore`d `.claude/` returns 0 rows while the tree is full of files). `DANGLING` only when BOTH come back empty. Judge each now -- `OK` / `TOO_BROAD` / `TOO_NARROW` / `DANGLING` / `MISSING` / `CORRECTLY_GLOBAL` | `{PATHS_PRECISION_TABLE}` |
| **Obvious vs domain** | HARVEST real pairs from the target's OWN rules and conventions: a line any competent model already knows (generic craft advice, restated tool docs, textbook pattern definitions) next to the domain fact in the same file that only makes sense because someone HERE decided it. Real quotes from this repo, never invented illustrations | `{OBVIOUS_VS_DOMAIN_TABLE}` |
| **Stable numbered ids** | rule files whose rows carry stable numbers, and who cites them POSITIONALLY (a reorder silently repoints every citation). Count them per run, never trust a baked number | `{INVARIANTS_TABLE}` |
| **Reacting hooks** | `docsync-*.mjs` (installed by `/brewdoc:docsync-setup`) or other hooks firing on memory edits (`.claude/settings.json`, `.claude/hooks/**`), their config and threshold. Edits WILL trigger them -- expected; hook files are never edited | `{INVARIANTS_TABLE}`, `{TRACKER_NOTE}` |
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

This writes the FOUR-file tree: `<target>/.claude/skills/memory-sync/SKILL.md` with scalars substituted, plus
`references/memory-guide.md`, `references/agent-audit.md` and `references/hard-sync.md` copied into the emitted
`references/`.

> `disable-model-invocation` MUST NOT be set on the emitted skill: plain-prose invocation ("память устарела",
> "sync memory") is a first-class path, alongside `/memory-sync [scope]`. Legacy installs that still carry the key
> are stripped by `generate.sh restamp`; `validate` fails on a survivor.

It stamps provenance into the emitted SKILL.md's YAML FRONTMATTER, appended after the
skill's own keys:

```yaml
doc_type: llm                                     # bare enum, never quoted
version: "X.Y.Z"                                  # the brewdoc PLUGIN version, read from
generated_by: "brewdoc:memory-sync-setup"         # brewdoc/.claude-plugin/plugin.json by
last_updated: "YYYY-MM-DD"                        # script self-location -- never hardcoded
surface_files: "38 files: 3 root, 5 nested CLAUDE.md, ..."   # skill-specific, AFTER the four
```

That frontmatter is what `status`, `validate` and `upgrade` read. `surface_files` is the drift input:
`status` compares its leading integer against a live re-count. There is no private template version any
more, and no tail-line stamp -- a pre-5.0 install still carrying
`<!-- memory-sync template vX.Y.Z ... -->` on its last line is detected and reported as
`VERDICT=STALE-LEGACY`, which means "run `upgrade` to migrate it".

### Phase 3 -- Fill the BLOCK placeholders (AI Edit)

Multi-row tables and multi-line bash cannot go through sed. Using the **Edit** tool, replace every block
placeholder in the EMITTED files with content built from Phase 1 analysis. TWELVE blocks: the first ten live in
the emitted `SKILL.md`, the last two in the emitted `references/hard-sync.md`. `validate` fails on every one of
them, so a partial fill cannot pass. See the Placeholders section for the full contract; the substance rules:

| Block | In | Must contain |
|-------|----|--------------|
| `{BATCH_TABLE}` | SKILL.md | one row per DISJOINT batch: batch id, the concrete files, and which of them are VERIFY-ONLY with the reason. Disjointness is the collision guarantee -- overlapping batches are a defect |
| `{EXCLUDED_TABLE}` | SKILL.md | one row per exclusion WITH its reason. A reasonless exclusion gets re-litigated every run |
| `{INVARIANTS_TABLE}` | SKILL.md | frontmatter contract, `paths:` glob validation, language policy, doc style, stable numbered ids + their positional citers, reacting hooks. Every cell a FACT read from the repo, source named |
| `{FACT_CATALOGUE}` | SKILL.md | `\| claim \| how to verify \|` rows, each verification a real one-line command with today's expected answer where it is short |
| `{ENUMERATION_BASH}` | SKILL.md | ONE fenced bash block that re-derives the file list per batch (`ls`, `find ... -name '*.md' \| sort`, `git ls-files`). Counts rot; enumeration does not |
| `{AGENT_CHECKS_TABLE}` | SKILL.md | the agent-batch extra checks: `name:` vs filename, description + triggers, `tools:` minimality, ownership globs resolve, MCP prefixes name configured servers, handoff pointers name agents that EXIST |
| `{SKILL_CHECKS_TABLE}` | SKILL.md | the skill-batch extra checks: `name:` vs directory, one-line action-first `description:`, `allowed-tools:` matches actual use, `argument-hint:` matches implemented modes, every cited reference exists AND every existing reference is cited |
| `{EXPERT_ROSTER_TABLE}` | SKILL.md | the live roster: agent -> owned path group -> specialty, recon agents marked read-only. Drives batch ownership and the re-audit |
| `{PROPOSAL_PRECEDENTS}` | SKILL.md | `\| propose \| bar \| precedents \|` -- the bar a new agent/skill must clear HERE, with this repo's own precedents named |
| `{VERIFY_EXTRA}` | SKILL.md | the project-specific VERIFY assertions: the git-visibility assertion derived in Phase 1, the secret-value scan, the language scan with its allowed hits, the id-sequence diff |
| `{PATHS_PRECISION_TABLE}` | hard-sync.md | ONE row per rule file: `\| rule file \| current paths: \| verdict \| narrowest correct glob \|`, from the Phase 1 precision judgement. Every derived glob must RESOLVE against the repo today; a repo-wide subject is `CORRECTLY_GLOBAL` with an empty glob cell, never an invented one |
| `{OBVIOUS_VS_DOMAIN_TABLE}` | hard-sync.md | `\| generic knowledge (DELETE) \| domain fact worth keeping (KEEP) \|`, quoting REAL lines harvested from this target's own rules and conventions. Invented illustrations teach nothing -- the emitted purge calibrates on these pairs |

> Keep every emitted row pointing at a REAL path, a REAL command and a REAL agent (`.claude/agents/` or a built-in
> `Explore`/`Plan`/`general-purpose`). Do NOT invent agents, files or commands.

**Then inject the target's own frontmatter convention keys** into the emitted `SKILL.md` via `Edit`. The template
ships only the keys Claude Code itself reads, but the emitted body BUMPS `last_updated:` in every file it edits
and its VERIFY phase ASSERTS the bump -- so if this project's memory files carry `last_updated:`, `doc_type:` or
any other doc-convention key (detected in Phase 1, `{INVARIANTS_TABLE}`), add those keys to the emitted
frontmatter now, with `last_updated:` set to today's emit date (`date +%F`, never hardcoded). Project has no such
convention -> skip this step and leave the frontmatter as emitted.

### Phase 4 -- Validate

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" validate && echo "✅ validate" || echo "❌ validate FAILED"
```

> **STOP if ❌** -- `validate` fails on: any surviving `{PLACEHOLDER}` in an emitted file, a missing emitted asset,
> a cited `references/*.md` that does not exist, or provenance frontmatter that is missing or a version behind.
> Placeholder / reference failures are fixed via `Edit`; a stamp failure is fixed by `generate.sh restamp`, which
> the failure message names -- never by `emit`, never by `MEMORY_SYNC_FORCE=1`. Re-run after the fix.

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
HARD depth: {N} rules audited for paths: precision ({N} TOO_BROAD / {N} DANGLING / ...), {N} obvious-vs-domain
            pairs harvested from this repo

Files written:
- .claude/skills/memory-sync/SKILL.md
- .claude/skills/memory-sync/references/memory-guide.md
- .claude/skills/memory-sync/references/agent-audit.md
- .claude/skills/memory-sync/references/hard-sync.md

Run it:  /memory-sync                       -> scope session (default), depth NORMAL, whole surface
         /memory-sync all "only rules"      -> re-verify every fact, emphasis on rules
         /memory-sync branch                -> facts from the branch diff vs {DEFAULT_BRANCH}
         /memory-sync all hard              -> + paths: precision audit + obvious-knowledge purge

Later:   /brewdoc:memory-sync-setup status   -> is the emitted skill still true to the repo
         /brewdoc:memory-sync-setup upgrade  -> refresh its tables, keep hand-edits
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

TWELVE blocks -- ten in the emitted `SKILL.md`, two in the emitted `references/hard-sync.md`. `validate` fails
until every one is filled. The Phase 3 table above names all twelve with their file and substance contract; it is
the single list -- do not restate it here.

> The emitted skill also uses RUNTIME tokens -- `{SCOPE}`, `{FOCUS}`, `{DEPTH}`, `{BATCH}`, `{FILE_LIST}`,
> `{FACTS}`, `{BROKEN_REFS}`, `{DATE}`, `{N}`, `{M}`, `{K}`. Those are resolved per RUN by the emitted skill, are
> allow-listed by `validate` (`RUNTIME_ALLOW` in `generate.sh` -- the two lists must match exactly), and MUST
> remain in the file.

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Emit target | `<cwd>/.claude/skills/memory-sync/` | Where the generated skill is written |
| Emit material | `${CLAUDE_SKILL_DIR}/references/` | `SKILL.md.template`, `memory-guide.md`, `agent-audit.md`, `hard-sync.md` -- four files emitted |
| Emitted default depth | `NORMAL` | `HARD` is per-run, from the emitted skill's own arguments; nothing is regenerated to switch |
| Generation script | `${CLAUDE_SKILL_DIR}/scripts/generate.sh` | `scan` \| `emit` \| `validate` \| `restamp` \| `status` \| `enable` \| `disable` \| `uninstall` \| `purge` |
| Provenance refresh | `generate.sh restamp` | Metadata-only, idempotent, mandatory tail of `upgrade`. Rewrites `version` / `last_updated` / `surface_files`, adds `doc_type` / `generated_by` when absent, deletes a pre-5.0 tail stamp and a legacy `disable-model-invocation`, re-copies a reference ONLY when its sole difference from the plugin source is the release stamp. Aborts rather than write if anything outside the metadata block would move |
| Mode | `status` when installed, else `install` | `status` (read-only) \| `install` \| `upgrade` \| `enable` \| `disable` \| `uninstall` \| `purge` |
| Disabled marker | `<target>/.claude/skills/memory-sync/SKILL.md.disabled` | What `disable` renames `SKILL.md` to. Its presence IS the disabled state -- there is no config file to keep in sync |
| Overwrite | refused | `emit` never overwrites a live installation; `MEMORY_SYNC_FORCE=1` overrides and DESTROYS hand-edits |
| Emitted default scope | `session` | The emitted skill's own default; every scope sweeps the whole surface |
| Non-growth | prime directive | Every emitted-skill run ends each file `<=` its original line count, total delta `<= 0` |
| `docs/**` | excluded | Owned by a separate doc flow; refs INTO docs are resolution-checked, contents never edited |
| Frontmatter `cli` | omitted | The command equals the skill name (`/brewdoc:memory-sync-setup`) -- declaring it would be noise |
| Frontmatter `version` | omitted | All behaviour lives inside this skill dir, so the dir hash already changes with it |

---

## Error Handling

| Condition | Action |
|-----------|--------|
| `$ARGUMENTS` is prose with no mode token/keyword | Extract the fine-tune focus from the sentence; never treat its first word as a positional mode |
| PLAN block missing, or printed after work started | Defect -- print it once, before the first action |
| Emit material missing under `${CLAUDE_SKILL_DIR}/references/` | ERROR "missing emit material: `<path>` -- reinstall brewdoc". STOP. Never improvise a template |
| `install` but `<target>/.claude/skills/memory-sync/` already exists | STOP. "memory-sync already installed. Use `upgrade` to refresh it, or `status` to see its drift." Never overwrite |
| `upgrade` but nothing installed | STOP. "Nothing to upgrade -- run `/brewdoc:memory-sync-setup install` to generate it first" |
| `uninstall`/`purge` but nothing installed | The script prints `⚠️ nothing to {uninstall\|purge}` and exits 0. Report it. Never `rm -rf` a path that does not exist as if it did |
| `enable`/`disable` but nothing installed | The script exits 1 with `❌ FAILED: not installed`. Report it and STOP -- never emit a fresh install as a "fix" for a toggle verb |
| `enable` on a live install, `disable` on a parked one | The script prints `✅ already {enabled\|disabled}` and exits 0. Report it and STOP; do not rename |
| `validate` or `status` run against a DISABLED install | `status` reports `INSTALLED=parked` / `PARKED=yes` / `NOTE_PARKED=…` and prefixes its verdict `PARKED - ` (the staleness answer is still computed, read out of the parked file). `validate` FAILS -- it looks for `SKILL.md` and by design finds only `SKILL.md.disabled`. Say "disabled, not missing" and offer `enable`. Never re-`emit` -- it would destroy the SELF-SYNC hand-edits the parked file still holds |
| `restamp` on a parked install | Refuses with `❌ FAILED: memory-sync is PARKED at …` and exits 1, writing nothing. `enable` first, then restamp. Never stamp a file the toggle owns |
| `uninstall` leaves files behind (`KEPT:` list non-empty) | Correct, not a failure: those files were never written by `emit`. Show the list and offer `purge` if the user wants the directory gone |
| `upgrade` finds hand-edited sections | PRESERVE them. Refresh enumerated tables and ADD new sections; show the diff and AskUserQuestion before REPLACING any section whose content diverges from the template baseline. Declined = no edit, continue cleanly |
| No provenance frontmatter in the installed skill | Treat as hand-written: `status` reports `STAMP_FORMAT=none` + `META_*=UNSTAMPED`, `upgrade` is additive-only and asks before every replacement |
| Installed skill carries the pre-5.0 TAIL stamp (`<!-- memory-sync template v… -->`) | `status` reports `STAMP_FORMAT=legacy`, `NOTE_LEGACY=…` and `VERDICT=STALE-LEGACY`; `validate` FAILS. `generate.sh restamp` migrates it in one call -- five frontmatter keys written, tail line deleted -- and it runs at the end of every `upgrade` anyway. Never crash on the old format, never treat it as in sync |
| `validate` fails with `stamped version A != plugin version B` | The install is a plugin version behind. Run `generate.sh restamp` (metadata only, hand-edits untouched), then re-run `validate`. This is the failure the message names; `emit` / `MEMORY_SYNC_FORCE=1` are NOT the remedy and would destroy the SELF-SYNC edits |
| `validate` reports a missing `references/*.md` while `SKILL.md` is present | `emit` cannot be the fix -- it refuses over a live install. Run `generate.sh restamp`: it re-copies a MISSING reference from the plugin (nothing local to lose) and reports `REF RESTORED:` |
| `restamp` prints `REF DIFFERS:` for a reference | Not a failure. That file's content differs from the plugin source -- `hard-sync.md` ALWAYS does (Phase 3 filled its two BLOCKs), the other two only after a hand-edit or a plugin prose change. Nothing is overwritten: diff against `${CLAUDE_SKILL_DIR}/references/<name>` and port real changes by hand |
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
- `references/hard-sync.md` -- the `HARD`-depth passes: `paths:` precision audit + obvious-knowledge purge, with
  their verdict vocabulary and reporting contract (emitted; holds `{PATHS_PRECISION_TABLE}` +
  `{OBVIOUS_VS_DOMAIN_TABLE}`).
- `scripts/generate.sh` -- `scan` / `emit` / `validate` / `restamp` / `status` / `enable` / `disable` /
  `uninstall` / `purge`.

<!--
SKILL METADATA -- brewdoc:memory-sync-setup (GENERATOR)

Replaces the old brewdoc:memory (a generic in-plugin memory syncer). Analyzes a target project and emits a
self-contained project-local .claude/skills/memory-sync/ (SKILL.md + memory-guide.md + agent-audit.md +
hard-sync.md). The plugin never syncs memory itself.

The emitted skill has TWO axes: {SCOPE} = which change facts drive the sweep (session default | branch | commit |
recent[:N] | all), {DEPTH} = how hard the surface is cut (NORMAL default | HARD = + paths: precision audit +
obvious-knowledge purge, per references/hard-sync.md).

Modes: status (read-only drift report, default when installed) | install (full analysis + emit, default when not
installed) | upgrade (re-scan + refresh, hand-edits preserved -- the emitted skill is expected to have
self-modified) | uninstall (delete the emitted skill dir after confirmation).

Non-negotiables of the EMITTED skill: NON-GROWTH prime directive (every file <= its original line count, total
delta <= 0); facts before dedup before compression; disjoint batches, one bounded agent each, all spawned in one
message; VERIFY by an independent checker, never the writer; SELF-SYNC (the skill updates itself); PROPOSE never
auto-create; agents re-audited against current best practice every sweep.

Re-run triggers:
- New nested CLAUDE.md / rule / convention file  -> upgrade (surface gained a member)
- New or renamed agent / skill                    -> upgrade (roster + batch tables)
- Stack change, renamed layer, new lint/CI gate   -> upgrade (fact catalogue commands go stale)
- Rule added, renamed or re-scoped                -> upgrade (paths-precision table in hard-sync.md)
- Default branch or .gitignore change             -> upgrade (branch + git-visibility scalars)
- Doc-flow ownership change                       -> upgrade (exclusions)
-->
