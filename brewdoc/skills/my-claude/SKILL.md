---
name: my-claude
description: Documents a Claude Code installation - local setup, hook/context architecture, web research. Triggers - my claude, installation docs.
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [ext [context]] | [r <query>] — no args = internal installation docs"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent, WebFetch, WebSearch, AskUserQuestion]
model: opus
---

# My Claude

Generates documentation about your Claude Code installation and environment.

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; the mode prefixes below are optional and still work standalone.

1. Mode: an explicit prefix (`ext`, `external`, `r `, `research `) anywhere wins outright (literal-syntax
   table below); else the most distinct whole-word keyword hits (table below); tie -> `AskUserQuestion`.
   No hit or empty -> `internal` (documented default).
2. Scope: prose that is not a mode/query is still input: take the topic/query from it.
3. Ask: ONE `AskUserQuestion` for outcome-changing ambiguity (e.g. an existing INDEX entry for the same
   mode). An empty run — read-only inventory + write to
   `${CLAUDE_PROJECT_DIR}/.claude/brewdoc/my-claude/` — asks nothing.

Print once, before the first action (labels literal, authored work-artifact values English, INPUT verbatim):

```
PLAN — brewdoc:my-claude
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit prefix | matched keyword: X | default>
SCOPE:  <sources to analyze | research query>
DO:     <2-5 imperative bullets>
RESULT: <doc path(s) written under ${CLAUDE_PROJECT_DIR}/.claude/brewdoc/my-claude/>
```

## Mode Detection

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `internal` (DEFAULT) | *(empty)*, internal, my setup, my installation, document my claude | внутренний, мой setup, документируй мой claude | yes |
| `external` | ext, external, architecture, hook/context schema | внешний, архитектура, схема контекста | yes |
| `research` | r, research, look up, find out about | research, исследуй, найди информацию | yes |

Literal prefix syntax:

| Argument value | Mode | Sub-mode |
|---|---|---|
| empty | INTERNAL | — |
| `ext` or `external` (alone) | EXTERNAL | default |
| `ext context` or `external context` | EXTERNAL | context-schema |
| starts with `r ` or `research ` | RESEARCH | query = rest of args |

Then read the mode's reference (`references/internal-mode.md`, `references/external-mode.md`,
`references/research-mode.md`). References are raw: their `CLAUDE_PROJECT_DIR` token = the project root resolved
here, `<config>` = the printed `CONFIG_DIR`.

## Delegation

One subagent per source group (~<=5 files, ~<=10 steps), all spawned in ONE message: a long agent drifts
beyond correction.

Every spawn brief carries six labeled fields, since a subagent starts with an empty context: GOAL (task + why), ROLE (owns, must not touch), SCOPE (paths/commands in and out), CONTEXT (done, by whom, in parallel), CONSUMER (who uses the result + its shape), DONE (acceptance + return: verdict first, evidence, bounded; long output to a file, path returned).
A bare one-line task is never enough. Applies to every `Explore` / `general-purpose` spawn in all three modes.

Each mode ends with an independent re-check of the written doc (INTERNAL: `Explore`, read-only, paths exist and
counts match; else `general-purpose`, re-opening sources via WebFetch/WebSearch), its fixes, the INDEX entry.

## Output Directory

Every output and index path starts with `${CLAUDE_PROJECT_DIR}/.claude/brewdoc/`, the only target; a relative
path follows the shell cwd as `cd` moves it and builds a second tree and INDEX.

Writes under `.claude/` are protected: prompted in `default`/`acceptEdits`, allowed under `bypassPermissions`,
never pre-approved by allow rules; headless without bypass fails.

**EXECUTE** using Bash tool once, before the first spawn:
```bash
mkdir -p "${CLAUDE_PROJECT_DIR}/.claude/brewdoc/my-claude"
echo "CONFIG_DIR=${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
PJ="${CLAUDE_SKILL_DIR}/../../.claude-plugin/plugin.json"
PV=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).version||'')" "$PJ" 2>/dev/null || true)
[ -n "$PV" ] || { echo "❌ cannot read version from $PJ — reinstall brewdoc"; exit 1; }
echo "PLUGIN_VERSION=$PV"; echo "LAST_UPDATED=$(date +%F)"
```

`CONFIG_DIR` is the active profile (settings, plugins, auto memory); with `CLAUDE_CONFIG_DIR` set, `~/.claude`
is another profile.

### Provenance frontmatter

Every `.md` written opens with this block before the `#` heading (values from the block above, never hardcoded):

```yaml
---
doc_type: user
version: "{PLUGIN_VERSION}"
generated_by: "brewdoc:my-claude"
last_updated: "{LAST_UPDATED}"
---
```

Re-generating refreshes the quoted values and keeps a hand-edited `doc_type` (`llm` / `skip`).

## INDEX Tracking

Append to `${CLAUDE_PROJECT_DIR}/.claude/brewdoc/INDEX.jsonl`; the `path` field stays repo-relative:
```jsonl
{"ts":"2026-02-28T10:00:00","mode":"internal","path":".claude/brewdoc/my-claude/20260228_my-claude-internal.md","title":"Internal Claude Setup Overview","version":"1.0"}
```

**Legacy merge** — `~/.claude/brewdoc/INDEX.jsonl` exists AND the project INDEX is empty -> merge them once and print: `ℹ️ Migrated {N} entries from legacy ~/.claude/brewdoc/INDEX.jsonl (read-only; legacy file untouched)`. NEVER write back to the legacy path.

An entry for the same mode exists -> AskUserQuestion — header: "INDEX", question: "Entry for this mode already exists (v{VERSION}). Update it?", options: "Yes, update (bump version)" / "No, create new entry".

## INTERNAL Mode

1. Spawn 3 parallel `Explore` agents, one per source group of the reference: (1) global, (2) project,
   (3) memory. Briefs say: record env var, token and MCP header names, never values (settings `env`,
   `.claude.json`, `.mcp.json` hold credentials). E.g. group (1):
   ```
   Agent(subagent_type="Explore", prompt="
   GOAL: producing a document describing this user's whole Claude Code installation;
     you cover the global config layer only, another agent covers project + memory.
   ROLE: read-only inventory of global config. Do NOT edit any file, do NOT read project files.
   SCOPE: in — <the Global config row of the sources table, under CONFIG_DIR>.
     Out — project CLAUDE.md, .claude/**, memory files, source code.
   CONTEXT: nothing has been read yet — you are the first pass for this group. Two sibling
     agents scan project `.claude` config and memory files in parallel right now; the output
     dir `${CLAUDE_PROJECT_DIR}/.claude/brewdoc/my-claude/` and the INDEX entry are already
     resolved by the skill.
   CONSUMER: the aggregation step merges the three inventories into one INTERNAL-mode
     document, then an `Explore` agent re-checks that every path you name exists — absolute
     paths only, and flag a missing file instead of dropping its row.
   DONE: per-section inventory (instructions summary, rules N + one line each, settings keys + hook
     events, plugins, agents N + purpose, skills N + purpose) with absolute paths for every item.
     Flag missing files explicitly.
   ")
   ```
2. Aggregate into the reference's document template; write
   `${CLAUDE_PROJECT_DIR}/.claude/brewdoc/my-claude/YYYYMMDD_my-claude-internal.md`

## EXTERNAL Mode

Covers the hook/context/agent architecture from official sources + local analysis. **Sub-mode default:**
1. Analyze local hook registrations (settings `hooks`, plugin `hooks/hooks.json`) for event model patterns
2. Spawn `general-purpose` agents, one per row of the reference's sources table (recent releases + CHANGELOG)
3. Generate `${CLAUDE_PROJECT_DIR}/.claude/brewdoc/my-claude/YYYYMMDD_my-claude-external.md`

**Sub-mode context-schema:** focus on the context injection schema (additionalContext, updatedInput, etc.);
output `${CLAUDE_PROJECT_DIR}/.claude/brewdoc/my-claude/external/YYYYMMDD_context-schema.md`

## RESEARCH Mode

Query = everything after `r ` or `research `, else the topic taken from the prompt.

1. Divide the query into 2-5 source groups (official docs, GitHub, Reddit, forums, marketplaces)
2. Spawn `general-purpose` agents per source group in parallel
3. Aggregate with citation tracking (source URL per fact)
4. Output `${CLAUDE_PROJECT_DIR}/.claude/brewdoc/my-claude/YYYYMMDD_research-{slug}.md`
