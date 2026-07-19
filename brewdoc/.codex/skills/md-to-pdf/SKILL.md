---
name: md-to-pdf
description: "Convert Markdown to PDF via reportlab or weasyprint engines. Triggers - pdf, md to pdf, markdown to pdf, generate pdf."
---

# Markdown to PDF

Convert a local Markdown file with `scripts/md_to_pdf.py`. Check dependencies with `scripts/check_deps.sh`, choose a bundled style from `styles/`, and write only to the requested output path. Store project preferences in `.codex/md-to-pdf.config.json` only after confirmation. Render and inspect the result before reporting completion.

## Complete native workflow

Follow every phase below. When a phase delegates work, use Codex collaboration with only `task_name` and `message`; treat each "Codex delegation brief" block as role and message content, not executable syntax. Use `request_user_input` for the documented user gates. Resolve `<skill-directory>`, `<plugin-root>`, `<project-root>`, and `<arguments>` before running commands.


# MD to PDF

Converts Markdown files to professional PDF using one of two rendering engines.

## Step 0: Parse Arguments

Parse `<arguments>` to determine mode and components.

| Component | Required | Description |
|-----------|:--------:|-------------|
| `md_file` | per mode | Path to `.md` file |
| `--engine` | No | `reportlab` or `weasyprint` (overrides saved config) |
| `custom_prompt` | No | Last argument in double quotes = LLM preprocessing instructions |

**Mode detection rules:**

| Condition | Mode |
|-----------|------|
| Empty or `help` | HELP |
| `styles` or `config` | STYLES |
| `test` | TEST |
| Path to `.md` file + quoted string at end | CONVERT+PROMPT |
| Path to `.md` file (no quoted string) | CONVERT |

Extract `--engine <name>` from anywhere in arguments if present. Remove it before further parsing.

## Step 1: Dependency Check

Determine the target engine (from `--engine` flag, saved config, or default `reportlab`).

**EXECUTE** using shell:
```bash
bash "<skill-directory>/scripts/check_deps.sh" check ENGINE_NAME 2>&1; echo "EXIT_CODE=$?"
```
Replace `ENGINE_NAME` with the target engine.

**If output contains `MISSING_PIP` or `MISSING_SYSTEM`:**

Use `request_user_input` presenting the engine comparison table:

| Feature | reportlab | weasyprint |
|---------|-----------|------------|
| Install | pip only | pip + brew |
| Quality | Good | Excellent |
| Speed | Fast | Moderate |
| Images | Basic | Full |
| CSS Styling | No | Yes |
| Code highlight | No | Yes (Pygments) |

Options:
- "Install ENGINE_NAME dependencies"
- "Switch to OTHER_ENGINE" (if the other engine is available)
- "Cancel"

If user chooses install, **EXECUTE** using shell:
```bash
bash "<skill-directory>/scripts/check_deps.sh" install ENGINE_NAME 2>&1 && echo "---INSTALL_OK---" || echo "---INSTALL_FAILED---"
```

> **STOP if INSTALL_FAILED** -- report error and exit.

If user cancels -- STOP.

## Step 2: Engine Selection (first run only)

Check for saved config in order:
1. Project: `.codex/md-to-pdf.config.json`
2. Global: `~/.codex/md-to-pdf.config.json`

If `--engine` flag was provided -- use it (skip config lookup).

If no saved preference and no `--engine` flag -- use `request_user_input` with the engine comparison table from Step 1. Save the choice:

```json
{
  "engine": "reportlab",
  "pygments_theme": "github"
}
```

Write to project config `.codex/md-to-pdf.config.json` (create `.codex/` dir if needed).

## Step 3: Mode Execution

### HELP Mode

Print formatted usage:

```
MD to PDF Converter

Usage:
  $brewdoc:md-to-pdf <file.md>                     Convert with saved engine/style
  $brewdoc:md-to-pdf <file.md> --engine weasyprint  Convert with specific engine
  $brewdoc:md-to-pdf <file.md> "remove section X"   Preprocess MD then convert
  $brewdoc:md-to-pdf styles                          Configure page/color/font
  $brewdoc:md-to-pdf test                            Convert bundled test file
  $brewdoc:md-to-pdf help                            Show this help

Engines:
  reportlab    -- Pure Python, fast, no system deps (python3 -m pip install reportlab==4.4.10)
  weasyprint   -- HTML/CSS pipeline, best quality (pip + brew deps)
```

EXIT after printing.

### CONVERT Mode

1. Read the input MD file with filesystem reader. If not found -- STOP with error.
2. Determine output path: same directory, same name, `.pdf` extension.
3. Build the config path argument (if project or global config exists, add `--config CONFIG_PATH`).

**EXECUTE** using shell:
```bash
python3 "<skill-directory>/scripts/md_to_pdf.py" "INPUT_PATH" "OUTPUT_PATH" --engine ENGINE --quiet 2>&1 && echo "---CONVERT_OK---" || echo "---CONVERT_FAILED---"
```
Replace `INPUT_PATH`, `OUTPUT_PATH`, `ENGINE` with actual values. Add `--config CONFIG_PATH` if a style config JSON exists. Add `--pygments-theme THEME` for weasyprint if configured.

> **STOP if CONVERT_FAILED** -- read error output, attempt fix, retry once. If still failing -- report error.

4. Parse structured output lines: `STATUS`, `OUTPUT`, `PAGES`, `SIZE`, `ENGINE`.

### CONVERT+PROMPT Mode

1. Read the input MD file with filesystem reader.
2. Apply LLM transformations per the `custom_prompt` instructions (delete sections, rewrite headings, restructure, etc.).
3. Write modified content to temp file: `{original_dir}/.tmp_{original_name}.md`
4. Run the converter on the temp file (same command as CONVERT mode, using temp file as input, original name for output).
5. Delete the temp file.

**EXECUTE** using shell:
```bash
rm -f "TEMP_FILE_PATH"
```

6. Proceed to Step 4 with `preprocessing: true`.

### STYLES Mode

Run interactive configuration via `request_user_input` dialogs:

**Question 1 -- Page size:**
Options: `A4` (default), `Letter`, `Legal`

**Question 2 -- Color scheme:**
Options: `Default blue` (primary #1a3a5c), `Dark` (primary #2d3748), `Custom` (ask for hex values)

**Question 3 -- Code theme (weasyprint only):**
Options: `github` (default), `monokai`, `friendly`, `solarized-dark`, `solarized-light`

**Question 4 -- Footer format:**
Options: `Page {page} of {total}` (default), `{page}/{total}`, `Disabled`

Build JSON config matching `styles/default.json` structure, overriding changed values. Write to `.codex/md-to-pdf.config.json`.

Report saved settings table and EXIT.

### TEST Mode

1. Use bundled test file at `<skill-directory>/test/test-all-elements.md` as INPUT_PATH.
2. Determine output path: `/tmp/md-to-pdf-test-ENGINE.pdf`
3. Run converter (same command as CONVERT mode, using test file as input, `/tmp/` output).
4. Proceed to Step 4.

## Step 4: Report Results

| Parameter | Value |
|-----------|-------|
| Source | absolute path to input MD |
| Output | absolute path to output PDF |
| Pages | from `PAGES=` in script output |
| Size | from `SIZE=` in script output |
| Engine | `reportlab` or `weasyprint` |
| Preprocessing | custom_prompt summary (if used) or `none` |

