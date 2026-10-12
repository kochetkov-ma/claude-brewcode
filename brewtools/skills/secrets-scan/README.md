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
| Add to .gitignore | Append the path to `.gitignore` and untrack it (`git rm --cached`) |
| Mark false positive | Acknowledge and skip |
| Skip | Leave as-is, move to next finding |

## Examples

### Good Usage

```bash
# Pre-push check, periodic audit
/brewtools:secrets-scan

# Before open-sourcing a private repo: scan, then fix interactively
/brewtools:secrets-scan --fix
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

Report location: `.claude/reports/{TIMESTAMP}_secrets-scan/report.md`, created mode `600` inside a
mode `700` directory. Setup also appends `.claude/reports/` to `.gitignore` when nothing ignores it
yet — a report that names where credentials live must never become committable.

The report contains:

| Section | Content |
|---------|---------|
| Summary | Verdict (CLEAN / FINDINGS / INCOMPLETE), file counts, severity breakdown |
| Findings | Per-severity tables with file path, line number, category, value length, `sha256[:12]` fingerprint, masked preview, description |
| Agent Stats | Per-agent assigned / accounted / reconciled / finding counts |
| Unscanned | Chunks that failed reconciliation twice — those paths were never read |
| File Inventory | Complete list of scanned files and skipped files with skip reasons |

**Secrets are redacted by construction.** The report never stores a matched value: findings carry a
length, a `sha256[:12]` fingerprint and a preview revealing at most 4 leading characters. Two
findings of the same credential are still recognisable by their fingerprint.

**A dropped chunk cannot hide.** Each agent's response is reconciled against its assigned file list
(`assigned == scanned + skipped`); a mismatched or malformed chunk is re-spawned once, and if it
fails again the scan is reported `INCOMPLETE`, never clean.

The scan ends with a console summary: key metrics and the report path.

## Tips

- **Run before pushing.** A secret is cheapest to remove before it reaches a remote branch.
- **Rotate what was committed.** Removing a secret from the worktree leaves it in git history; rotate the credential.
- **Ignoring is not untracking.** `.gitignore` does not stop git tracking a file it already tracks; `--fix` adds the path and runs `git rm --cached`.
- **Expect false positives.** Test fixtures, example configs and doc snippets get flagged; mark them in `--fix`.
- **Check LOW findings too.** Placeholders like `changeme` sometimes reach production configs unchanged.

## Documentation

Full docs: [secrets-scan](https://doc-claude.brewcode.app/brewtools/skills/secrets-scan/)
