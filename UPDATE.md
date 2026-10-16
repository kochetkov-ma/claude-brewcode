# Install or update brewcode

❗ **Update Claude Code first:** mods need Claude Code 2.1.301 or newer — `claude --version`; below that run `claude update`.

Written for you and for an LLM. Paste into Claude Code: `Read https://raw.githubusercontent.com/kochetkov-ma/claude-brewcode/main/UPDATE.md and follow it.`

**LLM rules:** run every command with the Bash tool, in order, and show its full output; stop on an error and report it; finish with `/reload-plugins` (a slash command: if you cannot run it, tell the user to type it or to restart Claude Code). Pick one section: run `claude plugin list`; an `@claude-brewcode` entry means "Already installed", none means "New here".

## New here: install

1. Run `claude --version`. Below 2.1.301: run `claude update`, then restart Claude Code.
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

1. Run `claude --version`. Below 2.1.301: run `claude update`, then restart Claude Code.
2. Run `claude plugin marketplace update claude-brewcode`.
3. Run `claude plugin update <name>@claude-brewcode` once per installed plugin, one name per call (a second name is silently ignored). Names: `brewmod-placeholders`, `brewmod-plan-effort`, `brewcode`, `brewdoc`, `brewtools`, `brewui`.
4. A mod missing from `claude plugin list`: say in one line what it adds (`brewmod-placeholders`: `++r` and other prompt blocks; `brewmod-plan-effort`: effort `xhigh` in plan mode), offer to install it, install on yes with `claude plugin install <name>@claude-brewcode`. Offer a missing plugin the same way.
5. Run `/reload-plugins`.

Project- or local-scope installs update from their own project directory. `/brewtools:plugin-update` does steps 2-3 with a status table (`check` is read-only) and never installs a mod.

## After updating

1. Read https://github.com/kochetkov-ma/claude-brewcode/releases/latest.
2. Tell the user in plain words, 5 lines at most, what changed for the plugins they have.
3. Recommend one to three things to try:
   - `++r` in a prompt: a whole review block; the caret on it shows its text before Enter.
   - `++m`: manager mode, the main session delegates and keeps a task graph.
   - `/placeholders`: lists the tokens; `/placeholders show ++r` prints one; `/placeholders add ++name: ...` writes your own.
4. Files a setup already generated in a project are not replaced by a plugin update: run `/brewcode:setup-status` and follow the commands it prints.

## First steps in a project

1. Install once: the section above.
2. Once per project, one setup per session: `/brewcode:semble-setup install`, `/brewcode:convention-setup install`, `/brewcode:teams-setup install`, `/brewcode:superreview-setup install`; docs-heavy repos also `/brewdoc:docsync-setup install`. Check with `/brewcode:setup-status`.
3. Every bigger task: start the prompt with `++m`; design in plan mode with `++m` (plan-effort raises effort to `xhigh`); long runs add `+++` (anti-drift cron).
4. Review: `++r` or `++rr` after each phase, the generated `/superreview` before merge.
5. Share and stay current: `/brewdoc:publish` returns a link; update with this file or `/brewtools:plugin-update`.

Diagram and details: https://doc-claude.brewcode.app/recommended-flow/

## Links

- Docs: https://doc-claude.brewcode.app/getting-started/ | install: https://doc-claude.brewcode.app/installation/
- Mods: https://doc-claude.brewcode.app/mods/overview/ | placeholders: https://doc-claude.brewcode.app/mods/placeholders/
- Console GIF of `++r` and `/placeholders`: https://brewcode.app/mods/placeholders.gif
- Approaches (every hook, agent and injection): https://github.com/kochetkov-ma/claude-brewcode/blob/main/APPROACHES.md
- Release notes: https://github.com/kochetkov-ma/claude-brewcode/blob/main/RELEASE-NOTES.md
- Index for LLMs: https://doc-claude.brewcode.app/llms.txt
