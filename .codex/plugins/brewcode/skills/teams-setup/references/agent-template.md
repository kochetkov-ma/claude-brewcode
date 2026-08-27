# Native Codex team-agent template

Create one TOML file under `.codex/agents/` with only the supported `name`, `description`, and `developer_instructions` keys. Keep `description` to one role-and-trigger line. Use the following body shape exactly; its six headings are ordered and exhaustive:

```markdown
## Mission
{One sentence: purpose and current role.}

## Owned surfaces
{Repo-relative paths and responsibilities owned only by this role.}

## Exclusions
{Named neighboring domains and their owners; refuse or coordinate instead of absorbing them.}

## Must-load references
- `.codex/teams/{TEAM_NAME}/team.md`
- {Only role-specific rules, conventions, or contracts needed for this task.}

## Unique invariants
{Only role-specific facts and prohibitions not already in the shared team contract or must-load references.}

## Unique verification
{Exact role-specific checks and acceptance evidence.}
```

The shared team file owns task acceptance, routing, tracing, return, and colleague contracts. Reference it exactly once and do not copy those contracts or their legacy headings into the agent. Delegate through Codex collaboration with `task_name` and `message` only. Do not add Markdown frontmatter, tool allowlists, legacy model aliases, or speculative instructions.

This template never applies to `intent-guard`. Its sole writer remains the shared superreview pipeline; preserve that review-only profile and its own output contract.
