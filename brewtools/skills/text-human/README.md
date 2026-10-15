# Text Humanizer

Strips AI surface artifacts (chat scaffolding, fake tickets, unicode, trivial docs that restate a name) from code, docs, commits, articles and chat text, and fits the register. It does not claim to detect AI authorship.

## Install

```bash
claude plugin install brewtools@claude-brewcode
```

Model-invocable: type `/brewtools:text-human ...` or ask Claude mid-task ("humanize this README"). Empty input asks once; a headless run stops with "nothing to humanize".

## Usage

```text
/brewtools:text-human [path|commit|folder|text] [custom instructions]
```

| Input shape | Result |
|-------------|--------|
| File path | One file, flow picked from path and content |
| Commit hash (7+ hex) | Mixed flow over all changed files (current worktree content) |
| Folder | Mixed flow, parallel blocks |
| Free text | Flow inferred from text and intent |
| Path + prompt | Scope plus custom rules |
| No args | Interactive fallback |

```text
/brewtools:text-human src/main/java/com/example/OrderService.java
/brewtools:text-human 3be67487 also drop all @author tags
/brewtools:text-human src/ only strip AI artifacts, no inject
```

Flows: code (inject OFF), docs, social, article, mixed. Edits are in place with no backup: a dirty target asks first, and git is the undo.

Two passes: STRIP removes validated AI tells (HIGH-tier on single hits, MED only on clusters); INJECT applies human style per domain, hard-off for code and API docs. Hallucinated refs and fabricated tickets are surfaced for review, never auto-edited. WHY comments, public API docs and real tickets are kept.

## Documentation

Full docs: [text-human](https://doc-claude.brewcode.app/brewtools/skills/text-human/)
