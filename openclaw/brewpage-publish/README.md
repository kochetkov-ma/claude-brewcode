# brewpage-publish (OpenClaw skill)

Publish text, markdown, any file, or a whole multi-file site to [brewpage.app](https://brewpage.app) — get a public URL instantly. No sign-up.

This is an [AgentSkills](https://docs.openclaw.ai/tools/skills)-standard skill for **OpenClaw**.

## What It Does

1. **Detects content type** — a directory/ZIP becomes a multi-file site, a single file becomes a file upload, everything else becomes HTML (markdown rendered)
2. **Asks namespace** — interactive prompt for a short, human-readable namespace (URL slug)
3. **Asks password** — optional password protection (hides the page from the gallery)
4. **Calls API** — sends content to brewpage.app
5. **Returns URL** — public link ready to share
6. **Saves token** — owner token written to `./brewpage-history.md`

## API Coverage

| Content | Type | Endpoint |
|---------|------|----------|
| Text / markdown | HTML | `POST /api/html?format=markdown` |
| Local file | File | `POST /api/files` |
| Directory (built static) | Site | `POST /api/sites` (auto-zipped — primary path) |
| `.zip` archive | Site | `POST /api/sites` (pre-built) |

## Install / Placement

OpenClaw discovers skills from two locations. Drop the `brewpage-publish/` folder (containing `SKILL.md`) into either:

```
<workspace>/skills/brewpage-publish/SKILL.md     # project-local skill
~/.openclaw/skills/brewpage-publish/SKILL.md      # user-global skill
```

The folder/`name` (`brewpage-publish`) drives the slash command and the allowlist key. The name uses lowercase + a hyphen — colon/uppercase forms like `BrewPage::publish` are **invalid** in OpenClaw.

## How to Invoke

Via slash command:
```
/brewpage-publish "Hello, world!"
/brewpage-publish report.md
/brewpage-publish screenshot.png --ttl 1
/brewpage-publish ./dist --entry index.html
/brewpage-publish site.zip
```

Or via natural language:
```
Publish this to brewpage
Upload report.md to brewpage.app
Deploy this directory as a site
```

The model detects the content type, asks for a namespace and password, calls the brewpage.app API, and returns the public URL.

## Sites

`POST /api/sites` accepts **only a `.zip` archive** — there is no raw-folder upload.

- **Directory (primary):** point at a **built** static directory; the skill auto-zips it and uploads. Archive sealing keeps relative paths intact.
- **Pre-built `.zip` (alternative):** uploaded as-is.

The auto-zip **excludes** `.git/`, `.env`/`.env.*`, `node_modules/`, `.DS_Store`, `Thumbs.db`, `.idea/`, `.vscode/`, `.cache/`, `*.map` and `*.log` — only real built assets ship; secrets and VCS data never leak into the public archive.

**Built-static guard:** publish build output, not sources. No `.html` in the directory → the skill fails and tells you to build first. A source tree (`package.json` + `src/`, no top-level `.html`) → the skill asks you to point at the build output (`dist/`, `build/`, `out/`, `_site/`, `public/`).

Entry file: `--entry` override > `index.html` > first `.html` alphabetically.

**No trailing slash.** The API returns `https://brewpage.app/public/<id>` without a trailing `/`. Appending `/` routes to brewpage.app's landing page and breaks the link. Site URLs cannot be verified with plain `curl` — verify with a real browser or fetch `<url>/index.html`.

## TTL

Default time-to-live is **15 days** (max 30). Override with `--ttl N` (days).

## Owner Token & Privacy

The owner token is **never printed in conversation** — the skill's shell blocks curl the API, parse the token, and append it to `./brewpage-history.md` directly. Only the public URL is shown.

`./brewpage-history.md` is a **private file** (keep it out of version control). Use the token to delete a page:

```bash
# html / json / kv
curl -X DELETE "https://brewpage.app/api/{ns}/{id}" -H "X-Owner-Token: {token}"
# site
curl -X DELETE "https://brewpage.app/api/sites/{ns}/{id}" -H "X-Owner-Token: {token}"
```

## Requirements

`curl`, `jq`, and `zip` available on the host shell.

## License

MIT
