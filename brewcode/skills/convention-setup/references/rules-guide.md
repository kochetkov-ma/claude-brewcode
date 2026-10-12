# Rules Guide

> Rule extraction, deduplication, and interactive organization from convention docs.

## 1. Rule Extraction Flow

| Source Section | Rule Type | Example |
|----------------|-----------|---------|
| Anti-Patterns table | avoid | "Avoid @Data on entities -- Use @Value @Builder" |
| Patterns section | best-practice | "Use @RequiredArgsConstructor + final fields for DI" |
| Naming Conventions | best-practice | "Controllers: *Controller suffix" |
| Constraints | avoid | "Avoid mutable DTOs -- Use records or @Value" |
| Quick Reference | best-practice | "New repository: copy from LoadsHistoryRepository" |

### Extraction Priority

| Priority | Source | Yield |
|----------|--------|-------|
| 1 | Anti-Patterns tables (all docs) | avoid rules |
| 2 | Patterns with "AVOID" or "PREFER" markers | avoid/bp rules |
| 3 | Naming Conventions tables | bp rules |
| 4 | Constraints sections | avoid rules |
| 5 | Evolution tables (e.g., DTO Evolution) | avoid + bp rules |

## 2. Duplicate Detection

| Similarity | Action |
|------------|--------|
| >70% | Skip -- already covered |
| 40-70% | Merge into existing entry (enhance description) |
| <40% | New rule candidate |

Compare each candidate semantically against every entry of every `.claude/rules/*.md` (same intent = duplicate: same class, pattern or "Instead"). Merging keeps the existing rule number, expands "Instead" with new info and adds a missing "Why"; it never creates a second entry.

## 3. Interactive Batching (AskUserQuestion)

Present 5-7 rules per batch:

```markdown
## Rules Batch {N}/{TOTAL}

| # | Type | Rule | Target File |
|---|------|------|-------------|
| 1 | avoid | `@Data` on entities -- use `@Value @Builder` | {stack}-avoid.md |
| 2 | bp | `@RequiredArgsConstructor` + final for DI | {stack}-best-practice.md |
| 3 | avoid | Mutable DTOs -- use records | {stack}-avoid.md |
| 4 | bp | Three-class test structure (Test+Expected+Requests) | {stack}-best-practice.md |
| 5 | bp | `.as()` on every AssertJ assertion | {stack}-best-practice.md |

Options: Accept all | Select by number (e.g., "1,3,5") | Skip batch | Stop
```

### Batching Strategy

| Total Rules | Batches | Per Batch |
|-------------|---------|-----------|
| 1-7 | 1 | All |
| 8-14 | 2 | 7 |
| 15-21 | 3 | 7 |
| 22+ | 4+ | 5-7 |

### Target File Selection

`java-avoid.md`, `java-best-practice.md`, `typescript-avoid.md`, `typescript-best-practice.md`,
`python-avoid.md`, `python-best-practice.md`; generic stack: `avoid.md`, `best-practice.md`.

## 4. bc-rules-organizer Spawn

After all batches, spawn one organizer per target file (its accepted rules = one bounded unit,
about 5 files / 10 steps), all in one message. Main prepares the scaffolds first:
`rules.sh create`/`create-specialized` create pairs, so never run them inside a one-file organizer. Preserve
existing files; a briefed target still absent goes back to main as a path, never an out-of-scope
sibling. Rule files are written into the project's `.claude/rules/`, copied, never symlinked from
outside the project: such a link needs the external-imports approval, and a path-scoped one never loads.

> `${CLAUDE_PLUGIN_ROOT}` below is the brewcode plugin root: replace it with the absolute path
> `SKILL.md` P7 gives before spawning; the organizer receives the prompt as plain text.

```
Agent(subagent_type="brewcode:bc-rules-organizer", prompt="
GOAL: this project's conventions were just extracted into .claude/convention/ docs; the rules the
      user accepted must land in .claude/rules/ so every later session picks them up automatically.
ROLE: own the briefed project rule file plus CHECKPOINT_REPORT only. Update PROJECT
      .claude/rules/ -- NEVER ~/.claude/rules/. No nested delegation.
      Do NOT touch .claude/convention/ docs, CLAUDE.md, or project source.
SCOPE: TARGET_RULE_FILE (one of .claude/rules/{stack}-avoid.md or
       .claude/rules/{stack}-best-practice.md; generic avoid.md / best-practice.md without a stack).
       Checkpoint/report: CHECKPOINT_REPORT, resolved by main under
       .claude/reports/YYYYMMDD-HHMMSS_rules-organizer/report.md; record each finished file immediately.
       Plugin templates: ${CLAUDE_PLUGIN_ROOT}/templates/rules/
       Validation: bash \"${CLAUDE_PLUGIN_ROOT}/skills/rules/scripts/rules.sh\" validate
       Main scaffold command only: bash \"${CLAUDE_PLUGIN_ROOT}/skills/rules/scripts/rules.sh\" create
       Out of bounds for writes: every other file, including optimizer snapshots.
CONTEXT: these rules already passed extraction from the convention docs, similarity dedup against
      the existing .claude/rules/*.md, and per-batch user approval -- do not re-judge them and do
      not invent extra rules. Still check for duplicates against the files on disk before writing;
      40-70% similar means merge into the existing numbered entry, not a new row.
      Accepted rules:
      {ACCEPTED_RULES_JSON}
CONSUMER: unscoped .claude/rules/*.md loads at session start; a path-scoped rule loads when Claude
      reads, writes or edits a matching file (incl. single-file cat/head in Bash). Rows must parse;
      do not promise every rule loads in every session. Source column: 'convention' for all
      extracted rules.
DONE: validate script passes; return your File | Paths | Change table and summary line, plus
      CHECKPOINT_REPORT and the written paths for optimization. Main owns P5 snapshots,
      RUN_DIR, optimizer fan-out and acceptance; never model-invoke a DMI skill or spawn optimizers.
")
```

## 5. CLAUDE.md Update Flow

Run only from convention-setup P7.5, when the user explicitly requested CLAUDE.md references.

1. AskUserQuestion: "Add etalon quick-reference table to project CLAUDE.md?"
   - **A:** "Yes -- add etalon table + lazy-load refs"
   - **B:** "No -- skip CLAUDE.md update"

2. If yes: read project `CLAUDE.md` → find/create `## Reference Patterns & Etalon Classes` section → add/update:

```markdown
## Reference Patterns & Etalon Classes
> **Full doc**: `.claude/convention/reference-patterns.md` (lazy-load when writing new code)

| When writing... | Copy from (etalon) |
|-----------------|---------------------|
| New controller | `{ClassName}` -- {key traits} |
| New repository | `{ClassName}` + `{SupportClass}` -- {key traits} |
| New service | `{ClassName}` -- {key traits} |

### DTO Evolution (prefer top)
1. **{preferred style}** -- PREFER for new code
2. **{established style}** -- OK for complex entities
3. **{legacy style}** -- AVOID
```

3. Edit only, preserving all existing CLAUDE.md content: summary table + lazy-load ref, no full patterns.
