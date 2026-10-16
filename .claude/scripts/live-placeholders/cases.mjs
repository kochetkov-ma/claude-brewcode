// Live cases for brewmod-placeholders; every literal re-synced 2026-10-15 (CP4) from band.tsx, show.ts, command.ts, sent.ts bytes.
// cp = checkpoint where a case becomes valid: 1 band, 2 /placeholders show/list/status/help, 3 scope + plan parts, 4 review-round additions.

// Regions: band = rows above the prompt box, prompt = inside it, below = under it, menu = the typeahead (below; above in fullscreen), hist = scrollback.
export const B = (s) => ['band', s]
export const P = (s) => ['prompt', s]
export const U = (s) => ['below', s]
export const M = (s) => ['menu', s]
export const H = (s) => ['hist', s]
export const A = (re) => ['ansi', re]
// Steps: t = type text, k = key (tmux name) n times, c = check, enter = submit (re-sent once if a typeahead ate it), turn = one model turn.
export const t = (text) => ({ text })
export const k = (key, n = 1) => ({ key, n })
export const c = (expect, forbid = [], extra = {}) => ({ check: { expect, forbid, ...extra } })
export const enter = () => ({ submit: true })
export const turn = (prompt, token) => ({ turn: prompt, token })

// band.tsx: focusFoot, compactFoot, queryHint, showHint (prefixed name), alsoRow, ESCAPED_HEAD, escapedFoot, PLAN_*, planNote.
const FOCUS = (tok) => `close: move the caret off ${tok} · send as typed: ++/`
const COMPACT = (tok) => `more: put the caret on ${tok} · send as typed: ++/ · help: /placeholders help`
const COMPACT_ANY = 'more: put the caret on'
const FOCUS_ANY = 'move the caret off'
const QUERY_R = 'type ? after ++r to see all'
const SHOW = (n) => `/placeholders show ++${n}`
// Cut row hint and the focus head label (band.tsx showHint, RECEIVES).
const CUT = (n) => `more lines · whole text: /placeholders show ++${n}`
const RECV = (tok) => `${tok} · Claude receives these lines now:`
const NO_BUTTON = [B('Show text'), B('Hide text'), B('ctrl+x')]
const PLAN_HEAD = '· plan mode'
const PLAN_PLUS = 'plan +'
const PLAN_ADDS = 'plan mode adds:'
// planNote(m): 29 = lines of the m.plan.md addition (plan: add); shown until the first prompt confirms plan mode (task #92).
const PLAN_NOTE = 'not sent now · plan mode adds 29 lines'
// placeholders/*.md: headers ({token} = ++name) and body anchors.
const R_HEAD = 'User typed `++r` — Two-phase review discipline is active for this turn:'
const R_TOP = '[REVIEW DISCIPLINE: DOUBLE-CHECK]'
const R_LAST = 'return verdict first, then findings.'
const RR_TOP = '[REVIEW DISCIPLINE: ANTI-REGRESSION]'
const M_HEAD = 'User typed `++m` — Manager mode is active for this turn:'
const M_PLAN_HEAD = 'User typed `++m` — Manager + Plan Mode is active for this turn:'
const M_TOP = '[ROLE: MANAGER]'
const M_ADDON = '[ADDON: PLAN MODE]'
// The plan-effort row (its copy loads with --with-plan-effort, or the installed one) and the engine's scroll row under a band past its slot.
const PLAN_ROW = /^plan mode · effort /m
const SCROLLED = /^↓ \d+ more/m
const A_TOP = '[DIRECTIVE: ARCHITECTURE-FIRST]'
const PLUS_TOP = '[ADDON: ANTI-DRIFT CRON PLAN]'
const RR_ROW = 'Anti-regression review'
const R_DESC_ROW = 'Two-phase review: review every'
// Fixtures: drive.mjs writes INLINE into <project>/.claude/placeholders and GLOBAL_FIXTURES into the isolated global dir.
export const INLINE = { file: 'lpinl.md', token: '++lpinl', description: 'LP inline fixture', body: 'LP-INLINE-BODY-7Q' }
const FIX_BODY = 'LP-FIX-BODY-3K'
export const GLOBAL_FIXTURES = { 'fix.md': `---\ndescription: "LP cue-word fixture"\n---\n${FIX_BODY}\n` }
const HANDOFF = 'asking Claude to help'
// command.ts handoffText: the scope line when the first word names the layer, and the ask-first line (prefix; the line wraps).
const HANDOFF_SCOPE = (scope) => `Scope: ${scope} (I said it; skip only the Where question).`
const ASK_FIRST = 'Ask first: no save_placeholder or remove_placeholder call before I answered your one AskUserQuestion'
// show.ts: statusText, helpText, fullText heads (names in the order asked); queryDrop for P1.
const STATUS_HEAD = '6 placeholders · type ++name anywhere in a prompt'
const HELP_HEAD = 'placeholders help · a placeholder is a short token (++name) that adds saved text to your prompt'
const LIST_HEAD = '6 placeholders · full text as sent · plan mode off'
const SHOW_HEAD = (names, plan = 'off') => `${names} · full text as sent · plan mode ${plan}`
const DROPPED = 'Prompt dropped by a hook: '
const NOT_SENT = 'not sent to Claude · press Enter to print it'
// A literal whose spaces may wrap (any run of whitespace), for long lines at narrow sizes.
const W = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ +/g, '\\s+'))
// show.ts statusText / helpText full-text lines as rendered (inline backticks vanish).
const STATUS_FULL = 'Caret on a token: the band shows up to 15 rows of what it sends · whole text: /placeholders show ++r, or ++r? alone + Enter twice · /placeholders list for all'
const HELP_CARET = 'Caret on a token (arrows, Home, End): the band shows up to 15 rows of what it sends; ? right after the token only makes room for those rows while the name menu is open.'
const HELP_WHOLE = 'Whole text, printed in the chat, not sent to Claude: /placeholders show ++r (several: /placeholders show ++r ++m) · or ++r? alone in a message: Enter fills that command, Enter again prints it · all: /placeholders list.'
// A model turn in the session debug log: inject.mjs ran for a submitted prompt.
const SUBMITTED = /UserPromptSubmit \[node "[^"]*inject\.mjs"\]/
const PROVIDED = /inject\.mjs"\) provided additionalContext/
const STRIKE = /\x1b\[(?:\d+;)*9(?:;\d+)*m/
// 6.9.4 restyle SGR, dark theme (suggestion 153, text 231, dim 246); the default TUI splits dim runs per word, actions stay whole.
const RX = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const TOK_A = (tok) => new RegExp(`\\x1b\\[1m\\x1b\\[38;5;153m${RX(tok)}\\x1b\\[0m`)
const UNK_A = (tok) => new RegExp(`\\x1b\\[1m\\x1b\\[38;5;220m${RX(tok)}\\x1b\\[0m`)
const ACT_A = (s) => new RegExp(`\\x1b\\[4m\\x1b\\[38;5;231m${RX(s)}\\x1b\\[0m`)
const LABEL_A = (word) => new RegExp(`\\x1b\\[38;5;246m${RX(word)}`)
const SENT_A = /\x1b\[1m\x1b\[38;5;231mUser/
// Focus foot: the action underlined in the text colour, the dim label run right after it (the row's first label can inherit its SGR from the line above).
const FOOT_A = /\x1b\[4m\x1b\[38;5;231mmove the caret off \+\+m\x1b\[0m\x1b\[38;5;246m ·/
// ` alone ` dim and not underlined, then [Enter] in the text colour, not underlined.
const KEY_A = /\x1b\[38;5;246m alone(?:\x1b\[39m)? \x1b\[38;5;231m\[Enter\]\x1b\[39m/
const OR_Q = (n) => `/placeholders show ++${n} or ++${n}? alone [Enter]`
// A turn in progress (spinner row `Concocting… (6s · ↓ 531 tokens)`); a model-driven check waits up to TURN_MS.
const BUSY = /…\s*\(\d+s/
const TURN_MS = 120000

// Shared tmux sessions; a case without `session` gets a fresh one. tui = pinned via --settings (default when absent);
// warm = one model turn first (inject.mjs records the mode); isolate = the copy's global root is a scratch dir ({PCFG}, shown as {GDIR}).
export const SESSIONS = {
  d80: { size: '80x24', mode: 'default' },
  d80x30: { size: '80x30', mode: 'default' },
  d200: { size: '200x60', mode: 'default' },
  planWarmShow: { size: '200x60', mode: 'plan', warm: true },
  p1cue: { size: '120x40', mode: 'default', isolate: true },
  scope: { size: '200x60', mode: 'default', isolate: true },
  // Writes only the scratch project layer (or nothing), so it also runs under --installed; the guard row still watches the real global dir.
  scopeProj: { size: '200x60', mode: 'default' },
  // CP5 UI-only smoke: answered locally, never a model turn (every check forbids inject.mjs on a submitted prompt).
  smoke: { size: '120x40', mode: 'default' },
  light120: { size: '120x40', mode: 'default', theme: 'light' },
}

const focusR = (extra = []) => c([B(R_HEAD), B(FOCUS('++r')), ...extra], [B(COMPACT_ANY)])
const compactR = () => c([B(COMPACT('++r'))], [B(FOCUS_ANY)])

// TUI matrix (review round): each case runs in the default TUI and fullscreen at 88x40 and 120x40; ids end -d88, -d120, -fs88, -fs120.
// Fullscreen: the typeahead draws above the box and the band budget is the engine's bottom slot (~14 rows at 40), so an opened 1-2 token band equals its preview.
const COMBOS = [['d', 'default'], ['fs', 'fullscreen']].flatMap(([tag, tui]) => ['88x40', '120x40'].map((size) => ({ tag: `${tag}${size.split('x')[0]}`, tui, size })))
// Session families per combo: m = default mode, pc = launched in plan mode (no prompt yet), pw = plan mode after one model turn.
for (const m of COMBOS) {
  SESSIONS[`m-${m.tag}`] = { size: m.size, mode: 'default', tui: m.tui }
  SESSIONS[`pc-${m.tag}`] = { size: m.size, mode: 'plan', tui: m.tui }
  SESSIONS[`pw-${m.tag}`] = { size: m.size, mode: 'plan', tui: m.tui, warm: true }
}
// Hotfix 6.9.3 matrix: 80x24 and 120x40 in both TUIs, one session per combo (hx-<tag>); cases run in file order.
const HX = [['d', 'default'], ['fs', 'fullscreen']].flatMap(([tag, tui]) => ['80x24', '120x40'].map((size) => ({ tag: `${tag}${size.split('x')[0]}`, tui, size })))
for (const m of HX) {
  SESSIONS[`hx-${m.tag}`] = { size: m.size, mode: 'default', tui: m.tui }
  SESSIONS[`hxp-${m.tag}`] = { size: m.size, mode: 'plan', tui: m.tui, warm: true }
}
const hx = (base, title, build, fam = 'hx') => HX.map((m) => ({ id: `${base}-${m.tag}`, cp: 4, session: `${fam}-${m.tag}`, title: `${title} [${m.tui} ${m.size}]`, steps: build(m.tui === 'fullscreen', m.size === '80x24') }))
// fam null = a fresh session per case (default mode); tuis narrows the combos.
const matrix = (base, cp, title, build, { fam = 'm', tuis = ['default', 'fullscreen'] } = {}) =>
  COMBOS.filter((m) => tuis.includes(m.tui)).map((m) => ({ id: `${base}-${m.tag}`, cp, ...(fam === null ? { size: m.size, mode: 'default', tui: m.tui } : { session: `${fam}-${m.tag}` }), title: `${title} [${m.tui} ${m.size}]`, steps: build(m.tui === 'fullscreen') }))

export const CASES = [
  // CP1/CP4: band in both TUIs.
  ...matrix('r-end-menu', 1, '++r, caret at end, typeahead open: focus, whole r text, ++rr row', () => [t('++r'), focusR([B(R_LAST), M('++rr')])]),
  ...matrix('r-space', 1, '++r then space: compact, nothing cut, no Button', (fs) => [t('++r '), c([B('placeholders 1'), B(COMPACT('++r')), B(fs ? /return verdict first, then findings\.|more lines · whole text: \/placeholders show \+\+r/ : R_LAST)], [B(FOCUS_ANY), B('Show text')])]),
  ...matrix('caret-left', 1, 'fix ++r now: compact, Left x4 onto ++r: focus', () => [t('fix ++r now'), compactR(), k('Left', 4), focusR([B(R_LAST)])]),
  ...matrix('r-query', 1, '++r? forces the whole text, typeahead closed', () => [t('++r?'), c([B(R_HEAD), B(FOCUS('++r')), B(R_LAST)], [B(COMPACT_ANY), B(QUERY_R), M(RR_ROW)])]),
  ...matrix('also-row', 4, 'caret view of ++r ++m: also row names the other token, both ways', () => [t('++r ++m'), c([B(M_HEAD), B('also: ++r'), B(FOCUS('++m'))], [B(R_HEAD)]), k('Left', 4), c([B(R_HEAD), B('also: ++m'), B(FOCUS('++r'))], [B(M_HEAD)])]),
  ...matrix('escape-bs-only', 4, '++\\ alone (no ++/): escaped band names ++\\', () => [t('++\\ hello'), c([B('++\\  placeholders off: this message is sent exactly as typed'), B('turn back on: delete ++\\')], [B('++/'), B(FOCUS_ANY), B(COMPACT_ANY)])]),
  ...matrix('two-cut', 4, '++m ++a: bodies cut, each cut row names the show command, no Button', () => [t('++m ++a '), c([B('placeholders 2'), B(/more lines · whole text: \/placeholders show \+\+[ma]/)], NO_BUTTON)]),
  ...matrix('caret-home', 1, '++r fix it: compact, Home onto ++r: focus', () => [t('++r fix it'), compactR(), k('Home'), focusR()]),
  ...matrix('caret-end', 1, 'fix it ++r, Home: compact, End back onto ++r: focus', () => [t('fix it ++r'), k('Home'), compactR(), k('End'), focusR()]),
  ...matrix('rm-caret-m', 1, '++r ++m, caret on ++m: m focus, also ++r, plan-part note', () => [t('++r ++m'), c([B(M_HEAD), B(M_TOP), B('also: ++r'), B(FOCUS('++m')), B(RECV('++m')), B(PLAN_NOTE)], [B(R_HEAD), B(PLAN_ADDS), B(PLAN_PLUS)])]),
  ...matrix('escape-slash', 1, '++/ ++r: escaped band, nothing sent, token struck through', () => [t('++/ ++r'), c([B('++/  placeholders off: this message is sent exactly as typed'), B('++r  (not sent: ++/ in this message)'), B('turn back on: delete ++/'), A(STRIKE)], [B(R_TOP), B(FOCUS_ANY)])]),
  ...matrix('escape-backslash', 1, '++\\ ++r: escape alias', () => [t('++\\ ++r'), c([B('++\\  placeholders off: this message is sent exactly as typed'), B('(not sent: ++\\ in this message)'), B('turn back on: delete ++\\')], [B(R_TOP)])]),
  ...matrix('unknown-zz', 1, '++zz: unknown row and list hint', () => [t('++zz'), c([B('++zz  unknown placeholder'), B('names: /placeholders list')], [B(R_TOP)])]),
  ...matrix('m-default', 1, 'default mode ++m: receives label, not-sent-now plan note, show hint; no plan + in focus', () => [t('++m'), c([B(M_HEAD), B(RECV('++m')), B(PLAN_NOTE), B(SHOW('m'))], [B(PLAN_ADDS), B(/placeholders \d+ · plan mode/), B(PLAN_PLUS)])]),
  ...matrix('plus-default', 1, 'default mode +++: (plan only)', () => [t('+++ '), c([B('Anti-drift cron plan addon'), B('(plan only)')], [B(PLAN_HEAD)])]),
  ...matrix('inline', 1, 'project inline def ++lpinl: row and its body', () => [t(`${INLINE.token} `), c([B(INLINE.token), B(INLINE.description), B(INLINE.body)], [B('unknown placeholder')])]),
  ...matrix('nobutton-enter', 4, '1 token: no Button; Enter sends the prompt with the r context', (fs) => [
    t('++r reply with only the word LPOK'), c([B('placeholders 1'), B(COMPACT('++r')), ...(fs ? [] : [B(R_LAST)])], [B('Show text'), B(FOCUS_ANY)]),
    k('Enter'), c([/⏺ .*LPOK/], [BUSY], { debugExpect: [SUBMITTED, PROVIDED], timeout: TURN_MS }),
  ]),

  // Typeahead accept, recall and undo change the box without prompt.edit: prompt.change redraws the band at once (the box underline still waits for the next key).
  ...matrix('acc-tab', 4, '++ then Down x4 onto ++r, Tab takes it: band at once, no extra key', () => [t('++'), c([M('++a')]), k('Down', 4), c([M(/❯ \+\+r\s+Two-phase/)]), k('Tab'), c([P('++r'), B('placeholders 1'), B(COMPACT('++r'))], [M(RR_ROW), B(FOCUS_ANY)])]),
  ...matrix('acc-enter', 4, '++ then Down x4 onto ++r, Enter takes it: band at once, nothing submitted', () => [t('++'), c([M('++a')]), k('Down', 4), c([M(/❯ \+\+r\s+Two-phase/)]), k('Enter'), c([P('++r'), B('placeholders 1'), B(COMPACT('++r'))], [M(RR_ROW), B(FOCUS_ANY)], { debugForbid: [SUBMITTED] })]),
  // Undo groups the typed burst with the accept (seen live): one undo empties the box.
  ...matrix('acc-undo', 4, 'hello ++r, Tab takes ++rr: band names ++rr at once; undo empties the box: band gone', () => [t('hello '), c([P('hello')]), t('++r'), c([M('++rr')]), k('Tab'), c([P('hello ++rr'), B('placeholders 1'), B(COMPACT('++rr'))], [B(R_HEAD)]), k('C-_'), c([P(/^❯\s*$/m)], [B(COMPACT_ANY), B(FOCUS_ANY)])]),
  // The recalled entry names ++r while the last edit saw ++m (then an empty box): a band of ++r can only come from the recall.
  ...matrix('acc-hist', 4, '/placeholders show ++r sent; ++m typed and killed; Up recalls the command: ++r focus band at once', () => [t('/placeholders show ++r'), enter(), c([P(/^❯\s*$/m)], [], { debugForbid: [SUBMITTED] }), t('++m'), c([B(M_HEAD)]), k('C-u'), c([P(/^❯\s*$/m)], [B(M_HEAD)]), k('Up'), c([P('/placeholders show ++r'), B(R_HEAD), B(FOCUS('++r'))], [B(M_HEAD)])]),

  // CP1: band at sizes outside the matrix, default TUI.
  { id: 'r-end-menu-80', cp: 1, session: 'd80', title: '++r at 80x24, typeahead open: capped; ? would not show it all, so the show hint', steps: [t('++r'), c([B(R_TOP), B(CUT('r')), M('++rr')], [B(R_LAST), B(QUERY_R), B(COMPACT_ANY)])] },
  { id: 'r-end-menu-q-80x30', cp: 4, session: 'd80x30', title: '++r at 80x30, typeahead open: capped; ? shows it all, so the ? hint', steps: [t('++r'), c([B(R_TOP), B(QUERY_R), M('++rr')], [B(R_LAST), B(SHOW('r'))])] },
  { id: 'r-query-80x30', cp: 4, session: 'd80x30', title: '++r? at 80x30: whole text', steps: [t('++r?'), focusR([B(R_LAST)])] },
  { id: 'r-end-menu-200', cp: 1, session: 'd200', title: '++r at 200x60, typeahead open: whole r text', steps: [t('++r'), focusR([B(R_LAST), M(RR_ROW)])] },
  { id: 'r-query-80', cp: 1, session: 'd80', title: '++r? at 80x24: focus cut with the show hint, no ? hint', steps: [t('++r?'), c([B(R_TOP), B(CUT('r')), B(FOCUS('++r'))], [B(QUERY_R), M(RR_ROW)])] },
  { id: 'r-query-200', cp: 1, session: 'd200', title: '++r? at 200x60: whole text', steps: [t('++r?'), focusR([B(R_LAST)])] },
  { id: 'm-default-80', cp: 1, session: 'd80', title: 'default mode ++m at 80x24: cut, plan-part note', steps: [t('++m'), c([B(M_TOP), B(PLAN_NOTE), B(SHOW('m'))], [B(PLAN_ADDS)])] },
  { id: 'm-default-200', cp: 1, session: 'd200', title: 'default mode ++m at 200x60: cut at 15 rows, plan-part note', steps: [t('++m'), c([B(M_HEAD), B(PLAN_NOTE), B(SHOW('m'))], [B(PLAN_ADDS)])] },
  // Plan mode, both TUIs: pc = launched in plan mode (band only has the note), pw = after one turn (inject.mjs recorded plan).
  ...matrix('plan-m-cold', 1, 'launched in plan mode, no prompt yet, ++m: honest plan-part note, no plan mode adds', () => [c(['plan mode on']), t('++m'), c([B(M_HEAD), B(RECV('++m')), B(PLAN_NOTE)], [B(PLAN_ADDS)])], { fam: 'pc' }),
  ...matrix('plan-head-cold', 1, 'launched in plan mode, no prompt yet, ++m ++r + space: no plan mode head yet, plan-part note', () => [t('++m ++r '), c([B('placeholders 2'), B(PLAN_NOTE)], [B(`placeholders 2 ${PLAN_HEAD}`), B(PLAN_ADDS)])], { fam: 'pc' }),
  ...matrix('plan-m-warm', 1, 'plan mode after one turn, ++m: plan mode adds', () => [t('++m'), c([B(PLAN_ADDS), B(M_ADDON), B(RECV('++m'))], [B(PLAN_NOTE), B(PLAN_PLUS)])], { fam: 'pw' }),
  ...matrix('plan-head-warm', 1, 'plan mode after one turn, ++m ++r + space: head says plan mode', () => [t('++m ++r '), c([B(`placeholders 2 ${PLAN_HEAD}`)])], { fam: 'pw' }),
  ...matrix('plan-plus-warm', 1, 'plan mode after one turn, +++: no (plan only), body shown', () => [t('+++ '), c([B(PLUS_TOP), B(PLAN_HEAD)], [B('(plan only)')])], { fam: 'pw' }),
  ...matrix('plan-shifttab-m', 1, 'Shift+Tab x2 into plan mode, no prompt yet, ++m: honest plan-part note', () => [k('BTab', 2), c(['plan mode on']), t('++m'), c([B(PLAN_NOTE)], [B(PLAN_ADDS)])], { fam: null }),
  { id: 'cmd-status-smoke', cp: 1, size: '120x40', mode: 'default', title: '/placeholders prints the status rows', steps: [t('/placeholders'), enter(), c([H('Two-phase review: review every significant change'), H('Anti-regression review: regression')], [H(HANDOFF)])] },

  // CP2: /placeholders status, help, list, show and P1 on Enter. Output renders markdown: inline backticks vanish, fenced text stays raw.
  // 6 names = 5 plugin + the ++lpinl fixture. Long help lines wrap at 200 columns: regexes allow the wrap (\s+).
  { id: 'cmd-status', cp: 2, size: '200x60', mode: 'default', title: '/placeholders: one row per name with plan +/plan only/inline tags, full-text line, no ++m.plan', steps: [t('/placeholders'), enter(), c([H(STATUS_HEAD), H(/\+\+\+\s+plugin\s+plan only\s+Anti-drift cron plan addon/), H(/\+\+m\s+plugin\s+plan \+\s+Manager mode/), H(/\+\+lpinl\s+project\s+inline\s+LP inline fixture/), H(W(STATUS_FULL))], [H('++m.plan'), H(HANDOFF)], { debugForbid: [SUBMITTED] })] },
  { id: 'cmd-status-escape-row', cp: 2, size: '200x60', mode: 'default', title: '/placeholders status: the ++/ escape row', steps: [t('/placeholders status'), enter(), c([H(STATUS_HEAD), H('Send one message as typed: put ++/ anywhere in it')], [H(HANDOFF)])] },
  { id: 'cmd-help', cp: 2, size: '200x60', mode: 'default', title: '/placeholders help: full help, caret and whole-text lines, escape alias, layers, doc links', steps: [t('/placeholders help'), enter(), c([H(HELP_HEAD), H(W(HELP_CARET)), H(W(HELP_WHOLE)), H('Send as typed: ++/ (or ++\\) anywhere in a message'), H(/global = all projects, ~\/\.claude[\w-]*\/placeholders\/<name>\.md/), H('Docs: https://doc-claude.brewcode.app/mods/placeholders/')], [H(HANDOFF)], { debugForbid: [SUBMITTED] })] },
  { id: 'cmd-list', cp: 2, size: '200x60', mode: 'default', title: '/placeholders list: every name with its full text and plan part', steps: [t('/placeholders list'), enter(), c([H(LIST_HEAD), H('+++ · plugin · plan only'), H('plan mode only:'), H('++m · plugin · plan +'), H('++lpinl · project · inline'), H('replaces the token with:'), H(R_TOP), H(RR_TOP), H(A_TOP), H(M_TOP), H(PLUS_TOP), H(M_ADDON), H(INLINE.body), H('Add, change, remove: /placeholders <your words>')], [H(HANDOFF)], { debugForbid: [SUBMITTED] })] },
  { id: 'cmd-show-r-m', cp: 2, size: '200x60', mode: 'default', title: '/placeholders show r m (plan mode off): normal: + plan mode adds:', steps: [t('/placeholders show r m'), enter(), c([H(SHOW_HEAD('++r, ++m')), H('++r · plugin'), H('++m · plugin · plan +'), H('normal:'), H(PLAN_ADDS), H(R_TOP), H(M_TOP), H(M_ADDON)], [H(A_TOP), H(RR_TOP), H(HANDOFF), H('normal + plan mode part:')], { debugForbid: [SUBMITTED] })] },
  { id: 'cmd-show-ru', cp: 2, size: '200x60', mode: 'default', title: '/placeholders покажи ++m и ++r: instant show', steps: [t('/placeholders покажи ++m и ++r'), enter(), c([H(SHOW_HEAD('++m, ++r')), H('++m · plugin · plan +'), H('++r · plugin')], [H(A_TOP), H(RR_TOP), H(HANDOFF)], { debugForbid: [SUBMITTED] })] },
  { id: 'cmd-show-en', cp: 2, size: '200x60', mode: 'default', title: '/placeholders show me ++m and ++r: instant show', steps: [t('/placeholders show me ++m and ++r'), enter(), c([H(SHOW_HEAD('++m, ++r')), H('++m · plugin · plan +'), H('++r · plugin')], [H(A_TOP), H(RR_TOP), H(HANDOFF)], { debugForbid: [SUBMITTED] })] },
  { id: 'cmd-show-ru-full', cp: 2, size: '200x60', mode: 'default', title: '/placeholders выведи полностью ++r: instant show of r only', steps: [t('/placeholders выведи полностью ++r'), enter(), c([H(SHOW_HEAD('++r')), H('++r · plugin'), H(R_LAST)], [H('++m · plugin'), H(HANDOFF)], { debugForbid: [SUBMITTED] })] },
  // P1 is two Enters by design: the first drops the prompt and fills the show command (command.run re-entry is skipped on 2.1.301).
  {
    id: 'p1-query-submit', cp: 2, size: '120x40', mode: 'default', title: 'Enter on ++r? alone: dropped, box filled; Enter again prints r; no model turn',
    steps: [
      t('++r?'), c([B(FOCUS('++r'))]),
      k('Enter'), c([`${DROPPED}++r? = /placeholders show ++r · ${NOT_SENT}`, P('/placeholders show ++r')], [B(FOCUS_ANY), M(RR_ROW), M('++rr')], { debugForbid: [SUBMITTED] }),
      k('Enter'), c([H(SHOW_HEAD('++r')), H('++r · plugin'), P(/^❯\s*$/)], [B(FOCUS_ANY), P('++rr')], { debugForbid: [SUBMITTED] }),
    ],
  },
  {
    id: 'p1-two-submit', cp: 4, size: '120x40', mode: 'default', title: 'Enter on ++r? ++m?: one drop names both, box filled; Enter prints both; no model turn',
    steps: [
      // The drop row is 2 cells too long for 120 columns and wraps before `it`.
      t('++r? ++m?'), k('Enter'), c([/Prompt dropped by a hook: \+\+r\? \+\+m\? = \/placeholders show \+\+r \+\+m · not sent to Claude · press Enter to print\s+it/, P('/placeholders show ++r ++m')], [], { debugForbid: [SUBMITTED] }),
      k('Enter'), c([H(SHOW_HEAD('++r, ++m')), H('++r · plugin'), H('++m · plugin · plan +')], [H(HANDOFF)], { debugForbid: [SUBMITTED] }),
    ],
  },
  // `fix` is a change cue word; the prefixed fill (`/placeholders show ++fix`) keeps it a show. fix.md sits in the isolated global dir.
  {
    id: 'p1-cue-fix', cp: 4, session: 'p1cue', title: 'Enter on ++fix? (name = cue word): show, never the Claude hand-off',
    steps: [
      t('++fix?'), k('Enter'), c([`${DROPPED}++fix? = /placeholders show ++fix · ${NOT_SENT}`, P('/placeholders show ++fix')], [], { debugForbid: [SUBMITTED] }),
      k('Enter'), c([H(SHOW_HEAD('++fix')), H('++fix · global'), H(FIX_BODY)], [H(HANDOFF), BUSY], { debugForbid: [SUBMITTED] }),
    ],
  },
  { id: 'cmd-show-m-plan', cp: 4, session: 'planWarmShow', title: 'plan mode (after a turn) /placeholders show m: one normal + plan mode part: block with the plan header', steps: [t('/placeholders show m'), enter(), c([H(SHOW_HEAD('++m', 'on')), H('normal + plan mode part:'), H(M_PLAN_HEAD), H(M_TOP), H(M_ADDON)], [H('normal:'), H(PLAN_ADDS), H(HANDOFF)])] },

  // CP3: scope, plan part, remove. Dialogs are drafted by the model; headers, questions, options and tool results are fixed by the tool
  // descriptions in command.ts. Session `scope` writes only its isolated global root; {GDIR} = that dir as the mod shows it (~/...).
  { id: 'cmd-status-plan-tags', cp: 3, size: '200x60', mode: 'default', title: '/placeholders: plan + and plan only tags', steps: [t('/placeholders'), enter(), c([H('plan +'), H('plan only')], [H('++m.plan'), H(HANDOFF)])] },
  { id: 'cmd-show-m-parts', cp: 3, size: '200x60', mode: 'default', title: '/placeholders show m: normal and plan mode adds parts', steps: [t('/placeholders show m'), enter(), c([H('normal:'), H(PLAN_ADDS), H(M_ADDON)], [H(HANDOFF)])] },
  { id: 'cmd-help-scope', cp: 3, size: '200x60', mode: 'default', title: '/placeholders help: project layer path, remove forms', steps: [t('/placeholders help'), enter(), c([H('project = this project, .claude/placeholders/<name>.md, wins over global'), H('Remove: /placeholders remove ++db (both parts)')], [H(HANDOFF)])] },
  // Every write is confirmed first: the question shows while no saved/removed line exists, and its answered row precedes that line (order).
  {
    id: 'scope-global-add', cp: 3, session: 'scope', title: '/placeholders global add ++lpdb: hand-off scope + ask-first lines, one Placeholder question (no layer), then the save',
    steps: [
      t('/placeholders global add ++lpdb: always use the staging DB'), enter(), c(['☐ Placeholder', 'Save ++lpdb as drafted?', 'Save as drafted (Recommended)', H(HANDOFF_SCOPE('global')), H(ASK_FIRST)], ['☐ Where', '☐ Plan mode', '(global) as drafted?', H('saved ++lpdb')], { timeout: TURN_MS }),
      k('Enter'), c([H('saved ++lpdb (global): {GDIR}/lpdb.md')], [BUSY], { timeout: TURN_MS, order: [H('Save ++lpdb as drafted?'), H('saved ++lpdb (global): {GDIR}/lpdb.md')] }),
    ],
  },
  // Tab-accept: prompt.change draws the band at once, no extra key.
  { id: 'scope-typeahead-band', cp: 3, session: 'scope', title: 'after the save, ++lpd offers ++lpdb; Tab takes it: band shows its text at once', steps: [t('++lpd'), c([M('++lpdb')]), k('Tab'), c([P('++lpdb'), B('++lpdb'), B(/always use the staging DB/i)], [B('unknown placeholder')])] },
  {
    id: 'scope-remove', cp: 3, session: 'scope', title: '/placeholders remove ++lpdb: one Remove question with the layer, then the removal',
    steps: [
      t('/placeholders remove ++lpdb'), enter(), c(['☐ Remove', 'Remove ++lpdb (global)?', 'Remove it (Recommended)'], [H('removed ++lpdb')], { timeout: TURN_MS }),
      k('Enter'), c([H('removed ++lpdb (global): {GDIR}/lpdb.md · ++lpdb is no longer defined')], [BUSY], { timeout: TURN_MS, order: [H('Remove ++lpdb (global)?'), H('removed ++lpdb (global)')] }),
    ],
  },
  // A built-in has files: none, so the ask-first rule lets the refusal come without a question.
  { id: 'scope-remove-builtin', cp: 3, session: 'scopeProj', title: '/placeholders remove ++r: built-in refusal, no Remove question', steps: [t('/placeholders remove ++r'), enter(), c([H('++r is built in and cannot be removed · change what it sends: /placeholders change ++r ...')], [BUSY, H(/Remove \+\+r \(\w+\)\?/)], { timeout: TURN_MS })] },
  {
    id: 'scope-plan-part-add', cp: 3, session: 'scope', title: 'add with a plan part: Placeholder (no layer), Plan mode, Where in order, then both files in global',
    steps: [
      t('/placeholders add ++lpship: run the tests; in plan mode also list the release steps'), enter(), c([/☐ Placeholder\s+☐ Plan mode\s+☐ Where/, 'Save ++lpship as drafted?', 'Save as drafted (Recommended)'], ['(global) as drafted?', H('saved ++lpship')], { timeout: TURN_MS }),
      k('Enter'), c(['Add this plan-mode part to ++lpship?', 'Add it (Recommended)', /☒ Placeholder\s+☐ Plan mode/]),
      k('Enter'), c(['Where to save ++lpship?', 'Global (Recommended)', /☒ Plan mode\s+☐ Where/]),
      k('Enter'), c(['Ready to submit your answers?']),
      k('Enter'), c([H('saved ++lpship (global): {GDIR}/lpship.md, {GDIR}/lpship.plan.md')], [BUSY], { timeout: TURN_MS, order: [H('Save ++lpship as drafted?'), H('Add this plan-mode part to ++lpship?'), H('Where to save ++lpship?'), H('saved ++lpship (global)')] }),
    ],
  },
  // Project layer = the scratch project's .claude/placeholders; removed again so later runs of the same project see 6 names.
  {
    id: 'scope-project-add', cp: 4, session: 'scopeProj', title: '/placeholders project add ++lpproj: one Placeholder question (no layer), project-relative saved path',
    steps: [
      t('/placeholders project add ++lpproj: run npm run lint first'), enter(), c(['☐ Placeholder', 'Save ++lpproj as drafted?', H(HANDOFF_SCOPE('project'))], ['☐ Where', '(project) as drafted?', H('saved ++lpproj')], { timeout: TURN_MS }),
      k('Enter'), c([H('saved ++lpproj (project): .claude/placeholders/lpproj.md')], [BUSY], { timeout: TURN_MS, order: [H('Save ++lpproj as drafted?'), H('saved ++lpproj (project)')] }),
    ],
  },
  {
    id: 'scope-project-remove', cp: 4, session: 'scopeProj', title: '/placeholders remove ++lpproj: one Remove question with the layer, project-relative removed path',
    steps: [
      t('/placeholders remove ++lpproj'), enter(), c(['☐ Remove', 'Remove ++lpproj (project)?'], [H('removed ++lpproj')], { timeout: TURN_MS }),
      k('Enter'), c([H('removed ++lpproj (project): .claude/placeholders/lpproj.md · ++lpproj is no longer defined')], [BUSY], { timeout: TURN_MS, order: [H('Remove ++lpproj (project)?'), H('removed ++lpproj (project)')] }),
    ],
  },

  // CP5 UI-only smoke (any profile, free tier and corporate too): no model turn; P1 stops before the second Enter.
  ...[
    { id: 'smoke-compact', title: '++r then space: compact band, whole r text', steps: [t('++r '), c([B('placeholders 1'), B(COMPACT('++r')), B(R_LAST)], [B(FOCUS_ANY)], { debugForbid: [SUBMITTED] })] },
    { id: 'smoke-caret', title: 'fix ++r now, Left x4 onto ++r: focus', steps: [t('fix ++r now'), compactR(), k('Left', 4), c([B(R_HEAD), B(FOCUS('++r')), B(R_LAST)], [B(COMPACT_ANY)], { debugForbid: [SUBMITTED] })] },
    { id: 'smoke-p1-fill', title: 'Enter on ++r? alone: dropped, box filled with the show command, no typeahead row (no second Enter)', steps: [t('++r?'), c([B(FOCUS('++r'))]), k('Enter'), c([`${DROPPED}++r? = /placeholders show ++r · ${NOT_SENT}`, P('/placeholders show ++r')], [B(FOCUS_ANY), M(RR_ROW)], { debugForbid: [SUBMITTED] })] },
    { id: 'smoke-escape', title: '++/ ++r: escaped band, nothing sent', steps: [t('++/ ++r'), c([B('++/  placeholders off: this message is sent exactly as typed'), B('++r  (not sent: ++/ in this message)'), B('turn back on: delete ++/')], [B(R_TOP), B(FOCUS_ANY)], { debugForbid: [SUBMITTED] })] },
    { id: 'smoke-status', title: '/placeholders: status rows, answered locally', steps: [t('/placeholders'), enter(), c([H(STATUS_HEAD), H('Two-phase review: review every significant change'), H('Anti-regression review: regression'), H(/\+\+lpinl\s+project\s+inline/)], [H(HANDOFF)], { debugForbid: [SUBMITTED] })] },
    { id: 'smoke-show-r', title: '/placeholders show ++r: the whole r text, answered locally', steps: [t('/placeholders show ++r'), enter(), c([H(SHOW_HEAD('++r')), H('++r · plugin'), H(/return\s+verdict\s+first,\s+then\s+findings\./)], [H('++m · plugin'), H(HANDOFF)], { debugForbid: [SUBMITTED] })] },
  ].map((x) => ({ ...x, cp: 5, session: 'smoke' })),

  // Hotfix 6.9.3: caret band on ++r / ++m, ++r? with the menu open then closed, P1 fill without a typeahead row, manual show still suggests, status/help wording.
  // Fullscreen has no tmux scrollback: transcript checks read the screen there (its tail at 80x24).
  ...hx('hx-r-menu', '++r with the name menu open, then ?: focus band both times, ? closes the menu', () => [
    t('++r'), c([B(RECV('++r')), B(R_HEAD), B(FOCUS('++r')), M('++rr')], [B(COMPACT_ANY), B(R_DESC_ROW)]),
    t('?'), c([B(RECV('++r')), B(R_HEAD), B(FOCUS('++r'))], [M(RR_ROW), B(QUERY_R), B(COMPACT_ANY), B(R_DESC_ROW)]),
  ]),
  ...hx('hx-m-cut', '++m (29 sent lines): focus band capped at 15 rows (fewer in fullscreen 80x24), cut line names the show command', (fs, small) => [t('++m'), c([B(M_HEAD), ...(fs && small ? [] : [B(M_TOP)]), B(FOCUS('++m')), B(W(CUT('m'))), B(RECV('++m')), B(PLAN_NOTE)], [B(COMPACT_ANY), B(PLAN_PLUS)])]),
  ...hx('hx-no-button', 'no Show text / Hide text / ctrl+x in compact (3 tokens), focus, escaped and unknown bands', () => [
    t('++a ++r ++rr '), c([B('placeholders 3'), B('(not sent: ++rr wins)')], NO_BUTTON),
    k('Left', 2), c([B(RECV('++rr')), B(FOCUS('++rr'))], NO_BUTTON),
    k('End'), t('++/'), c([B('placeholders off: this message is sent exactly as typed')], NO_BUTTON),
  ]),
  ...hx('hx-unknown', 'unknown token: dim unknown row, names hint, no Button', () => [t('++zz'), c([B('++zz  unknown placeholder'), B('names: /placeholders list')], NO_BUTTON)]),
  ...hx('hx-p1', 'Enter on ++r? alone: dropped, box filled, no typeahead row; Enter prints ++r; no model turn', (fs) => [
    t('++r?'), c([B(FOCUS('++r'))]),
    k('Enter'), c([W(`${DROPPED}++r? = /placeholders show ++r`), P('/placeholders show ++r')], [B(FOCUS_ANY), M(RR_ROW), M('++rr')], { debugForbid: [SUBMITTED] }),
    k('Enter'), c([fs ? W(R_LAST) : H(SHOW_HEAD('++r')), fs ? W(R_LAST) : H(R_LAST), P(/^❯\s*$/)], [B(FOCUS_ANY), P('++rr')], { debugForbid: [SUBMITTED] }),
  ]),
  ...hx('hx-manual-show', 'typing /placeholders show ++ by hand still offers the names; ++r still offers ++rr', () => [
    t('/placeholders show ++'), c([M('++a'), M('Architecture-first'), P('/placeholders show ++')]),
    t('r'), c([M(RR_ROW), P('/placeholders show ++r')]),
  ]),
  ...hx('hx-status', '/placeholders status: the caret / whole-text line', (fs, small) => [t('/placeholders status'), enter(), c([fs ? (small ? W('/placeholders list for all') : W(STATUS_FULL)) : H(W(STATUS_FULL))], [H(HANDOFF)], { debugForbid: [SUBMITTED] })]),
  // Fullscreen 80x24: the plan-effort row leaves the band 5 slot rows, so the addition is cut to its count row; the foot always shows, never an engine scroll row.
  ...hx('hxp-m', 'plan mode after one turn, ++m: receives label, dim plan mode adds: row, addon text (cut at fullscreen 80x24), whole band under the plan row', (fs, small) => [t('++m'), c([B(PLAN_ROW), B(RECV('++m')), B(PLAN_ADDS), B(fs && small ? W(CUT('m')) : M_ADDON), B(FOCUS('++m'))], [B(PLAN_NOTE), B(PLAN_PLUS), B(SCROLLED)])], 'hxp'),
  ...hx('hx-help', '/placeholders help: caret line and whole-text line', (fs, small) => [t('/placeholders help'), enter(), c(fs ? (small ? [W('README: https://github.com/kochetkov-ma/claude-brewcode')] : [W(HELP_CARET), W(HELP_WHOLE)]) : [H(W(HELP_CARET)), H(W(HELP_WHOLE))], [H(HANDOFF)], { debugForbid: [SUBMITTED] })]),

  // 6.9.4 restyle (mockup-6.9.4-final.html states 1-4): tokens bold placeholder colour, sent rows bold text colour, labels dim, actions underlined text colour, [Enter] text colour.
  ...hx('rst-m', 'state 1: caret on ++m, default mode: bold token, bold sent rows, cut row show or ++m? alone [Enter], underlined foot actions', (fs, small) => [t('++m'), c([B(RECV('++m')), B(FOCUS('++m')), B(W(CUT('m'))), A(TOK_A('++m')), A(SENT_A), A(FOOT_A), A(ACT_A('++/')), A(ACT_A('/placeholders show ++m')), ...(small ? [] : [B(W(OR_Q('m'))), A(ACT_A('++m?')), A(KEY_A)])], [B(COMPACT_ANY)])]),
  ...hx('rst-pm', 'state 2: plan mode after one turn, ++m: plan row, dim plan mode adds:, cut row and foot actions', (fs, small) => [t('++m'), c([B(PLAN_ROW), B(RECV('++m')), B(PLAN_ADDS), B(FOCUS('++m')), A(TOK_A('++m')), ...(fs && small ? [] : [A(SENT_A)]), A(FOOT_A), A(ACT_A('/placeholders show ++m')), ...(small ? [] : [A(ACT_A('++m?')), A(KEY_A)])], [B(PLAN_NOTE), B(SCROLLED)])], 'hxp'),
  ...hx('rst-compact', 'state 3: caret past three tokens: bold tokens, dim descriptions, three underlined foot actions', () => [t('++r ++a ++m check the auth module'), c([B('placeholders 3'), B(COMPACT('++r')), A(TOK_A('++r')), A(TOK_A('++a')), A(TOK_A('++m')), A(LABEL_A('more:')), A(ACT_A('put the caret on ++r')), A(ACT_A('/placeholders help'))], [B(FOCUS_ANY)])]),
  ...hx('rst-escaped', 'state 4: ++/ in the message: marker and token bold placeholder colour, dim reasons, underlined delete ++/', () => [t('++/ what does ++r do?'), c([B('++/  placeholders off: this message is sent exactly as typed'), B('++r  (not sent: ++/ in this message)'), B('turn back on: delete ++/'), A(TOK_A('++/')), A(TOK_A('++r')), A(LABEL_A('turn')), A(ACT_A('delete ++/'))], [B(FOCUS_ANY), B(COMPACT_ANY)])]),
  ...hx('rst-unknown', 'unknown ++zz: bold warning token, underlined /placeholders list', () => [t('++zz'), c([B('++zz  unknown placeholder'), A(UNK_A('++zz')), A(LABEL_A('names:')), A(ACT_A('/placeholders list'))])]),
  // Light theme (settings `theme`): the same roles under the light palette; the capture is the readability evidence.
  { id: 'rst-light-m', cp: 4, session: 'light120', title: 'light theme, caret on ++m: token, sent rows, labels and actions in the light palette', steps: [t('++m'), c([B(RECV('++m')), B(FOCUS('++m')), B(W(OR_Q('m'))), A(/\x1b\[4m\x1b\[38;[25];[\d;]+mmove the caret off \+\+m\x1b\[0m/), A(/\x1b\[1m\x1b\[38;[25];[\d;]+m\+\+m\x1b\[0m/)])] },
  { id: 'rst-light-compact', cp: 4, session: 'light120', title: 'light theme, three tokens: compact band', steps: [t('++r ++a ++m check the auth module'), c([B('placeholders 3'), B(COMPACT('++r'))])] },

  // E2E: what Claude receives (claude -p, paid)
  { id: 'e2e-r', cp: 1, kind: 'print', mode: 'default', title: '-p ++r: Claude quotes the r block', prompt: '++r Quote verbatim every line of the additional context you received that starts with "[", one per line, nothing else.', expect: [R_TOP], forbid: [], debugExpect: [PROVIDED] },
  { id: 'e2e-escaped', cp: 1, kind: 'print', mode: 'default', title: '-p ++/ ++r: no r block reaches Claude', prompt: '++/ ++r Quote verbatim every line of any additional context you received that starts with "[REVIEW". If there is none, reply NONE.', expect: ['NONE'], forbid: ['REVIEW DISCIPLINE'], debugForbid: [PROVIDED] },
  { id: 'e2e-plan-m', cp: 1, kind: 'print', mode: 'plan', title: '-p plan mode ++m: Claude quotes the plan addon', prompt: '++m Quote verbatim every line of the additional context you received that starts with "[", one per line, nothing else.', expect: [M_TOP, M_ADDON], forbid: [], debugExpect: [PROVIDED] },
  // An empty normal m.md in the (scratch) global layer silences ++m in plan mode too: no block, so no plan addon.
  { id: 'e2e-plan-m-empty', cp: 4, kind: 'print', mode: 'plan', globalFiles: { 'm.md': '---\ndescription: "LP empty m override"\n---\n' }, title: '-p plan mode ++m with an empty global m.md: nothing reaches Claude', prompt: '++m Quote verbatim every line of any additional context you received that starts with "[". If there is none, reply NONE.', expect: ['NONE'], forbid: [M_ADDON, M_TOP], debugForbid: [PROVIDED] },
  // Control for the -p mod-tool deny (drive.mjs runPrint): asked outright, the model still cannot call list_placeholders.
  { id: 'e2e-tool-denied', cp: 4, kind: 'print', mode: 'default', title: '-p: the mod tools are denied, so every e2e answer comes from the received context', prompt: 'Call the list_placeholders tool now. If no such tool is available to you, reply with exactly NOTOOL and nothing else.', expect: ['NOTOOL'], forbid: [R_TOP] },
  { id: 'e2e-inline', cp: 1, kind: 'print', mode: 'default', title: '-p ++lpinl: the inline body replaces the token', prompt: `${INLINE.token} <- repeat my whole message verbatim, nothing else.`, expect: [INLINE.body], forbid: [INLINE.token] },
]
