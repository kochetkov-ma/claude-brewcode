**New: Claude Code mods.** Type `++r` before your request and Claude reviews each significant change, double-checks every finding and fixes only the confirmed ones. [Watch it in the console (GIF)](https://brewcode.app/mods/placeholders.gif) · [Prompt placeholders](https://brewcode.app/mods/placeholders/)

❗ **Update Claude Code first:** the mods need Claude Code 2.1.301 or newer. Run `claude update`, restart Claude Code (exit, run `claude`), check with `claude --version`.

**Update with Claude: paste this prompt into Claude Code**

```text
Check `claude --version`. Below 2.1.301 (the mods need it), run `claude update`, then stop and tell me to restart Claude Code and paste this prompt again. Otherwise run `claude plugin list` and note the installed brewcode plugin and mod versions. To update to the latest release (__TAG__ or newer): if brewtools is installed, run `/brewtools:plugin-update` and show me its report; if not, read https://raw.githubusercontent.com/kochetkov-ma/claude-brewcode/main/UPDATE.md and follow it. Then explain in plain words what changed (the report's "What changed for you", else the sections of https://raw.githubusercontent.com/kochetkov-ma/claude-brewcode/main/RELEASE-NOTES.md for every version newer than the one I had), recommend what I should try first, and tell me to type `/reload-plugins` and, in each project, `/brewcode:setup-status upgrade`.
```

How to update and use it well: [UPDATE.md](https://github.com/kochetkov-ma/claude-brewcode/blob/main/UPDATE.md) · [Recommended flow](https://doc-claude.brewcode.app/recommended-flow/)

**Update by hand** (Claude Code):

```bash
claude --version
claude update      # if it is older; restart Claude Code afterwards
claude plugin marketplace update claude-brewcode
claude plugin update <name>@claude-brewcode   # once per installed plugin: brewmod-placeholders, brewmod-plan-effort, brewcode, brewdoc, brewtools, brewui
```

Or run `/brewtools:plugin-update`: it updates the installed plugins and mods, offers the missing mods and plugins once and prints what changed for you. Either way, finish with `/reload-plugins` and, in each project, `/brewcode:setup-status upgrade` (it brings the setups generated there current).

**Install** (Claude Code 2.1.301 or newer), then run `/reload-plugins`. A paste-in prompt for the same commands: [Install in 30 seconds](https://github.com/kochetkov-ma/claude-brewcode#install-in-30-seconds).

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewmod-placeholders@claude-brewcode   # prompt shortcuts: ++r, ++m, your own
claude plugin install brewmod-plan-effort@claude-brewcode    # higher effort while Claude plans
claude plugin install brewcode@claude-brewcode
claude plugin install brewdoc@claude-brewcode
claude plugin install brewtools@claude-brewcode
claude plugin install brewui@claude-brewcode
```

**Docs:** [Getting started](https://doc-claude.brewcode.app/getting-started/) · [Mods](https://doc-claude.brewcode.app/mods/overview/) · [Prompt placeholders](https://doc-claude.brewcode.app/mods/placeholders/) · [Plan-mode effort](https://doc-claude.brewcode.app/mods/plan-effort/) · [brewcode.app](https://brewcode.app/)
