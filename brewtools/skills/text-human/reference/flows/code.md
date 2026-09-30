# Flow: code

Source code + inline comments + docstrings/JavaDoc/JSDoc/KDoc.

## Stance
- PASS 1 STRIP: ON, heavy.
- PASS 2 INJECT: HARD-OFF. Code and API docs are formal-contract -- only strip AI tells and normalize unicode/formatting. Never inject personality, contractions, stance, or burstiness.

## Sub-profile: API-docs / JavaDoc / docstring CLEAN-ONLY
Triggered by javadoc/jsdoc/kdoc/docstring/"api doc" intent OR detecting `/** */`, `@param`/`@return`/`@throws`, KDoc, docstrings, OpenAPI descriptions.
- Run strip-only. Inject stage fully disabled.
- Keep meaningful docs at any visibility or test location; never blanket-strip private/test docs. Preserve tool/runtime-consumed docstrings, doctests and JSDoc tags.
- Strip a `@param`/`@return` line ONLY when its text == reworded identifier (`@param userId The user ID`).
- Keep `@throws` with real conditions, contract notes, null-handling, boundaries.

## Load language reference (lazy)
Read only the matching file:
- `*.java`, `*.kt`, `*.groovy` -> `@reference/java.md`
- `*.ts`, `*.tsx`, `*.js`, `*.jsx` -> `@reference/typescript.md`
- `*.py` -> `@reference/python.md`
- other languages (`*.go`, `*.rs`, `*.cpp`, ...) -> apply the universal code rules below; no dedicated reference.

## PASS 1 -- strip (from @reference/ai-patterns.md)
Functional directive/contract preservation overrides STRIP and cosmetic rules: keep lint/type/build/security/license/coverage directives byte-for-byte, including broad or unexplained suppressions. Missing reasons -> SURFACE; narrowing/removal or type-comment-to-annotation migration requires explicit scope and relevant checks.
Apply universal-strip (sec 1) on single instances:
- AI self-attribution comments, bot trailers, prompt residue.
- Unicode -> ASCII (em-dash -> `--`, arrows -> `->`/`<-`/`=>`, smart quotes -> `"`/`'`, bullets -> `-`) **only inside comments and docstrings**. Executable regions are off-limits: string/char literals (incl. f-strings, template literals, heredocs, Go raw strings), regexes, identifiers, annotation/decorator arguments, and any i18n or test-fixture data. A smart quote there is quoting semantics, an em dash there is program data -- SURFACE it, never edit it. Cannot tell comment from literal on a given line -> surface, do not guess.
Apply code tells (sec 3):
- Strip comment that restates the line below (zero added info) -- on density.
- Strip line-by-line narration, tutorial framing ("Here we...", "Now we...").
- Emoji in comments/debug output: remove decoration only from non-functional comments; output is program data -> SURFACE, never change.
- Strip docstring line only when it reworded the identifier.
Density-signals (sec 4): act ONLY when several co-occur (e.g. banner overuse in a trivial file).

## Keep (WHY over WHAT)
| Remove | Keep |
|--------|------|
| `// Initialize the list` | `// Retry 3x due to flaky external API` |
| `// Loop through items` | `// Uses UTC to match database timezone` |
| `// Check if null` | `// Thread-safe: synchronized on class lock` |
| Stale `// TODO: refactor this` | `// HACK: workaround for JDK-12345` |

Preserve BDD comments: `// GIVEN`, `// WHEN`, `// THEN`, `// AND`, their `#` equivalents and Arrange/Act/Assert.

## Issue references
Keep real tickets regardless of pattern (INTELDEV-XXXXX, JIRA-XXXXX, GH-XXX, BUG-001, FIX-123, ISSUE-42). Remove only IDs proved invented AND resolving to no real ticket after checking actual tracker/provenance; unavailable access or uncertainty -> SURFACE.

## Surface-for-review -- NEVER auto-edit (from ai-patterns sec 5)
Report, do not change: hallucinated package/method/URL refs, fabricated tickets, try/except-everything, empty catch-all, placeholder TODO logic, duplicated abstractions, naming drift, happy-path-only tests, CI gaming, unicode inside a literal/regex/identifier, mixed indentation in an excluded file.

## Formatting (safe cosmetic)
Ordinary non-functional `/* single line */` -> `// single line`; never convert JavaDoc/JSDoc/KDoc `/** */` or directives. 3+ blank lines -> max 2; trim trailing whitespace only outside literals, tool-consumed docs/doctests and directives. Heredoc/raw-string trailing spaces are data.

Indentation is NOT cosmetic. Tabs/spaces rewriting is OPT-IN: it runs only when the user asks for it in the prompt, never by default. Even then it is HARD-EXCLUDED on `*.py`, `Makefile`/`makefile`/`GNUmakefile`, `*.mk`, `*.yaml`, `*.yml`, and inside Go raw strings / heredocs / any multi-line literal -- there indentation is syntax or data, and a rewrite changes program behavior silently. Path mode targets `*.py` by default, so this exclusion is the common case, not the edge case. Mixed indentation in an excluded file -> SURFACE for review with the line numbers, never edit.
