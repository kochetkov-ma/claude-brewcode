import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import { ROOT, STATE_FILE, bootBand, defaultsTree, mountBand, spansOf, typed, withTools, type Tree } from './layer-io'

const DB: Tree = { [`${ROOT}/.claude/placeholders/db.md`]: '---\ndescription: "Use the staging DB"\n---\nUse the staging DB.' }
const PLAN = { [STATE_FILE]: JSON.stringify({ mode: 'plan', ts: 1 }) }
const boot = ($: any, on: On, tree: Tree = {}, tools = true) => bootBand($, on, { tree: { ...defaultsTree(), ...DB, ...tree } }, tools ? withTools : () => {})
const spans = async ($: any, maxRows = 40, columns = 118): Promise<[string, string][]> => {
  const ui = await mountBand($, maxRows, 'terminal', columns)
  const out = await spansOf(ui)
  await ui.unmount()
  return out
}
// Every run but the sent ones, which only count: the mockup's labels, tokens and actions.
const rest = (s: [string, string][]) => ({ sent: s.filter(([k]) => k === 'sent').length, other: s.filter(([k]) => k !== 'sent') })

test('GIVEN the caret on ++m in default mode and the mod tools WHEN the band mounts THEN the token is bold placeholder colour, the cut row offers show or ++m? alone [Enter] and the foot actions are underlined', async ($, on) => {
  await boot($, on)
  await typed($, '++m')

  expect(rest(await spans($)), 'state 1 runs').toEqual({
    sent: 13,
    other: [
      ['tok', '++m'],
      ['dim', ' · Claude receives these lines now:'],
      ['dim', '... 16 more lines · whole text: '],
      ['act', '/placeholders show ++m'],
      ['dim', ' or '],
      ['act', '++m?'],
      ['dim', ' alone '],
      ['key', '[Enter]'],
      ['dim', 'not sent now · plan mode adds 18 lines'],
      ['dim', 'close: '],
      ['act', 'move the caret off ++m'],
      ['dim', ' · send as typed: '],
      ['act', '++/'],
    ],
  })
})

test('GIVEN plan mode and the caret on ++m WHEN the band mounts THEN the addition is marked dim and the cut row and foot keep their actions', async ($, on) => {
  await boot($, on, PLAN)
  await typed($, '++m')

  expect(rest(await spans($)), 'state 2 runs').toEqual({
    sent: 12,
    other: [
      ['tok', '++m'],
      ['dim', ' · Claude receives these lines now:'],
      ['dim', '... 23 more lines'],
      ['dim', 'plan mode adds:'],
      ['dim', '... 12 more lines · whole text: '],
      ['act', '/placeholders show ++m'],
      ['dim', ' or '],
      ['act', '++m?'],
      ['dim', ' alone '],
      ['key', '[Enter]'],
      ['dim', 'close: '],
      ['act', 'move the caret off ++m'],
      ['dim', ' · send as typed: '],
      ['act', '++/'],
    ],
  })
})

test('GIVEN three tokens and the caret past them WHEN the compact band mounts THEN each token is bold placeholder colour with a dim description and the foot names three actions', async ($, on) => {
  await boot($, on)
  await typed($, '++r ++a ++db check the auth module')

  const runs = (await spans($)).filter(([k]) => k !== 'sent')

  expect(runs, 'state 3 runs, hover bodies whole').toEqual([
    ['dim', 'placeholders 3'],
    ['tok', '++r'],
    ['dim', '  Two-phase review: review every significant change, then double-check each finding'],
    ['tok', '++a'],
    ['dim', '  Architecture-first: delegate the design to expert agents before implementing'],
    ['tok', '++db'],
    ['dim', '  Use the staging DB'],
    ['dim', 'more: '],
    ['act', 'put the caret on ++r'],
    ['dim', ' · send as typed: '],
    ['act', '++/'],
    ['dim', ' · help: '],
    ['act', '/placeholders help'],
  ])
})

test('GIVEN ++/ in the message WHEN the escaped band mounts THEN the marker and every token are bold placeholder colour, the reasons dim and the foot action underlined', async ($, on) => {
  await boot($, on)
  await typed($, '++/ what does ++r do?')

  expect(await spans($), 'state 4 runs').toEqual([
    ['tok', '++/'],
    ['dim', '  placeholders off: this message is sent exactly as typed'],
    ['tok', '++r'],
    ['dim', '  (not sent: ++/ in this message)'],
    ['dim', 'turn back on: '],
    ['act', 'delete ++/'],
  ])
})

test('GIVEN a caret token and an unknown one WHEN the focus band mounts THEN the also row names it in warning bold and the unknown focus foot points to the list', async ($, on) => {
  await boot($, on)
  await typed($, '++zz ++r')
  const withAlso = await spans($)
  await typed($, '++zz')

  expect([withAlso.filter(([k]) => k !== 'sent'), await spans($)], 'also row and unknown foot').toEqual([
    [
      ['tok', '++r'],
      ['dim', ' · Claude receives these lines now:'],
      ['dim', 'also:'],
      ['dim', ' '],
      ['unk', '++zz'],
      ['dim', 'close: '],
      ['act', 'move the caret off ++r'],
      ['dim', ' · send as typed: '],
      ['act', '++/'],
    ],
    [['unk', '++zz'], ['dim', '  unknown placeholder'], ['dim', 'names: '], ['act', '/placeholders list']],
  ])
})

test('GIVEN a build without the mod tools WHEN ++m is focused THEN the cut row names only the show command', async ($, on) => {
  await boot($, on, {}, false)
  await typed($, '++m')

  expect((await spans($)).filter(([k]) => k !== 'sent').slice(2, 4), 'cut row without the hand-off').toEqual([
    ['dim', '... 16 more lines · whole text: '],
    ['act', '/placeholders show ++m'],
  ])
})

test('GIVEN 20-line bodies WHEN the cut row narrows THEN the hand-off goes first, then the label, then the count; the show command stays whole', async ($, on) => {
  await boot($, on, { [`${ROOT}/.claude/placeholders/long.md`]: `---\ndescription: "long"\n---\n${Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n')}` })
  await typed($, '++long')
  const cut = async (columns: number) => (await spans($, 24, columns)).filter(([k, t]) => k !== 'sent' && (/more lines/.test(t) || /^\/placeholders show|\?$| alone |^ or |\[Enter\]/.test(t)))

  expect([await cut(84), await cut(83), await cut(59), await cut(58), await cut(47), await cut(46)], 'cut row per width').toEqual([
    [['dim', '... 11 more lines · whole text: '], ['act', '/placeholders show ++long'], ['dim', ' or '], ['act', '++long?'], ['dim', ' alone '], ['key', '[Enter]']],
    [['dim', '... 11 more lines · whole text: '], ['act', '/placeholders show ++long']],
    [['dim', '... 11 more lines · whole text: '], ['act', '/placeholders show ++long']],
    [['dim', '... 11 more lines · '], ['act', '/placeholders show ++long']],
    [['dim', '... 11 more lines · '], ['act', '/placeholders show ++long']],
    [['act', '/placeholders show ++long']],
  ])
})
