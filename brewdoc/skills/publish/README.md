# Publish (Brewpage)

Publish text, markdown, JSON, files, or multi-file sites to [brewpage.app](https://brewpage.app) and get a shareable public URL instantly. No sign-up required. Content is auto-deleted after the TTL expires (default 15 days).

## Quick Start

```
/brewdoc:publish "Your content here"
```

The skill will ask for a namespace (URL slug) and optional password, then return a public URL.

Requires `jq` on `PATH`. Publishing a directory as a site also requires `zip`. Each upload block checks for them and aborts with `FAILED: jq required` / `FAILED: zip required` rather than half-publishing.

## What You Can Publish

| Content Type | Example Input | API Endpoint | Notes |
|--------------|---------------|--------------|-------|
| Text / Markdown | `"# Hello World"` | `/api/html` | Rendered as HTML via `format=markdown` |
| JSON | `'{"key": "value"}'` | `/api/json` | Must start with `{` or `[` |
| File | `report.pdf` | `/api/files` | Any local file (multipart upload) |
| Site / Directory | `docs/mockups/v1/` | `/api/sites` | Creates ZIP, uploads all files, preserves relative links |
| ZIP Archive | `site.zip` | `/api/sites` | Direct archive upload |

All content types support `--ttl N` to set expiration in days. Site uploads also support `--entry <filename>` to specify the entry point.

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
Published: https://brewpage.app/{namespace}/{id}
Owner token saved to .claude/brewpage-history.md
```

- **URL** -- shareable link to the published content.
- **Owner token** -- never printed to the conversation. The curl, the token parse and the history append all happen inside one Bash block; the model sees only `OK {url}`. The token lands in `.claude/brewpage-history.md`. The failure branch prints `FAILED: ...` with no response body, so a token in an error payload cannot leak into the transcript either.

### Deleting a Published Page

```bash
curl -X DELETE "https://brewpage.app/api/{ns}/{id}" -H "X-Owner-Token: {ownerToken}"
```

Find your owner tokens in `.claude/brewpage-history.md`.

## Tips

- **TTL planning** -- default is 15 days. Use `--ttl 30` for content you need longer, or `--ttl 1` for quick one-off shares.
- **Namespace controls the URL** -- choosing `public` places the page in the gallery. Pick a custom namespace (3-32 alphanumeric chars) for a cleaner URL or to avoid gallery listing.
- **Password protection** -- when you set a password, the page is hidden from the gallery and requires the password to view. Verify it by opening the link in a logged-out / private window: a protected page asks for the password before it renders anything.
- **Republish in place** -- `PUT` the new bundle to the same URL with your owner token (`PUT /api/sites/{ns}/{id}` for sites). The upload fully replaces the file set and the link never changes, so there is no DELETE-then-POST dance.

## Password protection: what was broken before v5.0.0

Every upload block referenced a `"${PASS_H[@]}"` array built from a `$PASSWORD` shell variable that **nothing ever assigned**. The password was resolved in conversation, and each Bash call is a fresh shell, so the header expanded to nothing: the page went out with **no password at all** while the skill still reported one to you. The only way to notice was opening the link logged out.

The blocks now carry a literal `{password_header}` placeholder that the model substitutes before running -- `-H "X-Password: <pass>"` when a password was chosen, or the whole line deleted when it was not. The rule is stated as mandatory at the end of the password step, together with its consequence: never report a password you did not actually substitute into the block you ran.

If you published a password-protected page with an earlier version, treat it as public. Delete it with its owner token and publish again.

## Documentation

Full docs: [publish](https://doc-claude.brewcode.app/brewdoc/skills/publish/)
