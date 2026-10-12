# contradiction-policy

Entered from `dedup-arbitration.md` 3d when two near-identical statements carry a DIFFERING exact value.
Dedup never resolves a contradiction: one side is FALSE and dies, or both are true at different scopes.

## 1. Classification

| Class | Test | Action |
|-------|------|--------|
| CONTRADICTION | same subject, same scope, incompatible exact values (version, count, flag, path, yes/no) | ladder, section 2 |
| OVERLAP | same subject, values compatible, one merely wider | `dedup-arbitration.md` verdict SUPERSET/SUBSET |
| STALE-BUT-CONSISTENT | both true when written; one carries an older `verified <date>` / CC version and no live claim conflicts | keep the newer, delete the older, ledger. !=escalate |
| SCOPED-DIFFERENT | subjects differ by an unstated qualifier (build, CC version, OS, plugin, env flag) | NOT a contradiction: add the missing qualifier to the vaguer statement, keep both |

Same fact, different audience (`dedup-arbitration.md` 1, audience test) is NOT a contradiction and NOT
a duplicate. Keep both.

## 2. Resolution ladder

| Step | Condition | Do |
|------|-----------|----|
| 1 | Verifiable against code / filesystem / a pinned version | Run the check. Keep the TRUE statement, delete the FALSE one, ledger `kept <- dropped` with the command and its output |
| 2 | Verifiable only against an external fact (registry, upstream release) | Verify, then step 1. Unreachable network -> **step 2b, never step 3** |
| 2b | The check is possible in principle but not right now (no network, missing credential, tool absent, budget exhausted) | **DEFER.** Keep BOTH statements unchanged, add no qualifier, delete nothing. Report the row as `deferred: <what could not be run>`, with the exact command a later run should execute. A deferral is a normal outcome, not a failure |
| 3 | UNVERIFIABLE -- and only after the budget below is spent | DELETE the weaker statement (older date, no evidence, vaguer scope). Pre-decided by the user; !=ask again |
| 4 | Both unverifiable and equally weighted | Keep the one in the higher-precedence layer (lattice L0>L1>L2>L3), delete the other |

### What "unverifiable" means -- operational definition

UNVERIFIABLE = **every** applicable check below was attempted in THIS run and none decided it.
Not attempted, not reachable (step 2b) or not thought of != unverifiable.

| # | Check | Applies when the claim mentions | Evidence recorded |
|---|-------|--------------------------------|-------------------|
| 1 | Read the file / path / key it names | a path, filename, frontmatter key, config key | the `sed -n`/`jq` command + its output |
| 2 | `grep -c` / `rg -c` the repo for the asserted count, flag, symbol or literal | a count, a flag, an identifier, "all N files" | the command + the number it returned |
| 3 | Run the command it prescribes, or `--help`/`--version` on the binary | a CLI, an exit code, a script behaviour | the invocation + exit code |
| 4 | Check the version/pin at its source (`package.json`, `plugin.json`, lockfile, installed binary) | a version, a pin, "since X.Y.Z" | file:line of the pin |
| 5 | Registry / upstream lookup | an external release, a published package | URL + response, or -> step 2b if offline |
| 6 | Date arithmetic against the stamped `verified <date>` | a staleness claim | the two dates |

**Budget:** at most **3 tool calls per contradiction row**, at most **20 tool calls** across the run's
contradiction set. Budget bounds effort, it is no verdict: a row with budget left and an unrun
applicable check is `deferred`, not `unverifiable`; a row that exhausts the budget mid-check is
`deferred` too, naming the cut-off check.

Step 3 requires a per-row record of which checks 1-6 applied and what each returned; a step-3
deletion without it is invalid and the row stays.

Guards on every step:
1. **Preference/identity EXEMPT.** Who the user is or what they prefer (name, spelling, accounts, tone,
   workflow choice) is never deleted or "corrected" - e.g. "Spell my name Anna, !=Ana". A preference
   cannot be false.
2. Snapshot before the first edit (`scripts/context-guard.sh snapshot`, phase 2). Ledger every deletion:
   path, line range, layer, dropped text, survivor path, evidence command. Checkpoint each owned atomic
   edit/deletion immediately (`text-guard.sh checkpoint --run-dir D <file>`, the phase 4 command), never
   during failure/recovery and never over another writer's change. `restore` without authorization and
   matching ownership proof -> `RESTORE_REFUSED`, exit 1, current bytes kept; report actual recovery status.
3. **No global write without `--global`**: the losing GLOBAL statement is only reported. With `--global`,
   rewrites and deletions of L3 both pass the cross-project guard of `dedup-arbitration.md` 5(b).

## 3. Worked case: tool availability across CC versions

| Side | Text |
|------|------|
| global `~/.claude/CLAUDE.md` (L3) | "Native macOS build has NO `Grep`/`Glob` (embedded `bfs`+`ugrep` via Bash since CC 2.1.117); npm build keeps them." |
| project `CLAUDE.md` (L1) | "Grep/Glob are gated, NOT removed (verified CC 2.1.226): naming them in an agent's `tools:` re-arms them; 9 agents declare them; a `Glob` call fired." |

Each side stamps a different CC version, so test SCOPED-DIFFERENT first: did the behaviour change
between builds? Run step 1 against the INSTALLED binary (`claude --version`) and its tools reference,
not against the stamps:

| Evidence offered | What it proves |
|------------------|----------------|
| Newer "verified" CC version | the claim on that build only; a later build may change it |
| `grep -l '^tools:.*Glob' <agent files> \| wc -l` | declarations, not availability: on CC 2.1.296 a subagent gets `Glob`/`Grep` only when its `tools` lists them AND leaves out `Bash` |
| One observed call | that session's configuration (`--tools`, `--allowedTools`, its `tools:` list), not the default |

On CC 2.1.296 neither line holds as written: the global one is right about the default, the project
one about re-arming only without `Bash`. Rewrite both with their scope (build, condition) instead of
deleting either. The L3 rewrite passes guard 3: binary behaviour is machine-wide evidence, a repo's
declaration count is not and never travels into global text. Without `--global`: report the pair, the
evidence and the replacement text; no L3 write. Ledger both rows.

## 4. Output

Every unresolved or reported-only contradiction goes into the run report as one row:
`path:line | class | verdict | evidence cmd | proposed edit | applied? yes/no/blocked-by-scope`.
An empty contradiction section means the pass found none, never that it skipped the check.
