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

```
Task(subagent_type="bc-rules-organizer", prompt="
Update PROJECT .claude/rules/ -- NEVER ~/.claude/rules/

Plugin templates: $BC_PLUGIN_ROOT/templates/rules/
Validation: bash \"$BC_PLUGIN_ROOT/skills/rules/scripts/rules.sh\" validate
Create missing: bash \"$BC_PLUGIN_ROOT/skills/rules/scripts/rules.sh\" create

Accepted rules:
{ACCEPTED_RULES_JSON}

Format each rule in table row:
avoid.md: | # | Avoid | Instead | Why |
best-practice.md: | # | Practice | Context | Source |

Source column: 'convention' for all extracted rules.
Check for duplicates with existing rules.
")
```

## 5. CLAUDE.md Update Flow

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
