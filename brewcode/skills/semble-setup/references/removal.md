# Removal flavours — `brewcode:semble-setup`

Moved verbatim from `SKILL.md` `uninstall`: read it before the flavour question (`uninstall`, `purge`).

| Flavour | Rule / hooks / CLAUDE.md | MCP | Agent frontmatter | Cache | uv tool |
|---------|--------------------------|-----|-------------------|-------|---------|
| `integration` | removed | **kept** | semble entries removed | kept | kept |
| `mcp` | kept | removed | kept | kept | kept |
| `cli` | kept | kept | kept | kept | `uv tool uninstall semble` |
| `purge` | removed | removed | removed | this project's entry removed; shared root kept unless empty | `uv tool uninstall semble` |

Settings entries are unwired before any hook file is deleted (a wired entry on a missing file fails every event); if unwiring fails nothing is deleted and the flavour stops there. After `integration` or `purge`, a `settings:` or `guidance:` line in `.failed`/`.skipped` means the removal is incomplete: quote it, name what survived, never report it complete. A clean removal also deletes install's empty stubs (`CLAUDE.md` = `# CLAUDE.md`, blank `.gitignore`, empty `.claude/hooks`/`.claude/rules`, a `settings.json` that held only semble entries, an empty `.claude/`). `purge` also deletes the MCP rollback copies (`.claude.json.bak.<epoch>`, `.mcp.json.bak.<epoch>`) its verified removal took; `mcp` lists them under `unchanged`.
