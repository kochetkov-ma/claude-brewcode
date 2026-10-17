# Intent routing — `brewcode:semble-setup`

Normative for `SKILL.md`: strip the `--unattended` flag first (set by `/brewcode:setup-status upgrade`; never a
mode, keyword or name; only `upgrade` honours it, SKILL.md `upgrade`), then lowercase free-text RU/EN `$ARGUMENTS`,
strip punctuation, match whole words; multi-word keywords (`set up`, `turn off`, `удали полностью`) match whole phrases.

## Routing table

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `status` | *(empty input)*, `status`, `doctor`, `check`, `health`, `what`, `show`, `audit` | `статус`, `проверь`, `проверка`, `состояние`, `что стоит`, `покажи`, `здоровье` | no |
| `install` | `install`, `setup`, `configure`, `set up`, `repair`, `fix`, `reconcile`, `init` | `настрой`, `установи`, `поставь`, `почини`, `исправь`, `сконфигурируй` | yes |
| `upgrade` | `upgrade`, `update`, `bump`, `new version` | `обнови`, `апгрейд`, `новая версия` | yes |
| `enable` | `enable`, `on`, `turn on`, `activate` | `включи`, `активируй`, `верни` | yes |
| `disable` | `disable`, `off`, `turn off`, `pause`, `mute` | `выключи`, `отключи`, `пауза`, `приглуши` | yes |
| `uninstall` | `uninstall`, `remove`, `delete integration`, `unwire` | `удали`, `убери`, `сними`, `деинсталлируй` | yes |
| `purge` | `purge`, `wipe`, `remove everything`, `nuke`, `clean cache` | `вычисти`, `снеси`, `удали полностью`, `почисти кеш` | yes, destructive |
| `reindex` | `reindex`, `rebuild`, `refresh`, `reset index`, `warm` | `переиндексируй`, `пересобери`, `обнови индекс`, `прогрей` | yes |
| `optimize` | `optimize`, `tune`, `improve`, `review config` | `оптимизируй`, `настрой лучше`, `улучши` | no by default |
| `resume` | `resume`, `continue`, `verify`, `after reload`, `restarted` | `продолжи`, `возобнови`, `проверь после перезапуска` | yes (verify only) |

## Mode -> script routing

Moved verbatim from `SKILL.md` Step 2; Step N names `SKILL.md` steps.

| Mode | Route |
|------|-------|
| `status` | `semble-status.sh --section all --json` (Step 1 output only) |
| `install` | Step 3: `semble-install.sh all --json` (exit 4 = confirm) -> `all --yes` or the `coreutils --yes` offer -> `semble-mcp.sh detect`/`add`/`repair` -> `semble-guidance.sh install` + `semble-agents.sh apply` -> reload checkpoint |
| `upgrade` | prerequisite + MCP probes -> approved repair -> Step 3.2b block, always -> reload checkpoint only if registration changed or still `awaiting_reload` |
| `enable` | `semble-project.sh enable --yes --json` |
| `disable` | `semble-project.sh disable --yes --json` |
| `uninstall` | `AskUserQuestion` flavour -> `semble-remove.sh <integration\|mcp\|cli> --yes --json` |
| `purge` | `semble-remove.sh purge --yes --confirm-text "purge semble code cache" --json` |
| `reindex` | `semble-project.sh reindex --json` (dry, prints the target) -> confirm -> same with `--yes` |
| `optimize` | read-only `semble-project.sh audit` + `semble-cache.sh info` + `semble-guidance.sh status` + `semble-agents.sh audit` |
| `resume` | Step 4: `semble-state.sh phase verifying` -> `semble-project.sh smoke` -> `semble-guidance.sh install` -> `semble-agents.sh apply` -> `semble-state.sh phase ready` |

## Resolution algorithm — in this order, no reordering

1. **Empty / whitespace-only `$ARGUMENTS` -> `status`** (the default): read-only, no questions, never mutates.
2. If `state.json.phase == "awaiting_reload"` **and** the prompt does not name a mode explicitly -> `resume`.
3. Score each mode by the count of distinct matched keywords. Highest unique score wins.
4. **Tie-break:**
   - Any tie that includes a destructive mode (`uninstall`, `purge`) -> `AskUserQuestion`. Never guess destructive.
   - Non-destructive tie including `status` -> `status` (read-only).
   - Tie between two non-destructive mutating modes (e.g. `install` vs `upgrade`) -> the one whose keyword appears first in the prompt.
   - Score 0 -> `status`; offer two plausible modes in **Detection** and one concrete **Next Step**. Do not ask.
5. Bundle known choices into one `AskUserQuestion` (max 4 questions): (a) destructive tie, (b) four removal
   flavours, (c) concrete MCP scope/args/pin transition, (d) resolved `index-code-config-docs` replacement,
   (e) machine prerequisites, or a concrete user-modified rule/ignore replacement. New destructive or
   permission decisions discovered later require an explicit separate gate unless already authorized.
   The install offer covers `brew install uv` on `all --json` exit `4` and optional `brew install coreutils`
   when listed. On exit `0`, only 3.1d's coreutils offer applies when `.timeout.coreutils.status ==
   "needs_confirmation"` and `.brew.present == true`; otherwise skip it. These offers remain mutually exclusive.

> Print one PLAN (`INPUT`/`MODE`/`SCOPE`/`DO`/`RESULT`) before Step 0 executes. Resolve against known
> context first; unknown checkpoint state makes the initial mode provisional. Step 1's read-only status
> supplies that state; Step 2 refines mode with a short update before Detection/Before or mutation, not a
> second PLAN. Final reasons remain `explicit`, `matched keyword: X`, `default`, `checkpoint resume`.

## Worked examples

| # | Prompt | Resolution | Reason and follow-up |
|---|--------|------------|----------------------|
| E1 | `""` (empty) | step 1 -> `status` | `default`. Read-only `semble-status.sh --section all --json`; no `AskUserQuestion`, no write, not even the state file |
| E2 | `"is semble working?"` | `working` is no keyword -> every mode scores 0 -> `status` (4d) | `no keyword matched (score 0) -> status`. Detection offers `install`/`resume` when absent/awaiting_reload, otherwise `reindex`/`optimize`; Next Step names the single applicable action; no question |
| E3 | `"set up semantic search for this repo"` | `install`: `set up` = 1 (`search` is no keyword), unique | `matched keyword: set up`. Status, then the `install` chain, then the reload checkpoint (PLAN below) |
| E4 | `"rebuild the index"` | `reindex`: `rebuild` = 1 (phrase `reset index` absent), unique | `matched keyword: rebuild`. Rule 5d: one `AskUserQuestion` confirming staged replacement of the resolved `<shared root>/<64-hex>/index-code-config-docs` variant (printed with its size) before `semble-project.sh reindex --yes`; sibling content variants are preserved |
| E5 | `"remove everything"` | `uninstall` (`remove`) 1 vs `purge` (`remove everything`) 1; destructive tie -> `AskUserQuestion` (4a) | The question offers the four removal flavours `integration`, `mcp`, `cli`, `purge`, each with the exact list of what it deletes. `purge` additionally requires the typed confirmation `purge semble code cache` |
| E6 | `"turn off code search"` | `disable`: `turn off` + `off` = 2 distinct, unique | `matched keywords: turn off, off`. Deletes nothing: `state.enabled=false`, phase -> `disabled`; MCP registration, rule, hooks and cache retained; the hooks read `enabled` and go silent |
| R1 | `"снеси всё"` | `purge`: `снеси` = 1 (`сними` != `снеси`), unique, so no routing question | A unique winner != permission: `purge` still needs `--yes` and `--confirm-text "purge semble code cache"`, and the confirmation names every directory that will be deleted |
| R2 | `"обнови"` | `upgrade`: `обнови` = 1; `обнови индекс` is a phrase and does not match a bare `обнови` | `matched keyword: обнови`. Compare with approved `0.6.2`; identical/correct -> MCP half unchanged, project guidance/hooks/permissions/agents still refreshed. State that upgrade refreshes both applicable halves, not the index; offer `reindex` in Detection; Next Step follows the actual post-write status |
| R3 | `"настрой semble"` | `install`: `настрой` = 1; phrase `настрой лучше` does not match | `matched keyword: настрой` |
| R4 | `"переиндексируй проект"` | `reindex`: `переиндексируй` = 1 | Same rule-5d confirmation as E4 |
| R5 | `"удали"` | `uninstall`: `удали` = 1; `удали полностью` needs the full phrase | A unique win still asks the E5 flavour question (5b), each option listing exactly what is deleted and what is kept |
| R6 | `"ну и что дальше"`, phase `awaiting_reload` | step 2 -> `resume`, scoring skipped | `checkpoint resume`. A prompt naming a mode (`"статус"`, `"удали"`) skips step 2 and scores normally |

E3 PLAN:

```
PLAN — brewcode:semble-setup
INPUT:  set up semantic search for this repo
MODE:   install — matched keyword: set up
SCOPE:  required repo=this project root, optional content omitted -> registered code+docs+config corpus
DO:     - probe prerequisites (uv, coreutils)
        - register semble_code MCP at user scope
        - wire rule/hooks/agents; index variant index-code-config-docs
        - write reload checkpoint
RESULT: registered MCP pending a new-session reload, plus the resume command
```

## Additional edge cases

| Prompt | Resolution | Rule |
|--------|------------|------|
| `"покажи статус и почини"` | `status` 2 (`покажи`, `статус`) vs `install` 1 (`почини`) -> `status` by score; offer `install` in Next Step | 3 |
| `"проверь"` + phase `awaiting_reload` | `проверь` names `status` explicitly, so step 2 does not fire -> `status` | 2 |
| `"почисти кеш"` | `purge`: `почисти кеш` = 1 -> `purge`, then the typed confirmation | 3 + 5 |
| `"install and update"` | `install` 1 vs `upgrade` 1, both mutating, neither destructive -> `install` (appears first) | 4c |
| `"check what is installed"` | `status`: `check`, `what` = 2 vs `install`: `install` = 1 -> `status` | 3 |
| `"warm the cache"` | `reindex`: `warm` = 1 -> `reindex`; warm-only is the no-delete path (`semble-project.sh warm`), so skip the rule-5d deletion question | 3 |
| MCP found in two scopes | mutating modes use the bundled keep-scope decision; `status` reports it without asking | 5c |

> When the resolution is not obvious, **Detection** prints the winning mode and its reason (`matched keyword: X` /
> `default` / `checkpoint resume` / `no keyword matched (score 0)`), so a user who disagrees can re-run with an explicit mode.
