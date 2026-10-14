import { test, expect } from 'claude-code/testing'
import { BREWTOOLS_SPLIT, JOINER, applyBuilt, assembleBlocks, compileDefs, dedupe } from '../hooks/lib/assemble'
import { createModeTracker } from '../hooks/lib/mode'
import { def } from './fixtures'

const blk = (token: string, body: string): string => `User typed \`${token}\` — head:\n\n${body}`
const built = (tokens: string[], text: string) => ({ tokens, text })

test('GIVEN two brewtools blocks in one entry WHEN the mod emitted both tokens THEN its text replaces them once', async () => {
  const entry = [blk('++a', 'A'), blk('++r', 'R')].join(JOINER)

  expect(dedupe([entry], built(['++a', '++r'], 'MINE')), 'result').toEqual({ entries: ['MINE'], dropped: true })
})

test('GIVEN the same token in two hooks entries WHEN the mod emitted it THEN the text lands once and no empty entry is left', async () => {
  expect(dedupe([blk('++r', 'x'), blk('++r', 'y')], built(['++r'], 'MINE')), 'result').toEqual({ entries: ['MINE'], dropped: true })
})

test('GIVEN foreign text before brewtools blocks and another entry WHEN de-duped THEN both survive in place', async () => {
  const entry = ['keep0', blk('++a', 'A'), blk('++r', 'R')].join(JOINER)

  expect(dedupe([entry, 'other'], built(['++a', '++r'], 'MINE')).entries, 'entries').toEqual([['keep0', 'MINE'].join(JOINER), 'other'])
})

test('GIVEN foreign text after a brewtools block in the SAME entry WHEN de-duped THEN it belongs to that block (only a header ends one)', async () => {
  const entry = [blk('++a', 'A'), 'tail'].join(JOINER)

  expect(dedupe([entry], built(['++a'], 'MINE')).entries, 'entries').toEqual(['MINE'])
})

test('GIVEN a claimed token with no text beside a brewtools token it does not own WHEN de-duped THEN only the claimed block goes', async () => {
  const entry = [blk('++m', 'M'), blk('++a', 'A')].join(JOINER)

  expect(dedupe([entry], built(['++a'], '')), 'dropped').toEqual({ entries: [blk('++m', 'M')], dropped: true })
  expect(dedupe([blk('++m', 'M')], built(['++a'], 'MINE')), 'no overlap').toEqual({ entries: [blk('++m', 'M')], dropped: false })
})

test('GIVEN claimed tokens with no text WHEN every block is dropped THEN no empty entry is left', async () => {
  expect(dedupe([blk('++m', 'M'), [blk('++a', 'A'), blk('++r', 'R')].join(JOINER)], built(['++m', '++a', '++r'], '')), 'result').toEqual({ entries: [], dropped: true })
})

test('GIVEN text and several claimed blocks across entries WHEN de-duped THEN the text lands once at the first dropped block', async () => {
  const entries = ['F0', [blk('++a', 'A'), blk('++m', 'M')].join(JOINER), blk('++r', 'R')]

  expect(dedupe(entries, built(['++m', '++a', '++r'], 'MINE')).entries, 'entries').toEqual(['F0', 'MINE'])
})

test('GIVEN the plan cron header WHEN the mod emitted +++ THEN the block is recognised as +++', async () => {
  const cron = 'User typed `+++` in Plan mode — plan the task anti-drift cron:\n\nC'

  expect(dedupe([cron], built(['+++'], 'MINE')), 'result').toEqual({ entries: ['MINE'], dropped: true })
})

test('GIVEN a foreign header that is not a brewtools token WHEN de-duped THEN it is neither split nor dropped', async () => {
  const entry = [blk('++a', 'A'), 'User typed `++x` — foreign', blk('++r', 'R')].join(JOINER)

  expect(dedupe([entry], built(['++a', '++r', '++x'], 'MINE')).entries, 'entries').toEqual(['MINE'])
  expect(entry.split(BREWTOOLS_SPLIT).length, 'split count').toBe(2)
})

test('GIVEN no brewtools entry or only foreign ones WHEN applied THEN the mod text is appended exactly once', async () => {
  const b = built(['++m'], 'MINE')

  expect([applyBuilt({}, b), applyBuilt({ additionalContext: [] }, b), applyBuilt({ additionalContext: ['F1', 'F2'] }, b)], 'results').toEqual([
    { additionalContext: ['MINE'] },
    { additionalContext: ['MINE'] },
    { additionalContext: ['F1', 'F2', 'MINE'] },
  ])
})

test('GIVEN a brewtools entry between foreign ones WHEN applied THEN the order of entries is kept', async () => {
  expect(applyBuilt({ additionalContext: ['F1', blk('++m', 'M'), 'F2'] }, built(['++m'], 'MINE')), 'result').toEqual({ additionalContext: ['F1', 'MINE', 'F2'] })
})

test('GIVEN an empty foreign entry WHEN applied THEN it is preserved untouched', async () => {
  expect(applyBuilt({ additionalContext: ['', blk('++m', 'M')] }, built(['++m'], 'MINE')), 'result').toEqual({ additionalContext: ['', 'MINE'] })
})

test('GIVEN claimed tokens with no text WHEN applied THEN nothing is added, a dropped block leaves foreign keys and entries, and the empty key goes', async () => {
  const none = built(['++a'], '')
  const bare: { sessionTitle: string; additionalContext?: string[] } = { sessionTitle: 'T' }

  expect([applyBuilt(bare, none) === bare, applyBuilt({ additionalContext: ['F1'] }, none), applyBuilt({ sessionTitle: 'T', additionalContext: [blk('++a', 'A')] }, none)], 'results').toEqual([
    true,
    { additionalContext: ['F1'] },
    { sessionTitle: 'T' },
  ])
})

test('GIVEN ++r and ++rr in one prompt WHEN blocks are assembled THEN only the winner has text and the loser is still claimed', async () => {
  const c = compileDefs([def({ name: 'rr', group: 'review', priority: 2, body: 'RR' }), def({ name: 'r', group: 'review', priority: 1, body: 'R' })])

  expect(assembleBlocks(c, '++r ++rr'), 'built').toEqual({ text: 'RR', tokens: ['++rr', '++r'] })
})

test('GIVEN a suppressed token next to a live one WHEN blocks are assembled THEN the empty token is claimed without text', async () => {
  const c = compileDefs([def({ name: 'm', body: '' }), def({ name: 'a', body: 'A', order: 200 })])

  expect(assembleBlocks(c, '++m ++a'), 'built').toEqual({ text: 'A', tokens: ['++m', '++a'] })
})

test('GIVEN a custom prefix WHEN blocks are assembled THEN claimed tokens carry that prefix and the name in lowercase', async () => {
  expect(assembleBlocks(compileDefs([def({ name: 'M' })], '@@'), '@@m')?.tokens, 'tokens').toEqual(['@@m'])
})

test('GIVEN a def that emits nothing in this mode, an empty def and an inline def WHEN matched THEN each is claimed with empty text', async () => {
  const c = compileDefs([def({ name: 'p', when: 'plan' }), def({ name: 'e', body: '' }), def({ name: 'i', insert: 'inline' }), def({ name: 'u' })])

  expect(
    [assembleBlocks(c, '++p', 'default'), assembleBlocks(c, '++e'), assembleBlocks(c, '++i'), assembleBlocks(c, '++p ++e ++i', 'default')],
    'built',
  ).toEqual([
    { text: '', tokens: ['++p'] },
    { text: '', tokens: ['++e'] },
    { text: '', tokens: ['++i'] },
    { text: '', tokens: ['++p', '++e', '++i'] },
  ])
})

test('GIVEN names the prompt does not carry or a prefix of another kind WHEN assembled THEN nothing is claimed', async () => {
  const c = compileDefs([def({ name: 'm', body: '' }), def({ name: 'a', when: 'plan' })])

  expect([assembleBlocks(c, '++z hello', 'default'), assembleBlocks(c, 'i++m', 'default'), assembleBlocks(c, '@@m', 'default')], 'built').toEqual([null, null, null])
})

test('GIVEN classic payloads from main and a subagent WHEN tracked THEN only the main loop moves the mode', async () => {
  const t = createModeTracker()
  t.classic({ permission_mode: 'plan' })
  t.classic({ permission_mode: 'default', agent_id: 'a1' })
  const afterSub = t.isPlan()
  t.classic({ permission_mode: 7 })
  t.classic({})
  const afterJunk = t.isPlan()
  t.classic({ permission_mode: 'acceptEdits' })

  expect([afterSub, afterJunk, t.isPlan()], 'states').toEqual([true, true, false])
})

test('GIVEN session.append rows WHEN tracked THEN main plan_mode flips it on, plan_mode_exit off, subagent and other rows are ignored', async () => {
  const t = createModeTracker()
  const row = (name: string, type = 'attachment', agentId?: string) => ({ agentId, message: { type, name } })
  t.append(row('plan_mode', 'attachment', 'a1'))
  const sub = t.isPlan()
  t.append(row('plan_mode', 'user'))
  const wrongType = t.isPlan()
  t.append(row('plan_mode'))
  const on = t.isPlan()
  t.append(row('plan_mode_exit', 'attachment', 'a1'))
  const subExit = t.isPlan()
  t.append(row('plan_mode_exit'))

  expect([sub, wrongType, on, subExit, t.isPlan()], 'states').toEqual([false, false, true, true, false])
})
