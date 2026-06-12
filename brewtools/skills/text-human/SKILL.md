---
name: brewtools:text-human
description: Humanizes code, docs, articles, reddit/chat, javadoc -- strips AI artifacts, fixes unicode, injects context-fit human style. Triggers - humanize, ai artifacts, unicode fix, article, reddit, javadoc, text.
argument-hint: [path|commit|folder|text] [custom instructions]
user-invocable: true
allowed-tools: [Read, Write, Edit, Grep, Glob, Bash, Task, AskUserQuestion]
---

# Text Humanizer

Universal, context-aware humanizer. Works on source code, comments, docstrings, technical docs, commits/PRs, published articles, and reddit/chat text. It picks ONE flow from context, lazy-loads only that flow plus the relevant pattern sections, and runs a two-pass model: STRIP validated AI tells, then a gated INJECT of human style fit for the domain.

Position: removes AI surface artifacts and fits register -- it does NOT claim to detect authorship.

## Two-pass model (applies to every flow)

- PASS 1 -- STRIP: remove validated AI tells per `@reference/ai-patterns.md`. Only HIGH-tier universal-strip acts on single instances. MED density-signals act ONLY when several co-occur. Behavior-changing items (hallucinated refs, fake tickets, try/except-everything) are SURFACED for review, never auto-edited.
- PASS 2 -- INJECT (gated): apply `@reference/human-patterns.md` for the flow's domain. HARD-OFF for code / API / formal-contract. GLOBAL GUARD: never inject typos, errors, or fabricated references in any flow.

---

## Phase 0 -- Greedy flow detection (do this FIRST)

Before any processing, parse the argument, pick exactly ONE flow, and ANNOUNCE it:

`Flow: <name> -- <one-line why>`

Then greedy-load ONLY the chosen flow file plus the pattern sections it needs (lazy -- not everything).

### Argument parsing (universal)
Accept all of: path, commit hash, folder, free-text prompt, path+prompt, no args.

1. Take the first token. If it resolves to an existing path OR matches a 7+ hex git hash -> that is `scope`, the rest is `customPrompt`.
2. Otherwise the WHOLE input is a `customPrompt` (the text to humanize may be inline, or it may describe intent). Flow is detected from the prompt + any inline content.
3. `customPrompt` both selects/overrides the flow AND adds custom rules (highest priority on conflict).
4. No args at all -> AskUserQuestion fallback is allowed ONLY here ("What to humanize?" -> commit / file / folder / paste text). Prefer inferring whenever possible.

### Detection signals (priority order)
1. Explicit intent keywords in the prompt (RU+EN):
   - reddit / forum / slack / discord / chat / чат / форум -> social
   - javadoc / jsdoc / kdoc / docstring / "api doc" / апи док -> code (CLEAN-ONLY sub-profile)
   - pr / pull request / commit / changelog / readme / docs / guide / коммит / документация -> docs
   - article / blog / essay / post / статья / эссе -> article
   - commit hash, or folder of mixed files -> mixed
2. Path / extension:
   - `.java/.kt/.py/.ts/.tsx/.js/.jsx/.go/.rs/.cpp/...` -> code
   - `.md/.mdx/.rst` -> docs; sniff content: long-form essay/blog -> article
   - 7+ hex git hash -> mixed
   - folder -> mixed
3. Content sniff:
   - short fragmented lines / no caps -> social
   - structured prose paragraphs with a thesis -> article
   - imperative + code blocks -> docs

### Flow -> file
| Flow | Load | Domain |
|------|------|--------|
| code | `@reference/flows/code.md` | source, comments, docstrings, JavaDoc/JSDoc/KDoc (inject OFF) |
| docs | `@reference/flows/docs.md` | README, docs, guides, PR/commit (inject restrained) |
| social | `@reference/flows/social.md` | reddit, forum, slack, discord, chat |
| article | `@reference/flows/article.md` | formal essay, published blog, long-form |
| mixed | `@reference/flows/mixed.md` | commit / folder dispatcher -> routes each file to its flow |

Pattern files (load the sections the flow needs): `@reference/ai-patterns.md`, `@reference/human-patterns.md`.

---

## Phase 1 -- Execute the flow

- Single file or inline text -> apply the chosen flow's rules directly, no Task delegation.
- mixed (commit / folder) -> follow `@reference/flows/mixed.md`: block split, haiku/sonnet classification, parallel Task launch, JSON aggregation. Each file is routed to its correct flow's rules.

Custom prompt, when present, is prepended to direct processing and to every sub-agent Task prompt:
```
CUSTOM INSTRUCTIONS (highest priority, override defaults):
<customPrompt>
---
```

---

## Output -- Humanization Report

```
## Humanization Report

Flow: <name>

### Summary
| Metric | Value |
|--------|-------|
| Scope | <file|commit|folder|text> |
| Files / blocks | N / M |
| Haiku / Sonnet | X / Y |

### Results
[per-file or per-block: stripped, injected, surfaced]

### Surfaced for review (NOT auto-applied)
[file:line -- issue]  e.g. hallucinated ref, fabricated ticket, try/except-everything

### Totals
| Metric | Count |
|--------|-------|
| AI tells stripped | X |
| Human edits injected | Y |
| Items surfaced | Z |
| Unicode normalized | W |
```

Files are edited in place. No backups -- use git to revert.

## Error handling
| Error | Action |
|-------|--------|
| Agent timeout | Continue with other blocks |
| File read error | Skip, note in report |
| Binary file | Skip, note in report |
| No changes | Report "No humanization required" |

## Examples
```bash
/text-human src/main/java/OrderService.java          # code flow, single file
/text-human 3be67487                                 # mixed flow, commit
/text-human src/main/java/services/                  # mixed flow, folder
/text-human review this reddit reply: <text>         # social flow, inline text
/text-human humanize this blog post: <text>          # article flow
/text-human clean the javadoc in PaymentApi.java     # code flow, CLEAN-ONLY
/text-human 3be67487 also drop all @author tags      # mixed + custom rule
/text-human src/ only strip AI artifacts, no inject   # custom prompt overrides
```
