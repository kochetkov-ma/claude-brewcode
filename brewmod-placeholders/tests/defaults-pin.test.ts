import { test, expect } from 'claude-code/testing'
import { PLACEHOLDER_FILES } from './parity/golden.generated'
import { parseDefinition, toDef } from '../hooks/lib/defs'

// Body sha256 + length of placeholders/*.md at v6.7.0, front matter stripped as the mod uses it; the kit cannot read the real files.
const SPEC_BODIES: Record<string, { sha256: string; len: number }> = {
  '+': { sha256: 'da8437c7f613f519e424975f5ee81da24adcbaac8990889467f7917757f9f51d', len: 1331 },
  a: { sha256: '8f8ec9d04a0a821680256aa6b952132d924013f8e3b32668a15188ae196d901e', len: 944 },
  m: { sha256: '973eff4e2c212dccd3ca66ab08de74c17c8424555d893f2339cc4cd9fe76f80d', len: 1732 },
  'm.plan': { sha256: 'b883238cad2ebf6454f3b9e4d2342db42978c9844df234adec6f84d823b84be8', len: 3450 },
  r: { sha256: '7dc6b6e71da341199c7193dcdf15bfca19c232169e8a42ba3b7508b0fd625a25', len: 498 },
  rr: { sha256: 'd076b8d2a625a0303dc53e59a1d80ce3cbef22c67cdd902195b819bb4735186b', len: 815 },
}

const sha256 = async (s: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('')

test('GIVEN the six default definitions WHEN their bodies are hashed THEN each sha256 and length equals the v6.7.0 spec', async () => {
  const actual: Record<string, { sha256: string; len: number }> = {}
  for (const [file, raw] of Object.entries(PLACEHOLDER_FILES)) {
    const body = toDef(parseDefinition(raw))?.body ?? ''
    actual[file] = { sha256: await sha256(body), len: body.length }
  }

  expect(actual, 'default body sha256 and length per file').toEqual(SPEC_BODIES)
})
