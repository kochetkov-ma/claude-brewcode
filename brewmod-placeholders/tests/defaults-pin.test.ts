import { test, expect } from 'claude-code/testing'
import { PLACEHOLDER_FILES } from './parity/golden.generated'
import { bodyOf, golden } from './fixtures'

// Body sha256 + length of placeholders/*.md (v6.7.0 for a, m, r, rr; +, +.plan, m.plan since 6.9.5), front matter stripped; the kit cannot read the real files.
const SPEC_BODIES: Record<string, { sha256: string; len: number }> = {
  '+': { sha256: '51ffd63ee2d818336be1c548688f2e30a6aedd78ffaa689ba93cd374a14afa28', len: 1119 },
  '+.plan': { sha256: '7100163172f9685a1bb5c9ad8ce087caacf2e532050da0158f4219ef5ea8dec1', len: 283 },
  a: { sha256: '8f8ec9d04a0a821680256aa6b952132d924013f8e3b32668a15188ae196d901e', len: 944 },
  m: { sha256: '973eff4e2c212dccd3ca66ab08de74c17c8424555d893f2339cc4cd9fe76f80d', len: 1732 },
  'm.plan': { sha256: '1affda522baa2d957627c6440f94db5818796e14bf1508ed1f5fc518b814f771', len: 907 },
  r: { sha256: '7dc6b6e71da341199c7193dcdf15bfca19c232169e8a42ba3b7508b0fd625a25', len: 498 },
  rr: { sha256: 'd076b8d2a625a0303dc53e59a1d80ce3cbef22c67cdd902195b819bb4735186b', len: 815 },
}

const sha256 = async (s: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('')

test('GIVEN the seven default definitions WHEN their bodies are hashed THEN each sha256 and length equals the pinned spec', async () => {
  const actual: Record<string, { sha256: string; len: number }> = {}
  for (const file of Object.keys(PLACEHOLDER_FILES)) {
    const body = bodyOf(file)
    actual[file] = { sha256: await sha256(body), len: body.length }
  }

  expect(actual, 'default body sha256 and length per file').toEqual(SPEC_BODIES)
})

test('GIVEN the m body and the m.plan part WHEN joined under the plan header as plan mode sends them THEN the text equals vector spec-2 of the 6.9.5 overlay', async () => {
  const joined = `User typed \`++m\` — Manager + Plan Mode is active for this turn:\n\n${bodyOf('m')}\n\n${bodyOf('m.plan')}`

  expect(joined, 'plan-mode ++m text').toBe(golden('spec-2'))
})

test('GIVEN the + body and the +.plan part WHEN joined under the plan header as plan mode sends them THEN the text equals vector spec-6 of the 6.9.5 overlay', async () => {
  const joined = `User typed \`+++\` in Plan mode — plan the task anti-drift cron:\n\n${bodyOf('+')}\n\n${bodyOf('+.plan')}`

  expect(joined, 'plan-mode +++ text').toBe(golden('spec-6'))
})
