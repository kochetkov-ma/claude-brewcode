# Plugin Discovery

> How `scripts/discover-plugins.sh` determines installed plugins without `claude plugin list`.

## ⚠️ Warning

**Do NOT use `claude plugin list` — it does not exist as a CLI subcommand.**
Only `claude plugin install|update|uninstall|marketplace` are valid.

## Discovery Sources

| Source | Path | Parser |
|--------|------|--------|
| Global settings | `~/.claude/settings.json` → `enabledPlugins` | `jq` or `python3 -c "import json"` |
| Project settings | `./.claude/settings.json` → `enabledPlugins` (if exists) | same |
| Plugin cache | `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/.claude-plugin/plugin.json` | walk + parse `version` field |
| Marketplace list | `claude plugin marketplace list` | line parsing |

## enabledPlugins Format

```json
{
  "enabledPlugins": {
    "brewcode@claude-brewcode": true,
    "brewdoc@claude-brewcode": true
  }
}
```

Keys are `<plugin>@<marketplace>`. Values truthy means enabled.

## Cache Walk

Plugin binaries live in `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`. Pick the highest `<version>` directory per plugin — that's the currently installed version.

## Output JSON

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
