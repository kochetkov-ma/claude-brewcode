---
paths:
  - "brewdoc/skills/publish/**"
  - "skills/brewpage-publish/**"
  - "skills/brewpage-publish-safe/**"
  - "openclaw/brewpage-publish/**"
  - ".codex/scripts/sync-brewpage-publish.mjs"
  - "RELEASE-NOTES.md"
---

# BrewPage skill distribution

| Destination | Shipped source folder |
|---|---|
| Claude Code BrewDoc plugin | `brewdoc/skills/publish/` |
| Tessl and other compatible standalone catalogs | `skills/brewpage-publish/` |
| Skillstore Safe | `skills/brewpage-publish-safe/` |
| OpenClaw and ClawHub | `openclaw/brewpage-publish/` |

Edit shared behavior in BrewDoc and regenerate the standalone copies with `node .codex/scripts/sync-brewpage-publish.mjs`. Validate each host's frontmatter and keep permissions limited to its actual tools. The generic entry uses a scalar `allowed-tools` field.

Skillstore Safe is a separate REST package. Use its `VERSION` and `skillstore-safe-vX.Y.Z` tags. Keep its credential handling in private OS application state. Preserve the regular variants' private receipt delivery, and verify their package bytes when publishing a Safe-only release.

Before submitting, pin the destination's exact version and source commit. Check the actual package members and modes, relative references, tool permissions, and owner-token history and recovery exclusions. Read back the published version, installed contents, and provider assessment independently.
