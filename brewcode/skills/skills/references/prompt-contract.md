# Prompt contract — normative for EVERY skill in this workspace

Applies to every `SKILL.md` shipped by `brewcode` / `brewdoc` / `brewtools` / `brewui`, every skill
under `.claude/skills/`, and every skill TEMPLATE that a `-setup` skill emits into a target repo.
Shared with `/brewcode:skills` (create / improve / review / sync) and `brewcode:skill-creator`.

**The problem it fixes:** a skill whose arguments are positional keys (`<TASK_ID> [full|design]`)
is unusable in practice — nobody types keys. The user writes a sentence. The skill must read the
sentence, resolve the mode and the scope from it, ask at most one clarifying question, then state
what it is about to do before it does it.

---

## 1. Argument shape — prompt FIRST, always

```yaml
argument-hint: "[prompt] [<mode1>|<mode2>|...] [<extras>]"
```

- Position 1 is a **free-form prompt**, RU or EN. Always optional (`[prompt]`, never `<prompt>`) —
  an empty invocation is legal and handled by rule 3.2.
- Mode tokens and flags come AFTER, still accepted in any position for backward compatibility.
- A skill with no modes still declares `[prompt]`: `argument-hint: "[prompt] [--dry-run]"`.
- Never drop an argument that already worked. This contract is **additive**: every hint that used
  to be valid stays valid, the prompt is added in front of it.

## 2. Mode keyword table — required when the skill has more than one mode

Every mode gets EN + RU keywords and a `Mutates?` column, so scoring is deterministic and a
destructive mode is recognisable:

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `status` | *(empty)*, `status`, `check`, `show`, `what` | `статус`, `проверь`, `покажи`, `что` | no |
| ... | ... | ... | yes / yes, destructive |

`brewcode/skills/semble-setup/references/intent-routing.md` is the reference implementation of a
full table plus worked examples — copy its shape, not its keywords.

- The first column may be named for what the skill actually dispatches on — `Mode`, `Verb`,
  `Action`, `Flow`, `Input`. What is load-bearing is the pair of keyword columns plus `Mutates?`:
  that header triple is what `validate-skill.sh` anchors on.
- The table may live in `SKILL.md` **or** in one of the skill's own `references/*.md`, when the
  routing is big enough to deserve its own file (`semble-setup` does exactly this). The
  `## Prompt contract` section must then point at that file instead of duplicating the table.
- Flags (`-n`, `--fix`, `--dry-run`) and targets (`<file.md>`, `<plugin>`) are NOT modes and get
  no rows. A skill whose only alternation is flags/targets is single-mode and needs no table.

## 3. Resolution algorithm — this order, no reordering

1. Strip flags (`-n`, `--noask`, `--dry-run`, ...). They are flags, never modes.
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
   `AskUserQuestion` **only if** the answer changes what gets written or where. A read-only default
   (`status`, a report, a lookup) asks NOTHING and just runs.
6. Ambiguity that would change the outcome is asked BEFORE the work starts: ONE `AskUserQuestion`
   call, max 4 questions. `--noask` / an explicit non-interactive flag suppresses rules 5-6 and the
   skill records the literal `Skipped (--noask)`; it never suppresses a ground-truth STOP (missing
   target, several candidates, destructive confirmation).

> Arguments that do not parse as a mode/id/path are **prose, not an error**. Extract the id, path or
> target from the prose; never treat the first word of a sentence as a positional id.

## 4. PLAN block — printed once, before the first action

After resolution and any clarifying question, and BEFORE the first mutation (read-only modes print
it too, immediately before their report):

```
PLAN — <plugin>:<skill>
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved mode> — <explicit | matched keyword: X | default | checkpoint resume>
SCOPE:  <resolved parameters: paths, target repo, level, project|global, depth, ...>
DO:     <2-5 imperative bullets — what actually happens, in order>
RESULT: <the artifacts or answer the user ends up holding>
```

Rules:

- The five labels are these literal ASCII tokens, in this order. Values follow the conversation
  language (a `{{LANG}}`-parameterised emitted skill follows `{{LANG}}`).
- Header line: `PLAN`, an em dash, then the name **as the user invokes it** — `brewtools:deploy`
  for a plugin skill, bare `docs` / `task-spec` for a project-local or emitted one. Not `--`.
- `MODE` always carries its reason. A user who disagrees can re-run with an explicit mode.
- `SCOPE` names concrete values, not categories: real paths, the real target, the real level.
- One block per invocation. Not repeated per phase, not re-printed after each question.
- No block, or a block printed after work started, is a defect.

## 5. Exemptions

A pure reference / lookup skill that neither mutates anything nor chooses between modes is exempt
from the mode table and the PLAN block; it still accepts `[prompt]` in position 1 and uses it to
scope its answer. Current exemption list, exhaustive:

| Skill | Why |
|-------|-----|
| `.claude/skills/claude-plugin-guide` | pure reference lookup, no modes, no writes — keeps `[prompt]` in its hint |

Anything else missing the prompt-first hint, the keyword table (2+ modes) or the PLAN block is a
defect — `/brewcode:skills review` and `validate-skill.sh` report it.

## 6. Boilerplate to paste into each `SKILL.md`

Insert as the FIRST section of the body (right after the title / one-line summary, before the
phases). Substitute `<plugin>:<skill>`, `<DEFAULT_MODE>` and the table reference; keep the wording.

~~~md
## Prompt contract

Position 1 of `$ARGUMENTS` is a **free-form prompt** (RU/EN) — modes and flags are optional and may
follow in any order. Nobody types keys: resolve mode + scope FROM the prompt.

1. Strip flags. An explicit mode token anywhere wins outright, no scoring.
2. Else score modes by distinct whole-word keyword hits (table above). Highest unique score wins.
   Tie with a destructive mode -> `AskUserQuestion`; tie with `status` -> `status`; tie of two
   mutating modes -> the keyword appearing first; all zero -> `<DEFAULT_MODE>`.
3. Empty arguments -> `<DEFAULT_MODE>`; ask ONE scoping `AskUserQuestion` only when the answer
   changes what gets written. A read-only run asks nothing.
4. Outcome-changing ambiguity -> ONE `AskUserQuestion` (max 4 questions) BEFORE any work.
5. Prose that is not a mode/id/path is still input: extract the id, path or target from it.

Then print this block ONCE, before the first action:

```
PLAN — <plugin>:<skill>
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

Labels are literal; values follow the conversation language.
~~~
