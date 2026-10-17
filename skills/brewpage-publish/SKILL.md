---
name: brewpage-publish
description: "Publish content to brewpage.app — text, markdown, JSON, file, or multi-file site. Asks namespace and password, returns public URL. Triggers: publish, share link, upload to brewpage, host page, brewpage, publish site, upload site, upload directory, deploy site, сделай публичную ссылку, опубликуй."
user-invocable: true
disable-model-invocation: false
argument-hint: "<text|file_path|directory_path|zip_path> [--ttl N] [--entry filename] [--delivery-mode path|subdomain]"
allowed-tools: [Read, 'Bash(bash ${CLAUDE_SKILL_DIR}/scripts/brewpage-run.sh *)', AskUserQuestion, Glob]
model: haiku
license: MIT
---

# brewpage-publish

Publish content to **brewpage.app** — free instant hosting for HTML pages, JSON documents, files, and multi-file sites. No sign-up required.

## Running commands

Every shell step is ONE command of the exact shape in the fences below: the single `allowed-tools`
rule pre-approves exactly that shape, so the skill never prompts, headless included.

- Fill each `'{…}'` slot with the raw value and write every `'` inside it as `'\''`; nothing else is
  escaped. Never wrap a value in double quotes. An empty slot stays `''` (= omitted).
- Never quote the script path, prefix or chain the command (`cd`, `VAR=…`, `;`, `&&`, `|`, `$(…)`): any
  other shape falls back to the normal permission prompt.
- Keep every command under 8,000 characters (longer ones are always refused); longer text goes
  through `stage` (Step 6).
- The script prints one decisive line: `OK {url}`, `OK {url} | Files: N`, `CONFIRM: …` (exit 2,
  nothing uploaded) or `FAILED: …`. It removes its private run directory on every exit.

## Workflow

### Step 1: Parse Arguments

Extract from `$ARGUMENTS`:
- `--ttl N` → TTL in days (default: `15`)
- `--entry <filename>` → entry file for SITE uploads (default: auto-detect)
- `--delivery-mode path|subdomain` → optional creation header; omitted means server defaults. Reject other values before upload.
- Remaining text → `content_arg`: a path, or the exact text to publish. Fired by Claude mid-task, the
  arguments are the path or the verbatim text, never a summary of it. Nothing to publish → ask once what to publish.

### Step 2: Detect Content Type

A `content_arg` that names a path -> probe it (read-only; prints `TYPE:`, the absolute `PATH:` to use
below, and the Step 3 stats) — **EXECUTE** using Bash tool:

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/brewpage-run.sh probe '{path}'
```

| Input | Type | `publish` type + source | API |
|-------|------|-------------------------|-----|
| `TYPE: site-dir` | SITE | `site-dir` + `--path` | `POST /api/sites` (ZIP built from the dir — primary path) |
| `TYPE: site-zip` (`.zip` file) | SITE | `site-zip` + `--path` | `POST /api/sites` (pre-built archive upload) |
| `TYPE: file` or `TYPE: markdown` (any other file) | FILE | `file` + `--path` | `POST /api/files` (multipart) |
| No path (`TYPE: none`), `content_arg` starts with `{` or `[` | JSON | `json` + `--text` | `POST /api/json` |
| Anything else | HTML | `html` + `--text` | `POST /api/html` (format=markdown) |

Mode rule: directory/ZIP → SITE. Single file → FILE. `POST /api/sites` accepts a multipart `archive=@file.zip` or repeated `files` and matching `paths` fields; the script zips a directory to preserve relative paths.

### Step 3: Show Pre-Publish Stats

From the probe lines — SITE (dir): `HTML`, `SIZE_KB`, `ENTRY`. SITE (ZIP): `BYTES`, entry override. FILE: `BYTES` + `MIME`. Text/JSON: char count.

For HTML/JSON/FILE:
```
Content:  <type description> · <size> · <api endpoint>
TTL:      <N> days
```

For SITE (entry: `--entry` > `index.html` > first `.html` alphabetically; `ENTRY: none` → fail with an explicit error, never guess):

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

### Step 4: Ask Namespace

Use **AskUserQuestion**:

```
Namespace controls discovery and appears in publication addresses on brewpage.app.
By default publishing is PRIVATE (unlisted): not in the public gallery and not indexed by search engines. The link is not secret, though — anyone who has it can open it (use a password to restrict access).
Choose `public` for eligible gallery discovery. Eligible public HTML, sites and files may permit indexing on either address; unlisted, protected or otherwise ineligible native responses retain `noindex, nofollow`. Indexing is not guaranteed.

Options:
1) public — eligible gallery discovery; eligible publications may permit indexing
2) {suggested slug} — private, link-only (default)
3) Enter custom namespace
4) Skip → use suggested slug (private)

Reply with a number or your custom namespace (1-32 lowercase letters, digits or hyphens).
```

Auto-suggest: generate a **meaningful short slug** (3-16 chars, lowercase alphanumeric + hyphens) from content context:
- File → topic/purpose of the file (e.g. `api-docs`, `login-page`, `report-q2`)
- Text/HTML → main subject or title (e.g. `pricing`, `team-intro`, `changelog`)
- JSON → data type or schema name (e.g. `user-config`, `metrics`)
- Fallback → project name or directory name if content is ambiguous
Never use random strings or truncated filenames — the slug should be human-readable and describe what's being published.

Resolution: `2`, `4`, empty, or no answer (headless) → suggested slug | `1` → `public` | `3` or any other string → use as-is.

### Step 5: Ask Password

Use **AskUserQuestion**:

```
Password protection (if set, page is hidden from gallery):

Options:
1) No password (default)
2) Use an existing local password file (min 4 characters)
3) Skip → no password

Reply with a number and, for option 2, the absolute local file path. Do not paste password contents.
```

Resolution: `1`, `3`, empty, or no answer → `{password_file}` = `''` (no password). `2` + an existing
local file path → `{password_file}` = that absolute path: the script moves the bytes via private header
files (never shell literals or curl argv) and rejects control characters (header injection). Never Read,
generate or print the password contents.

### Step 6: Publish and Save Token (secure)

Delivery mode: NEW sites and non-public namespaces require Dedicated subdomain (`subdomain`; explicit `path` is
rejected); NEW public non-sites default to Promotion (`path`) and may select `subdomain`, password-protected
included. Send it only as `X-Delivery-Mode`, never in authored JSON, text or multipart fields. A deduplicated
OLD or NEW winner may differ: keep its identity, cohort, mode and exact `link`. Missing/null OLD routing
metadata means Existing link; never infer mode from its address.

> **SECURITY:** the ownerToken NEVER appears in conversation output: the script does curl, token parsing and history save in one run and prints only the URL; failures print no response body.

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

**SITE, FILE** — `{path}` is the probe's `PATH:` — **EXECUTE** using Bash tool:
```bash
bash ${CLAUDE_SKILL_DIR}/scripts/brewpage-run.sh publish {type} --ns '{ns}' --ttl '{days}' --entry '{entry}' --delivery-mode '{delivery_mode}' --password-file '{password_file}' --path '{path}'
```

**HTML text, JSON** — `{content}` is the exact text or JSON, verbatim — **EXECUTE** using Bash tool:
```bash
bash ${CLAUDE_SKILL_DIR}/scripts/brewpage-run.sh publish {type} --ns '{ns}' --ttl '{days}' --entry '' --delivery-mode '{delivery_mode}' --password-file '{password_file}' --text '{content}'
```

**Longer text or JSON** (the command would pass 8,000 characters): split it at line ends into chunks
of at most 6,000 characters. The first `stage` call passes `--run ''` and prints `RUN: brewpage.XXXXXX`;
every later chunk and the final publish pass that id. The script rejoins chunks with one newline.
**EXECUTE** using Bash tool, once per chunk:
```bash
bash ${CLAUDE_SKILL_DIR}/scripts/brewpage-run.sh stage --run '{run_id}' --text '{chunk}'
```
Then **EXECUTE** using Bash tool:
```bash
bash ${CLAUDE_SKILL_DIR}/scripts/brewpage-run.sh publish {type} --ns '{ns}' --ttl '{days}' --entry '' --delivery-mode '{delivery_mode}' --password-file '{password_file}' --run '{run_id}'
```
Staged but not published (cancelled) — **EXECUTE** using Bash tool:
```bash
bash ${CLAUDE_SKILL_DIR}/scripts/brewpage-run.sh cleanup --run '{run_id}'
```

### Step 7: Output Result

**Success** (the script printed `OK {url}`):
```
Published: {url from bash output}
Owner token saved to <project-root>/.claude/brewpage-history.md (mode 600, git-ignored)
```

**Success for SITE** (the script printed `OK {url} | Files: {count}`):
```
Published site: {url from bash output}
Entry: {entry_file} | Files: {count}
Owner token saved to <project-root>/.claude/brewpage-history.md (mode 600, git-ignored)

Share the server URL exactly as printed, including any trailing slash.
```

For a private (non-`public`) namespace, append one short line after the link (skip if the reply must stay ultra-brief): *Unlisted link — anyone who has it can open it, but it's not in the gallery or search. Want it discoverable? Publish to `public`.*

**NEVER print the ownerToken in conversation.** The token lives only in the history file.

**Needs confirmation** (the script printed `CONFIRM: ...`, exit 2; nothing uploaded): show the manifest
lines, name the flagged entries, ask ONE `AskUserQuestion` (publish anyway / cancel). Publish anyway ->
re-run the identical command with ` --confirmed` appended. Cancel or no answer -> stop: the script already
removed its own run directory and never touches other runs, user source files or the shared tmp directory.

**Error** (the script printed `FAILED: ...`):
```
Publish failed: {the FAILED line, verbatim}
```

## Notes

- Scripts: `scripts/brewpage-run.sh` (the only entry), `scripts/brewpage-lib.sh` (sourced helpers), `scripts/publish.mjs` (offline SITE bundle build/verify). Requires `bash`, `curl`, `jq`; sites also `node`, `zip`, `unzip`.
- **`format` is a query param**: `/api/html` reads only `?format=` from the URL; a body `format` key is ignored and the default `html` stores markdown as raw text.
- History: `<project-root>/.claude/brewpage-history.md` (root: `CLAUDE_PROJECT_DIR` → git toplevel → upward `.git`/`.claude` walk, profile dirs skipped → `PWD`), mode `600`, added to the project `.gitignore`. Its header holds the **delete** command for the owner token.
- Run dirs: private `brewpage.XXXXXX` under `$TMPDIR` (else `/tmp`), outside the protected `.claude/`; only `scripts/brewpage-run.sh` creates, fills and removes them, so the skill needs no `Write`/`Edit` grant.
- Permissions: model-invocable, so `allowed-tools` holds one scoped Bash rule that matches every step above. A skill directory path containing spaces breaks the unquoted command shape.
- TTL default is `15` days; stored `createdAt`/`expiresAt` are authoritative: a deduplicated winner keeps its original expiry, and ordinary PUT/update does not renew it.
- Use returned `ownerLink` and stored identity metadata for owner API operations; never parse NEW root hosts for namespace/ID. OLD history without metadata retains its existing API identifiers.
- To **update a published site**, `PUT` the replacement bundle to its apex owner API with `X-Owner-Token`; it replaces the file set and keeps the host. Omit `X-Delivery-Mode` on ordinary PUT/update.
- Only NEW public non-sites allow owner-only `PATCH /api/{type}/{ns}/{id}/hosting` with `{"deliveryMode":"subdomain","expectedVersion":1}` from current identity metadata. OLD, sites and non-public identities have no mode choice. Use the returned URL/version afterward.
- NEW password-protected links stay clean: never generate or append `?p=`. API requests use `X-Password`; OLD password behavior remains unchanged.
- **SITE bundles are allowlisted**: the directory build drops dot-entries (`.env`, `.git/`, `.DS_Store`), `node_modules/`, symlinks and unknown types (`*.map`, `*.log`, `Thumbs.db`), flags kept names that look sensitive (`secret`, `token`, `password`, `credential`) for confirmation, and verifies the archive (`unzip -t`, name set) before upload. A supplied ZIP is never rewritten; anything unexpected or sensitive inside it needs confirmation.
- Preserve `.link` exactly: NEW subdomain roots retain `/`; OLD links retain their existing form. Never reconstruct a host from IDs.
- Verify NEW native sites at the exact returned URL and asset paths; a browser proves rendering. OLD sites may still use the landing-page redirect; verify those in a browser or fetch their explicit entry asset.

---

## Powered by

| | |
|-|-|
| **[brewpage.app](https://brewpage.app)** | Free instant hosting — HTML, JSON, files, sites, KV. No sign-up. |
| **[brewcode](https://github.com/kochetkov-ma/claude-brewcode)** | Claude Code plugin suite — skill and agent authoring, semantic search, review setups, docs tools. |
