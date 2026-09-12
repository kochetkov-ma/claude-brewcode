# Frontmatter Field Reference

Complete supported SKILL.md frontmatter set, 20 fields (`skills:326-345` @ CC 2.1.233 baseline,
cross-checked against docs fetched 2026-09-12 for 2.1.269). Anything else -> the supported
`metadata:` map, which CC accepts but ignores (`skills:343`). An invented key (`cli:` outside the
house convention below, `updated:`) is not a feature — CC ignores it and claude.ai upload /
Skills API / `package_skill.py` hard-fail on it (`skills:354`, error text `skills:358`; allowed set
there is only `name, description, license, compatibility, metadata, allowed-tools`).

## Core

| Field | Type | Default | Meaning |
|---|---|---|---|
| `name` | string | dir name | Slash-command id. <=64 chars, lowercase/numbers/hyphens, **BARE, == dir name (brewcode house rule)**. A `<plg>:` prefix is a defect: PLG skills get the plugin name prepended by CC itself, so a baked `brewcode:e2e` renders `/brewcode:brewcode:e2e` (`skills:377,380`). 2.1.246 made a stray prefix render correctly instead of doubling — cosmetically safer, but the house rule is unchanged; do not relax `validate-skill.sh:70` |
| `description` | string | -- | What + when + 3-5 distinct triggers, no filler. Spec hard cap **1024** chars; **1536**-char listing-display cap is `description` + `when_to_use` COMBINED (raised ~v2.1.107-108); brewcode default target <=400 chars. ALWAYS quote it — an unquoted `--`/`:`/special char breaks YAML parsing silently, SK stays on disk but skills.sh fails to parse it |

> **Command name != `name` at every level.** Personal/project SK: the command comes from the DIR
> name, `name` is only a display label (`skills:374`, `skills:326`). PLG SK: `name` sets only the
> last segment, namespaced by the plugin (`skills:377`). Upstream permits `name` != dir; brewcode
> does NOT — all 28 shipped SKs keep `name` == dir. Follow the house rule, never relax the validator.

## Invocation Control

| Field | Type | Default | Meaning |
|---|---|---|---|
| `when_to_use` | string | none | Extra activation guidance appended to `description`; counts toward the same 1536-char listing-display cap. Docs-confirmed, not in the 2.1.234-2.1.269 changelog slice |
| `disable-model-invocation` (DMI) | bool | false | `true` = user-only via `/name`. Also blocks preload into SAs (`skills:331`) and, per docs, scheduled-task firing — a strict superset of "LLM never auto-invokes it" |
| `user-invocable` (UI-F) | bool | true | `false` = hidden from `/` menu, Claude-only background knowledge |
| `argument-hint` | string | none | Autocomplete hint. House rule: prompt-first, `[prompt] [mode...]` — see `prompt-contract.md` |

Config matrix: `(default)` = user+Claude invocable, DESC counted in listing budget. `DMI: true` =
user only, Claude never (0 budget). `UI-F: false` = Claude only, DESC still counted. Both true = SK
inaccessible — never combine.

## Execution Control

| Field | Type | Default | Meaning |
|---|---|---|---|
| `allowed-tools` (AT) | string \| list | none | **Pre-approval, NOT a sandbox.** Grants tools without a permission prompt for the invoking TURN only; restricts nothing — every tool stays callable (`skills:333,513`). Now also accepts a YAML list, not only a comma string. Never a bare `Bash`/`Write`/`Edit`/`Agent` — narrowest pattern (`Bash(git status:*)`) or omit the key |
| `disallowed-tools` (DT) | string \| list | none | The ONLY key that removes anything: drops tools from the pool while the SK is active (`skills:334,528`). Cannot fully remove `EndConversation` while any other tool remains |
| `model` | enum | session model | `opus`, `sonnet`, `haiku`, `fable` (alias -> canonical `claude-fable-5`, Mythos tier above Opus, v2.1.170), or `inherit` (this agent's own frontmatter value — runs on whatever model the session is using). Fixed in **2.1.259**: was ignored in interactive sessions, and auto-mode running an unsupported `model:` now falls back to the session model instead of erroring |
| `effort` | enum | inherit | `low, medium, high, xhigh, max` — no `auto`. Since v2.1.80. Fixed in **2.1.267**: was ignored on models with a pinned default effort (Opus 4.7, Opus 4.8, Fable 5) |
| `context` | enum(`fork`) | inline | `fork` = isolated SA. Kickoff-prompt streaming (and, with `--forward-subagent-text`, turn text) fixed in **2.1.265** |
| `background` | bool | true | Fork-only. `false` = wait for the result in the invoking turn instead of backgrounding (default true since v2.1.218) |
| `agent` | string | general-purpose | With `context: fork`. Only `Explore`, `Plan`, `general-purpose` are confirmed built-in — see `design-patterns.md`. Custom: `.claude/agents/` / `~/.claude/agents/` via `agent: my-custom-agent` |
| `hooks` | object | none | Hooks scoped to the SK's lifecycle, `if:` glob condition since v2.1.85. See Hooks below |

## Docs-confirmed, not in the 2.1.234-2.1.269 changelog slice

| Field | Type | Default | Meaning |
|---|---|---|---|
| `arguments` | string \| list | none | Declares named args -> enables `$name` substitution in the body, in addition to `$0`/`$1`/`$ARGUMENTS`. **Available upstream, NOT required by house convention** — the house prompt-contract keeps one free-form `[prompt]` string (`argument-hint` position 1); use `arguments:` only where a genuinely named, structured arg earns its own slot |
| `paths` | string \| list | none | Glob(s) scoping where the skill is offered |
| `shell` | enum | bash | Shell used to run `` !`command` `` dynamic-CTX blocks (bash/powershell) |
| `metadata` | map | none | Free-form key/value block for registries/third-party tooling; CC itself ignores it |
| `license` | string | none | SPDX identifier — Agent Skills spec field, CC ignores |
| `compatibility` | string | none | Environment requirements, <=500 chars — Agent Skills spec field, CC ignores |

## House custom keys (brewcode convention, not native CC)

These pass the validator's allow-list because the house documents them; they are NOT part of the
20 native fields above and CC does not interpret them.

| Field | Rule |
|---|---|
| `cli` | string \| list, each token `/^[\w.-]{1,42}$/`. Names the command(s) the skill owns when it isn't spelled like the dir name. Denylist (never claim): `sh bash zsh ls cat stat mv rm cp mkdir df du curl wget python python3 node npm git echo grep sed awk find head tail chmod chown`. Never inferred from `allowed-tools` |
| `version` | Free-form, not semver, no ordering. MANDATORY when the skill's behaviour lives outside its own directory (binary on PATH, wrapper in an image, remote service) — its only contract is "changing the value changes the skill directory's content hash" |
| `content_version`, `generated_by`, `last_updated`, `doc_type`, `surface_files` | Release-tooling stamps written by `bump-version.sh` / doc pipeline — do not hand-edit, do not invent new ones |

## Hooks field detail

```yaml
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate.sh"
          once: true   # suboption of a HOOK ENTRY — never a top-level sibling of name/description
```

All hook events are supported (`hooks:652`) — `PreToolUse`/`PostToolUse`/`Stop` are just the common
ones. CC registers a SK's hooks when invoked and keeps them running for the REST OF THE SESSION,
including turns after the SK's own (`hooks:650`). `once: true` fires the hook once then
unregisters it — honored only nested under a hook entry in SK frontmatter as shown above; ignored
in settings.json and in agent frontmatter (`hooks:424`).

`PostToolUse` runs AFTER the tool, so it cannot prevent the call (`hooks:839`) — but
`decision: "block"` still adds a `reason` next to the tool result, and `updatedToolOutput` replaces
what Claude sees (`hooks:1923`).

> PLG caveat: SK-frontmatter hooks do not fire for PLG skills ([#17688](https://github.com/anthropics/claude-code/issues/17688)) — use the plugin's own `hooks.json` instead.

## SKILL.md skeleton

```yaml
---
name: my-skill                               # max 64 chars, lowercase-hyphens, == dir name, NO plg: prefix
description: "Apply X guidelines for Y"      # ALWAYS quoted -- prevents YAML parse failure
---

# Skill Name

## Overview
One paragraph purpose.

## Instructions
Imperative form: "Do X" (not "You should do X").
```

## Common frontmatter / structural mistakes

| Mistake | Fix |
|---|---|
| Colon in `description` unquoted | Quote the whole value — an em dash/colon breaks YAML silently |
| Body >500 lines | Move detail to `references/` |
| Invented FM key (`cli:` outside the house rule above, `version:` without the outside-dir rule, `updated:`) | Use a supported key or `metadata:` — claude.ai packaging hard-fails on the rest (`skills:358`) |
| Bare `Bash`/`Write`/`Edit`/`Agent` in `allowed-tools` "to restrict" | `AT` only pre-approves, never restricts (`skills:513`); narrowest Bash pattern or omit; restrict via `disallowed-tools` |
| `argument-hint` starts with a mode token | Prompt is always position 1: `[prompt] [mode1\|mode2]`, never `<mode1\|mode2>` alone |
| `skill.md` (lowercase) | Must be `SKILL.md` (uppercase) — lowercase silently ignored ([#17417](https://github.com/anthropics/claude-code/issues/17417)) |
| Reserved SK names (`anthropic`, `claude`) | Won't load — avoid these two words as `name` |
| DESC over spec/listing caps | May be truncated — front-load keywords, cut filler |
| `agent:` set to `developer`/`tester`/`reviewer` | Only `Explore`/`Plan`/`general-purpose` are built in — a generated SK naming anything else fails to resolve its SA on first run |
| Bare top-level `once: true` | `once` is a suboption of a hook entry (`hooks.<Event>[].hooks[].once`), never a sibling of `name`/`description` |
