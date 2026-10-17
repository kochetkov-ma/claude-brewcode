#!/bin/bash
# Candidate marketplace: working-tree snapshot -> scratch clone (tags kept for content_version) -> bump 6.10.0, tag, bump 6.10.1.
# Usage: snapshot.sh <repo> <scratch> <old-tag> <file-list (NUL)> <log-dir> <ver1> <ver2>; rc 0 ok, 1 step failed, 2 usage.
set -u -o pipefail
[ $# -eq 7 ] || { echo "usage: snapshot.sh <repo> <scratch> <old-tag> <list> <log-dir> <ver1> <ver2>" >&2; exit 2; }
REPO="$1" S="$2" OLD="$3" LIST="$4" LOG="$5" V1="$6" V2="$7"
GIT=(git -c user.name=live-update-flow -c user.email=luf@localhost -c commit.gpgsign=false -c tag.gpgsign=false -c core.hooksPath=/dev/null)
step() { echo "== $*"; }
die() { echo "FAILED: $*" >&2; exit 1; }

step "clone $REPO -> $S/cand (all tags: bump-version compares bodies against v<content_version>)"
git clone -q "$REPO" "$S/cand" > "$LOG/snapshot-clone.log" 2>&1 || die "clone"
"${GIT[@]}" -C "$S/cand" rm -rq . > /dev/null || die "git rm"
rsync -a --from0 --files-from="$LIST" "$REPO/" "$S/cand/" || die "rsync working tree"
"${GIT[@]}" -C "$S/cand" add -A -f || die "add"
"${GIT[@]}" -C "$S/cand" commit -qm "candidate: working tree snapshot" || die "commit snapshot"
echo "snapshot $("${GIT[@]}" -C "$S/cand" rev-parse HEAD) files $(git -C "$S/cand" ls-files | wc -l | tr -d ' ')"

for V in "$V1" "$V2"; do
  step "bump-version $V"
  # A failure confined to the .codex mirror (Codex only, not a Claude Code plugin byte) is reported, not fatal.
  if ! (cd "$S/cand" && bash .claude/scripts/bump-version.sh "$V") > "$LOG/snapshot-bump-$V.log" 2>&1; then
    other=$(grep -E '^ *FAILED: ' "$LOG/snapshot-bump-$V.log" | grep -vc 'validate-compat.mjs' || true)
    [ "${other:-1}" = 0 ] && grep -q 'validate-compat.mjs' "$LOG/snapshot-bump-$V.log" || die "bump-version $V (see $LOG/snapshot-bump-$V.log)"
    echo "BUMP-CODEX-ONLY $V"
  fi
  "${GIT[@]}" -C "$S/cand" add -A && "${GIT[@]}" -C "$S/cand" commit -qm "release: v$V" && "${GIT[@]}" -C "$S/cand" tag "v$V" || die "commit/tag $V"
done

step "marketplace repo: main = $OLD, then stage refs for $V1 and $V2 (linear history)"
mkdir -p "$S/mwork" && "${GIT[@]}" -C "$S/mwork" init -q -b main || die "init mwork"
put() {
  "${GIT[@]}" -C "$S/mwork" rm -rqf --ignore-unmatch . > /dev/null
  git -C "$1" archive "$2" | tar -x -C "$S/mwork" || die "archive $2"
  "${GIT[@]}" -C "$S/mwork" add -A && "${GIT[@]}" -C "$S/mwork" commit -qm "$3" || die "commit $3"
  "${GIT[@]}" -C "$S/mwork" rev-parse HEAD
}
M1=$(put "$REPO" "$OLD" "marketplace $OLD") || exit 1
M2=$(put "$S/cand" "v$V1" "marketplace v$V1") || exit 1
M3=$(put "$S/cand" "v$V2" "marketplace v$V2") || exit 1
"${GIT[@]}" init -q --bare -b main "$S/market.git" || die "init bare"
"${GIT[@]}" -C "$S/mwork" push -q "$S/market.git" "$M1:refs/heads/main" "$M1:refs/heads/stage-old" "$M2:refs/heads/stage-$V1" "$M3:refs/heads/stage-$V2" || die "push"
echo "M_OLD=$M1"
echo "M_V1=$M2"
echo "M_V2=$M3"
for p in brewcode brewdoc brewtools brewui brewmod-placeholders brewmod-plan-effort; do
  printf '%s %s %s\n' "$p" "$(git -C "$S/market.git" show "stage-$V1:$p/.claude-plugin/plugin.json" | grep -m1 '"version"' | tr -d ' ,')" "$(git -C "$S/market.git" show "stage-$V2:$p/.claude-plugin/plugin.json" | grep -m1 '"version"' | tr -d ' ,')"
done
echo "OK"
