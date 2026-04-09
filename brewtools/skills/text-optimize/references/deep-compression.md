# Deep Compression Reference

Reference for deep compression mode applied to LLM-only documents (CLAUDE.md, system prompts, agent/skill definitions, KNOWLEDGE files).

## Symbol Substitution

| Symbol | Meaning |
|--------|---------|
| `→` | leads to, results in, flow |
| `+` | and, combined with |
| `!=` | must not, never, prohibited |
| `>` | greater than, preferred over |
| `=` | equals, is defined as |
| `∴` | therefore, consequently |
| `∵` | because, since |
| `@` | at, located at |
| `|` | or, alternative |
| `:` | has property, contains |
| `~` | approximately |
| `⊃` | includes, contains (set) |

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

Place DICT header at document start when terms appear 3+ times:

```
[DICT: CC=Claude Code, KB=knowledge base, SP=system prompt, ...]
```

Rules:
- Terms appearing 3+ times → dictionary entry
- Max 20 entries
- Sort alphabetically
- Place before first content line
- Use abbreviation from DICT throughout document

## Filler Words & Phrases to Remove

Apply filler removal from `rules-review.md` rule T.6. Additional deep-mode removals:

| Pattern | Action |
|---------|--------|
| Articles (the/a/an) | Remove when meaning clear without them |
| Relative clauses ("which is", "that are") | Remove or restructure |
| Hedging ("might", "possibly", "could potentially") | Remove — use direct statements |

## Structural Compression Patterns

- Conditionals: `if X → Y` or `X ? Y : Z`
- Prohibitions: `!=X ∵Y` (must not X because Y)
- Lists: inline comma-separated when items are short
- Tables: for multi-attribute data
- Merge related one-liners into single line with `|` separator
- Remove markdown formatting that doesn't aid parsing (bold, italic in tables)
- Headers: flatten to 2 levels max
- Remove blank lines between items in lists/tables

## Iron Rules

Preserve in ALL cases regardless of compression level:
- Names, numbers, dates, URLs, file paths, versions, ports, sizes
- Negative rule semantics (use `!=` notation)
- At least one example per rule that originally has examples
- DICT header at document start

## Before/After Examples

### Example 1 — Prose Instruction

**Original** (~60 words):
> Please note that when you are working with the database connection, it is important to make sure that you close the connection after you are done with it. Failure to do so can result in connection pool exhaustion, which may lead to the application becoming unresponsive.

**Compressed** (~15 words):
> DB conn: close after use ∵ unclosed → pool exhaustion → app unresponsive

### Example 2 — Rule Block with DICT

**Original** (~90 words):
> ## File Handling Rules
>
> When working with temporary files in the build directory, you should always use the project's file utility library. It is important to note that temporary files must be cleaned up after the build process completes. You must not write temporary files to the source directory because it can corrupt the version control state. The file utility library provides a `cleanup()` method that should be called in the finally block. All temporary files should use the `.tmp` extension.

**Compressed** (~35 words):
> [DICT: TF=temporary files, FUL=file utility lib, BD=build dir]
>
> ## File Handling
> TF in BD: use FUL | cleanup via `cleanup()` in finally block | ext: `.tmp`
> !=TF in src dir ∵ corrupts VCS state

### Example 3 — Configuration Section

**Original** (~70 words):
> ## Server Configuration
>
> The application server runs on port 8443 with TLS enabled. The configuration file is located at `/etc/myapp/server.yml`. The minimum required version is Java 21. The maximum heap size should be set to 4096MB for production environments. Health check endpoint is available at `https://localhost:8443/health`. The connection timeout is 30 seconds and the read timeout is 60 seconds.

**Compressed** (~40 words):
> ## Server Config
> Port: 8443 (TLS) | cfg: `/etc/myapp/server.yml` | Java >= 21
> Heap max: 4096MB (prod) | health: `https://localhost:8443/health`
> Timeouts: conn 30s, read 60s

### Example 4 — Negative Rules

**Original** (~80 words):
> ## Security Rules
>
> You must never store passwords in plain text in the configuration files. API keys should not be committed to the repository under any circumstances. It is important to make sure that you do not log sensitive information such as tokens or credentials at any log level. You should not disable TLS certificate verification in production environments because it exposes the application to man-in-the-middle attacks.

**Compressed** (~30 words):
> ## Security
> !=plaintext passwords in cfg files
> !=API keys in repo
> !=log sensitive data (tokens, credentials) @ any log level
> !=disable TLS cert verification in prod ∵ MITM exposure
