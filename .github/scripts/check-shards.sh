#!/usr/bin/env bash
# check-shards.sh <workflow.yml> - every tests/run.sh suite and .codex/tests file must be listed in a shard.
# .codex/plugins/** runners are skipped: validate-compat.mjs proves them byte-equal to <plugin>/.codex/skills/**.
set -uo pipefail
wf="${1:?usage: check-shards.sh <workflow.yml>}"
cd "$(dirname "$0")/../.." || exit 2
fail=0
missing() { echo "::error file=$wf::not in any shard: $1"; fail=1; }

while IFS= read -r runner; do
  lines=$(grep -E "bash ${runner//./\\.}( |\$)" "$wf" || true)
  [ -n "$lines" ] || { missing "$runner"; continue; }
  grep -qE "bash ${runner//./\\.}\$" <<< "$lines" && continue
  for suite in "$(dirname "$runner")"/suite-*.mjs; do
    name=$(basename "$suite" .mjs); name=${name#suite-}
    grep -qE " ${name}( |\$)" <<< "$lines" || missing "$runner $name"
  done
done < <(find brewcode brewdoc brewtools .claude/scripts -path '*/fixtures/*' -prune -o -path '*/tests/run.sh' -print | LC_ALL=C sort)

for test in .codex/tests/*.test.mjs .codex/tests/*.test.py; do
  grep -qE " ${test//./\\.}\$" "$wf" || missing "$test"
done

[ "$fail" -eq 0 ] && echo "all suites are sharded"
exit "$fail"
