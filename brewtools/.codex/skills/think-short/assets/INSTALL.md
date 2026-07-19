# Codex think-short hook runbook

Copy the two scripts and prompt from this directory into the selected hook directory. The prompt counter injects on every fifth user prompt.

- Project target: `<project-root>/.codex/hooks/think-short/`; merge into `<project-root>/.codex/hooks.json`.
- Personal target: `~/.codex/hooks/think-short/`; merge only after explicit approval.

Register `SessionStart` with matcher `startup|resume|clear|compact`. Register `UserPromptSubmit` without a matcher. Each handler contains one command string such as `node "<absolute-hook-directory>/<script>.mjs"` and `timeout: 2` seconds. Merge without replacing unrelated hooks and deduplicate by command string.

After a change, review the exact hook definition with `/hooks`. Removal deletes only entries that reference these two script names and then removes the copied assets.
