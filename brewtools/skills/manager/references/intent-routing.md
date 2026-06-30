# Manager — intent routing

P0 resolves user intent (from `$ARGUMENTS` or natural language, RU+EN) into an
action + (prompt-text) scope + mode/level + task. If ambiguous or conflicting,
ask via AskUserQuestion before executing. A bare prompt that matches no control
verb and carries no hard/manager marker falls through to `inline-run`.

> TWO layers, never conflate:
> - **HARD wall** (`on`/`off`/`uninstall`/`level`, and the one-shot `... в хард режиме`) =
>   `state.hard`/`state.level` + a guard INSTALLED into the project's
>   `.claude/settings.local.json`, **PROJECT scope only**, persistent, this skill only.
>   `on` = install+arm; `off` = disarm (state only); `uninstall` = deregister.
> - **SOFT codewords** `++m`/`++rr`/`++r` = autonomous hook injection, ALWAYS fire,
>   not toggled here. `edit`/`reset` only shape the injected TEXT.
>   Note: `++m` is plan-aware — when the session is in plan mode (permission_mode === 'plan')
>   it injects the planmode block (full + plan addon); otherwise the plain full block.
>   There is NO separate `++mp` codeword.

## Actions

| Action | EN triggers | RU triggers | Notes |
|--------|-------------|-------------|-------|
| on | on, enable, turn on, activate, hard mode on, wall on | вкл, включи, включить, активируй, хард режим вкл, стена | INSTALL (if needed) + ARM the HARD wall (project, permanent until off). `/reload` only on first install |
| off | off, disable, turn off, deactivate, hard mode off, wall off | выкл, выключи, отключи, деактивируй, хард режим выкл, стена выкл, стену выключи | DISARM the wall (state only — registration kept, guard no-ops) |
| uninstall | uninstall, teardown, remove hook, deregister, remove wall | удали хук, деинсталлируй, снеси стену, убери хук, удали стену, дерегистрируй | DEREGISTER the guard from `.claude/settings.local.json` (auto-disarms first). `/reload` needed |
| status | status, state, what now, show, current | статус, состояние, что сейчас, покажи, текущий | Main explainer: codewords + wall state + how to toggle |
| level strict | level strict, strict, strict mode | режим строгий, строгий, строгий режим | Wall strictness = strict |
| level balanced | level balanced, balanced, default level | режим сбалансированный, сбалансированный, баланс | Wall strictness = balanced (default) |
| edit | edit, customize, change prompt, fix prompt | правка, поправь промт, измени промт, кастомизируй | Edit the Manager prompt text |
| reset | reset, restore default, revert | сброс, верни дефолт, сбрось, по умолчанию | Reset the Manager prompt to default |
| hard-one-shot | `<task> in hard mode`, `<task> under the wall` | `<задача> в хард режиме`, `<задача> в режиме стены` | Real task + hard marker → wall ON, run, auto-revert OFF |
| manager-run | `<task> as manager`, `<task> in manager role` | `<задача> от роли менеджера`, `<задача> как менеджер` | Run task in manager role, wall untouched |
| inline-run | any bare task/request, no verb, no marker | любой обычный запрос без глагола и маркера | Prepend full block and run as manager, wall untouched. When the wall is ON the full block is already ambient-injected by the hook; the skill still prepends it for consistency (one-shot runs may not have the wall on). |

## Distinguishing the three task-running actions

All three prepend the Manager (full) block and force delegation. They differ
only in what they do to the wall:

| Marker in prompt | Action | Wall side effect |
|------------------|--------|------------------|
| "в хард режиме" / "in hard mode" / "under the wall" | hard-one-shot | wall ON for the run → auto-revert OFF (incl. on failure) |
| "от роли менеджера" / "as manager" / "in manager role" | manager-run | none |
| none (bare task) | inline-run | none |

If a task is present but the marker is ambiguous (both or unclear), ask via
AskUserQuestion: hard-one-shot vs manager-run.

## Scope (prompt-text overrides ONLY)

Flag `--scope global|project`, default `project`. Applies ONLY to `edit`/`reset`
(the prompt-text override files). It does NOT apply to `on`/`off`/`level` — the
wall is project-only.

| Scope | EN triggers | RU triggers | Writes to (prompt overrides) |
|-------|-------------|-------------|------------------------------|
| global | global, globally | глобально, везде | `~/.claude/manager/prompts/` |
| project (default) | project, here, this project | проект, тут, в проекте | `.claude/brewtools/manager/prompts/` |

If a user says "globally" together with `on`/`off`/`level`, ignore the global
scope (the wall has no global), write project, and note it.

## Ambiguity

If the action is unclear, or signals conflict (on + off; a task that could be
hard-one-shot or manager-run; control implied with no recognizable verb), use
AskUserQuestion before executing.
