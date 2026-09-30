---
name: text-human
description: "Humanizes code, docs, articles, reddit/chat, javadoc -- strips AI artifacts, fixes unicode, fits register. Triggers: humanize, ai artifacts, unicode fix, article, reddit, javadoc."
---

# Humanize text

Edit the supplied text or repository artifact in place only when authorized. Preserve technical meaning, identifiers, citations, and house style while removing repetitive phrasing, filler, and synthetic narration. Return a focused diff and do not delegate unless explicitly requested.

## Complete native workflow

Follow every phase below. When a phase delegates work, use Codex collaboration with only `task_name` and `message`; treat each "Codex delegation brief" block as role and message content, not executable syntax. Required approval: main presents a concrete, reviewable proposal in chat and waits for an actual user reply before dependent action. Existing authorization for the same scope remains valid; do not ask again. Optional clarification: use `request_user_input_async` only if exposed, or `request_user_input` only if available in the current runtime/mode, for optional choices and never approval. Otherwise ask in main chat. Delegated agents return unresolved questions to main. Silence, elapsed time and tool errors are not approval. Resolve `<skill-directory>`, `<plugin-root>`, `<project-root>`, and `<arguments>` before running commands.


# Text Humanizer

Humanizes source/comments/docstrings, technical docs, commits/PRs, articles and reddit/chat.
Choose ONE flow, lazy-load its rules/relevant pattern sections, STRIP validated AI tells then
gated INJECT domain style. Removes surface artifacts/fits register; never claims authorship detection.

## Prompt contract

Position 1 of `<arguments>` is a **free-form prompt** (RU/EN) -- modes ("flows") and flags are
optional and may follow in any order. Nobody types keys: resolve the flow + scope FROM the
prompt. Phase 0 below IS this skill's resolution algorithm (explicit keyword -> path/extension
-> content sniff); the Flow table there carries EN/RU keywords and `Mutates?` per flow.

1. Strip nothing -- there are no mode flags, only the flow keywords in the table below.
2. Explicit intent keyword (table below) wins outright, no scoring; unresolved cases fall
   through Phase 0's own priority order (keyword -> extension -> content sniff).
3. Empty arguments -> no assumed flow: Phase 0 Step 4's existing `main-chat user gate` ("What to
   humanize?") is the ONE scoping question this contract requires -- do not skip it and do not
   guess a flow.
4. Outcome-changing ambiguity beyond the flow itself -> ONE `main-chat user gate` BEFORE any work.
   Phase 0.5's dirty-path gate IS that question whenever it fires, and it outranks the scoping one.
5. Prose that is not a flow keyword is still input: `customPrompt` (Phase 0 Argument parsing)
   extracts it and both selects/overrides the flow and adds custom rules.

Then print this block ONCE, before the first action:

```
PLAN — brewtools:text-human
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved flow> — <explicit | matched keyword: X | content-sniff | main-chat user gate>
SCOPE:  <resolved target paths (file/commit/folder/text), custom instructions if any>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

Labels/plan values are English; INPUT remains verbatim. Print right after Phase 0
announces `Flow: <name> -- <reason>`, before Phase 1 touches any file. SCOPE names the resolved
target paths -- for `mixed`, the resolved block list.

## Two-pass model (applies to every flow)

- PASS 1 -- STRIP: remove validated AI tells per `@reference/ai-patterns.md`. Only HIGH-tier universal-strip acts on single instances. MED density-signals act ONLY when several co-occur. Behavior-changing items (hallucinated refs, fake tickets, try/except-everything) are SURFACED for review, never auto-edited.
- PASS 2 -- INJECT (gated): apply `@reference/human-patterns.md` for the flow's domain. HARD-OFF for code / API / formal-contract. GLOBAL GUARD: never inject typos, errors, or fabricated references in any flow.

## Phase 0 -- Greedy flow detection (do this FIRST)

Before any processing, parse the argument, pick exactly ONE flow, and ANNOUNCE it:

`Flow: <name> -- <one-line why>`

Then greedy-load ONLY the chosen flow file plus the pattern sections it needs (lazy -- not everything).

### Argument parsing (universal)
Accept all of: path, commit hash, folder, free-text prompt, path+prompt, no args.

1. Take the first token. If it resolves to an existing path OR matches a 7+ hex git hash -> that is `scope`, the rest is `customPrompt`.
2. Otherwise the WHOLE input is a `customPrompt` (the text to humanize may be inline, or it may describe intent). Flow is detected from the prompt + any inline content.
3. `customPrompt` both selects/overrides the flow AND adds custom rules (highest priority on conflict).
4. No args at all -> main-chat user gate fallback is allowed ONLY here ("What to humanize?" -> commit / file / folder / paste text). Prefer inferring whenever possible.

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

## Phase 0.5 -- Clean-tree precondition (every flow that writes)

This skill rewrites files in place and keeps no backup, so git IS the undo. Before the first edit,
over the resolved target paths only:

```bash
git status --porcelain -- <resolved paths>
```

- Empty -> proceed.
- Non-empty -> use existing explicit authorization for those named dirty edits, else ONE
  `main-chat user gate` listing paths: proceed on them / process only the
  clean ones / abort. This is the skill's single clarifying question -- it replaces, not adds to,
  the Phase 0 scoping question, and `mixed`'s commit-mode check is this same gate scoped to the
  commit's paths.
- Not a git repo (`git rev-parse --git-dir` fails) -> say so and require an explicit go-ahead;
  there is nothing to revert to.

Inline text and other non-file input skip this -- nothing on disk changes.

## Phase 1 -- Execute the flow

- Single file or inline text -> apply the chosen flow's rules directly, no Agent delegation.
- mixed (commit / folder) -> follow `@reference/flows/mixed.md`: block split, fast model/balanced model classification, parallel Agent launch, JSON aggregation. Each file is routed to its correct flow's rules.

Custom prompt, when present, is prepended to direct processing and to every sub-agent Agent prompt:
```
CUSTOM INSTRUCTIONS (highest priority, override defaults):
<customPrompt>
---
```

### Delegation (mixed flow)

Main owns every spawn/acceptance; delegates never nest and return decisions to main. One SA =
ONE block/~<=5 files/~<=10 steps. Large commit/folder MUST split into N blocks, spawned in ONE message.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | overall task/purpose beyond editing |
| ROLE | owned responsibility + forbidden changes |
| SCOPE | exact paths/commands in/out of bounds |
| CONTEXT | prior work/owners, parallel work; relevant to this agent only |
| CONSUMER | next consumer + required result shape |
| DONE | acceptance criteria + exact return format |

A bare one-line task is never enough. Shape:
```
spawn_agent({"task_name":"general_purpose_1","message":"Assigned role: general-purpose. The main session supplies matching native role instructions when available; report a role gap rather than claiming a custom type was instantiated. Perform this bounded work only; do not spawn or delegate children.\n\nGOAL: humanizing <commit|folder> so it reads as human-written; you own block <N>/<M>,\n  siblings own the rest and the reports are merged into one Humanization Report.\nROLE: edit only your block's files in place. Do NOT touch files outside the block,\n  do NOT auto-fix behavior-changing items — surface them instead.\nSCOPE: in — <exact file list>. Out — every other path, git history, build output.\nCONTEXT: classification is already done — flow=<code|docs|social|article> per file, PASS 2\n  inject <ON|OFF> for this domain, custom instructions (verbatim, highest priority) if any.\n  Sibling agents hold blocks <list> of the same commit; every file outside your list is\n  already claimed, so a \"helpful\" extra edit collides with another agent.\nCONSUMER: the skill merges each block's JSON into one Humanization Report; the user acts on\n  'surfaced' items by hand, so a surfaced item you silently fixed never reaches them.\nDONE: JSON per the mixed.md aggregation schema — stripped, injected, surfaced per file.\n  Surfaced items are listed, never applied.\n"})
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
| fast model / balanced model | X / Y |

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

Files are edited in place. No backups -- git is the only undo, which is why Phase 0.5 refuses to
start over dirty paths without an explicit answer.

## Error handling
| Error | Action |
|-------|--------|
| Agent failure/partial output | Keep completed edits/evidence, report incomplete block, continue others; never count unverified work done |
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

