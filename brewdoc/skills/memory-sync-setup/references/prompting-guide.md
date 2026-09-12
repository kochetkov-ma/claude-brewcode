<!-- brewcode-meta: version=6.2.0 content_version=6.2.0 generated_by=brewdoc:memory-sync-setup -->
# Prompting Quality Guide

Applied to every INSTRUCTION file the sweep touches - CLAUDE.md at any depth, `.claude/rules/*.md`, the
`AGENTS.md` family, and agent/skill bodies. Never applied to code or docs (those stay owned by `docs/**` and the
doc flow). Cited by every `/memory-sync` batch agent in Phase 2, before it edits anything, the same way
`references/memory-guide.md` is. Current vendor prompting guidance for two audiences reading the SAME projected
file: Claude 5 (Opus 5 / Sonnet 5 / Fable 5.1) reads CLAUDE.md and agent/skill bodies directly; Codex reads the
`AGENTS.md` projection of the same content. A rule tagged `openai-only` fixes something only the AGENTS.md
projection is read against; `claude` fixes something only the Claude-side prompt is read against; `both` applies
to either reading.

---

## Merged rule table

Detect is a grep-able or eyeballed signal; apply the rewrite ONLY where it does not change a fact (see the
lossless guard below). Source keys resolve in the legend at the end.

| # | Rule | Applies | Detect | Rewrite (bad -> good) | Source |
|---|------|---------|--------|------------------------|--------|
| 1 | Role + output contract first; hard constraints in their own section, never folded into the role sentence | both | opening paragraph is scope/procedure/background, not a role sentence + a return-shape line | "You're a specialized assistant that manages calendars and has three tools..." -> "Role: <one sentence>. Return: <shape/fields>." then a separate Scope/Never section | PEBP, SA |
| 2 | State each instruction once - no duplicate reminders across hooks, sections or files | both | the same directive text/keyword fires from two+ places (e.g. a per-prompt hook copy already covered by SessionStart; a rule restated in an agent body) | keep the tightest instance, delete the rest, point the duplicate at the canonical one | CCBP, PEBP, HOOK |
| 3 | Check every rule pair for contradiction before shipping | both | two rows in the same file cannot both be satisfied literally | "never schedule without consent" + "auto-assign the earliest slot" -> "auto-assign, then inform before confirming" | O5 |
| 4 | Positive imperative; keep ONLY a prohibition that guards a named, previously-observed failure | both | a "don't do X" with no incident/postmortem named nearby | reword as "do Y instead"; leave an `!=` row untouched if it (or `avoid.md`) names the incident it prevents | PEBP, avoid.md |
| 5 | Drop scattered ALL-CAPS; at most one true hard-stop word per artifact | both | grep -o for MUST/NEVER/CRITICAL/ALWAYS in caps returns more than one hit in a file | lower-case all but the single guard on an irreversible action | CCBP |
| 6 | No chain-of-thought asks or hand-written step-by-step scaffolding aimed at a reasoning/thinking-enabled model | both | "think step by step", "explain your reasoning", or a numbered thinking scaffold | "think step by step then answer" -> state the goal only; non-thinking models get "consider"/"evaluate", never the literal word "think" | PEBP, O7 |
| 7 | Remove self-verification instructions on a model that already self-verifies | claude | "double-check", "re-verify", "use a subagent to verify" in an Opus-5-targeted prompt | delete it; replace with an explicit scope boundary if one is missing | OPUS5, MIG |
| 8 | Subagent delegation restraint - explicit criterion, low spawn counts, one capable agent until real limits are hit | both | a delegating agent/skill with no stated delegation threshold, or a linear task split across many agents | add "delegate only large/independent/parallelizable work; never delegate a handful of tool calls; never spawn to verify your own work" | OPUS5, O14 |
| 9 | State scope explicitly - never rely on the model to silently generalize one example | both | a rule stated once by example, with no "for every file/case matching X" | name the scope explicitly instead of relying on generalization | SONNET5 |
| 10 | Reference data -> table; a real-dependency procedure -> numbered prose; separate distinct instruction blocks with a heading or tag | both | a table cell hides a multi-step procedure, or two unrelated instruction blocks share no separating heading/tag | split into a table (data) + numbered steps (procedure); wrap each block under its own heading | CCBP, O9 |
| 11 | Concrete example or named reference file over a vague adjective | both | "clean" / "thorough" / "professional" / "good" with no example or file pointer nearby | "write clean code" -> "follow the pattern in `<file>`" or a short before/after snippet | PEBP, SONNET5 |
| 12 | File-size budgets for authored artifacts | both | `wc -w`/`wc -c`: SKILL.md over 500 lines / 2000 words, agent `.md` over 1500 words, hook `additionalContext` over 9000 chars (session) or 500 chars (per-prompt) | move overflow into `references/`; trim the hook string | SKC, HOOK |
| 13 | Explicit numeric/structural length limit on output, never "be concise" alone | both | "be concise" / "keep it short" with no attached number | "answer concisely" -> "<=5 bullets, 1 sentence each" | O6 |
| 14 | `[DICT: ...]` header only above the size threshold that earns it | both | a `[DICT:]` block on a file under ~150 lines, or fewer than 5 abbreviations each reused fewer than 3 times | drop the header and spell terms inline; keep it only at CLAUDE.md / large-rule-file scale | house judgment |
| 15 | AGENTS.md build/size-cap/nested-override mechanics | openai-only | a rule assumes AGENTS.md re-reads mid-session, a root AGENTS.md nears/exceeds 32 KiB, or a nested AGENTS.md restates a root rule instead of overriding it | keep the root short, push subtree specifics into nested AGENTS.md, and state only the override there | O1, O2, O3 |
| 16 | AGENTS.md / CLAUDE.md content is commands, style and conventions - never history, marketing or task state | both | a paragraph of project history, marketing prose or live task state inside CLAUDE.md/AGENTS.md | move history to README; keep only agent-actionable commands and conventions | O4 |
| 17 | Root/system-level rules always outrank a developer-level file; never spend words asserting override authority | both | a developer-level file (CLAUDE.md/AGENTS.md/skill body) claims it can override safety/system rules | delete the assertion; state the actually-desired in-policy behaviour directly | O13 |
| 18 | Explicit stop conditions and safe-vs-unsafe action boundaries for agentic tasks | both | "keep working until done" with no named boundary around a risky/irreversible action | "keep working until done" -> "stop and ask before any <irreversible action>; otherwise continue until resolved" | O10 |

Dropped as redundant rather than merged: R14 (hook reminder cadence) and R16 (state parallelism once) are single
instances of rule 2 above, folded into its detect signal rather than kept as separate rows; R9 (lossless
compression of facts) is not a rewrite rule at all - it IS the guard below.

---

## Lossless guard - what may never change

A rewrite that touches ANY of the following has changed a fact, not just its prose - stop and leave the line as
is:

| Never rewrite away | Examples |
|---------------------|----------|
| Exact paths, flags, thresholds, numeric limits | a glob, a CLI flag, a byte/char cap, a line-count budget |
| Versions and model ids | `6.1.4`, `claude-opus-5`, a pinned dependency version |
| An incident-backed `!=`/NEVER row | anything `avoid.md` or the file's own text ties to a named past failure |
| Canonical mode/verb lists | `status \| install \| upgrade \| enable \| disable \| uninstall \| purge` and similar fixed enumerations |

Compression and de-duplication (rule 2, memory-guide.md's own patterns) still apply on top of this guide -
prompting-quality rewrites and fact/dedup edits share the same file and the same non-growth budget.

---

## Verdict table - what a batch agent returns

Alongside the batch's normal per-file JSON (`references/hard-sync.md` for the `hard` shape), a batch agent that
applied a prompting-quality rewrite lists each one:

```
file :: rule# :: line :: before -> after
```

One row per rewrite, `before`/`after` quoted verbatim and short. A Phase 3 checker re-reads each row against the
rule's `detect` signal and confirms no fact moved.

---

## Stop condition

Stop compressing or rewriting a passage the MOMENT a fact would change - a path, a version, a flag, a threshold, a
model id, an incident-backed prohibition, or a canonical list. Report it as `uncertain` instead of guessing.

---

## Legend

`PEBP`=platform.claude.com/.../claude-prompting-best-practices `OPUS5`=.../prompting-claude-opus-5
`SONNET5`=.../prompting-claude-sonnet-5 `MIG`=.../models/opus-5/migration-guide `CCBP`=code.claude.com/docs/en/best-practices
`SA`=code.claude.com/docs/en/sub-agents `SKC`=`brewcode/agents/skill-creator.md` `HOOK`=`brewcode/hooks/lib/{reminder,utils}.mjs`.
`O1`-`O14` resolve in the OpenAI/Codex rules report cited by this plugin's own prompting refresh; full rationale
for both families is intentionally not duplicated here - it lives with that refresh, not in a shipped reference.
