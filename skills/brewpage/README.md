# Brewpage

Publish text, markdown, JSON, or files to [brewpage.app](https://brewpage.app) — get a public URL instantly. No sign-up.

## Quick Start

1. Install:
   ```bash
   npx skills add kochetkov-ma/claude-brewcode
   ```

2. Use via slash command:
   ```
   /brewpage "Hello, world!"
   /brewpage report.md
   /brewpage '{"status": "ok"}'
   /brewpage screenshot.png --ttl 1
   ```

   Or via natural language prompt:
   ```
   Publish this to brewpage
   Upload report.md to brewpage.app
   ```

Claude detects the content type, asks for a namespace and password interactively, calls the brewpage.app API, and returns a public URL. The owner token is saved to `.claude/brewpage-history.md` for later deletion.

## What It Does

1. **Detects content type** — text/markdown becomes HTML, objects/arrays become JSON, file paths become file uploads
2. **Asks namespace** — interactive prompt for a short namespace (URL slug)
3. **Asks password** — optional password protection for the published page
4. **Calls API** — sends content to brewpage.app
5. **Returns URL** — public link ready to share
6. **Saves token** — owner token written to `.claude/brewpage-history.md`

## API Coverage

| Content | Type | Endpoint |
|---------|------|----------|
| Text / markdown | HTML | `POST /api/html` |
| JSON object/array | JSON | `POST /api/json` |
| Local file | File | `POST /api/files` |

## TTL

Default time-to-live is **5 days**. Override with `--ttl N` (days):

```
/brewpage report.md --ttl 1
/brewpage '{"data": [1,2,3]}' --ttl 30
```

## Owner Token

Every publish saves an entry to `.claude/brewpage-history.md`:

```markdown
| Namespace | ID | URL | Token | Created |
|-----------|-----|-----|-------|---------|
| my-ns | abc123 | https://brewpage.app/my-ns/abc123 | tok_... | 2026-03-31 |
```

Use the token to delete a page:

```bash
curl -X DELETE "https://brewpage.app/api/{ns}/{id}" -H "X-Owner-Token: {token}"
```

## Part of Brewcode

This skill is extracted from [brewcode](https://github.com/kochetkov-ma/claude-brewcode) — a development platform for Claude Code with infinite focus tasks, 14 agents, quorum reviews, and knowledge persistence.

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewcode@claude-brewcode
```

## License

MIT
