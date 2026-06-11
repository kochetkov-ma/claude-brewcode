---
name: brewtools:deploy
description: "GitHub Actions deployment: workflows, releases, GHCR, CI/CD with safety gates. Triggers: deploy, release, workflow."
argument-hint: "<prompt describing what to do>"
allowed-tools: Read, Write, Edit, Bash, Task, AskUserQuestion, Glob, Grep
model: opus
user-invocable: true
---

[DICT: P=Phase, EXEC=EXECUTE using Bash tool, AUQ=AskUserQuestion, WF=workflow, CFG=config, REF=references, GH=gh CLI, TPL=template, LOPS=deploy-local-ops.sh]

# GitHub Actions Deployment

> Manage GitHub Actions — WFs, releases, GHCR, CI/CD with safety gates + persistent CFG.

<instructions>

## Robustness Rules (MANDATORY — ALL phases)

### Fail-Fast
| Rule | Scope |
|------|-------|
| Every Bash call: `&& echo "OK ..." \|\| echo "FAILED ..."` | ALL scripts |
| On FAILED: stop phase, report error, !=retry same command blindly | ALL |
| Max 2 retries per failed op. After 2nd — report + stop | ALL |
| Script exits non-zero: read stderr, diagnose, fix root cause, retry ONCE | Scripts |

### Loop Protection
| Rule | Limit |
|------|-------|
| `gh auth` attempts | max 2, then AUQ |
| GH commands per phase | max 5 |
| AUQ per phase | max 3 |
| update-agent mode WFs per run | max 5 |

### Timeouts
| Op | Timeout | On timeout |
|----|---------|------------|
| GH CLI cmds | `timeout 30 gh ...` | report "gh timed out", stop |
| `gh run watch` | `timeout 300 gh run watch ...` | switch to polling |
| Entire invocation | max 15 GH calls total | stop, report progress, suggest manual |

### Fallback Strategy
1. Report exact error: script name, exit code, stderr
2. Attempt same op manually (inline Bash) — scripts are helpers, not gatekeepers
3. If manual also fails → report both + AUQ what to do
4. !=silently swallow errors or continue with stale/missing data

| Failed script | Manual alternative |
|---------------|--------------------|
| detect-mode.sh | parse $ARGUMENTS (keyword match) |
| gh-env-check.sh | `gh auth status`, `gh repo view --json name`, `gh secret list` |
| workflow-discover.sh | `ls .github/workflows/`, `gh workflow list`, `gh run list -L 5` |
| LOPS | Read/Edit CLAUDE.local.md directly |

### Error Reporting (MANDATORY)
On ANY failure — before stopping or AUQ:
```
SCRIPT_ERROR: <name>
EXIT_CODE: <code>
STDERR: <message>
PHASE: <current>
ACTION: <attempted>
FALLBACK: <next OR "asking user">
```
Silent failures = bugs.

---

## P0: Mode Detection (MANDATORY FIRST STEP)

EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/detect-mode.sh" "$ARGUMENTS"
```
Output: `ARGS: [...] MODE: [...]`

| Keyword | MODE |
|---------|------|
| setup, check, prerequisites, init | setup |
| create, new workflow, add workflow | create |
| release, bump, version, tag, publish | release |
| deploy, trigger, dispatch, run workflow | deploy |
| monitor, watch, status, check runs, logs | monitor |
| update agent, refresh, rescan | update-agent |
| (empty, no GH CFG) | setup |
| (empty, GH CFG exists) | monitor |

---

## P1: Environment + CFG Check (ALL modes before branching)

EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/gh-env-check.sh" && echo "OK env-check" || echo "FAILED env-check"
```
> STOP if FAILED — fix GH env before continuing.

Parse key=value: GH CLI version, auth status, repo info, secrets count.

### Load Existing CFG
EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/${LOPS}" list 2>/dev/null || echo "NO_CONFIG"
```
Read CLAUDE.local.md — check `## GitHub Config` + `## Workflows:` sections.

| Condition | Action |
|-----------|--------|
| NO_CONFIG + mode=setup | GOTO P2 |
| NO_CONFIG + mode=create/release/deploy | GOTO P2 (need CFG first) |
| CFG exists + mode=setup | report existing CFG, AUQ re-setup? |
| CFG exists + mode=create | GOTO P3 |
| CFG exists + mode=release | GOTO P4 |
| CFG exists + mode=deploy | GOTO P5 |
| CFG exists + mode=monitor | GOTO P6 |
| mode=update-agent | GOTO Mode: update-agent |

---

## P2: Setup

### Step 1: Verify GH Auth
EXEC:
```bash
gh auth status 2>&1 && echo "OK auth" || echo "FAILED auth"
```
If FAILED → instruct: `gh auth login`

### Step 2: Detect Repo
EXEC:
```bash
gh repo view --json owner,name,url,defaultBranchRef,visibility 2>/dev/null && echo "OK repo" || echo "FAILED repo"
```

### Step 3: Check Secrets
EXEC:
```bash
gh secret list 2>/dev/null && echo "OK secrets" || echo "FAILED secrets"
```

### Step 4: Check SSH Integration
EXEC:
```bash
grep -q "^## SSH Servers" CLAUDE.local.md 2>/dev/null && echo "SSH_SERVERS=exists" || echo "SSH_SERVERS=missing"
```

### Step 5: Discover WFs
EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/workflow-discover.sh" && echo "OK discovery" || echo "FAILED discovery"
```

### Step 6: Persist CFG
EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/${LOPS}" add-github "OWNER" "REPO" "ghcr.io" && echo "OK add-github" || echo "FAILED add-github"
```
Replace OWNER + REPO with values from Step 2.
EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/${LOPS}" add-workflows && echo "OK add-workflows" || echo "FAILED add-workflows"
```

### Step 7: Gitignore
EXEC:
```bash
grep -q "CLAUDE.local.md" .gitignore 2>/dev/null && echo "EXISTS" || (echo "CLAUDE.local.md" >> .gitignore && echo "ADDED")
```

### Step 8: Generate deploy-admin Agent
EXEC:
```bash
cat "${CLAUDE_SKILL_DIR}/templates/deploy-admin-agent.md.template"
```
Replace placeholders: `{{GITHUB_CONFIG}}`=GH CFG table | `{{WORKFLOW_INVENTORY}}`=WFs table | `{{SERVER_TARGETS}}`=SSH Servers (or "No SSH servers CFG") | `{{SECRETS_LIST}}`=secret names | `{{LAST_UPDATED}}`=current ISO timestamp.
Write to `.claude/agents/deploy-admin.md`.

---

## P3: Create WF

### Step 1: Load TPLs
Read `REF/workflow-templates.md` for WF patterns.

### Step 2: Determine Type
AUQ: "What type of GitHub Actions WF?"
- "Build + Push to GHCR" — Docker image → GHCR
- "Deploy to VPS" — SSH to remote server
- "Release" — GitHub Release from tag push
- "Security Scan" — dependency/code scan with SARIF
- "Custom" — describe needs

### Step 3: Generate YAML
1. Generate WF YAML with project-specific values
2. Write to `.github/workflows/<name>.yml`
3. Validate YAML structure

EXEC:
```bash
mkdir -p .github/workflows && echo "OK dir" || echo "FAILED dir"
```
Write WF file via Write tool.

### Step 4: Update CFG
EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/${LOPS}" update-workflows && echo "OK update" || echo "FAILED update"
```

---

## P4: Release (CRITICAL)

Read `REF/safety-rules.md` + `REF/release-best-practices.md` first.

### Step 1: Determine Version
EXEC:
```bash
git describe --tags --abbrev=0 2>/dev/null || echo "NO_TAGS"
```
EXEC:
```bash
git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~10")..HEAD 2>/dev/null | head -20
```
Suggest semver bump (patch/minor/major) based on commits.

### Step 2: Bump Version
EXEC:
```bash
bash .claude/scripts/bump-version.sh X.Y.Z && echo "OK bump" || echo "FAILED bump"
```

### Step 3: Auto-generate Changelog
Analyze commits since last tag. Group by type (Added/Changed/Fixed).

### Step 4: Update RELEASE-NOTES.md
Add at top:
```markdown
## vX.Y.Z (YYYY-MM-DD)
> Docs: [page](https://doc-claude.brewcode.app/plugin/path/) | [page2](...)
### brewcode
#### Added / Changed / Fixed
- **category:** description
```

### Step 5: Confirmation Gate
AUQ: "Ready to release vX.Y.Z:\n\n[changelog preview]\n\nThis will:\n1. Commit version bump + changelog\n2. Create tag vX.Y.Z\n3. Push to remote (triggers CI)\n4. Run update-plugin.sh\n\nProceed?"
Options: "Yes, release" | "Edit changelog first" | "Cancel"

### Step 6: Commit + Tag + Push
EXEC:
```bash
git add -A && git commit -m "vX.Y.Z: <summary>" && echo "OK commit" || echo "FAILED commit"
```
EXEC:
```bash
git tag vX.Y.Z && echo "OK tag" || echo "FAILED tag"
```
EXEC:
```bash
git push && git push --tags && echo "OK push" || echo "FAILED push"
```

### Step 7: Post-Release
EXEC:
```bash
bash .claude/scripts/update-plugin.sh && echo "OK update-plugin" || echo "FAILED update-plugin"
```

### Step 8: Monitor CI
EXEC:
```bash
timeout 60 gh run list -L 3 --json workflowName,status,conclusion,createdAt 2>/dev/null && echo "OK runs" || echo "FAILED runs"
```
Wait for runs triggered by tag push. Report status.

### Step 9: Verify Release
EXEC:
```bash
gh release view vX.Y.Z --json tagName,name,isDraft,createdAt 2>/dev/null && echo "OK release" || echo "FAILED release"
```
EXEC:
```bash
grep '"matcher"' ~/.claude/plugins/cache/claude-brewcode/brewcode/X.Y.Z/hooks/hooks.json 2>/dev/null && echo "OK cache" || echo "FAILED cache"
```

---

## P5: Deploy

### Step 1: Load Safety Rules
Read `REF/safety-rules.md`.

### Step 2: List Deployable WFs
EXEC:
```bash
gh workflow list --json name,state,id --jq '.[] | select(.state == "active")' 2>/dev/null && echo "OK list" || echo "FAILED list"
```

### Step 3: Select WF
If multiple: AUQ to select. If $ARGUMENTS specifies WF → use that.

### Step 4: Confirmation Gate
AUQ: "About to trigger WF:\n\n  WF: [name]\n  Branch: [branch]\n  Inputs: [if any]\n\nClassification: SERVICE\nProceed?"
Options: "Yes, deploy" | "Cancel"

### Step 5: Trigger
EXEC:
```bash
timeout 30 gh workflow run "WORKFLOW_FILE" --ref BRANCH && echo "OK trigger" || echo "FAILED trigger"
```

### Step 6: Watch Run
EXEC:
```bash
sleep 5 && timeout 300 gh run list -w "WORKFLOW_FILE" -L 1 --json databaseId,status,conclusion --jq '.[0]' 2>/dev/null && echo "OK run" || echo "FAILED run"
```
Poll until complete or timeout.

### Step 7: VPS Health Check (if deploy target is VPS + CLAUDE.local.md has SSH CFG)
EXEC:
```bash
curl -sf -o /dev/null -w "%{http_code}" "HEALTH_URL" && echo "OK health" || echo "FAILED health"
```

---

## P6: Monitor

### Step 1: WF Runs
EXEC:
```bash
timeout 30 gh run list -L 10 --json workflowName,status,conclusion,createdAt,headBranch,event 2>/dev/null && echo "OK runs" || echo "FAILED runs"
```

### Step 2: WF Status
EXEC:
```bash
timeout 30 gh workflow list --json name,state,id 2>/dev/null && echo "OK workflows" || echo "FAILED workflows"
```

### Step 3: Releases
EXEC:
```bash
timeout 30 gh release list -L 5 2>/dev/null && echo "OK releases" || echo "FAILED releases"
```

### Step 4: Failed Run Logs (if conclusion=failure found)
EXEC:
```bash
timeout 30 gh run view RUN_ID --log-failed 2>/dev/null | tail -50 && echo "OK logs" || echo "FAILED logs"
```
Replace RUN_ID with failed run's databaseId.

### Step 5: Update CFG
EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/${LOPS}" update-workflows && echo "OK update" || echo "FAILED update"
```

---

## Mode: update-agent

Re-discover all WFs + refresh deploy-admin agent.

### Step 1: Discover
EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/workflow-discover.sh" && echo "OK discovery" || echo "FAILED discovery"
```

### Step 2: Update CFG
EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/${LOPS}" update-workflows && echo "OK update" || echo "FAILED update"
```

### Step 3: Re-read CFG
EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/${LOPS}" read-github 2>/dev/null
```

### Step 4: Regenerate Agent
Read TPL, replace placeholders with fresh data, write to `.claude/agents/deploy-admin.md`.
Set `{{LAST_UPDATED}}` = current timestamp. Report what changed.

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
| Secrets | [N CFG] |
| WFs | [N found] |

## Actions Taken
- [action 1]
- [action 2]

## Status
[success / partial / failed]
```
