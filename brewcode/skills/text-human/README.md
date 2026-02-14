---
auto-sync: enabled
auto-sync-date: 2026-02-12
auto-sync-type: doc
---

# Text Humanizer

Remove AI artifacts and simplify documentation from your code.

## What It Does

Cleans up code and documentation by removing AI-generated comments, simplifying excessive docs, and fixing unicode characters. Works with individual files, folders, or entire commits.

## How to Use

```bash
/brewcode:text-human <commit-hash|path> [custom instructions]
```

## Examples

```bash
# Process a specific commit
/brewcode:text-human 3be67487

# Process a single file
/brewcode:text-human src/main/java/MyService.java

# Process a folder
/brewcode:text-human src/main/java/services/

# With custom instructions
/brewcode:text-human src/ only remove AI artifacts, don't touch docs
```

## What Gets Removed

- AI-generated comments: `// Added by AI`, `// Claude suggestion`
- Fake issue numbers: `BUG-001`, `FIX-123`
- Unicode artifacts: smart quotes, arrows, dashes
- Trivial documentation that just restates the function name
- Excessive comments that describe obvious code

## What Gets Kept

- Real issue references (your project's ticket patterns)
- "Why" comments explaining non-obvious behavior
- Public API documentation
- Structural comments in SQL/YAML files

## Speed

Uses parallel processing for large codebases. Simple files processed with Haiku model, complex code with Sonnet for faster results.

## Languages Supported

Java, Kotlin, TypeScript, JavaScript, Python, SQL, YAML, Markdown, and more.
