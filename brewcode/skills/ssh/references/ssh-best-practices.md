# SSH Best Practices

> Reference for key management, configuration, and hardening.

## Key Types

| Type | Algorithm | Recommended | Notes |
|------|-----------|-------------|-------|
| ed25519 | EdDSA | **Yes (preferred)** | Fastest, smallest, most secure |
| ecdsa | ECDSA | Acceptable | NIST curves, some concerns |
| rsa | RSA | Fallback only | Minimum 4096 bits, slow |
| dsa | DSA | **Never** | Deprecated, insecure |

### Key Generation

```bash
# Preferred: ed25519
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_SERVERNAME -C "user@purpose"

# Fallback: RSA 4096
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa_SERVERNAME -C "user@purpose"
```

### Key Naming Convention

| Pattern | Example | Use |
|---------|---------|-----|
| `id_ed25519_{server}` | `id_ed25519_vps-main` | Per-server key |
| `id_ed25519_{purpose}` | `id_ed25519_deploy` | Per-purpose key |
| `id_ed25519_{org}_{env}` | `id_ed25519_acme_prod` | Per-org per-env |

## SSH Config Patterns

### Basic Host Block

```
Host vps-main
    HostName 173.249.57.235
    User deploy
    Port 22
    IdentityFile ~/.ssh/id_ed25519_vps-main
    StrictHostKeyChecking accept-new
```

### Jump Host (ProxyJump)

```
Host bastion
    HostName bastion.example.com
    User admin
    IdentityFile ~/.ssh/id_ed25519_bastion

Host internal-server
    HostName 10.0.1.50
    User deploy
    ProxyJump bastion
    IdentityFile ~/.ssh/id_ed25519_internal
```

### Wildcard Patterns

```
Host *.prod.example.com
    User deploy
    IdentityFile ~/.ssh/id_ed25519_prod
    LogLevel ERROR

Host *.staging.example.com
    User admin
    IdentityFile ~/.ssh/id_ed25519_staging
```

### Connection Optimization

```
Host *
    ServerAliveInterval 60
    ServerAliveCountMax 3
    ControlMaster auto
    ControlPath ~/.ssh/sockets/%r@%h-%p
    ControlPersist 600
    AddKeysToAgent yes
    IdentitiesOnly yes
```

> Create sockets dir: `mkdir -p ~/.ssh/sockets`

## Server Hardening (sshd_config)

### Essential Settings

| Setting | Value | Why |
|---------|-------|-----|
| `PermitRootLogin` | `no` | Prevent root SSH access |
| `PasswordAuthentication` | `no` | Force key-only auth |
| `PubkeyAuthentication` | `yes` | Enable key auth |
| `MaxAuthTries` | `3` | Limit brute force |
| `PermitEmptyPasswords` | `no` | Block empty passwords |
| `X11Forwarding` | `no` | Disable unless needed |
| `AllowTcpForwarding` | `no` | Disable unless needed |
| `UsePAM` | `yes` | System auth integration |

### Restrict Users

```
AllowUsers deploy admin
AllowGroups ssh-users
DenyUsers root
```

### Port Change

```
Port 2222
```

> Update firewall: `ufw allow 2222/tcp && ufw deny 22/tcp`

## ssh-agent

### When to Use Forwarding

| Scenario | Forward? | Why |
|----------|----------|-----|
| Deploy from CI to server | No | Use deploy keys |
| Jump through bastion | Yes | Need key on intermediate |
| Interactive dev session | Maybe | Convenience vs security |
| Production servers | **Never** | Attack surface |

### Agent Forwarding Risks

- Compromised intermediate host can use your agent
- Any user with root on intermediate can hijack socket
- Mitigation: `ssh -J bastion target` (ProxyJump) instead of ForwardAgent

### Start Agent

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519_vps-main
```

## known_hosts Management

### Initial Setup

```bash
# Scan and add host key
ssh-keyscan -p PORT HOST >> ~/.ssh/known_hosts 2>/dev/null

# Hash known_hosts for privacy
ssh-keygen -H -f ~/.ssh/known_hosts
```

### Config Option

```
HashKnownHosts yes
StrictHostKeyChecking accept-new
```

| Setting | Behavior |
|---------|----------|
| `accept-new` | Auto-accept new hosts, reject changed keys |
| `yes` | Reject unknown hosts (most secure) |
| `no` | Accept everything (insecure) |
| `ask` | Interactive prompt (default) |

### Key Rotation

When server key changes legitimately:

```bash
ssh-keygen -R HOST
ssh-keyscan -p PORT HOST >> ~/.ssh/known_hosts
```

## File Permissions

| Path | Permission | Numeric |
|------|-----------|---------|
| `~/.ssh/` | `drwx------` | 700 |
| `~/.ssh/config` | `-rw-------` | 600 |
| `~/.ssh/id_*` (private) | `-rw-------` | 600 |
| `~/.ssh/id_*.pub` | `-rw-r--r--` | 644 |
| `~/.ssh/known_hosts` | `-rw-r--r--` | 644 |
| `~/.ssh/authorized_keys` | `-rw-------` | 600 |

### Fix Permissions

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/config ~/.ssh/id_* ~/.ssh/authorized_keys
chmod 644 ~/.ssh/*.pub ~/.ssh/known_hosts
```

## Connection Troubleshooting

| Symptom | Debug Command | Common Fix |
|---------|--------------|------------|
| Permission denied | `ssh -vvv user@host` | Check key permissions, authorized_keys |
| Connection timeout | `ssh -o ConnectTimeout=5 user@host` | Check firewall, port, IP |
| Host key changed | `ssh-keygen -R host` | Re-scan with ssh-keyscan |
| Agent forwarding fails | `ssh-add -l` | Add key to agent |
| Too many auth failures | `ssh -o IdentitiesOnly=yes -i key user@host` | Specify exact key |
