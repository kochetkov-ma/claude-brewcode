#!/bin/sh
set -eu
# zsh does not word-split unquoted expansions: run it as sh.
[ -z "${ZSH_VERSION:-}" ] || emulate sh

# `-` = read the prompt from stdin (SKILL.md passes it via a quoted heredoc: no shell parsing).
if [ "${1:-}" = "-" ]; then ARGS=$(cat); else ARGS="${1:-}"; fi

# Plugin version for every artifact stamp, self-located (scripts/ -> e2e/ -> skills/ -> <plugin root>): dev checkout AND cache.
# NEVER hardcoded/template version; `|| true` on both branches: under `set -e` a failing substitution aborts.
SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
PLUGIN_JSON="$SCRIPT_DIR/../../../.claude-plugin/plugin.json"
PLUGIN_VERSION=""
if [ -f "$PLUGIN_JSON" ]; then
  if command -v jq >/dev/null 2>&1; then
    PLUGIN_VERSION=$(jq -r '.version // empty' "$PLUGIN_JSON" 2>/dev/null || true)
  else
    PLUGIN_VERSION=$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PLUGIN_JSON" 2>/dev/null | head -1 || true)
  fi
fi
# HARD FAIL, never a placeholder: `unknown` evades setup-status PLACEHLD (no `{}<>`) -> `AHEAD unknown > X.Y.Z`, never clears; raw `{PLUGIN_VERSION}` only defers it.
# Unreadable manifest = broken install: stop before install/rules writes config.json, rules file or agent; skill treats `ERROR:` as STOP, status included.
case "$PLUGIN_VERSION" in
  [0-9]*.[0-9]*.[0-9]*) : ;;
  *) printf 'ERROR:cannot resolve plugin version (X.Y.Z) from %s - refusing to stamp artifacts with a fake version\n' "$PLUGIN_JSON"; exit 1 ;;
esac

# content_version: self-located from own SKILL.md brewcode-meta marker (as docsync-setup, agent-deadline-setup); stamped by bump-version.sh.
# Never the running PLUGIN_VERSION: that defeats a separate counter.
SKILL_MD="$SCRIPT_DIR/../SKILL.md"
CONTENT_VERSION=""
if [ -f "$SKILL_MD" ]; then
  CONTENT_VERSION=$(grep -m1 'brewcode-meta:' "$SKILL_MD" 2>/dev/null | sed -n 's/.*content_version=\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*/\1/p' || true)
fi
case "$CONTENT_VERSION" in
  [0-9]*.[0-9]*.[0-9]*) : ;;
  *) printf 'ERROR:cannot resolve content_version (X.Y.Z) from %s - refusing to stamp artifacts with a fake version\n' "$SKILL_MD"; exit 1 ;;
esac

# Mode per SKILL.md Prompt contract: explicit mode token anywhere wins, else EN/RU keyword score,
# else the roster default. Words are lowercased (ASCII; RU keywords listed in both cases), flags skipped.
TRIMMED="${ARGS#"${ARGS%%[![:space:]]*}"}"
WORDS=$(printf '%s' "$TRIMMED" | LC_ALL=C tr 'A-Z\n\t,.;:!?()"' 'a-z         ')
set -f
# shellcheck disable=SC2086
set -- $WORDS
set +f
FIRST="${1:-}"
REST=""
if [ -n "$TRIMMED" ]; then
  RAW_FIRST="${TRIMMED%%[[:space:]]*}"
  REST="${TRIMMED#"$RAW_FIRST"}"
  REST="${REST#"${REST%%[![:space:]]*}"}"
fi

# Prints the mode a keyword (or the phrase "PREV WORD") scores for; nothing when none.
keyword_mode() {
  case "$2 $1" in
    "set up") echo install; return ;;
    "add tests"|"new scenario"|"добавь тесты"|"Добавь тесты") echo create; return ;;
    "sync tests") echo update; return ;;
  esac
  case "$1" in
    status|check|show|статус|Статус|проверь|Проверь|покажи|Покажи) echo status ;;
    install|setup|init|настрой|Настрой|установи|Установи|поставь|Поставь) echo install ;;
    create|write|создай|Создай|напиши|Напиши) echo create ;;
    update|refresh|обнови|Обнови|актуализируй|Актуализируй) echo update ;;
    review|quorum|validate|ревью|Ревью|провалидируй|Провалидируй) echo review ;;
    rules|conventions|правила|Правила|конвенции|Конвенции) echo rules ;;
  esac
}

is_keyword() {
  case "$1" in
    install|create|update|review|rules|status) return 0 ;;
    *) return 1 ;;
  esac
}

# Verbs e2e does not implement. Without this they would fall through to the prompt branch
# and start a full INSTALL -- the opposite of what the user typed.
is_unsupported_keyword() {
  case "$1" in
    uninstall|purge|upgrade|enable|disable) return 0 ;;
    *) return 1 ;;
  esac
}

MODE=""
PROMPT=""
EXPLICIT=""
UNSUPPORTED=""
SEEN=" "
PREV=""
POS=0
BEST=""
BEST_SCORE=0
BEST_POS=0
for W in "$@"; do
  POS=$((POS + 1))
  case "$W" in -*) PREV=""; continue ;; esac
  [ -z "$EXPLICIT" ] && is_keyword "$W" && EXPLICIT="$W"
  [ -z "$UNSUPPORTED" ] && is_unsupported_keyword "$W" && UNSUPPORTED="$W"
  K=$(keyword_mode "$W" "$PREV")
  PREV="$W"
  [ -n "$K" ] || continue
  case "$SEEN" in *" $K:$W "*) continue ;; esac
  SEEN="$SEEN$K:$W "
  eval "SC_$K=\$((\${SC_$K:-0} + 1)); FP_$K=\${FP_$K:-$POS}"
done
for M in status install create update review rules; do
  eval "S=\${SC_$M:-0}; P=\${FP_$M:-0}"
  [ "$S" -gt 0 ] || continue
  if [ "$S" -gt "$BEST_SCORE" ]; then
    BEST="$M" BEST_SCORE="$S" BEST_POS="$P"
  elif [ "$S" -eq "$BEST_SCORE" ]; then
    # Tie: status wins (read-only); of two mutating modes the keyword that comes first.
    if [ "$BEST" != status ] && { [ "$M" = status ] || [ "$P" -lt "$BEST_POS" ]; }; then
      BEST="$M" BEST_POS="$P"
    fi
  fi
done

if is_unsupported_keyword "$FIRST" || { [ -z "$EXPLICIT" ] && [ -z "$BEST" ] && [ -n "$UNSUPPORTED" ]; }; then
  [ -n "$UNSUPPORTED" ] || UNSUPPORTED="$FIRST"
  printf 'ERROR:e2e has no %s mode. Use: install | create | update | review | rules | status. To remove the setup, delete .claude/agents/e2e-*.md and .claude/e2e/ by hand.\n' "$UNSUPPORTED"
  exit 1
elif [ -n "$EXPLICIT" ]; then
  MODE="$EXPLICIT"
  if [ "$FIRST" = "$EXPLICIT" ]; then PROMPT="$REST"; else PROMPT="$TRIMMED"; fi
elif [ -n "$BEST" ]; then
  MODE="$BEST"
  PROMPT="$TRIMMED"
else
  # No mode word: roster installed (>= 3 e2e agents) -> status, else install; prose stays the prompt.
  AGENT_COUNT=$(find .claude/agents -maxdepth 1 -type f -name 'e2e-*.md' 2>/dev/null | wc -l | tr -d ' ')
  if [ "$AGENT_COUNT" -ge 3 ]; then
    MODE="status"
  else
    MODE="install"
  fi
  PROMPT="$TRIMMED"
fi

printf 'MODE:%s\n' "$MODE"
[ -n "$PROMPT" ] && printf 'PROMPT:%s\n' "$PROMPT"
# The three metadata scalars every artifact this run writes must carry. Emitted here so the skill
# never has to guess a version or invent a date spelling.
printf 'PLUGIN_VERSION:%s\n' "$PLUGIN_VERSION"
printf 'CONTENT_VERSION:%s\n' "$CONTENT_VERSION"
printf 'GENERATED_BY:brewcode:e2e\n'
printf 'LAST_UPDATED:%s\n' "$(date +%F)"

exit 0
