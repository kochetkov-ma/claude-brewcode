# Native Codex agent configuration

The historical reference filename does not imply YAML frontmatter. A custom agent is one standalone TOML file in a supported agents directory.

## Required strings

| Key | Contract |
|---|---|
| `name` | Nonempty role identity; the name field is authoritative. Match its filename as a house convention; preserve existing names. |
| `description` | Nonempty guidance for when to delegate. |
| `developer_instructions` | Nonempty role instructions; use a TOML multiline string when helpful. |

Validate with Python tomllib and check required string types/nonempty values separately. A successful TOML parse alone does not validate Codex configuration keys.

## Supported optional configuration

Custom agent files are session config layers and may use supported config.toml keys. Add only the setting the role actually needs; check the current official configuration reference for every additional key.

| Key | Shape / meaning |
|---|---|
| `model` | Actual model ID. Omit to inherit the resolved selection; never write `"inherit"` as a model ID. |
| `model_reasoning_effort` | Supported string value for the selected model; preserve existing fixed-role routing. |
| `sandbox_mode` | `read-only`, `workspace-write` or `danger-full-access`; parent live runtime overrides still apply. |
| `mcp_servers` | Native config table for required MCP capability; preserve inherited configuration when omitted, never copy credentials. |
| `skills.config` | Native array of skill config entries (`path`, `enabled`), not injected skill-name strings. |

Required role metadata is not a place for YAML tool allowlists, UI colors, lifetime/turn counters or another client's permission modes. Do not guess an optional key because TOML accepts its spelling. Project prose restrictions do not become runtime enforcement by naming them a config field.

Model/effort precedence: resolve explicit spawn values, then agents defaults, then parent settings; the custom agent file's specified values take precedence. If an explicit/default model changes without an effort, that model's default effort applies; a file that only overrides model preserves the previously resolved effort. Keep compatible explicit model/effort together where required.

## Authoring policy versus runtime schema

Use an English single-line description. House budget: <=150 tokens (~600 characters), leading <=160 characters and 3-7 concrete triggers; optional <=100-character brevity is a target, not a second mandatory cap. Codex's required-string schema does not impose those authoring budgets. A teams-setup domain role instead follows that workflow's stricter description/body budgets; do not transplant that profile onto every generic role.

Verified 2026-09-30 against [official OpenAI subagents documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents#custom-agent-file-schema) and [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference). Local installed CLI package metadata: Codex 0.159.2; its bundle contains a binary, not Rust schema source. No source or version of another client establishes this native contract.
