---
name: brewdoc:memory
description: "Syncs and shrinks memory: CLAUDE.md (incl. nested), rules, conventions, memory files. `full` adds agent + skill rosters."
argument-hint: "<free-form prompt: emphasis only; empty = sync whole memory surface; 'full' adds agent+skill rosters>"
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion
model: opus
---

# Memory Sync

> **Default mode = `sync`.** Every invocation — with or without a prompt — syncs the WHOLE memory
> surface: memory files + root CLAUDE.md + **all nested CLAUDE.md** + all rules + all conventions.
> A prompt never narrows the sweep, it only steers emphasis.

> **No `context: fork`** — must run in the main conversation: it spawns Task subagents and needs
> the current session's history (a `session`-flavoured emphasis is worthless in a fork).

<instructions>

## Constants

| Const | Value |
|-------|-------|
| SYNC_REF | `${CLAUDE_SKILL_DIR}/references/mode-sync.md` |
| FULL_REF | `${CLAUDE_SKILL_DIR}/references/mode-sync-full.md` |
| GUIDE | `${CLAUDE_SKILL_DIR}/references/memory-guide.md` |
| ROSTERS | agents + skills files, synced in-place by `full` only (see FULL_REF for why !=`Skill()` the brewcode siblings) |

## Step 1 — Input gate

Treat the **entire** user input (`$ARGUMENTS`) as ONE free-form natural-language prompt — no
keyword grammar, no argument parser (`argument-hint` is a loose example only).

- prompt empty / whitespace-only -> mode `sync`, no questions asked. !=menu.
- prompt non-empty -> mode `sync` as well; the prompt is emphasis, NOT a filter. The full memory
  surface is still checked.
- prompt asks for `full` / `фулл` / "всё" / "+ agents" / "+ skills" / "agents и skills" ->
  mode `full`.

## Step 2 — Mode

| Mode | Chosen when | Does |
|------|-------------|------|
| `sync` (**DEFAULT**) | always, unless `full` is signalled | follow `SYNC_REF` end to end |
| `full` | prompt says full / всё / names agents or skills | follow `FULL_REF`: `sync` + agent roster + skill roster + cross-layer dedup |

ANNOUNCE before any work:

```
Mode: <sync|full> (memory) — <evidence quoted from the prompt, or "no prompt -> default sync">
Emphasis: <what the prompt steers toward, or "none">
```

## Step 3 — Dispatch

- `sync` -> read `SYNC_REF`, execute S0..S5.
- `full` -> read `FULL_REF`, execute F0..F4 (it re-uses `SYNC_REF` for the memory part and for the
  roster verdicts/fan-out shape).

Read `GUIDE` for the where-does-it-belong decision tree and compression patterns.

## Delegation (applies to EVERY Task spawn in this skill)

A big task handed to one agent = an agent gone for an hour: you cannot observe it, cannot correct
it, and it usually drifts off-target. One subagent = ONE bounded unit — one deliverable,
~<=5 files, ~<=10 steps. Bigger MUST be split into N tasks, all spawned in ONE message.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists — the point beyond the file edit |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, by whom, what runs in parallel — trimmed to what THIS agent needs |
| CONSUMER | who or what uses the result next, and the shape it must fit |
| DONE | acceptance criteria + the exact report shape you want back |

A bare one-line task is never enough.

</instructions>
