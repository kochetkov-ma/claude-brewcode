# Topic: Installation & Updates

Domain: Getting Started

Deliver section by section. Pause after each section with AskUserQuestion.

## Section 1: Prerequisites

Before installing, make sure you have:

- **Claude Code CLI** installed and working (`claude` command available)
- **GitHub CLI** (`gh`) — recommended but not strictly required
- **jq** — used by some internal scripts

Check prerequisites:
```bash
claude --version
gh --version
jq --version
```

All three should return version numbers without errors.

## Section 2: Installation Steps

Three commands to install everything:

```bash
# Step 1: Add the marketplace
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode

# Step 2: Install all 4 plugins
claude plugin install brewcode@claude-brewcode
claude plugin install brewdoc@claude-brewcode
claude plugin install brewtools@claude-brewcode
claude plugin install brewui@claude-brewcode
```

After installation, run `/reload-plugins`. If plugins still do not appear, restart Claude Code.

You can install only the plugins you need. brewcode is the core; brewdoc and brewtools are optional.

## Section 3: Verify Installation

```bash
# List all installed plugins
claude plugin list
```

You should see all four plugins with matching version numbers.

Quick smoke test:
```bash
/brewcode:grepai
```

If the grepai setup starts, installation is working.

## Section 4: Updating

All four plugins share a version number. When one updates, update all of them:

```bash
# Step 1: Update marketplace index
claude plugin marketplace update claude-brewcode

# Step 2: Update each plugin
claude plugin update brewcode@claude-brewcode
claude plugin update brewdoc@claude-brewcode
claude plugin update brewtools@claude-brewcode
claude plugin update brewui@claude-brewcode
```

After updating, run `/reload-plugins` (or `/reload-skills` for skill-only changes, Claude Code 2.1.152+). Restart only if reloading does not pick up the changes.

If you see version mismatches across plugins, update all four to fix it.

## Section 5: Dev Mode (for contributors)

If you are working on the plugin source code, run from source without installing:

```bash
claude --plugin-dir ./brewcode
claude --plugin-dir ./brewdoc
claude --plugin-dir ./brewtools
claude --plugin-dir ./brewui
```

Changes take effect immediately without reinstalling.

> Never use `--plugin-dir` for production — developer-only flag.

## Section 6: Keeping Plugins Up to Date

The easiest way to keep the whole suite current:

```bash
/brewtools:plugin-update
```

This checks the marketplace, compares installed versions, and updates everything in one pass. Use `check` for status-only, `update` for non-interactive update, or `all` for everything.

### Manual fallback

```bash
claude plugin marketplace update claude-brewcode
claude plugin update brewcode@claude-brewcode
claude plugin update brewdoc@claude-brewcode
claude plugin update brewtools@claude-brewcode
claude plugin update brewui@claude-brewcode
```

### After updating

- Preferred: `/reload-plugins`
- Fallback: `exit` the session, then run `claude` again

If version mismatches persist after an update, re-run — all four must share the same version.
