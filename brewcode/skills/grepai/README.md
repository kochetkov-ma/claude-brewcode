---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# Grepai

Sets up and manages semantic code search powered by grepai (Ollama + bge-m3 embeddings). Lets Claude find code by meaning rather than exact keywords -- search for "user authentication" and find `validateCredentials()`.

## Quick Start

```
/brewcode:grepai setup
```

First-time setup takes 5-30+ minutes depending on project size. It checks infrastructure, configures MCP, generates an optimal config, builds the index, and creates a Claude rule.

## Modes

| Mode | Trigger keywords | What it does |
|------|-----------------|--------------|
| `setup` | setup, configure, init | Full installation: infra check, MCP config, config generation (via bc-grepai-configurator agent), initial indexing, rule creation |
| `status` | status, doctor, check, health | Reports health of all components: CLI, Ollama, bge-m3, MCP, index, watcher |
| `start` | start, watch | Starts the file watcher -- auto-indexes on code changes |
| `stop` | stop, halt, kill | Stops the file watcher |
| `reindex` | reindex, rebuild, refresh | Full index rebuild: stops watcher, cleans index, rebuilds from scratch, restarts watcher |
| `optimize` | optimize, update | Backs up current config, re-analyzes the project, regenerates config, then reindexes |
| `upgrade` | upgrade | Updates grepai CLI to the latest version via Homebrew |
| `prompt` | (unrecognized text) | Interactive menu -- asks which operation to run |

**Auto-detection:** Running `/brewcode:grepai` with no arguments defaults to `start` if `.grepai/` exists, or `setup` if it does not.

## Examples

### Good Usage

```
# First-time setup on a new project
/brewcode:grepai setup

# Check if everything is healthy after a restart
/brewcode:grepai status

# Start the watcher at the beginning of a work session
/brewcode:grepai start

# Rebuild the index after a large merge or branch switch
/brewcode:grepai reindex

# Re-analyze and regenerate config after adding a new module
/brewcode:grepai optimize
```

### Common Mistakes

```
# Searching before the index is built -- run setup first
/brewcode:grepai start    <-- watcher starts but index is empty

# Running setup again when grepai is already configured -- use reindex or optimize instead
/brewcode:grepai setup    <-- overwrites existing config

# Missing prerequisites -- install Homebrew, Ollama, and the grepai CLI first
/brewcode:grepai setup    <-- fails on missing Ollama or bge-m3
```

## Hook Self-Install

On first `/brewcode:grepai` setup run, the skill self-installs two project hooks:

1. Detects whether `.claude/grepai/hooks/` already exists (idempotent -- safe to re-run).
2. Default scope: PROJECT. Asks via AskUserQuestion only when scope is ambiguous.
3. Copies `assets/grepai-session.mjs` and `assets/grepai-reminder.mjs` to `.claude/grepai/hooks/`.
4. Merges SessionStart and PreToolUse:Bash entries into `.claude/settings.json` (jq + python3 fallback, no clobber).
5. Reports what was created.

After install, grepai reminders fire automatically at session start (SS) and on every Bash call (PTU:Bash).

## Output

After `setup` completes, the following is created in your project:

| Path | Purpose |
|------|---------|
| `.grepai/config.yaml` | Project-specific search configuration (languages, boost patterns, exclusions) |
| `.grepai/logs/grepai-watch.log` | Watcher and indexing logs |
| `.grepai/index/` | Embedded search index (GOB storage) |
| `.claude/rules/grepai-*.md` | Rule reminding Claude to use grepai for code exploration |

MCP server is configured with `grepai_search` and related tools (`trace_callers`, `trace_callees`, `trace_graph`).

## Tips

- **Monitor long indexing runs** with `tail -f .grepai/logs/grepai-watch.log` -- large projects (5k+ files) can take 10-30+ minutes.
- **Install prerequisites first** (Homebrew, Ollama, grepai CLI) if you do not have them; `setup` runs an infra check and reports what is missing.
- **Use `optimize` after structural changes** (new modules, renamed packages, changed build config) to regenerate the config with fresh project analysis.
- **Check `status` when search results seem off** -- it validates every component from CLI to index integrity.

## Documentation

Full docs: [grepai](https://doc-claude.brewcode.app/brewcode/skills/grepai/)
