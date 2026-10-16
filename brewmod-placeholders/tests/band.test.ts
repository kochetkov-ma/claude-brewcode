import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import { BAND, ENGINE_NODE, ROOT, STATE_FILE, bandProps, bandTexts, bootBand, box, textsOf, defaultsTree, typed, withTools, type Tree } from './layer-io'
import { autoBudget, bandBudget, bandRows, cells, clip, shareRows, treeRows } from '../hooks/lib/band'

const SURFACES = ['terminal', 'desktop'] as const
type Surface = (typeof SURFACES)[number]

const def = (name: string, description: string, when: string, body: string): string =>
  `---\nname: "${name}"\ndescription: "${description}"\nwhen: ${when}\n---\n${body}`
const TREE: Tree = {
  [`${ROOT}/.claude/placeholders/yy.md`]: def('yy', 'Why mode', 'always', 'YY BODY'),
  [`${ROOT}/.claude/placeholders/zz.md`]: def('zz', 'Zed mode', 'always', 'ZZ BODY'),
}
const ENGINE = ENGINE_NODE

// 2.1.300 stamps `part` on drawn roots, 2.1.296 does not: compare only what the mod controls.
const bare = (node: any): any => {
  if (node === null || typeof node !== 'object') return node
  const { part: _part, ...rest } = node
  return 'children' in rest ? { ...rest, children: rest.children.map(bare) } : rest
}

// Real path: session.start loads the registry, prompt.edit writes the view atom; shipped defaults merge into the tree a test mutates.
// A trailing space keeps the caret off the last token: these tests pin the compact band (the caret band: focus.test.tsx).
const boot = async ($: any, on: On, draft: string, stubs: (on: On) => void = () => {}, tree: Tree = TREE) => {
  await bootBand($, on, { tree: Object.assign(tree, { ...defaultsTree(), ...tree }) }, stubs)
  await typed($, `${draft} `)
}

// Token names are bold in the placeholder colour (desktop adds its semibold weight).
const TOK = { terminal: { color: 'suggestion', bold: true }, desktop: { color: 'suggestion', bold: true, weight: 'semibold' } }
const head = (count: number) => ({ type: 'Text', props: { dimColor: true }, children: [`placeholders ${count}`] })
const rowYY = (extra: unknown[], surface: Surface = 'terminal') => ({
  type: 'Box',
  props: { key: 'row:++yy', flexDirection: 'column' },
  children: [
    {
      type: 'Box',
      children: [
        { type: 'Text', props: TOK[surface], children: ['++yy'] },
        { type: 'Text', props: { dimColor: true, wrap: 'truncate-end' }, children: ['  Why mode'] },
      ],
    },
    ...extra,
  ],
})
const rowZZ = (extra: unknown[], surface: Surface = 'terminal') => ({
  type: 'Box',
  props: { key: 'row:++zz', flexDirection: 'column' },
  children: [
    {
      type: 'Box',
      children: [
        { type: 'Text', props: TOK[surface], children: ['++zz'] },
        { type: 'Text', props: { dimColor: true, wrap: 'truncate-end' }, children: ['  Zed mode'] },
      ],
    },
    ...extra,
  ],
})
const rowQOn = (surface: Surface) => ({
  type: 'Box',
  props: { key: 'row:++q', flexDirection: 'column' },
  children: [
    {
      type: 'Box',
      children: [
        { type: 'Text', props: { ...TOK[surface], color: 'warning' }, children: ['++q'] },
        { type: 'Text', props: { dimColor: true, wrap: 'truncate-end' }, children: ['  unknown placeholder'] },
      ],
    },
  ],
})
const rowQ = rowQOn('terminal')
// The drawn tree carries no key on a Text: only Boxes keep theirs.
// Sent text is bold in the theme text colour (desktop adds its semibold weight), a text not sent now is dim.
const SENT_PROPS = { terminal: { color: 'text', bold: true, wrap: 'truncate-end' }, desktop: { color: 'text', bold: true, wrap: 'truncate-end', weight: 'semibold' } }
const line = (body: string, isSent: boolean, surface: Surface) => ({ type: 'Text', props: isSent ? SENT_PROPS[surface] : { dimColor: true, wrap: 'truncate-end' }, children: [body] })
const hidden = (body: string, isSent = true, surface: Surface = 'terminal') => ({
  type: 'Box',
  props: { marginLeft: 2, flexDirection: 'column', display: 'none' },
  hover: { display: 'flex' },
  children: [line(body, isSent, surface)],
})
const foot = (token: string) => `more: put the caret on ${token} · send as typed: ++/ · help: /placeholders help`
// The foot: dim labels, each action in the theme text colour and underlined, one row cut at the end.
const label = (t: string) => ({ type: 'Text', props: { dimColor: true }, children: [t] })
const act = (t: string) => ({ type: 'Text', props: { color: 'text', underline: true }, children: [t] })
const hint = (token: string) => ({
  type: 'Text',
  props: { wrap: 'truncate-end' },
  children: [label('more: '), act(`put the caret on ${token}`), label(' · send as typed: '), act('++/'), label(' · help: '), act('/placeholders help')],
})
const band = (children: unknown[], token = '++yy') => ({
  type: 'Box',
  props: { key: 'band', flexDirection: 'column' },
  children: [...children, hint(token)],
})

for (const surface of SURFACES) {
  test(`GIVEN two known and one unknown token WHEN the band mounts on ${surface} THEN one keyed row per token and a hidden un-keyed hover Box per body`, async ($, on) => {
    await boot($, on, '++yy ++zz ++q')

    const ui = await $.ui.mount({ ...BAND, surface, props: bandProps() })

    expect(bare(await ui.drawn()), 'collapsed band').toEqual(band([head(3), rowYY([hidden('YY BODY', true, surface)], surface), rowZZ([hidden('ZZ BODY', true, surface)], surface), rowQOn(surface)]))
    await ui.unmount()
  })

  test(`GIVEN a survey holds the band WHEN it mounts on ${surface} THEN the engine's own tree is drawn`, async ($, on) => {
    await boot($, on, '++yy ++q')

    const ui = await $.ui.mount({ ...BAND, surface, props: { ...bandProps(), hasSurvey: true } })

    expect(bare(await ui.drawn()), 'passthrough').toEqual(ENGINE)
    await ui.unmount()
  })

  test(`GIVEN a draft without tokens WHEN the band mounts on ${surface} THEN the engine's own tree is drawn`, async ($, on) => {
    await boot($, on, 'plain words, no placeholder')

    const ui = await $.ui.mount({ ...BAND, surface, props: bandProps() })

    expect(bare(await ui.drawn()), 'passthrough').toEqual(ENGINE)
    await ui.unmount()
  })
}

// ---- next(e) compose: another mod beneath (plan-effort's shape) draws one warning row over core's own drawing

const INNER_ROW = { type: 'Text', props: { color: 'warning', wrap: 'truncate-end' }, children: ['PLAN ROW'] }
const INNER = { type: 'Box', props: { flexDirection: 'column' }, children: [INNER_ROW, ENGINE] }
const beneath = (o: On) =>
  o('ui.render', { component: 'AbovePrompt' }, async ($$, e, next) => {
    const { Box, Text } = $$.ui.resolve(e)
    return Box({ flexDirection: 'column', children: [Text({ color: 'warning', wrap: 'truncate-end', children: 'PLAN ROW' }), await next(e)] })
  })

for (const surface of SURFACES) {
  test(`GIVEN another mod draws a row beneath WHEN the band mounts on ${surface} THEN that row sits above the band and both are drawn whole`, async ($, on) => {
    await boot($, on, '++yy ++zz ++q', beneath)

    const ui = await $.ui.mount({ ...BAND, surface, props: bandProps() })

    expect(bare(await ui.drawn()), 'inner tree first, then the band').toEqual({
      type: 'Box',
      props: { flexDirection: 'column' },
      children: [INNER, band([head(3), rowYY([hidden('YY BODY', true, surface)], surface), rowZZ([hidden('ZZ BODY', true, surface)], surface), rowQOn(surface)])],
    })
    await ui.unmount()
  })
}

test('GIVEN another mod draws a row beneath and a draft without tokens WHEN the band mounts THEN the tree beneath is drawn as it came', async ($, on) => {
  await boot($, on, 'plain words, no placeholder', beneath)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })

  expect(bare(await ui.drawn()), 'passthrough of the tree beneath').toEqual(INNER)
  await ui.unmount()
})

test('GIVEN twelve unknown tokens at 25 rows and a row drawn beneath WHEN the band mounts THEN the band gives that row up: six tokens, not seven', async ($, on) => {
  const twelve = Array.from({ length: 12 }, (_, i) => `++u${i + 1}`).join(' ')
  const shown = (n: number) => ['placeholders 12', ...Array.from({ length: n }, (_, i) => [`++u${i + 1}`, '  unknown placeholder']).flat(), `... ${12 - n} more placeholders`, foot('++u1')]
  const isBeneath = { value: false }
  await boot($, on, twelve, (o) => o('ui.render', { component: 'AbovePrompt' }, async ($$, e, next) => (isBeneath.value ? $$.ui.resolve(e).Box({ flexDirection: 'column', children: [$$.ui.resolve(e).Text({ children: 'PLAN ROW' }), await next(e)] }) : next(e))))
  const alone = await bandTexts($, 25)

  isBeneath.value = true
  const withRow = await bandTexts($, 25)

  expect({ alone, withRow }, '10-row auto budget alone, 9 under the row').toEqual({ alone: shown(7), withRow: ['PLAN ROW', ...shown(6)] })
})

test('GIVEN trees drawn beneath WHEN their rows are counted THEN Text and strings take 1, a column Box the sum, a row Box its tallest child, core and hidden Boxes 0', async () => {
  const text = { type: 'Text', children: ['x'] }
  const trees: unknown[] = [
    ENGINE,
    text,
    'bare',
    { type: 'Box', props: { flexDirection: 'column' }, children: [text, ENGINE, text] },
    { type: 'Box', children: [text, { type: 'Box', props: { flexDirection: 'column' }, children: [text, text, text] }] },
    { type: 'Box', props: { display: 'none' }, children: [text] },
    { type: 'Button', props: { key: 'b', label: 'go' } },
    { type: 'Box' },
    null,
  ]

  expect(trees.map(treeRows), 'rows per tree').toEqual([0, 1, 1, 2, 3, 0, 1, 0, 0])
})

test('GIVEN only unknown tokens WHEN the band mounts THEN one warning row each', async ($, on) => {
  await boot($, on, '++q and ++w')

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })

  const w = JSON.parse(JSON.stringify(rowQ).replace(/\+\+q/g, '++w'))
  expect(bare(await ui.drawn()), 'two warning rows').toEqual(
    band([head(2), rowQ, w], '++q'),
  )
  await ui.unmount()
})

test('GIVEN the same token typed twice in two cases WHEN the band mounts THEN it shows one row', async ($, on) => {
  await boot($, on, '++yy ++YY ++yy')

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })

  expect((await ui.findAll({ type: 'Box' })).map((b) => b.key), 'box keys').toEqual(['band', 'row:++yy', undefined, undefined])
  await ui.unmount()
})

const stateTree = (mode: unknown): Tree => ({ ...TREE, [STATE_FILE]: JSON.stringify({ mode, ts: 1 }) })
const turnEnd = ($: any) => $.turn.complete({ turnId: 't1', answer: '', durationMs: 1, isAborted: false, reason: 'end_turn' })
const PLAN_TEXTS = ['placeholders 1 · plan mode', '++zz', '  Zed mode', ' · Claude receives these lines now:', 'ZZ BODY', foot('++zz')]
const NOT_PLAN_TEXTS = ['placeholders 1', '++zz', '  Zed mode', ' · Claude receives these lines now:', 'ZZ BODY', foot('++zz')]

test('GIVEN the state file says plan WHEN the session starts and the band mounts THEN the head says Claude receives the text now', async ($, on) => {
  await boot($, on, '++zz', () => {}, stateTree('plan'))

  expect(await bandTexts($), 'texts').toEqual(PLAN_TEXTS)
})

test('GIVEN the state file says another mode WHEN the session starts THEN the head says Claude receives the text in plan mode', async ($, on) => {
  await boot($, on, '++zz', () => {}, stateTree('default'))

  expect(await bandTexts($), 'texts').toEqual(NOT_PLAN_TEXTS)
})

test('GIVEN no state file yet WHEN the session starts THEN the mode is not plan', async ($, on) => {
  await boot($, on, '++zz')

  expect(await bandTexts($), 'texts').toEqual(NOT_PLAN_TEXTS)
})

test('GIVEN the hook writes plan after the session start WHEN a turn completes THEN the band follows, and back to default on the next turn', async ($, on) => {
  const tree: Tree = { ...TREE }
  await boot($, on, '++zz', (o) => o('turn.complete', (_$, e) => ({ text: e.answer })), tree)
  const before = await bandTexts($)
  tree[STATE_FILE] = JSON.stringify({ mode: 'plan', ts: 2 })
  await turnEnd($)
  const planned = await bandTexts($)
  tree[STATE_FILE] = JSON.stringify({ mode: 'acceptEdits', ts: 3 })
  await turnEnd($)

  expect([before, planned, await bandTexts($)], 'band texts per step').toEqual([NOT_PLAN_TEXTS, PLAN_TEXTS, NOT_PLAN_TEXTS])
})

for (const raw of ['{', '{"mode":5}', 'null', '']) {
  test(`GIVEN an unusable state file ${JSON.stringify(raw)} after plan WHEN a turn completes THEN the last known mode stays`, async ($, on) => {
    const tree: Tree = stateTree('plan')
    await boot($, on, '++zz', (o) => o('turn.complete', (_$, e) => ({ text: e.answer })), tree)
    tree[STATE_FILE] = raw
    await turnEnd($)

    expect(await bandTexts($), 'texts').toEqual(PLAN_TEXTS)
  })
}

// Records each $.ui.invalidate beneath the mod; the band is not mounted, so only mode flips can invalidate.
const invalidateRecorder = (log: string[]) => (o: On) => {
  o('ui.invalidate', (_$, e) => {
    log.push(e.event)
    return { value: undefined } as never
  })
  o('turn.complete', (_$, e) => ({ text: e.answer }) as never)
}

test('GIVEN isPlan flips between turns WHEN each turn completes THEN the band is invalidated once per flip and never for an unchanged mode', async ($, on) => {
  const tree: Tree = { ...TREE }
  const log: string[] = []
  await boot($, on, '++zz', invalidateRecorder(log), tree)
  const atStart = [...log]
  const steps: string[][] = []
  for (const mode of ['plan', 'plan', 'default']) {
    log.length = 0
    tree[STATE_FILE] = JSON.stringify({ mode, ts: 2 })
    await turnEnd($)
    steps.push([...log])
  }

  expect({ atStart, steps }, 'invalidations at start and per turn (plan, plan again, default)').toEqual({ atStart: [], steps: [['ui.render'], [], ['ui.render']] })
})

for (const [mode, expected] of [['plan', ['ui.render']], ['default', []]] as const) {
  test(`GIVEN the state file says ${mode} WHEN the session starts THEN the band is invalidated ${expected.length} time(s)`, async ($, on) => {
    const log: string[] = []
    await boot($, on, '++zz', invalidateRecorder(log), stateTree(mode))

    expect(log, `invalidations for a ${mode} state file at session.start`).toEqual([...expected])
  })
}

test('GIVEN the mod tools register at session start WHEN it settles THEN the band is invalidated once, so a band drawn meanwhile gains the ++m? hand-off', async ($, on) => {
  const log: string[] = []
  await boot($, on, '++zz', (o) => {
    invalidateRecorder(log)(o)
    withTools(o)
  })

  expect(log, 'invalidations with tools and a default-mode start').toEqual(['ui.render'])
})

test('GIVEN the state read fails WHEN the band mounts THEN it fails open to the engine tree', async ($, on) => {
  const down = { value: false }
  await boot($, on, '++yy', (o) => o('state.get', (_$, e, next) => (down.value ? ({ deny: 'state down' } as never) : next(e))))
  const healthy = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })
  const keys = (await healthy.findAll({ type: 'Box' })).map((b) => b.key)
  await healthy.unmount()

  down.value = true
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })

  expect(keys, 'precondition: the band draws while the state is up').toEqual(['band', 'row:++yy', undefined, undefined])
  expect(bare(await ui.drawn()), 'passthrough while the state is down').toEqual(ENGINE)
  await ui.unmount()
})

test('GIVEN tokens and entries WHEN rows are built THEN they dedupe case-insensitively and take entry data for known tokens only', async () => {
  const tok = (text: string, name: string, isKnown: boolean, start: number) => ({ text, name, isKnown, start, end: start + text.length })
  const view = { tokens: [tok('++m', 'm', true, 0), tok('++M', 'm', true, 4), tok('++nd', 'nd', true, 8), tok('++x', 'x', false, 13), tok('++X', 'x', false, 17)] }
  const entries = [
    { name: 'M', description: 'D1', body: 'B1', planOnly: true },
    { name: 'm', description: 'ignored second entry', body: 'B2' },
    { name: 'nd' },
  ]

  expect(bandRows(view, entries), 'rows').toEqual([
    { text: '++m', name: 'm', isKnown: true, description: 'D1', body: 'B1', isPlanOnly: true },
    { text: '++nd', name: 'nd', isKnown: true, description: 'nd', body: '', isPlanOnly: false },
    { text: '++x', name: 'x', isKnown: false, description: 'unknown placeholder', body: '', isPlanOnly: false },
  ])
})

test('GIVEN terminal heights and the fullscreen flag WHEN the band budget is computed THEN it is 6 to 30 rows, less the reserve outside fullscreen', async () => {
  const table: [number, boolean][] = [[45, false], [24, false], [18, false], [10, false], [100, false], [45, true], [20, true], [50, true]]

  expect(table.map(([rows, full]) => bandBudget(rows, full)), 'budgets').toEqual([30, 12, 6, 6, 30, 30, 20, 30])
})

test('GIVEN terminal heights and the fullscreen flag WHEN the auto budget is computed THEN it is min(15, 40% of the rows), at least 6 and never above the opened budget', async () => {
  const table: [number, boolean][] = [[45, false], [40, false], [30, false], [24, false], [18, false], [10, false], [100, false], [45, true], [10, true]]

  expect(table.map(([rows, full]) => autoBudget(rows, full)), 'auto budgets').toEqual([15, 15, 12, 9, 6, 6, 15, 15, 10])
})

test('GIVEN ASCII, accented, wide, combining and emoji text WHEN cells are counted THEN wide characters and emoji take 2, combining marks, ZWJ and VS16 0', async () => {
  const texts = ['abc', 'ü', '日本', 'e\u0301', '🟢', '⚪', '✅', '🔵', '🔴', '👍', '\uFE0F', '\u200D', '☺', '☺\uFE0F', '⚪ anti-drift verdict.']

  expect(texts.map(cells), 'cells').toEqual([3, 1, 4, 1, 2, 2, 2, 2, 2, 2, 0, 0, 1, 2, 22])
})

test('GIVEN the first and last code point of each wide range and their narrow neighbours WHEN cells are counted THEN the ranges take 2, private use and the Yi-to-Hangul gap 1', async () => {
  const points = [0x1100, 0x115f, 0x1160, 0x2e80, 0xa4cf, 0xa4d0, 0xa960, 0xa97c, 0xa97d, 0xac00, 0xd7a3, 0xd7a4, 0xe000, 0xf8ff, 0xf900, 0xfaff, 0xfe30, 0xfe4f, 0xff01, 0xff60, 0xffe0, 0xffe6]

  expect(Object.fromEntries(points.map((cp) => [cp.toString(16), cells(String.fromCodePoint(cp))])), 'cells per code point').toEqual({
    '1100': 2, '115f': 2, '1160': 1, '2e80': 2, a4cf: 2, a4d0: 1, a960: 2, a97c: 2, a97d: 1, ac00: 2, d7a3: 2, d7a4: 1,
    e000: 1, f8ff: 1, f900: 2, faff: 2, fe30: 2, fe4f: 2, ff01: 2, ff60: 2, ffe0: 2, ffe6: 2,
  })
})

test('GIVEN texts and room WHEN clipped THEN a text that fits stays, a longer one ends in an ellipsis within the room, no room gives nothing', async () => {
  expect(['abc', 'abcdef', '日本語', 'abc', 'ab'].map((t, i) => clip(t, [3, 4, 4, 0, -2][i] ?? 0)), 'clipped').toEqual(['abc', 'abc…', '日…', '', ''])
})

test('GIVEN body needs and free rows WHEN rows are shared THEN short bodies keep what they need and leave the rest, and the shares never pass the free rows', async () => {
  const cases: [number[], number][] = [[[1, 20], 8], [[20, 20, 20], 7], [[20, 20], 2], [[5, 5], 1], [[3], 10], [[10, 10, 10], 1], [[5, 5], -1], [[20, 20, 20], 2]]

  expect(cases.map(([needs, free]) => shareRows(needs, free)), 'shares').toEqual([[1, 7], [2, 2, 3], [1, 1], [1, 0], [3], [1, 0, 0], [0, 0], [1, 1, 0]])
})

const linesFile = (name: string, lines: number): string =>
  `---\nname: "${name}"\ndescription: "${name} mode"\n---\n${Array.from({ length: lines }, (_, i) => `${name}-line-${i + 1}`).join('\n')}`

test('GIVEN twelve unknown tokens and a 9-row auto budget WHEN the band mounts THEN six rows show and the last row counts the rest', async ($, on) => {
  await boot($, on, Array.from({ length: 12 }, (_, i) => `++u${i + 1}`).join(' '))

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })

  expect(await textsOf(ui), 'head, six tokens, the more row, foot').toEqual([
    'placeholders 12',
    ...Array.from({ length: 6 }, (_, i) => [`++u${i + 1}`, '  unknown placeholder']).flat(),
    '... 6 more placeholders',
    foot('++u1'),
  ])
  await ui.unmount()
})

test('GIVEN an unknown token before a known one WHEN the compact band mounts THEN the foot names the first known token', async ($, on) => {
  await boot($, on, '++q ++yy')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })

  expect(await textsOf(ui), 'texts').toEqual(['placeholders 2', '++q', '  unknown placeholder', '++yy', '  Why mode', ' · Claude receives these lines now:', 'YY BODY', foot('++yy')])
  await ui.unmount()
})

const LONG = { [`${ROOT}/.claude/placeholders/long.md`]: linesFile('long', 20) }
const L = ' · Claude receives these lines now:'

test('GIVEN one 20-line body WHEN the band mounts THEN the 9-row auto view shows, the cut row names the show command and there is no Button', async ($, on) => {
  await boot($, on, '++long', undefined, LONG)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })

  expect([await textsOf(ui), await ui.findAll({ type: 'Button' })], 'texts and buttons').toEqual([
    ['placeholders 1', '++long', '  long mode', L, ...Array.from({ length: 5 }, (_, i) => `long-line-${i + 1}`), '... 15 more lines · whole text: /placeholders show ++long', foot('++long')],
    [],
  ])
  await ui.unmount()
})

test('GIVEN one 3-line body WHEN the band mounts THEN the preview holds it whole and there is no Button', async ($, on) => {
  await boot($, on, '++short', undefined, { [`${ROOT}/.claude/placeholders/short.md`]: linesFile('short', 3) })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })

  expect([await textsOf(ui), await ui.findAll({ type: 'Button' })], 'texts and buttons').toEqual([['placeholders 1', '++short', '  short mode', L, 'short-line-1', 'short-line-2', 'short-line-3', foot('++short')], []])
  await ui.unmount()
})

test('GIVEN two tokens with bodies WHEN the band mounts THEN both bodies show at once and the band has no Button', async ($, on) => {
  await boot($, on, '++yy ++zz')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })

  expect([await textsOf(ui), await ui.findAll({ type: 'Button' })], 'texts and buttons').toEqual([
    ['placeholders 2', '++yy', '  Why mode', L, 'YY BODY', '++zz', '  Zed mode', L, 'ZZ BODY', foot('++yy')],
    [],
  ])
  await ui.unmount()
})

test('GIVEN two 20-line bodies and the smallest budget WHEN the band mounts THEN the band fits the 6 rows and each cut row names the show command', async ($, on) => {
  const tree = Object.fromEntries(['aa', 'bb'].map((n) => [`${ROOT}/.claude/placeholders/${n}.md`, linesFile(n, 20)]))
  await boot($, on, '++aa ++bb', undefined, tree)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps(10) })

  expect(await textsOf(ui), 'texts').toEqual(['placeholders 2', '++aa', '  aa mode', L, '... 20 more lines · whole text: /placeholders show ++aa', '++bb', '  bb mode', L, '... 20 more lines · whole text: /placeholders show ++bb', foot('++aa')])
  await ui.unmount()
})

const THREE = { ...LONG, [`${ROOT}/.claude/placeholders/pp.md`]: linesFile('pp', 1), [`${ROOT}/.claude/placeholders/qq.md`]: linesFile('qq', 1) }

test('GIVEN three tokens and a 20-line body WHEN the band mounts collapsed THEN there is no Button and the hover body is capped', async ($, on) => {
  await boot($, on, '++long ++pp ++qq', undefined, THREE)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })

  expect([await ui.findAll({ type: 'Button' }), await textsOf(ui)], 'buttons, texts').toEqual([
    [],
    [
      'placeholders 3',
      '++long',
      '  long mode',
      ...Array.from({ length: 6 }, (_, i) => `long-line-${i + 1}`),
      '... 14 more lines · whole text: /placeholders show ++long',
      '++pp',
      '  pp mode',
      'pp-line-1',
      '++qq',
      '  qq mode',
      'qq-line-1',
      foot('++long'),
    ],
  ])
  await ui.unmount()
})

test('GIVEN three 20-line bodies and an open menu at 24 rows WHEN the band mounts THEN each hover body keeps only its cut row', async ($, on) => {
  const tree = Object.fromEntries(['aa', 'bb', 'cc'].map((n) => [`${ROOT}/.claude/placeholders/${n}.md`, linesFile(n, 20)]))
  await boot($, on, '++aa ++bb ++cc', undefined, tree)
  box.text = '++aa ++bb ++cc ++'
  await typed($, box.text)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })

  expect(await textsOf(ui), 'collapsed').toEqual(['placeholders 3', '++aa', '  aa mode', '... 20 more lines · whole text: /placeholders show ++aa', '++bb', '  bb mode', '... 20 more lines · whole text: /placeholders show ++bb', '++cc', '  cc mode', '... 20 more lines · whole text: /placeholders show ++cc', foot('++aa')])
  await ui.unmount()
})

test('GIVEN tokens in the view atom and an emptied box WHEN the band mounts on the terminal THEN the engine tree is drawn and a desktop surface still draws the band', async ($, on) => {
  await boot($, on, '++yy ++q')
  box.text = ''

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })
  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop', props: bandProps() })

  expect([bare(await terminal.drawn()), (await desktop.findAll({ type: 'Box' })).map((b) => b.key)], 'terminal tree, desktop box keys').toEqual([
    ENGINE,
    ['band', 'row:++yy', undefined, undefined, 'row:++q', undefined],
  ])
  await terminal.unmount()
  await desktop.unmount()
})
