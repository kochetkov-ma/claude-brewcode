import { test, expect } from 'claude-code/testing'
import { PLACEHOLDER_FILES, VECTORS } from './parity/golden.generated'
import { bodyOf } from './fixtures'

// Body sha256 + length of placeholders/*.md at v6.7.0 (m.plan: its `plan: add` part since 6.9.2), front matter stripped; the kit cannot read the real files.
const SPEC_BODIES: Record<string, { sha256: string; len: number }> = {
  '+': { sha256: 'da8437c7f613f519e424975f5ee81da24adcbaac8990889467f7917757f9f51d', len: 1331 },
  a: { sha256: '8f8ec9d04a0a821680256aa6b952132d924013f8e3b32668a15188ae196d901e', len: 944 },
  m: { sha256: '973eff4e2c212dccd3ca66ab08de74c17c8424555d893f2339cc4cd9fe76f80d', len: 1732 },
  'm.plan': { sha256: 'e1e6e60038699af0344d187dbb047e8b1576d8501f41d4c13f3135f21e3c0839', len: 1716 },
  r: { sha256: '7dc6b6e71da341199c7193dcdf15bfca19c232169e8a42ba3b7508b0fd625a25', len: 498 },
  rr: { sha256: 'd076b8d2a625a0303dc53e59a1d80ce3cbef22c67cdd902195b819bb4735186b', len: 815 },
}

const sha256 = async (s: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('')

test('GIVEN the six default definitions WHEN their bodies are hashed THEN each sha256 and length equals the v6.7.0 spec', async () => {
  const actual: Record<string, { sha256: string; len: number }> = {}
  for (const file of Object.keys(PLACEHOLDER_FILES)) {
    const body = bodyOf(file)
    actual[file] = { sha256: await sha256(body), len: body.length }
  }

  expect(actual, 'default body sha256 and length per file').toEqual(SPEC_BODIES)
})

test('GIVEN the m body and the m.plan part WHEN joined under the plan header as plan mode sends them THEN the text equals the frozen v6.7.0 vector spec-2', async () => {
  const joined = `User typed \`++m\` — Manager + Plan Mode is active for this turn:\n\n${bodyOf('m')}\n\n${bodyOf('m.plan')}`

  expect(joined, 'plan-mode ++m text').toBe(VECTORS.find((v) => v.id === 'spec-2')?.expected ?? 'MISSING spec-2')
})
