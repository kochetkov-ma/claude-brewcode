# Final BREWDOC Review

**Review date:** 2026-08-15  
**Product baseline:** Claude Code 2.1.233  
**Disposition:** Review-only. No fixes were applied.  
**Consensus rule:** Every retained finding below was independently confirmed by two agents. Any item that lacked two-agent confirmation was excluded.

## Executive verdict

BREWDOC works, but its operational paths contain **15 confirmed defects worth fixing**: 2 High, 9 Medium, 3 Low-Medium, and 1 Low. The highest-priority risks are concentrated in `/brewdoc:publish`: directory publishing can upload private project material, and several prompt-derived values are interpolated into executable shell source. The next cluster is docsync reliability: its hooks confuse the mutable working directory with the project root, share state across concurrent sessions, can leave broken registrations during failed lifecycle operations, and generate a Windows-incompatible hook command.

The remaining findings are bounded but real: memory-sync omits recursively supported rules and agents and mislabels mixed Git visibility; md-to-pdf suppresses the result fields it later needs, ignores parts of its saved style configuration, loses relative images, uses a collision-prone preprocessing file, and can install packages into the wrong Python; my-claude can write into a nested package instead of the project root.

This is not a recommendation for a redesign. Each finding has a small, direct correction. No UI issue, documentation-only discrepancy, Codex projection, speculative hardening idea, or style preference appears in the ledger.

## Re-verification summary

Re-verified 2026-08-16 against tree `main` @ v5.7.0, first pass (`V12`, `V13`) then an adversarial double-check briefed to refute (`D1-crosscutting`, `D6-brewtools-b-brewdoc`). Where the two disagree the adversarial ruling controls; where a D-file defers with `SEE-D1`, the upstream fact comes from `D1-crosscutting`.

**Verdicts:** CONFIRMED 12 (BD01, BD02, BD03, BD04, BD05, BD08, BD09, BD10, BD11, BD13, BD14, BD15) · NARROWED 3 (BD06, BD07, BD12) · REFUTED 0. Two sub-claims were rejected without taking their findings down — see `## Rejected on re-verification`.

**Final severity:** High 2 (BD01, BD02) · Medium 5 (BD03, BD04, BD06, BD10, BD11) · Low-Medium 5 (BD05, BD07, BD08, BD12, BD15) · Low 3 (BD09, BD13, BD14). One new finding, BD-N03, enters at Medium-High.

**Severity changes:**

| ID | Was | Final | Direction |
|----|-----|-------|-----------|
| BD05 | Medium | Low-Medium | down — blast radius is a missed reminder, not documentation damage |
| BD07 | Medium | Low-Medium | down — the rules half of the claim is unsupported; only the agents half is upstream-backed |
| BD08 | Low-Medium | Low-Medium | unchanged, but the mechanism is broader than reported (one tracked row anywhere labels all three surfaces) |
| BD12 | Medium | Low-Medium | down, and the first pass's "not reachable in normal use" narrowing is OVERTURNED; stays first in its cluster |
| BD13 | Low-Medium | Low | down — split history in one project's generated reports, no source touched |
| BD14 | Low-Medium | Low | down — `set -euo pipefail` already aborts on a failing `pip3`; only the silent wrong-interpreter success remains |
| BD15 | Medium, Windows-only | Low-Medium | down — needs Windows *without* Git Bash, not Windows generally |

## Evidence lock

The review is locked to the following upstream state:

- Installed runtime: `claude --version` -> `2.1.233 (Claude Code)`.
- Downloaded npm artifact: `.claude/tmp/claude-upstream-20260815/npm/anthropic-ai-claude-code-2.1.233.tgz`.
- Artifact identity: `@anthropic-ai/claude-code` version `2.1.233`; SHA-256 `8374c351e69df31b77b56464a90be6b468bc77cba7ee9c1f86570178fafd5f3e`.
- Claude Code upstream snapshot: `.claude/tmp/claude-upstream-20260815/claude-code` at commit `0fa8c19d50f70f9f383fb6ff5ce5209575267d21`, committed `2026-08-14T22:20:50Z`.
- Official plugins snapshot: `.claude/tmp/claude-upstream-20260815/claude-plugins-official` at commit `09041ee686e7ba8be1b5b34a0852959991481cce`, committed `2026-08-15T13:48:26-05:00`. The only post-review delta from `263bb97c0d28fa15b411af908694964616524396` is an unrelated SumUp marketplace dependency-pin bump.
- Official skills snapshot: `.claude/tmp/claude-upstream-20260815/skills` at commit `f6656c1256d5a8adfa37db9110046ef20bac644c`, committed `2026-08-13T11:09:54-07:00`.
- Current official hook, skill, plugin, settings, and subagent references under `.claude/tmp/claude-upstream-20260815/docs/`, including `hooks.md`, `skills.md`, and `sub-agents.md`.

When local behavior and an older local claim conflicted, the current official source and reproducible runtime behavior controlled the verdict.

## Scope

Included operational surfaces:

- `brewdoc/skills/publish/SKILL.md`
- `brewdoc/skills/docsync-setup/SKILL.md` and its executable hook assets
- `brewdoc/skills/memory-sync-setup/SKILL.md` and `scripts/generate.sh`
- `brewdoc/skills/md-to-pdf/SKILL.md`, `scripts/check_deps.sh`, `scripts/md_to_pdf.py`, and runtime style assets
- `brewdoc/skills/my-claude/SKILL.md`

Excluded:

- UI and presentation-only behavior
- README, website, and documentation-only prose unless it directly supplied executable skill instructions
- all Codex projections, compatibility files, and Codex-specific behavior
- implementation, cleanup, release, or external publishing changes
- unconfirmed hypotheses and general best-practice suggestions without a concrete failure state

## Validation performed

- Checked the installed Claude Code version, upstream commits, npm package identity, and artifact digest.
- Compared docsync schemas and path behavior with the current official hook reference.
- Reproduced docsync from a nested current working directory: the root configuration was bypassed and a nested `.claude/docsync/state.json` was created.
- Reproduced two docsync sessions sharing one state file: the second session replaced the first session's touched set, and the first session's Stop hook returned no finding.
- Demonstrated shell evaluation without network access: command substitution inside a custom password and an apostrophe-containing JSON value executed; an inline `BREWPAGE_EOF` line terminated the content heredoc and allowed subsequent shell text to run.
- Ran md-to-pdf against `/dev/null`: quiet mode returned success with no structured fields; non-quiet mode returned `STATUS`, `OUTPUT`, `PAGES`, `SIZE`, and `ENGINE`.
- Exercised ReportLab page configuration: requested A4, Letter, and Legal all produced the same A4 media size.
- Exercised ReportLab relative-image resolution from two working directories: the same valid image reference was omitted from repository root and resolved only after changing into the Markdown file's directory.
- Compared memory-sync's actual traversal with Claude Code 2.1.233 recursive rule and agent discovery.
- Verified that this host's `python3` and `pip3` currently point to the same Homebrew Python 3.14 installation; BD14 is therefore a portable installer defect, not an active failure on this host.
- Confirmed validation changed no plugin source files; only the review report artifacts were added.

## Confirmed findings

### BD02 — Prompt-derived values are inserted into executable shell source

**Severity:** High  
**Confirmation:** Confirmed by two independent agents (2/2)  
**Evidence:** `brewdoc/skills/publish/SKILL.md:131-141`, `:164-172`, `:202-205`, `:235-237`, `:268-274`, `:308-311`

**Trigger/state:** A custom password contains shell syntax; inline JSON contains an apostrophe followed by shell syntax; inline text contains a line equal to `BREWPAGE_EOF`; or a prompt-derived path/query value contains shell metacharacters.

**Actual outcome:** The skill asks the model to substitute these raw values directly into Bash source. Double quotes still evaluate command substitutions, the JSON block can be broken out of its single-quoted literal, and a quoted heredoc prevents expansion inside the body but does not prevent a matching delimiter line from terminating the body. The injected shell text executes with the Bash tool's permissions before or during publishing.

**Blast radius:** Local files, commands, credentials available to the Claude Code process, and the integrity/confidentiality of the external publish operation. Invocation is manual, so this is High rather than Critical; untrusted content copied into a publish request is still sufficient to reach the defect.

**Minimal fix:** Ship one small publish helper that accepts a structured request through JSON stdin or fixed argv fields and constructs the HTTP request without generating shell source. Validate namespace, TTL, and entry as data. Do not interpolate password, content, JSON, or paths into a Bash template.

**VERDICT:** CONFIRMED  
**SEVERITY (final):** High  
**WHY:** All three vectors re-fired independently — `X-Password: p$(id -un)x` -> `pmaximusx`, `-d '{"a":"it'$(id -un)'"}'` -> `{"a":"itmaximus"}`, and a `BREWPAGE_EOF` line inside `{content}` closed the heredoc and executed the next line; aggravated by `SKILL.md:8` `model: haiku`, so the weakest model in the suite performs the hand-substitution of untrusted text into shell source.  
**FIX DIRECTION (decided):** Local fix, not the helper: `Write` content/JSON/password to files, then `CONTENT=$(cat "$F")`, `curl -d @"$F"`, `PW=$(cat "$F")` + `-H "X-Password: $PW"` (double-quoted parameter expansion does not re-execute substitutions); validate `ns` (`^[A-Za-z0-9-]{3,32}$`), `days` (integer) and `entry` (basename) as data; add `Write` to `allowed-tools`. The new-helper redesign is rejected — the local fix is provably sufficient.

### BD01 — Directory publishing archives private and irrelevant project material

**Severity:** High  
**Confirmation:** Confirmed by two independent agents (2/2)  
**Evidence:** `brewdoc/skills/publish/SKILL.md:74-78`, `:268-275`, `:308-311`

**Trigger/state:** The selected site directory contains `.env`, `.git/`, dependency directories, private caches, source maps, credentials, or other files not intended for the public bundle.

**Actual outcome:** `(cd "{directory_path}" && zip -r "$TMPZIP" .)` archives every directory entry and uploads it immediately. The pre-publish display shows only a count and total size, not the archive manifest. A supplied ZIP is likewise uploaded without inspection.

**Blast radius:** Everything beneath the chosen directory can be disclosed to brewpage.app and to anyone who can access the resulting site. A repository-root or application-root selection can expose credentials and version-control history.

**Minimal fix:** Apply a short default exclusion set for VCS, dependency, environment, and cache material; print the final archive manifest; ask for review only when sensitive or unusual entries remain. Do not build a generic packaging framework.

**VERDICT:** CONFIRMED  
**SEVERITY (final):** High  
**WHY:** Reproduced: `zip -r` over a fixture archived all 7 entries including `.env` (`API_KEY=sk-live-…`), `.git/config`, `node_modules/pkg.js` and `app.js.map`, while Step 3 showed only `site · N files · <size>`; the supplied-ZIP branch uploads with no inspection at all, and today that branch is the live disclosure route because the directory branch is dead (BD-N03).  
**FIX DIRECTION (decided):** Default exclude set on the zip line (`.git/*`, `.env`, `node_modules/*`, `.DS_Store`, `*.map`), `unzip -l "$TMPZIP"` manifest printed BEFORE `curl`, same manifest for the supplied-ZIP branch, confirmation only when a still-included entry matches a sensitive pattern. Must land together with BD-N03 — repairing BD-N03 alone arms the directory disclosure path.

### BD03 — Owner credentials rely on cwd and an unenforced ignore convention

**Severity:** Medium  
**Confirmation:** Confirmed by two independent agents (2/2), narrowed to portable behavior  
**Evidence:** `brewdoc/skills/publish/SKILL.md:143-178`, `:188-211`, `:221-243`, `:253-283`, `:293-319`, `:326-338`; official persistent plugin data substitution at `.claude/tmp/claude-upstream-20260815/docs/skills.md:401`

**Trigger/state:** A user runs the distributed skill in a project without a personal/global `.claude/` ignore, or runs it after moving the current working directory into a nested package.

**Actual outcome:** Token-bearing history is written to cwd-relative `.claude/brewpage-history.md` in plaintext. The instruction says to keep it private but neither enforces ignore status nor restrictive permissions. From a nested cwd, a second history file can be created below the project. The owner token permits deletion and in-place replacement of published content.

**Blast radius:** Published pages associated with leaked tokens can be replaced or deleted. This is **not an active leak in this checkout**: Maksim's machine-global ignore currently excludes `.claude/`. The defect is that the shipped workflow depends on a machine-specific protection it does not establish.

**Minimal fix:** Store token-bearing history under `${CLAUDE_PLUGIN_DATA}` with restrictive permissions and a project identifier. Keep only non-secret URL metadata in the project if project-visible history remains useful.

**VERDICT:** CONFIRMED (facts upheld; the report's own fix target is corrected — see `## Corrections to this report's own evidence`)  
**SEVERITY (final):** Medium  
**WHY:** `HISTORY_FILE=".claude/brewpage-history.md"` is bare-relative in all five publish blocks (`SKILL.md:150,188,221,253,293`), the owner token is plaintext with no `chmod`, no ignore entry is created, and the header only asks the user to keep it private — safe here solely because `~/.gitignore_global:2` ignores `.claude/`.  
**FIX DIRECTION (decided):** Keep the file project-local: resolve a project root per the canonical recipe (`CLAUDE_PROJECT_DIR` -> `git rev-parse --show-toplevel` -> upward `.git`/`.claude` walk -> `PWD`), `chmod 600` after the first write, and append `.claude/brewpage-history.md` to the project `.gitignore` if absent. Do NOT relocate to `${CLAUDE_PLUGIN_DATA}` — writes there are permitted, but a shared `~/.claude` dir is the wrong home for a per-project token.

### BD04 — docsync treats mutable hook cwd as the project root

**Severity:** Medium  
**Confirmation:** Confirmed by two independent agents (2/2)  
**Evidence:** `brewdoc/skills/docsync-setup/SKILL.md:59-64`; `brewdoc/skills/docsync-setup/assets/docsync-track.mjs:38-48`, `:116-130`; `docsync-watch.mjs:34-44`, `:109-118`; `docsync-gate.mjs:43-53`, `:114-128`; official semantics at `.claude/tmp/claude-upstream-20260815/docs/hooks.md:583-589`, `:708-727`

**Trigger/state:** The session working directory changes with `/cd`, a shell command, a monorepo package workflow, or another supported cwd-changing path before a hook fires.

**Actual outcome:** The hooks read configuration and state under `<current cwd>/.claude/docsync/`, not the installed project root. The intended root configuration is bypassed; tracked root files can be treated as out of scope; nested state directories are created; and stale-document reporting becomes incomplete or inconsistent.

**Blast radius:** docsync reliability for the current session and any repository work performed from a subdirectory. User source files are not corrupted, but intended staleness checks silently disappear or report against the wrong state.

**Minimal fix:** Derive the installed root from the hook script location or pass `${CLAUDE_PROJECT_DIR}` explicitly. Retain `input.cwd` only for resolving relative tool input paths.

**VERDICT:** CONFIRMED (with a consequence the report missed)  
**SEVERITY (final):** Medium  
**WHY:** All three hooks derive config *and* state from `input.cwd || process.cwd()` (`docsync-track.mjs:119`, `docsync-watch.mjs:112`, `docsync-gate.mjs:117`), and `loadConfig` defaults `enabled: c.enabled !== false` — so from a subdirectory a docsync the user explicitly disabled silently re-enables with threshold 7 and an empty exclude list.  
**FIX DIRECTION (decided):** One line per hook — `const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()` (env var is exported into hook processes, `hooks.md:487`, and the registration already passes it) — used for `statePath`/`loadConfig`; keep `input.cwd` only inside `relOf()`. Also correct the false claim at `SKILL.md:59-64`.

### BD05 — docsync state is shared across concurrent sessions and is not concurrency-safe

**Severity:** Medium  
**Confirmation:** Confirmed by two independent agents (2/2)  
**Evidence:** `brewdoc/skills/docsync-setup/assets/docsync-track.mjs:24-30`, `:52-58`; `docsync-watch.mjs:26-31`, `:47-53`; `docsync-gate.mjs:77-84`, `:116-125`; official parallel behavior at `.claude/tmp/claude-upstream-20260815/docs/hooks.md:400-412`, `:2011-2018`

**Trigger/state:** Two Claude Code sessions operate in the same project, or parallel tool calls cause multiple PostToolUse hooks to update state concurrently.

**Actual outcome:** All sessions use one `state.json`; seeing a different `session_id` resets the existing touched set. Writes also share one `state.json.tmp` and perform an unlocked read/modify/write cycle. One session can erase another session's touched docs, and concurrent writes can lose entries or fail a rename that the hook silently ignores.

**Blast radius:** Stale or undated documentation touched by one session can be omitted from the Stop gate. The failure is silent and undermines the feature's main guarantee, but it does not damage the documentation itself.

**Minimal fix:** Use one state file per `session_id`, unique atomic temp names, and a small bounded cleanup policy for old session files.

**VERDICT:** CONFIRMED  
**SEVERITY (final):** Low-Medium (was Medium)  
**WHY:** One `state.json` keyed on a single `session_id` resets `{touched, asked}` on mismatch, the write path is an unlocked read-modify-write to a shared `p + '.tmp'`, and `writeJsonAtomic` swallows every error in a bare `catch {}` — but the blast radius is a missed stale-doc reminder, never damaged documentation.  
**FIX DIRECTION (decided):** `statePath()` -> `.claude/docsync/state-<session_id>.json` (fall back to `state.json` when `session_id` is absent), unique temp `p + '.' + process.pid + '.tmp'`, and prune session files older than N days on gate.

### BD06 — failed docsync lifecycle operations leave a partial or broken install

**Severity:** Medium  
**Confirmation:** Confirmed by two independent agents (2/2)  
**Evidence:** `brewdoc/skills/docsync-setup/SKILL.md:224-241`, `:249-315`, `:452-523`

**Trigger/state:** `settings.json` is invalid, the merge command fails, or neither Python nor jq is available during install/uninstall.

**Actual outcome:** Install copies hooks and writes config before settings registration succeeds; a failed merge leaves those artifacts behind. Uninstall reports/restores a failed inverse merge but then unconditionally removes all three hook scripts. Existing registrations can remain pointed at missing files, producing hook failures after the operation.

**Blast radius:** The affected project's Claude Code hook configuration becomes partially installed or partially removed. Foreign hook entries are preserved, but docsync can remain noisy or nonfunctional until manually repaired.

**Minimal fix:** Exit before file deletion after any inverse-merge failure. On install failure, remove only the newly copied/configured artifacts or stage the small file set and commit it only after settings merge succeeds.

**VERDICT:** NARROWED — the defect is the uninstall half only. Narrowed claim: the unconditional `rm -f` at `SKILL.md:521-522` deletes all three hook scripts while live registrations still point at them. The install half is real but benign: a failed merge restores the backup, leaving copied hooks and `config.json` orphaned and inert (nothing registered, nothing runs) — cleanup debt, not breakage.  
**SEVERITY (final):** Medium  
**WHY:** The `rm -f` sits outside every conditional and is reachable four ways: (a) the python branch fails and `cp "$SETTINGS.bak" "$SETTINGS"` puts the three registrations BACK; (b) neither `python3` nor `jq` on PATH — `:514-516` only prints an instruction; (c) the jq branch fails `jq empty`, settings unchanged; (d) the `no settings.json` branch (benign). Result: `node <deleted path>` on every Write/Edit/Read and every Stop.  
**FIX DIRECTION (decided):** Set `CLEANED=1` only on a verified successful clean and gate the deletion — `[ "$CLEANED" = 1 ] || { echo "❌ settings not cleaned — hook files KEPT"; exit 1; }` before `rm -f`; mirror the guard in `purge` (`:542`). On install failure, remove only the just-copied `.mjs` files and the freshly written `config.json`.

### BD07 — memory-sync omits recursively supported rules and agents

**Severity:** Medium  
**Confirmation:** Confirmed by two independent agents (2/2)  
**Evidence:** `brewdoc/skills/memory-sync-setup/SKILL.md:280-296`; `brewdoc/skills/memory-sync-setup/scripts/generate.sh:75-76`, `:164-173`, `:284-305`; official recursive agent discovery at `.claude/tmp/claude-upstream-20260815/docs/sub-agents.md:169-179`

**Trigger/state:** A supported project stores rules in `.claude/rules/<group>/*.md` or agents in `.claude/agents/<group>/*.md`.

**Actual outcome:** The generator declares `.claude/rules/**` and `.claude/agents/**` in scope but counts only depth one and scans only direct `*.md` children. Nested definitions disappear from surface counts, roster validation, path-precision review, ownership batches, and the emitted memory-sync skill.

**Blast radius:** The generated memory maintenance workflow can certify an incomplete surface as current and leave stale or contradictory nested instructions untouched.

**Minimal fix:** Replace the direct globs and default `-maxdepth 1` counts with recursive Markdown enumeration for rules and agents, including supported symlinks where relevant.

**VERDICT:** NARROWED — the AGENTS half is confirmed upstream; the RULES half is rejected (see `## Rejected on re-verification`). Narrowed claim: memory-sync omits recursively-discovered **agents**, and separately declares `.claude/rules/**` in scope while its scanner walks one level — an internal scope inconsistency, not an upstream mismatch.  
**SEVERITY (final):** Low-Medium (was Medium)  
**WHY:** `generate.sh:76` `_count_md() { find "$1" -maxdepth "${2:-1}" … }` is used bare at `:170-171` for `.claude/agents` and `:302` lists via the direct glob `.claude/agents/*.md`, while `sub-agents.md:175` states agents are scanned recursively into subfolders; `count_skills()` at `:167` is already recursive, so the repo's own convention is inconsistent. Latent in this repo (no nested rules or agents).  
**FIX DIRECTION (decided):** Make agents enumeration recursive — `_count_md .claude/agents 99` and feed `_fm_list` from `find .claude/agents -type f -name '*.md'`. For rules, do NOT add recursion: narrow the SKILL's declared scope from `.claude/rules/**` to `.claude/rules/*.md`.

### BD08 — mixed Git visibility is incorrectly reduced to `git-tracked`

**Severity:** Low-Medium  
**Confirmation:** Confirmed by two independent agents (2/2)  
**Evidence:** `brewdoc/skills/memory-sync-setup/scripts/generate.sh:127-135`; consumer semantics at `brewdoc/skills/memory-sync-setup/SKILL.md:282-287`

**Trigger/state:** At least one memory-surface file is tracked while another is ignored or otherwise absent from `git ls-files`.

**Actual outcome:** `derive_git_visibility()` returns `git-tracked` as soon as it finds one tracked row. The emitted workflow can then treat Git diff/status as complete even though ignored memory edits are invisible to Git.

**Blast radius:** Verification can miss changed ignored instruction files and emit a false clean verdict. It affects evidence quality, not repository data.

**Minimal fix:** Return `tracked`, `ignored`, or `mixed` with counts, or retain a per-file visibility ledger. A three-state result is sufficient.

**VERDICT:** CONFIRMED — and the mechanism is broader than reported  
**SEVERITY (final):** Low-Medium (unchanged label)  
**WHY:** `generate.sh:131-133` counts `git ls-files -- .claude '*CLAUDE.md' '*AGENTS.md' | wc -l` once and returns `git-tracked` when `> 0`, so a SINGLE tracked row anywhere across all three surfaces labels the whole memory set tracked. Repro: a tracked `CLAUDE.md` plus an ignored `.claude/` yields `git-tracked`, and the ignored rule is invisible to the diff — precisely the case where the "VERIFY must re-read files directly" guidance is needed and precisely where it is dropped.  
**FIX DIRECTION (decided):** Compare tracked rows against filesystem rows per surface and return `git-tracked` / `git-ignored` / `mixed (<t> tracked, <i> untracked)`; emit the re-read guidance for `mixed` as well as `git-ignored`.

### BD09 — md-to-pdf suppresses the structured result it requires

**Severity:** Low  
**Confirmation:** Confirmed by two independent agents (2/2)  
**Evidence:** `brewdoc/skills/md-to-pdf/SKILL.md:175-189`, `:278-286`; `brewdoc/skills/md-to-pdf/scripts/md_to_pdf.py:175-187`

**Trigger/state:** Any normal CONVERT or TEST invocation follows the documented command.

**Actual outcome:** The skill always passes `--quiet`, while `print_status()` emits `STATUS`, `OUTPUT`, `PAGES`, `SIZE`, and `ENGINE` only when quiet is false. Conversion succeeds, but the next step has no structured fields to parse and cannot truthfully fill its result table.

**Blast radius:** User-facing verification and reporting for every conversion. The generated PDF can still be valid.

**Minimal fix:** Always emit structured result lines and let quiet suppress only incidental progress, or remove `--quiet` from the skill command.

**VERDICT:** CONFIRMED  
**SEVERITY (final):** Low  
**WHY:** `md_to_pdf.py:175-187` gates all five lines behind `if not quiet:` while `SKILL.md:183` bakes `--quiet` into the documented command and `:189` tells the model to parse them; `---CONVERT_OK---` still prints, so the skill believes it succeeded and then has nothing to fill Pages/Size/Engine with — it omits or invents them. Repro: `--quiet` run emits zero bytes on stdout and stderr, rc=0.  
**FIX DIRECTION (decided):** Invert the gate — always print the five result lines and let `--quiet` suppress only progress/warning chatter. Do not drop `--quiet` from `SKILL.md`; that leaves a flag whose only effect is breaking the contract.

### BD10 — saved style settings are ignored by one or both PDF engines

**Severity:** Medium  
**Confirmation:** Confirmed by two independent agents (2/2)  
**Evidence:** `brewdoc/skills/md-to-pdf/SKILL.md:206-222`, `:265-269`; `brewdoc/skills/md-to-pdf/scripts/md_to_pdf.py:199-248`, `:542-571`, `:744-760`; `brewdoc/skills/md-to-pdf/styles/default.css:1-10`

**Trigger/state:** The user saves Letter/Legal, a custom color scheme, or a custom footer, then converts with WeasyPrint; or saves Letter/Legal and converts with ReportLab.

**Actual outcome:** WeasyPrint receives the merged config but never reads it and always loads the fixed CSS. ReportLab reads several style sections but hardcodes A4 for the document and footer position. ReportLab reproduction returned identical A4 dimensions for all three requested sizes.

**Blast radius:** Every document relying on configured page size under either engine and all saved color/footer choices under WeasyPrint. Output is generated successfully but contradicts the selected configuration.

**Minimal fix:** Generate a small WeasyPrint override CSS from the saved config. Map ReportLab's three page-size names to its existing page constants and use the selected dimensions for both frame and footer.

**VERDICT:** CONFIRMED — sharper than reported on the WeasyPrint half  
**SEVERITY (final):** Medium  
**WHY:** `convert_weasyprint` never dereferences `config` at all (only the local `extension_configs`), so page size, colors, footer format and `footer.enabled` are entirely inert and the fixed `styles/default.css` always wins; ReportLab hardcodes `A4` for `pagesize=` and `A4[0]/2` for the footer centre, honouring only `page.margins`. Repro: A4 / Letter / Legal configs all produced `/MediaBox [0 0 595.2756 841.8898]` with identical byte sizes. STYLES Q1/Q2/Q4 therefore write settings no engine honours.  
**FIX DIRECTION (decided):** Local fix, ~30 lines — map the three size names to the existing `reportlab.lib.pagesizes.{A4,LETTER,LEGAL}` constants and thread the tuple through `build_document` and the footer canvas factory; for WeasyPrint build a generated `@page`/color/footer override block from `config` and append it after the base CSS link. The redesign (shrinking the STYLES contract to what the engines implement) is rejected.

### BD11 — ReportLab resolves relative images against process cwd and silently drops them

**Severity:** Medium  
**Confirmation:** Confirmed by two independent agents (2/2)  
**Evidence:** `brewdoc/skills/md-to-pdf/scripts/md_to_pdf.py:517-535`, `:581-624`, `:783-800`; correct WeasyPrint base handling at `:244`

**Trigger/state:** A Markdown document contains `![...](relative/path.png)` and conversion starts from a directory other than the Markdown file's parent.

**Actual outcome:** ReportLab evaluates `Path(src)` relative to process cwd. If absent there, it returns `None`; the parser advances past the image line without warning. The resulting PDF silently omits valid content.

**Blast radius:** ReportLab PDFs containing local relative images. Text remains intact, but diagrams, screenshots, and other visual evidence can disappear unnoticed.

**Minimal fix:** Pass the input document directory into the parser and resolve non-absolute images against it. Surface a concise warning or failure when a referenced local image cannot be rendered.

**VERDICT:** CONFIRMED  
**SEVERITY (final):** Medium  
**WHY:** `_try_build_image` does `Path(src)` with no base directory, returns `None` on miss, and the caller advances with no story append and no message — not even the alt text survives; WeasyPrint is correct (`base_url=Path(input_path).parent`), so the two engines silently disagree. Repro: `sub/doc.md` with `![alt](img.png)` converted from the repo root yields 0 `/Subtype /Image` objects and no stderr; from `sub/` it yields 1.  
**FIX DIRECTION (decided):** Thread `Path(input_path).parent` into `md_to_story` -> `_try_build_image`, resolve non-absolute `src` against it (fall back to cwd), and on a miss write one stderr line naming the unresolved path instead of dropping it silently.

### BD12 — deterministic preprocessing files can overwrite or delete user/concurrent data

**Severity:** Medium  
**Confirmation:** Confirmed by two independent agents (2/2)  
**Evidence:** `brewdoc/skills/md-to-pdf/SKILL.md:191-202`

**Trigger/state:** `{original_dir}/.tmp_{original_name}.md` already exists, or two prompt-assisted conversions of the same source run concurrently.

**Actual outcome:** The workflow writes a fixed temp filename and then unconditionally deletes it. An existing user file is overwritten and removed; concurrent invocations can convert or delete each other's transformed content.

**Blast radius:** One colliding temporary Markdown file and the correctness of the corresponding PDF. The original source path is not intentionally deleted, but user data at the collision path can be lost.

**Minimal fix:** Create a unique temp file in the source directory and clean up only the path created by that invocation, using a trap/finally path.

**VERDICT:** NARROWED — narrowed claim: a fixed-name temp file plus an unconstrained model-substituted `rm -f` is a collision/concurrency hazard with one unrecoverable path (a mis-substituted `rm -f "TEMP_FILE_PATH"` naming the source). The first pass's further narrowing to "not reachable in normal use" is OVERTURNED (see `## Rejected on re-verification`).  
**SEVERITY (final):** Low-Medium (was Medium)  
**WHY:** The read-before-overwrite guard that the "not reachable" narrowing rested on is a property of one execution path, not of the skill: `SKILL.md:7` grants `Bash` and `Edit` alongside `Write`, step 3 (`:191`) names no tool, and its immediate neighbour (`:198-201`) is a Bash block — `cat > "$TMP" <<'EOF'` bypasses the guard entirely. Residual severity is not High because the usual collision occupant is the skill's own leftover dotfile and the source-destroying path is model-error dependent.  
**FIX DIRECTION (decided):** Derive and delete the temp path inside ONE Bash invocation — `TMP="$(mktemp "${original_dir}/.tmp_XXXXXX.md")"`, pass that exact path to the converter, `rm -f "$TMP"` — and constrain `rm -f` to a `.tmp_*` basename so a mis-substitution cannot name the source. Land it FIRST in the BD11 + BD12 cluster: one line of fix, unrecoverable loss prevented.

### BD13 — my-claude output follows mutable cwd instead of the project root

**Severity:** Low-Medium  
**Confirmation:** Confirmed by two independent agents (2/2)  
**Evidence:** `brewdoc/skills/my-claude/SKILL.md:24`, `:84-89`, `:114-123`, `:158-161`, `:193-210`; official skill cwd behavior at `.claude/tmp/claude-upstream-20260815/docs/skills.md:395-403`, `:638-645`

**Trigger/state:** The user invokes the skill after the session cwd has moved into a nested package or subdirectory.

**Actual outcome:** Every bare `.claude/brewdoc/...` path resolves below that subdirectory. The skill creates a second output/index tree instead of the project-level tree it describes, splitting history and making later lookups incomplete.

**Blast radius:** Generated my-claude reports and their index in the current project. No source code is affected.

**Minimal fix:** Resolve `${CLAUDE_PROJECT_DIR}` once and use absolute root-based output and index paths throughout all modes.

**VERDICT:** CONFIRMED  
**SEVERITY (final):** Low (was Low-Medium)  
**WHY:** `my-claude/**` contains zero occurrences of `CLAUDE_PROJECT_DIR` in any spelling and every output/index path is bare-relative; upstream states skill commands run in the session shell's cwd and that the cwd moves with `cd` (`skills.md:643`). Damage is a split `.claude/brewdoc/` tree and a second `INDEX.jsonl` in one project — no source code touched.  
**FIX DIRECTION (decided):** Replace every bare `.claude/brewdoc/...` with `${CLAUDE_PROJECT_DIR}/.claude/brewdoc/...` and the `{cwd}/` forms in `references/internal-mode.md` likewise. Use the BARE braced spelling only — `${CLAUDE_PROJECT_DIR:-…}` is not matched by the substitution regex and always falls through to its fallback.

### BD14 — dependency installation can target a different Python than conversion

**Severity:** Low-Medium  
**Confirmation:** Confirmed by two independent agents (2/2), narrowed to portable behavior  
**Evidence:** `brewdoc/skills/md-to-pdf/scripts/check_deps.sh:79-93`, `:184-205`, `:207-229`; conversion command at `brewdoc/skills/md-to-pdf/SKILL.md:181-185`

**Trigger/state:** `python3` and `pip3` resolve to different interpreters, as can occur with virtual environments, pyenv, Homebrew/system combinations, or an incomplete environment activation.

**Actual outcome:** Checks and conversion import through `python3`, but installation calls bare `pip3` and prints `OK` without a post-install import check. Packages can be installed successfully into another interpreter, after which conversion still fails.

**Blast radius:** Dependency setup for the selected PDF engine. It does not affect already working installations.

**Narrowing:** This is **not currently failing on Maksim's host**; both commands resolve to the same Homebrew Python 3.14 installation. It remains a deterministic portable defect in the shipped installer.

**Minimal fix:** Use `python3 -m pip` and rerun the existing import check before printing `OK`.

**VERDICT:** CONFIRMED, with one half of the original reasoning corrected  
**SEVERITY (final):** Low (was Low-Medium)  
**WHY:** The interpreter-mismatch half holds — checks and conversion go through `python3` while install shells out to bare `pip3`. But `check_deps.sh:2` is `set -euo pipefail`, so a FAILING `pip3` does abort before `echo "OK"`; the live defect is narrower: a `pip3` that SUCCEEDS into a different interpreter, followed by an unconditional `OK` with no post-install re-import check.  
**FIX DIRECTION (decided):** Use `python3 -m pip install "${pkgs[@]}"` in both install branches, then re-run `check_pip_packages` and print `OK` only when it returns empty.

### BD15 — generated docsync hook commands fail under PowerShell

**Severity:** Medium, Windows-only  
**Confirmation:** Confirmed by two independent agents (2/2), narrowed to PowerShell  
**Evidence:** `brewdoc/skills/docsync-setup/SKILL.md:243-247`; `brewdoc/skills/docsync-setup/assets/INSTALL.md:53-67`; official PowerShell behavior at `.claude/tmp/claude-upstream-20260815/docs/hooks.md:3406-3410`; exec-form recommendation at `:581-589`

**Trigger/state:** The project uses Claude Code on Windows with a PowerShell hook shell.

**Actual outcome:** Generated commands use bare `$CLAUDE_PROJECT_DIR`. Claude Code 2.1.233 does not rewrite that spelling for PowerShell; PowerShell resolves it as an undefined local variable, leaving the hook script path without the project-root prefix. All three docsync hooks fail to start.

**Blast radius:** docsync on PowerShell/Windows for projects installed with the generated settings. Unix shell installations are unaffected.

**Minimal fix:** Emit exec-form handlers with `command: "node"` and `${CLAUDE_PROJECT_DIR}/...` in `args`. Changing shell form to `${CLAUDE_PROJECT_DIR}` is an acceptable smaller fallback, but exec form is the current official recommendation.

**VERDICT:** CONFIRMED, narrowed to PowerShell-shell hosts — i.e. Windows WITHOUT Git Bash, or a host that explicitly forces `shell: powershell`  
**SEVERITY (final):** Low-Medium (was Medium, Windows-only)  
**WHY:** The three generated commands carry bare `$CLAUDE_PROJECT_DIR`, which upstream states plainly is not rewritten for PowerShell and resolves to `$null` (`hooks.md:3406-3410`), launching `node "/.claude/hooks/docsync-track.mjs"`. Understated in one direction, overstated in another: the entries set no `"shell"`, and shell form defaults to Git Bash on Windows (`hooks.md:452,462`), so Windows+Git Bash and all Unix hosts are unaffected.  
**FIX DIRECTION (decided):** Emit exec form — `{"type":"command","command":"node","args":["${CLAUDE_PROJECT_DIR}/.claude/hooks/docsync-track.mjs"]}` — upstream's stated preference (`hooks.md:581-589`) and shell-independent. Fallback is the braced spelling in shell form. Uninstall keys on the hook basename, so either change stays idempotent.

## Corrections to this report's own evidence

The findings survive; several of the supporting facts above do not. Stage B takes the corrected version.

- **BD03 — `${CLAUDE_PLUGIN_DATA}` is not a protected path.** It is the official, persistent, writable plugin data dir (`plugins-reference.md:665`, `:705-748`; `skills.md:401`), created on first reference, and Anthropic's own `project-artifact` skill Writes and Edits there. A `Write`/`Edit` under it is classified *sensitive* and routed to an ASK — prompt in `default`/`acceptEdits`/`plan`, auto-approved under `bypassPermissions`, hard-fail in headless `-p` — **not** a block in all modes. The finding's own facts are unaffected (bare relative `.claude/brewpage-history.md` in all five blocks, plaintext token, no `chmod`, no ignore entry, safe here only via `~/.gitignore_global:2`). The decided fix nonetheless keeps the file project-local — a shared `~/.claude` dir is the wrong home for a per-project token, not because writes are blocked.
- **BD04 — a consequence the report missed.** From a subdirectory `loadConfig` finds no `config.json` and falls back to `enabled: c.enabled !== false` = ENABLED, so a docsync the user explicitly disabled silently re-enables, with an empty exclude list. `CLAUDE_PROJECT_DIR` is exported into hook processes (`hooks.md:487`), so the fix is one line per hook.
- **BD06 — the real defect is the uninstall half.** The install half leaves benign orphaned files (nothing registered, nothing runs). The defect is the unconditional `rm -f` at `SKILL.md:521-522`, reachable via three preconditions that all leave live registrations pointing at deleted scripts.
- **BD08 — repro.** A tracked `CLAUDE.md` plus an ignored `.claude/` yields `git-tracked`, and the ignored rule is invisible to the diff. The reduction is not per-surface: one tracked row anywhere labels all three surfaces.
- **BD09 — mechanism.** `--quiet` in the documented command suppresses all five result lines while `---CONVERT_OK---` still prints, so the failure presents as success with missing fields.
- **BD10 — the WeasyPrint half is total, not partial.** `convert_weasyprint` never dereferences `config` at all: colors, footer and page size are inert. A4/Letter/Legal all yield `/MediaBox [0 0 595.2756 841.8898]`. The redesign option is rejected — the local fix is ~30 lines using the existing `pagesizes.LETTER/LEGAL` constants plus a generated CSS override.
- **BD14 — half the stated mechanism is wrong.** `set -euo pipefail` means a FAILING `pip3` does abort before `echo OK`. The real defect is a `pip3` succeeding into a DIFFERENT interpreter with no post-install re-import check.
- **BD15 — understated in one direction, overstated in another.** Bare `$CLAUDE_PROJECT_DIR` in the three generated commands resolves to `$null` (`hooks.md:3410`), but the entries set no `"shell"` and shell form defaults to Git Bash on Windows — so the failure needs Windows WITHOUT Git Bash. Exec form is upstream's stated preference (`hooks.md:581-589`), not merely a stylistic choice.
- **Scope correction — `${CLAUDE_PROJECT_DIR:-…}`.** It appears **12** times across **three** brewdoc skills: `docsync-setup` x9, `md-to-pdf` x2, `memory-sync-setup` x1 (the last was missed on the first pass). The brace-modifier form is never matched by the substitution regex, so those blocks always fall through to `git rev-parse --show-toplevel`. Bare `${CLAUDE_PROJECT_DIR}` appears **0** times anywhere under `brewdoc/`. Every BD03 / BD04 / BD13 fix must use the bare braced form.

## New findings from re-verification

### BD-N03 — publish's SITE-from-directory block never produces a valid archive

**Severity:** Medium-High  
**Origin:** Found while re-running BD01.  
**Evidence:** `brewdoc/skills/publish/SKILL.md:267-275`; repro `bd01b.sh`.

`TMPZIP=$(mktemp /tmp/brewpage-site-XXXXXX.zip)` pre-creates a **0-byte file**, and `(cd "{directory_path}" && zip -r "$TMPZIP" .)` then treats it as an existing archive: Info-ZIP emits `missing end signature` + `zip error: Zip file structure invalid` and exits 3. The subshell status is never checked — no `set -e`, no `||` — so `curl -F "archive=@$TMPZIP"` uploads 0 bytes. The response carries no `.link` and the user is told `FAILED: publish rejected (no .link in response)` with no hint of the real cause. The control run, with the file removed first, succeeds with 7 entries.

**Consequence for sequencing:** the directory branch is dead today, so live disclosure (BD01) runs exclusively through the supplied-ZIP branch. **BD-N03 MUST land together with BD01** — repairing the archive alone would arm a disclosure path that currently fails harmlessly.

**Fix direction (decided):** `TMPZIP=$(mktemp -u /tmp/brewpage-site-XXXXXX.zip)` (or `rm -f "$TMPZIP"` before zipping), and gate the upload on `zip`'s exit status. Ship with BD01's exclude set and manifest print.

## Rejected and non-findings

No second-agent-confirmed BREWDOC candidate was rejected after narrowing. The following broader interpretations were explicitly rejected and are not findings:

- **No current BD03 credential exposure was asserted for this checkout.** Maksim's global Git ignore currently protects `.claude/`; the confirmed issue is the distributed workflow's reliance on protection it does not establish.
- **No current-host BD14 failure was asserted.** `python3` and `pip3` are aligned here; the confirmed issue is portable interpreter mismatch and the missing post-install check.
- **No Unix BD15 failure was asserted.** Bare `$CLAUDE_PROJECT_DIR` works in the intended Unix shell form; the confirmed failure is PowerShell-specific and directly documented upstream.
- The empty top-level `brewdoc/hooks/hooks.json` was reviewed and treated as intentional; runtime hooks are installed project-locally by docsync.
- No additional hook decision-schema, exit-code, stdout, recursion, MCP-name, or async defect survived the two-agent confirmation threshold beyond BD04, BD05, BD06, and BD15.
- Documentation drift, UI behavior, Codex projection differences, and hypothetical architecture improvements were excluded rather than promoted into findings.

## Preventive test gaps

BREWDOC currently has no executable regression suite for these operational paths. `brewdoc/skills/md-to-pdf/test/test-all-elements.md` is an input fixture, not an assertion suite. The smallest tests that directly prevent recurrence are:

1. **Publish helper tests:** hostile password, namespace, JSON, heredoc-delimiter, and path inputs; archive manifest assertions proving `.git`, `.env`, dependency, and cache paths are excluded or explicitly reviewed.
2. **docsync tests:** nested cwd, two simultaneous session IDs, parallel PostToolUse writes, install/uninstall merge failure, and JSON registration validation for PowerShell-compatible exec form.
3. **memory-sync tests:** nested rules and agents appear in counts and rosters; mixed tracked/ignored fixtures produce `mixed` and force direct re-read verification.
4. **md-to-pdf tests:** structured output is present in normal skill mode; A4/Letter/Legal media boxes differ correctly under both engines; WeasyPrint consumes saved styles; relative images resolve from the input directory; two preprocessing runs receive distinct temp paths; dependency installation rechecks the exact interpreter.
5. **my-claude test:** invocation from a nested cwd still targets `${CLAUDE_PROJECT_DIR}/.claude/brewdoc/`.

These are targeted regression tests, not a request for a new testing framework.

## Recommended fix order

1. **BD02** — remove shell-source interpolation from publish.
2. **BD01** — prevent unintended directory disclosure before the next site publish.
3. **BD04 + BD05** — make docsync root and session state reliable together.
4. **BD06 + BD15** — make docsync lifecycle atomic enough and registrations portable.
5. **BD03** — relocate owner credentials to persistent private plugin state.
6. **BD11 + BD12** — stop silent PDF content loss and temp-file collisions.
7. **BD10 + BD09 + BD14** — make PDF configuration, result reporting, and dependency setup truthful.
8. **BD07 + BD08** — make memory-sync enumerate and verify the complete supported surface.
9. **BD13** — anchor my-claude output at the project root.

After these changes, run only the focused regression checks above plus one clean end-to-end publish dry run without a network mutation, one two-session docsync fixture, and one PDF conversion per engine. Release or external publishing remains a separate decision.

> Sequencing amendments from re-verification: **BD-N03 lands with BD01** in step 2 (fixing the archive alone arms the disclosure path). In step 6, **BD12 goes first**, ahead of BD11.

## Rejected on re-verification

No BD finding was refuted outright. The following sub-claims were, and their parent findings survive in narrowed form.

### BD07's RULES half — recursive `.claude/rules/**` discovery is unsupported

**Refutation evidence:** every mention of rule discovery in the 2.1.233 snapshot uses the single-level glob spelling and there is no recursive-rules statement anywhere — `docs/hooks.md:56` and `docs/plugins-reference.md:125` both read "When a CLAUDE.md or `.claude/rules/*.md` file is loaded into context"; `docs/hooks.md:1233` elaborates on lazy loading and `paths:` frontmatter and still spells the surface `.claude/rules/*.md`. The AGENTS half is affirmatively confirmed upstream at `docs/sub-agents.md:175` ("scans `.claude/agents/` and `~/.claude/agents/` recursively … subfolders such as `agents/review/`") and again for plugin scope at `:179`.

**Caveat:** this is a glob spelling plus an absence, not an explicit "rules are not recursive". It is affirmative enough to reject "recursively supported rules" as an evidence-backed claim — which is what the finding asserted — but a future upstream change could flip it.

**What survives:** BD07 stands as an internal scope inconsistency — the SKILL declares `.claude/rules/**` while the scanner walks one level — plus the hard-confirmed agents defect. Re-rated **Low-Medium**.

### BD12's "not reachable in normal use" narrowing — OVERTURNED

**Refutation evidence:** the narrowing's load-bearing sentence is that the Write tool refuses to overwrite a file it has not Read, so the collision case errors out instead of destroying. That is a property of the **Write tool**, not of the skill. `md-to-pdf/SKILL.md:7` grants `Bash` and `Edit` alongside `Write`; `SKILL.md:191` says only "Write modified content to temp file" and never names a tool; the very next numbered step (`:198-201`) is an `**EXECUTE** using Bash tool` block. A model that keeps both steps in Bash (`cat > "$TMP" <<'EOF'` — the obvious shape given the surroundings) bypasses the guard entirely, as does `Edit` on an existing file. The mitigation therefore covers one possible execution path and cannot carry a "not reachable" ruling.

**What survives:** BD12 re-rated **Low-Medium** (not High — the usual collision occupant is the skill's own leftover dotfile, and the path that destroys the ORIGINAL document is model-error dependent) and it stays **FIRST in its fix cluster**: the fix is a single `mktemp` inside the same shell invocation, and the loss it prevents is unrecoverable.
