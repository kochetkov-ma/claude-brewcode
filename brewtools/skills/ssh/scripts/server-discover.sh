#!/bin/bash
set -euo pipefail
# Discover remote server: OS, disks, Docker, services, users
# Usage: server-discover.sh "user@host|host|ssh-alias" [port]
# Env:   SSH_DISCOVER_TIMEOUT - total wall-clock budget in seconds (default 30)
# Output: structured key=value pairs
# Exit:  0 ok | 1 unreachable | 2 invalid argument | 124 deadline exceeded

CONNECTION="${1:?Usage: server-discover.sh user@host [port]}"
PORT="${2:-22}"
DEADLINE="${SSH_DISCOVER_TIMEOUT:-30}"

# user@host, bare host or ssh_config alias. Anything else (whitespace, "-o ...",
# a second "@") would word-split into extra ssh options -- ProxyCommand is executed
# by the user's shell, so an unvalidated operand is local command execution.
case "$CONNECTION" in
    ''|@*|*@|*@*@*|*[!A-Za-z0-9._@-]*)
        echo "ERROR: invalid connection '$CONNECTION' (expected user@host, host or ssh alias)" >&2
        exit 2 ;;
esac

case "$PORT" in
    ''|*[!0-9]*|0*)
        echo "ERROR: invalid port '$PORT' (expected integer 1..65535)" >&2
        exit 2 ;;
esac
if [ "$PORT" -gt 65535 ]; then
    echo "ERROR: invalid port '$PORT' (expected integer 1..65535)" >&2
    exit 2
fi

case "$DEADLINE" in
    ''|*[!0-9]*|0*)
        echo "ERROR: invalid SSH_DISCOVER_TIMEOUT '$DEADLINE' (expected positive integer seconds)" >&2
        exit 2 ;;
esac

# Portable outer deadline: macOS has no GNU `timeout`, so the script re-execs
# itself once and a background killer bounds the WHOLE discovery, not each hop.
if [ "${SSH_DISCOVER_WATCHDOG:-0}" != "1" ]; then
    SSH_DISCOVER_WATCHDOG=1 bash "$0" "$@" &
    child=$!
    ( sleep "$DEADLINE"; kill -TERM "$child" 2>/dev/null ) &
    killer=$!
    rc=0
    # braces + 2>/dev/null: bash prints "PID Terminated" job noise when reaping a signalled child
    { wait "$child" || rc=$?; } 2>/dev/null
    kill "$killer" 2>/dev/null || true
    { wait "$killer" || true; } 2>/dev/null
    if [ "$rc" -ge 128 ]; then
        echo "ERROR: discovery exceeded ${DEADLINE}s deadline" >&2
        exit 124
    fi
    exit "$rc"
fi

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -p "$PORT")

# Fail-fast: verify connectivity before full discovery
if ! ssh "${SSH_OPTS[@]}" "$CONNECTION" true 2>/dev/null; then
    echo "ERROR: Cannot connect to $CONNECTION:$PORT (timeout or auth failure)" >&2
    exit 1
fi

echo "=== Server Discovery: $CONNECTION ==="

# Helper: run SSH command, return output or fallback
ssh_cmd() {
    local cmd="$1"
    local fallback="${2:-n/a}"
    local result
    result=$(ssh "${SSH_OPTS[@]}" "$CONNECTION" "$cmd" 2>/dev/null) || result="$fallback"
    echo "$result"
}

# OS info
echo "=== OS Info ==="
OS_PRETTY=$(ssh_cmd "cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"'" "unknown")
echo "OS=$OS_PRETTY"

KERNEL=$(ssh_cmd "uname -r" "unknown")
echo "KERNEL=$KERNEL"

ARCH=$(ssh_cmd "uname -m" "unknown")
echo "ARCH=$ARCH"

HOSTNAME=$(ssh_cmd "hostname" "unknown")
echo "HOSTNAME=$HOSTNAME"

UPTIME=$(ssh_cmd "uptime -p 2>/dev/null || uptime" "unknown")
echo "UPTIME=$UPTIME"

# Memory
echo "=== Memory ==="
MEM_TOTAL=$(ssh_cmd "free -h 2>/dev/null | awk '/^Mem:/{print \$2}'" "unknown")
echo "MEM_TOTAL=$MEM_TOTAL"

MEM_USED=$(ssh_cmd "free -h 2>/dev/null | awk '/^Mem:/{print \$3}'" "unknown")
echo "MEM_USED=$MEM_USED"

# Disks
echo "=== Disks ==="
DISK_INFO=$(ssh_cmd "df -h --output=source,size,used,avail,pcent,target 2>/dev/null | grep -E '^/dev/' || df -h | grep -E '^/dev/'" "unknown")
echo "DISK_INFO<<EOF"
echo "$DISK_INFO"
echo "EOF"

# Docker
echo "=== Docker ==="
DOCKER_VERSION=$(ssh_cmd "docker version --format '{{.Server.Version}}' 2>/dev/null" "not_installed")
echo "DOCKER_VERSION=$DOCKER_VERSION"

DOCKER_COMPOSE=$(ssh_cmd "docker compose version --short 2>/dev/null || docker-compose --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+'" "not_installed")
echo "DOCKER_COMPOSE=$DOCKER_COMPOSE"

if [[ "$DOCKER_VERSION" != "not_installed" ]]; then
    RUNNING_CONTAINERS=$(ssh_cmd "docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null" "none")
    echo "RUNNING_CONTAINERS<<EOF"
    echo "$RUNNING_CONTAINERS"
    echo "EOF"

    DOCKER_IMAGES=$(ssh_cmd "docker images --format '{{.Repository}}:{{.Tag}}\t{{.Size}}' 2>/dev/null | head -20" "none")
    echo "DOCKER_IMAGES<<EOF"
    echo "$DOCKER_IMAGES"
    echo "EOF"
else
    echo "RUNNING_CONTAINERS=n/a"
    echo "DOCKER_IMAGES=n/a"
fi

# Services (systemd)
echo "=== Services ==="
SERVICES=$(ssh_cmd "systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | awk '{print \$1}' | head -30" "unknown")
echo "SERVICES<<EOF"
echo "$SERVICES"
echo "EOF"

# Listening ports
echo "=== Ports ==="
PORTS=$(ssh_cmd "ss -tlnp 2>/dev/null | tail -n +2 | head -20 || netstat -tlnp 2>/dev/null | tail -n +3 | head -20" "unknown")
echo "PORTS<<EOF"
echo "$PORTS"
echo "EOF"

# Current user info
echo "=== User ==="
CURRENT_USER=$(ssh_cmd "whoami" "unknown")
echo "CURRENT_USER=$CURRENT_USER"

USER_GROUPS=$(ssh_cmd "id" "unknown")
echo "USER_GROUPS=$USER_GROUPS"

SUDO_ACCESS=$(ssh_cmd "sudo -n true 2>/dev/null && echo 'yes' || echo 'no'" "unknown")
echo "SUDO_ACCESS=$SUDO_ACCESS"

# Common working directories
echo "=== Working Dirs ==="
for dir in /opt /srv /home /data /var/www; do
    EXISTS=$(ssh_cmd "test -d $dir && ls -la $dir 2>/dev/null | head -5" "not_found")
    if [[ "$EXISTS" != "not_found" ]]; then
        echo "DIR_${dir//\//_}=exists"
    fi
done

echo "=== Discovery Complete ==="
