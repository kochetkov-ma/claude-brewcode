# Activation, Description Budget, Troubleshooting

## Description budget (brewcode default)

| Constraint | Value |
|---|---|
| Total | <=100 tokens (~400 chars) |
| Lead sentence | <=160 chars, plain EN prose |
| Triggers | comma-list, EN only, 3-6 keywords |
| Examples | at most 1, commentary <=15 words |
| Language | EN only in frontmatter (RU/other in README only) |

Tighter than the CC ceilings (upload/spec cap 1024 chars, listing cap 1536). Exceed it only if the
user explicitly asks. Often-invoked skills: up to ~200 tokens + 1-2 examples.

## Activation reality

Auto-activation is best-effort, never a contract. Upstream publishes no activation rate — rank
methods, never quote a percentage. Known issue ([#10768](https://github.com/anthropics/claude-code/issues/10768), [#15136](https://github.com/anthropics/claude-code/issues/15136), both closed NOT PLANNED).

| Method | Reliability |
|---|---|
| Basic description | Lowest |
| Optimized description + keywords | Higher |
| `/skill-name` explicit | Highest — the only lever the user controls directly |

`/name` is the strongest lever, not an absolute guarantee. It does not run when: `user-invocable:
false` (hidden from `/`, not run when typed); a `skillOverrides` entry is `"off"` (invoking by
full name returns the override error; plugin skills exempt); a higher-precedence same-name SK
shadows it (enterprise > personal > project, any level overrides a bundled SK); the file is
`skill.md` lowercase, so nothing is discovered; CC refused the folder name (2.1.299+:
`frontmatter-fields.md` `name` row); a nested SK not yet loaded (lazy until a file there is touched).
Malformed frontmatter does NOT break `/name` — the body loads with empty metadata and `/skill-name`
still works, only description-matching dies. Only at message start does `/name` run; after plain
text it only permits Claude to run it for that message.

| `skillOverrides` value | Listed to Claude | In `/` menu |
|---|---|---|
| `"on"` (absent = on) / `"name-only"` | Name + description / name only | Yes |
| `"user-invocable-only"` (`/skills` label `user-only`) / `"off"` | Hidden / hidden (full-name invoke -> override error) | Yes / no |

Plugin SKs ignore `skillOverrides` (use `/plugin`). `/skills` Space/Enter cycles a state, Esc saves to
`.claude/settings.local.json`; it can't cycle plugin SKs, DMI SKs or SKs overridden in managed/`--settings`.
Alias keys (`checkup`) apply only in managed/`--settings` (2.1.260+), restrict-only.

Stacking: `/a /b args` at the terminal expands the first SK plus up to 5 more (each gets the trailing
text as `$ARGUMENTS`); stops at a fork SK or `/loop`. `claude -p`/SDK load only the first.

### Criticality strategy

| Criticality | Config |
|---|---|
| CRIT (deploy, commit, send-email) or failure unacceptable | `disable-model-invocation: true` + use `/name` |
| Important (review, test, docs) | Optimized description + keywords |
| Nice-to-have (helpers, utils) | Basic description |
| Background knowledge | `user-invocable: false` |

## Description optimization

| Invocation | Style |
|---|---|
| User-only (`disable-model-invocation: true`) | Simple one-liner, no triggers needed — the LLM never auto-invokes it |
| LLM-invocable | Action verb + `Triggers:` line, third-person — best odds of auto-load |

Template: `description: "[Action verb sentence]. Triggers: [exact user phrases]."`

```yaml
# BAD -- first-person, no triggers, multiline
description: |
  I can help you create presentations with company colors.
  Use this skill when creating slides.

# GOOD -- third person, single line, action verb + Triggers
description: "Creates presentations with company branding and animations. Triggers: create presentation, make slides, build deck."
```

Rules beyond the Activation mistakes table: ONE line, no `|` multiline; front-load keywords;
"proactively" has no effect; cap per the field reference (brewcode default <=400 chars). Listing
budget is a dynamic **1% of the context window** (`skillListingBudgetFraction`, default `0.01`;
fallback 8,000 chars; `SLASH_COMMAND_TOOL_CHAR_BUDGET` = fixed char count), not a fixed 2%/16K.
Every skill NAME is always listed; over budget, CC drops DESCRIPTIONS, least-invoked skills first
(debug-log warning) — a dropped description loses its trigger keywords. Free budget: `"name-only"`
in `skillOverrides` for low-priority SKs; `/doctor` estimates the listing cost.

### Trigger eval queries (optional but recommended)

Only meaningful for a `disable-model-invocation: false` SK. Generate 5 queries that SHOULD trigger
and 5 tricky near-misses that should NOT (share keywords, need a different tool), run them, iterate
2-3 times on misses, report the hit rate. A regular SA can't prompt the user (`execution-model.md`) —
report, do not poll.

Which questions apply, by `DMI`:

| SK | Trigger question | Output question | How to run |
|---|---|---|---|
| `DMI: true` (every shipped brewcode SK but `brewdoc:publish`, `brewtools:text-optimize`, `brewtools:text-human`) | Skip — the model never auto-invokes it, and it is not preloaded into SAs either. Only a `/name` the user types counts, also mid-message after plain text: there it runs nothing directly but permits Claude to run the SK for that one message (2.1.287+) | Measure | Fresh `claude -p` session invoking `/name` explicitly. Never spawn a SA "with the SK": a `DMI: true` SK silently no-ops from a SA, so a SA-based run measures nothing |
| `DMI: false` | Measure — did the prompt alone load it? | Measure | Fresh session per prompt; personal/project baseline via `skillOverrides: "off"`; plugin baseline via `claude plugin eval` with no plugin loaded (`skillOverrides` excludes plugins) |

Wasted steps? All runs writing similar helper scripts -> bundle into `scripts/`. Heavyweight version
of this loop (evals.json, per-case isolation, grading, A/B): `skill-creator@claude-plugins-official`.

## Activation mistakes (kill auto-load)

| Mistake | Fix |
|---|---|
| Summary without `Triggers:` | Keep action-verb sentence + exact trigger phrases, e.g. `Triggers: deploy, release, ship to prod` |
| Starts with "Use this skill when" | Start with an action verb: "Deploys..." |
| Vague description | Specific: "Deploy to k8s" not "Helps with deployment" |
| First-person description | Third-person: "Deploys..." not "I deploy..." |
| Second-person body | Imperative: "Do X" not "You should do X" |
| CRIT without slash | `disable-model-invocation: true` for CRIT ops |
| Too many skills | Beyond the dynamic listing budget -> least-invoked descriptions dropped, names stay |

## Troubleshooting: SK not auto-activating

| Symptom | Cause | Fix |
|---|---|---|
| Never activates | Description dropped from the listing (over budget, least-invoked first) | `/doctor` listing estimate, `/skill-doctor`; trim descriptions, `name-only` for others, raise `skillListingBudgetFraction` |
| Never activates | Description reads as a summary | Rewrite with triggers only |
| Never activates | `paths` set, files outside cwd (sibling worktree via `/add-dir`) | Start in / `/cd` to that dir |
| Sometimes activates | Weak keywords | Add explicit "Trigger keywords:" |
| Was working, stopped | Context compaction | Re-attaches the latest invocation of each SK: first 5K tokens each, 25K combined, newest first; the listing is re-sent (2.1.304+). Re-invoke `/name` if evicted; an identical render adds only an "already loaded" note, a changed one the full text |
| New/edited SK missing | Not watched | Watched: `~/.claude/skills`, project and `--add-dir` `.claude/skills` (SKILL.md text only; not bare mode). New top-level dir -> `/reload-skills` (2.1.304+: re-sends only new/changed SKs). SK installed by a SessionStart hook -> hook returns `reloadSkills: true` |
| Claude ignores the instruction | Attention competition | Fewer skills, explicit `/name` |

Debug: inspect `/skills`, discovery path, DMI/UI settings, overrides, description/paths and listing
budget. Missing from a list does not prove budget overflow. Check observable Skill calls; test
`/skill-name`; separate discovery/configuration errors from task failures. Naming an LLM-invocable
skill is the strongest hint short of `/name`. Refused names: `claude --debug`, search `[names]`.

## Validation tools

Beyond `validate-skill.sh` (the gate; the tools below never replace it):

| Tool | Since | Use |
|---|---|---|
| `/doctor prompt-audit [path]` (alias `/checkup prompt-audit`) | v2.1.283 | Audits skills, agents, commands and CLAUDE.md for prompting patterns written for older models — run it on every new or changed SK |
| `/skill-doctor` | v2.1.252, needs feature-flag fetching | Reports unused loaded skills and their context cost, for pruning |
| `claude plugin eval` | v2.1.269 | Scored plugin eval suite, JSON+HTML report |
| `claude plugin validate <dir>` (`.claude/skills`, `~/.claude/skills`, a plugin) | v2.1.233 | Finds `SKILL.md` whose frontmatter does not parse (such a SK loads with no fields) |

## Known bugs

Re-check a state: `gh api repos/anthropics/claude-code/issues/<N> --jq '[.state,.state_reason]'`. Reported token costs are original reproductions, !=universal overhead; Closed NOT PLANNED/duplicate !=verified fix.

| # | Bug | Impact | Status | Workaround |
|---|---|---|---|---|
| [#39686](https://github.com/anthropics/claude-code/issues/39686) | claude.ai skills silently injected (~6000 tokens in report) | Reported 37% listing-budget use | Closed NOT PLANNED | Opt out with `syncClaudeAiSkills: false`; check the listing budget |
| [#22345](https://github.com/anthropics/claude-code/issues/22345) | PLG skills ignore DMI | Reported ~4400 tokens; contradicts supported DMI contract | Open; runtime unverified | Reproduce on installed version before copying/moving a skill |
| [#17688](https://github.com/anthropics/claude-code/issues/17688) | SK-scoped hooks don't fire in PLGs | Historical skill-hook failure | Closed completed | Docs verified 2.1.309: skill hooks register on invoke, last the session; probe 2.1.306 fired a plugin-skill PreToolUse hook. Use PLG `hooks.json` for plugin-wide behavior |
| [#35641](https://github.com/anthropics/claude-code/issues/35641) | `/reload-plugins` doesn't load new PLG skills | Historical reload failure | Closed duplicate | `/reload-skills` (v2.1.152); 2.1.246 fixed same-symptom "0 skills" case; verify installed version |
| [#33080](https://github.com/anthropics/claude-code/issues/33080) | Same-name skill resolution surprises users | Non-bundled skill overrides bundled skill | Closed NOT PLANNED | Namespace prefix (e.g. `my-`) if collision unwanted |
| [#17417](https://github.com/anthropics/claude-code/issues/17417) | `skill.md` lowercase ignored | SK not discovered; uppercase remains required | Closed completed | Use `SKILL.md` uppercase |
| [#36031](https://github.com/anthropics/claude-code/issues/36031) | User-level skills listed but not invoked in Desktop | Historical Desktop loading report | Closed NOT PLANNED; runtime unverified | Compare installed Desktop/CLI versions |

## Version-dependent behavior (through 2.1.309)

- 2.1.257+: a symlinked command/agent/skill/hooks path that leaves the plugin's own directory is
  refused with an error.
- 2.1.269+: skills synced from claude.ai are named `anthropic-skills:<name>` (bare name still
  works if unclaimed). 2.1.273+: terminal sessions sync them at session start, then check about
  every 10 minutes (40 when idle); use the reserved synced namespace for permission rules, not an
  assumed plugin source.
- 2.1.295+: a skill's `allowed-tools` and `effort` are no longer dropped in `-p` runs — headless
  evals that drive a skill through `claude -p` are meaningful only from this version.
- 2.1.299-2.1.304: skill-frontmatter hooks, see `frontmatter-fields.md` Hooks field detail (first-prompt `UserPromptSubmit`, `[skill]` ask label, per-source caps, `once` isolation, hooks-from-plugins-only policy drops the skill's `allowed-tools`: Policy row).
- 2.1.299: names with hidden/direction-changing/blank-like chars or `<`/`>` refused; every
  `UserPromptSubmit` hook runs before a SK expands (a block stops its `!` commands); "Unknown skill"
  suggests the listed name when Claude adds a wrong `anthropic-skills:` prefix.
- 2.1.301: `arguments` fills only the first 64 names x 64 chars; skills listed again after `/rewind`.
- 2.1.302: fork mode on by default in `-p`, SDK, desktop, VS Code (`execution-model.md` Agent params).
- 2.1.304: compaction re-sends the skill listing; `/reload-skills` sends only new or changed skills.
- 2.1.305: Desktop path-mounted (`@inline`) plugins lose `allowed-tools` under `allowManagedPermissionRulesOnly`.
- 2.1.309: a same-named `--add-dir` SK is reachable as `/<folder>:<name>`.

## Validation checklist (Step 6, alongside `validate-skill.sh`)

Structure, on top of what the validator enforces (YAML, `name` <=64 chars == dir name, FM key
set, `argument-hint` prompt-first, Prompt Contract): `description` third-person, what+when+3-5
triggers, no filler; body <500 lines, imperative form; `context: fork` if standalone; `agent` an appropriate type; `model` matched to complexity;
`allowed-tools` pre-approval only, bare `Bash`/`Write`/`Edit` only per `execution-model.md` Rules; `disallowed-tools` present
when the invoking turn must exclude a tool (autonomous -> `AskUserQuestion`; reapply next invocation); examples actually work; no
hardcoded secrets; Bash blocks carry the `EXECUTE` keyword + `&& OK || FAIL` + dynamic (CSD/BPR)
paths, and pass the three spelling checks of `execution-model.md` String substitutions (no bare
`$N` in a fence, no `$ARGUMENTS` spliced into shell, exact-brace path tokens).

Activation (CRIT): description follows Description optimization and hits no Activation mistakes row; CRIT operations use `disable-model-invocation: true`.

Test LLM-invocable skills: say the trigger phrase (should auto-load); "Use [skill-name] skill to..."
(higher odds); `/skill-name` (works unless an Activation Reality caveat applies). Trigger test fails
but `/name` works -> optimize the description or switch to `DMI: true`.

## Sources

[CC Skills](https://code.claude.com/docs/en/skills) | [Custom Subagents](https://code.claude.com/docs/en/sub-agents) | [Skill Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) | [agentskills.io](https://agentskills.io)
