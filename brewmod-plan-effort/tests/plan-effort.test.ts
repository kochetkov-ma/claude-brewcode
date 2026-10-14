import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

type Mode = 'plan' | 'default' | 'acceptEdits' | 'auto' | 'bypassPermissions'
type Seen = { efforts: unknown[]; calls: number }

const result = (e: { turnId: string; index: number }) =>
  ({ turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null }) as never

// bottoms: classic stubs answer {}, turn.step records the effort that reaches the engine
const bottoms = (on: On): Seen => {
  const seen: Seen = { efforts: [], calls: 0 }
  on('classic.UserPromptSubmit', () => ({}))
  on('classic.PostToolBatch', () => ({}))
  on('turn.step', async function* (_$, e) {
    seen.calls += 1
    seen.efforts.push(e.effort)
    return result(e)
  })
  return seen
}

const prompt = ($: Engine, permission_mode: Mode | undefined) =>
  $.classic.UserPromptSubmit({ prompt: 'go', permission_mode } as never)

const batch = ($: Engine, extra: Record<string, unknown> = {}) =>
  $.classic.PostToolBatch({ tool_calls: [], ...extra } as never)

const step = async ($: Engine, effort: unknown, extra: Record<string, unknown> = {}) => {
  const input = { turnId: 't1', index: 0, model: 'm', effort, messageCount: 1, ...extra } as never
  for await (const _chunk of $.turn.step(input)) {
    // drain
  }
}

const append = ($: Engine, name: string, extra: Record<string, unknown> = {}) =>
  $.session.append({
    message: { type: 'attachment', name, content: [{ type: 'text', text: name }] },
    door: 'attachment',
    origin: { kind: 'engine' },
    uuid: `u-${name}`,
    ...extra,
  } as never)

test('GIVEN a plan prompt WHEN a main step at high runs THEN the engine gets xhigh', async ($, on) => {
  const seen = bottoms(on)
  await prompt($, 'plan')
  await step($, 'high')
  expect(seen.efforts, 'plan step at high is raised to xhigh').toEqual(['xhigh'])
})

for (const mode of ['default', 'acceptEdits', 'auto', 'bypassPermissions'] as const) {
  test(`GIVEN a prompt in ${mode} mode WHEN a main step at high runs THEN the engine gets high`, async ($, on) => {
    const seen = bottoms(on)
    await prompt($, mode)
    await step($, 'high')
    expect(seen.efforts, `${mode} step stays at high`).toEqual(['high'])
  })
}

test('GIVEN plan mode WHEN steps run at each level THEN only low and medium are raised', async ($, on) => {
  const seen = bottoms(on)
  await prompt($, 'plan')
  for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) await step($, effort)
  expect(seen.efforts, 'low and medium raised, xhigh and max unchanged').toEqual(['xhigh', 'xhigh', 'xhigh', 'xhigh', 'max'])
})

test('GIVEN plan mode WHEN a numeric or absent effort steps THEN it is untouched', async ($, on) => {
  const seen = bottoms(on)
  await prompt($, 'plan')
  await step($, 3)
  await step($, undefined)
  expect(seen.efforts, 'numeric and absent effort untouched').toEqual([3, undefined])
})

test('GIVEN plan mode WHEN a subagent step runs THEN its effort is untouched', async ($, on) => {
  const seen = bottoms(on)
  await prompt($, 'plan')
  await step($, 'high', { agentId: 'a1' })
  expect(seen.efforts, 'subagent step untouched in plan mode').toEqual(['high'])
})

test('GIVEN plan then default then plan prompts WHEN steps run THEN efforts are xhigh, high, xhigh', async ($, on) => {
  const seen = bottoms(on)
  await prompt($, 'plan')
  await step($, 'high')
  await prompt($, 'default')
  await step($, 'high')
  await prompt($, 'plan')
  await step($, 'high')
  expect(seen.efforts, 'plan, default, plan follow the prompt mode').toEqual(['xhigh', 'high', 'xhigh'])
})

test('GIVEN a default prompt WHEN PostToolBatch reports plan and then default THEN the next steps follow it', async ($, on) => {
  const seen = bottoms(on)
  await prompt($, 'default')
  await batch($, { permission_mode: 'plan' })
  await step($, 'high')
  await batch($, { permission_mode: 'default' })
  await step($, 'high')
  expect(seen.efforts, 'PostToolBatch flips the mode mid-turn').toEqual(['xhigh', 'high'])
})

test('GIVEN plan mode WHEN a subagent default signal arrives THEN the mode stays plan', async ($, on) => {
  const seen = bottoms(on)
  await prompt($, 'plan')
  await batch($, { permission_mode: 'default', agent_id: 'a1' })
  await append($, 'plan_mode_exit', { agentId: 'a1' })
  await step($, 'high')
  expect(seen.efforts, 'subagent default signals ignored, mode stays plan').toEqual(['xhigh'])
})

test('GIVEN a default mode WHEN subagent plan signals arrive THEN the mode stays default', async ($, on) => {
  const seen = bottoms(on)
  await prompt($, 'default')
  await batch($, { permission_mode: 'plan', agent_id: 'a1' })
  await append($, 'plan_mode', { agentId: 'a1' })
  await step($, 'high')
  expect(seen.efforts, 'subagent plan signals ignored, mode stays default').toEqual(['high'])
})

test('GIVEN no classic hooks WHEN session.append plan_mode and plan_mode_exit rows arrive THEN the mode flips and rows pass unchanged', async ($, on) => {
  const seen = bottoms(on)
  const entered = await append($, 'plan_mode')
  await step($, 'high')
  const left = await append($, 'plan_mode_exit')
  await step($, 'high')
  expect(seen.efforts, 'plan_mode raises, plan_mode_exit restores').toEqual(['xhigh', 'high'])
  expect([entered, left], 'rows reach the store unchanged').toMatchObject([
    { message: { type: 'attachment', name: 'plan_mode', content: [{ type: 'text', text: 'plan_mode' }] }, uuid: 'u-plan_mode' },
    { message: { type: 'attachment', name: 'plan_mode_exit', content: [{ type: 'text', text: 'plan_mode_exit' }] }, uuid: 'u-plan_mode_exit' },
  ])
})

for (const [planEffort, expected] of [['max', 'max'], ['high', 'high'], ['turbo', 'xhigh']] as const) {
  test(`GIVEN planEffort ${planEffort} WHEN a plan step at medium runs THEN the engine gets ${expected}`, { options: { planEffort } }, async ($, on) => {
    const seen = bottoms(on)
    await prompt($, 'plan')
    await step($, 'medium')
    expect(seen.efforts, `planEffort ${planEffort} yields ${expected}`).toEqual([expected])
  })
}

test('GIVEN a plan step with chunks WHEN it streams THEN chunks and result pass unchanged and the bottom runs once', async ($, on) => {
  let calls = 0
  const chunks = [{ kind: 'text', index: 0, text: 'a' }, { kind: 'text', index: 0, text: 'b' }]
  on('classic.UserPromptSubmit', () => ({}))
  on('turn.step', async function* (_$, e) {
    calls += 1
    for (const c of chunks) yield c as never
    return result(e)
  })
  await prompt($, 'plan')
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

test('GIVEN plan mode WHEN a prompt carries a non-string mode THEN the state is kept', async ($, on) => {
  const seen = bottoms(on)
  await prompt($, 'plan')
  await prompt($, undefined)
  await batch($, { permission_mode: 42 })
  await step($, 'high')
  expect(seen.efforts, 'non-string mode keeps plan').toEqual(['xhigh'])
})
