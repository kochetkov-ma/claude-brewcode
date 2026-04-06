---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# Auto-Sync

Keeps Claude Code documentation (skills, agents, rules, configs, markdown) in sync with your codebase. Discovers files tagged with `auto-sync: enabled` frontmatter, detects stale content, and updates it automatically.

## Quick Start

```sh
/brewdoc:auto-sync                  # sync all project docs (.claude/**)
/brewdoc:auto-sync status           # see what is tracked vs stale
/brewdoc:auto-sync init path/to.md  # tag a file and add it to the index
/brewdoc:auto-sync global           # sync global docs (~/.claude/**)
```

## Modes

| Mode | Trigger | What it does |
|------|---------|--------------|
| STATUS | `status` | Reads INDEX, compares against discovered files, reports tracked/stale/non-indexed. No changes. |
| INIT | `init <path>` | Adds `auto-sync` frontmatter to the file and registers it in INDEX. |
| PROJECT | no args | Discovers all tagged `.md` files under `.claude/**`, syncs stale ones. |
| GLOBAL | `global` | Same as PROJECT but scoped to `~/.claude/**`. |
| FILE | `path/to/file.md` | Syncs a single file regardless of its stale status. |
| FOLDER | `path/to/folder` | Syncs all `.md` files inside the given folder. |

Managed directories (`rules/`, `agents/`, `skills/`) are excluded from automatic PROJECT/GLOBAL scans. Target them explicitly when needed (see examples below).

## Examples

### Good Usage

**Check what needs attention:**
```sh
/brewdoc:auto-sync status
```

**Tag a new file for tracking:**
```sh
/brewdoc:auto-sync init .claude/agents/my-agent.md
```

**Sync the entire project (default 7-day staleness window):**
```sh
/brewdoc:auto-sync
```

**Sync a managed directory explicitly:**
```sh
/brewdoc:auto-sync .claude/rules
```

**Sync global docs with text optimization enabled:**
```sh
/brewdoc:auto-sync global -o
```

### Common Mistakes

**Expecting managed dirs to be included in a bare sync** -- `rules/`, `agents/`, `skills/` are excluded from auto-scan. Pass the path explicitly:
```sh
# wrong -- will skip .claude/rules/
/brewdoc:auto-sync

# correct
/brewdoc:auto-sync .claude/rules
```

**Running init without a path:**
```sh
# wrong -- exits with error
/brewdoc:auto-sync init

# correct
/brewdoc:auto-sync init docs/guide.md
```

**Forgetting frontmatter on manually created files** -- files without the `auto-sync: enabled` tag will not be discovered. Use `init` to add it, or add the three required fields by hand.

## How File Discovery Works

A file is discovered when it contains this YAML frontmatter block:

```yaml
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: skill
```

The type is inferred from the file path:

| Path contains | Detected type |
|---------------|---------------|
| `skills/` | `skill` |
| `agents/` | `agent` |
| `rules/` | `rule` |
| filename is `CLAUDE.md` | `config` |
| anything else | `doc` |

Discovery is capped at 50 files per scan (override with `MAX_FILES` env var).

## Output

**INDEX location:**

| Scope | Path |
|-------|------|
| Project | `.claude/auto-sync/INDEX.jsonl` |
| Global | `~/.claude/auto-sync/INDEX.jsonl` |

Each line in INDEX is a JSON object:

```jsonl
{"p":"skills/auth/SKILL.md","t":"skill","u":"2026-04-01","pr":"default"}
```

| Field | Meaning |
|-------|---------|
| `p` | Relative path to the file |
| `t` | Type: `skill`, `agent`, `rule`, `config`, `doc` |
| `u` | Last sync date (YYYY-MM-DD) |
| `pr` | Protocol: `default` or `override` |

After a sync run, the skill prints a summary table with counts for discovered, queued, updated, unchanged, and errored files.

## Tips

- Run `status` first to understand what is tracked before launching a full sync.
- Use the `-o` / `--optimize` flag to enable text optimization during sync -- useful for reducing token usage in large skill files.
- Add an `auto-sync-override` block in frontmatter to control which source files and sections the sync agent examines:
  ```yaml
  auto-sync-override: |
    sources: src/**/*.ts, .claude/agents/*.md
    focus: API endpoints, error handling
    preserve: ## User Notes, ## Custom Config
  ```
- Files that error during sync are not marked as updated in INDEX, so they remain stale and will be retried on the next run.

## Documentation

Full docs: [auto-sync](https://doc-claude.brewcode.app/brewdoc/auto-sync/)
