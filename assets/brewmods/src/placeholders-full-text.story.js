// Storyboard of placeholders-full-text.gif (keys verified live on CC 2.1.301, main-screen TUI, mod 6.9.5): times in s.
// Same renderer and gates as placeholders.story.js; window = this story's loop bounds for record-gifs.mjs --check.
window.PH_STORY = {
  term: { cols: 88, rows: 40 },
  aria: 'Claude Code prompt: type ++m and the caret on it shows the lines Claude receives, cut to fit with a "... more lines · whole text: /placeholders show ++m or ++m? alone [Enter]" row; type ? to make ++m?, Enter fills the box with /placeholders show ++m and sends nothing to Claude, Enter again prints the whole ++m text in the chat; scrolled up it starts with "++m · full text as sent"',
  window: [20, 30],
  loop: 26, end: 25, fps: 10, still: 4,
  chapters: [[0, 'type ++m'], [2.0, 'cut to fit'], [9.0, '++m?'], [11.5, 'enter'], [16.5, 'enter again']],
  // [from, screen, beat]: the captured screen shown from `from` on; beat names the TODO-CAPTURE slot
  screens: [
    [0, 'ft-0-start', 'type'],
    [1.0, 'ft-1-plus', 'type'],
    [1.3, 'ft-2-plusplus', 'type'],
    [2.0, 'ft-3-m', 'cut-to-fit'],
    [9.0, 'ft-4-q', 'ask'],
    [11.5, 'ft-5-fill', 'fill'],
    [16.5, 'ft-6-print', 'print'],
    [21.0, 'ft-7-top', 'print'],
    [25.4, 'ft-0-start', 'type'],
  ],
  // + + m ? are typed one key per capture (no overlay)
  typing: [],
  keys: [
    { at: 11.5, glyph: '⏎', word: 'enter' },
    { at: 16.5, glyph: '⏎', word: 'enter' },
  ],
  // the show command answers locally (no model turn): nothing to compress
  skips: [],
  captions: [
    [0, 'Type <k>++m</k>'],
    [2.0, 'Caret on <k>++m</k>: the lines Claude receives now'],
    [5.0, 'Too long for the band: the cut row names the whole-text command'],
    [9.0, 'Type <k>?</k> right after it: <k>++m?</k> alone in the message'],
    [11.5, '<k>⏎</k> once: the box gets <k>/placeholders show ++m</k>, nothing sent'],
    [16.5, '<k>⏎</k> again: the whole text is printed in the chat, no Claude turn'],
    [21.0, 'Scrolled up: it starts with <k>++m · full text as sent</k>'],
    [25, ''],
    [25.4, 'Type <k>++m</k>'],
  ],
  // claims the captions make; --check fails while a captured screen lacks its string (whole lines end with \n)
  facts: [
    { screen: 'ft-3-m', has: '❯\u00a0++m\n', why: '++m typed, caret on it' },
    { screen: 'ft-3-m', has: '++m · Claude receives these lines now:', why: 'focus head (band.tsx)' },
    { screen: 'ft-3-m', has: ' more lines · whole text: /placeholders show ++m or ++m? alone [Enter]\n', why: 'cut row (band.tsx)' },
    { screen: 'ft-3-m', has: '  not sent now · plan mode adds ', why: 'plan note' },
    { screen: 'ft-4-q', has: '❯\u00a0++m?\n', why: '? typed right after the token' },
    { screen: 'ft-5-fill', has: '++m? = /placeholders show ++m · not sent to Claude ·', why: 'P1 notice (show.ts)' },
    { screen: 'ft-5-fill', has: '❯\u00a0/placeholders show ++m\n', why: 'P1 fill, trailing space, no typeahead row' },
    { screen: 'ft-6-print', has: 'Deliver the embedded role + graph, not implementation code.', why: 'last line of the m.plan.md part' },
    { screen: 'ft-6-print', has: '⏸ manual mode on · ? for shortcuts', why: 'idle footer: no Claude turn running' },
    { screen: 'ft-7-top', has: '❯ /placeholders show ++m\n', why: 'the command that printed it' },
    { screen: 'ft-7-top', has: 'brewmod-placeholders: ++m · full text as sent · plan mode off', why: 'show output head (show.ts)' },
  ],
  // fermenter beats: kick when the token is typed, burst on each Enter
  kicks: [2.0], bursts: [11.5, 16.5], labels: [[2.0, '++m · batch 03']],
};
