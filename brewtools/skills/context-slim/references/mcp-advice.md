# MCP Advice

Advice only. This skill NEVER mutates MCP config, plugin enablement, or `settings.json` -- see `references/measurement.md` "Never counted / never touched". Every rule below renders into the report's Advice section (template at the end); nothing here is auto-applied.

## Tool-count threshold

Working schema cost: ~200 tok per MCP tool (midpoint: a thin one-line schema runs ~120-200 tok, the
verbose `Read` schema measured 464 tok). Loaded-schema estimate = `live_tool_count * 200`, a context
proxy; definitions can be prompt-cached, so billed uncached input differs.

With `ENABLE_TOOL_SEARCH` unset, Claude Code defers all MCP tools. They load upfront when
`ENABLE_TOOL_SEARCH=false`, on a non-first-party `ANTHROPIC_BASE_URL`, on Microsoft Foundry, and on
Agent Platform models older than Claude 4.5; `auto` loads upfront while definitions fit in 10% of
context. Advise only when tools load upfront:

| Live tool count | Fixed tax/turn | Advice |
|------------------|-----------------|--------|
| < 25 | < 5.0k tok | None |
| >= 25 | >= 5.0k tok | Evaluate `ENABLE_TOOL_SEARCH=auto` or `true` where the backend forwards `tool_reference` blocks |

## ToolSearch trade-off

Deferral costs discovery: a custom MCP server's tools can be missed (local sample: ~56-88% hit rate).
Fix per affected server with `alwaysLoad: true`, which exempts it from deferral; suggest it only for
measured under-discovery, since blanket loading defeats deferral. Server config lives in project
`.mcp.json` (user scope: `~/.claude.json`), not `settings.json`. This skill never applies it or
promises a fixed saving:

```json
{
  "mcpServers": {
    "<server-name>": {
      "command": "...",
      "args": ["..."],
      "alwaysLoad": true
    }
  }
}
```

## Plugin-count advice

Count registered hook emissions (payload x firing cadence), not installed plugins: a codeword-gated
hook (brewtools `manager-prompt.mjs`) adds text only when triggered, a `compact`-matcher hook only
after compaction.

| Signal | Arithmetic | Threshold | Advice |
|--------|------------|-----------|--------|
| Active plugins w/ always-fire hooks (P) | Rough `P * 150` proxy/prompt; replace with actual payload x emissions | P >= 6 | Audit actual registered/cadenced emissions before suggesting redundant-hook cleanup |
| | | P < 6 | Not worth the audit |
| Synced claude.ai skills (`anthropic-skills:<name>` in the skill list) | one listing entry each | >= 1 the user does not use in the terminal | `syncClaudeAiSkills: false` in user or local settings (ignored in `.claude/settings.json`) |

## Auto-memory advice

`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` when the memory dir is "mostly junk", defined numerically: >= 60% of entries (by count) are stale (no mtime/git-log touch in 90 days) or duplicate/superseded facts.

| Ratio | Advice |
|-------|--------|
| stale/total >= 0.60 | Recommend the env var over continued pruning |
| stale/total < 0.60 | Prefer pruning (delete-first, non-growth) -- `memory-sync-setup` already owns that workflow |

Measure: `entries_total` = memory-dir file count; `entries_stale` = files with no mtime change and no git-log touch in the last 90 days.

## Output shape

Exact rendering template for the final run report's Advice section:

```
## Advice (informational, not applied)
| Signal | Measured | Threshold | Recommendation |
|--------|----------|-----------|-----------------|
| Live tool count | <N>, loaded upfront | >=25 | Evaluate tool search; suggest alwaysLoad:true only for measured missed <servers>, no fixed savings promise |
| Active plugins w/ hooks | <P> | >=6 | Audit/disable: <list> |
| Synced claude.ai skills | <S> unused | >=1 | Set syncClaudeAiSkills: false |
| Memory dir staleness | <pct>% | >=60% | Set CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 |
```

Render only rows whose measured value crosses its threshold. All rows below threshold -> omit the whole Advice section, do not print an empty/all-clear table.

Authorities: https://code.claude.com/docs/en/mcp and
https://platform.claude.com/docs/en/build-with-claude/prompt-caching.
