# Deploy

GitHub Actions deployment: workflows, releases, GHCR and CI/CD with a confirmation gate before every write or push. Generates a companion `deploy-admin` agent that reads the GitHub, workflow and server config from `CLAUDE.local.md`.

## Install

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewtools@claude-brewcode
```

User-invocable only (`disable-model-invocation: true`): type `/brewtools:deploy` or nothing runs.

## Usage

```
/brewtools:deploy [prompt] [setup|create|release|deploy|monitor|update-agent]
```

Example:

```
/brewtools:deploy release patch
```

No arguments: setup when `CLAUDE.local.md` has no GitHub config, monitor otherwise.

| Mode | Trigger words | What it does |
|------|---------------|--------------|
| Setup | `setup`, `check`, `prerequisites`, `init` | Verify `gh` auth, detect repo, discover workflows, persist config, generate `deploy-admin` |
| Create | `create`, `new workflow`, `add workflow` | Generate workflow YAML from a template; production deploys take release-tag builds only |
| Release | `release`, `bump`, `version`, `tag`, `publish` | Probe tooling, plan, confirm, bump, commit + tag + push, watch CI, verify artifact |
| Deploy | `deploy`, `trigger`, `dispatch`, `run workflow` | Select a workflow, confirm, trigger, watch the run |
| Monitor | `monitor`, `watch`, `status`, `check runs`, `logs` | Recent runs, workflow states, releases, failed-run logs |
| Update agent | `update agent`, `refresh`, `rescan` | Re-discover workflows, regenerate `deploy-admin` |

READ and CREATE commands run freely; MODIFY, SERVICE, DELETE and PRIVILEGE always ask. Gates run in the main conversation, never in a subagent.

## Documentation

Full guide: https://doc-claude.brewcode.app/brewtools/skills/deploy/ | [deploy-admin](../../agents/deploy-admin.md) | [brewtools](../../README.md)
