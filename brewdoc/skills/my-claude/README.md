# My Claude

Documents your Claude Code installation: local setup, external hook/context architecture, or any Claude Code topic researched across the web.

```
/brewdoc:my-claude              # your local setup
/brewdoc:my-claude ext          # hook/context/agent architecture
/brewdoc:my-claude ext context  # context injection schema
/brewdoc:my-claude r <query>    # research a topic
```

The argument is one free-form prompt (RU or EN). A prefix (`ext`, `external`, `r `, `research `) wins; otherwise the most distinct keyword picks the mode, a tie asks once, no match falls back to Internal.

| Mode | Trigger | What it does |
|------|---------|--------------|
| Internal | no arguments | Scans the config dir (`CLAUDE_CONFIG_DIR`, default `~/.claude/`) and the project; secret values never copied |
| External | `ext` or `external` | Local hooks plus official docs, releases, forums |
| External (context-schema) | `ext context` | `additionalContext`, `updatedInput`, `decision` |
| Research | `r <query>` or `research <query>` | Docs, GitHub, Reddit, forums, marketplaces, with citations |

## Output

Files go to `.claude/brewdoc/my-claude/` in the project (`YYYYMMDD_my-claude-internal.md`, `..._external.md`, `external/..._context-schema.md`, `..._research-{slug}.md`); each run appends to `.claude/brewdoc/INDEX.jsonl`. An independent agent re-checks paths, counts, and sources. Writes under `.claude/` are protected: Claude Code asks in `default` and `acceptEdits`, allows under `bypassPermissions`.

## Documentation

Full docs: [my-claude](https://doc-claude.brewcode.app/brewdoc/skills/my-claude/)
