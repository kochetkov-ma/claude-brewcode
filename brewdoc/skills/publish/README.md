---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# Publish (Brewpage)

Publish text, markdown, JSON, or files to [brewpage.app](https://brewpage.app) and get a shareable public URL instantly. No sign-up required. Content is auto-deleted after the TTL expires (default 5 days).

## Quick Start

```
/brewdoc:publish "Your content here"
```

The skill will ask for a namespace (URL slug) and optional password, then return a public URL.

## What You Can Publish

| Content Type | Example Input | API Endpoint | Notes |
|--------------|---------------|--------------|-------|
| Text / Markdown | `"# Hello World"` | `/api/html` | Rendered as HTML via `format=markdown` |
| JSON | `'{"key": "value"}'` | `/api/json` | Must start with `{` or `[` |
| File | `report.pdf` | `/api/files` | Any local file (multipart upload) |

All content types support `--ttl N` to set expiration in days.

## Examples

### Good Usage

```sh
# Publish markdown text (default 5-day TTL)
/brewdoc:publish "# Meeting Notes\n\n- Action item 1\n- Action item 2"

# Publish a local file
/brewdoc:publish /path/to/diagram.png

# Publish JSON data
/brewdoc:publish '{"users": [{"name": "Alice"}, {"name": "Bob"}]}'

# Publish with a 1-day TTL
/brewdoc:publish changelog.md --ttl 1

# Publish with a 30-day TTL for longer retention
/brewdoc:publish architecture.html --ttl 30
```

### Common Mistakes

```sh
# Avoid publishing sensitive data -- pages are publicly accessible
/brewdoc:publish .env                    # credentials exposed!

# Avoid very large binary files -- brewpage is for lightweight content
/brewdoc:publish database-dump.sql.gz    # not the right tool

# Do not assume the URL is permanent -- content expires after TTL
/brewdoc:publish important-doc.md        # gone after 5 days by default
```

## Output

On success, the skill returns:

```
Published!
URL:         https://brewpage.app/{namespace}/{id}
Owner token: {ownerToken}
```

- **URL** -- shareable link to the published content.
- **Owner token** -- saved automatically to `.claude/brewpage-history.md` (or `~/.claude/brewpage-history.md` if the project has no `.claude/` directory). Use it to delete the page later.

### Deleting a Published Page

```bash
curl -X DELETE "https://brewpage.app/api/{ns}/{id}" -H "X-Owner-Token: {ownerToken}"
```

Find your owner tokens in `.claude/brewpage-history.md`.

## Tips

- **TTL planning** -- default is 5 days. Use `--ttl 30` for content you need longer, or `--ttl 1` for quick one-off shares.
- **Namespace controls the URL** -- choosing `public` places the page in the gallery. Pick a custom namespace (3-32 alphanumeric chars) for a cleaner URL or to avoid gallery listing.
- **Password protection** -- when you set a password, the page is hidden from the gallery and requires the password to view.
- **Each publish creates a new page** -- there is no "update" operation. Publish again and share the new URL. Delete the old page using the saved owner token if needed.
