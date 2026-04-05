---
name: brewcode:debate
description: "Orchestrates multi-agent debates with 3 modes: Challenge (select best variant), Strategy (deep analysis with independent proposals), Critic (find all weaknesses). Triggers: debate, challenge, compare options, strategy analysis, critique, find weaknesses."
disable-model-invocation: true
user-invocable: true
argument-hint: "[topic] [-m challenge|strategy|critic] [-n 2-5] [-r max-rounds] [--review]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion, Skill
model: opus
---

# Multi-Agent Debate

Orchestrates sequential multi-agent debates. Dynamic agents (2-5) with unique characters debate, main session acts as judge, secretary summarizes, judge writes final decisions.

---

## Phase 0: Validation

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/validate.sh" && echo "VALID" || echo "FAILED"
```

> **STOP if FAILED** — fix missing files before continuing.

Read archetypes into context:

Read file: `${CLAUDE_SKILL_DIR}/agents/archetypes.md`

---

## Phase 1: Parse Arguments

**Arguments:** `$ARGUMENTS`

| Flag | Default | Description |
|------|---------|-------------|
| `-m` | ask user | Mode: `challenge`, `strategy`, `critic` |
| `-n` | 3 | Agent count: 2-5 |
| `-r` | 5 | Max debate rounds |
| `--review` | off | Run `/brewcode:review` on output |
| (positional) | — | Topic text or file path |

### Mode not specified (when `-m` omitted)

If mode is NOT explicitly provided via `-m` flag or clearly stated in the topic text, **do NOT auto-detect**. Ask user using AskUserQuestion:

> **Which debate mode?**
>
> 1. **Challenge** — generate/receive variants, debate to select the best one
> 2. **Strategy** — each agent proposes independently, then debate to converge
> 3. **Critic** — all agents attack the given solution to find weaknesses/risks
>
> Reply with mode name or number.

Only proceed after explicit user choice.

If topic is a file path (exists on disk) — read file content as topic.

---

## Phase 2: Init + Display

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/init-log.sh" && echo "INIT_OK" || echo "INIT_FAILED"
```

> **STOP if INIT_FAILED** — cannot create report directory.

Capture output — it prints:
```
REPORT_DIR=<path>
LOG_FILE=<path>
```

Store `REPORT_DIR` and `LOG_FILE` for all subsequent phases.

Display to user:

```
Debate Setup
  Mode:       {detected_mode}
  Agents:     {n}
  Max rounds: {r}
  Report:     {REPORT_DIR}
  Log:        {LOG_FILE}
  Topic:      {topic_summary}
```

---

## Phase 3: User Interview

Ask user using AskUserQuestion tool:

> **Debate configuration:**
>
> Mode: **{mode}** | Agents: **{n}** | Max rounds: **{r}**
> Topic: {topic_first_100_chars}
>
> Options:
> 1. Proceed with these settings
> 2. Change mode (challenge/strategy/critic)
> 3. Change agent count (2-5)
> 4. Change max rounds
> 5. Describe custom agent profiles (instead of auto-generated)

Apply any user changes. If user provides custom profiles — skip auto-generation in Phase 4 and use their descriptions.

---

## Phase 4: Agent Profiles

Read reference for agent generation:

Read file: `${CLAUDE_SKILL_DIR}/references/setup-flow.md`

Follow setup-flow.md to generate agent profiles. Result: a table of agents with name, role, character archetype, perspective, and WHY chosen.

Display agent table to user. Ask confirmation using AskUserQuestion:

> **Agent Team:**
>
> | # | Name | Role | Archetype | Perspective |
> |---|------|------|-----------|-------------|
> | ... | ... | ... | ... | ... |
>
> Options:
> 1. Proceed
> 2. Swap an agent (specify which)
> 3. Regenerate all

---

## Phase 5: Discovery (Mandatory)

Research phase — gather current, verified information before debate begins.

Read file: `${CLAUDE_SKILL_DIR}/references/discovery-flow.md`

Follow discovery-flow.md to spawn parallel research agents:
1. **Codebase Explorer** — searches project for relevant code, patterns, dependencies
2. **Web Researcher** — searches internet for current best practices, official docs, recent changes

All findings saved to `{REPORT_DIR}/discovery.md` with sources.

> **Every debate argument in Phase 6 MUST reference findings from discovery.md.**
> Unsourced claims are not valid arguments.

Display discovery summary to user before proceeding to debate.

---

## Phase 6: Debate

Load mode-specific flow reference and execute debate.

| Mode | Reference |
|------|-----------|
| challenge | `${CLAUDE_SKILL_DIR}/references/challenge-flow.md` |
| strategy | `${CLAUDE_SKILL_DIR}/references/strategy-flow.md` |
| critic | `${CLAUDE_SKILL_DIR}/references/critic-flow.md` |

Read the matching reference file and follow its instructions exactly.

**Agent spawning:** Use Task tool with `subagent_type: "general-purpose"`. Build each agent's prompt dynamically by combining:
1. Base template from `${CLAUDE_SKILL_DIR}/agents/debater-template.md`
2. Role overlay from `${CLAUDE_SKILL_DIR}/agents/{role}-template.md`
3. Agent's character traits from archetypes
4. Discovery findings from `{REPORT_DIR}/discovery.md` (injected as Evidence Base)
5. Current debate context (recent JSONL entries)

**After each agent turn**, append to log:

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/append-log.sh" "LOG_FILE_PATH" '{"ts":"...","from":"agent-name","to":["targets"],"what":"<20 words","why":"<40 words (include [Source: #N] refs)","type":"argument","mode":"MODE"}'
```

**Judge interventions** (main session): After each round, evaluate if consensus emerging, redirect if stuck, end early if unanimous agreement.

---

## Phase 7: Summary

Read file: `${CLAUDE_SKILL_DIR}/references/summary-flow.md`

Follow summary-flow.md:
1. Read full debate log and `{REPORT_DIR}/discovery.md`
2. Spawn secretary agent to write `summary.md` in REPORT_DIR

---

## Phase 8: Decision

Judge (main session) writes `decisions.md`:
- Winning position or synthesized result
- Key arguments that decided the outcome
- Minority opinions worth noting
- Confidence level: high / medium / low
- Recommended next steps

Write to: `{REPORT_DIR}/decisions.md`

---

## Phase 9: Final Output

Display final status:

```
Debate Complete
  Mode:      {mode}
  Rounds:    {actual_rounds}/{max_rounds}
  Outcome:   {consensus | partial | no-consensus}
  Agents:    {agent_table_brief}

Decisions (top 3-5):
  - {bullet_1}
  - {bullet_2}
  - {bullet_3}

Artifacts:
  - {REPORT_DIR}/discovery.md
  - {REPORT_DIR}/decisions.md
  - {REPORT_DIR}/summary.md
  - {REPORT_DIR}/debate-log.jsonl
```

If `--review` flag was set:

Invoke: `Skill(skill="brewcode:standards-review", args="{REPORT_DIR}")`
