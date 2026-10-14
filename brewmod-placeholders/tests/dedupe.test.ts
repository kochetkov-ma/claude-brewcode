import { test, expect } from 'claude-code/testing'
import { BREWTOOLS_SPLIT, JOINER, assembleBlocks, compileDefs, dedupe, injectOnce } from '../hooks/lib/assemble'
import { createModeTracker } from '../hooks/lib/mode'
import { def } from './fixtures'

const blk = (token: string, body: string): string => `User typed \`${token}\` — head:\n\n${body}`
const built = (tokens: string[], text: string) => ({ tokens, text })

test('GIVEN two brewtools blocks in one entry WHEN the mod emitted both tokens THEN its text replaces them once', async () => {
  const entry = [blk('++a', 'A'), blk('++r', 'R')].join(JOINER)

  expect(dedupe([entry], built(['++a', '++r'], 'MINE')), 'result').toEqual({ entries: ['MINE'], inserted: true })
})

test('GIVEN the same token in two hooks entries WHEN the mod emitted it THEN the text lands once and no empty entry is left', async () => {
  expect(dedupe([blk('++r', 'x'), blk('++r', 'y')], built(['++r'], 'MINE')), 'result').toEqual({ entries: ['MINE'], inserted: true })
})

test('GIVEN foreign text before brewtools blocks and another entry WHEN de-duped THEN both survive in place', async () => {
  const entry = ['keep0', blk('++a', 'A'), blk('++r', 'R')].join(JOINER)

  expect(dedupe([entry, 'other'], built(['++a', '++r'], 'MINE')).entries, 'entries').toEqual([['keep0', 'MINE'].join(JOINER), 'other'])
})

test('GIVEN foreign text after a brewtools block in the SAME entry WHEN de-duped THEN it belongs to that block (only a header ends one)', async () => {
  const entry = [blk('++a', 'A'), 'tail'].join(JOINER)

  expect(dedupe([entry], built(['++a'], 'MINE')).entries, 'entries').toEqual(['MINE'])
})

test('GIVEN a token the mod left empty WHEN de-duped THEN brewtools keeps its block and nothing is inserted', async () => {
  const entry = [blk('++m', 'M'), blk('++a', 'A')].join(JOINER)

  expect(dedupe([entry], built(['++a'], 'MINE')), 'result').toEqual({ entries: [[blk('++m', 'M'), 'MINE'].join(JOINER)], inserted: true })
  expect(dedupe([blk('++m', 'M')], built(['++a'], 'MINE')), 'no overlap').toEqual({ entries: [blk('++m', 'M')], inserted: false })
})

test('GIVEN the plan cron header WHEN the mod emitted +++ THEN the block is recognised as +++', async () => {
  const cron = 'User typed `+++` in Plan mode — plan the task anti-drift cron:\n\nC'

  expect(dedupe([cron], built(['+++'], 'MINE')), 'result').toEqual({ entries: ['MINE'], inserted: true })
})

test('GIVEN a foreign header that is not a brewtools token WHEN de-duped THEN it is neither split nor dropped', async () => {
  const entry = [blk('++a', 'A'), 'User typed `++x` — foreign', blk('++r', 'R')].join(JOINER)

  expect(dedupe([entry], built(['++a', '++r', '++x'], 'MINE')).entries, 'entries').toEqual(['MINE'])
  expect(entry.split(BREWTOOLS_SPLIT).length, 'split count').toBe(2)
})

test('GIVEN no brewtools entry or only foreign ones WHEN injecting THEN the mod text is appended exactly once', async () => {
  const b = built(['++m'], 'MINE')

  expect([injectOnce(undefined, b), injectOnce([], b), injectOnce(['F1', 'F2'], b)], 'results').toEqual([['MINE'], ['MINE'], ['F1', 'F2', 'MINE']])
})

test('GIVEN a brewtools entry between foreign ones WHEN injecting THEN the order of entries is kept', async () => {
  expect(injectOnce(['F1', blk('++m', 'M'), 'F2'], built(['++m'], 'MINE')), 'entries').toEqual(['F1', 'MINE', 'F2'])
})

test('GIVEN an empty foreign entry WHEN de-duped THEN it is preserved untouched', async () => {
  expect(injectOnce(['', blk('++m', 'M')], built(['++m'], 'MINE')), 'entries').toEqual(['', 'MINE'])
})

test('GIVEN ++r and ++rr in one prompt WHEN blocks are assembled THEN only the group winner is a token', async () => {
  const c = compileDefs([def({ name: 'rr', group: 'review', priority: 2, body: 'RR' }), def({ name: 'r', group: 'review', priority: 1, body: 'R' })])

  expect(assembleBlocks(c, '++r ++rr'), 'built').toEqual({ text: 'RR', tokens: ['++rr'] })
})

test('GIVEN a suppressed token next to a live one WHEN blocks are assembled THEN the empty token is not claimed', async () => {
  const c = compileDefs([def({ name: 'm', body: '' }), def({ name: 'a', body: 'A', order: 200 })])

  expect(assembleBlocks(c, '++m ++a'), 'built').toEqual({ text: 'A', tokens: ['++a'] })
})

test('GIVEN a custom prefix WHEN blocks are assembled THEN tokens carry that prefix and the name in lowercase', async () => {
  expect(assembleBlocks(compileDefs([def({ name: 'M' })], '@@'), '@@m')?.tokens, 'tokens').toEqual(['@@m'])
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
