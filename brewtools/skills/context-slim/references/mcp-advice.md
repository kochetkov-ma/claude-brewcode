# MCP Advice

Advice only. This skill NEVER mutates MCP config, plugin enablement, or `settings.json` -- see `references/measurement.md` "Never counted / never touched". Every rule below renders into the report's Advice section (template at the end); nothing here is auto-applied.

## Tool-count threshold

Measured sample (this session, 2026-08-16): the `Read` tool's own schema (verbose, multi-paragraph description) = 464 tok. A typical thinner MCP tool schema (short one-line description, few params) runs ~120-200 tok; no live full schema dump was available to average further, so the working constant below is a documented midpoint, not a fleet average.

| Constant | Value |
|----------|-------|
| Working schema cost | ~200 tok/tool (mid-point estimate) |
| Loaded-schema estimate | `live_tool_count * 200` potential context proxy; definitions can be prompt-cached, so context size differs from billed uncached input |

The following 2026-08-16 recommendations are historical heuristics, not current default-setting commands.

| Live tool count | Fixed tax/turn | Advice |
|------------------|-----------------|--------|
| < 15 | < 3.0k tok | Leave `ENABLE_TOOL_SEARCH` off -- deferral's downsides (extra round trip, degraded non-native discovery) outweigh a sub-3k tax |
| 15-24 | 3.0k-4.8k tok | Borderline -- enable only if 2+ MCP servers ship heavy (multi-tool, verbose) schemas |
| >= 25 | >= 5.0k tok | Enable `ENABLE_TOOL_SEARCH` -- fixed tax exceeds the deferral's own overhead |

## ToolSearch trade-off

Current Claude tool search is on by default subject to model/backend/policy support; do not override
that default solely from the historical 15/25-tool heuristic above. Tool definitions are cacheable;
measure active loading/cache counters and discovery reliability before recommending changes.

Historical local evidence: `~/.claude/CLAUDE.md`, verified 2026-07-26; not current universal gains.

| Fact | Number |
|------|--------|
| `ENABLE_TOOL_SEARCH=true` | Defers schemas, loads on demand -- saves ~80k tok in a heavy multi-MCP setup |
| Cost | Custom non-native MCP tool discovery drops to ~56-88% hit rate |
| Fix | `alwaysLoad: true` per affected server -- exempts it from deferral |

Server configuration example for project `.mcp.json` (user scope: `~/.claude.json`), not `settings.json`.
Only suggest `alwaysLoad` for measured under-discovery; blanket loading defeats deferral. This skill
never applies the example or promises the historical 80k saving:

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

Count actual registered hook emissions, not installed plugins. Current source (2026-09-30):
`REMINDER_TEXT`472 B/proxy118; forced-eval fires at eligible prompts1,10,20,..., skips meta replies
and unavailable counters; role-recall fires only on compaction. Old636 B/proxy159 per-prompt sample
is historical. Codeword-gated `manager-prompt.mjs` adds text only when triggered.

| Signal | Arithmetic | Threshold | Advice |
|--------|------------|-----------|--------|
| Active plugins w/ always-fire hooks (P) | Historical heuristic `P * 150` proxy/prompt, `* 50` session estimate; replace with actual payload x emissions | P >= 6 (old proxy >=900/prompt, >=45k/session) | Audit actual registered/cadenced emissions before suggesting redundant-hook cleanup |
| | | P < 6 | Not worth the audit |

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
| Live tool count | <N>, active search/cache state | >=25 historical heuristic | Evaluate tool search/discovery; suggest alwaysLoad:true only for measured missed <servers>, no fixed savings promise |
| Active plugins w/ hooks | <P> | >=6 | Audit/disable: <list> |
| Memory dir staleness | <pct>% | >=60% | Set CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 |
```

Render only rows whose measured value crosses its threshold. All rows below threshold -> omit the whole Advice section, do not print an empty/all-clear table.

Current authorities (checked 2026-09-30): https://code.claude.com/docs/en/mcp and
https://platform.claude.com/docs/en/build-with-claude/prompt-caching.
