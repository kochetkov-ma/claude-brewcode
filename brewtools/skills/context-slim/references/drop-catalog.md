# Drop Catalog -- instructions the model already follows by default

Decision basis for `brewtools:context-slim`. A row here is a **candidate** for deletion, never an
automatic delete: it costs tokens on every request and buys no behavioural delta. Companion:
`keep-catalog.md` (invariants that must survive byte-exact). Extends `text-optimize` rule **A.4**
(Common-Knowledge Elision) -- same ledger, same "unsure -> keep" tiebreak.

## Contents
- STRUCTURAL EXEMPTION (read first)
- Reading the matchers
- Catalog (52 rows)
- Inverted near-twins (14 pairs) -- look like a drop, are a KEEP
- Decision rule
- Sources

## STRUCTURAL EXEMPTION -- absolute, precedes every row below

**No row in this catalog may drop text that lives inside a fenced code block or inside markdown
table structure.** This is not a tiebreak, it is a filter applied BEFORE any matcher runs
(Decision rule step 0). Two protected regions:

| Region | Definition | Why |
|--------|------------|-----|
| Fenced code | every line from an opening ` ``` `/`~~~` fence through its closing fence, fences included | A fenced block is an EXAMPLE or a COMMAND. Its prose is quoted, not instructed. Verified defect: row 23 (`you are (an?\|the) (expert\|senior\|...)`) matches `brewcode/agents/agent-creator.md:205`, the string `"prompt": "You are a senior code reviewer..."` inside a fenced JSON example -- dropping it breaks the example the agent is told to copy |
| Table structure | any line whose first non-space char is `\|`: header row, `\| --- \|` delimiter row, and every body row -- plus the row's cell count | A header row (`\| Event \| Matcher \| When \| Note \|`) carries no invariant of its own, so an unguarded catalog hit destroys a 4-column table. Cell CONTENT stays evaluable, but a row never loses a cell and a table never loses a row |

`dedup-arbitration.md:69` already strips fences in the dedup prefilter; this catalog needs the same
guard and did not have one. Dedup and drop must agree on what is quoted text.

## Reading the matchers

| Item | Value |
|------|-------|
| Dialect | ERE, run with `grep -oiE` or `rg -oiN --engine default` (case-insensitive assumed) |
| Table escaping | `\|` inside a matcher is markdown escaping -- **unescape to `\|` -> `|` before running** |
| Exemption first | Run every matcher over the file with fenced blocks and `\|`-leading lines REMOVED. A hit inside either region does not exist |
| Hit != delete | A hit opens a judgement, resolved by the twin table + Decision rule below |
| `JUDGE-ONLY` | A row so marked never auto-drops at any depth. It only routes the span to the phase 3 LLM judge, whose verdict then re-enters the Decision rule at step 2 |
| Example column | `path:line` = real occurrence in this repo. `(synthetic)` = written here; no repo instance exists because the repo is already compressed |
| Src column | Legend below; every row is grounded, no bare assertions |

| Key | Source URL |
|-----|-----------|
| SKB | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices |
| PBP | https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices |
| MEM | https://code.claude.com/docs/en/memory |
| CTX | https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents |
| OAI | https://developers.openai.com/api/docs/guides/reasoning-best-practices |
| RR  | `brewtools/skills/text-optimize/references/rules-review.md` (T.6 / C.5 / C.7 / A.4, each already sourced there) |

> Load-bearing quotes. SKB: "Only add context Claude doesn't already have"; "Does this paragraph
> justify its token cost?". CTX: "find the *smallest possible* set of high-signal tokens".
> MEM: `/doctor` "cuts content Claude can derive from the codebase ... and keeps pitfalls,
> rationale, and conventions that differ from tool defaults" -- that sentence is this catalog's
> whole thesis. OAI: "prompting them to 'think step by step' or 'explain your reasoning' is
> unnecessary." PBP: "Remove over-prompting."

## Catalog

| # | Pattern | Matcher (ERE) | Example | Src |
|---|---------|---------------|---------|-----|
| 1 | be-helpful register | `be (helpful\|useful\|supportive\|nice)` | "Be helpful and supportive" (synthetic) | CTX |
| 2 | anti-laziness booster | `(be thorough\|do ?n.?t be lazy\|work hard)` | named as removable in `text-optimize/references/rules-review.md:28` | RR |
| 3 | think-step-by-step | `think (step[ -]?by[ -]?step\|it through carefully)` | `.codex/plugins/brewcode/skills/teams-setup/SKILL.md:718` "execute step by step" | OAI |
| 4 | explain-your-reasoning | `explain your (reasoning\|thought process\|thinking)` | (synthetic) | OAI |
| 5 | affect priming | `take a deep breath\|you (can\|will) do (this\|great)` | (synthetic) | OAI |
| 6 | write-clean-code | `(clean\|readable\|maintainable\|elegant) code` | (synthetic) | SKB |
| 7 | quality adjective on an artifact | `production[- ](quality\|ready\|grade)` | `brewcode/agents/bash-expert.md:17` | SKB |
| 8 | meaningful names | `(meaningful\|descriptive\|sensible) (variable\|function\|class)? ?names?` | (synthetic) | MEM |
| 9 | follow best practices | `follow (industry \|the )?best practices?` | (synthetic; repo hits are filenames, e.g. `brewtools/skills/ssh/references/ssh-best-practices.md:1` -- keep) | SKB |
| 10 | handle errors appropriately | `handle errors? (appropriately\|properly\|gracefully)` | `.codex/reports/20260815-195724_claude-code-plugin-review/FINAL_BREWTOOLS_REVIEW.md:160` cites it as the defect | SKB |
| 11 | write tests | `write (unit \|some )?tests?` | archetype in `rules-review.md:102` (A.4 worked example) | RR |
| 12 | keep functions small | `keep (functions\|methods\|files) small` | `rules-review.md:102` | RR |
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
| 24 | role line with no scope delta | `^\*\*Role:\*\*` | `.claude/agents/docs-writer.md:11` -- keep only the half naming the owned scope | CTX |
| 25 | restating a tool's own doc | `(the )?[A-Z][a-zA-Z]+ tool (reads\|writes\|is used to)` | (synthetic) | SKB |
| 26 | re-explaining git | `git (commit\|push\|status\|rebase) (is\|means\|will)` | (synthetic) | SKB |
| 27 | re-explaining docker | `docker (containers?\|images?\|compose) (is\|are) ` | (synthetic) | SKB |
| 28 | re-explaining a format | `(YAML\|JSON\|Markdown\|CSV) is an? .*(format\|language)` | (synthetic) | SKB |
| 29 | expanding an acronym the model knows | `(API\|HTTP\|CI/CD\|SQL\|URL\|PDF) (stands for\|means)` | SKB's own "PDF (Portable Document Format)" bad example | SKB |
| 30 | file-format preamble | `is an? (common\|popular\|widely used) (file )?format` | SKB bad example | SKB |
| 31 | there-are-many-libraries | `there are many (libraries\|ways\|approaches\|options)` | SKB bad example | SKB |
| 32 | install-narration | `(you.?ll need to )?install (it \|them )?(using \|with )?(pip\|npm)` | SKB bad example | SKB |
| 33 | option menu without a default | `you can use [^.]+, or [^.]+, or ` | SKB "Avoid offering too many options" | SKB |
| 34 | bare emphasis with no constraint **-- `JUDGE-ONLY`, never auto-drop** | two-part, BOTH must hold: (a) `\b(CRITICAL\|IMPORTANT\|VERY IMPORTANT\|NOTE)\b:?` hits, AND (b) the remainder of the line AFTER that hit matches NOTHING in `[0-9]\|[A-Za-z0-9_@.-]*/[A-Za-z0-9_@./-]+\|[A-Z][A-Z0-9]*(_[A-Z0-9]+){2,}\|`+backtick literal+`\|https?://\|!=\|[А-Яа-яЁё]` -- i.e. no concrete rule follows the emphasis | `rules-review.md:16` (C.7) mandates downgrading these | RR |
| 35 | make-sure-you-always | `make sure (you )?(always\|to)\b` | listed for deletion in `rules-review.md:28` | RR |
| 36 | AI self-reference | `as an? (AI\|large language model\|assistant)` | `brewtools/skills/text-human/reference/ai-patterns.md:19` (strip, all domains) | RR |
| 37 | apology boilerplate | `do ?n.?t apologi[sz]e\|no apolog(y\|ies)` | (synthetic) | PBP |
| 38 | use the right tool | `use the (right\|appropriate\|correct\|best) tool` | (synthetic) | PBP |
| 39 | blanket tool default | `default to using` | PBP: "Replace blanket defaults with more targeted instructions" | PBP |
| 40 | read-before-edit (tool already enforces) | `read (the )?file before (edit\|writ)` | (synthetic) -- Edit errors without a prior Read; the instruction is inert | SKB |
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

## Inverted near-twins -- these LOOK droppable and are KEEPS

An instruction earns its tokens when it **inverts or tightens** a documented default, names a
threshold, or names a project fact. Same surface words, opposite verdict.

| # | DROP form (no delta) | KEEP form (inverts / tightens / names) | What the keep-form changes |
|---|----------------------|----------------------------------------|----------------------------|
| 1 | "write clean, readable code" | "Comments only where they earn it: non-obvious logic + public API docstrings; !=narrate self-evident code" | Inverts the model's default to comment liberally |
| 2 | "be concise" | "Verdict first, <=30 lines, `path:line`, !=preamble" | PBP: latest models are "less verbose" but still need explicit preamble suppression; adds a number |
| 3 | "think step by step" | "Think short: minimal internal reasoning, no exploring aloud" | Inverts the default; OAI/PBP say prescribing CoT is at best inert |
| 4 | "handle errors appropriately" | "grep-filter pipelines under `set -o pipefail` need `\|\| true`" (`.claude/rules/avoid.md:7`) | Names the exact failure and the exact fix |
| 5 | "follow best practices" | "Pin exact semver X.Y.Z everywhere; `@latest`/`:latest`/`@main` forbidden" (`~/.claude/rules/avoid.md:4`) | A prohibition the model does not default to |
| 6 | "write tests" | "GIVEN/WHEN/THEN comments, descriptive names, no logs in tests" | Project test contract, not the generic habit |
| 7 | "be helpful / do the task well" | "Manager -- NEVER executor. Every real-work unit -> a subagent" | Inverts the default do-it-yourself behaviour |
| 8 | "if unsure, ask the user" | "At most ONE clarifying `AskUserQuestion`, max 4 questions, only when the answer changes what is written" | Caps a default that otherwise overtriggers (PBP) |
| 9 | "double-check your work" | "`++r`: 1. Review 2. Double-check 3. Fix only after confirmation -- never fix on the first pass" | Names a mechanism + an ordering; PBP says the bare form should be *removed* on Opus 5 |
| 10 | "use meaningful names" | "Spell **Maksim**: !=\"Maxim\", !=\"Maxim KS\"" | An identity fact no model can derive |
| 11 | "don't over-engineer" | "Opus 4.5/4.6 tend to overengineer -> state an explicit minimal-complexity constraint" | Model-scoped; PBP documents the tendency and prescribes the constraint |
| 12 | "validate inputs" | "!=ANY inequality (`>`,`>=`) in assertions -> exact equality; non-deterministic -> explicit tolerance" | Inverts the model's default weak-assertion habit |
| 13 | "ask before doing anything risky" | "!=revert without CONF: `git revert`, `git reset`, `git checkout -- <file>`, `git restore` require EXPLICIT confirmation" | Enumerates the exact commands |
| 14 | "keep the docs up to date" | "!=hand-edit MDX/README/`navigation.ts`; use `/docs`" (`.claude/rules/docs-workflow.md`) | A prohibition + a named replacement path |

## Decision rule

**Unit of decision = the CLAUSE, never the line.** A clause is: one table cell (split the row on `|`),
or one sentence/`;`-delimited segment/`--`- or em-dash-delimited segment of a prose line. An invariant
protects the clause that carries it, not the twelve other words parked on the same line.

Apply in order; the first hit decides. Anything unresolved is a KEEP.

| Step | Test | Verdict |
|------|------|---------|
| 0 | Is the span inside a fenced code block, or on a `\|`-leading table-structure line? | KEEP, untouched -- STRUCTURAL EXEMPTION, no matcher runs |
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
category error: it made step 1 fire on almost every line and left the catalog with nothing to act on.

Measured on this repo, step 1 keep rate, whole-line vs clause + hard classes only:

| File | BEFORE: whole line, all classes | AFTER: clause, hard classes | Eligible surface, bytes (BEFORE -> AFTER) |
|------|--------------------------------|------------------------------|-------------------------------------------|
| `CLAUDE.md` | 177/205 lines = **86%** | 255/461 clauses = **55%** | 2% -> **14%** |
| `.claude/rules/avoid.md` | 11/15 = **73%** | 22/46 = **48%** | 2% -> **23%** |
| `~/.claude/CLAUDE.md` | 67/71 = **94%** | 93/174 = **53%** | 2% -> **22%** |

Reproduce with the class lists above; the BEFORE column is what the pre-fix rule produced. `slug:` and
capitalised-word hits still count at VERIFY time, so nothing that was protected becomes deletable --
what changes is that a generic clause no longer rides to safety on a specific neighbour.

> A drop is a **whole-line** operation only when EVERY clause on the line is generic. A generic clause
> welded to a specific one (row 7: "production-quality bash scripts **for macOS/Linux**") loses the
> adjective, keeps the scope.

### Row 34 worked measurement (`JUDGE-ONLY` + qualified matcher)

Over `brewcode/agents/*.md`, the published unqualified matcher hit **13 lines**. Three were the named
false positives: `agent-creator.md:153` (the table header `| Event | Matcher | When | Note |`),
`agent-creator.md:456` (`| red | Security, critical |`, a lookup value), `bc-rules-organizer.md:68`
(`critical > important > nice-to-have`, an ordering). Applying step 0 plus clause (b) of the row-34
matcher leaves **3 lines**, and all three named false positives are gone. Those 3 are judge referrals,
not drops -- the row is `JUDGE-ONLY`.

`UNVERIFIED` labels: none of the rows above rest on an unsourced claim. Where a row's example is
`(synthetic)`, the *pattern* is still sourced by its Src key -- only the sample sentence is invented,
because this repo's context layer was already compressed past those forms.

## Sources

- SKB https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- PBP https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- MEM https://code.claude.com/docs/en/memory
- CTX https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- CCB https://www.anthropic.com/engineering/claude-code-best-practices
- OAI https://developers.openai.com/api/docs/guides/reasoning-best-practices
- RR `brewtools/skills/text-optimize/references/rules-review.md`
