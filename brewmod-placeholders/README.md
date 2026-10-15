<p align="center">
  <img src="../assets/brewmods/placeholders.gif" width="800" alt="Claude Code prompt box: typing ++ opens a typeahead of placeholder names, a band above the prompt previews the block a token adds, and an unknown ++q turns to a warning colour">
  <br><sub>Illustrative animation: type <code>++</code> → a typeahead lists the names → the band previews the block → an unknown <code>++q</code> warns → <code>Enter</code> sends.</sub>
</p>

<h1 align="center">Prompt placeholders</h1>

<p align="center">Type <code>++r</code>, get a whole instruction block. See it highlighted and previewed before you send.</p>

## What it does

A placeholder is a prefix plus a name, such as `++r`, that stands for a block of instructions. Type the token anywhere in your prompt and the mod adds the block as hidden context for that turn. The token stays in your prompt as you wrote it.

The default set is the codewords `++m`, `++a`, `++r`, `++rr` and `+++`, which brewtools injected before v6.8.0. This mod is now their only provider in Claude Code. Every other placeholder is a Markdown file you write yourself, in the project or in your global config. In the terminal prompt box, known tokens light up, a typo such as `++q` turns to a warning colour, and a band above the prompt shows what the draft will add.

| Typed | When | Adds |
|-------|------|------|
| `++m` | always | Manager mode: orchestrate and delegate, never code in the main context. In plan mode the variant also adds the plan addon |
| `++a` | always | Architecture-first: design is delegated to expert agents before implementing |
| `++r` | always | Two-phase review: review every significant change, then double-check each finding |
| `++rr` | always | Anti-regression review: regression, project standard and functional correctness axes |
| `+++` | Plan mode only | Anti-drift cron plan: a recurring check that the work stays on the goal |

`++r` and `++rr` share the group `review`: when both appear in a prompt, `++rr` wins. The default texts are byte-identical to brewtools v6.7.0, now a frozen spec pinned by tests and a CI check; see Verified.

## Requirements

- Claude Code **2.1.292+**. The `prompt.autocomplete` event does not exist before 2.1.292, and Claude Code 2.1.287 to 2.1.291 refuse to load the mod.
- Mods use the hooks module API, which is early access and can change between releases.
- brewtools is optional. Since brewtools 6.8.0 it ships no codeword hook; see With brewtools under How it works.

## Install

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewmod-placeholders@claude-brewcode

# Already installed? Update
claude plugin marketplace update claude-brewcode
claude plugin update brewmod-placeholders@claude-brewcode

# Dev mode (no install)
claude --plugin-dir ./brewmod-placeholders
```

Then run `/reload-plugins`.

## Your own placeholders

One Markdown file per placeholder. Create `.claude/placeholders/ship.md` in the directory where you launch Claude Code:

```markdown
---
description: "Release checklist"
header: "User typed `{token}` — release checklist is active:"
---
Before tagging: run the full test suite, update RELEASE-NOTES.md, then show me the diff.
```

Type `++ship fix the flaky login test` and the turn gets:

```text
User typed `++ship` — release checklist is active:

Before tagging: run the full test suite, update RELEASE-NOTES.md, then show me the diff.
```

The file name is the placeholder name. The next prompt picks the file up, and the typeahead shows it within a second.

### Definition files

Front matter is optional. Every key is optional too, and a file that sets only some keys inherits the other keys from the placeholder it overrides.

| Key | Values | Default | Effect |
|-----|--------|---------|--------|
| `name` | 1-32 letters, digits or `_`, or a run of ASCII punctuation (not `_`) | file name | The token name, case-insensitive |
| `description` | text | none | Shown in the typeahead and the band |
| `insert` | `context`, `inline` | `context` | `context` adds the block as hidden context and keeps the token. `inline` replaces the token in the prompt text |
| `when` | `always`, `plan`, `not-plan` | `always` | Applies the placeholder only in that permission mode |
| `order` | integer | `100` | Blocks are joined from the lowest `order` up |
| `group` | text | none | Placeholders in one group exclude each other |
| `priority` | integer | `0` | In a group, the highest `priority` wins |
| `header` | text | none | First line of the block. `{token}` becomes the prefix plus the lowercase name, for example `++ship` |
| `legacy` | text | none | Name of the brewtools override file this placeholder reads (see Layers) |

- **Body.** Without a code fence, the trimmed text after the front matter is the body. With one or more fenced blocks (`` ``` `` or `~~~`), only the fenced text is used, joined by blank lines.
- **Empty body.** An empty body suppresses the token: nothing is added, and with brewtools 6.7.x installed its own block for that token is dropped too. Front-matter keys are inherited from the layer below, the body is not, so an override that holds front matter only suppresses the token.
- **Plan variant.** `<name>.plan.md` is the plan-mode variant of `<name>`. It wins in plan mode, as `m.plan.md` does for `++m`.
- **Inline insert.** `insert: inline` works with `when: always` only, and only for prompts typed in the composer, bridge or SDK, not for slash commands. The text carries no header.
- **Limits.** Blocks are sorted by `order`, joined and capped at 9000 characters, the same cap brewtools 6.7.x applied.

### Layers

The highest layer wins, file by file.

| Layer | Location |
|-------|----------|
| Project | `<launch dir>/.claude/placeholders/<name>.md` |
| Project, brewtools override | `<launch dir>/.claude/brewtools/manager/prompts/<legacy>.md` |
| Global | `<config>/placeholders/<name>.md` |
| Global, brewtools override | `<config>/manager/prompts/<legacy>.md` |
| Plugin defaults | `placeholders/` inside the mod |

`<config>` is `CLAUDE_CONFIG_DIR`, or `~/.claude` when it is unset. The project layers come from the directory where you launched Claude Code, not from the git root: a project layer in the git root is not seen when you start in a subdirectory. The `legacy` key of each default names the brewtools override file it reads (`review-double` for `++r`, `review-regression` for `++rr`, `architect`, `full`, `planmode`, `cron-plan`).

## Commands

`/placeholders` manages definition files from inside Claude Code.

| Command | What it does |
|---------|--------------|
| `/placeholders list` | Lists every placeholder with its layer and description, plus any definition issues |
| `/placeholders show <name>` | Prints the effective text and its source layer. `show r` and `show ++r` both work, and `<name>.plan` is shown alongside |
| `/placeholders add <name> [--global] <text>` | Creates a new file. Project scope by default |
| `/placeholders edit <name> [--global]` | Copies the effective text into your own layer and prints the path to edit |
| `/placeholders rm <name> [--global]` | Removes your own file and reports which layer serves the name now |

- `--global` (or `-g`) must directly follow the name. Any other word after the name is the text for `add` and is refused for `edit` and `rm`.
- `rm` never removes plugin defaults or brewtools override files.
- `add` refuses text that holds a complete fenced block (`` ``` `` or `~~~`) or opens with a `---` line. Write that file by hand.
- Names follow the `name` rules, plus an optional `.plan` suffix. The command takes only these punctuation characters, at most 32: ``! # $ % & ' ( ) + , - ; = @ [ ] ^ ` { } ~``.

## Editing in the prompt box

Verified in the terminal UI only. VS Code and mobile have no band slot. The unknown-placeholder warning runs on the classic hook and was not tested there. The desktop app is untested.

| Feature | Behavior |
|---------|----------|
| Highlight | A known token takes `knownColor` and an underline. An unknown prefixed word takes `unknownColor` |
| Typeahead | After the prefix, a list of matching names with descriptions. Pick a row and press `Tab` to insert the token plus a space |
| Band | Above the prompt: one row per distinct token with its description and a `(plan only)` label for plan-only placeholders while the session is not in plan mode. The `Show text` / `Hide text` button, shown only when some row has a body, expands each block's text, capped to the band height |
| Warning | On submit, a toast names unknown tokens, for example `unknown ++q`. The prompt is sent unchanged |

Toggle the band from the keyboard with `ctrl+x`, then `Tab` to focus the button, then `Enter`. Hover and mouse click need fullscreen mode and are untested on this build. A cut block ends with `... +K lines`, and tokens past the band budget end with `... +K more placeholders`.

The warning skips code-like tokens: tokens inside backticks or code fences, and tokens followed by `;`, `)`, `[` or `]`, such as `++i)` and `a[++i]`. It shows only for prompts you typed.

## Configuration

Open `/config` and change the plugin options. All are optional.

| Option | Type | Default | Values | Effect |
|--------|------|---------|--------|--------|
| `prefix` | string | `++` | 2-8 ASCII punctuation characters, not `_` | Opens a placeholder. An invalid value falls back to `++` with a warning, and a leading `/` is warned because it clashes with slash commands |
| `knownColor` | string | `suggestion` | Theme keys such as `suggestion`, `success`, `claude`, `permission` | Colour of a token that has a definition |
| `unknownColor` | string | `warning` | Same theme keys, for example `warning`, `error` | Colour of a prefixed word with no definition |
| `warnUnknown` | boolean | `true` | `true`, `false` | Show the unknown-placeholder toast on submit |

## How it works

| Event or trigger | Behaviour |
|------------------|-----------|
| Token matching | The name is case-insensitive and must stand alone: `++rr` is not `++r`, and `a++r` or `i++` match nothing |
| `session.start` | Registers `/placeholders` and loads the definitions. A definition that cannot be read, has unclosed front matter or an invalid name is skipped. A toast lists the skipped files, and `/placeholders list` repeats the reasons |
| `classic.UserPromptSubmit` | Builds the blocks from the layered definitions and adds them as hidden context. Subagent deliveries are skipped. Names the unknown tokens in a toast. Reads `permission_mode` of this payload to decide which `when` variants apply |
| `prompt.submit` | Expands only `insert: inline` placeholders. A context token inside an inline body is expanded by the classic pass |
| `prompt.edit` | Scans the draft, adds the colour and underline decorations and updates the token list the band reads |
| `prompt.autocomplete` | Lists matching names. Refreshes the definitions at most once a second |
| Reading definitions | Layers are listed on each prompt that holds the prefix and re-read only when a file changes |
| Plan mode label | A mode tracker reads `permission_mode` from `classic.UserPromptSubmit` and `classic.PostToolBatch`, with `session.append` attachments as the fallback. It only drives the band's `(plan only)` label. Switching mode with `Shift+Tab` fires no event, so the label updates at the next prompt or tool batch |
| Failure | A failing hook is skipped and the chain goes on |

### With brewtools

brewtools is optional. Since brewtools 6.8.0 it ships no codeword hook, so this mod is the only provider of `++m`, `++a`, `++r`, `++rr` and `+++`. With brewtools 6.7.x installed, each token is still injected once.

- **The mod replaces brewtools' block (brewtools 6.7.x).** For every token the mod resolves, it drops brewtools' block from the same hook result and inserts its own once.
- **Overrides carry over.** Existing brewtools prompt overrides under `.claude/brewtools/manager/prompts/` and `<config>/manager/prompts/` are read through the `legacy` key (see Layers), whatever the brewtools version.
- **A mod fault leaves brewtools 6.7.x alone.** The failing hook is skipped, so brewtools still answers. On brewtools 6.8.0 or later nothing answers in its place.

## Verified

Measured during development on Claude Code 2.1.300 with brewtools 6.6.2, which still shipped the codeword hook (Haiku, one turn per case). Source: the `hook_additional_context` rows of each session transcript, counted as injections, not as text matches. Every row ran on the committed code of this release, except the queued-prompt row and the transcript check of the unknown-`++q` row, which ran on an earlier build of the same mod; the toast was seen again on the release code.

| Check | Result |
|-------|--------|
| Default `++r`, `++a ++m`, `++rr`, plan-mode `++m`, plan-mode `+++` | Each codeword injected exactly once, byte-identical to brewtools 6.6.2 alone (same SHA-256 and length) |
| `++r` and `++a ++m` with brewtools disabled | Same bytes, injected once by the mod |
| `+++` outside plan mode | Nothing injected, as in brewtools |
| Project override file and brewtools legacy override file | The mod's own file wins over the legacy file in the same layer. Both replace the default text |
| Empty `a.md` override with brewtools 6.6.2 installed | `++a` injects nothing. Brewtools 6.6.2 alone injects its block |
| Fault injected in the mod after brewtools has run | Brewtools' block stays, once |
| Queued prompt `++r` sent mid-turn | One block |
| Unknown `++q` | Toast on submit. The prompt reaches the transcript unchanged, with no block |
| Typing latency, terminal UI, mod minus control, p50 per keystroke end to end | Plain keystrokes at the end of a draft of 0 / 4,000 / 19,700 characters: -2.6 / +6.6 / +2.1 ms. Keystrokes that change a token, typed as ` ++r`: +2.4 / +6.6 / +5.6 ms. Run-to-run noise is about as large as the deltas. A 60 Hz frame is 16.7 ms |
| Band repaint after a token-changing keystroke | A second paint lands about 19 to 21 ms after the key at p50, and 44 to 61 ms at p99, at the same three draft sizes |
| Handler time per keystroke, unit-tested | p99 under 2 ms at 4,000 characters, under 8 ms at 20,000 |

Scope: not covered live are a custom `prefix`, custom colours, the global layer on disk, the 9000-character cap, `insert: inline`, `/placeholders add`, `edit` and `rm` (only `list` and `show` ran), fullscreen hover and click on this build (checked on a prototype only), the `... +K more placeholders` row, the desktop app, VS Code, subagent surfaces and other models. Unit tests cover the prefix, layers and cap.

## Limitations

- **A token inserted with Tab and a recalled history entry show no highlight or band until the next keystroke.** Redrawing sooner needs the `prompt.change` event of Claude Code 2.1.300, which the mod does not use so that it also runs on older builds. A recalled draft can show a stale band for the same reason.
- **Drafts over 20,000 characters get no highlight and no band.** Expansion on submit still works.
- **Org-managed installs may skip the classic hooks.** `claude plugin validate` warns that `classic.UserPromptSubmit` and `classic.PostToolBatch` hooks do not run in a plugin a person installs where an organization manages Claude Code. This was not tested on a managed install. If your setup skips them, context expansion and the unknown-token toast do not run. Highlight, typeahead, the band and `/placeholders` keep working.

## Documentation

Full docs: [doc-claude.brewcode.app/mods/placeholders](https://doc-claude.brewcode.app/mods/placeholders/)

- Other mod: [Plan-mode effort](../brewmod-plan-effort/)
- All brewcode mods: [README](../README.md#claude-code-mods)
- Release notes: [RELEASE-NOTES.md](../RELEASE-NOTES.md)
- History of the codewords formerly in brewtools: [Codewords (moved to mod)](https://doc-claude.brewcode.app/brewtools/prompt-injection/)
- Source: <https://github.com/kochetkov-ma/claude-brewcode/tree/main/brewmod-placeholders>

Author: Maksim Kochetkov | License: MIT
