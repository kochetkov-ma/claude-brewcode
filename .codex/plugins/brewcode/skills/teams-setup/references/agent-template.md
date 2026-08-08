# Native Codex agent template

Create a TOML file under `.codex/agents/` with `name`, `description`, and `developer_instructions`. The instructions define mission, domain, scope, task acceptance, self-check, and colleague handoff. Delegate through Codex collaboration with `task_name` and `message` only. Do not add Markdown frontmatter, tool allowlists, or legacy model aliases.

Every generated agent states output discipline: return only what the main session needs, a verdict or result plus `file:line` pointers; write bulk material such as long logs, full diffs, or long reports to a file under `.codex/reports/<YYYYMMDD-HHMMSS>_<name>/` and return the path instead of the content.

Agents whose domain writes code, scripts, SQL, schemas, infrastructure, or configuration also state scope fit: build for the scale and problems that exist today, not imagined load or speculative abstraction, and make one simplification pass after finishing. Those agents also state etalon-first: before writing a class, module, or test, find the closest well-built existing one in this repository and take its principles, in addition to conventions, rules, and documentation, never instead of them. Omit those paragraphs for research, documentation, and review-only agents.
