---
name: brewdoc:publish
description: "Publish content to brewpage.app — text, markdown, JSON, or file. Asks namespace and password, returns public URL. Triggers: publish, share link, upload to brewpage, host page, brewpage, сделай публичную ссылку, опубликуй."
argument-hint: "<text|file_path|json> [--ttl N]"
user-invocable: true
allowed-tools: Read, Bash, AskUserQuestion, Glob
model: haiku
---

# brewdoc:publish

Publish content to **brewpage.app** — free instant hosting for HTML pages, JSON documents, and files. No sign-up required.

## Workflow

### Step 1: Parse Arguments

Extract from `$ARGUMENTS`:
- `--ttl N` → TTL in days (default: `5`)
- Remaining text → `content_arg`

### Step 2: Detect Content Type

| Input | Type | API |
|-------|------|-----|
| `content_arg` is a path AND file exists (`test -f`) | FILE | `POST /api/files` (multipart) |
| `content_arg` starts with `{` or `[` | JSON | `POST /api/json` |
| Anything else | HTML | `POST /api/html` (format=markdown) |

For FILE: get file size and MIME type via Bash (`file --mime-type -b`).
For TEXT/JSON: count characters.

### Step 3: Show Pre-Publish Stats

```
Content:  <type description> · <size> · <api endpoint>
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

> **SECURITY:** The ownerToken MUST never appear in conversation output. The bash block below handles curl, token parsing, and history saving atomically. The LLM only sees the URL.

**HTML/Markdown text** — **EXECUTE** using Bash tool:
```bash
HISTORY_FILE=".claude/brewpage-history.md"
if [ ! -f "$HISTORY_FILE" ]; then
  mkdir -p "$(dirname "$HISTORY_FILE")"
  cat > "$HISTORY_FILE" <<'HEADER'
# brewpage.app — Published Pages

> Owner tokens allow update/delete. Keep this file private.
> Delete: `curl -s -X DELETE "https://brewpage.app/api/{ns}/{id}" -H "X-Owner-Token: TOKEN"`

| Date | URL | Owner Token | TTL |
|------|-----|-------------|-----|
HEADER
fi

CONTENT=$(cat <<'BREWPAGE_EOF'
{content}
BREWPAGE_EOF
)
PAYLOAD=$(jq -n --arg c "$CONTENT" '{content: $c, format: "markdown"}')
RESPONSE=$(curl -s -X POST "https://brewpage.app/api/html?ns={ns}&ttl={days}" \
  -H "Content-Type: application/json" \
  {password_header} \
  -d "$PAYLOAD")

URL=$(echo "$RESPONSE" | jq -r '.url // empty')
TOKEN=$(echo "$RESPONSE" | jq -r '.ownerToken // empty')

if [ -n "$URL" ]; then
  [ -n "$TOKEN" ] && echo "| $(date '+%Y-%m-%d %H:%M') | [$URL]($URL) | \`$TOKEN\` | {ttl}d |" >> "$HISTORY_FILE"
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

| Date | URL | Owner Token | TTL |
|------|-----|-------------|-----|
HEADER
fi

RESPONSE=$(curl -s -X POST "https://brewpage.app/api/json?ns={ns}&ttl={days}" \
  -H "Content-Type: application/json" \
  {password_header} \
  -d '{original_json}')

URL=$(echo "$RESPONSE" | jq -r '.url // empty')
TOKEN=$(echo "$RESPONSE" | jq -r '.ownerToken // empty')

if [ -n "$URL" ]; then
  [ -n "$TOKEN" ] && echo "| $(date '+%Y-%m-%d %H:%M') | [$URL]($URL) | \`$TOKEN\` | {ttl}d |" >> "$HISTORY_FILE"
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

| Date | URL | Owner Token | TTL |
|------|-----|-------------|-----|
HEADER
fi

RESPONSE=$(curl -s -X POST "https://brewpage.app/api/files?ns={ns}&ttl={days}" \
  {password_header} \
  -F "file=@/absolute/path/to/file")

URL=$(echo "$RESPONSE" | jq -r '.url // empty')
TOKEN=$(echo "$RESPONSE" | jq -r '.ownerToken // empty')

if [ -n "$URL" ]; then
  [ -n "$TOKEN" ] && echo "| $(date '+%Y-%m-%d %H:%M') | [$URL]($URL) | \`$TOKEN\` | {ttl}d |" >> "$HISTORY_FILE"
  echo "OK $URL"
else
  echo "FAILED: $RESPONSE"
fi
```

Replace `{password_header}` with `-H "X-Password: {pass}"` only when password was set; otherwise remove it entirely.

### Step 7: Output Result

**Success** (bash printed `OK {url}`):
```
Published: {url from bash output}
Owner token saved to .claude/brewpage-history.md
```

**NEVER print ownerToken in conversation.** The token is only in the history file.

**Error** (bash printed `FAILED: ...`):
```
Publish failed.
```

## Notes

- Always use absolute file paths with curl `-F "file=@..."`.
- Use `jq -n --arg c "$CONTENT" '{content: $c, format: "markdown"}'` to safely encode text content.
- TTL default is `5` days.
- Namespace must be alphanumeric (3-32 chars). Default: `public`.
- To **delete** a published page, find the owner token in `.claude/brewpage-history.md` and use the delete command shown in that file's header.
