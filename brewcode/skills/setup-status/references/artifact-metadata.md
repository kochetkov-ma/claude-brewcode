---
doc_type: llm
version: "5.1.0"
generated_by: "brewcode"
last_updated: "2026-08-09"
---

# Artifact metadata and versioning

Normative. Every artifact any brewcode/brewdoc/brewtools/brewui skill writes into a
project draws its metadata from ONE vocabulary of four fields, spelled the same way and
resolved the same way. WHICH of the four an artifact must carry is decided by its
mechanism (section 3), not by its file extension - see "Which fields are required".
One number - the plugin version - answers "is this install current?".

Audience: skill authors, generator authors, `setup-status`.

---

## 1. Fields

Exactly these four names. No synonyms, no extra provenance key, no reordering. The
"Required where" column is a summary; the mechanism table below is the authority.

| Key | Type | Format | Example | Required where |
|-----|------|--------|---------|----------------|
| `version` | string | `X.Y.Z` semver, QUOTED in YAML/JSON | `"X.Y.Z"` | every artifact, every carrier |
| `generated_by` | string | `<plugin>:<skill>`, QUOTED | `"brewdoc:docsync-setup"` | every artifact, every carrier |
| `last_updated` | string | `YYYY-MM-DD`, QUOTED, from `date +%F` | `"YYYY-MM-DD"` | every artifact EXCEPT a mechanism-`a` byte-copied one - see "Which fields are required" below |
| `doc_type` | enum | `llm` \| `user` \| `skip`, **UNQUOTED** | `llm` | `.md` frontmatter ONLY - docsync's field. NEVER in JSON. Generated artifacts are `llm` |

`version` is the version of the **plugin that produced the artifact**, never a
per-template counter. `generated_by` is the producing skill, not the consuming one -
except on hand-maintained SHIPPED artifacts (the plugin's own agents, this spec doc),
where no skill produced the file and the value is the BARE plugin name (`"brewcode"`).

**`doc_type` is the one unquoted value, and that is load-bearing.**
`brewcode/skills/rules/scripts/rules.sh:144` gates on `^doc_type: llm$` and HARD-FAILS
`doc_type: "llm"`. Quote the other three; never quote this one.

**`doc_type` is plugin-owned on a mechanism-`a` artifact, not user-owned.** A re-install
RESTORES it. Under mechanism `a` the installed file is byte-identical to the plugin's,
so there is nothing to preserve: `brewcode/skills/semble-setup/scripts/semble-guidance.sh:180`
lists `doc_type` in `OWNED` alongside the other three, and `sg_strip_meta` (`:381-389`, its own
`OWNED` at `:383`) removes all four from BOTH sides before comparing. Prose-identical + stamp-different
therefore takes the metadata-only re-sync branch (`install_managed`, same file), which
`mv`s the plugin bytes over the destination with no `--force` and no backup - and a
locally chosen `doc_type: user` or `doc_type: skip` goes with them. That is asserted, not
tolerated: `brewcode/skills/semble-setup/tests/suite-hooks.mjs:592` (`B5.docTypeReset`)
requires the restored value to be `llm`.

A repo that wants a different `doc_type` on a managed rule must change the prose too -
that makes the file `user_modified`, which IS preserved (and backed up before any
`--force` overwrite: `B5.backup`, `B5.backupIsTheUserFile`, same file `:596-597`). Only mechanism
`c` artifacts, which no installer rewrites, carry a durably user-chosen `doc_type`.

### Key order

`doc_type, version, generated_by, last_updated`, appended AFTER the file's own
frontmatter keys - i.e. immediately before the closing `---`, never at the top. An
artifact whose mechanism omits `last_updated` simply ends one key earlier; the order of
what remains never changes.

A skill MAY add its own extra keys, and they MUST TRAIL the four. `memory-sync` writes
`surface_files` last, after `last_updated`; that is the sanctioned shape. A reader of
this spec ignores any key it does not own - an unknown trailing key is never a defect
and never a staleness signal.

### Which fields are required - decided by MECHANISM, never by file extension

| Artifact | Fields |
|----------|--------|
| mechanism `a`, byte-copied into the project | `version` + `generated_by`, and `doc_type` when the carrier is `.md` frontmatter. **NEVER `last_updated`** |
| mechanism `a`, hand-maintained SHIPPED file that is NOT copied anywhere (the 8 plugin agents, this spec doc) | all four - the date legitimately means "shipped in the release of that day" |
| mechanism `b` (substituted at install) and mechanism `c` (written by the model) | all applicable fields, `last_updated` included |

A byte-copied asset omits `last_updated` because the value would be the RELEASE date,
which is identical in the plugin file and in the copy and therefore says nothing, while
rewriting it on every build churns the bytes and defeats the `cmp` drift signal that is
the whole point of mechanism `a`. This is not a `.mjs`/`.sh` carve-out - it is the
mechanism. `.claude/scripts/bump-version.sh` encodes exactly this split in its stamp
KINDS (`bump-version.sh:41-47`, `stamp_rewrite` at `:211-229`):

| Kind | Writes | Used for |
|------|--------|----------|
| `fm` | `version`, `generated_by` | byte-copied `.md`-frontmatter assets |
| `fmd` | `version`, `generated_by`, **`last_updated`** | hand-maintained shipped `.md` (8 agents + this doc) |
| `mjs` / `sh` / `md` / `marker` | `version`, `generated_by` inside a `brewcode-meta:` fragment | byte-copied scripts and `.md` |

`brewcode/skills/semble-setup/assets/semble-first.md.template` is the worked example:
kind `fm`, so its frontmatter carries `doc_type`, `version`, `generated_by` and no
`last_updated` - and `.claude/rules/semble-first.md` in this repo is the installed copy,
landing exactly that way.

**Known contradiction, stated so nobody "fixes" the wrong side.**
`brewcode/skills/rules/scripts/rules.sh:140-146` validates rule files and REQUIRES all
six of `paths, description, doc_type, version, generated_by, last_updated`, with
`last_updated` a quoted `YYYY-MM-DD`. That is correct for what it validates: the files
`rules.sh` itself creates are mechanism `b`, rendered from
`brewcode/templates/rules/*.md.template` where `{LAST_UPDATED}` is substituted
(`rules.sh:98-104`). Its validation glob is `.claude/rules/avoid.md`,
`best-practice.md`, `*-avoid.md`, `*-best-practice.md` (`rules.sh:180`), so it does not
today reach `semble-first.md`. Two brewcode skills write the same directory under
different field sets and only the filename keeps them apart. **The mechanism rule above
is the tiebreaker**: a validator that widens its glob must exempt mechanism-`a` files
from `last_updated`, not demand the field. Do not add `last_updated` to a byte-copied
asset to satisfy a validator.

---

## 2. Carriers

| Carrier | Placement | Key order |
|---------|-----------|-----------|
| `.md` with YAML frontmatter | appended after the file's own keys, before the closing `---` | `doc_type, version, generated_by, last_updated` (+ skill-private keys trailing). Drop `last_updated` when the file is byte-copied (mechanism `a`, stamp kind `fm`) |
| `.json` | top level, snake_case | `version, generated_by, last_updated` - all three MANDATORY, `doc_type` FORBIDDEN |
| `.mjs` / `.sh` copied byte-for-byte | ONE comment line, immediately after the shebang if present, else line 1 | `version`, `generated_by` only - never `last_updated` |
| `.md` copied byte-for-byte, whose BODY is consumed verbatim | ONE line-1 HTML comment `<!-- brewcode-meta: ... -->` | `version`, `generated_by` only - never `last_updated` |
| markdown header table (`team.md` style) | three rows in the header table, in this order | `Version`, `Generated by`, `Last update` |

**A JSON artifact carrying only `version` is INCOMPLETE, not a variant.** All three keys
travel together in every JSON carrier, written on every mode that writes the file at all
(`install`, `upgrade`, `enable`, `disable`, `level`). And `doc_type` never appears in
JSON - it is docsync's `.md` field, and a JSON config is not a doc.

"Every writing mode" is the enforced part - a config the user last touched via `enable`
must not report the version that `install` left. Five implementations, all four carriers:

| Config | Writer | Modes covered |
|--------|--------|---------------|
| `.claude/agent-deadline.json` | `brewtools/skills/agent-deadline-setup/assets/INSTALL.md` - one config block (`:140-193`, stamp `:187`, verify `:193`, hard-fail `:185`) reused by every mode | install `:267`/`:346`, upgrade `:423`, enable+disable `:467` (stamp `:507`). Contract stated at `:91`; no `level` mode exists here |
| `.claude/brewtools/agent-router.json` | `brewtools/skills/agent-router-setup/assets/INSTALL.md` - config block `:184-227` (stamp `:221`, verify `:227`) | install `:310`, upgrade `:406`, `level` `:446-448` (re-runs the block), enable+disable `:459` (stamp `:501`). Contract at `:127` |
| `.claude/brewtools/manager/state.json` | `brewtools/hooks/lib/manager-state.mjs:222-253` | every `writeState` call, unconditionally, with all other keys merged through. `generated_by` and `last_updated` always; `version` only when `pluginVersion()` resolves — see the never-`unknown` section for the one sanctioned omission |
| `.claude/docsync/config.json` | `brewdoc/skills/docsync-setup/SKILL.md:391-393` | install `:194`, upgrade `:322`, and `enable`/`disable` BACKFILL a config whose value already matches but whose provenance is missing or stale (`:366-372`, short-circuit guard `:388-389`) |
| `.claude/md-to-pdf.config.json` | `brewdoc/skills/md-to-pdf/SKILL.md` - shape `:86-91`, mandate `:94` | both write paths: engine choice `:98-105` and styles `:201-203`, each hard-failing on a missing version (`:101`, `:193-195`) |

### `.md` frontmatter

```yaml
---
name: superreview
description: "Deep project-tailored review."
user-invocable: true
disable-model-invocation: true
doc_type: llm
version: "X.Y.Z"
generated_by: "brewcode:superreview-setup"
last_updated: "YYYY-MM-DD"
---
```

Every example in this document uses `X.Y.Z` / `YYYY-MM-DD` on purpose. A literal
version in a normative document goes stale at the next bump and then teaches the
wrong number - the release stamper rewrites only this file's own frontmatter, never
its examples.

### `.json`

```json
{
  "docs": ["docs/**/*.md"],
  "exclude": ["node_modules/**"],
  "version": "X.Y.Z",
  "generated_by": "brewdoc:docsync-setup",
  "last_updated": "YYYY-MM-DD"
}
```

All three keys, always. `{"version": "X.Y.Z", "threshold_days": 30}` is a non-conforming
artifact, and `setup-status` can only report its version, never who wrote it or when.

### `.mjs`

```javascript
#!/usr/bin/env node
// brewcode-meta: version=X.Y.Z generated_by=brewdoc:docsync-setup
```

### `.sh`

```bash
#!/usr/bin/env sh
# brewcode-meta: version=X.Y.Z generated_by=brewcode:teams-setup
```

### `.md` HTML comment - the fifth carrier

A byte-copied `.md` whose whole body is consumed verbatim cannot use frontmatter: the
keys would leak into whatever consumes the body. It carries the same `brewcode-meta:`
fragment inside a line-1 HTML comment instead.

```markdown
<!-- brewcode-meta: version=X.Y.Z generated_by=brewdoc:memory-sync-setup -->
```

Four files in production: `brewtools/skills/think-short-setup/assets/think-short-prompt.md`
(its body is injected into a prompt) and the three
`brewdoc/skills/memory-sync-setup/references/{memory-guide,agent-audit,hard-sync}.md`.
`bump-version.sh` calls these kinds `md` and `marker`; `setup-status` reads them with
its third `.md` fallback - frontmatter `version:` in the first 40 lines, then a
`| Version |` header row, then a `brewcode-meta:` marker in the first 5 lines
(`brewcode/skills/setup-status/SKILL.md:514`).

**Quirk: `think-short-prompt.md:1` is the only stamp in the repo with a word BEFORE the
anchor** - `<!-- think-short brewcode-meta: version=X.Y.Z generated_by=... -->`. That is
legal, and legal by construction rather than by luck: `stamp_rewrite`'s non-frontmatter
branch is an UNANCHORED global substitution on the `brewcode-meta: version=... generated_by=...`
fragment (`bump-version.sh:225-226`), and every reader greps for the fragment, never for
a line start. So the comment may carry any prefix. Nothing strips the comment - the hook
reads the file and injects it whole (`think-short-prompt-counter.mjs:77-87`,
`think-short-session.mjs:84-93`); an HTML comment is simply inert in the injected text.

Marker is literally `brewcode-meta:` wherever it appears - it is the grep anchor, not a
plugin name, and the string does not vary by plugin. brewui ships no stamped asset at
all, so the marker occurs in brewcode, brewdoc and brewtools only. No file has more than
one.

### markdown header table

```markdown
| Field | Value |
|-------|-------|
| Team | backend |
| Version | X.Y.Z |
| Generated by | brewcode:teams-setup |
| Last update | YYYY-MM-DD |
```

The three rows travel together, in that order - `Version`, then `Generated by`, then
`Last update` - after whatever rows the file itself owns. Values are BARE here; the
markdown cell is not YAML and nothing parses it as a scalar. A lone date row is a
retired signal (section 8).

### NOT a carrier: `VERSIONED_DOCS`

Seven shipped human-facing pages state the plugin version in a one-line header and are
**exempt from everything in this section**. They are not artifacts - nothing installs
them into a project, nothing `cmp`s them, `setup-status` never reads them:

| Files | Header form |
|-------|-------------|
| `brewcode/README.md`, `brewdoc/README.md`, `brewtools/README.md`, `brewui/README.md` | `\| Version \| X.Y.Z \|` (line 7) |
| `brewcode/docs/file-tree.md` | `> Version: X.Y.Z` |
| `brewcode/docs/commands.md` | `**ver:** X.Y.Z` |
| `brewdoc/docs/commands.md` | `**Version:** X.Y.Z` |

`.claude/scripts/bump-version.sh:88-94` holds the list as `VERSIONED_DOCS` and rewrites
it with `doc_rewrite` (`:100-111`) - six anchored `sed` expressions matching one version
literal each - then `doc_verify` (`:113-128`) fails the release if a file states any
version other than the new one. The anchoring is deliberate: these pages also contain
historical prose ("dropped in vX.Y.Z") that must never move.

**So a lone `| Version |` row in a `| Field | Value |` table is compliant HERE and only
here.** The three-row rule above governs an installed artifact such as `team.md`, whose
version is a staleness signal a reader compares against the plugin. A plugin README's
version is a fact about the page. Do not add `| Generated by |` / `| Last update |` rows
to these seven, and do not report them non-compliant. The two lists are disjoint by
construction - `STAMPED_FILES` (30 rows) and `VERSIONED_DOCS` (7 rows) share no path.

---

## 3. Mechanisms

Pick by **how the artifact reaches the project**, not by file type.

| # | Mechanism | Applies to | Stamp lives in | Written by |
|---|-----------|-----------|----------------|------------|
| a | BAKED AT RELEASE | assets copied byte-for-byte into the project, plus hand-maintained shipped `.md` | the PLUGIN's own file | `.claude/scripts/bump-version.sh`, on every bump |
| b | SUBSTITUTED AT INSTALL | templates that already run scalar substitution | the template, as `{PLUGIN_VERSION}` / `{GENERATED_BY}` / `{LAST_UPDATED}` | the generator, at install/upgrade |
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

Under **a** the two signals stay independent: `cmp` detects drift, the stamp reports
the version. They do not interfere because plugin file and installed file are the same
bytes, stamp included.

Under **c** the SKILL.md MUST state the exact lines to emit AND the exact command that
reads the version. The model never invents either.

### Exception to constraint 1 - a byte-copied asset the install then FILLS

An asset may be mechanism `a` - listed in `STAMPED_FILES`, stamped at release, `cp`d
verbatim by a generator - and still be legitimately never byte-STABLE, when a mode of
that generator writes project-specific content INTO the installed copy after copying it.
Such a file is **exempt from `cmp` and from stamp-reading by every reader**. It is NOT
reclassified: no install-time token substitution and no model authorship of the file as a
whole is involved, so it is not `b` and not `c`. The exemption lands on the readers, not
on the mechanism, and `bump-version.sh` keeps stamping it (kind `md`) because the
PLUGIN-side copy is the one being versioned.

**The one file today** is `brewdoc/skills/memory-sync-setup/references/hard-sync.md`.
`generate.sh:398` `cp`s all three `EMITTED_REFS` (`:38`) verbatim, and this one carries two
BLOCK placeholders - `{PATHS_PRECISION_TABLE}` (`hard-sync.md:70-71`) and
`{OBVIOUS_VS_DOMAIN_TABLE}` (`:126-127`) - that the emitted skill's Phase 3 fills per
project. `validate` FAILS while either is open (`generate.sh:552-559`, `_open_tokens` at
`:216-231`, allow-list `RUNTIME_ALLOW` at `:49`), so a HEALTHY install differs from the
plugin source by construction. Its stamp is frozen for the same reason: `refresh_refs()`
(`generate.sh:514-532`) re-copies a reference only when the sole delta is the
`brewcode-meta:` line and otherwise prints `REF DIFFERS:` and leaves it alone (`:529`).
The consumer already implements the carve-out - `brewcode/skills/setup-status/SKILL.md:70`,
the row-9 note at `:110-113`, and `:793` where `DIFFERS` on this path is named the healthy
state.

**The decision test for a NEW asset.** Ask it of the GENERATOR, never of the file:

| Question | Answer |
|----------|--------|
| Does any mode of the generator WRITE to the installed path after `cp`ing it? | yes -> exempt from `cmp` + stamp-read; stays mechanism `a` |
| Does only a USER or a self-sync pass ever change it? | no exemption. `DIFFERS` there is a real finding |

That distinction is what keeps the carve-out narrow. `memory-guide.md` and
`agent-audit.md` sit beside `hard-sync.md`, are `cp`d by the same loop, and CAN be
hand-edited by the emitted skill's Phase 4 self-sync - and they are NOT exempt, because
no generator mode writes into them. A "might get edited" file is not an exempt file.

Audit that the list is still one file - every byte-copied `STAMPED_FILES` path carrying a
placeholder the install must fill. Kind `fmd` is dropped because those files are
hand-maintained and copied nowhere, and `$`-prefixed shell/JS expansions are dropped
because they are runtime code, not placeholders. Expect exactly one line:

```bash
sed -n "/^STAMPED_FILES=/,/'\$/p" .claude/scripts/bump-version.sh \
  | sed "s/^STAMPED_FILES='//; s/'\$//" | awk -F'|' '$2 != "fmd" { print $1 }' \
  | while read -r f; do grep -qE '(^|[^\$])\{[A-Z][A-Z0-9_]+\}' "$f" && echo "$f"; done
```

A second file appearing here means either a second exemption to document HERE, or a file
that should have been mechanism `b` all along. Do not let the next reader infer a
permanent single-file carve-out from the count - the RULE is the generator test above,
and the count is only its current answer.

### Stamps are also REFRESHED - `upgrade` owns that

Mechanism `b` and `c` write a stamp at INSTALL; the mode that has to REWRITE it is
`upgrade`, and for a long time no generator owned it. The failure was silent and permanent: a
PATCHed artifact kept the stamp of whatever version first installed it, `status` printed
`stale`, prescribed `upgrade`, `upgrade` reported success, `status` printed `stale` again
- forever (stated at `brewtools/skills/task-board-setup/references/10-upgrade.md:282-291`).
**A PATCHed file must end up stamped exactly like an ADDed one.** Five generators now
enforce that, and an `upgrade` that cannot clear its own staleness is a defect:

| Setup | How `upgrade` refreshes the stamp |
|-------|-----------------------------------|
| `semble-setup` | re-runs `semble-guidance.sh install --part all` - the ONLY writer of the rule's stamp (`brewcode/skills/semble-setup/SKILL.md:143`) |
| `superreview-setup` | `_restamp_meta` (`scripts/generate.sh:522`) over five artifacts in an UNCONDITIONAL loop, deliberately not gated on `IDENTICAL`/`DIFFERS` (`:620-629`); `intent-guard.md` is stamped separately by `write_intent_guard` (`:633`) |
| `task-board-setup` | step `U5b`, always runs, never gated - the trio on nine artifacts (`references/10-upgrade.md:282-306`) |
| `manager-setup` | `writeState('project', {}, cwd)` with an EMPTY partial (`SKILL.md:253`); `writeState` stamps the trio on every write while all other keys merge through (`brewtools/hooks/lib/manager-state.mjs:222-253`) |
| `memory-sync-setup` | `restamp` mode (`scripts/generate.sh:442`), the last step of `upgrade` (`SKILL.md:74`, `:127-133`); it also calls `refresh_refs()` (`:503`) to re-copy references whose only delta is the release stamp |

Restamping is metadata-only, and each of these proves it: `superreview` gates on body
identity (`generate.sh:554-558`), `task-board` touches only the trio inside the first
frontmatter block and leaves `doc_type` as found (`10-upgrade.md:312-315`),
`memory-sync` aborts if anything but the provenance keys moved (`generate.sh:491`).

### The mechanism-`a` manifest is a list, and the list is authoritative

`STAMPED_FILES` in `.claude/scripts/bump-version.sh:51-80` is the complete set of
mechanism-`a` artifacts - **30 rows** today, `path|kind|generated_by`. A file listed
there and missing on disk FAILS the release (`stamp_verify`, `:293-299`); a file NOT
listed silently keeps a stale stamp forever. Adding a byte-copied asset means adding a
row in the same change.

`a` and `b` are mutually exclusive per file, and the exclusion is enforced by
consequence, not by a check: a file carrying `{PLUGIN_VERSION}` must NOT be listed in
`STAMPED_FILES`, because a baked literal would make its raw `.template-baseline` copy
differ on every release - the exact superreview bug the comment at `bump-version.sh:28-31`
records.

---

## 4. Version resolution

Never hardcode a version. Never read it from a git tag.

**The rule splits by ROLE.** A WRITER and a READER are resolving two different numbers
that happen to coincide most of the time.

| Role | Resolves | From |
|------|----------|------|
| WRITER - any skill/script that STAMPS an artifact | the version of the plugin whose code is producing this file | `.claude-plugin/plugin.json` reached by self-location. Cache path FORBIDDEN |
| READER - `setup-status`, and the brewcode SessionStart hook | the version of the plugin INSTALLED on this machine | installed cache-directory basename first, that root's `.claude-plugin/plugin.json` `.version` second |

A writer must never resolve from the cache: under `claude --plugin-dir ./brewcode` the
cache holds a DIFFERENT plugin than the one executing, so a dev run would bake the
cached version into a real artifact. Self-location cannot be wrong - it names the tree
the running code lives in.

A reader has the opposite requirement. `setup-status` asks "is this project's artifact
current against the plugin the user actually has installed?", and the answer is a
property of the install, so the installed cache directory IS the authority; its basename
is the version. `brewcode/hooks/session-start.mjs` (`parseVersion`) resolves the same
number the same way, and `brewcode/skills/setup-status/SKILL.md:135-153` and `:311-325`
cite this section for it. One precedence, two consumers - do not invent a third, and do
not "fix" the reader to match the writer.

The reader's fallbacks matter because the basename is not always a version: a
`--plugin-dir` or symlinked root has a name like `brewcode`, so a basename that does not
match `[0-9]*.[0-9]*.[0-9]*` falls through to `plugin.json`, and an unresolvable version
aborts rather than defaulting.

### A writer that cannot resolve the version ABORTS - it never stamps `unknown`

`unknown` is not a version. Written into an artifact it defeats every consumer at once:
`sort -V` accepts it, the `PLACEHLD` character test (`{`/`}`/`<`/`>`) does not catch it,
and `setup-status` reports a confident verdict on a value that means "the resolver
failed". So the resolver returns non-zero and the caller exits; the mode fails loudly
with nothing written.

The rule is enforced, not merely stated - SIX writers in TWO shapes. Four ABORT, below.
Two treat the unresolvable case as an internal SENTINEL that is hard-failed on or dropped
before anything reaches disk. This is the complete set; a seventh writer copies one of
these two shapes and joins it. Nothing else is sanctioned.

| Writer | Resolver | Fails at |
|--------|----------|----------|
| `brewcode/skills/semble-setup/scripts/lib/semble-common.sh` | `sc_plugin_version()` `:319-329`, `X.Y.Z` gate at `:324` | `:327` returns 1; caller `sc_state_patch:469` `|| sc_die` |
| `brewcode/skills/superreview-setup/scripts/generate.sh` | `_plugin_version()` `:172-191` | `:190` returns 1; caller `:214` `|| exit 1` |
| `brewcode/skills/teams-setup/scripts/detect-mode.sh` | `:11-20` | `:26-29` prints `ERROR:cannot resolve plugin version (X.Y.Z)` and `exit 1` |
| `brewcode/skills/e2e/scripts/detect-mode.sh` | `:10-19` | `:28-31` prints the same `ERROR:cannot resolve plugin version (X.Y.Z)` line and `exit 1` |

The two SENTINEL writers reach the same outcome by the other road:

`brewdoc/skills/memory-sync-setup/scripts/generate.sh:72` - `unknown` is an internal
SENTINEL that is immediately hard-failed on, never a value that can leave the script.

`brewtools/hooks/lib/manager-state.mjs:69-81` - `pluginVersion()` returns `null`, never the
string `unknown`, and `writeState` then OMITS the `version` key instead of aborting
(`:242-252`, which also `delete`s a `version` inherited from an older state file, so merging
over that file cannot let this write keep claiming its predecessor's version). It is the ONE
writer here that does not fail the run, and the exception is forced by its role rather than
by convenience: this module is the HARD wall's off-switch (`set hard=false`) and running it
is the single Bash shape the guard self-exempts (`hardmode-guard.mjs:188-199`, anchored on
the shipped helper path at `:152`), so a writer that aborted would strand the user behind an
armed wall with no exit. The other five are generators - nothing is armed when they refuse.
Dropping the key is safe only because BOTH readers already treat its absence as UNKNOWN
rather than as a version: `setup-status` roster row 8
(`brewcode/skills/setup-status/SKILL.md:89`) defines an absent `version` as the `missing`
signal and falls through to the copied guard's `brewcode-meta` line, and `manager-setup`
`status` computes `stale: (stateVersion && pluginVersion) ? ... : null`
(`brewtools/skills/manager-setup/SKILL.md:448`), so it is never compared as if it were real.
Do not copy this shape into a generator: it is licensed by an armed guard, not by taste.

The two `detect-mode.sh` writers share one dialect on purpose - the same shape-gate
(`case "$PLUGIN_VERSION" in [0-9]*.[0-9]*.[0-9]* ) : ;; *) ... exit 1`) and the same
`ERROR:` wording - because both skills treat any `ERROR:` line from Phase 0 as STOP. e2e
extends it to `status` as well: a status run that cannot name the running version has no
version to compare a stamp against. Its docs match the code -
`e2e/references/mode-status.md:30-33`, `mode-rules.md:30-32` and `mode-install.md:176-179`
all name `stale (legacy, unstamped)` as the answer for a missing stamp and forbid
`unknown` outright. e2e is no longer an outlier.

The rest of this section is the WRITER's rule.

### In a skill script (shell)

```bash
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PV=$(jq -r .version "$SCRIPT_DIR/../../../.claude-plugin/plugin.json")
```

Script self-location. `<plugin>/skills/<skill>/scripts/x.sh` -> `../../../` is the
plugin root, in the dev checkout and in the installed cache alike.

### In a SKILL.md bash block

Verified on Claude Code 2.1.226 (Bun v1.4.0 build):

- `${CLAUDE_SKILL_DIR}` is **not** an environment variable. Nothing in the binary
  assigns it to a process env. It is a prompt-render-time text substitution: when a
  skill's prompt is built, the body is run through `replace(/\$\{CLAUDE_SKILL_DIR\}/g, dirname(SKILL.md))`.
  It applies to plugin skills and to project/user `.claude/skills` alike.
- Because the pattern is the exact literal `${CLAUDE_SKILL_DIR}`, any brace-modifier
  form is **not** matched.
- Claude Code additionally prepends `Base directory for this skill: <abs path>` to
  every skill prompt, so the directory is always knowable from the prompt itself.
- `${CLAUDE_PLUGIN_ROOT}` is substituted in agent `.md` files, hook commands and MCP
  configs, and exported for hook processes - but **not** into a skill body and **not**
  into the Bash tool env. In a SKILL.md bash block it expands to empty.

Ranked idioms:

| Rank | Idiom | Failure mode |
|------|-------|--------------|
| 1 | `bash "${CLAUDE_SKILL_DIR}/scripts/<x>.sh"` - the script resolves `PV` by self-location | none. Single source of truth; the version logic is testable outside a session |
| 2 | `PV=$(jq -r .version "${CLAUDE_SKILL_DIR}/../../.claude-plugin/plugin.json")` | correct for plugin skills only. A project skill under `.claude/skills/<x>` has no plugin.json two levels up -> empty `PV`. Guard with `test -f` |
| 3 | cache glob `~/.claude/plugins/cache/claude-brewcode/<plugin>/*/` | **forbidden for a WRITER.** Resolves to the INSTALLED cache even under `claude --plugin-dir ./brewcode`, so a dev run stamps the cached version. Take the newest leaf (`sort -V \| tail -1`), never an arbitrary one. This is the READER's sanctioned first choice - see the role split above |
| X | `${CLAUDE_SKILL_DIR:-<fallback>}` | **broken, silently.** The substitution regex does not match the `:-` form, so the token reaches the shell literally; the variable is unset there, so the fallback ALWAYS wins. Observed verbatim in transcripts. Never use a brace-modifier form on this token |
| X | `$CLAUDE_PLUGIN_ROOT` / `${CLAUDE_PLUGIN_ROOT}` in a bash block | expands to empty -> the path becomes `/skills/...` -> silent no-such-file or wrong file |

Every Bash call is a fresh shell. Nothing persists between blocks - re-emit the
resolution line at the top of every block that needs `PV`.

### In a template (mechanism b)

**Exactly three spellings, single braces, nothing else:**

| Token | Resolves to |
|-------|-------------|
| `{PLUGIN_VERSION}` | `version` |
| `{GENERATED_BY}` | `generated_by` |
| `{LAST_UPDATED}` | `last_updated` |

Braces without `$` - the `$`-prefixed forms are shell expansions and are excluded from
placeholder validation. The generator resolves them; the template and its
`.template-baseline` copy keep them raw.

Retired placeholder spellings, listed again in section 8: `{{PLUGIN_VERSION}}` and
every other double-brace form, `<plugin X.Y.Z>`, `<date +%F>`, `<YYYY-MM-DD>`,
`{P0.3 version}`, `<plugin version from .claude-plugin/plugin.json>`.

**Why one spelling matters to the reader, not just the writer.** `setup-status`
classifies a stamp as `PLACEHLD` (substitution never ran) by testing the VALUE for any
`{`, `}`, `<` or `>` - a character test, never a list. An unrecognised placeholder that
slipped through the test would be handed to `sort -V` and reported as a confident
version verdict. Keep the character classes small and the spellings few; never make a
consumer enumerate them.

---

## 5. YAML scalar safety

Verified, not assumed:

Dates below are a neutral `2001-02-03` on purpose - the point is the TYPE, not the day.

| Parser | `last_updated: 2001-02-03` | `version: 1.2.3` | `version: 1.2` |
|--------|---------------------------|------------------|----------------|
| `Bun.YAML.parse` (the bun in the CC 2.1.226 build; CC parses frontmatter with this) | string `"2001-02-03"` | string | **number `1.2`** |
| js-yaml 3.14.2 (YAML 1.1 default schema) | **Date** `2001-02-03T00:00:00.000Z` | string | number |
| PyYAML 6.0.3 | **`datetime.date`** | string | float |

So Claude Code itself does not mistype an unquoted date - YAML 1.2 core has no
timestamp type. Every YAML 1.1 parser does. Quoting is therefore mandatory for
cross-parser stability, and mandatory for `version` because a two-segment value would
become a number.

**Rule: quote `version`, `generated_by` and `last_updated` in every YAML frontmatter
and every JSON value. Always. Leave `doc_type` UNQUOTED - it is an enum consumed by a
`^doc_type: llm$` grep, not a scalar anything types.**

### Why quoting is safe for docsync

`brewdoc/skills/docsync-setup/assets/docsync-track.mjs:88` strips a leading/trailing
`"` or `'` from every frontmatter value before use, so docsync's hand-rolled regex
parser sees the identical string quoted or bare. It never sees YAML types at all -
which is why the quoting rule costs nothing and buys cross-parser stability.

The unquoted-`last_updated` migration is DONE: no shipped `.md` in any of the four
plugins carries a bare date today. An unquoted value found in a CONSUMER project is
still not a staleness signal - report the version, not the quoting.

---

## 6. What `setup-status` does with the values

| Stamp read | Verdict |
|------------|---------|
| `version` == installed plugin version | `installed` |
| `version` != installed plugin version (older or newer) | `stale` - name the two versions in the *found* column |
| no stamp at all | `stale (legacy, unstamped)` |
| an old-format stamp from section 8 | `stale (legacy stamp)` |
| the value still holds a placeholder - any `{`, `}`, `<` or `>` | `partial`, never a version verdict: substitution never finished |
| stamp present but the plugin asset is missing from the cache | `version unknown (plugin asset missing)`, never `stale` |

An artifact carrying a retired-format stamp is reported stale so the user re-runs
`upgrade`. That is the intended migration, not a bug.

`cmp` keeps its separate job: byte drift of a mechanism-`a` asset. `cmp` says
`DIFFERS` -> `stale`; the stamp says which version the project is on. Neither replaces
the other.

Reading a stamp is a one-line grep, so it stays inside `setup-status`'s read-only
budget:

```bash
grep -m1 -oE 'brewcode-meta: version=[0-9]+\.[0-9]+\.[0-9]+' "$f"
grep -m1 -E '^version:' "$f" | tr -d '"'"'"' '
```

---

## 7. Template versions are retired

`memory-sync`'s `VERSION=1.0.0` and `intent-guard`'s `template v2` are replaced by the
plugin version. One number, trivially comparable, already synced across all six JSON
files by `bump-version.sh`. Do not reintroduce a per-template counter.

What is retired is the LITERAL, not the variable name. `memory-sync`'s
`generate.sh` still assigns `VERSION=`, but it is now
`VERSION=$(resolve_plugin_version)` reading `brewdoc/.claude-plugin/plugin.json` - and
that assignment is what writes the stamp. Auditing a generator, check what the variable
RESOLVES FROM; a `VERSION=` line is not itself evidence of anything.

---

## 8. Retired spellings

Never write these. If you find one, it is a legacy stamp - report stale, do not
translate it in place unless you are the skill that owns the artifact.

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
| `\| Last update \|` alone, used as the version signal | the three-row block: `\| Version \|` + `\| Generated by \|` + `\| Last update \|` |
| `memory-sync template vX.Y.Z` | `version: "X.Y.Z"` (plugin version) |
| `intent-guard template v2` | `version: "X.Y.Z"` (plugin version) |
| `SKILL METADATA - generated <ts>` | the four fields of section 1 |
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

Not artifact metadata. Do not "fix" these to match this spec.

| Thing | Why it stays |
|-------|--------------|
| task-card fields `created:` / `updated:` / `status:` / `priority:` on `.claude/features/**` Kanban cards | domain data of a task, not provenance of a generated file. Owned by `task-board-setup` |
| `.claude/reports/<timestamp>_<name>/` directory naming (`YYYYMMDD-HHMMSS_<name>`) | a directory convention, not a file stamp |
| runtime tmp markers with epoch timestamps | ephemeral state, never compared against a plugin version - see the naming rule below |
| the `.codex/` mirror's OWN manifests | see below - a separate version line, deliberately not bumped |

### Runtime state must not spell itself like provenance

An epoch-ms marker is out of scope, but a marker NAMED like a retired field is a live
hazard: `setup-status`'s legacy-format detector greps for `updatedAt|updated_at|lastUpdated|lastSetup|lastVerifiedAt|checkedAt`
(`brewcode/skills/setup-status/SKILL.md:451`, verdict `LEGACY-FMT` at `:475`).
`brewcode/hooks/session-start.mjs` renamed its TTL marker `checkedAt` -> `fetchedAtMs`
for exactly that reason, and says so at `session-start.mjs:112-113` (reads `:118-119`,
`:179-180`; writes `:147`, `:202`).

**The rename is the belt; the SCOPE is the braces, and the scope is what actually holds.**
The detector only ever runs over the `STAMPS` heredoc, and only when no `version` was
extracted (`SKILL.md:450`, `:459`). That heredoc carries ARTIFACTS only - runtime state
(`.claude/semble/state.json`, `.claude/docsync/state.json`, epoch-ms markers, TTL caches)
may never be added to it (`SKILL.md:539-549`). So a runtime file cannot trip the detector
even if it spells a retired key. Keep both: name new runtime keys with an explicit unit
suffix (`fetchedAtMs`), and keep them out of `STAMPS`.

### Deliberately unstamped artifacts - documented so they stop being re-flagged

Each is a real file that carries no metadata, and each is CORRECT that way. An audit that
finds one has found the exemption, not a defect.

| File | Why it carries no stamp |
|------|-------------------------|
| `brewtools/skills/agent-router-setup/assets/judge-prompt.md` | never copied into a project - its whole text is INLINED into `settings.json` as the tier-2 hook's `prompt` string (`agent-router-setup/SKILL.md:22`, `:70`, `README.md:148`). Nothing installs it, so nothing `cmp`s or stamp-reads it; the installed carrier that IS stamped is `agent-router.mjs`. Install-time checks assert only that it exists and is non-empty (`SKILL.md:89`, `:345`, `:348`) |
| `.claude/features/specs/SPEC_TEMPLATE.md`, `DESIGN_TEMPLATE.md` (task-board) | they are TEMPLATES inside the project: `/task-spec` copies each to `specs/<ID>-spec.md` / `<ID>-design.md` (`task-board-setup/references/09-spec-templates.md:7-8`), so a stamp in their frontmatter would be inherited by every derived card - and cards carry task DOMAIN data (`created:`/`updated:`/`status:`), exempt by the first row of this section. Same reasoning already applied to `TASK_TEMPLATE.md`, and U5b excludes all of them by name (`references/10-upgrade.md:293-295`) |
| `.claude/brewtools/manager/prompts/<mode>.md` and the `~/.claude` twin | USER-authored prompt-text overrides, not generated artifacts. The plugin default lives in `$BT_ROOT/skills/manager-setup/references/<mode>.md` and the override is the last entry of a three-step read precedence (`manager-setup/SKILL.md:89`, `:410`); the file's whole body is injected as prompt text, and `purge` deletes it outright (`SKILL.md:362`). Provenance of user content is not this spec's business |

The shared test: a file is stampable only if it is INSTALLED as a durable plugin artifact
AND some reader compares its version. Inlined prompt text, a template whose frontmatter is
inherited by derived files, and user-authored overrides all fail that test.

### The `.codex/` mirror version is NOT the plugin version

NINE manifests carry their own version, not the plugin's - for each of brewcode,
brewdoc and brewtools: `<plugin>/.codex/.codex-plugin/plugin.json`,
`<plugin>/.codex/package/plugin.json`, and `.codex/plugins/<plugin>/.codex-plugin/plugin.json`.
(brewui has no mirror.) The value is the COMPATIBILITY MIRROR's version line, and
`bump-version.sh` deliberately does NOT move it with a release:
`.codex/scripts/validate-compat.mjs:9` pins it with `const VERSION = '4.0.6'` and the
check at `:86` accepts only that value or a `4.0.6+codex.<cachebuster>` derived from it,
so bumping the manifests without bumping that constant fails validation. `4.0.6` is a
pinned constant, not a stale copy of the plugin version - it is the one literal in this
document that is supposed to be literal. `bump-version.sh:246-255` says the same thing
at the call site.

Consequences, both directions:

- A mirror manifest sitting several plugin releases behind is CORRECT. Never report it
  stale, never "fix" it during a bump, never count it among the release-stamped files.
- Moving the mirror forward is a deliberate, separate change: the `VERSION` constant in
  `validate-compat.mjs` and every mirror manifest move together, or `bump-version.sh`
  fails on `validate-compat.mjs`.

`.codex/` artifacts are generated from source by `generate-compat.mjs` on every bump,
so a metadata stamp inside a mirrored skill or agent is a COPY of the source file's
stamp - audit the source, never the mirror.
