# Final BREWTOOLS Review

## Executive verdict

BREWTOOLS is useful and its common-path hook suites are largely functional, but the review found concrete defects worth fixing before treating its safety gates, secret scanner, release automation, or text-rewrite workflows as authoritative. The highest-priority risks are bypassable hard-mode enforcement, secret and provider-key exposure, destructive or over-broad release behavior, workflow-template injection, SSH lockout/trust failures, and rewrite tools that mutate files before verification can protect the original.

This was a **review-only** audit. No plugin implementation, configuration, installation, release, or runtime state was changed. The findings below are only those independently accepted by two agents. Pass-one suspicions rejected by either verifier were discarded. The 46 accepted source candidates (38 confirmed and 8 narrowed) are deduplicated into the 31 actionable findings below.

The plugin's successful day-to-day operation is not contradicted by this report: many defects require a nested working directory, malformed configuration, uncommon command form, multi-scope plugin install, concurrent installer run, adversarial input, provider error body, or failure during a release. Those are still real states that the plugin claims to handle safely.

## Re-verification summary

A second, adversarial pass re-ran every finding against the tree at `main` @ v5.7.0 (2026-08-16), with a cross-cutting arbiter (`D1`) settling all upstream API disputes. Precedence: adversarial ruling > first-pass verdict > the original claim below.

**Verdicts — 31 findings: 22 CONFIRMED, 9 NARROWED, 0 REFUTED.** No BT finding was refuted outright. Two *premises* were overturned while their findings survived on other grounds (BT-F09, BT-F14) — recorded under `## Rejected on re-verification`.

- CONFIRMED (22): BT-F01, F02, F03, F05, F07, F08, F10, F11, F12, F13, F15, F16, F18, F20, F21, F22, F24, F27, F28, F29, F30, F31.
- NARROWED (9): BT-F04, F06, F09, F14, F17, F19, F23, F25, F26.

**Final severity — High 14, Medium-High 2, Medium 10, Low-Medium 1, Low 4.**

| Final severity | IDs |
|---|---|
| High (14) | BT-F01, F02, F03, F05, F07, F08, F10, F11, F13, F15, F18, F22, F24, F30 |
| Medium-High (2) | BT-F20, F21 |
| Medium (10) | BT-F04, F06, F09, F12, F14, F16, F17, F19, F26, F29 |
| Low-Medium (1) | BT-F28 |
| Low (4) | BT-F23, F25, F27, F31 |

**Severity changes (13).** Escalations:

| ID | Was | Final | Reason |
|---|---|---|---|
| BT-F24 | Medium | **High** | A router the user explicitly disabled at the real root still denies spawns from a nested cwd; reproduced |
| BT-F30 | Medium | **High** | Reproduced twice, including with a working `gh` on a coreutils-free PATH; a dispatch never attempted is reported as `FAILED trigger` |
| BT-F21 | Medium | **Medium-High** | Port injection reproduced: `ProxyCommand` executes through the local shell — command execution, not option tampering |

Deflations:

| ID | Was | Final | Reason |
|---|---|---|---|
| BT-F04 | High | Medium | Only the chunk-accounting hole survives; history/docs/labelling are documented limits |
| BT-F06 | High | Medium | Prompt-fidelity degradation, not a runtime failure |
| BT-F09 | High | Medium | Unsafe idiom shipped in a template; no exploitable sink today (premise corrected — see Rejected) |
| BT-F12 | High | Medium | Textbook TOFU; needs an active MITM at first enrollment |
| BT-F14 | High | Medium | Loss bounded to uncommitted work — **not** because the contract is documented (see Rejected) |
| BT-F19 | Medium-High | Medium | Destructive-prune framing withdrawn: prune never touches directly installed plugins |
| BT-F23 | Medium | Low | The hook emits a directive string only; it never writes |
| BT-F25 | Low | Low (no change) | No fix warranted — documented as a known limitation at `INSTALL.md:71-78`, strict is opt-in, the anti-loop marker lets the retry through. Disposition corrected: stays OPEN as won't-fix-with-rationale |
| BT-F27 | Medium | Low | Bounded to a one-shot migration; the single-writer integrate step re-derives the board from disk |
| BT-F28 | Medium | Low-Medium | Truncation target must be named `<session_id>.think-short-counter`; `session_id` is an unguessable CC UUID |
| BT-F31 | Medium | Low | Template text in one agent snippet, contradicted by `deploy-admin.md:175` |

Four findings were SPLIT across a skill/agent/template boundary. Each split is resolved in its own `FIX DIRECTION (decided)` so that no half can be closed alone: BT-F08 (three files), BT-F10, BT-F18, BT-F22.

## Scope and exclusions

Reviewed operational BREWTOOLS surfaces:

- `.claude-plugin/plugin.json`, shipped Claude Code agents, direct hooks, and hook libraries;
- setup skills and their generated assets for manager, agent deadline, agent return, agent router, think-short, and task-board behavior;
- deploy, SSH, provider-switch, plugin-update, secrets-scan, text-human, and text-optimize skills;
- scripts, runtime prompts, generated hook templates, workflow templates, and tests that define behavior.

Excluded:

- UI behavior and BREWUI;
- documentation-only prose that does not direct execution or generated behavior;
- Codex projections and compatibility files;
- repository implementation changes, installation, deployment, publication, and destructive live tests.

## Evidence lock

The compatibility baseline is Claude Code **2.1.233**, verified locally with `claude --version` on 2026-08-15. Official source snapshots used to resolve API disputes were:

- Claude Code: commit `0fa8c19d50f70f9f383fb6ff5ce5209575267d21`, 2026-08-14T22:20:50Z;
- official Claude Code plugins: commit `09041ee686e7ba8be1b5b34a0852959991481cce`, 2026-08-15T13:48:26-05:00; the only post-review delta from `263bb97c0d28fa15b411af908694964616524396` is an unrelated SumUp marketplace dependency-pin bump;
- Anthropic skills: commit `f6656c1256d5a8adfa37db9110046ef20bac644c`, 2026-08-13T11:09:54-07:00;
- downloaded npm artifact: `.claude/tmp/claude-upstream-20260815/npm/anthropic-ai-claude-code-2.1.233.tgz`.

Two current upstream contracts materially affect this review:

- `.claude/tmp/claude-upstream-20260815/claude-code/CHANGELOG.md:22` removes task-tracking tools from Opus 4.8, Sonnet 5, Fable 5, Mythos 5, and newer models unless `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` is set.
- `.claude/tmp/claude-upstream-20260815/docs/sub-agents.md:337-353` removes `AskUserQuestion` from every ordinary subagent and further narrows background tool pools.
- `.claude/tmp/claude-upstream-20260815/docs/plugins-reference.md:1021-1032,1077-1095` documents plugin prune dry-run/confirmation flags and scope-aware plugin updates.

## Validation performed

Safe, read-only or temp-directory validations were run against the current tree:

| Validation | Result |
|---|---|
| `brewtools/skills/agent-deadline-setup/tests/run.sh` | 169 passed, 0 failed, 1 environment skip |
| `brewtools/skills/agent-return-setup/tests/run.sh` | 554 passed, 0 failed |
| `brewtools/skills/agent-router-setup/tests/run.sh` | 68 passed, 0 failed |
| `brewtools/skills/think-short-setup/tests/run.sh` | 14 passed, 0 failed |
| `node brewtools/skills/manager-setup/tests/suite.mjs` | 8 passed, 0 failed |
| `bash -n` over deploy, SSH, provider-switch, and plugin-update scripts | passed |
| Worktree check after validation | no plugin source changes |

Passing suites establish common-path behavior; they do not invalidate the confirmed missing cases. Several suites currently encode only structural or happy-path expectations and do not exercise the failure states below.

## Priority-ranked findings

### P0 — fix first

### BT-F01 — Hard-mode enforcement has four independent bypasses

- **Severity:** High
- **Evidence:** `brewtools/hooks/hardmode-guard.mjs:56-71,104-107,150-154,190-260,286-290,307-340`
- **Trigger/state:** Any of the following occurs while hard mode is armed: the current hook `cwd` is a nested directory; a Bash command invokes any path ending in `hooks/lib/manager-state.mjs`; a command uses an executable wrapper such as `env` or `rg --pre`; or an MCP tool name contains an allowlisted server segment but exposes a different operation.
- **Observable outcome:** The guard returns `{}` or classifies the command as safe. Independently reproduced examples include a root-armed project followed by nested-cwd `Write`, `node /tmp/attacker/hooks/lib/manager-state.mjs get`, an arbitrary executable reached through `env`, `rg --pre`, and an opaque `mcp__search__destroy_all`-style tool name.
- **Blast radius:** The primary mutation wall can be bypassed from the main conversation. This is not a subagent-only weakness and undermines the strongest safety claim in the plugin.
- **Minimal fix:** Resolve one canonical project root; validate the exact installed helper path and permitted argv; reject executable wrappers unless their complete semantics are parsed; classify MCP tools by the full server/tool identity, not a permissive substring.
- **Two-agent confirmation:** CONFIRMED independently as BT-H01, BT-H02, BT-H03, and BT-H04. The mechanisms were combined here only because they share the same failed enforcement boundary.
- **VERDICT:** CONFIRMED — 4/4 vectors re-reproduced byte-for-byte, and worse than described here.
- **SEVERITY (final):** High
- **WHY:** The self-exempt check at `hardmode-guard.mjs:308` runs BEFORE the level branch, so vectors A and B are level-independent: `rm -rf /` passes at `strict` from a nested cwd, and a planted `hooks/lib/manager-state.mjs` can set `hard=false` at `strict`, permanently disarming the wall.
- **FIX DIRECTION (decided):** Resolve state from `CLAUDE_PROJECT_DIR` per the D1 canonical recipe, never raw `cwd`; anchor the self-exempt on the two ABSOLUTE installed helper paths; replace wrapper handling with a default-deny allowlist of exact binaries plus per-binary flag vetting (`rg --pre`/`--pre-glob`, `find -ok*`) — **not** a wrapper denylist; classify MCP on the segment after the second `__`, default-deny an unrecognised verb.

### BT-F02 — Provider API keys cross the model/shell boundary and become executable shell input

- **Severity:** High
- **Evidence:** `brewtools/skills/provider-switch/SKILL.md:192-207`; `brewtools/skills/provider-switch/scripts/write-alias.sh:59-87`; `brewtools/skills/provider-switch/scripts/verify-providers.sh:6-12`
- **Trigger/state:** A provider key is missing and the skill asks for it through `AskUserQuestion`, then substitutes the answer into the literal Bash source `printf '%s' 'KEY_VALUE'`. A key containing quotes, newlines, command syntax, or shell metacharacters is stored without shell escaping.
- **Observable outcome:** The secret is visible to the model and session transcript, can alter the generated command, is written as `export VAR="VALUE"`, and is later executed by `eval "$line"` during provider verification.
- **Blast radius:** Credential disclosure and local command execution under the user's account; persistent exposure through `~/.zshrc` and its backup.
- **Minimal fix:** Never collect a secret through model-visible text. Use a direct terminal/secure prompt feeding a fixed script on stdin; encode values with a shell-safe serialization; parse the managed file without `eval`.
- **Two-agent confirmation:** CONFIRMED independently as PRV1.
- **VERDICT:** CONFIRMED, broadened. The argv/`ps` sub-claim is narrowed away — `write-alias.sh:59-70` already reads from stdin and refuses a tty.
- **SEVERITY (final):** High
- **WHY:** The key still reaches the model at `SKILL.md:195` and the model still pastes it into literal Bash at `:205`; `write-alias.sh:76` then stores it `export VAR="VALUE"` (double quotes — a `$` or backtick expands on every future shell start) and `verify-providers.sh:10` `eval`s it back.
- **FIX DIRECTION (decided):** No model-invisible collection channel exists for a runtime secret (D1 Q2). The user places the value out of band — `export VAR=...` or a file they create `chmod 600` — and the skill reads `$VAR` inside a Bash step without echoing it; the skill may print the `export`/`chmod` command, never run one containing the value. Delete the `AskUserQuestion` collection at `:195,205`. Independently: single-quote with `'` doubled at `write-alias.sh:76`, and replace `eval "$line"` with a `${line#export }` split + `printf -v`.

### BT-F03 — Secrets reports persist the raw credentials they discover

- **Severity:** High
- **Evidence:** `brewtools/skills/secrets-scan/SKILL.md:139-143,160-188`
- **Trigger/state:** A scan agent identifies a real password, token, private key fragment, or connection string.
- **Observable outcome:** The prompt requires a raw `content` value and the report template writes it into `.claude/reports/.../report.md`, creating a second durable plaintext copy of the secret.
- **Blast radius:** Any report reader, backup, later agent, accidental commit, or support bundle can receive the credential even if the original file is remediated.
- **Minimal fix:** Persist category, path, line, fingerprint, and a short redacted preview only; never store the full matched value. Create reports with restrictive permissions and add a cleanup/retention rule.
- **Two-agent confirmation:** CONFIRMED independently as SEC1.
- **VERDICT:** CONFIRMED, broadened.
- **SEVERITY (final):** High
- **WHY:** `SKILL.md:141` mandates the raw `content`, `:164` Writes it, `:180-183` renders a `| Content |` column, and `grep -rn 'chmod|umask|redact|sha256'` over the skill returns zero hits. Broadening verified on this machine: `.claude/reports/` is ignored only by this user's personal `~/.gitignore_global`, not by anything in the repo — in a consumer repo the scan can commit the secret it just found.
- **FIX DIRECTION (decided):** Replace `content` with `match_len` + `sha256[:12]` + an <=8-char masked preview; emit the report under `umask 077` and `chmod 600`; have Phase 1 append `.claude/reports/` to `.gitignore` if absent.

### BT-F04 — Secrets-scan coverage can silently omit whole chunks and overstate pre-push safety

- **Severity:** High
- **Evidence:** `brewtools/skills/secrets-scan/SKILL.md:50-63,69-80,101-117,137,150-156,234-244`
- **Trigger/state:** A tracked secret was later added to `.gitignore`; a secret exists only in history; a secret is in a doc/comment; or one of ten LLM scanners returns malformed JSON/prose.
- **Observable outcome:** `git ls-files` continues to include already tracked leaks, but fix mode offers only `.gitignore`; history is explicitly out of scope; docs/comments are skipped; and a malformed agent response drops that complete chunk with no invariant proving every assigned path appeared in `scanned[]` or `skipped[]`.
- **Blast radius:** A report can look complete while tracked/current or historical credentials remain publishable. The README's warning makes a general scan nonconclusive, but it does not make a pre-push or open-source safety claim valid.
- **Minimal fix:** Enforce an assigned-versus-accounted file invariant, retry or fail closed on malformed chunks, scan likely secrets in docs/comments, remove tracked leaks from the index, and give separate history/rotation instructions. Never claim repository safety from a current-worktree-only scan.
- **Two-agent confirmation:** SEC2 and SEC4 were CONFIRMED. SEC3 was NARROWED: the defect applies to pre-push/open-source assurance, not to a clearly labeled current tracked-worktree scan.
- **VERDICT:** NARROWED — the only surviving defect is the chunk-accounting hole plus the false CONTEXT sentence. History (`SKILL.md:104`), docs/comments (`:137`) and the pre-push framing are documented limits, and `README.md:61-62` already ships the counter-warning verbatim.
- **SEVERITY (final):** Medium (was High)
- **WHY:** `SKILL.md:152` says only "Parse each (handle errors gracefully)" — no retry, no fail-closed, no reconciliation — while `:114-115` states that a dropped chunk means a shipped credential; `:107-109` falsely asserts git-ignored paths were already dropped, which is untrue for tracked-then-ignored files.
- **FIX DIRECTION (decided):** Enforce `assigned == union(scanned, skipped)` per agent; re-spawn a mismatching chunk once, then record it as `UNSCANNED` and refuse the "clean" verdict. Delete the false "git-ignored paths already dropped" sentence from the agent CONTEXT.

### BT-F05 — Manager setup can overwrite unrelated local settings after a parse failure

- **Severity:** High
- **Evidence:** `brewtools/skills/manager-setup/SKILL.md:209-224`
- **Trigger/state:** `.claude/settings.local.json` exists but is malformed or unreadable during manager setup.
- **Observable outcome:** The embedded transform catches the parse error as `{}` and writes a reconstructed settings object, discarding unrelated user configuration instead of stopping.
- **Blast radius:** Project-local permissions, hooks, environment, or other Claude Code settings can disappear during a setup command intended to add manager state.
- **Minimal fix:** Parse before staging any write; abort with the exact file/error; preserve the original byte-for-byte; write atomically only after a successful merge and reparse.
- **Two-agent confirmation:** CONFIRMED independently as BT-H05 (same underlying candidate as the earlier manager-settings finding).
- **VERDICT:** CONFIRMED — could not be broken on re-check.
- **SEVERITY (final):** High
- **WHY:** `SKILL.md:210` `try { … } catch {}` with `cfg = {}` preinitialised swallows both a `JSON.parse` throw and an `EACCES` read error into "file is empty", then `:221-225` writes and renames unconditionally; `grep -n '\.bak|copyFileSync(settings'` returns zero hits — there is no backup anywhere. The same shape recurs at `:291, :323, :389, :474, :481`.
- **FIX DIRECTION (decided):** `ENOENT` -> `{}` and proceed; any other read error or parse throw -> print the file path plus the parser message and `process.exit(1)` before staging any write. Copy to `settings.local.json.bak` before the rename. Apply to all four blocks, not just `install`.

### BT-F06 — Mandatory manager task-board operations are unavailable on current models

- **Severity:** High
- **Evidence:** `brewtools/skills/manager-setup/references/full.md:12-20`; `brewtools/skills/manager-setup/references/planmode.md:12-20,59-68`; `brewtools/skills/manager-setup/SKILL.md:567-568`; official `.claude/tmp/claude-upstream-20260815/claude-code/CHANGELOG.md:22`
- **Trigger/state:** Manager mode runs under Opus 4.8, Sonnet 5, Fable 5, Mythos 5, or newer without the opt-in environment variable.
- **Observable outcome:** Mandatory TaskCreate/TaskUpdate/TaskList-style workflow instructions cannot execute and no non-task-tool fallback is defined.
- **Blast radius:** Planning/checkpoint behavior degrades or stalls in the main manager flow on Claude Code 2.1.233's current model families.
- **Minimal fix:** Detect task-tool availability once and route to an explicit plan/file checklist fallback; keep task tools as an enhancement, not a hard requirement.
- **Two-agent confirmation:** CONFIRMED independently as BT-S01 against the current official changelog.
- **VERDICT:** NARROWED — the upstream fact holds and was live-confirmed (the task tools are absent from an Opus 5 subagent's tool set), but the impact is prompt fidelity, not execution failure. Nothing crashes.
- **SEVERITY (final):** Medium (was High)
- **WHY:** `references/full.md:13,14,16` and `references/planmode.md:13,14,16,64` mandate `TaskCreate`/`TaskUpdate` unconditionally with no stated fallback, and `TodoWrite` is removed by the same changelog line — so a contract whose first three steps cannot be performed teaches the model to treat the whole block as advisory.
- **FIX DIRECTION (decided):** One conditional fallback clause in both reference files — if the task tools are absent, keep the identical graph as a numbered checklist in the plan / `.claude/features/` and update it wherever the protocol names `TaskUpdate`. Keep the tool path as the preferred branch; mention `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` once in the README.

### BT-F07 — Shipped admin agents mandate a tool Claude Code always removes from subagents

- **Severity:** High
- **Evidence:** `brewtools/agents/ssh-admin.md:6,17,44-61,183-190`; `brewtools/agents/deploy-admin.md:6,17,56-73,203-212,232-242`; official `.claude/tmp/claude-upstream-20260815/docs/sub-agents.md:337-349`
- **Trigger/state:** `ssh-admin` or `deploy-admin` is launched as an ordinary subagent and reaches any mandatory confirmation or missing-inventory branch.
- **Observable outcome:** `AskUserQuestion` is absent even though it is listed in `tools:`; the agent cannot perform the required safety gate. Depending on model behavior it stalls, fails, or proceeds without its promised confirmation.
- **Blast radius:** Remote server and release operations delegated to the advertised specialist agents.
- **Minimal fix:** Keep all user approvals in the main skill before delegation; pass an explicit approved command envelope to the agent; tell the subagent to stop and return a request rather than calling `AskUserQuestion`.
- **Two-agent confirmation:** CONFIRMED independently as BT-A01 using the official subagent tool filter.
- **VERDICT:** CONFIRMED. The upstream rule is unconditional (D1 Q3): `AskUserQuestion` is removed from every subagent, foreground and background, even when listed in `tools:`; only a `/subtask` fork keeps it.
- **SEVERITY (final):** High
- **WHY:** The stale `tools:` entry is inert, not fatal — both agents list enough other tools to launch. The defect is the prose: `ssh-admin.md` routes 8 safety gates and `deploy-admin.md` 10 through a tool that does not exist at runtime, while `Bash`, `Write` and `Edit` do.
- **FIX DIRECTION (decided):** Delete `AskUserQuestion` from both `tools:` lines and replace every gate with "STOP, return a `NEEDS-APPROVAL` block naming the exact command and its safety level, end the turn". Move the approval into `/brewtools:ssh` and `/brewtools:deploy`, which run in the main session, and re-spawn the agent with an explicit approved-command envelope.

### BT-F08 — Release flow mutates before approval and stages/pushes unrelated state

- **Severity:** High
- **Evidence:** `brewtools/skills/deploy/SKILL.md:309-348`; `brewtools/agents/deploy-admin.md:110-127`
- **Trigger/state:** Release mode is run in a dirty repository or a repository containing unrelated local tags. Version and changelog edits occur before the confirmation at `deploy/SKILL.md:333-335`; the approved continuation runs `git add -A`, creates a tag, then separately runs `git push` and `git push --tags`.
- **Observable outcome:** Cancel still leaves local mutations; continuing commits all dirty files and publishes all unpushed tags. The split commands are non-atomic, and `... || echo "FAILED"` can return success to the surrounding step after a failed git operation.
- **Blast radius:** Unrelated user work and local tags can be published; partial remote release state can survive a later failure.
- **Minimal fix:** Generate an exact proposed path/tag set without writes, confirm it, stage only owned paths, verify the tag is the only new tag, and use one stop-on-error release transaction or explicit rollback/recovery checkpoints.
- **Two-agent confirmation:** CONFIRMED independently as DEP1 and BT-A02; deduplicated into one release-boundary finding.
- **VERDICT:** CONFIRMED, both halves, and the fix set is broadened to a THIRD file.
- **SEVERITY (final):** High
- **WHY:** Ordering verified verbatim — `deploy/SKILL.md:309` (bump, writes) and `:322` (changelog, writes) precede the `:334` confirmation gate, whose own option list offers "Cancel" on an already-mutated tree; `:340`, `:344`, `:348` are three separate EXEC blocks each masking a non-zero exit with `|| echo "FAILED"`.
- **FIX DIRECTION (decided):** SPLIT RESOLVED — the SKILL is authoritative for the approval boundary; `deploy-admin.md` must LOSE its self-contained release recipe and execute only the approved envelope handed to it (`/brewtools:deploy` runs in the main session where approval is possible; the agent does not). The fix set is THREE files: `deploy/SKILL.md`, `brewtools/agents/deploy-admin.md:122,124,222`, and `skills/deploy/templates/deploy-admin-agent.md.template:99,101`, which ships the same pair into every generated consumer repo (correct `references/release-best-practices.md:29` in the same pass). Both idioms change at every site: `git add -A` -> explicit `git add -- <paths>`; `git push --tags` -> `git push origin refs/tags/vX.Y.Z`. Move the gate ahead of every write, collapse the release into one `&&` chain, and delete `|| echo "FAILED"` in favour of a real non-zero exit. **No half closes alone.**

### BT-F09 — Generated deployment workflows interpolate untrusted contexts into shell and JavaScript source

- **Severity:** High
- **Evidence:** `brewtools/skills/deploy/references/workflow-templates.md:153-169,171-191,260-299`
- **Trigger/state:** A manual `image_tag`, branch/ref, step output, or other GitHub expression contains shell or JavaScript syntax.
- **Observable outcome:** `${{ inputs.image_tag }}` and related values are rendered into `run:` source before the shell executes; deployment outputs are embedded directly in `github-script` source. Crafted values can break syntax or execute additional code under workflow permissions.
- **Blast radius:** CI runner, deployment credentials, repository deployment status, and potentially the target server.
- **Minimal fix:** Pass contexts through `env:` and quote the environment variable in shell; consume `process.env` or action inputs in JavaScript; validate image tags and numeric deployment IDs before use.
- **Two-agent confirmation:** CONFIRMED independently as DEP2.
- **VERDICT:** NARROWED — the injection sinks are real and multiple, but as shipped there is no exploitable escalation path; this is a template that teaches an unsafe idiom to consumers who will re-trigger it. The report's "untrusted contexts" premise does not survive as stated (see `## Rejected on re-verification`).
- **SEVERITY (final):** Medium (was High)
- **WHY:** Template T4 at `workflow-templates.md:428-433` DOES ship `pull_request`, so the trigger set is fork-reachable — but its only `${{ }}`-in-`run:` sink is `github.ref_name` (`:466`), which on a `pull_request` event is `<PR#>/merge` and not attacker-controlled; T4 holds no `secrets.*`, and GitHub downgrades a fork PR token to read-only regardless of its `security-events: write`.
- **FIX DIRECTION (decided):** Move every context to `env:` and reference `"$VAR"` in shell; consume `process.env` / `core.getInput` in `github-script`, never `${{ }}` in the script body; validate `image_tag` against `^[A-Za-z0-9._-]{1,128}$` and `deployment_id` as an integer. Extend the sweep to T4 because it is fork-reachable. Pin or remove both floating tags: `default: "latest"` at `:126` and `${IMAGE}:latest` at `:48`.

### BT-F10 — SSH hardening can lock out the only administrative path

- **Severity:** High
- **Evidence:** `brewtools/agents/ssh-admin.md:103-114`; `brewtools/skills/ssh/references/ssh-best-practices.md:90-100`
- **Trigger/state:** The agent disables root/password login or changes the SSH port before proving a non-root key, sudo access, configuration syntax, firewall rule, and a second independent login session.
- **Observable outcome:** `sshd` reload/restart can leave the server unreachable. The generic “keep an open session” note is weaker than validating the replacement access path.
- **Blast radius:** Full loss of administrative access to the target host, with recovery requiring provider console or rescue media.
- **Minimal fix:** Require `sshd -t`, confirmed non-root key ownership, passwordless/known sudo behavior, firewall allowance, and a successful second session on the future configuration before disabling the old path.
- **Two-agent confirmation:** CONFIRMED independently as BT-A04.
- **VERDICT:** CONFIRMED and aggravated. The lockout recipe reproduces verbatim.
- **SEVERITY (final):** High
- **WHY:** `ssh-best-practices.md:117` ships `ufw allow 2222/tcp && ufw deny 22/tcp` directly after the `Port 2222` block at `:113-115`, with no reload, no `sshd -t` and no proof step between them; `## Server Hardening` (`:88-117`) carries zero risk framing. Aggravator missed by the first pass: ufw permits ESTABLISHED connections, so the operator's current session survives `ufw deny 22/tcp` and the lockout stays silent until disconnect — precisely when it becomes unrecoverable.
- **FIX DIRECTION (decided):** SPLIT RESOLVED — the agent half (`ssh-admin.md:105`) is authoritative in shape but under-specifies the proof; the NORMATIVE 5-item gate is written ONCE in `ssh-best-practices.md` and referenced, never copied, from `ssh-admin.md:105` (duplication is how the halves drifted). Gate: (1) `sshd -t` clean, (2) non-root key login proven in a NEW session, (3) `sudo -n true` proven, (4) firewall allows the NEW port, (5) a second independent session on the new config. Re-order `:117` to allow-new -> `sshd -t` -> reload -> prove a NEW session -> deny-old, and state explicitly that an established session is NOT proof. **No half closes alone.**

### BT-F11 — SSH server insertion is not scoped to the SSH table

- **Severity:** High
- **Evidence:** `brewtools/skills/ssh/scripts/claude-local-ops.sh:29-63,90-143`
- **Trigger/state:** `CLAUDE.local.md` was created by another setup flow and contains an earlier pipe table, such as GitHub Configuration, before the SSH Servers table; then `claude-local-ops.sh add` runs.
- **Observable outcome:** The insertion state flips after the first `|---...|` separator in the file and writes the server row into the wrong table/section.
- **Blast radius:** Corrupted local inventory and later misrouting of deploy or SSH commands to missing/wrong targets.
- **Minimal fix:** Enter only after the exact `## SSH Servers` heading and exact header row, exit at the next heading, and abort if that unique section/table is not found.
- **Two-agent confirmation:** CONFIRMED independently as SSH1 with a deploy-first/SSH-add reproduction.
- **VERDICT:** CONFIRMED, reproduced end-to-end. Two corrections: the root line is `claude-local-ops.sh:121`, not `:140-143` (`:140-143` only consumes the flag), and a second cwd-relative defect sits alongside it.
- **SEVERITY (final):** High
- **WHY:** `:121` flips `AFTER_SEPARATOR` on the first `|---` line anywhere in the file. The reproduction shows three failures in one run: the row corrupts an unrelated 2-column table, `add` reports success with exit 0, and the tool's own `read`/`list` cannot see the server — because `get_server_rows` (`:49`) and `set-default` (`:244`) correctly key on `| Name |` while `add` does not. Narrowing: a preceding table written `| --- |` does not trigger the flip, so this is common but not universal.
- **FIX DIRECTION (decided):** Anchor `add` on the exact `## SSH Servers` heading plus the `| Name | Host |` header row, exit at the next `## `, and `exit 1` if that unique section is absent instead of appending blind. Anchor the file-wide duplicate check at `:92` to the same section. Resolve `LOCAL_FILE` (`:7`, currently cwd-relative) from the repo root per the D1 recipe.

### BT-F12 — SSH onboarding trusts the first network-provided host key

- **Severity:** High
- **Evidence:** `brewtools/skills/ssh/SKILL.md:185-202`; `brewtools/skills/ssh/references/ssh-best-practices.md:145-176`
- **Trigger/state:** A new server is enrolled on an untrusted or intercepted network.
- **Observable outcome:** `ssh-keyscan` output is appended directly to `known_hosts` without displaying or verifying a fingerprint through an independent channel.
- **Blast radius:** Persistent man-in-the-middle trust for future credentials and administrative commands to that host.
- **Minimal fix:** Capture keys to a temporary file, print SHA256 fingerprints, require verification against provider console/out-of-band metadata, then atomically add the approved key.
- **Two-agent confirmation:** CONFIRMED independently as SSH3.
- **VERDICT:** CONFIRMED — the behaviour is exactly what ships.
- **SEVERITY (final):** Medium (was High)
- **WHY:** This is textbook TOFU, which every mainstream SSH tool performs; exploitation needs an active MITM at first enrollment. Repeated at `ssh/SKILL.md:196` and `ssh-best-practices.md:149,175` — the second of which is key rotation, where re-establishing trust matters most.
- **FIX DIRECTION (decided):** Keyscan to a temp file, print `ssh-keygen -lf <tmp>` SHA256 fingerprints, require the operator to match them against provider console / out-of-band metadata, then append atomically. Drop `2>/dev/null` so a failed scan is visible.

### BT-F13 — Text-human's “cosmetic” code rewrites can change program semantics

- **Severity:** High
- **Evidence:** `brewtools/skills/text-human/reference/flows/code.md:1-7,23-27,50-51`
- **Trigger/state:** Code contains Unicode inside literals/regexes or a language where tabs are syntactic, and the code flow normalizes Unicode or mixed tabs/spaces.
- **Observable outcome:** Em dashes, smart quotes, arrows, or indentation can be changed inside executable content even though the flow labels the operation normalization/cosmetic.
- **Blast radius:** Any source/config file processed by code flow; failures can be silent if tests do not cover the changed literal or indentation path.
- **Minimal fix:** Restrict normalization to parsed comments/docstrings or language-aware safe regions; never rewrite literal/token or indentation semantics without parser/test proof.
- **Two-agent confirmation:** CONFIRMED independently as TH1.
- **VERDICT:** CONFIRMED, both halves verbatim, and BROADENED — the exposure is wider than described here.
- **SEVERITY (final):** High
- **WHY:** `flows/code.md:26` normalizes Unicode to ASCII with no literal, regex or i18n exclusion anywhere in the file, and `:50-51` labels tab/space rewriting "cosmetic only". Broadening: `flows/mixed.md:26`'s path-mode filter explicitly INCLUDES `*.py`, so tab rewriting hits Python in BOTH modes, not only Makefiles in commit mode. Combined with BT-F14's no-backup contract the corruption is unrecoverable for uncommitted work.
- **FIX DIRECTION (decided):** Restrict Unicode normalization to parsed comment/docstring regions only. Demote tab/space rewriting to opt-in behind a hard exclusion list that names `*.py` explicitly (plus `Makefile`, `*.mk`, `*.yaml`, `*.yml`, Go raw strings), since path mode targets Python by default. Anything inside a literal or token is surfaced for review, never auto-edited. BT-F14's clean-tree precondition is a prerequisite of this fix.

### BT-F14 — Commit-mode text humanization selects historical paths but edits current dirty files

- **Severity:** High
- **Evidence:** `brewtools/skills/text-human/reference/flows/mixed.md:10-15`; `brewtools/skills/text-human/SKILL.md:130-146,180`
- **Trigger/state:** The user supplies a commit hash while one of that commit's paths has since changed or is dirty in the current worktree.
- **Observable outcome:** The commit determines only the file names. Agents then edit the current worktree versions in place, with no backup, potentially overwriting unrelated post-commit/user changes.
- **Blast radius:** Every selected path changed since the referenced commit.
- **Minimal fix:** Define commit mode as either read-only historical output or explicitly current-worktree mode; verify clean/index state and object identity before any edit; require explicit approval for dirty paths.
- **Two-agent confirmation:** CONFIRMED independently as TH2.
- **VERDICT:** NARROWED — narrowed claim: commit mode silently means paths-from-history / content-from-worktree, with no dirty-state or object-identity check. That, not the in-place edit itself, is the defect, and it is the part `SKILL.md:180` does NOT state.
- **SEVERITY (final):** Medium (was High)
- **WHY:** The first-pass deflation reason — "the skill states the no-backup contract at `SKILL.md:180`, therefore Medium" — is REJECTED (see `## Rejected on re-verification`): a documented destructive default is still destructive. Medium holds only because loss is bounded to uncommitted work, which git-hygienic users do not have. `flows/mixed.md:14` uses `git diff --name-only <hash>^..<hash>` — names only, no `git show <hash>:<path>`, no dirty check.
- **FIX DIRECTION (decided):** Pick one semantic and say it: either commit mode is read-only historical output (`git show <hash>:<path>` -> report), or it is explicitly current-worktree mode. In the latter case run `git status --porcelain` over the selected paths first and require explicit approval for every dirty path before spawning block agents. **This fix is a PREREQUISITE of BT-F13's, not an optional Medium** — the Medium label must not drop it.

### BT-F15 — Text optimization writes before its quality gate and lacks the promised independent verifier

- **Severity:** High
- **Evidence:** `brewtools/skills/text-optimize/SKILL.md:198-218,254-298`; `brewtools/agents/text-optimizer.md:1-8,94-121`
- **Trigger/state:** A deep/max optimization agent edits a file, then its verification finds semantic loss or the agent is invoked directly.
- **Observable outcome:** The original is already overwritten; a failed gate only warns and there is no rollback. The skill promises a spawned verification agent, but the shipped text-optimizer agent cannot spawn agents and self-verifies; the manager flow has no guaranteed independent post-return verifier.
- **Blast radius:** Claude instructions, agents, skills, and rules can retain lossy changes after a reported failure.
- **Minimal fix:** Write to a staged sibling/diff, run an independent verifier owned by the main skill, and replace the original only after passing; preserve a recoverable original on any failure.
- **Two-agent confirmation:** CONFIRMED independently as TOP1 and TOP2; combined because both defeat the same pre-publication quality gate.
- **VERDICT:** CONFIRMED — every cited fact verified verbatim; none could be broken.
- **SEVERITY (final):** High
- **WHY:** `text-optimizer.md:7` lists no `Agent`/`Task`, so `text-optimize/SKILL.md:265,289` "Spawn verification agent" is unimplementable by the very process that reads it — and `text-optimizer.md:8` makes the agent load that skill. The skill's own `Task` calls are only `:195` (Explore) and `:201` (text-optimizer): no Phase 3 verifier exists. The shipped checkpoint (`:33-38`) says outright "optimized files survive" — a progress log, not a content snapshot — and gate failure warns only (`:275`, `:296`).
- **FIX DIRECTION (decided):** **Option B** (A2 ruling) — snapshot the original to `.claude/reports/<ts>_text-optimize/orig/<path>` BEFORE the first Edit, and add a mandatory skill-owned Phase 3 that spawns a fresh verifier per file comparing original-from-disk vs current-from-disk, restoring the snapshot on a failed gate. Option A (staged `.optimized` sibling) is REJECTED: it fixes rollback only, leaves the independence half broken, and leaves the original in a context window that compaction can drop. Create the snapshot dir under `umask 077` and append `.claude/reports/` to `.gitignore` if absent (same requirement as BT-F03) — `.claude/` is not ignored by anything in a consumer repo. Interim, zero-code, ships regardless: require a clean tree over the target paths before any in-place run. Delete the unfulfillable promise at `SKILL.md:265,289`.

## P1 — correctness and reliability

### BT-F16 — Manager uninstall can delete its scripts while leaving an unresolved hook registration

- **Severity:** Medium
- **Evidence:** `brewtools/skills/manager-setup/SKILL.md:375-397,405-423`
- **Trigger/state:** Uninstall cannot parse or safely rewrite project settings.
- **Observable outcome:** The settings error is swallowed/continued, then guard/helper files are deleted. The hook row can remain and invoke a missing command on subsequent events.
- **Blast radius:** Every later hook event in that project sees repeated failures/noise until manually repaired.
- **Minimal fix:** Treat settings parse/merge failure as a hard stop before deleting any asset; verify registration absence, then delete files; rollback settings if the file cleanup fails.
- **Two-agent confirmation:** CONFIRMED independently as BT-S02.
- **VERDICT:** CONFIRMED — could not be broken.
- **SEVERITY (final):** Medium
- **WHY:** `SKILL.md:372-393` wraps the whole read-parse-filter-write in `try { … } catch {}`, then unconditionally `unlinkSync`s the guard and the off-switch and still prints `✅ wall uninstalled`. Its sibling `upgrade` already does the right thing — `:274` and `:276` both hard-ABORT with `process.exit(1)` on invalid JSON. The asymmetry is the bug.
- **FIX DIRECTION (decided):** Port `upgrade`'s contract into `uninstall`: `process.exit(1)` on parse failure BEFORE any unlink; delete the two files only after re-reading the rewritten settings and confirming the tag is gone; restore the settings entry if a delete fails. Mirror the same guard in `purge`.

### BT-F17 — Setup and status flows target mutable `$PWD` instead of a stable project root

- **Severity:** Medium
- **Evidence:** `brewtools/skills/manager-setup/SKILL.md:193-224,264-287,368-393,414-423,460-489`; `brewtools/skills/agent-deadline-setup/assets/INSTALL.md:308-345`; `brewtools/skills/agent-return-setup/assets/INSTALL.md:340-377`; `brewtools/skills/agent-router-setup/assets/INSTALL.md:368-409`; `brewtools/skills/think-short-setup/SKILL.md:98-110,186-206`; `brewtools/skills/think-short-setup/assets/INSTALL.md:300-321`
- **Trigger/state:** A setup/status/uninstall command is issued after Claude Code's persistent cwd moved into a subdirectory.
- **Observable outcome:** Skills inspect or create nested `.claude` state, report the root installation missing, or uninstall/merge the wrong settings file.
- **Blast radius:** Manager and four generated-hook setups can diverge into multiple partial installations within one repository.
- **Minimal fix:** Resolve and validate one project root at entry (Git root or explicit root setting), pass it to every embedded script, and refuse ambiguous nested `.claude` targets.
- **Two-agent confirmation:** CONFIRMED independently as BT-S03. This is separate from BT-F01: BT-F01 is a live wall bypass; this finding is installer/status mis-targeting.
- **VERDICT:** NARROWED — narrowed claim: generators, installers and status readers only. The RUNTIME hooks already resolve correctly (`agent-router.mjs:179` and `agent-deadline-guard.mjs:138` both take `cwd` then fall back to `CLAUDE_PROJECT_DIR`), so this is a generator-side regression, not a systemic one.
- **SEVERITY (final):** Medium
- **WHY:** `manager-setup/SKILL.md:200,269,316,372` all `path.join(process.cwd(), '.claude', …)`; the four `assets/INSTALL.md` use `$PWD/.claude/settings.json` (`agent-router-setup:368,563`, `think-short-setup:301`). `agent-router-setup/assets/INSTALL.md:332` even documents "run every block from the REPO ROOT" as an unenforced precondition.
- **FIX DIRECTION (decided):** Resolve one `ROOT` at entry per the D1 canonical recipe — `CLAUDE_PROJECT_DIR` -> `git rev-parse --show-toplevel` -> upward walk for `.git`/`.claude` -> `PWD`, never silent — bind it once and use it in every embedded block. A hook never exits non-zero over an ambiguous root; an installer about to WRITE aborts non-zero and names what it looked for. `input.cwd` keeps exactly one job: resolving relative paths inside `tool_input`.

### BT-F18 — Deployment monitoring can report unrelated runs or a failed external health check as success

- **Severity:** High
- **Evidence:** `brewtools/skills/deploy/SKILL.md:359-377,402-419`; `brewtools/agents/deploy-admin.md:118-127`; `brewtools/skills/deploy/references/workflow-templates.md:260-285`
- **Trigger/state:** Tag/release workflows overlap with other CI, a dispatch occurs near another run, or the final external health probe never returns 200.
- **Observable outcome:** `gh run list -L 3` and `gh run list -w ... -L 1` are not correlated to the pushed SHA/tag or dispatch run ID and are not actually looped to completion. In the template, the final health loop ends with only `::warning::`, so `if: success()` records deployment success.
- **Blast radius:** Release/deploy report, GitHub deployment status, and operator decisions can claim success for the wrong or unhealthy deployment.
- **Minimal fix:** Capture the dispatched run ID or correlate by workflow+SHA+created-after timestamp, use `gh run watch <id>`/bounded polling to terminal status, and exit nonzero after the last failed external health attempt.
- **Two-agent confirmation:** CONFIRMED independently as DEP3, DEP4, and BT-A03; deduplicated around false deployment verification.
- **VERDICT:** CONFIRMED, three halves, could not be broken.
- **SEVERITY (final):** High
- **WHY:** `workflow-templates.md:260-271` loops `for i in $(seq 1 5)` with `exit 0` only on HTTP 200; the last iteration falls through to `echo "::warning::External health check did not return 200"`, the final command of `run:`, so the step exits 0 and `:274`'s `if: success()` posts `createDeploymentStatus({state:'success'})` with `environment_url` pointing at the broken site. Skill (`deploy/SKILL.md:411,428`) and agent (`deploy-admin.md:129`) are both uncorrelated `gh run list`, even though `deploy-admin.md:107` already names `gh run watch RUN_ID`.
- **FIX DIRECTION (decided):** SPLIT RESOLVED — the WORKFLOW TEMPLATE is authoritative: it is the only half that writes a permanent artifact into a consumer repo and the only one producing a machine-readable false success. Replace the trailing `::warning::` with `echo "::error::…"; exit 1`. The skill and the agent share ONE fix: capture the run id from the dispatched SHA (`gh run list --json databaseId,headSha --jq`, or `gh api` on the dispatch) then `gh run watch <id> --exit-status` under a portable watchdog (see BT-F30). **No half closes alone.**

### BT-F19 — Plugin update ignores selection and discovered install scope, then prunes without a safe noninteractive contract

- **Severity:** Medium-High
- **Evidence:** `brewtools/skills/plugin-update/SKILL.md:64-82,135-187,202-209`; official `.claude/tmp/claude-upstream-20260815/docs/plugins-reference.md:1021-1032,1077-1095`
- **Trigger/state:** The user chooses “Update selected,” an installed plugin is project/local/managed scoped, or prune runs inside the non-TTY agent session.
- **Observable outcome:** The fixed Phase 4 chain updates all four suite plugins; no discovered `scope` is passed, so Claude Code defaults to user scope and can update the wrong instance; prune has neither `--dry-run`/approval nor `-y`, despite current CLI requiring `-y` outside a TTY.
- **Blast radius:** Wrong plugin instances are changed, explicit selection is violated, or the update flow hangs/skips pruning unpredictably.
- **Minimal fix:** Build an exact selected list, carry each plugin's discovered scope into `update --scope`, preview prune with `--dry-run --scope`, ask once on the exact removal set, then execute with `--yes`.
- **Two-agent confirmation:** CONFIRMED independently as PLU1, PLU2, and PLU3.
- **VERDICT:** NARROWED — narrowed claim: selection-ignored and scope-not-passed both hold; the destructive-prune framing is WITHDRAWN.
- **SEVERITY (final):** Medium (was Medium-High)
- **WHY:** `plugins-reference.md:1019` states prune removes only dependencies Claude Code pulled in and that "plugins you installed directly are never touched", and `:1036` says it lists orphans and asks for confirmation. The surviving halves are real: `-y` is "Required when stdin or stdout is not a TTY" (`:1031`) and the Bash tool is not a TTY, so prune hangs or fails; `--scope` defaults to `user` (`:1093`) while Phase 0 parses a per-plugin scope that Phase 4 then discards along with the user's selection.
- **FIX DIRECTION (decided):** Emit one `claude plugin update <id> --scope <discovered>` per selected row, built from the actual selection; then `claude plugin prune --dry-run --scope <s>`, show the list, and execute `claude plugin prune --scope <s> -y`.

### BT-F20 — Provider status can mutate configuration and provider verification accepts arbitrary HTTP 200 bodies

- **Severity:** Medium-High
- **Evidence:** `brewtools/skills/provider-switch/SKILL.md:23-29,121-155,249-267`; `brewtools/skills/provider-switch/scripts/detect-mode.sh:14-20,63-65`; `brewtools/skills/provider-switch/scripts/verify-providers.sh:54-70`
- **Trigger/state:** Provider-switch is invoked with no arguments/status while nothing is configured, or a provider/proxy returns HTTP 200 with an error, HTML page, empty JSON, or wrong schema.
- **Observable outcome:** A mode documented as read-only auto-proceeds into installation; token verification marks any 200 response as `STATUS=pass` even when the required assistant text is absent.
- **Blast radius:** Unexpected `~/.zshrc` mutation and false confidence that credentials/model compatibility work.
- **Minimal fix:** Keep status/no-args strictly read-only; require an explicit install action. Validate response JSON structure, assistant content, model/provider identity, and expected text before pass.
- **Two-agent confirmation:** CONFIRMED independently as PRV2 and PRV3.
- **VERDICT:** CONFIRMED, both halves — could not be broken.
- **SEVERITY (final):** Medium-High
- **WHY:** `provider-switch/SKILL.md:28` ("`status` itself is read-only and asks nothing") flatly contradicts `:154` ("Auto-install logic (MODE=status only): zero CFG -> auto-proceed to P3"), and P3/P4 write `~/.zshrc`; `detect-mode.sh:13-15` maps empty args to `status` and its terminal `else` catches every unparseable prompt, so a typo lands in an unrequested `~/.zshrc` mutation. `verify-providers.sh:59-70` prints `STATUS=pass` for any HTTP 200 — an HTML error page or `{}` passes.
- **FIX DIRECTION (decided):** Make `status` terminal — report `not configured` and print the `install` command instead of falling through. In verify, require `jq -e` on `.content[]|select(.type=="text").text` matching `OK` AND `.model` equal to the requested model; anything else is `fail`.

### BT-F21 — SSH discovery has no promised total deadline and accepts port text as SSH options

- **Severity:** Medium
- **Evidence:** `brewtools/skills/ssh/SKILL.md:74-78,192-202`; `brewtools/skills/ssh/scripts/server-discover.sh:7-25,29-118`
- **Trigger/state:** Discovery targets a slow/unreachable host, or the unvalidated port argument contains whitespace followed by SSH option syntax.
- **Observable outcome:** The skill promises a 30-second discovery bound, but the script makes many sequential `ConnectTimeout=10` calls without an outer deadline and can run for minutes. Because `$PORT` is embedded in the word-split `SSH_OPTS` string, a model/user-derived port payload is split into additional SSH options. The quoted `$CONNECTION` operand was not independently demonstrated as an injection vector and is not part of this finding.
- **Blast radius:** Long agent stalls and potentially altered SSH destination/options.
- **Minimal fix:** Apply a portable outer watchdog to the complete script; validate port as an integer in `1..65535`; use an argument array where supported and validate the separate connection operand according to the intended `user@host` grammar.
- **Two-agent confirmation:** SSH4 was CONFIRMED. SSH2 was NARROWED to the reproduced unvalidated-port vector; ordinary saved inventory values do not fail merely because `SSH_OPTS` is word-split.
- **VERDICT:** CONFIRMED and upgraded. Port injection independently reproduced with a captured-argv `ssh` stub.
- **SEVERITY (final):** Medium-High (was Medium)
- **WHY:** `PORT="22 -o ProxyCommand=/tmp/pwn -o StrictHostKeyChecking=no"` word-splits into real argv options (`server-discover.sh:10` builds the string, `:13` and `:25` expand it unquoted); `ssh_config(5)` states ProxyCommand "is executed using the user's shell `exec` directive", so this is LOCAL COMMAND EXECUTION, not option tampering. The deadline half is worse than reported: `ssh/SKILL.md:77` promises `timeout 30 bash …` and neither EXEC block (`:280`, `:494`) carries the wrapper.
- **FIX DIRECTION (decided):** Validate `PORT` as an integer in `1..65535` (`case "$PORT" in ''|*[!0-9]*) exit 2;; esac` plus a range check); build `SSH_OPTS` as a bash array and expand `"${SSH_OPTS[@]}"`; emit the promised `timeout 30` in both EXEC blocks using the portable watchdog helper from BT-F30.

### BT-F22 — Registry-token collection is model-visible and the generated execution contract does not define safe token population

- **Severity:** High
- **Evidence:** `brewtools/skills/ssh/SKILL.md:453-457`; `brewtools/skills/ssh/references/docker-auth-flow.md:65-71,104-119`; `brewtools/agents/ssh-admin.md:85-90`
- **Trigger/state:** Docker registry authentication is needed and the skill follows “Use AskUserQuestion for registry credentials.”
- **Observable outcome:** The token is supplied through the model-visible question path, while examples assume `$TOKEN`/`$GH_TOKEN`/`$REG_TOKEN` already exists without a safe mechanism that populates it. The model may embed or echo the credential in a generated command.
- **Blast radius:** Registry read/write credentials in transcript, logs, shell source, or remote command output.
- **Minimal fix:** Collect secrets outside the model, pipe them through a fixed stdin-only helper, and pass only a success/failure handle into the agent workflow.
- **Two-agent confirmation:** CONFIRMED independently as SSH5.
- **VERDICT:** CONFIRMED — with an evidence inversion corrected in this report (see `## Corrections to this report's own evidence`).
- **SEVERITY (final):** High
- **WHY:** `ssh/SKILL.md:457` is the defect verbatim ("Use AskUserQuestion for registry credentials — NEVER hardcode tokens"), and it is independently unexecutable inside `ssh-admin` because `AskUserQuestion` is removed from every subagent (D1 Q3). The agent line cited above as evidence, `ssh-admin.md:88-91`, is the CORRECT `--password-stdin` idiom. Correction to the corroborating citation: `docker-auth-flow.md:118` lists `AskUserQuestion` as one of three options ("env vars, secrets manager, **or** AskUserQuestion"), not as a mandate.
- **FIX DIRECTION (decided):** SPLIT RESOLVED — the SKILL half is authoritative and defective (`ssh/SKILL.md:457`, `docker-auth-flow.md:118,120`); the agent half is the reference the skill is corrected toward, not a second defect. Delete `AskUserQuestion` from `SKILL.md:457` and from the `docker-auth-flow.md:118` options list; source the token per D1 (user-exported env var or a `chmod 600` file, never model-visible) and pipe it to `docker login --password-stdin`, surfacing only pass/fail. Also quote `"$GHCR_TOKEN"` in the agent snippet. **No half closes alone.**

### BT-F23 — Agent-return report destinations can collide across agents and follow nested cwd

- **Severity:** Medium
- **Evidence:** `brewtools/skills/agent-return-setup/assets/agent-return-guard.mjs:37,53-68,102-103`
- **Trigger/state:** Two oversized agents of the same `agent_type` stop within the same second, or an oversized agent stops after the session cwd has moved into a nested directory.
- **Observable outcome:** Both same-second agents are told to write to the identical `.claude/reports/<timestamp>_<agent-type>/` directory, so conventional report filenames can overwrite or mix their content. Because the destination is relative, a changed cwd can also place the report under a nested `.claude/reports` instead of the project root. This does not alter the hook's retry/allow state.
- **Blast radius:** Concurrent report content and attribution, plus discoverability of reports created after a cwd change.
- **Minimal fix:** Resolve the report base from the canonical project root and include a sanitized stable invocation identifier such as `session_id + agent_id`; use a collision-resistant suffix only when those fields are absent.
- **Two-agent confirmation:** CONFIRMED independently as BT-S04.
- **VERDICT:** NARROWED — narrowed claim: the hook only emits a directive string; it never writes. A collision needs BOTH the same second AND the two agents independently choosing the same filename inside the shared directory.
- **SEVERITY (final):** Low (was Medium)
- **WHY:** `agent-return-guard.mjs:37` `REPORTS_DIR = '.claude/reports/'` is relative, `:54-60` stamps at one-second granularity, `:102` composes `${stamp}_${slug(agent_type)}/`. The cwd half is real but cosmetic. All three fields needed for the fix are already in the SubagentStop payload (`agent_id`, `agent_type`, `cwd`).
- **FIX DIRECTION (decided):** Build the base from `input.cwd` climbed to the nearest `.claude` (exactly as `agent-router.mjs:180` already does) and append a sanitized `agent_id`, falling back to `session_id` and then a random suffix.

### BT-F24 — Router root discovery can be masked by any nearer `.claude` directory

- **Severity:** Medium
- **Evidence:** `brewtools/skills/agent-router-setup/assets/agent-router.mjs:174-218,314-317,536-548`
- **Trigger/state:** A nested package, fixture, or generated directory contains `.claude` but is not the repository root.
- **Observable outcome:** The walk stops at the nearest `.claude`, hiding the actual project roster/config and changing routing decisions or disabling intended specialist selection.
- **Blast radius:** Monorepos and nested test/fixture trees.
- **Minimal fix:** Prefer an explicit root or VCS root and require the expected router config/ownership marker, not directory existence alone.
- **Two-agent confirmation:** CONFIRMED independently as BT-S05.
- **VERDICT:** CONFIRMED and escalated, with the mechanism corrected (see `## Corrections to this report's own evidence`).
- **SEVERITY (final):** High (was Medium)
- **WHY:** Reproduced: with `{"enabled":false}` at the real root, a run from a nested fixture cwd still emits `permissionDecision:"deny"` — a feature the user explicitly disabled goes on blocking spawns. The mechanism is NOT roster mis-scoring: `loadRoster(root)` is project-only, so a masked root yields an EMPTY roster and roster-scoring (`agent-router.mjs:587-600`) can never fire; the deny comes from `DEFAULT_INTENTS` (`:71-116`, consumed at `:563-584`).
- **FIX DIRECTION (decided):** Require an ownership marker, not directory existence: keep climbing unless `<cur>/.claude/brewtools/agent-router.json` exists; if no ancestor carries it, fall back to the VCS root (`.git`) and only then to `cwd`. One extra `statSync` per level, same fail-open shape. Any regression test MUST use an intent-matching prompt — a roster-only prompt does not reproduce the escalation.

### BT-F25 — Strict router mode can deny an invocation that Tier 2 correctly recognizes as skill-originated

- **Severity:** Low
- **Evidence:** `brewtools/skills/agent-router-setup/assets/agent-router.mjs:562-600`; `brewtools/skills/agent-router-setup/assets/judge-prompt.md:7-15`
- **Trigger/state:** Strict mode evaluates Tier 1 and Tier 2 in parallel; Tier 1 selects deny while Tier 2 identifies a legitimate skill-originated invocation.
- **Observable outcome:** Deny precedence wins the same call. The anti-loop marker may allow an identical retry, so this is usually one false denial rather than a persistent block.
- **Blast radius:** Strict-mode agent routing only.
- **Minimal fix:** Resolve provenance/exemptions before scoring denial, or explicitly make a positive skill-origin verdict outrank Tier 1.
- **Two-agent confirmation:** NARROWED independently as BT-S06; no broader default-mode failure is claimed.
- **VERDICT:** NARROWED on severity; disposition corrected. Narrowed claim: one spurious denial per (session, task) in an opt-in mode, documented in advance. It stays OPEN as won't-fix-with-rationale — a documented limitation lowers the class, it does not make the behaviour correct.
- **SEVERITY (final):** Low (unchanged)
- **WHY:** Hooks run in parallel and an explicit deny from any hook takes precedence (`docs/hooks.md:410,1522`), so tier 1 cannot gate tier 2. `agent-router-setup/assets/INSTALL.md:71-78` states this verbatim, including "Tier 1 therefore CANNOT gate tier 2"; the anti-loop marker lets the identical retry through; tier 2 requires `level strict` and is "wired but !=verified", so nothing exercises it today.
- **FIX DIRECTION (decided):** No code fix warranted. Pair the existing documentation with one regression test asserting the shipped behaviour is what is documented — tier-1 deny plus tier-2 allow on the same call, and the anti-loop retry passing.

### BT-F26 — Concurrent setup skills can lose settings updates through full-file read/modify/write races

- **Severity:** Medium
- **Evidence:** `brewtools/skills/agent-deadline-setup/assets/INSTALL.md:311-345`; `brewtools/skills/agent-return-setup/assets/INSTALL.md:343-377`; `brewtools/skills/agent-router-setup/assets/INSTALL.md:368-409`; `brewtools/skills/think-short-setup/assets/INSTALL.md:131-173`; `brewtools/skills/manager-setup/SKILL.md:221-224,284-287,385-387`
- **Trigger/state:** Two setup/install/uninstall operations update `.claude/settings.json` concurrently.
- **Observable outcome:** Each reads an old full document and later renames its own replacement; the last writer can erase the other skill's valid merge. Shared temporary-name races can also produce spurious rename failures.
- **Blast radius:** Hook registrations and permissions across the five setup surfaces.
- **Minimal fix:** Serialize updates with a project lock, re-read under lock immediately before merge, use unique temp files, and verify all owned rows after rename.
- **Two-agent confirmation:** NARROWED independently as BT-S07: lost updates and rename failures are supported; persistent truncation was not proven and is not claimed.
- **VERDICT:** NARROWED — narrowed claim: the unlocked read-modify-write lost update stands and is reproduced; the shared-temporary-name / rename half is REFUTED for 4 of the 5 cited surfaces.
- **SEVERITY (final):** Medium
- **WHY:** Router, return, deadline and think-short INSTALL blocks contain zero `.tmp` and zero `renameSync` — every settings mutation is a plain `fs.writeFileSync`. Only `manager-setup` uses a fixed-name temp plus rename (`SKILL.md:221-224,284-287,385-387`), and it targets `settings.local.json`, a DIFFERENT file from the other four's `settings.json`, so no cross-skill temp collision is possible; the repo's runtime hooks already build pid-scoped temps. One scoping correction: think-short's GLOBAL variant targets `~/.claude/settings.json` (`assets/INSTALL.md:133,300`), so it races the router only when installed in PROJECT mode.
- **FIX DIRECTION (decided):** Per-block `O_EXCL` lock (`mkdirSync(f+'.lock')` retry loop, stale-break by mtime), re-read INSIDE the lock, merge, write, verify, release in `finally`. One paste per merge block; no new file. Do not spend effort on the refuted rename half.

### BT-F27 — Task-board doc sweep assigns parallel agents shared mutable IDs/files

- **Severity:** Medium
- **Evidence:** `brewtools/skills/task-board-setup/references/06-doc-sweep.md:9-45,49-61`
- **Trigger/state:** Multiple migration agents independently scan, mint task IDs, and write the same board/spec tree in parallel.
- **Observable outcome:** Agents can allocate duplicate IDs, overwrite each other's file updates, or integrate stale results because there is no atomic allocator or single-writer merge phase.
- **Blast radius:** Task identity, cross-links, and completion state across a migrated board.
- **Minimal fix:** Make parallel agents read-only producers; centralize ID allocation and final writes in one deterministic merge step, or partition disjoint file/ID namespaces.
- **Two-agent confirmation:** CONFIRMED independently as BT-S08.
- **VERDICT:** CONFIRMED — mechanically real, verified verbatim.
- **SEVERITY (final):** Low (was Medium)
- **WHY:** `06-doc-sweep.md:45` mints IDs with a `Glob` uniqueness check — textbook check-then-act with no allocator — and `:43` folds a duplicate into a file a sibling slice owns, contradicting the per-slice write scoping. But the blast radius is a one-shot migration, and the single-writer integrate step (`:53`, `:61`) re-globs the real tree and explicitly does "not trust manifests blindly", so `board.md` never diverges from disk.
- **FIX DIRECTION (decided):** Give each sweep agent a disjoint ID prefix segment and forbid cross-slice folding — an agent that spots a duplicate REPORTS it in its manifest and the orchestrator folds it in the integrate step it already runs. Prompt edit only, no new machinery.

### BT-F28 — Think-short follows predictable shared `/tmp` symlinks

- **Severity:** Medium
- **Evidence:** `brewtools/skills/think-short-setup/assets/think-short-session.mjs:19-22,40-68`; `brewtools/skills/think-short-setup/assets/think-short-prompt-counter.mjs:19-22,40-58`
- **Trigger/state:** Another local process pre-creates the predictable shared temp root or marker/counter path as a symlink.
- **Observable outcome:** Marker creation/truncation can follow the link and affect an attacker-chosen file; pruning follows the shared root. Cleanup is restricted to matching counter filenames, so arbitrary recursive deletion was not established.
- **Blast radius:** Same-user local files writable through the symlink target.
- **Minimal fix:** Use a private `0700` per-user/per-session directory, reject symlinks with `lstat`, create files with exclusive/no-follow semantics, and verify ownership/mode.
- **Two-agent confirmation:** NARROWED independently as BT-H07; the report does not claim unrestricted deletion.
- **VERDICT:** CONFIRMED as narrowed, severity corrected downward on blast radius.
- **SEVERITY (final):** Low-Medium (was Medium)
- **WHY:** Independently reproduced with a planted `TMPDIR` symlink — the victim `sess-123.think-short-counter` went 14 bytes to 1, a stale `old-sess.think-short-counter` was deleted by `pruneStaleMarkers`, `secrets.txt` was untouched, and the hook still exited 0. Downgrade reason: the truncation target must be NAMED `<session_id>.think-short-counter` and `session_id` is an unguessable Claude Code UUID, so the truncation half is not attacker-steerable. What IS steerable with no guess: file creation inside an attacker-chosen directory, plus deletion of any `*.think-short-counter` older than a day there.
- **FIX DIRECTION (decided):** Lift `ensureStateRoot()` plus the per-file `lstat`/uid guard out of `agent-router.mjs:357-375,405` verbatim into both think-short hooks (`mkdirSync mode 0o700` -> `lstatSync` -> reject on `st.uid !== UID` -> `chmodSync 0700` -> assert `(st.mode & 0o077) === 0`); skip counting on failure, since `bumpCounter` already fails open. Additive, matches an existing in-repo convention.

### BT-F29 — Text optimizer's multi-file and semantic-loss gates are weaker than its safety claims

- **Severity:** Medium
- **Evidence:** `brewtools/skills/text-optimize/SKILL.md:127,173-221,242-275,288-298`; `brewtools/agents/text-optimizer.md:107-121`; `brewtools/skills/text-optimize/scripts/test-optimize.sh:20-154`
- **Trigger/state:** Multiple files are optimized in parallel, deep mode reaches 95% aggregate semantic match, or regressions occur in actual rewrite behavior.
- **Observable outcome:** Per-file agents cannot maintain a global D.5 ownership ledger, so cross-file dedup can leave dangling ownership/pointers. A 95% aggregate gate can still lose one critical prohibition; deep mode ultimately warns rather than refuses publication. Existing tests check file existence and grep for phrases but never execute optimization or assert semantic/reference preservation.
- **Blast radius:** LLM-loaded project rules and multi-file prompt systems, especially when a small number of load-bearing constraints are hidden in a large fact inventory.
- **Minimal fix:** Centralize the cross-file fact/ownership ledger, require 100% preservation for prohibitions/scope/security/path/version facts in every lossy mode, and add fixture-driven behavior/reference tests with staged output.
- **Two-agent confirmation:** BT-A06 was NARROWED: the risk is that the accepted 5% can contain one critical rule, not that every 95% result is bad. TOP3 was NARROWED: global D.5 coordination is missing, not inherently impossible. TOP4 was CONFIRMED.
- **VERDICT:** NARROWED as stated — narrowed claim: (a) cross-file D.5 coordination is missing, not impossible; (b) the 95% budget can contain one critical rule; (c) the test gap is unqualified.
- **SEVERITY (final):** Medium
- **WHY:** (c) verified hardest and is the load-bearing half: `text-optimize/scripts/test-optimize.sh` is 165 lines containing ZERO invocations of node, python, bash or any optimizer — every assertion is `[[ -f ]]` or `grep -q` over the skill's own prose, so none of these gates has ever been exercised. (a) and (b) re-read as cited and hold.
- **FIX DIRECTION (decided):** Hoist D.5 to the orchestrator as a dedup DECISION LIST naming the single owning file per duplicated fact, which per-file agents merely execute; extend Max's 100% sub-gate to Deep and turn a sub-gate failure into a refusal-to-write (report, leave the file untouched) rather than a warning; add one end-to-end fixture that actually optimizes `tests/input-claude-md.md` and asserts every number, path and `!=` prohibition survives.

### BT-F30 — GNU `timeout` is assumed despite the macOS target

- **Severity:** Medium
- **Evidence:** `brewtools/skills/deploy/SKILL.md:66-69,359-363,402-411,423-446`; `brewtools/skills/deploy/scripts/deploy-local-ops.sh:127-129`; `brewtools/skills/deploy/scripts/workflow-discover.sh:42-53`
- **Trigger/state:** The deploy skill runs on stock macOS without GNU coreutils `timeout`.
- **Observable outcome:** Discovery, monitoring, and dispatch commands fail as if GitHub operations were unavailable; some fallback branches report unknown or failed instead of executing their intended check.
- **Blast radius:** Most deploy/release monitoring operations on the plugin's primary local platform.
- **Minimal fix:** Provide a portable watchdog helper (Node/Perl/Python or detected `gtimeout`), test both Darwin and Linux paths, and distinguish missing watchdog from remote command failure.
- **Two-agent confirmation:** CONFIRMED independently as DEP5.
- **VERDICT:** CONFIRMED and escalated. Reproduced twice.
- **SEVERITY (final):** High (was Medium)
- **WHY:** Under `PATH=/usr/bin:/bin:/usr/sbin:/sbin` the deploy scripts report `WF_STATUS=api_unavailable`, `LAST_RUN=unknown` and `FAILED trigger`; the sharper repro — a PATH carrying a working `gh` (2.88.1) but no coreutils — gives the identical three misreports, isolating the fault to the missing watchdog rather than to `gh`. `timeout` on macOS is Homebrew-only, and `rg 'gtimeout|command -v timeout|uname'` over `brewtools/skills/deploy/` returns ZERO hits. Worst shape at `SKILL.md:405`: `FAILED trigger` printed for a dispatch that was never attempted.
- **FIX DIRECTION (decided):** One `ght()` helper sourced by both scripts and referenced by `SKILL.md` — `timeout` -> `gtimeout` -> run bare — plus a distinct `no_watchdog` sentinel so a missing watchdog never renders as `api_unavailable` or `FAILED`. Test both Darwin and Linux paths. BT-F21's promised `timeout 30` reuses this helper.

### BT-F31 — The generic SSH Compose template deploys a mutable `latest` tag

- **Severity:** Medium
- **Evidence:** `brewtools/agents/ssh-admin.md:92-101`; contrast the correct deployment rule at `brewtools/agents/deploy-admin.md:168-175`
- **Trigger/state:** The SSH administrator uses its shipped generic Compose resource-limit example as the basis for a server deployment.
- **Observable outcome:** The server pulls `myapp:latest`; a later pull, restart, or rollback can resolve to a different build without any Compose-file change. This finding is limited to the generic SSH template: the deploy administrator separately requires an exact deployed tag.
- **Blast radius:** Deployments derived from this fallback/template, including rollback reproducibility and incident recovery.
- **Minimal fix:** Parameterize the example with a required immutable tag or digest, such as `${IMAGE_TAG:?set an immutable image tag}`, and retain `latest` only as an explicitly non-deployed convenience tag.
- **Two-agent confirmation:** NARROWED independently as BT-A05; no claim is made that every BREWTOOLS deployment uses `latest`.
- **VERDICT:** CONFIRMED as scoped — one agent snippet, template text only.
- **SEVERITY (final):** Low (was Medium)
- **WHY:** `ssh-admin.md:97` is the agent's ONLY compose `image:` line and the file carries no pinning guidance whatsoever, while `deploy-admin.md:175` states the opposite rule. Squarely against global `avoid.md` #4. Correctly scoped away: `workflow-templates.md:48` emits `:latest` as an ADDITIONAL build tag alongside `${VERSION}`, the convenience use `deploy-admin.md:175` permits (it is instead swept up by BT-F09).
- **FIX DIRECTION (decided):** Two-line edit to `ssh-admin.md`: `image: myapp:${IMAGE_TAG:?set an immutable image tag}` in the snippet, plus a one-line blockquote mirroring `deploy-admin.md:175` so the agent carries the rule, not just the example.

## Corrections to this report's own evidence

Where re-verification contradicted a citation or a mechanism stated above, the correction below is binding; the original text is left in place as the audit trail.

1. **BT-F01 is worse than reported.** The self-exempt check at `hardmode-guard.mjs:308` runs BEFORE the level branch, so a planted `hooks/lib/manager-state.mjs` can set `hard=false` at `level strict` — permanently disarming the wall, not merely passing one command. Vector A (nested `cwd`) is likewise level-independent and lets `rm -rf /` through at `strict`. Vector C is NARROWER than implied: `timeout`, `xargs`, `nice` and `nohup` are already denied, but only incidentally — they are absent from `READONLY_BASE`. The hole is `env` specifically (whitelisted AND a wrapper) plus flag-level exec inside whitelisted binaries (`rg --pre`). The fix must therefore be a strict default-deny allowlist with per-binary flag vetting, **not** a wrapper denylist, which re-opens the hole the moment anyone adds a "read-only" binary that happens to exec.
2. **BT-F02 — no model-invisible channel exists for a RUNTIME-supplied secret.** Plugin `userConfig` with `"sensitive": true` is real (`plugins-reference.md:559,579`) but fires only at plugin-enable time (`:531`) and is deliberately non-substitutable into skill/agent content (`:565` — only NON-sensitive values may be substituted there); it reaches hooks/MCP/LSP as `CLAUDE_PLUGIN_OPTION_<KEY>` and nothing else. `AskUserQuestion` has no masked field at all (`npm/package-2.1.233/sdk-tools.d.ts:855-885` — the input is a fixed 2-4 option set whose answer returns to the transcript). Binding fix: the user sets `export VAR=...` or writes a `chmod 600` file out of band, and the skill reads `$VAR` inside a Bash step without echoing it. Additional live defect in the same skill: `provider-switch/SKILL.md:199-201` warns that argv is visible to `ps` and written verbatim into the transcript, and `:205` then has the model paste the key into a Bash command.
3. **BT-F03 blast radius** — `.claude/reports/` is not ignored by anything in this repository; it is invisible only because of this user's personal `~/.gitignore_global`. In a consumer repo the report is committable.
4. **BT-F11's root line is `claude-local-ops.sh:121`, not `:140-143`.** `:140-143` is the insertion block that consumes the flag; `:121` is where `AFTER_SEPARATOR` flips on the first `|---` line in the file. A second cwd-relative defect sits alongside it: `:7` `LOCAL_FILE="CLAUDE.local.md"` is relative, so running the script from a subdirectory silently creates or edits a stray file — the same raw-cwd class as BT-F01.
5. **BT-F13 is broader than "Makefiles in commit mode".** `flows/mixed.md:26`'s path-mode filter explicitly includes `*.py`, so tab/space rewriting reaches Python in BOTH modes.
6. **BT-F22 cited SAFE code as evidence.** `brewtools/agents/ssh-admin.md:88-91` is the CORRECT `--password-stdin` idiom, not a defect; the defect is `ssh/SKILL.md:457`. Corroborator corrected: `docker-auth-flow.md:118` lists `AskUserQuestion` as one of three options, not as a mandate.
7. **BT-F24's mechanism is not what this report says.** The deny does not come from roster mis-scoring — a masked root yields an EMPTY roster, so roster-scoring (`agent-router.mjs:587-600`) can never fire. It comes from `DEFAULT_INTENTS` (`:71-116`, consumed at `:563-584`). Any regression test must use an intent-matching prompt; a roster-only prompt does not reproduce.
8. **BT-F26's rename/temp-name half is REFUTED for 4 of 5 surfaces.** Router, return, deadline and think-short use plain `writeFileSync` with no temp and no rename; only `manager-setup` renames, and onto `settings.local.json` — a different file from the other four's `settings.json`. The lost-update half stands.
9. **BT-F28's blast radius is bounded.** The truncation target must be named `<session_id>.think-short-counter`, and `session_id` is an unguessable Claude Code UUID.
10. **`brewtools/hooks/agent-return-guard.mjs` does not exist.** `brewtools/hooks/` holds only `hardmode-guard.mjs`, `manager-prompt.mjs`, `session-start.mjs`, `hooks.json` and `lib/`. The return guard ships solely as `brewtools/skills/agent-return-setup/assets/agent-return-guard.mjs`, which is what BT-F23 and BT-N02 were verified against.
11. **A2 ruling for BT-F15: Option B**, not Option A. The disk snapshot plus a skill-owned verifier phase is decided; the staged `.optimized` sibling is rejected because it fixes rollback only and leaves the original in a context window compaction can drop. The snapshot directory must be created under `umask 077` and `.claude/reports/` appended to `.gitignore`.

## New findings from re-verification

Two defects surfaced during re-verification that are not covered by BT-F01..BT-F31. Both are Low and both are one-line-class fixes.

### BT-N01 — Manager uninstall deregistration drops the whole matcher group on a basename substring match

- **Severity:** Low
- **Evidence:** `brewtools/skills/manager-setup/SKILL.md:372-387` (read + filter + `renameSync`); registration shape at `:216`
- **Mechanism:** The filter tests `h.command.includes(TAG) || h.command.includes('hardmode-guard.mjs')` and drops the ENTIRE `PreToolUse` matcher group when ANY hook inside it matches. Two harms: a hand-registered or sibling-project guard sharing the basename is silently deleted, and any unrelated hook co-located in the same matcher entry goes with it. This is the same substring-matching class BT-F01 was already faulted for. Compounded by BT-F17 — the target is `process.cwd()/.claude/settings.local.json`, which may not be the project root.
- **Fix direction:** Match on the `brewtools-manager-guard` TAG only (drop the basename fallback); remove only the matching hook object, not the whole matcher group; drop the group only once it is empty.

### BT-N02 — `agent-return-budget.mjs` has its root-resolution operands reversed, making the env fallback dead code

- **Severity:** Low
- **Evidence:** `brewtools/skills/agent-return-setup/assets/agent-return-budget.mjs:69-82`, root line `:74`
- **Mechanism:** `let dir = process.cwd() || process.env.CLAUDE_PROJECT_DIR;` — `process.cwd()` is never falsy, so the fallback is unreachable. Worse than first reported: unlike its siblings this `loadConfig()` takes NO `cwd` parameter, so `CLAUDE_PROJECT_DIR` was its ONLY route to the real project root; today it has none and depends entirely on the ancestor climb. The siblings are correct because they receive an explicit cwd first (`agent-deadline-guard.mjs:138`, `agent-router.mjs:179`).
- **Fix direction:** `let dir = process.env.CLAUDE_PROJECT_DIR || process.cwd();` — one-token swap, keeps the climb as-is.

## Explicit rejected and non-findings

The following items are intentionally **not** findings and must not be carried into implementation planning:

1. **BT-S09 (`shell: bash`) — rejected.** Current official behavior applies the field to dynamic `!` command execution, not ordinary prose Bash blocks. The reviewed skills do not use that dynamic form, so no runtime incompatibility was established.
2. **Cross-hook deadline-cleanup interaction — rejected.** The proposed harmful interaction between deadline cleanup and the neighboring return hook was not reproduced; their current outputs/ownership do not establish the claimed failure.
3. **Persistent settings-file truncation — not claimed.** BT-S07 supports lost concurrent updates and spurious rename failures only.
4. **Unrestricted think-short deletion — not claimed.** BT-H07 supports predictable-root/marker symlink following; cleanup is limited to matching counter files.
5. **Universal SSH option injection — not claimed.** SSH2 is conditional on unvalidated model/user-derived operands; ordinary validated inventory values are not inherently unsafe.
6. **Guaranteed loss at 95% semantic match — not claimed.** BT-A06 identifies an insufficient critical-fact gate, not proof that every passing optimization loses meaning.

All other pass-one suspicions without two-agent agreement were omitted rather than listed as speculative concerns.

## Directly preventive tests

Add only tests that close a confirmed gap:

1. Hard-mode adversarial matrix: nested cwd, fake helper suffix, `env`, `rg --pre`, and misleading MCP server/tool names.
2. Settings mutation fault tests: malformed JSON, concurrent installers, failed rename, uninstall after merge failure, and preservation of foreign settings keys.
3. Current-model compatibility test with task tools disabled, plus ordinary foreground/background subagent tool-pool assertions proving `AskUserQuestion` is absent.
4. Release tests in a dirty temp repository with unrelated tags, simulated push failure, exact staged-file assertions, and run-ID/SHA correlation.
5. Workflow-template injection fixtures using quotes, newlines, command substitutions, and JavaScript delimiters in every GitHub-derived input.
6. SSH fixtures: GitHub table before SSH table, malicious/invalid host and port, full discovery wall-clock bound, fingerprint approval, and a hardening sequence that proves a second login before disabling the old one.
7. Provider tests: quote/newline key input without model exposure, no `eval`, arbitrary HTTP-200 error bodies, and strict read-only status/no-args behavior.
8. Plugin-update tests for selected subset, user/project/local/managed scopes, prune dry-run approval, and non-TTY `--yes` behavior.
9. Secrets-scan coverage invariant: every assigned file must appear exactly once in scanned/skipped; malformed agent JSON fails the run; reports contain only redacted fingerprints; current/history claims remain separate.
10. Text-human semantic fixtures covering Unicode literals, regexes, Python/Makefile indentation, and dirty paths selected from an older commit.
11. Text-optimize end-to-end fixtures with staged writes, independent verification, 100% critical-fact preservation, cross-file ownership/pointer checks, and rollback on failed gates.
12. Setup root tests invoking every setup/status/uninstall from nested cwd and from a nested unrelated `.claude` directory.
13. Concurrency identity tests for same-second/same-type agent returns and parallel task-board ID allocation.
14. Symlink tests for think-short root and marker paths with ownership/mode assertions.
15. Darwin CI without GNU coreutils to exercise deploy watchdog fallbacks.
16. Template lint or fixture validation rejecting mutable deployed image references such as `image: ...:latest`.

## Recommended implementation order

1. **Credential containment:** BT-F02, BT-F03, BT-F04, BT-F22.
2. **Enforcement integrity:** BT-F01, BT-F05, BT-F06, BT-F07.
3. **Release and CI safety:** BT-F08, BT-F09, BT-F18, BT-F30.
4. **SSH safety:** BT-F10, BT-F11, BT-F12, BT-F21, BT-F31.
5. **Rewrite-tool data integrity:** BT-F13, BT-F14, BT-F15, BT-F29.
6. **State/config correctness:** BT-F16, BT-F17, BT-F23 through BT-F28.
7. **Operator correctness:** BT-F19 and BT-F20.

After each group, rerun the existing suites plus the directly preventive tests above. Do not broaden the fixes into a framework: each defect has a small local boundary (canonical root, exact identity/argv validation, staged write, explicit scope/run ID, secure stdin, or single-writer merge) that is sufficient.

## Rejected on re-verification

No BT finding was refuted outright — all 31 survive as CONFIRMED or NARROWED. What is rejected here is **reasoning**, not findings: two premises this report relied on are overturned by the evidence, while the findings they supported stand on different grounds. Both must be struck so nobody re-derives the original conclusion from them.

### Rejected premise — BT-F09: "no untrusted-input trigger, therefore not exploitable"

- **Rejected claim:** the workflow templates ship no `pull_request` trigger, so `github.*` expressions interpolated into `run:` have no untrusted source.
- **Refutation evidence:** `brewtools/skills/deploy/references/workflow-templates.md:431` DOES ship a `pull_request` trigger.
- **Why the finding still holds at Medium:** the only sink reachable under that trigger is `github.ref_name`, which for a pull_request event is the sanitized `<number>/merge` form, not attacker text; that job exposes no secrets, and the token on a fork PR is downgraded to read-only. So the trigger exists but the exploit does not. BT-F09 holds as a latent-injection / hardening defect — the templates teach the unsafe interpolation idiom and consumers extend them — not as a live RCE.
- **Bonus citation corrected in the same finding:** the floating `default: "latest"` is at `workflow-templates.md:126`, not `:115`, and `:48` pushes a second floating `:latest` tag that the original text missed.

### Rejected reasoning — BT-F14: "the contract is stated at `SKILL.md:180`, therefore deflate"

- **Rejected claim:** because the destructive behaviour is documented in the skill, the finding deflates.
- **Refutation evidence:** documentation is not mitigation. A documented destructive DEFAULT is still a destructive default; the operator hits it before reading `SKILL.md:180`, and no confirmation gate stands between the two.
- **Why the finding still holds at Medium:** severity is bounded by blast radius, not by documentation — loss is limited to UNCOMMITTED work in the target tree, which is what keeps it out of High.
- **Dependency recorded:** BT-F14's fix is a PREREQUISITE of BT-F13's, not an independent nice-to-have. BT-F13's staged-rewrite fix is only safe once the destructive default is gated; closing BT-F13 alone leaves the exposure intact.
