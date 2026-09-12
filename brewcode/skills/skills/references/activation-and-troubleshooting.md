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
| CRIT (deploy, commit, send-email) | `disable-model-invocation: true` + use `/name` |
| Important (review, test, docs) | Optimized description + keywords |
| Nice-to-have (helpers, utils) | Basic description |
| Background knowledge | `user-invocable: false` |

Rule: failure unacceptable -> `disable-model-invocation: true` + slash command.

## Description optimization

Claude uses `description` to decide when to invoke. Description quality is the only lever on
auto-load — upstream publishes no rate, compare variants against your own eval set.

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
2-3 times on misses, report the hit rate. A SA can't prompt the user (`execution-model.md`) —
report, do not poll.

Which questions apply, by `DMI`:

| SK | Trigger question | Output question | How to run |
|---|---|---|---|
| `DMI: true` (every shipped brewcode SK) | Skip — the model never auto-invokes it (`skills:331`), and it is not preloaded into SAs either | Measure | Fresh `claude -p` session invoking `/name` explicitly. Never spawn a SA "with the SK": a `DMI: true` SK silently no-ops from a SA, so a SA-based run measures nothing |
| `DMI: false` | Measure — did the prompt alone load it? | Measure | Fresh session per prompt; disable via `skillOverrides: "off"` for the baseline half (`skills:759`) |

Wasted steps? All runs writing similar helper scripts -> bundle into `scripts/`. Heavyweight version
of this loop (evals.json, per-case isolation, grading, A/B): `skill-creator@claude-plugins-official`
(`skills:793-812`).

## Activation mistakes (kill auto-load)

| Mistake | Fix |
|---|---|
| Summary without triggers | Include BOTH the action-verb sentence AND a `Triggers:` line |
| No `Triggers:` line | Add `Triggers: deploy, release, ship to prod` |
| Starts with "Use this skill when" | Start with an action verb: "Deploys..." |
| Vague description | Specific: "Deploy to k8s" not "Helps with deployment" |
| First-person description | Third-person: "Deploys..." not "I deploy..." |
| Second-person body | Imperative: "Do X" not "You should do X" |
| CRIT without slash | `disable-model-invocation: true` for CRIT ops |
| Too many skills | Beyond the dynamic listing budget -> some invisible |
| PLG skills: DMI ignored | PLG skills always in context ([#22345](https://github.com/anthropics/claude-code/issues/22345), unconfirmed against 2.1.233) — copy to `.claude/skills/` if parity needed |

## Troubleshooting: SK not auto-activating

| Symptom | Cause | Fix |
|---|---|---|
| Never activates | Beyond listing budget | Run `/skill-doctor` (added 2.1.261 — shows unused loaded skills and their context cost) or check `/skills`; trim skill count or description length |
| Never activates | Description reads as a summary | Rewrite with triggers only |
| Sometimes activates | Weak keywords | Add explicit "Trigger keywords:" |
| Was working, stopped | Context compaction | Reattaches under the 5K/skill, 25K combined budget; re-invoke `/name` if evicted |
| Claude ignores the instruction | Attention competition | Fewer skills, explicit `/name` |

Debug steps: ask "What skills do you have?" — not listed means budget exceeded. Check visible
thinking for the SK name — absent means the description isn't matching. Test explicit
`/skill-name` — works means an activation issue, fails means the SK is broken. Force test: "Use
skill-name skill to do X" — naming the SK is the strongest hint short of `/name`.

## Validation tools

Beyond `validate-skill.sh` (this workspace's own gate): `/skill-doctor` (v2.1.261) reports unused
loaded skills and their context cost, for pruning. `claude plugin eval` (v2.1.269) runs a scored
plugin eval suite with a JSON+HTML report — a new option alongside `validate-skill.sh`, not a
replacement for it.

## Known bugs

| # | Bug | Impact | Status | Workaround |
|---|---|---|---|---|
| [#39686](https://github.com/anthropics/claude-code/issues/39686) | claude.ai skills silently injected (~6000 tokens) | 37% of SK budget consumed, no opt-out | Open | No workaround |
| [#22345](https://github.com/anthropics/claude-code/issues/22345) | PLG skills ignore DMI | PLG skills always in context (~4400 tokens) | Open, unconfirmed against 2.1.233 | No workaround |
| [#17688](https://github.com/anthropics/claude-code/issues/17688) | SK-scoped hooks don't fire in PLGs | Hooks from SKILL.md frontmatter not working for PLG skills | Open | Use PLG `hooks.json` |
| [#35641](https://github.com/anthropics/claude-code/issues/35641) | `/reload-plugins` doesn't load skills from new PLGs | Skills emitter not called on reload | Open | `/reload-skills` (v2.1.152) re-scans without restart. 2.1.246 fixed a same-symptom "0 skills reported" case — not confirmed identical, re-test before removing this row |
| [#33080](https://github.com/anthropics/claude-code/issues/33080) | Same-name skill resolution surprises users | A non-bundled skill overrides a same-name bundled skill, no notice | Open | Namespace prefix (e.g. `my-`) if collision unwanted |
| [#17417](https://github.com/anthropics/claude-code/issues/17417) | `skill.md` lowercase silently ignored | SK not discovered | Open | Use `SKILL.md` uppercase |
| [#36031](https://github.com/anthropics/claude-code/issues/36031) | User-level skills listed in Desktop autocomplete but not invoked | SKILL.md not loaded in Desktop app | Open, unconfirmed against 2.1.233 | Use CLI |
| [#10768](https://github.com/anthropics/claude-code/issues/10768) / [#15136](https://github.com/anthropics/claude-code/issues/15136) | Auto-activation unreliable | SK not invoked on relevant request | Closed NOT PLANNED | Optimize description, then `/name` |

## Behavior changes worth knowing (2.1.234-2.1.269)

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
when the SK must never call a tool (autonomous -> `AskUserQuestion`); examples actually work; no
hardcoded secrets; Bash blocks carry the `EXECUTE` keyword + `&& OK || FAIL` + dynamic (CSD/BPR)
paths.

Activation (CRIT): description starts with an action verb and includes a `Triggers:` line; triggers
present and concrete ("Triggers: deploy, release, ship to prod"); single line, no multiline `|`,
within the field-reference caps; third-person ("Deploys..." not "I deploy..."); CRIT operations use
`disable-model-invocation: true`.

Test it: say the trigger phrase (should auto-load); say "Use [skill-name] skill to..." (higher
activation odds); say `/skill-name` (works unless an Activation Reality caveat applies). Trigger
test fails but `/name` works -> optimize the description or switch to `DMI: true`.

## Sources

[CC Skills](https://code.claude.com/docs/en/skills) | [Custom Subagents](https://code.claude.com/docs/en/sub-agents) | [Skill Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) | [agentskills.io](https://agentskills.io)
- [GitHub #12541](https://github.com/anthropics/claude-code/issues/12541) — feature request that led to CSD
