# Think-Short

Install-only skill that wires (or removes) three self-contained hooks injecting a terse-output prompt. No on/off toggle, no profiles, no project-level config — only an ephemeral per-session counter in the OS temp dir (`os.tmpdir()/brewtools-think-short/<session_id>.think-short-counter`), auto-pruned. The hooks own all runtime behavior.

## What it does

| Hook | Behavior |
|------|----------|
| SessionStart | injects the full terse prompt + resets the per-session counter |
| UserPromptSubmit | injects the full prompt every 10th user prompt (10/20/30…, not the 1st) |
| PreToolUse:`Task\|Agent` | injects the full terse prompt into spawned subagents (coexistence-safe with other Task hooks) |

The terse prompt cuts preamble, AI phrasings, and filler, and enforces tool discipline.

## Usage

```
/brewtools:think-short                      # install — asks Project or Global
/brewtools:think-short install global       # install globally (~/.claude)
/brewtools:think-short install project      # install for this repo (.claude)
/brewtools:think-short remove                # remove — asks which target
/brewtools:think-short убери глобально       # free-text intent also works (RU+EN)
```

The skill decides **install vs remove** and **project vs global** (asking when unspecified), then delegates the file work to the `brewcode:hook-creator` agent.

## Where it installs

| Target | Hooks dir | settings.json |
|--------|-----------|---------------|
| Project | `<repo>/.claude/hooks/` | `<repo>/.claude/settings.json` |
| Global | `~/.claude/hooks/` | `~/.claude/settings.json` |

Merge is append + dedupe by the `think-short-*.mjs` script path (idempotent re-install). Remove strips entries by those markers and deletes the 4 copied files. Global writes go through Bash only (`~/.claude/*` is a protected path).

## Cadence

The UserPromptSubmit hook re-injects on every 10th prompt (counter stored in the OS temp dir per session, reset at SessionStart). This keeps the directive in context across long sessions without spamming every turn.

## After install/remove

A new session picks up the change automatically — no `/reload-plugins` needed (these are plain settings.json hooks). SessionStart fires on the next `claude` start or `--resume`.

## Docs

Full docs: [https://doc-claude.brewcode.app/brewtools/skills/think-short/](https://doc-claude.brewcode.app/brewtools/skills/think-short/)
