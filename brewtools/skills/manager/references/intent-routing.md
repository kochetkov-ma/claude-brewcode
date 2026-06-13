# Manager — intent routing

P0 resolves user intent (from `$ARGUMENTS` or natural language, RU+EN) into an
action + scope + mode. If ambiguous or conflicting, ask via AskUserQuestion
before executing. A bare prompt that matches no control verb falls through to
`inline-run`.

## Actions

| Action | EN triggers | RU triggers | Notes |
|--------|-------------|-------------|-------|
| on | on, enable, turn on, activate | вкл, включи, включить, активируй | Enable manager block |
| off | off, disable, turn off, deactivate | выкл, выключи, отключи, деактивируй | Disable manager block |
| status | status, state, what now, show, current | статус, состояние, что сейчас, покажи, текущий | Report on/off + mode + scope |
| mode full | mode full, full mode, set full | режим full, полный режим, переключи на full | Use full.md block |
| mode planmode | mode planmode, plan mode, planning | режим planmode, режим планирования, переключи на planmode | Use planmode.md block |
| edit | edit, customize, change prompt, fix prompt | правка, поправь промт, измени промт, кастомизируй | Edit `[full\|planmode]` block |
| reset | reset, restore default, revert | сброс, верни дефолт, сбрось, по умолчанию | Reset `[full\|planmode]` to default |
| inline-run | any bare task/request not matching above | любой обычный запрос, не совпавший с глаголом | Prepend full block and execute |

## Scope

Flag `--scope global|project`, default `project`.

| Scope | EN triggers | RU triggers | Writes to |
|-------|-------------|-------------|-----------|
| global | global, globally | глобально, везде | `~/.claude/manager/` |
| project (default) | project, here, this project | проект, тут, в проекте | `.claude/brewtools/manager/` |

## Ambiguity

If action is unclear or triggers conflict (e.g. on + off, or no recognizable
control verb when control was implied), use AskUserQuestion before executing.
