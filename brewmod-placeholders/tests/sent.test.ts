import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import { ROOT, bandTexts, bootBand, defaultsTree, mountBand, textsOf, typed, type Tree } from './layer-io'
import { VECTORS } from './parity/golden.generated'
import { def, defaultDefs } from './fixtures'
import type { Def } from '../hooks/lib/defs'
import { compileDefs } from '../hooks/lib/compiled'
import { PLAN_LABEL, assembleDraft, injectedContext, planParts, sentText } from '../hooks/lib/sent'

// Sent texts from the frozen v6.7.0 spec, never from the parser under test.
const vec = (id: string): string => VECTORS.find((v) => v.id === id)?.expected ?? `MISSING ${id}`
const R_SENT = vec('spec-4')
const RR_SENT = vec('spec-5')
const M_SENT = vec('spec-1')
const M_PLAN_SENT = vec('spec-2')
const PLUS_SENT = vec('spec-6')
const M_HEAD = 'User typed `++m` — Manager mode is active for this turn:'
const MP_HEAD = 'User typed `++m` — Manager + Plan Mode is active for this turn:'
const M_BODY = M_SENT.slice(M_HEAD.length + 2)
const ADDITION = M_PLAN_SENT.slice(MP_HEAD.length + 2 + M_BODY.length + 2)
// Compact head over a drawn body: the description gives way to what Claude receives.
const R_DESC = ['  Two-phase review: review every significant change, then dou…', ' · Claude receives these lines now:']
const JOINER = '\n\n---\n\n'
const CUT_NOTE = '\n...[truncated]'
const foot = (token: string) => `more: put the caret on ${token} · send as typed: ++/ · help: /placeholders help`
// Band rows of spec-4 (++r) in a 100-cell band: its source lines as sent, each under 98 cells, the blank line drawn as ' '.
const R_ROWS = [
  'User typed `++r` — Two-phase review discipline is active for this turn:',
  ' ',
  '[REVIEW DISCIPLINE: DOUBLE-CHECK]',
  'Every significant change: multi-agent review (matching reviewer expert, else',
  'general-purpose), simplification pass first.',
  '1) Review - finding = defect with path:line + evidence (failing command/input).',
  '2) Double-check - reproduce each finding.',
  '3) Fix - confirmed findings only.',
  'Big review -> split by area, never one long pass. Brief each: goal + area +',
  "acceptance, what's covered (don't re-litigate), who consumes the verdict;",
  'return verdict first, then findings.',
]
// Same for spec-5 (++rr).
const RR_ROWS = [
  'User typed `++rr` — Anti-regression review discipline is active for this turn:',
  ' ',
  '[REVIEW DISCIPLINE: ANTI-REGRESSION]',
  'Every significant phase: one review (matching reviewer expert, else',
  'general-purpose), simplification pass first.',
  'Axes: 1) no regression (primary) - existing behavior intact; 2) project',
  'standard - existing conventions/patterns; 3) functional correctness - the new',
  'functionality works.',
  'a) Review - finding = defect on an axis with path:line + evidence (failing',
  'command/input or broken caller).',
  'b) Double-check - reproduce each finding before acting.',
  'c) Fix - confirmed findings only, then re-review the fix.',
  'Task end: final cross-review across all phases, regression first.',
  'Large review -> split by area across reviewers, never one long pass. Brief',
  "each: goal + area + acceptance, what's reviewed (don't re-litigate), who",
  'consumes the verdict; return verdict first, then findings.',
]
const D = defaultDefs()

// ---- sent.ts: per token and per draft

test('GIVEN ++r and ++rr of one group WHEN the draft is assembled THEN ++r is not sent with the winner named and ++rr sends its header and body', async () => {
  expect(assembleDraft('check ++r ++rr', D, '++', false), 'draft').toStrictEqual({
    prompt: 'check ++r ++rr',
    context: RR_SENT,
    tokens: [
      { token: '++r', name: 'r', kind: 'context', text: '', headLines: 0, isSent: false, reason: 'not sent: ++rr wins' },
      { token: '++rr', name: 'rr', kind: 'context', text: RR_SENT, headLines: 1, isSent: true, reason: null },
    ],
  })
})

test('GIVEN ++m with a plan variant WHEN its text is asked outside and inside plan mode THEN each mode gives its own header and body', async () => {
  expect([sentText('m', D, '++', false), sentText('++M', D, '++', true)], 'm both modes').toStrictEqual([
    { token: '++m', name: 'm', kind: 'context', text: M_SENT, headLines: 1, isSent: true, reason: null },
    { token: '++m', name: 'm', kind: 'context', text: M_PLAN_SENT, headLines: 1, isSent: true, reason: null },
  ])
})

// ---- plan-mode parts: `plan: add` joins the part to the `always` def; any other plan def replaces it

const withM = (body: string): Def[] => D.map((d) => (d.name === 'm' && d.when === 'always' ? { ...d, body } : d))

test('GIVEN a user m.md override, an old full-text m.plan override and an empty m.md WHEN ++m is asked in plan mode THEN the override takes the addition, the old text replaces, the empty body silences ++m', async () => {
  const old = D.map(({ plan: _key, ...d }) => (d.name === 'm' && d.when === 'plan' ? { ...d, body: 'OLD FULL' } : d))

  expect([sentText('++m', withM('MY M'), '++', true), sentText('++m', old, '++', true), sentText('++m', withM(''), '++', true)], 'plan mode ++m').toStrictEqual([
    { token: '++m', name: 'm', kind: 'context', text: `${MP_HEAD}\n\nMY M\n\n${ADDITION}`, headLines: 1, isSent: true, reason: null },
    { token: '++m', name: 'm', kind: 'context', text: `${MP_HEAD}\n\nOLD FULL`, headLines: 1, isSent: true, reason: null },
    { token: '++m', name: 'm', kind: 'context', text: '', headLines: 0, isSent: false, reason: 'not sent: empty' },
  ])
})

test('GIVEN an add part without a header, one over a not-plan def, one alone and two empty parts WHEN asked in plan mode THEN normal header, no join, plan only, not sent', async () => {
  const xs = [def({ name: 'x', header: 'N {token}', body: 'X' }), def({ name: 'x', when: 'plan', plan: 'add', body: 'ADD' })]
  const np = [def({ name: 'y', when: 'not-plan', body: 'NP' }), def({ name: 'y', when: 'plan', plan: 'add', body: 'ADD' })]
  const only = [def({ name: 'z', when: 'plan', plan: 'add', header: 'Z', body: 'ONLY' })]
  const empty = [def({ name: 'e', body: '' }), def({ name: 'e', when: 'plan', plan: 'add', body: '' })]

  expect([sentText('x', xs, '++', true), sentText('y', np, '++', true), sentText('z', only, '++', true), sentText('z', only, '++', false), sentText('e', empty, '++', true)], 'texts').toStrictEqual([
    { token: '++x', name: 'x', kind: 'context', text: 'N ++x\n\nX\n\nADD', headLines: 1, isSent: true, reason: null },
    { token: '++y', name: 'y', kind: 'context', text: 'ADD', headLines: 0, isSent: true, reason: null },
    { token: '++z', name: 'z', kind: 'context', text: 'Z\n\nONLY', headLines: 1, isSent: true, reason: null },
    { token: '++z', name: 'z', kind: 'context', text: 'Z\n\nONLY', headLines: 1, isSent: false, reason: 'plan only' },
    { token: '++e', name: 'e', kind: 'context', text: '', headLines: 0, isSent: false, reason: 'not sent: empty' },
  ])
})

test('GIVEN an add part with its own order and group WHEN a plan-mode draft is assembled THEN the normal def order and group priority decide', async () => {
  const defs = [
    def({ name: 'x', order: 5, group: 'g', priority: 2, body: 'X' }),
    def({ name: 'x', when: 'plan', plan: 'add', order: 99, body: 'ADD' }),
    def({ name: 'y', order: 1, group: 'g', priority: 1, body: 'Y' }),
    def({ name: 'w', order: 7, body: 'W' }),
  ]

  expect(assembleDraft('++w ++y ++x', defs, '++', true), 'draft').toStrictEqual({
    prompt: '++w ++y ++x',
    context: `X\n\nADD${JOINER}W`,
    tokens: [
      { token: '++w', name: 'w', kind: 'context', text: 'W', headLines: 0, isSent: true, reason: null },
      { token: '++y', name: 'y', kind: 'context', text: '', headLines: 0, isSent: false, reason: 'not sent: ++x wins' },
      { token: '++x', name: 'x', kind: 'context', text: 'X\n\nADD', headLines: 0, isSent: true, reason: null },
    ],
  })
})

test('GIVEN the shipped defs and keyed variants WHEN plan parts are read THEN the key decides add, replace, only or none, never a shared prefix', async () => {
  const x = (body: string, extra: Partial<Def> = {}) => def({ name: 'x', when: 'plan', body, ...extra })
  const kinds = [
    [def({ name: 'x', body: 'A' }), x('C', { plan: 'add' })],
    [def({ name: 'x', body: 'A' }), x('A\n\nC')],
    [def({ name: 'x', body: 'A' }), x('R', { plan: 'replace', header: 'H' })],
    [x('C', { plan: 'add', header: 'H' })],
    [def({ name: 'x', when: 'not-plan', body: 'N' }), x('C', { plan: 'add' })],
    [def({ name: 'x', body: 'A', plan: 'add' })],
  ].map((defs) => planParts(defs, 'x'))

  expect({ m: planParts(D, 'M', '++'), emptyM: planParts(withM(''), 'm'), r: planParts(D, 'r'), plus: planParts(D, '+').kind, kinds }, 'plan parts').toStrictEqual({
    m: { normal: M_SENT, plan: ADDITION, kind: 'add' },
    emptyM: { normal: '', plan: '', kind: 'none' },
    r: { normal: R_SENT, plan: '', kind: 'none' },
    plus: 'only',
    kinds: [
      { normal: 'A', plan: 'C', kind: 'add' },
      { normal: 'A', plan: 'A\n\nC', kind: 'replace' },
      { normal: 'A', plan: 'H\n\nR', kind: 'replace' },
      { normal: '', plan: 'H\n\nC', kind: 'only' },
      { normal: 'N', plan: 'C', kind: 'replace' },
      { normal: 'A', plan: '', kind: 'none' },
    ],
  })
})

test('GIVEN the plan-only +++ WHEN its text is asked outside and inside plan mode THEN outside it carries the plan text unsent, inside it is sent', async () => {
  expect([sentText('+++', D, '++', false), sentText('+', D, '++', true)], 'plus both modes').toStrictEqual([
    { token: '+++', name: '+', kind: 'context', text: PLUS_SENT, headLines: 1, isSent: false, reason: 'plan only' },
    { token: '+++', name: '+', kind: 'context', text: PLUS_SENT, headLines: 1, isSent: true, reason: null },
  ])
})

test('GIVEN a not-plan def, an unknown name and a custom prefix WHEN texts are asked THEN plan mode skips the def, the name is unknown and the header carries the prefix', async () => {
  const defs = [...D, def({ name: 'np', when: 'not-plan', body: 'NP' })]

  expect([sentText('np', defs, '++', true), sentText('zz', defs, '++', false), sentText('@@r', D, '@@', false).text.split('\n')[0]], 'three asks').toStrictEqual([
    { token: '++np', name: 'np', kind: 'context', text: 'NP', headLines: 0, isSent: false, reason: 'not in plan mode' },
    { token: '++zz', name: 'zz', kind: 'none', text: '', headLines: 0, isSent: false, reason: 'unknown placeholder' },
    'User typed `@@r` — Two-phase review discipline is active for this turn:',
  ])
})

test('GIVEN an empty ++rr override WHEN ++r ++rr is assembled THEN the empty winner still holds the group and nothing is sent', async () => {
  const defs = D.map((d) => (d.name === 'rr' ? { ...d, body: '' } : d))

  expect(assembleDraft('++r ++rr', defs, '++', false), 'draft').toStrictEqual({
    prompt: '++r ++rr',
    context: '',
    tokens: [
      { token: '++r', name: 'r', kind: 'context', text: '', headLines: 0, isSent: false, reason: 'not sent: ++rr wins' },
      { token: '++rr', name: 'rr', kind: 'context', text: '', headLines: 0, isSent: false, reason: 'not sent: empty' },
    ],
  })
})

test('GIVEN inline defs WHEN drafts are assembled THEN always-inline text replaces the token, a plan inline stays, an empty one is dropped and a context twin wins', async () => {
  const defs = [
    def({ name: 'sig', insert: 'inline', body: 'SIGNED' }),
    def({ name: 'pl', insert: 'inline', when: 'plan', body: 'PL' }),
    def({ name: 'nil', insert: 'inline', body: '' }),
    def({ name: 'dual', insert: 'inline', body: 'DUAL INLINE' }),
    def({ name: 'dual', insert: 'context', body: 'DUAL CONTEXT' }),
  ]

  expect(assembleDraft('hi ++sig ++pl ++nil ++dual', defs, '++', false), 'draft').toStrictEqual({
    prompt: 'hi SIGNED ++pl ++nil ++dual',
    context: 'DUAL CONTEXT',
    tokens: [
      { token: '++sig', name: 'sig', kind: 'inline', text: 'SIGNED', headLines: 0, isSent: true, reason: null },
      { token: '++pl', name: 'pl', kind: 'inline', text: '', headLines: 0, isSent: false, reason: 'stays as typed' },
      { token: '++nil', name: 'nil', kind: 'inline', text: '', headLines: 0, isSent: false, reason: 'not sent: empty' },
      { token: '++dual', name: 'dual', kind: 'context', text: 'DUAL CONTEXT', headLines: 0, isSent: true, reason: null },
    ],
  })
})

test('GIVEN an inline body that carries a context token WHEN the draft is assembled THEN the hook sees the expanded prompt and sends that block too', async () => {
  const defs = [def({ name: 'jx', insert: 'inline', body: 'see ++cc' }), def({ name: 'cc', body: 'CC CONTEXT' })]

  expect(assembleDraft('++jx', defs, '++', false), 'draft').toStrictEqual({
    prompt: 'see ++cc',
    context: 'CC CONTEXT',
    tokens: [{ token: '++jx', name: 'jx', kind: 'inline', text: 'see ++cc', headLines: 0, isSent: true, reason: null }],
  })
})

test('GIVEN three blocks past the 9000-char cap WHEN the draft is assembled THEN the first is whole, the second cut with the note and the third not sent', async () => {
  const A = 'A'.repeat(8000)
  const B = 'B'.repeat(3000)
  const defs = [def({ name: 'c1', order: 1, body: A }), def({ name: 'c2', order: 2, body: B }), def({ name: 'c3', order: 3, body: 'C' })]
  const room = 9000 - A.length - JOINER.length

  expect(assembleDraft('++c3 ++c2 ++c1', defs, '++', false), 'draft').toStrictEqual({
    prompt: '++c3 ++c2 ++c1',
    context: A + JOINER + B.slice(0, room) + CUT_NOTE,
    tokens: [
      { token: '++c3', name: 'c3', kind: 'context', text: '', headLines: 0, isSent: false, reason: 'not sent: over 9000 chars' },
      { token: '++c2', name: 'c2', kind: 'context', text: B.slice(0, room) + CUT_NOTE, headLines: 0, isSent: true, reason: 'cut at 9000 chars' },
      { token: '++c1', name: 'c1', kind: 'context', text: A, headLines: 0, isSent: true, reason: null },
    ],
  })
})

test('GIVEN a delivery tag or a mode string other than plan WHEN the context is built THEN the hook rules hold: nothing for a delivery, PLAN is not plan', async () => {
  const delivery = assembleDraft('<task-notification> ++r', D, '++', false)

  expect(
    { delivery: [delivery.context, delivery.tokens[0]?.reason], injected: injectedContext(D, '++', '<task-notification>++m', 'plan'), upper: injectedContext(D, '++', '++m', 'PLAN') },
    'hook rules',
  ).toStrictEqual({ delivery: ['', 'not sent: delivery tag'], injected: '', upper: M_SENT })
})

test('GIVEN an inline body that brings ++/ into the prompt WHEN the draft is assembled THEN the inline text stays expanded and every context token names the marker', async () => {
  const defs = [...D, def({ name: 'skip', insert: 'inline', body: 'please ++/ ignore' })]
  const escaped = { text: '', headLines: 0, isSent: false, reason: 'not sent: ++/ in this message' }

  expect(assembleDraft('++skip ++r +++ ++m', defs, '++', false), 'draft').toStrictEqual({
    prompt: 'please ++/ ignore ++r +++ ++m',
    context: '',
    tokens: [
      { token: '++skip', name: 'skip', kind: 'inline', text: 'please ++/ ignore', headLines: 0, isSent: true, reason: null },
      { token: '++r', name: 'r', kind: 'context', ...escaped },
      { token: '+++', name: '+', kind: 'context', ...escaped },
      { token: '++m', name: 'm', kind: 'context', ...escaped },
    ],
  })
})

test('GIVEN compiled defs for this prefix, compiled defs for another prefix and a bare array WHEN drafts and contexts are built THEN each form gives the same answer', async () => {
  const c = compileDefs(D, '++')

  expect(
    { drafts: [assembleDraft('check ++r ++rr', c, '++', false), assembleDraft('@@rr', c, '@@', false)], injected: [injectedContext(c, '++', '++m', 'plan'), injectedContext(c, '@@', '@@m', 'default')] },
    'compiled forms',
  ).toStrictEqual({
    drafts: [assembleDraft('check ++r ++rr', D, '++', false), assembleDraft('@@rr', D, '@@', false)],
    injected: [M_PLAN_SENT, `User typed \`@@m\`${M_SENT.slice('User typed `++m`'.length)}`],
  })
})

test('GIVEN the plan-mode labels WHEN read THEN each is the literal the band and show print', async () => {
  expect(PLAN_LABEL, 'labels').toStrictEqual({ adds: 'plan mode adds:', instead: 'plan mode sends instead:', onlyPart: 'plan mode only:', only: 'plan only', plus: 'plan +' })
})

// ---- band: what will be sent
// Drafts end in a space: the caret off the token keeps the compact band (the caret band: focus.test.tsx).

const boot = ($: any, on: On, tree: Tree) => bootBand($, on, { tree })

test('GIVEN the literal ++r and ++rr band rows WHEN joined back THEN they are the frozen spec-4 and spec-5 texts line by line', async () => {
  const joined = (rows: string[]): string => rows.map((l) => (l === ' ' ? '' : l)).join('\n')

  expect([joined(R_ROWS), joined(RR_ROWS)], 'rows vs spec-4, spec-5').toEqual([R_SENT, RR_SENT])
})

test('GIVEN ++r and a 30-row terminal WHEN the band mounts THEN the auto view shows the header line first and the cut row names the show command', async ($, on) => {
  await boot($, on, defaultsTree())
  await typed($, '++r ')

  expect(await bandTexts($, 30), 'band').toEqual(['placeholders 1', '++r', ...R_DESC, ...R_ROWS.slice(0, 8), '... 3 more lines · whole text: /placeholders show ++r', foot('++r')])
})

test('GIVEN ++r and a 45-row terminal WHEN the band mounts THEN the auto view already shows the header line and the whole body, with no Button', async ($, on) => {
  await boot($, on, defaultsTree())
  await typed($, '++r ')
  const ui = await mountBand($, 45)

  expect([await textsOf(ui), await ui.findAll({ type: 'Button' })], 'auto band').toEqual([['placeholders 1', '++r', ...R_DESC, ...R_ROWS, foot('++r')], []])
  await ui.unmount()
})

test('GIVEN ++r and a 24-row terminal WHEN the band mounts THEN the cut row names the show command', async ($, on) => {
  await boot($, on, defaultsTree())
  await typed($, '++r ')

  expect(await bandTexts($, 24), 'band').toEqual(['placeholders 1', '++r', ...R_DESC, ...R_ROWS.slice(0, 5), '... 6 more lines · whole text: /placeholders show ++r', foot('++r')])
})

test('GIVEN ++r and ++rr of one group WHEN the band mounts THEN ++r says it is not sent and only the ++rr text shows, cut to the auto view', async ($, on) => {
  await boot($, on, defaultsTree())
  await typed($, '++r ++rr ')

  expect(await bandTexts($, 60), 'band').toEqual([
    'placeholders 2',
    '++r',
    '  Two-phase review: review every significant change, then double-check eac…',
    ' (not sent: ++rr wins)',
    '++rr',
    '  Anti-regression review: regression, project standard and f…',
    ' · Claude receives these lines now:',
    ...RR_ROWS.slice(0, 10),
    '... 6 more lines · whole text: /placeholders show ++rr',
    foot('++r'),
  ])
})

test('GIVEN ++r WHEN the band mounts THEN every sent row (header and body) is bold in the theme text colour, labels dim, and every pre-wrapped row truncates at the end', async ($, on) => {
  await boot($, on, defaultsTree())
  await typed($, '++r ')
  const ui = await mountBand($, 45)

  const props = (await ui.findAll({ type: 'Text' })).map((t: { props: unknown }) => t.props)

  const dimRow = { dimColor: true, wrap: 'truncate-end' }

  const sentRow = { color: 'text', bold: true, wrap: 'truncate-end' }

  expect(props, 'props: count, bold token, description, dim receives label, 11 sent rows bold in the text colour, foot of dim labels and underlined actions').toEqual([
    { dimColor: true },
    { color: 'suggestion', bold: true },
    dimRow,
    dimRow,
    ...Array.from({ length: 11 }, () => sentRow),
    { wrap: 'truncate-end' },
    ...[0, 1, 2].flatMap(() => [{ dimColor: true }, { color: 'text', underline: true }]),
  ])
  await ui.unmount()
})

test('GIVEN a 119-char line in a 50-cell band WHEN the band mounts THEN its 3 wrapped rows count against the budget and the cut row drops its label to keep the show command whole', async ($, on) => {
  const wide = Array.from({ length: 24 }, () => 'word').join(' ')
  await boot($, on, { ...defaultsTree(), [`${ROOT}/.claude/placeholders/wide.md`]: `---\ndescription: "wide mode"\n---\n${wide}\n- line-2\n- line-3` })
  await typed($, '++wide ')

  const w10 = 'word word word word word word word word word word'

  expect(await bandTexts($, 19, 'terminal', 52), 'texts').toEqual(['placeholders 1', '++wide', '  wide mode', ' · Claude receives these lines now:', w10, w10, 'word word word word', '... 2 more lines · /placeholders show ++wide', foot('++wide')])
})

test('GIVEN ++r ++rr in a 75-cell band WHEN the band mounts THEN the description gives way and the not-sent and receives labels stay whole on the row', async ($, on) => {
  await boot($, on, defaultsTree())
  await typed($, '++r ++rr ')

  expect(await bandTexts($, 40, 'terminal', 75), 'texts').toEqual([
    'placeholders 2',
    '++r',
    '  Two-phase review: review every significant chan…',
    ' (not sent: ++rr wins)',
    '++rr',
    '  Anti-regression review: regressio…',
    ' · Claude receives these lines now:',
    'User typed `++rr` — Anti-regression review discipline is active for this',
    'turn:',
    ' ',
    '[REVIEW DISCIPLINE: ANTI-REGRESSION]',
    'Every significant phase: one review (matching reviewer expert, else',
    'general-purpose), simplification pass first.',
    'Axes: 1) no regression (primary) - existing behavior intact; 2) project',
    'standard - existing conventions/patterns; 3) functional correctness - the',
    'new',
    'functionality works.',
    '... 8 more lines · whole text: /placeholders show ++rr',
    foot('++r'),
  ])
})
