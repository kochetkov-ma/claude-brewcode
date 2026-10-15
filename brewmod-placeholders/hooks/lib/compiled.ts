// Compiled matchers for the editor, band and inline expansion; the context assembly itself lives in hooks/inject.mjs.

import type { Def } from './defs'
import { DEFAULT_PREFIX, compileMatchers, type Matchers } from './match'

export type Compiled = { prefix: string; defs: readonly Def[]; matchers: Matchers }

export function compileDefs(defs: readonly Def[], prefix = DEFAULT_PREFIX): Compiled {
  return { prefix, defs, matchers: compileMatchers(prefix, defs.map((d) => d.name)) }
}

// Recompile only when the defs array (registry identity) or the prefix changed.
export function memoCompile(prev: Compiled | null, defs: readonly Def[], prefix: string): Compiled {
  return prev !== null && prev.defs === defs && prev.prefix === prefix ? prev : compileDefs(defs, prefix)
}
