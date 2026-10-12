# Publish (Brewpage)

Publish text, markdown, JSON, files, or multi-file sites to [brewpage.app](https://brewpage.app) and get a shareable URL instantly. No sign-up required. Content is deleted when its TTL expires (default 15 days).

## Quick Start

```
/brewdoc:publish "Your content here"
```

The skill asks for a namespace and optional local password-file path, then returns the server's shareable URL. A non-public namespace is unlisted; anyone with its link can open it unless a password is set.

## Installation

Install the [Brewdoc plugin](../../README.md#install) in Claude Code, then reload plugins before invoking `/brewdoc:publish`.

All uploads require `curl` and `jq` on `PATH`. Directory and ZIP site uploads also require Node.js and `unzip`; directory packaging additionally requires `zip`.

## What You Can Publish

| Content Type | Example Input | API Endpoint | Notes |
|--------------|---------------|--------------|-------|
| Text / Markdown | `"# Hello World"` | `/api/html` | Rendered as HTML via `format=markdown` |
| JSON | `'{"key": "value"}'` | `/api/json` | Must start with `{` or `[` |
| File | `report.pdf` | `/api/files` | Any local file (multipart upload) |
| Site / Directory | `docs/mockups/v1/` | `/api/sites` | Creates ZIP from selected supported web assets, preserving relative paths |
| ZIP Archive | `site.zip` | `/api/sites` | Direct archive upload |

Directory packaging skips dot entries, dependency/cache directories, symlinks and unsupported file extensions.

All content types support `--ttl N` to set expiration in days and optional `--delivery-mode path|subdomain`. Site uploads also support `--entry <filename>` to specify the entry point.

## Delivery Mode

Omit `--delivery-mode` to use the server default. An explicit choice is sent as `X-Delivery-Mode`, never inserted into published text, JSON or multipart fields.

| New publication | Default | Allowed choice |
|-----------------|---------|----------------|
| Site, any namespace or password | Dedicated subdomain (`subdomain`) | Locked; explicit `path` is rejected |
| Non-site outside `public` | Dedicated subdomain (`subdomain`) | Locked; explicit `path` is rejected |
| Public text/Markdown, JSON or file, including password-protected content | Promotion (`path`) | `path` or `subdomain` |

New routing identities use `routingCohort=new-v1` (NEW); legacy publications (OLD) keep their links and behavior. Deduplication can return an OLD or NEW winner: use its actual identity, cohort, mode and exact URL, even when they differ from the request. Missing or null OLD routing metadata means **Existing link**; never infer a mode from the address.

## Examples

### Good Usage

```sh
# Publish markdown text (default 15-day TTL)
/brewdoc:publish "# Meeting Notes\n\n- Action item 1\n- Action item 2"

# Publish a local file
/brewdoc:publish /path/to/diagram.png

# Publish JSON data
/brewdoc:publish '{"users": [{"name": "Alice"}, {"name": "Bob"}]}'

# Publish with a 30-day TTL
/brewdoc:publish architecture.html --ttl 30

# Publish a directory as a multi-file site with a custom entry point
/brewdoc:publish docs/mockups/v1/ --entry hub.html

# Publish a ZIP archive as a site
/brewdoc:publish site-bundle.zip --entry index.html

# Choose a dedicated subdomain for a public non-site upload
# Select public when asked for the namespace
/brewdoc:publish report.md --delivery-mode subdomain
```

### Common Mistakes

```sh
# Avoid publishing sensitive data -- pages are publicly accessible
/brewdoc:publish .env                    # credentials exposed!

# Avoid very large binary files -- brewpage is for lightweight content
/brewdoc:publish database-dump.sql.gz    # not the right tool

# Do not assume the URL is permanent -- content expires after TTL
/brewdoc:publish important-doc.md        # gone after 15 days by default
```

## Output

On success, the skill returns:

```
Published: {exact server URL}
Owner token saved to <project-root>/.claude/brewpage-history.md
```

- **URL** -- share the returned `link` exactly, including the trailing `/` on a new subdomain root. Mixed-case resource IDs and lowercase host UIDs are different identities; never build a hostname from an ID.
- **Owner access** -- the apex `ownerLink` and identity metadata are saved with the owner token in project-root history. Use them for API operations instead of parsing a subdomain URL. Older entries keep their namespace/ID identifiers.
- **Private history** -- mode `600`, git-ignored, and anchored to the project root even from a nested working directory. Each upload uses its own private run directory, so concurrent runs never share content or password inputs.
- **Owner token** -- never printed to the conversation. Upload, response parsing and history saving happen in one Bash block that prints only `OK {url}` (plus the file count for sites); failure output excludes the response body.

### Deleting a Published Page

```bash
curl -X DELETE "{ownerLink}" -H "X-Owner-Token: {ownerToken}"
```

Find the owner token and owner API URL (`ownerLink`) in project-root `.claude/brewpage-history.md`. Older rows without one use `https://brewpage.app/api/{type}/{ns}/{id}`, where `{type}` is `html`, `json`, `files`, `kv` or `sites`.

## Tips

- **TTL planning** -- the default is 15 days; use `--ttl 30` for longer-lived content or `--ttl 1` for one-off shares.
- **Visibility** -- eligible, unprotected HTML pages, sites and files in `public` can be listed in the gallery and indexed, including on native subdomain hosts. Other namespaces are unlisted, not secret. Non-public, password-protected and ineligible publications use `noindex`. Eligibility does not guarantee indexing or search ranking.
- **Password protection** -- give the absolute path of an existing local file holding at least four characters, never the password itself. It is sent as `X-Password` from a private header file; no-password mode ignores stale password files. New protected links stay clean (never append `?p=`): browsers use the unlock page, programmatic reads send `X-Password` to the apex API. Existing links keep their password behavior.
- **Verify the result** -- open the exact returned link in a private browser window. Protected content must ask for its password before rendering; for sites, also check entry and asset paths.
- **Republish in place** -- send the new bundle to the saved apex owner API with `X-Owner-Token` (`PUT /api/sites/{ns}/{id}` for sites). Site replacement preserves its host and replaces the file set. Ordinary PUT updates retain the delivery mode; do not send `X-Delivery-Mode` on them.
- **Change hosting** -- only eligible NEW public non-sites support owner-authorized `PATCH /api/{type}/{ns}/{id}/hosting` with `deliveryMode` and the current `expectedVersion`. The host is preserved; use the returned link and version afterward. OLD publications, sites and non-public namespaces have no mode choice.

## Documentation

- [Publish documentation](https://doc-claude.brewcode.app/brewdoc/skills/publish/) — workflow, routing and API details.
- [Skill source](SKILL.md) — upload blocks and input handling.
- [Brewdoc](../../README.md) — installation and other documentation tools.
- [MD to PDF](../md-to-pdf/README.md) — create a PDF before publishing it.
- Tests: `bash brewdoc/skills/publish/tests/run.sh` (no network, no upload).
