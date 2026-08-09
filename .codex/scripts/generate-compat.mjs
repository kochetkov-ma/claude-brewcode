#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');

const PLUGINS = {
  brewcode: {
    skills: ['agents', 'convention', 'rules', 'superreview-setup', 'teams-setup'],
    agents: ['agent-creator', 'bash-expert', 'hook-creator']
  },
  brewdoc: {
    skills: ['md-to-pdf'],
    agents: []
  },
  brewtools: {
    skills: ['manager-setup', 'task-board-setup', 'text-human', 'text-optimize', 'think-short-setup'],
    agents: ['text-optimizer']
  }
};

const EXPLICIT_ONLY = new Set([
  'brewcode/agents', 'brewcode/convention', 'brewcode/rules', 'brewcode/teams-setup',
  'brewtools/manager-setup', 'brewtools/task-board-setup', 'brewtools/think-short-setup'
]);

const MANUAL_NATIVE_SKILLS = new Set([
  'brewcode/convention', 'brewcode/rules', 'brewtools/manager-setup', 'brewtools/task-board-setup',
  'brewtools/think-short-setup'
]);

// Etalon-first wording mirrored into the Codex variants. Sources of truth:
// brewcode/skills/teams-setup/references/agent-template.md and
// brewtools/skills/manager-setup/references/architect.md. Edit here only, never at the call sites.
const ETALON_ADDITIVE = 'in addition to conventions, rules, and documentation, never instead of them';
const ETALON_SENTENCE = `before writing a class, module, or test, find the closest well-built existing one in this repository and take its principles, ${ETALON_ADDITIVE}`;
const ETALON_BRIEF = `find the closest well-built counterpart in the repository and follow its principles, ${ETALON_ADDITIVE}`;
const ETALON_ARCHITECT = 'Find the closest well-built existing counterpart in the repository, take its principles, and reuse its patterns; add a new pattern only when nothing fits. This is additive to conventions, rules, and documentation, never a replacement.';
const ETALON_TERSE = 'find the closest well-built counterpart in the repo and take its principles, in addition to conventions and docs, never instead';

function readFrontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) throw new Error('SKILL.md is missing YAML frontmatter');
  const values = {};
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!field) continue;
    values[field[1]] = field[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return { values, body: source.slice(match[0].length) };
}

function transformText(value, { agent = false } = {}) {
  let text = value
    .replaceAll('${CLAUDE_SKILL_DIR}', '<skill-directory>')
    .replaceAll('$CLAUDE_SKILL_DIR', '<skill-directory>')
    .replaceAll('${CLAUDE_PROJECT_DIR}', '<project-root>')
    .replaceAll('$CLAUDE_PROJECT_DIR', '<project-root>')
    .replaceAll('${CLAUDE_PLUGIN_ROOT}', agent ? '{{PLUGIN_ROOT}}' : '<plugin-root>')
    .replaceAll('$CLAUDE_PLUGIN_ROOT', agent ? '{{PLUGIN_ROOT}}' : '<plugin-root>')
    .replaceAll('CLAUDE_CODE_SESSION_ID', 'CODEX_SESSION_ID')
    .replaceAll('CLAUDE_PROJECT_DIR', '<project-root>')
    .replaceAll('CLAUDE_SKILL_DIR', 'skill directory')
    .replaceAll('CLAUDE_PLUGIN_ROOT', agent ? '{{PLUGIN_ROOT}}' : 'plugin root')
    .replaceAll('CLAUDE.md', 'AGENTS.md')
    .replaceAll('CLAUDE.local.md', 'AGENTS.local.md')
    .replaceAll('~/.claude', '~/.codex')
    .replaceAll('.claude/', '.codex/')
    .replaceAll('.claude\\', '.codex\\')
    .replace(/\/brew(code|doc|tools):([a-z0-9-]+)/g, (_, family, name) => `$brew${family}:${name}`)
    .replace(/Skill\(skill="([^"]+)"\)/g, '$$$1')
    .replace(/\bTask\(/g, 'spawn_agent(')
    .replace(/\bTask tool\b/gi, 'sub-agent collaboration tools')
    .replace(/\bTask calls?\b/gi, 'sub-agent calls')
    .replace(/\bTask\b/g, 'sub-agent task')
    .replace(/\bAskUserQuestion\b/g, 'request_user_input')
    .replace(/\bWebSearch\b/g, 'web search')
    .replace(/\bWebFetch\b/g, 'web fetch')
    .replace(/\bSkill tool\b/gi, 'matching skill')
    .replace(/\bBash tool\b/gi, 'shell')
    .replace(/\bRead tool\b/gi, 'filesystem reader')
    .replace(/\bWrite tool\b/gi, 'apply_patch')
    .replace(/\bEdit tool\b/gi, 'apply_patch')
    .replace(/\bopus-or-fable\b/gi, 'high-reasoning model')
    .replace(/\bopus\b/gi, 'high-reasoning model')
    .replace(/\bsonnet\b/gi, 'balanced model')
    .replace(/\bhaiku\b/gi, 'fast model')
    .replace(/\binherit model\b/gi, 'parent-session model')
    .replace(/\bClaude Code\b/g, 'Codex')
    .replace(/\bClaude 4\.x\b/g, 'current Codex models')
    .replace(/\bClaude 4\b/g, 'Codex')
    .replace(/\bClaude\b/g, 'Codex')
    .replaceAll('code.claude.com/docs/en/memory', 'developers.openai.com/codex/guides/agents-md')
    .replaceAll('unset CLAUDECODE && ', '')
    .replace(/\bclaude plugin\b/g, 'codex plugin')
    .replace(/\bclaude --plugin-dir\b/g, 'codex')
    .replace(/\bpermissionMode\b/g, 'sandbox_mode')
    .replaceAll('`allowed-tools:`', '`tool policy`')
    .replace(/\bANTHROPIC_BASE_URL\b/g, 'OPENAI_BASE_URL')
    .replace(/\bANTHROPIC_API_KEY\b/g, 'OPENAI_API_KEY')
    .replace(/\bANTHROPIC_DEFAULT_[A-Z_]+_MODEL\b/g, 'CODEX_MODEL')
    .replaceAll('@latest', '@1.0.0')
    .replaceAll(':latest', ':1.0.0')
    .replaceAll('@main', '@v1')
    .replaceAll('ubuntu-latest', 'ubuntu-24.04')
    .replaceAll('default: "latest"', 'default: "1.0.0"');

  text = text
    .replace(/^allowed-tools:.*\n?/gm, '')
    .replace(/^tools:.*\n?/gm, '')
    .replace(/^model:\s*(?:high-reasoning model|balanced model|fast model|parent-session model).*\n?/gm, '')
    .replace(/^sandbox_mode:\s*(?:default|acceptEdits|plan|dontAsk|bypassPermissions).*\n?/gm, '');

  if (!agent) text = text.replaceAll('$ARGUMENTS', '<arguments>');
  return text;
}

// Agent files this marketplace's setup skills write into a target repo's agents dir. Add a
// name here whenever a skill starts installing another agent, or its prose keeps shipping the
// Claude extension to Codex users.
const SHIPPED_AGENT_FILES = ['intent-guard', 'task-tracker'];

// A Codex agent file is `<name>.toml`; a Claude one is `<name>.md`. The two contiguous
// `.codex/agents/<file>.md` rules in nativeWorkflowText only fire when the directory and
// the extension sit in one literal token, which is exactly what the sources most often
// do NOT do:
//   1. shell scripts hoist the directory into a variable -- `AGENTS_DIR=".claude/agents"`
//      then `"$AGENTS_DIR/${agent}.md"`. The path rewrite lands on the assignment, the
//      extension never does, so the mirrored script hunts for `.md` files under
//      `.codex/agents/` and matches nothing (teams-setup toggle-team.sh enable/disable).
//   2. prose names the parked or literal form on its own -- ``.claude/agents/<name>.md`.
//      `disable` renames each member to `<name>.md.disabled`` -- and the second half
//      keeps the Claude extension while the first half is corrected.
// Both are scoped so a skill, reference or doc `.md` can never be reached: (1) only
// resolves variables literally assigned the agents dir, (2) only rewrites placeholder
// basenames (`<name>`, `{name}`, `${agent}`) on lines that already mention the agents
// dir, which leaves real filenames such as `references/intent-guard.md.template` alone.
function codexAgentExtension(text) {
  const agentDirVars = new Set();
  for (const match of text.matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=["']?\.codex\/agents\/?["']?\s*$/gm)) {
    agentDirVars.add(match[1]);
  }
  for (const name of agentDirVars) {
    text = text.replace(new RegExp(`(\\$\\{?${name}\\}?/[^\\s"'\`]+?)\\.md\\b`, 'g'), '$1.toml');
  }
  text = text.replace(/^.*\.codex\/agents\/.*$/gm, line => line
    .replace(/((?:<[A-Za-z0-9_-]+>|\{[A-Za-z0-9_-]+\}|\$\{[A-Za-z0-9_]+\}))\.md\b/g, '$1.toml')
    .replace(/\bagent (`?)\.md\1/g, 'agent $1.toml$1'));
  // Parking prose with no path on the line at all: "A roster member has neither `.md` nor
  // `.md.disabled`". A stem-less `.md.disabled` is ALWAYS an agent -- a parked skill is always
  // written with its stem, `SKILL.md.disabled` -- so that token is the anchor, and the bare
  // `.md` beside it is rewritten only on a line already carrying it. That keeps genuine
  // markdown talk (md-to-pdf's `.md` inputs, text-optimize's `.md` targets) untouched.
  text = text.replace(/^.*`\.md\.disabled`.*$/gm, line =>
    line.replace(/`\.md(\.disabled)?`/g, (_, suffix) => '`.toml' + (suffix || '') + '`'));
  // Agents this marketplace itself installs. Their prose names them bare, far from any path
  // (`Still keeps \`intent-guard.md\``, ``excluding \`task-tracker.md\```), so neither the
  // contiguous nor the line-scoped rule reaches them, yet each ships as `<name>.toml`. The
  // lookahead protects a plugin-internal source file of the same stem -- notably
  // `references/intent-guard.md.template`, which is a template and stays `.md.template`.
  for (const agent of SHIPPED_AGENT_FILES) {
    text = text.replace(new RegExp(`\\b${agent}\\.md\\b(?!\\.template)`, 'g'), `${agent}.toml`);
  }
  return text;
}

function nativeWorkflowText(value, options = {}) {
  return codexAgentExtension(transformText(value, options)
    .replaceAll('$code:', '$brewcode:')
    .replaceAll('$doc:', '$brewdoc:')
    .replaceAll('$tools:', '$brewtools:')
    .replace(/\.codex\/agents\/([^\s'"`]+)\.md\b/g, '.codex/agents/$1.toml')
    .replace(/~\/\.codex\/agents\/([^\s'"`]+)\.md\b/g, '~/.codex/agents/$1.toml'))
    .replace(/\b(?:BC|BD|BT)_PLUGIN_ROOT\b/g, '<plugin-root>')
    .replace(/\b(?:BC|BD|BT)_ROOT\b/g, '<plugin-root>')
    .replaceAll('CLAUDE_MD', 'AGENTS_FILE')
    .replaceAll('claude_md', 'agents_md')
    .replaceAll('claude-local', 'codex-local')
    .replaceAll('.claude-plugin', '.codex-plugin')
    .replaceAll('~/.codex.json', '~/.codex/config.toml')
    .replaceAll('.codex/settings.local.json', '.codex/hooks.json')
    .replaceAll('.codex/settings.json', '.codex/config.toml')
    .replaceAll('settings.local.json', 'hooks.json')
    .replaceAll('settings.json', 'config.toml')
    .replaceAll('~/.codex/settings.local.json', '~/.codex/hooks.json')
    .replaceAll('~/.codex/settings.json', '~/.codex/config.toml')
    .replace(/~\/\.codex\/plugins\/cache\/[\w*./{}-]+/g, '<codex-managed-plugin-state>')
    .replace(/\.codex\/plugins\/cache\/[\w*./{}-]+/g, '<codex-managed-plugin-state>')
    .replace(/spawn_agent\s*\(/g, 'Codex delegation brief (')
    .replace(/\bsubagent_type\s*=/g, 'task_role=')
    .replace(/\bsubagent_type\s*:/g, 'task_role:')
    .replace(/\bmodel\s*=/g, 'reasoning_tier=')
    .replace(/\bprompt\s*=/g, 'message=')
    .replace(/\brun_in_background\s*[:=]\s*(?:false|true)/g, 'execution=foreground')
    .replace(/Skill\s*\(\s*skill\s*=\s*["']([^"']+)["']\s*,\s*args\s*=\s*["']([^"']*)["']\s*\)/g, (_, name, args) => `Invoke \`$${name}\` with arguments \`${args}\``)
    .replace(/\bclaude\s+-p\b/g, 'codex exec')
    .replace(/\bclaude\s+--version\b/g, 'codex --version')
    .replace(/\bcodex plugin install\b/g, 'codex plugin add')
    .replace(/\bcodex plugin marketplace update\b/g, 'codex plugin marketplace upgrade')
    .replace(/\bcodex plugin update\s+([a-z0-9-]+@[a-z0-9-]+)/g, 'codex plugin remove $1 && codex plugin add $1')
    .replace(/Skill\s*\(\s*skill\s*=\s*["']([^"']+)["']\s*\)/g, (_, name) => `$${name}`);
}

function writeFile(file, content, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  if (mode !== undefined) fs.chmodSync(file, mode);
}

function copyTransformedTree(sourceDir, targetDir) {
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.name === 'SKILL.md' || entry.name === 'agents' || entry.name === '.claude' || entry.name === '__pycache__' || entry.name.endsWith('.pyc')) continue;
    const source = path.join(sourceDir, entry.name);
    const targetName = entry.name.replaceAll('claude-md', 'agents-md').replaceAll('claude-local', 'codex-local');
    const target = path.join(targetDir, targetName);
    if (entry.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      copyTransformedTree(source, target);
      continue;
    }
    const data = fs.readFileSync(source);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (data.includes(0)) {
      fs.writeFileSync(target, data);
    } else {
      fs.writeFileSync(target, nativeWorkflowText(data.toString('utf8')), 'utf8');
    }
    fs.chmodSync(target, fs.statSync(source).mode & 0o777);
  }
}

function skillDocument(name, description, body) {
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n${body.trim()}\n`;
}

function effectiveDescription(plugin, skill, description) {
  return {
    'brewcode/rules': 'Maintains project .codex/rules and the AGENTS.md rule index. Explicit user invocation only.',
    'brewtools/manager-setup': 'Configures Manager and review prompt modes. Explicit user invocation only.',
    'brewtools/task-board-setup': 'Creates a Codex file-based task board. Explicit user invocation only.',
    'brewtools/think-short-setup': 'Installs or removes terse-mode hooks. Explicit user invocation only.'
  }[`${plugin}/${skill}`] || description;
}

function specialSkill(plugin, skill, description) {
  const bodies = {
    'brewcode/agents': `# Codex agent authoring

Create or improve project agents as TOML files under \`.codex/agents/\`. Inspect existing agents first, keep each role narrow, and use only supported keys such as \`name\`, \`description\`, and \`developer_instructions\`. Validate every result with Python \`tomllib\`. Do not create Markdown agent definitions or edit installed plugin caches.`,
    'brewcode/convention': `# Extract conventions

Inspect representative production code and tests, identify repeated architectural and implementation patterns, and write concise convention documents to the user-selected Codex-owned path. Cite concrete repository files, distinguish enforced rules from observations, and avoid changing application code unless the user explicitly asks.

## Workflow

1. Read the applicable \`AGENTS.md\` files and repository architecture documentation before analysis.
2. Resolve the requested scope: full repository, convention documents only, rule extraction from existing convention documents, or explicit paths.
3. Inventory languages, frameworks, module boundaries, build files, tests, migrations, and existing convention material with focused \`rg\` searches.
4. Select representative production and test files for each relevant layer. Prefer repeated current patterns over isolated legacy examples.
5. Record evidence for architecture boundaries, dependency direction, naming, data models, error handling, persistence, external integrations, testing, and deployment constraints.
6. For each candidate convention, cite concrete paths, state whether it is enforced or observed, identify exceptions, and name the preferred reference implementation.
7. Write compact English convention documents under the requested project \`.codex/\` path. Preserve unrelated content and do not duplicate full rule bodies in \`AGENTS.md\`.
8. If the user requests durable rules, extract accepted candidates, deduplicate them against all \`.codex/rules/*.md\` files and applicable \`AGENTS.md\` instructions, and apply them directly without a dedicated organizer agent.
9. Update the root \`AGENTS.md\` rule-index table so every project rule appears exactly once with columns \`Rule\`, \`Load when\`, and \`Purpose\`.
10. Invoke \`$brewtools:text-optimize -l\` for every changed convention, rule, and index file. Compare semantics before accepting optimized text.
11. Re-run the file inventory, validate every cited path, and report documents changed, rules added or merged, duplicates skipped, and unresolved conflicts.

Use Codex collaboration only when the user or active repository instructions explicitly require delegation. When delegation is allowed, prefer project-specific agents and keep one bounded evidence-gathering surface per agent.`,
    'brewcode/e2e': `# End-to-end testing

Translate the requested behavior into GIVEN/WHEN/THEN scenarios, inspect the active application and test stack, then implement the smallest deterministic end-to-end suite. Use Codex collaboration agents only when the user or project instructions explicitly request delegation. Run against mocks or local services unless live side effects are explicitly authorized, and report exact commands and failures.`,
    'brewcode/rules': `# Codex project rules

Use only when the user explicitly requests rule creation, synchronization, improvement, review, or inventory.

## Sources of truth

- Store rule bodies under the project \`.codex/rules/\`; never use personal or foreign-assistant rule paths.
- Treat hierarchical \`AGENTS.md\` files as Codex's automatically loaded instruction surface.
- Keep rule content in one file. \`AGENTS.md\` contains a compact index, not copied rule bodies.

## Workflow

1. Read the applicable \`AGENTS.md\` files and inventory every project rule with \`rg --files .codex/rules | sort\`.
2. Resolve the request to create, improve, review, list, or synchronize. Persist durable repository facts only; exclude secrets, transient session state, generated reports, and duplicate instructions.
3. Create or update English rule files under \`.codex/rules/\`. Reuse an existing rule when its scope matches.
4. Update the nearest applicable \`AGENTS.md\` rule-index table. The repository-root table lists every \`.codex/rules/*.md\` file exactly once with columns \`Rule\`, \`Load when\`, and \`Purpose\`. Nested tables add only subtree-specific rules not already covered by the inherited root index.
5. Invoke \`$brewtools:text-optimize -l\` for every changed rule and \`AGENTS.md\` index. Preserve paths, scope qualifiers, safety constraints, and table structure; apply the optimized patch only after comparing semantics.
6. Re-run the complete inventory. Fail validation when any rule path is missing from the root index, any indexed path is stale, or a rule body was duplicated into \`AGENTS.md\`.
7. Report changed rules, index rows, optimization measurements, and validation evidence.

The index makes rules discoverable; it does not auto-load their bodies. During later work, read the indexed rule whose \`Load when\` condition matches the task.`,
    'brewcode/skills': `# Codex skill authoring

List, create, or improve Codex skills. A skill uses \`SKILL.md\` with only \`name\` and \`description\` frontmatter, optional \`agents/openai.yaml\`, and colocated scripts, references, or assets. Keep activation wording specific, run the Codex skill quick validator, and forward-test complex workflows without production side effects.`,
    'brewcode/superreview-setup': `# Project-tailored review

Inspect repository instructions, architecture, tests, and recent changes, then create a focused Codex review skill in the user-selected project \`.codex/skills/\` path. Encode evidence-based checks, severity guidance, and verification commands. Validate the generated skill and do not create Markdown agent definitions.`,
    'brewcode/teams-setup': `# Codex team coordination

Use collaboration agents only when the user or project instructions explicitly request a team. Split work into bounded independent tasks, keep one owner per file or surface, exchange evidence through collaboration messages, and synthesize results in the parent session. Do not invent unsupported agent parameters or create persistent team configuration unless requested.`,
    'brewdoc/md-to-pdf': `# Markdown to PDF

Convert a local Markdown file with \`scripts/md_to_pdf.py\`. Check dependencies with \`scripts/check_deps.sh\`, choose a bundled style from \`styles/\`, and write only to the requested output path. Store project preferences in \`.codex/md-to-pdf.config.json\` only after confirmation. Render and inspect the result before reporting completion.`,
    'brewdoc/memory': `# Optimize Codex instructions

Audit \`AGENTS.md\` and related project Codex guidance for duplication, contradictions, stale paths, and unnecessary verbosity. Propose a compact patch that preserves load-bearing constraints and local overrides. Do not modify runtime configuration, skills, or memories unless the user explicitly requests it.`,
    'brewdoc/my-claude': `# Document a Codex installation

Use only when explicitly invoked. The stable skill id is retained for compatibility; every workflow below targets Codex.

## Mode detection

- no argument or \`internal\`: document the local installation.
- \`external\`: document Codex architecture and current behavior from official sources.
- \`research <query>\`: research one Codex topic.

## Internal mode

1. Inventory \`~/.codex/config.toml\`, personal and project \`AGENTS.md\`, project \`.codex/\`, installed skills, TOML agents, plugins, hooks, MCP servers, and memory metadata without mutation.
2. Use \`codex plugin list --json\`, \`codex plugin marketplace list --json\`, and \`codex mcp list\` for managed state.
3. Redact tokens, credentials, host secrets, and private file contents.
4. Write the dated report under the user-selected project \`.codex/brewdoc/my-claude/\` directory and update its JSONL index.

## External mode

Use current official OpenAI Codex documentation and installed CLI help. Cover configuration layers, AGENTS.md scope, skills, agents, plugins, hooks, MCP, sandboxing, and trust. Cite sources and distinguish verified facts from inference.

## Research mode

Search current official sources first, collect concise evidence, answer the query, list sources, and add a review verdict. Never modify the installation during research.`,
    'brewdoc/publish': `# Offline publish preview

This Codex variant is explicit-only and mock-only. Never call brewpage.app, upload content, request a password, save a token, or create a public URL.

## Parse and classify

1. Parse the requested text, Markdown, file, directory, or local site and optional TTL.
2. Detect the content type and enumerate included files without following links outside the selected root.

## Preflight

3. Show preflight statistics: file count, total bytes, excluded files, and validation warnings.
4. Use a user-provided namespace only as a local manifest label; do not reserve it remotely.

## Build the mock artifact

5. Build a deterministic preview manifest with relative paths, byte sizes, SHA256 hashes, media types, TTL, and generation timestamp.
6. Write preview artifacts only to the user-selected local directory and only after confirmation.

## Report

7. Report \`mock: true\`, the manifest path, and that no network publication, credential handling, or URL creation occurred.

If the user requests real publishing, stop and explain that this package intentionally provides offline preview only.`,
    'brewtools/deploy': `# Deployment workflow

Inspect the repository's documented deployment target and existing CI before proposing changes. Pin dependencies, preserve safety gates, use mocks for smoke tests, and require explicit authorization for release, push, infrastructure mutation, or production traffic. Keep any Codex agent definitions as TOML under \`.codex/agents/\`.`,
    'brewtools/manager-setup': `# Ambient manager prompt mode

This skill configures ambient prompt guidance only. It does not create, claim, or enforce a hard security wall.

## Intent and scope

Resolve exactly one canonical mode -- \`status\`, \`install\`, \`upgrade\`, \`enable\`, \`disable\`, \`uninstall\`, \`purge\` -- plus the extras \`level\` and \`edit\`, then choose project state at \`.codex/brewtools/manager/state.json\` or personal prompt overrides under \`~/.codex/manager/\`. Obtain confirmation before global writes. With no mode given, resolve \`status\` when state already exists and \`install\` otherwise. \`on\`, \`off\`, \`setup\`, \`remove\`, \`reset\`, \`create\`, \`update\` and \`cleanup\` are not modes: read them as the canonical verb, echo the canonical name back, and never print a retired alias as a command.

## Modes

| Mode | Effect |
|------|--------|
| \`status\` | Show hook registration, state source, level, override paths, and the no-security-wall limitation. Writes nothing, asks nothing. |
| \`install\` | Register the \`SessionStart\` and \`UserPromptSubmit\` handlers for this project and arm ambient prompt state. Idempotent: a second run leaves exactly one entry per event. |
| \`upgrade\` | Re-register the handlers from the current plugin version and restamp the version recorded in state, keeping the armed flag, the level and every override verbatim. It asks nothing, and it is the only thing that clears a stale version report. |
| \`enable\` | Arm ambient prompt state only. With nothing registered there is no handler to arm, so report not-installed and route the user to \`install\`. |
| \`disable\` | Disarm ambient prompt state only. Never touches registration: the handlers stay registered and no-op while disarmed. |
| \`uninstall\` | Deregister the handlers. State and prompt overrides are KEPT, so a later \`install\` returns to the same level and the same customized text. |
| \`purge\` | \`uninstall\` plus deletion of \`.codex/brewtools/manager/\` and, in personal scope, the personal prompt override. The only destructive mode: state exactly what will be deleted before running it. |
| \`level\` | Set balanced or strict prompt wording. State only; it does not change sandbox or authorization. |
| \`edit\` | Update or remove prompt overrides after showing the diff. Changes injected text only, never registration or arm state. |

## Behavior

- \`++m\`: manager guidance, using the plan-aware reference in plan mode.
- \`++a\`: architecture-first guidance.
- \`++rr\`: anti-regression review guidance.
- \`++r\`: two-pass review guidance.

The codewords are hook-driven: they fire on every prompt regardless of the mode state above. \`status\` explains them and \`edit\` customizes their text; no mode turns them off.

The plugin uses \`SessionStart\` and \`UserPromptSubmit\` hooks. Preserve unrelated hook entries and review changed definitions with \`/hooks\`.`,
    'brewtools/plugin-update': `# Codex plugin maintenance

Use native Codex plugin CLI only; never edit caches or configuration files directly.

## Discovery and status

1. Read configured marketplaces with \`codex plugin marketplace list --json\`.
2. Read installed and available plugins with \`codex plugin list --json\`.
3. Build a table containing plugin id, marketplace, installed version, enabled state, and exact target version from a trusted manifest.

## Install, update, and migration

1. Validate the target marketplace and package manifests before mutation.
2. Snapshot plugin id, version, enabled state, managed agent files, and whether the marketplace is configured.
3. Use \`codex plugin marketplace add <repository-root>\`, \`codex plugin remove <plugin-id>\`, and \`codex plugin add <plugin>@<marketplace>\` only.
4. For this repository run \`node .codex/scripts/install-update.mjs migrate\`; it moves known remote 4.0.5 installs to the exact local manifests in one rollback-protected transaction.
5. On any failure, restore every prior plugin id and verify version/enabled state, restore managed agents, and remove a newly added marketplace.
6. Re-run \`codex plugin list --json\`, validators, and hook fixtures; tell the user to review hook definitions and start a fresh session.

Do not prune stale caches. Cleanup is a separate operation requiring explicit authorization.`,
    'brewtools/provider-switch': `# Codex provider switch

Use only when explicitly invoked.

## P0-P2: language, mode, and status

1. Select language and parse \`status\`, \`configure\`, \`help\`, \`verify\`, \`model-check\`, or maintainer-only \`update\`.
2. Run \`scripts/check-status.sh\` and inspect the active \`~/.codex/config.toml\` without printing secret values.

## P3-P4: provider selection and configuration

3. For configuration, load the matching provider reference, verify current official documentation, select an exact model id, and obtain the API key through an environment variable or approved secret store.
4. Show the exact \`model_providers\` TOML diff and obtain confirmation before writing global configuration. Do not create shell aliases.

## P5-P8: verify, help, and model check

5. Run \`scripts/verify-providers.sh\` in read-only or mock mode; perform a live request only with explicit authorization.
6. \`help\` explains activation through Codex configuration; \`model-check\` asks the five documented diagnostic questions and returns evidence-based confidence.

## P9: maintainer update

7. Maintainer \`update\` compares all provider references with current official sources, shows a diff, applies approved pinned identifiers, and repeats mock verification.

Never write provider secrets into a repository or modify unrelated runtime configuration.`,
    'brewtools/secrets-scan': `# Secret scanning

Scan only files in scope with existing repository tools or a pinned scanner, and never print full secret values. Report file, line, secret class, and remediation; distinguish tracked files from ignored local configuration. Do not rotate, revoke, commit, or publish anything without explicit authorization.`,
    'brewtools/ssh': `# SSH administration

Inspect connection targets and the requested operation before connecting. Default to read-only diagnostics, redact credentials, and require explicit confirmation for remote mutation, restart, deployment, firewall changes, or destructive commands. Persist optional Codex agents only as supported TOML files under \`.codex/agents/\`.`,
    'brewtools/task-board-setup': `# Codex task-board initializer

Create exactly one Codex-owned file board; never create or mirror it under another assistant namespace.

## Modes

Resolve exactly one canonical mode from \`status\`, \`install\`, \`upgrade\`, \`enable\`, \`disable\`, \`uninstall\`, \`purge\` -- a standalone token only, never a word that merely appears inside a sentence. With no mode given, a deployed board (\`.codex/features/board.md\` exists) resolves to \`status\` and an empty target resolves to \`install\`. \`init\`, \`on\`, \`off\`, \`setup\`, \`remove\`, \`reset\`, \`create\`, \`update\` and \`cleanup\` are not modes: read them as the canonical verb, echo the canonical name back, and never print a retired alias as a command.

| Mode | Effect |
|------|--------|
| \`status\` | Read-only inventory of the target board. Writes nothing, delegates nothing, asks nothing. A parked \`.disabled\` twin is reported as parked, never as missing. |
| \`install\` | Run the phases below and deploy the board into the resolved target. |
| \`upgrade\` | Retrofit onto an already deployed board instead of the fresh-init phases. Recover the existing findings from the deployed artifacts rather than re-deriving them, ask for anything unrecoverable, write new files outright, and gate every edit of an existing file behind its own diff and confirmation. Never renumber and never delete. The metadata restamp is ungated and always runs -- it is the only thing that clears a stale version report. |
| \`enable\` | Restore parked machinery by renaming each \`.disabled\` twin back to the filename discovery keys on. Writes no content. |
| \`disable\` | Park the machinery by renaming the task-tracker agent, the \`task-board\` and \`task-spec\` skills and the task rule to \`.disabled\`. Bodies are untouched and every task is kept. |
| \`uninstall\` | Remove the generated agent, skills and rule plus any \`.disabled\` twin of them. \`.codex/features/**\` is KEPT: the generated pieces are machinery, the board is the user's data. |
| \`purge\` | \`uninstall\` plus deletion of \`.codex/features/**\`. Confirm first, stating the task counts that will be destroyed, and offer \`uninstall\` as the alternative that keeps them. |

\`status\`, \`enable\`, \`disable\`, \`uninstall\` and \`purge\` replace the phases below; run the \`status\` inventory afterwards as the proof. Optimization of \`AGENTS.md\` is never reverted by any mode -- say so in the report and point at version history.

## P0: resolve target and directive

1. Resolve the target repository, language, release marker style, exclusions, and whether optional AGENTS.md optimization is requested.

## P1: analyze the repository

2. Analyze repository domains, documentation, release conventions, and current task artifacts using bounded Codex collaboration when explicitly authorized.

## P2-P4: generate native board components

3. Generate a native task-tracker TOML at \`.codex/agents/task-tracker.toml\` from the Codex template in \`references/02-task-tracker-agent.md\`.
4. Generate the task-board skill at \`.codex/skills/task-board/SKILL.md\` from \`references/03-task-board-skill.md\`.
5. Create the single canonical board under \`.codex/features/\`: \`board.md\`, \`INDEX.md\`, \`TRACKER.md\`, \`TASK_TEMPLATE.md\`, and \`backlog/\`, \`todo/\`, \`progress/\`, \`closed/\`, \`specs/\`.
6. Add Codex task rules under \`.codex/rules/\` only if that rule layer is active in the target repository. Sweep documentation links without creating duplicate boards.

## P5: verify and report

7. Verify paths, TOML, skill frontmatter, folder/status invariants, board counts, link integrity, and idempotence.

## P5.5: optional AGENTS.md optimization

8. Optimize \`AGENTS.md\` only behind the separate explicit gate and preserve project-specific constraints.

Do not create a migration-card file automatically and do not create a duplicate board under another assistant namespace.`,
    'brewtools/text-human': `# Humanize text

Edit the supplied text or repository artifact in place only when authorized. Preserve technical meaning, identifiers, citations, and house style while removing repetitive phrasing, filler, and synthetic narration. Return a focused diff and do not delegate unless explicitly requested.`,
    'brewtools/text-optimize': `# Optimize text for tokens

Compress the requested text while preserving every load-bearing constraint, identifier, example, and safety rule. Measure before and after size, explain material removals, and write only to the requested Codex-owned artifact path. Do not create Markdown agent definitions or unsupported agent calls.`,
    'brewtools/think-short-setup': `# Think-short hooks

## Resolve intent and target

1. Resolve exactly one canonical mode from \`status\`, \`install\`, \`upgrade\`, \`enable\`, \`disable\`, \`uninstall\`, \`purge\`, then project or personal scope. Show the exact target before mutation. With no mode given, resolve \`status\` when the assets are already present and \`install\` otherwise. \`on\`, \`off\`, \`setup\`, \`remove\`, \`reset\`, \`create\`, \`update\` and \`cleanup\` are not modes: read them as the canonical verb and echo the canonical name back.

## Modes

| Mode | Effect |
|------|--------|
| \`status\` | Report scope, registered entries, copied asset paths and their recorded version. Writes nothing. |
| \`install\` | Copy the two native scripts and the prompt described by \`assets/INSTALL.md\`, merge \`SessionStart\` and \`UserPromptSubmit\` entries by exact command string, and preserve unrelated hooks. |
| \`upgrade\` | Re-copy the same assets from the current plugin version and re-register any entry that went missing, restamping the recorded version. Keeps the parked-or-active state as it was. |
| \`enable\` | Restore parked assets by renaming each \`.disabled\` twin back to the filename the handler resolves. |
| \`disable\` | Park the copied assets by renaming them \`.disabled\`, leaving the bodies byte-identical, so the registered handlers no-op. |
| \`uninstall\` | Delete only the matching command entries and the three copied assets, plus any \`.disabled\` twin of them; remove empty directories only when owned by this workflow. |
| \`purge\` | \`uninstall\` plus removal of the workflow's own directory and any personal-scope override. State what will be deleted first. |

## Verify and report

2. Validate JSON, run both hook scripts with valid and malformed fixtures, and confirm a repeated \`install\`, \`upgrade\` or \`uninstall\` is idempotent.
3. Report the changed paths and require review through \`/hooks\`.

Handlers use one command string, timeout values in seconds, and no matcher for \`UserPromptSubmit\`. This Codex variant does not install a sub-agent prompt-rewrite hook.`
  };
  const body = bodies[`${plugin}/${skill}`];
  return body ? skillDocument(skill, description, body) : null;
}

function openAiYaml(plugin, skill, description) {
  const display = (skill === 'my-claude' ? 'my-codex' : skill).split('-').map(part => part[0].toUpperCase() + part.slice(1)).join(' ');
  const specialShort = {
    'brewcode/rules': 'Project rules and AGENTS.md index; user invoked',
    'brewtools/manager-setup': 'Manager prompt modes; user invoked',
    'brewtools/task-board-setup': 'Codex task-board setup; user invoked',
    'brewtools/think-short-setup': 'Terse-mode hook setup; user invoked'
  }[`${plugin}/${skill}`];
  const short = (specialShort || description).replace(/\s+/g, ' ').slice(0, 64).replace(/[ .,:;-]+$/, '');
  const implicit = !EXPLICIT_ONLY.has(`${plugin}/${skill}`);
  const defaultPrompt = {
    'brewcode/rules': 'Use $brewcode:rules to maintain project rules and the AGENTS.md rule index.',
    'brewtools/manager-setup': 'Use $brewtools:manager-setup only when the user explicitly requests Manager configuration.',
    'brewtools/task-board-setup': 'Use $brewtools:task-board-setup only when the user explicitly requests board setup.',
    'brewtools/think-short-setup': 'Use $brewtools:think-short-setup only when the user explicitly requests terse-hook setup.'
  }[`${plugin}/${skill}`] || `Use $${plugin}:${skill} for this task.`;
  return `interface:\n  display_name: ${JSON.stringify(display)}\n  short_description: ${JSON.stringify(short.length >= 25 ? short : `${short} workflow`)}\n  default_prompt: ${JSON.stringify(defaultPrompt)}\npolicy:\n  allow_implicit_invocation: ${implicit}\n`;
}

function copySelected(source, target) {
  const data = fs.readFileSync(source);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (data.includes(0)) fs.writeFileSync(target, data);
  else fs.writeFileSync(target, nativeWorkflowText(data.toString('utf8')), 'utf8');
  fs.chmodSync(target, fs.statSync(source).mode & 0o777);
}

function walkFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(file));
    else files.push(file);
  }
  return files;
}

function generateSpecialResources(plugin, skill, sourceDir, targetDir) {
  if (plugin === 'brewcode' && skill === 'rules') {
    writeFile(path.join(targetDir, 'README.md'), `# Rules for Codex

Maintains project rule bodies under \`.codex/rules/\` and a compact discovery table in the applicable \`AGENTS.md\`. The workflow runs directly without a dedicated organizer agent, invokes \`$brewtools:text-optimize -l\` for changed rule and index files, and validates that every project rule appears exactly once in the root index.
`);
  }

  if (plugin === 'brewcode' && skill === 'convention') {
    writeFile(path.join(targetDir, 'README.md'), `# Convention for Codex

Extracts evidence-backed project conventions from representative code and tests. When accepted conventions become durable rules, apply them directly under \`.codex/rules/\`, update the \`AGENTS.md\` rule index, and optimize the changed text through \`$brewtools:text-optimize -l\`.
`);
    writeFile(path.join(targetDir, 'references', 'rules-guide.md'), `# Direct rule extraction

1. Extract durable avoid and best-practice candidates from accepted convention evidence.
2. Read all existing \`.codex/rules/*.md\` files and the applicable \`AGENTS.md\` files.
3. Skip semantic duplicates, merge partial overlaps, and keep the higher-priority instruction when guidance conflicts.
4. Apply accepted English rule text directly to the narrowest existing rule file.
5. Update the root \`AGENTS.md\` index with columns \`Rule\`, \`Load when\`, and \`Purpose\`.
6. Invoke \`$brewtools:text-optimize -l\` for each changed rule and index file, compare semantics, then validate the full inventory.
`);
  }

  if (plugin === 'brewdoc' && skill === 'md-to-pdf') {
    writeFile(path.join(targetDir, 'scripts', 'check_deps.sh'), `#!/usr/bin/env bash
set -euo pipefail

REPORTLAB_VERSION=4.4.10
WEASYPRINT_VERSION=68.1
MARKDOWN_VERSION=3.10.2
PYGMENTS_VERSION=2.19.2
PANGO_VERSION=1.57.1
CAIRO_VERSION=1.18.4
GDK_PIXBUF_VERSION=2.44.6
LIBFFI_VERSION=3.6.0

usage() { echo "usage: check_deps.sh <check|install|status> [reportlab|weasyprint]"; }
python_version() { python3 -c 'import sys; raise SystemExit(sys.version_info < (3, 8))'; }
package_version() { python3 -c 'from importlib.metadata import version; print(version("'"$1"'"))' 2>/dev/null; }
check_package() { test "$(package_version "$1")" = "$2"; }
brew_version() { brew list --versions "$1" 2>/dev/null | awk '{print $NF}'; }
check_formula() { test "$(brew_version "$1")" = "$2"; }

check_engine() {
  local engine="$1"
  command -v python3 >/dev/null && python_version || { echo "MISSING_PYTHON|requires Python >=3.8"; return 1; }
  case "$engine" in
    reportlab)
      check_package reportlab "$REPORTLAB_VERSION" || { echo "MISSING_OR_WRONG_PIP|reportlab==$REPORTLAB_VERSION"; return 1; }
      ;;
    weasyprint)
      check_package weasyprint "$WEASYPRINT_VERSION" || { echo "MISSING_OR_WRONG_PIP|weasyprint==$WEASYPRINT_VERSION"; return 1; }
      check_package markdown "$MARKDOWN_VERSION" || { echo "MISSING_OR_WRONG_PIP|markdown==$MARKDOWN_VERSION"; return 1; }
      check_package pygments "$PYGMENTS_VERSION" || { echo "MISSING_OR_WRONG_PIP|pygments==$PYGMENTS_VERSION"; return 1; }
      if test "$(uname -s)" = Darwin; then
        check_formula pango "$PANGO_VERSION" || { echo "MISSING_OR_WRONG_SYSTEM|pango==$PANGO_VERSION"; return 1; }
        check_formula cairo "$CAIRO_VERSION" || { echo "MISSING_OR_WRONG_SYSTEM|cairo==$CAIRO_VERSION"; return 1; }
        check_formula gdk-pixbuf "$GDK_PIXBUF_VERSION" || { echo "MISSING_OR_WRONG_SYSTEM|gdk-pixbuf==$GDK_PIXBUF_VERSION"; return 1; }
        check_formula libffi "$LIBFFI_VERSION" || { echo "MISSING_OR_WRONG_SYSTEM|libffi==$LIBFFI_VERSION"; return 1; }
      fi
      ;;
    *) usage >&2; return 2 ;;
  esac
  echo OK
}

install_engine() {
  local engine="$1"
  command -v python3 >/dev/null || { echo "Python >=3.8 is required" >&2; return 1; }
  case "$engine" in
    reportlab)
      python3 -m pip install "reportlab==$REPORTLAB_VERSION"
      ;;
    weasyprint)
      if test "$(uname -s)" = Darwin; then
        for pin in "pango==$PANGO_VERSION" "cairo==$CAIRO_VERSION" "gdk-pixbuf==$GDK_PIXBUF_VERSION" "libffi==$LIBFFI_VERSION"; do
          formula="\${pin%%==*}"; version="\${pin##*==}"
          check_formula "$formula" "$version" || { echo "Install exact system dependency $pin through an approved pinned package source, then retry." >&2; return 1; }
        done
      fi
      python3 -m pip install "weasyprint==$WEASYPRINT_VERSION" "markdown==$MARKDOWN_VERSION" "pygments==$PYGMENTS_VERSION"
      ;;
    *) usage >&2; return 2 ;;
  esac
  check_engine "$engine"
}

command="\${1:-}"; engine="\${2:-}"
case "$command" in
  check) test -n "$engine" || { usage >&2; exit 2; }; check_engine "$engine" ;;
  install) test -n "$engine" || { usage >&2; exit 2; }; install_engine "$engine" ;;
  status) check_engine reportlab || true; check_engine weasyprint || true ;;
  help|-h|--help) usage ;;
  *) usage >&2; exit 2 ;;
esac
`, 0o755);
    const replacements = new Map([
      ['pip install reportlab', 'python3 -m pip install reportlab==4.4.10'],
      ['pip install weasyprint markdown pygments', 'python3 -m pip install weasyprint==68.1 markdown==3.10.2 pygments==2.19.2'],
      ['pip3 install reportlab', 'python3 -m pip install reportlab==4.4.10'],
      ['pip3 install weasyprint markdown pygments', 'python3 -m pip install weasyprint==68.1 markdown==3.10.2 pygments==2.19.2']
    ]);
    for (const relative of ['SKILL.md', 'README.md', 'scripts/md_to_pdf.py']) {
      const file = path.join(targetDir, relative);
      let value = fs.readFileSync(file, 'utf8');
      for (const [from, to] of replacements) value = value.replaceAll(from, to);
      fs.writeFileSync(file, value, 'utf8');
    }
  }

  if (plugin === 'brewtools' && skill === 'manager-setup') {
    fs.rmSync(path.join(targetDir, 'references', 'hard.md'), { force: true });
    fs.rmSync(path.join(targetDir, 'references', 'intent-routing.md'), { force: true });
    writeFile(path.join(targetDir, 'README.md'), '# Manager for Codex\n\nAmbient manager, architecture, and review prompt guidance. This variant provides no hard security wall and no parent-only enforcement.\n');
    const managerFull = `# [ROLE: MANAGER]

The user's ++M codeword authorizes foreground delegation for this task. Orchestrate the work to a verified outcome while preserving repository instructions, user scope, unrelated changes, and external safety gates.

1. Inspect the applicable AGENTS.md files, current task state, and the minimum repository evidence needed to understand the request.
2. Use update_plan for the session execution plan. If the project requires a durable board, synchronize it through its task-tracker workflow before implementation and again at completion.
3. Map dependencies and split only independent, bounded workstreams. One agent = one bounded unit (one deliverable, ~5 files, ~10 steps); anything larger is split into N tasks and fanned out. A big task handed to one agent is an agent gone for an hour: you cannot observe it, cannot correct it, and it usually drifts off-target. Parallelize useful read-only or non-overlapping work; keep dependent work sequential. Widest fan-out: a dependency must be a REAL data handoff, else parallel. Size a unit to ~<=20 min of agent work; longer -> split again.
4. When delegation is useful, select the matching project expert from .codex/agents before built-in or global agents. If the collaboration surface cannot select a custom type, name the expert explicitly and include its developer instructions in the brief without claiming the type was instantiated.
5. Use spawn_agent, send_message, followup_task, and wait_agent for foreground collaboration. Give each agent the goal it serves, concrete scope with explicit out-of-bounds, the context it needs (what is already done and what runs in parallel, trimmed to that agent), who consumes its result and in what shape, expected evidence, allowed mutation surface, and validation duties. Every code or test brief must make the agent ${ETALON_BRIEF}.
6. Review every delegated result before using it. Reconcile conflicts against authoritative project files and run validation proportional to risk.
7. Once ALL code is written (not per-piece), file one recommended final task: simplify the whole written code and strip over-engineering. Delegate it like any other task.
8. Lead the final handoff with the outcome, changed surfaces, exact validation, and any genuine remaining risk.

Branch: work in the current branch; none chosen -> main. Unless the user says branch/PR, stay on main and take over ALL workspace changes, incl. from other sessions.`;
    const managerPlan = `${managerFull}

# [ADDON: PLAN MODE]

Stay read-only. Explore enough to remove implementation ambiguity, but do not edit files, install packages, change configuration, or trigger external side effects.

Produce a complete English implementation plan covering scope, non-goals, current behavior, target behavior, affected files, ordered steps, agent ownership, tests, validation, rollout or migration, rollback where relevant, and explicit unresolved decisions. Ask only questions whose answers materially change the plan.

The future implementation prompt must begin with Step 0: re-assume [ROLE: MANAGER], re-read applicable AGENTS.md files, synchronize the required task board, instantiate the plan with update_plan, and route bounded work to project experts before implementation.`;
    const prompts = {
      'full.md': managerFull,
      'planmode.md': managerPlan,
      'architect.md': `Start from system boundaries, data flow, ownership, failure modes, and compatibility constraints before choosing an implementation. ${ETALON_ARCHITECT}`,
      'review-regression.md': 'Before the review proper, pass the code for simplification: over-engineered? simpler? Then review for behavioral regressions first. Compare old and new contracts, exercise negative paths, and require evidence for compatibility claims.',
      'review-double.md': 'Before the review proper, pass the code for simplification: over-engineered? simpler? Then perform two passes: first correctness and safety, then maintainability, clarity, and missing validation. Keep findings evidence-based.'
    };
    for (const [name, content] of Object.entries(prompts)) {
      writeFile(path.join(targetDir, 'references', name), `${content}\n`);
    }
  }

  if (plugin === 'brewtools' && skill === 'think-short-setup') {
    fs.rmSync(path.join(targetDir, 'assets', 'think-short-task.mjs'), { force: true });
    fs.rmSync(path.join(targetDir, 'tests'), { recursive: true, force: true });
    writeFile(path.join(targetDir, 'README.md'), '# Think-short for Codex\n\nInstalls or removes the native SessionStart and UserPromptSubmit terse-mode hooks described in assets/INSTALL.md.\n');
    for (const name of ['think-short-session.mjs', 'think-short-prompt-counter.mjs']) {
      copySelected(path.join(sourceDir, 'assets', name), path.join(targetDir, 'assets', name));
    }
    const counterPath = path.join(targetDir, 'assets', 'think-short-prompt-counter.mjs');
    fs.writeFileSync(counterPath, fs.readFileSync(counterPath, 'utf8').replace('const INTERVAL = 10;', 'const INTERVAL = 5;'), 'utf8');
    // The prompt body is rewritten by hand here, so carry the source's release stamp across
    // or the mirror silently ships an unstamped copy of a stamped asset.
    const promptMeta = fs.readFileSync(path.join(sourceDir, 'assets', 'think-short-prompt.md'), 'utf8')
      .match(/brewcode-meta: version=[0-9]+\.[0-9]+\.[0-9]+ generated_by=\S+/);
    const promptMarker = promptMeta ? `<!-- think-short ${promptMeta[0]} -->` : '<!-- think-short -->';
    writeFile(path.join(targetDir, 'assets', 'think-short-prompt.md'), `${promptMarker}
Be terse. Lead with results. Use ASCII unless the requested artifact requires other text.
Think short: keep internal reasoning minimal and do not narrate exploration.
Search before opening large files. Prefer focused edits and parallel read-only checks.
Plan the complete edit set, then execute it. Before writing anything new, ${ETALON_TERSE}.
After writing code, make one pass for simplification: if it can be simpler, simplify it.
Keep comments only for non-obvious decisions and public contracts.
`);
    writeFile(path.join(targetDir, 'assets', 'INSTALL.md'), `# Codex think-short hook runbook

Copy the two scripts and prompt from this directory into the selected hook directory. The prompt counter injects on every fifth user prompt.

- Project target: \`<project-root>/.codex/hooks/think-short/\`; merge into \`<project-root>/.codex/hooks.json\`.
- Personal target: \`~/.codex/hooks/think-short/\`; merge only after explicit approval.

Register \`SessionStart\` with matcher \`startup|resume|clear|compact\`. Register \`UserPromptSubmit\` without a matcher. Each handler contains one command string such as \`node "<absolute-hook-directory>/<script>.mjs"\` and \`timeout: 2\` seconds. Merge without replacing unrelated hooks and deduplicate by command string.

After a change, review the exact hook definition with \`/hooks\`. Removal deletes only entries that reference these two script names and then removes the copied assets.
`);
  }

  if (plugin === 'brewtools' && skill === 'plugin-update') {
    writeFile(path.join(targetDir, 'scripts', 'discover-plugins.sh'), `#!/usr/bin/env bash
set -euo pipefail
codex plugin marketplace list --json >/dev/null
codex plugin list --json
`, 0o755);
    writeFile(path.join(targetDir, 'scripts', 'fetch-latest-versions.sh'), `#!/usr/bin/env bash
set -euo pipefail
root="\${1:-$(pwd)}"
node - "$root" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
const result = {};
for (const name of ['brewcode', 'brewdoc', 'brewtools']) {
  const file = path.join(root, name, '.codex', 'package', 'plugin.json');
  result[name] = JSON.parse(fs.readFileSync(file, 'utf8')).version;
}
process.stdout.write(JSON.stringify(result));
NODE
`, 0o755);
    const references = {
      'autoupdate-research.md': '# Update policy\n\nCodex plugin updates are explicit transactions. Do not enable background mutation or cache pruning. Compare exact manifest versions and preserve rollback evidence.\n',
      'discovery.md': '# Discovery\n\nUse `codex plugin marketplace list --json` and `codex plugin list --json`. Treat those CLI results as the source of installed id, version, marketplace, and enabled state.\n',
      'install-prompt.md': '# Install confirmation\n\nShow exact plugin ids, target versions, marketplace changes, agent paths, and rollback plan before requesting confirmation.\n',
      'reload-notice.md': '# Reload notice\n\nAfter a successful transaction, review hook definitions with `/hooks` and start a fresh Codex session.\n',
      'update-commands.md': '# Native commands\n\nUse only `codex plugin marketplace add`, `codex plugin marketplace list`, `codex plugin add`, `codex plugin remove`, and `codex plugin list`.\n',
      'update-prompt.md': '# Update confirmation\n\nShow current and target id/version/enabled state plus the exact rollback snapshot. No mutation occurs before confirmation.\n'
    };
    for (const [name, content] of Object.entries(references)) writeFile(path.join(targetDir, 'references', name), content);
    writeFile(path.join(targetDir, 'README.md'), '# Codex plugin update\n\nDiscovers and migrates plugins through the native CLI with exact-version validation and transactional rollback. It never edits plugin caches.\n');
  }

  if (plugin === 'brewtools' && skill === 'provider-switch') {
    fs.rmSync(path.join(targetDir, 'scripts', 'write-alias.sh'), { force: true });
    writeFile(path.join(targetDir, 'scripts', 'write-provider-config.sh'), `#!/usr/bin/env bash
set -euo pipefail
candidate="\${1:-}"
test -f "$candidate" || { echo "usage: write-provider-config.sh <candidate-config.toml>" >&2; exit 2; }
python3 - "$candidate" <<'PY'
import pathlib, sys, tomllib
data = tomllib.loads(pathlib.Path(sys.argv[1]).read_text())
if not isinstance(data.get("model_providers"), dict):
    raise SystemExit("candidate must contain [model_providers]")
print("candidate provider configuration is valid TOML")
PY
echo "Validation only: apply the reviewed TOML diff through the approved Codex configuration workflow."
`, 0o755);
    writeFile(path.join(targetDir, 'README.md'), '# Provider switch for Codex\n\nBuilds and validates pinned `model_providers` configuration. It does not create shell aliases or store secrets in repository files.\n');
    const providerReferences = {
      'common.md': '# Codex provider configuration\n\nUse `[model_providers.<name>]` in `~/.codex/config.toml` with an official base URL, environment-backed credential key, supported wire API, and exact model id. Show the TOML diff and obtain confirmation before writing. Never create aliases or persist secret values.\n',
      'deepseek.md': '# DeepSeek\n\nVerify the current official OpenAI-compatible endpoint and exact DeepSeek model id before creating a Codex `model_providers.deepseek` entry. Read credentials from `DEEPSEEK_API_KEY`; default verification is mocked.\n',
      'minimax.md': '# MiniMax\n\nVerify the current official OpenAI-compatible endpoint and exact MiniMax model id before creating a Codex `model_providers.minimax` entry. Read credentials from `MINIMAX_API_KEY`; default verification is mocked.\n',
      'openrouter.md': '# OpenRouter\n\nUse the current official OpenRouter endpoint, `OPENROUTER_API_KEY`, and an exact selected model id in a Codex provider entry. Show cost and context metadata before selection and default verification to a mock.\n',
      'openrouter-models.md': '# OpenRouter model selection\n\nRecord the exact provider/model id, context limit, pricing timestamp, and official source URL. Do not use floating aliases.\n',
      'qwen-dashscope.md': '# Qwen DashScope\n\nVerify the current official OpenAI-compatible DashScope endpoint and exact Qwen model id before creating a Codex provider entry. Read credentials from `DASHSCOPE_API_KEY`.\n',
      'zai-glm.md': '# Z.ai GLM\n\nVerify the current official OpenAI-compatible endpoint and exact GLM model id before creating a Codex provider entry. Read credentials from `ZAI_API_KEY`; do not carry over flags from another client.\n',
      'update-protocol.md': '# Provider reference update protocol\n\nFor each provider, consult current official documentation, capture source URL and access date, diff endpoint, model, and auth changes, request approval, update exact identifiers, and run mock verification. Live requests require separate authorization.\n'
    };
    for (const [name, content] of Object.entries(providerReferences)) writeFile(path.join(targetDir, 'references', name), content);
    writeFile(path.join(targetDir, 'scripts', 'check-status.sh'), `#!/usr/bin/env bash
set -euo pipefail
config="\${CODEX_HOME:-$HOME/.codex}/config.toml"
test -f "$config" || { echo '{"config":"missing","providers":[]}' ; exit 0; }
python3 - "$config" <<'PY'
import json, pathlib, sys, tomllib
data = tomllib.loads(pathlib.Path(sys.argv[1]).read_text())
print(json.dumps({"config": "valid", "providers": sorted((data.get("model_providers") or {}).keys())}))
PY
`, 0o755);
    writeFile(path.join(targetDir, 'scripts', 'verify-providers.sh'), `#!/usr/bin/env bash
set -euo pipefail
candidate="\${1:-\${CODEX_HOME:-$HOME/.codex}/config.toml}"
python3 - "$candidate" <<'PY'
import pathlib, sys, tomllib
data = tomllib.loads(pathlib.Path(sys.argv[1]).read_text())
for name, provider in (data.get("model_providers") or {}).items():
    if not isinstance(provider, dict) or not provider.get("base_url"):
        raise SystemExit(f"provider {name} is missing base_url")
print("provider configuration syntax verified; no live request sent")
PY
`, 0o755);
  }

  if (plugin === 'brewtools' && skill === 'task-board-setup') {
    writeFile(path.join(targetDir, 'references', '02-task-tracker-agent.md'), `# Native task-tracker agent template

Write \`TARGET/.codex/agents/task-tracker.toml\` with exactly these TOML keys:

\`name = "task-tracker"\`

\`description\` identifies board view, add, transition, close, and grooming triggers.

\`developer_instructions\` owns only \`.codex/features/**\`. It enforces folder equals status, updates \`board.md\` in the same change as every transition, keeps stable upper-kebab ids, requires a file for progress tasks, records the configured close marker, and never touches application code. It reads \`.codex/features/TRACKER.md\` and the active task rule before mutation.

Substitute the analyzed domains, exclusions, release-marker policy, and artifact language. Validate the result with Python \`tomllib\`.

\`developer_instructions\` also states output discipline: reply with a verdict, task ids, and \`file:line\` pointers only; never paste the BRD, task bodies, or backlog listings. Write bulk material to a file under \`.codex/reports/<YYYYMMDD-HHMMSS>_<name>/\` and return the path.
`);
    writeFile(path.join(targetDir, 'references', '03-task-board-skill.md'), `# Native task-board skill template

Write \`TARGET/.codex/skills/task-board/SKILL.md\` with frontmatter keys \`name\` and \`description\` only. The workflow supports view, add, move, backlog, groom, and close against the single canonical \`.codex/features/board.md\`.

Every transition moves or creates the task file, updates frontmatter, and synchronizes board tables, counts, and current focus in the same patch. Bulk work may use the native task-tracker agent through Codex collaboration with \`task_name\` and \`message\` only. Validate with the Codex skill quick validator.
`);
    writeFile(path.join(targetDir, 'README.md'), '# Codex task board initializer\n\nCreates one canonical task board under `.codex/features/`, plus a native TOML task-tracker agent and Codex skill.\n');
  }

  if (plugin === 'brewdoc' && skill === 'publish') {
    writeFile(path.join(targetDir, 'README.md'), '# Offline publish preview\n\nExplicit-only, mock-only workflow. It generates a local hash manifest and never uploads, requests credentials, or returns a public URL.\n');
  }

  if (plugin === 'brewdoc' && skill === 'my-claude') {
    const references = {
      'internal-mode.md': '# Internal mode\n\nInventory Codex configuration, scoped AGENTS.md files, project `.codex/` assets, TOML agents, skills, plugins, hooks, MCP servers, and memory metadata. Use native CLI listings, redact secrets, and make no changes.\n',
      'external-mode.md': '# External mode\n\nResearch current Codex behavior from official OpenAI documentation and installed CLI help. Cover configuration, instruction scope, skills, agents, plugins, hooks, MCP, sandboxing, and trust with citations.\n',
      'research-mode.md': '# Research mode\n\nResolve the query, search official OpenAI sources first, collect evidence, distinguish facts from inference, write a dated local report, and include direct source links.\n'
    };
    for (const [name, content] of Object.entries(references)) writeFile(path.join(targetDir, 'references', name), content);
    writeFile(path.join(targetDir, 'README.md'), '# My Codex\n\nCompatibility skill id for documenting a Codex installation in internal, external, or focused research mode. The workflow is read-only except for the requested local report.\n');
  }

  if (plugin === 'brewcode' && (skill === 'e2e' || skill === 'teams-setup')) {
    writeFile(path.join(targetDir, 'references', 'agent-template.md'), `# Native Codex agent template

Create a TOML file under \`.codex/agents/\` with \`name\`, \`description\`, and \`developer_instructions\`. The instructions define mission, domain, scope, task acceptance, self-check, and colleague handoff. Delegate through Codex collaboration with \`task_name\` and \`message\` only. Do not add Markdown frontmatter, tool allowlists, or legacy model aliases.

Every generated agent states output discipline: return only what the main session needs, a verdict or result plus \`file:line\` pointers; write bulk material such as long logs, full diffs, or long reports to a file under \`.codex/reports/<YYYYMMDD-HHMMSS>_<name>/\` and return the path instead of the content.

Agents whose domain writes code, scripts, SQL, schemas, infrastructure, or configuration also state scope fit: build for the scale and problems that exist today, not imagined load or speculative abstraction, and make one simplification pass after finishing. Those agents also state etalon-first: ${ETALON_SENTENCE}. Omit those paragraphs for research, documentation, and review-only agents.
`);
  }

  if (plugin === 'brewtools' && (skill === 'deploy' || skill === 'ssh')) {
    const sourceName = skill === 'deploy' ? 'deploy-admin-agent.md.template' : 'ssh-admin-agent.md.template';
    const targetName = skill === 'deploy' ? 'deploy-admin-agent.toml.template' : 'ssh-admin-agent.toml.template';
    fs.rmSync(path.join(targetDir, 'templates', sourceName), { force: true });
    writeFile(path.join(targetDir, 'templates', targetName), `name = "${skill === 'deploy' ? 'deploy-admin' : 'ssh-admin'}"
description = "Generated ${skill} specialist with live inventory and explicit safety gates."
developer_instructions = '''
Substitute the generated inventory and target configuration here. Classify every command as read, create, modify, service, delete, or privilege. Read-only checks may run directly; obtain explicit confirmation before remote mutation, release, service control, deletion, privilege escalation, or production traffic. Stop on target mismatch and report exact commands and evidence.
'''
`);
  }

  if (plugin === 'brewtools' && skill === 'text-optimize') {
    for (const file of walkFiles(targetDir)) {
      const data = fs.readFileSync(file);
      if (data.includes(0)) continue;
      const value = data.toString('utf8')
        .replaceAll('npm install example-lib', 'npm install example-lib@1.0.0')
        .replaceAll('npm install -g tool-name', 'npm install -g tool-name@1.0.0');
      fs.writeFileSync(file, value, 'utf8');
    }
  }
}

function generateSkill(plugin, skill) {
  const sourceDir = path.join(REPO_ROOT, plugin, 'skills', skill);
  const targetDir = path.join(REPO_ROOT, plugin, '.codex', 'skills', skill);
  const source = fs.readFileSync(path.join(sourceDir, 'SKILL.md'), 'utf8');
  const { values, body } = readFrontmatter(source);
  const description = values.description || `${skill} workflow for Codex.`;
  const nativeDescription = effectiveDescription(plugin, skill, transformText(description));
  const special = specialSkill(plugin, skill, nativeDescription);

  fs.mkdirSync(targetDir, { recursive: true });
  if (special) {
    copyTransformedTree(sourceDir, targetDir);
    const workflow = MANUAL_NATIVE_SKILLS.has(`${plugin}/${skill}`) ? '' : `
## Complete native workflow

Follow every phase below. When a phase delegates work, use Codex collaboration with only \`task_name\` and \`message\`; treat each "Codex delegation brief" block as role and message content, not executable syntax. Use \`request_user_input\` for the documented user gates. Resolve \`<skill-directory>\`, \`<plugin-root>\`, \`<project-root>\`, and \`<arguments>\` before running commands.

${nativeWorkflowText(body)}
`;
    writeFile(path.join(targetDir, 'SKILL.md'), `${special.trimEnd()}\n${workflow}`);
    generateSpecialResources(plugin, skill, sourceDir, targetDir);
  } else {
    copyTransformedTree(sourceDir, targetDir);
    const runtimeNote = `Resolve \`<skill-directory>\` to the directory containing this SKILL.md, \`<plugin-root>\` to the plugin root, \`<project-root>\` to the current repository root, and \`<arguments>\` to the invocation text before executing referenced commands. Use Codex collaboration tools for sub-agents and request user input only when a decision is genuinely blocking.\n\n`;
    writeFile(
      path.join(targetDir, 'SKILL.md'),
      `---\nname: ${skill}\ndescription: ${JSON.stringify(transformText(description))}\n---\n\n${runtimeNote}${transformText(body)}`
    );
  }
  writeFile(path.join(targetDir, 'agents', 'openai.yaml'), openAiYaml(plugin, skill, nativeDescription));
}

function generateAgent(plugin, agentName) {
  const sourceFile = path.join(REPO_ROOT, plugin, 'agents', `${agentName}.md`);
  const targetFile = path.join(REPO_ROOT, plugin, '.codex', 'agents', `${agentName}.toml`);
  const source = fs.readFileSync(sourceFile, 'utf8');
  const { values, body } = readFrontmatter(source);
  const description = transformText(values.description || `${agentName} specialist.`, { agent: true });
  const nativeInstructions = {
    'agent-creator': `Create or improve Codex custom-agent TOMLs. Use one standalone file per agent under project .codex/agents/ or personal ~/.codex/agents/. Require name, description, and developer_instructions. Use only supported optional configuration keys. Validate TOML with Python tomllib and keep the role narrow. Emit an output-discipline paragraph into every generated agent (return a verdict plus file:line pointers; write bulk material to a file and return its path), and, only for agents that write code, scripts, SQL, schemas, infrastructure, or configuration, a scope-fit paragraph plus an etalon-first line (${ETALON_SENTENCE}). Report agent paths and a validation verdict, not full agent bodies.`,
    'bash-expert': `Write and review portable shell automation. Default to strict mode, quote expansions, avoid destructive operations, keep output deterministic, and make failure states explicit. Validate syntax with bash -n and use shellcheck when available. Never expose secrets or mutate systems outside the requested scope.`,
    'hook-creator': `Create or improve Codex hooks using current official schemas. Use hooks.json or config.toml at an active .codex layer. Command handlers use one command string, timeout in seconds, and JSON stdin and stdout. Respect matcher limitations, test malformed input and timeout behavior, and explain review through /hooks after definitions change.`,
    'skill-creator': `Create or improve Codex skills. SKILL.md frontmatter contains only name and description and uses lowercase hyphen-case folders. Keep instructions concise, add agents/openai.yaml when appropriate, and colocate reusable scripts, references, and assets. Run the Codex skill quick validator and forward-test without production side effects.`,
    'deploy-admin': `Plan and execute deployment work only within explicit authorization. Inspect repository deployment documentation and CI first, pin every dependency, preserve rollback and safety gates, and default smoke tests to mocks. Do not release, push, or mutate production without confirmation.`,
    'ssh-admin': `Perform SSH diagnostics and administration conservatively. Confirm target and scope, default to read-only commands, redact credentials, and require explicit confirmation for remote mutation, service restarts, firewall changes, or destructive actions. Return commands and observed evidence.`,
    'text-optimizer': `Optimize text for clarity and token efficiency while preserving every load-bearing constraint, identifier, example, and safety rule. Match the artifact's language and house style, measure the result, and explain material removals. Write only to the requested path.`
  }[agentName];
  if (!nativeInstructions) throw new Error(`Missing native instructions for ${plugin}/${agentName}`);
  const instructions = nativeInstructions.replaceAll("'''", "' ' '").trim();
  writeFile(
    targetFile,
    `name = ${JSON.stringify(agentName)}\ndescription = ${JSON.stringify(description)}\ndeveloper_instructions = '''\n${instructions}\n'''\n`
  );
}

function buildDistribution() {
  const pluginsRoot = path.join(REPO_ROOT, '.codex', 'plugins');
  fs.rmSync(pluginsRoot, { recursive: true, force: true });
  fs.mkdirSync(pluginsRoot, { recursive: true });
  for (const plugin of Object.keys(PLUGINS)) {
    const canonical = path.join(REPO_ROOT, plugin, '.codex');
    const dist = path.join(pluginsRoot, plugin);
    fs.mkdirSync(path.join(dist, '.codex-plugin'), { recursive: true });
    fs.copyFileSync(path.join(canonical, 'package', 'plugin.json'), path.join(dist, '.codex-plugin', 'plugin.json'));
    fs.cpSync(path.join(canonical, 'skills'), path.join(dist, 'skills'), { recursive: true });
    fs.cpSync(path.join(canonical, 'hooks'), path.join(dist, 'hooks'), { recursive: true });
    const hooksFile = path.join(dist, 'hooks', 'hooks.json');
    const hooks = fs.readFileSync(hooksFile, 'utf8').replaceAll('${PLUGIN_ROOT}/.codex/hooks/', '${PLUGIN_ROOT}/hooks/');
    fs.writeFileSync(hooksFile, hooks, 'utf8');
  }
}

function main() {
  for (const [plugin, definition] of Object.entries(PLUGINS)) {
    const codexRoot = path.join(REPO_ROOT, plugin, '.codex');
    fs.rmSync(path.join(codexRoot, 'skills'), { recursive: true, force: true });
    fs.rmSync(path.join(codexRoot, 'agents'), { recursive: true, force: true });
    fs.mkdirSync(path.join(codexRoot, 'agents'), { recursive: true });
    for (const skill of definition.skills) generateSkill(plugin, skill);
    for (const agent of definition.agents) generateAgent(plugin, agent);
  }
  buildDistribution();
}

main();
