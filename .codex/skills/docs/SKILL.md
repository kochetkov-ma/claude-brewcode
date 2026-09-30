---
name: docs
description: Coordinate public plugin documentation across repository, plugin, entity, Astro MDX, and navigation levels, with independent quorum review. Use for documenting skills or agents, plugin docs updates, targeted documentation fixes, and documentation review.
---

# Public documentation

Use Codex tools and collaboration; no Claude tool names, runtime substitutions, or Task Framework. Public docs describe the actual product: preserve valid Claude product commands as examples when documenting Claude features. Native Codex instructions, implementation files, rules, reports, and inline comments are exempt from this public-doc workflow. Public README/MDX prose is English.

Resolve this skill directory from the loaded file location. Before work, verify `references/{checklist,review-prompt}.md`, `references/mdx-template.mdx`, and `scripts/{check-links,verify-deploy}.sh` exist. Stop with the missing paths if unavailable.

## Resolve mode and scope

Parse the free-form RU/EN request; extract targets from prose, paths, and optional flags. An explicit mode token wins. Otherwise score distinct whole-word keyword/phrase hits below; highest score wins. Prefer REVIEW on a tie containing it; for two mutating modes use the earliest keyword. Ask once before writing only if unresolved ambiguity changes the outcome or implies destructive work. No hits or empty input defaults to ENTITY; REVIEW needs no scoping question and uses the stated scope or all public docs.

| Mode | Signals | Writes |
|---|---|---|
| REVIEW | review, check docs, audit docs; ревью, проверь доки, аудит доков | Nothing; findings report |
| FIX | fix, broken, typo, specific file path; исправ, почини, опечатка | Identified files only |
| PLUGIN | Plugin name + docs; plugin name + доки/документация | Plugin README, overview/skills/agents MDX, navigation |
| REPO | repo, root readme, release notes; репо, корневой readme, релиз-ноуты | Root README and RELEASE-NOTES as applicable |
| ENTITY | Skill/agent name or path; default | Applicable entity surfaces below |

`release`/`deploy` are scope hints, not authorization for external actions. Resolve actual source paths rather than assuming plugin counts or inventory totals.

Emit one English `PLAN — docs` block before the first action: `INPUT` (verbatim request), `MODE` (reason), `SCOPE` (target/levels/paths), `DO` (2–5 actions), `RESULT` (deliverable). Track discovery, writing, review, fixes, local validation, and optional release verification using available Codex planning/progress tools; do not invent missing tools.

## Discover and write

Use independent bounded discovery agents for source/dependencies, all five doc levels, one or two current MDX etalons, and applicable rules. Combine results in memory; pass source content, gaps, etalon, rules, and explicit file ownership to writers. Read [checklist](references/checklist.md) for mode matrices and local acceptance.

Survey repo README → plugin README → entity README/source → Astro MDX → `web/docs/src/utils/navigation.ts`, even when the mode only edits a subset. Missing in-scope required pages/entries can be created under the existing request; ask only when a gap would expand its scope. Unknown target: show discovered candidates and ask once. No etalon: use the [native MDX scaffold](references/mdx-template.mdx), replacing every placeholder with actual product behavior and checking imports/icons.

Load indexed `.codex/rules/astro-avoid.md`, `astro-best-practice.md`, and `web-accessibility.md` for MDX/Astro/layout work; load `docker-best-practice.md` and `docker-avoid.md` for docs container/deployment changes. Nested docs-rule material invariants are incorporated in the checklist. Native `.codex/rules/` are not autoloaded.

Delegate one owned file per internal `docs-writer` agent, `.codex/agents/docs-writer.toml`; independent files may run concurrently. Writers receive source, etalon, rules, target path, new/edit intent, and related links. They are not alone: preserve concurrent edits, never re-delegate or mutate Git. Assign shared `navigation.ts` and index sections to one owner; serialize writes to the same file. Existing navigation entries are preserved; reconcile actual conflicts rather than duplicating or overwriting.

## Review and bounded fixes

REVIEW skips writing. Spawn three independent reviewers together over the same file set using [review prompt](references/review-prompt.md): quality, structure, efficiency. Use available Codex agents, not Claude roles/models; reviewers cannot see each other's conclusions before submitting.

Accept a finding with ≥2/3 agreement on the same file + section (same heading or ±5 lines) + category. Log single-reviewer findings; independently investigate any severe (critical/important) singleton against source, components, or tooling before accepting or rejecting it. A majority cannot dismiss a demonstrated severe defect.

Present confirmed findings and apply in-scope fixes already authorized by the task; REVIEW remains read-only. Ask only if remediation changes authorized scope or needs a user choice. Do not dismiss discovered defects as merely pre-existing: resolve within scope, or report the concrete remaining constraint. Respect user-selected/denied fixes and record them. Delegate disjoint fixes to writers; serialize shared files. An independent reviewer then checks fixes and regressions. Allow at most two fix/re-review cycles; report remaining findings afterward. Zero findings skips the fix loop.

## Validate, optionally release, report

Perform checklist local checks even without release. Before invoking the [shared link checker](scripts/check-links.sh), assert every selected MDX file exists; it silently skips missing files. Pass explicit existing changed/reviewed files. Its coverage is quoted internal `href` versus navigation slugs, not all Markdown links, anchors, or page existence; inspect those separately. Report what was actually checked; never claim syntax/build proof from grep or importing TypeScript with unsupported Node behavior.

After changing MDX, navigation, or other docs-site files, require `npm --prefix web/docs run build` (`astro build`); for TypeScript/Astro changes also require `npm --prefix web/docs run check` (`astro check`). Run after coordinated writes/fixes settle; failure or unavailable checks remain a validation gap, not success. Native instruction/report/implementation files and README-only edits do not trigger a docs-site build/check.

Release/deploy requires current explicit authorization for the specific action. Do not infer it from keywords, prior project policy, or the shared scripts. Before authorization is sought, finish a concrete reviewable result. Authorized release: follow indexed release rules, discover tags/version, verify all current version manifests agree, use the maintained bump helper, add touched-page links to release notes, stage only owned files, then commit/push/tag-push under the prescribed failure-stopping sequence. Do not use blanket `git add -A`, push all tags, or update installed plugins unless explicitly included.

For authorized deployment, match the `docs.yml` build run to the exact release SHA/ref and record its run ID. For `deploy-docs.yml` triggered by `workflow_run`, correlate the exact triggering `github.event.workflow_run.id` to that build; verify its payload `head_sha`/`head_branch` against the release SHA/ref, the actual checked-out commit, and the computed/deployed image tag against the image produced by that build. Inspect payload/run linkage and checkout/image logs; if evidence is unavailable, leave provenance unverified. The deploy run's own `headSha` reflects default-branch workflow execution and may differ from the release SHA; do not require equality or use it as content provenance. Both linked runs must conclude successfully. A manually dispatched deployment needs separately proven explicit image/build and checkout provenance; no inferred upstream linkage. CI failure stops deployment acceptance; report it without blind retry. The [shared deploy helper](scripts/verify-deploy.sh) follows latest runs and may skip a missing deploy run: optional diagnostic only, never acceptance evidence. It also performs network calls; invoke only within the authorized deployment scope.

Verify each changed published page with available browser capabilities: successful load, distinctive phrase supplied by its writer, snapshot and screenshot under `.codex/reports/<YYYYMMDD-HHMMSS_name>/`, then close the browser. A reachable landing page alone proves neither the updated content nor the exact deployment. If content is absent, report deployment/content mismatch; do not mark live verification passed. Unavailable browser or network proof remains explicitly unverified.

Final Russian status: mode/target, files changed or reviewed, confirmed findings/fixes/unresolved items, local checks and their limits, commit/push/release/deploy state, exact SHA/run proof and live URL when applicable. Distinguish skipped, failed, and unverified. Complete progress tracking and stop task-started processes.
