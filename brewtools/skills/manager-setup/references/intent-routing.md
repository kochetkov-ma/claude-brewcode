# Manager — intent routing

P0: the prompt (RU+EN prose or tokens) -> action + level + task.
Outcome-changing ambiguity/conflict (unclear action; enable + disable; uninstall vs purge; a task that
may be hard-one-shot or manager-run; control implied, no recognizable verb) -> AskUserQuestion before execution.
No control verb or hard/manager marker + real task -> `inline-run`; empty -> status.

> Read at P0 by `SKILL.md`, not hook-injected. Actions drive the HARD wall (`install`/`upgrade`/`enable`/`disable`/`uninstall`/`purge`/`level`, and the
> one-shot `... в хард режиме`): `state.hard`/`state.level` + a guard installed into the project's
> `.claude/settings.local.json`, project scope only, persistent, this skill only. Codewords
> (`++m`/`++a`/`++rr`/`++r`/`+++`) are not an action here: the `brewmod-placeholders` mod provides them; `status` reports it.

## Actions

| Action | EN triggers | RU triggers | Notes |
|--------|-------------|-------------|-------|
| status | status, state, what now, show, explain, current, no argument | статус, состояние, что сейчас, покажи, объясни, текущий | Read-only explainer: wall state/toggles, task-graph tools, codewords pointer (mod) with legacy override files. DEFAULT |
| install | install, set up, deploy the wall, hard mode on, wall on | установи, поставь стену, разверни стену, хард режим вкл, стена | Install the HARD wall and arm it only through the P1 gate (project, permanent until disabled). Applies live, no restart |
| upgrade | upgrade, update the guard, re-copy, refresh hook | обнови, обнови гард, перекопируй гард, освежи хук | Re-emit the guard from the current plugin version; `hard`/`level` preserved; aborts if not installed |
| enable | enable, on, turn on, activate, arm, re-arm | вкл, включи, включить, активируй, взведи | Arm an already-installed wall (state only), through the P1 gate. Not installed → route to `install` |
| disable | disable, off, turn off, deactivate, hard mode off, wall off, disarm | выкл, выключи, отключи, деактивируй, хард режим выкл, стена выкл, стену выключи | Disarm the wall (state only — registration kept, guard no-ops) |
| uninstall | uninstall, teardown, remove hook, deregister, remove wall | удали хук, деинсталлируй, снеси стену, убери хук, удали стену, дерегистрируй | Deregister the guard from `.claude/settings.local.json` + delete the copied guard (auto-disarms first). State, prompt overrides and the task-tools env key kept. Applies live |
| purge | purge, wipe, reset, restore default, revert, nuke | вычисти, снеси всё, сброс, верни дефолт, сбрось, по умолчанию | Uninstall + delete `state.json`; `prompts/` overrides stay (the mod's); the task-tools env key goes only when this skill's install added it. The only destructive action |
| level strict | level strict, strict, strict mode | режим строгий, строгий, строгий режим | Wall strictness = strict |
| level balanced | level balanced, balanced, default level | режим сбалансированный, сбалансированный, баланс | Wall strictness = balanced (default) |
| hard-one-shot | `<task> in hard mode`, `<task> under the wall` | `<задача> в хард режиме`, `<задача> в режиме стены` | Real task + hard marker → wall ON, run, auto-revert OFF (even on failure) |
| manager-run | `<task> as manager`, `<task> in manager role` | `<задача> от роли менеджера`, `<задача> как менеджер` | Run task in manager role, wall untouched |
| inline-run | any bare task/request, no verb, no marker | любой обычный запрос без глагола и маркера | Run as manager (delegate, task graph), wall untouched |

All three task-running actions force delegation; only hard-one-shot
changes wall state. Plan mode stays read-only: describe role/graph for later execution.

> Resolving `install`/`enable`/`hard-one-shot` here only picks the action. None of them may write
> `state.hard=true` without passing the separate P1 arm-confirmation gate in SKILL.md:
> the bare verb (`install`/`enable`/`установи`/`включи`) and autonomy phrasing never confirm arming
> on their own.

## Scope

Every action is project-only (the wall has no global scope): "globally"/`--scope global` is ignored, write project, and note it.

## Non-command words

> `edit` is not an action; route codeword-text requests to the mod's free-text form, e.g. `/placeholders change r`. `on`, `off` and `reset` are not command words: they are recognized only as free-text
> synonyms in the table above and always resolve to a canonical action
> (`enable`/`disable`/`purge`); `setup` and `remove` alone route nowhere. Never echo any of
> them back to the user as commands.
