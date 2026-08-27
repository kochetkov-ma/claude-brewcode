---
name: teams-setup
description: "Creates and manages dynamic teams of domain agents. Triggers: create team, agent team, team status, cleanup team."
---

# Codex team coordination

Use collaboration agents only when the user or project instructions explicitly request a team. Split work into bounded independent tasks, keep one owner per file or surface, exchange evidence through collaboration messages, and synthesize results in the parent session. Do not invent unsupported agent parameters or create persistent team configuration unless requested.

<!-- brewcode-meta: version=6.1.4 content_version=6.1.0 generated_by=brewcode:teams-setup -->

## Native authority

Manage persistent project teams under `.codex/teams/{TEAM_NAME}/` and agents under `.codex/agents/`. Domain agents are native TOML parsed with Python `tomllib`, never renamed Markdown. Each has exactly the three string keys `name`, `description`, and `developer_instructions`. Read applicable `AGENTS.md`, preserve unrelated files, use only adjacent scripts/references, and never edit installed caches.

## Invocation and approval

Resolve exactly one mode in this order: `status`, `install`, `upgrade`, `enable`, `disable`, `uninstall`, `purge`. An explicit mode wins. With no mode, choose `status` when the named team exists; otherwise choose `install` and team name `default` only when no name was supplied. Invalid detector output stops the run.

Before any action, print one `PLAN — brewcode:teams-setup` block with `INPUT`, resolved `MODE` and reason, `SCOPE` (team, roster, exact paths), `DO`, and `RESULT`. `status` asks nothing. Every mutating mode requires `request_user_input` approval after the plan and before the first write; changed scope requires a revised plan and approval. Destructive modes additionally name every deletion.

Run `scripts/detect-mode.sh`, inventory `.codex/teams/` and `.codex/agents/`, read an existing roster/trace, and run `scripts/verify-team.sh {TEAM_NAME}` when the team exists. A missing team stops every mode except `install`; an existing team stops `install` unless the user approves routing to `upgrade`.

## Mode: status

Read `team.md` and `trace.jsonl` through `scripts/trace-ops.sh read`. Report domain-agent count, active/disabled/missing state, took/refused/completed/failed totals, success rate, issues by severity, insights, last activity, per-agent health, policy, verifier result, and actionable recommendations. Do not write, delegate, or request approval.

## Mode: install

### C1-C2: analysis and approved roster

Analyze current architecture, domains, stack, tests/CI, existing Codex agents, project guidance, and cross-team name ownership. Use bounded collaboration only because this invoked skill explicitly requests a team. Propose minimal, balanced, and maximum domain rosters plus fixed review-only `intent-guard`; show unique names, domains, missions, exclusions, and conflicts. The user must approve the final roster before any team or agent file is written. Recheck every approved name with `scripts/agent-owners.sh`; a taken, invalid, parked, or unknown owner stops creation.

### C2.6: shared-contract bootstrap

Before any domain agent write, instantiate `references/framework-files.md` into `.codex/teams/{TEAM_NAME}/team.md` with metadata, `## Shared Agent Contract`, policy `required`, the fixed guard row, and zero domain rows. Initialize trace storage, copy the project-local tracer, and substitute every placeholder. Then call `<plugin-root>/skills/superreview-setup/scripts/emit-intent-guard.sh <project-root>` so the create-only emitter atomically creates the absent guard before the full `verify-team.sh` bootstrap check. A non-symlink regular file is reused only after exact normalized allowlist validation; invalid regular files, symlinks, and nonregular targets stop creation without mutation.

### C3-C4: creation and roster finalization

Create one approved `.codex/agents/{name}.toml` per bounded owner from `references/agent-template.md`. Parse before and after writing. `developer_instructions` has only the ordered headings `Mission`, `Owned surfaces`, `Exclusions`, `Must-load references`, `Unique invariants`, `Unique verification`; the first must-load item is `.codex/teams/{TEAM_NAME}/team.md`, occurring once. Enforce <=3200 UTF-8 bytes and `ceil(chars/4) <=800`.

For policy `required`, the bootstrap already called the create-only intent-guard emitter: an approved existing non-symlink regular file was reused byte-identically, or an absent target was published atomically without replacement. Invalid, symlink, nonregular, or lost concurrent-create paths fail closed without mutation. Never author or overwrite the guard here. `legacy-absent` exists only on upgrades and gets no guard.

Finalize only successfully parsed agents. Domain names are unique; `Agents` counts domain rows only. `required` has exactly one fixed review-only guard row; `legacy-absent` has none. The complete substituted `team.md` must stay <=2800 characters and `ceil(chars/4) <=700`.

### C5-C7: independent review

C5: spawn three independent reviewers, distinct from creators and never `intent-guard`, to inspect all actual TOML plus `team.md`: one checks schema/headings/ceilings/shared-reference, one domain and trigger accuracy, one overlap/routing/shared-contract placement. C6: retain only same-file, same-area, same-category findings confirmed by at least 2/3; log one-off and minor items without fixing. C7: spawn a new verifier not used in C5 or creation to check each retained finding against the files and mark `VERIFIED` or `FALSE_POSITIVE`. Only verified important/critical issues reach repair.

### C8-C9: repair and reverify

Repair one owned artifact per bounded task, preserve roster identity and foreign work, then use an independent verifier for the original issue and regression checks. Allow at most two repair cycles. Run `verify-team.sh` after every cycle; unresolved checks remain failures and review cannot be skipped.

## Mode: upgrade

Reject parked or live-plus-parked members before writes. Migrate the shared contract first, recording an existing guard row as `required` and absence as `legacy-absent`; never synthesize the latter. Preserve legacy agent bytes until this gate passes. Analyze trace evidence, present per-agent keep/tune/replace/remove actions, and obtain approval for roster actions. Touch only approved domain agents, use atomic three-key TOML writes and the current six-heading contract, preserve untouched bytes, re-copy the tracer, update metadata/cursor, then run C5-C9 for touched artifacts.

## Mode: enable

Run `scripts/toggle-team.sh {TEAM_NAME} enable --dry-run`, stop on conflicts/missing members, then restore domain `.toml.disabled` files byte-identically. Never move `intent-guard`. Update roster status/metadata without changing per-agent versions and verify; an all-live team is a no-op.

## Mode: disable

Dry-run the same script, show every move, and after approval park domain `.toml` files as `.toml.disabled` byte-identically. Keep roster, trace, archive, and guard. Update roster status/metadata and verify; an all-parked team is a no-op.

## Mode: uninstall

Route to `references/cleanup-flow.md` interactive cleanup: inventory trace, let the user choose trace/archive and owned domain-agent removals, recheck identifier and cross-team ownership before each deletion, never delete `intent-guard`, preserve declined/foreign files, and report the archive/cursor/result.

## Mode: purge

Route only to `references/cleanup-flow.md` Step P. Enumerate exact domain files and team-directory bytes, request explicit irreversible-purge approval, recheck identifiers/ownership, delete both live and parked owned domain profiles, keep `intent-guard`, then delete only `.codex/teams/{TEAM_NAME}/`. A skipped shared/unknown agent is reported, never forced.

## Completion

After every mutation except a completed purge, run the full `status` control flow and `verify-team.sh`; after purge, prove the team directory is absent. Report exact changed paths, counts, policy, review verdicts, and failures. Agent discovery changes take effect in the next session.
