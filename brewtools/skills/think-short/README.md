# Think-Short

Toggle terse-output mode — cuts preamble and filler via SessionStart + PreToolUse:Task injection.

## Commands

| Command | What it does |
|---------|-------------|
| `/brewtools:think-short on [--scope global\|project]` | Enable terse mode (default scope: project) |
| `/brewtools:think-short off` | Disable terse mode |
| `/brewtools:think-short profile <light\|medium\|aggressive>` | Set compression profile |
| `/brewtools:think-short status` | Print effective state, source, state files, last 10 log lines |
| `/brewtools:think-short blacklist add\|remove <agent>` | Exclude/include agent from terse injection |

## NL prompts (RU+EN)

| Phrase | Resolves to |
|--------|-------------|
| `включи терсный`, `be terse`, `think-short on` | `on` |
| `выключи терсный`, `turn off`, `think-short off` | `off` |
| `лёгкий режим`, `light`, `уровень 1`, `level 1` | `profile light` |
| `средний режим`, `medium`, `уровень 2`, `level 2` | `profile medium` |
| `агрессивный`, `макс`, `aggressive`, `уровень 3`, `level 3` | `profile aggressive` |
| `включись максимально`, `be terse max` | `on` + `profile aggressive` (combo) |
| `что сейчас`, `think-short status` | `status` |

Ambiguous input triggers `AskUserQuestion` with candidate operations.

## State files

| Scope | Path |
|-------|------|
| Global | `~/.claude/plugins/data/brewtools-claude-brewcode/think-short.json` |
| Project | `.claude/brewtools/think-short.json` |

Project state wins over global (merge precedence). Default scope for writes is `project` (silent).

State schema: `{"version":1, "enabled":false, "profile":"medium", "blacklist":["debate","docs-writer","architect"], "updated_at":"ISO"}`

## Profiles

| Profile | Directives | Approx tokens | Typical use |
|---------|-----------|---------------|-------------|
| `light` | Be terse. Results first. Think through edits before executing. | ~20 tokens | Light reduction, keeps reasoning visible |
| `medium` | Light + no AI phrasings, no sycophancy. Tool discipline: Grep before Read, Edit over Write, parallel independent calls, no re-Read of just-edited files. | ~60 tokens | Balanced — recommended default |
| `aggressive` | Medium + ASCII-only, no closing fluff, no disclaimers. Full tool discipline: bundle edits, replace_all for N-identical, gather call-sites via Grep before parallel Edits. | ~120 tokens | Maximum suppression — long automated runs |

## Logs

File: `.claude/logs/brewtools.log`
Prefix: `think-short:`

Every NL resolution and scope selection is logged at INFO level.

## Docs

Full docs: [https://doc-claude.brewcode.app/brewtools/skills/think-short/](https://doc-claude.brewcode.app/brewtools/skills/think-short/)
