# Update Protocol (maintainer-only, hidden mode)

## Purpose

Verify and refresh provider reference data: models, pricing, endpoints, context windows. Run periodically or when provider announces changes.

## Per-Provider Sources

### Z.ai / GLM
| Check | Source | Method |
|-------|--------|--------|
| Models | `https://docs.z.ai/guides/overview/pricing` | WebFetch |
| Models | `https://open.bigmodel.cn/dev/api/normal-model/glm-5` | WebFetch |
| Pricing | Same as above | WebFetch |
| Endpoint | `https://api.z.ai/api/anthropic/v1/messages` (test call) | Bash curl |
| Live test | `curl -s -X POST https://api.z.ai/api/anthropic/v1/messages -H "x-api-key: $ZAI_API_KEY" -H "content-type: application/json" -H "anthropic-version: 2023-06-01" -d '{"model":"glm-5.1","max_tokens":10,"messages":[{"role":"user","content":"ping"}]}'` | Bash |

### Qwen / DashScope
| Check | Source | Method |
|-------|--------|--------|
| Models | `https://www.alibabacloud.com/help/en/model-studio/claude-code` | WebFetch |
| Models | `https://help.aliyun.com/zh/model-studio/getting-started/models` | WebFetch |
| Pricing | Same pages | WebFetch |
| New releases | WebSearch: `Qwen latest model release site:alibabacloud.com OR site:qwenlm.github.io` | WebSearch |

### MiniMax
| Check | Source | Method |
|-------|--------|--------|
| Models | `https://platform.minimax.io/docs/guides/text-ai-coding-tools` | WebFetch |
| Pricing | `https://platform.minimax.io/pricing` | WebFetch |
| New releases | WebSearch: `MiniMax new model 2026 site:platform.minimax.io` | WebSearch |

### OpenRouter
| Check | Source | Method |
|-------|--------|--------|
| Models | `https://openrouter.ai/api/v1/models` (JSON API) | WebFetch |
| Top coding models | WebSearch: `best coding models OpenRouter 2026` | WebSearch |
| Free models | Filter JSON response: `pricing.prompt == "0"` | Parse |
| Pricing changes | Compare fetched data vs current reference | Diff |

## Update Flow

1. Spawn 4 Explore agents in parallel (one per provider)
2. Each agent: WebFetch sources, extract model list + pricing + endpoint status
3. Aggregate results
4. For each provider where data changed:
   - Show diff to maintainer (current vs fetched)
   - Update reference file via Edit tool
5. If OpenRouter model recommendations changed — update openrouter-models.md
6. Update SKILL.md status table default models if needed
7. Run check-status.sh to verify no breakage

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
- common.md structure (env var names are stable)
- User's ~/.zshrc (never touch during update)

## Live Test Template

For each provider, verify endpoint still responds:
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST "${ENDPOINT}/v1/messages" \
  -H "x-api-key: ${API_KEY}" \
  -H "content-type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"MODEL_ID","max_tokens":5,"messages":[{"role":"user","content":"hi"}]}' \
  && echo " OK" || echo " FAILED"
```

Adjust headers per provider (x-api-key for Z.ai, Authorization: Bearer for others).
