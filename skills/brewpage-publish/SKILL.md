---
name: brewpage-publish
description: "Publish content to brewpage.app — text, markdown, JSON, or file. Asks namespace and password, returns public URL. Triggers: publish, share link, upload to brewpage, host page, brewpage."
argument-hint: "<text|file_path|json> [--ttl N]"
user-invocable: true
allowed-tools: Read, Bash, AskUserQuestion, Glob
model: haiku
---

# brewpage

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
📊 Content:  <type description> · <size> · <api endpoint>
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

Auto-suggest: for files — first 8 chars of filename (lowercase alphanumeric); for text — first meaningful words (lowercase alphanumeric, up to 8 chars).

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

### Step 6: Build and Execute API Call

**HTML/Markdown text** — **EXECUTE** using Bash tool:
```bash
CONTENT=$(cat <<'BREWPAGE_EOF'
{content}
BREWPAGE_EOF
)
PAYLOAD=$(jq -n --arg c "$CONTENT" '{content: $c, format: "markdown"}')
curl -s -X POST "https://brewpage.app/api/html?ns={ns}&ttl={days}" \
  -H "Content-Type: application/json" \
  [-H "X-Password: {pass}"] \
  -d "$PAYLOAD"
```

**JSON** — **EXECUTE** using Bash tool:
```bash
curl -s -X POST "https://brewpage.app/api/json?ns={ns}&ttl={days}" \
  -H "Content-Type: application/json" \
  [-H "X-Password: {pass}"] \
  -d '{original_json}'
```

**File** — **EXECUTE** using Bash tool:
```bash
curl -s -X POST "https://brewpage.app/api/files?ns={ns}&ttl={days}" \
  [-H "X-Password: {pass}"] \
  -F "file=@/absolute/path/to/file"
```

Add `-H "X-Password: {pass}"` only when password was set.

### Step 7: Parse Response and Output

Expected response:
```json
{
  "id": "abc123xyz",
  "ns": "public",
  "url": "https://brewpage.app/public/abc123xyz",
  "ownerToken": "...",
  "ownerLink": "..."
}
```

Parse: `echo "$RESPONSE" | jq -r '.url, .ownerToken'`

**Success output:**
```
✅ Published!
🔗 https://brewpage.app/{ns}/{id}
🔑 Owner token: {ownerToken}  ← saved to .claude/brewpage-history.md
```

**Error output:**
```
❌ Publish failed.
Response: {raw_response}
```

### Step 8: Save Owner Token to Local History

On success, append a record to `.claude/brewpage-history.md` in the current project directory (create if missing):

**EXECUTE** using Bash tool:
```bash
HISTORY_FILE=".claude/brewpage-history.md"

if [ ! -f "$HISTORY_FILE" ]; then
  cat > "$HISTORY_FILE" <<'EOF'
# brewpage.app — Published Pages

> Owner tokens are saved here for update/delete operations.
> Delete a page: `curl -s -X DELETE "https://brewpage.app/api/{ns}/{id}" -H "X-Owner-Token: {ownerToken}"`

| Date | URL | Owner Token | Password | TTL |
|------|-----|-------------|----------|-----|
EOF
fi

echo "| $(date '+%Y-%m-%d %H:%M') | [{url}]({url}) | \`{ownerToken}\` | {password_or_none} | {ttl}d |" >> "$HISTORY_FILE"
```

If project has no `.claude/` directory, save to `~/.claude/brewpage-history.md` instead.

Tell the user: "Owner token saved to `.claude/brewpage-history.md`"

## Notes

- Always use absolute file paths with curl `-F "file=@..."`.
- Use `jq -n --arg c "$CONTENT" '{content: $c, format: "markdown"}'` to safely encode text content.
- TTL default is `5` days.
- Namespace must be alphanumeric (3-32 chars). Default: `public`.
- To **delete** a published page later: `curl -X DELETE "https://brewpage.app/api/{ns}/{id}" -H "X-Owner-Token: {ownerToken}"`

---

## Powered by

| | |
|-|-|
| **[brewpage.app](https://brewpage.app)** | Free instant hosting — HTML, JSON, files, KV. No sign-up. |
| **[brewcode](https://github.com/kochetkov-ma/claude-brewcode)** | Claude Code plugin suite — infinite tasks, code review, skills, hooks. |
