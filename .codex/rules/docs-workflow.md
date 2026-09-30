# Documentation workflow

Use the native `$docs` skill for all public documentation work. Read `.codex/skills/docs/SKILL.md`; do not invoke Claude `/docs` or assume Claude tools/hooks are active.

Public documentation includes repository `README.md` and `RELEASE-NOTES.md`, plugin READMEs, skill/agent READMEs, `web/docs/src/content/docs/**/*.mdx`, and docs-site `navigation.ts`. Route their creation, edits, typo/link fixes, audits, and behavior-driven updates through `$docs`, including review before an explicitly requested release.

| Trigger | Native invocation |
|---|---|
| New shipped-product skill, agent, or hook | `$docs "create documentation for {target}"` |
| Changed shipped-product skill, agent, or plugin behavior/description | `$docs "update documentation for {target}"` |
| Broken link, typo, stale page, or MDX change | `$docs "fix {path or description}"` |
| Requested release | `$docs "review {plugin or scope}"` |
| Repository README or release notes | `$docs "repo — {what changed}"` |

The workflow coordinates five levels: repository README → plugin README → skill/agent README → Astro MDX → navigation. Follow its discovery, generation, independent review, correction, build/link checks, and applicable deployment verification. A successful local build does not prove deployment. Release and deployment require their own authorization.

Direct targeted editing is allowed for implementation files, inline code comments, project instructions (`AGENTS.md`, `.codex/rules/`, native skills/agents, and Claude compatibility instructions), and work reports. Memory writes still require explicit user authorization. Blog posts for the separate `brewcode.app` site use that site's workflow.

Native references live under `.codex/skills/docs/`: `references/mdx-template.mdx`, `references/review-prompt.md`, `references/checklist.md`, `scripts/check-links.sh`, and `scripts/verify-deploy.sh`. Use the native `.codex/agents/docs-writer.toml` writer as directed by the skill.
