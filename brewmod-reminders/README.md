<!-- Stable deep link, shared outside the repo: #demo. Keep the id. -->
<p align="center">
  <a id="demo"></a><img src="../assets/brewmods/reminders.gif" width="800" alt="Claude Code terminal: /remind project in 1 min to run the test suite shows a preview and one time question, the reminder is saved and the band shows 0 due, 1 upcoming. In a later session the band reads 1 due before any prompt; after a first prompt Claude offers run, snooze, done or cancel, runs npm test on request, marks the reminder done and the band disappears.">
  <br><sub>Recorded in a real Claude Code 2.1.306 session, sped up where the title bar shows ⏩.</sub>
</p>

<h1 align="center">Reminders</h1>

<p align="center">Reminders and checks that outlive the session. A Markdown file in your repo; Claude offers it when it is due.</p>

<p align="center">
  <a href="https://github.com/kochetkov-ma/claude-brewcode/stargazers"><img src="https://badgen.net/github/stars/kochetkov-ma/claude-brewcode?icon=github&label=stars" alt="GitHub stars"></a>
  <img src="https://img.shields.io/badge/Claude_Code-2.1.301%2B-d97706" alt="Requires Claude Code 2.1.301+">
  <img src="https://img.shields.io/badge/type-mod-8b5cf6" alt="Claude Code mod">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT">
</p>

> Part of the [brewcode mods](../README.md#claude-code-mods), next to [brewmod-placeholders](../brewmod-placeholders/) and [brewmod-plan-effort](../brewmod-plan-effort/).

## What it is

`CronCreate` and `/loop` jobs live only inside the running session, and cloud `/schedule` runs have no access to your local SSH keys, scripts or VPS. For "check prod tomorrow at 9:00" you need something that is still there next week.

A reminder here is a plain Markdown file, in the project or in your Claude profile (see [Scopes](#scopes)). Any later session reads it. Open items show in a band above the prompt; a due item is offered at your first prompt of a session. Nothing runs unasked.

## Install

> **Update Claude Code first:** the mods need Claude Code 2.1.301 or newer. Check with `claude --version`; if it is lower, run `claude update`, then restart Claude Code (exit, run `claude`).

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode && claude plugin install brewmod-reminders@claude-brewcode
```

Then run `/reload-plugins`.

<details>
<summary>Update, dev mode, requirements</summary>

```bash
claude update   # Claude Code 2.1.301+ first, then restart Claude Code
claude plugin marketplace update claude-brewcode && claude plugin update brewmod-reminders@claude-brewcode
claude --plugin-dir ./brewmod-reminders   # dev mode, no install
```

- Claude Code 2.1.301 or newer.
- Mods use the hooks module API, which is early access.
- `node` on the `PATH` (runs the bundled command hook `hooks/remind.mjs`).
- Update anytime with `/brewtools:plugin-update`.

</details>

## Use it

| You do | You get |
|--------|---------|
| Say it: "remind me tomorrow 9:00 to check prod" | Claude shows a preview (`Preview, nothing written: ...`, nothing is saved yet) and asks once. One question with two tabs: the time, and where to save (Project (Recommended) or Global). Then the file is written, with no permission prompt |
| `/remind check prod tomorrow 9:00` | The words are handed to Claude (`Handing this to Claude: ...`), same preview and one confirmation |
| `/remind global <words>` or `/remind project <words>` | Same, with the folder fixed, so the question asks only for the time |
| Open a session later, once the time has passed | The band shows the due item before you type. Your first prompt makes Claude tell you first and offer: run now, snooze, mark done or cancel |
| Answer "run it" | Claude claims the item, carries out its text, and marks it done with a one-line result |

## Scopes

| Scope | Folder | Shown in | Git |
|-------|--------|----------|-----|
| Project (default) | `<project>/.claude/scheduled/` | Sessions of that project | Per the [config](#config) |
| Global | `${CLAUDE_CONFIG_DIR:-~/.claude}/reminders/` (per Claude profile) | Every session of that profile; items carry `(global)` | Never |

## What you see

Band above the prompt while any open item exists. It is drawn at session start; nothing is sent to Claude by it.

```text
reminders · 1 due · 2 upcoming
  Run the test suite  now
  Check prod  in 18 h
  Renew certificate  in 3 d (global)
/remind  list · done · snooze · or say what to add
```

The header counts due items and upcoming (pending) items; when a session is carrying items out, it adds `· N running`, for example `reminders · 0 due · 1 upcoming · 1 running`. Running items are not counted as upcoming.

| Row text | Meaning |
|----------|---------|
| `now` | Due |
| `in <1 min`, `in 18 h`, `in 3 d` | Upcoming |
| `2 d ago` | Overdue |
| `· running` | Claimed by a session that is carrying it out |
| `(global)` | Item from the global folder |
| `+N more` | More than 3 open items; `/remind` lists all |

- **The offer.** At the first real prompt of a session the bundled command hook adds the due items to Claude's context. Claude tells you first and offers run now, snooze, mark done or cancel; it never runs one unasked and calls out an item more than 24 h late. Each item is offered once per session and again after `/compact`. The turn that carries a `/remind <words>` hand-off never gets the offer; your next prompt does.
- **Mid-session.** A 60 s tick refreshes the band and shows one toast, `reminder due: <title> · /remind` (or `N reminders due · /remind`). There is no automatic turn: the next prompt carries the offer.
- **Running.** A second open session cannot run a claimed item (`<id> is running in session <sid> since <time>`). A claim lives in `<folder>/.claims/<id>.json` (that folder ignores itself with a `.gitignore`) and expires after 6 h for crashed sessions.

## Commands

| Command | Result |
|---------|--------|
| `/remind` or `/remind list` | Prints due, running, pending, unreadable, done (last 10) and cancelled (last 10) in your local time; no Claude turn |
| `/remind help` | Command summary and the folders in use |
| `/remind done [project\|global] <id>` | `done: <title> (<id>)` |
| `/remind cancel [project\|global] <id>` | `cancelled: <title> (<id>)` |
| `/remind snooze [project\|global] <id> <when>` | `snoozed: <title> (<id>) until <ISO>` |
| `/remind <words>` | Handed to Claude: add, ask or change in your own words |
| `/remind project\|global <words>` | Same with the folder fixed |

`help` and `list` act only when typed alone. `done`, `cancel` and `snooze` act only when the id resolves; the optional `project` or `global` word picks the folder. Any other text, such as `/remind cancel the old backup job`, goes to Claude like `/remind <words>`.

`<id>` is the file name without `.md`; the slug or a unique prefix also matches. `<when>` is `+2h`, `+1d`, `tomorrow 9:00`, `today 17:30`, `2026-10-22 09:00` (your local zone) or an ISO time with an offset or `Z`. A time in the past is rejected. Times are stored in UTC and shown in your system time zone, daylight saving included.

## Config

`.claude/reminders.json` in the project; absent means defaults. The mod has no `/config` row.

```json
{ "git": "commit-push" }
```

| `git` | Effect |
|-------|--------|
| `off` (default) | Claude does not commit reminder files |
| `commit` | After changing a project item, Claude commits only that file |
| `commit-push` | Same, and pushes |

The mod never runs git itself: it tells Claude, so your permission mode and repo rules stay in force. Global items are never committed. `.gitignore` is untouched; whether items are tracked is your repo's call.

## File format

`<YYYYMMDD-HHMM>_<slug>.md`, where the name prefix is the due time in UTC at creation; `due:` stays authoritative after a snooze, which rewrites only the header. Header lines at the top, up to the first blank line (optional `---` fences); the body is the text Claude carries out.

```markdown
due: 2026-10-22T08:00:00Z
status: pending
created: 2026-10-21T14:20:00Z

Check prod: open the dashboard, confirm the hotfix is live and error rate is flat.
```

| Key | Value |
|-----|-------|
| `due` | UTC ending in `Z`, `YYYY-MM-DDTHH:MM:SSZ`. A time without `Z` is unreadable: the item is listed as unreadable and Claude offers to fix it |
| `status` | `pending`, `done` or `cancelled` |
| `done`, `cancelled` | UTC time of the change, set by the mod |
| `created`, `result` | Optional; `result` is the one-line outcome Claude records |

A `README.md` in the folder is skipped. If the mod tools are unavailable, edit the header by hand (`status: done` and `done: <UTC>`).

## Good to know

- **Headless.** `claude -p`, CI, the SDK and subagents get no offer: it appears only for a prompt you type. Prompts starting with `/` are skipped.
- **Team organizations.** Proven live on a Team seat with Claude Code 2.1.306: band, offer through the bundled command hook, the `/remind` hand-off and the mod tools.
- **Worktrees and clones.** Claims and status are per checkout. A tracked item marked done in one checkout shows pending in another until the change is merged or pulled.
- **State reset on update.** Session and offered marks live under `.state/` in the plugin folder (pruned after 7 days). An update installs a new version folder, so the marks reset once and an open item can be offered again.

## Migrating from a hand-rolled hook

A `SessionStart` hook such as `due-checks.sh` over `.claude/scheduled/*.md` can go away. Existing items parse unchanged if they have `due:` in UTC and a `status:` line. Remove the hook block from `.claude/settings.json` or `.claude/settings.local.json` and delete the script. Optionally add `.claude/reminders.json` with `{"git": "commit-push"}` to keep committing items. While the old hook is still registered, the offer reminds you to remove it.

[Docs](https://doc-claude.brewcode.app/mods/reminders/) | [Project page](https://brewcode.app/mods/reminders/) | [Source](https://github.com/kochetkov-ma/claude-brewcode/tree/main/brewmod-reminders) | [All mods](../README.md#claude-code-mods) | [Release notes](../RELEASE-NOTES.md)

Author: Maksim Kochetkov | License: MIT
