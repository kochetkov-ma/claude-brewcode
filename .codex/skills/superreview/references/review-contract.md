# Native review contract

## Scope and evidence

Resolve scope in this order: explicit whole-project request, explicit file/folder/revision/range, dirty working tree, recent commits. Derive the default branch from repository refs, not a hardcoded assumption; distinguish a branch comparison from a single-commit review. Include staged, unstaged, added, deleted, and untracked files. Inspect renamed/deleted paths through the selected diff and its base revision.

Use `git status --short`, `git diff`, and `git ls-files` for change discovery; use `rg --files --hidden` plus targeted filesystem checks for explicit instruction targets. Git ignore status is a discovery signal, never an exclusion from an explicitly requested scope. Include ignored instructions when they are an explicit target or needed authority; avoid broad traversal of secrets, runtime state, generated output, and caches. Record excluded paths and reasons; do not silently discard requested files. A broad repository dead-code/broken-reference audit follows the applicable explicit skill gate rather than expanding an ordinary review.

Freeze the selected diff/revisions and record relevant content hashes for untracked/ignored targets. Re-read cited lines before final validation; concurrent edits invalidate stale observations. Do not undo others' work. Read reachable implementation and callers beyond the target only to establish behavior, reuse, or absence; those reads do not widen finding targets.

Run applicable existing build/lint/type/test/validator commands once, using an isolated workspace where checks write generated files. Record command, working directory, revision, exit status, and useful output. Report absent/unavailable checks as not run; do not invent script names or conflate tooling failures with product defects. Execution confirms its observed result, not every proposed root cause. Avoid dependency installs, external writes, releases, or fixing files during review.

## Intent and scope procedure

1. Collect the latest explicit user request/corrections, linked task or issue acceptance criteria, approved decisions, and applicable project policy. Read external issue/PR data only when available and authorized; do not send messages or edit it. Newer explicit user scope overrides older plans. A plan is implementation guidance, not independent permission to expand the deliverable.
2. Build a compact requested-to-delivered map: requirement and source quote/location -> implementing path and behavior -> evidence -> delivered/partial/missing/unknown. Use optional task scope IDs only when they exist; specification coverage and execution status are different facts. Record accepted exclusions and named blockers without inventing criteria.
3. Compare the delivered diff against that map: extra behavior, unrelated refactoring/dependencies, shared contracts, other owners' surfaces, missing criteria, and unsupported completion claims. File overlap alone is not a defect. Required implementation/wiring/tests or explicitly authorized corrections are within scope; necessary but undocumented overlap is a recording concern, calibrated to its harm.
4. For alleged absence, quote the criterion and search concepts and synonyms across implementation, wiring, and tests, including relevant unchanged files. Preserve exact commands/results. An empty diff or one empty search is insufficient. Missing proof becomes an unknown or provisional concern, never a proved blocker.
5. If no sanctioned baseline is discoverable, label it UNKNOWN. Do not assert unauthorized scope or under-delivery at P0/P1 from guesses; cap scope-only concerns at P2. A whole-project review has no single-task delivery baseline: scope checks are informational unless a concrete requirement is supplied.
6. If a PR/closeout exists, compare its claims, issue-closing wording, remaining work, and validation with actual evidence. If absent, mark the check not applicable. Review never edits closeout records or asks for retroactive permission to make findings disappear.

## Passes and delegation

Simplification/reuse: search existing modules, stdlib, imported libraries, templates, and canonical contracts before proposing a new abstraction or duplicate removal. Cite the existing implementation and actual callers. Avoid cosmetic churn or hypothetical generalization.

Correctness/safety: examine behavioral regressions, input/output contracts, errors, persistence, auth/secret handling, concurrency assumptions, boundaries, and changed version pins. Severity follows reachable harm at the actual project scale; do not suppress non-P0 safety issues merely because older source guidance deprioritized security.

Maintainability/clarity: assess ownership, unnecessary complexity, explicit contracts, discoverability, documentation drift, and meaningful test evidence. Honor user focus and project-specific conventions without treating every convention breach as a blocker.

Select matching project reviewers before built-in `reviewer`, `architect`, or `tester` roles, using the live available roster. Use native `collaboration.spawn_agent` and message/wait tools when delegation is available and authorized. Available roles receive a task-specific read-only brief; no dedicated generic reviewer or intent agent is required. Read TOML role configuration with a TOML parser; never extract YAML frontmatter from it. Do not alter model/effort routing contrary to active policy.

Assign disjoint bounded file groups; cross-cutting intent/validation passes are overlays. Each brief includes GOAL, ROLE, exact SCOPE/out-of-scope, CONTEXT/parallel owners, CONSUMER, DONE, baseline sources, check results, this contract path, and the finding schema. Reviewers must not edit, redelegate, or perform Git writes. Report fallback/degraded coverage. If independent delegation is unavailable, perform a distinct second read-only verification pass and state that it is not independent agent validation.

## Findings and validation

Each candidate contains:

```json
{
  "id": "F1",
  "file": "relative/path",
  "lineStart": 1,
  "lineEnd": 1,
  "category": "intent|scope|logic|safety|architecture|reuse|complexity|pins|tests|clarity",
  "priority": "P0|P1|P2|P3",
  "severity": "blocker|critical|major|minor",
  "title": "Concrete problem",
  "claim": "Trigger, observed behavior, and violated requirement",
  "evidence": ["Source location/quote or exact command and result"],
  "impact": "Reachable consequence and assumptions",
  "suggestion": "Smallest adequate correction; existing path when reuse applies",
  "rule": null,
  "validation": "CANDIDATE|CONFIRMED|REJECTED|UNVALIDATED|CONFIRMED-BY-EXECUTION",
  "validationEvidence": []
}
```

P0/blocker: reachable outage, data loss, serious breach, or proven critical requirement failure. P1/critical: significant incorrect behavior or boundary violation. P2/major: material maintenance/reuse/scope/test gap. P3/minor: localized low-impact improvement. Cite a real rule ID only when present. Never invent code lines for absence: anchor to the relevant implementation boundary or explicitly identify a requirement source and unavailable code location.

A validator who did not author a candidate independently re-reads its cited code, checks the claimed trigger and callers, seeks counterexamples/existing coverage, and verifies requirement authority and impact. Confirm, reject with reason, or mark UNVALIDATED. At QUICK, independently validate every P0/P1 and other material behavior/scope finding; identify any remaining coordinator-verified suggestions. At EXTENDED every candidate requires independent validation. A majority is neither proof nor grounds to suppress a valid minority finding; retain confirmed evidence regardless of vote counts. Optional quorum/critic requests add independent perspectives within resource limits, not an acceptance threshold.

Merge only the same root cause/trigger and affected behavior; nearby lines alone do not make findings duplicates. Preserve strongest supported evidence, all affected locations, provenance, and validation. Keep unresolved candidates separate from confirmed findings. An unvalidated material candidate makes the review incomplete; no silent dropping or clean verdict. Gate failures retain execution evidence, while causal explanations still need validation.

The merged report records input, scope/revisions, depth, baseline, passes/agents, checks run/not run, requested-to-delivered coverage, confirmed findings sorted P0->P3, unresolved candidates, rejected findings with reasons, exclusions/limitations, and suggested next actions. Mention routing/gate/instruction drift as proposals only. Never repair the reviewer skill after a report. Report-only artifacts are the sole mutations authorized by this workflow.
