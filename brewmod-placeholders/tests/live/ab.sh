#!/bin/bash
# Live gate (paid, haiku): the mod alone (brewtools off) injects each codeword block once via hooks/inject.mjs, byte-equal to the golden. rc 0 PASS, 1 FAIL, 2 precondition; AB_ONLY=<run> runs one.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$HERE/../.." && pwd)"
PY="$HERE/ab-check.py"
unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT CLAUDE_EFFORT CLAUDE_MODEL ANTHROPIC_MODEL CLAUDE_CODE_SESSION_ID CLAUDE_CODE_CHILD_SESSION CLAUDE_PROJECT_DIR

OUT="$(mktemp -d)"
echo "ab.sh: logs in $OUT (kept)"

echo "ab.sh: claude $(claude --version) | mod $SRC | brewtools disabled for every run"

# AB_SRC=worktree (default): snapshot of the mod dir now; AB_SRC=head: committed HEAD via git archive (read-only). Isolates the run from a peer's mid-edit.
MOD="$OUT/mod"
mkdir "$MOD"
if [ "${AB_SRC:-worktree}" = head ]; then
  TOP="$(git -C "$SRC" rev-parse --show-toplevel)" || exit 2
  PFX="$(git -C "$SRC" rev-parse --show-prefix)" || exit 2
  git -C "$TOP" archive --format=tar -o "$OUT/head.tar" "HEAD:${PFX%/}" || exit 2
  tar -xf "$OUT/head.tar" -C "$MOD" || exit 2
else
  cp -R "$SRC/." "$MOD/" || exit 2
fi
if [ ! -f "$MOD/.claude-plugin/plugin.json" ] || [ ! -f "$MOD/hooks/register.ts" ]; then echo "ab.sh: PRECONDITION mod snapshot $MOD is incomplete"; exit 2; fi
echo "ab.sh: source ${AB_SRC:-worktree} | $(cd "$MOD" && shasum -a 256 hooks/register.ts hooks/hooks.json .claude-plugin/plugin.json $(ls hooks/lib/*) | awk '{print substr($1,1,12), $2}' | tr '\n' ';')"

mkdir "$OUT/repo" "$OUT/repo2"
git init -q "$OUT/repo" && git init -q "$OUT/repo2"
python3 -I "$PY" mkrepo "$OUT/repo" root || exit 2
python3 -I "$PY" mkrepo "$OUT/repo2" deep || exit 2

while IFS=$'\t' read -r NAME CWDKEY PM MODE BTS PROMPT; do
  case "$CWDKEY" in
    tmp) W="$(mktemp -d)" ;;
    repo-root) W="$OUT/repo" ;;
    repo-deep) W="$OUT/repo/sub/deep" ;;
    repo2-deep) W="$OUT/repo2/sub/deep" ;;
    *) echo "ab.sh: bad cwd key $CWDKEY"; exit 2 ;;
  esac
  SID="$(uuidgen | tr 'A-Z' 'a-z')"
  echo "$SID" > "$OUT/$NAME.sid"
  ARGS=(-p --model haiku --max-turns 1 --permission-mode "$PM" --output-format stream-json --verbose --debug-file "$OUT/$NAME.debug.log" --session-id "$SID")
  ARGS+=(--plugin-dir "$MOD")
  if [ "$BTS" = off ]; then ARGS+=(--settings '{"enabledPlugins":{"brewtools@claude-brewcode":false}}'); fi
  (cd "$W" && claude "${ARGS[@]}" "$PROMPT" < /dev/null > "$OUT/$NAME.stream.jsonl" 2> "$OUT/$NAME.err"; echo "rc=$?" > "$OUT/$NAME.rc")
  python3 -I "$PY" extract "$OUT" "$NAME"
done < <(python3 -I "$PY" plan | { if [ -n "${AB_ONLY:-}" ]; then awk -F'\t' -v n="$AB_ONLY" '$1==n'; else cat; fi; })

python3 -I "$PY" verdict "$OUT" > "$OUT/verdict.txt"
RC=$?
cat "$OUT/verdict.txt"
echo "ab.sh: logs in $OUT; rc=$RC"
exit $RC
