# Agent Router

> **EXPERIMENTAL.** Opt-in, project scope only.

Docs: https://doc-claude.brewcode.app/brewtools/skills/agent-router-setup/

Installer/configurator skill for one PreToolUse hook that checks whether the main loop picked the **right agent** for a spawn, and redirects it to the real expert — a project agent from `.claude/agents/`, or a brewcode specialist — when it reached for a generic one.

The failure it catches: the repo carries a hand-written domain expert, and the main loop spawns `general-purpose` out of habit. The check is deterministic and costs nothing on the common path.

A deny is returned to the model as a tool error it can act on. **The human is never prompted**, the turn is not interrupted, and a retry always gets through — the same task in the same project is denied at most once per session.

## Two tiers

| Tier | Default | Cost | What it does |
|------|---------|------|--------------|
| 1 | always on | under 100 ms including node startup, **zero tokens**, deterministic | `.claude/hooks/agent-router.mjs`, PreToolUse matcher `Agent` |
| 2 | **off** (`level strict` only) | one small-model call per `Agent` spawn | a `type: "agent"` hook that judges a generic spawn against the project roster (+ a heartbeat entry) |

### Tier 1 decision order

It allows as early as it can:

| # | Check | Result |
|---|-------|--------|
| 1 | not the `Agent` tool | allow |
| 2 | `agent_id` present — a subagent issued the spawn | allow; only the main loop is policed |
| 3 | `enabled:false`, or a config file that exists but does not parse | allow |
| 4 | the picked type IS a project agent | allow |
| 5 | the picked type is not on `genericTypes` — a specialist/built-in | allow. An omitted `subagent_type` is normalized to `general-purpose` first and policed like one |
| 6 | intent rules (regex over the task text) | deny, naming the expert — a plugin specialist only when it is installed, otherwise a notice |
| 7 | score the task against the `.claude/agents/**/*.md` roster (recursive, by frontmatter `name`) | clear winner -> deny naming it; several plausible -> nudge with the top 3, no deny; nothing -> silent allow |
| 8 | anti-loop guard | a task in a given project is denied at most once per session |
| 9 | any error | fail open |

Intent routes (step 6): skill authoring -> `brewcode:skill-creator`, agent authoring -> `brewcode:agent-creator`, hooks -> `brewcode:hook-creator`, bash/sh scripts -> `brewcode:bash-expert`. **A project agent covering the same intent outranks the plugin specialist.**

**"The project" is resolved by ownership, not by `cwd`:** `CLAUDE_PROJECT_DIR` → nearest ancestor holding `.claude/brewtools/agent-router.json` → nearest ancestor holding `.git` → nearest ancestor holding a `.claude` directory → `cwd` (up to 16 levels per step), so a nested bare `.claude` cannot mask the root that owns the router. The config-marker and `.claude` steps are an upward walk where a `.claude` in `$HOME` or in the directory whose `.claude` IS `$CLAUDE_CONFIG_DIR` is a profile, not a project marker, and is skipped; a `.git` there still counts. `CLAUDE_PROJECT_DIR` is taken as given. Config and roster are read from that root, fresh on every call.

**A missing `.claude/agents/` is an empty roster, not a failure**: the intent rules still fire and still redirect to the plugin specialist. Only the step-7 scoring goes silent.

## Usage

```
/brewtools:agent-router-setup                  # status (default, no args)
/brewtools:agent-router-setup install          # install — asks level, defaults to fast
/brewtools:agent-router-setup upgrade          # re-emit from the current plugin version, level kept
/brewtools:agent-router-setup enable           # back on
/brewtools:agent-router-setup disable          # enabled:false, hook stays wired
/brewtools:agent-router-setup uninstall        # unwire + delete the hook file, keep config
/brewtools:agent-router-setup purge            # + delete config and this project's tmp state
/brewtools:agent-router-setup level strict     # add the LLM judge (read the cost first)
/brewtools:agent-router-setup level fast       # drop it again
/brewtools:agent-router-setup remove everything  # free-text intent works (any language) -> purge
```

The skill always reports status first, states its plan before asking anything, then delegates the file work to the `brewcode:hook-creator` agent. It asks exactly one question — the level — and only when you did not already say.

The status probe resolves the same root, even from a nested `cwd`. It counts only entries that match the shapes under *Where it installs* exactly: one tier-1 entry, and for tier 2 a prompt byte-current with `judge-prompt.md` (the per-release `brewcode-meta` stamp line is ignored on both sides, so a release alone never reads as legacy), no `model` key and the heartbeat entry. Duplicates, malformed settings and drifted entries are non-effective.

## Modes

| Mode | Hook file | settings.json | Config | tmp state |
|------|-----------|---------------|--------|-----------|
| `status` | — | — | — | — |
| `install` | copied | entries merged | written | — |
| `upgrade` | re-copied | entries re-merged | behavior values preserved, metadata re-stamped | kept |
| `enable` | kept | kept | `enabled:true` | kept |
| `disable` | kept | kept | `enabled:false` | kept |
| `uninstall` | deleted | entries stripped | **kept** | kept |
| `purge` | deleted | entries stripped | deleted | this project's dir deleted |
| `level fast` (extra) | kept | tier-2 + heartbeat stripped | `level:"fast"` | kept |
| `level strict` (extra) | kept | tier-2 + heartbeat appended | `level:"strict"` | kept |

Re-install is idempotent but not inert — it re-copies the hook file, which is what repairs a stale install. `upgrade` asks nothing: it reads `level` back out of the config and replays the install against the current assets (fresh hook file, freshly inlined judge prompt).

**Upgrading an install made by brewtools 6.4.0 or older** changes your `settings.json` at `level strict`: the tier-2 entry loses its `model` key (a pinned model ID ages out, an omitted one cannot) and the heartbeat entry appears. At `level fast` only the hook file changes. Until you upgrade, `status` reports the old entry under `legacy refs`.

## Where it installs

| What | Path |
|------|------|
| Hook | `<repo>/.claude/hooks/agent-router.mjs` |
| Wiring | `<repo>/.claude/settings.json` |
| Config | `<repo>/.claude/brewtools/agent-router.json` |
| State | `<os.tmpdir()>/brewtools-agent-router/p-<sha1(real root)[0..16]>/<session_id>/` — anti-loop markers; at `strict` also the judge heartbeat |

No roster cache, no logs. `purge` removes this project's `p-…` directory only.

The tier-2 judge prompt is **inlined into `settings.json`** without its `brewcode-meta` stamp line, not copied — `upgrade` or `level strict` refreshes it after a plugin update. Merge is strip-own + append (idempotent re-install; a judge handler with an `agent-router:`-prefixed status message counts as own, so `upgrade` replaces an older one instead of adding a second); foreign hook entries are never touched, and a `settings.json` that does not parse aborts the write instead of being rewritten. Entries under `hooks.PreToolUse` — the first always, the other two at `level strict`:

```json
{ "matcher": "Agent", "hooks": [ { "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/agent-router.mjs"], "timeout": 5 } ] }
{ "matcher": "Agent", "hooks": [ { "type": "agent", "prompt": "<inlined judge-prompt.md>", "timeout": 30, "statusMessage": "agent-router: checking agent fit" } ] }
```

The third entry repeats the first under matcher `StructuredOutput`: the heartbeat, which counts the judge's verdicts. `timeout` is in seconds; `5` replaces the 600 s command-hook default. The judge entry has no `model` key, so Claude Code runs its default small model (`claude-haiku-5-5` on 2.1.296).

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
| `level` | `fast` / `strict` — a record of what was wired at install time, enforced by nothing. Editing it by hand does not add or remove the tier-2 entry; run `level strict` / `level fast`. `status` prints it as `level (recorded)` next to the `tier2` count, and that count decides whether the judge fires |
| `version` / `content_version` / `generated_by` / `last_updated` | provenance, written on every config write, inert at runtime. `version` = the brewtools release that wrote the file (informational: `enable`/`disable` re-stamp it). `status` judges staleness on `content_version`: the installed hook file's header vs the plugin's asset, and this key vs the `agent-router.mjs` asset header (the file that parses the config; printed as `contract=`). A runbook-only release does not stale a config |
| `genericTypes` | the types policed at all; anything else exits at step 5 |
| `neverFlag` | never flagged whatever the task says; eight entries by default (four built-ins such as `Explore` and `Plan`, the right tools for search and planning, + the four intent experts, since a redirect target must not be flagged). Auto-unioned with every `intents[].expert` at load time |
| `minScore` | minimum roster score before a project agent can win |
| `margin` | how far the winner must lead the runner-up; inside the margin it is a nudge, not a deny |
| `intents` | optional override of the step-6 routes: `{ "match": "<regex>", "expert": "<agent type>", "label": "<label>" }`. **It REPLACES the built-in table wholesale — it does not merge, and the hook says nothing when routes vanish**: to add one route, copy `DEFAULT_INTENTS` out of `agent-router.mjs` and append. Install never writes this key |

There is no nudge-threshold key: the nudge floor is derived as `max(1, ceil(minScore / 2))`. Keys not in this table are ignored.

Config values are read on every hook call — `enabled`, the lists and the thresholds take effect immediately. Hook **wiring** changes (install / level / uninstall / purge) apply to the running session too: Claude Code watches settings files (`/hooks` confirms).

## Limits — read before trusting it

- **Tier 2 costs a model call on every `Agent` spawn.** Claude Code runs all hooks matching an event in parallel and no hook can skip another, so tier 1 cannot gate tier 2; the judge's own fast exit is the only cost control. That is why `level fast` is the default and the recommendation.
- **Tier 2 cannot fail closed.** A judge that times out, or whose model call errors, silently allows the spawn; tier 1 still decides on its own. At `strict`, `status` prints `judge_expected` / `judge_answered` / `judge_overdue` (the hook's `--judge-health <repo>`): overdue above zero, or zero answers against a nonzero expected count, means the judge stopped answering.
- **Tier 2 is narrower than tier 1.** It judges `general-purpose` and `worker` only, redirects to project agents only, keeps no state and can deny the same task again. It honors the escape hatch and `enabled:false`, and does not read the transcript.
- **Tier 1 matches trigger words, not meaning.** It errs toward allowing: an ambiguous case becomes a nudge, never a block. The intent regexes are English trigger words.
- **A plugin specialist is named in a deny only when it is installed.** A plugin loaded with `--plugin-dir` is not in the plugin cache, so you get a notice instead; a cached but disabled plugin still gets the deny.
- **Everything fails open** — bad config, unreadable roster, timeout, malformed output. An unparseable config turns the feature fully off rather than back to the defaults, so a typo cannot quietly change your routing.
- **No writable tmp = no denies at all.** If the state directory cannot be written (read-only tmp, a foreign-owned `brewtools-agent-router/`, a locked-down sandbox), every deny degrades to a non-blocking notice, because a deny that cannot be recorded could repeat forever. Check `ls -ld "$TMPDIR/brewtools-agent-router"` if denies never appear.
- **A deny is not a wall.** `agent-router: override` (also `allow` / `skip`) in the task description or prompt passes a spawn silently; every deny message names it.
- **Experimental** — opt-in, project scope only, and not registered in `brewtools/hooks/hooks.json`, so installing the plugin does nothing until you run it.

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | mode/level decisions + delegation |
| `assets/INSTALL.md` | the runbook — install, level, config, disable/enable, uninstall, purge, verify |
| `assets/agent-router.mjs` | the PreToolUse hook (tier 1 + heartbeat) and the installer CLI |
| `assets/judge-prompt.md` | the tier-2 judge prompt, inlined into settings.json at `level strict` |
| `tests/run.sh`, `tests/suite.mjs`, `tests/suite-install.mjs` | test suites: hook behavior, installer |
