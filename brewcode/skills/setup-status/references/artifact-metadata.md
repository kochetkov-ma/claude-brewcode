---
doc_type: llm
version: "6.9.6"
content_version: "6.8.0"
generated_by: "brewcode"
last_updated: "2026-10-16"
---

# Artifact metadata and versioning

Normative. Every artifact a brewcode/brewdoc/brewtools/brewui skill writes into a project
draws its metadata from ONE vocabulary of five fields, spelled and resolved the same way. Which
of the five an artifact carries is decided by its mechanism (section 3), not its file
extension; `content_version` answers "is this install current?" (section 6).

Audience: skill authors, generator authors, `setup-status`.

---

## 1. Fields

Exactly these five names. No synonyms, no extra provenance key, no reordering. The
"Required where" column is a summary; the mechanism table below is the authority.

| Key | Type | Format | Example | Required where |
|-----|------|--------|---------|----------------|
| `version` | string | `X.Y.Z` semver, QUOTED in YAML/JSON | `"X.Y.Z"` | every artifact, every carrier |
| `content_version` | string | `X.Y.Z` semver, QUOTED in YAML/JSON | `"X.Y.Z"` | every artifact, every carrier |
| `generated_by` | string | `<plugin>:<skill>`, QUOTED | `"brewdoc:docsync-setup"` | every artifact, every carrier |
| `last_updated` | string | `YYYY-MM-DD`, QUOTED, from `date +%F` | `"YYYY-MM-DD"` | every artifact EXCEPT a mechanism-`a` byte-copied one - see "Which fields are required" below |
| `doc_type` | enum | `llm` \| `user` \| `skip`, **UNQUOTED** | `llm` | `.md` frontmatter ONLY - docsync's field. NEVER in JSON. Generated artifacts are `llm` |

`version` is the version of the **plugin that produced the artifact**, never a per-template
counter. `content_version` is the last release in which THIS artifact's content (metadata
stripped) actually changed: `bump-version.sh` computes it (`content_version_for`) by git-diff
against the tag of the previous `content_version`, and a generated artifact takes it from its
generator's `SKILL.md` marker. `generated_by` is the producing skill, not the consuming one;
on hand-maintained SHIPPED artifacts (the plugin's own agents, this spec doc) no skill produced
the file and the value is the BARE plugin name (`"brewcode"`).

**`doc_type` is the one unquoted value, and that is load-bearing**: `validate_file` in
`brewcode/skills/rules/scripts/rules.sh` gates on `^doc_type: llm$` and fails `doc_type: "llm"`.
Quote the other four; never quote this one.

**`doc_type` is plugin-owned on a mechanism-`a` artifact.** The installed file is
byte-identical to the plugin's, so a re-install RESTORES it: `brewcode/skills/semble-setup/scripts/semble-guidance.sh` lists
`doc_type` in `OWNED` with `version`, `content_version`, `generated_by` and `last_updated`,
`sg_strip_meta` removes all five from both sides before comparing, and prose-identical +
stamp-different takes the metadata-only re-sync branch of `install_managed`, which `mv`s the
plugin bytes over the destination with no `--force` and no backup - a local `doc_type: user` or `skip` goes with them.
`brewcode/skills/semble-setup/tests/suite-hooks.mjs` asserts it (`B5.docTypeReset`). To keep
another `doc_type` on a managed rule, change the prose too: the file becomes `user_modified`,
which is preserved and backed up before any `--force` overwrite (`B5.backup`,
`B5.backupIsTheUserFile`). On mechanism `b` and `c` artifacts `doc_type` is user-owned: the
restamping writers (`_restamp_meta`, task-board `U5b`) leave it as found.

### Key order

`doc_type, version, content_version, generated_by, last_updated`, appended AFTER the file's own
frontmatter keys, immediately before the closing `---`, never at the top. A mechanism that omits
`last_updated` ends one key earlier; the order of the rest never changes.

A skill MAY add its own keys; they MUST TRAIL the five (`memory-sync` writes `surface_files`
after `last_updated`). A reader ignores any key it does not own: an unknown trailing key is never
a defect and never a staleness signal.

### Which fields are required - decided by MECHANISM, never by file extension

| Artifact | Fields |
|----------|--------|
| mechanism `a`, byte-copied into the project | `version` + `content_version` + `generated_by`, and `doc_type` when the carrier is `.md` frontmatter. **NEVER `last_updated`** |
| mechanism `a`, hand-maintained SHIPPED file that is NOT copied anywhere (the 8 plugin agents, this spec doc) | all five - the date legitimately means "shipped in the release of that day" |
| mechanism `b` (substituted at install) and mechanism `c` (written by the model) | all applicable fields, `content_version` and `last_updated` included |

A byte-copied asset omits `last_updated` because the value would be the RELEASE date,
identical in the plugin file and the copy, while rewriting it on every build churns the bytes
and defeats the `cmp` drift signal. The stamp KINDS of `.claude/scripts/bump-version.sh` (`stamp_rewrite`, frontmatter seds scoped
`2,/^---$/`) encode the split:

| Kind | Writes | Used for |
|------|--------|----------|
| `fm` | `version`, `content_version`, `generated_by` | byte-copied `.md`-frontmatter assets |
| `fmd` | `version`, `content_version`, `generated_by`, **`last_updated`** | hand-maintained shipped `.md` (9 agents + this doc) |
| `mjs` / `sh` / `md` / `marker` | `version`, `content_version`, `generated_by` inside a `brewcode-meta:` fragment | byte-copied scripts and `.md` |

Worked example: `brewcode/skills/semble-setup/assets/semble-first.md.template`, kind `fm`,
carries `doc_type`, `version`, `content_version`, `generated_by` and no `last_updated`, and its
installed copy `.claude/rules/semble-first.md` lands the same way.

**Known contradiction, stated so nobody "fixes" the wrong side.** `validate_file` in
`brewcode/skills/rules/scripts/rules.sh` requires `description`, `doc_type`, `version`,
`generated_by` and `last_updated` (a quoted `YYYY-MM-DD`) on every rule it checks, plus `paths`
on a specialized rule. That is right for what it validates: the rules `rules.sh` creates are
mechanism `b`, rendered from `brewcode/templates/rules/*.md.template` with `{LAST_UPDATED}`
substituted, and its glob (`.claude/rules/avoid.md`, `best-practice.md`, `*-avoid.md`,
`*-best-practice.md`) does not reach `semble-first.md`. Two skills write one directory under
different field sets, kept apart only by filename. **The mechanism rule is the tiebreaker**: a
validator that widens its glob must exempt mechanism-`a` files from `last_updated`; never add
`last_updated` to a byte-copied asset to satisfy a validator.

---

## 2. Carriers

| Carrier | Placement | Key order |
|---------|-----------|-----------|
| `.md` with YAML frontmatter | appended after the file's own keys, before the closing `---` | section 1 "Key order"; no `last_updated` when byte-copied (mechanism `a`, stamp kind `fm`) |
| `.json` | top level, snake_case | `version, content_version, generated_by, last_updated` - all four MANDATORY, `doc_type` FORBIDDEN |
| `.mjs` / `.sh` copied byte-for-byte | ONE comment line, immediately after the shebang if present, else line 1 | `version`, `content_version`, `generated_by` only - never `last_updated` |
| `.md` copied byte-for-byte, whose BODY is consumed verbatim | ONE line-1 HTML comment `<!-- brewcode-meta: ... -->` | `version`, `content_version`, `generated_by` only - never `last_updated` |
| markdown header table (`team.md` style) | four rows in the header table, in this order | `Version`, `Content version`, `Generated by`, `Last update` |

**A JSON artifact carrying only `version` is INCOMPLETE, not a variant.** All four keys travel
together in every JSON carrier, written by every mode that writes the file at all, so a config
last touched by `enable` never reports the version `install` left.

| Config | Writer | Modes covered |
|--------|--------|---------------|
| `.claude/agent-deadline.json` (and the global twin) | `brewtools/skills/agent-deadline-setup/assets/INSTALL.md`: one config block reused by every mode, verified after write, aborting on an unresolvable version | install, upgrade, enable, disable |
| `.claude/agent-return.json` (and the global twin, Bash-only) | `brewtools/skills/agent-return-setup/assets/INSTALL.md`: same shape | install, upgrade, enable, disable |
| `.claude/brewtools/agent-router.json` | `brewtools/skills/agent-router-setup/assets/INSTALL.md`: same shape | install, upgrade, `level` (re-runs the block), enable, disable |
| `.claude/brewtools/manager/state.json` | `writeState` in `brewtools/hooks/lib/manager-state.mjs` | every call, other keys merged through. `generated_by` and `last_updated` always; `version` / `content_version` only when they resolve (section 4) |
| `.claude/docsync/config.json` | `brewdoc/skills/docsync-setup/SKILL.md` | install, upgrade; `enable`/`disable` also BACKFILL a config whose value already matches but whose provenance is missing or stale |
| `.claude/md-to-pdf.config.json` (under `git rev-parse --show-toplevel`, else the cwd) | `brewdoc/skills/md-to-pdf/SKILL.md`: the one Step 1 save block, which merges new keys into the existing config and hard-fails on an unresolvable version | engine choice and styles, both through that block |

### `.md` frontmatter

```yaml
---
name: superreview
description: "Deep project-tailored review."
user-invocable: true
doc_type: llm
version: "X.Y.Z"
content_version: "X.Y.Z"
generated_by: "brewcode:superreview-setup"
last_updated: "YYYY-MM-DD"
---
```

**A GENERATED artifact stays model-invocable.** The distributed generator skills carry
`disable-model-invocation: true`, so a generator never fires by itself; what it emits must be
reachable mid-plan without the user typing the slash command.

Every example uses `X.Y.Z` / `YYYY-MM-DD` on purpose: the release stamper rewrites only this
file's own frontmatter, never its examples, so a literal version here would go stale.

### `.json`

```json
{
  "docs": ["docs/**/*.md"],
  "exclude": ["node_modules/**"],
  "version": "X.Y.Z",
  "content_version": "X.Y.Z",
  "generated_by": "brewdoc:docsync-setup",
  "last_updated": "YYYY-MM-DD"
}
```

`{"version": "X.Y.Z", "threshold_days": 30}` is non-conforming: `setup-status` can report its
version, never who wrote it or when.

### `.mjs`

```javascript
#!/usr/bin/env node
// brewcode-meta: version=X.Y.Z content_version=X.Y.Z generated_by=brewdoc:docsync-setup
```

### `.sh`

```bash
#!/usr/bin/env sh
# brewcode-meta: version=X.Y.Z content_version=X.Y.Z generated_by=brewcode:teams-setup
```

### `.md` HTML comment - the fifth carrier

A byte-copied `.md` whose whole body is consumed verbatim cannot use frontmatter: the
keys would leak into whatever consumes the body. It carries the same `brewcode-meta:`
fragment inside a line-1 HTML comment instead.

```markdown
<!-- brewcode-meta: version=X.Y.Z content_version=X.Y.Z generated_by=brewdoc:memory-sync-setup -->
```

Used by the four `brewdoc/skills/memory-sync-setup/references/*.md` that the generator copies
(`bump-version.sh` kind `md`) and by shipped files whose own line-1 marker carries the stamp
(kind `marker`). The marker is literally `brewcode-meta:` in every plugin: it is the grep
anchor, not a plugin name. A file may quote the fragment again further down; readers take the
first match in the head (`read_meta`, section 6), so the stamp is the first occurrence.

### markdown header table

```markdown
| Field | Value |
|-------|-------|
| Team | backend |
| Version | X.Y.Z |
| Content version | X.Y.Z |
| Generated by | brewcode:teams-setup |
| Last update | YYYY-MM-DD |
```

The four rows travel together, in that order, after whatever rows the file itself owns. Values are BARE here; the
markdown cell is not YAML and nothing parses it as a scalar. A lone date row is a
retired signal (section 8).

### NOT a carrier: `VERSIONED_DOCS`

Seven shipped human-facing pages state the plugin version in a header line and are
**exempt from everything in this section**: nothing installs them into a project, nothing
`cmp`s them, `setup-status` never reads them.

| Files | Header form |
|-------|-------------|
| `brewcode/README.md`, `brewdoc/README.md`, `brewtools/README.md`, `brewui/README.md` | `\| Version \| X.Y.Z \|` (line 7) |
| `brewcode/docs/file-tree.md` | `> Version: X.Y.Z`, plus `version X.Y.Z, skills/` and `claude-plugin-brewcode@X.Y.Z` in the tree |
| `brewcode/docs/commands.md` | `**ver:** X.Y.Z` |
| `brewdoc/docs/commands.md` | `**Version:** X.Y.Z` |

`VERSIONED_DOCS` in `.claude/scripts/bump-version.sh` lists them; `doc_rewrite` rewrites them
with six anchored `sed` expressions, one version literal each, and `doc_verify` fails the
release on a missing file, a file with no recognised carrier, or any other version left. The
anchoring keeps historical prose ("dropped in vX.Y.Z") from moving.

**So a lone `| Version |` row in a `| Field | Value |` table is compliant HERE and only
here** (the four-row rule governs installed artifacts such as `team.md`). Do not
add `| Generated by |` / `| Last update |` rows to these seven, and do not report them
non-compliant. `STAMPED_FILES` and `VERSIONED_DOCS` share no path.

---

## 3. Mechanisms

| # | Mechanism | Applies to | Stamp lives in | Written by |
|---|-----------|-----------|----------------|------------|
| a | BAKED AT RELEASE | assets copied byte-for-byte into the project, plus hand-maintained shipped `.md` | the PLUGIN's own file | `.claude/scripts/bump-version.sh`, on every bump |
| b | SUBSTITUTED AT INSTALL | templates that already run scalar substitution | the template, as `{PLUGIN_VERSION}` / `{CONTENT_VERSION}` / `{GENERATED_BY}` / `{LAST_UPDATED}` | the generator, at install/upgrade |
| c | WRITTEN BY THE MODEL | prose-authored artifacts | nothing pre-exists | the model, per the exact lines SKILL.md dictates |

Decision rule:

| The generator ... | Mechanism |
|-------------------|-----------|
| `cp` / `install` the asset unchanged | **a** |
| already replaces `{TOKENS}` in a template before writing | **b** |
| tells the model to author the file | **c** |

### Two hard constraints

| Constraint | Forces |
|------------|--------|
| `setup-status` compares installed vs plugin asset with `cmp`. Any stamp written at install time makes the copy differ from its source, so every install reads `DIFFERS` forever | **a** is mandatory for every byte-for-byte copied asset - the stamp must already be in the plugin's file. The `cmp` half of this has ONE exception, immediately below |
| `superreview-setup` ships `.template-baseline/` holding RAW templates, and `setup-status` `cmp`s the baseline against the plugin templates. A baked value in a template makes every baseline file differ on every release | **b** is mandatory for `superreview-setup` - the token stays unresolved in the template and in the baseline |

Under **a** `cmp` detects drift and the stamp reports the version without interfering: plugin
file and installed file are the same bytes, stamp included.
Under **c** the SKILL.md MUST state the exact lines to emit AND the exact
command that reads the version; the model never invents either.

### Exception to constraint 1 - a byte-copied asset the install then FILLS

An asset may be mechanism `a` - listed in `STAMPED_FILES`, stamped at release, `cp`d verbatim
by a generator - and still never be byte-STABLE, because a mode of that generator writes
project-specific content INTO the installed copy. Such a file is **exempt from `cmp` and from
stamp-reading by every reader**. It stays mechanism `a`: the exemption lands on the readers,
and `bump-version.sh` keeps stamping the PLUGIN-side copy.

| File | Filled by |
|------|-----------|
| `brewdoc/skills/memory-sync-setup/references/hard-sync.md` (kind `md`) | the emitted skill's Phase 3 fills the BLOCK placeholders `{PATHS_PRECISION_TABLE}` and `{OBVIOUS_VS_DOMAIN_TABLE}`; `validate` fails while either is open (`_open_tokens`, allow-list `RUNTIME_ALLOW`). Its stamp is frozen too: `refresh_refs` re-copies a reference only when the sole delta is the `brewcode-meta:` line, else prints `REF DIFFERS:` and leaves it |
| repo-root `.sembleignore`, from `brewcode/skills/semble-setup/assets/sembleignore.template` (kind `sh`) | `semble-guidance.sh install` writes the measured-candidates block; its own drift check strips that block and the stamp line (`sg_strip_metaline`) |

**The decision test for a NEW asset** is asked of the GENERATOR, never of the file:

| Question | Answer |
|----------|--------|
| Does any mode of the generator WRITE to the installed path after `cp`ing it? | yes -> exempt from `cmp` + stamp-read; stays mechanism `a` |
| Does only a USER or a self-sync pass ever change it? | no exemption. `DIFFERS` there is a real finding |

`memory-guide.md`, `agent-audit.md` and `prompting-guide.md` are `cp`d from the same
`EMITTED_REFS` as `hard-sync.md` and may be hand-edited by the emitted skill's self-sync, yet are NOT exempt: no
generator mode writes into them.

Audit for `{TOKEN}`-filled files: every byte-copied `STAMPED_FILES` path carrying a
placeholder. Kinds `fmd` and `marker` are dropped (shipped files copied nowhere: agents, this
doc, the plugins' own `SKILL.md` / `INSTALL.md`, whose bodies quote install tokens as
instructions), and `$`-prefixed expansions are runtime code. Today it prints `hard-sync.md`
alone; `.sembleignore` is filled without a token, so no grep finds it:

```bash
sed -n "/^STAMPED_FILES=/,/'\$/p" .claude/scripts/bump-version.sh \
  | sed "s/^STAMPED_FILES='//; s/'\$//" | awk -F'|' '$2 != "fmd" && $2 != "marker" { print $1 }' \
  | while read -r f; do grep -qE '(^|[^\$])\{[A-Z][A-Z0-9_]+\}' "$f" && echo "$f"; done
```

A new line here means a new exemption to document in this table, or a file that should have
been mechanism `b`.

### Stamps are also REFRESHED - `upgrade` owns that

Mechanisms `b` and `c` write a stamp at INSTALL; `upgrade` must REWRITE it. **A PATCHed file
must end up stamped exactly like an ADDed one**: otherwise `status` prints `stale`, `upgrade`
reports success, and `status` prints `stale` again forever.

| Setup | How `upgrade` refreshes the stamp |
|-------|-----------------------------------|
| `semble-setup` | re-runs `semble-guidance.sh install --part all`, the ONLY writer of the rule's stamp |
| `superreview-setup` | `_restamp_meta` over every live artifact in an UNCONDITIONAL loop, deliberately not gated on `IDENTICAL`/`DIFFERS`; `intent-guard.md` via `write_intent_guard` |
| `task-board-setup` | step `U5b` of `brewtools/skills/task-board-setup/references/10-upgrade.md`, never asked, withheld only while a content row is pending (`partial`): the quartet on every stamped control artifact |
| `manager-setup` | `writeState` stamps `version`, `content_version`, `generated_by`, `last_updated` on every write, an empty partial included, while all other keys merge through |
| `memory-sync-setup` | `generate.sh restamp`, the last step of every `upgrade`; `refresh_refs` re-copies references whose only delta is the release stamp |

Restamping is metadata-only, and each proves it: `_restamp_meta` compares the body
byte-for-byte and aborts on a mismatch, `U5b` touches only the quartet and leaves `doc_type`
as found, `restamp_skill` aborts if anything but the provenance keys moved.

### The mechanism-`a` manifest is a list, and the list is authoritative

`STAMPED_FILES` in `.claude/scripts/bump-version.sh` (rows `path|kind|generated_by`) is the
complete set of mechanism-`a` artifacts. `stamp_verify` FAILS the release on a listed file
missing from disk or carrying the wrong stamp; a file NOT listed silently keeps a stale stamp
forever. Adding a byte-copied asset means adding its row in the same change.

`a` and `b` are mutually exclusive per file, enforced by consequence, not by a check: a
template that is itself substituted at install must NOT be listed in `STAMPED_FILES`, because a
baked literal would make its raw `.template-baseline` copy differ on every release.

---

## 4. Version resolution

Never hardcode a version. Never read it from a git tag.

**The rule splits by ROLE**: a WRITER and a READER resolve two numbers that coincide most of the time.

| Role | Resolves | From |
|------|----------|------|
| WRITER - any skill/script that STAMPS an artifact | the version of the plugin whose code is producing this file | `.claude-plugin/plugin.json` reached by self-location. Cache path FORBIDDEN |
| READER - `setup-status`, and the brewcode SessionStart hook | the version of the plugin IN USE | brewcode: its own plugin root (the checkout under `--plugin-dir`). Sibling plugins: the newest version dir in the plugin cache of the active config dir (`CLAUDE_CODE_PLUGIN_CACHE_DIR`, else `CLAUDE_CONFIG_DIR`, else `~/.claude`). Version = the root's basename when it is `X.Y.Z`, else its `.claude-plugin/plugin.json` `.version` |

A writer never resolves from the cache: under `claude --plugin-dir ./brewcode` the cache holds a
DIFFERENT plugin than the one executing, so a dev run would bake the cached version into a real
artifact. Self-location names the tree the running code lives in. The reader's precedence is
`parseVersion` in `brewcode/hooks/session-start.mjs`; `setup-status` Phase 0 uses the same one.
Do not invent a third, and do not "fix" the reader to match the writer. An unresolvable reader
version is reported as such, never defaulted.

### A writer that cannot resolve the version never stamps `unknown`

`unknown` is not a version: `sort -V` accepts it, the `PLACEHLD` character test misses it, and
`setup-status` reports a confident verdict on a value that means "the resolver failed". Two
shapes are sanctioned, nothing else:

| Shape | Writers (examples) | Behaviour |
|-------|--------------------|-----------|
| ABORT - every generator | `sc_plugin_version` in `brewcode/skills/semble-setup/scripts/lib/semble-common.sh` (caller `sc_state_patch` dies); `_plugin_version` / `_content_version` in `brewcode/skills/superreview-setup/scripts/generate.sh`; `brewcode/skills/teams-setup/scripts/detect-mode.sh`, `brewcode/skills/e2e/scripts/detect-mode.sh`; the config blocks of the `agent-*-setup` `INSTALL.md` runbooks | an `X.Y.Z` shape gate fails, the resolver returns non-zero, the mode exits with nothing written. The two `detect-mode.sh` print `ERROR:cannot resolve plugin version (X.Y.Z) ...`, and both skills treat any Phase 0 `ERROR:` line as STOP |
| SENTINEL - `unknown` / `null` never leaves the script | `resolve_plugin_version` / `resolve_content_version` in `brewdoc/skills/memory-sync-setup/scripts/generate.sh` | the internal `unknown` is hard-failed on before anything is written |
| | `pluginVersion` / `resolveContentVersion` in `brewtools/hooks/lib/manager-state.mjs` | return `null`; `writeState` OMITS that key (and deletes one inherited from an older state file) instead of aborting |

`manager-state.mjs` is the one writer that does not fail the run, forced by its role: it is the
HARD wall's off-switch (`set hard=false`), the one Bash command `hardmode-guard.mjs` allows at
every level, so aborting would strand the user behind an armed wall. Dropping the key is safe
because both readers treat its absence as unknown: `setup-status` row 8 falls through to the
copied guard's `brewcode-meta` line, and `status` in `brewtools/skills/manager-setup/SKILL.md` computes
`stale: (stateVersion && pluginVersion) ? ... : null`. Do not copy this shape into a generator.

The rest of this section is the WRITER's rule.

### In a skill script (shell)

```bash
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PV=$(jq -r .version "$SCRIPT_DIR/../../../.claude-plugin/plugin.json")
```

Script self-location. `<plugin>/skills/<skill>/scripts/x.sh` -> `../../../` is the
plugin root, in the dev checkout and in the installed cache alike.

### In a SKILL.md bash block

Both path tokens are load-time TEXT substitutions on the skill body, bash fences included, never
environment variables: neither is set in the Bash tool env.

- `${CLAUDE_SKILL_DIR}` (exact braces) is substituted in every skill: plugin, project and personal.
- `${CLAUDE_PLUGIN_ROOT}` (exact braces) is substituted in PLUGIN skill and agent bodies only. In a
  project or personal skill, and in a project agent, it stays literal and the shell expands it to empty.
- The unbraced `$CLAUDE_PLUGIN_ROOT` and every brace-modifier form (`${CLAUDE_PLUGIN_ROOT:-x}`,
  `${CLAUDE_SKILL_DIR:-x}`) are never substituted: they reach the shell, where the variable is
  unset, so the path is empty or the fallback ALWAYS wins.

| Rank | Idiom | Failure mode |
|------|-------|--------------|
| 1 | `bash "${CLAUDE_SKILL_DIR}/scripts/<x>.sh"` - the script resolves `PV` by self-location | none. Single source of truth; the version logic is testable outside a session |
| 2 | `PV=$(jq -r .version "${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json")` | plugin skills only; in a project skill the path is empty. Guard with `test -f` |
| 3 | cache glob `<config dir>/plugins/cache/claude-brewcode/<plugin>/*/` | **forbidden for a WRITER** (see above). A READER uses it for sibling plugins only, newest leaf (`sort -V \| tail -1`) |
| X | `${CLAUDE_SKILL_DIR:-<fallback>}`, `${CLAUDE_PLUGIN_ROOT:-<fallback>}`, `$CLAUDE_PLUGIN_ROOT` | **broken, silently**: see the list above |

Every Bash call is a fresh shell: re-emit the resolution line in every block that needs `PV`.

### In a template (mechanism b)

**Exactly four spellings, single braces, nothing else:**

| Token | Resolves to |
|-------|-------------|
| `{PLUGIN_VERSION}` | `version` |
| `{CONTENT_VERSION}` | `content_version`, read from the `brewcode-meta:` marker of the generator's own `SKILL.md` |
| `{GENERATED_BY}` | `generated_by` |
| `{LAST_UPDATED}` | `last_updated` |

Braces without `$`: the `$`-prefixed forms are shell expansions, excluded from placeholder
validation. The INSTALLING skill's script substitutes them at install/upgrade; the template and
its `.template-baseline` copy keep them raw. Claude Code's load-time substitution above never
touches them.

Retired placeholder spellings are listed in section 8. They matter to the reader too:
`setup-status` classifies a stamp as `PLACEHLD` by testing the VALUE for any `{`, `}`, `<` or
`>` - a character test, never a list - so a placeholder that slipped past it would reach
`sort -V` as a confident version. Keep the spellings few; never make a consumer enumerate them.

---

## 5. YAML scalar safety

Verified; the date `2001-02-03` is neutral on purpose, the point is the TYPE.

| Parser | `last_updated: 2001-02-03` | `version: 1.2.3` | `version: 1.2` |
|--------|---------------------------|------------------|----------------|
| `Bun.YAML.parse` (the bun in the CC 2.1.226 build; CC parses frontmatter with this) | string `"2001-02-03"` | string | **number `1.2`** |
| js-yaml 3.14.2 (YAML 1.1 default schema) | **Date** `2001-02-03T00:00:00.000Z` | string | number |
| PyYAML 6.0.3 | **`datetime.date`** | string | float |

Claude Code does not mistype an unquoted date (YAML 1.2 core has no timestamp type); every
YAML 1.1 parser does, and a two-segment `version` becomes a number everywhere.

**Rule: quote `version`, `content_version`, `generated_by` and `last_updated` in every
YAML frontmatter and every JSON value. Leave `doc_type` UNQUOTED (section 1).**

### Why quoting is safe for docsync

`parseFm` in `brewdoc/skills/docsync-setup/assets/docsync-track.mjs` strips a leading/trailing
`"` or `'` from every frontmatter value, so docsync sees the identical string quoted or bare and
never sees YAML types. An unquoted value found in a consumer project is not a staleness
signal: report the version, not the quoting.

---

## 6. What `setup-status` does with the values

`content_version` drives the verdict, compared per artifact with the plugin-side source's own
`content_version`; the release `version` is the reference only when the artifact or its source
carries none. `version` is shown on every row as provenance. A stamp cannot see a hand edit, so
`cmp` on mechanism-`a` copies decides between `current` and `modified`. States as
`setup-status` prints them:

| Read | State |
|------|-------|
| stamp equals the reference, every byte pair of the row `SAME` (or none defined) | `current` |
| stamp older or newer than the reference | `stale (installed X.Y.Z, plugin A.B.C)` |
| stamp equals the reference, a byte pair `DIFFERS` | `modified (stamp current, bytes differ)` |
| no stamp at all | `stale (legacy, unstamped)` |
| an old-format stamp from section 8 | `stale (legacy stamp)`: the intended migration, one `upgrade` restamps it |
| the value still holds a placeholder - any `{`, `}`, `<` or `>` | `partial`, never a version verdict: substitution never finished |
| stamp present but the plugin-side source or asset is missing | `version unknown (plugin asset missing)`, never `stale` |

The reader is `read_meta` in `SKILL.md` Phase 2a: per carrier, the first match in the file
head (5 lines for `.mjs`/`.sh`, 40 for anything else). A stamp must sit there.

---

## 7. Template versions are retired

`memory-sync`'s `VERSION=1.0.0` and `intent-guard`'s `template v2` are replaced by the
plugin version, synced across all six version JSON files by `bump-version.sh` (section 8).
`memory-sync`'s `generate.sh` still assigns `VERSION=$(resolve_plugin_version)`: audit what a
generator's variable resolves from.

---

## 8. Retired spellings

Never write these. One found is a legacy stamp: report stale, and translate it in place only
if you are the skill that owns the artifact.

| Retired | Replacement |
|---------|-------------|
| `updated` | `last_updated` |
| `updatedAt` | `last_updated` |
| `updated_at` | `last_updated` |
| `lastUpdated` | `last_updated` |
| `lastSetup` | `last_updated` |
| `lastVerifiedAt` | `last_updated` |
| `checkedAt` | `last_updated` |
| `<!-- last-updated: ... -->` | `last_updated:` in frontmatter |
| `**Last Updated:**` (prose line) | `last_updated:` in frontmatter |
| `\| Last update \|` alone, used as the version signal | the four-row block: `\| Version \|` + `\| Content version \|` + `\| Generated by \|` + `\| Last update \|` |
| `memory-sync template vX.Y.Z` | `version: "X.Y.Z"` (plugin version) |
| `intent-guard template v2` | `version: "X.Y.Z"` (plugin version) |
| `SKILL METADATA - generated <ts>` | the five fields of section 1 |
| `VERSION=1.0.0` or any literal per-template counter in a generator | resolve the plugin version from `.claude-plugin/plugin.json` (section 4). The VARIABLE is fine; the LITERAL is the defect |

Retired PLACEHOLDER spellings - a template still carrying one emits an artifact
`setup-status` reports `PLACEHLD` / `partial`:

| Retired | Replacement |
|---------|-------------|
| `{{PLUGIN_VERSION}}` (and every other double-brace form) | `{PLUGIN_VERSION}` |
| `{{GENERATED_BY}}` | `{GENERATED_BY}` |
| `{{LAST_UPDATED}}` | `{LAST_UPDATED}` |
| `<plugin X.Y.Z>` | `{PLUGIN_VERSION}` |
| `<plugin version from .claude-plugin/plugin.json>` | `{PLUGIN_VERSION}` |
| `{P0.3 version}` | `{PLUGIN_VERSION}` |
| `<date +%F>` | `{LAST_UPDATED}` |
| `<YYYY-MM-DD>` | `{LAST_UPDATED}` |

---

## 9. Out of scope

Not artifact metadata; do not "fix" these to match this spec.

| Thing | Why it stays |
|-------|--------------|
| task-card fields `created:` / `updated:` / `status:` / `priority:` on `.claude/features/**` Kanban cards | domain data of a task, not provenance of a generated file. Owned by `task-board-setup` |
| `.claude/reports/<timestamp>_<name>/` directory naming (`YYYYMMDD-HHMMSS_<name>`) | a directory convention, not a file stamp |
| runtime tmp markers with epoch timestamps | ephemeral state, never compared against a plugin version - see the naming rule below |
| the `.codex/` mirror's OWN manifests | a separate version line, deliberately not bumped - see below |

### Runtime state must not spell itself like provenance

`setup-status`'s `LEGACY-FMT` detector greps for `updatedAt|updated_at|lastUpdated|lastSetup|lastVerifiedAt|checkedAt`,
so a runtime marker named like a retired field is a hazard. What holds is the scope: the
detector runs only over the `STAMPS` heredoc and only when no `version` was extracted, and
that heredoc carries artifacts only - runtime state (`.claude/semble/state.json`,
`.claude/docsync/state-<session_id>.jsonl`, epoch-ms markers, TTL caches) is never added to
it. Keep both guards: name new runtime keys with a unit suffix, as
`brewcode/hooks/session-start.mjs` names its TTL marker `fetchedAtMs`, and keep them out of
`STAMPS`.

### Deliberately unstamped artifacts

Each correctly carries no metadata: an audit that finds one has found the exemption, not a
defect.

| File | Why it carries no stamp |
|------|-------------------------|
| `.claude/features/specs/SPEC_TEMPLATE.md`, `DESIGN_TEMPLATE.md` (task-board) | TEMPLATES inside the project: `/task-spec` copies each to `specs/<ID>-spec.md` / `<ID>-design.md`, so a stamp in their frontmatter would be inherited by every derived card, and cards carry task DOMAIN data (`created:`/`updated:`/`status:`), exempt by the first row of this section. Same reasoning as `TASK_TEMPLATE.md`; U5b excludes all of them by name (`references/10-upgrade.md`) |
| `.claude/brewtools/manager/prompts/<mode>.md` and the global twin `<config dir>/manager/prompts/<mode>.md` (`CLAUDE_CONFIG_DIR`, default `~/.claude`) | USER-authored prompt-text overrides, not generated artifacts. Read by the `brewmod-placeholders` mod's legacy layer, which maps `<mode>` to a placeholder (`full`->`m`, `planmode`->`m.plan`, `architect`->`a`, `review-regression`->`rr`, `review-double`->`r`, `cron-plan`->`+`) and overrides the mod's default `placeholders/<name>.md`; `manager-setup` only lists them, and `purge` KEEPS them |

The shared test: a file is stampable only if it is INSTALLED as a durable plugin artifact
AND some reader compares its version.

### The `.codex/` mirror version is NOT the plugin version

Nine manifests carry the compatibility mirror's own version, for each of brewcode, brewdoc
and brewtools: `<plugin>/.codex/.codex-plugin/plugin.json`, `<plugin>/.codex/package/plugin.json`
and `.codex/plugins/<plugin>/.codex-plugin/plugin.json` (brewui has no mirror).
`.codex/scripts/validate-compat.mjs` pins it as `const VERSION = '4.0.6'` and accepts only
that value or `4.0.6+codex.<cachebuster>`, so `bump-version.sh` deliberately does not move it.
`4.0.6` is the one literal in this document meant to be literal.

- A mirror manifest several plugin releases behind is CORRECT: never report it stale, never
  "fix" it during a bump, never count it among the release-stamped files.
- Moving the mirror forward is a separate change: the `VERSION` constant and every mirror
  manifest move together, or `bump-version.sh` fails on `validate-compat.mjs`.

`generate-compat.mjs` regenerates `.codex/` from source on every bump, so a stamp inside a
mirrored skill or agent is a copy of the source file's stamp: audit the source, never the mirror.
