---
name: brewcode:ssh
description: "SSH server management — connect, configure, deploy, administer Linux servers with safety gates."
argument-hint: "<prompt describing what to do>"
allowed-tools: Read, Write, Edit, Bash, Task, AskUserQuestion, Glob, Grep
model: opus
user-invocable: true
---

# SSH Server Management

> **Manage remote Linux servers** — connect, configure, deploy, administer with safety gates and persistent config.

<instructions>

## Robustness Rules (MANDATORY — apply to ALL phases)

### Fail-Fast

| Rule | Applies to |
|------|-----------|
| Every Bash call MUST end with `&& echo "OK ..." \|\| echo "FAILED ..."` | ALL scripts |
| On `FAILED` — stop current phase, report error to user, DO NOT retry same command blindly | ALL phases |
| SSH commands MUST use `-o ConnectTimeout=10 -o BatchMode=yes` | ALL SSH calls |
| Max **2 retries** per failed operation. After 2nd failure — report and stop | ALL phases |
| If a script exits non-zero — read its stderr, diagnose, fix root cause, then retry ONCE | Scripts |

### Loop Protection

| Rule | Limit |
|------|-------|
| Phase 2 (Connection Setup) — max **3 key attempts**, then ask user | 3 keys |
| Phase 2 → Phase 5 round-trips — if sent back to Phase 2 more than **once**, stop and report | 1 re-entry |
| Phase 5 (Execute) — max **5 SSH commands per invocation**. If task needs more, delegate to ssh-admin agent via Task | 5 commands |
| update-agent mode — max **3 servers** per run. If more, process first 3 and report remaining | 3 servers |
| AskUserQuestion — max **3 questions per phase**. If skill needs more info, summarize what's missing in one combined question | 3 per phase |

### Timeouts

| Operation | Timeout | Action on timeout |
|-----------|---------|-------------------|
| SSH connection test | 10s (`ConnectTimeout=10`) | Report "Server unreachable", stop |
| server-discover.sh | 30s (`timeout 30 bash ...`) | Report partial results, continue |
| Any single SSH command | 60s (`timeout 60 ssh ...`) | Kill, report "Command timed out", ask user |
| Entire skill invocation | Do not exceed **15 SSH calls total** | Stop, report progress, suggest continuing manually |

### Fallback Strategy

**If a script fails and cannot be fixed:**

1. Report the exact error to user: script name, exit code, stderr
2. Attempt the same operation manually (inline Bash) — scripts are helpers, not gatekeepers
3. If manual fallback also fails — report both attempts and ask user what to do
4. NEVER silently swallow errors or continue with stale/missing data

**Manual fallback examples:**

| Failed script | Manual alternative |
|---------------|--------------------|
| detect-mode.sh | Parse `$ARGUMENTS` yourself — keyword matching is simple |
| ssh-env-check.sh | Run `ls ~/.ssh/id_* 2>/dev/null`, `ssh-add -l`, `cat ~/.ssh/config` |
| server-discover.sh | Run individual commands via SSH: `uname -a`, `docker version`, `df -h` |
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

This is non-negotiable. Silent failures are bugs.

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

**Use the MODE value and GOTO that mode section below.**

### Mode Reference

| Keyword in args | MODE |
|-----------------|------|
| setup, new server, add server | setup |
| connect to, ssh to, login | connect |
| configure, config, harden | configure |
| update agent, refresh agent, refresh | update-agent |
| (any other text) | execute |
| (empty, no servers configured) | setup |
| (empty, servers configured) | execute (prompt user) |

---

## Phase 1: Environment & Config Check

> Runs for ALL modes before branching.

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/ssh-env-check.sh" && echo "OK env-check" || echo "FAILED env-check"
```

> **STOP if FAILED** -- fix SSH environment before continuing.

Parse output key=value pairs. Note available keys and ssh-agent status.

### Load Existing Server Config

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/claude-local-ops.sh" list 2>/dev/null || echo "NO_SERVERS"
```

**Branching logic:**

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

**EXECUTE** using Bash tool -- try existing keys:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/ssh-env-check.sh" && echo "OK keys" || echo "FAILED keys"
```

Parse available keys from output. Try connection with each key (ed25519 first, then rsa, then ecdsa):

**EXECUTE** using Bash tool:
```bash
ssh-keyscan -p PORT HOST >> ~/.ssh/known_hosts 2>/dev/null && echo "OK keyscan" || echo "FAILED keyscan"
```

Replace PORT and HOST with actual values.

**EXECUTE** using Bash tool -- test key auth:
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
bash "${CLAUDE_SKILL_DIR}/scripts/server-discover.sh" "USER@HOST" PORT && echo "OK discovery" || echo "FAILED discovery"
```

Replace USER@HOST and PORT with actual values. If using SSH config alias, pass that instead.

Parse output key=value pairs. Key fields:
- `OS`, `KERNEL`, `ARCH`
- `DOCKER_VERSION`, `DOCKER_COMPOSE`
- `DISK_INFO` (data disks, mount points)
- `RUNNING_CONTAINERS`
- `SERVICES`
- `CURRENT_USER`, `USER_GROUPS`

---

## Phase 4: Persist Config

### Step 1: Update CLAUDE.local.md

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/claude-local-ops.sh" add "SERVERNAME" "HOST" "USER" "PORT" "KEYPATH" && echo "OK add" || echo "FAILED add"
```

Replace placeholders with actual values.

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

Read the agent template:

**EXECUTE** using Bash tool:
```bash
cat "${CLAUDE_SKILL_DIR}/templates/ssh-admin-agent.md.template"
```

Replace placeholders in template:
- `{{SERVER_INVENTORY}}` -- server table from CLAUDE.local.md
- `{{SERVER_DETAILS}}` -- discovered OS/Docker/disk info per server
- `{{LAST_UPDATED}}` -- current ISO timestamp

Write result to `.claude/agents/ssh-admin.md` in the project using Write tool.

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

Analyze the user's request from `$ARGUMENTS`. Create execution plan:

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

For complex multi-step operations, delegate to ssh-admin agent via Task tool:

| Parameter | Value |
|-----------|-------|
| `subagent_type` | `ssh-admin` |
| `prompt` | `[Detailed task description with server info, safety classification, and specific commands to run]` |

For simple single-command operations, execute directly:

**EXECUTE** using Bash tool:
```bash
ssh SERVERNAME "COMMAND" && echo "OK" || echo "FAILED"
```

### Step 5: Docker Auth (if needed)

If task involves Docker registry operations, read `references/docker-auth-flow.md` for auth patterns.

Use AskUserQuestion for registry credentials -- NEVER hardcode tokens.

---

## Phase 6: Session Report

| Field | Value |
|-------|-------|
| Server | SERVERNAME (HOST) |
| Mode | [detected mode] |
| Actions | [list of actions performed] |
| Changes | [list of changes made on server] |
| Status | success / partial / failed |

### Post-Actions

- If new info discovered during execution, update CLAUDE.local.md:
  ```bash
  bash "${CLAUDE_SKILL_DIR}/scripts/claude-local-ops.sh" update "SERVERNAME" ...
  ```
- If server state changed significantly (new containers, services), update ssh-admin agent

---

## Mode: update-agent

Re-discover all configured servers and refresh the ssh-admin agent.

### Step 1: List Servers

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/claude-local-ops.sh" list
```

### Step 2: Re-discover Each Server

For each server from list, run discovery:

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/server-discover.sh" "USER@HOST" PORT && echo "OK discovery" || echo "FAILED discovery"
```

### Step 3: Update Config & Agent

Update CLAUDE.local.md with fresh data for each server.

Regenerate `.claude/agents/ssh-admin.md` from template with updated inventory.

Set `{{LAST_UPDATED}}` to current timestamp.

Report what changed since last update.

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
