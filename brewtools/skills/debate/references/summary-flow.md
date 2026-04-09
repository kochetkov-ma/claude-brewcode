# Summary + Decision Flow

## Phase 6: Secretary Summary

### Step 1: Read Full Log

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/read-log.sh" "LOG_FILE" all
```

### Step 2: Spawn Secretary

Read secretary prompt: `${CLAUDE_SKILL_DIR}/agents/secretary.md`

Spawn secretary via Task tool:

```
Task(
  description: "Secretary writes debate summary",
  prompt: "{secretary_prompt}\n\n## Debate Log\n{full_log_content}\n\n## Agent Profiles\n{agent_table}\n\n## Topic\n{topic}",
  subagent_type: "general-purpose"
)
```

### Step 3: Write Summary

Write secretary's output to `{REPORT_DIR}/summary.md`.

Proceed to Phase 7 (Decision) in SKILL.md — the judge writes `decisions.md` there.
