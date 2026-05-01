---
name: brewdoc:publish
description: "Publish content to brewpage.app — text, markdown, JSON, file, or multi-file site. Asks namespace and password, returns public URL. Triggers: publish, share link, upload to brewpage, host page, brewpage, publish site, upload site, upload directory, deploy site, сделай публичную ссылку, опубликуй."
argument-hint: "<text|file_path|directory_path|zip_path> [--ttl N] [--entry filename]"
user-invocable: true
allowed-tools: Read, Bash, AskUserQuestion, Glob
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
| `content_arg` is a file path AND file exists (`test -f`) | FILE | `POST /api/files` (multipart) |
| `content_arg` starts with `{` or `[` | JSON | `POST /api/json` |
| Anything else | HTML | `POST /api/html` (format=markdown) |

Mode rule: ZIP/directory → SITE. Single file → FILE. Stats per type — SITE (dir): HTML count, total size, entry file. SITE (ZIP): file size, entry override. FILE: size + MIME via `file --mime-type -b`. TEXT/JSON: char count.

### Step 3: Show Pre-Publish Stats

For HTML/JSON/FILE:
```
Content:  <type description> · <size> · <api endpoint>
TTL:      <N> days
```

For SITE: detect entry file using priority: 1) `--entry` flag, 2) `index.html` exists, 3) first `.html` file alphabetically.
If no .html in dir → fail with explicit error, do not guess.
```
Content:  site · <N> files · <total_size> · POST /api/sites
Entry:    <entry_file>
TTL:      <N> days
```

### Step 4: Ask Namespace

Use **AskUserQuestion**:

```
Namespace determines the URL prefix and gallery visibility on brewpage.app.

Options:
1) public — visible in gallery (default)
2) {auto-suggested 6-8 char slug}
3) Enter custom namespace
4) Skip → use public

Reply with a number or your custom namespace (alphanumeric, 3-32 chars).
```

Auto-suggest: generate a **meaningful short slug** (3-16 chars, lowercase alphanumeric + hyphens) from content context:
- File → topic/purpose of the file (e.g. `api-docs`, `login-page`, `report-q2`)
- Text/HTML → main subject or title (e.g. `pricing`, `team-intro`, `changelog`)
- JSON → data type or schema name (e.g. `user-config`, `metrics`)
- Fallback → project name or directory name if content is ambiguous
Never use random strings or truncated filenames — the slug should be human-readable and describe what's being published.

Resolution:
- `1`, `4`, or empty → `public`
- `2` → suggested slug
- `3` or any other string → use as-is

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

Resolution:
- `1`, `4`, or empty → no password
- `2` → use generated random password
- `3` or custom text → use as-is

### Step 6: Publish and Save Token (secure)

> **SECURITY:** The ownerToken MUST NEVER appear in conversation output. Bash blocks below handle curl + token parsing + history save atomically; LLM sees only the URL. Each block sets `PASS_H` first (empty when no password) and uses `"${PASS_H[@]}"` quoted.

**HTML/Markdown text** — **EXECUTE** using Bash tool:
```bash
HISTORY_FILE=".claude/brewpage-history.md"
if [ ! -f "$HISTORY_FILE" ]; then
  mkdir -p "$(dirname "$HISTORY_FILE")"
  cat > "$HISTORY_FILE" <<'HEADER'
# brewpage.app — Published Pages

> Owner tokens allow update/delete. Keep this file private.
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
PASS_H=()
[ -n "$PASSWORD" ] && PASS_H=(-H "X-Password: $PASSWORD")
RESPONSE=$(curl -s -X POST "https://brewpage.app/api/html?ns={ns}&ttl={days}&format=markdown" \
  -H "Content-Type: application/json" \
  "${PASS_H[@]}" \
  -d "$PAYLOAD")

URL=$(echo "$RESPONSE" | jq -r '.link // empty')
TOKEN=$(echo "$RESPONSE" | jq -r '.ownerToken // empty')

if [ -n "$URL" ]; then
  [ -n "$TOKEN" ] && echo "| $(date '+%Y-%m-%d %H:%M') | [$URL]($URL) | \`$TOKEN\` | {ttl}d | html |" >> "$HISTORY_FILE"
  echo "OK $URL"
else
  echo "FAILED: $RESPONSE"
fi
```

**JSON** — **EXECUTE** using Bash tool:
```bash
HISTORY_FILE=".claude/brewpage-history.md"
if [ ! -f "$HISTORY_FILE" ]; then
  mkdir -p "$(dirname "$HISTORY_FILE")"
  cat > "$HISTORY_FILE" <<'HEADER'
# brewpage.app — Published Pages

> Owner tokens allow update/delete. Keep this file private.
> Delete: `curl -s -X DELETE "https://brewpage.app/api/{ns}/{id}" -H "X-Owner-Token: TOKEN"`

| Date | URL | Owner Token | TTL | Type |
|------|-----|-------------|-----|------|
HEADER
fi

PASS_H=()
[ -n "$PASSWORD" ] && PASS_H=(-H "X-Password: $PASSWORD")
RESPONSE=$(curl -s -X POST "https://brewpage.app/api/json?ns={ns}&ttl={days}" \
  -H "Content-Type: application/json" \
  "${PASS_H[@]}" \
  -d '{original_json}')

URL=$(echo "$RESPONSE" | jq -r '.link // empty')
TOKEN=$(echo "$RESPONSE" | jq -r '.ownerToken // empty')

if [ -n "$URL" ]; then
  [ -n "$TOKEN" ] && echo "| $(date '+%Y-%m-%d %H:%M') | [$URL]($URL) | \`$TOKEN\` | {ttl}d | json |" >> "$HISTORY_FILE"
  echo "OK $URL"
else
  echo "FAILED: $RESPONSE"
fi
```

**File** — **EXECUTE** using Bash tool:
```bash
HISTORY_FILE=".claude/brewpage-history.md"
if [ ! -f "$HISTORY_FILE" ]; then
  mkdir -p "$(dirname "$HISTORY_FILE")"
  cat > "$HISTORY_FILE" <<'HEADER'
# brewpage.app — Published Pages

> Owner tokens allow update/delete. Keep this file private.
> Delete: `curl -s -X DELETE "https://brewpage.app/api/{ns}/{id}" -H "X-Owner-Token: TOKEN"`

| Date | URL | Owner Token | TTL | Type |
|------|-----|-------------|-----|------|
HEADER
fi

PASS_H=()
[ -n "$PASSWORD" ] && PASS_H=(-H "X-Password: $PASSWORD")
RESPONSE=$(curl -s -X POST "https://brewpage.app/api/files?ns={ns}&ttl={days}" \
  "${PASS_H[@]}" \
  -F "file=@/absolute/path/to/file")

URL=$(echo "$RESPONSE" | jq -r '.link // empty')
TOKEN=$(echo "$RESPONSE" | jq -r '.ownerToken // empty')

if [ -n "$URL" ]; then
  [ -n "$TOKEN" ] && echo "| $(date '+%Y-%m-%d %H:%M') | [$URL]($URL) | \`$TOKEN\` | {ttl}d | file |" >> "$HISTORY_FILE"
  echo "OK $URL"
else
  echo "FAILED: $RESPONSE"
fi
```

**Site (directory)** — **EXECUTE** using Bash tool:
```bash
HISTORY_FILE=".claude/brewpage-history.md"
if [ ! -f "$HISTORY_FILE" ]; then
  mkdir -p "$(dirname "$HISTORY_FILE")"
  cat > "$HISTORY_FILE" <<'HEADER'
# brewpage.app — Published Pages

> Owner tokens allow update/delete. Keep this file private.
> Delete: `curl -s -X DELETE "https://brewpage.app/api/sites/{ns}/{id}" -H "X-Owner-Token: TOKEN"`

| Date | URL | Owner Token | TTL | Type |
|------|-----|-------------|-----|------|
HEADER
fi

PASS_H=()
[ -n "$PASSWORD" ] && PASS_H=(-H "X-Password: $PASSWORD")
TMPZIP=$(mktemp /tmp/brewpage-site-XXXXXX.zip)
(cd "{directory_path}" && zip -r "$TMPZIP" .)
RESPONSE=$(curl -s -X POST "https://brewpage.app/api/sites?ns={ns}&ttl={days}&entry={entry}" \
  -H "User-Agent: ClaudeCode/1.0" \
  "${PASS_H[@]}" \
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
  echo "FAILED: $RESPONSE"
fi
```

**Site (ZIP file)** — **EXECUTE** using Bash tool:
```bash
HISTORY_FILE=".claude/brewpage-history.md"
if [ ! -f "$HISTORY_FILE" ]; then
  mkdir -p "$(dirname "$HISTORY_FILE")"
  cat > "$HISTORY_FILE" <<'HEADER'
# brewpage.app — Published Pages

> Owner tokens allow update/delete. Keep this file private.
> Delete: `curl -s -X DELETE "https://brewpage.app/api/sites/{ns}/{id}" -H "X-Owner-Token: TOKEN"`

| Date | URL | Owner Token | TTL | Type |
|------|-----|-------------|-----|------|
HEADER
fi

PASS_H=()
[ -n "$PASSWORD" ] && PASS_H=(-H "X-Password: $PASSWORD")
RESPONSE=$(curl -s -X POST "https://brewpage.app/api/sites?ns={ns}&ttl={days}&entry={entry}" \
  -H "User-Agent: ClaudeCode/1.0" \
  "${PASS_H[@]}" \
  -F "archive=@{zip_file_path}")

URL=$(echo "$RESPONSE" | jq -r '.link // empty')
URL="${URL%/}"  # strip any trailing slash — /public/<id>/ routes to brewpage landing
TOKEN=$(echo "$RESPONSE" | jq -r '.ownerToken // empty')
FCOUNT=$(echo "$RESPONSE" | jq -r '.fileCount // "?"')

if [ -n "$URL" ]; then
  [ -n "$TOKEN" ] && echo "| $(date '+%Y-%m-%d %H:%M') | [$URL]($URL) | \`$TOKEN\` | {ttl}d | site ($FCOUNT files) |" >> "$HISTORY_FILE"
  echo "OK $URL | Files: $FCOUNT"
else
  echo "FAILED: $RESPONSE"
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

**Error** (bash printed `FAILED: ...`):
```
Publish failed.
```

## Notes

- Use `jq -n --arg c "$CONTENT" '{content: $c}'` to safely encode text content. **`format` is a query param**, not a body field — `/api/html` ignores any `format` key inside the JSON body and reads only `?format=` from the URL. Wrong location = server applies default `html` and stores your markdown as raw text.
- TTL default is `15` days. Namespace must be alphanumeric (3-32 chars), default `public`.
- To **delete** a published page, find the owner token in `.claude/brewpage-history.md` and use the delete command shown in that file's header.
- Entry file detection: `--entry` override > `index.html` > first `.html` alphabetically.
- **SITE URL — NO trailing slash.** API returns `.link = "https://brewpage.app/public/<id>"` without trailing `/`. Appending `/` routes to brewpage.app's own landing page; the JS redirect that rescues the no-slash form does NOT fire for the slash-dir form → site becomes inaccessible.
- **SITE verification cannot be done via `curl`.** The no-slash URL serves the BrewPage landing HTML with an inline JS redirect that only executes in a real browser. To verify: use Playwright / `browser_navigate`, or fetch `<url>/index.html` explicitly.
