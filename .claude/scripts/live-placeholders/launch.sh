#!/bin/bash
# tmux pane command: claude in the cwd, parent env scrubbed. Args: config dir ("-" = unset), mod dir ("-" = installed cache), permission mode,
# debug file, model, global placeholder root of the patched copy (LP_PLACEHOLDERS_CFG, "" = none), --settings JSON ("" = none), 2nd mod dir ("" = none), "first" = 2nd mod dir loads first.
cfg="$1" mod="$2" mode="$3" debug="$4" model="$5"
[ -n "${6:-}" ] && export LP_PLACEHOLDERS_CFG="$6"
unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_SESSION_ID CLAUDE_CODE_CHILD_SESSION CLAUDE_CODE_SESSION_ATTENDED \
  CLAUDE_CODE_MESSAGING_SOCKET CLAUDE_CODE_MESSAGING_TOKEN CLAUDE_CODE_EXECPATH CLAUDE_PID CLAUDE_MODEL CLAUDE_EFFORT CLAUDE_CODE_SSE_PORT
# "-" = CLAUDE_CONFIG_DIR stays unset (~/.claude with ~/.claude.json); an explicit dir makes the CLI read <dir>/.claude.json.
if [ "$cfg" = "-" ]; then unset CLAUDE_CONFIG_DIR; else export CLAUDE_CONFIG_DIR="$cfg"; fi
args=(--permission-mode "$mode" --debug-file "$debug" --model "$model")
[ -n "${8:-}" ] && [ "${9:-}" = first ] && args+=(--plugin-dir "$8")
[ "$mod" != "-" ] && args+=(--plugin-dir "$mod")
[ -n "${7:-}" ] && args+=(--settings "$7")
[ -n "${8:-}" ] && [ "${9:-}" != first ] && args+=(--plugin-dir "$8")
exec claude "${args[@]}"
