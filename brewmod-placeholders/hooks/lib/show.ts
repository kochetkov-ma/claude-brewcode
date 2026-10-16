// What /placeholders answers without Claude: the grammar, status, help, show and list texts. Pure, zero I/O.
import { DEFAULT_PREFIX, compileMatchers, scanDraft, type Matchers } from './match'
import { MAX_CHARS, PLAN_LABEL, REASON, planParts, sentText, type PlanParts } from './sent'
import { inlineBodies } from './inline'
import { FOCUS_MAX } from './band'
import { block, byName, isScope, layerLabel, type Dirs, type Scope } from './command'
import type { Registry } from './defs'

export { shownDirs, type Dirs } from './command'

export const DOCS_URL = 'https://doc-claude.brewcode.app/mods/placeholders/'
export const README_URL = 'https://github.com/kochetkov-ma/claude-brewcode/tree/main/brewmod-placeholders'

export type Action =
  | { kind: 'status' }
  | { kind: 'help' }
  | { kind: 'list' }
  | { kind: 'show'; names: string[] }
  | { kind: 'claude'; request: string; scope: Scope | null }

type Cue = 'status' | 'help' | 'list' | 'show' | 'mutate' | 'filler'

// Per cue: exact EN/RU words, then RU stems (prefix match). The order is the lookup order.
const CUES: readonly [Cue, readonly string[], readonly string[]][] = [
  ['status', ['status'], ['статус']],
  ['help', ['help', '-h', '--help', '?', 'usage', 'docs'], ['помощ', 'справк', 'хелп', 'инструкц']],
  ['list', ['list', 'ls', 'all', 'every', 'everything', 'все', 'весь', 'всех'], ['список']],
  ['show', ['show', 'print', 'display', 'view', 'see', 'cat', 'open', 'expand', 'what', 'whats', 'что'], ['покаж', 'показ', 'выве', 'вывод', 'отобраз', 'откр', 'раскр', 'посмотр', 'глян']],
  [
    'mutate',
    ['add', 'new', 'create', 'make', 'save', 'set', 'write', 'change', 'edit', 'update', 'modify', 'fix', 'rename', 'replace', 'rewrite', 'shorten', 'extend', 'remove', 'delete', 'drop', 'rm', 'del'],
    ['добав', 'нов', 'созда', 'сдела', 'сохран', 'запомн', 'измен', 'поменя', 'замен', 'исправ', 'обнов', 'редакт', 'переимен', 'перепиш', 'сократ', 'укорот', 'допиш', 'расшир', 'удал', 'убер', 'сотр'],
  ],
  [
    'filler',
    ['me', 'the', 'and', 'please', 'text', 'full', 'whole', 'of', 'for', 'placeholder', 'placeholders', 'is', 'are', 'does', 'do', 'it', 'its', 'mean', 'means', 'about', 'мне', 'и', 'а', 'пожалуйста', 'целиком', 'такое', 'за', 'это', 'про'],
    ['текст', 'полн', 'плейсхолдер', 'значит', 'делает'],
  ],
]

const cueOf = (word: string): Cue | null => CUES.find(([, words, stems]) => words.includes(word) || stems.some((st) => word.startsWith(st)))?.[0] ?? null

// Prefix tokens (known or not) cut out, a `?` right after one taken with it; isQueries = every token had one, none overlapped.
function walk(ms: Matchers, text: string): { names: string[]; isQueries: boolean; rest: string } {
  const names: string[] = []
  let isQueries = true
  let rest = ''
  let at = 0
  for (const t of scanDraft(ms, text).tokens) {
    const isQuery = text.charAt(t.end) === '?'
    isQueries = isQueries && t.start >= at && isQuery
    if (t.start < at) continue
    rest += `${text.slice(at, t.start)} `
    names.push(t.name)
    at = isQuery ? t.end + 1 : t.end
  }
  return { names, isQueries, rest: rest + text.slice(at) }
}

// First match wins: scope word, a change word, names to show, help, list, status; any other word goes to Claude.
// Lowercase, `ё` -> `е`; words split on spaces and `,;:!.`, a trailing `?` dropped.
export function parseArgs(args: string, prefix: string, names: readonly string[]): Action {
  const request = args.trim()
  const toClaude = (scope: Scope | null = null): Action => ({ kind: 'claude', request, scope })
  const known = new Set(names.map((n) => n.toLowerCase()))
  const { names: tokens, rest } = walk(compileMatchers(prefix, known), request.toLowerCase().replace(/ё/g, 'е'))
  const words = rest
    .replace(/['’]/g, '')
    .split(/[\s,;:!.]+/)
    .filter((w) => w !== '')
    .map((w) => (w.length > 1 ? w.replace(/\?+$/, '') : w))
  const first = request.split(/\s+/)[0]?.toLowerCase() ?? ''
  if (isScope(first)) return words.length + tokens.length > 1 ? toClaude(first) : { kind: 'status' }
  const cues = words.map((w) => ({ w, cue: cueOf(w) }))
  if (cues.some((c) => c.cue === 'mutate' || (c.cue === null && !known.has(c.w)))) return toClaude()
  const items = [...new Set([...tokens, ...cues.filter((c) => c.cue === null).map((c) => c.w)])]
  if (items.length > 0) return cues.some((c) => c.cue === 'status' || c.cue === 'help') ? toClaude() : { kind: 'show', names: items }
  if (cues.some((c) => c.cue === 'help')) return { kind: 'help' }
  if (cues.some((c) => c.cue === 'list')) return { kind: 'list' }
  return { kind: 'status' }
}

// P1: a prompt made only of `P<name>?` items (spaces, commas between) -> the names; anything else -> null.
export function queryNames(ms: Matchers, text: string): string[] | null {
  const w = walk(ms, text)
  return w.names.length > 0 && w.isQueries && /^[\s,;]*$/.test(w.rest) ? [...new Set(w.names)] : null
}

// Prefixed tokens: a bare name can be a cue word (`fix`, `docs`, `all`) and turn the line into another command.
export const showCommand = (prefix: string, names: readonly string[]): string => `/placeholders show ${names.map((n) => prefix + n).join(' ')}`
// P1 fill: a trailing space puts the caret past the last token, so no name typeahead opens under the box and Enter runs the command.
export const fillText = (prefix: string, names: readonly string[]): string => `${showCommand(prefix, names)} `
export const queryDrop = (prefix: string, names: readonly string[]): string =>
  `${names.map((n) => `${prefix}${n}?`).join(' ')} = ${showCommand(prefix, names)} · not sent to Claude · press Enter to print it`

const DEFAULT_DIRS: Dirs = { global: '~/.claude/placeholders', project: '.claude/placeholders' }

type NameRow = { name: string; layer: string; planLayer: string | null; kind: PlanParts['kind']; inline: boolean; description: string }

// One row per name, sorted by name; layer = the normal part's (plan-only: the plan file's).
const nameRows = (reg: Registry, prefix: string): NameRow[] =>
  byName(reg, prefix).map(({ name, lead, plan, own, kind }) => ({
    name,
    layer: layerLabel(lead.layer),
    planLayer: plan === undefined ? null : layerLabel(plan.layer),
    kind,
    inline: own.every((r) => r.def.insert === 'inline'),
    description: lead.def.description ?? '-',
  }))

const tagOf = (r: NameRow): string =>
  r.kind === 'only' ? PLAN_LABEL.only : r.kind === 'add' || r.kind === 'replace' ? (r.planLayer === null || r.planLayer === r.layer ? PLAN_LABEL.plus : `${PLAN_LABEL.plus} (${r.planLayer})`) : r.inline ? 'inline' : ''

// The example name in hints: `r` when defined, else the first word name, else the first name.
const sample = (rows: readonly NameRow[]): string => rows.find((r) => r.name === 'r')?.name ?? rows.find((r) => /^\w+$/.test(r.name))?.name ?? rows[0]?.name ?? 'name'

export function statusText(reg: Registry, prefix: string = DEFAULT_PREFIX, dirs: Dirs = DEFAULT_DIRS): string {
  const rows = nameRows(reg, prefix)
  const tags = rows.map(tagOf)
  const w = Math.max(4, ...rows.map((r) => (prefix + r.name).length))
  const lw = Math.max(6, ...rows.map((r) => r.layer.length))
  const tw = Math.max(0, ...tags.map((t) => t.length))
  const lines = rows.map((r, i) => [(prefix + r.name).padEnd(w), r.layer.padEnd(lw), ...(tw === 0 ? [] : [(tags[i] ?? '').padEnd(tw)]), r.description].join('  '))
  const issues = reg.issues.length === 0 ? [] : ['', `issues (${reg.issues.length}):`, ...reg.issues.map((i) => `  ${i}`)]
  const s = sample(rows)
  return block(`${rows.length} placeholders · type ${prefix}name anywhere in a prompt`, [...lines, ...issues], [
    `Caret on a token: the band shows up to ${FOCUS_MAX} rows of what it sends · whole text: \`${showCommand(prefix, [s])}\`, or \`${prefix}${s}?\` alone + Enter twice · \`/placeholders list\` for all`,
    `Send one message as typed: put \`${prefix}/\` anywhere in it`,
    `Add, change, remove: \`/placeholders <your words>\` in any language, e.g. \`/placeholders add ${prefix}db: use the staging DB\``,
    `Where: global = all projects (\`${dirs.global}\`), project = this one (\`${dirs.project}\`, wins over global); start with \`global\` or \`project\`, or just say it`,
    'Commands (`list`, `show`, `help`) are only faster; plain words work too · full help: `/placeholders help`',
  ])
}

export function helpText(prefix: string = DEFAULT_PREFIX, dirs: Dirs = DEFAULT_DIRS): string {
  const p = prefix
  return [
    `placeholders help · a placeholder is a short token (${p}name) that adds saved text to your prompt`,
    `Use: type \`${p}m\` anywhere in a prompt; Tab completes; the band above the prompt shows what each token sends.`,
    `Caret on a token (arrows, Home, End): the band shows up to ${FOCUS_MAX} rows of what it sends; \`?\` right after the token only makes room for those rows while the name menu is open.`,
    `Whole text, printed in the chat, not sent to Claude: \`${showCommand(p, ['r'])}\` (several: \`${showCommand(p, ['r', 'm'])}\`) · or \`${p}r?\` alone in a message: Enter fills that command, Enter again prints it · all: \`/placeholders list\`.`,
    `Send as typed: \`${p}/\` (or \`${p}\\\`) anywhere in a message turns every placeholder in it off; the marker stays in the text.`,
    `Plan mode: \`<name>.plan.md\` with \`plan: add\` adds its text to \`<name>.md\` only in Plan mode (built-in \`${p}m\` works this way); without \`plan: add\` it replaces the text; \`when: plan\` in \`<name>.md\` alone = plan-only (\`${p}+\`). The band marks \`${PLAN_LABEL.plus}\` and shows "${PLAN_LABEL.adds}"; one review per message (\`${p}rr\` wins over \`${p}r\`).`,
    `Add, change, remove: \`/placeholders <your words, any language>\`; Claude drafts, asks once, saves. E.g. \`/placeholders add ${p}db: use the staging DB\` · \`/placeholders global make ${p}r shorter\` · \`/placeholders удали ${p}db\` · \`/placeholders add a plan-mode part to ${p}db: plan first, then build\`.`,
    `Remove: \`/placeholders remove ${p}db\` (both parts) · \`/placeholders удали план у ${p}db\` (plan part only) · removing your override brings the built-in back; built-ins cannot be removed.`,
    `Where: global = all projects, \`${dirs.global}/<name>.md\`; project = this project, \`${dirs.project}/<name>.md\`, wins over global; plugin defaults sit below both. A first word \`global\` or \`project\` decides, else your words do; unclear -> one question, Global first. A change keeps its layer; a remove asks when the name is in both.`,
    'Files: `<name>.md` = optional front matter (description, when: always|plan|not-plan, insert: context|inline, order, group, priority, header) + the text. Edit by hand any time; the next prompt reads it.',
    `Prefix: \`/config\` -> Placeholder prefix (2-8 punctuation characters, default \`${DEFAULT_PREFIX}\`).`,
    `Commands: \`/placeholders\` status · \`list\` · \`show ${p}<name> ...\` · \`help\` · anything else goes to Claude. Commands are shortcuts; plain words work too.`,
    `Docs: ${DOCS_URL}`,
    `README: ${README_URL}`,
  ].join('\n')
}

// A part in its own fence; an empty one says so instead. sent = the length the cap applies to (an added part is sent joined).
const part = (label: string, text: string, sent: number = text.length): string =>
  text === '' ? `${label} (empty, sends nothing)` : block(`${label}${sent > MAX_CHARS ? ` (cut at ${MAX_CHARS} chars when sent)` : ''}`, text.split('\n'))

function nameBlock(reg: Registry, r: NameRow, prefix: string, isPlan: boolean): string {
  const tag = tagOf(r)
  const head = `\`${prefix}${r.name}\` · ${r.layer}${tag === '' ? '' : ` · ${tag}`}`
  if (r.inline) {
    const body = inlineBodies(reg.defs).get(r.name)
    if (body !== undefined) return [head, part('replaces the token with:', body)].join('\n')
    // Only a `when: always` inline def with a body expands (the module has no mode); any other stays as typed.
    const d = reg.defs.find((x) => x.name.toLowerCase() === r.name && x.insert === 'inline')
    return [head, d === undefined || d.body === '' ? `${REASON.staysAsTyped} (empty)` : part(`${REASON.staysAsTyped} (when: ${d.when}); its text:`, d.body, 0)].join('\n')
  }
  const p = planParts(reg.defs, r.name, prefix)
  if (p.kind === 'only') return [head, part(PLAN_LABEL.onlyPart, p.plan)].join('\n')
  if (p.kind === 'add') {
    // Plan mode sends one block: the plan header when it has one, the normal body, then the part.
    const joined = sentText(r.name, reg.defs, prefix, true).text
    if (isPlan) return [head, part('normal + plan mode part:', joined)].join('\n')
    return [head, part('normal:', p.normal), part(PLAN_LABEL.adds, p.plan, joined.length)].join('\n')
  }
  const extra = p.kind === 'replace' ? [part(PLAN_LABEL.instead, p.plan)] : []
  return [head, part('normal:', p.normal), ...extra].join('\n')
}

// show (names) or list (null): one block per name; unknown names are listed at the foot.
export function fullText(reg: Registry, names: readonly string[] | null, prefix: string = DEFAULT_PREFIX, isPlan = false): string {
  const rows = nameRows(reg, prefix)
  const mode = `full text as sent · plan mode ${isPlan ? 'on' : 'off'}`
  const blocks = (picked: readonly NameRow[]): string[] => picked.map((r) => nameBlock(reg, r, prefix, isPlan))
  if (names === null) return [`${rows.length} placeholders · ${mode}`, ...blocks(rows), 'Add, change, remove: `/placeholders <your words>`'].join('\n')
  const keys = names.map((n) => n.toLowerCase())
  const unknown = keys.filter((k) => !rows.some((r) => r.name === k))
  const foot = unknown.length === 0 ? [] : [`unknown: ${unknown.map((n) => `\`${prefix}${n}\``).join(', ')} · names: /placeholders list`]
  return [`${keys.map((k) => prefix + k).join(', ')} · ${mode}`, ...blocks(keys.flatMap((k) => rows.filter((r) => r.name === k))), ...foot].join('\n')
}
