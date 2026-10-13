# Manager — intent routing

P0: `$ARGUMENTS`/RU+EN prose -> action + prompt-text scope + mode/level + task.
Outcome-changing ambiguity/conflict (unclear action; enable + disable; uninstall vs purge; a task that
may be hard-one-shot or manager-run; control implied, no recognizable verb) -> AskUserQuestion before execution.
No control verb or hard/manager marker + real task -> `inline-run`; empty -> status.

> Read at P0 by `SKILL.md`, not hook-injected. Two layers (`SKILL.md` top), never conflate:
> - HARD wall (`install`/`upgrade`/`enable`/`disable`/`uninstall`/`purge`/`level`, and the
>   one-shot `... в хард режиме`) = `state.hard`/`state.level` + a guard installed into the project's
>   `.claude/settings.local.json`, project scope only, persistent, this skill only.
> - Codewords `++m`/`++a`/`++rr`/`++r` = hook injection, ALWAYS fire, not toggled here and never
>   an action; bare `+++` adds the `cron-plan` block only when `permission_mode === 'plan'`.
>   `edit`/`purge` only shape the injected text.
>   Prompt inventory: full, planmode, cron-plan, architect, review-regression, review-double;
>   status/show/explain resolves each through project -> global -> plugin. Install/upgrade
>   copy wall assets only, preserve overrides, and use refreshed plugin default prompts.

## Actions

| Action | EN triggers | RU triggers | Notes |
|--------|-------------|-------------|-------|
| status | status, state, what now, show, explain, current, no argument | статус, состояние, что сейчас, покажи, объясни, текущий | Read-only explainer: all six prompt sources/texts, Plan-only +++, wall state/toggles. DEFAULT |
| install | install, set up, deploy the wall, hard mode on, wall on | установи, поставь стену, разверни стену, хард режим вкл, стена | Install the HARD wall and arm it only through the P1 gate (project, permanent until disabled). Applies live, no restart |
| upgrade | upgrade, update the guard, re-copy, refresh hook | обнови, обнови гард, перекопируй гард, освежи хук | Re-emit the guard from the current plugin version; `hard`/`level` preserved; aborts if not installed |
| enable | enable, on, turn on, activate, arm, re-arm | вкл, включи, включить, активируй, взведи | Arm an already-installed wall (state only), through the P1 gate. Not installed → route to `install` |
| disable | disable, off, turn off, deactivate, hard mode off, wall off, disarm | выкл, выключи, отключи, деактивируй, хард режим выкл, стена выкл, стену выключи | Disarm the wall (state only — registration kept, guard no-ops) |
| uninstall | uninstall, teardown, remove hook, deregister, remove wall | удали хук, деинсталлируй, снеси стену, убери хук, удали стену, дерегистрируй | Deregister the guard from `.claude/settings.local.json` + delete the copied guard (auto-disarms first). State, prompt overrides and the task-tools env key kept. Applies live |
| purge | purge, wipe, reset, restore default, revert, nuke | вычисти, снеси всё, сброс, верни дефолт, сбрось, по умолчанию | Uninstall + delete `state.json` and the prompt override(s); the task-tools env key goes only when this skill's install added it. The only destructive action |
| level strict | level strict, strict, strict mode | режим строгий, строгий, строгий режим | Wall strictness = strict |
| level balanced | level balanced, balanced, default level | режим сбалансированный, сбалансированный, баланс | Wall strictness = balanced (default) |
| edit | edit, customize, change prompt, fix prompt | правка, поправь промт, измени промт, кастомизируй | Edit the Manager prompt text |
| hard-one-shot | `<task> in hard mode`, `<task> under the wall` | `<задача> в хард режиме`, `<задача> в режиме стены` | Real task + hard marker → wall ON, run, auto-revert OFF (even on failure) |
| manager-run | `<task> as manager`, `<task> in manager role` | `<задача> от роли менеджера`, `<задача> как менеджер` | Run task in manager role, wall untouched |
| inline-run | any bare task/request, no verb, no marker | любой обычный запрос без глагола и маркера | Prepend full block and run as manager, wall untouched |

All three task-running actions prepend full and force delegation; only hard-one-shot
changes wall state. Plan mode stays read-only: describe role/graph/cron for later execution.

> Resolving `install`/`enable`/`hard-one-shot` here only picks the action. None of them may write
> `state.hard=true` without passing the separate P1 arm-confirmation gate in SKILL.md:
> the bare verb (`install`/`enable`/`установи`/`включи`) and autonomy phrasing never confirm arming
> on their own.

## Scope (prompt-text overrides ONLY)

`--scope global|project` (default project) applies ONLY to edit/purge prompt overrides.

| Scope | EN triggers | RU triggers | Writes to (prompt overrides) |
|-------|-------------|-------------|------------------------------|
| global | global, globally | глобально, везде | `<config dir>/manager/prompts/` (`CLAUDE_CONFIG_DIR`, default `~/.claude`) |
| project (default) | project, here, this project | проект, тут, в проекте | `.claude/brewtools/manager/prompts/` |

Wall actions install/upgrade/enable/disable/uninstall/level are project-only: "globally" with one
of them -> ignore the global scope (the wall has none), write project, and note it.

## Non-command words

> `on`, `off` and `reset` are not command words: they are recognized only as free-text
> synonyms in the table above and always resolve to a canonical action
> (`enable`/`disable`/`purge`); `setup` and `remove` alone route nowhere. Never echo any of
> them back to the user as commands.
