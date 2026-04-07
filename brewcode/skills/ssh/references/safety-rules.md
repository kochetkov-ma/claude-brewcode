# SSH Command Safety Classification

> Reference for command classification and confirmation gates.

## Classification Levels

| Level | Gate | Description |
|-------|------|-------------|
| **READ** | free | Observe system state, no changes |
| **CREATE** | free | Create new resources, no overwrites |
| **MODIFY** | confirm | Change existing files, configs, permissions |
| **SERVICE** | confirm | Start/stop/restart services, containers |
| **DELETE** | always confirm | Remove files, containers, volumes, data |
| **PRIVILEGE** | always confirm | Escalate permissions, change security |

## READ Commands (free)

| Category | Commands |
|----------|----------|
| Filesystem | `ls`, `cat`, `head`, `tail`, `less`, `find`, `tree`, `stat`, `file`, `wc` |
| System | `uname`, `hostname`, `uptime`, `whoami`, `id`, `groups`, `env`, `printenv` |
| Resources | `df`, `du`, `free`, `top`, `htop`, `vmstat`, `iostat`, `lscpu`, `lsmem` |
| Network | `ip addr`, `ip route`, `ss`, `netstat`, `ping`, `traceroute`, `dig`, `nslookup`, `curl -I` |
| Processes | `ps`, `pgrep`, `lsof` |
| Docker | `docker ps`, `docker images`, `docker logs`, `docker inspect`, `docker stats`, `docker network ls`, `docker volume ls`, `docker compose ps` |
| Services | `systemctl status`, `systemctl list-units`, `systemctl is-active`, `journalctl` |
| Logs | `journalctl`, `tail -f /var/log/*`, `dmesg` |

## CREATE Commands (free)

| Category | Commands |
|----------|----------|
| Filesystem | `mkdir`, `touch`, `tee` (new file only) |
| Docker | `docker pull`, `docker network create`, `docker volume create`, `docker build` |
| Users | (none -- all user ops are PRIVILEGE) |

## MODIFY Commands (confirm)

| Category | Commands | Risk |
|----------|----------|------|
| Permissions | `chmod`, `chown`, `chgrp` | Access changes |
| Files | `sed -i`, `cp` (overwrite), `mv`, `tee` (existing file) | Data modification |
| Docker | `docker tag`, `docker compose build` | Image changes |
| Services | `systemctl enable`, `systemctl disable` | Boot behavior |
| Config | Edit any file in `/etc/`, `crontab -e` | System config |
| Network | `ip link set`, DNS config changes | Connectivity |

## SERVICE Commands (confirm)

| Category | Commands | Risk |
|----------|----------|------|
| Systemd | `systemctl restart`, `systemctl stop`, `systemctl start`, `systemctl reload` | Service disruption |
| Docker | `docker compose up`, `docker compose down`, `docker compose restart`, `docker stop`, `docker start`, `docker restart` | Container disruption |
| Web | `nginx -s reload`, `nginx -s stop`, `caddy reload`, `caddy stop` | Web service disruption |
| Process | `kill`, `killall`, `pkill` | Process termination |

## DELETE Commands (always confirm)

| Category | Commands | Risk |
|----------|----------|------|
| Files | `rm`, `rm -rf`, `rmdir`, `shred` | Data loss |
| Docker | `docker rm`, `docker rmi`, `docker volume rm`, `docker network rm`, `docker system prune`, `docker compose down -v` | Container/data loss |
| Database | `DROP TABLE`, `DROP DATABASE`, `TRUNCATE` | Data loss |
| Users | `userdel`, `groupdel` | Access loss |
| Cleanup | `apt autoremove`, `apt purge` | Package removal |

## PRIVILEGE Commands (always confirm)

| Category | Commands | Risk |
|----------|----------|------|
| Escalation | `sudo`, `su`, `sudo -i`, `sudo su` | Full access |
| Security | `visudo`, `passwd`, `chpasswd` | Auth changes |
| Firewall | `ufw allow`, `ufw deny`, `ufw delete`, `iptables`, `nftables` | Network exposure |
| Users | `useradd`, `usermod`, `adduser`, `gpasswd` | Access control |
| Mount | `mount`, `umount`, `fdisk`, `mkfs` | Disk operations |
| SSH | `sshd` config changes, authorized_keys edits | Remote access |

## Compound Command Rules

| Pattern | Classification | Why |
|---------|----------------|-----|
| `sudo` + any command | PRIVILEGE (overrides cmd level) | Escalation always confirmed |
| Pipeline: `cmd1 \| cmd2` | Highest of both | Chain is as dangerous as worst |
| `&&` chain | Highest of all | All commands will execute |
| Redirect `>` to existing file | MODIFY | Overwrites content |
| Redirect `>>` to new file | CREATE | Appends/creates |
| `curl \| bash` | PRIVILEGE | Arbitrary code execution |
| `wget && chmod +x && ./` | PRIVILEGE | Download and execute |

## Confirmation Message Format

### MODIFY/SERVICE

```
About to execute on [SERVER]:

  [command 1]
  [command 2]

Classification: MODIFY/SERVICE
Proceed?
```

### DELETE/PRIVILEGE

```
WARNING: DESTRUCTIVE action on [SERVER]:

  [command 1] -- [what it deletes/changes]

Classification: DELETE/PRIVILEGE
This cannot be undone.
Proceed?
```

## Emergency Stop

If any command returns unexpected output suggesting:
- Wrong server (hostname mismatch)
- Production environment (when expecting staging)
- Root filesystem nearly full (<5% free)
- Unexpected running services

**STOP immediately.** Report findings. Ask user to confirm before continuing.
