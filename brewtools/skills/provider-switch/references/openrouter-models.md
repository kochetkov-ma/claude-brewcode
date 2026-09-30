# OpenRouter — Model Selection

## How It Works
The user-selected model serves all three Claude Code roles (opus/sonnet/haiku). Preserve selections; catalog refresh never authorizes model/auth/runtime changes.

## Catalog Snapshot — 2026-09-30

[Unauthenticated public models API](https://openrouter.ai/api/v1/models), checked 2026-09-30. Context is the exact reported token count; USD input/output per million are API `pricing.prompt`/`completion` multiplied by 1,000,000. These are OpenRouter route prices, not direct-provider prices or a quality ranking; re-fetch before selection. Long-context/cache/route overrides may change billed rates.

### Coding candidates
| Model ID | Context | Price (in/out $/1M) | Notes |
|----------|---------|---------------------|-------|
| qwen/qwen3.7-max | 1,000,000 | $1.475/$4.425 | User-selectable |
| z-ai/glm-5.2 | 1,048,576 | $0.41/$3.99 | Provider-reported SWE-bench Pro 62.1%; not a route benchmark ([source](https://z.ai/blog/glm-5.2)) |
| deepseek/deepseek-v4-pro | 1,048,576 | $0.783/$1.566 | User-selectable |
| moonshotai/kimi-k2.7-code | 262,144 | $0.6712/$3.35 | Code variant |
| qwen/qwen3.7-plus | 1,000,000 | $0.32/$1.28 | At >=256,000 prompt tokens: $0.96/$3.84 |
| minimax/minimax-m3 | 1,048,576 | $0.30/$1.20 | User-selectable |

### Budget / Free
| Model ID | Context | Price | Notes |
|----------|---------|-------|-------|
| nvidia/nemotron-3-ultra-550b-a55b:free | 1,000,000 | $0/$0 | Free route; rate/availability limits apply |
| google/gemma-4-31b-it:free | 262,144 | $0/$0 | Free route; rate/availability limits apply |
| google/gemma-4-26b-a4b-it:free | 262,144 | $0/$0 | Free route; rate/availability limits apply |

### General Purpose
| Model ID | Context | Price (in/out $/1M) | Notes |
|----------|---------|---------------------|-------|
| google/gemini-3.5-flash | 1,048,576 | $1.50/$9.00 | Text rates; modality/tool fees differ |
| deepseek/deepseek-v4-flash | 1,048,576 | $0.07854/$0.15708 | Catalog route id; direct-provider aliases differ |
| anthropic/claude-opus-4.8 | 1,000,000 | $5/$25 | Cache/tool charges additional |

## Model Validation

Verify EVERY selected id (menu/default/custom) with the public GET; send NO key. Create `.claude/provider-switch/` with private permissions, then use the structured Write tool to write `model-request.json` containing `{ "model_id": <JSON-encoded user string> }`. User text is DATA: never interpolate it into shell/Python source, double-quoted commands or an alias body. The paths/program below are fixed; request content changes only through JSON serialization.

**EXECUTE** using Bash tool:
```bash
set -euo pipefail
curl --fail --silent --show-error --max-time 30 "https://openrouter.ai/api/v1/models" \
  -o .claude/provider-switch/catalog.json
python3 - <<'PY'
import json
import re
from pathlib import Path

root = Path('.claude/provider-switch')
target = json.loads((root / 'model-request.json').read_text())['model_id']
if not isinstance(target, str) or not target:
    raise SystemExit('FAILED validate: nonempty model_id string required')
if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*(?:/[A-Za-z0-9][A-Za-z0-9._-]*)+(?::[A-Za-z0-9][A-Za-z0-9._-]*)?(?:\[1m\])?', target):
    raise SystemExit('FAILED validate: invalid catalog/client model id syntax')
catalog_id = target[:-4] if target.endswith('[1m]') else target
models = json.loads((root / 'catalog.json').read_text())['data']
matches = [model for model in models if model['id'] == catalog_id]
result = {'status': 'NOT_FOUND', 'requested_model': target, 'catalog_id': catalog_id}
if matches:
    model = matches[0]
    result.update(status='FOUND', context=model.get('context_length'), pricing=model.get('pricing', {}))
else:
    result['suggestions'] = [model['id'] for model in models if catalog_id.lower() in model['id'].lower()][:5]
print(json.dumps(result, ensure_ascii=True))
PY
```

Require successful GET/JSON parsing and `status: FOUND`; `NOT_FOUND` -> show suggestions and re-ask. Preserve the requested id; `[1m]` is a Claude client suffix, not a catalog id. A failed request/parser is verification failure, never model absence. Read data files; never source/eval them. For alias creation use the main skill's safe writing flow; do not substitute user text into shell templates.

## Selection Flow (AskUserQuestion)

Ask user to pick ONE model (used for all roles):
1. "Which model to use?" with up to four currently verified coding candidates
2. Allow "Other" for custom model ID input

The selected model is set as OPUS, SONNET, and HAIKU simultaneously.

## Context Window Note
Catalog context does not prove the client's configured context. For >200K, verify current Claude/provider extended-context support before offering `[1m]`; validate the unsuffixed catalog id while preserving the user's chosen client id. Never append the suffix or change a configured selection automatically.
