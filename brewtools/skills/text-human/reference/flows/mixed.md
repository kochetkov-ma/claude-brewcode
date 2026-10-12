# Flow: mixed (dispatcher)

Scope is a 7+ hex git commit hash or a folder with more than one file type: split into blocks, route
each file to its flow's rules, run parallel agents, merge. A single file never uses mixed: it takes
its own flow, processed directly.

## Phase 1 -- scope analysis

### Commit mode
Commit mode is current-worktree mode: the hash selects file names only; every edit lands on today's
content at that path, not on the historical blob. State it in the `PLAN` block's SCOPE so the user
reads it before the first edit. Historical content is not offered: the user runs
`git show <hash>:<path>` by hand.

List the names, no extension filtering: `git diff --name-only <hash>^..<hash>`. Run the SKILL.md
Phase 0.5 gate over exactly those paths before any agent is spawned. A path changed since `<hash>`
but committed is fine: the current-worktree semantic is announced up front.

### File inclusion
| Include | Exclude |
|---------|---------|
| Source (`*.java`, `*.kt`, `*.py`, `*.ts`, `*.js`, `*.go`, `*.rs`, ...) | Binary (`*.class`, `*.pyc`, `*.exe`) |
| Config (`*.xml`, `*.yaml`, `*.yml`, `*.json`, `*.toml`) | Images (`*.png`, `*.jpg`, `*.gif`, `*.ico`) |
| Docs (`*.md`, `*.mdx`, `*.rst`, `*.txt`) | Archives (`*.zip`, `*.tar`, `*.gz`) |
| Build (`pom.xml`, `package.json`, `pyproject.toml`) | Generated (`target/`, `build/`, `dist/`, `node_modules/`, `__pycache__/`) |
| SQL (`*.sql`, `*.ddl`) | Lock files, IDE files |

### Path mode
List files under `<path>` per the inclusion table; skip `.git/` and the generated dirs.

### Block count
| Files | Lines | Blocks |
|-------|-------|--------|
| 1-2 | <200 | 1 (direct) |
| 3-5 | <500 | 3 |
| 6-10 | 500-1500 | 5 |
| 11-20 | 1500-3000 | 7 |
| 21+ | 3000+ | 10 |

## Phase 2 -- classify each file to a flow + model
Per file, pick the sub-flow whose rules apply inside the block: code extensions, docstrings, JavaDoc
-> code; README/docs/guide/changelog/PR/commit text -> docs; long-form essay/blog `.md`/`.mdx` ->
article; chat/forum dumps -> social. Rules file: `reference/flows/<flow>.md`.

Model split:
- haiku (simple): config (`*.properties`, `*.yaml`, `*.toml`, `*.ini`), data (`*.json`, `*.csv`), text (`*.txt`, `*.md`), single-statement SQL, files <50 lines no logic.
- sonnet (complex): source with logic, tests, complex SQL (CTEs/windows/JOINs), config classes.

## Phase 3 -- block formation
Group by type and complexity (avoid mixing haiku/sonnet in one block), balance line count, keep related files together (same package/dir). Data-file block (YAML/JSON/CSV with comments) -> haiku for unicode fixes.

## Phase 4 -- parallel execution
One brief per block in the SKILL.md Delegation shape, all spawned in one message, `model="haiku"` or
`model="sonnet"` per Phase 2. Each brief names the block's files, each file's sub-flow, its rule files
as absolute paths (`reference/flows/<flow>.md`, `ai-patterns.md`, `human-patterns.md` under the skill
dir SKILL.md Phase 1 gives), the two passes (STRIP, then gated INJECT) and the custom-instructions
block, if any.

JSON output per agent:
```
{
  "files_processed": N,
  "changes": [{"file": "path", "flow": "code|docs|article|social", "stripped": N, "injected": N, "surfaced": N}],
  "surfaced_for_review": [{"file": "path", "line": N, "issue": "..."}]
}
```

## Phase 5 -- aggregation
Merge every agent's JSON into the SKILL.md Humanization Report; list every `surfaced_for_review`
item, never apply it. Failures follow the SKILL.md error table.
