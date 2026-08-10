<!-- brewcode-meta: version=5.5.1 generated_by=brewdoc:memory-sync-setup -->
# Agent and Skill Re-Audit

The standing best-practice audit `/memory-sync` runs on EVERY agent file and EVERY skill file, on EVERY run, at
every scope and depth. Cited by the emitted skill's agents batch and skills batch. Agents are not merely
fact-checked here - they are held to current best practice.

**Project-specific checks live in the emitted SKILL.md's own check tables.** This file carries only what holds in
any repo; do not restate the project tables here, and do not weaken them with a generic equivalent.

---

## Procedure - per file, before any edit

| # | Step |
|---|------|
| 1 | Read the WHOLE file. A frontmatter-only pass cannot judge tool minimality, scope fit or rule restatement |
| 2 | List what the body actually DOES: which tools it invokes, which paths it claims, which agents it names |
| 3 | Run the checks below against that list - evidence from the repo, never from the file's own claims |
| 4 | Split findings into MECHANICAL (fix now) and RESPONSIBILITY (report only) - see the last section |
| 5 | Apply mechanical fixes as targeted `Edit` diffs, bottom-up by line number, within the non-growth budget |

Evidence is gathered read-only, and from the FILESYSTEM: `git ls-files` is blind to git-ignored trees (in a repo
whose `.gitignore` carries `.claude/` it returns 0 rows and every agent reads as dead), and a git pathspec `*`
crosses `/` while a Claude Code glob does not - so a git probe cannot judge glob correctness either.

```bash
ls .claude/agents/*.md .claude/skills/*/SKILL.md .claude/skills/*/references/*.md 2>/dev/null || true  # roster
grep -n '^tools:\|^allowed-tools:\|^name:\|^model:' "<file>"  # declared contract
grep -oE 'mcp__[a-z0-9_]+__' "<file>" | sort -u               # MCP servers claimed
ls -d "<owned glob>" 2>/dev/null | head -3                    # ownership glob resolves (filesystem, not git)
```

## AGENT files (`.claude/agents/*.md`)

| # | Check | PASS criterion | FAIL action |
|---|-------|----------------|-------------|
| 1 | `name:` vs filename | `name:` equals the filename without `.md` | Fix the frontmatter, never the filename - other files reference the path |
| 2 | `description:` shape | ROLE FIRST in the opening clause, then a concrete trigger list a router can match on | Rewrite role-first; add the real triggers used at the agent's call-sites (skills, CLAUDE.md, other agents) |
| 3 | Trigger concreteness | Triggers are phrases a user would actually type, not a restatement of the role | Replace vague triggers with the phrases the skill/agent is really called by |
| 4 | `tools:` minimality | Exactly the tools the BODY uses - nothing aspirational | Remove a tool used NOWHERE in the body; a read-only recon agent carrying `Write` / `Edit` is a defect, not a convenience. Use IMPLIED by the prose but never named (`Agent`, `Skill`, `WebFetch`) -> REPORT, never strip |
| 5 | Search capability | Any agent that SEARCHES lists `Bash`. On macOS Claude Code, native `Grep` / `Glob` are no-ops, so a searcher without `Bash` cannot search at all | Add `Bash`. Keep `Grep` / `Glob` only as declared fallbacks for non-macOS builds |
| 6 | `model:` | Present only when a non-default model is justified by the work (deep reasoning vs mechanical edits) | Drop an unjustified override; state the justification in one clause where it stays |
| 7 | Ownership globs | Every path or glob the body claims to own resolves to something real today | Repoint at the moved path; the owned surface is gone -> the agent may be dead, REPORT it |
| 8 | MCP tool prefixes | Every `mcp__<server>__*` names a CONFIGURED server in this project's MCP inventory | Remove or repoint the prefix. Tool names WITHIN a live server are not checkable offline - never claim they are |
| 9 | Handoff pointers | Every "hand off to X" / "not mine, see X" names an agent that EXISTS | Repoint at the real owner, or delete the pointer |
| 10 | Scope fit | The body states what the agent does NOT own, and the boundary matches the neighbouring agents' claims | Add the exclusion; overlapping claims between two agents -> REPORT, do not arbitrate silently |
| 11 | Output discipline | The body specifies the shape the agent returns to its caller | Add the return shape; an agent whose output shape is unstated produces unusable results |
| 12 | No rule restatement | The body does not repeat what a rule or convention file already says | DEDUP finding: delete the copy, leave a pointer naming the canonical file and section |

---

## SKILL files (`.claude/skills/**/SKILL.md` and their `references/*.md`)

| # | Check | PASS criterion | FAIL action |
|---|-------|----------------|-------------|
| 1 | `name:` vs directory | `name:` equals the skill's DIRECTORY name | Fix the frontmatter - the directory name is what the invocation resolves |
| 2 | `description:` shape | ONE line, action-first ("Generates...", "Syncs..."), trigger-rich | Rewrite; a multi-line or noun-first description loses the router |
| 3 | `allowed-tools:` | Only tools the body actually uses: no agent-spawn tool if it never spawns, no `Write` / `Edit` if it never writes, no `Bash` if it runs nothing | Trim to actual use |
| 4 | `argument-hint:` | Lists exactly the modes / scopes the body IMPLEMENTS | Sync the hint to the body; a hinted mode with no implementation is a broken promise |
| 5 | Paths in body | Every path and file the body names EXISTS | Repoint or delete; a dead path makes a phase silently unrunnable |
| 6 | Commands in body | Every command runs in this repo today (the binary exists, the script exists, the manifest exists) | Replace with the real command; unverifiable here (a CI-only binary, another machine's path) -> REPORT it, never delete the step |
| 7 | Agent names in body | Every spawned `subagent_type` resolves to a real project agent or a built-in (`Explore` / `Plan` / `general-purpose`) | Replace with a real name - an invented one fails at first run |
| 8 | References, both directions | Every cited `references/*.md` EXISTS, and every existing sibling reference is still CITED | Missing file -> fix the citation. Uncited orphan -> cite it or REPORT it as dead weight |
| 9 | Reference content | Each reference is read by a phase that names it, with a stated reason | An orphaned or never-read reference is context that costs tokens at generation and buys nothing |
| 10 | Placeholder hygiene | A generated skill carries no unresolved generation-time placeholder. EXEMPT: tokens the skill itself documents as resolved at RUN time (its own scope / depth / count / list slots) | REPORT it - a leftover generation-time slot means the generator run did not finish |

---

## Frontmatter drift - verify, never memorize

The agent and skill frontmatter contract CHANGES between Claude Code versions: keys are added, renamed and
retired. Do not audit against a remembered key set.

| Rule | Detail |
|------|--------|
| Source of truth | The project's OWN current spec / authoring docs, or the keys the working files in this repo actually carry |
| Unknown key | REPORT it, never strip it - it may be newer than your knowledge. Equally, never ADD a key you cannot point at in the spec or in a sibling file |
| Missing key | Add only if the project's other files of the same kind carry it. A key present in 1 of 20 files is a candidate for DELETION, not for propagation |
| Consistency | Where a key is a house invariant (a date stamp, a doc-type marker), it must be present and current in every file of that kind |

---

## Fix vs report

| Class | Handling |
|-------|----------|
| MECHANICAL - apply the fix | `name:` mismatch (agent-1, skill-1), role-first description with concrete triggers (agent-2, agent-3), unjustified `model:` override (agent-6), dead path or glob (agent-7, skill-5), a tool entry used NOWHERE in the body (agent-4), missing `Bash` on a searcher (agent-5), dead MCP server prefix (agent-8), broken reference citation and uncited orphan reference (skill-8, skill-9), restated rule replaced by a pointer (agent-12), date stamp, wording compressed |
| RESPONSIBILITY - report only | Anything that changes WHAT an agent owns or does: widening or narrowing its scope, retargeting its ownership globs to a different subsystem, merging or splitting agents, deleting an agent whose surface is gone, resolving two agents that claim the same seam, ADDING a missing output shape (agent-11 - authoring, and it spends the non-growth budget), stripping a tool whose use is implied in prose but never named |

A responsibility change is a design decision. State the finding, the evidence, and the proposed change in the
report, and let the user decide. Silently rewriting an agent's role removes a capability nobody knows is gone.

Every audit finding, fixed or reported, names the FILE and the CHECK number above, so a Phase 3 checker can
re-run exactly that check without re-deriving the judgement.

## Reporting shape

Returned alongside the batch's normal per-file JSON:

```
"<path>": {
  "audit_fixed":    [ {"check": "agent-5", "was": "<text>", "now": "<text>"} ],
  "audit_reported": [ {"check": "agent-10", "finding": "<text>", "evidence": "<command or path>"} ]
}
```

An empty `audit_fixed` and `audit_reported` on every file means the roster is clean - state that explicitly in
the report. A silent audit section reads as an audit that never ran.
