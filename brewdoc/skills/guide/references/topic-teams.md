# Topic 4: Dynamic Teams

Domain: Core Workflow

## Section 1: What Are Teams?

Teams are collections of 5-20 domain-specific agents tailored to YOUR project.

| Property | Description |
|----------|-------------|
| Project-specific | Agents understand your codebase, patterns, conventions |
| Self-evolving | Agents update as the project evolves |
| Traced | Every action logged for accountability |
| Managed | Created and maintained via `/brewcode:teams` |

Unlike generic agents (developer, tester, reviewer), team agents know your domain: your database schema, your API patterns, your frontend components. They are created by analyzing your actual codebase.

## Section 2: Creating a Team

```bash
# Analyze project and create team
/brewcode:teams create

# Create with custom name
/brewcode:teams create backend-team

# Create with specific focus
/brewcode:teams create "focus on API layer and database"
```

Creation process:

| Step | What happens |
|------|-------------|
| 1 | Skill analyzes project structure, languages, frameworks |
| 2 | Proposes team roster (5-20 agents with roles) |
| 3 | User approves or modifies via interactive prompts |
| 4 | Creates agent `.md` files in `.claude/agents/` |
| 5 | Sets up trace tracking in `.claude/teams/{name}/` |

Each agent gets a dedicated markdown file with:
- Role description and responsibilities
- Project-specific knowledge (files, patterns, conventions)
- Tool permissions and constraints
- Interaction rules with other team agents

Reference `Diagram: Teams Architecture` from ascii-diagrams.md.

## Section 3: Team Management

```bash
# Check team status and health
/brewcode:teams status

# Update agents based on project changes
/brewcode:teams update

# Clean up team files
/brewcode:teams cleanup
```

| Command | When to use |
|---------|-------------|
| `status` | See which agents exist, their roles, last activity |
| `update` | After significant project changes (new modules, refactoring) |
| `cleanup` | Remove stale agents, reset traces |

Updates re-analyze the codebase and adjust agent knowledge. New files, changed patterns, or removed modules are reflected in agent definitions.

## Section 4: Trace Tracking

Every agent action is logged to `trace.jsonl` in the team directory.

```
.claude/teams/{name}/
  trace.jsonl          # action log
  roster.json          # agent definitions
  verification/        # integrity checks
```

Trace enables:

| Capability | Description |
|------------|-------------|
| Accountability | Which agent did what, when |
| Performance | How well each agent performed |
| Evolution | Underperforming agents get updated |
| Debugging | Trace back through agent decisions |

Verification scripts ensure agent integrity — confirming that agent files match the roster and that no agents have been corrupted or accidentally modified.
