# Default Protocols

Default protocols per document type. Override: add `auto-sync-protocol: <name>` to frontmatter.

## Skill Protocol

Skills (SKILL.md) with `name: focus-task:*` or `name: <project>:*` in frontmatter.

### Sources

| Priority | Source | Description |
|----------|--------|-------------|
| 1 | Official docs | Claude Code documentation site |
| 2 | GitHub issues | Anthropics/claude-code repo issues |
| 3 | Changelog | Release notes, version history |
| 4 | Related skills | Similar skills in same plugin |

### Research Blocks

```markdown
<!-- auto-sync:research
sources:
  - url: https://docs.anthropic.com/claude-code/skills
    selector: "#skill-format"
  - search: "claude code skill format {year}"
    limit: 3
-->
```

### Update Rules

| Trigger | Action |
|---------|--------|
| Official docs change | Update syntax, add new features |
| Breaking change | Bump version, add migration notes |
| Deprecation | Add warning, suggest alternative |
| Bug fix in Claude | Remove workarounds |

### Version Bumping

- **Patch** (1.0.x): Typos, clarifications, formatting
- **Minor** (1.x.0): New features, additional examples
- **Major** (x.0.0): Breaking changes, restructured format

---

## Agent Protocol

Agents with frontmatter: `tools:` AND `model:`.

### Sources

| Priority | Source | Description |
|----------|--------|-------------|
| 1 | Model changelog | Anthropic model updates |
| 2 | Tool docs | MCP tool documentation |
| 3 | Best practices | Agent design patterns |
| 4 | Performance data | Token usage, response quality |

### Research Blocks

```markdown
<!-- auto-sync:research
sources:
  - url: https://docs.anthropic.com/claude/models
    selector: "#model-comparison"
  - search: "claude {model} capabilities {year}"
    limit: 2
-->
```

### Update Rules

| Trigger | Action |
|---------|--------|
| New model release | Evaluate model upgrade |
| Tool API change | Update tool names, parameters |
| Token limit change | Adjust context management |
| New capability | Add to agent if relevant |

### Version Bumping

- **Patch**: Prompt tweaks, better examples
- **Minor**: New tools added, model upgrade
- **Major**: Complete prompt rewrite, agent purpose change

---

## Doc Protocol

Documentation with `auto-sync: enabled` in frontmatter.

### Sources

| Priority | Source | Description |
|----------|--------|-------------|
| 1 | Linked URLs | URLs in document body |
| 2 | Related docs | Same directory/topic |
| 3 | Web search | Topic + year search |
| 4 | Codebase | Implementation details |

### Research Blocks

```markdown
<!-- auto-sync:research
sources:
  - url: https://example.com/docs
    selector: "article"
  - search: "{topic} documentation {year}"
    limit: 5
  - codebase: "src/**/*.java"
    pattern: "class.*implements"
-->
```

### Update Rules

| Trigger | Action |
|---------|--------|
| Source URL 404 | Find new source, mark stale |
| Content drift >30% | Major review needed |
| New version released | Update version references |
| API change | Update code examples |

### Version Bumping

- **Patch**: Link fixes, typo corrections
- **Minor**: New sections, updated examples
- **Major**: Complete rewrite, topic expansion

---

## Rule Protocol

Rules in `/rules/` directories.

### Sources

| Priority | Source | Description |
|----------|--------|-------------|
| 1 | KNOWLEDGE.jsonl | Accumulated project knowledge |
| 2 | Code analysis | Static analysis findings |
| 3 | Test failures | Common error patterns |
| 4 | Team conventions | Style guides, agreements |

### Research Blocks

```markdown
<!-- auto-sync:research
sources:
  - knowledge: ".claude/tasks/*_KNOWLEDGE.jsonl"
    filter: "scope:global"
  - codebase: "src/**/*.java"
    antipatterns: true
-->
```

### Update Rules

| Trigger | Action |
|---------|--------|
| New KNOWLEDGE entry | Evaluate for promotion to rule |
| Rule violation >3x | Increase rule priority |
| Rule never triggered | Consider removal |
| Conflicting rules | Merge or prioritize |

### Version Bumping

- **Patch**: Rule clarification, better examples
- **Minor**: New rules added, categories updated
- **Major**: Rule restructure, breaking changes

---

## Custom Protocol

Custom protocols: create `references/protocol-<name>.md`.

### Template

```markdown
# Protocol: <name>

## Sources
[Define source priorities]

## Research Blocks
[Define research block format]

## Update Rules
[Define triggers and actions]

## Version Bumping
[Define versioning strategy]
```

Reference in frontmatter:

```yaml
---
auto-sync: enabled
auto-sync-protocol: <name>
---
```
