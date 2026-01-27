---
auto-sync: enabled
auto-sync-date: 2026-02-12
auto-sync-type: doc
---

# Secrets Scan

Scans all git-tracked files for secrets (passwords, API keys, tokens, private keys, DB credentials) using 10 parallel agents. Generates detailed report with findings by severity and full file inventory.

## Invoke

```bash
/secrets-scan
/secrets-scan --fix
```

- No args: scan only, display report
- `--fix`: scan + interactive remediation (delete, move to env var, gitignore)

## Usage Example

```bash
/secrets-scan
```

Outputs report to `.claude/reports/{TIMESTAMP}_secrets-scan/report.md` with:
- Summary table (file counts, severity breakdown)
- Finding details: file, line, content, description, criticality level
- Full inventory of scanned and skipped files
- Per-agent statistics

To remediate findings:

```bash
/secrets-scan --fix
```

Review each finding and choose: fix, move to env var, gitignore, skip, or mark false positive.

## What It Detects

Passwords, API keys, access tokens, AWS credentials, database connection strings, private keys, encryption keys, hardcoded secrets with patterns like `password=`, `api_key=`, `-----BEGIN PRIVATE KEY-----`, etc.

Skips: env variable references, common placeholders (changeme, xxx, dummy), comments, binary files.

## Reports

Report location: `.claude/reports/{TIMESTAMP}_secrets-scan/report.md`

Report includes:
- Summary metrics (scanned, skipped, findings by severity)
- Detailed findings table (path, line, content, description, level)
- Complete file inventory (scanned vs skipped)
- Agent processing statistics
