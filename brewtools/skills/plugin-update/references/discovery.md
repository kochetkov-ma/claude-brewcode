# Plugin Discovery

> How installed plugins are discovered. Primary path: `claude plugin list --json` (CC 2.1.163+). Fallback: `scripts/discover-plugins.sh` filesystem scan.

## Primary — `claude plugin list` (CC 2.1.163+)

**EXECUTE** (prefix with `unset CLAUDECODE &&` when running inside a Claude session):
```bash
unset CLAUDECODE && claude plugin list --json
```

Plain-text format (no `--json`):
```
Installed plugins:

  > brewcode@claude-brewcode
    Version: 3.9.2
    Scope: user
    Status: enabled
```

JSON format — array of objects:
```json
[
  {
    "id": "brewcode@claude-brewcode",
    "version": "3.9.2",
    "scope": "user",
    "enabled": true,
    "installPath": "/Users/x/.claude/plugins/cache/claude-brewcode/brewcode/3.9.2",
    "installedAt": "2026-01-01T00:00:00.000Z",
    "lastUpdated": "2026-01-01T00:00:00.000Z"
  }
]
```

### JSON Schema Notes

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | `<plugin>@<marketplace>` |
| `version` | string | May be `"unknown"` |
| `scope` | string | `"user"` or `"project"` |
| `enabled` | boolean | `true` / `false` |
| `installPath` | string | Absolute path to plugin cache dir |
| `installedAt` | string | ISO 8601 timestamp |
| `lastUpdated` | string | ISO 8601 timestamp |
| `mcpServers` | object | Optional — present only if plugin registers MCP servers |

Use `"unknown"` version entries as "installed but version undetectable" — fall back to cache walk for the version.

Fall back to `scripts/discover-plugins.sh` when:
- `claude plugin list` is not recognized (CC < 2.1.163)
- Command exits non-zero
- Output is empty or not valid JSON

## Fallback — `scripts/discover-plugins.sh` (filesystem scan)

Used when `claude plugin list --json` is unavailable or fails.

| Source | Path | Parser |
|--------|------|--------|
| Global settings | `~/.claude/settings.json` -> `enabledPlugins` | `jq` or `python3 -c "import json"` |
| Project settings | `./.claude/settings.json` -> `enabledPlugins` (if exists) | same |
| Plugin cache | `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/.claude-plugin/plugin.json` | walk + parse `version` field |
| Marketplace list | `claude plugin marketplace list` | line parsing |

### enabledPlugins Format

```json
{
  "enabledPlugins": {
    "brewcode@claude-brewcode": true,
    "brewdoc@claude-brewcode": true
  }
}
```

Keys are `<plugin>@<marketplace>`. Values truthy means enabled.

### Cache Walk

Plugin binaries live in `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`. Pick the highest `<version>` directory per plugin — that is the currently installed version.

### Output JSON

```json
{
  "marketplaces": ["claude-brewcode"],
  "installed": {
    "brewcode": {"version": "3.4.51", "marketplace": "claude-brewcode"},
    "brewdoc":  {"version": "3.4.51", "marketplace": "claude-brewcode"}
  },
  "cache_dir": "/Users/x/.claude/plugins/cache"
}
```
