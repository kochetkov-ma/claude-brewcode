#!/bin/bash
# tmux pane command: claude in the cwd, parent env scrubbed. Args: config dir, mod dir ("-" = installed cache), permission mode,
# debug file, model, global placeholder root of the patched copy (LP_PLACEHOLDERS_CFG, "" = none), --settings JSON ("" = none).
cfg="$1" mod="$2" mode="$3" debug="$4" model="$5"
[ -n "${6:-}" ] && export LP_PLACEHOLDERS_CFG="$6"
unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_SESSION_ID CLAUDE_CODE_CHILD_SESSION CLAUDE_CODE_SESSION_ATTENDED \
  CLAUDE_CODE_MESSAGING_SOCKET CLAUDE_CODE_MESSAGING_TOKEN CLAUDE_CODE_EXECPATH CLAUDE_PID CLAUDE_MODEL CLAUDE_EFFORT CLAUDE_CODE_SSE_PORT
export CLAUDE_CONFIG_DIR="$cfg"
args=(--permission-mode "$mode" --debug-file "$debug" --model "$model")
[ "$mod" != "-" ] && args+=(--plugin-dir "$mod")
[ -n "${7:-}" ] && args+=(--settings "$7")
exec claude "${args[@]}"
