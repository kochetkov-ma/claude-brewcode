# brewpage-publish (OpenClaw skill)

Publish HTML, markdown, text, any file, or a whole multi-file site to [brewpage.app](https://brewpage.app) — free hosting with no sign-up. Paste text, share a file, host a temporary page, or upload a site and get an instant public URL to share a link.

BrewPage needs no account and keeps pages for 1 to 30 days. To compare it with GitHub Pages, Netlify Drop, Tiiny Host and others, see [brewpage.app/compare](https://brewpage.app/compare).

This is an [AgentSkills](https://docs.openclaw.ai/tools/skills)-standard skill for **OpenClaw**.

## What It Does

1. **Detects content type** — a directory/ZIP becomes a multi-file site, a single file becomes a file upload, everything else becomes HTML (markdown rendered)
2. **Asks namespace** — `public` or a short, human-readable private slug (default). In `public`, pages, sites and files are listed in the public gallery and the sitemap, so Google, Bing and AI search can find and index them and people can discover them. Use it for anything meant to be found or shared. Anyone can find and read a public publication, so never put secrets, tokens or personal data there. A private slug (default) is unlisted and not indexed; anyone with the link can still open it.
3. **Asks password** — optional protection (hides the page from the gallery): an existing local file, given by absolute path, holds the password (min 4 characters); nothing is typed or generated
4. **Calls API** — sends content to brewpage.app
5. **Returns URL** — link ready to share
6. **Saves token** — the script writes the owner token to `./brewpage-history.md` (mode 600, git-ignored)

## Install / Placement

OpenClaw discovers skills from two locations. Drop the whole `brewpage-publish/` folder into either; it must include `SKILL.md` and `scripts/`:

```
<workspace>/skills/brewpage-publish/SKILL.md     # project-local skill
~/.openclaw/skills/brewpage-publish/SKILL.md      # user-global skill
```

The folder/`name` (`brewpage-publish`) drives the slash command and the allowlist key. The name uses lowercase + a hyphen — colon/uppercase forms like `BrewPage::publish` are **invalid** in OpenClaw.

This skill is standalone; it bundles its own `scripts/` (`brewpage-run.sh` with `probe`, `stage`, `publish` and `cleanup`, a helper library, `publish.mjs` and `history.py`) and does not load Brewdoc publishing libraries. Its history stays in the current workspace at `./brewpage-history.md`.

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

The model detects the content type, asks for a namespace and password, calls the brewpage.app API, and returns the link. Both privacy choices require an explicit answer; an unanswered or ambiguous choice stops the upload. An explicit Skip selects the suggested private namespace or no password.

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
| HTML format in `public`; markdown/text or file in any namespace, including password-protected uploads | Promotion (`path`) | `path` or `subdomain` |
| HTML format in any non-public namespace | Dedicated subdomain (`subdomain`) | Forced; requested `path` still publishes with a mode mismatch/notice |
| Site in any namespace | Dedicated subdomain (`subdomain`) | Forced; requested `path` still publishes with a mode mismatch/notice |

Share the server's `link` exactly, including a new subdomain root's trailing `/`. Never reconstruct a host from IDs or parse a hostname to obtain API identifiers.

A create request may return an existing publication. Keep the returned winner's identity, cohort, mode and link even when the requested mode differs. Old publications (`routingCohort: "old"`) retain their existing links and behavior; missing or null routing metadata means an existing link, not permission to infer its mode from the URL.

## Sites

`POST /api/sites` accepts a **ZIP archive** or **repeated `files` with matching `paths` fields**. This skill uses ZIP transport for directory uploads.

- **Directory (primary):** point at a **built** static directory; the skill builds a ZIP from it, verifies the archive (`unzip -t`, name set) and uploads. Relative paths stay intact.
- **Pre-built `.zip` (alternative):** uploaded as-is, never rewritten; the script inspects it first.

The directory bundle is **allowlisted**: it drops system files (`.DS_Store`, `__MACOSX/`, `Thumbs.db`, `desktop.ini`), which are listed under `SKIPPED` in the manifest, never flagged and never counted toward the server's file limit. It also drops hidden files and folders (`.env`, `.git/`), `node_modules/`, symlinks and unknown file types (`*.map`, `*.log`). The root `.well-known/` is the one hidden folder that ships, with all its files, extension-less ones included (for example `apple-app-site-association`). Kept names that look sensitive (`secret`, `token`, `password`, `credential`) are flagged, and the script stops with `REVIEW_SHA256:` and `CONFIRM:` before uploading anything. Review the manifest, then approve the exact archive bytes by re-running the command with `--confirmed --review-sha256 <displayed digest>`. Changed archive bytes require a fresh manifest review and approval; nothing uploads with the old digest. A supplied ZIP is never rewritten: a private temporary copy is inspected, hashed and uploaded, and anything unexpected or sensitive inside it needs the same confirmation. File contents are not scanned, so still check the bundle for embedded secrets.

**Built-static guard:** publish build output, not sources. No `.html` in the directory → the skill fails and tells you to build first. A source tree (`package.json` + `src/`, no top-level `.html`) → the skill asks you to point at the build output (`dist/`, `build/`, `out/`, `_site/`, `public/`).

Entry file (server rule): `--entry` override > root `index.html` > shallowest `.html` (ties: name order). To start on another page, pass `--entry`.

Site limits: 200 files, 5 MB per file, 20 MB total, 25 MB per request. To see the current values, ask the skill to check the limits or run `curl -s https://brewpage.app/api/limits`; the skill runs its own `limits` command before a big site. A successful upload prints `OK <url>`, followed by any server `NOTICE:` lines. A rejected upload prints `FAILED: publish rejected (HTTP <status>: <message>)` with the server's reason and no notices.

Local ZIP inspection has separate budgets: 25 MiB compressed, 40 MiB expanded, 200 files, 400 entries, 5 MiB per member and 1 MiB of metadata. ZIP64 and split archives are refused; each `unzip` check has a 10-second timeout. See [the skill workflow](SKILL.md) for inspection details; server limits still apply.

New sites use the exact returned subdomain root URL, including `/`, with native entry and asset paths. Verify rendering in a browser. Old sites may still redirect their root to the landing page; verify them in a browser or fetch their explicit entry asset. Preserve each returned link's original form.

## TTL

Default requested time-to-live is **15 days** (normally 1..30, subject to owner limits). Override with `--ttl N` (days). Site PUT keeps the original expiry; use returned `expiresAt` for actual retention, including any eligible automatic extension.

## Owner Token & Privacy

The owner token is **never printed in conversation** — `brewpage-run.sh` calls the API, parses the token, and appends it to `./brewpage-history.md` directly. Only the public URL is shown.

`./brewpage-history.md` is a **private file**: the script creates it with mode 600 and adds it to `./.gitignore` inside a git repo. Each new row stores `ownerLink` and identity: `id`, `namespace`, `type`, `routingCohort`, `deliveryMode`, `modeLocked`, `hostingVersion`, `managementLink`, `createdAt` and `expiresAt`.

Optional: sign in free (Google or any email) at [account.brewpage.app](https://account.brewpage.app) to manage publications and tokens, with retention up to 90 days. Publications still expire; a token without an expiry does not extend content retention. Local owner-token history stays in your workspace. Sign-in is not needed to publish.

Owner API and management links remain on `brewpage.app`, even when content uses a subdomain. Use the stored `ownerLink` and metadata; old history without metadata keeps its existing API identifiers. To delete a publication, read its owner API URL and token from history:

```bash
curl -X DELETE "$OWNER_API" -H "X-Owner-Token: $OWNER_TOKEN"
```

To replace a site, `PUT` the new archive to its stored owner API with `X-Owner-Token`. The bundle replaces the full file set while retaining the content host. Omit `X-Delivery-Mode` on ordinary updates. Old publications (made before 5 October 2026) are read-only: `409 OLD_PUBLICATION_READ_ONLY`; publish anew and report only the new public URL. Keep the new owner token in the protected local history file, never in conversation or logs.

Owner-only `GET` and `PATCH /api/{type}/{ns}/{id}/hosting` support `html`, `files`, `json`, `kv` and `sites`. Read the current hosting metadata first, then send `deliveryMode` and that `hostingVersion` as `expectedVersion` with `X-Owner-Token`. Use the returned link and version afterward. Legacy publications without new routing metadata remain unchanged. Sites and non-public HTML-format pages stay on their subdomain; a mismatched mode is reported rather than rejected. A stale version is applied with a notice, so inspect the response. Switching an eligible publication retains its reserved host.

## Password-Protected Links

New protected links stay clean: never append `?p=`. Share the exact returned URL; browsers enter the password at the trusted top-level `unlock.brewpage.app` gateway. Programmatic reads use the apex API with `X-Password`. Old password behavior remains unchanged.

## Requirements

Use a POSIX runtime: macOS, Linux or WSL. All uploads require `bash`, `curl`, `jq` and POSIX Python 3 (`python3`) with `fcntl` for secure local history; `git` is also required inside Git checkouts. Native Windows Python is unsupported and fails before upload. Directory and ZIP sites also require `node` and `unzip`; directory packaging also requires `zip`.

## Documentation

- [Skill workflow and shell blocks](SKILL.md)
- [BrewPage hosting API](https://brewpage.app/api#hosting)

## License

The bundled skill and scripts are MIT-licensed. The hosted BrewPage service is proprietary.
