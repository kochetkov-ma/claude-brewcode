# Language Policy

RU/EN handling for any doc entering the LLM context. Default: EN. RU survives only where dropping it loses information, never as a courtesy translation.

## RU-drop rule

RU text that duplicates an EN statement already present is redundant weight, not redundancy-as-safety -> drop the RU copy, keep EN. Applies to: parallel paragraphs, bilingual bullet pairs, RU footnote restating an EN rule, RU commit-message-style summary under an EN header.

| Pattern | Action |
|---------|--------|
| RU paragraph immediately after its EN translation, same facts | Drop RU |
| RU column duplicating an EN column in a table (not a keyword column, see carve-out) | Drop RU column |
| RU comment restating EN code comment above it | Drop RU |

## RU-domain exception

RU is KEPT where it IS the content, not a translation of it:

| Case | Example | Why keep |
|------|---------|----------|
| User-facing prompt keywords | `argument-hint` RU keyword list (`сожми`, `максимально`) | Users type these RU words; dropping breaks matching |
| Domain vocabulary | RU legal/medical/product term with no clean EN equivalent | EN paraphrase changes meaning |
| Quoted user text | Verbatim RU request in a bug report or transcript | Quotes must stay verbatim (R.1-class integrity) |
| Identity/preference statements | "User prefers RU error messages in prod logs" | The RU-ness is the fact, not the wrapper |

## CARVE-OUT (verbatim, unmissable)

`brewcode/skills/skills/scripts/validate-skill.sh` check 10 REQUIRES at least 1 Cyrillic character in a skill's mode table. RU keyword columns in skill mode tables are NEVER stripped, at any compression depth.

Grounding — exact check from the script:

```sh
# comment (validate-skill.sh:163-164):
# 10. Mode keyword table: when the skill declares 2+ modes, the table needs a
# Mutates? column and at least one Cyrillic (RU) keyword (contract section 2).
CYR_LOCALE="${LC_ALL:-${LANG:-en_US.UTF-8}}"
echo "$MODE_TABLE" | LC_ALL="$CYR_LOCALE" grep -qE '[а-яёА-ЯЁ]' 2>/dev/null && CYR_OK=1
...
[ "$CYR_OK" -eq 0 ] && MSG="$MSG${MSG:+; }missing Cyrillic (RU) keyword"
check fail "Mode table ($DATA_ROWS modes): $MSG"
```

A mode table with 2+ data rows and zero Cyrillic bytes fails validation (`CYR_OK` stays 0 -> `check fail`). This skill must never propose dropping the last RU cell in such a table, even under `--target=N%`.

## Translation-pair matcher

Decide RU-drop vs RU-keep per RU span:

1. Locate the nearest EN span (same paragraph, same table row, or the immediately adjacent block).
2. Entity overlap: numbers, names, paths, versions in the RU span all also appear in that EN span -> translation pair, candidate for drop.
3. Unique-content check: RU span contains a token NOT in the EN span (a keyword nobody wrote in EN, a quote, a name spelled only in RU) -> standalone, keep regardless of step 2.
4. Column check: RU span sits in a column explicitly labeled `RU`, `keyword`, `RU keyword`, or is part of a `mode`+`keyword` table -> keep unconditionally (carve-out, skip steps 2-3).
5. Ambiguous (no adjacent EN span to compare against) -> treat as standalone content, keep.

Only spans passing steps 2+3 as "pure duplicate, zero unique content, not in a keyword column" are dropped.
