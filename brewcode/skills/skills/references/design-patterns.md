# SK Design Patterns and Structure

## Anatomy

```
skill-name/
├── SKILL.md         # REQ: frontmatter + instructions
├── references/      # OPT: detailed docs (load on demand)
├── examples/        # OPT: working code examples
├── scripts/         # OPT: executable utilities
├── assets/          # OPT: templates, images
└── agents/          # OPT: SA prompts (convention, NOT auto-discovered)
```

> A root-level `SKILL.md` with no `skills/` subdir also surfaces as a valid PLG SK (v2.1.142+).

## Pattern catalog

| Pattern | When | Effect |
|---|---|---|
| **Progressive Disclosure** | Always | 3 levels: L1 name+description (~100 words, always in context), L2 SKILL.md (<500 lines, on trigger), L3 refs/scripts/agents (on demand, unlimited) |
| **REF Splitting** | Multi-mode: 2+ modes, >50 lines/mode, >300 lines total | Detect mode -> Read `references/{mode}.md`. Guard: "not found -> ERROR + STOP" |
| **Agents-as-REFs** | SK-coordinator + multi-step workflow + multiple roles | SA prompts as `.md` in `agents/` inside the SK dir. Coordinator passes the file path; SA reads itself. **0 tokens** in coordinator context. `agents/` is convention, NOT native |
| **Dynamic CTX** | Need live data before launch (git diff, PR info, env) | `` !`command` `` executes BEFORE content reaches Claude |
| **FORK** | Standalone task, no conversation history, <4 phases | `context: fork` -> isolated SA, background by DEF since v2.1.218. SKILL.md body = task prompt. CLAUDE.md loaded, history not. >5 phases -> memory loss |
| **Executable Bash** | Bash blocks must execute | `**EXECUTE**` keyword + `&& echo OK \|\| echo FAIL` + `> STOP if FAIL`. Without the keyword, bash is examples only |
| **SK Chaining** | SK invokes another SK | `Skill(skill="name", args="...")`. Needs no `allowed-tools` entry; a SA keeps `Skill` too (`sa:349`). brewcode preference: chain from main — a `DMI: true` SK invoked from a SA silently no-ops |
| **Background Knowledge** | Claude needs context, user needs no slash cmd | `user-invocable: false`. Description stays in context |
| **Pushy Description** | LLM-invocable skills | Action verb + `Triggers: "phrase1", "phrase2"`. Best odds of auto-load; no published rate |
| **Preloaded Skills** | SA must follow conventions/patterns | `skills: [name]` in agent frontmatter. Full SK injected at startup |

## Agents-as-REFs detail

Pattern from the official Anthropic skill-creator plugin. `agents/` inside an SK dir is NOT
auto-discovered. The coordinator passes a **file path**, not content; the SA reads the `.md` itself.

| Native agents `.claude/agents/` | "Agents" in SK `agents/` |
|---|---|
| Auto-discovered, visible in `/agents` | Reached via Read by path only |
| Own model, tools, hooks, memory | Inherits from the spawning SA |
| YAML frontmatter + Markdown | Plain Markdown (prompt) |
| Public API | SK implementation detail |

Use when: SK-coordinator + 2+ roles + context isolation needed + prompts are implementation detail.

## REF splitting strategy

| Location | Content |
|---|---|
| SKILL.md | Overview, instructions, examples, resource refs |
| references/ | Patterns, API docs, policies |
| scripts/ | Python, JS, Bash (pre-installed packages only) |
| assets/ | Templates, images (not loaded into context) |

When to split — ALL of these true: 2+ modes with different knowledge; >50 lines per mode; >300
lines of reference content combined; <30% of that content is shared across modes.

Loading patterns: conditional/lazy for multi-mode (detect mode -> Read `references/{mode}.md`,
e.g. `superreview-setup`); unconditional single Read for one reference <200 lines (e.g.
`brewtools:text-optimize` always reads `references/rules-review.md`).

3-step pattern: DETECT mode from `$ARGUMENTS`/project analysis -> READ the matching
`${CLAUDE_SKILL_DIR}/references/{mode}.md` -> VALIDATE: not found -> ERROR "Missing REF for
{mode}", STOP.

Anti-patterns: loading ALL refs regardless of mode (fix: detect then load only the match);
inlining mode-specific content >50 lines in SKILL.md (fix: split to `references/{mode}.md`);
Read with no not-found guard (fix: add the STOP guard); generic ref names like `ref1.md` (fix:
name by mode, `references/jvm.md`).

## Resource path resolution — one rule, three cases

| Case | Form | Why |
|---|---|---|
| Prose pointer to a bundled doc ("see X for details") | Markdown link, relative: `[reference.md](reference.md)` | Upstream's own shape (`skills:451-457`) |
| Anything EXECUTED or Read at runtime — scripts, templates, refs the SK opens | `${CLAUDE_SKILL_DIR}` (CSD) | CWD is the session shell's and moves with `cd` (`skills:643`); CSD resolves identically every time and is substituted in `allowed-tools` Bash rules too (`skills:403`) |
| Resource in the plugin but OUTSIDE this SK's dir, or a path handed to an agent | `${CLAUDE_PLUGIN_ROOT}` (BPR) | CSD is the SK subdir, not the plugin root (`skills:398`); an agent gets no CSD at all |

Never a hardcoded absolute path — it breaks on every other install.

```yaml
# Executed -> CSD
bash "${CLAUDE_SKILL_DIR}/scripts/validate.sh" $ARGUMENTS
# Read at runtime -> CSD
Read `${CLAUDE_SKILL_DIR}/references/api-spec.md` before generating the client.
# Prose pointer -> markdown link
For complete API details, see [references/api-spec.md](references/api-spec.md).
```

Path handed to an agent (no CSD there): `Agent(subagent_type="general-purpose", prompt="Read
${CLAUDE_PLUGIN_ROOT}/skills/my-skill/references/rules.md then...")`.

## Executable Bash

Bash blocks are examples unless marked. Template: `**EXECUTE** using Bash tool:` label, a fenced
bash block ending `&& echo "OK" || echo "FAIL"`, then `> **STOP if FAIL**` with recovery steps.

| Rule | Bad | Good |
|---|---|---|
| Label | ` ```bash` | `**EXECUTE**:` ` ```bash` |
| Validate | `command` | `command && echo "OK" \|\| echo "FAIL"` |
| Paths | `${CLAUDE_PLUGIN_ROOT}/skills/x/scripts/y.sh`, or a bare relative `scripts/y.sh` | `${CLAUDE_SKILL_DIR}/scripts/y.sh` — it's executed, so CSD |

## Location priority

| Scope | Path | Git |
|---|---|---|
| Enterprise | Managed settings | N/A |
| Personal | `~/.claude/skills/` | No |
| Project | `.claude/skills/` | Yes |
| Plugin | `<plugin>/skills/` | Yes |

Priority: Enterprise > Personal > Project. Plugin skills invoke as `/plugin-name:skill-name`. Hide
bundled skills via `disableBundledSkills` setting or `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS` env
(v2.1.169+).

> **Output path (v3.4.70):** SK outputs -> `.claude/<subdir>/` (project-relative). Never Write to
> `~/.claude/*` (protected-path blocks ALL modes). Exceptions: `commands|agents|skills|worktrees`.

## Unit test skeleton (Step 8)

For each script in `scripts/`, generate `tests/test-{script-name}.sh` from this skeleton
(replace `SKILL_DIR` with the actual skill dir path) covering: script exists, script executable,
runs without error (`--help`), plus script-specific assertions.

```bash
#!/bin/bash
pass=0; fail=0
check() {
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "PASS: $name"; pass=$((pass+1))
  else
    echo "FAIL: $name"; fail=$((fail+1))
  fi
}
check "script exists" test -f "${SKILL_DIR}/scripts/foo.sh"
check "script executable" test -x "${SKILL_DIR}/scripts/foo.sh"
check "runs --help" "${SKILL_DIR}/scripts/foo.sh" --help
echo "pass=$pass fail=$fail"; [ "$fail" -eq 0 ]
```

Run all tests, fix failures, max 2 cycles:

```bash
for t in "${SKILL_DIR}/tests"/test-*.sh; do
  bash "$t" && echo "OK $(basename "$t")" || echo "FAIL $(basename "$t")"
done
```

STOP after 2 fix cycles -- document failures, proceed to the next step.

## Common creation mistakes

| Mistake | Fix |
|---|---|
| Missing `context: fork` for a standalone task | Add `context: fork` |
| Hardcoded secrets/tokens in scripts or body | Use MCP / environment injection, never a literal |
| Multipurpose skill trying to cover unrelated jobs | Split into focused, single-purpose skills |
| All refs loaded unconditionally in a multi-mode skill | Detect mode -> load only the matching `references/{mode}.md` |
