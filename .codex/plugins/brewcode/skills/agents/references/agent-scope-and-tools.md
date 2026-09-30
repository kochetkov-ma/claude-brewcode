# Native discovery and available tools

Project roles are standalone `.codex/agents/<name>.toml` files. Personal roles use the active Codex home agents directory; default `~/.codex/agents/`. Resolve symlinks to avoid duplicate edits. The file's name field identifies the role; matching basename is a convention. A same-name custom role can replace a built-in role; use the live available role catalog to resolve collisions rather than asserting unverified path-order precedence.

Built-in roles documented by OpenAI include default, worker and explorer. Additional fixed/project roles depend on the current installation. A natural-language role label is not a role selector; use the current native spawn schema and only available types. Do not claim loaded/fresh-session parity from static parsing alone.

Tools come from the native session's available capability/configuration. Supported agent config layers may adjust MCP/skill settings, but there is no YAML per-agent allowlist here. Do not rename foreign tool calls to make them appear native. Project instructions define owned scope and no nested delegation as policy; they do not grant tools or bypass the live sandbox/approval boundary.

Inventory native shipped definitions read-only only when their known root is present. Source-generation trees are generated compatibility outputs; update the authoritative generator for this repository. No installed cache, auth, state or history write follows from an authoring request.

Sources: [OpenAI custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents#custom-agents), [Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference). Checked 2026-09-30; active collaboration tool arguments remain the current session's runtime contract.
