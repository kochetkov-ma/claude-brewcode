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
  'brewcode/convention', 'brewcode/rules', 'brewcode/teams-setup', 'brewtools/manager-setup', 'brewtools/task-board-setup',
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
const TEAM_AGENT_HEADINGS = [
  'Mission',
  'Owned surfaces',
  'Exclusions',
  'Must-load references',
  'Unique invariants',
  'Unique verification'
];
const TEAM_SHARED_REFERENCE = '.codex/teams/{TEAM_NAME}/team.md';

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

function isShellAsset(file) {
  return /\.(?:sh|bash)$/.test(file);
}

// Codex invokes a skill as `$plugin:skill`, so every skill reference is rewritten to that sigil.
// In a shell asset the sigil must stay LITERAL: mirrored scripts run under `set -eu`, and a
// double-quoted "... $brewcode:teams-setup ..." aborts them with `brewcode: unbound variable`.
// Emit `\$` there instead -- it prints as `$` from double-quoted, unquoted and unquoted-heredoc
// text alike. Comment lines expand nothing, so they keep the bare form.
function skillSigil(shell, text, offset) {
  if (!shell) return '$';
  const lineStart = text.lastIndexOf('\n', offset) + 1;
  return /^\s*#/.test(text.slice(lineStart, offset)) ? '$' : '\\$';
}

function transformText(value, { agent = false, shell = false } = {}) {
  let text = value
    .replaceAll('${CLAUDE_SKILL_DIR}', '<skill-directory>')
    .replaceAll('$CLAUDE_SKILL_DIR', '<skill-directory>')
    // CLAUDE_PROJECT_DIR wears two hats. Heading a PATH it stands for the repository root, and
    // `<project-root>` is the right rendering. Everywhere else it is an environment-variable NAME
    // -- a bare identifier, an object key, a `${...:-}` default -- and a prose placeholder is not
    // a name: the old blanket pass emitted `delete env.<project-root>` (SyntaxError) and
    // `${<project-root>:-}` (shellcheck SC2296). Rename those to the Codex-native identifier
    // instead, exactly as CLAUDE_CODE_SESSION_ID -> CODEX_SESSION_ID below. Path context is
    // "immediately followed by a slash"; everything else keeps its sigil and stays valid code.
    .replace(/\$\{CLAUDE_PROJECT_DIR\}(?=\/)/g, '<project-root>')
    .replace(/\$CLAUDE_PROJECT_DIR(?=\/)/g, '<project-root>')
    .replaceAll('${CLAUDE_PLUGIN_ROOT}', agent ? '{{PLUGIN_ROOT}}' : '<plugin-root>')
    .replaceAll('$CLAUDE_PLUGIN_ROOT', agent ? '{{PLUGIN_ROOT}}' : '<plugin-root>')
    .replaceAll('CLAUDE_CODE_SESSION_ID', 'CODEX_SESSION_ID')
    .replaceAll('CLAUDE_PROJECT_DIR', 'CODEX_PROJECT_DIR')
    .replaceAll('CLAUDE_SKILL_DIR', 'skill directory')
    .replaceAll('CLAUDE_PLUGIN_ROOT', agent ? '{{PLUGIN_ROOT}}' : 'plugin root')
    .replaceAll('CLAUDE.md', 'AGENTS.md')
    .replaceAll('CLAUDE.local.md', 'AGENTS.local.md')
    .replaceAll('~/.claude', '~/.codex')
    .replaceAll('.claude/', '.codex/')
    .replaceAll('.claude\\', '.codex\\')
    // Code splits the same path across arguments -- `join(root, '.claude', 'agents')` -- so the
    // separator-anchored rules above never see it. Left alone it decouples a rewritten sibling
    // from its own mkdir: the teams-setup suites built `.claude/agents` and then wrote
    // `.codex/agents/intent-guard.toml` into it (ENOENT before the first assertion). A quoted
    // bare `.claude` is always the directory name, so rewriting it is safe.
    .replace(/(['"`])\.claude\1/g, '$1.codex$1')
    .replace(/\/brew(code|doc|tools):([a-z0-9-]+)/g, (_, family, name, offset, full) => `${skillSigil(shell, full, offset)}brew${family}:${name}`)
    .replace(/Skill\(skill="([^"]+)"\)/g, (_, name, offset, full) => `${skillSigil(shell, full, offset)}${name}`)
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
// `text-optimizer` is not installed into a target repo -- it is shipped by brewtools itself and
// generated here as `.codex/agents/text-optimizer.toml`, so its bare `.md` mentions need the same
// rewrite.
const SHIPPED_AGENT_FILES = ['intent-guard', 'task-tracker', 'text-optimizer'];

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
  // `find .codex/agents -maxdepth 1 -type f -name "*.md"`: the path rewrite lands on the
  // directory, the glob keeps the Claude extension, so the mirrored count is always 0 and the
  // script reports "no domain experts" with real `.toml` agents present. Anchored on a `find`
  // name predicate on a line that also names the agents dir -- a `*.md` glob anywhere else,
  // including a `find` over docs or references, is untouched.
  text = text.replace(/^.*\.codex\/agents\b.*$/gm, line =>
    /(?:^|[\s|(])find\s/.test(line) ? line.replace(/(-i?name\s+["']?\*)\.md\b/g, '$1.toml') : line);
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
  const shell = options.shell === true;
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
    // Mirrors the `claude-md` -> `agents-md` FILENAME rename in copyTransformedTree. Without it a
    // reference outlives the file it names: `input-claude-md.md` and `07-claude-md-optimize.md`
    // are both shipped renamed and both still cited by their old name.
    .replaceAll('claude-md', 'agents-md')
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
    .replace(/Skill\s*\(\s*skill\s*=\s*["']([^"']+)["']\s*,\s*args\s*=\s*["']([^"']*)["']\s*\)/g, (_, name, args, offset, full) => `Invoke \`${skillSigil(shell, full, offset)}${name}\` with arguments \`${args}\``)
    .replace(/\bclaude\s+-p\b/g, 'codex exec')
    .replace(/\bclaude\s+--version\b/g, 'codex --version')
    .replace(/\bcodex plugin install\b/g, 'codex plugin add')
    .replace(/\bcodex plugin marketplace update\b/g, 'codex plugin marketplace upgrade')
    .replace(/\bcodex plugin update\s+([a-z0-9-]+@[a-z0-9-]+)/g, 'codex plugin remove $1 && codex plugin add $1')
    .replace(/Skill\s*\(\s*skill\s*=\s*["']([^"']+)["']\s*\)/g, (_, name, offset, full) => `${skillSigil(shell, full, offset)}${name}`);
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
      fs.writeFileSync(target, nativeWorkflowText(data.toString('utf8'), { shell: isShellAsset(target) }), 'utf8');
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

## Modes and arguments

Position 1 of the arguments is a free-form prompt (RU/EN); mode tokens are optional and may follow. Resolve the mode from that prompt: \`status\` (default, read-only inventory), \`list\`, \`create\`, \`improve\`, \`review\`. An explicit mode token wins outright; otherwise take the mode the prompt describes, and ask at most one clarifying question, only when the answer changes what gets written.

Before the first write — and before the report on a read-only run — state in one block: the input verbatim, the resolved mode and why, the scope (rule files and \`AGENTS.md\` tables in play), what will be done, and the result the user ends up with.

## Workflow

1. Read the applicable \`AGENTS.md\` files and inventory every project rule with \`rg --files .codex/rules | sort\`.
2. Resolve the request to \`status\`, create, improve, review, list, or synchronize. Persist durable repository facts only; exclude secrets, transient session state, generated reports, and duplicate instructions.
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
  else fs.writeFileSync(target, nativeWorkflowText(data.toString('utf8'), { shell: isShellAsset(target) }), 'utf8');
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

function replaceMarked(text, begin, end, replacement) {
  const start = text.indexOf(begin);
  const finish = text.indexOf(end, start + begin.length);
  if (start < 0 || finish < 0) throw new Error(`Missing generated-projection markers: ${begin} / ${end}`);
  return `${text.slice(0, start)}${replacement.trimEnd()}${text.slice(finish + end.length)}`;
}

function nativeTeamAgentValidation() {
  return `# BEGIN CLIENT AGENT VALIDATION
# Native Codex agents are TOML data, not renamed Markdown. Parse before contract validation.
check_native_agent() {
  _f="$1"
  _expected_name="$2"
  _kind="$3"
  python3 - "$_f" "$_expected_name" "$_kind" "$TEAM_NAME" <<'PY'
import pathlib
import re
import sys
import tomllib

path = pathlib.Path(sys.argv[1])
expected_name, kind, team = sys.argv[2:5]
try:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
except (OSError, UnicodeError, tomllib.TOMLDecodeError) as exc:
    print(f"  FAIL: invalid TOML: {exc}")
    raise SystemExit(1)

required = {"name", "description", "developer_instructions"}
if set(data) != required:
    print("  FAIL: TOML keys must be exactly name, description, developer_instructions")
    raise SystemExit(1)
if any(type(data[key]) is not str for key in required):
    print("  FAIL: name, description, and developer_instructions must all be strings")
    raise SystemExit(1)
if data["name"] != expected_name:
    print(f"  FAIL: TOML name {data['name']!r} must equal roster/file name {expected_name!r}")
    raise SystemExit(1)
if "\\n" in data["description"]:
    print("  FAIL: description must be one line")
    raise SystemExit(1)
if kind == "review-only":
    raise SystemExit(0)

body = data["developer_instructions"]
expected_headings = [
    "Mission", "Owned surfaces", "Exclusions", "Must-load references",
    "Unique invariants", "Unique verification",
]
actual_headings = re.findall(r"^#{1,6}[ ]+(.+)$", body, flags=re.MULTILINE)
if actual_headings != expected_headings:
    print("  FAIL: body headings must be exactly the six ordered teams-setup headings in developer_instructions")
    raise SystemExit(1)
reference = f".codex/teams/{team}/team.md"
if body.count(reference) != 1:
    print(f"  FAIL: Must-load references must name {reference} exactly once")
    raise SystemExit(1)
must_load = body.split("## Must-load references\\n", 1)[1].split("\\n## ", 1)[0]
bullets = [line for line in must_load.splitlines() if line.startswith("- ")]
if not bullets or bullets[0] != "- " + chr(96) + reference + chr(96):
    print(f"  FAIL: {reference} must be the first Must-load references bullet")
    raise SystemExit(1)
body_bytes = len(body.encode("utf-8"))
body_tokens = (len(body) + 3) // 4
if body_bytes > 3200 or body_tokens > 800:
    print(f"  FAIL: developer_instructions is {body_bytes} bytes/{body_tokens} est-tokens; ceilings are 3200 bytes and 800 ceil(chars/4) tokens")
    raise SystemExit(1)
PY
}
# END CLIENT AGENT VALIDATION`;
}

function nativeTeamFixtureBlock() {
  return [
    '// BEGIN RUNTIME AGENT FIXTURES',
    'function tomlString(value) {',
    '  return JSON.stringify(value);',
    '}',
    '',
    "function agentFile({ name = 'build-eng', body = runtimeRepresentativeBody, extraField = '' } = {}) {",
    '  return `name = ${tomlString(name)}\\ndescription = "Domain owner. Triggers: domain, review, verification."\\ndeveloper_instructions = ${tomlString(body)}\\n${extraField}`;',
    '}',
    '',
    'function intentGuardFile() {',
    '  return `name = "intent-guard"\\ndescription = "Review-only anti-drift check."\\ndeveloper_instructions = "Review only; never implement or mutate project files."\\n`;',
    '}',
    '// END RUNTIME AGENT FIXTURES',
  ].join('\n');
}

function nativeTeamSchemaFixtures() {
  return [
    '// BEGIN SOURCE FRONTMATTER BUDGET FIXTURE',
    '{',
    '  const world = makeWorld({ agentText: agentFile({ extraField: \'model = "legacy"\\n\' }) });',
    '  const result = runVerifier(world);',
    "  check('verifier.exactTomlKeys.exit', result.status, 1, 'an unsupported fourth TOML key fails');",
    "  check('verifier.exactTomlKeys.reason', result.output.includes('TOML keys must be exactly name, description, developer_instructions'), true,",
    "    'the verifier enforces the exact native schema structurally');",
    '  removeWorld(world);',
    '}',
    '',
    '{',
    "  const world = makeWorld({ agentText: '---\\nname: build-eng\\n---\\n' });",
    '  const result = runVerifier(world);',
    "  check('verifier.renamedMarkdown.exit', result.status, 1, 'renamed Markdown is not accepted as TOML');",
    "  check('verifier.renamedMarkdown.reason', result.output.includes('invalid TOML'), true,",
    "    'the verifier parses the native fixture instead of scanning YAML text');",
    '  removeWorld(world);',
    '}',
    '// END SOURCE FRONTMATTER BUDGET FIXTURE',
  ].join('\n');
}

function nativeLifecycleAgentFixture() {
  return [
    "const DOMAIN_INSTRUCTIONS = '## Mission\\nOwn fixture behavior.\\n\\n## Owned surfaces\\nFixture files.\\n\\n## Exclusions\\nNo neighboring work.\\n\\n## Must-load references\\n- `.codex/teams/t1/team.md`\\n\\n## Unique invariants\\nPreserve bytes.\\n\\n## Unique verification\\nRun the fixture suite.\\n';",
    'const AGENT_BODY = (name) => name === \'intent-guard\'',
    '  ? `name = "intent-guard"\\ndescription = "Review-only fixture."\\ndeveloper_instructions = "Review only; never implement."\\n`',
    '  : `name = ${JSON.stringify(name)}\\ndescription = "Domain fixture agent."\\ndeveloper_instructions = ${JSON.stringify(DOMAIN_INSTRUCTIONS)}\\n`;',
  ].join('\n');
}

function nativeLifecycleTeamHelper(teamTemplate) {
  return [
    `const NATIVE_TEAM_TEMPLATE = ${JSON.stringify(teamTemplate)};`,
    "function nativeTeam(root, rows, separator = 'compact') {",
    "  const intent = rows.includes('intent-guard');",
    "  const domainRows = rows.filter((name) => name !== 'intent-guard');",
    "  const intentRow = intent ? '|intent-guard|--|Anti-drift check: what was ASKED vs what was DELIVERED|active|2026-08-27|review-only|6.1.4|' : '';",
    "  const roster = rows.map((name) => name === 'intent-guard' ? intentRow : `|${name}|api|fixture mission|active|2026-08-27|domain|6.1.4|`).join('\\n');",
    '  const rendered = `${NATIVE_TEAM_TEMPLATE',
    "    .replaceAll('{TEAM_NAME}', 't1')",
    "    .replaceAll('{DATE}', '2026-08-27')",
    "    .replaceAll('{LAST_UPDATED}', '2026-08-27')",
    "    .replaceAll('{PLUGIN_VERSION}', '6.1.4')",
    "    .replaceAll('{CONTENT_VERSION}', '6.1.0')",
    "    .replaceAll('{N}', String(domainRows.length))",
    "    .replaceAll('{CWD}', root)",
    "    .replaceAll('{INTENT_GUARD_POLICY}', intent ? 'required' : 'legacy-absent')",
    "    .replaceAll('{INTENT_GUARD_ROW}', roster)}\\n`;",
    "  const separators = { compact: '|---|---|---|---|---|---|---|', padded: '| --- | --- | --- | --- | --- | --- | --- |', none: '' };",
    "  return rendered.replace('|---|---|---|---|---|---|---|', separators[separator]);",
    '}',
  ].join('\n');
}

function rewriteNativeLifecycleSuite(value, teamTemplate) {
  const teamWriter = /writeFileSync\(\s*join\(teamDir, 'team\.md'\),[\s\S]*?\n  \);/;
  if (!teamWriter.test(value)) throw new Error('native lifecycle fixture team writer not found');
  value = value.replace(/const AGENT_BODY = \(name\) => .*?;\n/, `${nativeLifecycleAgentFixture()}\n`);
  value = value.replace('function makeProject(', `${nativeLifecycleTeamHelper(teamTemplate)}\n\nfunction makeProject(`);
  value = value.replace(teamWriter, "writeFileSync(join(teamDir, 'team.md'), nativeTeam(root, rows));");
  value = value.replace(
    /const FOREIGN_BODY = .*?;\n/,
    'const FOREIGN_BODY = `name = "worker-one"\\ndescription = "Foreign fixture."\\ndeveloper_instructions = "Foreign bytes; not team-owned."\\n`;\n'
  );
  return value;
}

function nativeIntentGuardSuite() {
  return `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');
const EMIT = join(HERE, '..', '..', 'superreview-setup', 'scripts', 'emit-intent-guard.sh');
const TEMPLATE = join(HERE, '..', '..', 'superreview-setup', 'references', 'intent-guard.toml.template');
let passed = 0;
let failed = 0;
const results = [];

function check(name, actual, expected, description) {
  if (actual === expected) {
    passed += 1;
    results.push('  PASS  ' + name + '  (' + description + ')');
  } else {
    failed += 1;
    results.push('  FAIL  ' + name + '  (' + description + ' | actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected) + ')');
  }
}

function run(root) {
  const result = spawnSync('bash', [EMIT, root], { encoding: 'utf8', timeout: 30000 });
  return { status: result.status, output: (result.stdout || '') + (result.stderr || '') };
}

function parse(path) {
  const result = spawnSync('python3', ['-c', 'import json,pathlib,sys,tomllib; print(json.dumps(tomllib.loads(pathlib.Path(sys.argv[1]).read_text()), sort_keys=True))', path], { encoding: 'utf8' });
  return { status: result.status, data: result.status === 0 ? JSON.parse(result.stdout) : null };
}

const template = parse(TEMPLATE);
check('template.parse', template.status, 0, 'shared native template is valid TOML');
check('template.keys', Object.keys(template.data).sort().join(','), 'description,developer_instructions,name', 'template has exactly three keys');
check('template.name', template.data.name, 'intent-guard', 'template name is fixed');

{
  const root = mkdtempSync(join(tmpdir(), 'native-intent-create-'));
  const result = run(root);
  const target = join(root, '.codex', 'agents', 'intent-guard.toml');
  check('create.exit', result.status, 0, 'first run succeeds');
  check('create.verdict', result.output.trim(), 'INTENT_GUARD: CREATED .codex/agents/intent-guard.toml', 'first run reports creation');
  check('create.bytes', readFileSync(target, 'utf8'), readFileSync(TEMPLATE, 'utf8'), 'created file equals shared authority byte-for-byte');
  check('create.parse', parse(target).status, 0, 'created file remains structurally valid TOML');
  rmSync(root, { recursive: true, force: true });
}

{
  const root = mkdtempSync(join(tmpdir(), 'native-intent-reuse-'));
  const agents = join(root, '.codex', 'agents');
  mkdirSync(agents, { recursive: true });
  const target = join(agents, 'intent-guard.toml');
  const foreign = 'name = "intent-guard"\\ndescription = "Foreign review-only agent."\\ndeveloper_instructions = "Review only; preserve these bytes."\\n';
  writeFileSync(target, foreign);
  const result = run(root);
  check('reuse.exit', result.status, 0, 'valid existing native agent is reused');
  check('reuse.verdict', result.output.trim(), 'INTENT_GUARD: REUSE .codex/agents/intent-guard.toml', 'reuse is explicit');
  check('reuse.bytes', readFileSync(target, 'utf8'), foreign, 'reuse preserves foreign bytes');
  rmSync(root, { recursive: true, force: true });
}

for (const [name, body, reason] of [
  ['renamedMarkdown', '---\\nname: intent-guard\\n---\\n', 'invalid TOML'],
  ['extraKey', 'name = "intent-guard"\\ndescription = "Review."\\ndeveloper_instructions = "Review."\\nmodel = "legacy"\\n', 'keys must be exactly'],
]) {
  const root = mkdtempSync(join(tmpdir(), 'native-intent-' + name + '-'));
  const agents = join(root, '.codex', 'agents');
  mkdirSync(agents, { recursive: true });
  const target = join(agents, 'intent-guard.toml');
  writeFileSync(target, body);
  const result = run(root);
  check(name + '.exit', result.status, 1, 'invalid existing artifact fails closed');
  check(name + '.reason', result.output.includes(reason), true, 'failure names the structural defect');
  check(name + '.bytes', readFileSync(target, 'utf8'), body, 'failure never overwrites existing bytes');
  rmSync(root, { recursive: true, force: true });
}

console.log('suite-intent-guard.mjs');
for (const line of results) console.log(line);
console.log('  ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
`;
}

function nativeTeamsWorkflow(sourceBody) {
  const marker = sourceBody.match(/<!-- brewcode-meta: version=[^>]+-->/)?.[0];
  if (!marker) throw new Error('teams-setup source is missing brewcode-meta marker');
  return [
    marker,
    '',
    '## Native authority',
    '',
    'Manage persistent project teams under `.codex/teams/{TEAM_NAME}/` and domain agents under `.codex/agents/`. Agent files are real TOML parsed with Python `tomllib`; never rename Markdown/YAML agents to `.toml`. Each team agent has exactly three top-level string keys: `name`, `description`, `developer_instructions`.',
    '',
    'Resolve one mode: `status`, `install`, `upgrade`, `enable`, `disable`, `uninstall`, or `purge`. Read applicable `AGENTS.md`, inspect existing teams and agents, preserve unrelated files, and use only scripts/references shipped beside this skill. Never edit installed caches.',
    '',
    '### C2.6: Shared Contract Bootstrap',
    '',
    'Bootstrap happens before any team-owned `.codex/agents/{name}.toml` is written: instantiate the fenced template from `references/framework-files.md` and write `team.md` at `.codex/teams/{TEAM_NAME}/team.md` with metadata, `## Shared Agent Contract`, explicit `Intent guard` policy, and zero domain rows. Do not add domain-agent rows yet. Copy the project-local tracer, initialize trace storage, substitute every placeholder, then run `scripts/verify-team.sh`. **STOP on any failure. Do not spawn or write an agent.**',
    '',
    '### C3: Agent Creation',
    '',
    'Create each approved domain `.codex/agents/{name}.toml` from `references/agent-template.md`. Parse it structurally with `tomllib` and require only `name`, `description`, and `developer_instructions`. The `developer_instructions` value uses exactly these ordered headings and no others: `Mission`, `Owned surfaces`, `Exclusions`, `Must-load references`, `Unique invariants`, `Unique verification`. Its first must-load item is exactly `.codex/teams/{TEAM_NAME}/team.md`, occurring once. Enforce <=3200 UTF-8 bytes and `ceil(chars/4) <=800` over `developer_instructions` itself.',
    '',
    '`intent-guard` is exempt from the six-heading domain profile. Under `required`, run `<plugin-root>/skills/superreview-setup/scripts/emit-intent-guard.sh <project-root>`; that sole shared writer create-only copies its native authority, structurally validates it, and never overwrites an existing file. Never ask agent-creator to write it. Under `legacy-absent`, create no row and no role.',
    '',
    '### C4: Roster Finalization',
    '',
    'After all intended agents validate, write the final roster. Declared `Agents` equals the number of unique domain rows; duplicate names fail. a new team defaults to `required`. Policy `required` has exactly one `intent-guard` row with fixed cells `--`, `Anti-drift check: what was ASKED vs what was DELIVERED`, `active`, team `Last update`, `review-only`, team `Version`. Policy `legacy-absent` has zero rows. the complete written `team.md` (metadata + shared contract + every row) MUST be <=2800 characters; `ceil(chars/4) <=700` estimated tokens. Measure the full substituted file, not the empty template.',
    '',
    '### C8: Fix',
    '',
    'Repair only failed owned artifacts. Domain agents come from `<skill-directory>/references/agent-template.md`; repair the shared contract before an agent rewrite. Preserve foreign agents and unrelated work. Re-run structural TOML, roster, policy, size, and shared-contract checks.',
    '',
    '### C9: Re-verify',
    '',
    'Run `scripts/verify-team.sh {TEAM_NAME}`, both test runners, and compatibility validation. Hard-gate `developer_instructions` only: <=3200 bytes and `ceil(chars/4) <=800`; `Mission`, `Owned surfaces`, `Exclusions`, `Must-load references`, `Unique invariants`, `Unique verification` in order with no other headings. `intent-guard` is exempt from this six-heading gate, not structural TOML validation.',
    '',
    '> To skip review pipeline is not an acceptance path; unresolved checks remain failures.',
    '',
    '### U1b: Shared Contract Migration Gate',
    '',
    'On upgrade, insert the canonical block before `## Agents` and validate it before touching agents. Record an existing intent-guard roster row -> `required`; no row -> `legacy-absent`. Never synthesize the row on the latter path. Legacy agent bodies remain byte-identical during this gate. **No agent may be tuned, regenerated, stripped, or reformatted until the shared contract passes.** absence migrates',
    'to `legacy-absent`; `legacy-absent` forbids that row and MUST NOT add the role during upgrade.',
    '',
    '### U2: Analyze Performance',
    '',
    'Use trace evidence only to decide whether a domain profile needs role-specific adjustment. Never duplicate the shared contract.',
    '',
    '### U4: Apply Changes',
    '',
    'Convert every touched Codex domain agent to the exact three-key TOML contract and six-heading `developer_instructions` shape. Parse before replacement, write atomically, parse again, and preserve untouched agents byte-identical.',
    '',
    'For `enable` and `disable`, use `scripts/toggle-team.sh`; it parks/restores domain `.toml` files byte-identically and never parks `intent-guard`. For `uninstall` and `purge`, follow the shipped cleanup flow and explicit confirmation gates. Every mode ends with `verify-team.sh` and reports exact paths, counts, and failures.',
  ].join('\n');
}

// Pip pins parsed out of a skill's check_deps.sh `pip_spec` case arms.
// The Codex variant of that script cannot be a verbatim copy (the source uses floating
// `brew install` and an expanded `pip install "${specs[@]}"`, both rejected by
// validate-compat.mjs), so the versions are read from source instead of retyped.
function sourcePipPins(sourceDir, required) {
  const source = fs.readFileSync(path.join(sourceDir, 'scripts', 'check_deps.sh'), 'utf8');
  const pins = {};
  for (const [, name, version] of source.matchAll(/^\s*([a-z0-9_-]+)\)\s*echo\s+"[a-z0-9_.-]+==([0-9][^"]*)"/gm)) {
    pins[name] = version;
  }
  const missing = required.filter(name => !pins[name]);
  if (missing.length) throw new Error(`check_deps.sh pip_spec is missing pins for: ${missing.join(', ')}`);
  return pins;
}

function generateSpecialResources(plugin, skill, sourceDir, targetDir) {
  if (plugin === 'brewcode' && skill === 'superreview-setup') {
    writeFile(path.join(targetDir, 'references', 'intent-guard.toml.template'), `name = "intent-guard"
description = "Review-only anti-drift check comparing requested and delivered scope."
developer_instructions = "Review only. Compare what was requested with what was delivered, report concrete drift with file:line evidence, and never implement or mutate project files."
`);
  }

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
    const pins = sourcePipPins(sourceDir, ['reportlab', 'weasyprint', 'markdown', 'pygments']);
    writeFile(path.join(targetDir, 'scripts', 'check_deps.sh'), `#!/usr/bin/env bash
set -euo pipefail

REPORTLAB_VERSION=${pins.reportlab}
WEASYPRINT_VERSION=${pins.weasyprint}
MARKDOWN_VERSION=${pins.markdown}
PYGMENTS_VERSION=${pins.pygments}
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
    const pinnedReportlab = `python3 -m pip install reportlab==${pins.reportlab}`;
    const pinnedWeasyprint = `python3 -m pip install weasyprint==${pins.weasyprint} markdown==${pins.markdown} pygments==${pins.pygments}`;
    const replacements = new Map([
      ['pip install reportlab', pinnedReportlab],
      ['pip install weasyprint markdown pygments', pinnedWeasyprint],
      ['pip3 install reportlab', pinnedReportlab],
      ['pip3 install weasyprint markdown pygments', pinnedWeasyprint]
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
    fs.rmSync(path.join(targetDir, 'assets', 'think-short-subagent.mjs'), { force: true });
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

  if (plugin === 'brewcode' && skill === 'e2e') {
    writeFile(path.join(targetDir, 'references', 'agent-template.md'), `# Native Codex agent template

Create a TOML file under \`.codex/agents/\` with \`name\`, \`description\`, and \`developer_instructions\`. The instructions define mission, domain, scope, task acceptance, self-check, and colleague handoff. Delegate through Codex collaboration with \`task_name\` and \`message\` only. Do not add Markdown frontmatter, tool allowlists, or legacy model aliases.

Every generated agent states output discipline: return only what the main session needs, a verdict or result plus \`file:line\` pointers; write bulk material such as long logs, full diffs, or long reports to a file under \`.codex/reports/<YYYYMMDD-HHMMSS>_<name>/\` and return the path instead of the content.

Agents whose domain writes code, scripts, SQL, schemas, infrastructure, or configuration also state scope fit: build for the scale and problems that exist today, not imagined load or speculative abstraction, and make one simplification pass after finishing. Those agents also state etalon-first: ${ETALON_SENTENCE}. Omit those paragraphs for research, documentation, and review-only agents.
`);
  }

  if (plugin === 'brewcode' && skill === 'teams-setup') {
    writeFile(path.join(targetDir, 'references', 'agent-template.md'), `# Native Codex team-agent template

Create one TOML file under \`.codex/agents/\` with only the supported \`name\`, \`description\`, and \`developer_instructions\` keys. Keep \`description\` to one role-and-trigger line. Use the following body shape exactly; its six headings are ordered and exhaustive:

\`\`\`markdown
## Mission
{One sentence: purpose and current role.}

## Owned surfaces
{Repo-relative paths and responsibilities owned only by this role.}

## Exclusions
{Named neighboring domains and their owners; refuse or coordinate instead of absorbing them.}

## Must-load references
- \`${TEAM_SHARED_REFERENCE}\`
- {Only role-specific rules, conventions, or contracts needed for this task.}

## Unique invariants
{Only role-specific facts and prohibitions not already in the shared team contract or must-load references.}

## Unique verification
{Exact role-specific checks and acceptance evidence.}
\`\`\`

The shared team file owns task acceptance, routing, tracing, return, and colleague contracts. Reference it exactly once and do not copy those contracts or their legacy headings into the agent. Delegate through Codex collaboration with \`task_name\` and \`message\` only. Do not add Markdown frontmatter, tool allowlists, legacy model aliases, or speculative instructions.

This template never applies to \`intent-guard\`. Its sole writer remains the shared superreview pipeline; preserve that review-only profile and its own output contract.
`);
  }

  if (plugin === 'brewcode' && skill === 'teams-setup') {
    // The suites drive the mirrored scripts, whose whole contract is `.codex/agents/<name>.toml`
    // -- the fixtures they write, the directory listings they expect, and the parked
    // (`.disabled`) and backup (`.bak-`) twins alike. Every one of those tokens reaches the
    // generic rules as a JS fragment with no path on the line: a template literal `${f}.md`, a
    // bare expectation array `['alpha-agent.md']`, an escaped regex `intent-guard\.md\.bak-`.
    // Nothing path-anchored can see them, and a half-converted suite is worse than none: the
    // fixture writes `.md`, the script parks `.toml`, and it dies before its first assertion.
    // Inside these three files every `.md` IS an agent file except the two markdown artifacts the
    // fixture itself writes, so flip the extension file-wide and name those exceptions.
    const KEEP_MD = /^(?:team|README)$/;
    for (const name of ['suite-intent-guard.mjs', 'suite-lifecycle.mjs', 'suite-parked-conflict.mjs']) {
      const file = path.join(targetDir, 'tests', name);
      writeFile(file, fs.readFileSync(file, 'utf8').replace(
        /([A-Za-z0-9_${}-]+)(\\?)\.md\b/g,
        (whole, stem, escape) => (KEEP_MD.test(stem) ? whole : `${stem}${escape}.toml`)
      ));
    }
    writeFile(path.join(targetDir, '..', 'superreview-setup', 'scripts', 'emit-intent-guard.sh'), [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'root="${1:-}"',
      'test -n "$root" || { echo "usage: emit-intent-guard.sh <project-root>" >&2; exit 2; }',
      'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
      'template="$SCRIPT_DIR/../references/intent-guard.toml.template"',
      'agents="$root/.codex/agents"',
      'target="$agents/intent-guard.toml"',
      '',
      'validate() {',
      '  python3 - "$1" <<\'PY\'',
      'import pathlib, sys, tomllib',
      'path = pathlib.Path(sys.argv[1])',
      'try:',
      '    data = tomllib.loads(path.read_text(encoding="utf-8"))',
      'except (OSError, UnicodeError, tomllib.TOMLDecodeError) as exc:',
      '    print(f"invalid TOML: {exc}", file=sys.stderr)',
      '    raise SystemExit(1)',
      'required = {"name", "description", "developer_instructions"}',
      'if set(data) != required:',
      '    print("TOML keys must be exactly name, description, developer_instructions", file=sys.stderr)',
      '    raise SystemExit(1)',
      'if any(type(data[key]) is not str for key in required) or data["name"] != "intent-guard":',
      '    print("intent-guard native fields must be strings and name must be fixed", file=sys.stderr)',
      '    raise SystemExit(1)',
      'PY',
      '}',
      '',
      'validate "$template"',
      'if [ -f "$target" ]; then',
      '  validate "$target"',
      '  echo "INTENT_GUARD: REUSE .codex/agents/intent-guard.toml"',
      '  exit 0',
      'fi',
      'mkdir -p "$agents"',
      'tmp="$(mktemp "$agents/.intent-guard.XXXXXX")"',
      'trap \'rm -f "$tmp"\' EXIT HUP INT TERM',
      'cp "$template" "$tmp"',
      'validate "$tmp"',
      'mv "$tmp" "$target"',
      'trap - EXIT HUP INT TERM',
      'echo "INTENT_GUARD: CREATED .codex/agents/intent-guard.toml"',
    ].join('\n'), 0o755);
    writeFile(path.join(targetDir, 'tests', 'suite-intent-guard.mjs'), nativeIntentGuardSuite(), 0o755);
    const nativeFramework = fs.readFileSync(path.join(targetDir, 'references', 'framework-files.md'), 'utf8');
    const nativeTeamMatch = nativeFramework.match(/## team\.md\n\n```markdown\n([\s\S]*?)\n```/);
    if (!nativeTeamMatch) throw new Error('native teams framework is missing fenced team.md template');
    for (const name of ['suite-lifecycle.mjs', 'suite-parked-conflict.mjs']) {
      const file = path.join(targetDir, 'tests', name);
      let value = rewriteNativeLifecycleSuite(fs.readFileSync(file, 'utf8'), nativeTeamMatch[1]);
      if (name === 'suite-lifecycle.mjs') value = value.replace('nativeTeam(root, rows)', 'nativeTeam(root, rows, separator)');
      writeFile(file, value, 0o755);
    }

    // The canonical Codex tree keeps its manifest at `.codex/package/plugin.json`, while the
    // installed distribution exposes `.codex-plugin/plugin.json`. Make the verifier runnable in
    // both layouts and keep its isolated regression suite anchored to the canonical manifest.
    const verifier = path.join(targetDir, 'scripts', 'verify-team.sh');
    let verifierText = fs.readFileSync(verifier, 'utf8');
    verifierText = replaceMarked(
      verifierText,
      '# BEGIN CLIENT AGENT VALIDATION',
      '# END CLIENT AGENT VALIDATION',
      nativeTeamAgentValidation()
    );
    verifierText = replaceMarked(
      verifierText,
      '# BEGIN LIVE CLIENT AGENT CHECK',
      '# END LIVE CLIENT AGENT CHECK',
      `# BEGIN LIVE CLIENT AGENT CHECK
          native_kind=domain
          [ "$agent" = "intent-guard" ] && native_kind=review-only
          set +e
          native_out=$(check_native_agent ".codex/agents/\${agent}.toml" "$agent" "$native_kind")
          native_rc=$?
          set -e
          if [ "$native_rc" -eq 0 ]; then
            echo "OK"
            if [ "$native_kind" = "domain" ] && [ "$shared_contract_present" -ne 1 ]; then
              echo "  CHECK: compact six-heading profile ... FAIL (shared team contract missing; interrupted install/unsafe migration)"
              FAIL=1
            elif [ "$native_kind" = "domain" ]; then
              echo "  CHECK: structurally parsed six-heading developer_instructions ... OK"
            fi
          else
            echo "FAIL"
            printf '%s\n' "$native_out"
            FAIL=1
          fi
          # END LIVE CLIENT AGENT CHECK`
    );
    verifierText = verifierText.replace(
      'PLUGIN_JSON="$SCRIPT_DIR/../../../.codex-plugin/plugin.json"',
      'PLUGIN_JSON="$SCRIPT_DIR/../../../.codex-plugin/plugin.json"\n[ -f "$PLUGIN_JSON" ] || PLUGIN_JSON="$SCRIPT_DIR/../../../package/plugin.json"'
    ).replace(
      'esac\nTODAY=$(date +%F)',
      `esac
PV=$(grep -aoE 'brewcode-meta: version=[0-9]+\\.[0-9]+\\.[0-9]+' "$SCRIPT_DIR/../SKILL.md" 2>/dev/null | head -1 | sed 's/.*version=//' || true)
case "$PV" in
  [0-9]*.[0-9]*.[0-9]*) : ;;
  *) printf 'ERROR:cannot resolve source plugin version (X.Y.Z) from %s\\n' "$SCRIPT_DIR/../SKILL.md"; exit 1 ;;
esac
TODAY=$(date +%F)`
    ).replaceAll('frontmatter', 'TOML agent schema');
    writeFile(verifier, verifierText, 0o755);
    const detector = path.join(targetDir, 'scripts', 'detect-mode.sh');
    writeFile(detector, fs.readFileSync(detector, 'utf8').replace(
      'esac\n\n# content_version self-location:',
      `esac
PLUGIN_VERSION=$(grep -aoE 'brewcode-meta: version=[0-9]+\\.[0-9]+\\.[0-9]+' "$SCRIPT_DIR/../SKILL.md" 2>/dev/null | head -1 | sed 's/.*version=//' || true)
case "$PLUGIN_VERSION" in
  [0-9]*.[0-9]*.[0-9]*) : ;;
  *) printf 'ERROR:cannot resolve source plugin version (X.Y.Z) from %s\\n' "$SCRIPT_DIR/../SKILL.md"; exit 1 ;;
esac

# content_version self-location:`
    ), 0o755);
    const profileSuite = path.join(targetDir, 'tests', 'suite-agent-profile-contract.mjs');
    let profileText = fs.readFileSync(profileSuite, 'utf8')
      .replace(
        "const canonicalSkillPath = join(repo, 'brewcode', 'skills', 'teams-setup', 'SKILL.md');",
        "const canonicalSkillPath = join(repo, 'brewcode', '.codex', 'skills', 'teams-setup', 'SKILL.md');"
      )
      .replace(
        "const verifierPath = join(repo, 'brewcode', 'skills', 'teams-setup', 'scripts', 'verify-team.sh');",
        "const verifierPath = join(repo, 'brewcode', '.codex', 'skills', 'teams-setup', 'scripts', 'verify-team.sh');"
      )
      .replace(
        'const representativeBody = profileBody(representative);',
        'const representativeBody = profileBody(representative);\nconst runtimeRepresentativeBody = profileBody(representativeProfile(projectedTemplate));'
      )
      .replace(
        "join(repo, 'brewcode', '.codex-plugin', 'plugin.json')",
        "join(repo, 'brewcode', '.codex', 'package', 'plugin.json')"
      )
      .replace(
        `const pluginVersion = JSON.parse(readFileSync(
  join(repo, 'brewcode', '.codex', 'package', 'plugin.json'), 'utf8',
)).version;`,
        "const pluginVersion = (/brewcode-meta: version=([0-9]+\\.[0-9]+\\.[0-9]+)/.exec(canonicalSkill) || [])[1];"
      )
      .replace('return `${canonicalTeam', 'return `${projectedTeam')
      .replace('return instantiateTeamTemplate(canonicalTeam', 'return instantiateTeamTemplate(projectedTeam')
      .replace('const oversized = `${representativeBody}', 'const oversized = `${runtimeRepresentativeBody}')
      .replace('mutate(representativeBody)', 'mutate(runtimeRepresentativeBody)')
      .replaceAll('join(world, SOURCE_CLIENT_DIR', "join(world, '.codex'")
      .replaceAll('`${name}.md`', '`${name}.toml`')
      .replaceAll("'build-eng.md'", "'build-eng.toml'")
      .replace(
        "result.output.includes('ceiling is 3200 (~800 est-tokens), frontmatter excluded')",
        "result.output.includes('ceilings are 3200 bytes and 800 ceil(chars/4) tokens')"
      )
      .replace('an oversized body fails even with small frontmatter',
        'an oversized developer_instructions value fails')
      .replace('body only (frontmatter excluded): <=3200 bytes',
        '`developer_instructions` only: <=3200 bytes')
      .replace('a fully legacy team remains runnable while upgrade is required',
        'a structurally parsed native agent without six headings fails')
      .replace("check('verifier.legacyMigrationSafe.exit', result.status, 0,",
        "check('verifier.legacyMigrationSafe.exit', result.status, 1,")
      .replace(
        "result.output.includes('has no Shared Agent Contract (legacy team)')\n      && result.output.includes('legacy repeated/unknown profile shape')",
        "result.output.includes('body headings must be exactly the six ordered teams-setup headings in developer_instructions')"
      );
    profileText = replaceMarked(
      profileText,
      '// BEGIN RUNTIME AGENT FIXTURES',
      '// END RUNTIME AGENT FIXTURES',
      nativeTeamFixtureBlock()
    );
    profileText = replaceMarked(
      profileText,
      '// BEGIN SOURCE FRONTMATTER BUDGET FIXTURE',
      '// END SOURCE FRONTMATTER BUDGET FIXTURE',
      nativeTeamSchemaFixtures()
    );
    profileText = profileText.replace(
      "console.log('suite-agent-profile-contract.mjs');",
      `const nativeVerifier = readFileSync(verifierPath, 'utf8');
check('codex.verifier.tomllib', nativeVerifier.includes('import tomllib'), true,
  'native verifier parses TOML structurally');
check('codex.verifier.noYamlParser', nativeVerifier.includes('NR == 1 && $0 == "---"'), false,
  'native verifier has no YAML fence parser');
check('codex.verifier.exactKeys',
  nativeVerifier.includes('required = {"name", "description", "developer_instructions"}'), true,
  'native verifier pins the exact supported top-level schema');

console.log('suite-agent-profile-contract.mjs');`
    );
    writeFile(profileSuite, profileText, 0o755);
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

    // The Codex agent is a compact TOML carrying fixed native instructions, so the Markdown
    // agent's internal structure -- the compression reference filenames, `Dedup Pass`,
    // `## Sources`, `RUN_DIR` -- is simply absent from it. Those assertions describe an artifact
    // this mirror does not ship and fail on every run; drop them and assert the TOML contract the
    // mirror actually guarantees instead.
    const testFile = path.join(targetDir, 'scripts', 'test-optimize.sh');
    const nativeAgentChecks = `check_file_exists "$AGENT_FILE" "Agent: text-optimizer.toml exists"
for key in "name = " "description = " "developer_instructions = "; do
  check_contains "$AGENT_FILE" "$key" "text-optimizer.toml declares $key"
done
`;
    writeFile(testFile, fs.readFileSync(testFile, 'utf8')
      .replace(/^check_(?:contains|file_exists) "\$AGENT_(?:DIR|FILE)\b.*\n/gm, '')
      .replace(/^# Check agent references Sources[\s\S]*?^fi\n/m, '')
      .replace(/^# request_user_input is removed[\s\S]*?^fi\n/m, '')
      .replace(/^AGENT_FILE=.*\n/m, line => `${line}${nativeAgentChecks}`), 0o755);
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
    const workflow = plugin === 'brewcode' && skill === 'teams-setup'
      ? `\n${nativeTeamsWorkflow(body)}\n`
      : MANUAL_NATIVE_SKILLS.has(`${plugin}/${skill}`) ? '' : `
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
  const { values } = readFrontmatter(source);
  const description = transformText(values.description || `${agentName} specialist.`, { agent: true });
  const nativeInstructions = {
    'agent-creator': `Create or improve Codex custom-agent TOMLs. Use one standalone file per agent under project .codex/agents/ or personal ~/.codex/agents/. Require name, description, and developer_instructions. Use only supported optional configuration keys. Validate TOML with Python tomllib and keep the role narrow. For a teams-setup domain agent, use exactly these six ordered developer_instructions headings: ${TEAM_AGENT_HEADINGS.map((heading) => `## ${heading}`).join(', ')}. Under Must-load references include exactly one \`${TEAM_SHARED_REFERENCE}\` entry; keep shared task acceptance, routing, tracing, return, and colleague contracts only in that file. Never apply the team profile to intent-guard, whose shared superreview pipeline remains its sole writer. For every non-team agent, retain the generic contract: emit output discipline (return a verdict plus file:line pointers; write bulk material to a file and return its path), and, only for agents that write code, scripts, SQL, schemas, infrastructure, or configuration, scope fit plus etalon-first (${ETALON_SENTENCE}). Report agent paths and a validation verdict, not full agent bodies.`,
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
    // Agents ship too: a skill's own assets resolve the roster relative to themselves
    // (`$SKILL_DIR/../../agents`), so a dist tree without it makes those assets abort on an
    // installed plugin while the canonical tree passes.
    fs.cpSync(path.join(canonical, 'agents'), path.join(dist, 'agents'), { recursive: true });
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
