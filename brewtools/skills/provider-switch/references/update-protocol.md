# Update Protocol (maintainer-only, hidden mode)

Refresh all five providers' dated models/prices/context/endpoints from official sources. Preserve selections/auth/runtime; use unauthenticated metadata and offline/mock checks, without paid inference or inferred billing.

## Official Sources

WebFetch these pages/public JSON; use WebSearch restricted to each provider's official domains for new releases. Compare event/publication dates, then diff fetched values against references. Never infer authenticated endpoint success from metadata.

| Provider | Models/prices/context | Integration / compatibility |
|----------|-----------------------|-----------------------------|
| DeepSeek | `https://api-docs.deepseek.com/quick_start/pricing/`; releases `https://api-docs.deepseek.com/news/` | `https://api-docs.deepseek.com/guides/anthropic_api/` |
| Z.ai | `https://docs.z.ai/guides/overview/pricing`; `https://open.bigmodel.cn/en/dev/api/normal-model/glm-5` | `https://docs.z.ai/devpack/tool/claude` |
| Qwen | `https://www.alibabacloud.com/help/en/model-studio/model-pricing`; `https://help.aliyun.com/zh/model-studio/getting-started/models` | `https://www.alibabacloud.com/help/en/model-studio/claude-code` |
| MiniMax | `https://platform.minimax.io/docs/guides/pricing-paygo` | `https://platform.minimax.io/docs/token-plan/claude-code`; caching `https://platform.minimax.io/docs/api-reference/text-prompt-caching` and `https://platform.minimax.io/docs/api-reference/anthropic-api-compatible-cache` |
| OpenRouter | `https://openrouter.ai/api/v1/models` | Provider model/integration docs; catalog presence is not Claude compatibility |

Keep region/product/input-tier/cache scope with each price. OpenRouter free means both prompt/completion pricing are `"0"`; rate/availability limits still apply. Coding candidates need verified ids/caps; no unsupported quality rank.

## Update Flow

1. From MAIN only, spawn five bounded Explore agents in parallel: DeepSeek, Z.ai, Qwen/DashScope, MiniMax and OpenRouter. They do not re-delegate.
2. Each fetches official sources and reports date/source, model id, context, direct-vs-aggregator prices, tiers/cache rules, endpoint/product/region compatibility and unavailable evidence. No keys/paid requests/runtime edits.
3. Aggregate all five; preserve source disagreements and historical values as dated evidence, never treat absence/unverified metadata as model retirement.
4. For each provider where data changed:
   - Show diff to maintainer (current vs fetched)
   - Update reference file via Edit tool
5. If OpenRouter model recommendations changed — update openrouter-models.md
6. Update SKILL.md status table default models if needed
7. Run mocked provider suites and safe catalog/injection fixtures. `check-status.sh` reads configuration only; use an isolated HOME fixture for validation. Separate source edits, static checks, live metadata and untested authenticated runtime.

## What to Update in References

| Field | File | Line pattern |
|-------|------|-------------|
| Model IDs | `{provider}.md` | `| opus | MODEL |` rows |
| Pricing | `{provider}.md` | `| $/1M |` columns |
| Endpoint URL | `{provider}.md` | `| Endpoint |` row |
| Context window | `{provider}.md` | Context column |
| Alias body | `{provider}.md` | ` ```bash` block |
| Free models | `openrouter-models.md` | Budget table |
| Recommended models | `openrouter-models.md` | Coding/General tables |

## What NOT to Update

- SKILL.md phases/logic (only status table defaults)
- Scripts (detect-mode.sh, check-status.sh, write-alias.sh)
- Common auth/model core and required provider flags (structure may be condensed without semantic loss)
- User's ~/.zshrc (never touch during update)

## Live Test Template

Authenticated inference requires explicit provider/key/spend authorization. Prefer `scripts/verify-providers.sh`; create no credentials or runtime changes. For a manual test, structured Write saves `.claude/provider-switch/live-request.json` (`model`, `max_tokens: 5`, one user `hi` message); model text stays JSON data. Resolve ENDPOINT from the approved provider/region/product reference. Send the auth header on stdin, never argv:
```bash
printf 'header = "x-api-key: %s"\n' "$(printf '%s' "${API_KEY}" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')" \
  | curl -s -K - -o /dev/null -w "%{http_code}" -X POST "${ENDPOINT}/v1/messages" \
  -H "content-type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  --data-binary @.claude/provider-switch/live-request.json \
  && echo " OK" || echo " FAILED"
```

Adjust the header NAME per provider (`x-api-key` for Z.ai, `Authorization: Bearer <key>` for others) —
it stays inside the stdin config either way. Never move it back to a `-H` argument.
