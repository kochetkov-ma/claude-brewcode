---
name: publish
description: "Publish text/markdown/file/site to brewpage.app, returns URL. Triggers: publish, share link, brewpage, опубликуй."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] <text|file_path|directory_path|zip_path> [--ttl N] [--entry filename] [--delivery-mode path|subdomain]"
allowed-tools: [Read, Write, Bash, AskUserQuestion, Glob]
model: haiku
---

# brewdoc:publish

Publishes HTML/Markdown, JSON, files and multi-file sites to **brewpage.app** (free, no sign-up) and returns the URL.

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; the content (text, file/dir/zip path) and the flags `--ttl N`,
`--entry <filename>`, `--delivery-mode path|subdomain` may sit anywhere in it.

1. Mode: the content type of what is published — detected in Step 2, scored by the keyword table there.
2. Scope: a sentence naming a file/dir resolves to that file/dir (e.g. "publish my report.md" ->
   `content_arg = report.md`, resolved against cwd). Never guess, never silently fall back to an empty
   HTML page.
3. Ask: a sentence with no path and no inline text/JSON has nothing to publish -> ONE `AskUserQuestion`
   asking what to publish. Namespace and password -> the two dedicated `AskUserQuestion` calls in Steps
   4-5; nothing else asks.

Print once, before the first tool action, including filesystem probes and questions (labels literal,
values in the conversation language). Use `unresolved` for type/namespace/password until determined;
report resolved stats in Step 3.

```
PLAN — brewdoc:publish
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <detected type — SITE|MARKDOWN|FILE|JSON|HTML> — <matched extension/shape | prose-resolved path>
SCOPE:  namespace=<ns>; ttl=<days>; password=<set|none>; delivery-mode=<server-default|path|subdomain>
DO:     <2-5 imperative bullets>
RESULT: <published URL>
```

## Workflow

### Step 1: Parse Arguments

Extract from the prompt:
- `--ttl N` → TTL in days (default: `15`)
- `--entry <filename>` → entry file for SITE uploads (default: auto-detect)
- `--delivery-mode path|subdomain` → optional creation header; omitted = server default; reject other values before upload
- Remaining text → `content_arg`, per Prompt contract rules 2-3

### Step 2: Detect Content Type

| Input | Type | API | EN keywords | RU keywords | Mutates? |
|-------|------|-----|--------------|--------------|----------|
| `content_arg` is a directory (`test -d`) | SITE | `POST /api/sites` (ZIP created from dir) | publish site, publish folder/directory | опубликуй сайт, опубликуй папку | yes |
| `content_arg` ends with `.zip` AND file exists (`test -f`) | SITE | `POST /api/sites` (archive upload) | publish zip, publish archive | опубликуй архив, опубликуй zip | yes |
| `content_arg` is a `.md`/`.markdown` file AND exists (`test -f`) | MARKDOWN | `POST /api/html` (format=markdown, content read from the file — renders styled, NOT a raw download) | publish markdown, share this .md | опубликуй markdown, поделись .md | yes |
| `content_arg` is a file path AND file exists (`test -f`) | FILE | `POST /api/files` (multipart) | publish file, share this file | опубликуй файл, поделись файлом | yes |
| `content_arg` starts with `{` or `[` | JSON | `POST /api/json` | publish json, share this json | опубликуй json | yes |
| Anything else | HTML | `POST /api/html` (format=markdown) | publish text, share link, publish this | опубликуй текст, поделись ссылкой | yes |

### Step 3: Show Pre-Publish Stats

SITE (dir): HTML count, total size, entry. SITE (ZIP): file size, entry override. FILE: size + MIME (`file --mime-type -b`). Text/JSON: char count.

For HTML/MARKDOWN/JSON/FILE:
```
Content:  <type description> · <size> · <api endpoint>
TTL:      <N> days
```

For SITE (entry: `--entry` > `index.html` > first `.html` alphabetically; no `.html` → fail with an explicit error, never guess):
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

Suggested slug: 3-16 chars of `a-z0-9-` named after the content (`api-docs`, `report-q2`,
`pricing`, `user-config`), else the project or directory name; never random strings or truncated filenames.

Resolution: `2`, `4`, or empty → suggested slug | `1` → `public` | `3` or any other string → use as-is.

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

Resolution: `1`, `3`, or empty → `password_mode=none` (ignores every password file, stale ones included);
`2` + an existing local file path → `file`: Write only the path into `<run_dir>/brewpage-password-source.txt`;
the helper moves the bytes via private header files (never shell literals or curl argv) and rejects control
characters (header injection). Never Read, generate or print the password contents.

### Step 6: Publish and Save Token (secure)

Delivery mode: NEW sites and non-public namespaces require Dedicated subdomain (`subdomain`; explicit `path` is
rejected); NEW public non-sites default to Promotion (`path`) and may select `subdomain`, password-protected
included. Send it only as `X-Delivery-Mode`, never in authored JSON, text or multipart fields. A deduplicated
OLD or NEW winner may differ: keep its identity, cohort, mode and exact `link`. Missing/null OLD routing
metadata means Existing link; never infer mode from its address.

> **SECURITY:** the ownerToken NEVER appears in conversation output: each block does curl, token parsing and history save in one run and prints only the URL; failures print no response body.

**Nothing prompt-derived is pasted into shell source**: content, JSON, the password and the target path travel
as FILES. Only these placeholders, plus `{run_id}` and `{password_mode}` (`none|file`), are substituted, inside
SINGLE quotes, after you validated them:

| Placeholder | Must match | Re-checked by |
|-------------|------------|---------------|
| `{ns}` | `^[a-z0-9-]{1,32}$` | `bp_validate` |
| `{days}` | positive integer | `bp_validate` |
| `{entry}` | plain relative file name, no `..`; empty string when auto-detecting | `bp_validate` |
| `{delivery_mode}` | empty string when omitted, otherwise `path` or `subdomain` | `bp_begin` |

A value failing its pattern: re-ask; never clean it up or substitute it anyway.

**Allocate the private run directory** (after Steps 4-5, before any input) — **EXECUTE** using Bash tool:

```bash
. "${CLAUDE_SKILL_DIR}/scripts/brewpage-lib.sh" || exit 1
bp_prepare
```

The printed absolute path (under `$TMPDIR`, else `/tmp`) is `run_dir`; its `brewpage.XXXXXX` basename is `run_id`.
Never reuse a previous run, read shared `brewpage-*` inputs, or take a user-supplied run id. `Write` the inputs into it (mode 700):

| File | Written for | Contents |
|------|-------------|----------|
| `brewpage-content.md` | HTML text; MARKDOWN (`Read` the file first) | text, verbatim |
| `brewpage-payload.json` | JSON | JSON, verbatim |
| `brewpage-target-path.txt` | FILE / SITE(dir) / SITE(zip) | absolute source path, one line |
| `brewpage-password-source.txt` | `file` password mode | absolute password-file path, one line; never its contents |

Run exactly ONE block below, by type (MARKDOWN → the HTML/Markdown block); each re-validates its
placeholders in `bp_begin` and prints one `OK`/`FAILED`/`CONFIRM:` line.

**HTML/Markdown text** — **EXECUTE** using Bash tool:
```bash
set -euo pipefail
. "${CLAUDE_SKILL_DIR}/scripts/brewpage-lib.sh" || { echo "FAILED: publish helper library not found"; exit 1; }
bp_begin '{ns}' '{days}' '' '{run_id}' '{password_mode}' '{delivery_mode}' || exit 1

PAYLOAD_FILE="$BP_RUN_DIR/payload.json"
jq -n --rawfile c "$BP_RUN_DIR/brewpage-content.md" '{content: $c}' > "$PAYLOAD_FILE"
RESPONSE=$(bp_post "https://brewpage.app/api/html?ns=$NS&ttl=$DAYS&format=markdown" \
  -H "Content-Type: application/json" -d @"$PAYLOAD_FILE")
bp_finish "$RESPONSE" "$DAYS" html
```

**JSON** — **EXECUTE** using Bash tool:
```bash
set -euo pipefail
. "${CLAUDE_SKILL_DIR}/scripts/brewpage-lib.sh" || { echo "FAILED: publish helper library not found"; exit 1; }
bp_begin '{ns}' '{days}' '' '{run_id}' '{password_mode}' '{delivery_mode}' || exit 1

PAYLOAD_FILE="$BP_RUN_DIR/brewpage-payload.json"
jq empty "$PAYLOAD_FILE" 2>/dev/null || { echo "FAILED: payload is not valid JSON"; exit 1; }
RESPONSE=$(bp_post "https://brewpage.app/api/json?ns=$NS&ttl=$DAYS" \
  -H "Content-Type: application/json" -d @"$PAYLOAD_FILE")
bp_finish "$RESPONSE" "$DAYS" json
```

**File** — **EXECUTE** using Bash tool:
```bash
set -euo pipefail
. "${CLAUDE_SKILL_DIR}/scripts/brewpage-lib.sh" || { echo "FAILED: publish helper library not found"; exit 1; }
bp_begin '{ns}' '{days}' '' '{run_id}' '{password_mode}' '{delivery_mode}' || exit 1

SRC=$(cat "$BP_RUN_DIR/brewpage-target-path.txt") || { echo "FAILED: target path missing"; exit 1; }
[ -f "$SRC" ] || { echo "FAILED: not a file: $SRC"; exit 1; }
RESPONSE=$(bp_post "https://brewpage.app/api/files?ns=$NS&ttl=$DAYS" -F "file=@$SRC")
bp_finish "$RESPONSE" "$DAYS" file
```

**Site (directory)** — **EXECUTE** using Bash tool:
```bash
set -euo pipefail
. "${CLAUDE_SKILL_DIR}/scripts/brewpage-lib.sh" || { echo "FAILED: publish helper library not found"; exit 1; }
bp_begin '{ns}' '{days}' '{entry}' '{run_id}' '{password_mode}' '{delivery_mode}' || exit 1

SRC=$(cat "$BP_RUN_DIR/brewpage-target-path.txt") || { echo "FAILED: target path missing"; exit 1; }
TMPZIP="$BP_RUN_DIR/site.zip"
RC=0
MANIFEST=$(node "${CLAUDE_SKILL_DIR}/scripts/publish.mjs" pack --dir "$SRC" --out "$TMPZIP" ${ENTRY:+--entry "$ENTRY"}) || RC=$?
printf '%s\n' "$MANIFEST"
bp_archive_gate "$RC" "$MANIFEST" "$TMPZIP" || exit $?

ENTRY_QUERY=$(jq -nr --arg entry "$ENTRY" '$entry | @uri')
RESPONSE=$(bp_post "https://brewpage.app/api/sites?ns=$NS&ttl=$DAYS&entry=$ENTRY_QUERY" \
  -H "User-Agent: ClaudeCode/1.0" -F "archive=@$TMPZIP")
bp_finish "$RESPONSE" "$DAYS" site
```

**Site (ZIP file)** — **EXECUTE** using Bash tool:
```bash
set -euo pipefail
. "${CLAUDE_SKILL_DIR}/scripts/brewpage-lib.sh" || { echo "FAILED: publish helper library not found"; exit 1; }
bp_begin '{ns}' '{days}' '{entry}' '{run_id}' '{password_mode}' '{delivery_mode}' || exit 1

SRC=$(cat "$BP_RUN_DIR/brewpage-target-path.txt") || { echo "FAILED: target path missing"; exit 1; }
RC=0
MANIFEST=$(node "${CLAUDE_SKILL_DIR}/scripts/publish.mjs" inspect --zip "$SRC" ${ENTRY:+--entry "$ENTRY"}) || RC=$?
printf '%s\n' "$MANIFEST"
bp_archive_gate "$RC" "$MANIFEST" "" || exit $?

ENTRY_QUERY=$(jq -nr --arg entry "$ENTRY" '$entry | @uri')
RESPONSE=$(bp_post "https://brewpage.app/api/sites?ns=$NS&ttl=$DAYS&entry=$ENTRY_QUERY" \
  -H "User-Agent: ClaudeCode/1.0" -F "archive=@$SRC")
bp_finish "$RESPONSE" "$DAYS" site
```

### Step 7: Output Result

**Success** (bash printed `OK {url}`):
```
Published: {url from bash output}
Owner token saved to <project-root>/.claude/brewpage-history.md (mode 600, git-ignored)
```

**Success for SITE** (bash printed `OK {url} | Files: {count}`):
```
Published site: {url from bash output}
Entry: {entry_file} | Files: {count}
Owner token saved to <project-root>/.claude/brewpage-history.md (mode 600, git-ignored)

Share the server URL exactly as printed, including any trailing slash.
```

For a private (non-`public`) namespace, append one short line after the link (skip if the reply must stay brief): *Unlisted link — anyone who has it can open it, but it's not in the gallery or search. Want it discoverable? Publish to `public`.*

**Needs confirmation** (bash printed `CONFIRM: ...`, exit 2; nothing uploaded): show the manifest lines, name
the flagged entries, ask ONE `AskUserQuestion` (publish anyway / cancel). Publish anyway -> fresh run, rewrite
inputs, re-run with `BREWPAGE_CONFIRMED=1`. Blocks clean their own run on any exit; cancelled before a block
ran -> source the helper, `bp_run_dir '{run_id}' && bp_cleanup`, stop. Never delete other runs, user source
files or the shared tmp directory.

**Error** (bash printed `FAILED: ...`):
```
Publish failed: {the FAILED line, verbatim}
```

## Notes

- **`format` is a query param**: `/api/html` reads only `?format=` from the URL; a body `format` key is ignored and the default `html` stores markdown as raw text.
- History: `<project-root>/.claude/brewpage-history.md` (root: `CLAUDE_PROJECT_DIR` → git toplevel → upward `.git`/`.claude` walk → `PWD`, via `scripts/brewpage-lib.sh`), mode `600`, added to the project `.gitignore`. Its header holds the **delete** command for the owner token.
- Run dirs live outside `.claude/` (protected path: `Write` there is denied in `dontAsk`; allow rules never pre-approve it). `dontAsk`/headless runs need a `Write` allow rule for `$TMPDIR`.
- History TTL = requested days; stored `createdAt`/`expiresAt` are authoritative: a deduplicated winner keeps its original expiry, and ordinary PUT/update does not renew it.
- Owner API calls use the returned `ownerLink` and stored identity metadata, never a NEW root hostname parsed for namespace/ID; OLD rows without metadata keep their existing API identifiers.
- **Update a site**: `PUT` the new bundle to its apex owner API with `X-Owner-Token`; it replaces the file set and keeps the host. No `X-Delivery-Mode` on ordinary PUT/update.
- Hosting change, NEW public non-sites only (OLD, sites and non-public identities have no mode choice): owner-only `PATCH /api/{type}/{ns}/{id}/hosting` with `{"deliveryMode":"subdomain","expectedVersion":1}` from current identity metadata; then use the returned URL/version.
- NEW password-protected links stay clean: never generate or append `?p=`. API password requests use `X-Password`; OLD password behavior is unchanged.
- **SITE bundles are allowlisted**: `pack` drops dot-entries (`.env`, `.git/`, `.DS_Store`), `node_modules/`, symlinks and unknown types, and verifies the archive (`unzip -t`, name set) before `curl`, else deletes it and exits 1. `inspect` never rewrites a supplied ZIP; it exits 2 when anything unexpected or sensitive is inside.
- Keep `.link` exact (NEW subdomain roots keep `/`, OLD links their form); never reconstruct a host from IDs. Verify NEW native sites at the exact URL and asset paths in a browser; OLD sites may redirect via a landing page: check in a browser or fetch the explicit entry asset.
