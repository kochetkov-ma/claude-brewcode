# brewmod-reminders

Durable reminders for Claude Code (early-access mod, Claude Code 2.1.301+). A reminder is a file in the repo (`.claude/scheduled/`) or in your profile (`~/.claude/reminders/`), so it survives sessions, unlike `CronCreate` and `/loop`. Open items show in a band above the prompt; a due item is offered at your first prompt of a session. Nothing runs unasked.

## Install

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewmod-reminders@claude-brewcode
```

## Commands

| Command | Does |
|---------|------|
| `/remind` or `/remind list` | prints due, running, pending and the last done items; no Claude turn |
| `/remind done <id>` / `cancel <id>` | marks an item; no Claude turn |
| `/remind snooze <id> <when>` | `+2h`, `+1d`, `tomorrow 9:00`, `today 17:30`, `2026-10-22 09:00`; no Claude turn |
| `/remind <words>` | Claude adds it: `/remind check prod tomorrow 9:00` (asks once to confirm time and scope) |
| `/remind project\|global <words>` | same with the folder fixed |

Plain prompts work too: "remind me tomorrow 9:00 to check prod". Docs: https://doc-claude.brewcode.app/mods/reminders/
