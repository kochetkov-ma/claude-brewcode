# Frontmatter Field Reference

Complete supported SKILL.md frontmatter set, 20 fields (live [skills docs](https://code.claude.com/docs/en/skills),
checked through CC 2.1.296). Anything else -> the supported
`metadata:` map, which CC accepts but ignores. An invented key (`cli:` outside the
house convention below, `updated:`) is not a feature — CC ignores it silently and claude.ai upload /
Skills API / `package_skill.py` hard-fail on it (allowed set
there is only `name, description, license, compatibility, metadata, allowed-tools`).

## Core

| Field | Type | Default | Meaning |
|---|---|---|---|
| `name` | string | dir name | Slash-command id. <=64 chars, lowercase/numbers/hyphens, **BARE, == dir name (brewcode house rule)**, enforced by `validate-skill.sh`. A `<plg>:` prefix is a defect by convention only: CC prepends the plugin name itself and, on >= 2.1.246, does not double a prefix already written (`name: brewcode:e2e` renders `/brewcode:e2e`). One spelling per skill keeps `name` == dir checkable — do not relax the validator |
| `description` | string | -- | What + when + 3-5 distinct triggers, no filler. Upload/spec cap **1024** chars; in the skill listing sent to the model each entry is cut at **1536** chars, `description` + `when_to_use` COMBINED (`skillListingMaxDescChars`); brewcode default target <=400 chars. ALWAYS quote it — an unquoted `--`/`:`/special char breaks YAML parsing silently, SK stays on disk but skills.sh fails to parse it |

> **Command name.** Personal/project SK: `name` sets the command (unless another command already
> uses it) and the DIR name invokes it too; a SK is found by `name` even when the folder differs
> (2.1.290+). PLG SK: `name` sets only the last segment, the plugin prefix stays. Upstream permits
> `name` != dir; brewcode does NOT — shipped SKs keep `name` == dir.

## Invocation Control

| Field | Type | Default | Meaning |
|---|---|---|---|
| `when_to_use` | string | none | Extra activation guidance appended to `description`; counts toward the same 1536-char listing cap |
| `disable-model-invocation` (DMI) | bool | false | `true` = user-only via `/name`; its description is not in context. Also blocks scheduled-task firing and preload via an agent's `skills:` (which takes at most 32 names): a DMI SK listed there is skipped, debug-log warning only |
| `user-invocable` (UI-F) | bool | true | `false` = hidden from `/` menu and direct `/name` invocation disabled, Claude-only background knowledge |
| `argument-hint` | string | none | Autocomplete hint. House rule: prompt-first, `[prompt] [mode...]` — see `prompt-contract.md` |

Config matrix: `(default)` = user+Claude invocable, DESC counted in listing budget. `DMI: true` =
user only, Claude never (0 budget). `UI-F: false` = Claude only, DESC still counted. `DMI: true` +
`UI-F: false` = inaccessible — never combine. Both fields `true` is the REQUIRED house setting.

## Execution Control

| Field | Type | Default | Meaning |
|---|---|---|---|
| `allowed-tools` (AT) | string \| list | none | **Pre-approval, NOT a sandbox.** Grant for the invoking turn; clears on the next user message. Other tools follow permission settings; deny/ask rules still win. Accepts space/comma string or YAML list. Never bare `Bash`/`Write`/`Edit`/`Agent` — narrowest pattern (`Bash(git status:*)`) or omit. Ignored in project/personal SKs under managed `allowManagedPermissionRulesOnly` (2.1.282+) |
| `disallowed-tools` (DT) | string \| list | none | Removes tools for the invoking turn; clears on the next user message. Cannot fully remove `EndConversation` while any other tool remains |
| `model` | string | session model | `/model` values including aliases (`opus`, `sonnet`, `haiku`, `fable` -> `claude-fable-5-1`), full IDs, or `inherit`. Inline override clears next user prompt; excluded `availableModels` values and models unsupported by auto/classifier mode keep the session model. With `context: fork`, selects the SA model; excluded values follow SA override rules |
| `effort` | enum | inherit | `low, medium, high, xhigh, max` (available levels depend on the model) — no `auto` |
| `context` | enum(`fork`) | inline | `fork` = isolated SA; the only value — anything else is ignored and the SK runs inline |
| `background` | bool | true | Fork-only, v2.1.218+. `false` = wait for the result in the invoking turn instead of backgrounding |
| `agent` | string | general-purpose | With `context: fork`: `Explore`, `Plan`, `general-purpose` or a discoverable custom agent — roster and caveats in `execution-model.md` Agent field |
| `hooks` | object | none | Registered on invocation and retained for the session; `if:` conditions supported. See Hooks below |

## Additional supported fields

| Field | Type | Default | Meaning |
|---|---|---|---|
| `arguments` | string \| list | none | Declares named args -> enables `$name` substitution in the body, in addition to `$0`/`$1`/`$ARGUMENTS`. **Available upstream, NOT required by house convention** — the house prompt-contract keeps one free-form `[prompt]` string (`argument-hint` position 1); use `arguments:` only where a genuinely named, structured arg earns its own slot |
| `paths` | string \| list | none | Glob(s) limiting automatic activation to matching files; comma string or YAML list, same format as path-specific rules |
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
| `content_version`, `generated_by`, `last_updated`, `doc_type`, `surface_files` | Stamps written by release tooling and generator skills — do not hand-edit, do not invent new ones |

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

Same format as settings hooks. CC registers a SK's hooks when invoked and keeps them running for
the REST OF THE SESSION, including turns after the SK's own. `once: true` removes the hook after
its first SUCCESSFUL run (a failed, exit-2 or timed-out run leaves it registered) — honored only
in SK frontmatter; ignored in settings.json and in agent frontmatter.

`PostToolUse` runs AFTER the tool, so it cannot prevent the call — but
`decision: "block"` still adds a `reason` next to the tool result, and `updatedToolOutput` replaces
what Claude sees.

> Plugin-wide behavior -> plugin `hooks.json`, not SK hooks.

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
| Body >500 lines | Upstream recommendation ("Keep `SKILL.md` under 500 lines"), not a load limit: move detail to `references/` |
| Invented FM key (`cli:` outside the house rule above, `version:` without the outside-dir rule, `updated:`) | Use a supported key or `metadata:` — claude.ai packaging hard-fails on the rest |
| Bare `Bash`/`Write`/`Edit`/`Agent` in `allowed-tools` "to restrict" | `AT` only pre-approves, never restricts; narrowest Bash pattern or omit; restrict via `disallowed-tools` |
| `argument-hint` starts with a mode token | Prompt is always position 1: `[prompt] [mode1\|mode2]`, never `<mode1\|mode2>` alone |
| `skill.md` (lowercase) | Must be `SKILL.md` (uppercase) — lowercase silently ignored ([#17417](https://github.com/anthropics/claude-code/issues/17417)) |
| Reserved names: folder `synced`; `anthropic-skills` or `anthropic-skills:*` | Kept for claude.ai-synced skills — won't load. The words `anthropic`/`claude` in `name` fail only claude.ai upload / Skills API |
| `context:` other than `fork` (e.g. `session`) | Ignored silently, the SK runs inline — delete the key |
| DESC over spec/listing caps | May be truncated — front-load keywords, cut filler |
| `agent:` set to uninstalled `developer`/`tester`/`reviewer` | These are not standard built-in task agents — verify the custom definition is discoverable before naming it |
| Bare top-level `once: true` | `once` is a suboption of a hook entry (`hooks.<Event>[].hooks[].once`), never a sibling of `name`/`description` |
