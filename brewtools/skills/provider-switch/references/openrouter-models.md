# OpenRouter — Model Selection

## How It Works
OpenRouter aggregates 200+ models. The alias sets default models for each Claude Code role (opus/sonnet/haiku).
User can customize which model fills each role.

## Recommended Models by Category

### Coding (best for Claude Code)
| Model ID | Context | Price (in/out $/1M) | Notes |
|----------|---------|---------------------|-------|
| qwen/qwen3.6-plus[1m] | 1M | ~$0.50/$2.00 | Top coding, use [1m] suffix |
| z-ai/glm-5.1 | 200K | $1.40/$4.40 | #1 SWE-bench Pro |
| z-ai/glm-4.5 | 200K | $0.60/$2.20 | Good balance |
| deepseek/deepseek-r1 | 128K | $0.55/$2.19 | Strong reasoning |

### Budget / Free
| Model ID | Context | Price | Notes |
|----------|---------|-------|-------|
| qwen/qwen3.6-plus-preview:free | 1M | FREE | Rate-limited |
| qwen/qwen3-coder:free | 262K | FREE | Code-focused |
| meta-llama/llama-3.3-70b-instruct:free | 128K | FREE | General |
| z-ai/glm-4.5-air | 200K | $0.14/$1.10 | Very cheap |

### General Purpose
| Model ID | Context | Price (in/out $/1M) | Notes |
|----------|---------|---------------------|-------|
| google/gemini-2.5-pro | 1M | $1.25/$10.00 | Strong all-round |
| anthropic/claude-sonnet-4 | 200K | $3.00/$15.00 | Via OpenRouter credits |
| minimax/minimax-m2.7 | 200K | $0.30/$1.20 | Cheapest decent |

## Selection Flow (AskUserQuestion)

For each role (opus, sonnet, haiku), ask user to pick:
1. "Which model for [ROLE] role?" with top 4 options from coding category
2. Allow "Other" for custom model ID input

## Context Window Note
Add `[1m]` suffix to model ID if the model supports >200K context.
Without it, Claude Code caps autocompact at 200K.
