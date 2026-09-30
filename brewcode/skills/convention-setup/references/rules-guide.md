# Rules Guide

> Rule extraction, deduplication, and interactive organization from convention docs.

## 1. Rule Extraction Flow

Convention docs → scan sections → identify patterns/anti-patterns → classify → format

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

Comparison process: read all `.claude/rules/*.md` → compare each candidate against ALL existing entries semantically (same intent = duplicate) → consider: same class, same pattern, same "Instead" suggestion.

When merging (40-70% similar): keep existing rule number, expand "Instead" if new info available, add "Why" if missing, do NOT create duplicate entry.

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

| Rule Type | Stack | Target File |
|-----------|-------|-------------|
| avoid | Java | `java-avoid.md` |
| avoid | TypeScript | `typescript-avoid.md` |
| avoid | Python | `python-avoid.md` |
| avoid | Generic | `avoid.md` |
| best-practice | Java | `java-best-practice.md` |
| best-practice | TypeScript | `typescript-best-practice.md` |
| best-practice | Python | `python-best-practice.md` |
| best-practice | Generic | `best-practice.md` |

## 4. bc-rules-organizer Spawn

After all batches processed, spawn with accepted rules:

One organizer = ONE bounded unit: the accepted rules for ONE target file. Split an accepted set spanning several target files per target file; each unit stays within
~5 files / ~10 steps. Spawn all organizers in ONE message.
Main prepares required scaffolds before fan-out; `rules.sh create`/`create-specialized` create
pairs, so never run them inside a one-file organizer. Preserve existing files; if the briefed
target is still absent, return its path to main instead of creating an out-of-scope sibling.

> `${CLAUDE_PLUGIN_ROOT}` below is the brewcode plugin root. Expand it to the absolute path
> before spawning — bc-rules-organizer receives the prompt as plain text and cannot resolve it.

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
CONSUMER: unscoped .claude/rules/*.md loads at session start; path-scoped rules load when Read
      matches their glob. Rows must parse; do not promise every rule loads in every session.
      Format each rule in table row:
      avoid.md: | # | Avoid | Instead | Why |
      best-practice.md: | # | Practice | Context | Source |
      Source column: 'convention' for all extracted rules.
DONE: validate script passes; report as: file | rules added | rules merged | rules skipped, plus
      CHECKPOINT_REPORT and created/updated paths requesting optimization. Main owns P5 snapshots,
      RUN_DIR, optimizer fan-out and acceptance; never model-invoke a DMI skill or spawn optimizers.
")
```

## 5. CLAUDE.md Update Flow

Skip unless the user explicitly requested CLAUDE.md references, as convention-setup P7.5 requires.

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

3. Use Edit tool -- preserve ALL existing CLAUDE.md content. Keep concise: summary table + lazy-load ref only, no full patterns.
