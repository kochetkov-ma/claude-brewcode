# Topic: Power Features

Domain: Mastery

Deliver section by section. Pause after each section with AskUserQuestion.

## Section 1: Convention Extraction

Convention extraction analyzes your existing code to discover patterns and enforce them automatically.

```bash
# Analyze existing code patterns
/brewcode:convention

# Modes:
/brewcode:convention extract   # Find patterns in code
/brewcode:convention document  # Generate convention docs
```

What it extracts:
- **Naming conventions** — how you name classes, methods, variables, files
- **Error handling patterns** — try/catch structure, error types, logging
- **Test structure** — setup, assertions, mocking patterns
- **API patterns** — endpoint naming, request/response shapes, middleware
- **Architecture** — layer separation, dependency direction, module boundaries

Output goes to `.claude/rules/` as auto-loaded rule files. New code follows your established patterns automatically — no manual style guides needed.

The convention skill identifies etalon (reference) classes in your codebase. These become the standard that generated rules point to.

## Section 2: Deep Code Review

Quorum code review with multiple independent perspectives.

```bash
# Deep multi-perspective review:
/brewcode:superreview
```

How it works:
1. Three independent reviewers analyze the code simultaneously
2. Each reviewer focuses on different aspects: architecture, security, performance, correctness, maintainability
3. Issues require 2/3 consensus to be flagged (reduces false positives)
4. Up to MAX_CYCLES=3 review-fix loops

Review process:
```
Code submitted -> 3 reviewers analyze independently
  -> Compare findings -> 2/3 consensus required
    -> Issues reported -> Developer fixes
      -> Re-review (up to 3 cycles)
        -> Final report
```

The quorum approach filters out subjective preferences and focuses on issues that multiple reviewers agree on.

## Section 3: Secrets Scanning

Detect leaked credentials before they reach your repository.

```bash
/brewtools:secrets-scan
```

What it detects:
- API keys and tokens (AWS, GCP, Azure, GitHub, Stripe, etc.)
- Passwords and connection strings
- Private keys (RSA, SSH, PGP)
- Environment variable leaks in committed files
- Hardcoded credentials in source code

How it works:
- Scans all git-tracked files in the project
- Combines pattern matching with entropy analysis
- Zero false positives design — only flags high-confidence matches
- Reports file, line number, and credential type

Best practice: run `/brewtools:secrets-scan` before commits as part of your workflow. Combine with `/brewcode:superreview` for comprehensive pre-merge checks.
