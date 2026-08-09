# semble test fixtures (shared, read-only)

Owned by unit A. Every suite may **read** these; nobody may edit another unit's
subdir. Units B/C/D/E add their own material under `fixtures/<unit-letter>/`.

Fixtures are **never** used in place: copy them into the suite's temp base, then
substitute the placeholders below. Nothing here may be mutated by a test.

## Placeholders

| Placeholder | Replace with |
|-------------|--------------|
| `__PROJECT_ROOT__` | the temp project root (`SEMBLE_PROJECT_ROOT`, already `pwd -P` resolved) |
| `__CACHE_ROOT_CODE__` | the temp code cache root (`SEMBLE_CACHE_ROOT_CODE`) |

A global string replace is enough; both placeholders appear only inside JSON
string values.

## Layout

```text
repo-a/        py, ts, tsx, sh, java, kt, kts, gradle, groovy, css, yaml, toml,
               properties  +  html and package.json to prove the exclusions
repo-b/        a second, different tree - proves two repos map to two hash dirs
claude-json/   one ~/.claude.json per detection state (DESIGN 6.2)
settings/      settings.json inputs for the hook-merge suite
```

### `repo-a` coverage expectations (DESIGN 7)

| Bucket | Files |
|--------|-------|
| code | `src/auth_service.py`, `src/session.ts`, `web/LoginPanel.tsx`, `build.sh`, `src/TokenStore.java`, `src/Router.kt`, `build.gradle.kts`, `settings.gradle`, `conf/deploy.groovy`, `web/theme.css` |
| config | `conf/service.yaml`, `pyproject.toml`, `conf/application.properties` |
| docs only (not in `code config`) | `web/index.html` |
| excluded from every content type | `package.json` |

Every file is >= 128 bytes and non-blank, so none is dropped by semble's
size filter. `repo-b` adds `notes.md` (docs) on top of two code files, one
config file and one shell script.

### `claude-json/*.json` -> `sc_mcp_state` verdict

| File | Verdict |
|------|---------|
| `absent.json` | `absent` |
| `correct.json` | `correct` |
| `stale.json` | `stale_args` (unpinned `--from semble[mcp]`, default cache root) |
| `wrongscope.json` | `wrong_scope` (only under `.projects[root].mcpServers`) |
| `duplicate.json` | `duplicate` (user + local) |
| `upstream.json` | `upstream_unpinned` (a server literally named `semble`) |
| `malformed.json` | `malformed` (trailing comma - deliberately unparseable) |

`correct.json`, `wrongscope.json` and `duplicate.json` hardcode the pin
`0.5.4`, so a suite using them must **not** set `SEMBLE_PIN_VERSION`.

### `settings/*.json`

| File | Purpose |
|------|---------|
| `empty.json` | `{}` - the greenfield merge |
| `foreign.json` | unrelated `PreToolUse`/`SubagentStop` hooks + `permissions.allow` entries that must survive byte-identical |
| `stale-path.json` | semble hook entries under an old `.claude/hooks-old/` dir, mixed with a foreign entry in the same matcher block |
| `malformed.json` | truncated - every merge must ABORT and write nothing |
