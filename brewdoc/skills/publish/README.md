# Publish (Brewpage)

Publishes text, markdown, JSON, a file, a folder or a ZIP site to [brewpage.app](https://brewpage.app) and returns a shareable URL. No sign-up; content expires after its TTL (default 15 days). Private means unlisted, not locked: anyone with the link can open it unless a password is set. Owner tokens go to a local history file, never into the chat.

BrewPage needs no account and keeps pages for 1 to 30 days. To compare it with GitHub Pages, Netlify Drop, Tiiny Host and others, see [brewpage.app/compare](https://brewpage.app/compare).

Optional: sign in at [account.brewpage.app](https://account.brewpage.app) to manage your pages and tokens from any device. Not required.

## Install

Install the [Brewdoc plugin](../../README.md#install), then `/reload-plugins`. Needs `curl` and `jq`; site uploads also need Node.js and `unzip`, and directories need `zip`.

The skill is model-invocable: ask Claude to "publish this" or "share a link". One scoped `allowed-tools` rule (`scripts/brewpage-run.sh`) covers every step, so there are no Bash or Write prompts. Headless and `dontAsk` runs need `Skill(brewdoc:publish *)` allowed.

## Usage

| Input | Example | Endpoint |
|-------|---------|----------|
| Text / Markdown | `/brewdoc:publish "# Hello"` | `/api/html` |
| JSON (starts with `{` or `[`) | `/brewdoc:publish '{"key": "value"}'` | `/api/json` |
| File | `/brewdoc:publish report.pdf --ttl 1` | `/api/files` |
| Directory site | `/brewdoc:publish docs/v1/ --entry hub.html` | `/api/sites` |
| ZIP site | `/brewdoc:publish site.zip` | `/api/sites` |

Flags: `--ttl N` (days), `--entry <filename>` (sites), `--delivery-mode path|subdomain` (omit for the server default). The skill asks for a namespace (`public` or a private slug) and an optional password-file path; headless runs use a private slug and no password. It returns `Published: <exact server URL>`; share that link exactly. To delete a page, `curl -X DELETE "{ownerLink}" -H "X-Owner-Token: {ownerToken}"` with both values from `.claude/brewpage-history.md`.

Site entry is the root `index.html`, else the shallowest page (`--entry` overrides); the root `.well-known/` ships; the skill knows the upload limits ([details](https://doc-claude.brewcode.app/brewdoc/skills/publish/)).

Do not publish `.env` files or secrets: pages are reachable by anyone with the link.

## Documentation

- [Publish docs](https://doc-claude.brewcode.app/brewdoc/skills/publish/): hosting modes, security, owner operations.
- [Skill source](SKILL.md) and [MD to PDF](../md-to-pdf/README.md) for PDFs before publishing.
- Tests: `bash brewdoc/skills/publish/tests/run.sh` (no network, no upload).
