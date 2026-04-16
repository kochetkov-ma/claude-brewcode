# Interactive Flow (shared reference)

> Used by both `brewtools:skill-toggle` and `brewtools:agent-toggle`.
> Entry when no explicit op/target given, OR when user's prompt is a freeform request ("отключи лишнее", "hide image-gen").

---

## Core principle

**If the user is explicit — just execute.** Ask only when something is genuinely ambiguous. End every run with a status dump.

Explicit input examples (skip all questions, run straight to P3 Apply):
- `/brewtools:skill-toggle disable brewui:image-gen` → run directly
- `/brewtools:agent-toggle enable brewcode:reviewer --scope=project` → run directly
- `отключи brewui:image-gen` → plugin+name clear → run, but confirm once if uncertain
- `enable image-gen` (no plugin prefix, single match in cache) → run, but confirm once

Ambiguous / missing input → enter full interactive flow.

---

## Phase I0 — Decide if interactive is needed

| Input | Branch |
|-------|--------|
| No args at all | Full interactive (I1 → I2 → I3 → I4) |
| Op only (`disable` / `enable` / `status` / `list` / `reapply` / `prune`), no target | Skip I1, start at I2 |
| Op + target, both clear | Skip interactive, run, print status (I4 only) |
| Freeform prose ("hide the noisy image skill") | LLM pre-parse → if target inferrable, confirm once (I3); else full interactive |

---

## Phase I1 — Ask what to do

**Single `AskUserQuestion` call**, one question, four options:

| Option | Meaning |
|--------|---------|
| `status` | Show current disabled list (global + project merged) |
| `disable` | Hide a skill/agent |
| `enable` | Restore a previously hidden skill/agent |
| `list` | Dump everything installed with its enable/disable state |

Do NOT combine questions into one batch here — this single pick drives the rest of the flow. After the answer:

- `status` or `list` → skip to I4 (run the op, print result)
- `disable` → proceed to I2 with target filter = currently enabled
- `enable` → proceed to I2 with target filter = currently disabled

---

## Phase I2 — Show the catalog, ask which target

**Rule: the catalog is printed as ONE LONG LINE** — space-separated `plugin:name` tokens. This lets the user `Ctrl+F` / `Cmd+F` inside their terminal scrollback.

### Build the catalog

1. Call `enumeratePlugins()` from `cache.mjs`.
2. For each plugin dir → read `skills/*/SKILL.md` (for `skill-toggle`) OR `agents/*.md` (for `agent-toggle`).
3. For each entry, check state file to mark `[disabled]` suffix.
4. Filter by op: if `disable`, keep only currently enabled; if `enable`, keep only currently disabled.

### Format

Emit three lines — a header, the flat list, and a hint:

```
AVAILABLE TO {OP} ({N} total, Ctrl+F to search):
brewcode:spec brewcode:plan brewcode:start brewcode:review brewcode:convention brewtools:debate brewtools:secrets-scan brewui:image-gen brewui:glm-design-to-code ...

Tip: type "plugin:name" OR a few words; I'll match. "cancel" aborts.
```

**Never break the list across multiple lines** — the single line is the whole point (Ctrl+F friendly).

### Ask

Free-text prompt (regular message, not AskUserQuestion — we want an unrestricted reply):

> **Which one?** Paste `plugin:name` or describe it in your words. `cancel` to abort.

---

## Phase I3 — Resolve + confirm (once, only if uncertain)

Match the user's reply against the filtered catalog:

| Match | Action |
|-------|--------|
| Exact `plugin:name` present in catalog | Skip confirmation, go to I4 |
| Exact `name` without prefix, **unique** in catalog | Skip confirmation (no ambiguity), go to I4 |
| Exact `name` without prefix, **multiple plugins match** | AskUserQuestion with 2-4 `plugin:name` options |
| Fuzzy words ("the noisy image one") | Rank by token overlap + keyword hints in description; pick top candidate; **confirm once** via AskUserQuestion: "Disable `brewui:image-gen`? [yes / pick different / cancel]" |
| Nothing matches | AskUserQuestion: "No match. [re-enter name / show catalog again / cancel]" |
| `cancel` | Abort cleanly, print current status (I4) |

**One confirmation max.** Never ping-pong. After confirm or after an unambiguous match → I4.

### Scope

If the op mutates state (`disable` / `enable`) and `--scope` wasn't given, default to **global**. Only ask if the user's phrasing hints at per-project ("for this repo", "только в этом проекте", "project scope") — then a single AskUserQuestion: global vs project.

---

## Phase I4 — Execute + print status

1. Run the resolved op (`apply.mjs` for rename, `state.mjs` for state mutation).
2. Remind: `/reload-plugins` required for Claude Code to see the change (only after disable/enable, not after status/list).
3. Print the **current status** table — regardless of which op ran:

```
DISABLED RIGHT NOW
-------------------
brewui:image-gen         [skill, global,   since 2026-04-16]
brewcode:reviewer        [agent, project,  since 2026-04-15]
(none)  ← if empty

ENABLED ({M} skills / {K} agents across {P} plugins)
```

The second line is a count, not an enumeration — users who want to scan everything use `list`.

---

## Decision matrix — quick cheat-sheet

| User said | Asks | Confirms | Runs |
|-----------|------|----------|------|
| `disable brewui:image-gen` | none | no | directly |
| `disable` | target picker | no (if exact match) | after pick |
| `отключи image-gen` | none (unique match) | once | after confirm |
| `отключи что-нибудь ненужное` | op picker → target picker | once | after confirm |
| (empty prompt) | op picker → target picker | once if fuzzy | after pick |
| `status` | none | no | directly |

---

## Anti-patterns

- **Don't** paginate the catalog or split it across messages — the whole value is a single Ctrl+F line.
- **Don't** ask scope unless the user hinted at it — default global is fine for 95% of cases.
- **Don't** confirm when the user was explicit — respect clarity.
- **Don't** show the full catalog on `status` / `list` / `reapply` / `prune` — those have their own output.
- **Don't** loop the interactive flow — if the user says `cancel` or gives unparseable input twice, abort with an error message.

---

## Triggers for interactive entry

Both skills enter this flow when:
- Invoked as `/brewtools:skill-toggle` / `/brewtools:agent-toggle` with no args
- User's prompt lacks a concrete target (`"help me disable something"`, `"что можно выключить?"`)
- Parsed target doesn't exist in cache (fallback to I2)

Skip this flow when:
- Full explicit command given (`disable <plugin>:<name>`) — go straight to main P3 Apply
- Terminal op (`status`, `list`, `reapply`, `prune`) with no target required — run directly, show output
