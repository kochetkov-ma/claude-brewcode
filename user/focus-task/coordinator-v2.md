# Focus-Task v2.0: Hooks-Only Architecture Flow

> Complete execution flow with hooks, agents, knowledge management, and handoff protocol.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLAUDE CODE SESSION                                │
│                                                                              │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────────┐ │
│  │   HOOKS (4шт)    │     │  AGENTS (2шт)    │     │    STATE (Files)     │ │
│  │                  │     │                  │     │                      │ │
│  │ • PreToolUse     │     │ • ft-coordinator │     │ • TASK.md            │ │
│  │ • PostToolUse    │     │ • ft-knowledge-  │     │ • KNOWLEDGE.jsonl    │ │
│  │ • PreCompact     │     │   manager        │     │ • reports/MANIFEST   │ │
│  │ • Stop           │     │                  │     │ • tasks/cfg/.lock    │ │
│  └──────────────────┘     └──────────────────┘     └──────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## PHASE 0: Startup (`/focus-task-start`)

```
┌─────────────────────────────────────────────────────────────────┐
│ USER: /focus-task-start [path]                                  │
│       or /focus-task-start (reads from .claude/TASK.md)         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ SKILL (start/SKILL.md) loads                                    │
│ Model: opus | Context: fork                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. Validate task reference                                      │
│    - Read $ARGUMENTS or .claude/TASK.md                         │
│    - Check pattern: .claude/tasks/*_TASK.md                     │
│    - Check file exists                                          │
│                                                                 │
│ 2. Load task                                                    │
│    - Read {TIMESTAMP}_{NAME}_TASK.md                            │
│    - Read {TIMESTAMP}_{NAME}_KNOWLEDGE.jsonl (if exists)        │
│    - Determine current phase (by statuses)                      │
│                                                                 │
│ 3. Update status → "in progress"                                │
│                                                                 │
│ 4. Create reports dir (if missing)                              │
│    - .claude/tasks/reports/{TIMESTAMP}_{NAME}/                  │
│    - MANIFEST.md from template                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## PHASE 1-N: Execution Loop

### Step 1: Call Work Agent

```
┌─────────────────────────────────────────────────────────────────┐
│ MANAGER (Claude in skill) prepares agent call:                  │
│                                                                 │
│ Task(                                                           │
│   subagent_type: "developer",                                   │
│   prompt: "Implement feature X. Context: C1, C2. Refs: R1."     │
│ )                                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Task tool call
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 🪝 HOOK: PreToolUse (pre-task.mjs)                              │
│    Matcher: "Task"                                              │
│                                                                 │
│    Input:                                                       │
│    {                                                            │
│      "tool_input": {                                            │
│        "subagent_type": "developer",                            │
│        "prompt": "Implement feature X..."                       │
│      },                                                         │
│      "cwd": "/project"                                          │
│    }                                                            │
│                                                                 │
│    Logic:                                                       │
│    1. Check: subagent_type == system agent?                     │
│       - System: ft-coordinator, ft-knowledge-manager,           │
│                 Explore, Plan, Bash, general-purpose            │
│       → SKIP (output: {})                                       │
│                                                                 │
│    2. Check: focus-task active? (.claude/TASK.md exists?)       │
│       → NO: SKIP (output: {})                                   │
│                                                                 │
│    3. Read KNOWLEDGE.jsonl                                      │
│    4. Compress to ## K format:                                  │
│       ┌─────────────────────────────────────────────────────┐   │
│       │ ## K                                                │   │
│       │ ❌ SELECT *→explicit cols|@Autowired→constructor    │   │
│       │ ✅ BaseEntity|@Slf4j|List.of()                      │   │
│       │ ℹ️ auth:SecurityConfig|entities:com.x.domain        │   │
│       └─────────────────────────────────────────────────────┘   │
│                                                                 │
│    5. Output:                                                   │
│    {                                                            │
│      "updatedInput": {                                          │
│        "subagent_type": "developer",                            │
│        "prompt": "## K\n❌ ...\n✅ ...\n\nImplement feature X."  │
│      }                                                          │
│    }                                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Prompt with knowledge injection
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ WORK AGENT (developer/tester/reviewer) executes                 │
│                                                                 │
│ Agent sees:                                                     │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ## K                                                        │ │
│ │ ❌ SELECT *→explicit cols|@Autowired→constructor            │ │
│ │ ✅ BaseEntity|@Slf4j|List.of()                              │ │
│ │ ℹ️ auth:SecurityConfig|entities:com.x.domain                │ │
│ │                                                             │ │
│ │ Implement feature X. Context: C1, C2. Refs: R1.             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Agent:                                                          │
│ - Reads context files (C1, C2)                                  │
│ - Reads reference files (R1) for patterns                       │
│ - Writes code following knowledge from ## K                     │
│ - Returns result                                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Agent completes
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 🪝 HOOK: PostToolUse (post-task.mjs)                            │
│    Matcher: "Task"                                              │
│                                                                 │
│    Input:                                                       │
│    {                                                            │
│      "tool_input": { "subagent_type": "developer", ... },       │
│      "tool_output": "Agent completed successfully...",          │
│      "cwd": "/project"                                          │
│    }                                                            │
│                                                                 │
│    Logic:                                                       │
│    1. Skip system agents                                        │
│    2. Skip if no active task                                    │
│    3. Output:                                                   │
│    {                                                            │
│      "systemMessage": "<ft-validation>                          │
│        [DEVELOPER COMPLETED]                                    │
│        NEXT: Call ft-coordinator agent to:                      │
│        1. Update phase status in TASK.md                        │
│        2. Write agent output to reports/                        │
│        3. Update MANIFEST.md                                    │
│        4. Add entries to KNOWLEDGE.jsonl                        │
│                                                                 │
│        Use Task tool with subagent_type:                        │
│        \"focus-task:ft-coordinator\"             │
│      </ft-validation>"                                          │
│    }                                                            │
└─────────────────────────────────────────────────────────────────┘
```

### Step 2: Coordinator Update

```
┌─────────────────────────────────────────────────────────────────┐
│ MANAGER sees reminder and calls coordinator:                    │
│                                                                 │
│ Task(                                                           │
│   subagent_type: "focus-task:ft-coordinator",    │
│   prompt: "Update phase 1 status.                               │
│     taskPath: .claude/tasks/20260127_feature_TASK.md            │
│     phase: 1                                                    │
│     iteration: 1                                                │
│     type: exec                                                  │
│     status: completed                                           │
│     agentResults: [developer output captured above]             │
│     reportDir: .claude/tasks/reports/20260127_feature/"         │
│ )                                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ (PreToolUse hook SKIPS - system agent)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ FT-COORDINATOR (model: haiku)                                   │
│                                                                 │
│ Actions:                                                        │
│                                                                 │
│ 1. CREATE report dir:                                           │
│    reports/20260127_feature/phase_1/iter_1_exec/                │
│                                                                 │
│ 2. WRITE agent report:                                          │
│    phase_1/iter_1_exec/developer_output.md                      │
│    ┌─────────────────────────────────────────────────────────┐  │
│    │ # Developer Report: Phase 1, Iteration 1                │  │
│    │ Agent: developer | Status: completed                    │  │
│    │                                                         │  │
│    │ ## Summary                                              │  │
│    │ Implemented feature X...                                │  │
│    │                                                         │  │
│    │ ## Files Modified                                       │  │
│    │ | File | Action | Lines |                               │  │
│    │ | src/X.java | created | 45 |                           │  │
│    │                                                         │  │
│    │ ## Knowledge Extracted                                  │  │
│    │ - ✅ Used BaseEntity pattern                            │  │
│    │ - ℹ️ New service: XService.java                          │  │
│    └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│ 3. WRITE phase summary:                                         │
│    phase_1/iter_1_exec/summary.md                               │
│                                                                 │
│ 4. UPDATE TASK.md:                                              │
│    - Phase 1 Status: pending → completed                        │
│    - Phase 1 Result: "Feature X implemented"                    │
│                                                                 │
│ 5. UPDATE MANIFEST.md:                                          │
│    | 1 | 1 | exec | completed | developer | phase_1/iter_1_exec │
│                                                                 │
│ 6. CHECK KNOWLEDGE.jsonl:                                       │
│    - Count entries, detect duplicates                           │
│    - Report: "12 entries, 2 duplicates found"                   │
│                                                                 │
│ 7. ADD to KNOWLEDGE.jsonl (new knowledge from agent):           │
│    {"ts":"...","cat":"code","t":"✅","txt":"BaseEntity","src":"developer"}
│    {"ts":"...","cat":"arch","t":"ℹ️","txt":"XService.java","src":"developer"}
│                                                                 │
│ Output:                                                         │
│ "Coordinator update complete:                                   │
│  - Phase: 1 (exec), Iteration: 1                                │
│  - Status: completed                                            │
│  - Reports: developer_output.md, summary.md                     │
│  - MANIFEST: updated                                            │
│  - KNOWLEDGE: 14 entries, 2 duplicates                          │
│  - Next: Run Phase 1V (verification)"                           │
└─────────────────────────────────────────────────────────────────┘
```

### Step 3: Verification Phase (1V)

```
┌─────────────────────────────────────────────────────────────────┐
│ MANAGER runs verification (PARALLEL - 2+ agents):               │
│                                                                 │
│ ONE message with multiple Task calls:                           │
│                                                                 │
│ Task(subagent_type: "reviewer",                                 │
│   prompt: "Review phase 1. Check: logic, edge cases, security") │
│                                                                 │
│ Task(subagent_type: "developer",                                │
│   prompt: "Review phase 1. Check: project patterns, SOLID")     │
│                                                                 │
│ Task(subagent_type: "tester",                                   │
│   prompt: "Review phase 1. Check: test coverage, assertions")   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Each agent gets ## K injection
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3 AGENTS work PARALLEL                                          │
│                                                                 │
│ reviewer:  "No issues found, code follows patterns"             │
│ developer: "Minor: could use List.of() instead of Arrays.asList"│
│ tester:    "Need more edge case tests for null input"           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ PostToolUse reminds to call coordinator
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ FT-COORDINATOR (for verification)                               │
│                                                                 │
│ 1. CREATE: phase_1/iter_1_verify/                               │
│                                                                 │
│ 2. WRITE review reports:                                        │
│    - reviewer_review.md                                         │
│    - developer_review.md                                        │
│    - tester_review.md                                           │
│                                                                 │
│ 3. WRITE issues.jsonl (if any):                                 │
│    {"severity":"minor","from":"developer","txt":"use List.of()"}│
│    {"severity":"minor","from":"tester","txt":"null edge case"}  │
│                                                                 │
│ 4. UPDATE KNOWLEDGE.jsonl:                                      │
│    {"t":"❌","txt":"Arrays.asList→List.of()","src":"developer"} │
│    {"t":"❌","txt":"missing null check tests","src":"tester"}   │
│                                                                 │
│ 5. UPDATE MANIFEST                                              │
│                                                                 │
│ Output: "Phase 1V: 2 minor issues. Recommend: fix and re-verify"│
└─────────────────────────────────────────────────────────────────┘
```

### Step 4: Iteration (if issues exist)

```
┌─────────────────────────────────────────────────────────────────┐
│ ITERATION PROTOCOL (from TASK.md template):                     │
│                                                                 │
│ WHILE Phase NV has Issues:                                      │
│   1. Fix issues in Phase N (same agent - developer)             │
│   2. Re-run Phase NV (same verifiers)                           │
│   3. Max 3 iterations → escalate/reassign                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Iteration 2:                                                    │
│                                                                 │
│ Task(developer, "Fix issues from 1V: List.of(), null tests")    │
│    ↓                                                            │
│ PreToolUse → inject ## K (now with new ❌)                       │
│    ↓                                                            │
│ Developer sees:                                                 │
│ ## K                                                            │
│ ❌ Arrays.asList→List.of()|missing null check tests             │
│ ...                                                             │
│    ↓                                                            │
│ Developer fixes                                                 │
│    ↓                                                            │
│ PostToolUse → reminder                                          │
│    ↓                                                            │
│ Coordinator → phase_1/iter_2_exec/                              │
│    ↓                                                            │
│ Re-run 1V → phase_1/iter_2_verify/                              │
│    ↓                                                            │
│ All pass → Move to Phase 2                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## HANDOFF: Auto-Compact

```
┌─────────────────────────────────────────────────────────────────┐
│ [Context grows... 85%... 90%...]                                │
│                                                                 │
│ Claude Code triggers auto-compact                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 🪝 HOOK: PreCompact (pre-compact.mjs)                           │
│                                                                 │
│ Input: { "cwd": "/project" }                                    │
│                                                                 │
│ Logic:                                                          │
│                                                                 │
│ 1. CHECK focus-task active?                                     │
│    → NO: output({ continue: true }) // allow compact            │
│                                                                 │
│ 2. PARSE task file → get current phase, status                  │
│                                                                 │
│ 3. IF status == "finished":                                     │
│    → output({ continue: true }) // task done, allow             │
│                                                                 │
│ 4. VALIDATE STATE:                                              │
│    - Reports dir exists for current phase?                      │
│    - MANIFEST.md exists?                                        │
│    → Warnings logged but NOT blocking                           │
│                                                                 │
│ 5. COMPACT KNOWLEDGE (local):                                   │
│    - Read KNOWLEDGE.jsonl                                       │
│    - If > 50 entries:                                           │
│      • Dedupe by txt (keep newest)                              │
│      • Sort: ❌ > ✅ > ℹ️, then by timestamp                     │
│      • Truncate to maxEntries (100)                             │
│      • Atomic write (tmp → rename)                              │
│                                                                 │
│ 6. WRITE HANDOFF ENTRY:                                         │
│    {"cat":"handoff","t":"ℹ️","txt":"Handoff at phase 3:         │
│     context auto-compact","src":"pre-compact-hook"}             │
│                                                                 │
│ 7. UPDATE STATUS → "handoff"                                    │
│                                                                 │
│
│ 9. OUTPUT:                                                      │
│    {                                                            │
│      "continue": true,                                          │
│      "systemMessage": "<ft-handoff>                             │
│        [CONTEXT COMPACT - HANDOFF]                              │
│        Task: .claude/tasks/20260127_feature_TASK.md             │
│        Phase: 3/5                                               │
│        Status: handoff                                          │
│                                                                 │
│        AFTER COMPACT: Re-read TASK.md and continue from phase 3.│
│        State preserved in:                                      │
│        - TASK.md: status, phases                                │
│        - KNOWLEDGE.jsonl: accumulated knowledge                 │
│        - reports/: agent outputs                                │
│      </ft-handoff>"                                             │
│    }                                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ [AUTO-COMPACT OCCURS]                                           │
│                                                                 │
│ Claude Code compresses context, but session CONTINUES           │
│ (this is NOT a new session!)                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ CLAUDE (post-compact)                                           │
│                                                                 │
│ Sees systemMessage with instruction:                            │
│ "AFTER COMPACT: Re-read TASK.md and continue from phase 3"      │
│                                                                 │
│ Actions:                                                        │
│ 1. Read TASK.md → find phase 3 (first with status != completed) │
│ 2. Read KNOWLEDGE.jsonl → compressed knowledge available        │
│ 3. Read MANIFEST.md → see what was done                         │
│ 4. Continue execution from phase 3                              │
│                                                                 │
│ All agents now receive:                                         │
│ - ## K with compacted knowledge                                 │
│ - Context files from TASK.md                                    │
│ - References from TASK.md                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## STOP: Preventing Premature Exit

```
┌─────────────────────────────────────────────────────────────────┐
│ USER tries to stop (Ctrl+C, /stop, etc.)                        │
│ OR Claude tries to stop (thinks it's done)                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 🪝 HOOK: Stop (stop.mjs)                                        │
│                                                                 │
│ Input: { "cwd": "/project" }                                    │
│                                                                 │
│ Logic:                                                          │
│                                                                 │
│ 1. CHECK focus-task active?                                     │
│    → NO: output({}) // allow stop                               │
│                                                                 │
│ 2. PARSE task file → get status                                 │
│                                                                 │
│ 3. IF status == "finished":                                     │
│    - Delete lock file                                           │
│    - output({}) // allow stop                                   │
│                                                                 │
│ 4. IF status != "finished":                                     │
│    - Load state, increment stopAttempts                         │
│    - Save state                                                 │
│                                                                 │
│    4a. IF stopAttempts > 20 (escape mechanism):                 │
│        - output({}) // force allow after 20 attempts            │
│                                                                 │
│    4b. ELSE block stop:                                         │
│        output({                                                 │
│          "decision": "block",                                   │
│          "reason": "[TASK NOT COMPLETE]                         │
│            Current status: in progress                          │
│            Phase: 3/5                                           │
│            Stop attempt: 5/20                                   │
│                                                                 │
│            Task file: .claude/tasks/20260127_feature_TASK.md    │
│                                                                 │
│            ACTION: Continue execution. Re-read TASK.md.         │
│                                                                 │
│            To force exit after 15 more attempts, keep trying."  │
│        })                                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## COMPLETION: Final Review + Rules Extraction

```
┌─────────────────────────────────────────────────────────────────┐
│ All phases completed (1-N, 1V-NV)                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ FINAL REVIEW (parallel - 3+ agents)                             │
│                                                                 │
│ Task(reviewer, "Final review: business logic vs Criteria")      │
│ Task(developer, "Final review: code quality vs References")     │
│ Task(tester, "Final review: test quality vs References")        │
│                                                                 │
│ Each gets ## K with all accumulated knowledge                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ All pass
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ FT-COORDINATOR (final)                                          │
│                                                                 │
│ 1. UPDATE TASK.md status → "finished"                           │
│                                                                 │
│ 2. GENERATE FINAL.md:                                           │
│    - Aggregate all phase summaries                              │
│    - Extract key knowledge (best practices, avoids)             │
│    - List all files created/modified                            │
│    - Calculate metrics (phases, iterations, agents, handoffs)   │
│                                                                 │
│ 3. UPDATE MANIFEST.md: final status                             │
│                                                                 │
│ Output:                                                         │
│ "Task completed:                                                │
│  - FINAL.md: .claude/tasks/reports/.../FINAL.md                 │
│  - Total phases: 5                                              │
│  - Total iterations: 8                                          │
│  - Knowledge extracted: 47 entries                              │
│  - Handoffs: 2"                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ RULES EXTRACTION (REQUIRED - last step)                         │
│                                                                 │
│ Call /focus-task-rules with KNOWLEDGE.jsonl path:               │
│                                                                 │
│ Skill(skill: "focus-task:rules",                                │
│   args: ".claude/tasks/{TIMESTAMP}_{NAME}_KNOWLEDGE.jsonl")     │
│                                                                 │
│ OR manual invocation:                                           │
│ /focus-task-rules .claude/tasks/{TS}_{NAME}_KNOWLEDGE.jsonl     │
│                                                                 │
│ What it does:                                                   │
│ 1. Read KNOWLEDGE.jsonl                                         │
│ 2. Extract ❌ entries → .claude/rules/avoid.md                   │
│ 3. Extract ✅ entries → .claude/rules/best-practice.md           │
│ 4. Dedupe, merge, optimize                                      │
│ 5. Keep max 20 rows per file                                    │
│                                                                 │
│ Output:                                                         │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ # Rules Updated                                             │ │
│ │                                                             │ │
│ │ | File | Added | Merged | Total |                           │ │
│ │ | avoid.md | 5 | 2 | 12 |                                   │ │
│ │ | best-practice.md | 8 | 3 | 15 |                           │ │
│ │                                                             │ │
│ │ Files: .claude/rules/avoid.md, best-practice.md             │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Stop hook → status == "finished" → allows stop                  │
│ Session ends cleanly                                            │
│                                                                 │
│ Knowledge now persisted in:                                     │
│ - .claude/rules/avoid.md      (anti-patterns for all sessions)  │
│ - .claude/rules/best-practice.md (patterns for all sessions)    │
│ - KNOWLEDGE.jsonl             (task-specific archive)           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Knowledge Flow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    KNOWLEDGE LIFECYCLE                           │
│                                                                  │
│  ┌──────────────┐                                               │
│  │  Work Agent  │ ──adds──▶ KNOWLEDGE.jsonl                     │
│  │  (developer) │           {"t":"✅","txt":"pattern X"}        │
│  └──────────────┘                                               │
│         │                          │                            │
│         │                          │                            │
│         ▼                          ▼                            │
│  ┌──────────────┐           ┌──────────────┐                    │
│  │ Coordinator  │           │  PreToolUse  │                    │
│  │              │           │    Hook      │                    │
│  │ • Reports    │           │              │                    │
│  │ • Checks dup │           │ • Reads      │                    │
│  │ • Recommends │           │ • Compresses │                    │
│  │   compaction │           │ • Injects    │                    │
│  └──────────────┘           │   ## K       │                    │
│         │                   └──────────────┘                    │
│         │ if duplicates > threshold                             │
│         ▼                                                       │
│  ┌──────────────┐                                               │
│  │  Knowledge   │                                               │
│  │  Manager     │                                               │
│  │              │                                               │
│  │ • Dedupe     │                                               │
│  │ • Merge      │                                               │
│  │ • Prioritize │                                               │
│  │ • Truncate   │                                               │
│  └──────────────┘                                               │
│         │                                                       │
│         │ also called by                                        │
│         ▼                                                       │
│  ┌──────────────┐                                               │
│  │  PreCompact  │ ──local compact──▶ KNOWLEDGE.jsonl (clean)    │
│  │    Hook      │                                               │
│  └──────────────┘                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files State Throughout Execution

| File | Created | Updated By | Contains |
|------|---------|------------|----------|
| `TASK.md` | /create | Manager, Coordinator | Phases, status, criteria |
| `KNOWLEDGE.jsonl` | /create | Agents, Coordinator, Hooks | ❌✅ℹ️ entries |
| `reports/MANIFEST.md` | /start | Coordinator | Index, handoff log |
| `reports/phase_N/iter_N_exec/` | Coordinator | Coordinator | Agent outputs |
| `reports/phase_N/iter_N_verify/` | Coordinator | Coordinator | Reviews, issues |
| `reports/FINAL.md` | Completion | Coordinator | Summary |
| `tasks/cfg/.focus-task.lock` | /start | Hooks | session_id, task_path |

---

## Agents Summary

| Agent | Model | When Called | What It Does |
|-------|-------|-------------|--------------|
| `developer` | sonnet | Phase N (exec) | Writes code |
| `tester` | sonnet | Phase NV, tests | Verifies tests |
| `reviewer` | sonnet | Phase NV, final | Checks quality |
| `ft-coordinator` | haiku | After each agent | Updates status, writes reports |
| `ft-knowledge-manager` | haiku | On duplicates, before handoff | Compacts knowledge |
| `Explore` | haiku | Research | Searches codebase (read-only) |
| `Plan` | - | Architecture | Plans approach |

---

## Hook Configuration

**File:** `hooks/hooks.json`

| Hook | Matcher | Timeout | Purpose |
|------|---------|---------|---------|
| PreToolUse | Task | 5s | Inject ## K knowledge |
| PostToolUse | Task | 30s | Remind coordinator |
| PreCompact | * | 60s | Validate, compact, handoff |
| Stop | * | 5s | Block if incomplete |

---

## Configuration

**File:** `.claude/tasks/cfg/focus-task.config.json`

```json
{
  "knowledge": {
    "maxEntries": 100,
    "maxTokens": 500,
    "priorities": ["❌", "✅", "ℹ️"]
  },
  "stop": {
    "maxAttempts": 20
  },
  "agents": {
    "system": ["ft-coordinator", "ft-knowledge-manager", "Explore", "Plan", "Bash", "general-purpose"],
    "work": ["developer", "tester", "reviewer", "sql_expert"]
  }
}
```

---

*Generated: 2026-01-27 | Version: 2.0.1*
