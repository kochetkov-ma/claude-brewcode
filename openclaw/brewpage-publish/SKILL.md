---
name: brewpage-publish
description: "Publish HTML, markdown, text, any file, or a multi-file site to brewpage.app — free hosting with no sign-up. Paste text, share a file, upload a site, or host a temporary page and get an instant public URL to share a link. Asks namespace and password, returns the public URL. Triggers: publish, publish HTML, share link, share a link, share a file, upload to brewpage, host page, host a temporary page, host a website, free hosting, paste text, instant public URL, no sign-up, brewpage, publish site, upload site, upload directory, deploy site, сделай публичную ссылку, опубликуй."
homepage: https://brewpage.app
user-invocable: true
license: MIT
---

# brewpage-publish

Publish content to **brewpage.app** — free instant hosting for HTML pages, files, and multi-file sites. No sign-up required.

## Running commands

Every shell step is ONE command of the exact shape in the fences below, run with the shell tool.
`{baseDir}` is this skill's folder; the bundled `scripts/brewpage-run.sh` does every upload.

- Fill each `'{…}'` slot with the raw value and write every `'` inside it as `'\''`; nothing else is
  escaped. Never wrap a value in double quotes. An empty slot stays `''` (= omitted).
- Never prefix or chain the command (`cd`, `VAR=…`, `;`, `&&`, `|`, `$(…)`) and never inline the text in
  any other form: single-quoted argv is what keeps the content inert.
- Text longer than 6,000 characters goes through `stage` (Step 6).
- The script prints one decisive line: `OK {url}` or `OK {url} | Files: N` (then any `NOTICE: …` lines:
  what the server skipped or adjusted), `CONFIRM: …` (exit 2, nothing uploaded) or `FAILED: …` (server reason `HTTP <status>: <message>`).
  It removes its private run directory on every exit.

## Workflow

### Step 1: Parse Arguments

Extract from the arguments string:
- `--ttl N` → TTL in days (default: `15`)
- `--entry <filename>` → entry file for SITE uploads (default: auto-detect)
- `--delivery-mode path|subdomain` → optional creation header; omitted means server defaults. Reject other values before upload.
- Remaining text → `content_arg`: a path, or the exact text to publish, never a summary of it.

### Step 2: Detect Content Type

A `content_arg` that names a path -> probe it (read-only; prints `TYPE:`, the absolute `PATH:` to use
below, and the Step 3 stats) — run with the shell tool:

```bash
bash {baseDir}/scripts/brewpage-run.sh probe '{path}'
```

| Input | Type | `publish` type + source | API |
|-------|------|-------------------------|-----|
| `TYPE: site-dir` | SITE | `site-dir` + `--path` | `POST /api/sites` (ZIP built from the dir — primary path) |
| `TYPE: site-zip` (`.zip` file) | SITE | `site-zip` + `--path` | `POST /api/sites` (pre-built archive upload) |
| `TYPE: file` or `TYPE: markdown` (any other file) | FILE | `file` + `--path` | `POST /api/files` (multipart) |
| Anything else (`TYPE: none`, inline text) | HTML | `html` + `--text` | `POST /api/html` (format=markdown) |

Mode rule: directory/ZIP → SITE. Single file → FILE. Everything else → HTML (markdown). `POST /api/sites` accepts a multipart `archive=@file.zip` or repeated `files` and matching `paths` fields; the script zips a directory to preserve relative paths.

### Step 3: Show Pre-Publish Stats

From the probe lines — SITE (dir): `HTML`, `SIZE_KB`, `ENTRY`. SITE (ZIP): `BYTES`, entry override. FILE: `BYTES` + `MIME`. TEXT: char count.

For HTML/FILE:
```
Content:  <type description> · <size> · <api endpoint>
TTL:      <N> days
```

For SITE (entry = server rule: `--entry` > root `index.html` > shallowest `.html`; another page → pass `--entry`; `ENTRY: none` → fail with an explicit error, never guess):

**Built-static guard (before publishing).** Publish BUILT output, never project sources:
- No `.html` file in the directory (`ENTRY: none`) → **FAIL** with an explicit error: "No `.html` found — build the site first, then point at the build output directory." Do not guess an entry.
- The directory looks like un-built sources (has `package.json` + `src/` but no top-level `.html`) → **warn and ask** the user to point at the build output instead (`dist/`, `build/`, `out/`, `_site/`, or `public/`). Do not publish the source tree.
```
Content:  site · <N> files · <total_size> · POST /api/sites
Entry:    <entry_file>
TTL:      <N> days
```
These are source-tree estimates: report the ARCHIVE MANIFEST that Step 6 prints before upload; its
`ENTRY:` line is the entry `scripts/publish.mjs` resolved in the built archive.

**Site limits** (`GET https://brewpage.app/api/limits` returns the current ones): 25 MB per request; a site
holds 200 files, 5 MB per file, 20 MB total uncompressed, a ZIP expands to at most 40 MB; a path is at most
380 characters / 900 bytes, each file or folder name at most 200 bytes. A big site (`FILES` or `SIZE_KB`
near a limit) → check the current values first, and send many files as one ZIP (a folder is always zipped). Run:
```bash
bash {baseDir}/scripts/brewpage-run.sh limits
```
Pre-checks, folder or ZIP: system files (`.DS_Store`, `__MACOSX/`, `Thumbs.db`) never count and are
dropped; hidden files and folders are dropped too, except the root `.well-known/`; at least one `.html`
file must remain.

### Step 4: Ask Namespace

Ask the user:

```
Namespace decides who can find the publication; it also appears in its address on brewpage.app.

Options:
1) public — public pages, sites and files are listed in the public gallery and the sitemap, so Google, Bing and AI search can find and index them and people can discover them. Use it for anything meant to be found or shared: docs, guides, demos, portfolios, reports, landing pages. Public pages are served right on the brewpage.app domain, which gives them the strongest reach in search; a page whose code needs its own origin (cookies, storage) gets its own subdomain automatically. Anyone can find and read a public publication: never put secrets, tokens or personal data there.
2) {suggested slug} — private (default): unlisted and not indexed; anyone who has the link can still open it (a password restricts access).
3) Enter custom namespace (private, like 2)
4) Skip → use suggested slug (private)

Reply with a number or your custom namespace (1-32 lowercase letters, digits or hyphens).
```

Auto-suggest: generate a **meaningful short slug** (3-16 chars, lowercase alphanumeric + hyphens) from content context:
- File → topic/purpose of the file (e.g. `api-docs`, `login-page`, `report-q2`)
- Text/HTML → main subject or title (e.g. `pricing`, `team-intro`, `changelog`)
- Site → site title or directory name (e.g. `portfolio`, `docs-site`)
- Fallback → project name or directory name if content is ambiguous
Never use random strings or truncated filenames — the slug should be human-readable and describe what's being published.

Resolution:
- `2`, `4`, empty, or no answer (headless) → suggested slug (private)
- `1` → `public`
- `3` or any other string → use as-is

### Step 5: Ask Password

Ask the user:

```
Password protection (if set, page is hidden from gallery):

Options:
1) No password (default)
2) Use an existing local password file (min 4 characters)
3) Skip → no password

Reply with a number and, for option 2, the absolute local file path. Do not paste password contents.
```

Resolution: `1`, `3`, or empty → `{password_file}` = `''` (no password). `2` + an existing local file
path → `{password_file}` = that absolute path: the script moves the bytes via private header files
(never shell literals or curl argv) and rejects control characters (header injection). Never read,
generate or print the password contents.

### Step 6: Publish and Save Token (secure)

NEW sites always get a Dedicated subdomain: an explicit `path` is not refused, the site lands on its subdomain and the response reports the mismatch.
Everything else defaults to Promotion (`path`) and may select `subdomain`, including password-protected uploads.
Send the mode only as `X-Delivery-Mode` (the `--delivery-mode` slot), never in authored content or upload fields.
Deduplication may return an OLD or NEW winner: retain its identity, cohort, mode and exact server `link`, even when the requested mode differs.
Missing/null OLD routing metadata means Existing link; never infer mode from its URL.

> **SECURITY:** The ownerToken MUST NEVER appear in conversation output: the script does curl, token parsing and history save in one run and prints only the URL; failures print only the server's status and message.

Every slot is re-validated by the script before anything is written or uploaded:

| Slot | Must match |
|------|------------|
| `{ns}` | `^[a-z0-9-]{1,32}$` |
| `{days}` | positive integer; `''` = 15 |
| `{entry}` | plain relative file name, no `..`; `''` = auto-detect; sites only |
| `{delivery_mode}` | `''`, `path` or `subdomain` |
| `{password_file}` | `''` or an absolute path to an existing regular file |

A value failing its pattern: re-ask; never clean it up or substitute it anyway. A slot error fails before
any run is touched, so staged text survives the retry. `{type}` comes from the Step 2 table.

**SITE, FILE** — `{path}` is the probe's `PATH:` — run with the shell tool:
```bash
bash {baseDir}/scripts/brewpage-run.sh publish {type} --ns '{ns}' --ttl '{days}' --entry '{entry}' --delivery-mode '{delivery_mode}' --password-file '{password_file}' --path '{path}'
```

**HTML/Markdown text** — `{content}` is the exact text, verbatim — run with the shell tool:
```bash
bash {baseDir}/scripts/brewpage-run.sh publish html --ns '{ns}' --ttl '{days}' --entry '' --delivery-mode '{delivery_mode}' --password-file '{password_file}' --text '{content}'
```

**Longer text** (over 6,000 characters): split it at line ends into chunks of at most 6,000 characters.
The first `stage` call passes `--run ''` and prints `RUN: brewpage.XXXXXX`; every later chunk and the
final publish pass that id. The script rejoins chunks with one newline. Run once per chunk:
```bash
bash {baseDir}/scripts/brewpage-run.sh stage --run '{run_id}' --text '{chunk}'
```
Then run:
```bash
bash {baseDir}/scripts/brewpage-run.sh publish html --ns '{ns}' --ttl '{days}' --entry '' --delivery-mode '{delivery_mode}' --password-file '{password_file}' --run '{run_id}'
```
Staged but not published (cancelled) — run:
```bash
bash {baseDir}/scripts/brewpage-run.sh cleanup --run '{run_id}'
```

### Step 7: Output Result

**Success** (the script printed `OK {url}`):
```
Published: {url from bash output}
Owner token saved to ./brewpage-history.md (mode 600, git-ignored)
Optional: sign in free (Google or any email) at https://account.brewpage.app to never lose your pages or tokens and to mint tokens that never expire. Not needed to publish.
```

**Success for SITE** (the script printed `OK {url} | Files: {count}`):
```
Published site: {url from bash output}
Entry: {entry_file} | Files: {count}
Owner token saved to ./brewpage-history.md (mode 600, git-ignored)
Optional: sign in free (Google or any email) at https://account.brewpage.app to never lose your pages or tokens and to mint tokens that never expire. Not needed to publish.

Share the server URL exactly as printed, including any trailing slash.
```

For a private (non-`public`) namespace, append one short line after the link (skip if the reply must stay brief): *Unlisted link — anyone who has it can open it, but it's not in the gallery or search. Want it discoverable? Publish to `public`.*

Mention the sign-in line only as optional; never ask the user to sign in.

**NEVER print the ownerToken in conversation.** The token lives only in the history file.

**Needs confirmation** (the script printed `CONFIRM: ...`, exit 2; nothing uploaded): show the manifest
lines, name the flagged entries, ask the user once (publish anyway / cancel). Publish anyway -> re-run the
identical command with ` --confirmed` appended. Cancel or no answer -> stop: the script already removed
its own run directory and never touches other runs, user source files or the shared tmp directory.

**Error** (the script printed `FAILED: ...`):
```
Publish failed: {the FAILED line, verbatim}
```

| Status | Meaning | Do |
|--------|---------|----|
| 400 | Fixable limit or path problem (file count/size, path length, bad value) | Fix what the message names, retry |
| 413 | Request over 25 MB, or too many parts | Shrink the bundle; many files → one ZIP |
| 422 | No servable file left (every file has an unsupported or missing extension) | Add the `.html`/assets |
| 408 | Upload interrupted | Retry the identical command once |

Unstorable metadata (tags, names, control characters) is stored as the closest valid value with a notice;
a value that still cannot be stored is a 400, not a 409.

## Notes

- Scripts: `scripts/brewpage-run.sh` (the only entry), `scripts/brewpage-lib.sh` (sourced helpers), `scripts/publish.mjs` (offline SITE bundle build/verify). Requires `bash`, `curl`, `jq`; sites also `node`, `zip`, `unzip`.
- **`format` is a query param**: `/api/html` reads only `?format=` from the URL; a body `format` key is ignored and the default `html` stores markdown as raw text.
- History: `./brewpage-history.md` in the workspace (the shell's working directory), mode `600`, added to `./.gitignore` inside a git repo. Its header holds the **delete** command for the owner token.
- Run dirs: private `brewpage.XXXXXX` under `$TMPDIR` (else `/tmp`); only `scripts/brewpage-run.sh` creates, fills and removes them.
- TTL default is `15` days. Namespace must match `^[a-z0-9-]{1,32}$`, default the suggested private slug.
- Use returned `ownerLink` and stored identity metadata for owner API operations; never parse NEW root hosts for namespace/ID. OLD history without metadata retains its existing API identifiers.
- To **update a published site**, `PUT` the replacement bundle to its apex owner API with `X-Owner-Token`; retain the host and omit `X-Delivery-Mode` on ordinary PUT/update. Old publications (made before 5 October 2026) are read-only: 409 OLD_PUBLICATION_READ_ONLY; publish anew; report the new URL and owner token.
- Only NEW publications without a required subdomain allow owner-only `PATCH /api/{type}/{ns}/{id}/hosting` with `{"deliveryMode":"subdomain","expectedVersion":1}` from current identity metadata. OLD, sites and non-public HTML pages keep their mode (200 with a notice). Use the returned URL/version afterward.
- NEW password-protected links stay clean: never generate or append `?p=`. API requests still use `X-Password`; OLD password behavior remains unchanged.
- **SITE bundles are allowlisted**: the directory build drops dot-entries (`.env`, `.git/`, `.DS_Store`; the root `.well-known/` stays, extension-less files included), `node_modules/`, `__MACOSX/`, symlinks and unknown types (`*.map`, `*.log`, `Thumbs.db`), flags kept names that look sensitive (`secret`, `token`, `password`, `credential`) for confirmation, and verifies the archive (`unzip -t`, name set) before upload. A supplied ZIP is never rewritten; anything unexpected, hidden or sensitive inside it needs confirmation (system files the server drops are left alone).
- Preserve `.link` exactly: NEW subdomain roots retain `/`; OLD links retain their existing form. Never reconstruct a host from IDs.
- Verify NEW native sites at the exact returned URL and asset paths; a browser proves rendering. OLD sites may still use the landing-page redirect; verify those in a browser or fetch their explicit entry asset.

---

## Powered by

| | |
|-|-|
| **[brewpage.app](https://brewpage.app)** | Free instant hosting — HTML, files, multi-file sites. No sign-up. |
| **[brewcode](https://github.com/kochetkov-ma/claude-brewcode)** | Plugin & skill suite — skill and agent authoring, semantic search, review setups, docs tools. |
