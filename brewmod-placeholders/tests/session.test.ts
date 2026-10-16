import { test, expect } from 'claude-code/testing'
import { ROOT, defaultsTree, wire, type Tree } from './layer-io'

const start = ($: any, on: any) => {
  on('session.start', (_$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }) as never)
  return $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
}

test('GIVEN an invalid prefix WHEN the session starts THEN a toast warns', { options: { prefix: 'ab' } }, async ($, on) => {
  const w = wire(on, { tree: defaultsTree() })

  await start($, on)

  expect(w.toasts, 'toasts').toEqual(['prefix must be 2-8 ASCII punctuation characters (not _), using ++ · change: /config -> Placeholder prefix'])
})

test('GIVEN a broken definition file WHEN the session starts THEN one toast names the first issue', async ($, on) => {
  const tree: Tree = { ...defaultsTree(), [`${ROOT}/.claude/placeholders/a.md`]: '---\nwat: 1\n---\nA2' }
  const w = wire(on, { tree })

  await start($, on)

  expect(w.toasts, 'toasts').toEqual(["1 definition issue(s), first: project/a.md: unknown key 'wat' · all: /placeholders status"])
})

test('GIVEN skipped and unreadable files WHEN the session starts THEN one toast carries the count, the first issue and the skipped files', async ($, on) => {
  const tree: Tree = { ...defaultsTree(), [`${ROOT}/.claude/placeholders/my-thing.md`]: 'X', [`${ROOT}/.claude/placeholders/broken.md`]: '---\nname: b' }
  const w = wire(on, { tree })

  await start($, on)

  expect(w.toasts, 'toasts').toEqual(['2 definition issue(s), first: project/broken.md: front matter is not closed; skipped project/broken.md, project/my-thing.md · all: /placeholders status'])
})

test('GIVEN a valid setup WHEN the session starts THEN there is no toast, the registry is read and the mode state file is asked for', async ($, on) => {
  const w = wire(on, { tree: defaultsTree() })

  await start($, on)

  expect([w.toasts, w.calls.read.filter((p) => !p.includes('/.state/')).length, w.calls.read.filter((p) => p.includes('/.state/'))], 'toasts, registry reads, state reads').toEqual([[], 6, ['/PLUG/.state/mode-sess-1.json']])
})

test('GIVEN a user-defined placeholder in the project layer WHEN typeahead runs THEN it is offered with its description', async ($, on) => {
  const tree: Tree = { ...defaultsTree(), [`${ROOT}/.claude/placeholders/foo.md`]: '---\ndescription: "Foo thing"\n---\nFOO TEXT' }
  wire(on, { tree })
  on('prompt.autocomplete', () => ({ suggestions: [] }))
  await start($, on)

  const rows = await ($.prompt as any).autocomplete({ text: '++f', cursor: 3, token: '++f', start: 0 })

  expect(rows, 'suggestions').toEqual({ suggestions: [{ text: '++foo ', label: '++foo', description: 'Foo thing' }] })
})

test('GIVEN a classic UserPromptSubmit answer from below WHEN the mod is loaded THEN it passes through untouched (the command hook owns the context)', async ($, on) => {
  wire(on, { tree: defaultsTree() })
  on('classic.UserPromptSubmit', () => ({ additionalContext: ['FOREIGN'] }))

  const out = await $.classic.UserPromptSubmit({ prompt: '++m ++foo', permission_mode: 'default' } as never)

  expect(out, 'classic result').toEqual({ additionalContext: ['FOREIGN'] })
})
