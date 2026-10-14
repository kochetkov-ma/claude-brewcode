import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import { ROOT, wire, type Tree } from './layer-io'
import { PLAN_ONLY_LABEL, UNKNOWN_LABEL, bandRows, toggleLabel } from '../hooks/lib/band'

const SURFACES = ['terminal', 'desktop'] as const
const PROPS = { hasSurvey: false, isWorking: false, maxRows: 24, bodyColumns: 100, scroll: { bodyRows: 23, offset: 0, total: 0 }, view: {} }
const PLUGIN = { plugin: 'brewmod-placeholders', component: 'AbovePrompt' } as const

const def = (name: string, description: string, when: string, body: string): string =>
  `---\nname: "${name}"\ndescription: "${description}"\nwhen: ${when}\n---\n${body}`
const TREE: Tree = {
  [`${ROOT}/.claude/placeholders/yy.md`]: def('yy', 'Why mode', 'always', 'YY BODY'),
  [`${ROOT}/.claude/placeholders/zz.md`]: def('zz', 'Zed mode', 'plan', 'ZZ BODY'),
}
const ENGINE = { type: 'Text', children: ['ENGINE'], part: { plugin: 'test' } }

const typed = ($: { prompt: unknown }, text: string) =>
  ($.prompt as any).edit({ origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText: text })

// Real path: session.start loads the registry into the editor entries, prompt.edit writes the view atom.
const boot = async ($: any, on: On, draft: string, stubs: (on: On) => void = () => {}) => {
  wire(on, { tree: TREE, bottom: {} })
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
const hidden = (body: string) => ({
  type: 'Box',
  props: { marginLeft: 2, display: 'none' },
  hover: { display: 'flex' },
  children: [{ type: 'Text', props: { dimColor: true }, children: [body] }],
})
const shown = (body: string) => ({
  type: 'Box',
  props: { marginLeft: 2 },
  children: [{ type: 'Text', props: { dimColor: true }, children: [body] }],
})
const band = (children: unknown[]) => ({
  type: 'Box',
  props: { key: 'band', flexDirection: 'column' },
  children,
  part: { plugin: 'brewmod-placeholders' },
})

for (const surface of SURFACES) {
  test(`GIVEN known, plan-only and unknown tokens WHEN the band mounts on ${surface} THEN one keyed row per token and a hidden un-keyed hover Box per body`, async ($, on) => {
    await boot($, on, '++yy ++zz ++q')

    const ui = await $.ui.mount({ ...PLUGIN, surface, props: PROPS })

    expect(await ui.drawn(), 'collapsed band').toEqual(band([head(3, 'Show text'), rowYY([hidden('YY BODY')]), rowZZ([hidden('ZZ BODY')]), rowQ]))
    await ui.unmount()
  })

  test(`GIVEN the collapsed band WHEN the Button is pressed on ${surface} THEN the bodies show visibly and a second press hides them`, async ($, on) => {
    await boot($, on, '++yy ++zz ++q')
    const ui = await $.ui.mount({ ...PLUGIN, surface, props: PROPS })

    await ui.press({ key: 'toggle' })
    const open = await ui.drawn()
    await ui.press({ key: 'toggle' })
    const closed = await ui.drawn()

    expect(open, 'expanded band').toEqual(band([head(3, 'Hide text'), rowYY([shown('YY BODY')]), rowZZ([shown('ZZ BODY')]), rowQ]))
    expect(closed, 'collapsed again').toEqual(band([head(3, 'Show text'), rowYY([hidden('YY BODY')]), rowZZ([hidden('ZZ BODY')]), rowQ]))
    await ui.unmount()
  })

  test(`GIVEN a survey holds the band WHEN it mounts on ${surface} THEN the engine's own tree is drawn`, async ($, on) => {
    await boot($, on, '++yy ++q')

    const ui = await $.ui.mount({ ...PLUGIN, surface, props: { ...PROPS, hasSurvey: true } })

    expect(await ui.drawn(), 'passthrough').toEqual(ENGINE)
    await ui.unmount()
  })

  test(`GIVEN a draft without tokens WHEN the band mounts on ${surface} THEN the engine's own tree is drawn`, async ($, on) => {
    await boot($, on, 'plain words, no placeholder')

    const ui = await $.ui.mount({ ...PLUGIN, surface, props: PROPS })

    expect(await ui.drawn(), 'passthrough').toEqual(ENGINE)
    await ui.unmount()
  })
}

test('GIVEN only unknown tokens WHEN the band mounts THEN one warning row each and no toggle Button', async ($, on) => {
  await boot($, on, '++q and ++w')

  const ui = await $.ui.mount({ ...PLUGIN, surface: 'terminal', props: PROPS })

  const w = JSON.parse(JSON.stringify(rowQ).replace(/\+\+q/g, '++w'))
  expect(await ui.drawn(), 'two warning rows').toEqual(
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

test('GIVEN plan mode is the last known mode WHEN the band mounts THEN the plan-only label is gone', async ($, on) => {
  await boot($, on, '++zz')
  await $.classic.PostToolBatch({ tool_calls: [], permission_mode: 'plan' } as never)

  const ui = await $.ui.mount({ ...PLUGIN, surface: 'terminal', props: PROPS })

  const texts = (await ui.findAll({ type: 'Text' })).map((t) => t.text)
  expect(texts, 'texts').toEqual(['placeholders 1 ', '++zz', '  Zed mode', 'ZZ BODY'])
  await ui.unmount()
})

test('GIVEN a mode other than plan WHEN the band mounts THEN the plan-only label shows', async ($, on) => {
  await boot($, on, '++zz')
  await $.classic.PostToolBatch({ tool_calls: [], permission_mode: 'default' } as never)

  const ui = await $.ui.mount({ ...PLUGIN, surface: 'terminal', props: PROPS })

  const texts = (await ui.findAll({ type: 'Text' })).map((t) => t.text)
  expect(texts, 'texts').toEqual(['placeholders 1 ', '++zz', '  Zed mode', ` ${PLAN_ONLY_LABEL}`, 'ZZ BODY'])
  await ui.unmount()
})

test('GIVEN the state read fails WHEN the band mounts THEN it fails open to the engine tree', async ($, on) => {
  const down = { value: false }
  await boot($, on, '++yy', (o) => o('state.get', (_$, e, next) => (down.value ? ({ deny: 'state down' } as never) : next(e))))
  const healthy = await $.ui.mount({ ...PLUGIN, surface: 'terminal', props: PROPS })
  const keys = (await healthy.findAll({ type: 'Box' })).map((b) => b.key)
  await healthy.unmount()

  down.value = true
  const ui = await $.ui.mount({ ...PLUGIN, surface: 'terminal', props: PROPS })

  expect(keys, 'precondition: the band draws while the state is up').toEqual(['band', 'head', 'row:++yy', undefined, undefined])
  expect(await ui.drawn(), 'passthrough while the state is down').toEqual(ENGINE)
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
