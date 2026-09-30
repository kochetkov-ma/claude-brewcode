---
name: agents
description: "Creates, improves, syncs Codex subagents. Triggers: create agent, improve agent, sync agents, memory sync."
---

# Codex agent authoring

Create, improve, review, sync, list or report on standalone Codex agent TOMLs. Read [schema](references/agent-frontmatter-fields.md), [template](references/agent-template.md), [discovery/tools](references/agent-scope-and-tools.md) and [context](references/agent-context-and-execution.md) before authoring. Use [sync](references/agent-sync.md) for current-code reconciliation. These native references are authoritative for this workflow; do not translate another client's fields or runtime claims.

## Prompt contract

Read the complete RU/EN prompt and prior answers. Explicit standalone mode tokens win; otherwise score distinct whole-word keywords below. Highest score wins; a tie involving status selects status, unresolved mutating choices return one bundled material decision to main. Empty/unknown -> status. A bare existing TOML name/path -> improve. Extract targets from prose, never the first word as a positional path. Plural/all/multiple targets -> one bounded owner per target in parallel.

| Mode | EN keywords | RU keywords | Mutates? |
|---|---|---|---|
| `status` | status, overview, health, show me | статус, состояние, что есть | no |
| `list` | list | список, перечисли | no |
| `create` | create, new, scaffold, add | создай, добавь | yes |
| `improve` | improve, refactor, fix | улучши, почини | yes |
| `review` | review, validate | ревью, проверь корректность | no |
| `sync` | sync, memory sync | синк, меморисинк, актуализируй, обнови знания | yes |

After resolving mode and targets, print once before work:

```text
PLAN — brewcode:agents
INPUT:  <verbatim prompt or "(empty)">
MODE:   <canonical mode and explicit/keyword/default reason>
SCOPE:  <exact paths and requested scope>
DO:     <2-5 imperative steps>
RESULT: <requested artifact or report>
```

Plan values are English; INPUT remains verbatim. An explicitly requested menu uses one available main-chat input request with status, status-all, create, improve, review, sync, list and cancel choices. Cancel stops. Reuse resolved answers/authorization; bundle only missing outcome-changing decisions. Read-only modes ask nothing unless that menu was requested.

## Scope and discovery

Resolve `<project-root>` and `<skill-directory>` first. Inventory actual `*.toml` files in `<project-root>/.codex/agents/` and the active personal agents directory (`$CODEX_HOME/agents/` when configured, otherwise `~/.codex/agents/`). Include shipped native TOMLs from `<plugin-root>/agents/` only when that root is known; those installed definitions are read-only. In this authoring repository, canonical `brewcode/.codex/agents/` and `brewtools/.codex/agents/` are generated outputs: modify their generator, not emitted files.

Record the file's `name` as identity, resolved physical path, description, model/effort overrides and parse verdict. Report collisions against the live available role catalog; do not invent walk-up, managed, CLI or additional-directory agent discovery. Ordinary `.md` files are documentation, not agent definitions. Team `.toml.disabled` files are parked by project tooling and are not active TOML roles.

For status-all, inspect present native skills and the AGENTS.md rule index read-only; do not depend on an unshipped sibling skill or claim rules auto-load. Inspect only requested static instruction/config surfaces, never credentials or runtime state.

## Delegation and ownership

Main owns all spawns, review, integration and user decisions. A delegate owns one deliverable, normally one agent definition and at most five related files / ten steps; split larger units among main-owned parallel peers. Delegates never re-delegate or accept their own output. Every brief carries GOAL, ROLE, SCOPE, CONTEXT, CONSUMER and DONE, identifies parallel owners and forbids reverting their work.

Use available native collaboration tools and the current session's argument schema. Prefer the available agent-creator role; if absent, carry its native instructions to an available project-policy-compliant role and report that fallback. A role label in message text does not instantiate a custom agent type. Do not invent tool calls, force unavailable fields or override fixed-role model settings.

## Modes

### `status` / `list`

Delegate substantial collection to an available explorer. Parse TOMLs, report project/personal/shipped counts, identities, paths, optional model/effort, active/parked status, same-name collisions, description overlap, missing required strings, unsupported fields and broken referenced paths. For status-all add scoped skill metadata/rule-index health. Do not use missing YAML frontmatter, README or shell-tool allowlists as native agent health failures. List prints the plain inventory and stops; status prints a compact structured report and next useful action.

### `create` / `improve`

Infer name, description, writable project/personal target and model policy from existing instructions and user intent. Omit model/effort to inherit the resolved runtime values; never emit `model = "inherit"`. Preserve existing explicit routing, including fixed-role settings. Creating or changing an AGENTS.md agents table row is a separate requested surface; preview the exact row and apply only when authorized. Installed/generated-only targets are read-only here.

Read representative existing roles and applicable AGENTS.md/rules before writing. Use the native template, required TOML strings and only supported optional config keys. Match the current domain and requested scale; before writing a class, module, or test, find the closest well-built existing one in this repository and take its principles, in addition to conventions, rules, and documentation, never instead of them. Preserve independent team profile contracts: teams-setup owns its six headings, budgets/shared file and intent-guard writer; generic authoring does not replace them.

Use this valid main-session brief after substituting already resolved values:

```json
{"task_name":"create_agent_name","message":"Assigned native role: agent-creator. Main supplies the matching available role configuration or reports its absence. You are not alone; preserve concurrent edits. Never delegate children.\nGOAL: deliver one bounded Codex role for the requested project.\nROLE: own exactly {scope}/agents/{name}.toml; no other agent, skill, application or AGENTS.md changes.\nSCOPE: create or improve {scope}/agents/{name}.toml from {skill_directory}/references/agent-template.md; emit TOML, not YAML or Markdown.\nCONTEXT: name={name}, description={description}, optional model/effort policy={routing}; these decisions are resolved, do not re-ask. Existing roles={existing}; parallel owners={owners}.\nCONSUMER: main reviews the file and requested agents-table row.\nDONE: file parses with Python tomllib; nonempty name, description and developer_instructions; supported optional config only; preserved routing, scope and references. Return verdict | path | configured model/effort or omitted/inherited | description | validation evidence. Return missing decisions to main."}
```

Main passes these task_name/message fields to the actual `spawn_agent` tool, with an available role selector only when supported. The brief targets one `.toml` file; matching the filename to name is a convention, not a substituted schema.

Main reviews each result, runs its parse/schema/reference checks, applies only verified scoped corrections, and runs the native sync reference against that written file. Do not trigger another creator pass or a whole-roster sweep. Record necessary current-contract changes separately from wording compression; do not delete constraints to meet a size target.

### `review`

Use an independent available reviewer: inspect scope, TOML fields, triggers, instructions, current references, model policy and actual consumer paths. Double-check findings against source/runtime evidence, then return confirmed issues with file:line evidence. Review does not implement.

### `sync`

Follow references/agent-sync.md: scope -> code/source evidence -> per-file fact ledger -> targeted current corrections -> independent verification -> compact report. Preserve unrelated instructions and local routing; no persistent personal memory update is implied.

## Final output

Except plain list, return canonical mode/reason, resolved targets, per-file verdict/path, configured or inherited model/effort, actual validation and unresolved decisions. Status uses a compact table; batch reports every owned result. Return large evidence via a project report path, not full agent bodies/logs. Public documentation changes follow the available native docs workflow only when applicable and authorized.

## Native user gates

Required approval: main presents a concrete, reviewable proposal in chat and waits for an actual user reply before dependent action. Existing authorization for the same scope remains valid; do not ask again. Optional clarification: use `request_user_input_async` only if exposed, or `request_user_input` only if available in the current runtime/mode, for optional choices and never approval. Otherwise ask in main chat. Delegated agents return unresolved questions to main. Silence, elapsed time and tool errors are not approval.
