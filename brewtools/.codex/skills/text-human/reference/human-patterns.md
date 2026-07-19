# Human-Injection Patterns by Domain (PASS 2)

Gated, separate from strip. Classify register FIRST -- misclassification is the main failure mode. Human-ness = burstiness (sentence-length variance) + concreteness (specific detail) + stance (real opinion) + register fit. NOT injected errors.

---

## GLOBAL HARD-GUARDS (apply before any domain rule)

1. NEVER inject typos / misspellings / grammar errors. A typo in a command/path/identifier breaks correctness. Tolerable only as incidental in casual social -- never manufactured. FORBIDDEN in code, docs, API, commit/PR, formal.
2. API / formal / legal = STRIP-ONLY, inject DISABLED. Detect `/** */`, `@param`/`@return`/`@throws`, KDoc, docstrings, OpenAPI descriptions, legal text -> turn off inject, run strip-only.
3. NEVER fabricate references -- tickets, URLs, package names, citations. Omitting beats inventing.
4. Tune by weight, not on/off. Burstiness HIGH for essay/reddit, LOW for commit/API. Emoji incidental-only in chat. Hedges reddit-only, on real claims.

---

## reddit / forum
ADD: lowercase sentence starts; `imo`/`tbh` (lowercase=casual); hedges `imo/ymmv/afaik` on real claims; anecdote-led; parenthetical asides; self-deprecation; high burstiness, fragments OK.
AVOID: essay intros/conclusions, "In conclusion", balanced both-sides, marketing polish, uniform sentences.
GUARD: don't manufacture slang the poster wouldn't use. Typos incidental only.

## slack / discord / chat
ADD: fragments; no capitalization; one thought per line; emoji sparingly+naturally (reaction not decoration); heavy contractions; clipped ("on it", "lgtm", "wfm").
AVOID: greetings/sign-offs, full paragraphs, numbered lists for a quick reply, emoji on every line.
GUARD: emoji density IS the tell -- over-injection reads bot-like. No fabricated typos.

## technical docs / README
ADD: clear imperative ("Click Submit", "Run the build"); concrete runnable examples over abstraction; conversational-but-restrained, contractions OK, second person; varied sentence lengths.
AVOID: marketing/buzzwords, false-simplicity (`simply`, `it's easy`, `that simple`), `please` in instructions, slang, cutesy tone.
GUARD: NO injected typos (breaks commands). No fake stance. Humanize via tone + concrete examples only.

## commit / PR
ADD: terse subject (<=50 chars, 72 max), blank line, body ~72 cols; body = what + why (motivation, contrast with prior), not how; real ticket refs in footer; PR = short "What changed / Why / How to test", answerable <1 min.
AVOID: fluff, "fixes stuff", restating the diff, padding, two-page templates.
GUARD: no injected errors; NO fake tickets; no personality -- terseness IS the human signal; stance only as grounded "why".

## formal essay / published blog
ADD: high burstiness (mix lengths by choice; read-aloud test); a real thesis / stated position -- don't hedge "it depends" without specifics; concrete specifics over abstraction; contractions, idiom, less-predictable word choice.
AVOID: symmetric both-sides + "ultimately it depends", uniform rhythm, abstraction-stacking, "Moreover/Furthermore" chains.
GUARD: NO injected typos/grammar errors (loses authority). Burstiness + stance are the levers.

## JavaDoc / API docs -- CLEAN-ONLY (inject DISABLED)
ADD (precision, not personality): third-person imperative ("Gets the foo", "Returns the bar" -- NOT "Get the foo"); explicit contract (null-handling, boundaries, ranges, corner cases); `@param`/`@return` lowercase, no trailing period; `@throws` conditional ("if the file could not be found"); lean, precise.
AVOID: explaining common terms, restating trivial impl, marketing, narrative voice, opinion.
GUARD (strongest): NEVER inject informality, contractions, stance, asides, burstiness-for-flavor, lowercase, typos. On API-doc context -> DISABLE inject, run strip-only.

---

## Per-domain weight matrix

| Signal | reddit | chat | tech-docs | commit/PR | essay/blog | API/formal |
|---|---|---|---|---|---|---|
| Burstiness | high | high | med | low | high | OFF |
| Contractions | high | high | OK | low | high | FORBIDDEN |
| Stance/opinion | high | med | none | grounded-why | high | FORBIDDEN |
| Emoji | rare | incidental | no | no | no | no |
| Hedges (imo/ymmv) | yes (real claims) | rare | no | no | no | no |
| Concrete specifics | high | med | high (examples) | high (why) | high | high (contract) |
| Inject stage | ON | ON | ON | ON (terse) | ON | OFF |
