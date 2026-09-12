# Deep Compression Reference

Reference for deep compression mode applied to LLM-only documents (AGENTS.md, system prompts, agent/skill definitions, KNOWLEDGE files).

## Symbol Substitution

| Symbol | Meaning |
|--------|---------|
| `->` | leads to, results in, flow (prefer over `→`; both ~1 tok but `->` portable) |
| `+` | and, combined with |
| `!=` | must not, never, prohibited |
| `>` | greater than, preferred over |
| `=` | equals, is defined as |
| `so` / `->` | therefore, consequently (was `∴`) |
| `bc` / `because` | because, since (was `∵`) |
| `@` | at, located at |
| `\|` | or, alternative |
| `:` | has property, contains |
| `~` | approximately |
| `includes` | includes, contains (set) (was `⊃`) |

Token cost (measured, tiktoken cl100k/o200k): ASCII digraphs `-> != >= <= |` = 1 token each; unicode glyphs `∵ ∴ ⊃ ≤ ≥` = 2-3 tokens each. Prefer ASCII. The token win comes from deleting words, not the glyph.

Status emoji cost 2-4 tokens each (measured): `✅`/`❌` = 2-3 tok, `ℹ️` = 3 tok (variation-selector, worst). In token-sensitive deep output prefer ASCII `[x]`/`OK`/`FAIL`/`!`. Keep emoji only where priority-signaling value (e.g. KNOWLEDGE ❌/✅/ℹ️ ordering) outweighs token cost.

## Priority Labels

| Label | Meaning |
|-------|---------|
| IMP | important |
| CRIT | critical |
| WARN | warning |
| OPT | optional |
| REC | recommended |
| REQ | required |
| DEF | default |
| N/A | not applicable |

## Standard Abbreviations

| Abbrev | Full | Abbrev | Full | Abbrev | Full |
|--------|------|--------|------|--------|------|
| func | function | cfg | configuration | impl | implementation |
| deps | dependencies | auth | authentication | env | environment |
| req | request | res | response | DB | database |
| API | api | UI | user interface | UX | user experience |
| repo | repository | PR | pull request | CI/CD | continuous integration/delivery |
| pkg | package | dir | directory | cmd | command |
| arg | argument | ret | return | doc | documentation |
| spec | specification | ver | version | msg | message |
| err | error | val | value | def | definition |
| ref | reference | ctx | context | fmt | format |
| lib | library | mod | module | obj | object |
| str | string | int | integer | bool | boolean |
| arr | array | dict | dictionary | async | asynchronous |
| sync | synchronous | param | parameter | var | variable |
| const | constant | exec | execute | init | initialize |
| proc | process | svc | service | | |
| ns | namespace | tpl | template | idx | index |
| len | length | max | maximum | min | minimum |
| avg | average | cnt | count | num | number |
| tmp | temporary | prev | previous | next | next |
| cur | current | orig | original | dest | destination |
| src | source | | | | |

## Dictionary Format

Place `[DICT: CC=Codex, KB=knowledge base, SP=system prompt, ...]` at document start when
terms appear 3+ times. Rules: max 20 entries, sort alphabetically, place before the first content
line, use the abbreviation from DICT throughout — a term used <3x stays inline (rules-review.md R13:
DICT pays only on a long, repetition-heavy file, not a short one).

## Filler Words & Phrases to Remove

Beyond `rules-review.md` T.6: drop articles (the/a/an) when meaning survives without them, relative
clauses ("which is", "that are"), and hedging ("might", "possibly", "could potentially") — state
direct facts instead.

## Structural Compression Patterns

- Conditionals: `if X -> Y` or `X ? Y : Z` | prohibitions: `!=X bc Y` (must not X because Y)
- Lists: inline comma-separated when items are short | tables: for multi-attribute data
- Merge related one-liners into a single line with `|` separators
- Remove markdown formatting that doesn't aid parsing (bold, italic in tables)
- Headers: flatten to 2 levels max | remove blank lines between list/table items

## Redundancy Factoring

Run dedup pass (D.1-D.6, rules-review.md) BEFORE symbol substitution — merging first shrinks the text remaining passes must process and keeps verification cheap. Record merges in a dedup ledger (kept <- dropped).

- Phrase-DICT (recurring phrase >=3 words, 2+ times -> DICT entry, counts toward the 20-cap; CompactPrompt arXiv:2510.18043) | path-prefix hoisting (repeated path/URL prefix -> one DICT entry, e.g. `[DICT: SR=src/main/resources]`)
- Header-echo removal (drop repeated parent words: "## Server Config / ### Server Config Ports" -> "### Ports") | number/unit normalization ("approximately 30 percent" -> `~30%`, "greater than or equal to 21" -> `>=21`)

## Token-Class Keep/Drop Heuristics

Source: LLMLingua-2 arXiv:2403.12968. When compressing at word level:

| Keep | Drop (when meaning survives) |
|------|------------------------------|
| Nouns, verbs, numerals, NEGATIONS, named entities | Determiners, copulas ("is", "are"), auxiliaries, discourse connectors ("furthermore", "as a result") |

Never drop negations or scope qualifiers (L.8; max-mode guardrail C2).

## Aggressive Lossy Techniques (A.1-A.4)

Deep/max only. Full rule + ledger semantics live in `rules-review.md` category A (Step 0, always
loaded) — do not restate here. Application order: dedup (D.1-D.6) -> A.1 fusion -> A.3 paraphrase ->
A.2 word drop -> A.4 elision -> symbol substitution.

### Example: A.1 fusion + A.3 paraphrase (loss-free)
> "The deployment script should be executed from the project root directory. In the event that the script fails, you can check the log file which is located at `logs/deploy.log`." -> "run deploy script from project root | fail -> check `logs/deploy.log`"

### Example: A.4 elision, project delta kept
> "Always write unit tests for new code, since testing catches regressions early. Keep functions small and readable. The project coverage gate is 85% (jacoco); builds fail below it." -> "coverage gate 85% (jacoco), build fails below"

Ledger: dropped "write unit tests / catches regressions" + "keep functions small" -> generic LLM knowledge. Kept: 85%, jacoco, build-fail behavior (project-specific).

## Iron Rules

Preserve in ALL cases regardless of compression level — the lossless guard, never paraphrased,
rounded, or dropped:
- Names, numbers, dates, URLs, file paths, versions, ports, sizes
- CLI flags/options verbatim (`-x`, `--max`); model IDs byte-exact (`claude-balanced model-5`, never "balanced model 5")
- Thresholds, gates, percentages exactly as stated (`>=95%`, `~20%` ceiling) — never rounded
- Negative rule semantics (use `!=` notation) | >=1 example per rule that originally had examples
- DICT header at document start
- Dedup ledger: every merged pair recorded (kept <- dropped); merged facts count as preserved in verification
- Loss ledger: every A.2/A.4 drop recorded (dropped -> reason); never elide project-specific facts (names, numbers, paths, versions, prohibitions)

## Stop Condition

Stop the A.1-A.4 pass the instant one of these trips — patch back, never push further:
- A.2 would touch a noun, numeral, negation or named entity (Token-Class Heuristics above already forbid it — this is the enforcement trigger)
- An A.4 candidate is not clearly generic training-knowledge (unsure -> keep, per the A.4 rule itself)
- DICT header would exceed 20 entries, or would cover a term used <3x
- The dedup/loss ledger can no longer account for every merge and drop 1:1

## Before/After Examples

### Example 1 — Prose Instruction

**Original** (46 words):
> Please note that when you are working with the database connection, it is important to make sure that you close the connection after you are done with it. Failure to do so can result in connection pool exhaustion, which may lead to the application becoming unresponsive.

**Compressed** (13 words):
> DB conn: close after use bc unclosed -> pool exhaustion -> app unresponsive

### Example 2 — Rule Block with DICT

**Original** (82 words):
> ## File Handling Rules
>
> When working with temporary files in the build directory, you should always use the project's file utility library. It is important to note that temporary files must be cleaned up after the build process completes. You must not write temporary files to the source directory because it can corrupt the version control state. The file utility library provides a `cleanup()` method that should be called in the finally block. All temporary files should use the `.tmp` extension.

**Compressed** (35 words incl. DICT header, 27 body):
> [DICT: TF=temporary files, FUL=file utility lib, BD=build dir]
>
> ## File Handling
> TF in BD: use FUL | cleanup via `cleanup()` in finally block | ext: `.tmp`
> !=TF in src dir bc corrupts VCS state

### Example 3 — Configuration Section

**Original** (56 words):
> ## Server Configuration
>
> The application server runs on port 8443 with TLS enabled. The configuration file is located at `/etc/myapp/server.yml`. The minimum required version is Java 21. The maximum heap size should be set to 4096MB for production environments. Health check endpoint is available at `https://localhost:8443/health`. The connection timeout is 30 seconds and the read timeout is 60 seconds.

**Compressed** (25 words):
> ## Server Config
> Port: 8443 (TLS) | cfg: `/etc/myapp/server.yml` | Java >= 21
> Heap max: 4096MB (prod) | health: `https://localhost:8443/health`
> Timeouts: conn 30s, read 60s

### Example 4 — Negative Rules

**Original** (64 words):
> ## Security Rules
>
> You must never store passwords in plain text in the configuration files. API keys should not be committed to the repository under any circumstances. It is important to make sure that you do not log sensitive information such as tokens or credentials at any log level. You should not disable TLS certificate verification in production environments because it exposes the application to man-in-the-middle attacks.

**Compressed** (29 words):
> ## Security
> !=plaintext passwords in cfg files
> !=API keys in repo
> !=log sensitive data (tokens, credentials) @ any log level
> !=disable TLS cert verification in prod bc MITM exposure

### Measured (this file's own examples, `wc -w`)

| Example | Original | Compressed | Reduction | Ratio |
|---------|----------|------------|-----------|-------|
| 1 — Prose Instruction | 46 | 13 | -71.7% | 3.54x |
| 2 — Rule Block + DICT | 82 | 27 (35 w/ DICT) | -67.1% | 3.04x |
| 3 — Config Section | 56 | 25 | -55.4% | 2.24x |
| 4 — Negative Rules | 64 | 29 | -54.7% | 2.21x |
| Total | 248 | 94 | -62.1% | 2.64x |

Deep mode's "2-3x" target above is this file's own measured spread (2.2x-3.5x, combined 2.64x) on
dense rule prose, not an invented number — re-measure with `wc -w` before claiming a new ratio.
