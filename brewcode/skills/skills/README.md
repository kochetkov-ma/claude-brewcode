# Skills

Manages Claude Code skills — check status, create new skills from a free-form prompt, improve, review, or sync existing ones with the codebase. Input is ONE free-form natural-language prompt; there is no keyword grammar. Skill operations are delegated to the `brewcode:skill-creator` specialist agent.

**Default action:** with no arguments, `/brewcode:skills` reports the rich status of your skills. Ask for the menu explicitly to choose an action instead.

## Quick Start

```
/brewcode:skills
```

Pass a free-form prompt to name what you want:

```
/brewcode:skills create a skill that scans for hardcoded secrets
```

## How It Works — Unified 6-Step Flow

1. **Input gate** — reads the prompt; empty means `status`.
2. **Auto-mode select** — infers the mode from the prompt and prints a `PLAN — brewcode:skills` block (input, mode and why, scope, steps, result) before any work.
3. **Menu** — only when you ask for it: a single `AskUserQuestion` with Status (skills, recommended), Status (all: agents + rules + skills), Create, Improve, Review, Sync, List (plain) and Cancel.
4. **Dispatch** — routes create / improve to `brewcode:skill-creator`, sync to `references/mode-sync.md` (one `skill-creator` per target), review to the project reviewer agent from `.claude/agents/` (else `general-purpose`, two-phase), or runs `list-skills.sh` directly (list mode).
5. **Real status** — four blocks, never a flat list: inventory by scope (plugin / project / global, with counts, names, load path), state (enabled or disabled via setup config or `<name>.disabled` parking, legacy `_SKILL.md` markers flagged, model), overlaps and conflicts (shadowing across scopes, duplicate triggers or descriptions), health flags (missing README or frontmatter, weak description triggers).
6. **Mandatory final output** — structured summary of what was created, changed, or reviewed. Omitted only for `list` mode.

## Modes

| Mode | How it activates | What it does |
|------|-----------------|--------------|
| `status` | Default for any "show me" intent — "статус" / "что есть" / "состояние" | Inventory per scope, state and model, overlaps, health flags |
| `list` | Explicit only — "list" / "список" / "перечисли" | Runs `list-skills.sh`, plain file listing |
| `create` | "создай" / "create" / "new" / "добавь" / "scaffold" | skill-creator researches and generates a new SKILL.md + README.md |
| `improve` | "улучши" / "improve" / "refactor" / "fix" / "почини", or a bare existing name/path | skill-creator rewrites target SKILL.md with optimized content |
| `review` | "ревью" / "review" / "validate" / "проверь корректность" | the project reviewer agent from `.claude/agents/` (else `general-purpose`) audits skill files, two-phase (review -> double-check findings -> report) |
| `sync` | "sync", "синк", "memory sync", "актуализируй", "обнови знания", "приведи в соответствие с кодом" | skill-creator re-verifies SKILL.md/reference claims against the codebase and corrects stale knowledge |

Batch flag (not a mode): plural form, "все" / "all", or multiple names/paths — fan-out, one specialist spawn per item.

## Sync mode

Re-verifies every claim in `SKILL.md` and its `references/*.md` against the current codebase and corrects drift. Shared implementation with `/brewcode:agents sync`: `references/mode-sync.md`.

| Scope | Trigger | Evidence |
|-------|---------|----------|
| `repo` (default) | no scope given | whole working tree |
| `session` | "session", "this conversation" | decisions, user corrections, bugs hit in the current conversation |
| `commit` | "commit", "last commit" | `git show`/`git diff <ref>`, default `HEAD` |

Announces `Sync scope: <scope> — <evidence> | targets: <N>` before editing. Non-growth: every edited file ends at or below its original line count, total delta <= 0. Order: DELETE stale/dead/duplicate/obvious content first, then FIX, then ADD (non-obvious, source-verified only).

Verdicts: `STALE`, `DEAD`, `DUPLICATE`, `OBVIOUS`, `DRIFT`, `MISSING`.

Report table: `File | Lines before -> after | Fixed | Deleted | Added | Key change`, plus corrected facts, additions with source, skipped files, and total delta.

Targets: `.claude/skills/*/SKILL.md`, `*/skills/*/SKILL.md` and each skill's `references/*.md` (repo-local only). Disabled skills (`_SKILL.md`) are skipped and reported. `/brewdoc:memory-sync-setup` emits a project-local `/memory-sync` skill that applies the same non-growth sync to CLAUDE.md, rules, conventions, agents and skills together — use this skill when you want a roster on its own.

## Create / Improve Parameters

Before spawning `skill-creator`, the orchestrating skill itself asks up to four questions in Phase 1 (invocation type, testing depth, review type if Standard/Deep, plan confirmation) — skill-creator is told these are already decided and must not re-ask:

| Parameter | Options | Notes |
|-----------|---------|-------|
| Invocation type | User-only / LLM-auto / Both | Determines `user-invocable` and matcher strategy |
| Testing depth | Quick (recommended) / Standard / Deep | Drives the scope of Phase 5 E2E evaluation |
| Review type | Simple / Quorum | Quorum available only at Standard or Deep testing depth |

**Description budget:** the generated `description:` is a single line of at most about 100 tokens (~400 characters), written in the third person (what it does, then when to use it), with trigger keywords early. About 120 characters is an optional brevity target, not a second cap. The review checklist in `references/review-prompt.md` uses the same 400-character limit, so a skill written to spec passes its own review.

The full creation pipeline includes Phase 0 Discovery (parallel Explore agents), Phase 4 Review (Simple or 3-reviewer Quorum with DoubleCheck + fix loop), and Phase 5 E2E. This machinery is only reachable via `create` or `improve` mode.

## Examples

```bash
# Open the interactive menu
/brewcode:skills

# Check the current state of all installed skills
/brewcode:skills what is the current state of our skills

# Create a brand new skill from a prompt
/brewcode:skills create a skill that scans for hardcoded API keys

# Improve an existing skill by name
/brewcode:skills improve the superreview skill

# Improve a skill by explicit path
/brewcode:skills improve brewcode/skills/rules

# Review all skills in a folder for quality
/brewcode:skills review ~/.claude/skills/

# Sync skill knowledge with the codebase (default scope: repo)
/brewcode:skills sync

# Sync only what changed in the current session
/brewcode:skills sync session

# Plain listing of all skill files
/brewcode:skills list
```

## Output

Depends on mode:

- **status** — rich inventory table of all skills grouped by location (global `~/.claude/skills/`, project `.claude/skills/`, plugins), with description and trigger keywords for each.
- **list** — plain file listing from `list-skills.sh`. The script self-locates from its own path, so it enumerates plugin skills in both the dev checkout and the installed cache alongside global and project scopes. Every plugin that ships a `skills/` dir and a `.claude-plugin/plugin.json` is scanned, not just brewcode; plugin names come from `plugin.json`, and for each cached plugin only the highest version is listed. Global skills and the plugin cache follow `CLAUDE_CONFIG_DIR` and `CLAUDE_CODE_PLUGIN_CACHE_DIR` when set.
- **create** — a new skill directory containing `SKILL.md` and `README.md`, placed in `.claude/skills/` (project), `~/.claude/skills/` (global) or `<plugin>/skills/` (plugin).
- **improve** — the target `SKILL.md` rewritten with optimized description, trigger keywords, imperative voice, and best practices.
- **review** — a structured audit report with issues found and recommended fixes applied.

## Tips

- Run `/brewcode:skills` with no arguments to answer "what do I have installed?" in one step.
- If the current conversation already contains a workflow worth capturing, `create` extracts it directly.
- Deep testing depth runs Phase 5 E2E in an isolated temp project (1 happy-path + 1 edge-case scenario per mode); Quick depth instead runs `validate-skill.sh` + 3-5 test prompts. Choose `Deep` for safety-critical or frequently-used skills.
- `list` is the fastest way to check file counts; `status` adds state, overlaps and health flags.

## Documentation

Full docs: [skills](https://doc-claude.brewcode.app/brewcode/skills/skills/)
