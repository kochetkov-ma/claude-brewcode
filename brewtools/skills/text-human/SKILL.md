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

Humanizes source code and docstrings, technical docs, commits/PRs, articles and reddit/chat: strips
validated AI tells, then injects domain style where the flow allows. Never claims to detect AI
authorship.

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; flow keywords may sit anywhere in it. There are no mode
flags: Phase 0 below is this skill's resolution algorithm, and its Flow table carries the EN/RU
keywords and `Mutates?` per flow.

1. Flow: an explicit intent keyword (table below) wins outright, no scoring; unresolved cases fall
   through Phase 0's own priority order (keyword -> path/extension -> content sniff). Empty -> no
   assumed flow: Phase 0 Step 4's `AskUserQuestion` ("What to humanize?") is the ONE scoping
   question -- do not skip it and do not guess a flow.
2. Scope: prose that is not a flow keyword is still input: `customPrompt` (Phase 0 Argument parsing)
   extracts it and both selects/overrides the flow and adds custom rules.
3. Ask: outcome-changing ambiguity beyond the flow itself -> ONE `AskUserQuestion` before any work.
   Phase 0.5's dirty-path gate IS that question whenever it fires, and it outranks the scoping one.

Print once, right after Phase 0 announces `Flow: <name> -- <reason>`, before Phase 1 touches any
file; SCOPE names the resolved target paths -- for `mixed`, the resolved block list (labels and plan
values English, INPUT verbatim):

```
PLAN — brewtools:text-human
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved flow> — <explicit | matched keyword: X | content-sniff | AskUserQuestion>
SCOPE:  <resolved target paths (file/commit/folder/text), custom instructions if any>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

## Two-pass model

- PASS 1 STRIP per `@reference/ai-patterns.md`: HIGH tier acts on one instance, MED only on a cluster. Behavior-changing items (hallucinated refs, fake tickets, try/except-everything) change meaning when edited: surface them, never edit.
- PASS 2 INJECT per `@reference/human-patterns.md`, gated by domain: off for code, API docs, formal contracts. No flow injects typos, errors or fabricated references.

## Phase 0 -- Greedy flow detection

Pick exactly one flow, announce `Flow: <name> -- <reason>`, then load only its flow file and the
pattern sections that file names.

### Argument parsing
1. First token resolves to an existing path or matches a 7+ hex git hash -> `scope`; the rest is `customPrompt`.
2. Otherwise the whole input is `customPrompt` (inline text or intent); detect the flow from it.
3. `customPrompt` rules win over flow defaults on conflict.
4. No args -> the only allowed `AskUserQuestion` here: "What to humanize?" (commit / file / folder / paste text).

### Detection signals (priority order)
1. Intent keyword from the Flow table below; javadoc/jsdoc/kdoc/docstring/"api doc" select code's CLEAN-ONLY sub-profile.
2. Path: code extension -> code; `.md/.mdx/.rst` -> docs (long-form essay/blog content -> article); 7+ hex git hash or folder -> mixed.
3. Content sniff: short fragmented lines / no caps -> social; prose paragraphs with a thesis -> article; imperative + code blocks -> docs.

### Flow -> file
| Flow | EN keywords | RU keywords | Mutates? | Load | Domain |
|------|-------------|-------------|----------|------|--------|
| code | `.java/.kt/.py/.ts/...` ext, javadoc, jsdoc, kdoc, docstring, "api doc" | джавадок, апи док | yes (CLEAN-ONLY, inject OFF) | `@reference/flows/code.md` | source, comments, docstrings, JavaDoc/JSDoc/KDoc |
| docs | pr, pull request, commit, changelog, readme, docs, guide | коммит, документация, гайд | yes | `@reference/flows/docs.md` | README, docs, guides, PR/commit (inject restrained) |
| social | reddit, forum, slack, discord, chat | чат, форум | yes (file) / no (inline text -- prints result) | `@reference/flows/social.md` | reddit, forum, slack, discord, chat |
| article | article, blog, essay, post | статья, эссе | yes (file) / no (inline text -- prints result) | `@reference/flows/article.md` | formal essay, published blog, long-form |
| mixed | 7+ hex git hash, folder of mixed files | *(same -- hash/folder pattern is language-neutral)* | yes | `@reference/flows/mixed.md` | commit / folder dispatcher -> routes each file to its flow |

## Phase 0.5 -- Clean-tree precondition (every flow that writes)

Files are rewritten in place with no backup; git is the only undo. Before the first edit, over the
resolved target paths only:

```bash
git status --porcelain -- "<resolved path>"   # one quoted arg per target path
```

- Empty -> proceed.
- Non-empty, edits on those paths not already authorized -> ONE `AskUserQuestion` listing them:
  proceed on them / process only the clean ones / abort. It replaces the Phase 0 scoping question;
  `mixed` commit mode runs this gate over the commit's paths.
- Not a git repo (`git rev-parse --git-dir` fails) -> say so; proceed only on an explicit go-ahead.

Inline text skips this gate.

## Phase 1 -- Execute the flow

- Single file or inline text -> apply the flow's rules directly, no delegation.
- mixed (commit / folder) -> follow `@reference/flows/mixed.md`; each file gets its own flow's rules. Delegates cannot resolve relative paths: name rule files under `${CLAUDE_SKILL_DIR}/reference/`.

A custom prompt is prepended to direct processing and every delegate prompt:
```
CUSTOM INSTRUCTIONS (highest priority, override defaults):
<customPrompt>
---
```

### Delegation (mixed flow)

Main owns every spawn and acceptance; delegates never nest and return open decisions. One
delegate = one block (~<=5 files, ~<=10 steps); a large commit or folder splits into N blocks spawned in one message.

Every spawn brief carries six labeled fields, since a subagent starts with an empty context: GOAL (task + why), ROLE (owns, must not touch), SCOPE (paths/commands in and out), CONTEXT (done, by whom, in parallel), CONSUMER (who uses the result + its shape), DONE (acceptance + return: verdict first, evidence, bounded; long output to a file, path returned).
A bare one-line task is never enough. Shape:
```
Agent(subagent_type="general-purpose", prompt="
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

## Error handling
| Error | Action |
|-------|--------|
| Agent failure/partial output | Keep completed edits/evidence, report incomplete block, continue others; never count unverified work done |
| File read error, binary file | Skip, note in report |
| No changes | Report "No humanization required" |

## Examples
```bash
/brewtools:text-human src/main/java/OrderService.java          # code flow, single file
/brewtools:text-human 3be67487                                 # mixed flow, commit
/brewtools:text-human src/main/java/services/                  # mixed flow, folder
/brewtools:text-human review this reddit reply: "<text>"       # social flow, inline text
/brewtools:text-human humanize this blog post: "<text>"        # article flow
/brewtools:text-human clean the javadoc in PaymentApi.java     # code flow, CLEAN-ONLY
/brewtools:text-human 3be67487 also drop all @author tags      # mixed + custom rule
/brewtools:text-human src/ only strip AI artifacts, no inject  # custom prompt overrides
```
