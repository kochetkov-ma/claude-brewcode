# Codex workspace

This repository develops four Claude Code products: `brewcode/` (specification and semantic search), `brewdoc/` (documentation), `brewtools/` (text utilities), and `brewui/` (UI and creative tools). Codex works through native project instructions, skills, agents, and tools; Claude product files remain a separate compatibility surface.

- Use `gpt-6.1-sol` for this workspace. Codex plugins and remote plugins stay disabled; do not install or enable them.
- Native instructions: this file and `.codex/rules/`; skills: `.codex/skills/` with discovery aliases in `.agents/skills/`; agents: `.codex/agents/*.toml`. `.codex/plugins/` is a generated compatibility mirror, not an active plugin dependency.
- Do not configure `CLAUDE.md` as a Codex instruction fallback. Read Claude source files when modifying those products, not as Codex runtime instructions.
- Keep Codex and Claude credentials, auth, runtime state, histories, databases, caches, and shell snapshots separate. Do not copy them between tools.
- GitHub owner account: `kochetkov-ma`; switch with `gh auth switch --user kochetkov-ma` when needed. `mkochetkov_tfin` has no repository access.
- Preserve concurrent edits. Use targeted `apply_patch` changes. Discarding changes requires explicit user confirmation.
- Pin dependencies, images, and Git references to bounded versions; no `latest`, `@latest`, floating branches, or equivalent. GitHub Actions major pins such as `@v4` are allowed.

## Native skills

Read the relevant `.codex/skills/<name>/SKILL.md` before use. Invoke native skills by `$name`, not Claude slash commands.

| Skill | Use when |
|---|---|
| `$docs` | Creating, updating, fixing, or reviewing public documentation; mandatory for those changes |
| `$superreview` | Deep project review |
| `$brewcode-review` | Reviewing Brewcode product changes |
| `$memory-sync` | Explicitly requested instruction/memory synchronization |
| `$claude-plugin-guide` | Looking up Claude Code plugin development contracts |
| `$update-overview` | Reporting the native static Codex setup inventory |
| `$eurodns` | Authorized DNS work through EuroDNS |

## Rule index

Rule files are not automatically loaded. Before work, read each rule whose condition matches; its `paths` metadata, if present, does not enable Codex autoloading. Keep this complete index synchronized with `.codex/rules/*.md`.

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

- Native setup: `node .codex/scripts/validate-setup.mjs`.
- Docs build: `npm --prefix web/docs run build`. Use the native `$docs` workflow for public documentation changes; implementation, instructions, and work reports are exempt.
- Version source of truth: `bash .claude/scripts/bump-version.sh X.Y.Z`; do not hand-edit version carriers. It synchronizes product manifests, stamps, versioned docs, and the `.codex/` compatibility mirror; read the script for current coverage.
- Release only when explicitly requested. Discover tags and select the version first; then perform staging, commit, push, and tag push in one `&&` chain so a failure stops later steps. Include affected documentation links in `RELEASE-NOTES.md` through `$docs`. Native Codex work does not require installing or refreshing Claude plugins.
- After every fix, rerun the relevant check before reporting success. Distinguish edits, validation, commit, push, and release status.
