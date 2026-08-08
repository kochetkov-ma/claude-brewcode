---
name: think-short-setup
description: "Installs or removes terse-mode hooks. Explicit user invocation only."
---

# Think-short hooks

## Resolve intent and target

1. Resolve `install` or `remove`, then project or personal scope. Show the exact target before mutation.

## Install or remove

2. For install, copy the two native scripts and prompt described by `assets/INSTALL.md`, merge `SessionStart` and `UserPromptSubmit` entries by exact command string, and preserve unrelated hooks.
3. For removal, delete only matching command entries and the three copied assets; remove empty directories only when owned by this workflow.

## Verify and report

4. Validate JSON, run both hook scripts with valid and malformed fixtures, and confirm repeated install/remove is idempotent.
5. Report the changed paths and require review through `/hooks`.

Handlers use one command string, timeout values in seconds, and no matcher for `UserPromptSubmit`. This Codex variant does not install a sub-agent prompt-rewrite hook.
