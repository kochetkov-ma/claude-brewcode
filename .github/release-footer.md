**Install** (Claude Code), then run `/reload-plugins`:

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewcode@claude-brewcode
claude plugin install brewdoc@claude-brewcode
claude plugin install brewtools@claude-brewcode
# mods need Claude Code 2.1.301+: run `claude update` first
claude plugin install brewmod-placeholders@claude-brewcode   # mod: ++m ++r prompt placeholders
claude plugin install brewmod-plan-effort@claude-brewcode    # mod: higher effort in plan mode
```

**Update:** `/brewtools:plugin-update`, or `claude plugin marketplace update claude-brewcode` then `claude plugin update <name>@claude-brewcode`, then `/reload-plugins`.

**Docs:** [Getting started](https://doc-claude.brewcode.app/getting-started/) · [Mods](https://doc-claude.brewcode.app/mods/overview/) · [Prompt placeholders](https://doc-claude.brewcode.app/mods/placeholders/) · [Plan-mode effort](https://doc-claude.brewcode.app/mods/plan-effort/) · [brewcode.app](https://brewcode.app/)
