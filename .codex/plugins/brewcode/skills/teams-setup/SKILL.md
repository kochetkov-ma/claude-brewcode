---
name: teams-setup
description: "Creates and manages dynamic teams of domain agents. Triggers: create team, agent team, team status, cleanup team."
---

# Codex team coordination

Use collaboration agents only when the user or project instructions explicitly request a team. Split work into bounded independent tasks, keep one owner per file or surface, exchange evidence through collaboration messages, and synthesize results in the parent session. Do not invent unsupported agent parameters or create persistent team configuration unless requested.

<!-- brewcode-meta: version=6.1.4 content_version=6.1.0 generated_by=brewcode:teams-setup -->

## Native authority

Manage persistent project teams under `.codex/teams/{TEAM_NAME}/` and domain agents under `.codex/agents/`. Agent files are real TOML parsed with Python `tomllib`; never rename Markdown/YAML agents to `.toml`. Each team agent has exactly three top-level string keys: `name`, `description`, `developer_instructions`.

Resolve one mode: `status`, `install`, `upgrade`, `enable`, `disable`, `uninstall`, or `purge`. Read applicable `AGENTS.md`, inspect existing teams and agents, preserve unrelated files, and use only scripts/references shipped beside this skill. Never edit installed caches.

### C2.6: Shared Contract Bootstrap

Bootstrap happens before any team-owned `.codex/agents/{name}.toml` is written: instantiate the fenced template from `references/framework-files.md` and write `team.md` at `.codex/teams/{TEAM_NAME}/team.md` with metadata, `## Shared Agent Contract`, explicit `Intent guard` policy, and zero domain rows. Do not add domain-agent rows yet. Copy the project-local tracer, initialize trace storage, substitute every placeholder, then run `scripts/verify-team.sh`. **STOP on any failure. Do not spawn or write an agent.**

### C3: Agent Creation

Create each approved domain `.codex/agents/{name}.toml` from `references/agent-template.md`. Parse it structurally with `tomllib` and require only `name`, `description`, and `developer_instructions`. The `developer_instructions` value uses exactly these ordered headings and no others: `Mission`, `Owned surfaces`, `Exclusions`, `Must-load references`, `Unique invariants`, `Unique verification`. Its first must-load item is exactly `.codex/teams/{TEAM_NAME}/team.md`, occurring once. Enforce <=3200 UTF-8 bytes and `ceil(chars/4) <=800` over `developer_instructions` itself.

`intent-guard` is exempt from the six-heading domain profile. Under `required`, run `<plugin-root>/skills/superreview-setup/scripts/emit-intent-guard.sh <project-root>`; that sole shared writer create-only copies its native authority, structurally validates it, and never overwrites an existing file. Never ask agent-creator to write it. Under `legacy-absent`, create no row and no role.

### C4: Roster Finalization

After all intended agents validate, write the final roster. Declared `Agents` equals the number of unique domain rows; duplicate names fail. a new team defaults to `required`. Policy `required` has exactly one `intent-guard` row with fixed cells `--`, `Anti-drift check: what was ASKED vs what was DELIVERED`, `active`, team `Last update`, `review-only`, team `Version`. Policy `legacy-absent` has zero rows. the complete written `team.md` (metadata + shared contract + every row) MUST be <=2800 characters; `ceil(chars/4) <=700` estimated tokens. Measure the full substituted file, not the empty template.

### C8: Fix

Repair only failed owned artifacts. Domain agents come from `<skill-directory>/references/agent-template.md`; repair the shared contract before an agent rewrite. Preserve foreign agents and unrelated work. Re-run structural TOML, roster, policy, size, and shared-contract checks.

### C9: Re-verify

Run `scripts/verify-team.sh {TEAM_NAME}`, both test runners, and compatibility validation. Hard-gate `developer_instructions` only: <=3200 bytes and `ceil(chars/4) <=800`; `Mission`, `Owned surfaces`, `Exclusions`, `Must-load references`, `Unique invariants`, `Unique verification` in order with no other headings. `intent-guard` is exempt from this six-heading gate, not structural TOML validation.

> To skip review pipeline is not an acceptance path; unresolved checks remain failures.

### U1b: Shared Contract Migration Gate

On upgrade, insert the canonical block before `## Agents` and validate it before touching agents. Record an existing intent-guard roster row -> `required`; no row -> `legacy-absent`. Never synthesize the row on the latter path. Legacy agent bodies remain byte-identical during this gate. **No agent may be tuned, regenerated, stripped, or reformatted until the shared contract passes.** absence migrates
to `legacy-absent`; `legacy-absent` forbids that row and MUST NOT add the role during upgrade.

### U2: Analyze Performance

Use trace evidence only to decide whether a domain profile needs role-specific adjustment. Never duplicate the shared contract.

### U4: Apply Changes

Convert every touched Codex domain agent to the exact three-key TOML contract and six-heading `developer_instructions` shape. Parse before replacement, write atomically, parse again, and preserve untouched agents byte-identical.

For `enable` and `disable`, use `scripts/toggle-team.sh`; it parks/restores domain `.toml` files byte-identically and never parks `intent-guard`. For `uninstall` and `purge`, follow the shipped cleanup flow and explicit confirmation gates. Every mode ends with `verify-team.sh` and reports exact paths, counts, and failures.
