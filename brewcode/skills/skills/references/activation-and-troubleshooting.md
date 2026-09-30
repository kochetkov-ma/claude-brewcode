# Activation, Description Budget, Troubleshooting

## Description budget (brewcode default)

| Constraint | Value |
|---|---|
| Total | <=100 tokens (~400 chars) |
| Lead sentence | <=160 chars, plain EN prose |
| Triggers | comma-list, EN only, 3-6 keywords |
| Examples | at most 1, commentary <=15 words |
| Language | EN only in frontmatter (RU/other in README only) |

Tighter than the CC spec ceiling (hard cap 1024 chars, listing-display cap 1536). Exceed the
brewcode default only if the user explicitly asks. Often-invoked skills: up to ~200 tokens + 1-2
examples.

## Activation reality

Current contracts checked against live official docs + changelog through CC 2.1.285 (2026-09-30).

Auto-activation is best-effort, never a contract. Upstream publishes no activation rate — rank
methods, never quote a percentage. Known issue ([#10768](https://github.com/anthropics/claude-code/issues/10768), [#15136](https://github.com/anthropics/claude-code/issues/15136), both closed NOT PLANNED).

| Method | Reliability |
|---|---|
| Basic description | Lowest |
| Optimized description + keywords | Higher |
| `/skill-name` explicit | Highest — the only lever the user controls directly |

`/name` is the strongest lever, not an absolute guarantee. It does not run when: `user-invocable:
false` (hidden from `/`, not run when typed, `skills:332`); a `skillOverrides` entry is `"off"`
(invoking by full name returns the override error, `skills:772`; plugin skills exempt, `skills:785`);
a higher-precedence same-name SK shadows it (enterprise > personal > project, `skills:124`, any
level overrides a bundled SK, `skills:126`); the file is `skill.md` lowercase, so nothing is
discovered. Malformed frontmatter does NOT break `/name` — the body loads with empty metadata and
`/skill-name` still works, only description-matching dies (`skills:1028`).

Context reattachment after compaction: 5K tokens/skill, 25K combined budget, not an unbounded-loss
bug. If a skill still gets evicted under load, re-invoke `/name`.

### Criticality strategy

| Criticality | Config |
|---|---|
| CRIT (deploy, commit, send-email) or failure unacceptable | `disable-model-invocation: true` + use `/name` |
| Important (review, test, docs) | Optimized description + keywords |
| Nice-to-have (helpers, utils) | Basic description |
| Background knowledge | `user-invocable: false` |

## Description optimization

Claude uses description/activation guidance, invocation settings, paths and listing availability.
Upstream publishes no activation rate; compare description variants against your eval set.

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

Rules: action verb, not "Use this skill when"; ONE line, no `|` multiline; front-load keywords;
`Triggers:` with exact user phrases; "proactively" has no effect; cap per the field reference
(brewcode default <=400 chars). Listing budget is a dynamic **1% of the context window**
(`skillListingBudgetFraction`, default `0.01`), not a fixed 2%/16K — exceeding it means some skills
never appear in the listing.

### Trigger eval queries (optional but recommended)

Only meaningful for a `disable-model-invocation: false` SK. Generate 5 queries that SHOULD trigger
and 5 tricky near-misses that should NOT (share keywords, need a different tool), run them, iterate
2-3 times on misses, report the hit rate. A regular SA can't prompt the user (`execution-model.md`) —
report, do not poll.

Which questions apply, by `DMI`:

| SK | Trigger question | Output question | How to run |
|---|---|---|---|
| `DMI: true` (every shipped brewcode SK) | Skip — the model never auto-invokes it (`skills:331`), and it is not preloaded into SAs either | Measure | Fresh `claude -p` session invoking `/name` explicitly. Never spawn a SA "with the SK": a `DMI: true` SK silently no-ops from a SA, so a SA-based run measures nothing |
| `DMI: false` | Measure — did the prompt alone load it? | Measure | Fresh session per prompt; personal/project baseline via `skillOverrides: "off"`; plugin baseline via `claude plugin eval` with no plugin loaded (`skillOverrides` excludes plugins) |

Wasted steps? All runs writing similar helper scripts -> bundle into `scripts/`. Heavyweight version
of this loop (evals.json, per-case isolation, grading, A/B): `skill-creator@claude-plugins-official`
(`skills:793-812`).

## Activation mistakes (kill auto-load)

| Mistake | Fix |
|---|---|
| Summary without `Triggers:` | Keep action-verb sentence + exact trigger phrases, e.g. `Triggers: deploy, release, ship to prod` |
| Starts with "Use this skill when" | Start with an action verb: "Deploys..." |
| Vague description | Specific: "Deploy to k8s" not "Helps with deployment" |
| First-person description | Third-person: "Deploys..." not "I deploy..." |
| Second-person body | Imperative: "Do X" not "You should do X" |
| CRIT without slash | `disable-model-invocation: true` for CRIT ops |
| Too many skills | Beyond the dynamic listing budget -> some invisible |
| PLG DMI behavior differs from contract | Historical [#22345](https://github.com/anthropics/claude-code/issues/22345) remains open; docs support DMI. Reproduce on installed version before copying/moving a skill |

## Troubleshooting: SK not auto-activating

| Symptom | Cause | Fix |
|---|---|---|
| Never activates | Beyond listing budget | Run `/skill-doctor` (added 2.1.261 — shows unused loaded skills and their context cost) or check `/skills`; trim skill count or description length |
| Never activates | Description reads as a summary | Rewrite with triggers only |
| Sometimes activates | Weak keywords | Add explicit "Trigger keywords:" |
| Was working, stopped | Context compaction | Reattaches under the 5K/skill, 25K combined budget; re-invoke `/name` if evicted |
| Claude ignores the instruction | Attention competition | Fewer skills, explicit `/name` |

Debug: inspect `/skills`, discovery path, DMI/UI settings, overrides, description/paths and listing
budget. Missing from a list does not prove budget overflow. Check observable Skill calls; test
`/skill-name` and distinguish discovery/configuration errors from task failures. Naming an
LLM-invocable skill is the strongest hint short of `/name`.

## Validation tools

Beyond `validate-skill.sh` (this workspace's own gate): `/skill-doctor` (v2.1.261) reports unused
loaded skills and their context cost, for pruning. `claude plugin eval` (v2.1.269) runs a scored
plugin eval suite with a JSON+HTML report — a new option alongside `validate-skill.sh`, not a
replacement for it.

## Known bugs

Issue states checked via official GitHub API 2026-09-30. Reported token costs are original reproductions, !=universal overhead; Closed NOT PLANNED/duplicate !=verified fix.

| # | Bug | Impact | Status | Workaround |
|---|---|---|---|---|
| [#39686](https://github.com/anthropics/claude-code/issues/39686) | claude.ai skills silently injected (~6000 tokens in report) | Reported 37% listing-budget use | Closed NOT PLANNED | Check current synced-skill controls and listing budget; do not assume no opt-out |
| [#22345](https://github.com/anthropics/claude-code/issues/22345) | PLG skills ignore DMI | Reported ~4400 tokens; contradicts supported DMI contract | Open; runtime unverified on 2.1.285 | Reproduce on installed version |
| [#17688](https://github.com/anthropics/claude-code/issues/17688) | SK-scoped hooks don't fire in PLGs | Historical skill-hook failure | Closed completed | Live docs support skill hooks; use PLG `hooks.json` for plugin-wide behavior |
| [#35641](https://github.com/anthropics/claude-code/issues/35641) | `/reload-plugins` doesn't load new PLG skills | Historical reload failure | Closed duplicate | `/reload-skills` (v2.1.152); 2.1.246 fixed same-symptom "0 skills" case; verify installed version |
| [#33080](https://github.com/anthropics/claude-code/issues/33080) | Same-name skill resolution surprises users | Non-bundled skill overrides bundled skill | Closed NOT PLANNED | Namespace prefix (e.g. `my-`) if collision unwanted |
| [#17417](https://github.com/anthropics/claude-code/issues/17417) | `skill.md` lowercase ignored | SK not discovered; uppercase remains required | Closed completed | Use `SKILL.md` uppercase |
| [#36031](https://github.com/anthropics/claude-code/issues/36031) | User-level skills listed but not invoked in Desktop | Historical Desktop loading report | Closed NOT PLANNED; 2.1.285 runtime unverified | Compare installed Desktop/CLI versions |
| [#10768](https://github.com/anthropics/claude-code/issues/10768) / [#15136](https://github.com/anthropics/claude-code/issues/15136) | Auto-activation unreliable | SK not invoked on relevant request | Closed NOT PLANNED | Optimize description, then `/name` |

## Behavior changes worth knowing (2.1.234-2.1.285)

- 2.1.239: BOM'd `.md` files (agents/skills/commands) were silently ignored -> fixed; still author
  clean UTF-8 without a BOM.
- 2.1.239: the post-compaction reminder no longer replays a skill's original arguments as a new
  request — context loss itself is not fixed.
- 2.1.246: `/reload-plugins` loads new-plugin skills; `/cd` loads the new directory's project
  skills immediately, no `--resume` needed.
- 2.1.257: a plugin could read files outside its own directory via a symlinked
  command/agent/skill/hooks path — now refused with an error.
- 2.1.260: a managed `skillOverrides` keyed on a bundled skill's alias didn't apply, and a
  `Skill(name)` deny rule didn't cover a nested `<dir>:name` skill — both fixed.
- 2.1.269: skills synced from claude.ai in cloud sessions are renamed `anthropic-skills:<name>`
  (bare name still works if unclaimed) — partial mitigation for local/cloud name collisions.
- 2.1.273: terminal sessions sync claude.ai skills at session start and check every ~10 minutes;
  use the reserved synced namespace for permission rules, not an assumed plugin source.

## Version history (earlier fixes, no inline home)

| Version | Change |
|---|---|
| v2.1.76 | `/effort` slash command |
| v2.1.74 | Fix: `ask` rules bypassed via `allowed-tools` |
| v2.1.73 | Fix: deadlock on mass SK file changes |
| v2.1.72 | Fix: built-in slash cmds hidden; SK hooks dropped |
| v2.1.69 | Security: nested discovery skips gitignored dirs |
| v2.1.47 | Fix: crash on numeric `name`/`description`; `argument-hint` YAML sequence |
| v2.1.45 | PLG skills available immediately after install (no restart) |

## Validation checklist (Step 6, alongside `validate-skill.sh`)

Structure: valid YAML frontmatter; `name` <=64 chars lowercase-hyphens == dir name, no `plg:`
prefix; `description` per the field reference caps, third-person, what+when+3-5 triggers, no
filler; every FM key in the supported set or the house custom list (no invented key);
`argument-hint` prompt-first; Prompt Contract satisfied (`## Prompt contract` section, PLAN block
with all 5 labels, 2+ modes -> keyword table with `Mutates?` + RU); body <500 lines, imperative
form; `context: fork` if standalone; `agent` an appropriate type; `model` matched to complexity;
`allowed-tools` pre-approval only, no bare `Bash`/`Write`/`Edit`/`Agent`; `disallowed-tools` present
when the invoking turn must exclude a tool (autonomous -> `AskUserQuestion`; reapply next invocation); examples actually work; no
hardcoded secrets; Bash blocks carry the `EXECUTE` keyword + `&& OK || FAIL` + dynamic (CSD/BPR)
paths.

Activation (CRIT): description starts with an action verb and includes a `Triggers:` line; triggers
present and concrete ("Triggers: deploy, release, ship to prod"); single line, no multiline `|`,
within the field-reference caps; third-person ("Deploys..." not "I deploy..."); CRIT operations use
`disable-model-invocation: true`.

Test LLM-invocable skills: say the trigger phrase (should auto-load); say "Use [skill-name] skill to..." (higher
activation odds); say `/skill-name` (works unless an Activation Reality caveat applies). Trigger
test fails but `/name` works -> optimize the description or switch to `DMI: true`.

## Sources

[CC Skills](https://code.claude.com/docs/en/skills) | [Custom Subagents](https://code.claude.com/docs/en/sub-agents) | [Skill Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) | [agentskills.io](https://agentskills.io) | [#12541](https://github.com/anthropics/claude-code/issues/12541) (CSD feature request)
