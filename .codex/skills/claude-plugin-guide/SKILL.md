---
name: claude-plugin-guide
description: Look up Claude Code plugin authoring contracts in repository references and official documentation; read-only guidance for Claude products.
---

# Claude plugin authoring reference

Resolve the RU/EN question into the relevant manifest, component, marketplace, hook, or installation topic. Return a concise answer with source paths and supported examples. This is read-only product guidance: do not install, enable, update, launch, or repair plugins, execute Claude commands, or self-update this guide.

Read only references relevant to the question:

- [Native Claude product-authoring rules](../../rules/best-practice.md): distributed Claude skill frontmatter, prompt-first invocation, setup lifecycle, and validation; excludes native Codex skills.
- [Product skill-authoring reference](../../../brewcode/agents/skill-creator.md), [frontmatter catalog](../../../brewcode/skills/skills/references/frontmatter-fields.md), and [prompt contract](../../../brewcode/skills/skills/references/prompt-contract.md): canonical tracked skill contracts. [Agent-return-setup](../../../brewtools/skills/agent-return-setup/SKILL.md) demonstrates structural frontmatter/PLAN/lifecycle, not default routing: its default descriptions conflict. Validate affected product skill directories with `bash brewcode/skills/skills/scripts/validate-skill.sh <affected-skill-directory>`.
- Setup defaults are per skill: compare documented behavior with executable resolution and report disagreements. [Teams' parser](../../../brewcode/skills/teams-setup/scripts/detect-mode.sh) and [docsync](../../../brewdoc/skills/docsync-setup/SKILL.md) use installed status/absent install; [semble routing](../../../brewcode/skills/semble-setup/references/intent-routing.md) defaults to read-only status, never a bare machine-level install.
- [Product agent-authoring reference](../../../brewcode/agents/agent-creator.md): tracked Claude agent contracts, distinct from native `.codex/agents/*.toml`.
- [Product hook reference](../../../brewcode/agents/hook-creator.md): tracked Claude product hook contracts; embedded commands and Claude tools are reference text, never executable Codex instructions.
- Relevant tracked manifests under each product's `.claude-plugin/` and its `skills/`, `agents/`, and `hooks/`: actual implementation. Locate with `rg --files`; inspect focused ranges.
- [Official plugin reference](https://code.claude.com/docs/en/plugins-reference), [marketplace reference](https://code.claude.com/docs/en/plugin-marketplaces), and [plugin guide](https://code.claude.com/docs/en/plugins): verify current or uncertain behavior before presenting it as current.

Distinguish tracked implementation, dated reference claims, and verified official behavior. Report source disagreements with evidence. Claude manifests and substitution tokens describe the shipped Claude product; native Codex uses project instructions, skills, agents, and tools with plugins disabled.
