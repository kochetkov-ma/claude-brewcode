import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import { ROOT, STATE_FILE, wire, type Tree } from './layer-io'
import { PLAN_ONLY_LABEL, UNKNOWN_LABEL, bandBudget, bandRows, toggleLabel } from '../hooks/lib/band'

const SURFACES = ['terminal', 'desktop'] as const
const PROPS = { hasSurvey: false, isWorking: false, maxRows: 24, bodyColumns: 100, scroll: { bodyRows: 23, offset: 0, total: 0 }, view: {} }
const PLUGIN = { plugin: 'brewmod-placeholders', component: 'AbovePrompt' } as const

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

const typed = ($: { prompt: unknown }, text: string) =>
  ($.prompt as any).edit({ origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText: text })

// The box the stubbed engine answers $.prompt.read with; boot sets it to the draft.
const box = { text: '', cursor: 0 }

// Real path: session.start loads the registry into the editor entries, prompt.edit writes the view atom.
const boot = async ($: any, on: On, draft: string, stubs: (on: On) => void = () => {}, tree: Tree = TREE) => {
  wire(on, { tree })
  on('prompt.read', () => ({ value: box }) as never)
  box.text = draft
  stubs(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
  on('prompt.edit', (_$, e) => ({ text: e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end), cursor: e.start + e.inputText.length }))
  on('ui.render', ($$, e) => $$.ui.resolve(e).Text({ children: 'ENGINE' }))
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await typed($, draft)
}

const press = expect.any(Object)
const head = (count: number, label: string) => ({
  type: 'Box',
  props: { key: 'head' },
  children: [
    { type: 'Text', props: { dimColor: true }, children: [`placeholders ${count} `] },
    { type: 'Button', props: { key: 'toggle', label }, press },
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
        { type: 'Text', props: { dimColor: true }, children: [` ${PLAN_ONLY_LABEL}`] },
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
        { type: 'Text', props: { color: 'warning', dimColor: false, wrap: 'truncate-end' }, children: [`  ${UNKNOWN_LABEL}`] },
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
const band = (children: unknown[]) => ({
  type: 'Box',
  props: { key: 'band', flexDirection: 'column' },
  children,
})

for (const surface of SURFACES) {
  test(`GIVEN known, plan-only and unknown tokens WHEN the band mounts on ${surface} THEN one keyed row per token and a hidden un-keyed hover Box per body`, async ($, on) => {
    await boot($, on, '++yy ++zz ++q')

    const ui = await $.ui.mount({ ...PLUGIN, surface, props: PROPS })

    expect(bare(await ui.drawn()), 'collapsed band').toEqual(band([head(3, 'Show text'), rowYY([hidden('YY BODY')]), rowZZ([hidden('ZZ BODY')]), rowQ]))
    await ui.unmount()
  })

  test(`GIVEN the collapsed band WHEN the Button is pressed on ${surface} THEN the bodies show visibly and a second press hides them`, async ($, on) => {
    await boot($, on, '++yy ++zz ++q')
    const ui = await $.ui.mount({ ...PLUGIN, surface, props: PROPS })

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

    const ui = await $.ui.mount({ ...PLUGIN, surface, props: { ...PROPS, hasSurvey: true } })

    expect(bare(await ui.drawn()), 'passthrough').toEqual(ENGINE)
    await ui.unmount()
  })

  test(`GIVEN a draft without tokens WHEN the band mounts on ${surface} THEN the engine's own tree is drawn`, async ($, on) => {
    await boot($, on, 'plain words, no placeholder')

    const ui = await $.ui.mount({ ...PLUGIN, surface, props: PROPS })

    expect(bare(await ui.drawn()), 'passthrough').toEqual(ENGINE)
    await ui.unmount()
  })
}

test('GIVEN only unknown tokens WHEN the band mounts THEN one warning row each and no toggle Button', async ($, on) => {
  await boot($, on, '++q and ++w')

  const ui = await $.ui.mount({ ...PLUGIN, surface: 'terminal', props: PROPS })

  const w = JSON.parse(JSON.stringify(rowQ).replace(/\+\+q/g, '++w'))
  expect(bare(await ui.drawn()), 'two warning rows').toEqual(
    band([{ type: 'Box', props: { key: 'head' }, children: [{ type: 'Text', props: { dimColor: true }, children: ['placeholders 2 '] }] }, rowQ, w]),
  )
  expect(await ui.find({ key: 'toggle' }), 'toggle').toBeUndefined()
  await ui.unmount()
})

test('GIVEN the same token typed twice in two cases WHEN the band mounts THEN it shows one row', async ($, on) => {
  await boot($, on, '++yy ++YY ++yy')

  const ui = await $.ui.mount({ ...PLUGIN, surface: 'terminal', props: PROPS })

  expect((await ui.findAll({ type: 'Box' })).map((b) => b.key), 'box keys').toEqual(['band', 'head', 'row:++yy', undefined, undefined])
  await ui.unmount()
})

const stateTree = (mode: unknown): Tree => ({ ...TREE, [STATE_FILE]: JSON.stringify({ mode, ts: 1 }) })
const turnEnd = ($: any) => $.turn.complete({ turnId: 't1', answer: '', durationMs: 1, isAborted: false, reason: 'end_turn' })
const bandTexts = async ($: any) => {
  const ui = await $.ui.mount({ ...PLUGIN, surface: 'terminal', props: PROPS })
  const texts = (await ui.findAll({ type: 'Text' })).map((t: { text: string }) => t.text)
  await ui.unmount()
  return texts
}
const PLAN_TEXTS = ['placeholders 1 ', '++zz', '  Zed mode', 'ZZ BODY']
const NOT_PLAN_TEXTS = ['placeholders 1 ', '++zz', '  Zed mode', ` ${PLAN_ONLY_LABEL}`, 'ZZ BODY']

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
  const healthy = await $.ui.mount({ ...PLUGIN, surface: 'terminal', props: PROPS })
  const keys = (await healthy.findAll({ type: 'Box' })).map((b) => b.key)
  await healthy.unmount()

  down.value = true
  const ui = await $.ui.mount({ ...PLUGIN, surface: 'terminal', props: PROPS })

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
    { text: '++x', name: 'x', isKnown: false, description: UNKNOWN_LABEL, body: '', isPlanOnly: false },
  ])
  expect([toggleLabel(false), toggleLabel(true)], 'labels').toEqual(['Show text', 'Hide text'])
})

test('GIVEN terminal heights and the fullscreen flag WHEN the band budget is computed THEN it is 6 to 30 rows, less the reserve outside fullscreen', async () => {
  const table: [number, boolean][] = [[45, false], [24, false], [18, false], [10, false], [100, false], [45, true], [20, true], [50, true]]

  expect(table.map(([rows, full]) => bandBudget(rows, full)), 'budgets').toEqual([30, 12, 6, 6, 30, 30, 20, 30])
})

const bodyOf = (name: string, lines: number): string =>
  `---\nname: "${name}"\ndescription: "${name} mode"\n---\n${Array.from({ length: lines }, (_, i) => `${name}-line-${i + 1}`).join('\n')}`
const texts = async (ui: { findAll: (q: { type: string }) => Promise<{ text?: string }[]> }): Promise<(string | undefined)[]> => (await ui.findAll({ type: 'Text' })).map((t) => t.text)

test('GIVEN twelve unknown tokens and a 12-row budget WHEN the band mounts THEN ten rows show and the last row counts the rest', async ($, on) => {
  await boot($, on, Array.from({ length: 12 }, (_, i) => `++u${i + 1}`).join(' '))

  const ui = await $.ui.mount({ ...PLUGIN, surface: 'terminal', props: PROPS })

  const rows = (await ui.findAll({ type: 'Text' })).map((t) => t.text).filter((t) => t?.startsWith('++u') || t?.startsWith('...') || t?.startsWith('placeholders'))
  expect(rows, 'head, ten tokens, the more row').toEqual(['placeholders 12 ', ...Array.from({ length: 10 }, (_, i) => `++u${i + 1}`), '... +2 more placeholders'])
  await ui.unmount()
})

test('GIVEN a 20-line body WHEN the expanded band mounts with a 12-row budget THEN nine lines show and an ellipsis row counts the 11 cut', async ($, on) => {
  await boot($, on, '++long', undefined, { [`${ROOT}/.claude/placeholders/long.md`]: bodyOf('long', 20) })
  const ui = await $.ui.mount({ ...PLUGIN, surface: 'terminal', props: PROPS })

  await ui.press({ key: 'toggle' })

  expect(await texts(ui), 'texts').toEqual([
    'placeholders 1 ',
    '++long',
    '  long mode',
    ...Array.from({ length: 9 }, (_, i) => `long-line-${i + 1}`),
    '... +11 lines',
  ])
  await ui.unmount()
})

test('GIVEN a 20-line body WHEN the collapsed band mounts THEN the hover body is capped the same way', async ($, on) => {
  await boot($, on, '++long', undefined, { [`${ROOT}/.claude/placeholders/long.md`]: bodyOf('long', 20) })

  const ui = await $.ui.mount({ ...PLUGIN, surface: 'terminal', props: PROPS })

  expect((await texts(ui)).slice(3), 'hover texts').toEqual([...Array.from({ length: 9 }, (_, i) => `long-line-${i + 1}`), '... +11 lines'])
  await ui.unmount()
})

test('GIVEN three 20-line bodies WHEN the expanded band mounts with a 12-row budget THEN each body gets one line and an ellipsis', async ($, on) => {
  const tree = Object.fromEntries(['aa', 'bb', 'cc'].map((n) => [`${ROOT}/.claude/placeholders/${n}.md`, bodyOf(n, 20)]))
  await boot($, on, '++aa ++bb ++cc', undefined, tree)
  const ui = await $.ui.mount({ ...PLUGIN, surface: 'terminal', props: PROPS })

  await ui.press({ key: 'toggle' })

  expect(await texts(ui), 'texts').toEqual([
    'placeholders 3 ',
    '++aa',
    '  aa mode',
    'aa-line-1',
    '... +19 lines',
    '++bb',
    '  bb mode',
    'bb-line-1',
    '... +19 lines',
    '++cc',
    '  cc mode',
    'cc-line-1',
    '... +19 lines',
  ])
  await ui.unmount()
})

test('GIVEN a tall terminal WHEN the expanded band mounts THEN the body is not cut', async ($, on) => {
  await boot($, on, '++long', undefined, { [`${ROOT}/.claude/placeholders/long.md`]: bodyOf('long', 20) })
  const ui = await $.ui.mount({ ...PLUGIN, surface: 'terminal', props: { ...PROPS, maxRows: 60 } })

  await ui.press({ key: 'toggle' })

  expect((await texts(ui)).slice(3), 'body lines').toEqual(Array.from({ length: 20 }, (_, i) => `long-line-${i + 1}`))
  await ui.unmount()
})

test('GIVEN tokens in the view atom and an emptied box WHEN the band mounts on the terminal THEN the engine tree is drawn and a desktop surface still draws the band', async ($, on) => {
  await boot($, on, '++yy ++q')
  box.text = ''

  const terminal = await $.ui.mount({ ...PLUGIN, surface: 'terminal', props: PROPS })
  const desktop = await $.ui.mount({ ...PLUGIN, surface: 'desktop', props: PROPS })

  expect([bare(await terminal.drawn()), (await desktop.findAll({ type: 'Box' })).map((b) => b.key)], 'terminal tree, desktop box keys').toEqual([
    ENGINE,
    ['band', 'head', 'row:++yy', undefined, undefined, 'row:++q', undefined],
  ])
  await terminal.unmount()
  await desktop.unmount()
})
