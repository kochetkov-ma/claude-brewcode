# Secrets Scan

Finds leaked credentials in git-tracked files. Scans with 10 parallel agents, ranks findings CRITICAL to LOW and writes a report that never contains a secret value.

## Install

```bash
claude plugin install brewtools@claude-brewcode
```

## Usage

| Mode | Command | What it does |
|------|---------|--------------|
| Scan only | `/brewtools:secrets-scan` | Scans all git-tracked files, writes a severity-ranked report |
| Scan + fix | `/brewtools:secrets-scan --fix` | Walks each CRITICAL/HIGH finding: fix, move to env var, add to `.gitignore` (and `git rm --cached`), mark false positive, skip |
| Auto-fix prompt | no flag | Offers remediation when CRITICAL or HIGH findings exist |

Report: `.claude/reports/{TIMESTAMP}_secrets-scan/report.md` (mode `600`). Values appear only as length, `sha256[:12]` fingerprint and a preview of at most 4 characters. Verdict is `CLEAN`, `FINDINGS` or `INCOMPLETE`. Rotate anything that was ever committed: git history keeps it.

Detects passwords, API keys, tokens, AWS credentials, database URLs with embedded credentials and private keys. Skips env references (`process.env.*`, `${VAR}`, `os.getenv()`), placeholders and binary files.

| Severity | Criteria |
|----------|----------|
| CRITICAL | Real credentials, private keys, database URLs with passwords |
| HIGH | Real API keys or tokens, AWS credentials |
| MEDIUM | Suspicious hardcoded values |
| LOW | Placeholders such as `changeme`, `YOUR_KEY` |

## Documentation

Full docs: [secrets-scan](https://doc-claude.brewcode.app/brewtools/skills/secrets-scan/)
