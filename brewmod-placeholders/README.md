<p align="center">
  <img src="../assets/brewmods/placeholders.gif" width="800" alt="Claude Code terminal. Typing ++ opens a list of placeholders; the Up arrow selects ++r and Tab inserts it. Moving the caret onto ++r shows its full review text above the prompt, and Enter sends the prompt; Claude reviews a one-line README fix. Then /placeholders global add ++db: always use the staging DB asks one question, Save as drafted, and saves to ~/.claude/placeholders/db.md. Typing ++ again, one Up arrow selects the new ++db; with ++r and ++m added, three rows show, and ctrl+x, tab, enter opens their text."><br><sub>Real Claude Code 2.1.301 screens, sped up where the title bar shows ⏩. Type <code>++</code>, pick <code>++r</code> with <code>↑</code> and <code>⇥</code>; the caret on it shows its full text, <code>⏎</code> sends. <code>/placeholders global add ++db: …</code> saves your own after one question. With three tokens, <code>ctrl+x → tab → enter</code> (one key after another) shows the text of every block.</sub>
</p>
<h1 align="center">Prompt placeholders</h1>
<p align="center">Prompt shortcuts for Claude Code: type <code>++r</code> to attach a saved instruction block, read its text before you send, add your own with <code>/placeholders</code>.</p>
<p align="center">
  <a href="https://github.com/kochetkov-ma/claude-brewcode/stargazers"><img src="https://img.shields.io/github/stars/kochetkov-ma/claude-brewcode?style=flat&logo=github" alt="GitHub stars"></a>
  <img src="https://img.shields.io/badge/Claude_Code-2.1.292%2B-d97706" alt="Requires Claude Code 2.1.292+">
  <img src="https://img.shields.io/badge/type-mod-8b5cf6" alt="Claude Code mod">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT">
</p>

> [!IMPORTANT]
> **`++m` `++a` `++r` `++rr` `+++` do nothing?** Since [brewtools v6.8.0](https://github.com/kochetkov-ma/claude-brewcode/releases/tag/v6.8.0) these prompt-injection codewords live in this mod, `brewmod-placeholders`, not in brewtools. It is easier to use and lets you add your own placeholders. Install it (Claude Code 2.1.292+), then run `/reload-plugins`:
>
> ```bash
> claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode && claude plugin install brewmod-placeholders@claude-brewcode
> ```
>
> Docs: https://doc-claude.brewcode.app/mods/placeholders/

## Install
```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode && claude plugin install brewmod-placeholders@claude-brewcode
```
Then run `/reload-plugins`. Works on Team organizations.

<details>
<summary>Update, dev mode, requirements</summary>

Update: `claude plugin marketplace update claude-brewcode && claude plugin update brewmod-placeholders@claude-brewcode`. Dev mode, no install: `claude --plugin-dir ./brewmod-placeholders`. Claude Code **2.1.292+** and `node` on the `PATH` (the bundled command hook runs as plain Node). Builds 2.1.287 to 2.1.291 refuse to load the mod; earlier ones lack the `prompt.autocomplete` event. Adding, changing or removing a placeholder through Claude, and Enter on `++r?`, need Claude Code **2.1.300+**; older builds print `needs Claude Code 2.1.300+ for the dialog`. Mods use the hooks module API, which is early access.

</details>

## Quick start
| Want | Do |
|---|---|
| Add a block | `++r check the diff`, then Enter. The block is sent as hidden context; your prompt stays as typed |
| Read a token's text while typing | Put the caret on it (arrows, Home, End) or type `++r?`. The band shows up to 15 rows of it; with the menu capping the view, type `?` after the token for more. `/placeholders show ++m` prints the whole text. Move the caret off to return to the compact band |
| See exactly what will be sent | A `Show text` button appears with 1-2 tokens only when the opened band has more rows than the preview, and with 3+ tokens (at least one with a body) always: `ctrl+x → tab → enter`, one key after another; `Esc` takes you back ([keys](#keys-on-macos)). With no button that sequence is not available and Enter sends the prompt |
| Print texts in the chat | `/placeholders show ++r ++m`, or `/placeholders show me ++m and ++r`; `/placeholders list` prints all. Or type `++r?` alone and press Enter twice. Full help: `/placeholders help`, or `/placeholders` plus a question in your own words |
| Make your own | `/placeholders add ++ship: …`. With no scope word the one dialog also asks `Where` (Global recommended, or Project); start with `global` or `project` to skip that question |

## What Claude receives
```text
you type      ++r check the diff
Claude reads  ++r check the diff                     <- your prompt, unchanged
            + hidden context (not shown in the transcript, not even with ctrl+o):
              User typed `++r` — Two-phase review discipline is active for this turn:
              [REVIEW DISCIPLINE: DOUBLE-CHECK]
              Every significant change: multi-agent review ... (9 lines)
```

| Token | Normal mode | Plan mode |
|---|---|---|
| `++m` | `Manager mode is active`: `[ROLE: MANAGER]`, delegate, never code (27 lines) | `Manager + Plan Mode is active`: the same text **+ `[ADDON: PLAN MODE]`**: stay read-only; the plan opens with the role and the full task graph, plus a deferred anti-drift cron (57 lines) |
| `++a` | `Architecture-first`: delegate the design to expert agents before implementing | same text: `++a` has no plan part |
| `++r` | `[REVIEW DISCIPLINE: DOUBLE-CHECK]`: review, reproduce, fix confirmed findings only (9 lines) | same text: `++r` has no plan part |
| `++rr` | `Anti-regression review`: regression, project standard and functional correctness axes | same text: `++rr` has no plan part |
| `+++` | nothing | `[ADDON: ANTI-DRIFT CRON PLAN]` |
| `++rr` + `++r` | only `++rr` is sent (one review per message) | same |

<details><summary><code>++r</code> text as sent</summary>

```text
User typed `++r` — Two-phase review discipline is active for this turn:

[REVIEW DISCIPLINE: DOUBLE-CHECK]
Every significant change: multi-agent review (matching reviewer expert, else
general-purpose), simplification pass first.
1) Review - finding = defect with path:line + evidence (failing command/input).
2) Double-check - reproduce each finding.
3) Fix - confirmed findings only.
Big review -> split by area, never one long pass. Brief each: goal + area +
acceptance, what's covered (don't re-litigate), who consumes the verdict;
return verdict first, then findings.
```
</details>
<details><summary><code>++m</code> text as sent, normal and plan mode</summary>

```text
User typed `++m` — Manager mode is active for this turn:

[ROLE: MANAGER]

Manage; never code/build/test/hand-debug: the main context is for orchestration.

Protocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph
before any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else
parallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;
completed only when truly done; failure -> follow-up task + re-delegate. 5) all
code written -> final task: simplify, strip over-engineering.
No Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph
in the plan or .claude/features/<task>.md.

Sizing: one subagent = 1 deliverable, ~<=5 files, ~<=10 steps, ~<=20 min;
larger -> split. An hour-long agent = drift nobody can observe.
Scan all agents: best-matching expert per task, else general-purpose.

Spawn brief: six labeled fields. A subagent starts with an empty context, so a bare one-line task is never enough.
GOAL: task + why it exists - without the why it cannot rank the work.
ROLE: what it owns, must not touch - else two agents edit one file.
SCOPE: paths/commands in bounds and out - else the task widens.
CONTEXT: done, by whom, in parallel; only what this agent needs - else work is redone or overwritten.
CONSUMER: who or what uses the result next + the shape it must fit - else a correct result fails the next step.
DONE: acceptance, what counts as a finding, return (verdict first; evidence: command, result, unchecked; bounded; long output to a file it can write, path returned) - else it stops early or returns a dump.
Code/test briefs add: follow the closest well-built repo counterpart's
principles - additive to conventions/rules/docs, never instead.

Finish the whole job; decide without routine questions.
```

Plan mode: the first line becomes ``User typed `++m` — Manager + Plan Mode is active for this turn:``; the normal text stays, then a blank line and this addition:

```text
[ADDON: PLAN MODE]

Stay read-only: no code, board/task-state writes, installation, configuration,
or cron creation. Read-only expert exploration is allowed.

Include in the plan (English, token economy):
- PREAMBLE: [ROLE: MANAGER] + the 5-step protocol restated verbatim as the
  plan's opening section - this addon expires, so the plan carries the role
  into implementation, no hook needed.
- STEP 0, stated literally: "Re-assume the MANAGER role. Call TaskList; if no
  graph exists, create the ENTIRE TaskGraph now - TaskCreate for every node, or
  the numbered checklist if task tools are absent - then delegate." On exit
  this comes first: not code, not one task.
- The full TaskGraph: every task decomposed (subject, acceptance, owner
  agent, bounded scope+acceptance per spawn), dependencies marked, parallel
  branches explicit, critical path named.

Include the task-board execution step: announce and create one unique session
anti-drift cron per top-level task, hourly unless the user chooses another tick;
during execution record its task-specific methodology/prompt, timezone, ID,
tick count and stop rule. Scheduling unavailable -> explicit gap, never a
claimed schedule. Each tick: reread methodology/anti-drift rules, collect agent
updates, reconcile status/dependencies/goal, keep all unfinished + latest 10
completed graph entries, preserve older evidence outside the active graph.
The tick report is `HH:MM TZ · tick N · elapsed`, then only the nonempty rows:
🟢 completed, 🔵 active/remaining/next, 🔴 problems/blockers/questions,
⚪ anti-drift verdict. Completion/cancellation -> stop and verify cron removal.

Deliver the embedded role + graph + deferred cron step, not implementation code.
```

</details>

Your own placeholder can have a plan part too: see [Examples](#examples).

## Keys on macOS
| Hint on screen | Mac key | Glyph | Does |
|---|---|---|---|
| `ctrl+x` | Control + X (Control, not Command) | ⌃X | First key of the band sequence (only while the `Show text` button exists): `ctrl+x → tab → enter` is one key after another, never together (Control+X, release, Tab within 3 s, then Return); cancels after 3 s |
| `tab` | Tab | ⇥ | Inserts the selected typeahead name. Within 3 s after `ctrl+x`, it focuses the band button instead |
| `enter` | Return | ⏎ | Sends the prompt. On the focused band button it switches `Show text`/`Hide text` and sends nothing |
| `esc` | Esc | ⎋ | Closes the typeahead; leaves the band, back to typing |
| `↑` `↓` `←` `→` | arrow keys | ↑↓←→ | Move in the typeahead (↑↓) or onto a token to read its text (←→) |
| `shift+tab` | Shift + Tab | ⇧⇥ | Default mode (`⏸ manual mode on`): twice, accept edits then plan; or type `/plan`. The band shows `plan mode adds:` only after your first prompt in plan mode. The effort toast comes from the other mod, [brewmod-plan-effort](../brewmod-plan-effort/) |
| `ctrl+o` | Control + O | ⌃O | Transcript view: your prompt and the answer only. The injected text is NOT there; use the band or `/placeholders show` |

## Examples
| Do | You type | What happens |
|---|---|---|
| Add | `/placeholders add ++db: always use the staging DB` | Claude drafts it and asks once: `Save ++db as drafted?` with `Save as drafted (Recommended)` or `Change it` (the question never names a layer; scope words count only outside the placeholder's own text); with no scope word, the same dialog also asks `Where to save ++db?` with `Global (Recommended)` or `Project`; starting with `global` or `project` skips it. Reply: `saved ++db (global): ~/.claude/placeholders/db.md` |
| Add with a plan part | `/placeholders add ++ship: run the tests; in plan mode also list the release steps` | The same dialog adds `Add this plan-mode part to ++ship?` (`Add it (Recommended)` or `No plan part`). Saved as `ship.md` (`run the tests`) and `ship.plan.md` (`also list the release steps`, `plan: add`) |
| Change | `/placeholders make ++r shorter` | Claude starts from the current text; the change stays in its layer (a plugin default -> asks where) |
| Remove | `/placeholders remove ++db` | Asks once: `Remove it (Recommended)` or `Keep it`; if the name is in both layers, it also asks where. Removing your override of a built-in brings the built-in back; plugin defaults are never removed (`++r is built in and cannot be removed`). Reply: `removed ++db (global): ~/.claude/placeholders/db.md · ++db is no longer defined` |
| Remove a plan part | `/placeholders remove the plan part of ++ship` | Asks `Remove the plan-mode part of ++ship (global)?`, then deletes `ship.plan.md`; `++ship` keeps its normal text |
| Show | `/placeholders show ++r ++m`, or `++r?` alone + Enter | Prints the exact text with no Claude turn: outside plan mode `normal:` then `plan mode adds:`; in plan mode one block `normal + plan mode part:` as sent. An inline placeholder that does not expand shows `stays as typed`; an empty body silences the token, in plan mode too. With `++r?`, the first Enter sends nothing and fills `/placeholders show ++r`; the second Enter prints it |
| List | `/placeholders list` | Prints every placeholder with its text as sent, normal and plan mode, with no Claude turn |
| Escape | `++/ what does ++r do?` | Sent exactly as typed: no block, `++/` stays in the text |
| Scope | `/placeholders project add ++lint: run npm run lint first` | Reply: `saved ++lint (project): .claude/placeholders/lint.md`; the project copy wins over global |

## Commands
| Command | What it does |
|---------|--------------|
| `/placeholders` (also `status`) | One row per name with layer and tags (`plan +`, `plan only`), plus hints for reading texts, escape and scope |
| `/placeholders show ++<name> ...`, `list`, `help` | Print the exact text sent (`list` = all, normal and plan), or the full help, with no Claude turn |
| `/placeholders <anything else>` | Claude answers, or drafts, asks once and saves; any language. A first word `global` or `project` picks the layer; without it your words decide, else one question (Global first) |

## Prompt box
| State | What you see |
|-------|--------------|
| Highlight, typeahead | Terminal UI only. A known token is underlined; after the prefix, matching names appear, `Tab` inserts one. The one option, `prefix` (default `++`, 2-8 punctuation characters), is set in `/config` |
| Compact band | `placeholders 3 [ Show text  ctrl+x → tab → enter ]` (the button shows with 3+ tokens, at least one with a body, or with 1-2 tokens when the opened band has more rows than the preview), then one row per token, then `more: put the caret on ++r · send as typed: ++/ · /placeholders help`. `plan +` marks a name with a plan part; a skipped token says why, for example `(not sent: ++rr wins)` |
| Caret on a token, or `++r?` | Up to 15 rows of that token's text; `move the caret off ++r to close`. A cut ends with `... +K lines · type ? after ++r for more` (menu capping the view) or `... +K lines · /placeholders show ++r`; other tokens sit on one `also: ++m ++a` row |
| Expanded | `Show text` opened (offered as in the compact band row): exactly what is sent. In plan mode, `plan mode adds:` then the addition. Outside it: `+ plan-mode part, N lines · sent in plan mode` |
| Escaped, unknown | `++/` in the message: `placeholders off: this message is sent exactly as typed`, every token `(not sent: ++/ in this message)`. An unknown `++zz` shows `unknown placeholder` in a warning colour; on submit a toast names it and the prompt is sent unchanged |

## Your own files
| File | Means |
|---|---|
| `<name>.md` in `~/.claude/placeholders/` (global) or `.claude/placeholders/` (project, wins) | The text; the file name is the token name; front matter is optional |
| `<name>.plan.md` with `plan: add` (front matter `when: plan`, `plan: add`) | Appended to `<name>.md` in plan mode only. Example: `ship.md` = `run the tests`, `ship.plan.md` = `also list the release steps` |
| `<name>.plan.md` without `plan: add` | Replaces the text in plan mode. A `<name>.md` with `when: plan` alone is plan-only, like `+++` |

Layers, highest wins file by file: project > its brewtools override > global > its brewtools override > plugin defaults. Keys and verification tables: [definition files](https://doc-claude.brewcode.app/mods/placeholders/#definition-files), [verified](https://doc-claude.brewcode.app/mods/placeholders/#verified).

<details>
<summary>Technical details</summary>

- **With brewtools.** brewtools 6.8.0+ ships no codeword hook, so this mod is the only provider of `++m`, `++a`, `++r`, `++rr` and `+++`. brewtools 6.7.x also injects them, so each block appears twice: use 6.8.0+. Override files under `.claude/brewtools/manager/prompts/` and `<config>/manager/prompts/` are read through the `legacy` key, whatever the brewtools version.
- **Mod tools.** Free-text `/placeholders` requests hand off to Claude with `list_placeholders`, `save_placeholder`, `remove_placeholder` and `placeholders_help`. Saving refuses symlinks; removing never touches plugin defaults or legacy brewtools files.
- **Team and Enterprise organizations.** The builtin security layer bypasses a mod's `classic.*` hooks, so a bundled command hook (`hooks/inject.mjs`) adds the blocks. Verified on Team-org and Max profiles; Enterprise was not run.
- **Limitations.** The band learns plan mode only from your first prompt in it. A token inserted with `Tab` or a recalled history entry shows no highlight or band until the next keystroke. Drafts over 20,000 characters get no highlight and no band; expansion on submit still works. If plugin files are deleted under a running session (for example by a plugin update), the band and one toast say `plugin files removed (updated?) · run /reload-plugins`; tokens are not marked unknown and inline placeholders keep expanding. Context blocks return after `/reload-plugins`. [Full technical details](https://doc-claude.brewcode.app/mods/placeholders/#technical-details)

</details>

[Docs](https://doc-claude.brewcode.app/mods/placeholders/) | [Project page](https://brewcode.app/mods/placeholders/) | [Source](https://github.com/kochetkov-ma/claude-brewcode/tree/main/brewmod-placeholders) | [All mods](../README.md#claude-code-mods) | [Release notes](../RELEASE-NOTES.md) | Author: Maksim Kochetkov | License: MIT
