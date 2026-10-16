#!/usr/bin/env bash
# run.sh - check-links.sh Callout regression: one .mdx fixture per case, exact stdout + rc compared.
# No network: needs bash, awk (BSD, mawk or gawk) and the repo's navigation.ts; rc 1 on any failed case.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK="$SCRIPT_DIR/../scripts/check-links.sh"
TMP_ROOT="${TMPDIR:-/tmp}"; TMP_ROOT="${TMP_ROOT%/}"
WORK="$(mktemp -d "$TMP_ROOT/check-links-tests.XXXXXX")"
# EXIT: delete only the work dir made above (under TMPDIR, expected prefix).
trap 'case "$WORK" in "$TMP_ROOT"/check-links-tests.?*) rm -rf -- "$WORK" ;; esac' EXIT

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  sed -n '2,3p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi
[ -f "$CHECK" ] || { printf '❌ no such script: %s\n' "$CHECK" >&2; exit 1; }

OK_LINE='✅ all internal links valid, no JSX <code> hazards, no code inside <Callout>'
FAIL_LINE='❌ broken links, JSX <code> hazards or code inside <Callout> found'
PASSED=0
FAILED=0

# fx NAME < content: writes $WORK/NAME.mdx.
fx() { cat > "$WORK/$1.mdx"; }

# case_ NAME [LINE:KIND:OPEN ...]: no triple = clean file (rc 0); each triple = one expected hit line (rc 1).
case_() {
  local name="$1" f exp erc got rc=0 triple ln kind open
  shift
  f="$WORK/$name.mdx"
  if [ "$#" -eq 0 ]; then
    exp="$OK_LINE"; erc=0
  else
    exp=""; erc=1
    for triple in "$@"; do
      IFS=: read -r ln kind open <<< "$triple"
      exp+="$(printf '❌ %s:%s: %s inside <Callout> (opened at line %s) renders as a cramped scroll strip → put the code right after </Callout>' "$f" "$ln" "$kind" "$open")"$'\n'
    done
    exp+="$FAIL_LINE"
  fi
  got=$(bash "$CHECK" "$f" 2>&1) || rc=$?
  if [ "$got" = "$exp" ] && [ "$rc" -eq "$erc" ]; then
    PASSED=$((PASSED + 1)); printf '  PASS  %s\n' "$name"
  else
    FAILED=$((FAILED + 1)); printf '  FAIL  %s (rc %s, want %s)\n--- want\n%s\n--- got\n%s\n' "$name" "$rc" "$erc" "$exp" "$got"
  fi
}

# GIVEN a fence or <pre> inside <Callout> WHEN checked THEN each is reported as line:kind:open.
fx fence_in_callout <<'EOF'
<Callout type="tip">
text
```bash
echo hi
```
</Callout>
EOF
case_ fence_in_callout '3:fenced code block:1'

fx tilde_fence <<'EOF'
<Callout>
~~~
x
~~~
</Callout>
EOF
case_ tilde_fence '2:fenced code block:1'

fx four_tick_fence_with_inner_three <<'EOF'
<Callout>
````mdx
```js
x
```
````
</Callout>
EOF
case_ four_tick_fence_with_inner_three '2:fenced code block:1'

fx pre_in_callout <<'EOF'
<Callout>
<pre><code>x</code></pre>
</Callout>
EOF
case_ pre_in_callout '2:<pre>:1'

fx nested_callout <<'EOF'
<Callout>
<Callout>inner</Callout>
```
x
```
</Callout>
EOF
case_ nested_callout '3:fenced code block:1'

fx indented_fence <<'EOF'
<Callout>
  ```js
  x
  ```
</Callout>
EOF
case_ indented_fence '2:fenced code block:1'

fx open_tag_ends_on_next_line <<'EOF'
<Callout
  type="tip">
```
x
```
</Callout>
EOF
case_ open_tag_ends_on_next_line '3:fenced code block:1'

fx two_fences_one_callout <<'EOF'
<Callout>
```
a
```
~~~
b
~~~
</Callout>
EOF
case_ two_fences_one_callout '2:fenced code block:1' '5:fenced code block:1'

# GIVEN a Callout that never encloses the code WHEN checked THEN the file is clean.
fx selfclosing_then_fence <<'EOF'
<Callout title="x" />
```
x
```
EOF
case_ selfclosing_then_fence

fx closed_then_fence <<'EOF'
<Callout>
text
</Callout>
```
x
```
EOF
case_ closed_then_fence

fx open_close_same_line <<'EOF'
<Callout>note</Callout>
```
x
```
EOF
case_ open_close_same_line

fx closing_tag_with_space <<'EOF'
<Callout>
a
</Callout >
```
x
```
EOF
case_ closing_tag_with_space

fx pre_outside_callout <<'EOF'
Plain <pre>x</pre> outside.
EOF
case_ pre_outside_callout

# GIVEN a Callout mention in code, comments, strings or frontmatter WHEN checked THEN it opens nothing.
fx inline_backtick_callout <<'EOF'
Use `<Callout>` for notes.
```
x
```
EOF
case_ inline_backtick_callout

fx callout_inside_example_fence <<'EOF'
```mdx
<Callout>
```
x
```
EOF
case_ callout_inside_example_fence

fx frontmatter_mentions_callout <<'EOF'
---
title: Use <Callout> wisely
---
```
x
```
EOF
case_ frontmatter_mentions_callout

fx mdx_comment_mentions_callout <<'EOF'
{/* <Callout> was here */}
```
x
```
EOF
case_ mdx_comment_mentions_callout

fx gt_inside_attribute_selfclosing <<'EOF'
<Callout title="a > b" />
```
x
```
EOF
case_ gt_inside_attribute_selfclosing

fx callout_inside_jsx_string <<'EOF'
<Card title="see <Callout> docs" />
```
x
```
EOF
case_ callout_inside_jsx_string

# GIVEN a fence inside a blockquote or list item WHEN checked THEN it is seen at its opening line and parity holds.
fx blockquote_fence_in_callout <<'EOF'
<Callout>
> ```
> x
> ```
</Callout>
EOF
case_ blockquote_fence_in_callout '2:fenced code block:1'

fx list_fence_in_callout <<'EOF'
<Callout>
1. ```js
   x
   ```
</Callout>
EOF
case_ list_fence_in_callout '2:fenced code block:1'

fx list_fence_then_callout_fence <<'EOF'
1. ```js
   x
   ```
<Callout>
```
y
```
</Callout>
EOF
case_ list_fence_then_callout_fence '5:fenced code block:4'

fx blockquote_fence_outside_callout <<'EOF'
> ```
> x
> ```
<Callout>
ok
</Callout>
EOF
case_ blockquote_fence_outside_callout

# GIVEN CRLF line endings WHEN checked THEN frontmatter and closing fences behave as with LF.
printf '%s\r\n' '---' 'title: Use <Callout> wisely' '---' '```' 'x' '```' > "$WORK/crlf_frontmatter.mdx"
case_ crlf_frontmatter

printf '%s\r\n' '```' 'x' '```' '<Callout>' '```' 'y' '```' '</Callout>' > "$WORK/crlf_fence_close.mdx"
case_ crlf_fence_close '5:fenced code block:4'

printf '\n%s cases: %s passed, %s failed\n' "$((PASSED + FAILED))" "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ] || { printf '❌ check-links.sh regression\n'; exit 1; }
printf '✅ all cases passed\n'
