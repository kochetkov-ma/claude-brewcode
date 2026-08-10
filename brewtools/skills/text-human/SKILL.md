---
name: text-human
description: "Humanizes code, docs, articles, reddit/chat, javadoc -- strips AI artifacts, fixes unicode, fits register. Triggers: humanize, ai artifacts, unicode fix, article, reddit, javadoc."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [path|commit|folder|text] [custom instructions]"
allowed-tools: [Read, Write, Edit, Grep, Glob, Bash, Agent, AskUserQuestion]
model: sonnet
---

# Text Humanizer

Universal, context-aware humanizer. Works on source code, comments, docstrings, technical docs, commits/PRs, published articles, and reddit/chat text. It picks ONE flow from context, lazy-loads only that flow plus the relevant pattern sections, and runs a two-pass model: STRIP validated AI tells, then a gated INJECT of human style fit for the domain.

Position: removes AI surface artifacts and fits register -- it does NOT claim to detect authorship.

## Prompt contract

Position 1 of `$ARGUMENTS` is a **free-form prompt** (RU/EN) -- modes ("flows") and flags are
optional and may follow in any order. Nobody types keys: resolve the flow + scope FROM the
prompt. Phase 0 below IS this skill's resolution algorithm (explicit keyword -> path/extension
-> content sniff); the Flow table there carries EN/RU keywords and `Mutates?` per flow.

1. Strip nothing -- there are no mode flags, only the flow keywords in the table below.
2. Explicit intent keyword (table below) wins outright, no scoring; unresolved cases fall
   through Phase 0's own priority order (keyword -> extension -> content sniff).
3. Empty arguments -> no assumed flow: Phase 0 Step 4's existing `AskUserQuestion` ("What to
   humanize?") is the ONE scoping question this contract requires -- do not skip it and do not
   guess a flow.
4. Outcome-changing ambiguity beyond the flow itself (e.g. destructive edits) -> ONE
   `AskUserQuestion` BEFORE any work.
5. Prose that is not a flow keyword is still input: `customPrompt` (Phase 0 Argument parsing)
   extracts it and both selects/overrides the flow and adds custom rules.

Then print this block ONCE, before the first action:

```
PLAN — brewtools:text-human
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved flow> — <explicit | matched keyword: X | content-sniff | AskUserQuestion>
SCOPE:  <resolved target paths (file/commit/folder/text), custom instructions if any>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

Labels are literal; values follow the conversation language. Print it right after Phase 0
announces `Flow: <name> -- <reason>`, before Phase 1 touches any file. SCOPE names the resolved
target paths -- for `mixed`, the resolved block list.

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
| Flow | EN keywords | RU keywords | Mutates? | Load | Domain |
|------|-------------|-------------|----------|------|--------|
| code | `.java/.kt/.py/.ts/...` ext, javadoc, jsdoc, kdoc, docstring, "api doc" | джавадок, апи док | yes (CLEAN-ONLY, inject OFF) | `@reference/flows/code.md` | source, comments, docstrings, JavaDoc/JSDoc/KDoc |
| docs | pr, pull request, commit, changelog, readme, docs, guide | коммит, документация, гайд | yes | `@reference/flows/docs.md` | README, docs, guides, PR/commit (inject restrained) |
| social | reddit, forum, slack, discord, chat | чат, форум | yes (file) / no (inline text -- prints result) | `@reference/flows/social.md` | reddit, forum, slack, discord, chat |
| article | article, blog, essay, post | статья, эссе | yes (file) / no (inline text -- prints result) | `@reference/flows/article.md` | formal essay, published blog, long-form |
| mixed | 7+ hex git hash, folder of mixed files | *(same -- hash/folder pattern is language-neutral)* | yes | `@reference/flows/mixed.md` | commit / folder dispatcher -> routes each file to its flow |

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

### Delegation (mixed flow)

A big task handed to one agent = an agent gone for an hour: you cannot observe it, cannot correct it, and it usually drifts off-target. One subagent = ONE bounded unit — ONE block of ~<=5 files, ~<=10 steps. A large commit or folder MUST be split into N blocks, all spawned in ONE message.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists — the point beyond the file edit |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, by whom, what runs in parallel — trimmed to what THIS agent needs |
| CONSUMER | who or what uses the result next, and the shape it must fit |
| DONE | acceptance criteria + the exact report shape you want back |

A bare one-line task is never enough. Shape:
```
Task(subagent_type="general-purpose", prompt="
GOAL: humanizing <commit|folder> so it reads as human-written; you own block <N>/<M>,
  siblings own the rest and the reports are merged into one Humanization Report.
ROLE: edit only your block's files in place. Do NOT touch files outside the block,
  do NOT auto-fix behavior-changing items — surface them instead.
SCOPE: in — <exact file list>. Out — every other path, git history, build output.
CONTEXT: classification is already done — flow=<code|docs|social|article> per file, PASS 2
  inject <ON|OFF> for this domain, custom instructions (verbatim, highest priority) if any.
  Sibling agents hold blocks <list> of the same commit; every file outside your list is
  already claimed, so a "helpful" extra edit collides with another agent.
CONSUMER: the skill merges each block's JSON into one Humanization Report; the user acts on
  'surfaced' items by hand, so a surfaced item you silently fixed never reaches them.
DONE: JSON per the mixed.md aggregation schema — stripped, injected, surfaced per file.
  Surfaced items are listed, never applied.
")
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
/text-human review this reddit reply: "<text>"       # social flow, inline text
/text-human humanize this blog post: "<text>"        # article flow
/text-human clean the javadoc in PaymentApi.java     # code flow, CLEAN-ONLY
/text-human 3be67487 also drop all @author tags      # mixed + custom rule
/text-human src/ only strip AI artifacts, no inject   # custom prompt overrides
```
