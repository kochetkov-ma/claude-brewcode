# brewpage-publish (OpenClaw skill)

Publish HTML, markdown, text, any file, or a whole multi-file site to [brewpage.app](https://brewpage.app) — free hosting with no sign-up. Paste text, share a file, host a temporary page, or upload a site and get an instant public URL to share a link.

This is an [AgentSkills](https://docs.openclaw.ai/tools/skills)-standard skill for **OpenClaw**.

## What It Does

1. **Detects content type** — a directory/ZIP becomes a multi-file site, a single file becomes a file upload, everything else becomes HTML (markdown rendered)
2. **Asks namespace** — interactive prompt for a short, human-readable namespace (URL slug)
3. **Asks password** — optional password protection (hides the page from the gallery)
4. **Calls API** — sends content to brewpage.app
5. **Returns URL** — public link ready to share
6. **Saves token** — owner token written to `./brewpage-history.md`

## Install / Placement

OpenClaw discovers skills from two locations. Drop the `brewpage-publish/` folder (containing `SKILL.md`) into either:

```
<workspace>/skills/brewpage-publish/SKILL.md     # project-local skill
~/.openclaw/skills/brewpage-publish/SKILL.md      # user-global skill
```

The folder/`name` (`brewpage-publish`) drives the slash command and the allowlist key. The name uses lowercase + a hyphen — colon/uppercase forms like `BrewPage::publish` are **invalid** in OpenClaw.

This skill is standalone and portable; it does not load Brewdoc publishing libraries. Its history stays in the current workspace at `./brewpage-history.md`.

## How to Invoke

Via slash command:
```
/brewpage-publish "Hello, world!"
/brewpage-publish report.md
/brewpage-publish screenshot.png --ttl 1
/brewpage-publish "Hello, world!" --delivery-mode subdomain
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

## API Coverage

| Content | Type | Endpoint |
|---------|------|----------|
| Text / markdown | HTML | `POST /api/html?format=markdown` |
| Local file | File | `POST /api/files` |
| Directory (built static) | Site | `POST /api/sites` (auto-zipped — primary path) |
| `.zip` archive | Site | `POST /api/sites` (pre-built) |

## Delivery Mode

`--delivery-mode path|subdomain` sends the optional `X-Delivery-Mode` creation header. Omit the flag to use server defaults; invalid values are rejected before upload. The mode is never added to authored content or upload fields.

For new publications (`routingCohort: "new-v1"`):

| Content / namespace | Default | Choice |
|---------------------|---------|--------|
| HTML or file in `public`, including password-protected uploads | Promotion (`path`) | `path` or `subdomain` |
| HTML or file in any non-public namespace | Dedicated subdomain (`subdomain`) | Required; explicit `path` is rejected |
| Site in any namespace | Dedicated subdomain (`subdomain`) | Required; explicit `path` is rejected |

Share the server's `link` exactly, including a new subdomain root's trailing `/`. Never reconstruct a host from IDs or parse a hostname to obtain API identifiers.

A create request may return an existing publication. Keep the returned winner's identity, cohort, mode and link even when the requested mode differs. Old publications (`routingCohort: "old"`) retain their existing links and behavior; missing or null routing metadata means an existing link, not permission to infer its mode from the URL.

## Sites

`POST /api/sites` accepts **only a `.zip` archive** — there is no raw-folder upload.

- **Directory (primary):** point at a **built** static directory; the skill auto-zips it and uploads. Archive sealing keeps relative paths intact.
- **Pre-built `.zip` (alternative):** uploaded as-is.

Directory auto-zipping excludes root and nested `.git/`, `.env`/`.env.*`, `node_modules/`, `.DS_Store`, `.idea/`, `.vscode/` and `.cache/`, plus root `Thumbs.db` and any `*.map` or `*.log` file. These filename exclusions are partial: review the built bundle for other sensitive files and embedded secrets before upload. Pre-built ZIPs are uploaded as-is.

**Built-static guard:** publish build output, not sources. No `.html` in the directory → the skill fails and tells you to build first. A source tree (`package.json` + `src/`, no top-level `.html`) → the skill asks you to point at the build output (`dist/`, `build/`, `out/`, `_site/`, `public/`).

Entry file: `--entry` override > `index.html` > first `.html` alphabetically.

New sites use the exact returned subdomain root URL, including `/`, with native entry and asset paths. Verify rendering in a browser. Old sites may still redirect their root to the landing page; verify them in a browser or fetch their explicit entry asset. Preserve each returned link's original form.

## TTL

Default time-to-live is **15 days** (max 30). Override with `--ttl N` (days).

## Owner Token & Privacy

The owner token is **never printed in conversation** — the skill's shell blocks curl the API, parse the token, and append it to `./brewpage-history.md` directly. Only the public URL is shown.

`./brewpage-history.md` is a **private file** (keep it out of version control). Each new history row stores the returned `ownerLink` and identity metadata: `id`, `namespace`, `type`, `routingCohort`, `deliveryMode`, `modeLocked`, `hostingVersion` and `managementLink`.

Owner API and management links remain on `brewpage.app`, even when content uses a subdomain. Use the stored `ownerLink` and metadata; old history without metadata keeps its existing API identifiers. To delete a publication, read its owner API URL and token from history:

```bash
curl -X DELETE "$OWNER_API" -H "X-Owner-Token: $OWNER_TOKEN"
```

To replace a site, `PUT` the new archive to its stored owner API with `X-Owner-Token`. The bundle replaces the full file set while retaining the content host. Omit `X-Delivery-Mode` on ordinary updates.

Only new public HTML/file publications allow owner-only `PATCH /api/{type}/{ns}/{id}/hosting` (`type` is `html` or `files`). Read the current hosting metadata first with owner-only `GET` at the same endpoint, then send `deliveryMode` and that `hostingVersion` as `expectedVersion` with `X-Owner-Token`. Use the returned link and version afterward. Switching either way retains the reserved host; stale versions return `409`. Old publications, sites and non-public namespaces have no mode choice.

## Password-Protected Links

New protected links stay clean: never append `?p=`. Share the exact returned URL; browsers enter the password at the trusted top-level `unlock.brewpage.app` gateway. Programmatic reads use the apex API with `X-Password`. Old password behavior remains unchanged.

## Requirements

All uploads require `curl` and `jq` on the host shell. Publishing a directory also requires `zip` and `unzip` to package and validate the archive; pre-built ZIP uploads need neither.

## Documentation

- [Skill workflow and shell blocks](SKILL.md)
- [BrewPage hosting API](https://brewpage.app/api#hosting)

## License

MIT
