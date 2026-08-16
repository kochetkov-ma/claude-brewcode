# GitHub Actions Workflow Templates

> Based on real workflows from this repository. Replace `{{PLACEHOLDERS}}` with project values.

## Rules every template here obeys (copy them, not just the YAML)

Consumers extend these files, so an unsafe idiom shipped once is re-typed for years.

| # | Rule | Why |
|---|------|-----|
| 1 | **Never** put `${{ ... }}` inside a `run:` body or a `github-script` `script:` body. Pass it through `env:` and read `"$VAR"` / `process.env.VAR` | `${{ }}` is textually pasted into the source BEFORE the shell or JS parser sees it — a value containing `"; rm -rf /` is code, not data |
| 2 | Quote every shell expansion: `"$VAR"`, never bare `$VAR` | word-splitting/globbing on attacker-shaped values |
| 3 | Validate free-text `inputs.*` against an allowlist before use (`image_tag` -> `^[A-Za-z0-9._-]{1,128}$`), and parse ids as integers | a workflow input is untrusted text |
| 4 | `permissions:` is declared explicitly and minimally at the top of every workflow | default token scope is far wider than any of these jobs needs |
| 5 | `pull_request` is allowed (T4 uses it). `pull_request_target` combined with a checkout of the PR head is **forbidden** — it runs fork code with a write token | that pair is the standard fork-PR escalation |
| 6 | Every `uses:` is pinned to an exact `@vX.Y.Z` (verified at the source repo). `@main`/`@master`/an unpinned branch is **forbidden**; every image tag is exact, never `:latest` | `~/.claude/rules/avoid.md` #4 — a floating ref changes what runs without a diff |
| 7 | A health/verification step that did not pass ends in `echo "::error::…"; exit 1` — never `::warning::` | a warning leaves the step green, so `if: success()` posts a *successful* deployment for a broken site |

> Action versions below were verified at the source repos on 2026-08-16. Re-verify before reuse:
> `curl -s https://api.github.com/repos/<owner>/<repo>/releases/latest | jq -r .tag_name`

## Template 1: Build + Push to GHCR

> Based on: `docs.yml` -- builds Docker image, pushes to GitHub Container Registry.

**Trigger:** Tag push `v*.*.*` + branch pushes (except main).
**Key steps:** Checkout, compute tags, Docker Buildx, GHCR login, build+push, summary.

```yaml
name: {{WORKFLOW_NAME}}

on:
  push:
    tags:
      - "v*.*.*"
    branches-ignore:
      - main

permissions:
  contents: read
  packages: write

concurrency:
  group: {{CONCURRENCY_GROUP}}-${{ github.ref }}
  cancel-in-progress: true

env:
  IMAGE: ghcr.io/{{OWNER}}/{{IMAGE_NAME}}

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v7.0.1
        with:
          fetch-depth: 0

      - name: Compute image tags
        id: meta
        run: |
          set -euo pipefail
          if [[ "$GITHUB_REF" == refs/tags/v* ]]; then
            VERSION="${GITHUB_REF_NAME#v}"
            echo "tags=${IMAGE}:${VERSION}" >> "$GITHUB_OUTPUT"
            echo "version=${VERSION}" >> "$GITHUB_OUTPUT"
          else
            BRANCH="${GITHUB_REF_NAME}"
            BRANCH_SAFE=$(echo "$BRANCH" | sed 's/[^a-zA-Z0-9._-]/-/g')
            DESC=$(git describe --tags --long --match "v*.*.*" 2>/dev/null || echo "0.0.0-0-g$(git rev-parse --short HEAD)")
            BASE_VERSION=$(echo "$DESC" | sed 's/^v//' | sed 's/-.*//')
            COMMITS_AFTER=$(echo "$DESC" | sed 's/.*-\([0-9]*\)-g.*/\1/')
            TAG="${BASE_VERSION}-${BRANCH_SAFE}-${COMMITS_AFTER}"
            echo "tags=${IMAGE}:${TAG}" >> "$GITHUB_OUTPUT"
            echo "version=${TAG}" >> "$GITHUB_OUTPUT"
          fi

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v4.2.0

      - name: Log in to GHCR
        uses: docker/login-action@v4.6.0
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v7.3.0
        with:
          context: {{DOCKER_CONTEXT}}
          platforms: linux/amd64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          build-args: VERSION=${{ steps.meta.outputs.version }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Summary
        env:
          VERSION: ${{ steps.meta.outputs.version }}
          TAGS: ${{ steps.meta.outputs.tags }}
        run: |
          set -euo pipefail
          {
            echo "### Image pushed"
            echo ""
            echo "**Version:** \`${VERSION}\`"
            echo ""
            echo "**Tags:**"
            IFS=',' read -ra TAG_LIST <<< "$TAGS"
            for tag in "${TAG_LIST[@]}"; do
              echo "- \`${tag}\`"
            done
          } >> "$GITHUB_STEP_SUMMARY"
```

> Only the exact `${VERSION}` tag is pushed. A convenience `:latest` may be published from a
> separate, clearly-labelled step, but nothing (server, Compose file, rollback) may ever *deploy* it.

**Placeholders:**

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{WORKFLOW_NAME}}` | Display name | `Docs` |
| `{{CONCURRENCY_GROUP}}` | Concurrency group prefix | `docs` |
| `{{OWNER}}` | GitHub owner/org | `kochetkov-ma` |
| `{{IMAGE_NAME}}` | Docker image name | `claude-brewcode-docs` |
| `{{DOCKER_CONTEXT}}` | Docker build context path | `web/docs` |

---

## Template 2: Deploy to VPS

> Based on: `deploy-docs.yml` -- deploys via SSH after upstream build completes.

**Trigger:** `workflow_run` (after build) + `workflow_dispatch` (manual).
**Key steps:** Compute tag, SCP deploy files, SSH deploy script, health check, rollback.

```yaml
name: {{WORKFLOW_NAME}}

on:
  workflow_run:
    workflows: ["{{UPSTREAM_WORKFLOW}}"]
    types: [completed]
  workflow_dispatch:
    inputs:
      image_tag:
        description: "Exact Docker image tag to deploy (no floating tags)"
        required: true

concurrency:
  group: {{CONCURRENCY_GROUP}}
  cancel-in-progress: false

env:
  HEALTH_URL: {{HEALTH_CHECK_URL}}

permissions:
  contents: read
  deployments: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    if: >
      github.event_name == 'workflow_dispatch' ||
      github.event.workflow_run.conclusion == 'success'

    steps:
      - name: Checkout
        uses: actions/checkout@v7.0.1
        with:
          ref: ${{ github.event.workflow_run.head_sha || github.sha }}
          fetch-depth: 0

      - name: Compute image tag
        id: tag
        env:
          EVENT_NAME: ${{ github.event_name }}
          INPUT_TAG: ${{ inputs.image_tag }}
          RUN_BRANCH: ${{ github.event.workflow_run.head_branch }}
          REF_NAME: ${{ github.ref_name }}
        run: |
          set -euo pipefail
          if [[ "$EVENT_NAME" == "workflow_dispatch" ]]; then
            # Free-text workflow input: allowlist it before it reaches .env or docker.
            if [[ ! "$INPUT_TAG" =~ ^[A-Za-z0-9._-]{1,128}$ ]]; then
              echo "::error::image_tag must match ^[A-Za-z0-9._-]{1,128}\$"
              exit 1
            fi
            echo "value=${INPUT_TAG}" >> "$GITHUB_OUTPUT"
          else
            REF="${RUN_BRANCH:-$REF_NAME}"
            if [[ "$REF" =~ ^v[0-9]+\.[0-9]+\.[0-9]+ ]]; then
              echo "value=${REF#v}" >> "$GITHUB_OUTPUT"
            else
              BRANCH_SAFE=$(echo "$REF" | sed 's/[^a-zA-Z0-9._-]/-/g')
              DESC=$(git describe --tags --long --match "v*.*.*" 2>/dev/null || echo "0.0.0-0-g$(git rev-parse --short HEAD)")
              BASE_VERSION=$(echo "$DESC" | sed 's/^v//' | sed 's/-.*//')
              COMMITS_AFTER=$(echo "$DESC" | sed 's/.*-\([0-9]*\)-g.*/\1/')
              echo "value=${BASE_VERSION}-${BRANCH_SAFE}-${COMMITS_AFTER}" >> "$GITHUB_OUTPUT"
            fi
          fi

      - name: Create deployment
        id: deployment
        uses: actions/github-script@v9.0.0
        env:
          IMAGE_TAG: ${{ steps.tag.outputs.value }}
        with:
          script: |
            const tag = process.env.IMAGE_TAG;
            const deployment = await github.rest.repos.createDeployment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              ref: context.sha,
              environment: '{{ENVIRONMENT}}',
              auto_merge: false,
              required_contexts: [],
              description: `Deploy {{SERVICE}} v${tag}`,
            });
            await github.rest.repos.createDeploymentStatus({
              owner: context.repo.owner,
              repo: context.repo.repo,
              deployment_id: deployment.data.id,
              state: 'in_progress',
              log_url: `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
            });
            return deployment.data.id;

      - name: Copy deploy files to VPS
        uses: appleboy/scp-action@v1.0.0
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          source: "{{DEPLOY_FILES_SOURCE}}"
          target: /tmp/{{DEPLOY_SYNC_DIR}}
          strip_components: {{STRIP_COMPONENTS}}

      - name: Deploy service
        uses: appleboy/ssh-action@v1.2.5
        env:
          TAG: ${{ steps.tag.outputs.value }}
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          envs: TAG
          script: |
            set -euo pipefail

            DEPLOY_PATH={{VPS_DEPLOY_PATH}}

            cp /tmp/{{DEPLOY_SYNC_DIR}}/* "$DEPLOY_PATH/" 2>/dev/null || true
            rm -rf /tmp/{{DEPLOY_SYNC_DIR}}

            cd "$DEPLOY_PATH"

            [ -f .env ] && cp .env .env.bak || touch .env.bak

            if grep -q "^{{TAG_VAR}}=" .env 2>/dev/null; then
              sed -i "s/^{{TAG_VAR}}=.*/{{TAG_VAR}}=${TAG}/" .env
            else
              echo "{{TAG_VAR}}=${TAG}" >> .env
            fi

            for attempt in $(seq 1 10); do
              if docker compose pull {{SERVICE_NAME}} 2>&1; then
                break
              fi
              if [ "$attempt" -eq 10 ]; then
                echo "Failed to pull image after 10 attempts"
                exit 1
              fi
              echo "Image not available yet, retrying in 15s... (attempt $attempt/10)"
              sleep 15
            done

            docker compose up -d --no-deps --force-recreate {{SERVICE_NAME}}

            for i in $(seq 1 10); do
              if curl -sf -o /dev/null "{{INTERNAL_HEALTH_URL}}"; then
                echo "Health check passed (attempt $i)"
                exit 0
              fi
              echo "Waiting for service... (attempt $i/10)"
              sleep 5
            done

            echo "Health check failed, rolling back..."
            cp .env.bak .env
            docker compose pull {{SERVICE_NAME}}
            docker compose up -d --no-deps --force-recreate {{SERVICE_NAME}}
            exit 1

      - name: Verify from runner
        run: |
          set -uo pipefail
          for i in $(seq 1 5); do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || true)
            if [[ "$STATUS" == "200" ]]; then
              echo "External health check passed (HTTP $STATUS)"
              exit 0
            fi
            echo "Waiting... (attempt $i/5, HTTP $STATUS)"
            sleep 5
          done
          # A failed verification MUST fail the step. As a warning annotation
          # this exited 0, the next step's `if: success()` fired, and GitHub
          # recorded a successful deployment pointing at a broken site.
          echo "::error::External health check did not return 200 after 5 attempts (last HTTP ${STATUS})"
          exit 1

      - name: Update deployment (success)
        if: success()
        uses: actions/github-script@v9.0.0
        env:
          DEPLOYMENT_ID: ${{ steps.deployment.outputs.result }}
        with:
          script: |
            const id = Number.parseInt(process.env.DEPLOYMENT_ID || '', 10);
            if (!Number.isInteger(id) || id <= 0) {
              core.setFailed(`deployment_id is not a positive integer: ${process.env.DEPLOYMENT_ID}`);
              return;
            }
            await github.rest.repos.createDeploymentStatus({
              owner: context.repo.owner,
              repo: context.repo.repo,
              deployment_id: id,
              state: 'success',
              environment_url: '{{PUBLIC_URL}}',
              log_url: `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
            });

      - name: Update deployment (failure)
        if: failure()
        uses: actions/github-script@v9.0.0
        env:
          DEPLOYMENT_ID: ${{ steps.deployment.outputs.result }}
        with:
          script: |
            const id = Number.parseInt(process.env.DEPLOYMENT_ID || '', 10);
            if (!Number.isInteger(id) || id <= 0) return;
            await github.rest.repos.createDeploymentStatus({
              owner: context.repo.owner,
              repo: context.repo.repo,
              deployment_id: id,
              state: 'failure',
              log_url: `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
            });

      - name: Summary
        if: always()
        env:
          IMAGE_TAG: ${{ steps.tag.outputs.value }}
        run: |
          set -euo pipefail
          {
            echo "### Deploy {{SERVICE}}"
            echo ""
            echo "**Tag:** \`${IMAGE_TAG}\`"
            echo "**Health:** $HEALTH_URL"
          } >> "$GITHUB_STEP_SUMMARY"
```

**Placeholders:**

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{UPSTREAM_WORKFLOW}}` | Build workflow name | `Docs` |
| `{{HEALTH_CHECK_URL}}` | External health check URL | `https://doc-claude.brewcode.app/getting-started/` |
| `{{ENVIRONMENT}}` | GitHub environment name | `docs` |
| `{{SERVICE}}` | Service display name | `docs` |
| `{{DEPLOY_FILES_SOURCE}}` | Files to SCP | `web/docs/deploy/*` |
| `{{DEPLOY_SYNC_DIR}}` | Temp dir on VPS | `brewcode-docs-sync` |
| `{{STRIP_COMPONENTS}}` | SCP strip level | `3` |
| `{{VPS_DEPLOY_PATH}}` | Deploy path on VPS | `/opt/brewcode-docs` |
| `{{TAG_VAR}}` | .env tag variable | `DOCS_TAG` |
| `{{SERVICE_NAME}}` | Docker Compose service | `docs` |
| `{{INTERNAL_HEALTH_URL}}` | Health URL inside VPS | same as HEALTH_CHECK_URL |
| `{{PUBLIC_URL}}` | Public URL for deployment | `https://doc-claude.brewcode.app` |

**Required secrets:** `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`

---

## Template 3: Release

> Based on: `release.yml` -- creates GitHub Release from tag push, extracts changelog.

**Trigger:** Tag push `v*.*.*`
**Key steps:** Extract changelog from RELEASE-NOTES.md, create GitHub Release.

```yaml
name: Release

on:
  push:
    tags:
      - "v*.*.*"

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v7.0.1
        with:
          sparse-checkout: RELEASE-NOTES.md

      - name: Extract changelog for tag version
        id: changelog
        run: |
          set -euo pipefail
          TAG="${GITHUB_REF_NAME}"
          VERSION="${TAG#v}"
          echo "version=${VERSION}" >> "$GITHUB_OUTPUT"
          echo "tag=${TAG}" >> "$GITHUB_OUTPUT"

          RELEASE_NOTES="RELEASE-NOTES.md"

          if [ ! -f "$RELEASE_NOTES" ]; then
            echo "::error::${RELEASE_NOTES} not found"
            exit 1
          fi

          BODY=$(awk -v ver="$VERSION" '
            BEGIN { found=0 }
            $0 ~ "^## (\\[" ver "\\]|v?" ver ")([^0-9.]|$)" {
              found=1
              print
              next
            }
            found && $0 ~ "^## (\\[|v?[0-9])" { exit }
            found && /^---[[:space:]]*$/ { exit }
            found { print }
          ' "$RELEASE_NOTES")

          if [ -z "$BODY" ]; then
            echo "::error::No changelog section found for version ${VERSION} in ${RELEASE_NOTES}"
            exit 1
          fi

          echo "$BODY" > /tmp/release-body.md

          # Append install instructions
          printf '\n---\n\n## Quick Install\n\n```bash\n# Add marketplace\nclaude plugin marketplace add https://github.com/{{OWNER}}/{{REPO}}\n\n# Install plugins\n{{INSTALL_COMMANDS}}\n```\n\n## Already installed? Update\n\n```bash\nclaude plugin marketplace update {{REPO}}\n{{UPDATE_COMMANDS}}\n```\n' >> /tmp/release-body.md

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v3.0.2
        with:
          tag_name: ${{ steps.changelog.outputs.tag }}
          name: ${{ steps.changelog.outputs.tag }}
          body_path: /tmp/release-body.md
          draft: false
          prerelease: false
```

**Placeholders:**

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{OWNER}}` | GitHub owner | `kochetkov-ma` |
| `{{REPO}}` | Repository name | `claude-brewcode` |
| `{{INSTALL_COMMANDS}}` | Plugin install commands | `claude plugin install brewcode@claude-brewcode` |
| `{{UPDATE_COMMANDS}}` | Plugin update commands | `claude plugin update brewcode@claude-brewcode` |

---

## Template 4: Security Scan

> Generic template for dependency/code scanning.

**Trigger:** Push to main + PRs + weekly schedule.
**Key steps:** Checkout, run scanner, upload SARIF, summary.

> This is the one template with a **fork-reachable** trigger (`pull_request`), so it is also the one
> that must never grow a `${{ }}`-in-`run:` sink. `pull_request` checks out the MERGE ref with a
> read-only token — safe. Switching it to `pull_request_target` would run fork code with a write
> token and is forbidden here. `permissions:` stays exactly `contents: read` + `security-events: write`.

```yaml
name: Security Scan

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: "0 6 * * 1"

permissions:
  contents: read
  security-events: write

concurrency:
  group: security-${{ github.ref }}
  cancel-in-progress: true

jobs:
  scan:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v7.0.1

      - name: Run {{SCANNER_NAME}}
        uses: {{SCANNER_ACTION}}
        with:
          {{SCANNER_INPUTS}}

      - name: Upload SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@v3.37.7
        with:
          sarif_file: {{SARIF_PATH}}

      - name: Summary
        if: always()
        env:
          REF_NAME: ${{ github.ref_name }}
        run: |
          set -euo pipefail
          {
            echo "### Security Scan"
            echo ""
            echo "**Scanner:** {{SCANNER_NAME}}"
            echo "**Branch:** ${REF_NAME}"
          } >> "$GITHUB_STEP_SUMMARY"
```

**Placeholders:**

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{SCANNER_NAME}}` | Scanner display name | `Trivy` |
| `{{SCANNER_ACTION}}` | GitHub Action for scanner, exact tag only | `aquasecurity/trivy-action@v0.36.0` |
| `{{SCANNER_INPUTS}}` | Action inputs block | `scan-type: 'fs'` |
| `{{SARIF_PATH}}` | SARIF output path | `trivy-results.sarif` |
