// Storyboard of plan-effort.gif (keys verified live on CC 2.1.301, 88x22 main-screen TUI (the flow fills 19 rows), sonnet --effort high, plan-effort + placeholders mods): times in s.
// Same renderer and gates as placeholders.story.js; facts: `has` must be on the screen, `lacks` must not.
window.PH_STORY = {
  term: { cols: 88, rows: 22 },
  aria: 'Claude Code terminal recorded from a real session, session effort high: Shift+Tab twice from manual mode through accept edits into plan mode, no row yet; the first prompt shows the toast "brewmod-plan-effort: plan mode · effort raised to xhigh" and a teal (plan-mode colour) row "plan mode · effort xhigh for this mode · change: /plan-effort <level>" above the prompt; Shift+Tab out of plan mode (to auto mode) removes the row',
  window: [20, 30],
  loop: 23, end: 22, fps: 10, still: 12,
  chapters: [[0, 'default'], [3.2, 'plan mode'], [8.4, 'first prompt'], [16, 'leave plan']],
  // [from, screen, beat]
  screens: [
    [0, 'pe-0-start', 'start'],
    [1.6, 'pe-1-btab', 'cycle'],
    [3.2, 'pe-2-btab', 'cycle'],
    [8.4, 'pe-4-toast', 'prompt'],
    [10.2, 'pe-5-done', 'prompt'],
    [16, 'pe-6-out', 'leave'],
    [22.2, 'pe-0-start', 'start'],
  ],
  // prompt-row overlay while typing on pe-3-typed (captured after the last key)
  typing: [
    { at: 5.2, text: 'what does README.md cover? one line', cps: 14, on: 'pe-3-typed' },
  ],
  keys: [
    { at: 1.6, glyph: '⇧⇥', word: 'shift+tab' },
    { at: 3.2, glyph: '⇧⇥', word: 'shift+tab' },
    { at: 8.4, glyph: '⏎', word: 'enter' },
    { at: 16, glyph: '⇧⇥', word: 'shift+tab' },
  ],
  // the model turn: 4.49 s real (transcript prompt 16:14:46.537 -> text 16:14:51.023), 0.6 s shown at 1x, the rest over the 1.2 s span
  skips: [
    { at: 9.0, until: 10.2, factor: 3.2 },
  ],
  captions: [
    [0, 'Manual mode, session effort <k>high</k>'],
    [1.6, '<k>⇧⇥</k> once: accept edits'],
    [3.2, '<k>⇧⇥</k> again: plan mode; no row until the first prompt'],
    [8.4, '<k>⏎</k>: toast, and the teal plan-mode row above the prompt'],
    [10.2, 'The row says <k>xhigh</k> for plan mode; your session effort stays <k>high</k>'],
    [16, '<k>⇧⇥</k> out of plan mode: the row is gone'],
    [22, ''],
    [22.2, 'Manual mode, session effort <k>high</k>'],
  ],
  facts: [
    { screen: 'pe-0-start', has: '⏸ manual mode on', why: 'CC footer, default mode' },
    { screen: 'pe-0-start', has: '● high · /effort', why: 'session effort high' },
    { screen: 'pe-1-btab', has: '⏵⏵ accept edits on (shift+tab to cycle)', why: 'first Shift+Tab' },
    { screen: 'pe-2-btab', has: '⏸ plan mode on (shift+tab to cycle)', why: 'second Shift+Tab' },
    { screen: 'pe-2-btab', lacks: 'plan mode · effort', why: 'no row before the first prompt' },
    { screen: 'pe-3-typed', has: 'what does README.md cover? one line\n', why: 'typed prompt' },
    { screen: 'pe-4-toast', has: 'brewmod-plan-effort: plan mode · effort raised to xhigh', why: 'toast (register.ts), engine adds the plugin name' },
    { screen: 'pe-4-toast', has: 'plan mode · effort xhigh for this mode · change: /plan-effort <level>', why: 'row (register.ts)' },
    { screen: 'pe-5-done', has: 'plan mode · effort xhigh for this mode · change: /plan-effort <level>', why: 'row stays after the turn' },
    { screen: 'pe-5-done', has: '● high · /effort', why: 'footer keeps the session effort (caption from 10.2, when the toast is gone)' },
    { screen: 'pe-5-done', lacks: 'effort raised to xhigh', why: 'toast gone: the toast caption ends at 10.2' },
    { screen: 'pe-6-out', has: '⏵⏵ auto mode on (shift+tab to cycle)', why: 'Shift+Tab out of plan' },
    { screen: 'pe-6-out', lacks: 'plan mode · effort', why: 'row gone' },
  ],
  // README bottle (separate plan-effort-bottle.gif above the terminal GIF): seamless loop, airlock blips, the label on the tape
  bottle: { loop: 5, fps: 6, blips: 9, label: 'xhigh · batch 04' },
};
