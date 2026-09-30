#!/bin/bash
set -euo pipefail
# Usage: detect-mode.sh PROMPT [SELECTED_MODE]; output ARGS and MODE, ask means caller decision.
keywords() {
    case "$1" in
        setup) printf '%s\n' 'set up' 'new server' 'add server' 'настрой' 'добавь сервер' 'новый сервер' ;;
        connect) printf '%s\n' 'connect to' 'ssh to' 'login' 'подключись' 'зайди по ssh' 'логин' ;;
        configure) printf '%s\n' 'config' 'harden' 'конфигурируй' 'укрепи' 'захардень' ;;
        update-agent) printf '%s\n' 'update agent' 'refresh agent' 'refresh' 'обнови агента' 'обнови' ;;
    esac
}
default_mode() {
    MODE=execute
    if [ -z "$ARGS" ]; then
        INVENTORY=$(bash "$SCRIPT_DIR/claude-local-ops.sh" list)
        case "$INVENTORY" in *SERVER_COUNT=*) MODE=execute ;; *) MODE=setup ;; esac
    fi
}

ARGS="${1:-}"
ARGS=$(printf '%s' "$ARGS" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

lower() {
    local text upper lower
    text=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
    # Literal Russian mapping also works in the C locale and macOS Bash 3.
    while read -r upper lower; do text=${text//"$upper"/"$lower"}; done <<'PAIRS'
А а
Б б
В в
Г г
Д д
Е е
Ё ё
Ж ж
З з
И и
Й й
К к
Л л
М м
Н н
О о
П п
Р р
С с
Т т
У у
Ф ф
Х х
Ц ц
Ч ч
Ш ш
Щ щ
Ъ ъ
Ы ы
Ь ь
Э э
Ю ю
Я я
PAIRS
    printf '%s' "$text"
}

NORMALIZED=$(lower "$ARGS")
NORMALIZED=${NORMALIZED//$'\n'/ }
NORMALIZED=${NORMALIZED//$'\r'/ }
WORDS=()
read -r -a RAW <<< "$NORMALIZED"
SKIP_VALUE=false
for token in ${RAW[@]+"${RAW[@]}"}; do
    if "$SKIP_VALUE"; then SKIP_VALUE=false; continue; fi
    case "$token" in
        --*=*|*=*|*/*|*@*|*.md|*.mdx|*.yml|*.yaml|*.json|*.toml|*.sh|*.conf|*.ini) continue ;;
        --*|-s|-p|-h|-k|-w|-f) SKIP_VALUE=true; continue ;;
        -*) continue ;;
    esac
    for delimiter in '.' ',' '!' '?' ';' ':' '(' ')' '{' '}' '[' ']' '"' "'" '`' '|' '<' '>' '—' '–' '«' '»' '“' '”' "‘" "’"; do
        token=${token//"$delimiter"/ }
    done
    read -r -a PARTS <<< "$token"
    for word in ${PARTS[@]+"${PARTS[@]}"}; do WORDS+=("$word"); done
done
TEXT=" ${WORDS[*]-} "

is_mode() {
    case "$1" in
        setup|connect|configure|update-agent|execute) return 0 ;;
        *) return 1 ;;
    esac
}

MODE=""
if [ "$#" -gt 2 ]; then printf 'ERROR: expected prompt and optional selected mode\n' >&2; exit 2; fi
if [ -n "${2:-}" ]; then
    MODE=$(lower "$2")
    is_mode "$MODE" || { printf 'ERROR: invalid selected mode\n' >&2; exit 2; }
else
    for word in ${WORDS[@]+"${WORDS[@]}"}; do
        if is_mode "$word"; then
            if [ -n "$MODE" ] && [ "$MODE" != "$word" ]; then MODE=ask; break; fi
            MODE="$word"
        fi
    done
fi

if [ -z "$MODE" ]; then
    BEST=0
    for candidate in setup connect configure update-agent execute; do
        SCORE=0
        while IFS= read -r phrase; do
            [ -n "$phrase" ] || continue
            if [[ "$TEXT" == *" $phrase "* ]]; then SCORE=$((SCORE + 1)); fi
        done < <(keywords "$candidate")
        if [ "$SCORE" -gt "$BEST" ]; then
            BEST="$SCORE"; MODE="$candidate"
        elif [ "$SCORE" -gt 0 ] && [ "$SCORE" -eq "$BEST" ]; then
            MODE=ask
        fi
    done
    if [ "$BEST" -eq 0 ]; then default_mode; fi
fi

DISPLAY=${ARGS//$'\r'/\\r}
DISPLAY=${DISPLAY//$'\n'/\\n}
printf 'ARGS: [%s]\nMODE: %s\n' "$DISPLAY" "$MODE"
