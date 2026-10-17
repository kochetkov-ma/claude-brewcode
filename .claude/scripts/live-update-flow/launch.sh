#!/bin/bash
# Pane/headless launcher: claude on the real login without its user settings layer, plugin state relocated, Bash-only config dir via CLAUDE_ENV_FILE.
# Args: config dir ("-" = unset), permission mode, debug file, plugin cache dir, env file, --settings file, effort, [-p prompt].
cfg="$1" mode="$2" debug="$3" cache="$4" envfile="$5" settings="$6" effort="$7"
shift 7
unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_SESSION_ID CLAUDE_CODE_CHILD_SESSION CLAUDE_CODE_SESSION_ATTENDED \
  CLAUDE_CODE_MESSAGING_SOCKET CLAUDE_CODE_MESSAGING_TOKEN CLAUDE_CODE_EXECPATH CLAUDE_PID CLAUDE_MODEL CLAUDE_EFFORT CLAUDE_CODE_SSE_PORT
# Parent-session settings env and alias vars (drive.mjs passes the list).
for k in ${LUF_UNSET:-}; do unset "$k"; done
unset LUF_UNSET
# "-" keeps CLAUDE_CONFIG_DIR unset (~/.claude + ~/.claude.json login); an explicit dir is that profile.
if [ "$cfg" = "-" ]; then unset CLAUDE_CONFIG_DIR; else export CLAUDE_CONFIG_DIR="$cfg"; fi
# The optional session survey takes digit keys; off.
export CLAUDE_CODE_PLUGIN_CACHE_DIR="$cache" CLAUDE_ENV_FILE="$envfile" CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY=1
# No real user layer: the --settings file (the lane CLI's user settings) stands in for it.
exec claude --setting-sources project,local --permission-mode "$mode" --debug-file "$debug" --settings "$settings" --effort "$effort" "$@"
