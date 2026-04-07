---
name: brewcode:deploy
description: "GitHub Actions deployment — workflows, releases, GHCR, CI/CD with safety gates."
argument-hint: "<prompt describing what to do>"
allowed-tools: Read, Write, Edit, Bash, Task, AskUserQuestion, Glob, Grep
model: opus
user-invocable: true
---

# GitHub Actions Deployment

> **Manage GitHub Actions** — workflows, releases, GHCR, CI/CD with safety gates and persistent config.

<instructions>

## Robustness Rules (MANDATORY — apply to ALL phases)

### Fail-Fast

| Rule | Applies to |
|------|-----------|
| Every Bash call MUST end with `&& echo "OK ..." \|\| echo "FAILED ..."` | ALL scripts |
| On `FAILED` — stop current phase, report error to user, DO NOT retry same command blindly | ALL phases |
| Max **2 retries** per failed operation. After 2nd failure — report and stop | ALL phases |
| If a script exits non-zero — read its stderr, diagnose, fix root cause, then retry ONCE | Scripts |

### Loop Protection

| Rule | Limit |
|------|-------|
| `gh auth` attempts — max **2**, then ask user | 2 auth |
| `gh` commands per phase — max **5** | 5 per phase |
| AskUserQuestion — max **3 questions per phase** | 3 per phase |
| update-agent mode — max **5 workflows** per run | 5 workflows |

### Timeouts

| Operation | Timeout | Action on timeout |
|-----------|---------|-------------------|
| `gh` CLI commands | 30s (`timeout 30 gh ...`) | Report "gh timed out", stop |
| `gh run watch` | 5min (`timeout 300 gh run watch ...`) | Report "Watch timed out", switch to polling |
| Entire skill invocation | Do not exceed **15 gh calls total** | Stop, report progress, suggest manual |

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
| gh-env-check.sh | Run `gh auth status`, `gh repo view --json name`, `gh secret list` |
| workflow-discover.sh | Run `ls .github/workflows/`, `gh workflow list`, `gh run list -L 5` |
| deploy-local-ops.sh | Read/write CLAUDE.local.md directly with Read/Edit tools |

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
| setup, check, prerequisites, init | setup |
| create, new workflow, add workflow | create |
| release, bump, version, tag, publish | release |
| deploy, trigger, dispatch, run workflow | deploy |
| monitor, watch, status, check runs, logs | monitor |
| update agent, refresh, rescan | update-agent |
| (empty, no GitHub config) | setup |
| (empty, GitHub config exists) | monitor |

---

## Phase 1: Environment & Config Check

> Runs for ALL modes before branching.

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/gh-env-check.sh" && echo "OK env-check" || echo "FAILED env-check"
```

> **STOP if FAILED** -- fix GitHub environment before continuing.

Parse output key=value pairs. Note gh CLI version, auth status, repo info, secrets count.

### Load Existing Config

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/deploy-local-ops.sh" list 2>/dev/null || echo "NO_CONFIG"
```

Read CLAUDE.local.md if it exists — check for `## GitHub Config` and `## Workflows:` sections.

**Branching logic:**

| Condition | Action |
|-----------|--------|
| `NO_CONFIG` AND mode=`setup` | GOTO Phase 2: Setup |
| `NO_CONFIG` AND mode=`create`/`release`/`deploy` | GOTO Phase 2 (need config first) |
| Config exists AND mode=`setup` | Report existing config, ask if re-setup |
| Config exists AND mode=`create` | GOTO Phase 3: Create Workflow |
| Config exists AND mode=`release` | GOTO Phase 4: Release |
| Config exists AND mode=`deploy` | GOTO Phase 5: Deploy |
| Config exists AND mode=`monitor` | GOTO Phase 6: Monitor |
| mode=`update-agent` | GOTO Mode: update-agent |

---

## Phase 2: Setup

### Step 1: Verify gh Auth

**EXECUTE** using Bash tool:
```bash
gh auth status 2>&1 && echo "OK auth" || echo "FAILED auth"
```

If FAILED — instruct user: `gh auth login`

### Step 2: Detect Repo

**EXECUTE** using Bash tool:
```bash
gh repo view --json owner,name,url,defaultBranchRef,visibility 2>/dev/null && echo "OK repo" || echo "FAILED repo"
```

### Step 3: Check Secrets

**EXECUTE** using Bash tool:
```bash
gh secret list 2>/dev/null && echo "OK secrets" || echo "FAILED secrets"
```

### Step 4: Check SSH Integration

Check if CLAUDE.local.md has SSH server config (for deploy workflows):

**EXECUTE** using Bash tool:
```bash
grep -q "^## SSH Servers" CLAUDE.local.md 2>/dev/null && echo "SSH_SERVERS=exists" || echo "SSH_SERVERS=missing"
```

### Step 5: Discover Workflows

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/workflow-discover.sh" && echo "OK discovery" || echo "FAILED discovery"
```

### Step 6: Persist Config

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/deploy-local-ops.sh" add-github "OWNER" "REPO" "ghcr.io" && echo "OK add-github" || echo "FAILED add-github"
```

Replace OWNER and REPO with detected values from Step 2.

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/deploy-local-ops.sh" add-workflows && echo "OK add-workflows" || echo "FAILED add-workflows"
```

### Step 7: Gitignore

**EXECUTE** using Bash tool:
```bash
grep -q "CLAUDE.local.md" .gitignore 2>/dev/null && echo "EXISTS" || (echo "CLAUDE.local.md" >> .gitignore && echo "ADDED")
```

### Step 8: Generate deploy-admin Agent

Read the agent template:

**EXECUTE** using Bash tool:
```bash
cat "${CLAUDE_SKILL_DIR}/templates/deploy-admin-agent.md.template"
```

Replace placeholders in template:
- `{{GITHUB_CONFIG}}` -- GitHub Config table from CLAUDE.local.md
- `{{WORKFLOW_INVENTORY}}` -- Workflows table from CLAUDE.local.md
- `{{SERVER_TARGETS}}` -- SSH Servers table from CLAUDE.local.md (if exists) or "No SSH servers configured"
- `{{SECRETS_LIST}}` -- secret names from `gh secret list`
- `{{LAST_UPDATED}}` -- current ISO timestamp

Write result to `.claude/agents/deploy-admin.md` in the project using Write tool.

---

## Phase 3: Create Workflow

### Step 1: Load Templates

Read `references/workflow-templates.md` from skill directory for workflow patterns.

### Step 2: Determine Type

Use AskUserQuestion:
```
header: "Workflow Type"
question: "What type of GitHub Actions workflow do you need?"
options:
  - label: "Build + Push to GHCR"
    description: "Build Docker image and push to GitHub Container Registry"
  - label: "Deploy to VPS"
    description: "Deploy via SSH to a remote server"
  - label: "Release"
    description: "Create GitHub Release from tag push"
  - label: "Security Scan"
    description: "Dependency/code scanning with SARIF"
  - label: "Custom"
    description: "Describe your workflow needs"
```

### Step 3: Generate YAML

Based on selected template and user input:
1. Generate workflow YAML with project-specific values
2. Write to `.github/workflows/<name>.yml`
3. Validate YAML structure

**EXECUTE** using Bash tool:
```bash
mkdir -p .github/workflows && echo "OK dir" || echo "FAILED dir"
```

Write workflow file using Write tool.

### Step 4: Update Config

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/deploy-local-ops.sh" update-workflows && echo "OK update" || echo "FAILED update"
```

---

## Phase 4: Release (CRITICAL)

### Safety: Read references/safety-rules.md first

Read `references/safety-rules.md` from skill directory.
Read `references/release-best-practices.md` from skill directory.

### Step 1: Determine Version

Analyze current version:

**EXECUTE** using Bash tool:
```bash
git describe --tags --abbrev=0 2>/dev/null || echo "NO_TAGS"
```

**EXECUTE** using Bash tool:
```bash
git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~10")..HEAD 2>/dev/null | head -20
```

Based on commits since last tag, suggest semver bump (patch/minor/major).

### Step 2: Bump Version

**EXECUTE** using Bash tool:
```bash
bash .claude/scripts/bump-version.sh X.Y.Z && echo "OK bump" || echo "FAILED bump"
```

Replace X.Y.Z with determined version.

### Step 3: Auto-generate Changelog

Analyze commits since last tag. Generate changelog entries grouped by type (Added/Changed/Fixed).

### Step 4: Update RELEASE-NOTES.md

Add new version section at the top of RELEASE-NOTES.md following the project format:

```markdown
## vX.Y.Z (YYYY-MM-DD)

> Docs: [page](https://doc-claude.brewcode.app/plugin/path/) | [page2](...)

### brewcode
#### Added / Changed / Fixed
- **category:** description
```

### Step 5: Confirmation Gate

Use AskUserQuestion:
```
header: "Release Confirmation"
question: "Ready to release vX.Y.Z:\n\n[changelog preview]\n\nThis will:\n1. Commit version bump + changelog\n2. Create tag vX.Y.Z\n3. Push to remote (triggers CI)\n4. Run update-plugin.sh\n\nProceed?"
options:
  - label: "Yes, release"
  - label: "Edit changelog first"
  - label: "Cancel"
```

### Step 6: Commit, Tag, Push

**EXECUTE** using Bash tool:
```bash
git add -A && git commit -m "vX.Y.Z: <summary>" && echo "OK commit" || echo "FAILED commit"
```

**EXECUTE** using Bash tool:
```bash
git tag vX.Y.Z && echo "OK tag" || echo "FAILED tag"
```

**EXECUTE** using Bash tool:
```bash
git push && git push --tags && echo "OK push" || echo "FAILED push"
```

### Step 7: Post-Release

**EXECUTE** using Bash tool:
```bash
bash .claude/scripts/update-plugin.sh && echo "OK update-plugin" || echo "FAILED update-plugin"
```

### Step 8: Monitor CI

**EXECUTE** using Bash tool:
```bash
timeout 60 gh run list -L 3 --json workflowName,status,conclusion,createdAt 2>/dev/null && echo "OK runs" || echo "FAILED runs"
```

Wait for runs triggered by tag push. Report status.

### Step 9: Verify Release

**EXECUTE** using Bash tool:
```bash
gh release view vX.Y.Z --json tagName,name,isDraft,createdAt 2>/dev/null && echo "OK release" || echo "FAILED release"
```

Verify cache:
**EXECUTE** using Bash tool:
```bash
grep '"matcher"' ~/.claude/plugins/cache/claude-brewcode/brewcode/X.Y.Z/hooks/hooks.json 2>/dev/null && echo "OK cache" || echo "FAILED cache"
```

---

## Phase 5: Deploy

### Step 1: Load Safety Rules

Read `references/safety-rules.md` from skill directory.

### Step 2: List Deployable Workflows

**EXECUTE** using Bash tool:
```bash
gh workflow list --json name,state,id --jq '.[] | select(.state == "active")' 2>/dev/null && echo "OK list" || echo "FAILED list"
```

### Step 3: Select Workflow

If multiple deployable workflows, use AskUserQuestion to select.
If `$ARGUMENTS` specifies a workflow, use that.

### Step 4: Confirmation Gate

Use AskUserQuestion:
```
header: "Deploy Confirmation"
question: "About to trigger workflow:\n\n  Workflow: [name]\n  Branch: [branch]\n  Inputs: [if any]\n\nClassification: SERVICE\nProceed?"
options:
  - label: "Yes, deploy"
  - label: "Cancel"
```

### Step 5: Trigger

**EXECUTE** using Bash tool:
```bash
timeout 30 gh workflow run "WORKFLOW_FILE" --ref BRANCH && echo "OK trigger" || echo "FAILED trigger"
```

Replace WORKFLOW_FILE and BRANCH with actual values.

### Step 6: Watch Run

**EXECUTE** using Bash tool:
```bash
sleep 5 && timeout 300 gh run list -w "WORKFLOW_FILE" -L 1 --json databaseId,status,conclusion --jq '.[0]' 2>/dev/null && echo "OK run" || echo "FAILED run"
```

Poll status until complete or timeout.

### Step 7: VPS Health Check (if applicable)

If deploy target is VPS and CLAUDE.local.md has SSH config:

**EXECUTE** using Bash tool:
```bash
curl -sf -o /dev/null -w "%{http_code}" "HEALTH_URL" && echo "OK health" || echo "FAILED health"
```

---

## Phase 6: Monitor

### Step 1: Workflow Runs

**EXECUTE** using Bash tool:
```bash
timeout 30 gh run list -L 10 --json workflowName,status,conclusion,createdAt,headBranch,event 2>/dev/null && echo "OK runs" || echo "FAILED runs"
```

### Step 2: Workflow Status

**EXECUTE** using Bash tool:
```bash
timeout 30 gh workflow list --json name,state,id 2>/dev/null && echo "OK workflows" || echo "FAILED workflows"
```

### Step 3: Releases

**EXECUTE** using Bash tool:
```bash
timeout 30 gh release list -L 5 2>/dev/null && echo "OK releases" || echo "FAILED releases"
```

### Step 4: Failed Run Logs (if any failures found)

If recent runs have `conclusion=failure`:

**EXECUTE** using Bash tool:
```bash
timeout 30 gh run view RUN_ID --log-failed 2>/dev/null | tail -50 && echo "OK logs" || echo "FAILED logs"
```

Replace RUN_ID with the failed run's databaseId.

### Step 5: Update Config

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/deploy-local-ops.sh" update-workflows && echo "OK update" || echo "FAILED update"
```

---

## Mode: update-agent

Re-discover all workflows and refresh the deploy-admin agent.

### Step 1: Discover

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/workflow-discover.sh" && echo "OK discovery" || echo "FAILED discovery"
```

### Step 2: Update Config

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/deploy-local-ops.sh" update-workflows && echo "OK update" || echo "FAILED update"
```

### Step 3: Re-read Config

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/deploy-local-ops.sh" read-github 2>/dev/null
```

### Step 4: Regenerate Agent

Read template, replace placeholders with fresh data, write to `.claude/agents/deploy-admin.md`.

Set `{{LAST_UPDATED}}` to current timestamp.

Report what changed since last update.

</instructions>

---

## Output Format

```markdown
# Deploy [MODE]

## Detection

| Field | Value |
|-------|-------|
| Arguments | `$ARGUMENTS` |
| Mode | `[detected mode]` |

## Environment

| Component | Status |
|-----------|--------|
| gh CLI | [version] |
| Auth | [user] |
| Repo | [owner/name] |
| Secrets | [N configured] |
| Workflows | [N found] |

## Actions Taken

- [action 1]
- [action 2]

## Status

[success / partial / failed]
```
