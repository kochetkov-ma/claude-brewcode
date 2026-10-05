# Publish (Brewpage)

Publish text, markdown, JSON, files, or multi-file sites to [brewpage.app](https://brewpage.app) and get a shareable public URL instantly. No sign-up required. Content is auto-deleted after the TTL expires (default 15 days).

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

New routing identities use `routingCohort=new-v1` (NEW); legacy publications (OLD) retain their links and behavior. Deduplication can return an OLD or NEW winner: use its actual identity, cohort, mode and exact URL, even when they differ from the requested mode. Missing or null OLD routing metadata means **Existing link**; do not infer a mode from the address.

## Examples

### Good Usage

```sh
# Publish markdown text (default 15-day TTL)
/brewdoc:publish "# Meeting Notes\n\n- Action item 1\n- Action item 2"

# Publish a local file
/brewdoc:publish /path/to/diagram.png

# Publish JSON data
/brewdoc:publish '{"users": [{"name": "Alice"}, {"name": "Bob"}]}'

# Publish with a 1-day TTL
/brewdoc:publish changelog.md --ttl 1

# Publish with a 30-day TTL for longer retention
/brewdoc:publish architecture.html --ttl 30

# Publish a directory as a multi-file site
/brewdoc:publish docs/mockups/v1/

# Publish a directory with custom entry point
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

- **URL** -- share the returned `link` exactly, including the trailing `/` on a new subdomain root. Mixed-case resource IDs and separate lowercase host UIDs are different identities; never construct a hostname from an ID.
- **Owner access** -- the returned apex `ownerLink` and identity metadata are saved with the owner token in project-root history. Use them for API operations rather than parsing a subdomain URL. Older history entries retain their existing namespace/ID identifiers.
- **Private history** -- mode `600`, git-ignored, and anchored to the project root even from a nested working directory. Each upload uses its own private run directory; concurrent runs do not share content or password inputs.
- **Owner token** -- never printed to the conversation. Upload, response parsing and history saving happen in one Bash block; the model sees only `OK {url}` (plus file count for sites). Failure output excludes the response body.

### Deleting a Published Page

```bash
curl -X DELETE "https://brewpage.app/api/{ns}/{id}" -H "X-Owner-Token: {ownerToken}"
```

Find your owner token and API identifiers in project-root `.claude/brewpage-history.md`. Sites use `DELETE /api/sites/{ns}/{id}` instead.

## Tips

- **TTL planning** -- default is 15 days. Use `--ttl 30` for content you need longer, or `--ttl 1` for quick one-off shares.
- **Visibility** -- `public` makes unprotected content eligible for gallery listing and indexing. Other namespaces are unlisted, not secret. Native subdomain hosts use `noindex`.
- **Password protection** -- choose an existing local file containing at least four characters; supply its absolute path, not the password in chat. Private header-file transport sends `X-Password`, while no-password mode ignores stale password files. New protected share links stay clean: never append `?p=`. Browser access uses the trusted unlock page; programmatic reads use apex API requests with `X-Password`. Existing links retain their password behavior.
- **Verify the result** -- open the exact returned link in a private browser window. Protected content must ask for its password before rendering; for sites, also check entry and asset paths.
- **Republish in place** -- send the new bundle to the saved apex owner API with `X-Owner-Token` (`PUT /api/sites/{ns}/{id}` for sites). Site replacement preserves its host and replaces the file set. Ordinary PUT updates retain the delivery mode; do not send `X-Delivery-Mode` on them.
- **Change hosting** -- only eligible NEW public non-sites support owner-authorized `PATCH /api/{type}/{ns}/{id}/hosting` with `deliveryMode` and the current `expectedVersion`. A mode change preserves the host; use the returned link and version afterward. OLD publications, sites and non-public namespaces have no mode choice. See the [full workflow and API details](https://doc-claude.brewcode.app/brewdoc/skills/publish/).

## Documentation

- [Publish documentation](https://doc-claude.brewcode.app/brewdoc/skills/publish/) — workflow, routing and API details.
- [Skill source](SKILL.md) — upload blocks and input handling.
- [Brewdoc](../../README.md) — installation and other documentation tools.
- [MD to PDF](../md-to-pdf/README.md) — create a PDF before publishing it.
