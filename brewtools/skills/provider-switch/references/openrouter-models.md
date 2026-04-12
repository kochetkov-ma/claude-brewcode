---
auto-sync: enabled
auto-sync-date: 2026-04-12
auto-sync-type: doc
auto-sync-override: |
  sources: https://openrouter.ai/api/v1/models
  focus: top coding models, free models, pricing changes, new releases
  preserve: ## Selection Flow, ## Context Window Note
---

# OpenRouter — Model Selection

## How It Works
OpenRouter aggregates 200+ models. The alias sets ONE model for all three Claude Code roles (opus/sonnet/haiku).
User picks a single model during setup — it is used everywhere.

## Recommended Models by Category

### Coding (best for Claude Code)
| Model ID | Context | Price (in/out $/1M) | Notes |
|----------|---------|---------------------|-------|
| qwen/qwen3.6-plus[1m] | 1M | ~$0.33/$1.95 | Top coding, 1M context (Recommended) |
| z-ai/glm-5.1 | 200K | $1.40/$4.40 | #1 SWE-bench Pro |
| qwen/qwen3-coder-plus | 1M | $0.65/$3.25 | Code-focused, 1M context |
| deepseek/deepseek-r1 | 128K | $0.55/$2.19 | Strong reasoning |

### Budget / Free
| Model ID | Context | Price | Notes |
|----------|---------|-------|-------|
| qwen/qwen3-coder:free | 262K | FREE | Code-focused, rate-limited |
| qwen/qwen3-next-80b-a3b-instruct:free | 262K | FREE | General, rate-limited |
| minimax/minimax-m2.5:free | 196K | FREE | Rate-limited |
| google/gemma-4-26b-a4b-it:free | 262K | FREE | Lightweight |

### General Purpose
| Model ID | Context | Price (in/out $/1M) | Notes |
|----------|---------|---------------------|-------|
| google/gemini-2.5-pro | 1M | $1.25/$10.00 | Strong all-round |
| minimax/minimax-m2.7 | 200K | $0.30/$1.20 | Cheapest decent |
| qwen/qwen3.5-flash-02-23 | 1M | $0.065/$0.26 | Ultra-cheap, fast |

## Model Validation

When user enters a custom model ID, verify it exists on OpenRouter:

**EXECUTE** using Bash tool:
```bash
curl -s "https://openrouter.ai/api/v1/models" -H "Authorization: Bearer $OPENROUTER_API_KEY" | python3 -c "
import json, sys
data = json.load(sys.stdin)
target = 'USER_MODEL_ID'
matches = [m for m in data.get('data', []) if m['id'] == target]
if matches:
    m = matches[0]
    p = m.get('pricing', {})
    print(f'FOUND: {m[\"id\"]}  ctx={m.get(\"context_length\",\"?\")}  prompt=\${p.get(\"prompt\",\"?\")}  completion=\${p.get(\"completion\",\"?\")}')
else:
    # Fuzzy search
    fuzzy = [m for m in data.get('data', []) if target.lower() in m['id'].lower()][:5]
    print(f'NOT_FOUND: {target}')
    if fuzzy:
        print('Did you mean:')
        for m in fuzzy:
            print(f'  {m[\"id\"]}')
" && echo "OK validate" || echo "FAILED validate"
```

Replace `USER_MODEL_ID` with the user's input. If NOT_FOUND — show suggestions and re-ask.

## Selection Flow (AskUserQuestion)

Ask user to pick ONE model (used for all roles):
1. "Which model to use?" with top 4 options from coding category
2. Allow "Other" for custom model ID input

The selected model is set as OPUS, SONNET, and HAIKU simultaneously.

## Context Window Note
Add `[1m]` suffix to model ID if the model supports >200K context.
Without it, Claude Code caps autocompact at 200K.
