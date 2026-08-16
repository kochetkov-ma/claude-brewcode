# MCP Advice

Advice only. This skill NEVER mutates MCP config, plugin enablement, or `settings.json` -- see `references/measurement.md` "Never counted / never touched". Every rule below renders into the report's Advice section (template at the end); nothing here is auto-applied.

## Tool-count threshold

Measured sample (this session, 2026-08-16): the `Read` tool's own schema (verbose, multi-paragraph description) = 464 tok. A typical thinner MCP tool schema (short one-line description, few params) runs ~120-200 tok; no live full schema dump was available to average further, so the working constant below is a documented midpoint, not a fleet average.

| Constant | Value |
|----------|-------|
| Working schema cost | ~200 tok/tool (mid-point estimate) |
| Fixed tax | `live_tool_count * 200`, resent every turn (schemas are not cached across turns) |

| Live tool count | Fixed tax/turn | Advice |
|------------------|-----------------|--------|
| < 15 | < 3.0k tok | Leave `ENABLE_TOOL_SEARCH` off -- deferral's downsides (extra round trip, degraded non-native discovery) outweigh a sub-3k tax |
| 15-24 | 3.0k-4.8k tok | Borderline -- enable only if 2+ MCP servers ship heavy (multi-tool, verbose) schemas |
| >= 25 | >= 5.0k tok | Enable `ENABLE_TOOL_SEARCH` -- fixed tax exceeds the deferral's own overhead |

## ToolSearch trade-off

Source: `~/.claude/CLAUDE.md`, verified 2026-07-26.

| Fact | Number |
|------|--------|
| `ENABLE_TOOL_SEARCH=true` | Defers schemas, loads on demand -- saves ~80k tok in a heavy multi-MCP setup |
| Cost | Custom non-native MCP tool discovery drops to ~56-88% hit rate |
| Fix | `alwaysLoad: true` per affected server -- exempts it from deferral |

Recommended `settings.json` shape (apply ONLY to servers actually under-discovered; blanket `alwaysLoad` on every server cancels the 80k saving):

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

Each installed plugin carrying an always-fire hook (`UserPromptSubmit`, `SessionStart`) injects text on EVERY matching event, not once. Measured sample: brewcode's `forced-eval.mjs`/`role-recall.mjs` inject 159 tok/prompt (`REMINDER_TEXT`, 636 B, always fires); codeword-gated hooks (brewtools `manager-prompt.mjs`) add more only when triggered, not counted in the always-fire baseline.

| Signal | Arithmetic | Threshold | Advice |
|--------|------------|-----------|--------|
| Active plugins w/ always-fire hooks (P) | `P * 150` tok/prompt (measured avg), `* 50` for a session estimate | P >= 6 (>= 900 tok/prompt, >= 45k/session) | Audit: disable or merge redundant hook logic |
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
| Live tool count | <N> | >=25 | Enable ENABLE_TOOL_SEARCH (~80k tok saved); alwaysLoad:true for <servers> |
| Active plugins w/ hooks | <P> | >=6 | Audit/disable: <list> |
| Memory dir staleness | <pct>% | >=60% | Set CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 |
```

Render only rows whose measured value crosses its threshold. All rows below threshold -> omit the whole Advice section, do not print an empty/all-clear table.
