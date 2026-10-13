# setup-status — Phase 1 probes (1, 1b, 1c)

Read at Phase 1 of `SKILL.md`. Path tokens in these fences are literal: fill them as `SKILL.md` "Running the fences" says.

## Phase 1 — Probe artifacts

One generic block, fed from the roster. Paste the anchor + secondary paths of the rows in scope
into the heredoc: project-relative, one per line, trailing `/` for a directory, globs allowed. For
rows 6 and 11 also paste the same files under `GLOBAL=` as absolute paths.

**EXECUTE** using Bash tool:

```bash
cd "${CLAUDE_PROJECT_DIR}" || exit 1
TASK_SPEC_MODE=unknown
TASK_SPEC_ENTRY=.claude/skills/task-spec/SKILL.md
if [ -f .claude/features/TASK_TEMPLATE.md ]; then
  if grep -q '^spec:' .claude/features/TASK_TEMPLATE.md || [ -f "$TASK_SPEC_ENTRY" ] || [ -f "$TASK_SPEC_ENTRY.disabled" ]; then
    TASK_SPEC_MODE=on
  else
    TASK_SPEC_MODE=off
  fi
fi
echo "TASK_SPEC_MODE=$TASK_SPEC_MODE"
while IFS= read -r rel; do
  [ -z "$rel" ] && continue
  if [ "$rel" = "$TASK_SPEC_ENTRY" ] && [ "$TASK_SPEC_MODE" = off ]; then
    echo "OPTIONAL $rel (spec layer off)"; continue
  fi
  case "$rel" in
    */)    [ -d "$rel" ] && echo "DIR  $rel" || echo "MISS $rel" ;;
    *"*"*) n=$({ find . -path "./$rel" 2>/dev/null || true; } | wc -l | tr -d ' '); n=${n:-0}; [ "$n" -gt 0 ] && echo "GLOB $rel ($n)" || echo "MISS $rel" ;;
    *)     if [ -f "$rel" ]; then echo "FILE $rel"
           elif [ -f "$rel.disabled" ]; then echo "PARK $rel.disabled"
           else echo "MISS $rel"; fi ;;
  esac
done <<'PATHS'
.claude/teams/*/team.md
.claude/teams/*/trace-ops.sh
.claude/rules/semble-first.md
PATHS
echo "OK"
```

| Line | Reading |
|------|---------|
| `PARK` | present, not missing. A parked entry file (Phase 1b) is byte-identical to the live one: it never feeds Phase 3's `missing` or `partial` rules and is still a readable version stamp |
| `TASK_SPEC_MODE` | bind it for Phases 1b and 2a. `on` = the deployed `TASK_TEMPLATE.md` has a `^spec:` field, or a live/parked `task-spec` exists; `off` = the template is present without either; `unknown` = the template is missing, never proof of off |
| `OPTIONAL` | outside the required set (only `task-spec`, only under `off`): no MISS/ABSENT, no parked member, no Phase 3 defect. All other row-4 artifacts and content-version checks stay required |

Then the hook registrations from the three settings files (project, local, `GLOBAL`), one line per
handler naming a roster script, as `REG <scope> <event> <matcher or -> <script> [if=...] [onFailure=...]`:

**EXECUTE** using Bash tool:

```bash
cd "${CLAUDE_PROJECT_DIR}" || exit 1
node --input-type=module -e '
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const G = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const files = [["project", ".claude/settings.json"], ["local", ".claude/settings.local.json"], ["global", path.join(G, "settings.json")]];
const want = /(semble-[a-z]+|agent-deadline-[a-z]+|agent-return-[a-z]+|agent-router|hardmode-guard|docsync-[a-z]+)\.mjs/;
for (const [scope, f] of files) {
  if (!fs.existsSync(f)) { console.log(`REG ${scope} ABSENT ${f}`); continue; }
  let j;
  try { j = JSON.parse(fs.readFileSync(f, "utf8")); }
  catch { console.log(`REG ${scope} UNPARSABLE ${f}`); continue; }
  let n = 0;
  for (const [ev, groups] of Object.entries((j && j.hooks) || {})) {
    for (const g of Array.isArray(groups) ? groups : []) {
      for (const h of Array.isArray(g.hooks) ? g.hooks : []) {
        const m = [h.command, ...(Array.isArray(h.args) ? h.args : [])].join(" ").match(want);
        if (!m) continue;
        n++;
        console.log(`REG ${scope} ${ev} ${g.matcher ?? "-"} ${m[0]}`
          + (h.if ? ` if=${h.if}` : "") + (h.onFailure ? ` onFailure=${h.onFailure}` : ""));
      }
    }
  }
  console.log(`REG ${scope} ${n} roster handler(s) ${f}`);
}
' && echo "✅" || echo "❌ FAILED"
```

Compare with the roster's registration cell, in the scope where the hook files were found:

| Finding | Reading |
|---------|---------|
| every listed line present | wired |
| hook files on disk, no `REG` line for the row | `partial`: nothing fires. Prescribe `install` |
| fewer lines than listed, or a line of an older shape (row 11 without `SubagentHandback`; row 10 with one `docsync-track.mjs` handler or no `if=`; row 8 without `onFailure=block`) | `stale`: registered by an earlier release. Prescribe `upgrade`, which re-merges the registrations |
| a line naming `agent-return-budget.mjs` | a defect to name in *Found*: that file is a shared module |
| `UNPARSABLE` | say which file; that scope's wiring is unknown |

Row 7 is read with its owner's probe instead: its judge entry inlines a prompt only the owner can
validate. Run the plugin asset, never the installed copy: `--probe` reads `judge-prompt.md` from
beside the script, and that file is not copied into a project.

**EXECUTE** using Bash tool:

```bash
cd "${CLAUDE_PROJECT_DIR}" || exit 1
BT=/abs/brewtools/root
if [ -f .claude/hooks/agent-router.mjs ]; then
  node "$BT/skills/agent-router-setup/assets/agent-router.mjs" --probe "$PWD/.claude/settings.json" || echo "PROBE-FAILED"
else echo "agent-router not installed"; fi
echo "OK"
```

| `tier1\|legacy\|tier2\|heartbeat\|valid` | Reading |
|------------------------------------------|---------|
| `1\|0\|0\|0\|yes` or `1\|0\|1\|1\|yes` | wired: `level fast`, or `level strict` (judge + its heartbeat entry) |
| `tier1` is 0 | `partial`: the hook file is there and nothing fires. Prescribe `install` |
| `legacy` above 0, `valid` is `no`, or `tier2` differs from `heartbeat` | `stale`: an owned handler drifted from the current shape. Prescribe `upgrade` |

### Phase 1b — Disable switches

A deliberately disabled setup is neither broken nor stale; every row leaves a probeable off-switch
(roster column), in one of two mechanisms:

| Mechanism | What `disable` does | Why it is probeable | Rows |
|-----------|---------------------|---------------------|------|
| **live config flag** | flips one key in the setup's own JSON; every file stays on disk, byte-identical | the reader (a hook, or the guard) re-reads the key on every invocation, so the flag is the state | 2, 6, 7, 8, 10, 11 |
| **entry-file parking** | renames the one filename discovery keys on to `<name>.disabled`; the body is byte-identical and nothing is deleted | Claude Code discovers a project agent only as `.claude/agents/<n>.md`, a project skill only as `<dir>/SKILL.md`, and auto-loads a rule only as `.claude/rules/*.md` | 1, 3, 4, 9, 12 |

**EXECUTE** using Bash tool — config flags, every scope. Each arm prints a line, so `ABSENT` is
stated, never implied; a key-less config prints `no-key` instead of guessing:

```bash
CWD0=$PWD   # the deadline guard climbs from the payload cwd: keep it before the cd
cd "${CLAUDE_PROJECT_DIR}" || exit 1
G="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
flag() {
  if [ -f "${2}" ]; then
    e=$({ tr -d ' \n' < "${2}" | grep -o '"enabled":[a-z]*' || true; } | head -1)
    echo "${1} ${2}: ${e:-no-key}"
  else echo "${1} ABSENT ${2}"; fi
}
{ printf '%s\n' "$PWD/.claude" "$G"; [ "$G" = "$HOME/.claude" ] || printf '%s\n' "$HOME/.claude"; } |
while IFS= read -r d; do
  flag agent-deadline "$d/agent-deadline.json"
  flag agent-return "$d/agent-return.json"
done
gov() {  # mirrors each guard's loadConfig: climb to the nearest valid project config, then globals
  NAME="${1}" START="$CWD0" RULE="${2}" PD="${CLAUDE_PROJECT_DIR}" node <<'NODE'
const fs=require("fs"), path=require("path"), os=require("os");
const name=process.env.NAME, pd=process.env.PD, env=(process.env.CLAUDE_CONFIG_DIR||"").trim();
const globals=[...new Set([env?path.resolve(env):null,path.join(os.homedir(),".claude")].filter(Boolean))];
const ok=f=>{try{const c=JSON.parse(fs.readFileSync(f,"utf8"));return !!c&&typeof c==="object"&&!Array.isArray(c);}catch{return false;}};
let dir=path.resolve(process.env.START), hit=null;
if(process.env.RULE==="project-root"&&pd&&fs.existsSync(pd)) dir=path.resolve(pd);
const real=p=>{try{return fs.realpathSync(p);}catch{return "";}};
const profileParent=d=>{const p=real(d); return !!p&&((!!process.env.HOME&&real(process.env.HOME)===p)||(!!env&&real(env)===path.join(p,".claude")));};
if(process.env.RULE==="project-root"&&!(pd&&fs.existsSync(pd))) for(let d=dir;;){ if(fs.existsSync(path.join(d,".git"))||(fs.existsSync(path.join(d,".claude"))&&!profileParent(d))){ dir=d; break; } const up=path.dirname(d); if(up===d) break; d=up; }
console.log(name+" CLIMB-START "+dir);
for(let i=0;i<16&&!hit;i++){
  if(globals.includes(path.join(dir,".claude"))) break;
  if(ok(path.join(dir,".claude",name))){ hit=path.join(dir,".claude",name); break; }
  const up=path.dirname(dir); if(up===dir) break; dir=up;
}
console.log(name+" GOVERNING "+(hit||globals.map(g=>path.join(g,name)).find(ok)||"none"));
NODE
}
gov agent-deadline.json cwd; gov agent-return.json project-root
flag agent-router .claude/brewtools/agent-router.json
flag docsync .claude/docsync/config.json
for f in .claude/semble/state.json .claude/brewtools/manager/state.json; do
  if [ -f "$f" ]; then
    echo "$f: $({ tr -d ' \n' < "$f" | grep -o '"\(enabled\|hard\|phase\)":[^,}]*' || true; } | tr '\n' ' ')"
  else echo "$f absent"; fi
done
echo "OK"
```

| Rows | `"enabled":true` | `"enabled":false` | `no-key` | no config |
|------|------------------|-------------------|----------|-----------|
| 6, 11 (opt-in): read the file the `GOVERNING` line names | live | `disabled` | `disabled`: the guard returns before doing anything. Say *config carries no `enabled` key, the guard treats that as off* in *Found*; the fix is `enable`, not `upgrade` | `GOVERNING none` with the hook files present: `partial`, the guard is wired but has no config to read, so it can never arm |
| 7, 10 (opt-out) | live | `disabled` | live: never `disabled` on a missing key | a secondary (row 7) or anchor (row 10) MISS for Phase 3 |

Row 2 is `disabled` on `"enabled":false`; row 8 is live only on `"hard":true`, anything else is the
disarmed wall. An absent key means opposite things on rows 6/11 and 7/10: read the row, never a
house default (a key-less row 6 or 11 reported live claims a deadline is enforced, or a return
budget applied, when the guard returns on its first line). Rows 6 and 11 read the nearest project
config first, then `$CLAUDE_CONFIG_DIR`, then `~/.claude`; a malformed (non-object) project config is
skipped and the climb goes on, so read every scope before deciding. `gov()` mirrors each guard's
`loadConfig` start dir: row 6 climbs from the payload `cwd` (the shell cwd before the `cd`), row 11
from the session project dir, else the nearest `.git`/`.claude` ancestor of that cwd (`projectRoot()`; a `.claude` in HOME or
in the active config dir's parent is a profile, skipped);
each walks up at most 16 levels and stops at a global dir, so a config in an ancestor of the project
dir, or under it on row 6, can govern. The `GOVERNING` file is the row's config
secondary wherever it sits (with `CLAUDE_CONFIG_DIR` set, maybe `~/.claude/<name>.json`): a Phase 1
MISS for it under `GLOBAL` is then not a finding and the row is not `partial`. `CLIMB-START` names the dir each
climb starts from: never HOME or a profile parent unless it is the session project dir itself.

**EXECUTE** using Bash tool — entry-file parking. `LIVE` / `PARKED` / `ABSENT` are three distinct
answers: `ABSENT` means never deployed, `PARKED` means deployed and switched off:

```bash
cd "${CLAUDE_PROJECT_DIR}" || exit 1
TASK_SPEC_MODE=${TASK_SPEC_MODE:-unknown} # bind the actual Phase 1 output before this probe
for f in .claude/skills/superreview/SKILL.md .claude/skills/memory-sync/SKILL.md \
         .claude/agents/task-tracker.md .claude/skills/task-board/SKILL.md \
         .claude/skills/task-spec/SKILL.md .claude/rules/tasks.md .claude/rules/convention.md; do
  if [ "$f" = .claude/skills/task-spec/SKILL.md ] && [ "$TASK_SPEC_MODE" = off ] && [ ! -f "$f" ] && [ ! -f "$f.disabled" ]; then
    echo "OPTIONAL $f (spec layer off)"; continue
  fi
  if   [ -f "$f" ] && [ -f "$f.disabled" ]; then echo "CONFLICT $f"
  elif [ -f "$f" ];          then echo "LIVE   $f"
  elif [ -f "$f.disabled" ]; then echo "PARKED $f.disabled"
  else                            echo "ABSENT $f"; fi
done
{ find . -path './.claude/teams/*/team.md' 2>/dev/null || true; } | sed 's|^\./||' | sort | while IFS= read -r t; do
  n=$(basename "$(dirname "$t")")
  awk '/^## Agents/{a=1;next} a&&/^## /{exit} a&&/^\|/{split($(0),c,"|");gsub(/[`[:space:]]/,"",c[2]);if(c[2]!=""&&c[2]!~/^-+$/&&c[2]!="Agent")print c[2]}' "$t" |
  while IFS= read -r m; do
    [ "$m" = "intent-guard" ] && continue
    l=0; p=0
    [ -f ".claude/agents/$m.md" ] && l=1
    [ -f ".claude/agents/$m.md.disabled" ] && p=1
    if   [ "$l$p" = "11" ]; then echo "CONFLICT team:$n $m"
    elif [ "$l" = 1 ];      then echo "LIVE   team:$n $m"
    elif [ "$p" = 1 ];      then echo "PARKED team:$n $m"
    else                         echo "ABSENT team:$n $m"; fi
  done
done
echo "OK"
```

Reading the two multi-artifact rows (1 and 4), where a toggle can land halfway:

| Pattern | Row state |
|---------|-----------|
| every deployed artifact `PARKED` | `disabled` — the intended state |
| every deployed artifact `LIVE` | not disabled; fall through to the rest of Phase 3 |
| some `LIVE`, some `PARKED` | `partial` — a `disable`/`enable` that did not finish. Name the halves; the fix is re-running the same verb (a no-op on artifacts already in the requested state) |
| Row 4's absent `task-spec`, everything else `LIVE` | Phase 1 proved off -> `OPTIONAL`, no defect. On/unknown -> `ABSENT`, the roster's required/legacy absence signal remains; never infer a disabled state |
| any `CONFLICT team:<t> <agent>` | `partial`, outranking every other teams reading. Both `.md` and `.md.disabled` exist for that member: `teams-setup enable` REFUSES the whole team (`CONFLICT:` line, nothing moved) and `verify-team.sh` FAILS. Name each member; the fix is manual — keep the copy you want, delete or rename the other, then re-run `/brewcode:teams-setup <team> enable` |
| `CONFLICT .claude/rules/convention.md` | `partial`, before any disabled verdict: live and parked guidance both exist and the installer refuses to choose. Ask the user to retain the intended copy, then retry the requested mode |

### Phase 1c — Environment prerequisites

One prerequisite, not a roster row: the **task-graph tools**. Claude Code gates `TaskCreate` /
`TaskGet` / `TaskUpdate` / `TaskList` and `TodoWrite` by a model allow-list: off by default on
Opus 4.8 and every 5.x model, and `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`, a key Claude Code reads from
2.1.233, turns them on
([tools reference](https://code.claude.com/docs/en/tools-reference#task-tool-availability),
[env vars](https://code.claude.com/docs/en/env-vars)). While the key is unset every instruction
that says *build the task graph first* is unexecutable and nothing announces it: the tools are
simply absent.

One block. It compares the three version components as integers (a string compare puts `2.1.99`
above `2.1.233`), then reads the key from the session env and all three settings layers as JSON,
never grepped: `env` is a nested object, and a grep hit does not show which block holds the token.
A missing file is a normal answer. Claude Code takes an `env` key from the highest layer that sets
it (local > project > global; managed settings and `--settings` rank above all three and are not
read here), a settings value overrides a shell export, and the key is on only for
`1`/`true`/`yes`/`on`, case-insensitive. So the highest carrier decides, and its `"0"` beats a
lower layer's `"1"`:

**EXECUTE** using Bash tool:

```bash
cd "${CLAUDE_PROJECT_DIR}" || exit 1
node --input-type=module -e '
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const raw = (process.argv[1] || "").trim();
const cur = raw.split(".").map(n => parseInt(n, 10) || 0);
const need = [2, 1, 233];
let cmp = 0;
for (let i = 0; i < 3; i++) { if ((cur[i] || 0) !== need[i]) { cmp = (cur[i] || 0) - need[i]; break; } }
if (!/^[0-9]+\.[0-9]+\.[0-9]+/.test(raw)) console.log("CC version unknown — gate assumed");
else if (cmp < 0) { console.log(`CC ${cur.join(".")} < 2.1.233 — task tools on by default, check skipped`); process.exit(0); }
else console.log(`CC ${cur.join(".")} >= 2.1.233 — gate applies`);
const G = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const layers = [
  ["local",   path.join(process.cwd(), ".claude", "settings.local.json")],
  ["project", path.join(process.cwd(), ".claude", "settings.json")],
  ["global",  path.join(G, "settings.json")],
];
const truthy = v => ["1", "true", "yes", "on"].includes(String(v).trim().toLowerCase());
const env = process.env.CLAUDE_CODE_ENABLE_TODO_TOOLS;
console.log(`session-env ${env === undefined ? "no-key" : JSON.stringify(env)}`);
let win = null;
for (const [name, f] of layers) {
  if (!fs.existsSync(f)) { console.log(`${name} ABSENT ${f}`); continue; }
  let j;
  try { j = JSON.parse(fs.readFileSync(f, "utf8")); }
  catch { console.log(`${name} UNPARSABLE ${f}`); continue; }
  const v = j && j.env ? j.env.CLAUDE_CODE_ENABLE_TODO_TOOLS : undefined;
  console.log(`${name} ${v === undefined ? "no-key" : JSON.stringify(v)} ${f}`);
  if (win === null && v !== undefined) win = [name, v];
}
if (win) console.log(`TODO_TOOLS ${truthy(win[1]) ? "on" : "off"} (${win[0]})`);
else console.log(`TODO_TOOLS ${env !== undefined && truthy(env) ? "on (session-env)" : "off"}`);
' "$(claude --version 2>/dev/null | awk '{print $(1)}')" && echo "✅" || echo "❌ FAILED"
```

| Last line | Meaning | Phase 4 |
|-----------|---------|---------|
| `CC <ver> < 2.1.233 — task tools on by default, check skipped` | this Claude Code predates the key | print that line, make no offer |
| `CC version unknown — gate assumed` (first line, not last) | `claude --version` gave no `X.Y.Z` (not on the Bash tool's PATH, or it failed), so the release is unknown: the check runs as if the gate applies, never reads as "on by default" | read the last line as below and say once the version was unknown; the offer stands |
| `TODO_TOOLS on (<layer>)` | that layer decides; the tools are available | report the layer in one line, ask nothing |
| `TODO_TOOLS off (<layer>)` | that layer sets an off value and outranks every lower layer and the shell | report the file and value, make no offer: a lower-layer write would lose to it |
| `TODO_TOOLS off` | no layer carries it; the tools are absent on this model | report it, then make the one offer |

`UNPARSABLE` on a layer is not `off` for that layer: it is a broken settings file. Say which file,
and never offer to write into it (the merge in Phase 4 refuses it too).
