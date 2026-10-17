# Update flow (shared core)

Normative reference of `/brewtools:plugin-update` (§1-§5) and `/brewcode:setup-status upgrade` (§4, §6).
Canonical pair: `brewcode/skills/setup-status/references/update-flow.md` + `scripts/update-flow.mjs`; brewtools
`plugin-update` ships byte copies of both (`cp`, pinned by `Buffer.equals` in `plugin-update/tests/suite-shared-copy.mjs`).
Edit the canonical pair, then copy both. The script parses §3 at run time: never fork that data into a skill body.

## CLI

| Command | Reads | Prints | rc |
|---|---|---|---|
| `node update-flow.mjs latest` | `<plugins root>/known_marketplaces.json` entry `claude-brewcode`; `<installLocation>/<name>/.claude-plugin/plugin.json` | one JSON line `{versions, autoUpdate, installLocation, notes}`; no marketplace -> `{"error":"no-marketplace"}` | 0; 1 no marketplace |
| `node update-flow.mjs plan <dir> --mode update\|check\|all` | `<dir>/before.json`, `<dir>/latest.json`, `<dir>/cc.txt` | one JSON line, §4 | 0; 1 = `error` set (`no-inventory`, `no-latest`: no usable `latest.json` or no entry in it is a version), JSON still printed |
| `node update-flow.mjs report <dir>` | the same plus optional `<dir>/after.json`; the cwd for `.claude/` and the guide INDEX | markdown, §5; no `after.json` file -> check variant; a file that exists but does not parse -> update variant | 0; 1 = a snapshot unreadable or a row `unknown` |

rc 2 = usage: unknown command, missing or extra argument, `--mode` absent or not one of the three, `<dir>` not a
directory. No network, no writes: the caller saves every input file.

| Input | Accepted form |
|---|---|
| plugins root | `CLAUDE_CODE_PLUGIN_CACHE_DIR`, else `<CLAUDE_CONFIG_DIR or ~/.claude>/plugins` (as `discover-plugins.sh`) |
| `before.json`, `after.json` | `claude plugin list --json` array, or the `discover-plugins.sh` object (rows read as scope `user`); never `installed_plugins.json` |
| `latest.json` | `latest` output, or the flat `fetch-latest-versions.sh` map (notes and auto-update then come from the marketplace entry) |
| `cc.txt` | `claude --version` output; no `X.Y.Z` in it -> `cc: null` |

Exports (tests, callers): `releaseNotes`, `diff`, `offers`, `loadData`, `staleGuides`, `guideVerdicts`.

## 1. Version diff

- Row key: `id` + `scope` + `projectPath`; `scope` missing -> `user`. Component order: §3 `mods`, then `plugins`
  (placeholders first). Versions compare numerically as `X.Y.Z`; `unknown` or any other text is unknown.
- Status, with `after.json`: `installed` (no row before), `updated` (changed, not below latest), `current`, `behind`
  (still below latest, or gone after: the update failed), `unknown` (latest not known: never `current`, never
  `updated`), `not-installed` (no row anywhere). Check variant: `current`, `behind`, `unknown`, `not-installed`.
  Other marketplaces' rows show only when their version changed, named by id.
- Report only: a `behind` or `unknown` row of scope `project`/`local` whose `projectPath` is absent or not a directory
  becomes `orphan` (the same rule as `orphan: true` below): never failed, never counted as updatable.
- Update set (`plan`): `claude-brewcode` rows whose latest is unknown or above the installed version; `all` adds every
  other marketplace row (a no-op when current). Never `@inline`, `@skills-dir`, `@synced` rows. Order: mods, plugins,
  then other ids. `orphan: true` = a `project`/`local` row whose `projectPath` is absent or not a directory: run nothing.
- Notes range: (lowest installed `claude-brewcode` version, highest latest]. Nothing installed or no latest -> no notes.
- A `latest` source whose entries are all `unknown` (offline fetch, rc 0) is no latest: `plan` sets `error: no-latest`.

## 2. Release notes between two versions

Source: `<installLocation>/RELEASE-NOTES.md` of the marketplace clone, never the network. Absent, no section in the
range, or no section at or above the range top (the clone is older than the latest version: `check`, or a failed
marketplace refresh) -> `missing: true`, and the report links `notesUrl`; `versions` keeps the sections the source has.

| Rule | Detail |
|---|---|
| Section | `## vX.Y.Z` up to the next `## ` line; versions in (from, to], newest first |
| Block | `- ` bullets after the line `**What changed for you**`; stop at the first non-empty non-bullet line after a bullet, or at a heading or `---` |
| Requirement | the `❗` line before the first block bullet; only the newest in range is kept, printed as a 🔵 line only when `offers.ccOk` is false (`cc` below `ccMin`, numeric, or `cc: null`) |
| Migration | bullets after `**Migration:**`, same stop rule; never capped, listed before the version bullets; a block bullet with the same text as a migration bullet of its version is dropped from the block (shown once, as the migration) and never counted in `hidden` |
| Fallback | a section without the block -> its first plain line before the first heading, `fallback: true` |
| Caps | §3 `caps`: 3 per version, 10 in total, newest first; the rest is counted in `hidden` |
| Never | technical `###` sections |

`notes` = `{source, requirement, migration[{version, text}], versions[{version, bullets, count, fallback}], hidden,
missing, link}`; `count` = bullets in the source, `bullets` = the shown ones; `missing: true` with `versions`
non-empty = the source stops below the range top.

## 3. Data

The single source the script parses: the only `json` fence in this file. `value` follows `UPDATE.md` step 4.

```json
{
  "notesUrl": "https://github.com/kochetkov-ma/claude-brewcode/blob/main/RELEASE-NOTES.md",
  "ccMin": "2.1.301",
  "caps": { "perVersion": 3, "total": 10 },
  "mods": [
    { "name": "brewmod-placeholders", "value": "`++r` and other prompt blocks" },
    { "name": "brewmod-plan-effort", "value": "effort `xhigh` in plan mode" }
  ],
  "plugins": [
    { "name": "brewcode", "value": "skill, agent and rule authoring, code search, conventions, review and team setups" },
    { "name": "brewdoc", "value": "doc-staleness tracking, installation guides, Markdown to PDF, publishing" },
    { "name": "brewtools", "value": "text optimization, secrets scan, SSH and deploy, subagent guards" },
    { "name": "brewui", "value": "placeholder for future UI tools, no skills yet" }
  ],
  "migrations": [
    {
      "id": "codewords-to-placeholders",
      "plugin": "brewtools",
      "crossedAt": "6.8.0",
      "needsAbsent": "brewmod-placeholders",
      "message": "the codewords `++m`, `++a`, `++r`, `++rr` and `+++` now come from **brewmod-placeholders**, not from brewtools.",
      "docsUrl": "https://doc-claude.brewcode.app/mods/placeholders/"
    }
  ]
}
```

| Offer | Fires when | Shape |
|---|---|---|
| mod | not installed in any scope AND `cc` >= `ccMin` | `mods[{name, value, migration}]`; below `ccMin` or `cc: null` -> `mods: []`, the report prints the Claude Code line |
| `codewords-to-placeholders` | `brewtools` installed and `brewmod-placeholders` not | `migration: {id, crossed, message, docsUrl}` on that mod; `crossed` = brewtools goes from below `crossedAt` to `crossedAt` or above |
| plugin | suite plugin not installed in any scope | `plugins[{name, value}]` |

Inventory unknown -> no offers (`mods: []`, `plugins: []`): an unread list never means missing plugins.

## 4. Plans and the RESULT grammar

plugin-update `plan` JSON (keys in this order; `error` only when degraded):

```text
{mode, range{from,to}, update[{id,scope,projectPath,before,latest,orphan}], scopes[{scope,projectPath}], offers{ccOk,cc,ccMin,mods[{name,value,migration}],plugins[{name,value}]}, notes{source,requirement,migration,versions,hidden,missing,link}, autoUpdate, error?}
```

`scopes[]` = the distinct `{scope, projectPath}` of every `before.json` row (any marketplace), `user` first, then
`managed`, `project`, `local`, other scopes last; `[]` without an inventory. Phase 5's prune preview takes its scopes here.

setup-status `upgrade` plan row: `{row, setup, scope, team, class, state, before, plugin, command}`; `scope` only on rows 6
and 11, `team` only on row 1; `class` A/B/C is the roster's last column. Every unattended setup run ends with exactly one line of the §6 item 5 grammar:

```text
^RESULT (ok|partial|skipped|failed) ([a-z][a-z0-9-]*:[a-z][a-z0-9-]*)( scope=(project|global)| team=[A-Za-z0-9_][A-Za-z0-9_-]*)? cv=([0-9]+\.[0-9]+\.[0-9]+|\?)->([0-9]+\.[0-9]+\.[0-9]+|\?) pending=([0-9]+) note="([^"]*)"$
```

| Outcome | Marker | Runner |
|---|---|---|
| `ok` and the re-probe reads current | 🟢 | continue |
| `partial` | 🔵 | continue; pending items become manual commands |
| `skipped` | ⚪ | continue; the row's command is printed |
| `failed`; `ok` but the re-probe still stale; any `OUTSIDE` path; HEAD or stash count moved; no `RESULT` line; a maxTurns partial | 🔴 | STOP; the remaining rows print as manual commands; never revert |

The re-probe is the verdict, never the child's claim.

## 5. Report strings

Markers: 🟢 done, 🔵 info, offer or next step, 🔴 failed, ⚪ unchanged or not installed; no other emoji (a release-note
`❗` prints as 🔵). Names and target versions bold, the table before prose, commands and paths literal. `report`
renders all of it: print its output verbatim, never re-word it in a skill.

Titles (N, M, K counts; M = installed components):

```text
## 🟢 brewcode updated: N of M components
## 🔴 brewcode: N updated, K failed
## ⚪ brewcode is current
## 🔵 brewcode check: N of M components can be updated
## ⚪ brewcode: latest versions unknown (offline?)
## 🔵 brewcode check: latest versions unknown
## 🔴 brewcode: update result unknown (plugin list unreadable)
```

Pick, in order. Check variant (no `after.json`): any row `unknown` -> `check: latest versions unknown`, else `N of M`
(N = `behind` rows). Update variant: `after.json` unreadable -> `update result unknown`; `K` failed rows (`behind`,
never `orphan`, never `unknown`) -> `N updated, K failed`; else any row `unknown` -> `latest versions unknown
(offline?)`; else `N of M` when something was updated or installed; else `is current`. `is current` is therefore never
printed while a latest version is unknown. rc 1 when the after list is unreadable or any row is `unknown`; the report is
still complete, so the caller prints it verbatim and adds a 🔴 line for a failed Phase 1 or 5 command.

| Part | Text |
|---|---|
| Table | columns Component, Before, After, status (check: Component, Installed, Latest, status); a scope other than `user` -> `**<name>** (<scope>: <path in backticks>)`; no version `—`; a changed version bold; other marketplaces' changed rows last, named by id |
| Cells | `🟢 updated`, `🟢 installed`, `⚪ already current`, `⚪ not installed`, `⚪ latest unknown`, `⚪ orphan install`, `🔴 still X, latest Y`; check: `🔵 update available`; unreadable after list: After `—`, `🔴 not verified, latest Y` |
| Below the table | `🔵 Mods need Claude Code **2.1.301** or newer (you have **X**): ...` when a mod is missing and `cc` is below `ccMin`; `🔵 **Moved:** <message> ([docs](...))`; per open offer `🔵 **<name>** is not installed (<value>): ` + its `claude plugin install <name>@claude-brewcode` command |
| What changed | `### What changed for you (X → Y)`, the requirement line (only when `cc` is below `ccMin` or unreadable), `- **vX migration:** ...`, `- **vX:** ...`, `- *+N more:* [release notes](...)`. `missing` without `versions`: only `🔵 The release notes for these versions are not available here: [release notes](...).`; with `versions`: first `🔵 Notes for versions after <newest in versions> are not in your local marketplace copy yet: [release notes](...).` |
| Next steps | 1 `/reload-plugins`, always after an update (also when the after list is unreadable); 2 `/brewcode:setup-status upgrade` when brewcode is installed and the cwd has `.claude/`, listing the other `project`/`local` paths; 3 `/brewdoc:my-claude refresh` when `staleGuides` is non-empty. Check: `/brewtools:plugin-update` when updates exist, then the refresh step |
| Auto-update | one 🔵 line when the marketplace `autoUpdate` is `false` |

`guideVerdicts(root, brewdocVersion, {prompt = 'refresh', home})` is a port of the `/brewdoc:my-claude refresh` scan fence
(`brewdoc/skills/my-claude/SKILL.md` "Stale rule", the one definition): per guide key (`internal`, `external`,
`external/context-schema`, `research/<slug>`) the newest INDEX row (`ts` as string, equal -> later line), `~/` paths from
`home`, `version` from the guide's top frontmatter, verdict `SKIP|MISSING|STALE|CURRENT` -> `[{verdict, key, path, doc}]`
in scan order. An unreadable path counts as absent (the fence would abort). `staleGuides(root, brewdocVersion, opts)` =
the `STALE` rows sorted by path: `MISSING` is only reported by refresh, so it never triggers the suggestion; research
guides stay `SKIP` unless the prompt names them (the suggested command's prompt is `refresh`). No version -> `[]`.

`brewdocVersion` = what refresh compares with, the brewdoc loaded in the cwd project: the lowest version among its
`user`/`managed` installs and its own `project`/`local` installs; other projects' installs never count. The
golden test (`tests/update-flow.mjs`) runs the real scan fence and `guideVerdicts` on one INDEX and compares the verdicts.

## 6. Unattended block

Every A/B setup owner carries this block byte-exact, once, in its `upgrade` section; a lockstep test compares.

```md
**Unattended (`--unattended` anywhere in the prompt; set by `/brewcode:setup-status upgrade`).**
1. A flag, never a mode or name: strip it first. Any resolved mode other than `upgrade` -> no write, `RESULT skipped <id> cv=?->? pending=0 note="not-upgrade"`.
2. No `AskUserQuestion` at all. Every gate in this section takes its decline branch; a declined gate is pending, never applied.
3. A precondition this section would ask about (not installed, parked, custom/wrapped registration, orphan config,
   user-modified managed file, missing tokenizer) -> no write, `RESULT skipped <id> cv=?->? pending=0 note="<reason>"`.
4. Write only what this section already writes. No git commit, push, stash or reset; scratch only in a private `mktemp -d`.
5. Last line, exactly once: `RESULT <ok|partial|skipped|failed> <id> cv=<before>-><after> pending=<n> note="<one line>"`,
   `<id>` = `<plugin>:<skill>` [` scope=<project|global>`|` team=<name>`], `?` = unknown version.
```
