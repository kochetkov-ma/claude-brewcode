---
name: deploy
description: "GitHub Actions deployment: workflows, releases, GHCR, CI/CD with safety gates. Triggers: deploy, release, workflow."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [setup|create|release|deploy|monitor|update-agent]"
allowed-tools: [Read, Write, Edit, Bash, Agent, AskUserQuestion, Glob, Grep]
model: opus
---

[DICT: P=Phase, EXEC=EXECUTE using Bash tool, AUQ=AskUserQuestion, WF=workflow, CFG=config, REF=references, GH=gh CLI, TPL=template]

# GitHub Actions Deployment

> Manage GitHub Actions — WFs, releases, GHCR, CI/CD with safety gates + persistent CFG.

## Prompt contract

Position 1 of `$ARGUMENTS` is a **free-form prompt** (RU/EN) — modes and flags are optional and may
follow in any order. Nobody types keys: resolve mode + scope FROM the prompt.

1. Strip flags. An explicit mode token anywhere wins outright, no scoring.
2. Else score modes by distinct whole-word keyword hits (table in P0). Highest unique score wins.
   All zero -> `setup` (no GH CFG) or `monitor` (GH CFG exists).
3. Empty arguments -> `setup`/`monitor` per the rule above; ask ONE scoping `AskUserQuestion` only
   when the answer changes what gets written. `monitor`/`check` ask nothing.
4. Outcome-changing ambiguity (e.g. `release` vs `deploy`) -> ONE `AskUserQuestion` (max 4
   questions) BEFORE any work — P4/P5 confirmation gates cover the destructive cases separately.
5. Prose that is not a mode/id/path is still input: extract the id, path or target from it.

Then print this block ONCE, before the first mutation (P0 is its home for mutating modes;
`monitor` prints it immediately before its P6 report):

```
PLAN — brewtools:deploy
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

Labels are literal; values follow the conversation language.

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
| deploy-local-ops.sh | Read/Edit CLAUDE.local.md directly |

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

### Delegation (any `Task` spawn, e.g. `deploy-admin`)

A big task handed to one agent = an agent gone for an hour: you cannot observe it, cannot correct it, and it usually drifts off-target. One subagent = ONE bounded unit — one deliverable, ~<=5 files, ~<=10 steps, and never more than ONE repo / ONE environment per agent. Bigger MUST be split into N tasks (one per repo, one per environment), all spawned in ONE message.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists — the point beyond the file edit |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, by whom, what runs in parallel — trimmed to what THIS agent needs |
| CONSUMER | who or what uses the result next, and the shape it must fit |
| DONE | acceptance criteria + the exact report shape you want back |

A bare one-line task is never enough. Safety gates are NOT delegable: confirmation gates (P4 Step 5, P5 Step 4) stay in this skill, in the main conversation.

---

## P0: Mode Detection (MANDATORY FIRST STEP)

EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/detect-mode.sh" "$ARGUMENTS"
```
Output: `ARGS: [...] MODE: [...]`

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|--------------|----------|
| `setup` | *(empty, no GH CFG)*, `setup`, `check`, `prerequisites`, `init` | `настройка`, `подготовь`, `проверь настройку` | yes |
| `create` | `create`, `new workflow`, `add workflow` | `создай workflow`, `новый workflow`, `добавь workflow` | yes |
| `release` | `release`, `bump`, `version`, `tag`, `publish` | `релиз`, `версия`, `тег`, `опубликуй` | yes |
| `deploy` | `deploy`, `trigger`, `dispatch`, `run workflow` | `деплой`, `разверни`, `запусти workflow` | yes |
| `monitor` | *(empty, GH CFG exists)*, `monitor`, `watch`, `status`, `check runs`, `logs` | `статус`, `мониторь`, `посмотри логи` | no |
| `update-agent` | `update agent`, `refresh`, `rescan` | `обнови агента`, `пересканируй` | yes |

Print the PLAN block from `## Prompt contract` here (`monitor` prints it before its report
instead), then proceed to P1.

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
bash "${CLAUDE_SKILL_DIR}/scripts/deploy-local-ops.sh" list 2>/dev/null || echo "NO_CONFIG"
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
bash "${CLAUDE_SKILL_DIR}/scripts/deploy-local-ops.sh" add-github "OWNER" "REPO" "ghcr.io" && echo "OK add-github" || echo "FAILED add-github"
```
Replace OWNER + REPO with values from Step 2.
EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/deploy-local-ops.sh" add-workflows && echo "OK add-workflows" || echo "FAILED add-workflows"
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
Resolve the metadata stamp (never hardcode a version). EXEC:
```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
PV=$(jq -r '.version // empty' "$BT_ROOT/.claude-plugin/plugin.json" 2>/dev/null || true)
PV=${PV:-$(basename "$BT_ROOT")}
echo "PLUGIN_VERSION=$PV LAST_UPDATED=$(date +%F)"
```
> **Why the bare form.** `CLAUDE_SKILL_DIR` is a TEXT SUBSTITUTION on the skill prompt, not an env var: CC 2.1.226 rewrites only the EXACT dollar-brace literal `{CLAUDE_SKILL_DIR}` (`replace(/\$\{CLAUDE_SKILL_DIR\}/g, dirname(skillPath))` and a string-pattern `replaceAll`). A brace-modifier form such as `:-fallback` inside the braces is therefore NOT matched, reaches the shell verbatim, and its fallback ALWAYS wins. `CLAUDE_PLUGIN_ROOT` is a real env var but is exported only to hook processes and MCP servers -- never to a skill's Bash tool -- so it is ALWAYS empty here. The skill dir is correct in a cache install AND in a `--plugin-dir` dev run; the cache glob below it is a last-resort fallback only, and it would name the INSTALLED plugin.

Replace placeholders: `{{GITHUB_CONFIG}}`=GH CFG table | `{{WORKFLOW_INVENTORY}}`=WFs table | `{{SERVER_TARGETS}}`=SSH Servers (or "No SSH servers CFG") | `{{SECRETS_LIST}}`=secret names | `{PLUGIN_VERSION}`=`PV` above | `{LAST_UPDATED}`=`date +%F` (`YYYY-MM-DD`, quoted in the frontmatter).
Write to `.claude/agents/deploy-admin.md`.

Leftover-token gate -- BOTH brace families (this skill's `{{...}}` tokens and the single-brace metadata ones). **EXECUTE** using Bash tool:
```bash
F="$PWD/.claude/agents/deploy-admin.md"
test -f "$F" || { echo "❌ FAILED -- $F not written"; exit 1; }
LEFT="$(grep -nE '\{\{|\{(PLUGIN_VERSION|GENERATED_BY|LAST_UPDATED)\}' "$F" || true)"
test -z "$LEFT" && echo "✅ no leftover placeholders" || { echo "❌ FAILED -- leftover placeholders:"; echo "$LEFT"; }
```
> **STOP if ❌** -- re-substitute before continuing.

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
bash "${CLAUDE_SKILL_DIR}/scripts/deploy-local-ops.sh" update-workflows && echo "OK update" || echo "FAILED update"
```

---

## P4: Release (CRITICAL)

Read `REF/safety-rules.md` first. `REF/release-best-practices.md` is a WORKED EXAMPLE from one
multi-package repo — a pattern to adapt, !=commands to run in the current project.

### Step 0: Probe Project Release Tooling (MANDATORY before Steps 2/7/9)

This skill ships to arbitrary repos. It knows NOTHING about the current project's release
scripts until it looks.

EXEC:
```bash
ls .claude/scripts/*.sh 2>/dev/null; ls scripts/ 2>/dev/null | head -20; jq -r '.scripts // {} | keys[]' package.json 2>/dev/null; ls Makefile 2>/dev/null
```
Record: BUMP_SCRIPT (a bump/version script, or `none`) | POST_SCRIPT (a post-release/publish
script, or `none`) | CHANGELOG (`CHANGELOG.md` / `RELEASE-NOTES.md` / `none`).

> A `none` is NOT a failure. It means the step is skipped or done by hand — say so in the report.

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

| BUMP_SCRIPT (Step 0) | Action |
|----------------------|--------|
| found | `bash <BUMP_SCRIPT> X.Y.Z && echo "OK bump" \|\| echo "FAILED bump"` |
| `none`, version files obvious | Edit every version file the repo has (`package.json`, `pyproject.toml`, `gradle.properties`, `*/plugin.json`, `Cargo.toml`, ...) to the SAME X.Y.Z |
| `none`, unclear | AUQ: "No bump script found. Which files carry the version?" |

> Never invent a script path. `bash .claude/scripts/bump-version.sh` exists in SOME repos, not this one by default.

### Step 3: Auto-generate Changelog
Analyze commits since last tag. Group by type (Added/Changed/Fixed).

### Step 4: Update Changelog
Write to CHANGELOG from Step 0, matching the heading style already in that file. If CHANGELOG
is `none` — skip this step, put the summary in the tag/release body instead.

Fallback shape when the file is new/empty:
```markdown
## vX.Y.Z (YYYY-MM-DD)
#### Added / Changed / Fixed
- **category:** description
```

### Step 5: Confirmation Gate
AUQ: "Ready to release vX.Y.Z:\n\n[changelog preview]\n\nThis will:\n1. Commit version bump + changelog\n2. Create tag vX.Y.Z\n3. Push to remote (triggers CI)\n4. [POST_SCRIPT from Step 0, or 'no post-release script']\n\nProceed?"
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
Only if POST_SCRIPT was found in Step 0. Otherwise SKIP and report "no post-release script".
EXEC:
```bash
POST_SCRIPT="<absolute path to the post-release script recorded in Step 0>"
bash "$POST_SCRIPT" && echo "OK post-release" || echo "FAILED post-release"
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
Then verify whatever THIS project actually publishes — pick what applies, skip the rest:

| Artifact | Check |
|----------|-------|
| Container image | `docker manifest inspect <registry>/<image>:vX.Y.Z >/dev/null && echo "OK image" \|\| echo "FAILED image"` |
| npm / PyPI package | `npm view <pkg>@X.Y.Z version` / `curl -sf https://pypi.org/pypi/<pkg>/X.Y.Z/json >/dev/null` |
| Live service | `curl -sf <base>/version` — MUST equal `X.Y.Z` (version gate, not just health) |
| Claude Code plugin | `grep '"version"' ~/.claude/plugins/cache/<marketplace>/<plugin>/X.Y.Z/.claude-plugin/plugin.json` |

> Nothing published → report "no external artifact to verify", !=FAILED.

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
bash "${CLAUDE_SKILL_DIR}/scripts/deploy-local-ops.sh" update-workflows && echo "OK update" || echo "FAILED update"
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
bash "${CLAUDE_SKILL_DIR}/scripts/deploy-local-ops.sh" update-workflows && echo "OK update" || echo "FAILED update"
```

### Step 3: Re-read CFG
EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/deploy-local-ops.sh" read-github 2>/dev/null
```

### Step 4: Regenerate Agent
Read TPL, replace placeholders with fresh data, write to `.claude/agents/deploy-admin.md`.
Re-resolve `{PLUGIN_VERSION}` + `{LAST_UPDATED}` exactly as in P2 Step 8 -- a regeneration is a new write, so the stamp is refreshed, never carried over. Report what changed.

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
