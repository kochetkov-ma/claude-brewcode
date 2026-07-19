# Rules for Codex

Maintains project rule bodies under `.codex/rules/` and a compact discovery table in the applicable `AGENTS.md`. The workflow runs directly without a dedicated organizer agent, invokes `$brewtools:text-optimize -l` for changed rule and index files, and validates that every project rule appears exactly once in the root index.
