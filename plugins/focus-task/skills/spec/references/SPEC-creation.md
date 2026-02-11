# SPEC Creation Reference

## Parallel Research Instructions

### Agent Selection

| Area Type | Agent | Focus |
|-----------|-------|-------|
| Architecture | Plan | Patterns, layers, dependencies |
| Business logic | developer | Services, controllers, flows |
| Data layer | developer | Repos, entities, migrations |
| Testing | tester | Coverage, frameworks, patterns |
| Quality | reviewer | Code quality, security, performance |
| Documentation | Explore | Existing docs, READMEs, comments |
| External deps | Explore | Libraries, APIs, integrations |

### Research Prompt Template

```
Task(subagent_type="{AGENT}", model="sonnet", prompt="
AREA: {AREA_NAME}
TASK: {TASK_DESCRIPTION}
FILES: {GLOB_PATTERN}

Analyze this area. Output:

## Findings
- Key patterns discovered
- Reusable components identified
- Integration points

## Assets (table)
| File | Purpose | Reuse Potential |
|------|---------|-----------------|

## Risks
- Technical risks
- Integration risks
- Knowledge gaps

## Recommendations
- Approach suggestions
- Files to study further
- Questions for user

NO large code blocks. Use file:line references.
")
```

### Parallel Execution Rules

1. **ONE message** with 5-10 Task calls
2. Each agent targets specific area (no overlap)
3. All agents use `model="sonnet"` for speed
4. Collect all responses before consolidation

### Area Partitioning

| Project Type | Suggested Areas |
|--------------|-----------------|
| Backend API | controllers, services, repositories, config, tests |
| Frontend | components, pages, hooks, state, styles, tests |
| Full-stack | api, frontend, shared, database, infra, tests |
| Library | core, utils, types, examples, tests |
| CLI tool | commands, utils, config, tests |

---

## Consolidation Rules

### Merging Agent Findings

1. **Deduplicate** - Same finding from multiple agents → keep one with most detail
2. **Categorize** - Group by SPEC section (Overview, Requirements, Architecture, etc.)
3. **Prioritize** - Risks and blockers first, nice-to-haves last
4. **Resolve conflicts** - If agents disagree, note both perspectives

### SPEC Section Mapping

| Agent Output | SPEC Section |
|--------------|--------------|
| Architecture patterns | ## Architecture |
| Business logic flows | ## Requirements |
| Data models | ## Data Model |
| Test patterns | ## Testing Strategy |
| Quality concerns | ## Risks |
| Integration points | ## Dependencies |
| Recommendations | ## Implementation Notes |

### Research Table Format

Include in SPEC after consolidation:

```markdown
## Research Summary

| Area | Agent | Key Findings | Files Analyzed |
|------|-------|--------------|----------------|
| Controllers | developer | REST patterns, validation | src/controllers/*.java |
| Services | developer | Transaction handling | src/services/*.java |
| Tests | tester | JUnit 5, MockMvc | src/test/**/*.java |
```

### Quality Checklist

Before finalizing SPEC:

- [ ] All areas covered by at least one agent
- [ ] No contradicting information unresolved
- [ ] Risks have proposed mitigations
- [ ] Requirements are measurable/verifiable
- [ ] Dependencies explicitly listed
- [ ] file:line references are valid

---

## Error Handling

| Error | Recovery |
|-------|----------|
| Agent timeout | Retry with smaller scope |
| Empty findings | Check glob pattern, try Explore agent |
| Conflicting info | Note both, ask user in Step 6 |
| Missing area | Add another Task call for that area |
