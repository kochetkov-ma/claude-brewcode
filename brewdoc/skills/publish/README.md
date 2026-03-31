# Brewpage

Publish text, markdown, JSON, or files to [brewpage.app](https://brewpage.app) and get a public URL instantly. No sign-up required.

## Quick Start

```sh
/brewdoc:brewpage "Hello, world!"            # Text / markdown -> HTML page
/brewdoc:brewpage file.pdf                    # Local file upload
/brewdoc:brewpage '{"key": "value"}'          # JSON object -> JSON page
/brewdoc:brewpage report.md --ttl 1           # Custom TTL (days, default 5)
```

## What It Does

- **Detects content type** — text/markdown, JSON, or file path
- **Interactive prompts** — asks for namespace (URL slug) and optional password
- **Publishes** via brewpage.app API (`/api/html`, `/api/json`, or `/api/files`)
- **Returns** a public URL ready to share
- **Saves** owner token to `.claude/brewpage-history.md` for later deletion

## Owner Token

Each publish appends an entry to `.claude/brewpage-history.md` with namespace, ID, URL, token, and timestamp. Use the token to delete:

```bash
curl -X DELETE "https://brewpage.app/api/{ns}/{id}" -H "X-Owner-Token: {token}"
```
