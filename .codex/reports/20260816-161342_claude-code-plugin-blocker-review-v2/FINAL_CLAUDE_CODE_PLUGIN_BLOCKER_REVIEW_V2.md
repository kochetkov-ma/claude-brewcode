# Final Claude Code Plugin Blocker Review — V2

**Review date:** 2026-08-16  
**Release under review:** `v6.0.0` / `765ccc1e7cf6d42c977757be18a514d9f5bc6803`  
**Product baseline:** Claude Code `2.1.233`  
**Disposition:** Review-only. No plugin source was changed.  
**Retention threshold:** High or Critical only.  
**Consensus rule:** A finding survives only when two independent agents confirm the current-code mechanism, a normal supported trigger, the observed outcome, and High-or-greater impact. Any dissent below High removes the candidate.

## Executive verdict

The released plugins are substantially healthier than the pre-v6 tree, and no previously fixed High finding was reopened. The V2 audit nevertheless found **4 new High findings and 0 Critical findings**:

| Plugin | Critical | High | Retained IDs |
|---|---:|---:|---|
| BREWCODE | 0 | 2 | BC-V2-H01, BC-V2-H02 |
| BREWTOOLS | 0 | 1 | BT-V2-H01 |
| BREWDOC | 0 | 1 | BD-V2-H01 |
| **Total** | **0** | **4** | |

All four are deterministic current-code failures on supported workflows:

- enabling a disabled team after upgrading it can overwrite the upgraded agent body;
- purging one named team can delete a globally named agent still required by another team;
- balanced HARD mode permits a real mutating MCP tool because it infers safety from name substrings;
- ordinary memory-sync reinstall can erase user files that uninstall explicitly preserved.

One additional security candidate was independently narrowed to Medium and therefore excluded. No logging-only issue, documentation-only mismatch, improbable filesystem state, cosmetic problem, or below-High concern appears in the retained ledger.

## Evidence lock

### Release identity

- Local `HEAD`: `765ccc1e7cf6d42c977757be18a514d9f5bc6803`.
- Remote `refs/heads/main`: the same commit.
- Remote `refs/tags/v6.0.0`: the same commit.
- The audit read committed files from that object. An unrelated untracked `brewtools/skills/context-slim/` directory appeared during the run; it was neither read as release evidence nor modified by the reviewers.

### Current Claude Code baseline

- Installed `claude --version`: `2.1.233 (Claude Code)`.
- npm current: `@anthropic-ai/claude-code@2.1.233`.
- npm shasum: `ec4a882255c9b0f0018cc54688ae2d8ec6a88e26`.
- npm integrity: `sha512-WS0ZSsNu2zkQonC+rW7HdByMCkPQ2l+hO1G0LdvWTj40kiYr0qAiSJjCBNRIbi0foBol4IFTCKwLHAN83qxxUQ==`.
- Claude Code source: `0fa8c19d50f70f9f383fb6ff5ce5209575267d21`, unchanged from the v6 audit snapshot.
- Anthropic skills: `f6656c1256d5a8adfa37db9110046ef20bac644c`, unchanged from the snapshot.
- Official plugin marketplace advanced from `09041ee686e7ba8be1b5b34a0852959991481cce` to `5d46cde99dff8554c99989a3e417c5559ab33336`; the complete delta is two unrelated marketplace dependency-pin updates for Wix and Matt Pocock Skills. It changes no Claude Code API, hook, agent, skill, or plugin contract relevant to these findings.

### Prior audit baseline

The authoritative Gate A-G ledger at `~/.claude/plans/m-r-pure-dewdrop.md:281-529` and the four annotated reports under `.codex/reports/20260815-195724_claude-code-plugin-review/` were used only to avoid reopening fixed or refuted claims. Every prior High closure area was revisited against current source and the new regression suites. None regressed.

## Scope and filter

Included:

- committed Claude Code plugin runtime surfaces under `brewcode/`, `brewtools/`, and `brewdoc/`;
- creator-agent guidance when it directly controls generated Claude Code components;
- normal install, upgrade, enable/disable, uninstall/purge, hook, MCP, publish, and conversion lifecycles;
- the `v5.7.0..v6.0.0` change set plus unchanged code on the same runtime boundaries;
- correctness/safety first, then maintainability, clarity, and missing validation.

Excluded:

- all `.codex/` compatibility projections and Codex behavior;
- UI and presentation-only behavior;
- README/site prose unless it is the executable workflow contract;
- medium, low, logging-only, style, and optional-hardening concerns;
- hostile or fantastically unlikely inputs without a normal supported path;
- external service behavior that the plugin does not control;
- implementation or release changes.

## Review method

1. Three independent owner passes reviewed BREWCODE, BREWTOOLS, and BREWDOC against committed `v6.0.0`.
2. Each pass first checked correctness and safety, then missing validation and maintainability.
3. The manager reproduced surviving mechanisms in isolated temporary projects and reviewed source anchors.
4. A different agent cross-checked every candidate. Cross-checkers were instructed to reject or lower severity when the trigger was not an ordinary supported workflow.
5. One candidate was narrowed from High to Medium by the second reviewer and removed. The four findings below are 2/2 confirmed at High.

## Retained findings

### BC-V2-H01 — Team enable can overwrite a newer live agent with its parked predecessor

**Severity:** High  
**Verdict:** CONFIRMED  
**Confirmation:** 2/2 independent agents, plus manager source review

**Evidence**

- `brewcode/skills/teams-setup/SKILL.md:618-642` permits UPGRADE to tune, regenerate, replace, or remove domain agents at the canonical live `.claude/agents/<name>.md` path.
- `brewcode/skills/teams-setup/scripts/toggle-team.sh:85-99` chooses parked-to-live for ENABLE and calls `mv "$FROM" "$TO"` whenever the parked source exists. It never checks whether the live destination also exists.
- `brewcode/skills/teams-setup/scripts/verify-team.sh:214-241` checks the live path first and the parked path only through `elif`; when both exist, it validates only the live file and reports no disabled member.
- `brewcode/skills/setup-status/SKILL.md:442-450` has the same live-first blind spot.

**Normal supported trigger**

1. Run `disable` for a team. The member becomes `<name>.md.disabled`.
2. Run the documented UPGRADE workflow while the team is disabled. A member requiring tuning or replacement is emitted at `<name>.md`.
3. Run `enable`.

This is a reachable sequence of individually documented modes; no precondition rejects UPGRADE while the team is parked or ENABLE when both paths exist. It does not require manual corruption.

**Observed reproduction**

The isolated fixture contained both paths:

```text
.claude/agents/worker.md          = UPGRADED_LIVE_BODY
.claude/agents/worker.md.disabled = ORIGINAL_PARKED_BODY
```

Before ENABLE, `verify-team.sh` returned `VERIFY: PASS` and `DISABLED_AGENTS:0`. ENABLE returned success, moved the parked file over the live path, and removed the parked path. The final live body was `ORIGINAL_PARKED_BODY`; `UPGRADED_LIVE_BODY` was gone.

**Observable outcome and blast radius**

A successful upgrade is silently lost, the older instructions become active, and both the pre-enable verifier and toggle report success. Any upgraded member of a disabled team is affected.

**Why High**

This is deterministic data loss across a reachable sequence of supported operations, with a false healthy verdict. Recovery requires an external Git/history/backup source.

**Minimal fix direction**

- Make `toggle-team.sh`, `verify-team.sh`, and setup-status fail on dual live/parked paths.
- Either require ENABLE before UPGRADE or have UPGRADE update the parked file in place.
- Never overwrite either copy automatically when both exist; present the conflict.
- Add a DISABLE → UPGRADE → ENABLE regression that asserts both pre-enable conflict detection and byte preservation.

**Missing validation**

The current teams suites pass 65/65 but do not create the dual-copy state through the supported upgrade lifecycle.

### BC-V2-H02 — Purging one named team can delete an agent still owned by another team

**Severity:** High  
**Verdict:** CONFIRMED  
**Confirmation:** 2/2 independent agents, plus manager source review

**Evidence**

- `brewcode/skills/teams-setup/SKILL.md:102-121` loads a named team's roster and the project-global `.claude/agents/` directory.
- `brewcode/skills/teams-setup/SKILL.md:188-267` creates every team's domain agents in the same `.claude/agents/<name>.md` namespace. Only `intent-guard` has an explicit shared-owner rule.
- Multiple named team directories are supported by `brewcode/skills/teams-setup/scripts/detect-mode.sh:79-105` and status iteration over `.claude/teams/*/team.md`.
- `brewcode/skills/teams-setup/references/cleanup-flow.md:107-128` deletes both live and parked agent paths based only on the selected team's roster.
- `brewcode/skills/teams-setup/references/cleanup-flow.md:146-175` repeats the same unconditional deletion for PURGE.
- No creation, verification, cleanup, or purge step enforces cross-team uniqueness or checks other rosters before deletion.

**Normal supported trigger**

Install two named teams whose proposals independently use the same common domain-agent ID, such as `api-reviewer` or `shared-worker`. Later confirm cleanup or purge for one team.

**Observed reproduction**

Two valid fixtures, `alpha` and `beta`, both referenced `shared-worker`. Before cleanup, `verify-team.sh beta` returned `VERIFY: PASS`. Executing the documented Alpha cleanup removed `.claude/agents/shared-worker.md`. The untouched Beta roster then returned:

```text
CHECK: agent shared-worker ... MISSING
VERIFY: FAIL
```

**Observable outcome and blast radius**

The selected team is removed as requested, but another supported team is broken and its only agent definition is lost. Its roster and framework remain, so the damage is not self-explanatory.

**Why High**

The plugin presents the deletion as the selected team's footprint, yet the underlying file is project-global and can be shared. Common role names make the collision realistic, and the data loss is irreversible without an external copy.

**Minimal fix direction**

- Before cleanup or purge, parse every other `.claude/teams/*/team.md` and preserve/refuse deletion of any referenced agent.
- Enforce project-global agent-name uniqueness at proposal/install time, or record explicit ownership/reference counts.
- Add a two-team shared-agent cleanup and purge regression.

**Missing validation**

Current lifecycle fixtures intentionally model one team. No suite proves cross-team ownership or shared-name cleanup behavior.

### BT-V2-H01 — Balanced HARD mode permits a real mutating MCP tool

**Severity:** High  
**Verdict:** CONFIRMED  
**Confirmation:** 2/2 independent agents, plus manager reproduction

**Evidence**

- `brewtools/hooks/hardmode-guard.mjs:9-24` states that the main session is physically denied mutation and balanced mode allows only read-only MCP tools.
- `brewtools/hooks/hardmode-guard.mjs:150-154` defines unanchored read/write substring regexes. `search_and_replace` matches read substring `search`; the write set omits `replace`.
- `brewtools/hooks/hardmode-guard.mjs:386-394` passes any MCP tool whose tool segment has one read substring and no listed write substring, despite the adjacent comment claiming unrecognized verbs are denied.
- Claude Code exposes arbitrary server-defined names as `mcp__<server>__<tool>`; current local official reference: `.claude/tmp/claude-upstream-20260815/docs/hooks.md:351-365`.
- The real CodeSeeker MCP server defines [`search_and_replace`](https://github.com/mixelpixx/CodeSeeker-MCP/blob/899a611c5f397a6e237511d46e293a509657aba5/src/index.ts#L332-L334); its immutable implementation writes modified content when `dryRun` is false ([lines 780-795](https://github.com/mixelpixx/CodeSeeker-MCP/blob/899a611c5f397a6e237511d46e293a509657aba5/src/index.ts#L780-L795)).

**Normal supported trigger**

Manager HARD mode is armed at `level=balanced`, a user has a normal code-search/refactoring MCP server installed, and the main session calls `mcp__codeseeker__search_and_replace` with `dryRun:false`.

**Observed reproduction**

An isolated project held:

```json
{"hard":true,"level":"balanced"}
```

The current guard received:

```json
{
  "tool_name": "mcp__codeseeker__search_and_replace",
  "tool_input": {"pattern":"old","replacement":"new","dryRun":false}
}
```

Observed result:

```text
exit=0
stdout={}
stderr=
```

This reproduction exercised the current Brewtools guard with the real CodeSeeker tool name and a live-mode-shaped input. It proved the permission bypass; it did not launch CodeSeeker or perform a live mutation.

Controls behaved as expected: `mcp__codeseeker__bulk_replace` and `mcp__search__destroy_all` were denied; `mcp__github__get_file` was allowed. The bypass is specifically the mixed read-word/mutation name.

**Observable outcome and blast radius**

Claude Code proceeds with a mutating MCP call from the main session while the wall claims all mutation must be delegated. The affected resource can be local workspace files or an external system, depending on the connected MCP server.

**Why High**

This defeats the plugin's primary enforcement boundary with a real tool and an ordinary MCP integration. It is not an invented hostile server name.

**Minimal fix direction**

- Default-deny MCP calls under the main-session wall unless the complete scoped server/tool name is explicitly configured as read-only.
- Do not expand another inferred verb denylist: MCP servers own their names, and names are not a capability contract.
- Add the exact CodeSeeker case plus mixed-verb negative fixtures.

**Missing validation**

The manager suite's current 44/44 includes `mcp__search__destroy_all` and `mcp__github__get_file`, but no real mutating name that contains an allowed read substring.

### BD-V2-H01 — memory-sync reinstall erases preserved user files and parked edits

**Severity:** High  
**Verdict:** CONFIRMED  
**Confirmation:** 2/2 independent agents, plus manager reproduction

**Evidence**

- `brewdoc/skills/memory-sync-setup/scripts/generate.sh:405-414` refuses ordinary emit only when a live `$TARGET/SKILL.md` exists.
- `brewdoc/skills/memory-sync-setup/scripts/generate.sh:428` then unconditionally runs `rm -rf "$TARGET"` before moving the staged tree into place.
- `brewdoc/skills/memory-sync-setup/scripts/generate.sh:670-704` recognizes `SKILL.md.disabled` as a valid parked installation in status.
- `brewdoc/skills/memory-sync-setup/scripts/generate.sh:802-845` promises uninstall deletes only generated files and keeps user-added files.
- `brewdoc/skills/memory-sync-setup/SKILL.md:116-123,185-200` defines parked installs, byte-preserving disable/enable, ownership-preserving uninstall, and explicitly warns never to re-emit over a parked install.

**Reachable triggers**

Two independently reachable flows exercise the defect. The ordinary uninstall → explicit reinstall lifecycle establishes High; parked re-emit is an additional overwrite-guard contract violation because the documented action is ENABLE.

1. Install, add a user file, uninstall (which reports the file as `KEPT`), then perform an ordinary reinstall after status reports `NOT INSTALLED`.
2. Install, add a user file under the generated directory, disable, then invoke install/emit instead of enable.

Neither path sets `MEMORY_SYNC_FORCE=1` or confirms purge.

**Observed reproduction**

Parked flow:

```text
status before emit: INSTALLED=parked, PARKED=yes
emit exit: 0
SKILL.md.disabled after emit: absent
user-note.md after emit: absent
new SKILL.md after emit: present
```

Uninstall/reinstall flow:

```text
uninstall: KEPT user-note.md
status: INSTALLED=no, VERDICT=NOT INSTALLED
ordinary emit exit: 0
user-note.md after emit: absent
```

**Observable outcome and blast radius**

The entire `.claude/skills/memory-sync/` target is replaced. Parked SELF-SYNC edits and arbitrary user-added files disappear while emit reports success. Loss is bounded to that directory but can include everything uninstall explicitly promised to preserve.

**Why High**

This is deterministic destructive behavior on the ordinary uninstall/reinstall lifecycle, plus a parked-install overwrite-guard failure, without the documented purge confirmation or `MEMORY_SYNC_FORCE=1` destructive opt-in.

**Minimal fix direction**

- Treat `SKILL.md.disabled` as an existing installation and direct the user to ENABLE.
- Refuse ordinary emit whenever the target is non-empty unless an explicit destructive override is present.
- For reinstall after ownership-preserving uninstall, install only the four generator-owned paths and preserve unknown files, or stop on collision rather than replacing the directory.
- Add parked-emit and uninstall → reinstall sentinel-preservation regressions.

**Missing validation**

No current test covers parked emit or reinstall into the retained non-owned files that uninstall deliberately leaves behind.

## Excluded after re-verification

| Candidate | Final ruling | Why it is absent from the finding count |
|---|---|---|
| Secrets-scan source lines enter scanner-agent model context before `redact.mjs` | **NARROWED to Medium** | The mechanism and the false internal “no model turn” claim are real, but the second reviewer found no new disclosure outside the explicitly model-backed Claude scan. Durable JSON/report output remains redacted. Any one-agent downgrade removes it under the quorum rule. |
| Docsync same-session concurrent read-modify-write race | Below High | Parallel hooks can theoretically lose one touched entry, but the impact is a missed reminder and the trigger is a same-session race. |
| Deploy manual-dispatch run correlation under overlapping dispatches | Below High | Requires simultaneous workflow dispatches and primarily monitors/reports the wrong run; current version gates still protect the main VPS path. |
| Manager cross-project `--cwd` state write | Below High | Concrete but bounded to another project's Brewtools manager state, with normal recovery available. |
| Superreview dual live/parked copy | Rejected | The primitive is similar to BC-V2-H01, but no documented normal lifecycle was found that creates both copies. |
| Semble repair/telemetry/settings residuals | Below High | Recoverable or observability-only; no current destructive or core-blocking ordinary-use outcome was established. |
| Publish, docsync, and md-to-pdf old High regressions | Rejected by tests/reproduction | Publish 108/108, docsync 26/26, and md-to-pdf 14/14 passed; the prior blocker mechanisms did not reproduce. |

## Validation performed

### Contract and syntax gates

| Validation | Current result |
|---|---:|
| `claude plugin validate ./brewcode --strict` | pass |
| `claude plugin validate ./brewtools --strict` | pass |
| `claude plugin validate ./brewdoc --strict` | pass |
| BREWCODE creator contract | 27/27 |
| committed non-Codex `.mjs` files, `node --check` | 67/67 |
| committed non-Codex `.sh` files, ShellCheck error severity | 59/59 |
| committed non-Codex Python files, AST parse | 3/3 |

### Runtime/regression suites

| Area | Current result |
|---|---:|
| BREWCODE core hooks | 68/68 |
| BREWCODE teams | 65/65 |
| BREWCODE Semble | 7 suites, 0 failed |
| BREWTOOLS manager HARD wall | 44/44 |
| BREWTOOLS agent deadline | 169/169, 1 expected environment skip |
| BREWTOOLS agent return | 803/803 |
| BREWTOOLS agent router | 76/76 |
| BREWTOOLS think-short | 19/19 |
| BREWTOOLS deploy | 76/76 |
| BREWTOOLS SSH | 74/74 |
| BREWTOOLS provider-switch | 91/91 |
| BREWTOOLS secrets-scan | 82/82 |
| BREWTOOLS text-optimize | 51/51 |
| BREWDOC publish | 108/108 |
| BREWDOC docsync | 26/26 |
| BREWDOC md-to-pdf | 14/14 |

The green suites show that v6 fixed the old failures and that common paths remain healthy. Each retained V2 finding is specifically a missing multi-state, multi-owner, or name-classification case not represented by those suites.

## Recommended repair order

1. **BT-V2-H01** — restore the HARD wall's central enforcement guarantee before relying on balanced mode with third-party MCP servers.
2. **BC-V2-H01 and BC-V2-H02 together** — establish one team-agent ownership/collision contract and cover both dual-copy and cross-team deletion in the same lifecycle suite.
3. **BD-V2-H01** — make emit ownership-preserving and add reinstall/parked sentinels.

After fixes, rerun the exact reproductions first, then all current suites above. A future closeout should require each new regression to fail on an isolated pre-fix copy and pass on the repaired tree.

## Final disposition

`v6.0.0` is not broadly broken: no Critical issue was found, the old High fixes remained closed, and all existing suites passed. The four retained High findings are narrow but real release-blocking lifecycle/enforcement gaps and should be corrected before treating the plugin set as fully closed.
