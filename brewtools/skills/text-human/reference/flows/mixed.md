# Flow: mixed (dispatcher)

Git commit OR folder with heterogeneous files. Split into blocks, route each file to its correct flow's rules, run parallel sub-agents, aggregate.

## When this flow is chosen
- Scope is a 7+ hex git commit hash.
- Scope is a folder containing more than one file type.
Single file -> do NOT use mixed; pick the file's own flow and process directly.

## Phase 1 -- scope analysis

### Commit mode
Process all text files from the commit. No extension filtering at listing time:
`git diff --name-only <hash>^..<hash>`

### File inclusion
| Include | Exclude |
|---------|---------|
| Source (`*.java`, `*.kt`, `*.py`, `*.ts`, `*.js`, `*.go`, `*.rs`, ...) | Binary (`*.class`, `*.pyc`, `*.exe`) |
| Config (`*.xml`, `*.yaml`, `*.yml`, `*.json`, `*.toml`) | Images (`*.png`, `*.jpg`, `*.gif`, `*.ico`) |
| Docs (`*.md`, `*.mdx`, `*.rst`, `*.txt`) | Archives (`*.zip`, `*.tar`, `*.gz`) |
| Build (`pom.xml`, `package.json`, `pyproject.toml`) | Generated (`target/`, `build/`, `dist/`, `node_modules/`, `__pycache__/`) |
| SQL (`*.sql`, `*.ddl`) | Lock files, IDE files |

### Path mode
`find <path> -type f \( -name "*.java" -o -name "*.py" -o -name "*.ts" -o -name "*.js" -o -name "*.md" \) | grep -v -E "(target/|node_modules/|\.git/|build/|dist/|__pycache__/)" || true`

### Block count
| Files | Lines | Blocks |
|-------|-------|--------|
| 1-2 | <200 | 1 (direct) |
| 3-5 | <500 | 3 |
| 6-10 | 500-1500 | 5 |
| 11-20 | 1500-3000 | 7 |
| 21+ | 3000+ | 10 |

## Phase 2 -- classify each file to a flow + model
Per file, pick the sub-flow (its rules apply inside the block):
- code extensions, docstrings, JavaDoc -> code flow (`@reference/flows/code.md`)
- README/docs/guide/changelog/PR/commit text -> docs flow (`@reference/flows/docs.md`)
- long-form essay/blog `.md`/`.mdx` -> article flow (`@reference/flows/article.md`)
- chat/forum dumps -> social flow (`@reference/flows/social.md`)

Model split:
- haiku (simple): config (`*.properties`, `*.yaml`, `*.toml`, `*.ini`), data (`*.json`, `*.csv`), text (`*.txt`, `*.md`), single-statement SQL, files <50 lines no logic.
- sonnet (complex): source with logic, tests, complex SQL (CTEs/windows/JOINs), config classes.

## Phase 3 -- block formation
Group by type and complexity (avoid mixing haiku/sonnet in one block), balance line count, keep related files together (same package/dir). Data-file block (YAML/JSON/CSV with comments) -> haiku for unicode fixes.

## Phase 4 -- parallel execution
Launch ALL Task calls in a single message for true parallelism. Each block prompt states its files, the sub-flow each file uses, the two-pass rules, and requests JSON.

```
Task(subagent_type="developer", model="haiku", prompt="> BT_PLUGIN_ROOT is in your context (pre-task.mjs).\n[CUSTOM_INSTRUCTIONS_IF_ANY]\nBlock 1 files: [...]. Per file apply its flow rules from $BT_PLUGIN_ROOT/skills/text-human/reference/flows/<flow>.md plus ai-patterns.md / human-patterns.md. Two-pass: STRIP then gated INJECT. Return JSON.")
Task(subagent_type="developer", model="sonnet", prompt="> BT_PLUGIN_ROOT is in your context (pre-task.mjs).\n[CUSTOM_INSTRUCTIONS_IF_ANY]\nBlock 2 files: [...]. Same rules. Return JSON.")
```

If a custom prompt was provided, prepend to EVERY sub-agent prompt after the context line:
```
CUSTOM INSTRUCTIONS (highest priority, override defaults):
<user prompt text>
---
```

JSON output per agent:
```
{
  "files_processed": N,
  "changes": [{"file": "path", "flow": "code|docs|article|social", "stripped": N, "injected": N, "surfaced": N}],
  "surfaced_for_review": [{"file": "path", "line": N, "issue": "..."}]
}
```

## Phase 5 -- aggregation
Collect JSON from all agents -> merge stats -> unified Humanization Report (see SKILL.md report format). Surface every `surfaced_for_review` item; never auto-applied.

## Error handling
| Error | Action |
|-------|--------|
| Agent timeout | Continue with other blocks |
| File read error | Skip, note in report |
| Binary file | Skip, note in report |
| No changes | Report "No humanization required" |
