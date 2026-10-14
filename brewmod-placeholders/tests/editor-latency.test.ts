import { test, expect } from 'claude-code/testing'
import { EMPTY_VIEW, highlight, sameView } from '../hooks/lib/editor'
import { editorMatchers } from '../hooks/lib/editor-state'

const STYLE = { knownColor: 'suggestion', unknownColor: 'warning' }
const BASE = [{ start: 0, end: 1, bold: true }]
const REALISTIC = 'Refactor the billing module and keep tests green ++m then ++rr, mention ++nope here. '
const DENSE = '++m ++zz ++rr ++q +++ '
const WARMUP = 100

const fill = (chars: number, chunk: string) => chunk.repeat(Math.ceil(chars / chunk.length)).slice(0, chars)

// Own-handler cost of one keystroke: matcher lookup, scan, decorate, merge, view diff. Returns sorted ms samples.
function sample(text: string, iterations: number): number[] {
  let shown = EMPTY_VIEW
  const once = () => {
    const h = highlight(editorMatchers('++'), text, STYLE)
    const merged = [...BASE, ...h.decorations]
    const changed = !sameView(h.view, shown)
    shown = h.view
    return merged.length + (changed ? 1 : 0)
  }
  for (let i = 0; i < WARMUP; i++) once()
  const ms: number[] = []
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now()
    once()
    ms.push(performance.now() - t0)
  }
  return ms.sort((a, b) => a - b)
}

const p99 = (sorted: number[]) => sorted[Math.ceil(sorted.length * 0.99) - 1] ?? Number.NaN

// Bounds are the budget (p99 < 2 ms at 4k chars, < 8 ms at 20k); measured p99 is ~0.1 ms and ~0.4 ms.
test('GIVEN a realistic 4000-char draft WHEN the handler path runs 500 times THEN p99 stays under 2 ms', async () => {
  const text = fill(4000, REALISTIC)

  const value = p99(sample(text, 500))

  expect(value < 2, `p99=${value.toFixed(3)} ms, bound 2 ms`).toBe(true)
})

test('GIVEN a realistic 20000-char draft WHEN the handler path runs 500 times THEN p99 stays under 8 ms', async () => {
  const text = fill(20000, REALISTIC)

  const value = p99(sample(text, 500))

  expect(value < 8, `p99=${value.toFixed(3)} ms, bound 8 ms`).toBe(true)
})

test('GIVEN a token-dense 4000-char draft WHEN the handler path runs 500 times THEN p99 stays under 2 ms', async () => {
  const text = fill(4000, DENSE)

  const value = p99(sample(text, 500))

  expect(value < 2, `p99=${value.toFixed(3)} ms, bound 2 ms`).toBe(true)
})

// Worst case (a token every ~4 chars); match.ts is linear in tokens, so the 8 ms budget has >= 2x headroom.
test('GIVEN a token-dense 20000-char draft WHEN the handler path runs 200 times THEN p99 stays under 8 ms', { timeoutMs: 20000 }, async () => {
  const text = fill(20000, DENSE)

  const value = p99(sample(text, 200))

  expect(value < 8, `p99=${value.toFixed(3)} ms, bound 8 ms`).toBe(true)
})
