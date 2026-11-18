# Codex CLI adapter

Internal implementation and usage notes. The adapter uses native Codex CLI hooks and its external editor; it does not patch the binary or require a plugin. Baseline: Codex CLI **0.169.0**, Node.js **24.15.0** (tested runtime), macOS/Linux.

## Launch

Run from the project directory so the Ctrl+G picker reads that project's definitions:

```sh
cd /path/to/project
node /path/to/claude-brewcode/brewmod-placeholders/codex/launch.mjs -- --no-alt-screen
```

The optional `codex-placeholders` symlink runs the same launcher. It resolves a real executable named `codex` on `PATH`; shell aliases/functions are not executables. Use `--codex /absolute/path/to/codex` if needed. Launcher options precede `--`; everything after it is forwarded unchanged.

| Home | Command |
|---|---|
| Current `CODEX_HOME`, otherwise main `~/.codex` | `codex-placeholders --` |
| Explicit main home | `codex-placeholders --home "$HOME/.codex" --` |
| Separate `codexc` home | `codex-placeholders --home "$HOME/.codex/profiles/c" --` |

`--home` selects a separate home, unlike native `--profile`, which layers a named configuration within one home. The launcher preserves other environment variables and all Codex arguments, replacing `VISUAL` only in its child process. Normal `codex`/`codexc` launches retain their existing editor.

Codex 0.169.0 invokes `VISUAL` using POSIX `shlex` splitting and appends its temporary Markdown draft as a separate final argument. The launcher quotes the absolute Node and adapter paths, including spaces/apostrophes. No shell evaluates the editor command.

## Context hook

The picker alone does not attach context. Before enabling `submit.mjs`, inspect the effective `UserPromptSubmit` handlers in `/hooks` for each home and project you use. In Desktop, inspect **Settings > Hooks**. Look for Brewtools `manager-prompt.mjs` in plugin registrations and manually added hook entries. An enabled and trusted legacy handler consumes `+++`, `++m`, `++a`, `++r`, and `++rr` and does not honor the adapter's escape markers.

- **Migrate `++`.** Disable or remove only the legacy `manager-prompt.mjs` handler before enabling the adapter. This also removes the legacy full Manager context that ran on prompts without legacy codewords when `hard: true` was set in `.codex/brewtools/manager/state.json` under the hook's working directory. Preserve unrelated hooks and existing manager files.
- **Keep legacy behavior.** Keep `manager-prompt.mjs` on `++` and give the adapter a separate prefix such as `!!`. Set `BREWMOD_PLACEHOLDERS_PREFIX='!!'` in the environment that reaches both the editor and the submit hook. Before enabling the adapter, check all five legacy codewords and every complete token in each project's effective adapter registry against both matchers, including custom names. The token `!!++m` with prefix `!!++` still triggers legacy `++m`, and `!!+++` with prefix `!!` and custom name `+++` triggers legacy `+++`. Choose a different prefix, rename overlapping custom names, or migrate by disabling only the legacy handler. The legacy hard-mode fallback still runs without legacy codewords, including prompts using only the adapter prefix. Adapter escapes suppress only adapter context.

Register the adapter as a native `UserPromptSubmit` command hook in **each home used**. Generate a standalone declaration:

```sh
node /path/to/claude-brewcode/brewmod-placeholders/codex/launch.mjs --print-hook-json
```

If `$CODEX_HOME/hooks.json` is absent, save that output there (`~/.codex/hooks.json` for main; `~/.codex/profiles/c/hooks.json` for `codexc`). If it exists, merge the generated matcher group into its `hooks.UserPromptSubmit` array and preserve unrelated groups. Do not redirect over an existing file. `--print-hook` prints the TOML equivalent for manual integration into that home's `config.toml`. Use one registration route and verify one effective handler per complete codeword.

The generated hook sets `additionalContextLimit: 0` to avoid Codex spilling the assembled context to disk. The shared assembler retains its own size cap. Review and enable the declaration through native `/hooks` in the intended home; in Desktop use **Review hooks** in the composer or **Settings > Hooks**. Trust is a separate Codex decision. The launcher does not grant trust or bypass it. Restart/reload as required by Codex, then verify the hook is listed and enabled. Changes to the hook command or source can require another review.

This standalone hook also applies to ordinary `codex`/`codexc` launches and a desktop session using the same home/engine, subject to native hook support and trust. The custom picker applies only to CLI sessions launched with the adapter's `VISUAL`.

## Editor workflow

Type a draft in Codex, then press **Ctrl+G**. In the external editor, type `++` or a partial token to filter the registry; use Up/Down to choose, Tab to insert, and read the preview before saving. Enter inserts a newline. Ctrl+S saves and returns to the Codex composer; Esc/Ctrl+C cancels without changing the draft. Sending remains a separate action in Codex. Alt+Up/Down moves the caret vertically when the picker is active. Ctrl+R reloads definitions; the editor also checks for changes every second.

Press **F2** to open the full selected token's text (or the token at the caret). In this read-only preview, Up/Down scroll, Page Up/Page Down move by a page, and Home/End jump to the beginning/end. F2 or Esc closes the preview without changing the draft.

The main CLI composer and native desktop composer do **not** gain live placeholder typeahead, a preview band, or a custom dropdown. The picker exists inside Ctrl+G's external editor.

| Definition | Behavior |
|---|---|
| `insert: context` (default) | Token stays visible; submit hook adds assembled `additionalContext` for that turn. |
| `insert: inline` | Editor expands the body on save; inspect the resulting draft before sending. Direct typing in the main composer does not expand inline tokens. |
| `<name>.plan.md` | Added to context only when the submit event reports `permission_mode: "plan"`. The editor shows the normal body and a conditional Plan extension because Ctrl+G receives no session mode. |

The submit hook uses the event's actual `cwd`, including a later session directory change. The external editor inherits the process's initial working directory: native `-C`/`--cd` and later `/cd` are not passed to it. Start with shell `cd` before launch and relaunch after switching projects; the picker header shows its resolved root. Do not rely on the draft's temporary location to infer a project.

`++rr` takes precedence over `++r`; escape markers and boundary matching use the shared registry rules. Unknown tokens attach no context. `+++` supplies an anti-drift instruction; any requested scheduling depends on the selected model/session actually having the necessary tools. Loading the text cannot create unavailable tools.

## Shared files and lifecycle

Both implementations read the same Markdown sources in precedence order: bundled defaults, global legacy overrides, global definitions, project legacy overrides, project definitions. Global definitions live at `${BREWMOD_PLACEHOLDERS_CLAUDE_CONFIG_DIR:-~/.claude}/placeholders`; project definitions live at `.claude/placeholders` under the Git worktree root (or current directory outside Git). Existing legacy layers are retained, not migrated or duplicated. Project symlink paths/files are skipped by the adapter.

Set `BREWMOD_PLACEHOLDERS_PREFIX` to override the default `++` prefix; invalid values fall back to the shared default. `BREWMOD_PLACEHOLDERS_CLAUDE_CONFIG_DIR` changes the shared global definition root, independently of `CODEX_HOME`. Definitions reload at each editor launch/submission, so both Codex homes see edits immediately.

To disable the picker, launch ordinary `codex`/`codexc`. To disable context, disable only this declaration in `/hooks`; to remove it, remove only its matcher group (or its standalone file if it contains nothing else). Remove the optional launcher symlink separately. No definition files or authentication files need changing. Updating the adapter keeps shared Markdown files in place; regenerate/review the declaration if executable paths change.

Implementation: `bridge.mjs` loads and scans the shared registry, `submit.mjs` handles the native JSON stdin/stdout hook contract, `editor.mjs` edits Codex's temporary draft, and `launch.mjs` selects the editor and executable. Submit failures return empty output without blocking submission; verify a known context token after setup rather than assuming registration proves execution.

Source contracts: [pinned external editor](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/tui/src/external_editor.rs), [pinned configuration schema](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/core/config.schema.json), [native hooks documentation](https://learn.chatgpt.com/docs/hooks).
