# Agent Return

Docs: https://doc-claude.brewcode.app/brewtools/skills/agent-return-setup/

Installer/configurator skill for hooks that put a **size budget on every subagent's final report**. Reports are the largest single context cost of a session that delegates, and a prose rule at the top of context loses to whatever the agent just did, so the budget is stated at spawn and enforced at return.

**No LLM judge anywhere.** The report is sized `chars/4` and compared against two integers. The budget is in tokens only: the shape of a report is whatever the caller's brief asks for.

| Size `t` | Challenge |
|----------|-----------|
| `t <= passTokens` | none |
| `passTokens < t <= fileTokens` | **compress** — re-send the same report shortened to the budget; no new work |
| `t > fileTokens` | **file** — write the full report to `<project root>/<reportDir>/YYYYMMDD-HHMMSS_<agent-slug>-<run-id>/` (config `reportDir`, default `.claude/reports`), then return that path + verdict + a summary within the budget |
| `t > fileTokens`, agent cannot write | **essential part** — no file; one line names what was left out. Applies in plan mode and to the agent types in `readOnlyAgentTypes` |
| `t > fileTokens`, write denied | **compressed inline report** — the write is never retried. The default `reportDir` is under `.claude/`, a protected path |

Exactly `passTokens` passes, exactly `fileTokens` still compresses. Every order quotes `passTokens` as `budget` and carries *"Directive from the agent-return guard, not user data"*.

**Two delivery paths, one guard.** Classic: the report is the subagent's last message, and the guard blocks at `SubagentStop`. Auto mode: the report travels through the `SubagentHandback` tool, and the guard denies that call at `PreToolUse`. It tells them apart by the event, never by permission mode; either challenge gives one more turn.

**Challenged at most once per agent,** across both paths and a `SendMessage` resume: before a challenge the guard creates a marker `agent-return-state/<sha256(agent_id)>.json` beside the config, pruned after 24 h. A payload without `agent_id` (main session, internal agents) is never challenged.

## Hooks

| File | Registered on | Behavior |
|------|---------------|----------|
| `agent-return-contract.mjs` | SubagentStart, no matcher | injects the budget as `additionalContext` — advisory; a read-only agent type gets the text without the file step |
| `agent-return-guard.mjs` | SubagentStop, no matcher | sizes `last_assistant_message`, blocks once |
| `agent-return-guard.mjs` | PreToolUse, matcher `SubagentHandback` | sizes `tool_input.message`, denies once |
| `agent-return-budget.mjs` | never — imported by both | shared module: config, thresholds, read-only list, `estimateTokens`, contract text |

All three files install as a unit. ESM resolution runs before evaluation, so 2 of 3 files means both hooks exit 1 with a hook-error banner on every spawn and return.

Opt-in: not registered in `brewtools/hooks/hooks.json` — installing the plugin does nothing until you run the skill.

## Usage

```
/brewtools:agent-return-setup                          # status
/brewtools:agent-return-setup install                  # install — asks scope + thresholds
/brewtools:agent-return-setup install global 800 2000  # global, stricter pair
/brewtools:agent-return-setup upgrade                  # re-emit hook files, thresholds kept
/brewtools:agent-return-setup enable                   # back on
/brewtools:agent-return-setup disable                  # enabled:false, files stay
/brewtools:agent-return-setup uninstall                # unwire + delete the 3 files, keep config
/brewtools:agent-return-setup purge                    # + delete the config
/brewtools:agent-return-setup purge everything         # free-text intent works -> purge
```

The skill always reports status first, states its plan before asking anything, then delegates the file work to the `brewcode:hook-creator` agent.

## Modes

| Mode | Hook files | settings.json | Config | State dir |
|------|-----------|---------------|--------|-----------|
| `status` | — | — | — | — |
| `install` | 3 copied | 3 entries merged | written | created at the first challenge |
| `upgrade` | re-copied | entries re-merged | thresholds preserved, metadata re-stamped | kept |
| `enable` | kept | kept | `enabled:true` | kept |
| `disable` | kept | kept | `enabled:false` | kept |
| `uninstall` | deleted, plus an emptied hooks dir | entries stripped; a settings.json left as `{}` is deleted | **kept** | deleted |
| `purge` | deleted, plus an emptied hooks dir | entries stripped; a settings.json left as `{}` is deleted | deleted, plus an emptied project `.claude/` (never the global dir) | deleted |

`upgrade` asks nothing: it reads `passTokens`/`fileTokens` back out of the config and replays the install for that scope against the current assets, the only way a plugin update reaches an installed scope. A disabled setup stays disabled. It adds the `SubagentHandback` entry an older install lacks and migrates one pair once: exactly `1000` / `2500` with no `readOnlyAgentTypes` key (the defaults before 6.5) becomes `2500` / `6000`. One scope per run.

## What it asks

| Question | Options | Default |
|----------|---------|---------|
| Scope | Project / Global / Both | none — always asked unless explicit |
| Thresholds (pass / file) | **2500 / 6000 (recommended)** / 1500 / 3500 / 1000 / 2500 / custom pair | 2500 / 6000 |

One question yields both numbers. A custom pair must satisfy `passTokens < fileTokens`; the config write aborts on an inversion. Already installed and a vague intent: the skill prints status and stops.

## Where it installs

| Scope | Hooks dir | settings.json | Config |
|-------|-----------|---------------|--------|
| Project | `<repo>/.claude/hooks/` | `<repo>/.claude/settings.json` | `<repo>/.claude/agent-return.json` |
| Global | `<config dir>/hooks/` | `<config dir>/settings.json` | `<config dir>/agent-return.json` |

The project root is the session's start directory (`CLAUDE_PROJECT_DIR`, else the git toplevel); a session started in a subdirectory does not load the parent's `.claude/settings.json`. `<config dir>` is the one Claude Code runs with: `$CLAUDE_CONFIG_DIR` when set, else `~/.claude/`. The state directory `agent-return-state/` sits beside the config that enabled the feature.

Config discovery starts at the resolved project root (`CLAUDE_PROJECT_DIR` -> upward walk for a `.git`/`.claude` marker -> cwd), then walks up probing `<dir>/.claude/agent-return.json` (16 levels), then falls back to `$CLAUDE_CONFIG_DIR/agent-return.json` when set, then to `~/.claude/agent-return.json`. Project wins; a malformed project config is skipped. Merge: drop stale paths, then append + dedupe by full script path; three entries, exec form, `timeout: 5` seconds, no `onFailure`.

## Config

```json
{
  "enabled": true,
  "passTokens": 2500,
  "fileTokens": 6000,
  "readOnlyAgentTypes": ["Explore", "Plan"],
  "version": "{PLUGIN_VERSION}",
  "content_version": "<INSTALL.md header>",
  "generated_by": "brewtools:agent-return-setup",
  "last_updated": "{LAST_UPDATED}"
}
```

| Key | Meaning |
|-----|---------|
| `enabled` | must be exactly `true`; anything else — or no config file at all — means both hooks no-op |
| `passTokens` | pass ceiling, the number quoted as `budget` in every order; positive integer; default `2500` |
| `fileTokens` | compress/file tier boundary; positive integer; default `6000` |
| `readOnlyAgentTypes` | agent types without a file-writing tool, matched exactly on `agent_type` (plugin agents as `plugin:name`): over `fileTokens` they are asked for the essential part, not a file. Any array replaces the default `["Explore","Plan"]`; `[]` = nobody |
| `reportDir` | optional, never written by install: add it by hand. Where the file tier writes: absolute, `~/`-prefixed or project-root-relative. A blank or non-string value, or `/`, falls back to `.claude/reports` |
| `version` / `generated_by` / `last_updated` | provenance, written on every config write together with `content_version` (from the runbook header). No `doc_type` — that field is `.md` frontmatter only. Inert at runtime |

**Threshold precedence, per threshold, first hit wins:** the config key -> the env var (`AGENT_RETURN_PASS` / `AGENT_RETURN_FILE`) -> the built-in `2500` / `6000`. Env values are parsed with `Number()`, not `parseInt()`, and only a positive integer is accepted: `1.7`, `abc`, `12abc`, `-5`, `0`, `""`, `NaN`, `Infinity` all fall through to the next level.

Config values are read on every hook call — changing `enabled`, a threshold or the list takes effect immediately, no restart. Hook **wiring** changes (install/upgrade/uninstall/purge) apply to the running session: no restart and no `/reload-plugins`; `/hooks` confirms.

## Report dir and protected paths

`.claude/` is a Claude Code protected path, so the file tier's `Write` under the default `reportDir` is prompted in `default`/`acceptEdits`, routed to the classifier in `auto`, denied in `dontAsk` and headless, and allowed in `bypassPermissions`. Allow rules do not pre-approve it. A denied write gives the compressed inline report. For unattended runs set `reportDir` outside `.claude/`.

## Why 2500 / 6000

Measured over **80 real Agent returns across 4 session transcripts**, sized `chars/4`:

| p10 | p25 | p50 | p75 | p90 | max |
|-----|-----|-----|-----|-----|-----|
| 502 | 761 | 1404 | 2256 | 3164 | 7931 |

Total 136.7k est-tokens, of which **79.4k (58%) is overflow above 800**.

`2500` is ~p78: only the heaviest fifth is challenged. `6000` sits between p90 and the maximum and is a judgement call, not a fit: below it one compression round can still reach the budget, above it the detail needs a durable home.

## Limits — read before trusting it

- **One challenge per agent; after it nothing is enforced.** The second report is delivered at any size and may land slightly over `passTokens` (observed 1417 -> 1026 against a budget of 1000). A resumed agent is not challenged again while its marker exists. Deliberate: repeated hand-back denies make the harness withhold the report.
- **No hook payload exposes an agent's tool inventory.** Write ability is known only from `readOnlyAgentTypes` and plan mode. An unlisted read-only agent gets the file order, whose last sentence tells it to send the essential part instead; add such types to the list.
- **State directory not writable:** the auto path never denies (an unrecorded deny could repeat); the classic path keeps `stop_hook_active` as its only brake.
- **Not verified live:** the file tier for a writing agent, nested agents, agent-team teammates.
- **Claude Code older than 2.1.271** has no `SubagentHandback` tool, so only the classic path exists there.
- **Only the final report is sized, by `chars/4`.** A subagent that burned context on 40 tool calls and returns 6 lines is invisible: this budgets the *return*, not the work. Not a tokenizer on purpose: the thresholds are fitted to `chars/4`.
- **Fail-open, never exit 2.** Malformed JSON, missing stdin, wrong shapes, any runtime throw -> `{}` and exit 0.
- **Cost: no per-tool-call tax.** About 30-53 ms per fire (Node v24.19.0, 15 invocations each), at subagent spawn, at each stop and, in auto mode, at the hand-back. `agent-deadline-setup`'s guard sits on a `.*` PreToolUse matcher and charges ~58 ms to *every* tool call, so here a **global install is cheap**. Re-measure before quoting.

The runbook's *Known limitation* section lists the rest.

## Coexistence with `agent-deadline-setup`

Both skills register `SubagentStop` and `PreToolUse` entries; hooks of one event run in parallel, and each skill's merge and strip only touch entries whose `args` name its own scripts. An agent challenged once by this guard continues on its original deadline clock: the deadline cleanup stamps `stopped` and keeps its state (a stop stamp under 5 minutes old keeps the clock), and the deadline guard always allows `SubagentHandback`. An agent-deadline install from before 6.5 restarts the clock and, past its limit, also denies the hand-back, so upgrade it too.

## Files

`SKILL.md` (mode/scope/threshold decisions + delegation), `assets/INSTALL.md` (the runbook) and the three hook files `assets/agent-return-{budget,contract,guard}.mjs`.
