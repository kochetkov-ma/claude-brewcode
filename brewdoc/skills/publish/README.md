# Publish (BrewPage)

Prepare a local draft, share supplied content, create and publish a page, or update an existing publication on [BrewPage](https://brewpage.app). You can publish anonymously or under a connected account.

## Install

Install the [Brewdoc plugin](../../README.md#install), then run `/reload-plugins` in Claude Code. Use `/brewdoc:publish` or tell Claude what to do in plain language. Allow `Skill(brewdoc:publish *)` in headless or `dontAsk` sessions.

## Usage

| Goal | Example | Result |
|------|---------|--------|
| Draft | “Prepare a draft RSVP page for BrewPage, local only.” | Local files and, for saved answers, a Page data declaration. Drafts make zero BrewPage calls. |
| Publish supplied content | `/brewdoc:publish "# Hello"` | A reader link for the supplied Markdown. |
| Compose and publish | “Create and publish an event announcement from these details.” | A reader link for the page Claude creates. |
| Update | “Update this publication at `<existing reader URL>` using `page.html`.” | Replacing content in its current format keeps the address and saved visitor entries. |

Give Claude the exact existing link when updating. For an explicit format or hosting change, share the effective returned reader link. An update needs owner access to that publication. A read-only target requires a separate request to publish a new copy.

## Publishing options

Link-only shares use an unlisted namespace. Anyone with the link can open it unless it is password-protected. Request `public` when you want eligible content to appear in the gallery and sitemap. Give Claude a path to an existing local password file if you want password protection. Claude uses your choices and asks only about missing details that affect the work.

- `--ttl N` sets the lifetime in days. New REST publications request 15 days by default.
- `--entry filename` selects a built site's starting page. A new site defaults to the root `index.html`, then the shallowest HTML page. To replace a site, supply the complete bundle. The update uses the verified existing entry unless you request a change.
- `--delivery-mode path|subdomain` requests a hosting mode. Use the effective mode shown in the result.
- `--state JSON` enables Page data for eligible HTML pages and sites. `{}` uses private visitor entries by default. See the [Page data recipe](references/page-data.md).
- `--domain hostname` requests a hostname you control for a new eligible HTML page or site. REST requires an existing owner key with account permission to manage the domain. See [Custom domains](references/custom-domain.md).

Try `/brewdoc:publish page.html`, `/brewdoc:publish report.pdf --ttl 1`, `/brewdoc:publish '{"key":"value"}'`, or `/brewdoc:publish dist/ --entry index.html`. You can also supply a built site as a ZIP. The directory packer includes eligible files in the root `.well-known/` directory. For a new publication, REST treats non-UTF-8 HTML or Markdown as a downloadable file.

## Connection and local checks

Claude prefers a compatible BrewPage MCP tool available in the current session. For files, folders and ZIPs, it checks the local input before sending bytes. If the tool cannot handle the request, Claude can select the bundled REST runner before sending a write when it supports the requested owner and input.

Before an anonymous MCP create, Claude verifies an owner-only result channel or an authorized private handoff; protected storage alone cannot protect a shared tool transcript. An established owner-only context needs no extra question. Otherwise it selects authorized REST with protected receipts before writing, or leaves an MCP-only request pending.

Local checks and the REST runner use `bash` and Python 3 on macOS, Linux or WSL. Local checks also require Node.js. ZIPs need `unzip`, and packing folders needs `zip`. The REST runner adds `curl`, `jq` and Python's `fcntl`, with `git` for owner history in a Git checkout. REST requests use `ClaudeCode/6.13.5 (+https://brewpage.app)`. See [local input checks and runner usage](references/publishing.md).

## Ownership and receipts

Claude prefers a suitable connected account when you have no other owner selected. If you ask to publish under your account, complete authorization in the MCP client when prompted. If the connection is unavailable, the request stays pending. For anonymous publishing, Claude reuses the selected saved owner key or arranges a private place to save or deliver a new key. The bundled runner can save it in `.claude/brewpage-history.md`, a workspace file readable only by its owner. Claude confirms a save after reading it back.

Share the exact returned reader link and check its effective access. The ordinary REST runner result omits owner keys, management links and private receipt paths. If saving the key fails after publication, Claude reports both outcomes.

The runner keeps owner tokens and management links in protected files. If you decline workspace history, select a protected receipt directory with `--no-save --receipt-dir`. See [private receipts and recovery](references/ownership.md).

## Documentation

- [Publish manual](https://doc-claude.brewcode.app/brewdoc/skills/publish/) for hosting modes and examples.
- [Skill source](SKILL.md) and [MD to PDF](../md-to-pdf/README.md) for preparing a PDF to share.
- Local validation from the repository root uses `bash brewdoc/skills/publish/tests/run.sh`.
