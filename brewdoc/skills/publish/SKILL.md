---
name: publish
description: "Publish text/markdown/file/site to brewpage.app, returns URL. Triggers: publish, share link, brewpage, опубликуй."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] <text|file_path|directory_path|zip_path> [--ttl N] [--entry filename]"
allowed-tools: [Read, Write, Bash, AskUserQuestion, Glob]
model: haiku
---

# brewdoc:publish

Publish content to **brewpage.app** — free instant hosting for HTML pages, JSON documents, files, and multi-file sites. No sign-up required.

## Prompt contract

Position 1 of `$ARGUMENTS` is a **free-form prompt** (RU/EN) — the content (text, file/dir/zip path), `--ttl`
and `--entry` are optional and may follow in any order. Nobody types keys: resolve WHAT to publish FROM the
prompt.

1. Strip `--ttl N` and `--entry <filename>` flags.
2. Extract the content to publish (rule 3 below) — this doubles as the content-type detection in Step 2, scored
   by the keyword table there.
3. **Prose resolution (mandatory):** a sentence naming a file/dir resolves to that file/dir (e.g. "publish my
   report.md" -> `content_arg = report.md`, resolved against cwd); a sentence with no path and no inline
   text/JSON has nothing to publish -> ONE `AskUserQuestion` asking what to publish. Never guess, never
   silently fall back to an empty HTML page.
4. Outcome-changing ambiguity (namespace, password) -> the two dedicated `AskUserQuestion` calls in Steps 4-5;
   nothing else asks.

Then print this block ONCE, before Step 6 (the publish call):

```
PLAN — brewdoc:publish
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <detected type — SITE|MARKDOWN|FILE|JSON|HTML> — <matched extension/shape | prose-resolved path>
SCOPE:  namespace=<ns>; ttl=<days>; password=<set|none>
DO:     <2-5 imperative bullets>
RESULT: <published URL>
```

Labels are literal; values follow the conversation language.

## Workflow

### Step 1: Parse Arguments

Extract from `$ARGUMENTS`:
- `--ttl N` → TTL in days (default: `15`)
- `--entry <filename>` → entry file for SITE uploads (default: auto-detect)
- Remaining text → `content_arg` — extract per the prose-resolution rule above; not resolvable -> `AskUserQuestion`

### Step 2: Detect Content Type

| Input | Type | API | EN keywords | RU keywords | Mutates? |
|-------|------|-----|--------------|--------------|----------|
| `content_arg` is a directory (`test -d`) | SITE | `POST /api/sites` (ZIP created from dir) | publish site, publish folder/directory | опубликуй сайт, опубликуй папку | yes |
| `content_arg` ends with `.zip` AND file exists (`test -f`) | SITE | `POST /api/sites` (archive upload) | publish zip, publish archive | опубликуй архив, опубликуй zip | yes |
| `content_arg` is a `.md`/`.markdown` file AND exists (`test -f`) | MARKDOWN | `POST /api/html` (format=markdown, content read from the file — renders styled, NOT a raw download) | publish markdown, share this .md | опубликуй markdown, поделись .md | yes |
| `content_arg` is a file path AND file exists (`test -f`) | FILE | `POST /api/files` (multipart) | publish file, share this file | опубликуй файл, поделись файлом | yes |
| `content_arg` starts with `{` or `[` | JSON | `POST /api/json` | publish json, share this json | опубликуй json | yes |
| Anything else | HTML | `POST /api/html` (format=markdown) | publish text, share link, publish this | опубликуй текст, поделись ссылкой | yes |

Stats per type — SITE (dir): HTML count, total size, entry file. SITE (ZIP): file size, entry override. FILE: size + MIME via `file --mime-type -b`. TEXT/JSON: char count.

### Step 3: Show Pre-Publish Stats

For HTML/JSON/FILE:
```
Content:  <type description> · <size> · <api endpoint>
TTL:      <N> days
```

For SITE: entry priority is 1) `--entry` flag, 2) `index.html`, 3) first `.html` alphabetically. No `.html` → fail with an explicit error, do not guess.
```
Content:  site · <N> files · <total_size> · POST /api/sites
Entry:    <entry_file>
TTL:      <N> days
```
These are estimates from the source tree. The authoritative file set is the ARCHIVE MANIFEST that Step 6
prints from the built archive, before any upload — report that one to the user, not this count.

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

> **A password is passed as a FILE, never as shell text.** If a password was chosen, `Write` it — the
> password alone, no trailing prose — to `<PROJECT_ROOT>/.claude/tmp/brewpage-password.txt`. If no password
> was chosen, write nothing: the Step 6 blocks add the `X-Password` header exactly when that file exists and
> delete the file afterwards. Never report a password unless you actually wrote that file.

### Step 6: Publish and Save Token (secure)

> **SECURITY:** The ownerToken MUST NEVER appear in conversation output. Bash blocks handle curl + token parsing + history save atomically; LLM sees only the URL. The failure branch prints no response body, so a token in an error payload never reaches the transcript.

**Nothing prompt-derived is pasted into shell source.** Content, JSON, the password and the target path all
travel as FILES; only `{ns}`, `{days}` and `{entry}` are substituted, inside SINGLE quotes, and only after you
have validated them yourself:

| Placeholder | Must match before you substitute it | Re-checked in the block by |
|-------------|-------------------------------------|----------------------------|
| `{ns}` | `^[A-Za-z0-9-]{3,32}$` | `bp_validate` |
| `{days}` | positive integer | `bp_validate` |
| `{entry}` | plain relative file name, no `..`; empty string when auto-detecting | `bp_validate` |

A value that fails its pattern is a hard stop — re-ask, never "clean it up" and never substitute it anyway.

**Before running a block, `Write` the inputs it reads** (absolute paths under `<PROJECT_ROOT>/.claude/tmp/`):

| File | Written for | Contents |
|------|-------------|----------|
| `brewpage-content.md` | HTML / MARKDOWN text | the text to publish, verbatim |
| `brewpage-payload.json` | JSON | the JSON document, verbatim |
| `brewpage-target-path.txt` | FILE / SITE(dir) / SITE(zip) | the absolute source path, one line |
| `brewpage-password.txt` | any type, only if a password was chosen | the password, one line |

For a MARKDOWN **file** (type MARKDOWN from Step 2), `Read` it and `Write` its text into
`brewpage-content.md`, then run the HTML/Markdown block — the `?format=markdown` endpoint renders it styled
instead of serving a raw download.

Every block starts with the same two lines: source `scripts/brewpage-lib.sh`, then `bp_begin` — it re-validates
`{ns}`/`{days}`/`{entry}`, requires `jq`, resolves the PROJECT ROOT (`CLAUDE_PROJECT_DIR` →
`git rev-parse --show-toplevel` → upward `.git`/`.claude` walk → `PWD`), creates `$HISTORY_FILE` there with
mode `600`, and appends it plus `.claude/tmp/` to the project `.gitignore`. A nested cwd can no longer scatter
a second token file below the project. The library also owns the parts every block used to repeat: `bp_post`
(adds `X-Password` when Step 5 wrote the password file), `bp_finish` (URL, owner token → history, the single
`OK`/`FAILED` line, `.fileCount` for `site`) and `bp_archive_gate` (the shared verdict on a `publish.mjs` run).

**HTML/Markdown text** — **EXECUTE** using Bash tool:
```bash
. "${CLAUDE_SKILL_DIR}/scripts/brewpage-lib.sh" || { echo "FAILED: publish helper library not found"; exit 1; }
bp_begin '{ns}' '{days}' '' || exit 1

CONTENT=$(cat "$BP_TMPDIR/brewpage-content.md") || { echo "FAILED: content file missing"; exit 1; }
PAYLOAD=$(jq -n --arg c "$CONTENT" '{content: $c}')
RESPONSE=$(bp_post "https://brewpage.app/api/html?ns=$NS&ttl=$DAYS&format=markdown" \
  -H "Content-Type: application/json" -d "$PAYLOAD")
rm -f "$PWFILE" "$BP_TMPDIR/brewpage-content.md"
bp_finish "$RESPONSE" "$DAYS" html
```

**JSON** — **EXECUTE** using Bash tool:
```bash
. "${CLAUDE_SKILL_DIR}/scripts/brewpage-lib.sh" || { echo "FAILED: publish helper library not found"; exit 1; }
bp_begin '{ns}' '{days}' '' || exit 1

PAYLOAD_FILE="$BP_TMPDIR/brewpage-payload.json"
jq empty "$PAYLOAD_FILE" 2>/dev/null || { echo "FAILED: payload is not valid JSON"; exit 1; }
RESPONSE=$(bp_post "https://brewpage.app/api/json?ns=$NS&ttl=$DAYS" \
  -H "Content-Type: application/json" -d @"$PAYLOAD_FILE")
rm -f "$PWFILE" "$PAYLOAD_FILE"
bp_finish "$RESPONSE" "$DAYS" json
```

**File** — **EXECUTE** using Bash tool:
```bash
. "${CLAUDE_SKILL_DIR}/scripts/brewpage-lib.sh" || { echo "FAILED: publish helper library not found"; exit 1; }
bp_begin '{ns}' '{days}' '' || exit 1

SRC=$(cat "$BP_TMPDIR/brewpage-target-path.txt") || { echo "FAILED: target path missing"; exit 1; }
[ -f "$SRC" ] || { echo "FAILED: not a file: $SRC"; exit 1; }
RESPONSE=$(bp_post "https://brewpage.app/api/files?ns=$NS&ttl=$DAYS" -F "file=@$SRC")
rm -f "$PWFILE" "$BP_TMPDIR/brewpage-target-path.txt"
bp_finish "$RESPONSE" "$DAYS" file
```

**Site (directory)** — **EXECUTE** using Bash tool:
```bash
. "${CLAUDE_SKILL_DIR}/scripts/brewpage-lib.sh" || { echo "FAILED: publish helper library not found"; exit 1; }
bp_begin '{ns}' '{days}' '{entry}' || exit 1

SRC=$(cat "$BP_TMPDIR/brewpage-target-path.txt") || { echo "FAILED: target path missing"; exit 1; }
TMPZIP="$BP_TMPDIR/brewpage-site-$$.zip"
MANIFEST=$(node "${CLAUDE_SKILL_DIR}/scripts/publish.mjs" pack --dir "$SRC" --out "$TMPZIP" ${ENTRY:+--entry "$ENTRY"})
RC=$?
printf '%s\n' "$MANIFEST"
bp_archive_gate "$RC" "$MANIFEST" "$TMPZIP" || exit $?

RESPONSE=$(bp_post "https://brewpage.app/api/sites?ns=$NS&ttl=$DAYS&entry=$ENTRY" \
  -H "User-Agent: ClaudeCode/1.0" -F "archive=@$TMPZIP")
rm -f "$TMPZIP" "$PWFILE" "$BP_TMPDIR/brewpage-target-path.txt"
bp_finish "$RESPONSE" "$DAYS" site
```

**Site (ZIP file)** — **EXECUTE** using Bash tool:
```bash
. "${CLAUDE_SKILL_DIR}/scripts/brewpage-lib.sh" || { echo "FAILED: publish helper library not found"; exit 1; }
bp_begin '{ns}' '{days}' '{entry}' || exit 1

SRC=$(cat "$BP_TMPDIR/brewpage-target-path.txt") || { echo "FAILED: target path missing"; exit 1; }
MANIFEST=$(node "${CLAUDE_SKILL_DIR}/scripts/publish.mjs" inspect --zip "$SRC" ${ENTRY:+--entry "$ENTRY"})
RC=$?
printf '%s\n' "$MANIFEST"
bp_archive_gate "$RC" "$MANIFEST" "" || exit $?

RESPONSE=$(bp_post "https://brewpage.app/api/sites?ns=$NS&ttl=$DAYS&entry=$ENTRY" \
  -H "User-Agent: ClaudeCode/1.0" -F "archive=@$SRC")
rm -f "$PWFILE" "$BP_TMPDIR/brewpage-target-path.txt"
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

⚠ Share the URL exactly as printed — DO NOT append a trailing slash.
  brewpage.app routes "/public/<id>/" to its own landing page, and the
  redirect that saves the no-slash form does not fire for the slash-dir form.
```

For a private (non-`public`) namespace, append one short line after the link (skip if reply must stay ultra-brief): *Unlisted link — anyone who has it can open it, but it's not in the gallery or search. Want it discoverable? Publish to `public`.*

**Needs confirmation** (bash printed `CONFIRM: ...`, exit 2): nothing was uploaded. Show the manifest lines
the block printed, name the flagged entries, and use ONE `AskUserQuestion` — publish anyway / cancel. On
"publish anyway", re-run the same block with `BREWPAGE_CONFIRMED=1` prefixed. On cancel, stop.

**Error** (bash printed `FAILED: ...`):
```
Publish failed: {the FAILED line, verbatim}
```

## Notes

- Use `jq -n --arg c "$CONTENT" '{content: $c}'` to safely encode text content. **`format` is a query param**, not a body field — `/api/html` ignores any `format` key inside the JSON body and reads only `?format=` from the URL. Wrong location = server applies default `html` and stores markdown as raw text.
- TTL default: `15` days. Namespace must be alphanumeric (3-32 chars).
- Owner-token history lives at `<project-root>/.claude/brewpage-history.md` — project root resolved by `scripts/brewpage-lib.sh` (`CLAUDE_PROJECT_DIR` → git toplevel → upward `.git`/`.claude` walk → `PWD`), created mode `600`, and added to the project `.gitignore`. To **delete** a published page, find its owner token there and use the delete command in that file's header.
- To **update a published site**, `PUT` the new bundle to the same site URL (`PUT /api/sites/{ns}/{id}`) with your `X-Owner-Token` — the uploaded bundle fully replaces the file set (adds new files, removes absent ones, overwrites matching) and the link never changes. No DELETE-then-POST needed.
- Entry file detection: `--entry` override > `index.html` > first `.html` alphabetically — resolved inside `scripts/publish.mjs` against the archive that was actually built, and echoed as the manifest's `ENTRY:` line.
- **SITE bundles are allowlisted, never denylisted.** `scripts/publish.mjs pack` keeps only known web-asset extensions and drops every dot-entry (`.env`, `.git/`, `.DS_Store`), `node_modules/`, symlinks and unknown types. It removes any pre-existing output file first (a `mktemp`-created 0-byte file made Info-ZIP exit 3), checks `zip`'s exit status, verifies the archive with `unzip -t`, requires a non-zero size, and compares the archived name set against the selected one. Any mismatch deletes the archive and exits 1, so `curl` is never reached. A supplied ZIP is not rewritten — `inspect` lists it and exits 2 when anything unexpected or sensitive is inside.
- Tests: `bash brewdoc/skills/publish/tests/run.sh` — standalone `node`, no network, no real upload.
- **SITE URL — NO trailing slash.** API returns `.link = "https://brewpage.app/public/<id>"` without trailing `/`. Appending `/` routes to brewpage.app's own landing page; the JS redirect that rescues the no-slash form does NOT fire for the slash-dir form → site becomes inaccessible.
- **SITE verification cannot be done via `curl`.** The no-slash URL serves the BrewPage landing HTML with an inline JS redirect that only executes in a real browser. To verify: use Playwright / `browser_navigate`, or fetch `<url>/index.html` explicitly.
