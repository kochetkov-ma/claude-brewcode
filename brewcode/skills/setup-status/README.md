# Setup Status

Shows, for each of the eleven setups in brewcode, brewtools and brewdoc, whether it is installed in this project (or your user config), which version it came from compared with the plugin in use, and the exact command to run next. `upgrade` then brings every stale setup it may run current, one fresh `brewcode:setup-upgrader` subagent per setup, re-checked after each.

## Install

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewcode@claude-brewcode
```

Then `/reload-plugins`.

## Usage

| Command | Does |
|---------|------|
| `/brewcode:setup-status` | Full cross-plugin report, then one offer to upgrade the stale setups |
| `/brewcode:setup-status upgrade` | Upgrades every stale setup it may run; the request is the consent, so no upgrade question (the task-tools offer may still appear) |
| `/brewcode:setup-status brewtools` | Report for one plugin's setups |
| `/brewcode:setup-status upgrade brewtools` | Upgrade only one plugin's setups |
| `/brewcode:setup-status convention-setup` | Report for one setup |

`argument-hint`: `[prompt] [report|upgrade] [<plugin>|<skill>] - no args = full report + one upgrade offer`. Name a plugin or setup anywhere in a free-text prompt (English or Russian) to filter; other text gives the full report. `upgrade`, `update`, `refresh`, `fix` and `apply` select the upgrade; anything else is a report. The report follows your language; commands and paths stay literal.

Every run opens with a `PLAN — brewcode:setup-status` block (input, mode, scope, what the run will do), printed before any probe.

Each setup gets one verdict: `current`, `stale`, `modified`, `partial`, `disabled`, `missing`, `n/a` or `version unknown`. Below the table, a run-list orders the commands in seven stages (agent-return, semble, convention, teams, consumers, task-board, memory-sync and docsync). The same order is on the [full setup page](https://doc-claude.brewcode.app/full-setup/).

## Upgrade

After `/brewtools:plugin-update`, run `/reload-plugins` (a session still on the old release refuses the upgrade), then `/brewcode:setup-status upgrade` in each project. A plugin update does not replace files a setup already copied into the project; the upgrade does.

The reload guard compares the release this session loaded with the release installed for this project's scope (local, else project, else user). On a mismatch it prints `RELOAD-NEEDED loaded=X installed=Y scope=S`: the report still prints, noting that verdicts compare against X, and `upgrade` and the offer are refused. A newer install for another scope only does not trigger it.

| Runs for you | Setups |
|--------------|--------|
| Quick, on sonnet | semble, agent-deadline, agent-router, manager, docsync, agent-return |
| Long, on the owner's model | teams (scripts and header only, tuning stays interactive), superreview, task-board, memory-sync |

The report offers the upgrade with the question `Upgrade N setups now?`: `Upgrade all N`, `Only the quick ones (K)` (shown only when some, but not all, of the setups are quick) or `No, just the report`. Setups that apply to every project of your profile are marked in the question.

Before the first setup runs, a run line gives the counts, for example `Rows to run: 4: 3 class A on sonnet, 1 class B on the owner's model; 🌐 agent-return-setup: every project of this profile`. Class A is the quick group, class B the long one. Each setup being upgraded in your user config gets a `🌐` part, because its upgrade reaches every project of the profile; a part that counts 0 drops out of the line.

The upgrade passes `--unattended` to each setup's own `upgrade` (ten of the eleven setups accept it; `convention-setup` does not). Under the flag a setup asks nothing: a gate that would ask is declined and reported as pending, a precondition it would ask about makes it skip with nothing written, and it ends with one `RESULT` line that the runner reads.

Setups run one at a time, in the run-list order, and each upgrader is awaited before the next step: in the foreground where Claude Code's Agent tool supports it, otherwise the run waits for that upgrader's completion notification. The plan has one row per team that is not current (teams-setup) and one per installed scope that is not current (agent-deadline-setup and agent-return-setup: project and global), so a setup can appear more than once.

Each row is checked before and after: only the setup's own files may change, and the git HEAD and the stash count must not move. Runtime files that hooks and Claude Code write meanwhile (logs, telemetry, state, plans, reports) never count as out-of-scope writes. A second probe of the setup is the verdict, not the subagent's claim. The first failure stops the run, and so does a scope check that cannot run (it fails without naming a path); the setups after it are listed as commands. The skill never reverts, resets, stashes or commits.

It never runs `install`, `enable`, `uninstall`, `purge`, `--force`, the convention interview, or a re-copy over a file you edited. Those stay in a list headed `Run these yourself, one per session`, ordered by run stage, each with its reason: convention-setup, hand-modified files (a disabled setup whose copied files differ counts too), custom registration, parked setups, a missing scope or team name, a subagent limit in your session. In `default` and `acceptEdits` mode Claude Code asks before each write the upgraders make into `.claude/`, and `dontAsk` denies it: approve the prompts as they appear. The skill itself changes one setting: the `CLAUDE_CODE_ENABLE_TODO_TOOLS` key in `settings.json` (global or this project, your pick), and only after you accept the task-tools offer.

Where each part lives:

| File | Holds |
|------|-------|
| [SKILL.md](SKILL.md) | The roster and the phases: probes, stamps, classification, output |
| [references/phase1-probes.md](references/phase1-probes.md) | The artifact, registration, disable-switch and task-tools probes |
| [references/phase2-stamps.md](references/phase2-stamps.md) | The stamp list and the byte pairs compared |
| [references/row-notes.md](references/row-notes.md) | Per-setup exceptions and what each mode clears |
| [references/signals.md](references/signals.md) | The two signals and the phase that reads each |
| [references/run-list.md](references/run-list.md) | The run-list order |
| [scripts/upgrade-plan.mjs](scripts/upgrade-plan.mjs) | The upgrade plan |
| [references/upgrade-runner.md](references/upgrade-runner.md) | The upgrade runner |
| [references/update-flow.md](references/update-flow.md), [scripts/update-flow.mjs](scripts/update-flow.mjs) | The update flow shared with `/brewtools:plugin-update` |
| [references/artifact-metadata.md](references/artifact-metadata.md) | The stamp format |

Not covered: recurring tools such as agents, skills, rules, text-optimize and publish have no installed state.

## Related

- [Full documentation](https://doc-claude.brewcode.app/brewcode/skills/setup-status/)
- [Setup Upgrader agent](https://doc-claude.brewcode.app/brewcode/agents/setup-upgrader/)
- [Convention Setup](../convention-setup/README.md)
- [Brewcode overview](../../README.md)
