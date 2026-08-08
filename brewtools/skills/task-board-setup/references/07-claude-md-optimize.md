# 07 -- Step 5 (optional): CLAUDE.md optimization

[DICT: CMD=root CLAUDE.md, LOCAL=CLAUDE.local.md, MOD=module/subproject, MODCMD=module-level CLAUDE.md, RULES=.claude/rules/*.md, BUDGET=line budget, TO=brewtools:text-optimize skill, DIR=free-text prompt directive]

OPTIONAL, opt-in phase. PROPOSE-ONLY: every change is gated behind AskUserQuestion; never restructure without explicit approval. Runs AFTER the board is scaffolded + verified (P5), only if the user opted in at P0. Replaces the legacy "do NOT touch CLAUDE.md" stance: this phase is the SANCTIONED, gated way to touch it.

> **Verified lazy-loading mechanic (source: code.claude.com/docs/en/memory, fetched 2026-06-14).** Bake this into every proposal rationale:
> - Root CMD + all ancestor CLAUDE.md/CLAUDE.local.md: **loaded in full AT LAUNCH**, every session, regardless of length.
> - Subdirectory (nested) CLAUDE.md: **NOT loaded at launch -- loaded ON-DEMAND when Claude reads a file in that subtree.**
> - `@path` imports: **EAGER -- expanded into context at launch.** They help organization but do NOT reduce root context.
> - `.claude/rules/*.md` with `paths:` FM: on-demand when matching files are touched; without `paths:`: at launch.
> CONSEQUENCE: to shrink always-on context, push MOD detail into a NESTED MODCMD. NEVER use `@import` for that goal (eager = no savings). This is the justification stated to the user in the module-split proposal.

---

## Inputs

From P0:
- `TARGET` (abs path).
- `DIR` = the free-text prompt directive parsed from `$ARGUMENTS` (may be empty). Tunes which sub-steps run / how aggressive they are. See "Directive influence" below.
- `OPTIN` = whether the user opted into this phase (asked at P0).

If `OPTIN` is false -> SKIP this entire file; do nothing.

---

## Directive influence (DIR)

`DIR` is free text. Match case-insensitive substrings to toggle sub-steps. Default = all sub-steps ENABLED (still each individually AskUser-gated). DIR only flips which sub-steps are OFFERED; it never bypasses a gate.

| DIR hint (substring) | Effect |
|----------------------|--------|
| `skip module split`, `no module`, `no nested` | disable 5d (module split) |
| `skip local`, `no local`, `keep secrets inline` | disable 5b (local-only extraction) -- but STILL warn if hard secrets found |
| `skip dedup`, `no dedup`, `skip rules` | disable 5e (rules dedup/compress) |
| `also dedupe rules`, `dedup rules` | force-enable 5e even if other hints narrow scope |
| `budget N`, `max N lines`, `target N` | override BUDGET_OPTIMAL=N (and OVER=N*1.5 rounded) |
| `aggressive`, `max compress`, `deep` | pass `-d` (or `-x` only if `max`/`extreme`/`atomic` present) to TO in 5e/5f |
| `report only`, `dry run`, `propose only` | run 5a detection + present a full plan, but make NO edits even if approved -- emit plan as the deliverable |
| anything else | record as free-form intent; apply best-effort to phrasing of proposals, do NOT invent new behaviors |

If DIR is ambiguous or conflicts (e.g. `skip rules` + `also dedupe rules`), surface the conflict in the P5.5 AskUser intro and let the user pick.

---

## 5a. Detect (read-only scan, NO edits)

Locate the root CMD: prefer `TARGET/CLAUDE.md`, else `TARGET/.claude/CLAUDE.md`. If neither exists -> there is nothing to optimize; report "no root CLAUDE.md found" and SKIP the rest (do NOT create a root CLAUDE.md -- out of scope for this phase).

**EXECUTE** using Bash tool (read-only):
```bash
CMD=""
for c in "$TARGET/CLAUDE.md" "$TARGET/.claude/CLAUDE.md"; do test -f "$c" && CMD="$c" && break; done
test -n "$CMD" && wc -l < "$CMD" | tr -d ' ' && echo "CMD=$CMD" || echo "NO_CMD"
ls "$TARGET/.claude/rules/"*.md 2>/dev/null || echo "NO_RULES"
test -f "$TARGET/CLAUDE.local.md" && echo "LOCAL_EXISTS" || echo "LOCAL_ABSENT"
```

Then `Read` the CMD (and each `RULES` file) into context. Produce a DETECTION object (no writes):

```
CMD_PATH    = <abs>
CMD_LINES   = <int>                # current line count
BUDGET_OPTIMAL = 200               # or DIR override
BUDGET_OVER    = 300               # or DIR override (optimal*1.5)
OVER        = CMD_LINES > BUDGET_OVER         # bool
LOCAL_ITEMS = [ {line, snippet, kind} ... ]   # see 5b heuristics
MODULES     = [ {dir, why, has_own_cmd} ... ] # see 5d detection
RULES       = [ {path, lines} ... ]
DUP_SPANS   = [ {a, b, overlap_summary} ... ] # cross-file dup/overlap, see 5e
```

Report CMD_LINES vs BUDGET_OPTIMAL/BUDGET_OVER up front (current vs target), regardless of whether any proposal follows.

### Module detection (for MODULES)
A repo subtree is a MOD candidate if it has its own manifest / build / package boundary. Signals (any): `package.json`, `pom.xml`/`build.gradle`, `pyproject.toml`/`setup.py`, `go.mod`, `Cargo.toml`, `Makefile`, a `src/` of its own, or a workspace member (npm/pnpm/yarn workspaces, gradle subproject, cargo workspace, go work). Skip dirs in EXCLUSIONS only if EXCLUSIONS means "don't WRITE" -- here writing a MODCMD inside a source module IS allowed (a MODCMD is doc, not source). Record `has_own_cmd` = whether `<dir>/CLAUDE.md` already exists.

### Local-only detection heuristics (for LOCAL_ITEMS)
Scan CMD lines for items that should NOT be in a team-shared, committed file:
| kind | heuristic |
|------|-----------|
| secret | `password`, `passwd`, `secret`, `token`, `api[_-]?key`, `bearer`, `BEGIN .*PRIVATE KEY`, AWS-style `AKIA[0-9A-Z]{16}`, long base64/hex blobs assigned to a var |
| abs machine path | absolute paths under `/Users/<name>/`, `/home/<name>/`, `C:\Users\`, `/opt/<host-specific>` -- machine/user-specific, not repo-relative |
| host/user config | personal localhost ports/URLs, `localhost:<port>` sandbox URLs, `~/.ssh`, hostnames, personal emails, "my " sandbox/test data |
NEVER print full secret values back to the user in the proposal -- mask (`sk-...AB12`). Flag line numbers + masked snippet + kind.

---

## 5b. PROPOSE: extract local-only items -> CLAUDE.local.md  (gated)

If `DIR` disabled 5b: skip, BUT if any `kind=secret` was found, still emit a one-line warning ("hard secrets detected in committed CLAUDE.md; consider re-running without skip-local").

If LOCAL_ITEMS non-empty, AskUserQuestion:

> **Found N local-only items in committed CLAUDE.md** (secrets / machine paths / host config). These leak into every teammate's context and (for secrets) into git. Propose: move them to `CLAUDE.local.md` (gitignored, loaded only for you), leaving CMD clean.
> - Move all N to CLAUDE.local.md (create it + add to .gitignore)
> - Let me pick which to move
> - Leave as-is (do not touch)

On approval:
1. If `CLAUDE.local.md` absent -> create it at `TARGET/CLAUDE.local.md` with a header `# Local-only (gitignored) -- machine/user-specific, not committed`.
2. Append the approved items (verbatim values) under topical headings.
3. Remove them from CMD (Edit, not Write; bottom-up by line number).
4. Ensure `CLAUDE.local.md` is gitignored:
   ```bash
   grep -qxF "CLAUDE.local.md" "$TARGET/.gitignore" 2>/dev/null || echo "(needs .gitignore entry)"
   ```
   If missing, propose adding `CLAUDE.local.md` to `.gitignore` (one more AskUser line, or include in the same approval). Do NOT silently edit .gitignore without the user's yes.
> If a secret was already committed, note to the user that gitignoring does NOT purge history -- they should rotate the secret. Do not attempt history rewrite.

---

## 5c. PROPOSE: line-budget decomposition  (gated, only if OVER)

Report always: `CLAUDE.md is <CMD_LINES> lines (optimal ~<BUDGET_OPTIMAL>, over at <BUDGET_OVER>).`

If NOT OVER: state it's within budget; offer optional tidy (markup pass 5g) but propose no decomposition.

If OVER: assemble a concrete decomposition PLAN combining 5d (module split), 5e (rules dedup), 5f (compress), then AskUser ONCE with the whole plan before applying any of it:

> **CLAUDE.md is <CMD_LINES> lines (over the <BUDGET_OVER> ceiling; optimal ~<BUDGET_OPTIMAL>).** Proposed decomposition to get back under budget:
> 1. Move detail for modules `<M1, M2, ...>` into per-module CLAUDE.md (loaded on-demand, shrinks always-on context). Root keeps a 2-line module index.  [est -X lines]
> 2. Move topic blocks `<...>` into path-scoped `.claude/rules/*.md` (load only when matching files are touched).  [est -Y lines]
> 3. Dedup overlap with existing rules `<...>`; delete duplicated spans.  [est -Z lines]
> 4. Deep-compress the remainder via brewtools:text-optimize.  [est -W lines]
> Projected: <CMD_LINES> -> ~<TARGET_LINES>.
> - Apply the full plan
> - Apply only steps I pick
> - Skip decomposition (leave CLAUDE.md as-is)

Apply ONLY approved steps. Each sub-step (5d/5e/5f) below still narrates what it does, but execution is gated by THIS approval (do not re-ask per sub-step unless the user chose "only steps I pick", then confirm the subset).

---

## 5d. Module split -> nested module CLAUDE.md  (part of 5c plan; disabled if DIR says skip)

For each approved MOD in MODULES:
1. Gather the CMD content that is module-specific (build/test cmds, layout, conventions for that subtree).
2. Write/extend `<MOD.dir>/CLAUDE.md` (a NESTED file -- this is what gives on-demand loading). If `has_own_cmd`, MERGE (Edit), do not clobber. Improve markup (headers, tables, bullets).
3. In the ROOT CMD, REPLACE the moved block with a MAX-COMPRESSED index: a couple of lines, e.g.:
   ```
   ## Modules (each has its own CLAUDE.md, loaded on-demand when you work in it)
   | Module | Path | Owns |
   |--------|------|------|
   | api    | services/api/  | handlers, OpenAPI, db migrations |
   | web    | apps/web/      | UI, build, e2e |
   ```
   Keep ONLY the index in root; the detail lives in the MODCMD.
> Rationale to state in the proposal: nested CLAUDE.md loads ONLY when Claude touches that subtree, so module detail leaves the always-on root context. Do NOT use `@import` here -- imports are eager and would not save context.
> Do NOT move CROSS-cutting / repo-wide rules into a single module; those stay in root or go to a `.claude/rules/*.md`.

---

## 5e. Rules dedup + compress  (disabled if DIR says skip; forced if DIR says also dedupe rules)

1. From DUP_SPANS, identify content duplicated or overlapping across `.claude/rules/*.md` and between rules and CMD.
2. PROPOSE (folded into 5c plan, or its own AskUser if 5c not triggered): single-source each fact. Keep repo-wide invariants in CMD or an unscoped rule; keep path-specific guidance in a `paths:`-scoped rule. Delete the duplicate copies.
3. Apply approved dedup via Edit.
> Single-source-of-truth: a fact in two places drifts; pick the correct home (path-scoped rule for path-specific, CMD/unscoped rule for global).

---

## 5f. Delegate compression to brewtools:text-optimize

After structural moves (5b/5d/5e), the remaining CMD + touched MODCMD + RULES should be token-compressed by the dedicated skill, NOT hand-compressed here.

- Recommend/invoke: `brewtools:text-optimize` auto-detects `CLAUDE.md` and `.claude/rules/*.md` as LLM-only files and selects DEEP mode (DICT header + symbol substitution + verification rounds).
- Default invocation (after this phase's edits are approved + applied):
  ```
  /brewtools:text-optimize CLAUDE.md
  /brewtools:text-optimize .claude/rules/
  ```
  Multiple files in one call run in parallel: `/brewtools:text-optimize CLAUDE.md, <MOD>/CLAUDE.md`.
- DIR `aggressive`/`deep` -> pass `-d`; DIR `max`/`extreme`/`atomic` -> pass `-x` (max mode, 2 mandatory verify rounds). Otherwise let auto-detect pick deep for these files.
- text-optimize has its OWN AskUser/verification; do not duplicate it here. This phase's job is to RECOMMEND/INVOKE it on the touched files, then re-count lines for the final report.
> Do NOT inline-reimplement compression. Single source of compression logic = text-optimize.

---

## 5g. Markup / structure pass (all touched docs)

For every doc this phase wrote or edited (CMD, MODCMD, CLAUDE.local.md, touched RULES): ensure headers form a clean hierarchy, prose -> tables/bullets where it compresses, code fences valid, consistent terminology. This is light and folds into text-optimize's structural rules; do not double-apply if 5f ran on the same file.

---

## 5h. Re-count + report (this phase's slice of P5 report)

After all approved edits + any text-optimize run:
```bash
wc -l < "$CMD_PATH" | tr -d ' '
```
Report:
- CMD line count: BEFORE -> AFTER (vs optimal/over).
- Local-only items moved: count + that CLAUDE.local.md was created/updated + gitignore status.
- Modules split: list of MODCMD written + that root now indexes them.
- Rules dedup: spans removed.
- text-optimize: whether invoked, mode, resulting reduction.
- A one-line flag if any secret was found that predates this run (rotate + history note).

Set `CMD_DECOMPOSED = true` iff 5d wrote/updated at least one MODCMD -- this flag is consumed by the task-tracker agent template addition (ref 02) so the generated agent knows the target's CLAUDE.md is decomposed/lazy-loaded.

---

## Gates (this phase)

| Condition | Response |
|-----------|----------|
| OPTIN false | SKIP phase entirely |
| No root CLAUDE.md | report + SKIP (do NOT create a root CLAUDE.md) |
| User declines a proposal | make NO edit for that sub-step; proceed to next |
| `report only` / dry-run DIR | detection + full plan only; ZERO edits even if "approve" |
| Secret found | mask in output; on move, warn that gitignore != history purge; never echo full value |
| DIR conflict | surface in AskUser intro; user decides |
| Edits | Edit (not Write), bottom-up by line number; never clobber an existing MODCMD |
