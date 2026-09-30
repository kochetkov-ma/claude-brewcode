# SSH Command Safety Classification

> Reference for command classification and confirmation gates.

## Who Is Reading This (decide FIRST)

The risk categories below are identical for both readers; the GATE is not.

| Reader | Has `AskUserQuestion`? | Gate |
|--------|------------------------|------|
| Main session (the `/brewtools:ssh` skill) | yes | Confirm interactively before executing — see "Confirmation Message Format" |
| Ordinary SA (`ssh-admin`, including skill `context: fork`) | no — ordinary tool filters remove it even if declared | Run scoped non-destructive work only; return missing decisions and exact approval envelopes to main |
| Conversation fork | inherits parent pool; question tool may be available | Same SSH role contract: user decisions/approval stay in main; no self-approval |

Ordinary SAs cannot ask the user mid-run. A conversation fork's extra tool access does not alter the approval contract. Return missing goal/host/scope/acceptance decisions to main; a safe stated assumption permits only scoped non-destructive work, never unconfirmed execution or expanded scope. Use exact envelopes for gated actions.

## Classification Levels

| Level | Main session | Subagent | Description |
|-------|--------------|----------|-------------|
| **READ** | free | free | Scoped observation without secret exposure |
| **CREATE** | free | free | Non-destructive local new resources, no overwrites; remote/shared mutation still gated |
| **MODIFY** | confirm | envelope | Change existing files, configs, permissions |
| **SERVICE** | confirm | envelope | Start/stop/restart services, containers |
| **DELETE** | always confirm | ALWAYS envelope | Remove files, containers, volumes, data |
| **PRIVILEGE** | always confirm | ALWAYS envelope | Escalate permissions, change security |

> "Envelope" = do not run it. Emit it under `## APPROVAL REQUIRED` per the Approval Contract below,
> unless the incoming prompt already carries `APPROVED:` for that exact command.

**Destructive** = irreversible or affecting a remote/shared system: `rm`/`mv` over existing paths,
service restart/stop, firewall/user/permission changes, secret rotation, `docker system prune`,
any remote `ssh` mutation.

## Approval Contract (subagents)

1. Do all non-destructive work and gather full evidence.
2. End the FINAL RETURN with an `## APPROVAL REQUIRED` block, one envelope per destructive
   operation, ids `A1..AN`, fields exactly:

```
## APPROVAL REQUIRED

### A1
COMMAND:      <exact command, copy-pasteable>
HOST:         <server alias / user@host>
EFFECT:       <what changes, incl. downtime>
ROLLBACK:     <exact reverse command, or NONE>
EVIDENCE:     <the read-only output that proves it is needed>
PRECONDITION: <what must still hold at execution time>
```

3. Stop, executing nothing in that block. Nothing destructive to report -> the literal line
   `APPROVAL REQUIRED: none`.

The CALLER (main session, which does have `AskUserQuestion`) presents the envelope and, if approved,
either runs it or re-spawns the agent with `APPROVED: <ids>` in the prompt.
**An explicit approval token in the incoming prompt is the ONLY authorization a subagent may act on.**
`APPROVED:` covers only the envelope ids it names, exactly as worded — not a similar command, not a
broader scope, not a retry with different arguments. Re-verify each PRECONDITION before executing.

## READ Commands (free)

Free READ never permits raw credentials or environment dumps. `env`, bare `printenv`, `set` and prefix/wildcard filtering of a full dump are not free diagnostics. Request explicitly named nonsensitive fields, one per portable call (e.g. `printenv LANG`; other candidates LC_ALL/TERM/TZ); omit secret-bearing fields and return missing decisions rather than exposing unknown values. `env VAR=... command` is a wrapper: classify its inner command/effects, not as READ. Apply this locally/remotely and to secret-bearing logs/inspect/argv; external tool guards may further restrict even scoped READ.

| Category | Commands |
|----------|----------|
| Filesystem | `ls`, `cat`, `head`, `tail`, `less`, `find`, `tree`, `stat`, `file`, `wc` |
| System | `uname`, `hostname`, `uptime`, `whoami`, `id`, `groups`; explicit nonsensitive env names only |
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

## Confirmation Message Format (main session only)

> A subagent uses the envelope block above instead — never these prompts.

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

**STOP immediately**, including previously approved operations whose preconditions changed. Main asks before continuing; delegated roles return findings/missing decisions without self-approval. Silence is never approval, regardless of available question tools.
