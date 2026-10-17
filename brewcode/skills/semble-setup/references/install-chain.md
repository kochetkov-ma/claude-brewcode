# Install chain — `brewcode:semble-setup`

Detail moved verbatim from `SKILL.md`: read it before Step 3 or Step 4 (`install`, `upgrade`, `resume`). Headings and "Step N" name `SKILL.md` steps; Constants are `SKILL.md` Constants.

## 3.1 Probe JSON keys

| Key | Meaning |
|-----|---------|
| `.timeout.backend` | `timeout` / `gtimeout` = a binary backs `sc_timeout`; `none` = the bash watchdog |
| `.timeout.bounded` | always `true`; never report shell-outs as unbounded |
| `.timeout.coreutils.status` | `present` · `installed` · `needs_confirmation` · `skipped` · `failed` |
| `.timeout.coreutils.reason` | the clause to quote when the step did not run |
| `.brew.present` | whether `brew install coreutils` is possible |
| `.commands` | the exact command list, printed verbatim |

## 3.1b Example `.commands`

```text
brew install uv
brew install coreutils
uvx --from 'semble[mcp]==0.6.2' semble --version
```

## 3.2 Register the MCP server

Precedence when several apply: `malformed` > `duplicate` > `wrong_scope` > `stale_args` > `upstream_unpinned` > `correct` > `absent`.

> `add`/`repair` first back up the config
> (JSON `backups`); no backup -> exit 1, nothing written. `add` then writes its checkpoint and tries
> `add-json`, then `add`; both failing restore the backup and leave `prereq_ready` plus a note. `repair`
> restores the backups on failure. `repair` always targets `user`, removing
> every other semble_code scope; a kept local/project registration stays and is reported as a gap.
>
> On `correct`, `add` still writes the project checkpoint: absent/`prereq_ready`/`error` -> `awaiting_reload`;
> `verifying`/`ready`/`disabled` keep their phase and refresh `cacheRoot`, `repoHash`, `resumePrompt`; its
> `note` names the phase.
>
> State only inside a project: HOME and a profile dir's parent are never roots. With no project root, or with
> `--no-state` (profile-only registration), `add`/`repair` register but write no `state.json` (`note`: `no project
> state written (no project root or --no-state)`); an explicit `semble-mcp.sh checkpoint` exits `3` there.

## 3.2b Guidance, hooks and the rule

The session and subagent hooks read the project state file (`semble-stats.mjs` measures regardless): `enabled:false` or phase `disabled`/`error`/`prereq_ready` silence them; from `awaiting_reload` on they nudge, warning that the first call rebuilds the index. They nudge only when `semble_code` is registered for the profile in use (its `.claude.json`, user or local scope, else the project `.mcp.json`; `disabledMcpServers` vetoes): otherwise SessionStart prints only `not registered for this profile` and the rest skip (`no-mcp`). An agent whose `tools:` omits semble, or whose `disallowedTools` names it, gets no SubagentStart line (`agent-no-tool`).

> `--force` replaces the whole file with the template, frontmatter and local prose included; backup
> `<rule>.bak.<epoch>` (mode 0600; every `sc_backup` keeps the newest 3 per file and names the pruned ones on stderr), which does not authorize data loss. Record `rule: overwritten (backup <path>)`. Same policy for `.sembleignore`.
>
> The rule is copied verbatim, never stamped at install. The managed/user_modified verdict ignores metadata keys, so a metadata-only delta (an older install's `last_updated`) is re-synced without `--force` or backup: record `rule: re-synced <path> (metadata only)` in **Actions**. A byte-pristine copy of any earlier release (status `stale`; normalized sha256 in `SG_PRIOR_RULE`/`SG_PRIOR_IGNORE`) is upgraded the same way: `rule: upgraded <path> (pristine prior-release copy)`. Only real edits stay `user_modified`.
>
> Rule budget (test J9): ≤ 45 lines and ≤ 2000 bytes incl. frontmatter; one `search` JSON example, no rationale (that goes to `references/engine-landscape.md`); a new fact displaces one, never raise the cap. Its `paths: ["**/*"]` makes Claude Code load it when Claude reads, writes or edits a matching file (or views one with a Bash read such as `cat`), not at launch.

## 4.0 Enter `verifying`

`ready` is reachable only from `verifying` (no `awaiting_reload -> ready` edge): `semble-session.mjs` reads `phase` to decide whether to advertise the tools, so a resume dying half-way must leave *verification started, never finished*. A missing state file is created at `prereq_ready` and walked through the legal chain to `verifying`.

## 4.2 Guidance parts

`semble-guidance.sh install --part all` runs these parts, each idempotent:

| Part | What it does |
|---|---|
| rule | writes the `semble-first` rule; a user-edited file is never blind-overwritten (Step 3.2b `--force` policy) |
| ignore (`--part ignore`) | writes `<repo>/.sembleignore` (same policy) excluding generated trees (`.claude/tmp/`, `.claude/reports/`); appends `semble-project.sh candidates` findings (duplicate trees, outsized paths) commented out, since a wrong exclusion silently drops code. Re-runs add only new paths; the file stays `managed` |
| CLAUDE.md | refreshes the `<!-- BEGIN brewcode:semble -->` block in place (one copy; other tools must keep the marked range, `assets/INSTALL.md` §2), then reconciles the root CLAUDE.md search doctrine outside it, after a timestamped `.bak` |
| hooks | copies `semble-session.mjs`, `semble-stats.mjs`, `semble-subagent.mjs` into `.claude/hooks/`; deletes the retired `semble-explore.mjs`, `semble-reminder.mjs`, `semble-prefetch.mjs` and their `.reminder-ts`/`.prefetch-ts`/`reminder.json` markers |
| settings | merges four entries — SessionStart, PostToolUse and PostToolUseFailure on the stats matcher, unmatched SubagentStart (every agent type), each `"timeout": 5` (seconds) — plus the two exact permission entries, only for a tool no layer grants yet (`settings.local.json`, the profile's `settings.json` or a server-wide rule counts: `permissions granted by <file> are not copied`); `remove` deletes only those exact entries from `.claude/settings.json`. Every `args` path is the portable `<PD>/.claude/hooks/<script>` (`<PD>` = the dollar-brace `CLAUDE_PROJECT_DIR` token, stored unexpanded), never absolute (settings.json is tracked). Reconcile, never append: every retired row (explore, reminder, prefetch; any matcher, path or command form) is removed |
| `.gitignore` | writes `.claude/semble/` (`state.json`, `telemetry.jsonl` with verbatim commands, trimmed at 2 MB) unless a repo `.gitignore` rule already ignores that dir (`unchanged: already ignored by <source>`; per-machine excludes do not count); strips the superseded `.reminder-ts`/`.prefetch-ts` lines |

CLAUDE.md reconcile, whole lines only, each removal echoed verbatim: a line denying semantic search goes even if it also scopes the tool; a line putting grep/Bash/rg first goes unless it scopes the tool to exact identifiers / regexes / paths / exhaustive enumeration (then untouched, unreported); a search heading left empty goes too; a mere mention is reported and kept. No measured effect on tool choice: a false line goes for being false.
