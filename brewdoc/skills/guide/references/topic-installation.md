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

After installation, restart Claude Code. Close and reopen your terminal or IDE.

You can install only the plugins you need. brewcode is the core; brewdoc and brewtools are optional.

## Section 3: Verify Installation

Confirm everything is installed:

```bash
# List all installed plugins
claude plugin list
```

You should see all four plugins listed with matching version numbers.

Quick smoke test:

```bash
# Run the setup wizard in any project
/brewcode:setup
```

If the setup wizard starts, installation is working.

## Section 4: Updating

All three plugins share a version number. When one updates, update all of them:

```bash
# Step 1: Update marketplace index
claude plugin marketplace update claude-brewcode

# Step 2: Update each plugin
claude plugin update brewcode@claude-brewcode
claude plugin update brewdoc@claude-brewcode
claude plugin update brewtools@claude-brewcode
claude plugin update brewui@claude-brewcode
```

After updating, restart Claude Code.

If you see version mismatches across plugins, update all four to fix it.

## Section 5: Dev Mode (for contributors)

If you are working on the plugin source code itself, run from source without installing:

```bash
# Run individual plugins from source
claude --plugin-dir ./brewcode
claude --plugin-dir ./brewdoc
claude --plugin-dir ./brewtools
claude --plugin-dir ./brewui
```

This loads the plugin directly from the local directory. Changes take effect immediately without reinstalling.

Dev mode is for plugin developers only. Regular users should install from the marketplace.

> Never use `--plugin-dir` for production — that is a developer-only flag.

## Section 6: Keeping plugins up to date

The easiest way to keep the whole brewcode suite current is one command:

```bash
/brewtools:plugin-update
```

This checks the marketplace, compares installed versions, and updates everything in one pass. Use `check` for a status-only report, `update` for non-interactive update of all plugins, or `all` to do both.

### Manual fallback

If you prefer to run the raw CLI commands yourself:

```bash
claude plugin marketplace update claude-brewcode
claude plugin update brewcode@claude-brewcode
claude plugin update brewdoc@claude-brewcode
claude plugin update brewtools@claude-brewcode
claude plugin update brewui@claude-brewcode
```

### After updating

Reload plugins so the new versions become active:

- Preferred: `/reload-plugins`
- Fallback: `exit` the session, then run `claude` again

If you see version mismatches across the four plugins after an update, re-run the update command — all four must share the same version.
