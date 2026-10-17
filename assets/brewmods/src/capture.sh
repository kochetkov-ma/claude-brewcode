#!/usr/bin/env bash
# bash capture.sh <tmux-target> <screen> [dir]: pane -> <screen>.txt/.ansi.txt/.cursor; PH_TMUX_SOCKET = tmux -L name.
# PH_SCROLL_UP=N: the view N rows up the scrollback (terminal scrolled up), caret hidden.
set -euo pipefail
[ $# -ge 2 ] || { echo "usage: bash capture.sh <tmux-target> <screen-name> [captures-dir]" >&2; exit 2; }
target="$1"; name="$2"
dir="${3:-$(cd "$(dirname "$0")" && pwd)/placeholders.captures}"
case "$name" in *[!a-z0-9-]*|'') echo "bad screen name: $name (a-z, 0-9, -)" >&2; exit 2;; esac
tm=(tmux)
[ -n "${PH_TMUX_SOCKET:-}" ] && tm+=(-L "$PH_TMUX_SOCKET")
up="${PH_SCROLL_UP:-0}"
case "$up" in *[!0-9]*|'') echo "bad PH_SCROLL_UP: $up" >&2; exit 2;; esac
rows=$("${tm[@]}" display-message -p -t "$target" '#{pane_height}')
range=(); [ "$up" -gt 0 ] && range=(-S "-$up" -E "$((rows - 1 - up))")
mkdir -p "$dir"
# A spinner can tick between the two reads: re-sample until the ANSI text equals the plain one (same instant).
ok=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  "${tm[@]}" capture-pane -p ${range[@]+"${range[@]}"} -t "$target" > "$dir/$name.txt"
  "${tm[@]}" capture-pane -p -e ${range[@]+"${range[@]}"} -t "$target" > "$dir/$name.ansi.txt"
  # OSC (e.g. OSC 8 hyperlinks) dropped as in record-gifs.mjs parseAnsi, then CSI
  a=$(perl -pe 's/\e\][^\a\e]*(?:\a|\e\\)//g; s/\e\[[0-9;:]*[A-Za-z]//g; s/[ \t]+$//' "$dir/$name.ansi.txt"); p=$(perl -pe 's/[ \t]+$//' "$dir/$name.txt")
  [ "$a" = "$p" ] && { ok=1; break; }
done
[ "$ok" = 1 ] || { echo "capture $name: ANSI and plain text never matched in 10 reads" >&2; exit 3; }
if [ "$up" -gt 0 ]; then "${tm[@]}" display-message -p -t "$target" '#{cursor_x} #{cursor_y} 0 #{pane_width} #{pane_height}' > "$dir/$name.cursor"
else "${tm[@]}" display-message -p -t "$target" '#{cursor_x} #{cursor_y} #{cursor_flag} #{pane_width} #{pane_height}' > "$dir/$name.cursor"; fi
echo "captured $name -> $dir ($(cat "$dir/$name.cursor"))"
