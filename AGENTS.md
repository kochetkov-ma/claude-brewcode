# Codex workspace

Four Claude Code plugins: `brewcode/` (skill/agent/rule authoring, semantic search, setup skills), `brewdoc/` (documentation), `brewtools/` (text and ops utilities, manager and subagent-guard setups), `brewui/` (placeholder, no skills). Three Claude Code-only mods (TypeScript hooks modules, no Codex mirror): `brewmod-placeholders/`, `brewmod-plan-effort/`, `brewmod-reminders/`. Claude product files are a separate compatibility surface.

- Use `gpt-6.1-sol` for this workspace. Codex plugins and remote plugins stay disabled; do not install or enable them.
- Native instructions: this file and `.codex/rules/`; skills: `.codex/skills/` with discovery aliases in `.agents/skills/`; agents: `.codex/agents/*.toml`. `.codex/plugins/` is a generated compatibility mirror, not an active plugin dependency.
- Do not configure `CLAUDE.md` as a Codex instruction fallback. Read Claude source files when modifying those products, not as Codex runtime instructions.
- `gh`: switch with `gh auth switch --user kochetkov-ma` when needed; `mkochetkov_tfin` has no repository access.

## Native skills

Read `.codex/skills/<name>/SKILL.md` before use. Invoke by `$name`, not Claude slash commands.

| Skill | Use when |
|---|---|
| `$docs` | Creating, updating, fixing, or reviewing public documentation; mandatory for those changes |
| `$superreview` | Deep project review |
| `$brewcode-review` | Reviewing Brewcode product changes |
| `$memory-sync` | Explicitly requested instruction/memory synchronization |
| `$claude-plugin-guide` | Looking up Claude Code plugin development contracts |
| `$eurodns` | Authorized DNS work through EuroDNS |

## Rule index

Before work, read each rule whose condition matches (`paths` metadata does not enable Codex autoloading). Keep this index synchronized with `.codex/rules/*.md`.

| Rule | Load when | Purpose |
|---|---|---|
| [.codex/rules/avoid.md](.codex/rules/avoid.md) | Any implementation or validation change | Prevent version drift, destructive edits, and shell failure traps |
| [.codex/rules/best-practice.md](.codex/rules/best-practice.md) | Any implementation; Claude product skills/agents; requested releases | Claude product authoring, setup lifecycle, releases, and native execution |
| [.codex/rules/docs-workflow.md](.codex/rules/docs-workflow.md) | Public docs or public behavior changes; requested releases | Mandatory native documentation workflow and exemptions |
| [.codex/rules/semble-first.md](.codex/rules/semble-first.md) | Code discovery or search-engine changes | Semantic search when available; exact and exhaustive search boundaries |
| [.codex/rules/astro-avoid.md](.codex/rules/astro-avoid.md) | Astro, MDX, or docs-site changes | Astro and Starlight failure patterns |
| [.codex/rules/astro-best-practice.md](.codex/rules/astro-best-practice.md) | Astro, MDX, or docs-site changes | Proven Astro and Starlight patterns |
| [.codex/rules/web-accessibility.md](.codex/rules/web-accessibility.md) | Web UI or docs-site changes | Accessible web content and interaction |
| [.codex/rules/docker-avoid.md](.codex/rules/docker-avoid.md) | Dockerfiles, Compose, or container changes | Container anti-patterns |
| [.codex/rules/docker-best-practice.md](.codex/rules/docker-best-practice.md) | Dockerfiles, Compose, or container changes | Container configuration and verification |

## Validation and release

- Automatic CI runs only for stable `vX.Y.Z` release tags: lightweight Validate, secrets scan, release publication, and docs build/deploy. No branch-push, PR, or scheduled runs; full tests, CodeQL, and Semgrep are manual.
- Before merging behavior, generator, hook, or workflow changes, dispatch full tests for the exact candidate ref: `gh workflow run validate.yml --ref <branch> -f full=true`; wait for success and record the run URL/SHA. `gh workflow run validate.yml --ref <branch>` runs smoke checks; text-only changes may use smoke plus the relevant local/docs checks. Do not create a release tag to test CI.
- Heavy suites live in `.github/workflows/tests.yml`; `gh workflow run tests.yml --ref <branch>` also runs them once that workflow exists on the default branch. Keep full test coverage available without attaching it to automatic release checks.
- Native setup: `node .codex/scripts/validate-setup.mjs`.
- Docs build: `npm --prefix web/docs run build`; remote image check: `gh workflow run docs.yml --ref <branch>` (build/verify only). Authorized docs-only publication: `gh workflow run docs.yml --ref main -f publish=true` publishes/deploys without a product release; other refs are rejected. Use the native `$docs` workflow for public documentation changes; implementation, instructions, and work reports are exempt.
- Version source of truth: `bash .claude/scripts/bump-version.sh X.Y.Z`; do not hand-edit version carriers. It synchronizes product manifests, stamps, versioned docs, and the `.codex/` compatibility mirror; read the script for current coverage.
- Release only when explicitly requested (deliberate difference: Claude Code releases autonomously, root `CLAUDE.md`). Commit `feat(release): vX.Y.Z <summary>` (`fix(release):` for a fix-only release), tag `vX.Y.Z`. Include affected documentation links in `RELEASE-NOTES.md` through `$docs`. Native Codex work does not require installing or refreshing Claude plugins.
- After every fix, rerun the relevant check before reporting success. Distinguish edits, validation, commit, push, and release status.
