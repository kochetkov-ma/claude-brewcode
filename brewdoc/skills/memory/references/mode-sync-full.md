# Mode: FULL (memory sync + agents + skills)

> `full` = the whole `sync` pass over memory, PLUS a sync of the agent roster and the skill roster,
> run in-place by this skill. Same prime directive everywhere: **delete first, shrink, never grow.**

## Step F0 — Announce the plan

```
Mode: full — memory sync + agent roster sync + skill roster sync
Emphasis: <from the prompt, or "none">
```

## Step F1 — Memory sync

Read `${CLAUDE_SKILL_DIR}/references/mode-sync.md` and execute S0..S5 in full (whole surface:
memory files, root + **nested** CLAUDE.md, rules, conventions).

Stop here if the confirmation gate (S4) is cancelled — do not call the siblings.

## Step F2 — Roster sync (agents + skills), run in-place

> Do NOT try `Skill(skill="brewcode:agents"|"brewcode:skills")`. Both are
> `disable-model-invocation: true` — only a human can invoke them, a skill cannot; and brewdoc
> must work when brewcode is not installed at all. Their standalone equivalents for the user are
> `/brewcode:agents sync` and `/brewcode:skills sync` — mention them in F4, don't call them.

Targets — repo-local only (`~/.claude/**` out of scope unless the user names global; disabled
`_name.md` / `_SKILL.md` skipped and listed as skipped):

| Roster | Paths |
|--------|-------|
| agents | `.claude/agents/*.md`, `*/agents/*.md` |
| skills | `.claude/skills/*/SKILL.md`, `*/skills/*/SKILL.md` — each **with its `references/*.md`** |

Apply the SAME prime directive, the SAME S1 verdicts and the SAME S2 fan-out shape (one subagent
per file, <= 8 per batch, longest first) from `mode-sync.md`. Three deltas only:

| Delta | Detail |
|-------|--------|
| CONTEXT | give each subagent the F1 ground truth **plus** `{ELSEWHERE}` = facts now owned by CLAUDE.md / rules, so the artifact deletes its copy instead of restating it (rules auto-load; an artifact pays the tokens again) |
| ROLE | `subagent_type="brewcode:agent-creator"` / `"brewcode:skill-creator"` when brewcode is installed, else `"general-purpose"` |
| !=touch | frontmatter `name` + `description` contract, `allowed-tools`, and instructions that are still true — sync fixes knowledge, it does not redesign the artifact |

Sequence: F1 must finish first (its ground truth feeds F2). Agents and skills are independent of
each other — batch them together in one fan-out.

## Step F3 — Cross-layer dedup

After both return, one final pass by the orchestrator:

| Check | Action |
|-------|--------|
| a fact now lives in BOTH memory/rules AND an agent/skill file | keep it in the rule layer, delete from the artifact (rules auto-load; artifacts pay the tokens again) |
| an agent/skill restates a nested CLAUDE.md fact for its subtree | delete from the artifact |
| a rule exists only to explain a deleted agent/skill | delete the rule |

## Step F4 — Merged report

```
# memory [full]
## 1. Memory
<the S5 report verbatim>
## 2. Agents
<F2 agent-roster table: file | lines before -> after | fixed | deleted | added>
## 3. Skills
<F2 skill-roster table: file | lines before -> after | fixed | deleted | added>
## 4. Cross-layer dedup
| Fact | Kept in | Deleted from |
## Totals
| Layer | Files | Lines before | Lines after | Delta |
| memory+rules+CLAUDE.md | | | | |
| agents | | | | |
| skills | | | | |
| **All** | | | | **-<N>** |
## Next Steps
```

**Grand total delta MUST be <= 0.** Then remind the user to run `/docs` for any artifact whose
behaviour (not just wording) changed.
