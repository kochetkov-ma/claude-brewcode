import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

type Seen = { efforts: unknown[]; statuses: (string | undefined)[]; reads: string[] }
// text = state-file body; 'missing' = the read rejects like a missing file
type State = string | 'missing'

const MISSING: State = 'missing'
const mode = (m: string): string => JSON.stringify({ mode: m, ts: 1 })

const result = (e: { turnId: string; index: number }) =>
  ({ turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null }) as never

// bottoms: session.id answers S1, fs.read answers the state (state() is read per call), ui.status and turn.step record
const bottoms = (on: On, state: () => State): Seen => {
  const seen: Seen = { efforts: [], statuses: [], reads: [] }
  on('session.id', () => ({ value: 'S1' }) as never)
  on('fs.read', (_$, e) => {
    seen.reads.push(e.path)
    const s = state()
    return (s === MISSING ? { deny: 'ENOENT' } : { value: s }) as never
  })
  on('ui.status', (_$, e) => {
    seen.statuses.push(e.text)
    return { value: undefined } as never
  })
  on('turn.step', async function* (_$, e) {
    seen.efforts.push(e.effort)
    return result(e)
  })
  return seen
}

const step = async ($: Engine, effort: unknown, extra: Record<string, unknown> = {}) => {
  const input = { turnId: 't1', index: 0, model: 'm', effort, messageCount: 1, ...extra } as never
  for await (const _chunk of $.turn.step(input)) {
    // drain
  }
}

for (const m of ['default', 'acceptEdits', 'auto', 'bypassPermissions']) {
  test(`GIVEN state ${m} WHEN a main step at high runs THEN the engine gets high`, async ($, on) => {
    const seen = bottoms(on, () => mode(m))
    await step($, 'high')
    expect(seen.efforts, `${m} step stays at high`).toEqual(['high'])
  })
}

test('GIVEN state plan WHEN steps run at each level THEN all below xhigh are raised to xhigh', async ($, on) => {
  const seen = bottoms(on, () => mode('plan'))
  for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) await step($, effort)
  expect(seen.efforts, 'low, medium and high raised, xhigh and max unchanged').toEqual(['xhigh', 'xhigh', 'xhigh', 'xhigh', 'max'])
})

test('GIVEN state plan WHEN a numeric or absent effort steps THEN it is untouched', async ($, on) => {
  const seen = bottoms(on, () => mode('plan'))
  await step($, 3)
  await step($, undefined)
  expect(seen.efforts, 'numeric and absent effort untouched').toEqual([3, undefined])
})

test('GIVEN state plan WHEN a subagent step runs THEN its effort is untouched and no state is read', async ($, on) => {
  const seen = bottoms(on, () => mode('plan'))
  await step($, 'high', { agentId: 'a1' })
  expect({ efforts: seen.efforts, reads: seen.reads }, 'subagent step untouched, no read').toEqual({ efforts: ['high'], reads: [] })
})

test('GIVEN state plan WHEN a main step at high runs THEN the file read is the session mode file under the plugin root', async ($, on) => {
  const seen = bottoms(on, () => mode('plan'))
  await step($, 'high')
  expect(seen.reads.map((p) => p.slice(p.indexOf('/.state/'))), 'one read of mode-S1.json').toEqual(['/.state/mode-S1.json'])
})

test('GIVEN plan then default then plan state WHEN steps run THEN efforts are xhigh, high, xhigh', async ($, on) => {
  let current = mode('plan')
  const seen = bottoms(on, () => current)
  await step($, 'high')
  current = mode('default')
  await step($, 'high')
  current = mode('plan')
  await step($, 'high')
  expect(seen.efforts, 'every step follows the file as it stands').toEqual(['xhigh', 'high', 'xhigh'])
})

for (const [label, state] of [
  ['missing', MISSING],
  ['corrupt JSON', '{not json'],
  ['empty', ''],
  ['JSON null', 'null'],
  ['non-string mode', JSON.stringify({ mode: 42 })],
  ['no mode key', JSON.stringify({ ts: 1 })],
] as const) {
  test(`GIVEN a ${label} state file WHEN a main step at high runs THEN it fails open at high with no status`, async ($, on) => {
    const seen = bottoms(on, () => state)
    await step($, 'high')
    expect({ efforts: seen.efforts, statuses: seen.statuses }, `${label} state leaves effort and status alone`).toEqual({ efforts: ['high'], statuses: [] })
  })
}

for (const [planEffort, expected] of [['max', 'max'], ['high', 'high']] as const) {
  test(`GIVEN planEffort ${planEffort} WHEN a plan step at medium runs THEN the engine gets ${expected}`, { options: { planEffort } }, async ($, on) => {
    const seen = bottoms(on, () => mode('plan'))
    await step($, 'medium')
    expect(seen.efforts, `planEffort ${planEffort} yields ${expected}`).toEqual([expected])
  })
}

test('GIVEN planEffort turbo outside the manifest options WHEN a plan step at medium runs THEN the engine supplies the default xhigh', { options: { planEffort: 'turbo' } }, async ($, on) => {
  const seen = bottoms(on, () => mode('plan'))
  await step($, 'medium')
  expect(seen.efforts, 'engine reads an unknown option as the manifest default').toEqual(['xhigh'])
})

test('GIVEN a throwing ui.status handler WHEN a plan step at high runs THEN the engine still gets xhigh', async ($, on) => {
  const seen: Seen = { efforts: [], statuses: [], reads: [] }
  on('session.id', () => ({ value: 'S1' }) as never)
  on('fs.read', () => ({ value: mode('plan') }) as never)
  on('ui.status', () => {
    throw new Error('status failed')
  })
  on('turn.step', async function* (_$, e) {
    seen.efforts.push(e.effort)
    return result(e)
  })
  await step($, 'high')
  expect(seen.efforts, 'a failing status handler does not reach the mod').toEqual(['xhigh'])
})

test('GIVEN a plan step with chunks WHEN it streams THEN chunks and result pass unchanged and the bottom runs once', async ($, on) => {
  let calls = 0
  const chunks = [{ kind: 'text', index: 0, text: 'a' }, { kind: 'text', index: 0, text: 'b' }]
  on('session.id', () => ({ value: 'S1' }) as never)
  on('fs.read', () => ({ value: mode('plan') }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  on('turn.step', async function* (_$, e) {
    calls += 1
    for (const c of chunks) yield c as never
    return result(e)
  })
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'm', effort: 'high', messageCount: 1 } as never)
  const got: unknown[] = []
  let next = await stream.next()
  while (next.done !== true) {
    got.push(next.value)
    next = await stream.next()
  }
  const final = next.value
  expect(got, 'chunks pass through in order').toEqual(chunks)
  expect(final, 'result passes through unchanged').toEqual({ turnId: 't1', index: 0, answer: '', toolUses: [], stopReason: null, usage: null })
  expect(calls, 'bottom called once').toBe(1)
})

test('GIVEN a pinned status WHEN the state leaves plan THEN the status is cleared once and not repeated', async ($, on) => {
  let current = mode('plan')
  const seen = bottoms(on, () => current)
  await step($, 'high')
  await step($, 'high')
  current = mode('default')
  await step($, 'high')
  await step($, 'high')
  expect(seen.statuses, 'set once, cleared once').toEqual(['plan: xhigh', undefined])
})

test('GIVEN statusLine false WHEN plan raises and leaves THEN status is never touched and effort still raised', { options: { statusLine: false } }, async ($, on) => {
  let current = mode('plan')
  const seen = bottoms(on, () => current)
  await step($, 'high')
  current = mode('default')
  await step($, 'high')
  expect({ statuses: seen.statuses, efforts: seen.efforts }, 'no set, no clear, raise unaffected').toEqual({ statuses: [], efforts: ['xhigh', 'high'] })
})

test('GIVEN a pinned status WHEN a main step already at xhigh runs THEN the status is cleared', async ($, on) => {
  const seen = bottoms(on, () => mode('plan'))
  await step($, 'high')
  await step($, 'xhigh')
  expect(seen.statuses, 'no raise, no indicator').toEqual(['plan: xhigh', undefined])
})

test('GIVEN a pinned status WHEN a subagent step runs in plan state THEN the status is left alone', async ($, on) => {
  const seen = bottoms(on, () => mode('plan'))
  await step($, 'high')
  await step($, 'high', { agentId: 'a1' })
  await step($, 'xhigh', { agentId: 'a1' })
  expect(seen.statuses, 'subagent steps neither set nor clear').toEqual(['plan: xhigh'])
})

test('GIVEN default state WHEN steps run THEN the status is never set or cleared', async ($, on) => {
  const seen = bottoms(on, () => mode('default'))
  await step($, 'high')
  await step($, 'high')
  expect(seen.statuses, 'nothing set means nothing cleared').toEqual([])
})

test('GIVEN planEffort max WHEN two plan steps run THEN the status names the target once', { options: { planEffort: 'max' } }, async ($, on) => {
  const seen = bottoms(on, () => mode('plan'))
  await step($, 'high')
  await step($, 'medium')
  expect(seen.statuses, 'status carries the configured target, set once').toEqual(['plan: max'])
})
