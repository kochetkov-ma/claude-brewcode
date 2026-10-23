# Frontmatter Field Reference

Complete supported SKILL.md frontmatter set, 20 fields (live [skills docs](https://code.claude.com/docs/en/skills),
verified CC 2.1.309). Anything else -> the supported
`metadata:` map, which CC accepts but ignores. An invented key (`cli:` outside the
house convention below, `updated:`) is not a feature — CC ignores it silently and claude.ai upload /
Skills API / `package_skill.py` hard-fail on it (allowed set
there is only `name, description, license, compatibility, metadata, allowed-tools`).

| Parsing rule | Detail |
|---|---|
| Opening `---` | Read only when it is line 1; otherwise the whole file, markers included, is skill content |
| Bad YAML | SK still loads with NO fields set (`/name` works, description matching dies) |
| Booleans | `yes/no/on/off/1/0`, any case, besides `true/false` (2.1.218+). House: always `true`/`false` |
| Field names | Exact, hyphenated (except `when_to_use`); an unknown key is ignored, no error |
| `.claude/commands/*.md` | Same fields except `name` and `paths` (legacy format) |

## Core

| Field | Type | Default | Meaning |
|---|---|---|---|
| `name` | string | dir name | Slash-command id. <=64 chars, lowercase/numbers/hyphens (spec: no leading/trailing hyphen, no `--`), **BARE, == dir name (brewcode house rule)**, enforced by `validate-skill.sh`. A `<plg>:` prefix is a defect by convention only: CC prepends the plugin name itself and, on >= 2.1.246, does not double a prefix already written (`name: brewcode:e2e` renders `/brewcode:e2e`). One spelling per skill keeps `name` == dir checkable — do not relax the validator. CC refuses (2.1.299+) hidden, direction-changing or blank-like chars, `<`/`>`, >256 chars: refused FM `name` -> ignored, SK loads under the dir name; refused folder/file name -> not loaded (plugin `skills/` folder: chars become hyphens). Find: `claude --debug`, search `[names]` |
| `description` | string | first non-empty body line | What + when + 3-5 distinct triggers, no filler. Upload/spec cap **1024** chars; in the skill listing sent to the model each entry is cut at **1536** chars, `description` + `when_to_use` COMBINED (`skillListingMaxDescChars`); brewcode default target <=400 chars. ALWAYS quote it — an unquoted `: ` or ` #` breaks strict YAML parsers (claude.ai upload, Skills API; CC 2.1.309 tolerates `: `); `--` mid-text is valid; `validate-skill.sh` warns |

> **Command name.** Personal/project SK: `name` sets the command (unless another command already
> uses it) and the DIR name invokes it too; a SK is found by `name` even when the folder differs
> (2.1.290+). PLG SK: `name` sets only the last segment, the plugin prefix stays. Upstream permits
> `name` != dir; brewcode does NOT.

| Discovery / loading (docs 2.1.309) | Rule |
|---|---|
| Project | `.claude/skills/` in cwd and every parent up to the repo root; `/cd` adds the new dir's (2.1.246+). Worktree: stops at the worktree root; none there -> main checkout's skills (2.1.277+) |
| Nested `<subdir>/.claude/skills/` | Lazy: loads on the first Read/Edit of a file in `<subdir>` (`/add-dir <subdir>` loads it sooner, 2.1.257+). Name clash -> both stay: `/deploy` = root, `/apps/web:deploy` = nested |
| `--add-dir` / `/add-dir` / SDK `additionalDirectories` | Loads that dir's `.claude/skills/`; `permissions.additionalDirectories` loads none. Clash -> local wins, the added one runs as `/<folder>:<name>` (2.1.309+); two added dirs: first added wins |
| Same name | Enterprise > personal > project; your SK replaces a bundled SK (and, in a local terminal, a built-in command) but not its aliases; SK beats a `.claude/commands/` file; plugin SKs are namespaced, both load |
| Folder rules | A skill folder may be a symlink (shared target loads once). Reserved names: Common mistakes below. Folder holding `.claude-plugin/plugin.json` = plugin `<name>@skills-dir` (project: needs trust) |
| Session limits | Personal/project SKs are absent from Cowork/cloud sessions and cloud scheduled tasks ("skill not found"): use a plugin or a claude.ai-enabled SK there |
| Managed `strictPluginOnlyCustomization` skills lock | Personal, project, `--add-dir`, synced SKs and commands stop loading; bundled, managed-dir and (non skills-directory) plugin SKs load (settings-reference#strictpluginonlycustomization-skills) |
| Plugin SKs | `<plugin>/skills/<n>/SKILL.md`; manifest `skills` paths ADD to the default scan (`"."` = root, 2.1.221+). Single root `SKILL.md` (no `skills/` dir, no `skills` key): set `name`, else a marketplace install names it after its cache dir. Plugin-root `CLAUDE.md` is NOT loaded. Monitor can start on first run: `"when": "on-skill-invoke:<skill>"` |

## Invocation Control

| Field | Type | Default | Meaning |
|---|---|---|---|
| `when_to_use` | string | none | Extra activation guidance appended to `description`; counts toward the same 1536-char listing cap |
| `disable-model-invocation` (DMI) | bool | false | `true` = user-only via `/name`; its description is not in context. Also blocks a session-scoped scheduled task firing it and preload via an agent's `skills:` (at most 32 names): a DMI SK can't be preloaded (docs); a missing/disabled entry is skipped with a debug-log warning. A Claude attempt is blocked with an instruction not to reproduce the steps another way (expect "run `/name` yourself") |
| `user-invocable` (UI-F) | bool | true | `false` = hidden from `/` menu and direct `/name` invocation disabled, Claude-only background knowledge |
| `argument-hint` | string | none | Autocomplete hint. House rule: prompt-first, `[prompt] [mode...]` — see `prompt-contract.md` |

Config matrix: `(default)` = user+Claude invocable, DESC counted in listing budget. `DMI: true` =
user only, Claude never on its own initiative (a user-typed mid-message `/name` permits it; 0 budget). `UI-F: false` = Claude only, DESC still counted. `DMI: true` +
`UI-F: false` = inaccessible — never combine. Both fields `true` is the REQUIRED house setting.

## Execution Control

| Field | Type | Default | Meaning |
|---|---|---|---|
| `allowed-tools` (AT) | string \| list | none | **Pre-approval, NOT a sandbox.** Grant for the invoking turn; clears on the next user message. Other tools follow permission settings; deny/ask rules still win. Accepts space/comma string or YAML list. Scoped (`Bash(git status *)`) when calls are a fixed set; bare `Bash`/`Write`/`Edit` only in a `disable-model-invocation: true` SK with open-ended shell/write paths (`execution-model.md` Rules). NOT gated by workspace trust (applies in a `-p` run in an untrusted folder). Ignored under managed `allowManagedPermissionRulesOnly` (2.1.282+) for: repo `.claude/`, `~/.claude/skills`+`commands` (incl. synced), `--add-dir`, skills-dir plugins, Desktop `@inline` plugins (2.1.305+); managed + bundled SKs keep it; marketplace/npm plugin SKs lose it too unless the source is official or vouched by managed settings (changelog 2.1.284; docs silent); `/status` lists the ignored ones. Lost under a plugin-only hooks lock: Hooks Policy row |
| `disallowed-tools` (DT) | string \| list | none | Removes tools for the invoking turn; clears on the next user message. Cannot fully remove `EndConversation` while any other tool remains. Still applies under `allowManagedPermissionRulesOnly` |
| `model` | string | session model | `/model` values including aliases (`opus`, `sonnet`, `haiku`, `fable` -> `claude-fable-5-1`; Fable 5 in Claude apps gateway sessions, `ANTHROPIC_DEFAULT_FABLE_MODEL` overrides), full IDs, or `inherit`. Inline override clears next user prompt; excluded `availableModels` values and models unsupported by auto/classifier mode keep the session model. With `context: fork`, selects the SA model; excluded values follow SA override rules |
| `effort` | enum | inherit | `low, medium, high, xhigh, max` (available levels depend on the model) — no `auto`. Overrides the session level, NOT `CLAUDE_CODE_EFFORT_LEVEL`; `maxEffortLevel`/org cap still limit it |
| `context` | enum(`fork`) | inline | `fork` = isolated SA, the only documented value (docs state no behavior for others) |
| `background` | bool | true | Fork-only, v2.1.218+. `false` = wait for the result in the invoking turn instead of backgrounding |
| `agent` | string | general-purpose | With `context: fork`: `Explore`, `Plan`, `general-purpose` or a discoverable custom agent — roster and caveats in `execution-model.md` Agent field |
| `hooks` | object | none | Registered on invocation and retained for the session; `if:` runs only on tool events (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied`), else the hook never runs. See Hooks below |

## Additional supported fields

| Field | Type | Default | Meaning |
|---|---|---|---|
| `arguments` | string \| list | none | Declares named args -> enables `$name` substitution in the body, in addition to `$0`/`$1`/`$ARGUMENTS`. **Available upstream, NOT required by house convention** — the house prompt-contract keeps one free-form `[prompt]` string (`argument-hint` position 1); use `arguments:` only where a genuinely named, structured arg earns its own slot. Space string or YAML list, mapped by position; only the first 64 names, each <=64 chars, are filled (2.1.301+) |
| `paths` | string \| list | none | Glob(s) limiting automatic activation to matching files; comma string or YAML list, same format as path-specific rules. Relative to cwd; files outside cwd never match (e.g. a sibling worktree added via `/add-dir`) |
| `shell` | enum | bash | Shell used to run `` !`command` `` dynamic-CTX blocks (bash/powershell). `powershell` acts only with the PowerShell tool on (macOS/Linux/WSL: `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`); `shell: bash` with no bash fails the invocation |
| `metadata` | map | none | Free-form key/value block for registries/third-party tooling; CC itself ignores it. A non-map value is dropped; never reuse FM field names (`paths`) as keys |
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
          command: "bash"
          args: ["${CLAUDE_PLUGIN_ROOT}/skills/my-skill/scripts/validate.sh"]   # project skill: "${CLAUDE_PROJECT_DIR}/.claude/skills/my-skill/scripts/validate.sh"
          once: true   # suboption of a HOOK ENTRY — never a top-level sibling of name/description
```

Same format as settings hooks (handler types/fields: `hooks-types-config.md`, events/matchers: `hooks-events.md`, exit codes/output: `hooks-io-contract.md`, all in `${CLAUDE_PLUGIN_ROOT}/skills/agents/references/`). CC registers a SK's hooks when invoked and keeps them for the REST
OF THE SESSION, including turns after the SK's own. `once: true` removes the hook after its first
SUCCESSFUL run (a failed, exit-2 or timed-out run leaves it registered) — honored only in SK
frontmatter; ignored in settings.json and in agent frontmatter. Path: `hooks.<Event>[].hooks[].once`.

| Rule | Detail | Source |
|---|---|---|
| Lifetime | Outlives the skill: stays registered for the rest of the session, also on turns after the skill's own. Declare only must-always behavior; a one-shot needs `once: true`. `/hooks` lists them only after the invoke | docs verified 2.1.309 (hooks#hooks-in-skills-and-agents; hooks-guide#hook-not-firing) |
| Events | Same format; docs list no per-event restriction, events before the invoke (SessionStart, Setup, InstructionsLoaded) cannot fire; a skill's own `UserPromptSubmit` first runs on the prompt AFTER the invoking one (2.1.299) | docs verified; changelog 2.1.299 |
| Typed `/name` | Every `UserPromptSubmit` hook runs BEFORE a SK expands (2.1.299+): it gets the typed line, not the body; a block also stops the SK's `!` commands. `PreToolUse` on `Skill` sees only Claude's calls; a typed `/name` fires `UserPromptExpansion` (`command_name`, `command_args`, `command_source`) | changelog 2.1.299; hooks#userpromptexpansion |
| Trust | Project-skill frontmatter hooks follow the settings-file workspace-trust rule; registered on invoke, also in `-p` in an untrusted folder. Plugin-skill trust: not stated | docs verified |
| Ask label | A hook returning `ask` shows `[skill]` (settings and agent FM: `[settings]`, plugin: `[plugin:<name>]`); label added 2.1.301 | docs verified |
| Caps | One source (project, personal folder, each plugin): <=1,024 hooks and <=16,384 matcher chars per session (2.1.304+); a matcher counts once per hook under it. The SK that crosses a cap registers NONE of its hooks (debug log: `registers none of its hooks`) | hooks#limits-on-skill-hooks |
| Paths | CSD is NOT available in a hook command (docs list it only for skill markdown + `allowed-tools`; empty env too; probe 2.1.306). Skill hooks behave like plugin `hooks.json`: exec form (`args` set) substitutes the braced `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PROJECT_DIR}`/`${CLAUDE_PLUGIN_DATA}` into `command` and each arg; shell form gets them as exported env (`"${CLAUDE_PLUGIN_ROOT}/x.sh"` or `"$CLAUDE_PLUGIN_ROOT/x.sh"`, double-quoted; single quotes stay literal, as in plugin `hooks.json`). Prefer exec form for any path token. Relative `./scripts/x.sh` runs from the session cwd, not the skill dir | probe 2.1.306 (CSD), probe 2.1.309 (exec/shell-form substitution, relative path dead) |
| Policy | Managed `strictPluginOnlyCustomization` locking `hooks`: only plugin (not skills-directory), bundled and managed-dir SKs keep FM hooks. A personal/project SK that declares `hooks` also loses `allowed-tools` in the main conversation (2.1.304+); run via `context: fork` it keeps the pre-approval; a SK without `hooks` keeps it. Fix: move the SK into a plugin | settings-reference#strictpluginonlycustomization-hooks; changelog 2.1.304 |
| Same-handler | Identical handler in two skills stays separate; a skill's `once` hook no longer removes another skill's identical hook (2.1.304) | changelog |

> Probe 2.1.306 (throwaway plugin skill `hooks.PreToolUse[Bash]`, `claude -p --permission-mode bypassPermissions`): CSD literal stayed, env empty; `${CLAUDE_PLUGIN_ROOT}` single-quoted stayed literal (shell-quote effect, same as plugin `hooks.json`), `"$CLAUDE_PLUGIN_ROOT"` held the plugin dir. Exec-form substitution: probe 2.1.309 (`args` got plugin root and project dir, `${CLAUDE_SKILL_DIR}` stayed literal). Re-probe on CC upgrade.

`PostToolUse` runs AFTER the tool, so it cannot prevent the call — but
`decision: "block"` still adds a `reason` next to the tool result, and `updatedToolOutput` replaces
what Claude sees.

> Plugin-wide behavior -> plugin `hooks.json`, not SK hooks.

## SKILL.md skeleton

Minimal CC skeleton; house skills also need `user-invocable`/`disable-model-invocation: true`, prompt-first `argument-hint`, `## Prompt contract` first (`prompt-contract.md`), last key `license: MIT`.

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
| Body >500 lines | Upstream recommendation ("Keep `SKILL.md` under 500 lines"), not a load limit: move detail to `references/` |
| Invented FM key (`cli:` outside the house rule above, `version:` without the outside-dir rule, `updated:`) | Use a supported key or `metadata:` — claude.ai packaging hard-fails on the rest |
| Tools listed in `allowed-tools` "to restrict" | `AT` only pre-approves, never restricts; restrict via `disallowed-tools` |
| `argument-hint` starts with a mode token | Prompt is always position 1: `[prompt] [mode1\|mode2]`, never `<mode1\|mode2>` alone |
| `skill.md` (lowercase) | Must be `SKILL.md` (uppercase) — lowercase silently ignored ([#17417](https://github.com/anthropics/claude-code/issues/17417)) |
| Reserved names: folder `synced`; `anthropic-skills` or `anthropic-skills:*` | Kept for claude.ai-synced skills — won't load (`anthropic-skills*`: refused with a startup notice since 2.1.282). The words `anthropic`/`claude` in `name` fail only claude.ai upload / Skills API |
| Model-invocable non-plugin SK named `verify`/`simplify` | Claude runs it before every commit (2.1.286+); pick another name |
| `agent:` set to uninstalled `developer`/`tester`/`reviewer` | These are not standard built-in task agents — verify the custom definition is discoverable before naming it |