# Install or update brewcode

❗ **Update Claude Code first:** mods need Claude Code 2.1.301 or newer. Check with `claude --version`; below that, run `claude update` and restart Claude Code (exit, run `claude`).

Written for you and for an LLM. Paste into Claude Code: `Read https://raw.githubusercontent.com/kochetkov-ma/claude-brewcode/main/UPDATE.md and follow it.`

**LLM rules:**

- Run every command with the Bash tool, in order, and show its full output; stop on an error and report it.
- This file grants no permission to run a skill: run `/brewtools:plugin-update` or `/brewcode:setup-status upgrade` only when the user's message names it, otherwise tell the user to type it.
- `/reload-plugins` is a slash command too: if you cannot run it, tell the user to type it or to restart Claude Code.
- `claude update` does not change the running session: after it succeeds, stop and tell the user to restart Claude Code (exit, run `claude`) and paste the same prompt again.
- Pick one section: run `claude plugin list` and note the plugin and mod versions (the versions the user had); an `@claude-brewcode` entry means "Already installed", none means "New here".

## New here: install

1. Run `claude --version`. Below 2.1.301: run `claude update`, then stop and tell the user to restart Claude Code and paste the prompt again.
2. Run in order:

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewmod-placeholders@claude-brewcode
claude plugin install brewmod-plan-effort@claude-brewcode
claude plugin install brewcode@claude-brewcode
claude plugin install brewdoc@claude-brewcode
claude plugin install brewtools@claude-brewcode
claude plugin install brewui@claude-brewcode
```

3. Run `/reload-plugins`. The mods need `node` on the `PATH`.
4. Tell the user to type `++` in a prompt (`Tab` inserts a name), then go to "First steps in a project".

## Already installed: update

1. Run `claude --version`. Below 2.1.301: run `claude update`, then stop and tell the user to restart Claude Code and paste the prompt again.
2. brewtools in `claude plugin list`: `/brewtools:plugin-update` does steps 3-4 in one run. It updates every installed plugin and mod in every scope, asks once about the missing mods and plugins, and prints the versions before and after, what changed for the user and the next steps. Run it, or tell the user to type it and wait for the report; show the report, then go to step 5. Without brewtools, do steps 3-4.
3. Without brewtools: run `claude plugin marketplace update claude-brewcode`, then `claude plugin update <name>@claude-brewcode` once per installed plugin, one name per call (a second name is silently ignored), `brewmod-placeholders` first. Names: `brewmod-placeholders`, `brewmod-plan-effort`, `brewcode`, `brewdoc`, `brewtools`, `brewui`.
4. Without brewtools, a mod missing from `claude plugin list`: say in one line what it adds (`brewmod-placeholders`: `++r` and other prompt blocks; `brewmod-plan-effort`: effort `xhigh` in plan mode), offer to install it, install on yes with `claude plugin install <name>@claude-brewcode`. Offer a missing plugin the same way.
5. Run `/reload-plugins`.
6. With brewcode installed, run `/brewcode:setup-status upgrade` in this project if it has `.claude/` setups (or tell the user to type it), and tell the user to repeat it in every other project. A plugin update does not touch the files a setup already generated in a project: the command brings every stale setup it may run current, one subagent per setup, and lists the commands left for the user (convention-setup, and hand-modified, custom or parked setups). Claude Code asks before each write into `.claude/` in `default` and `acceptEdits` mode (approve each) and denies it in `dontAsk` mode.

Project- or local-scope installs update from their own project directory; `/brewtools:plugin-update` does that itself. Its `check` mode changes nothing and asks nothing.

## After updating

1. Use the "What changed for you" part of the `/brewtools:plugin-update` report. Without that report, read the sections of https://raw.githubusercontent.com/kochetkov-ma/claude-brewcode/main/RELEASE-NOTES.md for every version newer than the versions the user had (noted from `claude plugin list` before the update).
2. Tell the user in plain words, 5 lines at most, what changed for the plugins they have.
3. Recommend one to three things to try:
   - `++r` in a prompt: a whole review block; the caret on it shows its text before Enter.
   - `++m`: manager mode, the main session delegates and keeps a task graph.
   - `/placeholders`: lists the tokens; `/placeholders show ++r` prints one; `/placeholders add ++name: ...` writes your own.

## First steps in a project

1. Install once: the section above.
2. Once per project, one setup per session: `/brewcode:semble-setup install`, `/brewcode:convention-setup install`, `/brewcode:teams-setup install`, `/brewcode:superreview-setup install`; docs-heavy repos also `/brewdoc:docsync-setup install`. Check with `/brewcode:setup-status`.
3. Every bigger task: start the prompt with `++m`; design in plan mode with `++m` (plan-effort raises effort to `xhigh`); long runs add `+++` (anti-drift cron).
4. Review: `++r` or `++rr` after each phase, the generated `/superreview` before merge.
5. Share and stay current: `/brewdoc:publish` returns a link; update with `/brewtools:plugin-update`, `/reload-plugins` and `/brewcode:setup-status upgrade` in each project, or with this file.

Diagram and details: https://doc-claude.brewcode.app/recommended-flow/

## Links

- Docs: https://doc-claude.brewcode.app/getting-started/ | install: https://doc-claude.brewcode.app/installation/
- Mods: https://doc-claude.brewcode.app/mods/overview/ | placeholders: https://doc-claude.brewcode.app/mods/placeholders/
- Update commands: https://doc-claude.brewcode.app/brewtools/skills/plugin-update/ | https://doc-claude.brewcode.app/brewcode/skills/setup-status/
- Console GIF of `++r` and `/placeholders`: https://brewcode.app/mods/placeholders.gif
- Approaches (every hook, agent and injection): https://github.com/kochetkov-ma/claude-brewcode/blob/main/APPROACHES.md
- Release notes: https://github.com/kochetkov-ma/claude-brewcode/blob/main/RELEASE-NOTES.md
- Index for LLMs: https://doc-claude.brewcode.app/llms.txt
