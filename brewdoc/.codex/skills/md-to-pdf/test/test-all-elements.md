# Markdown-to-PDF Converter Test File

This document exercises every Markdown element to verify correct PDF rendering.

---

## 1. Headers

# Header Level 1 — Primary Title

## Header Level 2 — Section Title

### Header Level 3 — Subsection

#### Header Level 4 — Sub-subsection

##### Header Level 5 — Minor Heading

###### Header Level 6 — Smallest Heading

---

## 2. Text Formatting

This paragraph contains **bold text**, *italic text*, ***bold italic text***, ~~strikethrough text~~, and `inline code`.

Normal text resumes here to verify that formatting terminates correctly.

---

## 3. Links and Images

- External link: [OpenAI](https://openai.com)
- Internal anchor: [Jump to Headers](#1-headers)
- Auto-linked URL: https://example.com

![Placeholder Image](https://via.placeholder.com/300x100)

---

## 4. Lists

### Unordered List

- First unordered item
- Second unordered item
- Third unordered item

### Ordered List

1. First ordered item
2. Second ordered item
3. Third ordered item

### Nested List (3 Levels)

- Level 1 — Item A
  - Level 2 — Item A.1
    - Level 3 — Item A.1.a
    - Level 3 — Item A.1.b
  - Level 2 — Item A.2
- Level 1 — Item B
  1. Level 2 — Ordered B.1
  2. Level 2 — Ordered B.2
     - Level 3 — Mixed B.2.a

### sub-agent task Lists

- [x] Completed task
- [x] Another completed task
- [ ] Pending task
- [ ] Another pending task

---

## 5. Tables

### Simple Table

| Name       | Role           | Status   |
|------------|----------------|----------|
| Alice      | Developer      | Active   |
| Bob        | Designer       | On Leave |
| Charlie    | Project Lead   | Active   |
| Diana      | QA Engineer    | Active   |

### Wide Table (6+ Columns)

| ID  | Name    | Department | Location    | Start Date | Salary   | Rating |
|-----|---------|------------|-------------|------------|----------|--------|
| 001 | Alice   | Engineering| New York    | 2022-01-15 | $120,000 | A      |
| 002 | Bob     | Design     | San Francisco| 2021-06-01 | $110,000 | B+     |
| 003 | Charlie | Management | London      | 2020-03-20 | $140,000 | A+     |
| 004 | Diana   | QA         | Berlin      | 2023-09-10 | $95,000  | A      |

### Table with Formatting

| Feature        | Syntax              | Supported |
|----------------|---------------------|-----------|
| **Bold**       | `**text**`          | Yes       |
| *Italic*       | `*text*`            | Yes       |
| `Inline Code`  | `` `code` ``       | Yes       |
| ~~Strikethrough~~ | `~~text~~`       | Yes       |

---

## 6. Code Blocks

### Python

```python
from pathlib import Path
from typing import Optional

def read_config(path: str) -> Optional[dict]:
    config_file = Path(path)
    if not config_file.exists():
        return None
    with config_file.open("r", encoding="utf-8") as f:
        return json.load(f)
```

### JavaScript

```javascript
async function fetchUsers(apiUrl) {
  const response = await fetch(apiUrl, {
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}
```

### Bash

```bash
#!/usr/bin/env bash
set -euo pipefail

INPUT_DIR="${1:-.}"
OUTPUT_DIR="${2:-./output}"

mkdir -p "$OUTPUT_DIR"
for file in "$INPUT_DIR"/*.md; do
  echo "Converting: $(basename "$file")"
  pandoc "$file" -o "$OUTPUT_DIR/$(basename "${file%.md}.pdf")"
done
```

### SQL

```sql
SELECT
    u.id,
    u.username,
    COUNT(o.id) AS order_count,
    COALESCE(SUM(o.total), 0) AS total_spent
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.created_at >= '2025-01-01'
GROUP BY u.id, u.username
HAVING COUNT(o.id) > 0
ORDER BY total_spent DESC
```

### JSON

```json
{
  "name": "markdown-converter",
  "version": "2.0.0",
  "dependencies": {
    "puppeteer": "^22.0.0",
    "marked": "^12.0.0",
    "highlight.js": "^11.9.0"
  },
  "scripts": {
    "convert": "node src/convert.js"
  }
}
```

### Go

```go
package main

import (
	"fmt"
	"os"
	"path/filepath"
)

func listMarkdownFiles(dir string) ([]string, error) {
	matches, err := filepath.Glob(filepath.Join(dir, "*.md"))
	if err != nil {
		return nil, fmt.Errorf("glob failed: %w", err)
	}
	return matches, nil
}
```

### YAML

```yaml
converter:
  input_format: markdown
  output_format: pdf
  options:
    page_size: A4
    margin:
      top: 20mm
      bottom: 20mm
      left: 15mm
      right: 15mm
    font_family: "Noto Sans"
    syntax_highlighting: true
```

---

## 7. Blockquotes

### Simple Blockquote

> This is a simple blockquote. It should render with a left border and subtle background.

### Nested Blockquote

> This is the outer blockquote.
>
> > This is a nested inner blockquote. It should be visually indented further.

### Blockquote with Formatting

> **Important:** This blockquote contains **bold text**, `inline code`, and a link to [example.com](https://example.com).
>
> It also spans multiple lines to test paragraph handling within quotes.

---

***

___

## 8. Horizontal Rules

The three horizontal rules above use `---`, `***`, and `___` respectively. They should all render identically.

---

## 9. Footnotes

Markdown-to-PDF conversion requires careful handling of layout[^1] and typography[^2].

[^1]: Layout includes margins, page breaks, headers, and footers.
[^2]: Typography covers font selection, line height, letter spacing, and ligatures.

---

## 10. Definition Lists

Term 1 — Markdown
:   A lightweight markup language for creating formatted text using a plain-text editor.

Term 2 — PDF
:   Portable Document Format, a file format developed by Adobe for presenting documents independent of software or hardware.

---

## 11. Multilingual Text

### English

The Markdown-to-PDF converter must handle a variety of text encodings and scripts. Proper font fallback is essential for rendering characters outside the Latin alphabet. This section verifies that each language displays correctly in the generated PDF. Missing glyphs indicate a font configuration issue.

### Russian

Кириллический текст для проверки отображения шрифтов. Поддержка различных языков является важной функцией конвертера. Каждый символ должен корректно отображаться в итоговом PDF-документе. Проверка переносов строк и интервалов также необходима.

### Chinese

中文测试文本。这是一个用于测试PDF转换器多语言支持的段落。正确的字体回退机制对于渲染非拉丁字母字符至关重要。每个字符都应在生成的PDF中正确显示。

### Japanese

日本語テスト。PDFコンバーターのテストです。フォントフォールバックが正しく機能することを確認します。各文字が正しくレンダリングされる必要があります。

---

## 12. Long Paragraph for Line Wrapping

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. This sentence follows the Latin filler to verify that mixed content and long continuous paragraphs wrap correctly at page boundaries without clipping or overlapping adjacent elements.

---

## 13. Special Characters

### Arrows

Left arrow: <- Right arrow: -> Bidirectional: <-> Double right: =>

### Math Symbols

Less than or equal: <=  Greater than or equal: >=  Not equal: !=  Plus-minus: +/-  Multiplication: x

### Unicode Symbols and Arrows

Arrows: → ← ↔ ↑ ↓ ⇒ ⇐ ⇔

Math: ≤ ≥ ≠ ± × ÷ ∞ ∑ ∏ √ ∂ ∫

Check/Cross: ✓ ✗ ✔ ✘

Stars: ★ ☆ ✦ ✧

Miscellaneous: ◆ ◇ ● ○ ■ □ ▲ △

### Emoji

Documents: 📄 📝 📋 📂

Tools: 🔧 🔨 ⚙️ 🛠️

Status: ✅ ❌ ⚠️ ℹ️

Other: 🚀 💡 🎯 🔍

---

*End of test file.*
