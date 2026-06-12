---
auto-sync: enabled
auto-sync-date: 2026-06-12
auto-sync-type: doc
---

# Text Humanizer

Universal, context-aware humanizer. It removes AI surface artifacts (chat scaffolding, fake tickets, unicode, trivial docs that restate a name) and fits the text to its register -- code, technical docs, published articles, or reddit/chat. It does NOT claim to detect AI authorship.

## Quick Start

```bash
/brewtools:text-human [path|commit|folder|text] [custom instructions]
```

## How it works

### Phase 0 -- greedy flow detection
At the start the skill picks exactly ONE flow from context and announces it (`Flow: <name> -- <why>`), then lazy-loads only that flow file plus the pattern sections it needs.

| Flow | Domain | Inject stage |
|------|--------|--------------|
| code | source, comments, docstrings, JavaDoc/JSDoc/KDoc | OFF (formal contract) |
| docs | README, guides, PR/commit, changelogs | ON, restrained (terse for PR/commit) |
| social | reddit, forum, slack, discord, chat | ON, casual |
| article | formal essay, published blog, long-form | ON, burstiness + stance |
| mixed | commit / folder dispatcher | per-file routing |

Detection priority: explicit intent keywords (RU+EN) -> path/extension -> content sniff.

### Two-pass model
- PASS 1 STRIP: remove validated AI tells. HIGH-tier acts on single hits; MED density-signals act only on clusters; behavior-changing items (hallucinated refs, fake tickets) are surfaced for review, never auto-edited.
- PASS 2 INJECT (gated): apply human style for the domain. HARD-OFF for code and API docs. Never injects typos, errors, or fabricated references.

## Arguments

The first token is parsed as scope when it resolves to a path or a 7+ hex git hash; the rest is a custom prompt. Otherwise the whole input is treated as a prompt (the text to humanize may be inline). The custom prompt both selects/overrides the flow and adds rules. No args -> it asks what to humanize.

| Input shape | Result |
|-------------|--------|
| File path | code/docs/article flow on one file, direct |
| Commit hash | mixed flow, all changed files |
| Folder | mixed flow, parallel blocks |
| Free text | flow inferred from the text + intent |
| Path + prompt | scope + custom rules |
| No args | interactive fallback |

## Examples

```bash
# Code -- strip AI tells, normalize unicode, inject OFF
/brewtools:text-human src/main/java/com/example/OrderService.java

# JavaDoc / API docs -- clean-only sub-profile
/brewtools:text-human clean the javadoc in PaymentApi.java

# Commit -- mixed flow routes each file to its domain
/brewtools:text-human 3be67487

# Reddit reply -- casual injection, sparse emoji, lowercase
/brewtools:text-human review this reddit reply: <text>

# Blog post -- burstiness + real stance
/brewtools:text-human humanize this blog post: <text>

# Custom prompt overrides defaults
/brewtools:text-human src/ only strip AI artifacts, no inject
/brewtools:text-human 3be67487 also drop all @author tags
```

## What it strips (PASS 1)

| Category | Example | Tier |
|----------|---------|------|
| Chat scaffolding | "Certainly!", "I hope this helps", "Here's the rewritten..." | HIGH |
| AI self-attribution | `// AI-generated`, `# Claude suggestion`, bot trailers | HIGH |
| Prompt residue | `// Replace with your...` placeholder narration | HIGH |
| Unicode in code/text | em-dash, arrows, smart quotes -> ASCII | HIGH |
| Trivial doc/comment | `// Loop through users`, `@param userId The user ID` | density |
| Excess-vocab cluster | delve, leverage, seamless, landscape (co-occurring) | MED cluster only |
| Promotional/template prose | "In today's fast-paced world", "plays a significant role" | HIGH/MED |

## What it surfaces (never auto-edits)

Hallucinated package/method/URL refs, fabricated tickets, try/except-everything, empty catch-all, placeholder TODO logic, duplicated abstractions, happy-path-only tests, CI gaming. These change meaning -- they are reported, not changed.

## What it keeps

WHY comments, public API docs, real project tickets (INTELDEV-12345, JIRA-456), `@throws` with conditions, structural SQL/YAML banners, complex algorithm explanations, BDD comments.

## Injection (PASS 2, per flow)

| Signal | reddit | chat | docs | commit/PR | article | code/API |
|--------|--------|------|------|-----------|---------|----------|
| Burstiness | high | high | med | low | high | OFF |
| Contractions | high | high | OK | low | high | FORBIDDEN |
| Stance | high | med | none | grounded-why | high | FORBIDDEN |
| Emoji | rare | incidental | no | no | no | no |
| Inject stage | ON | ON | ON | ON terse | ON | OFF |

## Output

A **Humanization Report**: flow, scope, files/blocks, haiku/sonnet split, per-file strip/inject counts, a surfaced-for-review section, and totals. Files are edited in place -- use git to revert.

## Documentation

Full docs: [text-human](https://doc-claude.brewcode.app/brewtools/skills/text-human/)
