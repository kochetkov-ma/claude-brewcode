---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# MD to PDF

Converts Markdown files to professional PDF documents. Supports two rendering engines: **reportlab** (lightweight, pure Python) and **weasyprint** (full HTML/CSS pipeline with syntax highlighting).

## Quick Start

```
/brewdoc:md-to-pdf docs/report.md
```

Converts `docs/report.md` to `docs/report.pdf` using your saved engine preference (or prompts you to choose one on first run).

## Modes

| Mode | Trigger | What it does |
|------|---------|--------------|
| Convert | `<file.md>` | Converts the Markdown file to PDF |
| Convert+Prompt | `<file.md> "instructions"` | Applies LLM preprocessing to the Markdown content, then converts |
| Styles | `styles` | Interactive configuration for page size, colors, code theme, footer |
| Test | `test` | Converts a bundled test file to `/tmp/` to verify the setup works |
| Help | no args or `help` | Prints usage reference |

## Engines

| Feature | reportlab | weasyprint |
|---------|-----------|------------|
| Install | `pip install reportlab` | `pip` + `brew` system deps |
| Quality | Good | Excellent |
| Speed | Fast | Moderate |
| Images | Basic | Full |
| CSS Styling | No | Yes |
| Code Highlighting | No | Yes (Pygments) |

**Default:** `reportlab`. Override per-invocation with `--engine`, or save a preference via the first-run prompt (stored in `.claude/md-to-pdf.config.json`).

## Examples

### Good Usage

**Simple conversion:**
```
/brewdoc:md-to-pdf README.md
```

**Specify engine explicitly:**
```
/brewdoc:md-to-pdf README.md --engine weasyprint
```

**Preprocess before converting -- remove a section, rewrite headings, restructure:**
```
/brewdoc:md-to-pdf docs/api.md "Remove the Changelog section and make all headings one level smaller"
```

**Configure page layout and colors interactively:**
```
/brewdoc:md-to-pdf styles
```

**Verify installation with the bundled test document:**
```
/brewdoc:md-to-pdf test
```

### Common Mistakes

**Non-existent file:**
```
/brewdoc:md-to-pdf missing-file.md
```
The skill reads the file first and stops with an error if it does not exist. Verify the path before invoking.

**Using weasyprint features with reportlab:**
```
/brewdoc:md-to-pdf doc.md --engine reportlab
```
If you need CSS styling, syntax highlighting, or full image support, use `--engine weasyprint` instead. Reportlab does not support these features.

**Forgetting quotes around the preprocessing prompt:**
```
/brewdoc:md-to-pdf doc.md remove the changelog
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

## Tips

- **Choosing an engine:** Start with `reportlab` for speed and zero system dependencies. Switch to `weasyprint` when you need syntax-highlighted code blocks, CSS-based styling, or high-fidelity image rendering.
- **Style customization:** Run `/brewdoc:md-to-pdf styles` to configure page size (A4, Letter, Legal), color scheme, code theme, and footer format. Settings are saved to `.claude/md-to-pdf.config.json` and reused automatically.
- **Preprocessing use cases:** The `"prompt"` argument is useful for preparing documents before PDF generation -- strip draft sections, translate headings, flatten structure, or redact sensitive content without modifying the original file.
- **Test before sharing:** Run `/brewdoc:md-to-pdf test` after installing a new engine or changing styles to confirm everything renders correctly.
