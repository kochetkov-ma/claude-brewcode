import { test, expect } from 'claude-code/testing'
import { EMPTY_VIEW, caretFocus, highlight, isMenuOpen, sameView } from '../hooks/lib/editor'
import { editorMatchers, getEditorEntries } from '../hooks/lib/editor-state'

const BASE = [{ start: 0, end: 1, bold: true }]
const REALISTIC = 'Refactor the billing module and keep tests green ++m then ++rr, mention ++nope here. '
const DENSE = '++m ++zz ++rr ++q +++ '
const WARMUP = 100

const fill = (chars: number, chunk: string) => chunk.repeat(Math.ceil(chars / chunk.length)).slice(0, chars)

// Own-handler cost of one keystroke: matcher lookup, scan, decorate, merge, view diff, caret focus, menu. Returns sorted ms samples.
function sample(text: string, iterations: number, shown: { view: typeof EMPTY_VIEW }): number[] {
  const once = () => {
    const h = highlight(editorMatchers('++'), text)
    const merged = [...BASE, ...h.decorations]
    const changed = !sameView(h.view, shown.view)
    shown.view = h.view
    const focus = caretFocus(h.view, text, text.length)
    const menu = isMenuOpen('++', text, text.length, getEditorEntries())
    return merged.length + (changed ? 1 : 0) + (focus.name === null ? 0 : 1) + (menu ? 1 : 0)
  }
  const ms: number[] = []
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now()
    once()
    ms.push(performance.now() - t0)
  }
  return ms.sort((a, b) => a - b)
}

// Best batch max of 40 warmed batches of 25 (no p99: a batch of 25 has none): CPU contention stalls some batches, a real regression slows every one.
const BATCHES = 40
const BATCH = 25
function bestBatchMax(text: string): number {
  const shown = { view: EMPTY_VIEW }
  sample(text, WARMUP, shown)
  return Math.min(...Array.from({ length: BATCHES }, () => sample(text, BATCH, shown).at(-1) ?? Number.NaN))
}

// Bounds are the budget (< 2 ms at 4k chars, < 8 ms at 20k); measured ~0.1 ms and ~0.4 ms.
test('GIVEN a realistic 4000-char draft WHEN the handler path runs 40 batches of 25 THEN the best batch max stays under 2 ms', { timeoutMs: 60000 }, async () => {
  const text = fill(4000, REALISTIC)

  const value = bestBatchMax(text)

  expect(value < 2, `best batch max=${value.toFixed(3)} ms, bound 2 ms`).toBe(true)
})

test('GIVEN a realistic 20000-char draft WHEN the handler path runs 40 batches of 25 THEN the best batch max stays under 8 ms', { timeoutMs: 60000 }, async () => {
  const text = fill(20000, REALISTIC)

  const value = bestBatchMax(text)

  expect(value < 8, `best batch max=${value.toFixed(3)} ms, bound 8 ms`).toBe(true)
})

test('GIVEN a token-dense 4000-char draft WHEN the handler path runs 40 batches of 25 THEN the best batch max stays under 2 ms', { timeoutMs: 60000 }, async () => {
  const text = fill(4000, DENSE)

  const value = bestBatchMax(text)

  expect(value < 2, `best batch max=${value.toFixed(3)} ms, bound 2 ms`).toBe(true)
})

// Worst case (a token every ~4 chars); match.ts is linear in tokens, so the 8 ms budget has >= 2x headroom.
test('GIVEN a token-dense 20000-char draft WHEN the handler path runs 40 batches of 25 THEN the best batch max stays under 8 ms', { timeoutMs: 60000 }, async () => {
  const text = fill(20000, DENSE)

  const value = bestBatchMax(text)

  expect(value < 8, `best batch max=${value.toFixed(3)} ms, bound 8 ms`).toBe(true)
})

// A pasted 20k-char word before the caret (then a space) and under it: the menu check walks back; a /\S*$/ scan is quadratic on the first.
for (const [where, text] of [['before', `++m ${'x'.repeat(19995)} `], ['at', `++m ${'x'.repeat(19996)}`]] as const) {
  test(`GIVEN a 20000-char draft with a 20k-char word ${where} the caret WHEN the handler path runs 40 batches of 25 THEN the best batch max stays under 8 ms`, { timeoutMs: 60000 }, async () => {
    expect(text.length, 'draft length').toBe(20000)

    const value = bestBatchMax(text)

    expect(value < 8, `best batch max=${value.toFixed(3)} ms, bound 8 ms`).toBe(true)
  })
}
