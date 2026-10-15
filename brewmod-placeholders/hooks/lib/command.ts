// /placeholders status block, model hand-off text and the three model tools: pure over an injected Io, never `$`.
import { DEFAULT_PREFIX } from './match'
import { layerSpecs, loadRegistry, newRegistryCache, parseDefinition, type Def, type Io, type Registry, type Roots } from './defs'

export type StatLite = { kind: 'file' | 'dir' | 'other'; isLink: boolean; realPath?: string }
export type CmdIo = Io & {
  write: (path: string, text: string) => Promise<void>
  stat: (path: string) => Promise<StatLite | undefined>
  remove: (path: string) => Promise<{ exitCode: number; stderr: string }>
}
export type Scope = 'project' | 'global'
export type SaveInput = { name?: unknown; description?: unknown; when?: unknown; text?: unknown; scope?: unknown }
export type ToolOut = { text: string; registry: Registry | null; isError?: true }
type Row = { stem: string; layer: string; def: Def }

export const TOOL_PREFIX = 'mcp__brewmod-placeholders__'
export const NEEDS_NEW_CC = 'needs Claude Code 2.1.300+ for the dialog'

// Markdown-safe block: the first line stays plain (the engine glues "<plugin>: " in front of it, so a fence cannot open there), the rest sits in a fence longer than any backtick run inside.
export function block(head: string, lines: readonly string[], foot: readonly string[] = []): string {
  const run = Math.max(0, ...[...lines.join('\n').matchAll(/`+/g)].map((m) => m[0].length))
  const fence = '`'.repeat(Math.max(3, run + 1))
  return [head, fence, ...lines, fence, ...foot].join('\n')
}

const WORD = /^[a-z0-9_]{1,32}$/
const SYMBOL = /^[!#$%&'()+,\-;=@[\]^`{}~]{1,32}$/
const PLAN = '.plan'

// File-safe stem: lowercase word or punctuation run (no path or shell characters), optional `.plan`; else null.
export function normalizeName(raw: string): string | null {
  const lower = raw.toLowerCase()
  const base = lower.endsWith(PLAN) ? lower.slice(0, -PLAN.length) : lower
  return WORD.test(base) || SYMBOL.test(base) ? lower : null
}

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const layerLabel = (id: string): string => (id === 'default' ? 'plugin' : id)
const load = (io: CmdIo, roots: Roots): Promise<Registry> => loadRegistry(io, roots, newRegistryCache())
const ownDir = (roots: Roots, scope: Scope): string | undefined => layerSpecs(roots).find((s) => s.id === scope)?.dir
const noDir = (scope: Scope): string => (scope === 'project' ? 'no project root for this session' : 'no config directory (CLAUDE_CONFIG_DIR and HOME are unset)')
const fail = (text: string): ToolOut => ({ text, registry: null, isError: true })

// defs[i] pairs with the i-th source key: resolveDefs inserts into both maps together.
function rowsOf(reg: Registry): Row[] {
  const stems = [...reg.sources.keys()]
  return reg.defs
    .map((def, i): Row => {
      const stem = stems[i] ?? def.name
      return { stem, layer: reg.sources.get(stem) ?? 'default', def }
    })
    .sort((a, b) => (a.stem < b.stem ? -1 : a.stem > b.stem ? 1 : 0))
}

// `/placeholders`, `status`, `help`, `list` (any case, alone) show the status; every other text goes to the model.
export const isStatusRequest = (args: string): boolean => ['', 'status', 'help', 'list'].includes(args.trim().toLowerCase())

export function statusText(reg: Registry, prefix: string = DEFAULT_PREFIX): string {
  const rows = rowsOf(reg)
  const w = Math.max(...rows.map((r) => (prefix + r.stem).length), 4)
  const lines = rows.map((r) => `${(prefix + r.stem).padEnd(w)}  ${layerLabel(r.layer).padEnd(14)}  ${r.def.description ?? '-'}`)
  const issues = reg.issues.length === 0 ? [] : ['', `issues (${reg.issues.length}):`, ...reg.issues.map((i) => `  ${i}`)]
  return block(`${rows.length} placeholders: type ${prefix}name in any prompt`, [...lines, ...issues], ['add or change: /placeholders <what you want>'])
}

export const handoffAck = (status: string): string => `asking Claude to help with your placeholder ...\n${status}`

// Short on purpose: it shows in the transcript. The rules live in the tool descriptions.
export const handoffText = (request: string, prefix: string = DEFAULT_PREFIX): string =>
  `Placeholder helper. My request: <request>${request}</request>\nUse the ${TOOL_PREFIX}* tools (list_placeholders first); a placeholder is inserted into prompts as ${prefix}name.`

export const TOOLS = [
  {
    name: 'list_placeholders',
    description:
      'List the effective placeholders: name, layer (plugin | project | global | legacy), description and body text. Call it first, before creating, changing, removing or showing a placeholder. To show one, print its name and body to the user.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'save_placeholder',
    description:
      'Create or change a placeholder in the user\'s own layer (project by default, global only when the user asked). Never use Write for this. Name: lowercase letters, digits, underscore, no prefix. When the user gave the text, keep their words verbatim; when they only described it, draft it. To change one, start from its effective text from list_placeholders and apply the change. Call AskUserQuestion exactly once before saving: header "Placeholder", question shows the name and the text, options "Save as drafted (Recommended)" and "Change it" (Other = a different name or text; apply and save without asking again). Then say where it was saved.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'lowercase name without the prefix' },
        description: { type: 'string', description: 'one short line shown in the list and the typeahead' },
        text: { type: 'string', description: 'the placeholder text inserted into prompts' },
        when: { type: 'string', enum: ['always', 'plan', 'not-plan'], description: 'optional; default always' },
        scope: { type: 'string', enum: ['project', 'global'], description: 'default project' },
      },
      required: ['name', 'description', 'text'],
    },
  },
  {
    name: 'remove_placeholder',
    description:
      'Remove a placeholder file from the user\'s own layer (project by default, global only when asked); plugin defaults and legacy brewtools files are never removed. Call AskUserQuestion exactly once to confirm first ("Remove it (Recommended)" / "Keep it"), then say what is served afterwards.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'name without the prefix' }, scope: { type: 'string', enum: ['project', 'global'] } },
      required: ['name'],
    },
  },
] as const

export function listTool(reg: Registry): ToolOut {
  const rows = rowsOf(reg)
  const text = rows
    .map((r) => `## ${r.stem} (layer: ${layerLabel(r.layer)}, when: ${r.def.when}) ${r.def.description ?? ''}\n${r.def.body === '' ? '(empty)' : r.def.body}`)
    .join('\n\n')
  return { text: text === '' ? 'no placeholders defined' : text, registry: null }
}

const scopeOf = (v: unknown): Scope | null => (v === undefined || v === 'project' ? 'project' : v === 'global' ? 'global' : null)
const bare = (raw: unknown, prefix: string): string | null => {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  return normalizeName(s.startsWith(prefix) && s.length > prefix.length ? s.slice(prefix.length) : s)
}

// File = front matter (description, optional when) + body; null when the text would not read back (fence marker, leading ---).
export function definitionFile(description: string, when: string | undefined, text: string): string | null {
  const head = [`description: ${JSON.stringify(description)}`, ...(when === undefined || when === 'always' ? [] : [`when: ${when}`])]
  const body = text.trim()
  const content = `---\n${head.join('\n')}\n---\n${body}\n`
  const back = parseDefinition(content)
  return body === '' || back.issues.length > 0 || back.text !== body || back.meta.description !== description ? null : content
}

export async function saveTool(io: CmdIo, roots: Roots, input: SaveInput, prefix: string = DEFAULT_PREFIX): Promise<ToolOut> {
  try {
    const stem = bare(input.name, prefix)
    if (stem === null) return fail('bad name: use lowercase letters, digits, underscore (1-32) or punctuation only, optional .plan suffix')
    const scope = scopeOf(input.scope)
    if (scope === null) return fail("scope must be 'project' or 'global'")
    if (typeof input.text !== 'string' || input.text.trim() === '') return fail('text is empty')
    const description = typeof input.description === 'string' ? input.description.trim().replace(/\s+/g, ' ') : ''
    if (description === '') return fail('description is empty')
    const when = input.when === undefined ? undefined : String(input.when)
    if (when !== undefined && !['always', 'plan', 'not-plan'].includes(when)) return fail("when must be 'always', 'plan' or 'not-plan'")
    const dir = ownDir(roots, scope)
    if (dir === undefined) return fail(noDir(scope))
    const content = definitionFile(description, when, input.text)
    if (content === null) return fail('that text holds a ``` or ~~~ fence marker or opens with a --- line, which the definition format cannot carry')
    const path = `${dir}/${stem}.md`
    // Same-name entry (any case): a symlink or directory would send the write outside the layer dir.
    const clash = (await io.exists(dir)) ? (await io.list(dir)).find((en) => en.name.toLowerCase() === `${stem}.md` && (en.isLink || en.kind !== 'file')) : undefined
    if (clash !== undefined) return fail(`refused, ${dir}/${clash.name} is not a plain file`)
    await io.write(path, content)
    const registry = await load(io, roots)
    const layer = registry.sources.get(stem)
    const note = layer === undefined || layer === scope ? '' : `; note: the ${layerLabel(layer)} layer wins over ${scope}`
    return { text: `saved ${prefix}${stem} (${scope}): ${path}${note}`, registry }
  } catch (e) {
    return fail(`failed: ${why(e)}`)
  }
}

export async function removeTool(io: CmdIo, roots: Roots, input: { name?: unknown; scope?: unknown }, prefix: string = DEFAULT_PREFIX): Promise<ToolOut> {
  try {
    const stem = bare(input.name, prefix)
    if (stem === null) return fail('bad name')
    const scope = scopeOf(input.scope)
    if (scope === null) return fail("scope must be 'project' or 'global'")
    const dir = ownDir(roots, scope)
    if (dir === undefined) return fail(noDir(scope))
    const path = `${dir}/${stem}.md`
    if (!(await io.exists(path))) {
      const layer = rowsOf(await load(io, roots)).find((r) => r.stem === stem)?.layer
      if (layer === undefined) return fail(`unknown placeholder '${stem}'`)
      if (layer === 'default') return fail(`refused, ${stem} is a plugin default and has no ${scope} file`)
      if (layer.endsWith('-legacy')) return fail(`refused, ${stem} comes from a brewtools ${layer} file, which is never removed here`)
      return fail(`no ${scope} file for ${stem}; it comes from the ${layer} layer`)
    }
    const dirStat = await io.stat(dir)
    const fileStat = await io.stat(path)
    const base = dirStat?.realPath?.replace(/\/+$/, '')
    const real = fileStat?.realPath
    const isInside = base !== undefined && base !== '' && real !== undefined && real.startsWith(`${base}/`)
    if (fileStat === undefined || fileStat.kind !== 'file' || fileStat.isLink || !isInside) return fail(`refused, ${path} is not a plain file inside ${dir}`)
    const res = await io.remove(real)
    if (res.exitCode !== 0) return fail(`rm failed (exit ${res.exitCode}): ${res.stderr.trim()}`)
    const registry = await load(io, roots)
    const now = registry.sources.get(stem)
    return { text: `removed (${scope}): ${path}; ${prefix}${stem} is ${now === undefined ? 'no longer defined' : `now served by the ${layerLabel(now)} layer`}`, registry }
  } catch (e) {
    return fail(`failed: ${why(e)}`)
  }
}
