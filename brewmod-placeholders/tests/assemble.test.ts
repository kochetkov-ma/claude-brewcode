import { test, expect } from 'claude-code/testing'
import { JOINER, SYNTHETIC_PROMPT, capText, compileDefs, renderHeader } from '../hooks/lib/assemble'
import { assemble, def } from './fixtures'

test('GIVEN two matched defs WHEN assembled THEN blocks sort by order, not by prompt position', async () => {
  const c = compileDefs([def({ name: 'b', order: 2, body: 'BB', header: 'hb' }), def({ name: 'a', order: 1, body: 'AA', header: 'ha' })])

  expect(assemble(c, '++b ++a'), 'output').toBe(`ha\n\nAA${JOINER}hb\n\nBB`)
})

test('GIVEN equal orders WHEN assembled THEN definition order is kept', async () => {
  const c = compileDefs([def({ name: 'x', body: '1' }), def({ name: 'y', body: '2' })])

  expect(assemble(c, '++y ++x'), 'output').toBe(`1${JOINER}2`)
})

test('GIVEN a review group WHEN both tokens appear THEN the higher priority wins whatever the def order', async () => {
  const c = compileDefs([def({ name: 'rr', group: 'review', priority: 2, body: 'RR' }), def({ name: 'r', group: 'review', priority: 1, body: 'R' })])

  expect([assemble(c, '++r ++rr'), assemble(c, '++rr ++r'), assemble(c, '++r')], 'outputs').toEqual(['RR', 'RR', 'R'])
})

test('GIVEN the group winner has an empty body WHEN assembled THEN the sibling stays suppressed', async () => {
  const c = compileDefs([def({ name: 'rr', group: 'review', priority: 2, body: '' }), def({ name: 'r', group: 'review', priority: 1, body: 'R' })])

  expect(assemble(c, '++r ++rr'), 'output').toBe(null)
})

test('GIVEN a when:plan def WHEN the mode differs or is exactly plan THEN only exact plan fires', async () => {
  const c = compileDefs([def({ name: '+', when: 'plan', body: 'CRON' })])

  expect(['plan', 'default', 'PLAN', undefined, 'auto'].map((m) => assemble(c, '+++', m)), 'outputs').toEqual(['CRON', null, null, null, null])
})

test('GIVEN a when:not-plan def WHEN the mode varies THEN it fires except in plan', async () => {
  const c = compileDefs([def({ name: 'np', when: 'not-plan', body: 'NP' })])

  expect(['plan', 'default', undefined].map((m) => assemble(c, '++np', m)), 'outputs').toEqual([null, 'NP', 'NP'])
})

test('GIVEN a plan variant of the same name WHEN the mode is plan THEN the variant replaces the base', async () => {
  const c = compileDefs([def({ name: 'm', body: 'FULL' }), def({ name: 'm', when: 'plan', body: 'PLAN' })])

  expect([assemble(c, '++m', 'plan'), assemble(c, '++m', 'default')], 'outputs').toEqual(['PLAN', 'FULL'])
})

test('GIVEN an empty plan variant WHEN the mode is plan THEN the token is suppressed with no fallback to the base', async () => {
  const c = compileDefs([def({ name: 'm', body: 'FULL' }), def({ name: 'm', when: 'plan', body: '' })])

  expect([assemble(c, '++m', 'plan'), assemble(c, '++m', 'default')], 'outputs').toEqual([null, 'FULL'])
})

test('GIVEN an inline def WHEN the classic path assembles THEN it is skipped', async () => {
  const c = compileDefs([def({ name: 'i', insert: 'inline', body: 'IN' })])

  expect(assemble(c, '++i'), 'output').toBe(null)
})

test('GIVEN a header with {token} and a custom prefix WHEN assembled THEN the canonical lowercase prefix+name is used', async () => {
  const c = compileDefs([def({ name: 'm', header: 'Typed `{token}` and `{token}`:' })], '@@')

  expect(assemble(c, '@@M'), 'output').toBe('Typed `@@m` and `@@m`:\n\nB')
})

test('GIVEN dollar patterns in a header WHEN rendered THEN they stay literal', async () => {
  expect(renderHeader("$& $1 $' {token}", '++', 'm'), 'header').toBe("$& $1 $' ++m")
})

test('GIVEN a def without a header WHEN assembled THEN the block is the bare body', async () => {
  expect(assemble(compileDefs([def({ name: 'm', body: 'ONLY' })]), '++m'), 'output').toBe('ONLY')
})

test('GIVEN synthetic delivery prompts WHEN assembled THEN nothing is produced', async () => {
  const c = compileDefs([def({ name: 'm' })])

  expect(['<task-notification>++m', ' \n <agent-message from=x>++m', '<agent-message>++m', '<TASK-NOTIFICATION>++m', 'x <task-notification>++m'].map((p) => assemble(c, p)), 'outputs').toEqual([null, null, 'B', 'B', 'B'])
})

test('GIVEN the synthetic regex WHEN inspected THEN it is the brewtools source verbatim', async () => {
  expect(SYNTHETIC_PROMPT.source, 'source').toBe('^\\s*<(?:task-notification>|agent-message\\s+from=)')
})

test('GIVEN a prompt without the prefix or a different prefix WHEN assembled THEN nothing is produced', async () => {
  const c = compileDefs([def({ name: 'm' })], '@@')

  expect([assemble(c, 'hello'), assemble(c, '++m'), assemble(c, '@@m')], 'outputs').toEqual([null, null, 'B'])
})

test('GIVEN strings around the cap WHEN capped THEN only strings above 9000 units are cut and marked', async () => {
  expect([capText('a'.repeat(9000)).length, capText('a'.repeat(9001)), capText('a'.repeat(9001)).length], 'results').toEqual([9000, 'a'.repeat(9000) + '\n...[truncated]', 9015])
})

test('GIVEN a custom cap WHEN capped THEN the marker follows the slice', async () => {
  expect(capText('abcdef', 3), 'text').toBe('abc\n...[truncated]')
})

test('GIVEN a dollar-sign body WHEN assembled THEN it is emitted verbatim', async () => {
  expect(assemble(compileDefs([def({ name: 'm', body: '$& $1 ${x}' })]), '++m'), 'output').toBe('$& $1 ${x}')
})

test('GIVEN a symbolic def with a custom prefix WHEN assembled THEN the token is prefix+name', async () => {
  const c = compileDefs([def({ name: '+', when: 'plan', body: 'C', header: 'T `{token}`:' })], '@@')

  expect([assemble(c, '@@+', 'plan'), assemble(c, '@@@', 'plan'), assemble(c, '+++', 'plan')], 'outputs').toEqual(['T `@@+`:\n\nC', null, null])
})
