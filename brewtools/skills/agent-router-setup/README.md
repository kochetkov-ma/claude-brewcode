# Agent Router

> **EXPERIMENTAL.** Opt-in, project scope only.

Installer/configurator skill for one PreToolUse hook that checks whether the main loop picked the **right agent** for a spawn, and redirects it to the real expert — a project agent from `.claude/agents/`, or a brewcode specialist — when it reached for a generic one.

The failure it catches: the repo carries a hand-written domain expert, and the main loop spawns `general-purpose` out of habit. The check is deterministic and costs nothing on the common path.

A deny is returned to the model as a tool error it can act on. **The human is never prompted**, the turn is not interrupted, and a retry always gets through — the same task in the same project is denied at most once per session.

## Two tiers

| Tier | Default | Cost | What it does |
|------|---------|------|--------------|
| 1 | always on | single-digit ms, **zero tokens**, deterministic | `.claude/hooks/agent-router.mjs`, PreToolUse matcher `Agent` |
| 2 | **off** (`level strict` only) | one `claude-haiku-4-5` call per `Agent` spawn | a `type: "agent"` hook that adjudicates the ambiguous picks |

### Tier 1 decision order

It allows as early as it can:

| # | Check | Result |
|---|-------|--------|
| 1 | not the `Agent` tool | allow |
| 2 | `agent_id` present — a subagent issued the spawn | allow; only the main loop is policed |
| 3 | `enabled:false`, or a config file that exists but does not parse | allow |
| 4 | the picked type IS a project agent | allow |
| 5 | the picked type is not on `genericTypes` — a specialist/built-in | allow. An omitted `subagent_type` is normalized to `general-purpose` first and policed like one |
| 6 | intent rules (regex over the task text) | deny, naming the expert |
| 7 | score the task against the `.claude/agents/*.md` roster | clear winner -> deny naming it; several plausible -> nudge with the top 3, no deny; nothing -> silent allow |
| 8 | anti-loop guard | a task in a given project is denied at most once per session |
| 9 | any error | fail open |

Intent routes (step 6): skill authoring -> `brewcode:skill-creator`, agent authoring -> `brewcode:agent-creator`, hooks -> `brewcode:hook-creator`, bash/sh scripts -> `brewcode:bash-expert`. **A project agent covering the same intent outranks the plugin specialist.**

`neverFlag` holds eight entries by default — `Explore`, `Plan`, `statusline-setup`, `output-style-setup`, plus the four intent experts (`brewcode:agent-creator`, `brewcode:skill-creator`, `brewcode:hook-creator`, `brewcode:bash-expert`). `Explore` is the right tool for search, `Plan` for planning, and an intent's own redirect target can never be flagged by the router that redirects to it — a custom `intents` table exempts its own experts too, auto-unioned into `neverFlag` at load time.

**"The project" = the nearest ancestor of `cwd` that has a `.claude` directory** (up to 16 levels up), not `cwd` itself — `claude` started in a subdirectory still resolves the repo root. Config and roster are both read from there, fresh on every call.

**A missing `.claude/agents/` is an empty roster, not a failure**: the intent rules still fire and still redirect to the plugin specialist. Only the step-7 scoring goes silent.

## Usage

```
/brewtools:agent-router-setup                  # status (default, no args)
/brewtools:agent-router-setup install          # install — asks level, defaults to fast
/brewtools:agent-router-setup upgrade          # re-emit from the current plugin version, level kept
/brewtools:agent-router-setup enable           # back on
/brewtools:agent-router-setup disable          # enabled:false, hook stays wired
/brewtools:agent-router-setup uninstall        # unwire + delete the hook file, keep config
/brewtools:agent-router-setup purge            # + delete config and tmp markers
/brewtools:agent-router-setup level strict     # add the LLM judge (read the cost first)
/brewtools:agent-router-setup level fast       # drop it again
/brewtools:agent-router-setup вычисти всё      # free-text intent works (RU+EN) -> purge
```

The skill always reports status first, states its plan before asking anything, then delegates the file work to the `brewcode:hook-creator` agent. It asks exactly one question — the level — and only when you did not already say.

**Scope is project only.** The agent roster is inherently per-project, so there is no global install and no scope question.

## Modes

| Mode | Hook file | settings.json | Config | tmp markers |
|------|-----------|---------------|--------|-------------|
| `status` | — | — | — | — |
| `install` | copied | entry merged | written | — |
| `upgrade` | re-copied | entries re-merged | behavior values preserved, metadata re-stamped | kept |
| `enable` | kept | kept | `enabled:true` | kept |
| `disable` | kept | kept | `enabled:false` | kept |
| `uninstall` | deleted | entries stripped | **kept** | kept |
| `purge` | deleted | entries stripped | deleted | deleted |
| `level fast` (extra) | kept | tier-2 stripped | `level:"fast"` | kept |
| `level strict` (extra) | kept | tier-2 appended | `level:"strict"` | kept |

Re-install is idempotent but not inert — it re-copies the hook file, which is what repairs a stale install. `upgrade` asks nothing: it reads `level` back out of the config and replays the install against the current assets, so a plugin update finally reaches the project (fresh hook file, freshly inlined judge prompt).

## Where it installs

| What | Path |
|------|------|
| Hook | `<repo>/.claude/hooks/agent-router.mjs` |
| Wiring | `<repo>/.claude/settings.json` |
| Config | `<repo>/.claude/brewtools/agent-router.json` |
| Anti-loop markers | `<os.tmpdir()>/brewtools-agent-router/<session_id>/<sha1(root+task)[:32]>` |

Nothing else is written to tmp — no roster cache, no logs — so `purge` (which removes `brewtools-agent-router/` outright) really does leave nothing behind.

The tier-2 judge prompt is **inlined into `settings.json`**, not copied — re-running `level strict` refreshes it after a plugin update. Merge is strip-own + append, deduped on the exact `agent-router.mjs` path (idempotent re-install); foreign hook entries are never touched, and a `settings.json` that does not parse aborts the write instead of being rewritten.

```json
{ "matcher": "Agent", "hooks": [ { "type": "command", "command": "node", "args": ["<abs>/.claude/hooks/agent-router.mjs"], "timeout": 5 } ] }
```

`timeout` is in seconds (Claude Code has no millisecond hook field); `5` replaces the 600 s command-hook default.

## Config

```json
{
  "enabled": true,
  "level": "fast",
  "genericTypes": ["general-purpose", "worker"],
  "neverFlag": ["Explore", "Plan", "statusline-setup", "output-style-setup", "brewcode:agent-creator", "brewcode:skill-creator", "brewcode:hook-creator", "brewcode:bash-expert"],
  "minScore": 3,
  "margin": 2,
  "version": "{PLUGIN_VERSION}",
  "content_version": "{CONTENT_VERSION}",
  "generated_by": "brewtools:agent-router-setup",
  "last_updated": "{LAST_UPDATED}"
}
```

| Key | Meaning |
|-----|---------|
| `enabled` | only exactly `false` turns it off. Any other value — and no config file at all — means ON with these defaults. A config that exists but does not PARSE is different: the feature goes fully silent |
| `level` | `fast` / `strict` — a RECORD of what was wired at install time, ignored by tier 1 itself and enforced by nothing. Editing it by hand does NOT add or remove the tier-2 entry; run `level strict` / `level fast`. `status` prints it as `level (recorded)` next to the settings.json `tier2` count — that count, not this key, is what actually decides whether the judge fires |
| `version` / `content_version` / `generated_by` / `last_updated` | provenance, written on every config write. No `doc_type` — that field is `.md` frontmatter only. `version` = the brewtools release that wrote the file, informational only (it bumps every release, and `enable`/`disable` re-stamps it without copying anything). `content_version` = the release whose generator logic produced it; `status` judges staleness on `content_version` — the installed hook file's header vs the plugin's asset, and this key vs `assets/INSTALL.md`. Inert at runtime — the hook ignores unlisted keys |
| `genericTypes` | the types policed at all; anything else exits at step 5 |
| `neverFlag` | never flagged whatever the task says; eight entries by default (four fixed + the four intent experts). Auto-unioned with every `intents[].expert` at load time — a custom `intents` table exempts its own experts without touching this key |
| `minScore` | minimum roster score before a project agent can win |
| `margin` | how far the winner must lead the runner-up; inside the margin it is a nudge, not a deny |
| `intents` | optional override of the step-6 routes: `{ "match": "<regex>", "expert": "<agent type>", "label": "<label>" }`. **It REPLACES the built-in table wholesale — it does not merge.** Install never writes this key |

There is no nudge-threshold key: the nudge floor is derived as `max(1, ceil(minScore / 2))`. Keys not in this table are ignored.

> Hand-editing `intents` with a single rule silently drops the other three routes and the hook says nothing about it. To add one route, copy `DEFAULT_INTENTS` out of `agent-router.mjs` and append.

Config values are read on every hook call — `enabled`, the lists and the thresholds take effect immediately. Hook **wiring** changes (install / level / uninstall / purge) need a new session.

## Limits — read before trusting it

- **Tier 2 costs a model call on EVERY `Agent` spawn.** Claude Code runs all hooks matching an event in parallel and no hook can skip another, so tier 1 cannot gate tier 2. Its own fast exit is the only cost control that exists. This is exactly why `level fast` is the default and the recommendation.
- **No signal for "this came from inside a Skill."** There is no supported one. Tier 2 can only guess from `transcript_path`, which is written asynchronously and may lag. Tier 1 does not attempt it at all.
- **Tier 1 matches trigger words, not meaning.** It deliberately errs toward allowing: an ambiguous case becomes a nudge, never a block. The intent regexes are English trigger words.
- **Everything fails open** — bad config, unreadable roster, timeout, malformed output. The spawn goes through; the session never breaks. A config file that exists but does not parse turns the feature fully OFF rather than falling back to the defaults, so a typo cannot quietly change your routing.
- **No writable tmp = no denies at all.** The anti-loop marker lives under `os.tmpdir()`. If that directory cannot be created or written (read-only tmp, a foreign-owned `brewtools-agent-router/`, a locked-down sandbox), EVERY deny degrades to a non-blocking notice — a deny that cannot be recorded is a deny that could repeat forever. Check `ls -ld "$TMPDIR/brewtools-agent-router"` if denies never appear.
- **A deny is not a wall.** It reaches the model as a tool error, the human is never prompted, and the anti-loop guard lets an identical retry through.
- **An empty roster makes it nearly a no-op.** With no `.claude/agents/*.md`, only the 4 intent rules can fire; the skill says so before installing.
- **Experimental** — opt-in, project scope only, and not registered in `brewtools/hooks/hooks.json`, so installing the plugin does nothing until you run it.

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | mode/level decisions + delegation |
| `README.md` | this page |
| `assets/INSTALL.md` | the runbook — install, level, config, disable/enable, uninstall, purge, verify |
| `assets/agent-router.mjs` | the tier-1 PreToolUse hook |
| `assets/judge-prompt.md` | the tier-2 judge prompt, inlined into settings.json at `level strict` |
| `tests/run.sh`, `tests/suite.mjs` | behavioral test suite for the hook |
