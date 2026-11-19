---
paths:
  - "brewdoc/skills/publish/**"
  - "skills/brewpage-publish/**"
  - "openclaw/brewpage-publish/**"
  - ".codex/scripts/sync-brewpage-publish.mjs"
  - "RELEASE-NOTES.md"
---

# BrewPage skill distribution

| Destination | Shipped source folder |
|---|---|
| Claude Code BrewDoc plugin | `brewdoc/skills/publish/` |
| Tessl and other compatible standalone catalogs | `skills/brewpage-publish/` |
| OpenClaw and ClawHub | `openclaw/brewpage-publish/` |

Edit shared behavior in BrewDoc and regenerate the standalone copies with `node .codex/scripts/sync-brewpage-publish.mjs`. Validate each host's frontmatter and keep permissions limited to its actual tools. The generic entry uses a scalar `allowed-tools` field.

Before submitting, pin the destination's exact version and source commit. Check the actual package members and modes, relative references, tool permissions, and owner-token history and recovery exclusions. Read back the published version, installed contents, and provider assessment independently.
