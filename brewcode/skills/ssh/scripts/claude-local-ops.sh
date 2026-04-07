#!/bin/bash
set -euo pipefail
# Manage CLAUDE.local.md server entries
# Usage: claude-local-ops.sh <subcommand> [args...]
# Subcommands: read, add, update, list, set-default

LOCAL_FILE="CLAUDE.local.md"
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

> Connect via: `/brewcode:ssh connect to <name>` or `/brewcode:ssh <task description>`
HEREDOC
    fi
}

# Check if line is a server data row (not header, not separator, not other tables)
is_server_row() {
    local line="$1"
    [[ "$line" == "| "* ]] && \
    [[ "$line" != "| Name "* ]] && \
    [[ "$line" != "| -"* ]] && \
    [[ "$line" != "| Property "* ]] && \
    [[ "$line" != "|---"* ]] && \
    [[ "$line" != "|-"* ]]
}

# Extract field from pipe-delimited row by position (1-based)
get_field() {
    echo "$1" | awk -F'|' -v n="$2" '{gsub(/^[ \t]+|[ \t]+$/, "", $n); print $n}'
}

# Parse server rows only from SSH Servers section (between header and > Connect)
get_server_rows() {
    local in_table=false
    while IFS= read -r line; do
        if [[ "$line" == "| Name |"* ]]; then
            in_table=true
            continue
        fi
        if [[ "$in_table" == true ]]; then
            if [[ "$line" == "|---"* ]]; then
                continue
            fi
            if [[ "$line" == "| "* ]]; then
                echo "$line"
            else
                break
            fi
        fi
    done < "$LOCAL_FILE"
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

        if grep -q "| $NAME |" "$LOCAL_FILE" 2>/dev/null; then
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

        # Insert row after table separator, before "> Connect" line
        TMPF=$(mktemp)
        AFTER_SEPARATOR=false
        INSERTED=false
        while IFS= read -r line; do
            # Detect table separator
            if [[ "$line" == "|---"* ]] && [[ "$AFTER_SEPARATOR" == false ]]; then
                echo "$line" >> "$TMPF"
                AFTER_SEPARATOR=true
                continue
            fi
            # Insert before "> Connect" or blank line AFTER separator
            if [[ "$AFTER_SEPARATOR" == true ]] && [[ "$INSERTED" == false ]]; then
                if [[ "$line" == "> Connect"* ]] || [[ -z "$line" ]]; then
                    echo "$ROW" >> "$TMPF"
                    INSERTED=true
                    # Write the current line too
                    echo "$line" >> "$TMPF"
                    continue
                fi
            fi
            echo "$line" >> "$TMPF"
        done < "$LOCAL_FILE"

        if [[ "$INSERTED" == false ]]; then
            echo "$ROW" >> "$TMPF"
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

        if ! grep -q "| $NAME |" "$LOCAL_FILE"; then
            echo "ERROR: Server '$NAME' not found"
            exit 1
        fi

        # Rewrite: clear defaults in SSH Servers table, set new one
        TMPF=$(mktemp)
        IN_TABLE=false
        while IFS= read -r line; do
            if [[ "$line" == "| Name |"* ]]; then
                IN_TABLE=true
                echo "$line" >> "$TMPF"
                continue
            fi
            if [[ "$IN_TABLE" == true ]] && [[ "$line" == "|---"* ]]; then
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
