#!/bin/bash
set -euo pipefail
# Manage CLAUDE.local.md server entries
# Usage: claude-local-ops.sh <subcommand> [args...]
# Subcommands: read, add, update, list, set-default

# Project root: CLAUDE_PROJECT_DIR -> git toplevel -> upward walk -> PWD.
claude_project_root() {
    local r d
    if [[ -n "${CLAUDE_PROJECT_DIR:-}" ]] && [[ -d "$CLAUDE_PROJECT_DIR" ]]; then
        printf '%s\n' "$CLAUDE_PROJECT_DIR"; return 0
    fi
    if r=$(git rev-parse --show-toplevel 2>/dev/null) && [[ -n "$r" ]]; then
        printf '%s\n' "$r"; return 0
    fi
    d=$PWD
    while [[ "$d" != "/" ]]; do
        if [[ -d "$d/.git" ]] || [[ -d "$d/.claude" ]]; then printf '%s\n' "$d"; return 0; fi
        d=$(dirname "$d")
    done
    printf '%s\n' "$PWD"; return 1
}

ROOT=$(claude_project_root) || echo "WARN: no project root marker found; using $ROOT" >&2
LOCAL_FILE="$ROOT/CLAUDE.local.md"
SSH_HEADING="## SSH Servers"
SUBCMD="${1:?Usage: claude-local-ops.sh <read|add|update|list|set-default> [args...]}"
shift

# Initialize file if missing
init_file() {
    if [[ ! -f "$LOCAL_FILE" ]]; then
        cat > "$LOCAL_FILE" << 'HEREDOC'
# Local Configuration

> This file is gitignored. Do not commit.

## SSH Servers

| Name | Host | User | Port | Key | Default |
|------|------|------|------|-----|---------|

> Connect via: `/brewtools:ssh connect to <name>` or `/brewtools:ssh <task description>`
HEREDOC
    fi
}

# Extract field from pipe-delimited row by position (1-based)
get_field() {
    echo "$1" | awk -F'|' -v n="$2" '{gsub(/^[ \t]+|[ \t]+$/, "", $n); print $n}'
}

# Data rows of the SSH Servers table only: anchored on the exact "## SSH Servers"
# heading plus the "| Name |" header row, ending at the next "## " heading.
get_server_rows() {
    local in_section=false in_table=false line
    while IFS= read -r line; do
        if [[ "$line" == "## "* ]]; then
            in_table=false
            if [[ "$line" == "$SSH_HEADING" ]]; then in_section=true; else in_section=false; fi
            continue
        fi
        if [[ "$in_section" == true ]] && [[ "$line" == "| Name |"* ]]; then
            in_table=true
            continue
        fi
        if [[ "$in_table" == true ]]; then
            if [[ "$line" == "|-"* ]] || [[ "$line" == "| -"* ]]; then continue; fi
            if [[ "$line" == "| "* ]]; then echo "$line"; else in_table=false; fi
        fi
    done < "$LOCAL_FILE"
}

# True if NAME already has a row in the SSH Servers table (that table only)
server_exists() {
    local target="$1" row
    while IFS= read -r row; do
        if [[ "$(get_field "$row" 2)" == "$target" ]]; then return 0; fi
    done < <(get_server_rows)
    return 1
}

case "$SUBCMD" in
    read)
        if [[ ! -f "$LOCAL_FILE" ]]; then
            echo "FILE=missing"
            exit 0
        fi
        echo "FILE=exists"
        get_server_rows | while IFS= read -r row; do
            name=$(get_field "$row" 2)
            host=$(get_field "$row" 3)
            user=$(get_field "$row" 4)
            port=$(get_field "$row" 5)
            key=$(get_field "$row" 6)
            default=$(get_field "$row" 7)
            [[ -z "$name" ]] && continue
            echo "SERVER=$name"
            echo "${name}_HOST=$host"
            echo "${name}_USER=$user"
            echo "${name}_PORT=$port"
            echo "${name}_KEY=$key"
            echo "${name}_DEFAULT=$default"
        done
        ;;

    add)
        NAME="${1:?add requires: name host user port key}"
        HOST="${2:?add requires: host}"
        USER="${3:?add requires: user}"
        PORT="${4:-22}"
        KEY="${5:-~/.ssh/id_ed25519_$NAME}"

        init_file

        if server_exists "$NAME"; then
            echo "ERROR: Server '$NAME' already exists. Use 'update' to modify."
            exit 1
        fi

        # Count existing server rows
        EXISTING=$(get_server_rows | wc -l | tr -d ' ')

        if [[ "$EXISTING" -eq 0 ]]; then
            DEFAULT_FLAG="*"
        else
            DEFAULT_FLAG=""
        fi

        ROW="| $NAME | $HOST | $USER | $PORT | $KEY | $DEFAULT_FLAG |"

        # Append the row to the SSH Servers table only. Any other pipe table in the
        # file (GitHub config, per-server Property tables) must stay untouched.
        TMPF=$(mktemp)
        IN_SECTION=false
        IN_TABLE=false
        INSERTED=false
        while IFS= read -r line; do
            if [[ "$line" == "## "* ]]; then
                if [[ "$IN_TABLE" == true ]] && [[ "$INSERTED" == false ]]; then
                    echo "$ROW" >> "$TMPF"
                    INSERTED=true
                fi
                IN_TABLE=false
                if [[ "$line" == "$SSH_HEADING" ]]; then IN_SECTION=true; else IN_SECTION=false; fi
                echo "$line" >> "$TMPF"
                continue
            fi
            if [[ "$IN_SECTION" == true ]] && [[ "$line" == "| Name |"* ]]; then
                IN_TABLE=true
                echo "$line" >> "$TMPF"
                continue
            fi
            if [[ "$IN_TABLE" == true ]] && [[ "$INSERTED" == false ]]; then
                if [[ "$line" == "|"* ]]; then
                    echo "$line" >> "$TMPF"
                    continue
                fi
                echo "$ROW" >> "$TMPF"
                INSERTED=true
                IN_TABLE=false
            fi
            echo "$line" >> "$TMPF"
        done < "$LOCAL_FILE"

        if [[ "$IN_TABLE" == true ]] && [[ "$INSERTED" == false ]]; then
            echo "$ROW" >> "$TMPF"
            INSERTED=true
        fi

        if [[ "$INSERTED" == false ]]; then
            rm -f "$TMPF"
            echo "ERROR: '$SSH_HEADING' table not found in $LOCAL_FILE -- refusing to append blind."
            exit 1
        fi

        mv "$TMPF" "$LOCAL_FILE"
        echo "ADDED=$NAME"
        echo "DEFAULT=$DEFAULT_FLAG"
        ;;

    update)
        NAME="${1:?update requires: name os kernel docker disk workdir}"
        OS="${2:-unknown}"
        KERNEL="${3:-unknown}"
        DOCKER="${4:-not installed}"
        DISK="${5:-unknown}"
        WORKDIR="${6:-/opt}"

        if [[ ! -f "$LOCAL_FILE" ]]; then
            echo "ERROR: $LOCAL_FILE not found"
            exit 1
        fi

        # Remove existing server details section
        SECTION_START="## Server: $NAME"
        if grep -q "$SECTION_START" "$LOCAL_FILE"; then
            TMPF=$(mktemp)
            IN_SECTION=false
            while IFS= read -r line; do
                if [[ "$line" == "$SECTION_START" ]]; then
                    IN_SECTION=true
                    continue
                fi
                if [[ "$IN_SECTION" == true ]] && [[ "$line" == "## "* ]]; then
                    IN_SECTION=false
                fi
                if [[ "$IN_SECTION" == false ]]; then
                    echo "$line" >> "$TMPF"
                fi
            done < "$LOCAL_FILE"
            mv "$TMPF" "$LOCAL_FILE"
        fi

        cat >> "$LOCAL_FILE" << HEREDOC

## Server: $NAME

| Property | Value |
|----------|-------|
| OS | $OS |
| Kernel | $KERNEL |
| Docker | $DOCKER |
| Data disk | $DISK |
| Working dir | $WORKDIR |
HEREDOC

        echo "UPDATED=$NAME"
        ;;

    list)
        if [[ ! -f "$LOCAL_FILE" ]]; then
            echo "NO_SERVERS"
            exit 0
        fi

        SERVERS=()
        DEFAULTS=()
        while IFS= read -r row; do
            name=$(get_field "$row" 2)
            default=$(get_field "$row" 7)
            [[ -z "$name" ]] && continue
            SERVERS+=("$name")
            DEFAULTS+=("$default")
        done < <(get_server_rows)

        if [[ ${#SERVERS[@]} -eq 0 ]]; then
            echo "NO_SERVERS"
        else
            echo "SERVER_COUNT=${#SERVERS[@]}"
            for i in "${!SERVERS[@]}"; do
                if [[ "${DEFAULTS[$i]}" == "*" ]]; then
                    echo "SERVER=${SERVERS[$i]} (default)"
                else
                    echo "SERVER=${SERVERS[$i]}"
                fi
            done
        fi
        ;;

    set-default)
        NAME="${1:?set-default requires: name}"

        if [[ ! -f "$LOCAL_FILE" ]]; then
            echo "ERROR: $LOCAL_FILE not found"
            exit 1
        fi

        if ! server_exists "$NAME"; then
            echo "ERROR: Server '$NAME' not found"
            exit 1
        fi

        # Rewrite: clear defaults in SSH Servers table, set new one
        TMPF=$(mktemp)
        IN_SECTION=false
        IN_TABLE=false
        while IFS= read -r line; do
            if [[ "$line" == "## "* ]]; then
                IN_TABLE=false
                if [[ "$line" == "$SSH_HEADING" ]]; then IN_SECTION=true; else IN_SECTION=false; fi
                echo "$line" >> "$TMPF"
                continue
            fi
            if [[ "$IN_SECTION" == true ]] && [[ "$line" == "| Name |"* ]]; then
                IN_TABLE=true
                echo "$line" >> "$TMPF"
                continue
            fi
            if [[ "$IN_TABLE" == true ]] && { [[ "$line" == "|-"* ]] || [[ "$line" == "| -"* ]]; }; then
                echo "$line" >> "$TMPF"
                continue
            fi
            if [[ "$IN_TABLE" == true ]] && [[ "$line" == "| "* ]]; then
                # Parse columns, rewrite Default field
                srv_name=$(get_field "$line" 2)
                srv_host=$(get_field "$line" 3)
                srv_user=$(get_field "$line" 4)
                srv_port=$(get_field "$line" 5)
                srv_key=$(get_field "$line" 6)
                if [[ "$srv_name" == "$NAME" ]]; then
                    echo "| $srv_name | $srv_host | $srv_user | $srv_port | $srv_key | * |" >> "$TMPF"
                else
                    echo "| $srv_name | $srv_host | $srv_user | $srv_port | $srv_key |  |" >> "$TMPF"
                fi
                continue
            fi
            if [[ "$IN_TABLE" == true ]]; then
                IN_TABLE=false
            fi
            echo "$line" >> "$TMPF"
        done < "$LOCAL_FILE"
        mv "$TMPF" "$LOCAL_FILE"

        echo "DEFAULT=$NAME"
        ;;

    *)
        echo "ERROR: Unknown subcommand '$SUBCMD'"
        echo "Usage: claude-local-ops.sh <read|add|update|list|set-default> [args...]"
        exit 1
        ;;
esac
