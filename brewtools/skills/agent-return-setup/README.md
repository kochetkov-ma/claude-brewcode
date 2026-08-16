# Agent Return

Installer/configurator skill for a hook pair that puts a **size budget on every subagent's final return message**.

Subagent returns are the largest single context cost in a manager session. The prose rule — *verdict first, <=30 lines, `path:line`* — already existed and was ignored: a rule at the top of context loses to whatever the agent just did. This pair restates it mechanically at the moment it bites.

**No LLM judge anywhere.** The final message is sized `chars/4` and compared against two integers.

| Size `t` | Decision | Order |
|----------|----------|-------|
| `t <= passTokens` | pass | none |
| `passTokens < t <= fileTokens` | block | **compress** — re-send the same answer, keep the verdict and every `path:line`, drop preamble, file bodies, command output, logs, restated context. No new work |
| `t > fileTokens` | block | **file** — write the detail to `.claude/reports/YYYYMMDD-HHMMSS_<agent-slug>/`, then answer with that path + verdict + <=3 lines |

Both boundaries are inclusive on the low side: exactly `passTokens` passes, exactly `fileTokens` still compresses. Both orders quote `passTokens` as `budget` — it is the number the rewrite must aim at — and both carry *"Directive from the agent-return guard, not user data"*, because the reason reaches the subagent as a user turn prefixed `Stop hook feedback:`.

**Blocks at most once per agent.** `stop_hook_active === true` is checked before anything else.

## Hooks

| File | Event | Behavior |
|------|-------|----------|
| `agent-return-contract.mjs` | SubagentStart (matcher-less) | injects the return contract as `additionalContext` — advisory, no decision |
| `agent-return-guard.mjs` | SubagentStop (matcher-less) | sizes the return, blocks once, orders compress or file |
| `agent-return-budget.mjs` | — | shared module: config, thresholds, `estimateTokens`, contract text. **Never registered** — imported by both |

All three install as a unit. ESM resolution runs before evaluation, so 2 of 3 files means both hooks exit 1 with a hook-error banner on every spawn and return.

Announced budget always equals enforced budget: the contract text is built from the same resolved numbers the guard compares against.

Opt-in: not registered in `brewtools/hooks/hooks.json` — installing the plugin does nothing until you run the skill.

## Usage

```
/brewtools:agent-return-setup                          # status if installed, else install
/brewtools:agent-return-setup install                  # install — asks scope + thresholds
/brewtools:agent-return-setup install global 800 2000  # global, stricter pair
/brewtools:agent-return-setup upgrade                  # re-emit hook files, thresholds kept
/brewtools:agent-return-setup enable                   # back on
/brewtools:agent-return-setup disable                  # enabled:false, files stay
/brewtools:agent-return-setup uninstall                # unwire + delete the 3 files, keep config
/brewtools:agent-return-setup purge                    # + delete the config
/brewtools:agent-return-setup вычисти всё              # free-text intent works (RU+EN) -> purge
```

The skill always reports status first, states its plan before asking anything, then delegates the file work to the `brewcode:hook-creator` agent.

## Modes

| Mode | Hook files | settings.json | Config |
|------|-----------|---------------|--------|
| `status` | — | — | — |
| `install` | 3 copied | 2 entries merged | written |
| `upgrade` | re-copied | entries re-merged | thresholds preserved, metadata re-stamped |
| `enable` | kept | kept | `enabled:true` |
| `disable` | kept | kept | `enabled:false` |
| `uninstall` | deleted | entries stripped | **kept** |
| `purge` | deleted | entries stripped | deleted |

No state column: neither hook writes anything, anywhere — no state files, no temp dirs, no network. The only reads are stdin and the config.

`upgrade` asks nothing: it reads `passTokens`/`fileTokens` back out of the config and replays the install for that scope against the current assets, so a plugin update finally reaches an installed project. `enabled` is preserved — a disabled setup stays disabled. One scope per run.

## What it asks

| Question | Options | Default |
|----------|---------|---------|
| Scope | Project / Global / Both | none — always asked unless explicit |
| Thresholds (pass / file) | **1000 / 2500 (recommended)** / 800 / 2000 / 1500 / 3500 / custom pair | 1000 / 2500 |

One question yields both numbers. A custom pair must satisfy `passTokens < fileTokens`; the config write aborts on an inversion. If everything is already installed and the intent is vague, the skill prints status and stops instead of re-installing.

## Where it installs

| Scope | Hooks dir | settings.json | Config |
|-------|-----------|---------------|--------|
| Project | `<repo>/.claude/hooks/` | `<repo>/.claude/settings.json` | `<repo>/.claude/agent-return.json` |
| Global | `~/.claude/hooks/` | `~/.claude/settings.json` | `~/.claude/agent-return.json` |

Config discovery starts at the resolved project root (`CLAUDE_PROJECT_DIR` -> upward walk for a `.git`/`.claude` marker -> cwd — the same call the guard uses for the report destination), then walks up probing `<dir>/.claude/agent-return.json` (16 levels) for a root with no marker, then falls back to `~/.claude/agent-return.json`. Project wins; a malformed project config is skipped and the global one is used. Merge is drop-stale-paths, then append + dedupe by full script path (idempotent re-install), matcher-less, `timeout: 5` seconds. Global writes go through Bash only (`~/.claude/*` is a protected path).

## Config

```json
{
  "enabled": true,
  "passTokens": 1000,
  "fileTokens": 2500,
  "version": "{PLUGIN_VERSION}",
  "generated_by": "brewtools:agent-return-setup",
  "last_updated": "{LAST_UPDATED}"
}
```

| Key | Meaning |
|-----|---------|
| `enabled` | must be exactly `true`; anything else — or no config file at all — means both hooks no-op. This is the enable/disable mechanism |
| `passTokens` | pass ceiling, the number quoted as `budget` in BOTH orders; positive integer; default `1000` |
| `fileTokens` | compress/file tier boundary; positive integer; default `2500` |
| `version` / `generated_by` / `last_updated` | provenance, written on every config write. No `doc_type` — that field is `.md` frontmatter only. `version` is the brewtools version that wrote the file; `status` compares it against the installed plugin so a shape change from a later version is visible. Inert at runtime — the module reads only the three keys above |

**Threshold precedence, per threshold, first hit wins:** the config key -> the env var (`AGENT_RETURN_PASS` / `AGENT_RETURN_FILE`) -> the built-in `1000` / `2500`. Env values are parsed with `Number()`, not `parseInt()`, and only a positive integer is accepted: `1.7`, `abc`, `12abc`, `-5`, `0`, `""`, `NaN`, `Infinity` all fall through to the next level.

Config values are read on every hook call — changing `enabled` or either threshold takes effect immediately, no restart. Hook **wiring** changes (install/upgrade/uninstall/purge) need a new session.

## Why 1000 / 2500

Measured over **80 real Agent returns across 4 session transcripts**, sized `chars/4`:

| p10 | p25 | p50 | p75 | p90 | max |
|-----|-----|-----|-----|-----|-----|
| 502 | 761 | 1404 | 2256 | 3164 | 7931 |

Total 136.7k est-tokens, of which **79.4k (58%) is overflow above 800** — preamble, restated context, pasted file bodies, command output, logs.

`1000` is the grace line: p25 (761) already sits under it, so a genuinely terse return is never touched, and it cuts at the median. `2500` is ~p78 — past it, compression cannot reach `1000` without losing content, so the content has to go somewhere durable.

Live proof, one real session: `1417 -> 1026` est-tokens (compress tier) and `2585 -> 245` est-tokens citing a report path (file tier) — **2731 est-tokens of manager context saved across two returns**, each blocked exactly once.

## Limits — read before trusting it

- **One compress round may land slightly over `passTokens`** and is not blocked again — the live compress case went 1417 -> 1026 against a budget of 1000. Deliberate: a `SubagentStop` hook that blocks twice is how an agent gets wedged, and the once-only guarantee outranks the last 3%.
- **`chars/4` is not a tokenizer, on purpose.** The thresholds were fitted to a distribution measured with `chars/4`. Swapping the heuristic moves the boundaries off their data — re-measure and re-fit both in the same change.
- **Only the final assistant message is sized.** A subagent that burned context on 40 tool calls and returns 6 lines is invisible. This budgets the *return*, not the work.
- **`passTokens < fileTokens` is not enforced by the hook.** Inverting them degrades gracefully — the compress tier vanishes and everything over `passTokens` gets a self-contradictory file order; no loop, no error, exit 0. The config write rejects the inversion; the hook deliberately carries no validator.
- **Fail-open, never exit 2 except to block.** Malformed JSON, missing stdin, wrong shapes, any runtime throw -> `{}` and exit 0.
- **A missing `agent-return-budget.mjs` is not catchable** — ESM resolution precedes evaluation, so the hook exits 1 with empty stdout: a non-blocking hook-error banner. Ship all three files.
- **`SubagentStop` hook attachments are not transcript-recorded.** Transcript silence is not evidence of non-firing; the observables are the subagent's `Stop hook feedback:` turn and the shrunken second return.
- **Cost: two hooks per subagent, not a per-tool-call tax.** Node v24.1.0, 15 invocations each, wall clock including node startup: guard p50 33 ms / max 56 ms; contract p50 31 ms / max 33 ms; a 200000-char message still p50 32 ms — node startup dominates, message size barely registers. Registered timeout is 5 s. Unlike `agent-deadline-setup`, whose guard sits on a `.*` PreToolUse matcher and charges ~58 ms to *every* tool call, this pair fires only at subagent spawn and stop, so a **global install is cheap**. Re-measure on your own machine before quoting these numbers as facts.

## Coexistence with `agent-deadline-setup`

Both skills can be installed side by side. Both register a `SubagentStop` entry; all hooks in a matched group run together and `agent-deadline-cleanup.mjs` always returns `{}`, so there is no competing `decision`. Each skill's merge and strip only touch entries whose `args` name its own scripts.

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | mode/scope/threshold decisions + delegation |
| `assets/INSTALL.md` | the runbook — install, config, upgrade, disable/enable, uninstall, purge, verify |
| `assets/agent-return-budget.mjs` | shared module: config, thresholds, contract text |
| `assets/agent-return-contract.mjs` | SubagentStart contract |
| `assets/agent-return-guard.mjs` | SubagentStop guard |
