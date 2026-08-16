# Mode: STATUS

Read-only status check of E2E testing infrastructure.

## T1: Agent Scan

Scan `.claude/agents/e2e-*.md`:
- Count agents found
- List each with: name, model (from frontmatter), last modified date

## T2: Rules Scan

Scan for E2E rules:
- `.claude/e2e/e2e-rules.md` (`{config.rulesPath}`) — exists? rule count? **Absent = broken install:
  every e2e agent stops on its Rules Loading Protocol. Report it as the top finding.**
- `${CLAUDE_SKILL_DIR}/references/e2e-rules.md` — the plugin baseline; rule count, for comparison only
- `.claude/rules/e2e-*.md` — condensed project export? count?

## T3: Config Check

Read `.claude/e2e/config.json`:
- If not found → report "Not configured. Run `/brewcode:e2e install`."
- If found → extract: stack, testFramework, testSourceDir, scenarioDir, `content_version`, `version`,
  `generated_by`, `last_updated`
- Compare the stamped `content_version` (headline) against the `CONTENT_VERSION:` line Phase 0's
  `detect-mode.sh` printed — **never against `PLUGIN_VERSION:`**. The two counters move
  independently: `PLUGIN_VERSION` bumps on every release, `CONTENT_VERSION` only when this skill's
  own content changed, so comparing across them flags every current install as stale and `rules`
  can never clear it. `version` rides along as provenance — display it, but it no longer decides
  current/stale on its own
- No `content_version` key at all → a pre-`content_version` install: read `version` against
  `PLUGIN_VERSION:` as the fallback headline, and say the fallback is in use
- No `version` key either → a pre-standard install (it carried `lastSetup`); report it as
  `stale (legacy, unstamped)`

> **Never print `unknown` as a version.** It is not a reading, it is the absence of one, and it sorts
> against real semver — a reader that accepts it turns a failed lookup into a confident verdict. A
> missing stamp is `stale (legacy, unstamped)`; the running version can never be missing, because
> Phase 0's `detect-mode.sh` hard-fails instead of emitting a placeholder.

## T4: Artifact Scan

Scan configured paths:
- Scenarios at `{config.scenarioDir}/`: count, list by domain/directory
  - Per scenario: title (from frontmatter), status (draft/approved/automated), priority
- Tests at `{config.testSourceDir}/`: count E2E test files
  - Pattern: files matching `*E2E*`, `*e2e*`, `*EndToEnd*` or in e2e subdirectory

## T5: Output Status Table

```markdown
# E2E Status

## Infrastructure
| Component | Status | Details |
|-----------|--------|---------|
| Agents | {N}/5 configured | {list} |
| Base rules | {exists/missing} | {N} rules |
| Project rules | {exists/missing} | {N} rules |
| Config | {exists/missing} | stack: {X}, framework: {Y} |

## Artifacts
| Type | Count | Location |
|------|-------|----------|
| Scenarios (draft) | {N} | {path} |
| Scenarios (approved) | {N} | {path} |
| Scenarios (automated) | {N} | {path} |
| Test files | {N} | {path} |

## Freshness
| Item | Version | Last updated |
|------|---------|--------------|
| Config (`.claude/e2e/config.json`) | {config.content_version, or config.version on a pre-`content_version` install} | {config.last_updated} |
| Rules (`{config.rulesPath}` frontmatter) | {content_version} | {last_updated} |
| Skill content (running) | {CONTENT_VERSION} | -- |
| Plugin (running) | {PLUGIN_VERSION} | -- |
| Last scenario | -- | {file mtime} |
| Last test | -- | {file mtime} |

## Recommendations
- {if agents < 5}: "Missing agents. Run `/brewcode:e2e install`."
- {if scenarios with status=approved but no test}: "Approved scenarios without tests. Run `/brewcode:e2e create`."
- {if config.content_version != CONTENT_VERSION}: "Setup generated from skill content {config.content_version}, running {CONTENT_VERSION}. Run `/brewcode:e2e rules` to refresh."
- {if config.content_version missing but config.version present}: "Config predates the `content_version` stamp. Falling back to `version` {config.version} vs running {PLUGIN_VERSION}. Run `/brewcode:e2e rules` to stamp it."
- {if config.version missing too}: "Setup predates the artifact-metadata standard (no `version` key) — reported `stale (legacy, unstamped)`. Run `/brewcode:e2e rules` to refresh and stamp it."
```

> **Staleness compares like with like: stamped `content_version` vs running `CONTENT_VERSION`.** The
> old rule fired on `lastSetup > 30 days` — which flagged a perfectly current setup every month and
> stayed silent on the case that matters, a release the day after install. Comparing the stamp to
> `PLUGIN_VERSION` is just as wrong in the other direction: the two counters differ by design
> whenever a release did not touch this skill, so the recommendation fires forever and `rules`
> re-stamps the same value it just flagged. Only `version` — on a pre-`content_version` install
> that has no other stamp — is compared to `PLUGIN_VERSION`. Dates stay in the table as
> information; they never trigger a recommendation.

No AskUserQuestion — purely informational output.
