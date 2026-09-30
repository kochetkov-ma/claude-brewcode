# Avoid

- Do not bump only one version carrier. Use `bash .claude/scripts/bump-version.sh X.Y.Z` to synchronize all authoritative version files and generated artifacts.
- Do not report a fix complete without rerunning its relevant verification; repeat fix → check until passing or report the remaining failure.
- Do not overwrite a whole file for a targeted change; use `apply_patch` and preserve concurrent work. When edits depend on line numbers, apply them in descending order or use stable context anchors.
- Do not discard changes with `git revert`, `git reset`, `git restore`, or `git checkout -- <file>` without explicit user confirmation. Read-only uses do not discard changes.
- Under `set -o pipefail`, a filtering `grep -v` or `grep -q` returning 1 can abort a valid empty-result path, including a command-substitution assignment under `errexit`. Add `|| true` only when zero matches are valid and downstream code handles the empty result; preserve genuine errors otherwise.
