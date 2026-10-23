---
name: e2e
description: "Orchestrates e2e testing: BDD scenarios, Playwright autotests. Triggers: e2e tests, BDD scenarios, write autotest."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|create|update|review|rules]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion, Skill, WebSearch, WebFetch]
model: opus
license: MIT
---
<!-- brewcode-meta: version=6.12.2 content_version=6.5.0 generated_by=brewcode:e2e -->

<instructions>

# E2E Testing

Full-cycle E2E testing orchestration: install agents, create BDD scenarios, write autotests, quorum review.

---

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; mode tokens and flags may sit anywhere in it.

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `status` | *(empty)*, `status`, `check`, `show` | `статус`, `проверь`, `покажи` | no |
| `install` | `install`, `setup`, `set up`, `init` | `настрой`, `установи`, `поставь` | yes |
| `create` | `create`, `write`, `add tests`, `new scenario` | `создай`, `напиши`, `добавь тесты` | yes |
| `update` | `update`, `refresh`, `sync tests` | `обнови`, `актуализируй` | yes |
| `review` | `review`, `quorum`, `validate` | `ревью`, `провалидируй` | yes |
| `rules` | `rules`, `conventions`, `e2e rules` | `правила`, `конвенции` | yes |

1. Mode: an explicit mode token wins outright; else the most distinct whole-word keyword hits
   (table above). Tie with a destructive mode -> `AskUserQuestion`; with `status` -> `status`; of two
   mutating modes -> the keyword that comes first. No hit or empty -> `status` if the e2e agent
   roster is installed (`.claude/agents/e2e-*.md` count >= 3), else `install`.
2. Scope: prose that is not a mode/id/path is still input: take the id, path or target from it.
3. Ask: at most ONE `AskUserQuestion` (max 4 questions) to resolve mode and scope, before any work, only when the answer
   changes what gets written. A read-only run asks nothing.

Print once, before the first action (labels literal, values in the conversation language):

```
PLAN — brewcode:e2e
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

---

## Phase 0: Parse Arguments

**EXECUTE** using Bash tool (quoted heredoc: the shell never parses the prompt):
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/detect-mode.sh" - <<'__SKILL_ARGS__' && echo "OK" || echo "FAILED"
$ARGUMENTS
__SKILL_ARGS__
```

The script resolves the mode per the Prompt contract and prints `MODE:xxx`, optionally `PROMPT:xxx`,
plus `PLUGIN_VERSION:`, `CONTENT_VERSION:`, `GENERATED_BY:`, `LAST_UPDATED:` (`YYYY-MM-DD`). Store all.
Every file this skill writes (`.claude/e2e/config.json`, `.claude/e2e/e2e-rules.md`,
`.claude/agents/e2e-*.md`, `.claude/rules/e2e-conventions.md`) takes `version`, `content_version`,
`generated_by`, `last_updated` from these lines, never hardcoded; the `.md` ones add `doc_type: llm`.

> **STOP if FAILED** — on an `ERROR:` line (an unsupported verb such as `uninstall`/`purge`, or an
> unresolvable plugin version or `content_version`, i.e. a broken install) report it verbatim and stop,
> `status` included; never fall back to INSTALL.

---

## Phase 1: Display Detection

Print the PLAN block (Prompt contract) now, before Phase 2: `MODE:` from Phase 0, `SCOPE:` =
`PROMPT:` or "none".

---

## Phase 2: Load Mode Reference

| MODE | Reference File |
|------|---------------|
| install | `${CLAUDE_SKILL_DIR}/references/mode-install.md` |
| create | `${CLAUDE_SKILL_DIR}/references/mode-create.md` |
| update | `${CLAUDE_SKILL_DIR}/references/mode-update.md` |
| review | `${CLAUDE_SKILL_DIR}/references/mode-review.md` |
| rules | `${CLAUDE_SKILL_DIR}/references/mode-rules.md` |
| status | `${CLAUDE_SKILL_DIR}/references/mode-status.md` |

Also read `${CLAUDE_SKILL_DIR}/references/e2e-rules.md` (baseline rules; `install` merges them into
`.claude/e2e/e2e-rules.md` = `config.rulesPath`, the only copy generated agents can read) and
`${CLAUDE_SKILL_DIR}/references/e2e-architecture.md`.

> **STOP if mode reference not found** -- report missing file.

References carry CLAUDE_SKILL_DIR literally: expand it to the resolved path above before pasting it
into a spawn prompt.

---

## Phase 3: Execute Mode Flow

Follow the loaded mode reference step by step.

- **Prerequisite** (not install/status): >=3 `.claude/agents/e2e-*.md`, else "Run
  `/brewcode:e2e install` first." STOP. Status reports the gap instead.
- **Review Cycle** (create, update): MAX_CYCLES=3; execute -> reviewer -> a different agent re-checks
  -> fix confirmed -> repeat.
- **User Interaction:** AskUserQuestion at every key decision point; PROMPT is context, not confirmation.

### Agent Dispatch (every Agent spawn)

One subagent = ONE deliverable (one feature's tests, ~<=5 files, ~<=10 steps); split bigger scope into
N tasks spawned in ONE message: an agent running for an hour cannot be observed or corrected. Spawned
agents return open decisions here, never re-delegate.

Every spawn brief carries six labeled fields, since a subagent starts with an empty context: GOAL (task + why), ROLE (owns, must not touch), SCOPE (paths/commands in and out), CONTEXT (done, by whom, in parallel), CONSUMER (who uses the result + its shape), DONE (acceptance + return: verdict first, evidence, bounded; long output to a file, path returned).
A bare one-line task is never enough; each mode reference carries its filled briefs.

---

## Error Handling

| Condition | Action |
|-----------|--------|
| Rules file missing | "E2E rules not found at `${CLAUDE_SKILL_DIR}/references/`. Re-install plugin." STOP |
| Config missing (non-install/status mode) | "Run `/brewcode:e2e install` first." STOP |
| Review cycle limit (3) reached | AskUserQuestion with remaining issues |
| Compilation fails after fix | Report to user, suggest manual intervention |
| Agent refuses task | Re-assign to suggested colleague, max 2 retries |

---

## Output Format

```markdown
# e2e [{MODE}]

## Detection
| Field | Value |
|-------|-------|
| Arguments | `{raw args}` |
| Mode | `{MODE}` |
| Prompt | `{PROMPT or none}` |

## Results
{Mode-specific output}

## Next Steps
- {recommendations based on mode}
```

</instructions>
