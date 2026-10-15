import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import { BAND, ROOT, STATE_FILE, bandProps, bandTexts, bootBand, box, textsOf, defaultsTree, typed, type Tree } from './layer-io'
import { autoBudget, bandBudget, bandRows, cells, clip, shareRows, toggleLabel } from '../hooks/lib/band'

const SURFACES = ['terminal', 'desktop'] as const

const def = (name: string, description: string, when: string, body: string): string =>
  `---\nname: "${name}"\ndescription: "${description}"\nwhen: ${when}\n---\n${body}`
const TREE: Tree = {
  [`${ROOT}/.claude/placeholders/yy.md`]: def('yy', 'Why mode', 'always', 'YY BODY'),
  [`${ROOT}/.claude/placeholders/zz.md`]: def('zz', 'Zed mode', 'plan', 'ZZ BODY'),
}
const ENGINE = { type: 'Text', children: ['ENGINE'] }

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

const press = expect.any(Object)
const head = (count: number, label: string) => ({
  type: 'Box',
  props: { key: 'head' },
  children: [
    { type: 'Text', props: { dimColor: true }, children: [`placeholders ${count} `] },
    { type: 'Button', props: { key: 'toggle', label: `${label}  ctrl+x → tab → enter` }, press },
  ],
})
const rowYY = (extra: unknown[]) => ({
  type: 'Box',
  props: { key: 'row:++yy', flexDirection: 'column' },
  children: [
    {
      type: 'Box',
      children: [
        { type: 'Text', props: { color: 'suggestion' }, children: ['++yy'] },
        { type: 'Text', props: { dimColor: true, wrap: 'truncate-end' }, children: ['  Why mode'] },
      ],
    },
    ...extra,
  ],
})
const rowZZ = (extra: unknown[]) => ({
  type: 'Box',
  props: { key: 'row:++zz', flexDirection: 'column' },
  children: [
    {
      type: 'Box',
      children: [
        { type: 'Text', props: { color: 'suggestion' }, children: ['++zz'] },
        { type: 'Text', props: { dimColor: true, wrap: 'truncate-end' }, children: ['  Zed mode'] },
        { type: 'Text', props: { dimColor: true }, children: [' (plan only)'] },
      ],
    },
    ...extra,
  ],
})
const rowQ = {
  type: 'Box',
  props: { key: 'row:++q', flexDirection: 'column' },
  children: [
    {
      type: 'Box',
      children: [
        { type: 'Text', props: { color: 'warning' }, children: ['++q'] },
        { type: 'Text', props: { color: 'warning', dimColor: false, wrap: 'truncate-end' }, children: ['  unknown placeholder'] },
      ],
    },
  ],
}
// The drawn tree carries no key on a Text: only Boxes and Buttons keep theirs.
const line = (body: string) => ({ type: 'Text', props: { dimColor: true, wrap: 'truncate-end' }, children: [body] })
const hidden = (body: string) => ({
  type: 'Box',
  props: { marginLeft: 2, flexDirection: 'column', display: 'none' },
  hover: { display: 'flex' },
  children: [line(body)],
})
const shown = (body: string) => ({
  type: 'Box',
  props: { marginLeft: 2, flexDirection: 'column' },
  children: [line(body)],
})
const foot = (token: string) => `more: put the caret on ${token} · send as typed: ++/ · /placeholders help`
const hint = (token: string) => ({ type: 'Text', props: { dimColor: true, wrap: 'truncate-end' }, children: [foot(token)] })
const band = (children: unknown[], token = '++yy') => ({
  type: 'Box',
  props: { key: 'band', flexDirection: 'column' },
  children: [...children, hint(token)],
})

for (const surface of SURFACES) {
  test(`GIVEN known, plan-only and unknown tokens WHEN the band mounts on ${surface} THEN one keyed row per token and a hidden un-keyed hover Box per body`, async ($, on) => {
    await boot($, on, '++yy ++zz ++q')

    const ui = await $.ui.mount({ ...BAND, surface, props: bandProps() })

    expect(bare(await ui.drawn()), 'collapsed band').toEqual(band([head(3, 'Show text'), rowYY([hidden('YY BODY')]), rowZZ([hidden('ZZ BODY')]), rowQ]))
    await ui.unmount()
  })

  test(`GIVEN the collapsed band WHEN the Button is pressed on ${surface} THEN the bodies show visibly and a second press hides them`, async ($, on) => {
    await boot($, on, '++yy ++zz ++q')
    const ui = await $.ui.mount({ ...BAND, surface, props: bandProps() })

    await ui.press({ key: 'toggle' })
    const open = bare(await ui.drawn())
    await ui.press({ key: 'toggle' })
    const closed = bare(await ui.drawn())

    expect(open, 'expanded band').toEqual(band([head(3, 'Hide text'), rowYY([shown('YY BODY')]), rowZZ([shown('ZZ BODY')]), rowQ]))
    expect(closed, 'collapsed again').toEqual(band([head(3, 'Show text'), rowYY([hidden('YY BODY')]), rowZZ([hidden('ZZ BODY')]), rowQ]))
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

test('GIVEN only unknown tokens WHEN the band mounts THEN one warning row each and no toggle Button', async ($, on) => {
  await boot($, on, '++q and ++w')

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })

  const w = JSON.parse(JSON.stringify(rowQ).replace(/\+\+q/g, '++w'))
  expect(bare(await ui.drawn()), 'two warning rows').toEqual(
    band([{ type: 'Box', props: { key: 'head' }, children: [{ type: 'Text', props: { dimColor: true }, children: ['placeholders 2 '] }] }, rowQ, w], '++q'),
  )
  expect(await ui.find({ key: 'toggle' }), 'toggle').toBeUndefined()
  await ui.unmount()
})

test('GIVEN the same token typed twice in two cases WHEN the band mounts THEN it shows one row', async ($, on) => {
  await boot($, on, '++yy ++YY ++yy')

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })

  expect((await ui.findAll({ type: 'Box' })).map((b) => b.key), 'box keys').toEqual(['band', 'head', 'row:++yy', undefined, undefined])
  await ui.unmount()
})

const stateTree = (mode: unknown): Tree => ({ ...TREE, [STATE_FILE]: JSON.stringify({ mode, ts: 1 }) })
const turnEnd = ($: any) => $.turn.complete({ turnId: 't1', answer: '', durationMs: 1, isAborted: false, reason: 'end_turn' })
const PLAN_TEXTS = ['placeholders 1 · plan mode ', '++zz', '  Zed mode', 'ZZ BODY', foot('++zz')]
const NOT_PLAN_TEXTS = ['placeholders 1 ', '++zz', '  Zed mode', ' (plan only)', 'ZZ BODY', foot('++zz')]

test('GIVEN the state file says plan WHEN the session starts and the band mounts THEN the plan-only label is gone', async ($, on) => {
  await boot($, on, '++zz', () => {}, stateTree('plan'))

  expect(await bandTexts($), 'texts').toEqual(PLAN_TEXTS)
})

test('GIVEN the state file says another mode WHEN the session starts THEN the plan-only label shows', async ($, on) => {
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

test('GIVEN the state read fails WHEN the band mounts THEN it fails open to the engine tree', async ($, on) => {
  const down = { value: false }
  await boot($, on, '++yy', (o) => o('state.get', (_$, e, next) => (down.value ? ({ deny: 'state down' } as never) : next(e))))
  const healthy = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })
  const keys = (await healthy.findAll({ type: 'Box' })).map((b) => b.key)
  await healthy.unmount()

  down.value = true
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })

  expect(keys, 'precondition: the band draws while the state is up').toEqual(['band', 'head', 'row:++yy', undefined, undefined])
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
  expect([toggleLabel(false), toggleLabel(true)], 'labels').toEqual(['Show text  ctrl+x → tab → enter', 'Hide text  ctrl+x → tab → enter'])
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
    'placeholders 12 ',
    ...Array.from({ length: 6 }, (_, i) => [`++u${i + 1}`, '  unknown placeholder']).flat(),
    '... +6 more placeholders',
    foot('++u1'),
  ])
  await ui.unmount()
})

test('GIVEN an unknown token before a known one WHEN the compact band mounts THEN the foot names the first known token', async ($, on) => {
  await boot($, on, '++q ++yy')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })

  expect(await textsOf(ui), 'texts').toEqual(['placeholders 2 ', '++q', '  unknown placeholder', '++yy', '  Why mode', 'YY BODY', foot('++yy')])
  await ui.unmount()
})

const LONG = { [`${ROOT}/.claude/placeholders/long.md`]: linesFile('long', 20) }

test('GIVEN one 20-line body WHEN the band mounts THEN the 9-row auto view shows with a Show text Button, and a press shows the body up to the opened budget and names the show command', async ($, on) => {
  await boot($, on, '++long', undefined, LONG)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })
  const preview = [await textsOf(ui), (await ui.find({ key: 'toggle' }))?.props]

  await ui.press({ key: 'toggle' })
  const open = [await textsOf(ui), (await ui.find({ key: 'toggle' }))?.props]
  await ui.press({ key: 'toggle' })

  expect({ preview, open, closed: await textsOf(ui) }, 'preview, opened, closed').toEqual({
    preview: [['placeholders 1 ', '++long', '  long mode', ...Array.from({ length: 5 }, (_, i) => `long-line-${i + 1}`), '... +15 lines', foot('++long')], { key: 'toggle', label: 'Show text  ctrl+x → tab → enter' }],
    open: [
      ['placeholders 1 ', '++long', '  long mode', ...Array.from({ length: 8 }, (_, i) => `long-line-${i + 1}`), '... +12 lines · /placeholders show ++long', foot('++long')],
      { key: 'toggle', label: 'Hide text  ctrl+x → tab → enter' },
    ],
    closed: ['placeholders 1 ', '++long', '  long mode', ...Array.from({ length: 5 }, (_, i) => `long-line-${i + 1}`), '... +15 lines', foot('++long')],
  })
  await ui.unmount()
})

test('GIVEN one 20-line body and a tall terminal WHEN the band is opened THEN the whole body shows with no lines-cut row', async ($, on) => {
  await boot($, on, '++long', undefined, LONG)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps(45) })

  await ui.press({ key: 'toggle' })

  expect(await textsOf(ui), 'full body').toEqual(['placeholders 1 ', '++long', '  long mode', ...Array.from({ length: 20 }, (_, i) => `long-line-${i + 1}`), foot('++long')])
  await ui.unmount()
})

test('GIVEN one 3-line body WHEN the band mounts THEN the preview holds it whole and there is no Button', async ($, on) => {
  await boot($, on, '++short', undefined, { [`${ROOT}/.claude/placeholders/short.md`]: linesFile('short', 3) })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })

  expect([await textsOf(ui), await ui.find({ key: 'toggle' })], 'texts and toggle').toEqual([['placeholders 1 ', '++short', '  short mode', 'short-line-1', 'short-line-2', 'short-line-3', foot('++short')], undefined])
  await ui.unmount()
})

test('GIVEN two tokens with bodies WHEN the band mounts THEN both bodies show at once and the band has no toggle Button', async ($, on) => {
  await boot($, on, '++yy ++zz')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })

  expect([await textsOf(ui), await ui.find({ key: 'toggle' })], 'texts and toggle').toEqual([
    ['placeholders 2 ', '++yy', '  Why mode', 'YY BODY', '++zz', '  Zed mode', ' (plan only)', 'ZZ BODY', foot('++yy')],
    undefined,
  ])
  await ui.unmount()
})

test('GIVEN two 20-line bodies and the smallest budget WHEN the band mounts THEN the band fits the 6 rows and each cut row names the show command', async ($, on) => {
  const tree = Object.fromEntries(['aa', 'bb'].map((n) => [`${ROOT}/.claude/placeholders/${n}.md`, linesFile(n, 20)]))
  await boot($, on, '++aa ++bb', undefined, tree)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps(10) })

  expect(await textsOf(ui), 'texts').toEqual(['placeholders 2 ', '++aa', '  aa mode', '... +20 lines · /placeholders show ++aa', '++bb', '  bb mode', '... +20 lines · /placeholders show ++bb', foot('++aa')])
  await ui.unmount()
})

const THREE = { ...LONG, [`${ROOT}/.claude/placeholders/pp.md`]: linesFile('pp', 1), [`${ROOT}/.claude/placeholders/qq.md`]: linesFile('qq', 1) }

test('GIVEN three tokens and a 20-line body WHEN the band mounts collapsed THEN the Button is labelled with the keys and the hover body is capped', async ($, on) => {
  await boot($, on, '++long ++pp ++qq', undefined, THREE)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })

  expect([(await ui.find({ key: 'toggle' }))?.props, await textsOf(ui)], 'button props, texts').toEqual([
    { key: 'toggle', label: 'Show text  ctrl+x → tab → enter' },
    [
      'placeholders 3 ',
      '++long',
      '  long mode',
      ...Array.from({ length: 6 }, (_, i) => `long-line-${i + 1}`),
      '... +14 lines · /placeholders show ++long',
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

test('GIVEN three 20-line bodies WHEN the expanded band mounts with a 12-row budget THEN the 7 free rows are shared 2, 2, 3 and each cut row names the show command', async ($, on) => {
  const tree = Object.fromEntries(['aa', 'bb', 'cc'].map((n) => [`${ROOT}/.claude/placeholders/${n}.md`, linesFile(n, 20)]))
  await boot($, on, '++aa ++bb ++cc', undefined, tree)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })

  await ui.press({ key: 'toggle' })

  expect(await textsOf(ui), 'texts').toEqual([
    'placeholders 3 ',
    '++aa',
    '  aa mode',
    'aa-line-1',
    '... +19 lines · /placeholders show ++aa',
    '++bb',
    '  bb mode',
    'bb-line-1',
    '... +19 lines · /placeholders show ++bb',
    '++cc',
    '  cc mode',
    'cc-line-1',
    'cc-line-2',
    '... +18 lines · /placeholders show ++cc',
    foot('++aa'),
  ])
  await ui.unmount()
})

test('GIVEN a tall terminal and one body among three tokens WHEN the expanded band mounts THEN the body is not cut', async ($, on) => {
  await boot($, on, '++long ++q1 ++q2', undefined, LONG)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps(60) })

  await ui.press({ key: 'toggle' })

  expect(await textsOf(ui), 'texts').toEqual([
    'placeholders 3 ',
    '++long',
    '  long mode',
    ...Array.from({ length: 20 }, (_, i) => `long-line-${i + 1}`),
    '++q1',
    '  unknown placeholder',
    '++q2',
    '  unknown placeholder',
    foot('++long'),
  ])
  await ui.unmount()
})

test('GIVEN three 20-line bodies and an open menu at 24 rows WHEN the band is opened THEN the rows past its 6-row budget fold into the more row', async ($, on) => {
  const tree = Object.fromEntries(['aa', 'bb', 'cc'].map((n) => [`${ROOT}/.claude/placeholders/${n}.md`, linesFile(n, 20)]))
  await boot($, on, '++aa ++bb ++cc', undefined, tree)
  box.text = '++aa ++bb ++cc ++'
  await typed($, box.text)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })
  const collapsed = await textsOf(ui)

  await ui.press({ key: 'toggle' })

  expect({ collapsed, opened: await textsOf(ui) }, 'collapsed, opened').toEqual({
    collapsed: ['placeholders 3 ', '++aa', '  aa mode', '... +20 lines · /placeholders show ++aa', '++bb', '  bb mode', '... +20 lines · /placeholders show ++bb', '++cc', '  cc mode', '... +20 lines · /placeholders show ++cc', foot('++aa')],
    opened: ['placeholders 3 ', '++aa', '  aa mode', 'aa-line-1', '... +19 lines · /placeholders show ++aa', '... +2 more placeholders', foot('++aa')],
  })
  await ui.unmount()
})

test('GIVEN tokens in the view atom and an emptied box WHEN the band mounts on the terminal THEN the engine tree is drawn and a desktop surface still draws the band', async ($, on) => {
  await boot($, on, '++yy ++q')
  box.text = ''

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })
  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop', props: bandProps() })

  expect([bare(await terminal.drawn()), (await desktop.findAll({ type: 'Box' })).map((b) => b.key)], 'terminal tree, desktop box keys').toEqual([
    ENGINE,
    ['band', 'head', 'row:++yy', undefined, undefined, 'row:++q', undefined],
  ])
  await terminal.unmount()
  await desktop.unmount()
})
