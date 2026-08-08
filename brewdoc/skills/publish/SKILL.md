---
name: brewdoc:publish
description: "Publish text/markdown/file/site to brewpage.app, returns URL. Triggers: publish, share link, brewpage, опубликуй."
user-invocable: true
disable-model-invocation: true
argument-hint: "<text|file_path|directory_path|zip_path> [--ttl N] [--entry filename]"
allowed-tools: [Read, Bash, AskUserQuestion, Glob]
model: haiku
---

# brewdoc:publish

Publish content to **brewpage.app** — free instant hosting for HTML pages, JSON documents, files, and multi-file sites. No sign-up required.

## Workflow

### Step 1: Parse Arguments

Extract from `$ARGUMENTS`:
- `--ttl N` → TTL in days (default: `15`)
- `--entry <filename>` → entry file for SITE uploads (default: auto-detect)
- Remaining text → `content_arg`

### Step 2: Detect Content Type

| Input | Type | API |
|-------|------|-----|
| `content_arg` is a directory (`test -d`) | SITE | `POST /api/sites` (ZIP created from dir) |
| `content_arg` ends with `.zip` AND file exists (`test -f`) | SITE | `POST /api/sites` (archive upload) |
| `content_arg` is a `.md`/`.markdown` file AND exists (`test -f`) | MARKDOWN | `POST /api/html` (format=markdown, content read from the file — renders styled, NOT a raw download) |
| `content_arg` is a file path AND file exists (`test -f`) | FILE | `POST /api/files` (multipart) |
| `content_arg` starts with `{` or `[` | JSON | `POST /api/json` |
| Anything else | HTML | `POST /api/html` (format=markdown) |

Stats per type — SITE (dir): HTML count, total size, entry file. SITE (ZIP): file size, entry override. FILE: size + MIME via `file --mime-type -b`. TEXT/JSON: char count.

### Step 3: Show Pre-Publish Stats

For HTML/JSON/FILE:
```
Content:  <type description> · <size> · <api endpoint>
TTL:      <N> days
```

For SITE: detect entry file using priority: 1) `--entry` flag, 2) `index.html` exists, 3) first `.html` alphabetically. If no .html in dir → fail with explicit error, do not guess.
```
Content:  site · <N> files · <total_size> · POST /api/sites
Entry:    <entry_file>
TTL:      <N> days
```

### Step 4: Ask Namespace

Use **AskUserQuestion**:

```
Namespace sets the URL prefix, gallery visibility, and search-engine indexing on brewpage.app.
By default publishing is PRIVATE (unlisted): not in the public gallery and not indexed by search engines. The link is not secret, though — anyone who has it can open it (use a password to restrict access).
Choose `public` to make the page discoverable — listed in the gallery and indexed by search engines (e.g. a real site you want people to find).

Options:
1) public — listed in gallery + indexed by search engines
2) {auto-suggested 6-8 char slug} — private, link-only (default)
3) Enter custom namespace
4) Skip → use suggested slug (private)

Reply with a number or your custom namespace (alphanumeric, 3-32 chars).
```

Auto-suggest: generate a **meaningful short slug** (3-16 chars, lowercase alphanumeric + hyphens) from content context:
- File → topic/purpose (e.g. `api-docs`, `login-page`, `report-q2`)
- Text/HTML → main subject or title (e.g. `pricing`, `team-intro`, `changelog`)
- JSON → data type or schema name (e.g. `user-config`, `metrics`)
- Fallback → project name or directory name
Never use random strings or truncated filenames — slug must be human-readable.

Resolution: `2`, `4`, or empty → suggested slug | `1` → `public` | `3` or any other string → use as-is.

### Step 5: Ask Password

Use **AskUserQuestion**:

```
Password protection (if set, page is hidden from gallery):

Options:
1) No password (default)
2) Random: {generated 6-char password, e.g. "kx7p2m"}
3) Enter custom password (min 4 chars)
4) Skip → no password

Reply with a number or your custom password.
```

Generate random password **EXECUTE** using Bash tool:
```bash
LC_ALL=C tr -dc 'a-z0-9' < /dev/urandom | head -c6 2>/dev/null
```

Resolution: `1`, `4`, or empty → no password | `2` → use generated random password | `3` or custom text → use as-is.

> **MANDATORY substitution.** Every Bash block in Step 6 contains the literal placeholder `{password_header}`. Before running a block:
> - password set → replace `{password_header}` with `-H "X-Password: <the resolved password>"`
> - no password → delete the whole `  {password_header} \` line
>
> Never leave `{password_header}` literal in the command, and never report a password to the user unless you actually substituted it in the block you ran. Skipping this publishes the page UNPROTECTED while the output still says `Published:`.

### Step 6: Publish and Save Token (secure)

> **SECURITY:** The ownerToken MUST NEVER appear in conversation output. Bash blocks handle curl + token parsing + history save atomically; LLM sees only the URL. The failure branch prints no response body, so a token in an error payload never reaches the transcript.
>
> **`{password_header}` is a placeholder you substitute before running the block** — exactly like `{content}`, `{ns}`, `{days}`. There is no `$PASSWORD` shell variable; each Bash call is a fresh shell and nothing assigns it. See the substitution rule in Step 5.

Each block below self-initializes `.claude/brewpage-history.md` if absent.

> For a MARKDOWN **file** (type MARKDOWN from Step 2), use the **HTML/Markdown text** block below but replace the `CONTENT=$(cat <<'BREWPAGE_EOF' ...)` heredoc with `CONTENT=$(cat "/abs/path/to/file.md")`. Everything else (the `?format=markdown` endpoint, token handling, history row) is identical — this renders the `.md` as styled markdown instead of a raw downloadable file.

**HTML/Markdown text** — **EXECUTE** using Bash tool:
```bash
command -v jq >/dev/null || { echo "FAILED: jq required"; exit 1; }
HISTORY_FILE=".claude/brewpage-history.md"
if [ ! -f "$HISTORY_FILE" ]; then
  mkdir -p "$(dirname "$HISTORY_FILE")"
  cat > "$HISTORY_FILE" <<'HEADER'
# brewpage.app — Published Pages

> Owner tokens allow delete and in-place republish (html/json/kv/sites all support PUT). Keep this file private.
> Delete: `curl -s -X DELETE "https://brewpage.app/api/{ns}/{id}" -H "X-Owner-Token: TOKEN"`

| Date | URL | Owner Token | TTL | Type |
|------|-----|-------------|-----|------|
HEADER
fi

CONTENT=$(cat <<'BREWPAGE_EOF'
{content}
BREWPAGE_EOF
)
PAYLOAD=$(jq -n --arg c "$CONTENT" '{content: $c}')
RESPONSE=$(curl -s -X POST "https://brewpage.app/api/html?ns={ns}&ttl={days}&format=markdown" \
  -H "Content-Type: application/json" \
  {password_header} \
  -d "$PAYLOAD")

URL=$(echo "$RESPONSE" | jq -r '.link // empty')
TOKEN=$(echo "$RESPONSE" | jq -r '.ownerToken // empty')

if [ -n "$URL" ]; then
  [ -n "$TOKEN" ] && echo "| $(date '+%Y-%m-%d %H:%M') | [$URL]($URL) | \`$TOKEN\` | {ttl}d | html |" >> "$HISTORY_FILE"
  echo "OK $URL"
else
  echo "FAILED: publish rejected (no .link in response)"
fi
```

**JSON** — **EXECUTE** using Bash tool:
```bash
command -v jq >/dev/null || { echo "FAILED: jq required"; exit 1; }
HISTORY_FILE=".claude/brewpage-history.md"
if [ ! -f "$HISTORY_FILE" ]; then
  mkdir -p "$(dirname "$HISTORY_FILE")"
  cat > "$HISTORY_FILE" <<'HEADER'
# brewpage.app — Published Pages

> Owner tokens allow delete and in-place republish (html/json/kv/sites all support PUT). Keep this file private.
> Delete: `curl -s -X DELETE "https://brewpage.app/api/{ns}/{id}" -H "X-Owner-Token: TOKEN"`

| Date | URL | Owner Token | TTL | Type |
|------|-----|-------------|-----|------|
HEADER
fi

RESPONSE=$(curl -s -X POST "https://brewpage.app/api/json?ns={ns}&ttl={days}" \
  -H "Content-Type: application/json" \
  {password_header} \
  -d '{original_json}')

URL=$(echo "$RESPONSE" | jq -r '.link // empty')
TOKEN=$(echo "$RESPONSE" | jq -r '.ownerToken // empty')

if [ -n "$URL" ]; then
  [ -n "$TOKEN" ] && echo "| $(date '+%Y-%m-%d %H:%M') | [$URL]($URL) | \`$TOKEN\` | {ttl}d | json |" >> "$HISTORY_FILE"
  echo "OK $URL"
else
  echo "FAILED: publish rejected (no .link in response)"
fi
```

**File** — **EXECUTE** using Bash tool:
```bash
command -v jq >/dev/null || { echo "FAILED: jq required"; exit 1; }
HISTORY_FILE=".claude/brewpage-history.md"
if [ ! -f "$HISTORY_FILE" ]; then
  mkdir -p "$(dirname "$HISTORY_FILE")"
  cat > "$HISTORY_FILE" <<'HEADER'
# brewpage.app — Published Pages

> Owner tokens allow delete and in-place republish (html/json/kv/sites all support PUT). Keep this file private.
> Delete: `curl -s -X DELETE "https://brewpage.app/api/{ns}/{id}" -H "X-Owner-Token: TOKEN"`

| Date | URL | Owner Token | TTL | Type |
|------|-----|-------------|-----|------|
HEADER
fi

RESPONSE=$(curl -s -X POST "https://brewpage.app/api/files?ns={ns}&ttl={days}" \
  {password_header} \
  -F "file=@/absolute/path/to/file")

URL=$(echo "$RESPONSE" | jq -r '.link // empty')
TOKEN=$(echo "$RESPONSE" | jq -r '.ownerToken // empty')

if [ -n "$URL" ]; then
  [ -n "$TOKEN" ] && echo "| $(date '+%Y-%m-%d %H:%M') | [$URL]($URL) | \`$TOKEN\` | {ttl}d | file |" >> "$HISTORY_FILE"
  echo "OK $URL"
else
  echo "FAILED: publish rejected (no .link in response)"
fi
```

**Site (directory)** — **EXECUTE** using Bash tool:
```bash
command -v jq >/dev/null || { echo "FAILED: jq required"; exit 1; }
HISTORY_FILE=".claude/brewpage-history.md"
if [ ! -f "$HISTORY_FILE" ]; then
  mkdir -p "$(dirname "$HISTORY_FILE")"
  cat > "$HISTORY_FILE" <<'HEADER'
# brewpage.app — Published Pages

> Owner tokens allow delete and in-place republish (html/json/kv/sites all support PUT). Keep this file private.
> Delete: `curl -s -X DELETE "https://brewpage.app/api/sites/{ns}/{id}" -H "X-Owner-Token: TOKEN"`
> Update site (keep same URL): `PUT /api/sites/{ns}/{id}` with `X-Owner-Token: TOKEN` + the new bundle — fully replaces the file set (adds new, removes absent, overwrites matching). The link never changes.

| Date | URL | Owner Token | TTL | Type |
|------|-----|-------------|-----|------|
HEADER
fi

command -v zip >/dev/null || { echo "FAILED: zip required"; exit 1; }
TMPZIP=$(mktemp /tmp/brewpage-site-XXXXXX.zip)
(cd "{directory_path}" && zip -r "$TMPZIP" .)
RESPONSE=$(curl -s -X POST "https://brewpage.app/api/sites?ns={ns}&ttl={days}&entry={entry}" \
  -H "User-Agent: ClaudeCode/1.0" \
  {password_header} \
  -F "archive=@$TMPZIP")
rm -f "$TMPZIP"

URL=$(echo "$RESPONSE" | jq -r '.link // empty')
URL="${URL%/}"  # strip any trailing slash — /public/<id>/ routes to brewpage landing
TOKEN=$(echo "$RESPONSE" | jq -r '.ownerToken // empty')
FCOUNT=$(echo "$RESPONSE" | jq -r '.fileCount // "?"')

if [ -n "$URL" ]; then
  [ -n "$TOKEN" ] && echo "| $(date '+%Y-%m-%d %H:%M') | [$URL]($URL) | \`$TOKEN\` | {ttl}d | site ($FCOUNT files) |" >> "$HISTORY_FILE"
  echo "OK $URL | Files: $FCOUNT"
else
  echo "FAILED: publish rejected (no .link in response)"
fi
```

**Site (ZIP file)** — **EXECUTE** using Bash tool:
```bash
command -v jq >/dev/null || { echo "FAILED: jq required"; exit 1; }
HISTORY_FILE=".claude/brewpage-history.md"
if [ ! -f "$HISTORY_FILE" ]; then
  mkdir -p "$(dirname "$HISTORY_FILE")"
  cat > "$HISTORY_FILE" <<'HEADER'
# brewpage.app — Published Pages

> Owner tokens allow delete and in-place republish (html/json/kv/sites all support PUT). Keep this file private.
> Delete: `curl -s -X DELETE "https://brewpage.app/api/sites/{ns}/{id}" -H "X-Owner-Token: TOKEN"`
> Update site (keep same URL): `PUT /api/sites/{ns}/{id}` with `X-Owner-Token: TOKEN` + the new bundle — fully replaces the file set (adds new, removes absent, overwrites matching). The link never changes.

| Date | URL | Owner Token | TTL | Type |
|------|-----|-------------|-----|------|
HEADER
fi

RESPONSE=$(curl -s -X POST "https://brewpage.app/api/sites?ns={ns}&ttl={days}&entry={entry}" \
  -H "User-Agent: ClaudeCode/1.0" \
  {password_header} \
  -F "archive=@{zip_file_path}")

URL=$(echo "$RESPONSE" | jq -r '.link // empty')
URL="${URL%/}"  # strip any trailing slash — /public/<id>/ routes to brewpage landing
TOKEN=$(echo "$RESPONSE" | jq -r '.ownerToken // empty')
FCOUNT=$(echo "$RESPONSE" | jq -r '.fileCount // "?"')

if [ -n "$URL" ]; then
  [ -n "$TOKEN" ] && echo "| $(date '+%Y-%m-%d %H:%M') | [$URL]($URL) | \`$TOKEN\` | {ttl}d | site ($FCOUNT files) |" >> "$HISTORY_FILE"
  echo "OK $URL | Files: $FCOUNT"
else
  echo "FAILED: publish rejected (no .link in response)"
fi
```

### Step 7: Output Result

**Success** (bash printed `OK {url}`):
```
Published: {url from bash output}
Owner token saved to .claude/brewpage-history.md
```

**Success for SITE** (bash printed `OK {url} | Files: {count}`):
```
Published site: {url from bash output}
Entry: {entry_file} | Files: {count}
Owner token saved to .claude/brewpage-history.md

⚠ Share the URL exactly as printed — DO NOT append a trailing slash.
  brewpage.app routes "/public/<id>/" to its own landing page, and the
  redirect that saves the no-slash form does not fire for the slash-dir form.
```

For a private (non-`public`) namespace, append one short line after the link (skip if reply must stay ultra-brief): *Unlisted link — anyone who has it can open it, but it's not in the gallery or search. Want it discoverable? Publish to `public`.*

**Error** (bash printed `FAILED: ...`):
```
Publish failed.
```

## Notes

- Use `jq -n --arg c "$CONTENT" '{content: $c}'` to safely encode text content. **`format` is a query param**, not a body field — `/api/html` ignores any `format` key inside the JSON body and reads only `?format=` from the URL. Wrong location = server applies default `html` and stores markdown as raw text.
- TTL default: `15` days. Namespace must be alphanumeric (3-32 chars).
- To **delete** a published page, find the owner token in `.claude/brewpage-history.md` and use the delete command shown in that file's header.
- To **update a published site**, `PUT` the new bundle to the same site URL (`PUT /api/sites/{ns}/{id}`) with your `X-Owner-Token` — the uploaded bundle fully replaces the file set (adds new files, removes absent ones, overwrites matching) and the link never changes. No DELETE-then-POST needed.
- Entry file detection: `--entry` override > `index.html` > first `.html` alphabetically.
- **SITE URL — NO trailing slash.** API returns `.link = "https://brewpage.app/public/<id>"` without trailing `/`. Appending `/` routes to brewpage.app's own landing page; the JS redirect that rescues the no-slash form does NOT fire for the slash-dir form → site becomes inaccessible.
- **SITE verification cannot be done via `curl`.** The no-slash URL serves the BrewPage landing HTML with an inline JS redirect that only executes in a real browser. To verify: use Playwright / `browser_navigate`, or fetch `<url>/index.html` explicitly.
