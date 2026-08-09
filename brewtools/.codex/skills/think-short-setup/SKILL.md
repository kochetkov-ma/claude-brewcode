---
name: think-short-setup
description: "Installs or removes terse-mode hooks. Explicit user invocation only."
---

# Think-short hooks

## Resolve intent and target

1. Resolve exactly one canonical mode from `status`, `install`, `upgrade`, `enable`, `disable`, `uninstall`, `purge`, then project or personal scope. Show the exact target before mutation. With no mode given, resolve `status` when the assets are already present and `install` otherwise. `on`, `off`, `setup`, `remove`, `reset`, `create`, `update` and `cleanup` are not modes: read them as the canonical verb and echo the canonical name back.

## Modes

| Mode | Effect |
|------|--------|
| `status` | Report scope, registered entries, copied asset paths and their recorded version. Writes nothing. |
| `install` | Copy the two native scripts and the prompt described by `assets/INSTALL.md`, merge `SessionStart` and `UserPromptSubmit` entries by exact command string, and preserve unrelated hooks. |
| `upgrade` | Re-copy the same assets from the current plugin version and re-register any entry that went missing, restamping the recorded version. Keeps the parked-or-active state as it was. |
| `enable` | Restore parked assets by renaming each `.disabled` twin back to the filename the handler resolves. |
| `disable` | Park the copied assets by renaming them `.disabled`, leaving the bodies byte-identical, so the registered handlers no-op. |
| `uninstall` | Delete only the matching command entries and the three copied assets, plus any `.disabled` twin of them; remove empty directories only when owned by this workflow. |
| `purge` | `uninstall` plus removal of the workflow's own directory and any personal-scope override. State what will be deleted first. |

## Verify and report

2. Validate JSON, run both hook scripts with valid and malformed fixtures, and confirm a repeated `install`, `upgrade` or `uninstall` is idempotent.
3. Report the changed paths and require review through `/hooks`.

Handlers use one command string, timeout values in seconds, and no matcher for `UserPromptSubmit`. This Codex variant does not install a sub-agent prompt-rewrite hook.
