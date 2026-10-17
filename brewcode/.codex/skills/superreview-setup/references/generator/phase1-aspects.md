# Phase 1 aspects (brewcode:superreview-setup)

Read by `SKILL.md` Phase 1; generator-only, never emitted.

| Aspect | How to detect | Drives placeholder |
|--------|---------------|--------------------|
| Tech stack | build files: `pom.xml`/`build.gradle*` -> Java/Kotlin; `package.json`+react/ts -> Node/TS; `pyproject.toml`/`requirements*.txt` -> Python; `go.mod` -> Go | `STACK_LABEL`, `STACK_REF`, `SOURCE_GLOB`, `PATHSPEC_GLOBS` |
| Project agents | `.codex/agents/**/*.toml` (recursive, name + description); map each to the path group it owns; flag READ-ONLY recon agents (cloud/SaaS/tracker consoles) as NON-reviewers | `DOMAIN_AGENTS_TABLE`, `FILE_GROUP_MAP`, `GENERAL_AGENTS_TABLE` |
| Arbiter / validator | an architecture/reviewer agent in `.codex/agents/`, else built-in `general-purpose` | `ARBITER_AGENT`, `VALIDATOR_AGENT` |
| Rule + convention files | `.codex/rules/*.md` + `.codex/convention/*.md` + `AGENTS.md` | `RULE_POINTER_TABLE`, `RULE_PREFLIGHT_LIST` |
| Source path groups | top-level source dirs / service dirs / module layout | `FILE_GROUP_MAP` |
| **Mechanical gates** | the REAL build/lint/type/test commands (`package.json` scripts, Makefile, gradle tasks, `pytest`, `go test`), plus where they run from | `GATE_COMMANDS` |
| **Scope tracker** | `.codex/features/**` board, `gh` + `.github/`, Jira/Linear config, branch naming `<type>/<issue>-<slug>` | `TRACKER_LABEL`, `BASELINE_RESOLUTION_BASH`, `SANCTION_PRECEDENCE_TABLE`, `SCOPE_AGENT_A/B` |
| **Shared surfaces** | public API/contract dirs, DB migrations, schema/registry files, CI workflows, dependency manifests, design tokens | `SHARED_SURFACES_TABLE`, `OWNERSHIP_SIGNALS_BASH` |
| Team parallelism | contributors in `git shortlog -sn --since=3.months`, owner columns on the board | `TEAM_NOTE` |
| DB / test stack | testcontainers, JPA/JOOQ, pytest, jest, etc. | folded into the per-stack reference note |
| **Intent tier sources** | Tier 2 = spec/design-doc dirs (`.codex/specs/**`, `docs/specs/**`, an ADR dir); Tier 3 = plan / task board / task graph (`.codex/features/**`, `TASKS.md`); Tier 4 = policy (root + nested `AGENTS.md`, `.codex/rules/**`, `.codex/convention/**`). Tier 1 is `TRACKER_LABEL`, already detected. Absent -> the literal string `none` | `SPEC_LOCATION`, `PLAN_LOCATION`, `POLICY_LOCATION` |
| **Project invariants** | Read them, do not guess — each cited by source file: planned scale (users/RPS/data volume stated in README/AGENTS.md/specs — "personal tool" and "10k RPS" produce opposite drift verdicts); testing policy (the project's own rule: few scenario tests vs full-coverage); dependency policy (pinning rule, "reuse before adding", vendored/allowed sets); file-layout policy (one-file-per-what, module boundaries, naming conventions); architecture stance (the pattern committed to, and what it explicitly rejected) | `PROJECT_INVARIANTS_TABLE` |
| **Known drift instances** | past over-engineering in this repo's history + what its rules explicitly forbid (an `avoid.md` row is a drift class someone already hit) + the vocabulary this team uses for it | `DRIFT_EXAMPLES_TABLE` |
| **Cheap evidence commands** | this repo's real one-liners: `git diff --stat` on the resolved range, the dependency-manifest diff for THIS manifest (`package.json` / `pom.xml` / `pyproject.toml` / `go.mod`), new-file listing, test-file count under the real test dirs | `EVIDENCE_COMMANDS_BASH` |
