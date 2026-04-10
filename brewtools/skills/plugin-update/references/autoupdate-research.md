# Plugin Auto-Update Research

## Current State (verified 2026-04-10)

Per [Claude Code plugin docs](https://code.claude.com/docs/en/discover-plugins):

- **Default:** Third-party marketplace auto-update is **OFF**.
- **Toggle UI:** `/plugin` → Marketplaces → select marketplace → toggle auto-update.
- **Scope:** Auto-update is per-marketplace, not per-plugin.
- **Env vars:**
  - `DISABLE_AUTOUPDATER=1` — disables Claude Code self-updater
  - `FORCE_AUTOUPDATE_PLUGINS=1` — force plugin update on next start

## Unknown

The exact `settings.json` key that stores the per-marketplace auto-update flag is **NOT verified**. Candidates observed in the wild (all unconfirmed):

- `marketplaces.<name>.autoUpdate`
- `pluginMarketplaces.<name>.autoUpdate`
- `enabledMarketplaces.<name>.autoUpdate`

## Recommended Discovery Procedure

To discover the real key:

1. Snapshot `~/.claude/settings.json` before toggling.
2. Open `/plugin` → Marketplaces → claude-brewcode → enable auto-update.
3. Diff `~/.claude/settings.json` — the new/changed key is the answer.
4. Document the key here and update the skill to patch settings.json directly.

## Rule for This Skill

**Do NOT patch settings.json blindly.** The skill instructs the user to use `/plugin` UI until the key is confirmed.

## Links

- https://code.claude.com/docs/en/discover-plugins
- https://code.claude.com/docs/en/plugin-marketplaces
- https://code.claude.com/docs/en/plugins-reference
