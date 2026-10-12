# MD to PDF

Converts Markdown files to professional PDF documents. Supports two rendering engines: **reportlab** (lightweight, pure Python) and **weasyprint** (full HTML/CSS pipeline with syntax highlighting).

## Quick Start

```
$brewdoc:md-to-pdf docs/report.md
```

Converts `docs/report.md` to `docs/report.pdf` using your saved engine preference (or prompts you to choose one on first run).

## Modes

| Mode | Example | What it does |
|------|---------|--------------|
| Convert | `$brewdoc:md-to-pdf README.md --engine weasyprint` | Converts the Markdown file to PDF; `--engine` overrides the saved engine |
| Convert+Prompt | `$brewdoc:md-to-pdf docs/api.md "Remove the Changelog section and make all headings one level smaller"` | Applies LLM preprocessing to a temporary copy, then converts; the source file is never modified |
| Styles | `$brewdoc:md-to-pdf styles` | Asks for page size (A4, Letter, Legal), color scheme, code theme and footer format |
| Test | `$brewdoc:md-to-pdf test` | Converts a bundled test file to `/tmp/` to verify the setup works |
| Help | `$brewdoc:md-to-pdf` or `help` | Prints usage reference |

## Engines

| Feature | reportlab | weasyprint |
|---------|-----------|------------|
| Install | `check_deps.sh install reportlab` | `check_deps.sh install weasyprint` (pip + `brew` system deps) |
| Quality | Good | Excellent |
| Speed | Fast | Moderate |
| Images | Basic | Full |
| CSS Styling | No | Yes |
| Code Highlighting | No | Yes (Pygments) |

**Default:** `reportlab`. The first conversion asks for an engine and saves it to `.codex/md-to-pdf.config.json`; `styles` saves to the same file, and each save keeps the other's settings. Start with `reportlab` for speed and zero system dependencies; switch to `weasyprint` for highlighted code, CSS styling or high-fidelity images.

## Common Mistakes

**Non-existent file:**
```
$brewdoc:md-to-pdf missing-file.md
```
The skill reads the file first and stops with an error if it does not exist. Verify the path before invoking.

**Forgetting quotes around the preprocessing prompt:**
```
$brewdoc:md-to-pdf doc.md remove the changelog
```
The preprocessing prompt must be the last argument wrapped in double quotes: `"remove the changelog"`.

## Output

The PDF is written to the same directory as the input file, with the same name and a `.pdf` extension. In test mode, output goes to `/tmp/md-to-pdf-test-<engine>.pdf`.

After conversion, a result report is printed:

| Field | Description |
|-------|-------------|
| Source | Absolute path to the input Markdown file |
| Output | Absolute path to the generated PDF |
| Pages | Total page count |
| Size | File size of the PDF |
| Engine | Which engine was used (`reportlab` or `weasyprint`) |
| Preprocessing | Summary of the prompt applied, or `none` |

## Documentation

Full docs: [md-to-pdf](https://doc-claude.brewcode.app/brewdoc/skills/md-to-pdf/)
