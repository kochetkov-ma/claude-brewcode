---
name: md-to-pdf
description: "Convert Markdown to PDF via reportlab or weasyprint engines. Triggers - pdf, md to pdf, markdown to pdf, generate pdf."
---

# Markdown to PDF

Convert a local Markdown file with `scripts/md_to_pdf.py`. Check dependencies with `scripts/check_deps.sh`, choose a bundled style from `styles/`, and write only to the requested output path. Store project preferences in `.codex/md-to-pdf.config.json` only after confirmation. Render and inspect the result before reporting completion.

## Complete native workflow

Follow every phase below. When a phase delegates work, use Codex collaboration with only `task_name` and `message`; treat each "Codex delegation brief" block as role and message content, not executable syntax. Use `request_user_input` for the documented user gates. Resolve `<skill-directory>`, `<plugin-root>`, `<project-root>`, and `<arguments>` before running commands.

<!-- brewcode-meta: version=6.1.2 content_version=6.0.0 generated_by=brewdoc:md-to-pdf -->

# MD to PDF

Converts Markdown files to professional PDF using one of two rendering engines.

## Prompt contract

Position 1 of `<arguments>` is a **free-form prompt** (RU/EN) — the file path, `--engine` flag, `styles`/`test`
tokens and the quoted LLM-preprocessing prompt are all optional and may follow in any order. Nobody types keys:
resolve mode + file FROM the prompt.

1. Strip `--engine <name>`. A literal mode token (`styles`, `config`, `test`, `help`) anywhere wins outright.
2. Else score modes by distinct whole-word keyword hits (table below). Highest unique score wins.
3. Empty arguments -> `help` (documented default). Read-only — asks nothing.
4. **Prose resolution (mandatory):** `<arguments>` may be a full sentence, not just tokens. Extract `md_file` from
   any path-shaped token or a filename explicitly named in prose (e.g. "convert my notes.md to pdf" ->
   `md_file = notes.md`, resolved against cwd). If the sentence implies CONVERT but no file is resolvable -> ONE
   `request_user_input` for the file path. Never guess a file and never silently fall through to HELP.
5. Outcome-changing ambiguity (missing engine deps, no saved engine preference) -> ONE `request_user_input`.

Then print this block ONCE, before Step 1:

```
PLAN — brewdoc:md-to-pdf
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default | prose-resolved file: path>
SCOPE:  <md_file | engine | style question, as applicable>
DO:     <2-5 imperative bullets>
RESULT: <PDF path, or the help/styles/test output>
```

Labels are literal; values follow the conversation language.

## Step 0: Parse Arguments

Parse `<arguments>` to determine mode and components.

| Component | Required | Description |
|-----------|:--------:|-------------|
| `md_file` | per mode | Path to `.md` file — literal token or extracted from prose (rule 4 above) |
| `--engine` | No | `reportlab` or `weasyprint` (overrides saved config) |
| `custom_prompt` | No | Last argument in double quotes = LLM preprocessing instructions |

**Mode detection rules:**

| Mode | Condition | EN keywords | RU keywords | Mutates? |
|------|-----------|-------------|-------------|----------|
| HELP | Empty or `help` | *(empty)*, help | помощь | no |
| STYLES | `styles` or `config` | styles, config, configure, page size, color scheme | стили, настрой стиль, конфиг | yes |
| TEST | `test` | test, sample, demo, bundled test file | тест, пример, демо | no (writes only to `/tmp/`) |
| CONVERT+PROMPT | Path to `.md` file + quoted string at end | convert with instructions, pdf and rewrite/strip section | сконвертируй с изменениями | yes |
| CONVERT | Path to `.md` file (no quoted string) | convert, pdf, generate pdf, turn into pdf, `.md` file named in prose | конвертируй, сделай pdf, преврати в pdf | yes |

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

If no saved preference and no `--engine` flag -- use `request_user_input` with the engine comparison table from Step 1. Save the choice to project config `.codex/md-to-pdf.config.json`:

```json
{
  "engine": "reportlab",
  "pygments_theme": "github",
  "version": "{PLUGIN_VERSION}",
  "content_version": "{CONTENT_VERSION}",
  "generated_by": "brewdoc:md-to-pdf",
  "last_updated": "{LAST_UPDATED}"
}
```

The four provenance keys are mandatory on every write of this file and are RESOLVED, never hardcoded.

**EXECUTE** using shell (replace `ENGINE_VALUE` and `THEME_VALUE` with the chosen values):
```bash
ROOT="${CODEX_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")}"
PJ="<skill-directory>/../../.codex-plugin/plugin.json"
PV=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('version',''))" "$PJ" 2>/dev/null || true)
[ -n "$PV" ] || { echo "❌ cannot read version from $PJ -- reinstall brewdoc"; exit 1; }
SKILL_MD="<skill-directory>/SKILL.md"
CV=$(python3 -c "
import re,sys
for line in open(sys.argv[1]):
    if 'brewcode-meta:' in line:
        m = re.search(r'content_version=(\d+\.\d+\.\d+)', line)
        if m:
            print(m.group(1))
        break
" "$SKILL_MD" 2>/dev/null || true)
[ -n "$CV" ] || { echo "❌ cannot read content_version from $SKILL_MD -- reinstall brewdoc"; exit 1; }
mkdir -p "$ROOT/.claude"
printf '{\n  "engine": "ENGINE_VALUE",\n  "pygments_theme": "THEME_VALUE",\n  "version": "%s",\n  "content_version": "%s",\n  "generated_by": "brewdoc:md-to-pdf",\n  "last_updated": "%s"\n}\n' "$PV" "$CV" "$(date +%F)" > "$ROOT/.codex/md-to-pdf.config.json" \
  && python3 -c "import json,sys;json.load(open(sys.argv[1]))" "$ROOT/.codex/md-to-pdf.config.json" \
  && echo "✅ config written (version $PV, content_version $CV)" || { echo "❌ config invalid JSON"; exit 1; }
```

> **STOP if ❌** -- fix before continuing.

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
  reportlab    -- Pure Python, fast, no system deps (check_deps.sh install reportlab)
  weasyprint   -- HTML/CSS pipeline, best quality (pip + brew deps)
```

EXIT after printing.

### CONVERT Mode

1. Read the input MD file with filesystem reader. If not found -- STOP with error.
2. Determine output path: same directory, same name, `.pdf` extension.
3. Build the config path argument (if project or global config exists, add `--config CONFIG_PATH`).

**EXECUTE** using shell:
```bash
python3 "<skill-directory>/scripts/md_to_pdf.py" "INPUT_PATH" "OUTPUT_PATH" --engine ENGINE 2>&1 && echo "---CONVERT_OK---" || echo "---CONVERT_FAILED---"
```
Replace `INPUT_PATH`, `OUTPUT_PATH`, `ENGINE` with actual values. Add `--config CONFIG_PATH` if a style config JSON exists. Add `--pygments-theme THEME` for weasyprint if configured.

> **STOP if CONVERT_FAILED** -- read error output, attempt fix, retry once. If still failing -- report error.

4. Parse structured output lines: `STATUS`, `OUTPUT`, `PAGES`, `SIZE`, `ENGINE`.

### CONVERT+PROMPT Mode

1. Read the input MD file with filesystem reader.
2. Apply LLM transformations per the `custom_prompt` instructions (delete sections, rewrite headings, restructure, etc.).
3. Write the transformed markdown, convert it and clean up in ONE Bash invocation. The temp name comes from
   `mktemp` -- never composed from the source name -- and cleanup is trapped and constrained to a `.tmp_*`
   basename, so a mis-substitution cannot name the source file.

**EXECUTE** using shell (replace `ORIGINAL_DIR`, `TRANSFORMED_MARKDOWN`, `OUTPUT_PATH`, `ENGINE`; keep every other byte):
```bash
set -euo pipefail
SRC_DIR="ORIGINAL_DIR"
TMP="$(mktemp "$SRC_DIR/.tmp_XXXXXX")"
trap 'case "${TMP##*/}" in .tmp_??????) rm -f "$TMP" ;; esac' EXIT
cat > "$TMP" <<'BREWDOC_MD_EOF'
TRANSFORMED_MARKDOWN
BREWDOC_MD_EOF
python3 "<skill-directory>/scripts/md_to_pdf.py" "$TMP" "OUTPUT_PATH" --engine ENGINE 2>&1 && echo "---CONVERT_OK---" || echo "---CONVERT_FAILED---"
```
`OUTPUT_PATH` is the ORIGINAL name with a `.pdf` extension. Add `--config` / `--pygments-theme` exactly as in CONVERT mode.

> Never write the transformed markdown with `Write`/`Edit` and never reuse a fixed `.tmp_<name>.md` path -- a
> predictable name overwrites user files and collides with a concurrent conversion of the same source.

> **STOP if CONVERT_FAILED** -- read error output, attempt fix, retry once. If still failing -- report error.

4. Parse the structured result lines, then proceed to Step 4 with `preprocessing: true`.

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

Build JSON config matching `styles/default.json` structure, overriding changed values, and Write it to a temp file (e.g. `/tmp/md-to-pdf-styles.json`). The merge below then lands it in `.codex/md-to-pdf.config.json` with the four mandatory provenance keys, carrying over any `engine` / `pygments_theme` the file already held -- this writer replaces the whole file, and dropping those would silently reset the saved engine choice.

**EXECUTE** using shell (replace `STYLE_JSON_PATH` with the temp file you wrote):
```bash
ROOT="${CODEX_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")}"
CFG="$ROOT/.codex/md-to-pdf.config.json"
NEW="STYLE_JSON_PATH"
PJ="<skill-directory>/../../.codex-plugin/plugin.json"
SKILL_MD="<skill-directory>/SKILL.md"
mkdir -p "$ROOT/.claude"
CFG="$CFG" NEW="$NEW" PJ="$PJ" SKILL_MD="$SKILL_MD" TODAY="$(date +%F)" python3 - <<'PY'
import json, os, re
cfg_p, new_p = os.environ["CFG"], os.environ["NEW"]
pv = json.load(open(os.environ["PJ"])).get("version")
if not pv:
    raise SystemExit("no version in " + os.environ["PJ"])
cv = None
for line in open(os.environ["SKILL_MD"]):
    if "brewcode-meta:" in line:
        m = re.search(r"content_version=(\d+\.\d+\.\d+)", line)
        if m:
            cv = m.group(1)
        break
if not cv:
    raise SystemExit("no content_version in " + os.environ["SKILL_MD"])
old = json.load(open(cfg_p)) if os.path.exists(cfg_p) else {}
data = json.load(open(new_p))
for k in ("engine", "pygments_theme"):
    if k in old and k not in data:
        data[k] = old[k]
data["version"] = pv
data["content_version"] = cv
data["generated_by"] = "brewdoc:md-to-pdf"
data["last_updated"] = os.environ["TODAY"]
with open(cfg_p, "w") as fh:
    json.dump(data, fh, indent=2)
    fh.write("\n")
print("OK version=%s content_version=%s engine=%s" % (pv, cv, data.get("engine", "(unset)")))
PY
[ $? -eq 0 ] && echo "✅ styles saved" || { echo "❌ styles save FAILED"; exit 1; }
rm -f "$NEW"
```

> **STOP if ❌** -- fix before continuing.

The four keys sit at the top level beside the style sections; `md_to_pdf.py`'s `load_config` deep-merges the file over `styles/default.json` and then reads only the sections it owns (`page`, `colors`, `typography`, `code`, `footer`), so extra top-level keys are inert.

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

