# Task Board Setup

Install a file-based task board with domain methodology, per-task review and test plans,
a derived task graph, and session anti-drift timers. An optional spec/design layer supports
tasks that need explicit product or architecture decisions.

## Quick start

```text
/brewtools:task-board-setup status
/brewtools:task-board-setup install
/brewtools:task-board-setup install /path/to/repo
/brewtools:task-board-setup upgrade /path/to/repo
```

An existing board defaults to status; a fresh target defaults to install. Supply a free-text
directive to steer analysis. The generator analyses domains, source exclusions, existing task
documents, project agents, and review/check conventions; confirms findings; generates the
machinery; and migrates legacy task documents through bounded owners. It never commits.

Use the generated `/task-board` afterwards. Task-tracker owns task records, transitions, backlog
grooming, and board/graph reconciliation; it writes only under `.claude/features/**`.

## Installed system

| Artifact | Purpose |
|----------|---------|
| `.claude/agents/task-tracker.md` | Board curator |
| `.claude/skills/task-board/SKILL.md` | View, add, move, backlog, and groom flows; main-session timer ownership |
| `.claude/rules/tasks.md` | Task lifecycle and progress instructions |
| `.claude/features/board.md` | Canonical task list and status counts |
| `.claude/features/METHODOLOGY.md` | Shared domain review strategy and reliable checks |
| `.claude/features/ANTI-DRIFT.md` | Tick prompts, reconciliation, scheduling, and reporting contract |
| `.claude/features/task-graph.md` | Derived work units, owners, dependencies, and evidence |
| `.claude/features/PROGRESS.md` | Current session progress |
| Tracker, index, task template, and status folders | Task records under backlog, todo, progress, and closed |
| Optional task-spec skill and spec templates | Product and design specifications |

There are **12 stamped control artifacts when the spec layer is present**, including the three
methodology/anti-drift/graph controls. Task templates and individual task cards have their own
task schema and are not restamped as generated controls. Upgrade refreshes control provenance
separately from task decisions, prompts, runtime state, and evidence.

## Methodology before implementation

Shared methodology comes from the domain's risks, authoritative repository instructions, review
strategy, and actual check commands. Every accepted task is written in advance with its own
Methodology, base work units, owners, dependencies, acceptance criteria, parent id when relevant,
and complete unique Anti-drift cron prompt. Queued accepted tasks retain prepared prompts;
raw backlog ideas need not become work units until accepted.

The baseline work is: confirm goal/scope and latest corrections; assign bounded work; implement;
simplify; review correctness/safety, then clarity and missing validation; run reliable checks;
reconcile records and evidence; stop the task's timer when finished or cancelled. Each task
specializes this method instead of copying an unrelated task's test strategy.

## Session anti-drift

**Prepare every task; schedule when it becomes active.**

The main session's task-board flow owns one live session timer per active top-level task,
hourly by default (`0 * * * *`). Your cadence override or opt-out takes precedence. Child work
units use their parent's timer. Task-tracker returns timer actions to the main session rather
than creating timers from a child agent.

Task-board lists timers first, matches task id and absolute project root, and reconciles only
this task's timer. It announces effective cadence, timezone, confirmed id/state, known first
due time, session scope, and stop/change controls. Native scheduling tools must be available;
otherwise it saves intent and reports that scheduling is unavailable.

Each delivered tick:

- Rereads shared/task methodology, anti-drift, goal/spec, user corrections, and task records.
- Requests concise owner evidence and reconciles statuses, dependencies, counts, and next work.
- Rebuilds the graph with every unfinished node and the latest ten completed nodes; preserves older completion evidence in task Notes or closed records before pruning graph rows.
- Checks drift against goal and acceptance criteria, corrects deviations within scope, quantifies remaining work or marks it unknown, and advances unblocked authorized work.
- Records actual receipt time and delivered tick number, then reports at most five short lines.

```text
🔵 TASK-ID · HH:MM timezone · tick N · elapsed
🟢 Achievements supported by evidence
🔵 Remaining work / next action
🔴 Present problems / blockers / user questions
⚪ Drift verdict / correction / check unavailable
```

Omit empty rows; detailed evidence stays in task records. Completion, cancellation, or parking
stops this task's timers and verifies their absence. Failed cleanup stays a reported gap.
Resume rechecks live scheduling state. Saved ids are not proof of a live timer.

Timers belong to the session. Scheduling is approximate; due time, firing, and receipt are
distinct. Persisted task records do not guarantee delivery after session closure.

## Planning

Plan mode remains read-only. Include task methodology, base work, graph reconciliation, saved
prompt, timer execution step, and a final PROGRESS refresh. Create or delete timers and write
records only during authorized execution. Delivered ticks during planning report proposed
reconciliation. A task-board view reports state without scheduling.

The plugin's standalone `+++` codeword adds this planning requirement only when its hook payload
confirms Plan mode; it does not need `++m`.

## Optional spec/design layer

Spec generation is independent of baseline methodology, graph, progress, and anti-drift controls.
With specs enabled, `/task-spec <ID>` generates product and design documents through domain agents.
Task scope, decisions, open questions, and coverage remain explicit; blocking questions prevent
closing unless an explicit waiver is recorded. Changing scope requires spec refresh.

Installation asks whether to enable this layer. Upgrade adds missing controls and can retrofit
the spec layer, preserving task ids and user content. Existing-file changes are shown for approval;
task-specific methodology and saved prompts are not replaced.

## Lifecycle

| Mode | Behavior |
|------|----------|
| `status` | Read-only inventory |
| `install` | Generate into a fresh target; refuse an existing board |
| `upgrade` | Add missing layers and refresh generated controls on an existing board |
| `enable` / `disable` | Restore or park discovery entries without deleting task data |
| `uninstall` | Remove generated machinery; retain task records |
| `purge` | Remove machinery and task data under .claude/features |

An optional, explicitly accepted CLAUDE.md optimization pass is separate from board generation.
Removing the board does not reverse those accepted edits.

## Related

- [Brewtools overview](../../README.md)
- [Skill source](SKILL.md)
- [Methodology and timer contract](references/11-methodology-cron.md)
- [Upgrade procedure](references/10-upgrade.md)
- [Full documentation](https://doc-claude.brewcode.app/brewtools/skills/task-board-setup/)
