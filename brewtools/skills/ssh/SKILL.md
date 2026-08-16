---
name: ssh
description: "SSH server management — connect, configure, deploy, administer Linux servers with safety gates."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [setup|connect|configure|update-agent] — free-form description of what to do"
allowed-tools: [Read, Write, Edit, Bash, Agent, AskUserQuestion, Glob, Grep]
model: opus
---

# SSH Server Management

> Manage remote Linux servers — connect, configure, deploy, administer with safety gates and persistent config.

## Prompt contract

Position 1 of `$ARGUMENTS` is a **free-form prompt** (RU/EN) — modes are optional and may follow
in any order. Nobody types keys: resolve mode + scope FROM the prompt. This skill has no
mutate-vs-read-only flags — every mode can end up running commands, gated by Phase 5 Step 3's
own MODIFY/SERVICE/DELETE/PRIVILEGE confirmation.

1. An explicit mode token anywhere wins outright, no scoring (see the operations table in
   Phase 0 below).
2. Else score modes by distinct whole-word keyword hits. Highest unique score wins; all zero ->
   fall through to `execute`, letting Phase 5's own command classification gate any mutation.
3. Empty arguments -> `setup` if no servers are configured, else `execute` (Phase 1 asks which
   server). Never a hardcoded default independent of that check.
4. Outcome-changing ambiguity (which server, DELETE/PRIVILEGE commands) -> `AskUserQuestion`
   BEFORE any work — this is already Phase 1/5's own gate, not a new one.
5. Prose that is not a mode keyword is still input: extract the host, server alias or command
   intent from it; never treat the first word of a sentence as a positional id.

Then print this block ONCE, before the first action:

```
PLAN — brewtools:ssh
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

Labels are literal; values follow the conversation language. Print it at the end of Phase 1,
once mode AND server (default/asked/newly-set-up) are both resolved, before branching into
Phase 2/3/5.

<instructions>

## Robustness Rules (MANDATORY — all phases)

### Fail-Fast

| Rule | Applies to |
|------|-----------|
| Every Bash call MUST end with `&& echo "OK ..." \|\| echo "FAILED ..."` | ALL scripts |
| On `FAILED` — stop phase, report error, do NOT retry same command blindly | ALL phases |
| SSH commands MUST use `-o ConnectTimeout=10 -o BatchMode=yes` | ALL SSH calls |
| Max **2 retries** per failed operation; after 2nd failure — report and stop | ALL phases |
| Non-zero script exit — read stderr, diagnose, fix root cause, retry ONCE | Scripts |

### Loop Protection

| Rule | Limit |
|------|-------|
| Phase 2 (Connection Setup) — max **3 key attempts**, then ask user | 3 keys |
| Phase 2 → Phase 5 round-trips — if sent back to Phase 2 more than **once**, stop and report | 1 re-entry |
| Phase 5 (Execute) — max **5 SSH commands per invocation**; if more needed, delegate to ssh-admin agent via Task | 5 commands |
| update-agent mode — max **3 servers** per run; process first 3 and report remaining | 3 servers |
| AskUserQuestion — max **3 questions per phase**; summarize missing info in one combined question | 3 per phase |

### Timeouts

| Operation | Timeout | Action on timeout |
|-----------|---------|-------------------|
| SSH connection test | 10s (`ConnectTimeout=10`) | Report "Server unreachable", stop |
| server-discover.sh | 30s total, enforced inside the script (`SSH_DISCOVER_TIMEOUT`, default 30) | Exit `124` — report partial results, continue |
| Any single SSH command | 60s (`timeout 60 ssh ...`) | Kill, report "Command timed out", ask user |
| Entire skill invocation | 15 SSH calls total max | Stop, report progress, suggest manual continuation |

### Fallback Strategy

If a script fails and cannot be fixed:
1. Report exact error: script name, exit code, stderr
2. Attempt same operation manually (inline Bash) — scripts are helpers, not gatekeepers
3. If manual fallback also fails — report both attempts, ask user
4. Never silently swallow errors or continue with stale/missing data

| Failed script | Manual alternative |
|---------------|--------------------|
| detect-mode.sh | Parse `$ARGUMENTS` yourself — keyword matching is simple |
| ssh-env-check.sh | Run `ls ~/.ssh/id_* 2>/dev/null`, `ssh-add -l`, `cat ~/.ssh/config` |
| server-discover.sh | Run individual SSH commands: `uname -a`, `docker version`, `df -h` |
| claude-local-ops.sh | Read/write CLAUDE.local.md directly with Read/Edit tools |

### Error Reporting (MANDATORY)

On ANY failure — before stopping or asking user — output:

```
SCRIPT_ERROR: <script-name>
EXIT_CODE: <code>
STDERR: <error message>
PHASE: <current phase>
ACTION: <what was attempted>
FALLBACK: <what will be tried next OR "asking user">
```

---

## Phase 0: Mode Detection (MANDATORY FIRST STEP)

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/detect-mode.sh" "$ARGUMENTS"
```

Output format:
```
ARGS: [arguments received]
MODE: [detected mode]
```

Use the MODE value and GOTO that mode section below.

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `setup` | setup, new server, add server | настрой, добавь сервер, новый сервер | yes |
| `connect` | connect to, ssh to, login | подключись, зайди по ssh, логин | no (routes to `execute`) |
| `configure` | configure, config, harden | конфигурируй, укрепи, захардень | yes |
| `update-agent` | update agent, refresh agent, refresh | обнови агента, обнови | yes |
| `execute` | *(any other text)* | *(любой другой текст)* | depends — Phase 5 Step 2 classifies each command |

Empty arguments are special-cased, not keyword-scored: no servers configured -> `setup`;
servers configured -> `execute` (Phase 1 asks which server).

---

## Phase 1: Environment & Config Check

> Runs for ALL modes before branching.

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/ssh-env-check.sh" && echo "OK env-check" || echo "FAILED env-check"
```

> **STOP if FAILED** -- fix SSH environment before continuing.

Parse output key=value pairs. Note available keys and ssh-agent status.

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/claude-local-ops.sh" list 2>/dev/null || echo "NO_SERVERS"
```

| Condition | Action |
|-----------|--------|
| `NO_SERVERS` AND mode=`setup` | GOTO Phase 2: Connection Setup |
| `NO_SERVERS` AND mode=`execute`/`connect` | GOTO Phase 2 (need server first) |
| 1 server AND mode=`connect`/`execute` | Use as default, GOTO Phase 5 |
| Multiple servers AND mode=`connect`/`execute` | AskUserQuestion: which server? Then GOTO Phase 5 |
| mode=`setup` (servers exist) | GOTO Phase 2 (adding new server) |
| mode=`configure` | AskUserQuestion: which server? Then GOTO Phase 5 |
| mode=`update-agent` | GOTO Mode: update-agent |

---

## Phase 2: Connection Setup

### Step 1: Gather Connection Info

Use AskUserQuestion:
```
header: "SSH Server Setup"
question: "Provide connection details for the new server."
```

Collect via follow-up questions if not in $ARGUMENTS:
- **Host** (IP or hostname) -- REQUIRED
- **User** (default: deploy) -- REQUIRED
- **Port** (default: 22) -- optional
- **Server name** (short alias, e.g., vps-main) -- REQUIRED

### Step 2: Key Discovery & Auth

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/ssh-env-check.sh" && echo "OK keys" || echo "FAILED keys"
```

Parse available keys. Try connection with each key (ed25519 first, then rsa, then ecdsa):

#### Host key: scan, VERIFY, then trust

Never append `ssh-keyscan` output straight into `known_hosts` — that trusts whatever the network
returned. Scan to a temp file and print fingerprints. **EXECUTE** using Bash tool:
```bash
KH_TMP=$(mktemp) && ssh-keyscan -p PORT HOST > "$KH_TMP" && echo "OK keyscan $KH_TMP" || echo "FAILED keyscan"
ssh-keygen -lf "$KH_TMP"
```
> `2>/dev/null` is deliberately absent — a failed or partial scan must be visible, not silently empty.

Show the SHA256 fingerprints and require an INDEPENDENT match before trusting them. Use AskUserQuestion:
```
header: "Host Key Verification"
question: "SHA256 fingerprints scanned from HOST:PORT:\n\n[ssh-keygen -lf output]\n\nDo these match the provider console / out-of-band record (VPS panel, cloud-init log, or `ssh-keygen -lf /etc/ssh/ssh_host_*_key.pub` run on the server console)?"
options:
  - label: "Yes, fingerprints match"
  - label: "No / cannot verify"
```

Only on an explicit match, add the key. **EXECUTE** using Bash tool:
```bash
umask 077 && mkdir -p ~/.ssh && cat "$KH_TMP" >> ~/.ssh/known_hosts && rm -f "$KH_TMP" && echo "OK known_hosts" || echo "FAILED known_hosts"
```
> **STOP on "No / cannot verify"** — `rm -f "$KH_TMP"`, report, and do not connect. An unverified
> first key is a permanent MITM foothold for every later credential. Never `StrictHostKeyChecking=no`.

**EXECUTE** using Bash tool:
```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 -p PORT USER@HOST echo "OK auth" 2>/dev/null || echo "FAILED auth"
```

### Step 3: If Key Auth Fails

Use AskUserQuestion:
```
header: "SSH Authentication"
question: "Key authentication failed. Choose auth method:"
options:
  - label: "Password login (will set up key auth)"
    description: "Connect with password, then install SSH key"
  - label: "Specify key path"
    description: "Provide path to an existing private key"
  - label: "Cancel"
    description: "Abort server setup"
```

**If password login:**

1. Generate dedicated key:

**EXECUTE** using Bash tool:
```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_SERVERNAME -N "" -C "claude@SERVERNAME" && echo "OK keygen" || echo "FAILED keygen"
```

Replace SERVERNAME with the server name alias.

2. Instruct user to copy key manually:

> **Interactive command required.** Run this in your terminal:
> ```
> ! ssh-copy-id -i ~/.ssh/id_ed25519_SERVERNAME.pub -p PORT USER@HOST
> ```
> This requires password entry which Claude Code cannot do non-interactively.

3. After user confirms, verify:

**EXECUTE** using Bash tool:
```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 -i ~/.ssh/id_ed25519_SERVERNAME -p PORT USER@HOST echo "OK key-auth" 2>/dev/null || echo "FAILED key-auth"
```

> **STOP if FAILED** -- key auth must work before proceeding.

### Step 4: SSH Config Entry

**EXECUTE** using Bash tool:
```bash
grep -q "^Host SERVERNAME$" ~/.ssh/config 2>/dev/null && echo "EXISTS" || echo "NEW"
```

If NEW, add config entry using Edit/Write to `~/.ssh/config`:

```
Host SERVERNAME
    HostName HOST
    User USER
    Port PORT
    IdentityFile ~/.ssh/id_ed25519_SERVERNAME
    StrictHostKeyChecking accept-new
```

### Step 5: Final Connection Test

**EXECUTE** using Bash tool:
```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 SERVERNAME echo "OK connection" 2>/dev/null || echo "FAILED connection"
```

> **STOP if FAILED** -- connection must work before discovery.

---

## Phase 3: Server Discovery

**EXECUTE** using Bash tool:
```bash
SSH_DISCOVER_TIMEOUT=30 bash "${CLAUDE_SKILL_DIR}/scripts/server-discover.sh" "USER@HOST" PORT && echo "OK discovery" || echo "FAILED discovery rc=$?"
```

Replace USER@HOST and PORT with actual values (or SSH config alias). The script validates both
operands itself and bounds its own total runtime — do NOT wrap it in `timeout` (absent on macOS).

| Exit | Meaning | Action |
|------|---------|--------|
| `1` | Host unreachable / auth failure | Back to Phase 2, max 1 re-entry |
| `2` | Invalid connection or port operand | Fix the value; NEVER pass free-form text as the port |
| `124` | 30s deadline exceeded | Report partial results, continue |

Parse output key=value pairs. Key fields:
- `OS`, `KERNEL`, `ARCH`
- `DOCKER_VERSION`, `DOCKER_COMPOSE`
- `DISK_INFO` (data disks, mount points)
- `RUNNING_CONTAINERS`, `SERVICES`
- `CURRENT_USER`, `USER_GROUPS`

---

## Phase 4: Persist Config

### Step 1: Update CLAUDE.local.md

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/claude-local-ops.sh" add "SERVERNAME" "HOST" "USER" "PORT" "KEYPATH" && echo "OK add" || echo "FAILED add"
```

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/claude-local-ops.sh" update "SERVERNAME" "OS_VALUE" "KERNEL_VALUE" "DOCKER_VALUE" "DISK_VALUE" "WORKDIR_VALUE" && echo "OK update" || echo "FAILED update"
```

Replace placeholders with discovered values from Phase 3.

### Step 2: Gitignore

**EXECUTE** using Bash tool:
```bash
grep -q "CLAUDE.local.md" .gitignore 2>/dev/null && echo "EXISTS" || (echo "CLAUDE.local.md" >> .gitignore && echo "ADDED")
```

### Step 3: Generate ssh-admin Agent

**EXECUTE** using Bash tool:
```bash
cat "${CLAUDE_SKILL_DIR}/templates/ssh-admin-agent.md.template"
```

Resolve the metadata stamp (never hardcode a version). **EXECUTE** using Bash tool:
```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
PV=$(jq -r '.version // empty' "$BT_ROOT/.claude-plugin/plugin.json" 2>/dev/null || true)
PV=${PV:-$(basename "$BT_ROOT")}
echo "PLUGIN_VERSION=$PV LAST_UPDATED=$(date +%F)"
```
> **Why the bare form.** `CLAUDE_SKILL_DIR` is a TEXT SUBSTITUTION on the skill prompt, not an env var: CC 2.1.226 rewrites only the EXACT dollar-brace literal `{CLAUDE_SKILL_DIR}` (`replace(/\$\{CLAUDE_SKILL_DIR\}/g, dirname(skillPath))` and a string-pattern `replaceAll`). A brace-modifier form such as `:-fallback` inside the braces is therefore NOT matched, reaches the shell verbatim, and its fallback ALWAYS wins. `CLAUDE_PLUGIN_ROOT` is a real env var but is exported only to hook processes and MCP servers -- never to a skill's Bash tool -- so it is ALWAYS empty here. The skill dir is correct in a cache install AND in a `--plugin-dir` dev run; the cache glob below it is a last-resort fallback only, and it would name the INSTALLED plugin.

Replace placeholders in template:
- `{{SERVER_INVENTORY}}` -- server table from CLAUDE.local.md
- `{{SERVER_DETAILS}}` -- discovered OS/Docker/disk info per server
- `{PLUGIN_VERSION}` -- `PV` from the block above
- `{LAST_UPDATED}` -- `date +%F` (`YYYY-MM-DD`), quoted in the frontmatter

Write result to `.claude/agents/ssh-admin.md` using Write tool.

Leftover-token gate -- BOTH brace families (this skill's `{{...}}` tokens and the single-brace metadata ones). **EXECUTE** using Bash tool:
```bash
F="$PWD/.claude/agents/ssh-admin.md"
test -f "$F" || { echo "❌ FAILED -- $F not written"; exit 1; }
LEFT="$(grep -nE '\{\{|\{(PLUGIN_VERSION|GENERATED_BY|LAST_UPDATED)\}' "$F" || true)"
test -z "$LEFT" && echo "✅ no leftover placeholders" || { echo "❌ FAILED -- leftover placeholders:"; echo "$LEFT"; }
```
> **STOP if ❌** -- re-substitute before continuing.

### Step 4: Default Server

If this is the first server, set as default automatically.

If multiple servers exist, use AskUserQuestion:
```
header: "Default Server"
question: "Set SERVERNAME as the default SSH server?"
options:
  - label: "Yes"
  - label: "No"
```

If yes:
**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/claude-local-ops.sh" set-default "SERVERNAME" && echo "OK default" || echo "FAILED default"
```

---

## Phase 5: Execute User Request

### Step 1: Load Safety Rules

Read `references/safety-rules.md` from skill directory for command classification rules.

### Step 2: Plan & Classify

Analyze `$ARGUMENTS`. Create execution plan:

| Step | Command(s) | Classification | Confirmation |
|------|-----------|----------------|--------------|
| 1 | ... | READ/CREATE/MODIFY/SERVICE/DELETE/PRIVILEGE | free/confirm |

### Step 3: Confirmation Gate

**For MODIFY/SERVICE commands** -- use AskUserQuestion:
```
header: "SSH Action Confirmation"
question: "About to execute on SERVER:\n\n[command list]\n\nProceed?"
options:
  - label: "Yes, execute"
  - label: "Cancel"
```

**For DELETE/PRIVILEGE commands** -- use AskUserQuestion with explicit warning:
```
header: "DESTRUCTIVE SSH Action"
question: "WARNING: About to execute DESTRUCTIVE commands on SERVER:\n\n[command list]\n\nThis cannot be undone. Proceed?"
options:
  - label: "Yes, I understand the risks"
  - label: "Cancel"
```

**For READ/CREATE commands** -- execute freely, no confirmation needed.

### Step 4: Execute

For complex multi-step operations, delegate to the `ssh-admin` agent via Task tool.

**Delegation.** A big task handed to one agent = an agent gone for an hour: you cannot observe it, cannot correct it, and it usually drifts off-target. One subagent = ONE bounded unit — one deliverable on ONE host, ~<=5 files/services, ~<=10 commands. Bigger MUST be split into N tasks (one per host, one deliverable each), all spawned in ONE message. The confirmation gates in Step 3 are NOT delegable: DELETE/PRIVILEGE approval stays here, in the main conversation, before any spawn.

**A subagent cannot confirm anything.** `AskUserQuestion` is not available to subagents — declaring it
is inert, and a spawned agent that "asks before the destructive step" simply never asks. So a spawned
ssh agent does all non-destructive work, executes nothing destructive, and returns an approval
envelope instead. Destructive = irreversible or touching a remote/shared system: `rm`/`mv` over an
existing path, service restart/stop, firewall/user/permission change, secret rotation,
`docker system prune`, any remote `ssh` mutation.

Required shape in the agent's FINAL RETURN, one envelope per destructive operation:

```
## APPROVAL REQUIRED

### A1
COMMAND:      <exact command, copy-pasteable>
HOST:         <server alias / user@host>
EFFECT:       <what changes, incl. downtime>
ROLLBACK:     <exact reverse command, or NONE>
EVIDENCE:     <the read-only output that proves it is needed>
PRECONDITION: <what must still hold at execution time>
```

You approve in the main conversation (Step 3 gate), then RE-SPAWN the same agent with
`APPROVED: A1 A3` in the prompt. An explicit approval token in the incoming prompt is the ONLY
authorization a subagent may act on — no envelope, no approval token, no destructive command.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists — the point beyond the file edit |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, by whom, what runs in parallel — trimmed to what THIS agent needs |
| CONSUMER | who or what uses the result next, and the shape it must fit |
| DONE | acceptance criteria + the exact report shape you want back |

A bare one-line task is never enough. Shape:
```
Task(subagent_type="ssh-admin", prompt="
GOAL: bringing SERVERNAME up to the state the user asked for (<one line>); this task is
  the <N>th of <M> bounded steps, the others are handled by sibling agents.
ROLE: you own <this one deliverable> on SERVERNAME. Do NOT touch other servers, do NOT
  edit local repo files, do NOT run DELETE/PRIVILEGE commands — those were gated out.
  You cannot ask questions: anything destructive goes into an '## APPROVAL REQUIRED'
  envelope in your final return and is executed only after a re-spawn carrying
  'APPROVED: <ids>'. This prompt carries: <APPROVED: ... | no approvals>.
SCOPE: in — ssh SERVERNAME, these exact commands: <list>. Out — <explicit paths/services>.
CONTEXT: host HOST, user USER, port PORT, key KEYPATH; Phase 3 already discovered
  OS/Docker/disk (below) — do not re-probe. The user already approved classification
  <READ|CREATE|MODIFY|SERVICE> in Step 3 and DELETE/PRIVILEGE commands were gated out before
  this spawn. Sibling agents run steps <list> on their own hosts; SERVERNAME is yours alone.
CONSUMER: Phase 6 assembles every agent's rows into one Session Report for the user, who
  decides the next action from it — a command whose output you summarize instead of quoting
  cannot be verified, and a silent failure reads there as a success.
DONE: per-command output + final state check, plus the Phase 6 Session Report table
  (Server, Mode, Actions, Changes, Status), plus an '## APPROVAL REQUIRED' section
  (COMMAND/HOST/EFFECT/ROLLBACK/EVIDENCE/PRECONDITION per envelope) or the literal
  'APPROVAL REQUIRED: none'. Report FAILED commands verbatim, never silently.
")
```

For simple single-command operations, execute directly:

**EXECUTE** using Bash tool:
```bash
ssh SERVERNAME "COMMAND" && echo "OK" || echo "FAILED"
```

### Step 5: Docker Auth (if needed)

If task involves Docker registry operations, read `references/docker-auth-flow.md` for auth patterns.

**A registry token is never model-visible.** Do NOT collect it with AskUserQuestion, do not put it in
a command line, do not echo it, do not write it into a file you generate. Ask the user to prepare ONE
of these OUTSIDE the conversation, then read it only inside Bash:

| Source | User prepares (outside the transcript) | Skill reads it as |
|--------|---------------------------------------|-------------------|
| file (recommended) | write the token to `~/.config/brewtools/ghcr.token`, then `chmod 600` that file | `< ~/.config/brewtools/ghcr.token` |
| env var | `read -rs GHCR_TOKEN && export GHCR_TOKEN` in the shell that launched Claude Code, **before** launching it | `"$GHCR_TOKEN"` piped to stdin |

The file path works immediately. The env var only works if the export happened BEFORE this session
started: every Bash tool call spawns a fresh profile-initialised shell, so an export typed in another
terminal — or in this one after launch — is invisible. If `$GHCR_TOKEN` is unset, say so and offer
the file path or a relaunch; !=ask the user to paste the token.

Log in with stdin only — the value never appears in argv, never in `ps`, never in shell history:

**EXECUTE** using Bash tool:
```bash
printf '%s' "$GHCR_TOKEN" | ssh SERVERNAME "docker login ghcr.io -u USERNAME --password-stdin" >/dev/null 2>&1 && echo "OK login ghcr.io" || echo "FAILED login ghcr.io"
```
File variant:
```bash
ssh SERVERNAME "docker login ghcr.io -u USERNAME --password-stdin" < ~/.config/brewtools/ghcr.token >/dev/null 2>&1 && echo "OK login ghcr.io" || echo "FAILED login ghcr.io"
```

Report only `OK login` / `FAILED login`. If the variable is unset, say so and stop — never fall back
to asking for the value in chat. Never run `env`, `set`, or `cat` on the token file.

---

## Phase 6: Session Report

| Field | Value |
|-------|-------|
| Server | SERVERNAME (HOST) |
| Mode | [detected mode] |
| Actions | [list of actions performed] |
| Changes | [list of changes made on server] |
| Status | success / partial / failed |

After execution: if new info discovered, update CLAUDE.local.md; if server state changed significantly, update ssh-admin agent.

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/claude-local-ops.sh" update "SERVERNAME" ...
```

---

## Mode: update-agent

Re-discover all configured servers and refresh the ssh-admin agent.

### Step 1: List Servers

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/claude-local-ops.sh" list
```

### Step 2: Re-discover Each Server

**EXECUTE** using Bash tool:
```bash
SSH_DISCOVER_TIMEOUT=30 bash "${CLAUDE_SKILL_DIR}/scripts/server-discover.sh" "USER@HOST" PORT && echo "OK discovery" || echo "FAILED discovery rc=$?"
```

Same exit-code table as Phase 3. Never wrap in `timeout`.

### Step 3: Update Config & Agent

Update CLAUDE.local.md with fresh data for each server. Regenerate `.claude/agents/ssh-admin.md` from template with updated inventory. Re-resolve `{PLUGIN_VERSION}` and `{LAST_UPDATED}` exactly as in Install Step 3 -- a regeneration is a new write, so the stamp is refreshed, never carried over. Report what changed since last update.

</instructions>

---

## Output Format

```markdown
# SSH [MODE]

## Detection

| Field | Value |
|-------|-------|
| Arguments | `$ARGUMENTS` |
| Mode | `[detected mode]` |

## Environment

| Component | Status |
|-----------|--------|
| SSH keys | [types found] |
| ssh-agent | [running/stopped] |
| SSH config | [exists/missing] |
| Servers configured | [N] |

## Server: [NAME]

| Property | Value |
|----------|-------|
| Host | [IP/hostname] |
| OS | [distribution] |
| Docker | [version] |
| Status | [connected/failed] |

## Actions Taken

- [action 1]
- [action 2]

## Status

[success / partial / failed]
```
