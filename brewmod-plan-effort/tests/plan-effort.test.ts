import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

type Seen = { efforts: unknown[]; toasts: string[]; reads: string[]; kv: Record<string, unknown>; sets: unknown[] }
// text = state-file body; 'missing' = the read rejects like a missing file
type State = string | 'missing'

const MISSING: State = 'missing'
const mode = (m: string): string => JSON.stringify({ mode: m, ts: 1 })
const OWN = { plugin: 'brewmod-plan-effort@inline', tier: 'user' } as const
const row = (value: string) => ({ key: 'brewmod-plan-effort.planEffort', label: 'Plan effort', kind: 'choice', value, options: ['medium', 'high', 'xhigh', 'max'], provider: OWN, isLocked: false }) as never
const TOAST = 'plan mode · effort raised to xhigh'

const result = (e: { turnId: string; index: number }) =>
  ({ turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null }) as never

// bottoms: session.id answers S1, fs.read answers the state (read per call), $.state is a versioned in-memory map honouring ifVersion, ui.toast and turn.step record
const bottoms = (on: On, state: () => State, onToast?: (text: string) => void): Seen => {
  const seen: Seen = { efforts: [], toasts: [], reads: [], kv: {}, sets: [] }
  const versions: Record<string, number> = {}
  on('session.id', () => ({ value: 'S1' }) as never)
  on('fs.read', (_$, e) => {
    seen.reads.push(e.path)
    const s = state()
    return (s === MISSING ? { deny: 'ENOENT' } : { value: s }) as never
  })
  on('state.get', (_$, e) => ({ value: { value: seen.kv[e.key], version: versions[e.key] ?? 0 } }) as never)
  on('state.set', (_$, e) => {
    const version = versions[e.key] ?? 0
    if (e.ifVersion !== undefined && e.ifVersion !== version) return { value: { isSet: false, version } } as never
    seen.kv[e.key] = e.value
    versions[e.key] = version + 1
    return { value: { isSet: true, version: version + 1 } } as never
  })
  on('ui.toast', (_$, e) => {
    ;(onToast ?? ((text: string) => seen.toasts.push(text)))(e.text)
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

test('GIVEN state plan WHEN a main step runs with a path-traversal session id THEN no file is read and effort is untouched', async ($, on) => {
  const reads: string[] = []
  const efforts: unknown[] = []
  on('session.id', () => ({ value: '../evil' }) as never)
  on('fs.read', (_$, e) => {
    reads.push(e.path)
    return { value: mode('plan') } as never
  })
  on('turn.step', async function* (_$, e) {
    efforts.push(e.effort)
    return result(e)
  })
  await step($, 'high')
  expect({ efforts, reads }, 'unsafe id: no read, no raise').toEqual({ efforts: ['high'], reads: [] })
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
  test(`GIVEN a ${label} state file WHEN a main step at high runs THEN it fails open at high with no toast`, async ($, on) => {
    const seen = bottoms(on, () => state)
    await step($, 'high')
    expect({ efforts: seen.efforts, toasts: seen.toasts }, `${label} state leaves effort and toast alone`).toEqual({ efforts: ['high'], toasts: [] })
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

test('GIVEN a plan step with chunks WHEN it streams THEN chunks and result pass unchanged and the bottom runs once', async ($, on) => {
  let calls = 0
  const chunks = [{ kind: 'text', index: 0, text: 'a' }, { kind: 'text', index: 0, text: 'b' }]
  on('session.id', () => ({ value: 'S1' }) as never)
  on('fs.read', () => ({ value: mode('plan') }) as never)
  on('state.get', () => ({ value: { value: undefined, version: 0 } }) as never)
  on('state.set', () => ({ value: { isSet: true, version: 1 } }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('turn.step', async function* (_$, e) {
    calls += 1
    for (const c of chunks) yield c as never
    return result(e)
  })
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'm', effort: 'high', messageCount: 1 } as never)
  const first = await stream.next()
  const second = await stream.next()
  const last = await stream.next()
  expect({ chunks: [first.value, second.value], done: [first.done, second.done, last.done], final: last.value }, 'chunks in order, then the unchanged result').toEqual({
    chunks,
    done: [false, false, true],
    final: { turnId: 't1', index: 0, answer: '', toolUses: [], stopReason: null, usage: null },
  })
  expect(calls, 'bottom called once').toBe(1)
})

test('GIVEN a plan visit WHEN several main steps run THEN one toast fires on the first raised step', async ($, on) => {
  const seen = bottoms(on, () => mode('plan'))
  await step($, 'high')
  await step($, 'high')
  await step($, 'medium')
  expect(seen.toasts, 'one toast per visit').toEqual([TOAST])
})

test('GIVEN plan, default, plan WHEN steps run THEN each plan visit toasts once', async ($, on) => {
  let current = mode('plan')
  const seen = bottoms(on, () => current)
  await step($, 'high')
  current = mode('default')
  await step($, 'high')
  current = mode('plan')
  await step($, 'high')
  await step($, 'high')
  expect(seen.toasts, 'toast per visit, reset by the non-plan step').toEqual([TOAST, TOAST])
})

test('GIVEN a toast already shown in state WHEN the module is reloaded and a plan step runs THEN no second toast', async ($, on) => {
  const seen = bottoms(on, () => mode('plan'))
  seen.kv.toasted = true
  await step($, 'high')
  expect(seen.toasts, 'reload-safe: the flag lives in $.state').toEqual([])
})

test('GIVEN planEffort max WHEN a plan step runs THEN the toast names max', { options: { planEffort: 'max' } }, async ($, on) => {
  const seen = bottoms(on, () => mode('plan'))
  await step($, 'high')
  expect(seen.toasts, 'toast carries the configured target').toEqual(['plan mode · effort raised to max'])
})

test('GIVEN a main plan step already at xhigh WHEN it runs THEN no toast and the effort is kept', async ($, on) => {
  const seen = bottoms(on, () => mode('plan'))
  await step($, 'xhigh')
  expect({ toasts: seen.toasts, efforts: seen.efforts }, 'not raised, no hint').toEqual({ toasts: [], efforts: ['xhigh'] })
})

test('GIVEN a toasted plan visit WHEN numeric, absent and xhigh main steps run mid-visit THEN the toast flag stays and a later raised step does not toast again', async ($, on) => {
  const seen = bottoms(on, () => mode('plan'))
  await step($, 'high')
  await step($, 3)
  await step($, undefined)
  await step($, 'xhigh')
  await step($, 'high')
  expect({ toasts: seen.toasts, toasted: seen.kv.toasted }, 'one toast, flag still set').toEqual({ toasts: [TOAST], toasted: true })
})

test('GIVEN a subagent plan step WHEN it runs THEN no toast and no session effort is recorded', async ($, on) => {
  const seen = bottoms(on, () => mode('plan'))
  await step($, 'high', { agentId: 'a1' })
  expect({ toasts: seen.toasts, kv: seen.kv }, 'subagent steps leave hint and state alone').toEqual({ toasts: [], kv: {} })
})

test('GIVEN a throwing ui.toast handler WHEN a plan step at high runs THEN the engine still gets xhigh', async ($, on) => {
  const seen = bottoms(on, () => mode('plan'), () => {
    throw new Error('toast failed')
  })
  await step($, 'high')
  expect(seen.efforts, 'a failing toast does not cost the raise').toEqual(['xhigh'])
})

test('GIVEN main steps at high then medium WHEN they run THEN the last main effort is kept in state', async ($, on) => {
  const seen = bottoms(on, () => mode('default'))
  await step($, 'high')
  await step($, 'medium')
  expect(seen.kv.session, 'session effort tracked as the original, not the raised one').toBe('medium')
})

// ---- /plan-effort command

const call = (args: string) =>
  ({ command: 'plan-effort', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } }) as never

const USAGE = '/plan-effort <level>   set the plan-mode effort\n/plan-effort           show this status'

// config bottoms: rows answers config.list, setTo answers config.set (recording the call)
const configBottoms = (on: On, seen: Seen, rows: () => unknown[], setTo: () => { value?: string; deny?: string }) => {
  on('config.list', () => ({ value: rows() }) as never)
  on('config.set', (_$, e) => {
    seen.sets.push({ key: e.key, value: e.value })
    return setTo() as never
  })
}

for (const args of ['', 'status']) {
  test(`GIVEN args '${args}' in plan mode with session high WHEN the command runs THEN the status block comes back`, async ($, on) => {
    const seen = bottoms(on, () => mode('plan'))
    seen.kv.session = 'high'
    configBottoms(on, seen, () => [row('xhigh')], () => ({ value: 'xhigh' }))
    const out = await $.command.run(call(args))
    expect(out.text, 'status and usage').toBe(
      ['status', 'plan effort  xhigh  (medium | high | xhigh | max)', 'session      high   -> raised to xhigh in plan mode', 'mode now     plan', USAGE].join('\n'),
    )
  })
}

test('GIVEN help in plan mode with session high WHEN the command runs THEN the head says what the mod does and the status rows follow', async ($, on) => {
  const seen = bottoms(on, () => mode('plan'))
  seen.kv.session = 'high'
  configBottoms(on, seen, () => [row('xhigh')], () => ({ value: 'xhigh' }))
  const out = await $.command.run(call('help'))
  expect(out.text, 'help head, status and usage').toBe(
    ['help · in plan mode, main-session requests below the plan effort are sent at it; never lowered; subagents and the session effort setting are left alone', 'plan effort  xhigh  (medium | high | xhigh | max)', 'session      high   -> raised to xhigh in plan mode', 'mode now     plan', USAGE].join('\n'),
  )
})

test('GIVEN session max and no state file WHEN status runs THEN not raised and mode unknown', async ($, on) => {
  const seen = bottoms(on, () => MISSING)
  seen.kv.session = 'max'
  configBottoms(on, seen, () => [row('xhigh')], () => ({ value: 'xhigh' }))
  const out = await $.command.run(call(''))
  expect(out.text, 'not raised, unknown mode').toBe(
    ['status', 'plan effort  xhigh  (medium | high | xhigh | max)', 'session      max    not raised, session already >= plan effort', 'mode now     unknown until the next prompt', USAGE].join('\n'),
  )
})

test('GIVEN no session effort seen yet WHEN status runs THEN the session line says n/a', async ($, on) => {
  const seen = bottoms(on, () => mode('default'))
  configBottoms(on, seen, () => [row('high')], () => ({ value: 'high' }))
  const out = await $.command.run(call('status'))
  expect(out.text, 'n/a session, plan effort from the row').toBe(
    ['status', 'plan effort  high   (medium | high | xhigh | max)', 'session      n/a until the next request', 'mode now     default', USAGE].join('\n'),
  )
})

for (const args of ['max', 'set max', 'MAX']) {
  test(`GIVEN args '${args}' WHEN the command runs THEN config.set gets the own row and the reply shows old -> new`, async ($, on) => {
    const seen = bottoms(on, () => mode('default'))
    configBottoms(on, seen, () => [row('xhigh')], () => ({ value: 'max' }))
    const out = await $.command.run(call(args))
    expect({ sets: seen.sets, text: out.text }, 'one set on the own key, then old -> new with the new status').toEqual({
      sets: [{ key: 'brewmod-plan-effort.planEffort', value: 'max' }],
      text: ['plan effort: xhigh -> max', 'plan effort  max    (medium | high | xhigh | max)', 'session      n/a until the next request', 'mode now     default', USAGE].join('\n'),
    })
  })
}

test('GIVEN a deny from config.set WHEN a level is set THEN the deny text and the usage come back', async ($, on) => {
  const seen = bottoms(on, () => mode('default'))
  configBottoms(on, seen, () => [row('xhigh')], () => ({ deny: 'takes one of: medium, high, xhigh, max' }))
  const out = await $.command.run(call('high'))
  expect(out.text, 'deny verbatim + usage').toBe(`takes one of: medium, high, xhigh, max\n${USAGE}`)
})

test('GIVEN an unknown argument WHEN the command runs THEN unknown, status and usage come back and nothing is set', async ($, on) => {
  const seen = bottoms(on, () => mode('default'))
  configBottoms(on, seen, () => [row('xhigh')], () => ({ value: 'xhigh' }))
  const out = await $.command.run(call('turbo'))
  expect({ sets: seen.sets, text: out.text }, 'rejected before any set').toEqual({
    sets: [],
    text: ["unknown 'turbo'", 'plan effort  xhigh  (medium | high | xhigh | max)', 'session      n/a until the next request', 'mode now     default', USAGE].join('\n'),
  })
})

test('GIVEN no /config row for the mod (headless) WHEN a level is set THEN a clear /config message comes back and nothing is set', async ($, on) => {
  const seen = bottoms(on, () => mode('default'))
  configBottoms(on, seen, () => [], () => ({ value: 'max' }))
  const out = await $.command.run(call('max'))
  expect({ sets: seen.sets, text: out.text }, 'no row, no set, /config hint').toEqual({
    sets: [],
    text: [
      'plan effort: cannot set it here (no /config row, e.g. under -p) · set: /config in an interactive session, or settings.json pluginConfigs',
      'plan effort  xhigh  (medium | high | xhigh | max)',
      'session      n/a until the next request',
      'mode now     default',
      USAGE,
    ].join('\n'),
  })
})

test('GIVEN another plugin row also ending in .planEffort WHEN a level is set THEN only the own row is written', async ($, on) => {
  const seen = bottoms(on, () => mode('default'))
  const other = { ...(row('xhigh') as object), key: 'other.planEffort', provider: { plugin: 'other@market', tier: 'user' } } as never
  configBottoms(on, seen, () => [other, row('xhigh')], () => ({ value: 'high' }))
  await $.command.run(call('high'))
  expect(seen.sets, 'own key only').toEqual([{ key: 'brewmod-plan-effort.planEffort', value: 'high' }])
})

// ---- plan-mode row above the prompt

const ROW = 'plan mode · effort xhigh for this mode · change: /plan-effort <level>'
const LEFT_HINT = 'plan mode on (shift+tab to cycle)'
const SURFACES = ['terminal', 'desktop'] as const
const bandProps = (hasSurvey = false) => ({ hasSurvey, isWorking: false, maxRows: 24, bodyColumns: 100, scroll: { bodyRows: 23, offset: 0, total: 0 }, view: {} })
// Stands for a plugin or the engine beneath: one BELOW text per drawing
const beneath = (on: On) => on('ui.render', ($$, e) => $$.ui.resolve(e).Text({ children: 'BELOW' }))
type Surface = (typeof SURFACES)[number]
const bandTexts = async ($: Engine, surface: Surface = 'terminal', hasSurvey = false): Promise<string[]> => {
  const ui = await $.ui.mount({ plugin: 'brewmod-plan-effort', surface, component: 'AbovePrompt', props: bandProps(hasSurvey) } as never)
  const texts = (await ui.findAll({ type: 'Text' })).map((t: { text: string }) => t.text)
  await ui.unmount()
  return texts
}
const drawHint = async ($: Engine, hint: string) => {
  const ui = await $.ui.mount({ plugin: 'brewmod-plan-effort', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint } } as never)
  await ui.unmount()
}

for (const surface of SURFACES) {
  test(`GIVEN a plan step at high on ${surface} WHEN the band draws THEN the plan row sits above what is beneath`, async ($, on) => {
    bottoms(on, () => mode('plan'))
    beneath(on)
    await step($, 'high')
    expect(await bandTexts($, surface), 'row first, beneath kept').toEqual([ROW, 'BELOW'])
  })
}

test('GIVEN a plan step at high WHEN the band draws THEN the row is in the theme plan-mode colour', async ($, on) => {
  bottoms(on, () => mode('plan'))
  beneath(on)
  await step($, 'high')
  const ui = await $.ui.mount({ plugin: 'brewmod-plan-effort', surface: 'terminal', component: 'AbovePrompt', props: bandProps() } as never)
  const found = await ui.findAll({ type: 'Text', text: /^plan mode/ })
  await ui.unmount()
  expect(found.map((t: { props: { color?: unknown } }) => t.props.color), 'one plan-mode row').toEqual(['planMode'])
})

for (const [effort, planEffort, text] of [
  ['max', 'xhigh', 'plan mode · effort max, already >= xhigh'],
  ['xhigh', 'xhigh', 'plan mode · effort xhigh, already >= xhigh'],
  ['medium', 'max', 'plan mode · effort max for this mode · change: /plan-effort <level>'],
  [undefined, 'xhigh', 'plan mode · effort not raised: model takes no effort level'],
  [3, 'xhigh', 'plan mode · effort not raised: 3 is not an effort level'],
] as const) {
  test(`GIVEN a plan step at ${String(effort)} and planEffort ${planEffort} WHEN the band draws THEN the row says ${text}`, { options: { planEffort } }, async ($, on) => {
    bottoms(on, () => mode('plan'))
    beneath(on)
    await step($, effort)
    expect(await bandTexts($), 'truthful row variant').toEqual([text, 'BELOW'])
  })
}

for (const m of ['default', 'acceptEdits', 'auto', 'bypassPermissions']) {
  test(`GIVEN a ${m} step WHEN the band draws THEN no row, only what is beneath`, async ($, on) => {
    bottoms(on, () => mode(m))
    beneath(on)
    await step($, 'high')
    expect(await bandTexts($), 'no plan row').toEqual(['BELOW'])
  })
}

// Records the maxRows each drawing beneath was given
const sizedBeneath = (on: On): number[] => {
  const got: number[] = []
  on('ui.render', ($$, e) => {
    got.push((e.props as { maxRows: number }).maxRows)
    return $$.ui.resolve(e).Text({ children: 'BELOW' })
  })
  return got
}

test('GIVEN a plan row, no row and a survey WHEN the band draws at 24 rows THEN beneath gets 23, 24 and 24 rows', async ($, on) => {
  let m = 'plan'
  bottoms(on, () => mode(m))
  const got = sizedBeneath(on)
  await step($, 'high')
  await bandTexts($)
  m = 'default'
  await step($, 'high')
  await bandTexts($)
  m = 'plan'
  await step($, 'high')
  await bandTexts($, 'terminal', true)

  expect(got, 'the row takes one row from the band beneath').toEqual([23, 24, 24])
})

test('GIVEN no step yet WHEN the band draws THEN no row', async ($, on) => {
  bottoms(on, () => mode('plan'))
  beneath(on)
  expect(await bandTexts($), 'row waits for the first prompt').toEqual(['BELOW'])
})

test('GIVEN a subagent plan step only WHEN the band draws THEN no row', async ($, on) => {
  bottoms(on, () => mode('plan'))
  beneath(on)
  await step($, 'high', { agentId: 'a1' })
  expect(await bandTexts($), 'subagent steps say nothing about the main mode').toEqual(['BELOW'])
})

test('GIVEN a plan row WHEN a survey holds the band THEN the row yields', async ($, on) => {
  bottoms(on, () => mode('plan'))
  beneath(on)
  await step($, 'high')
  expect(await bandTexts($, 'terminal', true), 'survey only').toEqual(['BELOW'])
})

test('GIVEN a plan row WHEN the hint line names plan mode as left THEN the row is gone after the timer', async ($, on) => {
  const clock = mock.clock(on)
  bottoms(on, () => mode('plan'))
  beneath(on)
  await step($, 'high')
  await drawHint($, LEFT_HINT)
  await clock.advance(0)
  expect(await bandTexts($), 'row dropped on Shift+Tab out').toEqual(['BELOW'])
})

for (const hint of ['accept edits on (shift+tab to cycle)', 'manual mode on', '(shift+tab to cycle)', '', 'esc to interrupt']) {
  test(`GIVEN a plan row WHEN the hint line reads '${hint}' THEN the row stays`, async ($, on) => {
    const clock = mock.clock(on)
    bottoms(on, () => mode('plan'))
    beneath(on)
    await step($, 'high')
    await drawHint($, hint)
    await clock.advance(0)
    expect(await bandTexts($), 'row kept').toEqual([ROW, 'BELOW'])
  })
}

test('GIVEN plan left by Shift+Tab and the same state file WHEN a main step runs (no prompt) THEN no raise and no row', async ($, on) => {
  const clock = mock.clock(on)
  const seen = bottoms(on, () => mode('plan'))
  beneath(on)
  await step($, 'high')
  await drawHint($, LEFT_HINT)
  await clock.advance(0)
  await step($, 'high')
  expect({ efforts: seen.efforts, band: await bandTexts($) }, 'stale plan file ignored').toEqual({ efforts: ['xhigh', 'high'], band: ['BELOW'] })
})

test('GIVEN plan left by Shift+Tab WHEN a newer plan file arrives with the next prompt THEN raise and row are back', async ($, on) => {
  const clock = mock.clock(on)
  let current = mode('plan')
  const seen = bottoms(on, () => current)
  beneath(on)
  await step($, 'high')
  await drawHint($, LEFT_HINT)
  await clock.advance(0)
  current = JSON.stringify({ mode: 'plan', ts: 2 })
  await step($, 'high')
  expect({ efforts: seen.efforts, band: await bandTexts($) }, 'new file wins').toEqual({ efforts: ['xhigh', 'xhigh'], band: [ROW, 'BELOW'] })
})

test('GIVEN plan left by Shift+Tab WHEN status runs THEN mode now says plan mode was left', async ($, on) => {
  const clock = mock.clock(on)
  const seen = bottoms(on, () => mode('plan'))
  beneath(on)
  configBottoms(on, seen, () => [row('xhigh')], () => ({ value: 'xhigh' }))
  await step($, 'high')
  await drawHint($, LEFT_HINT)
  await clock.advance(0)
  const out = await $.command.run(call('status'))
  expect(out.text, 'left plan in mode now').toBe(
    ['status', 'plan effort  xhigh  (medium | high | xhigh | max)', 'session      high   -> raised to xhigh in plan mode', 'mode now     plan mode left (Shift+Tab); known at the next prompt', USAGE].join('\n'),
  )
})

test('GIVEN a step with no effort WHEN status runs THEN the session line says the model takes no effort level', async ($, on) => {
  const seen = bottoms(on, () => mode('plan'))
  configBottoms(on, seen, () => [row('xhigh')], () => ({ value: 'xhigh' }))
  await step($, undefined)
  const out = await $.command.run(call(''))
  expect(out.text, 'none, not raised').toBe(
    ['status', 'plan effort  xhigh  (medium | high | xhigh | max)', 'session      none   not raised, model takes no effort level', 'mode now     plan', USAGE].join('\n'),
  )
})

test('GIVEN a plan row WHEN the state file is gone at the next main step THEN the row is gone', async ($, on) => {
  let current: State = mode('plan')
  bottoms(on, () => current)
  beneath(on)
  await step($, 'high')
  current = MISSING
  await step($, 'high')
  expect(await bandTexts($), 'missing file = not plan').toEqual(['BELOW'])
})

test('GIVEN a left-plan hint WHEN a newer plan step runs before the timer fires THEN the stale left-write is refused and raise and row stay', async ($, on) => {
  const clock = mock.clock(on)
  let current = mode('plan')
  const seen = bottoms(on, () => current)
  beneath(on)
  await step($, 'high')
  await drawHint($, LEFT_HINT)
  current = JSON.stringify({ mode: 'plan', ts: 2 })
  await step($, 'high')
  await clock.advance(0)
  await step($, 'high')
  expect({ efforts: seen.efforts, band: await bandTexts($), plan: seen.kv.plan }, 'ifVersion from the draw beats the timer').toEqual({ efforts: ['xhigh', 'xhigh', 'xhigh'], band: [ROW, 'BELOW'], plan: { isPlan: true, ts: 2, isLeft: false } })
})

test('GIVEN a ts-less plan file left by Shift+Tab WHEN the next main step runs THEN raise and row are back', async ($, on) => {
  const clock = mock.clock(on)
  const seen = bottoms(on, () => JSON.stringify({ mode: 'plan' }))
  beneath(on)
  await step($, 'high')
  await drawHint($, LEFT_HINT)
  await clock.advance(0)
  const band = await bandTexts($)
  await step($, 'high')
  expect({ efforts: seen.efforts, leftBand: band, band: await bandTexts($) }, 'ts 0 never holds the left hint').toEqual({ efforts: ['xhigh', 'xhigh'], leftBand: ['BELOW'], band: [ROW, 'BELOW'] })
})

test('GIVEN a toasted plan visit left by Shift+Tab WHEN plan is entered again and a raised step runs THEN the new visit toasts once more', async ($, on) => {
  const clock = mock.clock(on)
  let current = mode('plan')
  const seen = bottoms(on, () => current)
  beneath(on)
  await step($, 'high')
  await drawHint($, LEFT_HINT)
  await clock.advance(0)
  current = JSON.stringify({ mode: 'plan', ts: 2 })
  await step($, 'high')
  await step($, 'high')
  expect(seen.toasts, 'Shift+Tab out ends the visit, one toast per visit').toEqual([TOAST, TOAST])
})
