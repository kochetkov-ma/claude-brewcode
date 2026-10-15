import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { PLUG, ROOT, defaultsTree, memIo, wire, type Tree } from './layer-io'
import { loadRegistry, newRegistryCache } from '../hooks/lib/defs'

// Exact user-visible strings; the engine glues "brewmod-placeholders: " in front of a toast.
const GONE = 'plugin files removed (updated?) · run /reload-plugins'
const HINT = 'add or change: /placeholders'
const R_DESC = '  Two-phase review: review every significant change, then double-check each finding'
const R_BODY_HEAD = '[REVIEW DISCIPLINE: DOUBLE-CHECK]'
const BAND = { plugin: 'brewmod-placeholders', component: 'AbovePrompt' } as const
const PROPS = { hasSurvey: false, isWorking: false, maxRows: 24, bodyColumns: 100, scroll: { bodyRows: 23, offset: 0, total: 0 }, view: {} }
const PLACEHOLDERS = `${PLUG}/placeholders/`

const box = { text: '', cursor: 0 }
const removeDefaults = (tree: Tree): void => {
  for (const k of Object.keys(tree)) if (k.startsWith(PLACEHOLDERS)) delete tree[k]
}

// Session with the band's bottoms; the box mirrors every edit so the band reads the draft.
const boot = async ($: any, on: On, tree: Tree, extra: (o: On) => void = () => {}, fail?: 'list') => {
  const w = wire(on, fail === undefined ? { tree } : { tree, fail })
  const invalidations: string[] = []
  on('ui.invalidate', (_$, e) => {
    invalidations.push(e.event)
    return { value: undefined } as never
  })
  extra(on)
  on('prompt.read', () => ({ value: box }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
  on('prompt.edit', (_$, e) => {
    const text = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)
    box.text = text
    box.cursor = e.start + e.inputText.length
    return { text, cursor: box.cursor }
  })
  on('prompt.autocomplete', () => ({ suggestions: [] }))
  on('ui.render', ($$, e) => $$.ui.resolve(e).Text({ children: 'ENGINE' }))
  const clock = mock.clock(on, { now: 10_000 })
  box.text = ''
  box.cursor = 0
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  return { ...w, clock, invalidations }
}
// One key: the edit, then the typeahead for the token that ends at the caret.
const key = async ($: any, input: string) => {
  const before = box.text
  await $.prompt.edit({ origin: { kind: 'composer' }, text: before, cursor: before.length, start: before.length, end: before.length, inputText: input })
  const token = box.text.slice(box.text.lastIndexOf(' ') + 1)
  if (token !== '') await $.prompt.autocomplete({ text: box.text, cursor: box.text.length, token, start: box.text.length - token.length })
}
const typeAll = async ($: any, text: string) => {
  for (const ch of text) await key($, ch)
}
const bandTexts = async ($: any): Promise<string[]> => {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: PROPS })
  const texts = (await ui.findAll({ type: 'Text' })).map((t: { text: string }) => t.text)
  await ui.unmount()
  return texts
}

test('GIVEN the plugin placeholders folder is already gone WHEN the session starts THEN one reload toast fires and the built-in names stay known', async ($, on) => {
  const tree: Tree = defaultsTree()
  removeDefaults(tree)
  const w = await boot($, on, tree)

  await typeAll($, '++r ')

  expect({ toasts: w.toasts, band: await bandTexts($) }, 'fresh load while gone').toEqual({ toasts: [GONE], band: ['placeholders 1 ', '++r', R_DESC, GONE] })
})

test('GIVEN a warm registry WHEN the plugin placeholders folder is gone and the registry reloads THEN it rejects with the reload hint and the cache keeps the old list', async () => {
  const tree: Tree = defaultsTree()
  const { io } = memIo(tree)
  const roots = { pluginRoot: PLUG, root: ROOT, configDir: '/cfg' }
  const cache = newRegistryCache()
  const warm = await loadRegistry(io, roots, cache)
  removeDefaults(tree)

  const outcome = await loadRegistry(io, roots, cache).then(
    (reg) => ({ rejected: null, names: reg.defs.map((d) => d.name) }),
    (err: Error) => ({ rejected: err.message, names: null }),
  )

  expect({ outcome, kept: cache.registry === warm, warmNames: warm.defs.map((d) => d.name) }, 'reload outcome and cache').toEqual({
    outcome: { rejected: GONE, names: null },
    kept: true,
    warmNames: ['+', 'a', 'm', 'm', 'r', 'rr'],
  })
})

test('GIVEN a running session with the built-ins loaded WHEN the plugin placeholders folder is removed and ++r is typed THEN ++r stays known, the band drops the preview for the reload hint and one toast says so', async ($, on) => {
  const tree: Tree = defaultsTree()
  const w = await boot($, on, tree)
  await typeAll($, '++r ')
  const before = await bandTexts($)
  removeDefaults(tree)
  await w.clock.advance(2000)
  box.text = ''

  await typeAll($, '++r ')
  await w.clock.advance(2000)
  await typeAll($, 'x ++r ')

  expect(before.slice(0, 4), 'precondition: known with its preview').toEqual(['placeholders 1 ', '++r', R_DESC, R_BODY_HEAD])
  expect({ toasts: w.toasts, band: await bandTexts($) }, 'after the folder is gone').toEqual({ toasts: [GONE], band: ['placeholders 1 ', '++r', R_DESC, GONE] })
})

test('GIVEN the folder was gone WHEN it comes back and the typeahead re-reads THEN the preview and the normal hint return', async ($, on) => {
  const tree: Tree = defaultsTree()
  const w = await boot($, on, tree)
  const saved = { ...tree }
  removeDefaults(tree)
  await typeAll($, '++r ')
  const gone = await bandTexts($)
  Object.assign(tree, saved)
  await w.clock.advance(2000)
  box.text = ''

  await typeAll($, '++r ')
  const back = await bandTexts($)

  expect({ gone, back: [back[0], back[1], back[2], back[3], back[back.length - 1]] }, 'gone then back').toEqual({
    gone: ['placeholders 1 ', '++r', R_DESC, GONE],
    back: ['placeholders 1 ', '++r', R_DESC, R_BODY_HEAD, HINT],
  })
})

test('GIVEN an inline project placeholder and the built-ins loaded WHEN the plugin folder is gone and a prompt is submitted THEN the inline text still expands from the cache and no unknown toast fires', async ($, on) => {
  const tree: Tree = { ...defaultsTree(), [`${ROOT}/.claude/placeholders/sig.md`]: '---\nname: "sig"\ninsert: inline\n---\nSIGNED' }
  const seen: string[] = []
  const w = await boot($, on, tree, (o) =>
    o('prompt.submit', (_$, e) => {
      seen.push(e.text)
      return { text: e.text } as never
    }),
  )
  removeDefaults(tree)

  await $.prompt.submit({ text: 'say ++sig ++r', origin: { kind: 'composer' }, wait: false } as never)

  expect({ seen, toasts: w.toasts }, 'submit while gone').toEqual({ seen: ['say SIGNED ++r'], toasts: [GONE] })
})

test('GIVEN the plugin folder is gone WHEN /placeholders runs THEN it answers the reload hint', async ($, on) => {
  const tree: Tree = defaultsTree()
  await boot($, on, tree)
  removeDefaults(tree)

  const out = await $.command.run({ command: 'placeholders', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as never)

  expect(out, 'command answer').toEqual({ text: GONE })
})

test('GIVEN a placeholder file made by hand WHEN its token is pasted in one edit and the typeahead re-reads the list THEN the band shows it known on that same edit', async ($, on) => {
  const tree: Tree = defaultsTree()
  const w = await boot($, on, tree)
  tree[`${ROOT}/.claude/placeholders/foo.md`] = '---\ndescription: "Foo thing"\n---\nFOO TEXT'
  await w.clock.advance(2000)

  await key($, '++foo')

  expect(await bandTexts($), 'band right after the last key').toEqual(['placeholders 1 ', '++foo', '  Foo thing', 'FOO TEXT', HINT])
})

test('GIVEN the plugin folder is gone WHEN the model calls save_placeholder THEN the reload hint comes back as an error and nothing is written', async ($, on) => {
  const tree: Tree = defaultsTree()
  const writes: string[] = []
  await boot($, on, tree, (o) =>
    o('fs.write', (_$, e) => {
      writes.push(e.path)
      return { value: undefined } as never
    }),
  )
  removeDefaults(tree)

  const out = await $.tool.call({ tool: 'mcp__brewmod-placeholders__save_placeholder', name: 'x', description: 'X', text: 'X' } as never)

  expect({ out: { result: (out as any).result, isError: (out as any).isError }, writes }, 'tool answer and writes').toEqual({ out: { result: GONE, isError: true }, writes: [] })
})

const SIG = { [`${ROOT}/.claude/placeholders/sig.md`]: '---\nname: "sig"\ninsert: inline\n---\nSIGNED' }
const toolCall = ($: any, tool: string) => $.tool.call({ tool: `mcp__brewmod-placeholders__${tool}`, name: 'x', description: 'X', text: 'X' } as never)

test('GIVEN every listing denied WHEN the model calls save_placeholder THEN a failed isError result comes back and nothing is written', async ($, on) => {
  const writes: string[] = []
  await boot($, on, defaultsTree(), (o) => o('fs.write', (_$, e) => (writes.push(e.path), { value: undefined }) as never), 'list').catch(() => undefined)

  const out = await toolCall($, 'save_placeholder').then(
    (r: any) => ({ threw: null, result: r.result, isError: r.isError }),
    (err: Error) => ({ threw: err.message, result: null, isError: null }),
  )

  expect({ out, writes }, 'denied listing').toEqual({ out: { threw: null, result: 'failed: brewmod-placeholders: $.fs.list: EACCES', isError: true }, writes: [] })
})

test('GIVEN the plugin placeholders folder is present but holds no .md file WHEN ++r is typed THEN it counts as gone: ++r stays known and the reload line shows', async ($, on) => {
  const tree: Tree = defaultsTree()
  const w = await boot($, on, tree)
  removeDefaults(tree)
  tree[`${PLACEHOLDERS}.keep`] = ''
  await w.clock.advance(2000)

  await typeAll($, '++r ')

  expect({ toasts: w.toasts, band: await bandTexts($) }, 'empty shipped folder').toEqual({ toasts: [GONE], band: ['placeholders 1 ', '++r', R_DESC, GONE] })
})

for (const [label, trigger] of [
  ['a submit', ($: any) => $.prompt.submit({ text: 'say ++r', origin: { kind: 'composer' }, wait: false } as never)],
  ['/placeholders', ($: any) => $.command.run({ command: 'placeholders', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as never)],
  ['a model tool call', ($: any) => toolCall($, 'list_placeholders')],
] as const) {
  test(`GIVEN a running session WHEN the plugin folder goes and ${label} sees it first THEN the band is redrawn and one reload toast fires`, async ($, on) => {
    const tree: Tree = defaultsTree()
    const w = await boot($, on, tree, (o) => o('prompt.submit', (_$, e) => ({ text: e.text }) as never))
    removeDefaults(tree)

    await trigger($)

    expect({ invalidations: w.invalidations, toasts: w.toasts }, label).toEqual({ invalidations: ['ui.render'], toasts: [GONE] })
  })
}

test('GIVEN an inline project placeholder WHEN the plugin folder is gone THEN its preview stays (it still expands) and only the context preview is dropped', async ($, on) => {
  const tree: Tree = { ...defaultsTree(), ...SIG }
  const w = await boot($, on, tree)
  removeDefaults(tree)
  await w.clock.advance(2000)

  await typeAll($, '++sig ++r ')

  expect(await bandTexts($), 'band while gone').toEqual(['placeholders 2 ', '++sig', '  sig', 'SIGNED', '++r', R_DESC, GONE])
})
