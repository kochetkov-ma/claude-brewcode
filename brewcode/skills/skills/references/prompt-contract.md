# Prompt contract — normative for EVERY skill in this workspace

Applies to every `SKILL.md` shipped by `brewcode` / `brewdoc` / `brewtools` / `brewui`, every skill
under `.claude/skills/`, and every skill template a `-setup` skill emits into a target repo.
Used by `/brewcode:skills` and `brewcode:skill-creator`.

Why: nobody types positional keys (`<TASK_ID> [full|design]`); the user writes a sentence. The skill
resolves mode and scope from it, asks at most one clarifying question, then states what it is about
to do before doing it.

## Canonical section — the FIRST body section of every `SKILL.md`

A skill loads alone and never sees this file: its section carries the operative rules, sections 1-5
the reasons and edge cases. Fill the `<slots>`, keep the wording:

~~~md
## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; mode tokens and flags may sit anywhere in it.

1. Mode: an explicit mode token wins outright; else the most distinct whole-word keyword hits
   (<table>). Tie with a destructive mode -> `AskUserQuestion`; with `status` -> `status`; of two
   mutating modes -> the keyword that comes first. No hit or empty -> `<DEFAULT_MODE>`.
2. Scope: prose that is not a mode/id/path is still input: take the id, path or target from it.
3. Ask: at most ONE `AskUserQuestion` (max 4 questions), before any work, only when the answer
   changes what gets written. A read-only run asks nothing.

Print once, before the first action (labels literal, values in the conversation language):

```
PLAN — <plugin>:<skill>
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```
~~~

| Slot | Fill with |
|------|-----------|
| `<table>` | `table below`, `table in P0`, a `references/*.md` — or the table itself, placed under the first line |
| `<DEFAULT_MODE>` | the documented default with its condition (`status` if installed, else `install`) |
| rules 1-3 | the clause above plus only what this skill adds: named flags, own tie or default, what Scope extracts, its one question. Single-mode skill: rule 1 is `Mode: single — <mode>` |
| print line | the skill's own moment (`before Phase 3`); its language rule if different |
| `SCOPE:` / `RESULT:` | this skill's concrete parameters and artifacts |

## 1. Argument shape — prompt FIRST, always

```yaml
argument-hint: "[prompt] [<mode1>|<mode2>|...] [<extras>]"
```

- Position 1 is a **free-form prompt**, RU or EN. Always optional (`[prompt]`, never `<prompt>`) —
  an empty invocation is legal and handled by step 3.5.
- Mode tokens and flags come after it and are accepted in any position.
- A skill with no modes still declares `[prompt]`: `argument-hint: "[prompt] [--dry-run]"`.
- The contract is additive: never drop an argument that already worked, add the prompt in front of it.

## 2. Mode keyword table — required when the skill has more than one mode

Every mode gets EN + RU keywords and a `Mutates?` column, so scoring is deterministic and a
destructive mode is recognisable:

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `status` | *(empty)*, `status`, `check`, `show`, `what` | `статус`, `проверь`, `покажи`, `что` | no |
| ... | ... | ... | yes / yes, destructive |

`brewcode/skills/semble-setup/references/intent-routing.md` is the reference implementation of a
full table plus worked examples — copy its shape, not its keywords.

- The first column may be named for what the skill dispatches on — `Mode`, `Verb`, `Action`,
  `Flow`, `Input`. `validate-skill.sh` anchors on the header triple: both keyword columns plus `Mutates?`.
- The table lives in `SKILL.md` (inside the section or in a later one) or in one of the skill's own
  `references/*.md` when the routing deserves its own file (`semble-setup`); the section then
  points at that file instead of duplicating the table.
- Flags (`-n`, `--fix`, `--dry-run`) and targets (`<file.md>`, `<plugin>`) are not modes and get
  no rows. A skill whose only alternation is flags/targets is single-mode and needs no table.

## 3. Resolution algorithm — this order, no reordering

Full form of canonical rules 1-3: rule 1 = steps 1-4 + the default of 5, rule 2 = the note below,
rule 3 = steps 5-6.

1. Strip flags (`-n`, `--noask`, `--dry-run`, ...): never modes.
2. An explicit mode token anywhere in the arguments wins outright — no scoring.
3. Otherwise score every mode by the count of **distinct whole-word** keyword hits in the prompt
   (multi-word keywords match as whole phrases). Highest unique score wins.
4. Tie-break, in order:
   - tie involving a destructive mode -> `AskUserQuestion`. Never guess destructive.
   - tie where one side is read-only (`status`) -> read-only wins.
   - tie of two mutating non-destructive modes -> the keyword appearing FIRST in the prompt.
   - every mode scores 0 -> the skill's documented default mode, and name the two most plausible
     alternatives in the report's Next Step.
5. Empty / whitespace-only arguments -> the documented default mode. Then ONE scoping
   `AskUserQuestion` only if the answer changes what gets written or where. A read-only default
   (`status`, a report, a lookup) asks nothing and just runs.
6. Outcome-changing ambiguity is asked before the work starts: ONE `AskUserQuestion` call, max 4
   questions. `--noask` / an explicit non-interactive flag suppresses steps 5-6 and the skill
   records the literal `Skipped (--noask)`; it never suppresses a ground-truth STOP (missing
   target, several candidates, destructive confirmation).

> Arguments that do not parse as a mode/id/path are **prose, not an error**. Extract the id, path or
> target from the prose; never treat the first word of a sentence as a positional id.

## 4. PLAN block — printed once, before the first action

The block of the canonical section, printed after resolution and any clarifying question, before the
first mutation; a read-only mode prints it immediately before its report.

- The five labels are literal ASCII tokens in this order. Values follow the conversation language
  (a `{{LANG}}`-parameterised emitted skill follows `{{LANG}}`).
- Header line: `PLAN`, an em dash (not `--`), then the name as the user invokes it — `brewtools:deploy`
  for a plugin skill, bare `docs` / `task-spec` for a project-local or emitted one.
- `MODE` carries its reason (`explicit`, `matched keyword: X`, `default`, `checkpoint resume`), so a
  user who disagrees can re-run with an explicit mode.
- `SCOPE` names concrete values, not categories: real paths, target repo, level, `project|global`, depth.
- `DO` lists what actually happens, in order.
- One block per invocation: not repeated per phase, not re-printed after a question. No block, or a
  block printed after work started, is a defect.

## 5. Exemptions

A pure reference / lookup skill that neither mutates anything nor chooses between modes is exempt
from the section, the mode table and the PLAN block; it still accepts `[prompt]` in position 1 and
uses it to scope its answer. Exhaustive list (mirrored by `is_exempt_skill` in `validate-skill.sh`):

| Skill | Why |
|-------|-----|
| `.claude/skills/claude-plugin-guide` | reference lookup, no modes, no writes |

Any other skill missing the prompt-first hint, the section, the keyword table (2+ modes) or the PLAN
block is a defect reported by `/brewcode:skills review` and `validate-skill.sh`.
