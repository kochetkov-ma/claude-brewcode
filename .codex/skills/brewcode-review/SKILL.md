---
name: brewcode-review
description: Review Brewcode product hooks, scripts, skills, agents, templates, and native compatibility contracts using the shared report-only superreview workflow.
---

# Brewcode review

Apply [superreview](../superreview/SKILL.md) and its [review contract](../superreview/references/review-contract.md), keeping the user's explicit product/path/revision boundary. This adapter adds product checks; it does not duplicate the review engine, apply fixes, or update review instructions.

Read live root/nested `AGENTS.md`, referenced rules, manifests, producer templates, compatibility generators, and existing validation/test entrypoints for the selected product. Treat Claude-facing source as a review subject/evidence when requested, never as the Codex runtime instruction contract.

Check relevant surfaces: hook event/schema and JSON output; ESM/async/error handling; shell interpreter/platform assumptions; skill metadata and usable procedures; native agent TOML versus product Markdown formats; placeholders and generated-versus-canonical lineage; compatibility/install/update preservation; pinned dependencies and actual release/version contracts. Derive requirements from current sources rather than stale fixed counts, plugin versions, role names, or copied flag tables.

Review producer-shaped data through the integrated consumer where feasible. Verify generated parity using existing non-mutating checks or an isolated workspace; never regenerate live files during review. Include ignored instruction targets when explicitly requested. Search existing reusable implementations before suggesting new abstractions.

Honor explicit quorum or critic requests as independent perspectives within available resources; evidence and counterexample validation decide findings, never majority voting. Report one validated product review with coverage, actual checks, unresolved findings, and scope limitations through superreview's report contract.
