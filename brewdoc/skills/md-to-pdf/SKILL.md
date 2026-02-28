---
name: brewdoc:md-to-pdf
description: Converts Markdown to professional PDF. Two engines - reportlab (lightweight) or weasyprint (full CSS). Style customization, test mode, dependency management. Triggers - pdf, md to pdf, markdown to pdf, convert pdf, generate pdf.
argument-hint: "<file.md> [--engine name] [\"prompt\"] | styles | test | (no args = help)"
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
model: sonnet
---

# MD to PDF

Converts Markdown files to professional PDF using one of two rendering engines.

## Step 0: Parse Arguments

Parse `$ARGUMENTS` to determine mode and components.

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

Resolve script paths using `$BD_PLUGIN_ROOT`:
- `$BD_PLUGIN_ROOT/skills/md-to-pdf/scripts/check_deps.sh`
- `$BD_PLUGIN_ROOT/skills/md-to-pdf/scripts/md_to_pdf.py`

Determine the target engine (from `--engine` flag, saved config, or default `reportlab`).

**EXECUTE** using Bash tool:
```bash
bash "$BD_PLUGIN_ROOT/skills/md-to-pdf/scripts/check_deps.sh" check ENGINE_NAME 2>&1; echo "EXIT_CODE=$?"
```
Replace `ENGINE_NAME` with the target engine.

**If output contains `MISSING_PIP` or `MISSING_SYSTEM`:**

Use `AskUserQuestion` presenting the engine comparison table:

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

If user chooses install, **EXECUTE** using Bash tool:
```bash
bash "$BD_PLUGIN_ROOT/skills/md-to-pdf/scripts/check_deps.sh" install ENGINE_NAME 2>&1 && echo "---INSTALL_OK---" || echo "---INSTALL_FAILED---"
```

> **STOP if INSTALL_FAILED** -- report error and exit.

If user cancels -- STOP.

## Step 2: Engine Selection (first run only)

Check for saved config in order:
1. Project: `.claude/md-to-pdf.config.json`
2. Global: `~/.claude/md-to-pdf.config.json`

If `--engine` flag was provided -- use it (skip config lookup).

If no saved preference and no `--engine` flag -- use `AskUserQuestion` with the engine comparison table from Step 1. Save the choice:

```json
{
  "engine": "reportlab",
  "pygments_theme": "github"
}
```

Write to project config `.claude/md-to-pdf.config.json` (create `.claude/` dir if needed).

## Step 3: Mode Execution

### HELP Mode

Print formatted usage:

```
MD to PDF Converter

Usage:
  /brewdoc:md-to-pdf <file.md>                     Convert with saved engine/style
  /brewdoc:md-to-pdf <file.md> --engine weasyprint  Convert with specific engine
  /brewdoc:md-to-pdf <file.md> "remove section X"   Preprocess MD then convert
  /brewdoc:md-to-pdf styles                          Configure page/color/font
  /brewdoc:md-to-pdf test                            Convert bundled test file
  /brewdoc:md-to-pdf help                            Show this help

Engines:
  reportlab    -- Pure Python, fast, no system deps (pip install reportlab)
  weasyprint   -- HTML/CSS pipeline, best quality (pip + brew deps)
```

EXIT after printing.

### CONVERT Mode

1. Read the input MD file with Read tool. If not found -- STOP with error.
2. Determine output path: same directory, same name, `.pdf` extension.
3. Build the config path argument (if project or global config exists, add `--config CONFIG_PATH`).

**EXECUTE** using Bash tool:
```bash
python3 "$BD_PLUGIN_ROOT/skills/md-to-pdf/scripts/md_to_pdf.py" "INPUT_PATH" "OUTPUT_PATH" --engine ENGINE --quiet 2>&1 && echo "---CONVERT_OK---" || echo "---CONVERT_FAILED---"
```
Replace `INPUT_PATH`, `OUTPUT_PATH`, `ENGINE` with actual values. Add `--config CONFIG_PATH` if a style config JSON exists. Add `--pygments-theme THEME` for weasyprint if configured.

> **STOP if CONVERT_FAILED** -- read error output, attempt fix, retry once. If still failing -- report error.

4. Parse structured output lines: `STATUS`, `OUTPUT`, `PAGES`, `SIZE`, `ENGINE`.

### CONVERT+PROMPT Mode

1. Read the input MD file with Read tool.
2. Apply LLM transformations per the `custom_prompt` instructions (delete sections, rewrite headings, restructure, etc.).
3. Write modified content to temp file: `{original_dir}/.tmp_{original_name}.md`
4. Run the converter on the temp file (same command as CONVERT mode, using temp file as input, original name for output).
5. Delete the temp file.

**EXECUTE** using Bash tool:
```bash
rm -f "TEMP_FILE_PATH"
```

6. Proceed to Step 4 with `preprocessing: true`.

### STYLES Mode

Run interactive configuration via `AskUserQuestion` dialogs:

**Question 1 -- Page size:**
Options: `A4` (default), `Letter`, `Legal`

**Question 2 -- Color scheme:**
Options: `Default blue` (primary #1a3a5c), `Dark` (primary #2d3748), `Custom` (ask for hex values)

**Question 3 -- Code theme (weasyprint only):**
Options: `github` (default), `monokai`, `friendly`, `solarized-dark`, `solarized-light`

**Question 4 -- Footer format:**
Options: `Page {page} of {total}` (default), `{page}/{total}`, `Disabled`

Build JSON config matching `styles/default.json` structure, overriding changed values. Write to `.claude/md-to-pdf.config.json`.

Report saved settings table and EXIT.

### TEST Mode

1. Use bundled test file: `$BD_PLUGIN_ROOT/skills/md-to-pdf/test/test-all-elements.md`
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
