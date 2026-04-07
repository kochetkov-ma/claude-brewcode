#!/bin/bash
set -euo pipefail
# Check SSH environment: keys, config, ssh-agent
# No args needed
# Output: structured key=value pairs

echo "=== SSH Environment Check ==="

# Check ~/.ssh/ directory
if [[ -d "$HOME/.ssh" ]]; then
    echo "SSH_DIR=exists"
    SSH_DIR_PERMS=$(stat -f "%Lp" "$HOME/.ssh" 2>/dev/null || stat -c "%a" "$HOME/.ssh" 2>/dev/null || echo "unknown")
    echo "SSH_DIR_PERMS=$SSH_DIR_PERMS"
else
    echo "SSH_DIR=missing"
    echo "SSH_DIR_PERMS=n/a"
    # Create with correct permissions
    mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
    echo "SSH_DIR_CREATED=true"
fi

# List available keys
echo "=== Available Keys ==="
ED25519_KEYS=()
RSA_KEYS=()
ECDSA_KEYS=()

for keyfile in "$HOME"/.ssh/id_*; do
    [[ -f "$keyfile" ]] || continue
    # Skip .pub files
    [[ "$keyfile" == *.pub ]] && continue

    basename_key=$(basename "$keyfile")
    if [[ "$basename_key" == id_ed25519* ]]; then
        ED25519_KEYS+=("$keyfile")
        echo "KEY_ED25519=$keyfile"
    elif [[ "$basename_key" == id_rsa* ]]; then
        RSA_KEYS+=("$keyfile")
        echo "KEY_RSA=$keyfile"
    elif [[ "$basename_key" == id_ecdsa* ]]; then
        ECDSA_KEYS+=("$keyfile")
        echo "KEY_ECDSA=$keyfile"
    fi
done

echo "ED25519_COUNT=${#ED25519_KEYS[@]}"
echo "RSA_COUNT=${#RSA_KEYS[@]}"
echo "ECDSA_COUNT=${#ECDSA_KEYS[@]}"
TOTAL_KEYS=$(( ${#ED25519_KEYS[@]} + ${#RSA_KEYS[@]} + ${#ECDSA_KEYS[@]} ))
echo "TOTAL_KEYS=$TOTAL_KEYS"

# Check ssh-agent
echo "=== SSH Agent ==="
if ssh-add -l &>/dev/null; then
    echo "SSH_AGENT=running"
    LOADED_KEYS=$(ssh-add -l 2>/dev/null | wc -l | tr -d ' ')
    echo "AGENT_KEYS_LOADED=$LOADED_KEYS"
elif [[ $? -eq 1 ]]; then
    # Agent running but no keys loaded
    echo "SSH_AGENT=running"
    echo "AGENT_KEYS_LOADED=0"
else
    echo "SSH_AGENT=not_running"
    echo "AGENT_KEYS_LOADED=0"
fi

# Check SSH config
echo "=== SSH Config ==="
if [[ -f "$HOME/.ssh/config" ]]; then
    echo "SSH_CONFIG=exists"
    HOST_COUNT=$(grep -c "^Host " "$HOME/.ssh/config" 2>/dev/null || echo "0")
    echo "SSH_CONFIG_HOSTS=$HOST_COUNT"
else
    echo "SSH_CONFIG=missing"
    echo "SSH_CONFIG_HOSTS=0"
fi

# Check known_hosts
echo "=== Known Hosts ==="
if [[ -f "$HOME/.ssh/known_hosts" ]]; then
    echo "KNOWN_HOSTS=exists"
    KH_COUNT=$(wc -l < "$HOME/.ssh/known_hosts" | tr -d ' ')
    echo "KNOWN_HOSTS_ENTRIES=$KH_COUNT"
else
    echo "KNOWN_HOSTS=missing"
    echo "KNOWN_HOSTS_ENTRIES=0"
fi

echo "=== Check Complete ==="
