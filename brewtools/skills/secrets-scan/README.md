---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# Secrets Scan

Security audit for leaked credentials in git-tracked files. Spawns 10 parallel agents to scan the entire repository, classifies findings by severity, and generates a detailed report with optional interactive remediation.

## Quick Start

```
/brewtools:secrets-scan
```

## Modes

| Mode | How to trigger | What it does |
|------|---------------|--------------|
| Scan only | `/brewtools:secrets-scan` | Scans all git-tracked files, generates severity-ranked report |
| Scan + fix | `/brewtools:secrets-scan --fix` | Scans, then walks through each CRITICAL/HIGH finding interactively |
| Auto-fix prompt | No flag needed | If CRITICAL or HIGH findings exist, prompts whether to remediate |

Fix mode options per finding:

| Option | Action |
|--------|--------|
| Fix | Delete or replace the secret inline |
| Move to env var | Extract value into environment variable reference |
| Add to .gitignore | Append the file path to `.gitignore` |
| Mark false positive | Acknowledge and skip |
| Skip | Leave as-is, move to next finding |

## Examples

### Good Usage

```bash
# Pre-commit security check on the full repo
/brewtools:secrets-scan

# Scan and fix all findings interactively
/brewtools:secrets-scan --fix

# Run after onboarding a new contributor to verify no secrets leaked
/brewtools:secrets-scan

# Run before open-sourcing a private repo
/brewtools:secrets-scan --fix

# Periodic audit as part of a security review cycle
/brewtools:secrets-scan
```

### Common Mistakes

```bash
# Running outside a git repository -- the skill requires git-tracked files
cd /tmp && /brewtools:secrets-scan
# ERROR: Not git repo

# Ignoring CRITICAL findings -- always remediate HIGH and CRITICAL before pushing
/brewtools:secrets-scan
# -> 3 CRITICAL findings... (do not ignore these)

# Assuming a clean scan means zero risk -- the skill detects patterns, not all secrets
# Always combine with .gitignore rules and pre-commit hooks for defense in depth
```

## What It Detects

| Category | Examples |
|----------|---------|
| Passwords | `password=`, `passwd:`, `secret=`, `pwd=` followed by a value |
| API Keys | `api_key`, `access_key`, `apikey`, `api_secret` |
| Tokens | `token`, `bearer`, `auth_token`, `access_token` |
| AWS Credentials | `AKIA[0-9A-Z]{16}`, `aws_secret`, `aws_access_key` |
| Database URLs | JDBC, MongoDB, MySQL, PostgreSQL connection strings with embedded credentials |
| Private Keys | `-----BEGIN ... PRIVATE KEY-----`, `client_secret`, `encryption_key` |

**Skipped automatically:** environment variable references (`process.env.*`, `${VAR}`, `os.getenv()`), common placeholders (`changeme`, `YOUR_KEY`, `xxx`, `dummy`), documentation comments, binary files.

## Severity Levels

| Level | Criteria |
|-------|----------|
| CRITICAL | Real credentials, private keys, database connection strings with passwords |
| HIGH | Real API keys or tokens, AWS credentials |
| MEDIUM | Suspicious hardcoded values that may be secrets |
| LOW | Placeholder values like `changeme`, `YOUR_KEY`, `xxx`, `dummy` |

## Output

Report location: `.claude/reports/{TIMESTAMP}_secrets-scan/report.md`

The report contains:

| Section | Content |
|---------|---------|
| Summary | File counts, severity breakdown (CRITICAL / HIGH / MEDIUM / LOW) |
| Findings | Per-severity tables with file path, line number, matched content, description |
| Agent Stats | Per-agent breakdown of assigned, scanned, and finding counts |
| File Inventory | Complete list of scanned files and skipped files with skip reasons |

A console summary is also displayed at the end of the scan with the key metrics and the path to the full report.

## Tips

- **Run early, run often.** The best time to catch a leaked secret is before it reaches a remote branch. Use this skill as a pre-push check.
- **Expect false positives.** Pattern-based detection will flag test fixtures, example configs, and documentation snippets. Use `--fix` to mark them as false positives and move on.
- **Combine with .gitignore.** After identifying sensitive files, add them to `.gitignore` immediately. The `--fix` mode offers this as a one-click option.
- **Check the LOW findings too.** Placeholder values like `changeme` sometimes slip into production configs unchanged. A quick review of LOW findings can prevent configuration errors.
