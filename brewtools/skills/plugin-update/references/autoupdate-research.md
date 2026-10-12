# Plugin Auto-Update Research

Per [When auto-update runs](https://code.claude.com/docs/en/plugins/loading#when-auto-update-runs) (CC 2.1.296):

- **Scope:** per marketplace, not per plugin.
- **Default:** OFF for third-party marketplaces, claude-brewcode included; ON for Anthropic's official ones (except `knowledge-work-plugins`, `first-party-plugins`) and marketplaces added from claude.ai.
- **Toggle:** `/plugin` → Marketplaces → select marketplace → **Enable auto-update** / **Disable auto-update**. It writes `autoUpdate` on the marketplace's `known_marketplaces.json` entry (plugins root), and on its `extraKnownMarketplaces` entry when a settings file declares one.
- **Precedence:** settings `extraKnownMarketplaces` `autoUpdate` > `known_marketplaces.json` `autoUpdate` > default.
- **Timing:** after the first message of an interactive session, a random delay of up to ten minutes; the running session keeps the versions it loaded until `/reload-plugins`.
- **Env vars:** `DISABLE_UPDATES=1`, `DISABLE_AUTOUPDATER=1` or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` turn the whole pass off and hide the toggle, unless `FORCE_AUTOUPDATE_PLUGINS=1` is also set.

## Rule for This Skill

**Do NOT patch** `settings.json` or `known_marketplaces.json`: no CLI command sets the flag, and the UI keeps both stores consistent. Instruct the user to use the `/plugin` UI.
