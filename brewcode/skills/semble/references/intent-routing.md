# Intent routing — `brewcode:semble`

`$ARGUMENTS` is free text (RU or EN). Lowercase it, strip punctuation, match keywords as **whole words**.
Multi-word keywords (`set up`, `turn off`, `удали полностью`) match as whole phrases.

This file is normative. The router in `SKILL.md` follows it literally.

---

## Routing table

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `status` | *(empty input)*, `status`, `doctor`, `check`, `health`, `what`, `show`, `audit` | `статус`, `проверь`, `проверка`, `состояние`, `что стоит`, `покажи`, `здоровье` | no |
| `setup` | `setup`, `install`, `configure`, `set up`, `repair`, `fix`, `reconcile`, `init` | `настрой`, `установи`, `поставь`, `почини`, `исправь`, `сконфигурируй` | yes |
| `enable` | `enable`, `on`, `turn on`, `activate` | `включи`, `активируй`, `верни` | yes |
| `disable` | `disable`, `off`, `turn off`, `pause`, `mute` | `выключи`, `отключи`, `пауза`, `приглуши` | yes |
| `reindex` | `reindex`, `rebuild`, `refresh`, `reset index`, `warm` | `переиндексируй`, `пересобери`, `обнови индекс`, `прогрей` | yes |
| `optimize` | `optimize`, `tune`, `improve`, `review config` | `оптимизируй`, `настрой лучше`, `улучши` | no by default |
| `update` | `update`, `upgrade`, `bump`, `new version` | `обнови`, `апгрейд`, `новая версия` | yes |
| `remove` | `remove`, `uninstall`, `delete integration`, `unwire` | `удали`, `убери`, `сними`, `деинсталлируй` | yes |
| `purge` | `purge`, `wipe`, `remove everything`, `nuke`, `clean cache` | `вычисти`, `снеси`, `удали полностью`, `почисти кеш` | yes, destructive |
| `resume` | `resume`, `continue`, `verify`, `after reload`, `restarted` | `продолжи`, `возобнови`, `проверь после перезапуска` | yes (verify only) |

---

## Resolution algorithm — in this order, no reordering

1. **Empty / whitespace-only `$ARGUMENTS` -> `status`.** Read-only. No questions. This is the default and it never mutates.
2. If `state.json.phase == "awaiting_reload"` **and** the prompt does not name a mode explicitly -> `resume`.
3. Score each mode by the count of distinct matched keywords. Highest unique score wins.
4. **Tie-break:**
   - Any tie that includes a destructive mode (`remove`, `purge`) -> `AskUserQuestion`. Never guess destructive.
   - Tie between two non-destructive modes where one is `status` -> pick `status` (safe, read-only).
   - Tie between two non-destructive *mutating* modes (e.g. `setup` vs `update`) -> pick the one whose keyword appeared **first** in the prompt.
   - Score 0 for every mode (no keyword matched) -> run `status` and, in the report's **Next Step**, offer the two most plausible modes. Do not ask.
5. `AskUserQuestion` is used at most **once** per invocation, and only for: (a) a destructive tie, (b) an explicit removal request where the four removal flavours are distinguishable, (c) a scope conflict (MCP present in more than one scope), (d) confirming `reindex` deletion of a resolved cache dir, (e) the `setup` install gate — `brew install uv` after `semble-install.sh all --json` exits `4`. Nothing else.

> Step 2 is checked **before** scoring. A checkpointed setup that is waiting for a new session
> takes precedence over a vague prompt — that is how the interrupted flow resumes by itself.

---

## Worked examples — EN (6)

### E1 — `""` (empty; language-neutral)

| Step | Outcome |
|------|---------|
| 1 | empty -> **`status`**, immediately |
| — | reason: `default` |

Read-only `semble-status.sh --section all --json`. No `AskUserQuestion`. No mutation of any kind — not even the state file. This is the single most common invocation.

### E2 — `"is semble working?"`

| Step | Outcome |
|------|---------|
| 1 | not empty |
| 2 | phase != `awaiting_reload` |
| 3 | `working` is not a keyword in any row -> **every mode scores 0** |
| 4d | run **`status`**; **Next Step** offers the two most plausible modes |

reason: `no keyword matched (score 0) -> status`. Next Step lists `setup` (if the MCP is `absent`) and `resume` (if `awaiting_reload`), otherwise `reindex` and `optimize`. Do **not** ask a question here.

### E3 — `"set up semantic search for this repo"`

| Step | Outcome |
|------|---------|
| 3 | `setup`: `set up` = 1. No other row matches (`search` is not a keyword) |
| — | winner **`setup`**, unique |

reason: `matched keyword: set up`. Mutating -> status first, then the setup chain, then the reload checkpoint.

### E4 — `"rebuild the index"`

| Step | Outcome |
|------|---------|
| 3 | `reindex`: `rebuild` = 1. `reset index` does not match (phrase absent) |
| — | winner **`reindex`**, unique |

reason: `matched keyword: rebuild`. Rule 5d applies: one `AskUserQuestion` confirming deletion of the resolved `<code root>/<64-hex>` directory (printed with its size) before `semble-project.sh reindex --yes`.

### E5 — `"remove everything"`

| Step | Outcome |
|------|---------|
| 3 | `remove`: `remove` = 1. `purge`: `remove everything` = 1. Tie 1-1 |
| 4a | the tie includes destructive modes -> **`AskUserQuestion`** |

Never guess. The question offers the four removal flavours from the `remove` semantics (`integration`, `mcp`, `cli`) plus `purge`, each with the exact list of what it deletes. `purge` additionally requires the typed confirmation `purge semble code cache`.

### E6 — `"turn off code search"`

| Step | Outcome |
|------|---------|
| 3 | `disable`: `turn off` + `off` = 2 distinct. No other row matches |
| — | winner **`disable`**, unique, score 2 |

reason: `matched keywords: turn off, off`. `disable` deletes nothing: `state.enabled=false`, phase -> `disabled`, MCP registration / rule / hooks / cache all retained; the hooks read `enabled` and go silent.

---

## Worked examples — RU (6)

### R1 — `"снеси всё"`

| Step | Outcome |
|------|---------|
| 3 | `purge`: `снеси` = 1. `remove` does not match (`сними` != `снеси`) |
| — | winner **`purge`**, unique — no tie, so no routing question |

Unique winner != permission to run. `purge` still needs `--yes` **and** `--confirm-text "purge semble code cache"`, and the confirmation prompt must name every directory that will be deleted.

### R2 — `"обнови"`

| Step | Outcome |
|------|---------|
| 3 | `update`: `обнови` = 1. `reindex`'s `обнови индекс` is a **phrase** and does not match a bare `обнови` |
| — | winner **`update`**, unique |

reason: `matched keyword: обнови`. Compares the recorded pin against the approved `0.5.2`; identical -> report `unchanged` and stop. State plainly in the report that `"обнови"` was read as *update the pinned version*, not *rebuild the index*, and offer `reindex` in **Next Step**.

### R3 — `"настрой semble"`

| Step | Outcome |
|------|---------|
| 3 | `setup`: `настрой` = 1. `optimize`'s `настрой лучше` is a phrase and does not match |
| — | winner **`setup`**, unique |

reason: `matched keyword: настрой`.

### R4 — `"переиндексируй проект"`

| Step | Outcome |
|------|---------|
| 3 | `reindex`: `переиндексируй` = 1 |
| — | winner **`reindex`**, unique |

Same rule-5d confirmation as E4.

### R5 — `"удали"`

| Step | Outcome |
|------|---------|
| 3 | `remove`: `удали` = 1. `purge`'s `удали полностью` needs the full phrase -> no match |
| — | winner **`remove`**, unique |
| 5b | the four removal flavours are distinguishable -> **one `AskUserQuestion`** |

A unique `remove` win still asks *which* removal, because `integration` / `mcp` / `cli` / `purge` differ in what survives. The question lists, per option, exactly what is deleted and what is kept.

### R6 — `"ну и что дальше"` with `state.json.phase == "awaiting_reload"`

| Step | Outcome |
|------|---------|
| 2 | phase is `awaiting_reload` and no mode is named -> **`resume`**, scoring is skipped |

reason: `checkpoint resume`. Had the prompt named a mode (`"статус"`, `"удали"`), step 2 would not fire and normal scoring would run.

---

## Additional edge cases

| Prompt | Resolution | Rule |
|--------|------------|------|
| `"покажи статус и почини"` | `status` 2 (`покажи`, `статус`) vs `setup` 1 (`почини`) -> **`status`** by score; offer `setup` in Next Step | 3 |
| `"проверь"` + phase `awaiting_reload` | `проверь` names `status` explicitly, so step 2 does **not** fire -> **`status`** | 2 |
| `"почисти кеш"` | `purge`: `почисти кеш` = 1 -> **`purge`**, then the typed confirmation | 3 + 5 |
| `"install and update"` | `setup` 1 vs `update` 1, both mutating, neither destructive -> **`setup`** (`install` appears first) | 4c |
| `"check what is installed"` | `status`: `check`, `what` = 2 vs `setup`: `install` = 1 -> **`status`** | 3 |
| `"warm the cache"` | `reindex`: `warm` = 1 -> **`reindex`**; warm-only is the no-delete path (`semble-project.sh warm`), so skip the rule-5d deletion question | 3 |
| MCP found in two scopes, any mode | one `AskUserQuestion`: which scope to keep | 5c |

> When the resolution is not obvious to a reader, the report's **Detection** section must print
> the winning mode **and its reason** (`matched keyword: X` / `default` / `checkpoint resume` /
> `no keyword matched (score 0)`). A user who disagrees can then re-run with an explicit mode.
