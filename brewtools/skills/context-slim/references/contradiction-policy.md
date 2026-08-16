# contradiction-policy

Entered from `dedup-arbitration.md` 3d whenever two near-identical statements carry a DIFFERING exact value.
A contradiction is never resolved by dedup: one side is FALSE and must die, or both are true at different scopes.

## 1. Classification

| Class | Test | Action |
|-------|------|--------|
| CONTRADICTION | same subject, same scope, incompatible exact values (version, count, flag, path, yes/no) | ladder, section 2 |
| OVERLAP | same subject, values compatible, one merely wider | `dedup-arbitration.md` verdict SUPERSET/SUBSET |
| STALE-BUT-CONSISTENT | both true when written; one carries an older `verified <date>` / CC version and no live claim conflicts | keep the newer, delete the older, ledger. !=escalate |
| SCOPED-DIFFERENT | subjects differ by an unstated qualifier (build, OS, plugin, env flag) | NOT a contradiction: add the missing qualifier to the vaguer statement, keep both |

Same-fact-different-audience (a hook line a subagent needs vs a CLAUDE.md line it never sees) is NOT a
contradiction and NOT a duplicate. Keep both.

## 2. Resolution ladder

| Step | Condition | Do |
|------|-----------|----|
| 1 | Verifiable against code / filesystem / a pinned version | Run the check. Keep the TRUE statement, delete the FALSE one, ledger `kept <- dropped` with the command and its output |
| 2 | Verifiable only against an external fact (registry, upstream release) | Verify, then step 1. Unreachable network -> **step 2b, never step 3** |
| 2b | The check is possible in principle but not right now (no network, missing credential, tool absent, budget exhausted) | **DEFER.** Keep BOTH statements unchanged, add no qualifier, delete nothing. Report the row as `deferred: <what could not be run>`, with the exact command a later run should execute. A deferral is a normal outcome, not a failure |
| 3 | UNVERIFIABLE -- and only after the budget below is spent | DELETE the weaker statement (older date, no evidence, vaguer scope). Pre-decided by the user; !=ask again |
| 4 | Both unverifiable and equally weighted | Keep the one in the higher-precedence layer (lattice L0>L1>L2>L3), delete the other |

### What "unverifiable" means -- operational definition

A statement is UNVERIFIABLE only when **every** applicable check below was attempted in THIS run and
none of them could decide it. Not-attempted != unverifiable. Not-reachable != unverifiable (that is
step 2b). "I did not think of a check" != unverifiable.

| # | Check | Applies when the claim mentions | Evidence recorded |
|---|-------|--------------------------------|-------------------|
| 1 | Read the file / path / key it names | a path, filename, frontmatter key, config key | the `sed -n`/`jq` command + its output |
| 2 | `grep -c` / `rg -c` the repo for the asserted count, flag, symbol or literal | a count, a flag, an identifier, "all N files" | the command + the number it returned |
| 3 | Run the command it prescribes, or `--help`/`--version` on the binary | a CLI, an exit code, a script behaviour | the invocation + exit code |
| 4 | Check the version/pin at its source (`package.json`, `plugin.json`, lockfile, installed binary) | a version, a pin, "since X.Y.Z" | file:line of the pin |
| 5 | Registry / upstream lookup | an external release, a published package | URL + response, or -> step 2b if offline |
| 6 | Date arithmetic against the stamped `verified <date>` | a staleness claim | the two dates |

**Budget:** at most **3 tool calls per contradiction row**, and at most **20 tool calls** across the
whole run's contradiction set. The budget bounds effort, it does not convert an unspent budget into a
verdict: a row that still has budget left and an unrun applicable check is `deferred`, not
`unverifiable`. A row that exhausts the budget mid-check is also `deferred` -- record which check was
cut off.

Reaching step 3 therefore requires writing down, per row, which of checks 1-6 applied and what each
returned. A step-3 deletion with no such record is invalid and the row stays.

Guards on every step:
1. **Preference/identity EXEMPT.** Anything stating who the user is or what they prefer (name, spelling,
   accounts, tone, workflow choice) is never deleted or "corrected" - e.g. `~/.claude/CLAUDE.md` "Spell
   **Maksim**: !=Maxim". A preference cannot be false.
2. **Every deletion is ledgered and restorable.** Snapshot before the first edit
   (`brewtools/skills/text-optimize/scripts/text-guard.sh snapshot`); ledger row = path, line range, layer,
   dropped text, survivor path, evidence command. `restore --run-dir D` puts it back.
3. **No global write without `--global`** (`dedup-arbitration.md` 5) - the losing GLOBAL statement is only
   reported. With `--global` granted the cross-project guard still binds, and it binds on **rewrites as
   well as deletions**: an L3 statement may only be rewritten when the replacement holds for EVERY
   project on the machine, or when it carries its own scope qualifier naming the repo and date the
   evidence came from. Evidence collected inside one repo proves a fact about that repo. Cannot meet
   that bar -> report the proposed text, write nothing.

## 3. Worked case: Grep/Glob availability

Read both sides:

| Side | Text |
|------|------|
| `~/.claude/CLAUDE.md:9` (L3) | "Native macOS build has NO `Grep`/`Glob` (embedded `bfs`+`ugrep` via Bash since CC 2.1.117, by design !=bug); npm build keeps them." |
| `CLAUDE.md:101-103` (L1) | "**Grep/Glob are gated, NOT removed (macOS, verified CC 2.1.226).** ... naming `Glob`/`Grep` in `--allowedTools`, `--tools`, permission rules, or an AG's `tools:` frontmatter re-arms them ... a `Glob` call fired 2026-08-08 ... So a PreToolUse matcher on `Grep`/`Glob` is live, not dead config." |

Class: CONTRADICTION (same subject, same scope = this machine's macOS build; "NO Grep/Glob" vs "gated, re-armable").
Step 1 applies - it is verifiable. `CLAUDE.md:101-103` WINS on three pieces of stamped evidence:

| Evidence | Check | Result |
|----------|-------|--------|
| Newer verified CC version | 2.1.226 (L1) vs 2.1.117 (L3) | L1 is 109 minor builds newer and carries an explicit "verified" stamp |
| Live declarations | `grep -l '^tools:.*Glob' brew*/agents/*.md .claude/agents/*.md \| wc -l` | `9` = the 8 plugin agents + `.claude/agents/docs-writer.md`, exactly as CLAUDE.md:101 states |
| Dated observation | "a `Glob` call fired 2026-08-08" | a tool that does not exist cannot be called; one successful call falsifies "NO Grep/Glob" |

Edits:

| Branch | File | Edit |
|--------|------|------|
| both | `CLAUDE.md:101-103` | unchanged - it is the survivor |
| `--global` granted | `~/.claude/CLAUDE.md:9` | Guard-3 check FIRST: the replacement claim is about the CC binary's gating behaviour, which holds on this machine for every project, so it clears the machine-wide bar - but the supporting `9 agents declare tools: Glob` count is repo-local and must NOT travel. Replacement, scope qualifier included verbatim: "Native macOS build ships `Grep`/`Glob` GATED OFF by default (embedded `bfs`+`ugrep` via Bash since CC 2.1.117); naming them in `tools:`/`--allowedTools` re-arms them (verified CC 2.1.226 in `claude-brewcode`, 2026-08-08). npm build keeps them ungated." Keep the rest of line 9 (`ENABLE_TOOL_SEARCH`) untouched - it is a different fact |
| `--global` NOT granted | `~/.claude/CLAUDE.md:9` | NO write. Report the pair + the evidence table + the exact replacement text, so the user can apply it. The project statement already overrides for this repo; the global line stays wrong in other repos, which is the user's call, !=the skill's |

Both branches: ledger the row, since the global-branch edit is a deletion of a factual claim.

## 4. Output

Every unresolved or reported-only contradiction goes into the run report as one row:
`path:line | class | verdict | evidence cmd | proposed edit | applied? yes/no/blocked-by-scope`.
An empty contradiction section means the pass found none, never that it skipped the check.
