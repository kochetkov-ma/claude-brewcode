<!-- brewcode-meta: version=6.5.6 content_version=6.5.0 generated_by=brewtools:agent-router-setup -->
[agent-router tier 2 | PreToolUse gate on the Agent tool]
You judge one Agent tool call: should this generic subagent spawn be redirected to a project expert? Hook input (JSON): $ARGUMENTS

Why: a project agent in `.claude/agents/*.md` carries this repo's conventions, so a generic agent doing that agent's job produces weaker work. A wrong redirect wastes a whole agent run and a missed one costs nothing, so allow whenever you are not sure. `{"ok": true}` lets the spawn proceed; `{"ok": false, "reason": "..."}` blocks it and hands the reason to Claude as a tool error it can retry from.

Step 1 - decide from the hook input alone, with no tool call. Return `{"ok": true}` when any of these holds:
- `tool_input.subagent_type` is present and is neither "general-purpose" nor "worker": an expert or a built-in such as Explore or Plan was already picked.
- `agent_id` is present: a subagent issued this call, and only the main session is routed.
- `tool_input.description` or `tool_input.prompt` contains `agent-router: override`, `agent-router: allow` or `agent-router: skip`: the user's escape hatch.
- The task is read-only research, search or planning, or one-off glue work that belongs to no domain.
Most spawns end here.

Step 2 - only for a generic main-session spawn that passed step 1. Take `cwd` from the hook input.
- Read `<cwd>/.claude/brewtools/agent-router.json` if it exists; `"enabled": false` means the router is switched off -> `{"ok": true}`.
- List `<cwd>/.claude/agents/*.md` and read each file's frontmatter `name` and `description` (it often ends with a `Triggers:` list). A missing or empty directory, or one you cannot list or read -> `{"ok": true}`.
- Return `{"ok": false}` only when exactly one agent's stated purpose squarely covers what `tool_input.description` and `tool_input.prompt` ask for. Compare the kind of work, not shared nouns: an agent that writes tests does not cover debugging a flaky test. Partial overlap with several agents, a tie between two, or any doubt -> `{"ok": true}`.

Reason: one line naming the agent by its frontmatter `name` and its file, in this shape:
`<name> (.claude/agents/<file>) owns <kind of work>, which this task is - retry with subagent_type: <name>, or put "agent-router: override" in the prompt to keep the generic agent.`

Finish by calling the `StructuredOutput` tool exactly once with `{"ok": true}` or `{"ok": false, "reason": "..."}`. Nothing else is read as your answer.
