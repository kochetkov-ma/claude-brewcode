# setup-status — two questions, two signals

Read on demand from `SKILL.md` "Two questions, two signals": what each signal answers and which phase
reads it, then which signals reach each artifact kind.

| Kind | Signal | The question it answers | Read by |
|------|--------|-------------------------|---------|
| artifact | **`content_version` stamp** — the headline | has this artifact's own content moved since it was installed here? | Phase 2a: the artifact's stamp vs the plugin's current `content_version` for that same artifact |
| artifact | **`version` stamp** — provenance | which plugin release produced this install? It bumps on every release whether or not the artifact changed: shown on every row, decisive only for an artifact with no `content_version` | Phase 2a |
| artifact | **owner stamp** | did the setup that owns this path actually write it? A file written by the wrong setup can be current and byte-perfect | Phase 2a: `generated_by` vs the roster row's `<plugin>:<skill>` |
| artifact | **bytes** | does the installed copy still equal what the plugin in use would install? A hand-edited hook keeps the stamp it was copied with, so only bytes see the edit | Phase 2b: `cmp` against `$BC` / `$BT` / `$BD` |
| dependency | **semble MCP pin** | is the registered `semble[mcp]==X.Y.Z` the pin this plugin ships, in each Claude Code profile? | Phase 2c |

`last_updated` and `doc_type` are written but not read: a date defines no state, and `doc_type` is
user-owned and preserved across re-installs. Add no reader without an actionable verdict to attach.

| Artifact kind | Stamped | Signals that reach it |
|---------------|---------|-----------------------|
| byte-copied asset (`.mjs`, `.sh`, `semble-first.md`) | baked at release by `bump-version.sh` | stamp and bytes: the installed copy stays byte-identical to the plugin asset |
| generated artifact (emitted `SKILL.md`, `team.md`, `config.json`) | substituted at install from `{PLUGIN_VERSION}` / `{CONTENT_VERSION}` | stamp only: it is authored per project and never byte-equal to any asset |
| byte-copied asset the install then fills (`memory-sync`'s `references/hard-sync.md`, the repo-root `.sembleignore`) | baked at release | no bytes: a healthy copy differs by construction. `hard-sync.md` gets no stamp read either (frozen at the release that emitted it) |
| pristine template baseline (`.template-baseline/`) | not stamped: raw template, tokens unresolved, on purpose | bytes only, raw against raw. Never read a version out of it |
