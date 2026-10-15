# SSH

SSH server management: connect, configure, deploy and administer Linux servers. Every command is classified by risk, and a companion `ssh-admin` agent reads the server inventory from `CLAUDE.local.md`.

## Install

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewtools@claude-brewcode
```

User-invocable only (`disable-model-invocation: true`): type `/brewtools:ssh` or nothing runs.

## Usage

```
/brewtools:ssh [prompt] [setup|connect|configure|update-agent]
```

Example:

```
/brewtools:ssh check disk space and docker status on vps-main
```

No arguments: setup when no server is configured, otherwise execute (asks which server).

| Mode | Trigger words | What it does |
|------|---------------|--------------|
| Setup | `setup`, `new server`, `add server` | Key auth (password + key install as fallback), `~/.ssh/config` entry, discovery, persist config, generate `ssh-admin` |
| Connect | `connect to`, `ssh to`, `login` | Use the configured server, or ask which |
| Configure | `configure`, `config`, `harden` | Apply the requested config change under the same classification |
| Execute | any other text | Plan, classify, run after confirmation |
| Update agent | `update agent`, `refresh agent`, `refresh` | Re-discover up to 3 servers, refresh `ssh-admin` |

READ and CREATE commands run freely; MODIFY, SERVICE, DELETE and PRIVILEGE ask first, and sshd, port or firewall changes pass a 5-step lockout gate. Gates run in the main conversation, never in a subagent.

## Documentation

Full guide: https://doc-claude.brewcode.app/brewtools/skills/ssh/ | [ssh-admin](../../agents/ssh-admin.md) | [brewtools](../../README.md)
