# GitHub Actions Workflow Templates

> Based on real workflows from this repository. Replace `{{PLACEHOLDERS}}` with project values.

## Rules every template here obeys (copy them, not just the YAML)

Consumers extend these files, so an unsafe idiom shipped once is re-typed for years.

| # | Rule | Why |
|---|------|-----|
| 1 | **Never** put `${{ ... }}` inside a `run:` body or a `github-script` `script:` body. Pass it through `env:` and read `"$VAR"` / `process.env.VAR` | `${{ }}` is textually pasted into the source BEFORE the shell or JS parser sees it — a value containing `"; rm -rf /` is code, not data |
| 2 | Quote every shell expansion: `"$VAR"`, never bare `$VAR` | word-splitting/globbing on attacker-shaped values |
| 3 | Validate image input syntax and require a bounded semver-derived or `sha-<40hex>-<run-id>-<attempt>` tag; reject aliases. Parse ids as integers | free text and mutable aliases cannot establish provenance |
| 4 | `permissions:` is declared explicitly and minimally at the top of every workflow | default token scope is far wider than any of these jobs needs |
| 5 | `pull_request` is allowed (T4 uses it). `pull_request_target` combined with a checkout of the PR head is **forbidden** — it runs fork code with a write token | that pair is the standard fork-PR escalation |
| 6 | Templates retain their dated exact `@vX.Y.Z` pins; repository workflows may use bounded major action pins. `@main`/`@master`/an unpinned branch is **forbidden**; every image tag is exact, never `:latest` | `~/.claude/rules/avoid.md` #4 — a floating ref changes what runs without a diff |
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
          SHA=$(git rev-parse HEAD)
          [[ "$SHA" =~ ^[0-9a-f]{40}$ && "$GITHUB_RUN_ID" =~ ^[1-9][0-9]*$ && "$GITHUB_RUN_ATTEMPT" =~ ^[1-9][0-9]*$ ]] || { echo "::error::Build provenance validation failed"; exit 1; }
          if [[ "$GITHUB_REF" == refs/tags/v* ]]; then
            VERSION="${GITHUB_REF_NAME#v}"
          else
            BRANCH_SAFE="${GITHUB_REF_NAME//[^a-zA-Z0-9._-]/-}"
            DESC=$(git describe --tags --long --match "v*.*.*" 2>/dev/null || echo "0.0.0-0-g$(git rev-parse --short HEAD)")
            BASE_VERSION="${DESC#v}"
            BASE_VERSION="${BASE_VERSION%%-*}"
            COMMITS_AFTER="${DESC%-g*}"
            COMMITS_AFTER="${COMMITS_AFTER##*-}"
            [[ "$COMMITS_AFTER" =~ ^[0-9]+$ ]] || { echo "::error::Invalid git describe distance"; exit 1; }
            VERSION="${BASE_VERSION}-${BRANCH_SAFE}-${COMMITS_AFTER}"
          fi
          [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([._-][A-Za-z0-9._-]+)?$ && ${#VERSION} -le 128 ]] || { echo "::error::Build provenance validation failed"; exit 1; }
          printf 'tags=%s:%s,%s:sha-%s-%s-%s\nversion=%s\nsha=%s\n' \
            "$IMAGE" "$VERSION" "$IMAGE" "$SHA" "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT" "$VERSION" "$SHA" >> "$GITHUB_OUTPUT"
          mkdir -p {{DOCKER_CONTEXT}}/public
          printf '{"version":"%s","sha":"%s","buildRunId":"%s"}\n' \
            "$VERSION" "$SHA" "$GITHUB_RUN_ID" > {{DOCKER_CONTEXT}}/public/build-info.json

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
          labels: |
            org.opencontainers.image.version=${{ steps.meta.outputs.version }}
            org.opencontainers.image.revision=${{ steps.meta.outputs.sha }}
            io.brewcode.docs.build-run-id=${{ github.run_id }}
            io.brewcode.docs.build-attempt=${{ github.run_attempt }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Summary
        env:
          VERSION: ${{ steps.meta.outputs.version }}
          TAGS: ${{ steps.meta.outputs.tags }}
          BUILD_SHA: ${{ steps.meta.outputs.sha }}
        run: |
          {
            echo "### Docs image pushed"
            echo ""
            echo "**Version:** \`${VERSION}\` / **SHA:** \`${BUILD_SHA}\` / **Build run:** $GITHUB_RUN_ID"
            echo ""
            echo "**Tags:**"
            IFS=',' read -ra TAG_LIST <<< "$TAGS"
            for tag in "${TAG_LIST[@]}"; do
              echo "- \`${tag}\`"
            done
          } >> "$GITHUB_STEP_SUMMARY"
```

> Push the bounded version and SHA/run tags only. Generate `public/build-info.json` during CI,
> copied unchanged into the static image as `{version,sha,buildRunId}`. Its three fields and OCI
> labels must agree. SHA/run/attempt tags distinguish reruns; the downstream workflow verifies the successful source run and actual checkout.
> No floating alias or default is published or deployed. This static-site template assumes the image
> contains `cat` and `sha256sum`; adapt the artifact probe to the discovered runtime rather than skip it.

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
**Key steps:** Validate tag, verify image/run provenance, checkout verified SHA, SCP, SSH deployment,
verify running digest/labels and served metadata/content, rollback on failure. A healthy old site fails.

```yaml
name: {{WORKFLOW_NAME}}
on:
  workflow_run:
    workflows: ["{{UPSTREAM_WORKFLOW}}"]
    types: [completed]
  workflow_dispatch:
    inputs:
      image_tag:
        description: "Exact version or SHA-run image tag"
        required: true
concurrency:
  group: {{CONCURRENCY_GROUP}}
  cancel-in-progress: false
env:
  IMAGE: ghcr.io/{{OWNER}}/{{IMAGE_NAME}}
  HEALTH_URL: {{HEALTH_CHECK_URL}}
  BUILD_INFO_URL: {{BUILD_INFO_URL}}
permissions:
  contents: read
  actions: read
  packages: read
  deployments: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    if: >
      github.event_name == 'workflow_dispatch' ||
      (github.event.workflow_run.conclusion == 'success' &&
       github.event.workflow_run.head_repository.full_name == github.repository)
    steps:
      - name: Resolve image tag
        id: request
        env:
          EVENT_NAME: ${{ github.event_name }}
          INPUT_TAG: ${{ inputs.image_tag }}
          UPSTREAM_SHA: ${{ github.event.workflow_run.head_sha }}
          UPSTREAM_RUN_ID: ${{ github.event.workflow_run.id }}
          UPSTREAM_RUN_ATTEMPT: ${{ github.event.workflow_run.run_attempt }}
        run: |
          set -euo pipefail
          if [[ "$EVENT_NAME" == workflow_dispatch ]]; then
            [[ "$INPUT_TAG" =~ ^[A-Za-z0-9._-]{1,128}$ ]] || { echo "::error::Invalid image tag"; exit 1; }
            [[ "$INPUT_TAG" =~ ^[0-9]+\.[0-9]+\.[0-9]+([._-][A-Za-z0-9._-]+)?$ ||
               "$INPUT_TAG" =~ ^sha-[0-9a-f]{40}-[1-9][0-9]*-[1-9][0-9]*$ ]] || { echo "::error::A bounded version or SHA-run tag is required"; exit 1; }
            TAG="$INPUT_TAG"
          else
            [[ "$UPSTREAM_SHA" =~ ^[0-9a-f]{40}$ && "$UPSTREAM_RUN_ID" =~ ^[1-9][0-9]*$ && "$UPSTREAM_RUN_ATTEMPT" =~ ^[1-9][0-9]*$ ]] || { echo "::error::Build provenance validation failed"; exit 1; }
            TAG="sha-${UPSTREAM_SHA}-${UPSTREAM_RUN_ID}-${UPSTREAM_RUN_ATTEMPT}"
          fi
          printf 'tag=%s\n' "$TAG" >> "$GITHUB_OUTPUT"
      - name: Log in to GHCR
        uses: docker/login-action@v4.6.0
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Verify image provenance
        id: image
        env:
          REQUEST_TAG: ${{ steps.request.outputs.tag }}
          UPSTREAM_SHA: ${{ github.event.workflow_run.head_sha }}
          UPSTREAM_RUN_ID: ${{ github.event.workflow_run.id }}
          UPSTREAM_RUN_ATTEMPT: ${{ github.event.workflow_run.run_attempt }}
        run: |
          set -euo pipefail
          docker pull "${IMAGE}:${REQUEST_TAG}"
          SHA=$(docker image inspect "${IMAGE}:${REQUEST_TAG}" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
          VERSION=$(docker image inspect "${IMAGE}:${REQUEST_TAG}" --format '{{index .Config.Labels "org.opencontainers.image.version"}}')
          BUILD_RUN_ID=$(docker image inspect "${IMAGE}:${REQUEST_TAG}" --format '{{index .Config.Labels "io.brewcode.docs.build-run-id"}}')
          BUILD_ATTEMPT=$(docker image inspect "${IMAGE}:${REQUEST_TAG}" --format '{{index .Config.Labels "io.brewcode.docs.build-attempt"}}')
          [[ "$SHA" =~ ^[0-9a-f]{40}$ && "$BUILD_RUN_ID" =~ ^[1-9][0-9]*$ && "$BUILD_ATTEMPT" =~ ^[1-9][0-9]*$ ]] || { echo "::error::Build provenance validation failed"; exit 1; }
          [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([._-][A-Za-z0-9._-]+)?$ && ${#VERSION} -le 128 ]] || { echo "::error::Build provenance validation failed"; exit 1; }
          TAG="sha-${SHA}-${BUILD_RUN_ID}-${BUILD_ATTEMPT}"
          [[ "$REQUEST_TAG" == "$VERSION" || "$REQUEST_TAG" == "$TAG" ]] || { echo "::error::Build provenance validation failed"; exit 1; }
          [[ -z "$UPSTREAM_SHA" || ( "$SHA" == "$UPSTREAM_SHA" && "$BUILD_RUN_ID" == "$UPSTREAM_RUN_ID" && "$BUILD_ATTEMPT" == "$UPSTREAM_RUN_ATTEMPT" ) ]] || { echo "::error::Build provenance validation failed"; exit 1; }
          DIGEST=$(docker image inspect "${IMAGE}:${REQUEST_TAG}" --format '{{range .RepoDigests}}{{println .}}{{end}}' | awk -v prefix="${IMAGE}@sha256:" 'index($0,prefix)==1 {print; exit}')
          [[ "$DIGEST" == "${IMAGE}@sha256:"* && "${DIGEST#"$IMAGE"@sha256:}" =~ ^[0-9a-f]{64}$ ]] || { echo "::error::Build provenance validation failed"; exit 1; }
          docker pull "${IMAGE}:${TAG}"
          docker image inspect "${IMAGE}:${TAG}" --format '{{range .RepoDigests}}{{println .}}{{end}}' | grep -Fx -- "$DIGEST"
          EXPECTED_INFO=$(printf '{"version":"%s","sha":"%s","buildRunId":"%s"}' "$VERSION" "$SHA" "$BUILD_RUN_ID")
          [[ "$(docker run --rm --entrypoint cat "$DIGEST" /srv/build-info.json)" == "$EXPECTED_INFO" ]] || { echo "::error::Build provenance validation failed"; exit 1; }
          PAGE_HASH=$(docker run --rm --entrypoint sha256sum "$DIGEST" {{BUILT_HEALTH_PAGE}} | awk '{print $1}')
          [[ "$PAGE_HASH" =~ ^[0-9a-f]{64}$ ]] || { echo "::error::Build provenance validation failed"; exit 1; }
          printf 'sha=%s\nversion=%s\nbuild_run_id=%s\nbuild_attempt=%s\ntag=%s\ndigest=%s\npage_hash=%s\n' \
            "$SHA" "$VERSION" "$BUILD_RUN_ID" "$BUILD_ATTEMPT" "$TAG" "$DIGEST" "$PAGE_HASH" >> "$GITHUB_OUTPUT"
      - name: Verify successful source build
        uses: actions/github-script@v9.0.0
        env:
          BUILD_SHA: ${{ steps.image.outputs.sha }}
          BUILD_RUN_ID: ${{ steps.image.outputs.build_run_id }}
          BUILD_ATTEMPT: ${{ steps.image.outputs.build_attempt }}
        with:
          script: |
            const id = Number(process.env.BUILD_RUN_ID);
            const attempt = Number(process.env.BUILD_ATTEMPT);
            if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(attempt) || attempt <= 0) throw new Error('Invalid build run/attempt');
            const { data: run } = await github.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}', {
              ...context.repo, run_id: id, attempt_number: attempt,
            });
            const { data: workflow } = await github.rest.actions.getWorkflow({ ...context.repo, workflow_id: run.workflow_id });
            if (run.status !== 'completed' || run.conclusion !== 'success' ||
                run.head_sha !== process.env.BUILD_SHA || run.run_attempt !== attempt || run.event !== 'push' ||
                run.head_repository?.full_name !== context.repo.owner + '/' + context.repo.repo ||
                workflow.path !== '{{UPSTREAM_WORKFLOW_PATH}}') {
              throw new Error('Image does not match a successful same-repository Docs build');
            }
      - name: Checkout verified source
        uses: actions/checkout@v7.0.1
        with:
          ref: ${{ steps.image.outputs.sha }}
          fetch-depth: 0
      - name: Verify checkout
        env:
          BUILD_SHA: ${{ steps.image.outputs.sha }}
        run: |
          set -euo pipefail
          [[ "$(git rev-parse HEAD)" == "$BUILD_SHA" ]] || { echo "::error::Build provenance validation failed"; exit 1; }
      - name: Create deployment
        id: deployment
        uses: actions/github-script@v9.0.0
        env:
          BUILD_SHA: ${{ steps.image.outputs.sha }}
          IMAGE_TAG: ${{ steps.image.outputs.tag }}
          IMAGE_DIGEST: ${{ steps.image.outputs.digest }}
          BUILD_RUN_ID: ${{ steps.image.outputs.build_run_id }}
          BUILD_ATTEMPT: ${{ steps.image.outputs.build_attempt }}
        with:
          script: |
            const deployment = await github.rest.repos.createDeployment({
              ...context.repo, ref: process.env.BUILD_SHA, environment: '{{ENVIRONMENT}}',
              auto_merge: false, required_contexts: [],
              description: 'Deploy docs ' + process.env.IMAGE_TAG,
              payload: { imageDigest: process.env.IMAGE_DIGEST, buildRunId: process.env.BUILD_RUN_ID, buildAttempt: process.env.BUILD_ATTEMPT },
            });
            await github.rest.repos.createDeploymentStatus({
              ...context.repo, deployment_id: deployment.data.id, state: 'in_progress',
              log_url: context.serverUrl + '/' + context.repo.owner + '/' + context.repo.repo + '/actions/runs/' + context.runId,
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
      - name: Deploy docs service
        uses: appleboy/ssh-action@v1.2.5
        env:
          TAG: ${{ steps.image.outputs.tag }}
          EXPECTED_SHA: ${{ steps.image.outputs.sha }}
          EXPECTED_VERSION: ${{ steps.image.outputs.version }}
          EXPECTED_RUN: ${{ steps.image.outputs.build_run_id }}
          EXPECTED_ATTEMPT: ${{ steps.image.outputs.build_attempt }}
          EXPECTED_DIGEST: ${{ steps.image.outputs.digest }}
          EXPECTED_PAGE_HASH: ${{ steps.image.outputs.page_hash }}
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          envs: TAG,EXPECTED_SHA,EXPECTED_VERSION,EXPECTED_RUN,EXPECTED_ATTEMPT,EXPECTED_DIGEST,EXPECTED_PAGE_HASH
          script: |
            set -euo pipefail
            DOCS_PATH={{VPS_DEPLOY_PATH}}
            cp -R /tmp/{{DEPLOY_SYNC_DIR}}/. "$DOCS_PATH/"
            rm -rf /tmp/{{DEPLOY_SYNC_DIR}}
            cd "$DOCS_PATH"
            HAD_ENV=false
            if [ -f .env ]; then HAD_ENV=true; cp .env .env.bak; fi
            rollback() {
              trap - ERR
              if [ "$HAD_ENV" = true ]; then
                cp .env.bak .env
                docker compose pull {{SERVICE_NAME}} && docker compose up -d --no-deps --force-recreate {{SERVICE_NAME}} || true
              else
                docker compose stop {{SERVICE_NAME}} || true
                rm -f .env
              fi
              echo "Deployment failed; rollback attempted, verify the previous service separately"
              exit 1
            }
            trap rollback ERR
            if grep -q "^{{TAG_VAR}}=" .env 2>/dev/null; then
              sed -i "s:^{{TAG_VAR}}=.*:{{TAG_VAR}}=${TAG}:" .env
            else
              printf '{{TAG_VAR}}=%s\n' "$TAG" >> .env
            fi
            for attempt in $(seq 1 10); do
              if docker compose pull {{SERVICE_NAME}}; then break; fi
              if [ "$attempt" -eq 10 ]; then rollback; fi
              sleep 15
            done
            docker image inspect "ghcr.io/{{OWNER}}/{{IMAGE_NAME}}:${TAG}" --format '{{range .RepoDigests}}{{println .}}{{end}}' | grep -Fx -- "$EXPECTED_DIGEST"
            EXPECTED_IMAGE_ID=$(docker image inspect "$EXPECTED_DIGEST" --format '{{.Id}}')
            docker compose up -d --no-deps --force-recreate {{SERVICE_NAME}}
            CONTAINER_ID=$(docker compose ps -q {{SERVICE_NAME}})
            [ -n "$CONTAINER_ID" ]
            [ "$(docker inspect "$CONTAINER_ID" --format '{{.Image}}')" = "$EXPECTED_IMAGE_ID" ]
            [ "$(docker inspect "$CONTAINER_ID" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$EXPECTED_SHA" ]
            [ "$(docker inspect "$CONTAINER_ID" --format '{{index .Config.Labels "org.opencontainers.image.version"}}')" = "$EXPECTED_VERSION" ]
            [ "$(docker inspect "$CONTAINER_ID" --format '{{index .Config.Labels "io.brewcode.docs.build-run-id"}}')" = "$EXPECTED_RUN" ]
            [ "$(docker inspect "$CONTAINER_ID" --format '{{index .Config.Labels "io.brewcode.docs.build-attempt"}}')" = "$EXPECTED_ATTEMPT" ]
            EXPECTED_INFO=$(printf '{"version":"%s","sha":"%s","buildRunId":"%s"}' "$EXPECTED_VERSION" "$EXPECTED_SHA" "$EXPECTED_RUN")
            for i in $(seq 1 10); do
              INFO=$(curl -fsS "{{INTERNAL_BUILD_INFO_URL}}?build=${EXPECTED_RUN}" || true)
              PAGE_HASH=$(curl -fsS "{{INTERNAL_HEALTH_URL}}?build=${EXPECTED_RUN}" | sha256sum | awk '{print $1}') || PAGE_HASH=""
              if [ "$INFO" = "$EXPECTED_INFO" ] && [ "$PAGE_HASH" = "$EXPECTED_PAGE_HASH" ]; then
                trap - ERR
                echo "Running image and served build metadata/content verified"
                exit 0
              fi
              sleep 5
            done
            rollback
      - name: Verify from runner
        env:
          EXPECTED_SHA: ${{ steps.image.outputs.sha }}
          EXPECTED_VERSION: ${{ steps.image.outputs.version }}
          EXPECTED_RUN: ${{ steps.image.outputs.build_run_id }}
          EXPECTED_PAGE_HASH: ${{ steps.image.outputs.page_hash }}
        run: |
          set -euo pipefail
          EXPECTED_INFO=$(printf '{"version":"%s","sha":"%s","buildRunId":"%s"}' "$EXPECTED_VERSION" "$EXPECTED_SHA" "$EXPECTED_RUN")
          for i in $(seq 1 5); do
            INFO=$(curl -fsS "${BUILD_INFO_URL}?build=${EXPECTED_RUN}" || true)
            PAGE_HASH=$(curl -fsS "${HEALTH_URL}?build=${EXPECTED_RUN}" | sha256sum | awk '{print $1}') || PAGE_HASH=""
            if [[ "$INFO" == "$EXPECTED_INFO" && "$PAGE_HASH" == "$EXPECTED_PAGE_HASH" ]]; then
              echo "External build metadata and content verified"
              exit 0
            fi
            echo "Waiting for matching build metadata/content (attempt $i/5)"
            sleep 5
          done
          echo "::error::External build metadata/content did not match after 5 attempts"
          exit 1
      - name: Update deployment (success)
        if: success()
        uses: actions/github-script@v9.0.0
        env:
          DEPLOYMENT_ID: ${{ steps.deployment.outputs.result }}
        with:
          script: |
            const id = Number.parseInt(process.env.DEPLOYMENT_ID || '', 10);
            if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid deployment ID');
            await github.rest.repos.createDeploymentStatus({
              ...context.repo, deployment_id: id, state: 'success',
              environment_url: '{{PUBLIC_URL}}',
              log_url: context.serverUrl + '/' + context.repo.owner + '/' + context.repo.repo + '/actions/runs/' + context.runId,
            });
      - name: Update deployment (failure)
        if: failure()
        uses: actions/github-script@v9.0.0
        env:
          DEPLOYMENT_ID: ${{ steps.deployment.outputs.result }}
        with:
          script: |
            const id = Number.parseInt(process.env.DEPLOYMENT_ID || '', 10);
            if (!Number.isSafeInteger(id) || id <= 0) return;
            await github.rest.repos.createDeploymentStatus({
              ...context.repo, deployment_id: id, state: 'failure',
              log_url: context.serverUrl + '/' + context.repo.owner + '/' + context.repo.repo + '/actions/runs/' + context.runId,
            });
      - name: Summary
        if: always()
        env:
          TAG: ${{ steps.image.outputs.tag }}
          BUILD_SHA: ${{ steps.image.outputs.sha }}
          BUILD_RUN_ID: ${{ steps.image.outputs.build_run_id }}
          BUILD_ATTEMPT: ${{ steps.image.outputs.build_attempt }}
          DIGEST: ${{ steps.image.outputs.digest }}
        run: |
          printf '### Deploy Docs\n\nTag: %s\n\nSHA: %s\n\nBuild run: %s\n\nDigest: %s\n\nHealth: %s\n' \
            "$TAG" "$BUILD_SHA" "$BUILD_RUN_ID" "$DIGEST" "$HEALTH_URL" >> "$GITHUB_STEP_SUMMARY"
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
| `{{UPSTREAM_WORKFLOW_PATH}}` | Verified build workflow path | `.github/workflows/docs.yml` |
| `{{BUILD_INFO_URL}}` | Public JSON build metadata URL | `https://doc-claude.brewcode.app/build-info.json` |
| `{{INTERNAL_BUILD_INFO_URL}}` | Metadata URL accessible from VPS | same as BUILD_INFO_URL |
| `{{BUILT_HEALTH_PAGE}}` | Exact HTML artifact inside image | `/srv/getting-started/index.html` |
| `{{OWNER}}`, `{{IMAGE_NAME}}` | Same registry image as Template 1 | `kochetkov-ma`, `claude-brewcode-docs` |

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
