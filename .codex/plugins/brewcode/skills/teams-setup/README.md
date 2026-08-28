# Teams for Codex

Creates and manages project teams backed by native TOML agents in `.codex/agents/` and one shared roster/trace contract in `.codex/teams/<name>/`.

## Modes

| Mode | Effect |
|---|---|
| `status` | Read-only roster, trace, health, policy, and verifier report. |
| `install` | Analyze the project, obtain approval for the final roster, create agents, and run independent review. |
| `upgrade` | Migrate the shared contract, analyze trace evidence, obtain approval for roster actions, and re-review touched agents. |
| `enable` / `disable` | Restore or park domain `.toml` files byte-identically. |
| `uninstall` | Interactive cleanup through `references/cleanup-flow.md`; keep shared or declined artifacts. |
| `purge` | Confirmed removal of owned domain agents and the selected team directory. |

With no explicit mode, an existing team resolves to `status`; otherwise the workflow resolves to `install`. Every mutation shows a plan and requires approval before writing.

## Native artifacts

```text
.codex/
  agents/
    domain-owner.toml
    domain-owner.toml.disabled
    intent-guard.toml
  teams/<name>/
    team.md
    trace.jsonl
    trace-ops.sh
```

Domain TOML contains only `name`, `description`, and `developer_instructions`; every live or parked domain description is one nonempty line of at most 100 characters. The instructions use the six ordered headings documented in `references/agent-template.md`; shared acceptance, routing, tracing, return, and colleague rules live once in `team.md`. The report root comes from applicable project guidance (default `.codex/reports`), uses only `[A-Za-z0-9._-]+` non-dot segments, and fails closed on equal-specificity conflicts. Required policy names its shared review-only guard exactly once, including same-line occurrence counting; legacy-absent names no phantom guard. The full roster stays within 2800 characters / 700 estimated tokens, and each domain `developer_instructions` stays within 3200 UTF-8 bytes / 800 estimated tokens.

New teams use one review-only `intent-guard` outside the domain count. Its shared native emitter validates the template, reuses an approved existing non-symlink regular file byte-identically, or atomically publishes an absent target without replacement. Invalid regular files, symlinks, nonregular targets, and lost concurrent creates fail without mutation. It is never a domain owner, reviewer, parked member, or cleanup target.
