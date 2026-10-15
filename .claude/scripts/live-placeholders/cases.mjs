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

// band.tsx: focusFoot, compactFoot, queryHint, showHint (prefixed name), alsoRow, ESCAPED_HEAD, escapedFoot, PLAN_*, planNote, toggleLabel.
const FOCUS = (tok) => `move the caret off ${tok} to close · send as typed: ++/`
const COMPACT = (tok) => `more: put the caret on ${tok} · send as typed: ++/ · /placeholders help`
const COMPACT_ANY = 'more: put the caret on'
const FOCUS_ANY = 'move the caret off'
const QUERY_R = 'type ? after ++r for more'
const SHOW = (n) => `/placeholders show ++${n}`
const TOGGLE_SHOW = 'Show text  ctrl+x → tab → enter'
const TOGGLE_HIDE = 'Hide text  ctrl+x → tab → enter'
const PLAN_HEAD = '· plan mode'
const PLAN_PLUS = 'plan +'
const PLAN_ADDS = 'plan mode adds:'
// planNote(m): 29 = lines of the m.plan.md addition (plan: add); shown until the first prompt confirms plan mode (task #92).
const PLAN_NOTE = '+ plan-mode part, 29 lines · sent in plan mode'
// placeholders/*.md: headers ({token} = ++name) and body anchors.
const R_HEAD = 'User typed `++r` — Two-phase review discipline is active for this turn:'
const R_TOP = '[REVIEW DISCIPLINE: DOUBLE-CHECK]'
const R_LAST = 'return verdict first, then findings.'
const RR_TOP = '[REVIEW DISCIPLINE: ANTI-REGRESSION]'
const M_HEAD = 'User typed `++m` — Manager mode is active for this turn:'
const M_PLAN_HEAD = 'User typed `++m` — Manager + Plan Mode is active for this turn:'
const M_TOP = '[ROLE: MANAGER]'
const M_ADDON = '[ADDON: PLAN MODE]'
const A_TOP = '[DIRECTIVE: ARCHITECTURE-FIRST]'
const PLUS_TOP = '[ADDON: ANTI-DRIFT CRON PLAN]'
const RR_ROW = 'Anti-regression review'
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
// A model turn in the session debug log: inject.mjs ran for a submitted prompt.
const SUBMITTED = /UserPromptSubmit \[node "[^"]*inject\.mjs"\]/
const PROVIDED = /inject\.mjs"\) provided additionalContext/
const STRIKE = /\x1b\[(?:\d+;)*9(?:;\d+)*m/
// The focused band Button: reverse video (SGR 7) right before its `[ Show text` label.
const FOCUSED_BUTTON = /\x1b\[(?:\d+;)*7m(?:\x1b\[[0-9;]*m)*\[ Show text/
// A turn in progress (spinner row `Concocting… (6s · ↓ 531 tokens)`); a model-driven check waits up to TURN_MS.
const BUSY = /…\s*\(\d+s/
const TURN_MS = 120000

// Shared tmux sessions; a case without `session` gets a fresh one. tui = pinned via --settings (default when absent);
// warm = one model turn first (inject.mjs records the mode); isolate = the copy's global root is a scratch dir ({PCFG}, shown as {GDIR}).
export const SESSIONS = {
  d80: { size: '80x24', mode: 'default' },
  d80x30: { size: '80x30', mode: 'default' },
  d120: { size: '120x40', mode: 'default' },
  d200: { size: '200x60', mode: 'default' },
  planCold: { size: '120x40', mode: 'plan' },
  planWarm: { size: '120x40', mode: 'plan', warm: true },
  planWarmShow: { size: '200x60', mode: 'plan', warm: true },
  p1cue: { size: '120x40', mode: 'default', isolate: true },
  scope: { size: '200x60', mode: 'default', isolate: true },
}

const focusR = (extra = []) => c([B(R_HEAD), B(FOCUS('++r')), ...extra], [B(COMPACT_ANY)])
const compactR = () => c([B(COMPACT('++r'))], [B(FOCUS_ANY)])

// TUI matrix (review round): each case runs in the default TUI and fullscreen at 88x40 and 120x40; ids end -d88, -d120, -fs88, -fs120.
// Fullscreen: the typeahead draws above the box and the band budget is the engine's bottom slot (~14 rows at 40), so an opened 1-2 token band equals its preview.
const COMBOS = [['d', 'default'], ['fs', 'fullscreen']].flatMap(([tag, tui]) => ['88x40', '120x40'].map((size) => ({ tag: `${tag}${size.split('x')[0]}`, tui, size })))
for (const m of COMBOS) SESSIONS[`m-${m.tag}`] = { size: m.size, mode: 'default', tui: m.tui }
const matrix = (base, cp, title, build) => COMBOS.map((m) => ({ id: `${base}-${m.tag}`, cp, session: `m-${m.tag}`, title: `${title} [${m.tui} ${m.size}]`, steps: build(m.tui === 'fullscreen') }))

export const CASES = [
  // CP1/CP4: band in both TUIs. Toggle and the Enter-sends case close each matrix session (toggle leaves the band opened).
  ...matrix('r-end-menu', 1, '++r, caret at end, typeahead open: focus, whole r text, ++rr row', () => [t('++r'), focusR([B(R_LAST), M('++rr')])]),
  ...matrix('r-space', 1, '++r then space: compact, nothing cut, no Button', (fs) => [t('++r '), c([B('placeholders 1'), B(COMPACT('++r')), B(fs ? /return verdict first, then findings\.|lines · \/placeholders show \+\+r/ : R_LAST)], [B(FOCUS_ANY), B('Show text')])]),
  ...matrix('caret-left', 1, 'fix ++r now: compact, Left x4 onto ++r: focus', () => [t('fix ++r now'), compactR(), k('Left', 4), focusR([B(R_LAST)])]),
  ...matrix('r-query', 1, '++r? forces the whole text, typeahead closed', () => [t('++r?'), c([B(R_HEAD), B(FOCUS('++r')), B(R_LAST)], [B(COMPACT_ANY), B(QUERY_R), M(RR_ROW)])]),
  ...matrix('also-row', 4, 'caret view of ++r ++m: also row names the other token, both ways', () => [t('++r ++m'), c([B(M_HEAD), B('also: ++r'), B(FOCUS('++m'))], [B(R_HEAD)]), k('Left', 4), c([B(R_HEAD), B('also: ++m'), B(FOCUS('++r'))], [B(M_HEAD)])]),
  ...matrix('escape-bs-only', 4, '++\\ alone (no ++/): escaped band names ++\\', () => [t('++\\ hello'), c([B('++\\  placeholders off: this message is sent exactly as typed'), B('delete ++\\ to turn them back on')], [B('++/'), B(FOCUS_ANY), B(COMPACT_ANY)])]),
  ...matrix('two-cut', 4, '++m ++a: bodies cut; Button only when the opened band has more rows', (fs) => [t('++m ++a '), fs ? c([B('placeholders 2'), B(/lines · \/placeholders show \+\+[ma]/)], [B('Show text')]) : c([B('placeholders 2'), B(TOGGLE_SHOW)])]),
  ...matrix('toggle', 4, 'ctrl+x → tab → enter on 3 tokens: Button focused, band opened, draft kept, Esc back', () => [
    t('++a ++r ++rr '), c([B('placeholders 3'), B(TOGGLE_SHOW), B('(not sent: ++rr wins)')], [B(A_TOP)]),
    k('C-x'), k('Tab'), c([A(FOCUSED_BUTTON), P('++a ++r ++rr')]),
    k('Enter'), c([B(TOGGLE_HIDE), B(A_TOP), P('++a ++r ++rr')], [B(TOGGLE_SHOW)]),
    k('Escape'), c([P('++a ++r ++rr'), B(TOGGLE_HIDE)]),
  ]),
  ...matrix('nobutton-enter', 4, '1 token, nothing cut: no Button; Enter sends the prompt with the r context', (fs) => [
    t('++r reply with only the word LPOK'), c([B('placeholders 1'), B(COMPACT('++r')), ...(fs ? [] : [B(R_LAST)])], [B('Show text'), B(FOCUS_ANY)]),
    k('Enter'), c([/⏺ .*LPOK/], [BUSY], { debugExpect: [SUBMITTED, PROVIDED], timeout: TURN_MS }),
  ]),

  // CP1: band, default TUI only (not TUI-dependent, or sized to the old default sessions).
  { id: 'r-end-menu-80', cp: 1, session: 'd80', title: '++r at 80x24, typeahead open: capped; ? would not show it all, so the show hint', steps: [t('++r'), c([B(R_TOP), B(` lines · ${SHOW('r')}`), M('++rr')], [B(R_LAST), B(QUERY_R), B(COMPACT_ANY)])] },
  { id: 'r-end-menu-q-80x30', cp: 4, session: 'd80x30', title: '++r at 80x30, typeahead open: capped; ? shows it all, so the ? hint', steps: [t('++r'), c([B(R_TOP), B(QUERY_R), M('++rr')], [B(R_LAST), B(SHOW('r'))])] },
  { id: 'r-query-80x30', cp: 4, session: 'd80x30', title: '++r? at 80x30: whole text', steps: [t('++r?'), focusR([B(R_LAST)])] },
  { id: 'r-end-menu-200', cp: 1, session: 'd200', title: '++r at 200x60, typeahead open: whole r text', steps: [t('++r'), focusR([B(R_LAST), M(RR_ROW)])] },
  { id: 'caret-home-120', cp: 1, session: 'd120', title: '++r fix it: compact, Home onto ++r: focus', steps: [t('++r fix it'), compactR(), k('Home'), focusR()] },
  { id: 'caret-end-120', cp: 1, session: 'd120', title: 'fix it ++r, Home: compact, End back onto ++r: focus', steps: [t('fix it ++r'), k('Home'), compactR(), k('End'), focusR()] },
  { id: 'r-query-80', cp: 1, session: 'd80', title: '++r? at 80x24: focus cut with the show hint, no ? hint', steps: [t('++r?'), c([B(R_TOP), B(` lines · ${SHOW('r')}`), B(FOCUS('++r'))], [B(QUERY_R), M(RR_ROW)])] },
  { id: 'r-query-200', cp: 1, session: 'd200', title: '++r? at 200x60: whole text', steps: [t('++r?'), focusR([B(R_LAST)])] },
  { id: 'rm-caret-m-120', cp: 1, session: 'd120', title: '++r ++m, caret on ++m: m focus, also ++r, plan-part note', steps: [t('++r ++m'), c([B(M_HEAD), B(M_TOP), B('also: ++r'), B(FOCUS('++m')), B(PLAN_PLUS), B(PLAN_NOTE)], [B(R_HEAD), B(PLAN_ADDS)])] },
  { id: 'escape-slash-120', cp: 1, session: 'd120', title: '++/ ++r: escaped band, nothing sent, token struck through', steps: [t('++/ ++r'), c([B('++/  placeholders off: this message is sent exactly as typed'), B('++r  (not sent: ++/ in this message)'), B('delete ++/ to turn them back on'), A(STRIKE)], [B(R_TOP), B(FOCUS_ANY)])] },
  { id: 'escape-backslash-120', cp: 1, session: 'd120', title: '++\\ ++r: escape alias', steps: [t('++\\ ++r'), c([B('++\\  placeholders off: this message is sent exactly as typed'), B('(not sent: ++\\ in this message)'), B('delete ++\\ to turn them back on')], [B(R_TOP)])] },
  { id: 'unknown-zz-120', cp: 1, session: 'd120', title: '++zz: unknown row and list hint', steps: [t('++zz'), c([B('++zz  unknown placeholder'), B('names: /placeholders list')], [B(R_TOP)])] },
  { id: 'm-default-120', cp: 1, session: 'd120', title: 'default mode ++m: plan + tag, dim plan-part note, show hint', steps: [t('++m'), c([B(M_HEAD), B(PLAN_PLUS), B(PLAN_NOTE), B(SHOW('m'))], [B(PLAN_ADDS), B(PLAN_HEAD)])] },
  { id: 'm-default-80', cp: 1, session: 'd80', title: 'default mode ++m at 80x24: cut, plan-part note', steps: [t('++m'), c([B(M_TOP), B(PLAN_NOTE), B(SHOW('m'))], [B(PLAN_ADDS)])] },
  { id: 'm-default-200', cp: 1, session: 'd200', title: 'default mode ++m at 200x60: cut at 15 rows, plan-part note', steps: [t('++m'), c([B(M_HEAD), B(PLAN_NOTE), B(SHOW('m'))], [B(PLAN_ADDS)])] },
  { id: 'plus-default-120', cp: 1, session: 'd120', title: 'default mode +++: (plan only)', steps: [t('+++ '), c([B('Anti-drift cron plan addon'), B('(plan only)')], [B(PLAN_HEAD)])] },
  { id: 'inline-120', cp: 1, session: 'd120', title: 'project inline def ++lpinl: row and its body', steps: [t(`${INLINE.token} `), c([B(INLINE.token), B(INLINE.description), B(INLINE.body)], [B('unknown placeholder')])] },
  { id: 'plan-m-cold-120', cp: 1, session: 'planCold', title: 'launched in plan mode, no prompt yet, ++m: honest plan-part note, no plan mode adds', steps: [c(['plan mode on']), t('++m'), c([B(M_HEAD), B(PLAN_PLUS), B(PLAN_NOTE)], [B(PLAN_ADDS)])] },
  { id: 'plan-head-cold-120', cp: 1, session: 'planCold', title: 'launched in plan mode, no prompt yet, ++m ++r + space: no plan mode head yet, plan-part note', steps: [t('++m ++r '), c([B('placeholders 2'), B(PLAN_NOTE)], [B(`placeholders 2 ${PLAN_HEAD}`), B(PLAN_ADDS)])] },
  { id: 'plan-m-warm-120', cp: 1, session: 'planWarm', title: 'plan mode after one turn, ++m: plan mode adds', steps: [t('++m'), c([B(PLAN_ADDS), B(M_ADDON), B(PLAN_PLUS)], [B(PLAN_NOTE)])] },
  { id: 'plan-head-warm-120', cp: 1, session: 'planWarm', title: 'plan mode after one turn, ++m ++r + space: head says plan mode', steps: [t('++m ++r '), c([B(`placeholders 2 ${PLAN_HEAD}`)])] },
  { id: 'plan-plus-warm-120', cp: 1, session: 'planWarm', title: 'plan mode after one turn, +++: no (plan only), body shown', steps: [t('+++ '), c([B(PLUS_TOP), B(PLAN_HEAD)], [B('(plan only)')])] },
  { id: 'plan-shifttab-m-120', cp: 1, size: '120x40', mode: 'default', title: 'Shift+Tab x2 into plan mode, no prompt yet, ++m: honest plan-part note', steps: [k('BTab', 2), c(['plan mode on']), t('++m'), c([B(PLAN_NOTE)], [B(PLAN_ADDS)])] },
  { id: 'cmd-status-smoke', cp: 1, size: '120x40', mode: 'default', title: '/placeholders prints the status rows', steps: [t('/placeholders'), enter(), c([H('Two-phase review: review every significant change'), H('Anti-regression review: regression')], [H(HANDOFF)])] },

  // CP2: /placeholders status, help, list, show and P1 on Enter. Output renders markdown: inline backticks vanish, fenced text stays raw.
  // 6 names = 5 plugin + the ++lpinl fixture. Long help lines wrap at 200 columns: regexes allow the wrap (\s+).
  { id: 'cmd-status', cp: 2, size: '200x60', mode: 'default', title: '/placeholders: one row per name with plan +/plan only/inline tags, ++r? hint, no ++m.plan', steps: [t('/placeholders'), enter(), c([H(STATUS_HEAD), H(/\+\+\+\s+plugin\s+plan only\s+Anti-drift cron plan addon/), H(/\+\+m\s+plugin\s+plan \+\s+Manager mode/), H(/\+\+lpinl\s+project\s+inline\s+LP inline fixture/), H('type ++r? · Enter on ++r? alone sends nothing and fills /placeholders show ++r')], [H('++m.plan'), H(HANDOFF)], { debugForbid: [SUBMITTED] })] },
  { id: 'cmd-status-escape-row', cp: 2, size: '200x60', mode: 'default', title: '/placeholders status: the ++/ escape row', steps: [t('/placeholders status'), enter(), c([H(STATUS_HEAD), H('Send one message as typed: put ++/ anywhere in it')], [H(HANDOFF)])] },
  { id: 'cmd-help', cp: 2, size: '200x60', mode: 'default', title: '/placeholders help: full help, 15-row ? line, escape alias, layers, doc links', steps: [t('/placeholders help'), enter(), c([H(HELP_HEAD), H('Full text: put the caret on a token (arrows, Home, End) · type ++r? to see up to 15 rows of it'), H(/fills\s+\/placeholders\s+show\s+\+\+r\s+\(Enter\s+again\s+prints\s+the\s+whole\s+text\)/), H('Send as typed: ++/ (or ++\\) anywhere in a message'), H(/global = all projects, ~\/\.claude[\w-]*\/placeholders\/<name>\.md/), H('Docs: https://doc-claude.brewcode.app/mods/placeholders/')], [H(HANDOFF)], { debugForbid: [SUBMITTED] })] },
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
      k('Enter'), c([`${DROPPED}++r? = /placeholders show ++r · ${NOT_SENT}`, P('/placeholders show ++r')], [B(FOCUS_ANY)], { debugForbid: [SUBMITTED] }),
      k('Enter'), c([H(SHOW_HEAD('++r')), H('++r · plugin'), P(/^❯\s*$/)], [B(FOCUS_ANY)], { debugForbid: [SUBMITTED] }),
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
  // Tab-accept leaves the band one key behind (design-a §3, known): the band is checked after the next key.
  { id: 'scope-typeahead-band', cp: 3, session: 'scope', title: 'after the save, ++lpd offers ++lpdb; Tab takes it; next key: band shows its text', steps: [t('++lpd'), c([M('++lpdb')]), k('Tab'), c([P('++lpdb')]), t(' '), c([B('++lpdb'), B(/always use the staging DB/i)], [B('unknown placeholder')])] },
  {
    id: 'scope-remove', cp: 3, session: 'scope', title: '/placeholders remove ++lpdb: one Remove question with the layer, then the removal',
    steps: [
      t('/placeholders remove ++lpdb'), enter(), c(['☐ Remove', 'Remove ++lpdb (global)?', 'Remove it (Recommended)'], [H('removed ++lpdb')], { timeout: TURN_MS }),
      k('Enter'), c([H('removed ++lpdb (global): {GDIR}/lpdb.md · ++lpdb is no longer defined')], [BUSY], { timeout: TURN_MS, order: [H('Remove ++lpdb (global)?'), H('removed ++lpdb (global)')] }),
    ],
  },
  // A built-in has files: none, so the ask-first rule lets the refusal come without a question.
  { id: 'scope-remove-builtin', cp: 3, session: 'scope', title: '/placeholders remove ++r: built-in refusal, no Remove question', steps: [t('/placeholders remove ++r'), enter(), c([H('++r is built in and cannot be removed · change what it sends: /placeholders change ++r ...')], [BUSY, H(/Remove \+\+r \(\w+\)\?/)], { timeout: TURN_MS })] },
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
    id: 'scope-project-add', cp: 4, session: 'scope', title: '/placeholders project add ++lpproj: one Placeholder question (no layer), project-relative saved path',
    steps: [
      t('/placeholders project add ++lpproj: run npm run lint first'), enter(), c(['☐ Placeholder', 'Save ++lpproj as drafted?', H(HANDOFF_SCOPE('project'))], ['☐ Where', '(project) as drafted?', H('saved ++lpproj')], { timeout: TURN_MS }),
      k('Enter'), c([H('saved ++lpproj (project): .claude/placeholders/lpproj.md')], [BUSY], { timeout: TURN_MS, order: [H('Save ++lpproj as drafted?'), H('saved ++lpproj (project)')] }),
    ],
  },
  {
    id: 'scope-project-remove', cp: 4, session: 'scope', title: '/placeholders remove ++lpproj: one Remove question with the layer, project-relative removed path',
    steps: [
      t('/placeholders remove ++lpproj'), enter(), c(['☐ Remove', 'Remove ++lpproj (project)?'], [H('removed ++lpproj')], { timeout: TURN_MS }),
      k('Enter'), c([H('removed ++lpproj (project): .claude/placeholders/lpproj.md · ++lpproj is no longer defined')], [BUSY], { timeout: TURN_MS, order: [H('Remove ++lpproj (project)?'), H('removed ++lpproj (project)')] }),
    ],
  },

  // E2E: what Claude receives (claude -p, paid)
  { id: 'e2e-r', cp: 1, kind: 'print', mode: 'default', title: '-p ++r: Claude quotes the r block', prompt: '++r Quote verbatim every line of the additional context you received that starts with "[", one per line, nothing else.', expect: [R_TOP], forbid: [], debugExpect: [PROVIDED] },
  { id: 'e2e-escaped', cp: 1, kind: 'print', mode: 'default', title: '-p ++/ ++r: no r block reaches Claude', prompt: '++/ ++r Quote verbatim every line of any additional context you received that starts with "[REVIEW". If there is none, reply NONE.', expect: ['NONE'], forbid: ['REVIEW DISCIPLINE'], debugForbid: [PROVIDED] },
  { id: 'e2e-plan-m', cp: 1, kind: 'print', mode: 'plan', title: '-p plan mode ++m: Claude quotes the plan addon', prompt: '++m Quote verbatim every line of the additional context you received that starts with "[", one per line, nothing else.', expect: [M_TOP, M_ADDON], forbid: [], debugExpect: [PROVIDED] },
  // An empty normal m.md in the (scratch) global layer silences ++m in plan mode too: no block, so no plan addon.
  { id: 'e2e-plan-m-empty', cp: 4, kind: 'print', mode: 'plan', globalFiles: { 'm.md': '---\ndescription: "LP empty m override"\n---\n' }, title: '-p plan mode ++m with an empty global m.md: nothing reaches Claude', prompt: '++m Quote verbatim every line of any additional context you received that starts with "[". If there is none, reply NONE.', expect: ['NONE'], forbid: [M_ADDON, M_TOP], debugForbid: [PROVIDED] },
  { id: 'e2e-inline', cp: 1, kind: 'print', mode: 'default', title: '-p ++lpinl: the inline body replaces the token', prompt: `${INLINE.token} <- repeat my whole message verbatim, nothing else.`, expect: [INLINE.body], forbid: [INLINE.token] },
]
