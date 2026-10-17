// Fixture recipe + expectations for drive.mjs: sample project, old setup installs, answers, owned prefixes.
// Owned/common prefixes mirror brewcode/skills/setup-status/references/upgrade-runner.md sections 3-4 (re-sync on change).

export const SAMPLE = {
  'package.json': `${JSON.stringify({ name: 'luf-sample', version: '1.0.0', private: true, type: 'module', scripts: { test: 'node --test test/' } }, null, 2)}\n`,
  'README.md': '# luf-sample\n\nTiny invoice formatter: parses line items, totals them with tax, prints a receipt.\n\n## Run\n\n```bash\nnpm test\nnode src/index.js\n```\n',
  'CLAUDE.md': '# luf-sample\n\nNode 24 ESM, no dependencies. `src/lib/` holds pure functions; `src/index.js` is the CLI.\n\n| Command | Purpose |\n|---|---|\n| `npm test` | node:test suite in `test/` |\n',
  '.gitignore': 'node_modules/\n',
  'src/index.js': "import { parseItems } from './lib/parse.js'\nimport { total } from './lib/math.js'\nimport { receipt } from './lib/format.js'\n\nconst items = parseItems(process.argv[2] ?? 'tea:2:3.5,cake:1:4')\nprocess.stdout.write(receipt(items, total(items, 0.23)))\n",
  'src/lib/parse.js': "// name:qty:price,... -> [{ name, qty, price }]; bad rows throw.\nexport function parseItems(text) {\n  return text.split(',').filter(Boolean).map((row) => {\n    const [name, qty, price] = row.split(':')\n    if (!name || Number.isNaN(Number(qty)) || Number.isNaN(Number(price))) throw new Error(`bad item: ${row}`)\n    return { name, qty: Number(qty), price: Number(price) }\n  })\n}\n",
  'src/lib/math.js': "export const subtotal = (items) => items.reduce((s, i) => s + i.qty * i.price, 0)\nexport const total = (items, tax) => Math.round(subtotal(items) * (1 + tax) * 100) / 100\n",
  'src/lib/format.js': "export function receipt(items, sum) {\n  const lines = items.map((i) => `${i.name.padEnd(10)} ${i.qty} x ${i.price.toFixed(2)}`)\n  return `${lines.join('\\n')}\\nTOTAL ${sum.toFixed(2)}\\n`\n}\n",
  'test/math.test.js': "import { test } from 'node:test'\nimport assert from 'node:assert/strict'\nimport { total } from '../src/lib/math.js'\n\ntest('GIVEN two items WHEN total with 23% tax THEN rounded sum', () => {\n  assert.equal(total([{ qty: 2, price: 3.5 }, { qty: 1, price: 4 }], 0.23), 13.53, 'total')\n})\n",
}

const tail = (scope) => ` -- unattended fixture build: do not ask any question, take the recommended default at every choice; ${scope}; do not make any git commit or any other git write; scratch files only in a private mktemp -d.`
// Old semble-setup registers its MCP at user scope only: "never global" made the model skip it (1 build of 3).
const USER_OK = "the user scope of this session is a throwaway fixture profile, so register at user scope where the skill requires it; nothing outside this project and that profile"

// Run-list stage order; manager last (an armed wall walls the next sessions), then disarmed by its exempt CLI.
export const ROWS = [
  { row: 11, cls: 'A', skill: 'brewtools:agent-return-setup', args: 'install project', anchor: '.claude/hooks/agent-return-guard.mjs', min: 15 },
  { row: 2, cls: 'A', skill: 'brewcode:semble-setup', args: 'install', then: 'resume', ready: ['.claude/semble/state.json', 'phase', 'ready'], anchor: '.claude/rules/semble-first.md', min: 25, needs: 'uv', scope: USER_OK },
  { row: 1, cls: 'B', skill: 'brewcode:teams-setup', args: 'install core', anchorGlob: ['.claude/teams', 'team.md'], min: 45 },
  { row: 7, cls: 'A', skill: 'brewtools:agent-router-setup', args: 'install level fast', anchor: '.claude/hooks/agent-router.mjs', min: 15 },
  { row: 6, cls: 'A', skill: 'brewtools:agent-deadline-setup', args: 'install project 20', anchor: '.claude/hooks/agent-deadline-guard.mjs', min: 15 },
  { row: 3, cls: 'B', skill: 'brewcode:superreview-setup', args: 'install', anchor: '.claude/skills/superreview/SKILL.md', min: 45 },
  { row: 4, cls: 'B', skill: 'brewtools:task-board-setup', args: 'install', anchor: '.claude/features/board.md', min: 45 },
  { row: 9, cls: 'B', skill: 'brewdoc:memory-sync-setup', args: 'install', anchor: '.claude/skills/memory-sync/SKILL.md', min: 45 },
  { row: 10, cls: 'A', skill: 'brewdoc:docsync-setup', args: 'install', anchor: '.claude/docsync/config.json', min: 15 },
  { row: 8, cls: 'A', skill: 'brewtools:manager-setup', args: 'install level balanced', anchor: '.claude/brewtools/manager/state.json', min: 15, disarm: true },
].map((r) => {
  const t = tail(r.scope ?? 'project scope only, never global')
  return { ...r, prompt: `/${r.skill} ${r.args}${t}`, ...(r.then ? { thenPrompt: `/${r.skill} ${r.then}${t}` } : {}) }
})

export const A_ROWS = ROWS.filter((r) => r.cls === 'A').map((r) => r.row)
export const B_ROWS = ROWS.filter((r) => r.cls === 'B').map((r) => r.row)

// upgrade-runner.md section 4, project prefixes per row.
export const OWNED = {
  1: ['.claude/teams/', '.claude/agents/'],
  2: ['.claude/rules/semble-first.md', '.claude/hooks/semble-', '.claude/semble/', '.claude/agents/', '.sembleignore', '.gitignore', 'CLAUDE.md'],
  3: ['.claude/skills/superreview/', '.claude/agents/intent-guard.md', '.claude/reports/'],
  4: ['.claude/features/', '.claude/agents/task-tracker.md', '.claude/skills/task-board/', '.claude/skills/task-spec/', '.claude/rules/tasks.md'],
  6: ['.claude/hooks/agent-deadline-', '.claude/agent-deadline.json'],
  7: ['.claude/hooks/agent-router.mjs', '.claude/brewtools/agent-router.json'],
  8: ['.claude/brewtools/manager/'],
  9: ['.claude/skills/memory-sync/'],
  10: ['.claude/docsync/', '.claude/hooks/docsync-'],
  11: ['.claude/hooks/agent-return-', '.claude/agent-return.json', '.claude/agent-return-state/'],
}

// upgrade-runner.md section 3: settings files + runtime state written while rows run.
export const COMMON = ['.claude/settings.json', '.claude/settings.local.json', '.claude/docsync/state-', '.claude/semble/telemetry.jsonl', '.claude/agent-return-state/',
  '.claude/scheduled_tasks.', '.claude/logs/', '.claude/tasks/cfg/brewcode.state.json', '.claude/plans/', '.claude/reports/', '.claude/worktrees/',
  '.claude/hooks/agent-deadline-', '.claude/agent-deadline.json']

// Setup command name (as in the report tables) -> roster row.
export const SETUP_ROW = { 'teams-setup': 1, 'semble-setup': 2, 'superreview-setup': 3, 'task-board-setup': 4, 'agent-deadline-setup': 6, 'agent-router-setup': 7, 'manager-setup': 8, 'memory-sync-setup': 9, 'docsync-setup': 10, 'agent-return-setup': 11, 'convention-setup': 12 }

// AskUserQuestion policy: question regex -> labels to pick ('*' = every option but Skip/free text).
export const ANSWERS = [
  { q: /Install the missing mods\?/, pick: '*' },
  { q: /Install the missing plugins\?/, pick: ['Skip'] },
  { q: /Upgrade \d+ setups? now\?/, pick: ['No, just the report'] },
  { q: /task.?graph|Task tools|TODO_TOOLS/i, pick: ['Leave off'] },
]
