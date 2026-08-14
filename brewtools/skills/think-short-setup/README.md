# Think-Short

Installer skill that wires, toggles or removes three self-contained hooks injecting a terse-output prompt. No profiles and no project-level config — only the shared prompt file the 3 hooks read, plus an ephemeral per-session counter in the OS temp dir (`os.tmpdir()/brewtools-think-short/<session_id>.think-short-counter`), auto-pruned. The hooks own all runtime behavior.

## What it does

| Hook | Behavior |
|------|----------|
| SessionStart | injects the full terse prompt + resets the per-session counter |
| UserPromptSubmit | injects the full prompt every 10th user prompt (10/20/30…, not the 1st) |
| SubagentStart | injects the full terse prompt into spawned subagents via `additionalContext` |

The terse prompt cuts preamble, AI phrasings, and filler, and enforces tool discipline.

## Subagent injection

`think-short-subagent.mjs` delivers the prompt on `SubagentStart` via `hookSpecificOutput.additionalContext`. That channel accumulates across hooks — every registered `SubagentStart` hook's context is appended and delivered to the subagent, so there is no clobbering and nothing to coexist with. `status` runs `node <hooks>/think-short-subagent.mjs --check "$PWD"` and prints `injects=`.

| Field | Meaning |
|-------|---------|
| `injects=yes` | subagents really get the directive |
| `injects=no` | wired, but the prompt file is missing/empty (broken install) |
| `injects=n/a` | no subagent hook in that scope |
| `injects=unknown` | installed copy predates `--check` → run `upgrade` on that scope |

`injects` measures only the subagent hook. SessionStart and the every-10th-prompt injection are separate paths.

## Usage

```
/brewtools:think-short-setup                     # status (default, no args)
/brewtools:think-short-setup install             # install — asks Project or Global
/brewtools:think-short-setup install global      # install globally (~/.claude)
/brewtools:think-short-setup upgrade project     # re-emit hook files from this plugin version
/brewtools:think-short-setup disable             # hooks stay wired, injection stops
/brewtools:think-short-setup enable              # injection back on
/brewtools:think-short-setup uninstall           # unwire + delete the copied files
/brewtools:think-short-setup purge               # + delete the temp counters
/brewtools:think-short-setup убери глобально     # free-text intent also works (RU+EN)
```

The skill always reports status first, decides the **mode** and the **project vs global** target (asking when unspecified), then delegates the file work to the `brewcode:hook-creator` agent.

## Modes

| Mode | Hook files | settings.json | Prompt file | Temp counters |
|------|-----------|---------------|-------------|---------------|
| `status` | — | — | — | — |
| `install` | copied | entries merged | `think-short-prompt.md` | — |
| `upgrade` | re-copied | entries re-merged | re-copied, enabled/disabled state kept | kept |
| `enable` | kept | kept | renamed back from `.disabled` | kept |
| `disable` | kept | kept | renamed to `.disabled` | kept |
| `uninstall` | deleted | entries stripped | deleted | kept |
| `purge` | deleted | entries stripped | deleted | deleted |

There is no `enabled` flag anywhere: all 3 hooks read `think-short-prompt.md` from their own directory and emit `{}` when it is unreadable. `disable` therefore renames that one file to `think-short-prompt.md.disabled` — the 3 processes still spawn per event, they just inject nothing. `upgrade` asks nothing and never resurrects a disabled setup.

## Where it installs

| Target | Hooks dir | settings.json |
|--------|-----------|---------------|
| Project | `<repo>/.claude/hooks/` | `<repo>/.claude/settings.json` |
| Global | `~/.claude/hooks/` | `~/.claude/settings.json` |

Merge is append + dedupe by the `think-short-*.mjs` script path (idempotent re-install). `uninstall` strips entries by those markers and deletes the 4 copied files. Global writes go through Bash only (`~/.claude/*` is a protected path).

## Cadence

The UserPromptSubmit hook re-injects on every 10th prompt (counter stored in the OS temp dir per session, reset at SessionStart). This keeps the directive in context across long sessions without spamming every turn.

## After a wiring change

Install, uninstall and purge change `settings.json`, so they need a new session — no `/reload-plugins` needed (these are plain settings.json hooks). SessionStart fires on the next `claude` start or `--resume`. `enable`/`disable`/`upgrade` touch only files the hooks read at runtime and take effect on the next hook call.

## Docs

Full docs: [https://doc-claude.brewcode.app/brewtools/skills/think-short-setup/](https://doc-claude.brewcode.app/brewtools/skills/think-short-setup/)
