# 07 -- Step 5 (optional): AGENTS.md optimization

[DICT: CMD=root AGENTS.md, LOCAL=AGENTS.local.md, MOD=module/subproject, MODCMD=module-level AGENTS.md, RULES=.codex/rules/**/*.md, BUDGET=line budget, TO=brewtools:text-optimize skill, DIR=free-text prompt directive]

OPTIONAL, opt-in at P0; runs AFTER board scaffolding + verification (P5). PROPOSE-ONLY: every change needs main-chat user gate approval, including restructuring AGENTS.md.

> **Native instruction discovery (source: https://learn.chatgpt.com/docs/agent-configuration/agents-md, verified 2026-09-30).** Bake this into every proposal rationale:
> - Codex builds its instruction chain once per run: global guidance, then at most one non-empty instruction file per directory from project root to launch CWD. `AGENTS.override.md` precedes `AGENTS.md`, then configured fallback names. The combined project content is capped by `project_doc_max_bytes` (32 KiB default); later guidance takes precedence when included.
> - Nested AGENTS.md outside that launch path is not automatically included when a file is read. Launch a new run from the module directory or explicitly read its guidance before module work.
> - `@path` is not a native instruction-include directive. `.codex/rules/**/*.md` and `AGENTS.local.md` require explicit loading instructions; `paths:` metadata does not enable automatic loading.
> CONSEQUENCE: module-local guidance keeps unrelated detail out of a root-launched run, but must be loaded explicitly for module work or discovered by a new module-launched run. Keep repo-wide invariants in root and maintain an explicit rule index; do not promise automatic lazy loading or a byte budget from line counts.

---

## Inputs

From P0:
- `TARGET` (abs path).
- `DIR` = the free-text prompt directive parsed from `<arguments>` (may be empty). Tunes which sub-steps run / how aggressive they are. See "Directive influence" below.
- `OPTIN` = whether the user opted into this phase (asked at P0).

If `OPTIN` is false -> SKIP this entire file; do nothing.

---

## Directive influence (DIR)

Match DIR substrings case-insensitively; all sub-steps are offered by default. DIR toggles offers, never approval gates.

| DIR hint (substring) | Effect |
|----------------------|--------|
| `skip module split`, `no module`, `no nested` | disable 5d (module split) |
| `skip local`, `no local`, `keep secrets inline` | disable 5b (preference extraction); still flag detected credentials, never copy their values into LLM instructions |
| `skip dedup`, `no dedup`, `skip rules` | disable 5e (rules dedup/compress) |
| `also dedupe rules`, `dedup rules` | force-enable 5e even if other hints narrow scope |
| `budget N`, `max N lines`, `target N` | override BUDGET_OPTIMAL=N (and OVER=N*1.5 rounded) |
| `aggressive`, `max compress`, `deep` | pass `-d` (or `-x` only if `max`/`extreme`/`atomic` present) to TO in 5e/5f |
| `report only`, `dry run`, `propose only` | run 5a detection + present a full plan, but make NO edits even if approved -- emit plan as the deliverable |
| anything else | record as free-form intent; apply best-effort to phrasing of proposals, do NOT invent new behaviors |

Ambiguous/conflicting DIR (e.g. `skip rules` + `also dedupe rules`) -> user resolves it in the P5.5 AskUser intro.

---

## 5a. Detect (read-only scan, NO edits)

Locate the root CMD: prefer `TARGET/AGENTS.md`, else `TARGET/.codex/AGENTS.md`. If neither exists -> there is nothing to optimize; report "no root AGENTS.md found" and SKIP the rest (do NOT create a root AGENTS.md -- out of scope for this phase).

**EXECUTE** using shell (read-only):
```bash
CMD=""
for c in "$TARGET/AGENTS.md" "$TARGET/.codex/AGENTS.md"; do test -f "$c" && CMD="$c" && break; done
test -n "$CMD" && wc -l < "$CMD" | tr -d ' ' && echo "CMD=$CMD" || echo "NO_CMD"
if test -d "$TARGET/.codex/rules/"; then find "$TARGET/.codex/rules/" -type f -name '*.md' | sort; else echo "NO_RULES"; fi
test -f "$TARGET/AGENTS.local.md" && echo "LOCAL_EXISTS" || echo "LOCAL_ABSENT"
```

Scan CMD and RULES locally for credential candidates before reading their prose; redact values from tool output.
Read sanitized content only. Never open credential stores. Produce a DETECTION object (no writes):

```
CMD_PATH    = <abs>
CMD_LINES   = <int>                # current line count
BUDGET_OPTIMAL = 200               # or DIR override
BUDGET_OVER    = 300               # or DIR override (optimal*1.5)
OVER        = CMD_LINES > BUDGET_OVER         # bool
LOCAL_ITEMS = [ {line, snippet, kind} ... ]   # secrets: masked snippet only, never a value; see 5b
MODULES     = [ {dir, why, has_own_cmd} ... ] # see 5d detection
RULES       = [ {path, lines} ... ]
DUP_SPANS   = [ {a, b, overlap_summary} ... ] # cross-file dup/overlap, see 5e
```

Report CMD_LINES vs BUDGET_OPTIMAL/BUDGET_OVER up front (current vs target), regardless of whether any proposal follows.

### Module detection (for MODULES)
A repo subtree is a MOD candidate if it has its own manifest / build / package boundary. Signals (any): `package.json`, `pom.xml`/`build.gradle`, `pyproject.toml`/`setup.py`, `go.mod`, `Cargo.toml`, `Makefile`, a `src/` of its own, or a workspace member (npm/pnpm/yarn workspaces, gradle subproject, cargo workspace, go work). Skip dirs in EXCLUSIONS only if EXCLUSIONS means "don't WRITE" -- here writing a MODCMD inside a source module IS allowed (a MODCMD is doc, not source). Record `has_own_cmd` = whether `<dir>/AGENTS.md` already exists.

### Local-only detection heuristics (for LOCAL_ITEMS)
Scan CMD lines for items that should NOT be in a team-shared, committed file:
| kind | heuristic |
|------|-----------|
| secret | `password`, `passwd`, `secret`, `token`, `api[_-]?key`, `bearer`, `BEGIN .*PRIVATE KEY`, AWS-style `AKIA[0-9A-Z]{16}`, long base64/hex blobs assigned to a var |
| abs machine path | absolute paths under `/Users/<name>/`, `/home/<name>/`, `C:\Users\`, `/opt/<host-specific>` -- machine/user-specific, not repo-relative |
| host/user config | personal localhost ports/URLs, `localhost:<port>` sandbox URLs, `~/.ssh`, hostnames, personal emails, "my " sandbox/test data |
NEVER expose secret values in tool output, proposals or any LLM file. Flag line numbers + masked snippet (`sk-...AB12`) + kind. Detection is heuristic; uncertain items are held for review, not copied.

---

## 5b. PROPOSE: local preferences -> AGENTS.local.md; credentials -> references only (gated)

If `DIR` disabled 5b: skip, but flag any detected credentials without values. Never interpret this as permission to copy them.

Separate non-secret personal preferences/machine paths/host config from credentials. If LOCAL_ITEMS non-empty, main-chat user gate:

> **Found N local-only items in AGENTS.md.** Move approved non-secret preferences to `AGENTS.local.md` (a gitignored reference; explicitly read it when applicable, never assume automatic loading). Credential values must stay outside all LLM instruction files; propose only a lookup reference naming an environment variable/keychain/secret-manager entry, with separate approval for removing an existing value.
> - Move non-secret preferences; approve concrete credential references separately
> - Let me pick which to move
> - Leave as-is (do not touch)

On approval:
1. If `AGENTS.local.md` absent -> create it at `TARGET/AGENTS.local.md` with a header `# Local-only (gitignored) -- machine/user-specific, not committed`.
2. Merge approved NON-SECRET items under topical headings; never clobber existing LOCAL. Do not copy credential values to LOCAL, CMD, MODCMD, RULES or other LLM files, even when gitignored.
3. Remove approved preferences from CMD (Edit, bottom-up). Replace an existing credential only after explicit approval of its concrete non-secret lookup reference and a confirmed secure source outside LLM files; otherwise leave it unchanged and report the unresolved item. Never relocate credentials or rewrite history automatically.
4. Ensure `AGENTS.local.md` is gitignored:
   ```bash
   grep -qxF "AGENTS.local.md" "$TARGET/.gitignore" 2>/dev/null || echo "(needs .gitignore entry)"
   ```
   If missing, propose adding `AGENTS.local.md` to `.gitignore` (one more AskUser line, or include in the same approval). Do NOT silently edit .gitignore without the user's yes.
> If a secret was already committed, note to the user that gitignoring does NOT purge history -- they should rotate the secret. Do not attempt history rewrite.

---

## 5c. PROPOSE: line-budget decomposition  (gated, only if OVER)

Report always: `AGENTS.md is <CMD_LINES> lines (optimal ~<BUDGET_OPTIMAL>, over at <BUDGET_OVER>).`

If NOT OVER: state it's within budget; offer optional tidy (markup pass 5g) but propose no decomposition.

If OVER: assemble a concrete decomposition PLAN combining 5d (module split), 5e (rules dedup), 5f (compress), then AskUser ONCE with the whole plan before applying any of it:

> **AGENTS.md is <CMD_LINES> lines (over the <BUDGET_OVER> ceiling; optimal ~<BUDGET_OPTIMAL>).** Proposed decomposition to get back under budget:
> 1. Move module detail for `<M1, M2, ...>` into per-module AGENTS.md; root keeps a compact index requiring an explicit read before module work when outside the launch path. A module-launched run discovers its local guidance subject to the combined byte cap.  [est -X lines]
> 2. Move topic blocks `<...>` into `.codex/rules/*.md`; add complete root rule-index entries with path, load condition and purpose, requiring explicit reads when the condition matches.  [est -Y lines]
> 3. Dedup overlap with existing rules `<...>`; delete duplicated spans.  [est -Z lines]
> 4. Deep-compress the remainder via brewtools:text-optimize.  [est -W lines]
> Projected: <CMD_LINES> -> ~<TARGET_LINES>.
> - Apply the full plan
> - Apply only steps I pick
> - Skip decomposition (leave AGENTS.md as-is)

Narrate 5d/5e/5f and apply ONLY steps approved here. Re-ask only to confirm the subset after "only steps I pick".

---

## 5d. Module split -> nested module AGENTS.md  (part of 5c plan; disabled if DIR says skip)

For each approved MOD in MODULES:
1. Gather the CMD content that is module-specific (build/test cmds, layout, conventions for that subtree).
2. Write/extend `<MOD.dir>/AGENTS.md` (discovered for a run launched from that module, or explicitly read before module work). If `has_own_cmd`, MERGE (apply_patch), do not clobber. If an override file exists, account for its precedence before proposing a change. Improve markup (headers, tables, bullets).
3. In the ROOT CMD, REPLACE the moved block with a MAX-COMPRESSED index: a couple of lines, e.g.:
   ```
   ## Modules (read the module AGENTS.md before work when outside the launch instruction chain)
   | Module | Path | Owns |
   |--------|------|------|
   | api    | services/api/  | handlers, OpenAPI, db migrations |
   | web    | apps/web/      | UI, build, e2e |
   ```
   Keep ONLY the index in root; the detail lives in the MODCMD.
> State the verified discovery rationale above: module detail can leave the root instruction chain, but require an explicit read before module work or a new run launched from the module. Native Codex does not expand `@import` as an instruction include.
> Do NOT move CROSS-cutting / repo-wide rules into a single module; those stay in root or go to a `.codex/rules/*.md`.

---

## 5e. Rules dedup + compress  (disabled if DIR says skip; forced if DIR says also dedupe rules)

1. From DUP_SPANS, identify content duplicated or overlapping across `.codex/rules/*.md` and between rules and CMD.
2. PROPOSE (folded into 5c plan, or its own AskUser if 5c not triggered): single-source each fact. Keep repo-wide invariants in CMD or an explicitly indexed rule required for all work; keep path-specific guidance in a rule whose index specifies its load condition. `paths:` alone does not load it. Delete the duplicate copies.
3. Apply approved dedup via Edit.
> Canonical home: explicitly indexed rule for path-specific facts; CMD or an always-required indexed rule for global facts.

---

## 5f. Delegate compression to brewtools:text-optimize

After 5b/5d/5e, delegate compression of remaining CMD + touched MODCMD + RULES to TO; do not hand-compress.

- Recommend/invoke: `brewtools:text-optimize` auto-detects `AGENTS.md` and `.codex/rules/*.md` as LLM-only files and selects DEEP mode (DICT header + symbol substitution + verification rounds).
- Default invocation (after this phase's edits are approved + applied):
  ```
  $brewtools:text-optimize AGENTS.md
  $brewtools:text-optimize .codex/rules/
  ```
  Multiple files in one call run in parallel: `$brewtools:text-optimize AGENTS.md, <MOD>/AGENTS.md`.
- DIR `aggressive`/`deep` -> pass `-d`; DIR `max`/`extreme`/`atomic` -> pass `-x` (max mode, 2 mandatory verify rounds). Otherwise let auto-detect pick deep for these files.
- TO owns its AskUser/verification; do not duplicate it. RECOMMEND/INVOKE on touched files, then re-count for the report.
> Do NOT inline-reimplement compression. Single source of compression logic = text-optimize.

---

## 5g. Markup / structure pass (all touched docs)

For CMD, MODCMD, LOCAL and RULES edited here: clean heading hierarchy, compact tables/bullets, valid fences and consistent terms. TO covers this structure; do not repeat it on files handled by 5f.

---

## 5h. Re-count + report (this phase's slice of P5 report)

After all approved edits + any text-optimize run:
```bash
wc -l < "$CMD_PATH" | tr -d ' '
```
Report:
- CMD line count: BEFORE -> AFTER (vs optimal/over).
- Non-secret preferences moved: count + LOCAL created/updated + gitignore status; credentials: references changed or unresolved, values never copied.
- Modules split: list of MODCMD written + that root now indexes them.
- Rules dedup: spans removed.
- text-optimize: whether invoked, mode, resulting reduction.
- A one-line flag if any secret was found that predates this run (rotate + history note).

Set `CMD_DECOMPOSED = true` iff 5d wrote/updated at least one MODCMD -- this flag is consumed by the task-tracker agent template addition (ref 02) so the generated agent knows the target's AGENTS.md is decomposed and requires explicit module-guidance reads outside the launch instruction chain.

---

## Gates (this phase)

| Condition | Response |
|-----------|----------|
| OPTIN false | SKIP phase entirely |
| No root AGENTS.md | report + SKIP (do NOT create a root AGENTS.md) |
| User declines a proposal | make NO edit for that sub-step; proceed to next |
| `report only` / dry-run DIR | detection + full plan only; ZERO edits even if "approve" |
| Secret found | mask before tool output; never copy values to LLM files; concrete reference/removal requires approval; gitignore != history purge |
| DIR conflict | surface in AskUser intro; user decides |
| Edits | Edit (not Write), bottom-up by line number; never clobber an existing MODCMD |


## Native user gates

Required approval: main presents a concrete, reviewable proposal in chat and waits for an actual user reply before dependent action. Existing authorization for the same scope remains valid; do not ask again. Optional clarification: use `request_user_input_async` only if exposed, or `request_user_input` only if available in the current runtime/mode, for optional choices and never approval. Otherwise ask in main chat. Delegated agents return unresolved questions to main. Silence, elapsed time and tool errors are not approval.
