# Brewpage Publish

Publish text, markdown, JSON, files, or whole multi-file sites to [brewpage.app](https://brewpage.app) — get a public URL instantly. No sign-up.

## Quick Start

1. Install:
   ```bash
   npx skills add kochetkov-ma/claude-brewcode
   ```

2. Use via slash command:
   ```
   /brewpage-publish "Hello, world!"
   /brewpage-publish report.md
   /brewpage-publish '{"status": "ok"}'
   /brewpage-publish screenshot.png --ttl 1
   /brewpage-publish report.md --delivery-mode subdomain
   /brewpage-publish ./my-site --entry index.html
   /brewpage-publish site.zip
   ```

   Or via natural language:
   ```
   Publish this to brewpage
   Upload report.md to brewpage.app
   Deploy this directory as a site
   ```

Claude detects the content type, asks for a namespace and password interactively, calls the brewpage.app API, and returns a public URL. The owner token is saved to `.claude/brewpage-history.md` for later deletion.

## Requirements

All uploads require `curl` and `jq` on the host shell. Publishing a directory also requires `zip` and `unzip` to package and validate the archive; pre-built ZIP uploads need neither.

## What It Does

1. **Detects content type** — directory/ZIP becomes a multi-file site, single file becomes a file upload, objects/arrays become JSON, everything else becomes HTML (markdown rendered)
2. **Asks namespace** — interactive prompt for a short, human-readable namespace (URL slug)
3. **Asks password** — optional password protection (hides the page from the gallery)
4. **Calls API** — sends content to brewpage.app
5. **Returns URL** — public link ready to share
6. **Saves token** — owner token written to `.claude/brewpage-history.md`

## API Coverage

| Content | Type | Endpoint |
|---------|------|----------|
| Text / markdown | HTML | `POST /api/html?format=markdown` |
| JSON object/array | JSON | `POST /api/json` |
| Local file | File | `POST /api/files` |
| Directory | Site | `POST /api/sites` (zipped on the fly) |
| `.zip` archive | Site | `POST /api/sites` |

## Sites

`POST /api/sites` accepts **only a `.zip` archive** — there is no raw-folder upload.

- **Directory (primary):** point at a **built** static directory; the skill auto-zips it and uploads. Archive sealing keeps relative paths intact.
- **Pre-built `.zip` (alternative):** uploaded as-is.

The auto-zip applies filename exclusions for `.git/`, `.env`/`.env.*`, `node_modules/`, `.DS_Store`, `Thumbs.db`, `.idea/`, `.vscode/`, `.cache/`, `*.map` and `*.log`. These exclusions do not cover every sensitive filename or inspect file contents. Before upload, inspect the intended built bundle, including any ZIP, for sensitive files and embedded secrets.

**Built-static guard:** publish build output, not sources. No `.html` in the directory → the skill fails and tells you to build first. A source tree (`package.json` + `src/`, no top-level `.html`) → the skill asks you to point at the build output (`dist/`, `build/`, `out/`, `_site/`, `public/`).

Entry file: `--entry` override > `index.html` > first `.html` alphabetically.

Share the server's `link` exactly, including any trailing `/`. New subdomain roots include `/`; existing links keep their historical form. Verify a new site at its returned URL and asset paths, with a browser for rendering. Existing sites may still use a browser redirect; verify those in a browser or fetch their explicit entry asset.

## Delivery Mode

`--delivery-mode path|subdomain` optionally sends the `X-Delivery-Mode` creation header. With no flag, the skill sends no header and uses the server default. Other values are rejected; the option never changes the uploaded content.

| New publication (`routingCohort: new-v1`) | Delivery |
|-----------------------------------------|----------|
| Site or non-`public` namespace | Dedicated subdomain (`subdomain`); explicit `path` is rejected |
| Public HTML, JSON or file, including password-protected uploads | Promotion (`path`) by default; `subdomain` is optional |

An upload may return an existing publication. Keep that winner's identity, metadata and exact server link even if its delivery differs from the request. Existing publications without routing metadata keep their historical links; do not infer their mode from the URL. Never construct or parse a publication hostname to recover its namespace or resource ID.

See the [hosting API reference](https://brewpage.app/api#hosting) for mode changes and delivery limits.

## TTL

Default time-to-live is **15 days** (max 30). Override with `--ttl N` (days):

```
/brewpage-publish report.md --ttl 1
/brewpage-publish '{"data": [1,2,3]}' --ttl 30
```

## Owner Token & Privacy

The owner token is **never printed in conversation** — the skill's bash blocks parse the response and save it directly to `.claude/brewpage-history.md`. This **private file** must stay out of version control. It also records the exact public URL, apex `ownerLink`, and identity fields such as `id`, `namespace`, `type`, `routingCohort`, `deliveryMode` and `hostingVersion` for later owner operations.

New password-protected links stay clean: do not append `?p=`. Readers unlock through the trusted `unlock.brewpage.app` page; programmatic reads use `X-Password` on the apex API. Existing password behavior remains unchanged.

Use the saved `ownerLink` and identity for updates and deletion on `https://brewpage.app`, never the publication host. Existing history without metadata keeps its saved API identifiers. Delete examples:

```bash
# html / json / kv
curl -X DELETE "https://brewpage.app/api/{ns}/{id}" -H "X-Owner-Token: {token}"
# site
curl -X DELETE "https://brewpage.app/api/sites/{ns}/{id}" -H "X-Owner-Token: {token}"
```

Only new public non-sites support owner-only `PATCH /api/{type}/{ns}/{id}/hosting` with `deliveryMode` and the current `expectedVersion`. Read the version first; use the returned link and version afterward. Switching modes retains the same reserved host. Existing publications, sites and non-public namespaces have no mode choice. Ordinary content updates omit `X-Delivery-Mode`. See the [hosting API reference](https://brewpage.app/api#hosting).

## Part of Brewcode

This skill is part of [brewcode](https://github.com/kochetkov-ma/claude-brewcode) — a development platform for Claude Code with infinite focus tasks, agents, quorum reviews, and knowledge persistence.

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewcode@claude-brewcode
```

## License

MIT
