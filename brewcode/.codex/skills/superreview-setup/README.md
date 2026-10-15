# brewcode:superreview-setup

<p align="center"><img src="../../../assets/demos/superreview.gif" width="800" alt="Terminal animation: a review skill is generated for a repo, wires domain experts and an intent guard, runs on a payments refund flow, and ends with a minor-drift verdict from a read-only report."><br><sub>Illustrative animation: generate a review skill → it wires domain experts and an intent guard → run it on a change → drift verdict and findings in a read-only report.</sub></p>

A **human-invoked generator**. It analyzes your project and writes a self-contained, project-local `.codex/skills/superreview/` plus `.codex/agents/intent-guard.toml`: a deep code-review skill covering intent, domain experts and scope discipline. The emitted `/superreview` does the reviewing; this skill only generates it.

## Install

```bash
codex plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
codex plugin add brewcode@claude-brewcode
```

Then run inside the repo you want to wire up:

```
$brewcode:superreview-setup [status|install|upgrade|enable|disable|uninstall|purge] "<fine-tune-prompt>" [scope]
```

## Usage

| Verb | Effect |
|------|--------|
| `status` | read-only: is the skill emitted, enabled or parked, is `intent-guard.toml` present, does `validate` pass |
| `install` | full generation (Phase 0 -> 4). Also the default when a fine-tune prompt is given with no verb |
| `upgrade` | refresh a live install from the template baseline without erasing tailoring |
| `enable` | rename `SKILL.md.disabled` back to `SKILL.md` — `/superreview` is offered again |
| `disable` | rename `SKILL.md` to `SKILL.md.disabled` — `/superreview` stops being discovered; nothing deleted |
| `uninstall` | delete `.codex/skills/superreview/`. **Keeps** the review reports and `intent-guard.toml` |
| `purge` | uninstall + delete `.codex/reports/*_superreview/`. Still keeps `intent-guard.toml` |

No arguments: `status` when the skill is already emitted, `install` when it is not. `intent-guard.toml` survives all seven verbs; it is shared with `$brewcode:teams-setup`.

`<fine-tune-prompt>` sets the emphasis of the emitted Focus table (e.g. "weight reuse highest"); scope discipline stays rank 1.

## What it generates

| Axis | QUICK (default) | EXTENDED |
|------|-----------------|----------|
| Intent pass (`intent-guard`: asked vs delivered, 12 drift classes) | yes | yes |
| Mechanical gates (real build, lint, type, test commands) | yes | yes |
| Domain experts, selected from the live agent roster | no | yes |
| Scope discipline (baseline, delivery, closeout passes) | no | yes |
| Adversarial per-finding validation | no | yes |

Output: one merged P0-P3 report at `.codex/reports/{TIMESTAMP}_superreview/REPORT.md`.

## Files

| File | Role |
|------|------|
| `scripts/generate.sh` | `scan` / `emit` / `emit-agent` / `upgrade` / `enable` / `disable` / `uninstall` / `purge` / `validate` |
| `references/*.template`, `agent-prompt.md`, `report-template.md` | Emitted skill, agent contract, scope reference, report layout |
| `references/{python,java-kotlin,typescript-react,go}.md` | Per-stack reference, one emitted |

## Run the emitted skill

Depth comes from how you phrase the request: no flag.

```
/superreview "<focus>" [scope: commit|branch|folder]     # QUICK (default): intent + gates, 1 agent
/superreview "deep review of <focus>" [scope]            # EXTENDED: expert fan-out + validation
```

The emitted review is **read-only**: it reports and recommends `/simplify`, never edits code. Use `upgrade`, never a re-emit, after agent, rule, stack or tracker changes.

## Documentation

Full docs, depth table, `intent-guard`, upgrade flow and emitted file tree: [superreview-setup](https://doc-claude.brewcode.app/brewcode/skills/superreview-setup/)
