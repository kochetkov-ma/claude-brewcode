# GitHub Actions Workflow Templates

> Based on real workflows from this repository. Replace `{{PLACEHOLDERS}}` with project values.

## Template 1: Build + Push to GHCR

> Based on: `docs.yml` — builds Docker image, pushes to GitHub Container Registry.

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
        uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - name: Compute image tags
        id: meta
        run: |
          if [[ "$GITHUB_REF" == refs/tags/v* ]]; then
            VERSION="${GITHUB_REF_NAME#v}"
            echo "tags=${IMAGE}:${VERSION},${IMAGE}:latest" >> "$GITHUB_OUTPUT"
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
        uses: docker/setup-buildx-action@v4

      - name: Log in to GHCR
        uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v7
        with:
          context: {{DOCKER_CONTEXT}}
          platforms: linux/amd64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          build-args: VERSION=${{ steps.meta.outputs.version }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Summary
        run: |
          echo "### Image pushed" >> "$GITHUB_STEP_SUMMARY"
          echo "" >> "$GITHUB_STEP_SUMMARY"
          echo "**Version:** \`${{ steps.meta.outputs.version }}\`" >> "$GITHUB_STEP_SUMMARY"
          echo "" >> "$GITHUB_STEP_SUMMARY"
          echo "**Tags:**" >> "$GITHUB_STEP_SUMMARY"
          IFS=',' read -ra TAGS <<< "${{ steps.meta.outputs.tags }}"
          for tag in "${TAGS[@]}"; do
            echo "- \`${tag}\`" >> "$GITHUB_STEP_SUMMARY"
          done
```

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

> Based on: `deploy-docs.yml` — deploys via SSH after upstream build completes.

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
        description: "Docker image tag to deploy"
        required: true
        default: "latest"

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
        uses: actions/checkout@v6
        with:
          ref: ${{ github.event.workflow_run.head_sha || github.sha }}
          fetch-depth: 0

      - name: Compute image tag
        id: tag
        run: |
          if [[ "${{ github.event_name }}" == "workflow_dispatch" ]]; then
            echo "value=${{ inputs.image_tag }}" >> "$GITHUB_OUTPUT"
          else
            REF="${{ github.event.workflow_run.head_branch || github.ref_name }}"
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
        uses: actions/github-script@v8
        with:
          script: |
            const deployment = await github.rest.repos.createDeployment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              ref: context.sha,
              environment: '{{ENVIRONMENT}}',
              auto_merge: false,
              required_contexts: [],
              description: `Deploy {{SERVICE}} v${{ steps.tag.outputs.value }}`,
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
        uses: appleboy/scp-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          source: "{{DEPLOY_FILES_SOURCE}}"
          target: /tmp/{{DEPLOY_SYNC_DIR}}
          strip_components: {{STRIP_COMPONENTS}}

      - name: Deploy service
        uses: appleboy/ssh-action@v1
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
          for i in $(seq 1 5); do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || true)
            if [[ "$STATUS" == "200" ]]; then
              echo "External health check passed (HTTP $STATUS)"
              exit 0
            fi
            echo "Waiting... (attempt $i/5, HTTP $STATUS)"
            sleep 5
          done
          echo "::warning::External health check did not return 200"

      - name: Update deployment (success)
        if: success()
        uses: actions/github-script@v8
        with:
          script: |
            await github.rest.repos.createDeploymentStatus({
              owner: context.repo.owner,
              repo: context.repo.repo,
              deployment_id: ${{ steps.deployment.outputs.result }},
              state: 'success',
              environment_url: '{{PUBLIC_URL}}',
              log_url: `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
            });

      - name: Update deployment (failure)
        if: failure()
        uses: actions/github-script@v8
        with:
          script: |
            const id = ${{ steps.deployment.outputs.result || 0 }};
            if (!id) return;
            await github.rest.repos.createDeploymentStatus({
              owner: context.repo.owner,
              repo: context.repo.repo,
              deployment_id: id,
              state: 'failure',
              log_url: `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
            });

      - name: Summary
        if: always()
        run: |
          echo "### Deploy {{SERVICE}}" >> "$GITHUB_STEP_SUMMARY"
          echo "" >> "$GITHUB_STEP_SUMMARY"
          echo "**Tag:** \`${{ steps.tag.outputs.value }}\`" >> "$GITHUB_STEP_SUMMARY"
          echo "**Health:** $HEALTH_URL" >> "$GITHUB_STEP_SUMMARY"
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

> Based on: `release.yml` — creates GitHub Release from tag push, extracts changelog.

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
        uses: actions/checkout@v6
        with:
          sparse-checkout: RELEASE-NOTES.md

      - name: Extract changelog for tag version
        id: changelog
        run: |
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
        uses: softprops/action-gh-release@v2
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
        uses: actions/checkout@v6

      - name: Run {{SCANNER_NAME}}
        uses: {{SCANNER_ACTION}}
        with:
          {{SCANNER_INPUTS}}

      - name: Upload SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: {{SARIF_PATH}}

      - name: Summary
        if: always()
        run: |
          echo "### Security Scan" >> "$GITHUB_STEP_SUMMARY"
          echo "" >> "$GITHUB_STEP_SUMMARY"
          echo "**Scanner:** {{SCANNER_NAME}}" >> "$GITHUB_STEP_SUMMARY"
          echo "**Branch:** ${{ github.ref_name }}" >> "$GITHUB_STEP_SUMMARY"
```

**Placeholders:**

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{SCANNER_NAME}}` | Scanner display name | `Trivy` |
| `{{SCANNER_ACTION}}` | GitHub Action for scanner | `aquasecurity/trivy-action@master` |
| `{{SCANNER_INPUTS}}` | Action inputs block | `scan-type: 'fs'` |
| `{{SARIF_PATH}}` | SARIF output path | `trivy-results.sarif` |
