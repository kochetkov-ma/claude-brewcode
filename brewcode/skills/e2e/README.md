# E2E Testing

BDD scenarios and autotests from one command: `install` creates five project-tuned `e2e-*` agents, `create` writes scenarios and tests with review cycles, `review` runs a 3-reviewer quorum. Stack-agnostic (Java, Python, JS/TS and others).

## Install

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewcode@claude-brewcode
```

Then run `/brewcode:e2e install` once per project.

## Usage

`/brewcode:e2e [prompt] [status|install|create|update|review|rules]`

| Mode | Command | Purpose |
|------|---------|---------|
| install | `/brewcode:e2e install` | Analyze project, create 5 E2E agents, generate rules, save config |
| create | `/brewcode:e2e create [prompt]` | Create BDD scenarios and E2E autotests with review cycles |
| update | `/brewcode:e2e update [prompt]` | Update existing scenarios and tests |
| review | `/brewcode:e2e review [prompt]` | Multi-agent quorum review (3 reviewers, 2/3 consensus) |
| rules | `/brewcode:e2e rules [prompt]` | Read and rewrite `.claude/e2e/e2e-rules.md` via architect + WebSearch |
| status | `/brewcode:e2e status` | Read-only infrastructure status (agents, rules, config, artifacts) |

```bash
/brewcode:e2e create "checkout flow"
```

Agents created by `install`: `e2e-architect`, `e2e-scenario-analyst`, `e2e-automation-tester`, `e2e-manual-tester` (sonnet), `e2e-reviewer` (read-only). Review loops stop after 3 rounds, then you decide.

Project rules live in `.claude/e2e/e2e-rules.md`. No mode word: `status` when 3+ `e2e-*` agents exist, otherwise `install`.

## Documentation

Full docs: [e2e](https://doc-claude.brewcode.app/brewcode/skills/e2e/)
