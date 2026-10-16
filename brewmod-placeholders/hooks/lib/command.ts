// /placeholders model hand-off text and the model tools: pure over an injected Io, never `$`.
import { DEFAULT_PREFIX, escapeMarkers } from './match'
import { planParts, type PlanParts } from './sent'
import { FOCUS_MAX } from './band'
import { layerSpecs, loadRegistry, newRegistryCache, parseDefinition, type Def, type Io, type Registry, type Roots } from './defs'

export type StatLite = { kind: 'file' | 'dir' | 'other'; isLink: boolean; realPath?: string }
export type CmdIo = Io & {
  write: (path: string, text: string) => Promise<void>
  stat: (path: string) => Promise<StatLite | undefined>
  remove: (path: string) => Promise<{ exitCode: number; stderr: string }>
}
export type Scope = 'project' | 'global'
export type Part = 'all' | 'normal' | 'plan'
// A stale `when` from an older tool spec may still arrive: it is ignored, never rejected.
export type SaveInput = { name?: unknown; description?: unknown; text?: unknown; planText?: unknown; scope?: unknown }
export type RemoveInput = { name?: unknown; scope?: unknown; part?: unknown }
export type ToolOut = { text: string; registry: Registry | null; isError?: true }
export type Row = { stem: string; layer: string; def: Def }

export const TOOL_PREFIX = 'mcp__brewmod-placeholders__'
export const NEEDS_NEW_CC = 'changing placeholders by words needs Claude Code 2.1.300+ · meanwhile: edit the <name>.md files by hand'
export const SCOPE_REQUIRED = "scope is required: 'global' or 'project'"
const BAD_SCOPE = "scope must be 'project' or 'global'"
const BAD_FENCE = 'that text holds a ``` or ~~~ fence marker or opens with a --- line, which the definition format cannot carry'
const NEEDS_CONTEXT = 'a plan-mode part needs a normal text that is not inline'

// Markdown-safe block: the first line stays plain (the engine glues "<plugin>: " in front of it, so a fence cannot open there), the rest sits in a fence longer than any backtick run inside.
export function block(head: string, lines: readonly string[], foot: readonly string[] = []): string {
  const run = Math.max(0, ...[...lines.join('\n').matchAll(/`+/g)].map((m) => m[0].length))
  const fence = '`'.repeat(Math.max(3, run + 1))
  return [head, fence, ...lines, fence, ...foot].join('\n')
}

const WORD = /^[a-z0-9_]{1,32}$/
const SYMBOL = /^[!#$%&'()+,\-;=@[\]^`{}~]{1,32}$/
const PLAN = '.plan'
const PLAN_MD = '.plan.md'

// File-safe stem: lowercase word or punctuation run (no / \ or .; shell characters pass, names only reach argv), optional `.plan`; else null.
export function normalizeName(raw: string): string | null {
  const lower = raw.toLowerCase()
  const base = lower.endsWith(PLAN) ? lower.slice(0, -PLAN.length) : lower
  return WORD.test(base) || SYMBOL.test(base) ? lower : null
}

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e))
export const layerLabel = (id: string): string => (id === 'default' ? 'plugin' : id)
const dirOf = (roots: Roots, layer: string): string | undefined => layerSpecs(roots).find((s) => s.id === layer)?.dir

// Launched in HOME: the project dir is the global one, so both are one layer, global.
const isOneDir = (roots: Roots): boolean => dirOf(roots, 'project') !== undefined && dirOf(roots, 'project') === dirOf(roots, 'global')
export const oneLayer = (reg: Registry, roots: Roots): Registry =>
  isOneDir(roots) ? { ...reg, sources: new Map([...reg.sources].map(([k, v]) => [k, v === 'project' ? 'global' : v])) } : reg
const scopeIn = (roots: Roots, scope: Scope): Scope => (isOneDir(roots) ? 'global' : scope)
const load = async (io: Io, roots: Roots): Promise<Registry> => oneLayer(await loadRegistry(io, roots, newRegistryCache()), roots)

// Shown layer dirs: the config dir with `~` for HOME; the project one relative to its root.
export type Dirs = { global: string; project: string }
export function shownDirs(roots: Roots, home: string | undefined): Dirs {
  const cfg = roots.configDir
  const h = home === undefined || home === '' ? undefined : home.replace(/\/+$/, '')
  const tilde = cfg !== undefined && h !== undefined && cfg.startsWith(`${h}/`) ? `~${cfg.slice(h.length)}` : cfg
  return { global: tilde === undefined ? '(no config dir)' : `${tilde}/placeholders`, project: '.claude/placeholders' }
}
const noDir = (scope: Scope): string => (scope === 'project' ? 'no project root for this session' : 'no config directory (CLAUDE_CONFIG_DIR and HOME are unset)')
const fail = (text: string): ToolOut => ({ text, registry: null, isError: true })
export const isScope = (v: unknown): v is Scope => v === 'project' || v === 'global'

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

export type Named = { name: string; lead: Row; plan: Row | undefined; own: Row[]; kind: PlanParts['kind'] }

// One entry per name (any case), in stem order; lead = the normal part, else the plan-mode part.
export function byName(reg: Registry, prefix: string): Named[] {
  const rows = rowsOf(reg)
  return [...new Set(rows.map((r) => r.def.name.toLowerCase()))].flatMap((name) => {
    const own = rows.filter((r) => r.def.name.toLowerCase() === name)
    const plan = own.find((r) => r.def.isPlan)
    const lead = own.find((r) => !r.def.isPlan) ?? plan
    return lead === undefined ? [] : [{ name, lead, plan, own, kind: planParts(reg.defs, name, prefix).kind }]
  })
}

export const handoffAck = (status: string): string => `asking Claude to help with your placeholder ...\n${status}`

const ASK_FIRST = 'Ask first: no save_placeholder or remove_placeholder call before I answered your one AskUserQuestion about that exact change in this turn, even if my request is explicit (only a remove of a name with files: none skips it).'
const NO_SCOPE = 'Scope: not given; infer it from my words outside the placeholder text, else ask "Where to save?" in the same dialog, Global first; a change keeps its layer, a remove uses the layer that holds it.'

// Short on purpose: it shows in the transcript. The confirm rule leads; the other rules live in the tool descriptions.
// The escape marker keeps the tokens named in the request from being expanded or injected into this message.
export const handoffText = (request: string, prefix: string = DEFAULT_PREFIX, scope: Scope | null = null): string =>
  `Placeholder helper. My request: <request>${request}</request>\n${ASK_FIRST}\n${scope === null ? NO_SCOPE : `Scope: ${scope} (I said it; skip only the Where question).`}\nUse the ${TOOL_PREFIX}* tools (list_placeholders first); a placeholder is inserted into prompts as ${prefix}name (not in this message: ${escapeMarkers(prefix)[0]}).`

// Tool specs for the configured prefix: every token they name is spelled with it.
export const tools = (p: string) => [
  {
    name: 'list_placeholders',
    description: `List every placeholder, one entry per name: token, layer (plugin | global | project | global-legacy | project-legacy), files (the user files per layer; both layers when it is in both), plan (add | none), description, its text and its plan-mode text. Call it first before creating, changing, removing or showing one. To show placeholders, print the requested ones verbatim; /placeholders show ${p}<name> also prints them instantly.`,
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'save_placeholder',
    description: `Never call this tool before the user answered your one AskUserQuestion about this exact save in this turn, even when the request is explicit. Create or change a placeholder file; never use Write. Call list_placeholders first. name: lowercase letters, digits, underscore, no prefix. text: the user's words verbatim when given, else your draft; a change starts from its text in list_placeholders. planText: a plan-mode part, added to the text only in Plan mode (file <name>.plan.md); draft one only when the user mentions plan mode (plan, plan mode, planning, план, планир, режим плана) or the name already has one. A change picks the part by words: plan part, plan mode, план, в режиме плана -> planText only; normal, обычн, основн -> text only; both, оба -> both; else text. An omitted part stays as it is. scope (required): a first word global or project wins; else infer it only from the words outside the placeholder's own text (global: global, everywhere, all projects, глобально, везде, во всех проектах; project: project, this project, here, this repo, в проекте, здесь, локально); a change keeps its layer from list_placeholders (global-legacy = global, project-legacy = project). That one AskUserQuestion call holds these questions in this order: 1. header "Placeholder", question exactly "Save ${p}<name> as drafted?" (never a layer in it) with the text, options "Save as drafted (Recommended)" / "Change it" (Other = a different name or text; apply it and save without asking again). 2. Only with a plan-mode part: header "Plan mode", question "Add this plan-mode part to ${p}<name>?", the draft as the first option's preview, options "Add it (Recommended)" / "No plan part". 3. Only when the scope is unclear (no word, or a new override of a plugin default): header "Where", question "Where to save ${p}<name>?", options "Global (Recommended)" (all your projects) then "Project" (only this project; wins over global). Only with no AskUserQuestion tool at all: save as drafted, scope global unless a word outside the text says project. Then say where it was saved.`,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'lowercase name without the prefix' },
        description: { type: 'string', description: 'one short line shown in the list and the typeahead' },
        text: { type: 'string', description: 'the normal text inserted into prompts; optional when only planText changes on an existing name' },
        planText: { type: 'string', description: 'optional plan-mode part, added to the text only in Plan mode' },
        scope: { type: 'string', enum: ['global', 'project'], description: 'required: global (all projects) or project (this project only)' },
      },
      required: ['name', 'description', 'scope'],
    },
  },
  {
    name: 'remove_placeholder',
    description: `Never call this tool before the user answered your one AskUserQuestion about this exact removal in this turn, even when the request is explicit; only a name with files: none in list_placeholders skips the question (a plugin default or legacy brewtools file: nothing is removed; relay the result). Remove a placeholder file from the global or project layer; never use Bash rm. The wording is free (remove, delete, drop, удали, убери, сотри). Call list_placeholders first. part: all (default; <name>.md and <name>.plan.md), plan (the plan-mode part only: plan part, plan mode, план, в режиме плана), normal (the normal text only). scope: a first word global or project wins; else omit it and the tool takes the one layer holding the file. Question 1, header "Remove": "Remove ${p}<name> (<layer>)?", options "Remove it (Recommended)" / "Keep it"; when it has a plan-mode part and no part was named: "Remove ${p}<name> (<layer>)? It has a plan-mode part.", options "Both parts (Recommended)" / "Only the plan-mode part" / "Keep it"; when the plan part was named: "Remove the plan-mode part of ${p}<name> (<layer>)?", options "Remove it (Recommended)" / "Keep it". When list_placeholders shows files in both layers and no scope was given, add question 2 in the same call: header "Where", "Remove ${p}<name> from where?", options "Global" / "Project". Then say what is served afterwards (the result says it).`,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'name without the prefix' },
        scope: { type: 'string', enum: ['global', 'project'], description: 'omit to use the one layer holding the file' },
        part: { type: 'string', enum: ['all', 'normal', 'plan'], description: 'default all' },
      },
      required: ['name'],
    },
  },
  {
    name: 'placeholders_help',
    description: `How the user's ${p} placeholders work: syntax, full text (/placeholders show ${p}name; the caret on a token shows up to ${FOCUS_MAX} rows in the band), sending a message as typed (${escapeMarkers(p)[0]}), global vs project, file format, /placeholders commands and doc links. Call it before answering any question about placeholders or the ${p} prefix.`,
    inputSchema: { type: 'object', properties: {} },
  },
] as const

type Held = { scope: Scope; dir: string; files: string[] }

// File names in the global and project dirs (`.md`, no dot files, no dirs); a missing dir lists nothing; one shared dir is global only.
async function userFiles(io: Io, roots: Roots): Promise<Held[]> {
  const out: Held[] = []
  for (const scope of isOneDir(roots) ? (['global'] as const) : (['global', 'project'] as const)) {
    const dir = dirOf(roots, scope)
    if (dir === undefined) continue
    const listing = (await io.exists(dir)) ? await io.list(dir) : []
    out.push({ scope, dir, files: listing.filter((en) => en.kind !== 'dir' && !en.name.startsWith('.') && en.name.toLowerCase().endsWith('.md')).map((en) => en.name) })
  }
  return out
}

// `<stem>.md` = normal part, `<stem>.plan.md` = plan-mode part, normal first; names match case-insensitively.
const isPlanFile = (f: string): boolean => f.toLowerCase().endsWith(PLAN_MD)
const partFiles = (files: readonly string[], stem: string, part: Part): string[] =>
  files
    .filter((f) => {
      const l = f.toLowerCase()
      return (part !== 'plan' && l === `${stem}.md`) || (part !== 'normal' && l === `${stem}${PLAN_MD}`)
    })
    .sort((a, b) => Number(isPlanFile(a)) - Number(isPlanFile(b)))

const bodyOf = (d: Def): string => (d.body === '' ? '(empty)' : d.body)

function entry({ name, lead, plan, kind }: Named, held: readonly Held[], prefix: string): string {
  const files = held.map((h) => ({ scope: h.scope, files: partFiles(h.files, name, 'all') })).filter((h) => h.files.length > 0)
  const head = [
    `## ${prefix}${name}`,
    `layer: ${layerLabel(lead.layer)}`,
    `files: ${files.length === 0 ? 'none' : files.map((h) => `${h.scope} (${h.files.join(', ')})`).join(', ')}`,
    `plan: ${kind}`,
    ...(lead.def.insert === 'inline' ? ['insert: inline'] : []),
    lead.def.description ?? '-',
  ].join(' · ')
  const extra = plan === undefined || plan === lead ? [] : [`### plan mode adds · layer: ${layerLabel(plan.layer)}`, bodyOf(plan.def)]
  return [head, bodyOf(lead.def), ...extra].join('\n')
}

// One entry per name: layer, user files per layer, plan kind, the text and the plan-mode text.
export async function listTool(io: Io, roots: Roots, reg: Registry, prefix: string = DEFAULT_PREFIX): Promise<ToolOut> {
  const held = await userFiles(io, roots)
  const text = byName(oneLayer(reg, roots), prefix).map((n) => entry(n, held, prefix)).join('\n\n')
  return { text: text === '' ? 'no placeholders defined' : text, registry: null }
}

const bare = (raw: unknown, prefix: string): string | null => {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  return normalizeName(s.startsWith(prefix) && s.length > prefix.length ? s.slice(prefix.length) : s)
}
const filled = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

// File = front matter (description, plan when given) + body; null when the text would not read back (fence marker, leading ---).
export function definitionFile(description: string, text: string, plan?: 'add'): string | null {
  const head = [`description: ${JSON.stringify(description)}`, ...(plan === undefined ? [] : [`plan: ${plan}`])]
  const body = text.trim()
  const content = `---\n${head.join('\n')}\n---\n${body}\n`
  const back = parseDefinition(content)
  return body === '' || back.issues.length > 0 || back.text !== body || back.meta.description !== description || back.meta.plan !== plan ? null : content
}

// text -> `<stem>.md`, planText -> `<stem>.plan.md` (`plan: add`), both in the scope's dir; an omitted part is left untouched. home: shown paths use `~`.
export async function saveTool(io: CmdIo, roots: Roots, input: SaveInput, prefix: string = DEFAULT_PREFIX, home?: string): Promise<ToolOut> {
  try {
    const stem = bare(input.name, prefix)
    if (stem === null) return fail('bad name: use lowercase letters, digits, underscore (1-32) or punctuation only, optional .plan suffix')
    if (input.scope === undefined || input.scope === null || input.scope === '') return fail(SCOPE_REQUIRED)
    if (!isScope(input.scope)) return fail(BAD_SCOPE)
    const scope = scopeIn(roots, input.scope)
    const text = filled(input.text)
    const planText = filled(input.planText)
    if (text === null && planText === null) return fail('text is empty')
    const description = typeof input.description === 'string' ? input.description.trim().replace(/\s+/g, ' ') : ''
    if (description === '') return fail('description is empty')
    const token = prefix + stem
    if (planText !== null) {
      if (stem.endsWith(PLAN)) return fail('planText needs the name without .plan')
      // The normal def the part joins; a new text file inherits its insert.
      const base = rowsOf(await load(io, roots)).find((r) => r.def.name.toLowerCase() === stem && !r.def.isPlan)?.def
      if (text === null && base === undefined) return fail(`${token} has no text yet: send text too`)
      if ((base?.insert ?? 'context') !== 'context') return fail(NEEDS_CONTEXT)
    }
    const dir = dirOf(roots, scope)
    if (dir === undefined) return fail(noDir(scope))
    const files: [string, string][] = []
    for (const [file, content] of [
      [`${stem}.md`, text === null ? undefined : definitionFile(description, text, stem.endsWith(PLAN) ? 'add' : undefined)],
      [`${stem}${PLAN_MD}`, planText === null ? undefined : definitionFile(description, planText, 'add')],
    ] as const) {
      if (content === null) return fail(BAD_FENCE)
      if (content !== undefined) files.push([file, content])
    }
    // Same-name entry (any case): a symlink or directory would send the write outside the layer dir.
    const listing = (await io.exists(dir)) ? await io.list(dir) : []
    const clash = listing.find((en) => files.some(([f]) => en.name.toLowerCase() === f) && (en.isLink || en.kind !== 'file'))
    if (clash !== undefined) return fail(`refused, ${dir}/${clash.name} is not a plain file`)
    for (const [file, content] of files) await io.write(`${dir}/${file}`, content)
    const registry = await load(io, roots)
    const won = files.map(([f]) => registry.sources.get(f.slice(0, -3))).find((l) => l !== undefined && l !== scope)
    const note = won === undefined ? '' : `; note: the ${layerLabel(won)} layer wins over ${scope}`
    const what = text === null ? `the plan-mode part of ${token}` : token
    const shown = shownDirs(roots, home)[scope]
    return { text: `saved ${what} (${scope}): ${files.map(([f]) => `${shown}/${f}`).join(', ')}${note}`, registry }
  } catch (e) {
    return fail(`failed: ${why(e)}`)
  }
}

const servedLabel = (id: string): string => (id.endsWith('-legacy') ? `brewtools ${id.slice(0, -'-legacy'.length)}` : id)

// What the name sends after the removal: the layer now serving the removed part, else what is left.
function after(reg: Registry, stem: string, token: string, isPlanPart: boolean): string {
  const now = reg.sources.get(isPlanPart ? `${stem}${PLAN}` : stem)
  const what = isPlanPart ? `plan-mode part of ${token}` : token
  if (now !== undefined) return now === 'default' ? `the built-in ${what} is back` : `the ${servedLabel(now)} ${what} is served now`
  if (!reg.sources.has(isPlanPart ? stem : `${stem}${PLAN}`)) return `${token} is no longer defined`
  return isPlanPart ? `${token} keeps its normal text` : `${token} keeps only its plan-mode part`
}

// No user file to remove: a legacy brewtools file, a built-in, a missing plan part or an unknown name.
async function notRemovable(io: Io, roots: Roots, stem: string, part: Part, token: string): Promise<string> {
  const keys = part === 'plan' ? [`${stem}${PLAN}`] : part === 'normal' ? [stem] : [stem, `${stem}${PLAN}`]
  const reg = await load(io, roots)
  const rows = rowsOf(reg).filter((r) => keys.includes(r.stem))
  const legacy = rows.find((r) => r.layer.endsWith('-legacy'))
  if (legacy !== undefined) {
    const dir = dirOf(roots, legacy.layer) ?? legacy.layer
    return `${token} comes from a brewtools file (${dir}/${legacy.def.legacy ?? stem}.md) · delete it by hand if you no longer need it`
  }
  if (rows.some((r) => r.layer === 'default')) return `${token} is built in and cannot be removed · change what it sends: /placeholders change ${token} ...`
  if (part === 'plan' && reg.sources.has(stem)) return `${token} has no plan-mode part`
  return `unknown placeholder ${token}`
}

// Removes the part's files from one layer: the given scope, else the one layer holding them; both layers -> ask. home: shown paths use `~`.
export async function removeTool(io: CmdIo, roots: Roots, input: RemoveInput, prefix: string = DEFAULT_PREFIX, home?: string): Promise<ToolOut> {
  try {
    const raw = bare(input.name, prefix)
    if (raw === null) return fail('bad name')
    const isPlanStem = raw.endsWith(PLAN)
    const stem = isPlanStem ? raw.slice(0, -PLAN.length) : raw
    const part = input.part === undefined ? (isPlanStem ? 'plan' : 'all') : input.part
    if (part !== 'all' && part !== 'normal' && part !== 'plan') return fail("part must be 'all', 'normal' or 'plan'")
    if (input.scope !== undefined && !isScope(input.scope)) return fail(BAD_SCOPE)
    const scope = input.scope === undefined ? undefined : scopeIn(roots, input.scope)
    const token = prefix + stem
    const held = (await userFiles(io, roots)).map((h) => ({ ...h, files: partFiles(h.files, stem, part) })).filter((h) => h.files.length > 0)
    const picked = scope === undefined ? held : held.filter((h) => h.scope === scope)
    if (picked.length > 1) return fail(`${token} is in both layers (global and project): ask "Remove ${token} from where?" (Global / Project), then call remove_placeholder again with scope`)
    const target = picked[0]
    if (target === undefined) {
      const other = held[0]
      return fail(other !== undefined ? `${token} has no ${String(scope)} file; it is in the ${other.scope} layer` : await notRemovable(io, roots, stem, part, token))
    }
    // Every file must be a plain file whose real path sits inside the real layer dir; nothing goes until all pass.
    const base = (await io.stat(target.dir))?.realPath?.replace(/\/+$/, '')
    const reals: string[] = []
    for (const f of target.files) {
      const st = await io.stat(`${target.dir}/${f}`)
      const real = st?.realPath
      if (st === undefined || st.kind !== 'file' || st.isLink || base === undefined || base === '' || real === undefined || !real.startsWith(`${base}/`)) {
        return fail(`refused, ${target.dir}/${f} is not a plain file inside ${target.dir}`)
      }
      reals.push(real)
    }
    for (const real of reals) {
      const res = await io.remove(real)
      if (res.exitCode !== 0) return fail(`rm failed (exit ${res.exitCode}): ${res.stderr.trim()}`)
    }
    const registry = await load(io, roots)
    const shown = shownDirs(roots, home)[target.scope]
    const paths = target.files.map((f) => `${shown}/${f}`).join(', ')
    const isPlanPart = target.files.every(isPlanFile)
    const what = isPlanPart ? `the plan-mode part of ${token}` : token
    return { text: `removed ${what} (${target.scope}): ${paths} · ${after(registry, stem, token, isPlanPart)}`, registry }
  } catch (e) {
    return fail(`failed: ${why(e)}`)
  }
}
