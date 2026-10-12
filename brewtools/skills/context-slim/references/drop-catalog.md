# Drop Catalog -- instructions the model already follows by default

Decision basis for `brewtools:context-slim`. A row here is a **candidate** for deletion, never an
automatic delete: verify actual loading and behavioral delta for the target model/configuration. Companion:
`keep-catalog.md` (invariants that must survive byte-exact). Extends `text-optimize` rule **A.4**
(Common-Knowledge Elision) -- same ledger, same "unsure -> keep" tiebreak.

## Contents
- STRUCTURAL EXEMPTION (read first)
- Reading the matchers
- Catalog (52 rows)
- Inverted near-twins (14 pairs) -- look like a drop, are a KEEP
- Decision rule

## STRUCTURAL EXEMPTION -- absolute, precedes every row below

**No row in this catalog may drop text that lives inside a fenced code block or inside markdown
table structure.** This is not a tiebreak, it is a filter applied BEFORE any matcher runs
(Decision rule step 0). Two protected regions:

| Region | Definition | Why |
|--------|------------|-----|
| Fenced code | every line from an opening ` ``` `/`~~~` fence through its closing fence, fences included | A fenced block is an EXAMPLE or a COMMAND: its prose is quoted, not instructed. Row 23 (`you are (an?\|the) (expert\|senior\|...)`) matches `"prompt": "You are a senior code reviewer..."` inside a fenced JSON example -- dropping it breaks the example an agent is told to copy |
| Table structure | header row, `\| --- \|` delimiter row, and every body row's cell count (lines whose first non-space char is `\|`) | A header row (`\| Event \| Matcher \| When \| Note \|`) carries no invariant of its own, so an unguarded catalog hit destroys a 4-column table. Cell CONTENT stays evaluable, but a row never loses a cell and a table never loses a row |

Same quoted-text rule as the dedup prefilter (`dedup-arbitration.md` 3b step 2).

## Reading the matchers

| Item | Value |
|------|-------|
| Dialect | ERE, run with `grep -oiE` or `rg -oiN --engine default` (case-insensitive assumed) |
| Table escaping | `\|` inside a matcher is markdown escaping -- **unescape to `\|` -> `|` before running** |
| Exemption first | Run every matcher over the file with fenced blocks and table header/delimiter rows REMOVED; a hit there does not exist. Body rows are matched one cell at a time |
| Hit != delete | A hit opens a judgement, resolved by the twin table + Decision rule below |
| `JUDGE-ONLY` | A row so marked never auto-drops at any depth. It only routes the span to the phase 3 LLM judge, whose verdict then re-enters the Decision rule at step 2 |
| Example column | a quoted sample or a rule id; `(synthetic)` = invented sample, the pattern is still sourced by Src |
| Src column | Legend below; every row is grounded, no bare assertions |

| Key | Source URL |
|-----|-----------|
| SKB | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices |
| PBP | https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices |
| O55 | https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5 |
| MEM | https://code.claude.com/docs/en/memory |
| TR  | https://code.claude.com/docs/en/tools-reference |
| CTX | https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents |
| RR  | `brewtools/skills/text-optimize/references/rules-review.md` (T.6 / C.5 / C.7 / A.4, each already sourced there) |

> Load-bearing quotes. SKB: "Only add context Claude doesn't already have"; "Does this paragraph
> justify its token cost?". CTX: "find the *smallest possible* set of high-signal tokens".
> MEM: `/doctor` "cuts content Claude can derive from the codebase ... and keeps pitfalls,
> rationale, and conventions that differ from tool defaults" -- that sentence is this catalog's
> whole thesis. O55: "If your prompts ask the model to write out its reasoning in the response,
> remove those instructions"; effort, not prose, sets thinking depth. PBP: "Remove over-prompting."

## Catalog

| # | Pattern | Matcher (ERE) | Example | Src |
|---|---------|---------------|---------|-----|
| 1 | be-helpful register | `be (helpful\|useful\|supportive\|nice)` | "Be helpful and supportive" (synthetic) | CTX |
| 2 | anti-laziness booster | `(be thorough\|do ?n.?t be lazy\|work hard)` | named as removable in `text-optimize/references/rules-review.md` T.6 | RR |
| 3 | think-step-by-step | `think (step[ -]?by[ -]?step\|it through carefully)` | (synthetic) -- depth is set by `effort`, not prose | O55 |
| 4 | explain-your-reasoning | `explain your (reasoning\|thought process\|thinking)` | (synthetic) -- Claude 5.5 may decline it (`reasoning_extraction`); ask for a short explanation of the answer instead | O55 |
| 5 | affect priming | `take a deep breath\|you (can\|will) do (this\|great)` | (synthetic) | CTX |
| 6 | write-clean-code | `(clean\|readable\|maintainable\|elegant) code` | (synthetic) | SKB |
| 7 | quality adjective on an artifact | `production[- ](quality\|ready\|grade)` | (synthetic) | SKB |
| 8 | meaningful names | `(meaningful\|descriptive\|sensible) (variable\|function\|class)? ?names?` | (synthetic) | MEM |
| 9 | follow best practices | `follow (industry \|the )?best practices?` | (synthetic; a filename such as `ssh-best-practices.md` is not a hit -- keep) | SKB |
| 10 | handle errors appropriately | `handle errors? (appropriately\|properly\|gracefully)` | (synthetic) | SKB |
| 11 | write tests | `write (unit \|some )?tests?` | archetype in `rules-review.md` A.4 worked example | RR |
| 12 | keep functions small | `keep (functions\|methods\|files) small` | `rules-review.md` A.4 | RR |
| 13 | DRY sloganeering | `(DRY principle\|do ?n.?t repeat yourself)` | (synthetic) | SKB |
| 14 | add comments (unscoped) | `(add\|write) comments?( where needed)?` | (synthetic) | SKB |
| 15 | validate inputs (unscoped) | `validate (all )?(user )?inputs?` | (synthetic) | SKB |
| 16 | do-not-hallucinate | `do ?n.?t (hallucinate\|make (things\|stuff) up\|invent)` | (synthetic) | PBP |
| 17 | be-accurate | `be (accurate\|truthful\|honest\|factual)` | (synthetic) | PBP |
| 18 | if-unsure-ask | `if (you a?re )?(unsure\|uncertain\|in doubt)` | PBP names `"If in doubt, use [tool]"` as over-prompting that now overtriggers | PBP |
| 19 | ask-for-clarification (unbounded) | `ask (the user )?for clarification` | (synthetic) | PBP |
| 20 | double-check your work | `(double[- ]?check\|verify) your (work\|answer\|output)` | (synthetic) | PBP |
| 21 | be-concise with no threshold | `be (concise\|brief\|succinct)([^0-9]*)$` | (synthetic) | PBP |
| 22 | politeness scaffolding | `\b(please\|kindly\|thank you\|thanks)\b` | (synthetic) | RR |
| 23 | expert role-play preamble | `you are (an?\|the) (expert\|senior\|world[- ]class\|professional)` | (synthetic) | CTX |
| 24 | role line with no scope delta | `^\*\*Role:\*\*` | keep only the half naming the owned scope | CTX |
| 25 | restating a tool's own doc | `(the )?[A-Z][a-zA-Z]+ tool (reads\|writes\|is used to)` | (synthetic) | SKB |
| 26 | re-explaining git | `git (commit\|push\|status\|rebase) (is\|means\|will)` | (synthetic) | SKB |
| 27 | re-explaining docker | `docker (containers?\|images?\|compose) (is\|are) ` | (synthetic) | SKB |
| 28 | re-explaining a format | `(YAML\|JSON\|Markdown\|CSV) is an? .*(format\|language)` | (synthetic) | SKB |
| 29 | expanding an acronym the model knows | `(API\|HTTP\|CI/CD\|SQL\|URL\|PDF) (stands for\|means)` | SKB's own "PDF (Portable Document Format)" bad example | SKB |
| 30 | file-format preamble | `is an? (common\|popular\|widely used) (file )?format` | SKB bad example | SKB |
| 31 | there-are-many-libraries | `there are many (libraries\|ways\|approaches\|options)` | SKB bad example | SKB |
| 32 | install-narration | `(you.?ll need to )?install (it \|them )?(using \|with )?(pip\|npm)` | SKB bad example | SKB |
| 33 | option menu without a default | `you can use [^.]+, or [^.]+, or ` | SKB "Avoid offering too many options" | SKB |
| 34 | bare emphasis with no constraint **-- `JUDGE-ONLY`, never auto-drop** | two-part, BOTH must hold: (a) `\b(CRITICAL\|IMPORTANT\|VERY IMPORTANT\|NOTE)\b:?` hits, AND (b) the remainder of the line AFTER that hit matches NOTHING in `[0-9]\|[A-Za-z0-9_@.-]*/[A-Za-z0-9_@./-]+\|[A-Z][A-Z0-9]*(_[A-Z0-9]+){2,}\|`+backtick literal+`\|https?://\|!=\|[А-Яа-яЁё]` -- i.e. no concrete rule follows the emphasis | `rules-review.md` C.7 mandates downgrading these | RR |
| 35 | make-sure-you-always | `make sure (you )?(always\|to)\b` | listed for deletion in `rules-review.md` T.6 | RR |
| 36 | AI self-reference | `as an? (AI\|large language model\|assistant)` | `text-human` `ai-patterns.md` (strip, all domains) | RR |
| 37 | apology boilerplate | `do ?n.?t apologi[sz]e\|no apolog(y\|ies)` | (synthetic) | PBP |
| 38 | use the right tool | `use the (right\|appropriate\|correct\|best) tool` | (synthetic) | PBP |
| 39 | blanket tool default | `default to using` | PBP: "Replace blanket defaults with more targeted instructions" | PBP |
| 40 | read-before-edit -- **retired, never drops** | `read (the )?file before (edit\|writ)` | (synthetic) -- since CC 2.1.208 newer models may edit an unread file, so the line changes behaviour | TR |
| 41 | forward-slash advice in a consumer file | `use forward slashes` | (synthetic) -- SKB states it to *skill authors*, not to a project memory | SKB |
| 42 | consider-edge-cases | `(consider\|think about\|handle) (all )?edge cases` | (synthetic) | PBP |
| 43 | generic analyze->plan->implement ladder | `^[-*0-9. ]*(Analyze\|Understand\|Read) the (code\|task\|files?)\b` | SKB's own high-freedom example "1. Analyze the code structure and organization" | PBP |
| 44 | be-consistent with no named convention | `be consistent\b` | (synthetic) | MEM |
| 45 | keep-it-simple | `keep (it\|things\|the code) simple` | (synthetic) | SKB |
| 46 | do-not-over-engineer, unqualified | `do ?n.?t over[- ]?engineer` | (synthetic) -- drop ONLY when no model name / threshold qualifies it; see twin 11 | PBP |
| 47 | format-code-properly | `format (the )?code (properly\|nicely\|correctly)` | MEM verbatim bad example ("Use 2-space indentation" instead) | MEM |
| 48 | test-your-changes | `test your changes` | MEM verbatim bad example ("Run `npm test` before committing" instead) | MEM |
| 49 | keep-files-organized | `keep (files\|the repo) organi[sz]ed` | MEM verbatim bad example ("API handlers live in `src/api/handlers/`" instead) | MEM |
| 50 | directory-layout dump derivable from the tree | `^[^A-Za-z0-9]*(src\|lib\|app\|tests?)/` (tree art prefix) | MEM: `/doctor` "cuts content Claude can derive from the codebase, such as directory layouts" | MEM |
| 51 | dependency list restating a manifest | `^[-*] +[a-z0-9@/_-]+ +[~^]?[0-9]+\.[0-9]+` | MEM: same sentence, "dependency lists" | MEM |
| 52 | stale time marker with no fact attached | `as of [A-Z][a-z]+ 20[0-9]{2}` with no adjacent value | SKB "Avoid time-sensitive information" | SKB |

Rows 50-52 hit lines that usually carry a path, version pin or date: step 1 keeps those clauses, so only
the residue is a candidate. A pin, or a date that anchors a verification (`keep-catalog.md` class 16),
never drops through these rows.

## Inverted near-twins -- these LOOK droppable and are KEEPS

Model advice applies only to its named model; a generic verification candidate never overrides a real
test, gate or independent review. An instruction earns its tokens when it **inverts or tightens** a documented default, names a
threshold, or names a project fact. Same surface words, opposite verdict.

| # | DROP form (no delta) | KEEP form (inverts / tightens / names) | What the keep-form changes |
|---|----------------------|----------------------------------------|----------------------------|
| 1 | "write clean, readable code" | "Comments only where they earn it: non-obvious logic + public API docstrings; !=narrate self-evident code" | Inverts the model's default to comment liberally |
| 2 | "be concise" | "Verdict first, <=30 lines, `path:line`, !=preamble" | PBP: latest models are "less verbose" but still need explicit preamble suppression; adds a number |
| 3 | "think step by step" | "Report verdict, evidence and next action; <=30 lines" | Defines visible output; never suppresses internal reasoning |
| 4 | "handle errors appropriately" | "grep-filter pipelines under `set -o pipefail` need `\|\| true`" | Names the exact failure and the exact fix |
| 5 | "follow best practices" | "Pin exact semver X.Y.Z everywhere; `@latest`/`:latest`/`@main` forbidden" | A prohibition the model does not default to |
| 6 | "write tests" | "GIVEN/WHEN/THEN comments, descriptive names, no logs in tests" | Project test contract, not the generic habit |
| 7 | "be helpful / do the task well" | "Manager -- NEVER executor. Every real-work unit -> a subagent" | Inverts the default do-it-yourself behaviour |
| 8 | "if unsure, ask the user" | "At most ONE clarifying `AskUserQuestion`, max 4 questions, only when the answer changes what is written" | Caps a default that otherwise overtriggers (PBP) |
| 9 | "double-check your work" | "`++r`: 1. Review 2. Double-check 3. Fix only after confirmation -- never fix on the first pass" | Names a mechanism + an ordering; PBP: the bare form goes on Opus 5, while the Haiku 5.5 / low-effort Sonnet 5.5 pages ask for a concrete named check instead |
| 10 | "use meaningful names" | "Spell **Anna**: !=\"Ana\", !=\"Anna K\"" | An identity fact no model can derive |
| 11 | "don't over-engineer" | "Opus 4.5/4.6 tend to overengineer -> state an explicit minimal-complexity constraint" | Model-scoped; PBP documents the tendency and prescribes the constraint |
| 12 | "validate inputs" | "!=ANY inequality (`>`,`>=`) in assertions -> exact equality; non-deterministic -> explicit tolerance" | Inverts the model's default weak-assertion habit |
| 13 | "ask before doing anything risky" | "!=revert without CONF: `git revert`, `git reset`, `git checkout -- <file>`, `git restore` require EXPLICIT confirmation" | Enumerates the exact commands |
| 14 | "keep the docs up to date" | "!=hand-edit MDX/README/`navigation.ts`; use `/docs`" | A prohibition + a named replacement path |

## Decision rule

**Unit of decision = the CLAUSE, never the line.** A clause is: one table cell (split the row on `|`),
or one sentence/`;`-delimited segment/`--`- or em-dash-delimited segment of a prose line. An invariant
protects the clause that carries it, not the twelve other words parked on the same line.

Apply in order; the first hit decides. Anything unresolved is a KEEP.

| Step | Test | Verdict |
|------|------|---------|
| 0 | Is the span inside a fenced code block, or a table header/delimiter row? | KEEP, untouched -- STRUCTURAL EXEMPTION, no matcher runs. A body-row cell goes on to step 1 and may shrink, never empty |
| 1 | Does the CLAUSE carry a **hard** `keep-catalog.md` invariant -- number/version, path/glob/filename, env key, backtick literal, URL, `!=`, ALL-CAPS modal, threshold/comparison, Cyrillic, or a lowercase negation (`never`, `do not`, `must not`, `avoid`, `unless`, `except`, `only`)? | KEEP that clause byte-exact; sibling clauses on the same line continue to step 2 |
| 2 | Does the clause invert or tighten a documented default (twins table)? | KEEP |
| 3 | Does it name a threshold, count, ratio or deadline? | KEEP |
| 4 | Would the model behave identically with the clause deleted? | DROP -> loss ledger `elided-known` |
| 5 | Genuinely uncertain, or the row is `JUDGE-ONLY` and the judge did not return a clear verdict | KEEP (A.4 tiebreak: "Unsure whether generic -> keep") |

### Gate classes are not drop vetoes

`keep-catalog.md`'s `crit_tokens_ext()` alphabet serves the mechanical VERIFY gate, which has **set**
semantics over the whole file: one surviving occurrence anywhere satisfies it. Two of its classes --
`slug:` (`[a-z][a-z0-9]*(-[a-z0-9]+)+`) and bare capitalised words -- are declared "high-frequency by
design" there precisely so bulk deletion fails the gate. Reading them as per-line KEEP vetoes is a
category error: step 1 then fires on almost every line (measured on three memory files: 73-94% of whole
lines kept vs 48-55% of clauses under hard classes; eligible surface 2% -> 14-23%). `slug:` and
capitalised-word hits still count at VERIFY time, so nothing protected becomes deletable -- a generic
clause just no longer rides to safety on a specific neighbour.

> A drop is a **whole-line** operation only when EVERY clause on the line is generic. A generic clause
> welded to a specific one (row 7: "production-quality bash scripts **for macOS/Linux**") loses the
> adjective, keeps the scope.

### Row 34 worked measurement (`JUDGE-ONLY` + qualified matcher)

Over a set of agent bodies the unqualified matcher hit **13 lines**; three were false positives (a table
header `| Event | Matcher | When | Note |`, a lookup value `| red | Security, critical |`, an ordering
`critical > important > nice-to-have`). Step 0 plus clause (b) left **3 lines**, none of the three: judge
referrals, not drops.
