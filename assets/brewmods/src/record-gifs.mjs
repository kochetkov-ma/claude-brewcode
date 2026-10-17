#!/usr/bin/env node
// Records render.html (#hero terminal frames; #bottle with &bottle=1; #scene with &scene=1) into ../<name>.gif (+ -bottle.gif when story.bottle).
// --check = all gates, no Chrome. Usage: README.md.
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, statSync, rmSync, readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const PAGE = join(HERE, 'render.html');
// per story <name>: <name>.story.js, <name>.data.js, <name>.captures/, <name>.manifest.json -> ../<name>.gif, -still.png, [-bottle.gif] + docs/app copies
let NAME, STORY, DATA, MANIFEST, GIF, STILL, BOTTLE, DOCS_GIF, APP_GIF, MIN_S, MAX_S;
function useStory(name) {
  NAME = name; STORY = join(HERE, `${name}.story.js`); DATA = join(HERE, `${name}.data.js`); MANIFEST = join(HERE, `${name}.manifest.json`);
  GIF = resolve(HERE, `../${name}.gif`); STILL = resolve(HERE, `../${name}-still.png`); BOTTLE = resolve(HERE, `../${name}-bottle.gif`);
  // docs get the GIF only: a still there is gitignored (*.png) and unreferenced; brewcode.app uses ../<name>-still.png
  DOCS_GIF = join(ROOT, `web/docs/public/brewmods/${name}.gif`);
  APP_GIF = join(process.env.BREWCODE_APP_DIR || resolve(ROOT, '../brewcode-app'), `site/main/public/mods/${name}.gif`);
}
// GIF px: terminal frame (770 CSS px at 88 cols) at 1.5x for HiDPI; README bottle (420 CSS px, shown at 200-260) at 1x
// bottle: ladder stops at BOTTLE_TARGET (~0.45 MB, no visible loss at README size), BOTTLE_BYTES = hard cap
const PW_PIN = '1.64.0', VIEWPORT = 1200, LOOP_WINDOW = [30, 38], MAX_SECONDS = 40, BOTTLE_WIDTH = 420, BOTTLE_TARGET = 450_000, BOTTLE_BYTES = 1_000_000;
let WIDTH = 1152;
const TARGET_BYTES = 3_500_000, MAX_BYTES = 5_000_000, SEAM_MIN = 0.985;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LADDER = [{ colors: 256 }, { colors: 128 }, { colors: 96 }, { colors: 64 }, { colors: 96, lossy: 20 }, { colors: 64, lossy: 20 }, { colors: 48, lossy: 10 }, { colors: 32, lossy: 30 }];
// real macOS keys, "glyph word" as drawn on the keycap (design-b §2.8, design-b2 §3)
const KEY_ALLOW = ['⇥ tab', '⏎ enter', '⎋ esc', '↑ ', '↓ ', '← ', '→ ', '⌫ delete', '⇧⇥ shift+tab', '⌃O ctrl+o'];
const BANNED = [/hover/i, /2\.1\.296/, /\(esc to interrupt ·/, /attached as hidden context/, /[Ѐ-ӿ]/, /\(global\) as drafted|do not ask where/];
const BANNED_STORY = [/⌘|\bcmd\b|command\+|\boption\b|\balt\+|\bmeta\+|backspace/i];
// error rows fail the GIF; the band's own unknown-name notice only warns (it is real while a name is new)
const ERROR_ROW = /no matches found|command not found|Traceback|\b[A-Z]\w*Error\b|^\s*Error:/, NOTICE_ROW = /unknown placeholder/;
const PRIVATE = [/\/Users\//, /\/private\//, /\.claude-[a-z0-9]+\//, /\.codex\/profiles\//, /Debug mode/, /SessionStart:/, /tmux focus-events/, /Plugins updated|reload-plugins/];
// story.allow: row tokens cut before the PRIVATE test where they are the story's subject (update-flow); only these, never paths
const ALLOWABLE = ['reload-plugins'];

const die = (m, code = 1) => { console.error(m); process.exit(code); };
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const uniq = (a) => [...new Set(a)];
// repeat to a fixpoint: one pass may leave markup (CodeQL js/incomplete-multi-character-sanitization)
const stripTags = (s) => { let prev; do { prev = s; s = s.replace(/<[^>]+>/g, ''); } while (s !== prev); return s; };

function parseArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (['--check', '--embed', '--keep'].includes(a)) opt[a.slice(2)] = true;
    else if (['--preview', '--out', '--captures', '--width'].includes(a)) { if (i + 1 >= argv.length) die(`missing value for ${a}`, 2); opt[a.slice(2)] = argv[++i]; }
    else if (a.startsWith('--')) die(`unknown option ${a}`, 2);
    else pos.push(a);
  }
  if (pos.length !== 1 || !/^[a-z0-9-]+$/.test(pos[0]) || !existsSync(join(HERE, `${pos[0]}.story.js`))) die('usage: node record-gifs.mjs <story: a <story>.story.js here> [--check] [--embed] [--preview <t>] [--out dir] [--width px, test runs only] [--captures dir] [--keep]', 2);
  if (opt.width !== undefined) { if (!opt.out && opt.preview === undefined) die('--width is for test runs (--out or --preview) only', 2); WIDTH = Number(opt.width); if (!(WIDTH >= 320 && WIDTH <= 2400)) die('bad --width', 2); }
  useStory(pos[0]);
  opt.captures = resolve(opt.captures || join(HERE, `${pos[0]}.captures`));
  return opt;
}

const loadJs = (file, key) => { const sb = { window: {} }; vm.runInNewContext(readFileSync(file, 'utf8'), sb, { filename: file }); return sb.window[key]; };

// ---------- tmux `capture-pane -e` -> rows of [text, style] ----------
const RESET = { f: null, g: null, b: false, d: false, i: false, u: false, r: false };
const styleKey = (s) => [s.f !== null && 'f' + s.f, s.g !== null && 'g' + s.g, s.b && 'b', s.d && 'd', s.i && 'i', s.u && 'u', s.r && 'r'].filter(Boolean).join(' ');
function sgr(st, params) {
  const p = params === '' ? [0] : params.split(/[;:]/).map((x) => (x === '' ? 0 : Number(x)));
  for (let i = 0; i < p.length; i++) {
    const n = p[i];
    if (n === 0) Object.assign(st, RESET);
    else if (n === 1) st.b = true; else if (n === 2) st.d = true; else if (n === 3) st.i = true; else if (n === 4) st.u = true; else if (n === 7) st.r = true;
    else if (n === 22) { st.b = false; st.d = false; } else if (n === 23) st.i = false; else if (n === 24) st.u = false; else if (n === 27) st.r = false;
    else if (n >= 30 && n <= 37) st.f = String(n - 30); else if (n >= 90 && n <= 97) st.f = String(n - 82); else if (n === 39) st.f = null;
    else if (n >= 40 && n <= 47) st.g = String(n - 40); else if (n >= 100 && n <= 107) st.g = String(n - 92); else if (n === 49) st.g = null;
    else if (n === 38 || n === 48) {
      let v = null;
      if (p[i + 1] === 5) { v = String(p[i + 2]); i += 2; } else if (p[i + 1] === 2) { v = '#' + p.slice(i + 2, i + 5).map((x) => (x || 0).toString(16).padStart(2, '0')).join(''); i += 4; }
      if (n === 38) st.f = v; else st.g = v;
    }
  }
}
function parseAnsi(raw) {
  const lines = raw.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '').replace(/\r/g, '').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const st = { ...RESET };
  return lines.map((line) => {
    const segs = [];
    let buf = '', key = styleKey(st), pos = 0;
    for (const m of line.matchAll(/\x1b\[([0-9;:]*)([A-Za-z])/g)) {
      buf += line.slice(pos, m.index); pos = m.index + m[0].length;
      if (m[2] !== 'm') continue;
      sgr(st, m[1]);
      const nk = styleKey(st);
      if (nk !== key) { if (buf) segs.push([buf, key]); buf = ''; key = nk; }
    }
    buf += line.slice(pos);
    if (buf) segs.push([buf, key]);
    const shows = (k) => /(^| )(g\S+|r)( |$)/.test(k);
    while (segs.length && !shows(segs.at(-1)[1]) && segs.at(-1)[0].trimEnd() === '') segs.pop();
    if (segs.length && !shows(segs.at(-1)[1])) segs.at(-1)[0] = segs.at(-1)[0].trimEnd();
    return segs;
  });
}
const plain = (segs) => segs.map((s) => s[0]).join('');

// ---------- <story>.data.js: generated from the captures, TODO-CAPTURE:<beat> where one is missing ----------
function screenNames(story) {
  const beat = Object.fromEntries(story.screens.map((s) => [s[1], s[2]]));
  return uniq([...story.screens.map((s) => s[1]), ...story.typing.map((t) => t.on)]).map((n) => [n, beat[n] || 'unknown']);
}
function buildData(story, capDir) {
  const out = [];
  for (const [name, beat] of screenNames(story)) {
    const a = join(capDir, `${name}.ansi.txt`), c = join(capDir, `${name}.cursor`);
    if (!existsSync(a)) { out.push(`  ${JSON.stringify(name)}: ${JSON.stringify(`TODO-CAPTURE:${beat}`)},`); continue; }
    const cur = existsSync(c) ? readFileSync(c, 'utf8').trim().split(/\s+/).map(Number) : null;
    const meta = { src: `${name}.ansi.txt`, sha256: sha(a).slice(0, 16), pane: cur ? [cur[3], cur[4]] : null, cursor: cur ? [cur[0], cur[1], cur[2]] : null };
    const lines = parseAnsi(readFileSync(a, 'utf8')).map((l) => `    ${JSON.stringify(l)},`);
    out.push(`  ${JSON.stringify(name)}: { ...${JSON.stringify(meta)}, lines: [\n${lines.join('\n')}\n  ] },`);
  }
  return `// Generated by record-gifs.mjs --embed from ${NAME}.captures/; edit the captures, never this file.\n`
    + `window.PH_SCREENS = {\n${out.join('\n')}\n};\n`;
}

// ---------- gates: [name, true|false|'warn', message] ----------
function textGates(story, opt, gates) {
  // story.window = [min, max] loop seconds; default LOOP_WINDOW
  [MIN_S, MAX_S] = story.window || LOOP_WINDOW;
  gates.push(['story-loop', story.loop >= MIN_S && story.loop <= MAX_S && story.end < story.loop, `${story.loop} s loop (window ${MIN_S}-${MAX_S}), end card from ${story.end} s`]);
  const B = story.bottle;
  gates.push(['story-bottle', !B || (B.loop > 0 && B.fps > 0 && B.blips > 0 && typeof B.label === 'string' && B.label.length <= 20), B ? `bottle ${B.loop} s, ${B.fps} fps, label "${B.label}"` : 'no README bottle (story.bottle unset)']);
  const badKeys = story.keys.filter((k) => !KEY_ALLOW.includes(`${k.glyph} ${k.word}`));
  gates.push(['keycaps', badKeys.length === 0, badKeys.length ? `not a real macOS keycap: ${badKeys.map((k) => `"${k.glyph} ${k.word}" at ${k.at}s`).join(', ')}`
    : `${story.keys.length} keycaps, all in the macOS allow-list: ${uniq(story.keys.map((k) => `${k.glyph} ${k.word}`.trim())).join(' | ')}`]);
  const allow = story.allow || [], badAllow = allow.filter((a) => !ALLOWABLE.includes(a));
  if (story.allow) gates.push(['story-allow', badAllow.length === 0, badAllow.length ? `not allowable: ${badAllow.join(', ')} (allow-list: ${ALLOWABLE.join(', ')})` : `rows may show ${allow.join(', ')}: the story's subject`]);
  const storyText = [...story.captions.map((c) => stripTags(c[1])), ...story.chapters.map((c) => c[1]), ...story.typing.map((t) => t.text)];
  const sHits = storyText.flatMap((s) => [...BANNED, ...BANNED_STORY].filter((re) => re.test(s)).map((re) => `${re} in "${s}"`));
  gates.push(['story-text', sHits.length === 0, sHits.length ? sHits.slice(0, 3).join(' | ') : `${storyText.length} captions/chapters/typed texts: no banned words, no non-Mac key names`]);
  const dataSrc = existsSync(DATA) ? readFileSync(DATA, 'utf8') : '';
  const data = dataSrc ? loadJs(DATA, 'PH_SCREENS') || {} : {};
  const names = screenNames(story);
  const todo = names.filter(([n]) => !data[n] || typeof data[n] === 'string');
  const byBeat = Object.entries(todo.reduce((m, [, b]) => ({ ...m, [b]: (m[b] || 0) + 1 }), {})).map(([b, k]) => `TODO-CAPTURE:${b} x${k}`);
  gates.push(['captures-todo', todo.length === 0 && !/TODO-CAPTURE:/.test(readFileSync(STORY, 'utf8')),
    todo.length ? `${todo.length}/${names.length} screens not captured yet: ${byBeat.join(', ')}` : `all ${names.length} screens come from captures`]);
  const facts = story.facts || [], got = facts.filter((f) => data[f.screen] && typeof data[f.screen] === 'object');
  // a fact is { screen, has } (string on the screen) or { screen, lacks } (string absent, e.g. a row that is gone)
  const missing = got.filter((f) => { const t = data[f.screen].lines.map((l) => plain(l).trimEnd()).join('\n') + '\n'; return f.lacks !== undefined ? t.includes(f.lacks) : !t.includes(f.has); });
  gates.push(['facts', missing.length === 0 && got.length === facts.length, missing.length ? `not true on screen: ${missing.map((f) => f.lacks !== undefined ? `${f.screen} shows "${f.lacks}" (${f.why})` : `${f.screen} lacks "${f.has}" (${f.why})`).join(' | ')}`
    : `${got.length}/${facts.length} facts checked${got.length < facts.length ? `, ${facts.length - got.length} wait for captures` : ''}`]);
  const fresh = buildData(story, opt.captures) === dataSrc;
  gates.push(['data-fresh', fresh, fresh ? `${NAME}.data.js matches ${opt.captures}` : `${NAME}.data.js differs from the captures: run --embed`]);
  const shot = names.filter(([n]) => data[n] && typeof data[n] === 'object');
  if (!shot.length) return;
  const { cols, rows } = story.term, dims = [], parse = [], priv = [], ban = [], vers = new Set(), noPrompt = [];
  const typed = shot.filter(([n]) => story.typing.some((ty) => ty.on === n)).length, errRows = [], noticeRows = [];
  for (const [n] of shot) {
    const sc = data[n], txt = sc.lines.map(plain), t = join(opt.captures, `${n}.txt`);
    if (!sc.pane || sc.pane[0] !== cols || sc.pane[1] !== rows || sc.lines.length !== rows || txt.some((l) => [...l].length > cols)) dims.push(`${n} (${sc.pane ? sc.pane.join('x') : 'no .cursor'}, ${sc.lines.length} lines)`);
    const ref = existsSync(t) ? readFileSync(t, 'utf8').replace(/\n$/, '').split('\n').map((l) => l.trimEnd()) : null;
    if (!ref || ref.length !== txt.length || ref.some((l, i) => l !== txt[i].trimEnd())) parse.push(n);
    for (const l of txt) {
      const lp = allow.filter((a) => ALLOWABLE.includes(a)).reduce((s, a) => s.split(a).join(''), l);
      for (const re of PRIVATE) if (re.test(lp)) priv.push(`${n}: ${re}`);
      for (const re of BANNED) if (re.test(l)) ban.push(`${n}: ${re}`);
      if (ERROR_ROW.test(l)) errRows.push(`${n}: "${l.trim().slice(0, 60)}"`);
      if (NOTICE_ROW.test(l)) noticeRows.push(`${n}: "${l.trim().slice(0, 40)}"`);
      const v = l.match(/Claude Code v(\d+\.\d+\.\d+)/); if (v) vers.add(v[1]);
    }
    if (story.typing.some((ty) => ty.on === n) && !txt.some((l, i) => i > 0 && l.startsWith('❯') && /^─{8,}$/.test(txt[i - 1].trim()))) noPrompt.push(n);
  }
  gates.push(['captures-size', dims.length === 0, dims.length ? `not ${cols}x${rows}: ${dims.slice(0, 4).join(', ')}` : `${shot.length} captures at ${cols}x${rows}`]);
  gates.push(['captures-parse', parse.length === 0, parse.length ? `ANSI text != .txt for: ${parse.join(', ')}` : 'ANSI rows equal the plain captures']);
  gates.push(['captures-private', priv.length === 0, priv.length ? uniq(priv).slice(0, 4).join(' | ') : `no home, tmp or profile-dir paths, debug, hook or plugin-update rows${allow.length ? ` (allowed: ${allow.join(', ')})` : ''}`]);
  gates.push(['captures-banned', ban.length === 0, ban.length ? uniq(ban).slice(0, 4).join(' | ') : 'no hover, 2.1.296, spinner esc hint, invented context row, Cyrillic, old dialog wording']);
  gates.push(['captures-errors', errRows.length === 0, errRows.length ? uniq(errRows).slice(0, 4).join(' | ') : 'no error rows (shell, Traceback, *Error)']);
  gates.push(['captures-notices', noticeRows.length === 0 ? true : 'warn', noticeRows.length ? uniq(noticeRows).join(' | ') : 'no unknown-placeholder rows']);
  gates.push(['captures-version', vers.size <= 1, `Claude Code ${[...vers].join(', ') || '(no header in view)'}`]);
  // typing frames draw the capture's own prompt row cut to the typed prefix: that row must read ❯ + the typed text
  const badTyped = story.typing.filter((ty) => data[ty.on] && typeof data[ty.on] === 'object').filter((ty) => {
    const txt = data[ty.on].lines.map(plain), i = txt.findLastIndex((l, k) => k > 0 && l.startsWith('❯') && /^─{8,}$/.test(txt[k - 1].trim()));
    return i >= 0 && [...txt[i]].slice(2).join('').trimEnd() !== ty.text.trimEnd();
  }).map((ty) => `${ty.on} != "${ty.text.trimEnd()}"`);
  gates.push(['captures-prompt-row', noPrompt.length === 0 && badTyped.length === 0, noPrompt.length ? `typing overlay has no ❯ row under a rule in: ${noPrompt.join(', ')}`
    : badTyped.length ? `captured prompt row is not the typed text: ${badTyped.join(' | ')}` : `${typed} of ${story.typing.length} typing screens captured, each prompt row reads the typed text`]);
  // screen-reader text quotes only what a captured screen shows
  const seen = shot.map(([n]) => data[n].lines.map((l) => plain(l).trimEnd()).join('\n')).join('\n');
  const quotes = [...(story.aria || '').matchAll(/"([^"]+)"/g)].map((m) => m[1]), unseen = quotes.filter((q) => !seen.includes(q));
  gates.push(['aria-quotes', unseen.length === 0, unseen.length ? `story.aria quotes text no capture shows: ${unseen.map((q) => `"${q}"`).join(' | ')}` : `${quotes.length} quotes in story.aria, each on a captured screen`]);
  if (story.marks) markGates(story, data, gates);
}

// port of render.html screenAt(): screen shown at t and whether its typing overlay is complete
function screenAt(story, t) {
  const i = story.screens.reduce((k, e, j) => (t >= e[0] ? j : k), -1);
  let ov = null;
  for (const ty of story.typing) {
    const len = [...ty.text].length, n = Math.min(len, (ty.from || 0) + Math.floor((t - ty.at) * ty.cps + 1e-6) + 1);
    const nextScreen = story.screens.find((s) => s[0] > ty.at && s[1] !== ty.on);
    if (t >= ty.at && (!nextScreen || t < nextScreen[0])) ov = { name: ty.on, done: n >= len };
  }
  return ov || { name: story.screens[Math.max(0, i)][1], done: true };
}

// story.marks [{at, until, screen, rows:[r0,r1], cols?, tone, has, hold?}]: highlight boxes drawn by render.html (pool of two)
const MARK_HOLD = 1.2, MARK_POOL = 2, ESCAPE = '++/';
function markGates(story, data, gates) {
  const { cols, rows } = story.term, fps = story.fps, bad = [];
  const frames = (m) => { const out = []; for (let i = Math.ceil(m.at * fps - 1e-6); i / fps < m.until - 1e-9; i++) out.push(i / fps); return out; };
  story.marks.forEach((m, k) => {
    const id = `mark ${k + 1} (${m.screen} ${m.at}-${m.until})`, sc = data[m.screen], [r0, r1] = m.rows || [], c = m.cols, hold = m.hold ?? MARK_HOLD;
    if (!['gold', 'teal'].includes(m.tone)) bad.push(`${id}: tone "${m.tone}" (gold|teal)`);
    if (!(hold >= MARK_HOLD && m.until - m.at >= hold - 1e-9)) bad.push(`${id}: held ${(m.until - m.at).toFixed(2)} s, needs ${hold} s (min ${MARK_HOLD})`);
    if (!(m.until <= story.end)) bad.push(`${id}: until ${m.until} is past the end card (${story.end})`);
    if (!(Number.isInteger(r0) && Number.isInteger(r1) && r0 >= 0 && r0 <= r1 && r1 < rows)) return bad.push(`${id}: rows ${m.rows} outside 0-${rows - 1}`);
    if (c && !(Number.isInteger(c[0]) && Number.isInteger(c[1]) && c[0] >= 0 && c[0] <= c[1] && c[1] < cols)) return bad.push(`${id}: cols ${c} outside 0-${cols - 1}`);
    if (!sc || typeof sc !== 'object') return bad.push(`${id}: screen not captured`);
    const txt = sc.lines.map((l) => plain(l).trimEnd()), inside = txt.slice(r0, r1 + 1);
    if (!txt[r0].trim() || !txt[r1].trim()) bad.push(`${id}: edge row ${!txt[r0].trim() ? r0 : r1} is blank`);
    const area = (c ? inside.map((l) => [...l].slice(c[0], c[1] + 1).join('')) : inside).join('\n');
    if (typeof m.has !== 'string' || !m.has || !area.includes(m.has)) bad.push(`${id}: "${m.has}" not inside rows ${r0}-${r1}${c ? ` cols ${c}` : ''}`);
    if (inside.some((l) => l.includes(ESCAPE))) bad.push(`${id}: a marked row shows ${ESCAPE}`);
    const off = frames(m).map((t) => [t, screenAt(story, t)]).find(([, s]) => s.name !== m.screen || !s.done);
    if (off) bad.push(`${id}: t=${off[0].toFixed(1)} shows ${off[1].name}${off[1].done ? '' : ' while typing'}`);
  });
  // overlap only on one screen; render.html draws at most MARK_POOL at once
  story.marks.forEach((a, i) => story.marks.slice(i + 1).forEach((b) => { if (a.at < b.until && b.at < a.until && a.screen !== b.screen) bad.push(`marks on ${a.screen} and ${b.screen} overlap`); }));
  const busy = uniq(story.marks.flatMap(frames)).filter((t) => story.marks.filter((m) => t >= m.at && t < m.until).length > MARK_POOL);
  if (busy.length) bad.push(`more than ${MARK_POOL} marks at t=${busy[0].toFixed(1)}`);
  const said = [...story.captions.map((x) => stripTags(x[1])), ...story.chapters.map((x) => x[1]), story.aria || ''].filter((x) => x.includes(ESCAPE));
  if (said.length) bad.push(`${ESCAPE} in story text: "${said[0].slice(0, 50)}"`);
  gates.push(['marks', bad.length === 0, bad.length ? uniq(bad).slice(0, 4).join(' | ')
    : `${story.marks.length} marks: on their screen with typing done every frame, rows hold their text, no ${ESCAPE}, held >= ${MARK_HOLD} s (longest ${Math.max(...story.marks.map((m) => m.until - m.at)).toFixed(1)} s), <= ${MARK_POOL} at once`]);
}

// size, length and frame count from the block parser (gifParse below)
function gifInfo(file) {
  const g = gifParse(file);
  return { width: g.width, height: g.height, seconds: g.frames.reduce((s, f) => s + f.delay, 0) / 100, frames: g.frames.length };
}
// a scene has no data.js
const sourceHashes = (story) => Object.fromEntries([PAGE, STORY, ...(story.scene ? [] : [DATA]), fileURLToPath(import.meta.url)].map((p) => [p.slice(HERE.length + 1), existsSync(p) ? sha(p) : null]));

function gifGates(story, gates) {
  if (!existsSync(GIF)) { gates.push(['gif', false, `missing ${GIF}`]); return; }
  const info = gifInfo(GIF), bytes = statSync(GIF).size;
  const m = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : null, cur = sourceHashes(story);
  if (story.scene) sceneGifGates(story, GIF, gates, m);
  else {
    gates.push(['gif-duration', info.seconds >= MIN_S && info.seconds <= MAX_S, `${info.seconds.toFixed(2)} s (window ${MIN_S}-${MAX_S}), ${info.frames} frames`]);
    gates.push(['gif-width', info.width === WIDTH, `${info.width}x${info.height}`]);
    gates.push(['gif-size', bytes > MAX_BYTES ? false : bytes > TARGET_BYTES ? 'warn' : true, `${(bytes / 1e6).toFixed(2)} MB (target ${TARGET_BYTES / 1e6}, hard ${MAX_BYTES / 1e6})`]);
  }
  const drift = m ? Object.keys(cur).filter((k) => m.sources[k] !== cur[k]) : [];
  const ok = !!m && m.gif.sha256 === sha(GIF) && drift.length === 0;
  gates.push(['gif-recorded', ok, !m ? `no ${NAME}.manifest.json: ${NAME}.gif was not recorded from these sources` : m.gif.sha256 !== sha(GIF) ? `${NAME}.gif sha != manifest (re-encoded or replaced by hand)`
    : drift.length ? `sources changed since the recording: ${drift.join(', ')}` : `recorded ${m.recorded} from the current sources`]);
  // manifest encode rung: none recorded or the last rung (fewest colours: mark and text hues drift) warns
  const enc = m?.gif?.colors !== undefined ? m.gif : null, k = enc ? rungOf(enc) : -1, lastRung = k === LADDER.length - 1;
  gates.push(['gif-encode', k >= 0 && !lastRung ? true : 'warn', k < 0 ? `no ladder colors/lossy in ${NAME}.manifest.json: re-record` : `${encodeText(enc)}${lastRung ? ': last rung, fewest colours' : ''}`]);
  // the still (frame at story.still; brewcode.app's reduced-motion poster) and the README bottle ride on the same recording
  const still = existsSync(STILL) ? sha(STILL) : 'missing', bottle = existsSync(BOTTLE) ? sha(BOTTLE) : 'missing';
  const dims = !story.scene || (m?.still?.width === SCENE.width && m?.still?.height === SCENE.height);
  gates.push(['still', !!m && still === m.still?.sha256 && dims, still === 'missing' ? `missing ${STILL}` : !m || still !== m.still?.sha256 ? `${NAME}-still.png sha != manifest`
    : `${NAME}-still.png ${m.still.width}x${m.still.height} t=${m.still.t}${dims ? '' : ` (want ${SCENE.width}x${SCENE.height})`}`]);
  // no story.bottle (scenes, placeholders-full-text): no bottle file, no manifest entry
  if (!story.bottle) gates.push(['bottle', bottle === 'missing' && !m?.bottle, bottle === 'missing' && !m?.bottle ? 'no bottle (story has none)' : `stale ${NAME}-bottle.gif or manifest bottle: story has no bottle, re-record and delete the file`]);
  else {
    const bi = bottle === 'missing' ? null : gifInfo(BOTTLE);
    gates.push(['bottle', !!m && bottle === m.bottle?.sha256 && bi.width === BOTTLE_WIDTH, bottle === 'missing' ? `missing ${BOTTLE}` : !m || bottle !== m.bottle?.sha256 ? `${NAME}-bottle.gif sha != manifest`
      : `${NAME}-bottle.gif ${bi.width}x${bi.height}, ${bi.seconds.toFixed(2)} s, ${(statSync(BOTTLE).size / 1e6).toFixed(2)} MB`]);
  }
  const copies = [GIF, DOCS_GIF, APP_GIF].map((p) => [p, existsSync(p) ? sha(p) : 'missing']);
  const short = ([p, s]) => `${p.replace(resolve(ROOT, '..') + '/', '')}=${s.slice(0, 12)}`;
  const one = copies[1][1] === copies[0][1] && copies[0][1] !== 'missing';
  gates.push(['copies-sha', one, one ? `repo + docs copies, sha256 ${copies[0][1].slice(0, 12)}` : copies.slice(0, 2).map(short).join(' ')]);
  // brewcode-app copy ships with that site's own release: a mismatch only warns
  gates.push(['copies-app', copies[2][1] === copies[0][1] ? true : 'warn', copies[2][1] === copies[0][1] ? 'brewcode-app copy matches' : `${short(copies[2])} (copy it there)`]);
}

// ---------- record ----------
function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.error || r.status !== 0) throw new Error(`${cmd} failed (rc ${r.status}): ${r.error || r.stderr.slice(-400)}`);
  return r.stderr;
}
const ssim = (a, b) => { const m = run('ffmpeg', ['-nostdin', '-v', 'info', '-i', a, '-i', b, '-lavfi', 'ssim', '-f', 'null', '-']).match(/All:([0-9.]+)/); return m ? Number(m[1]) : NaN; };
const ver = (cmd, args, re) => { const r = spawnSync(cmd, args, { encoding: 'utf8' }); return ((r.stdout || '') + (r.stderr || '')).match(re)?.[1] || 'unknown'; };

function loadPlaywright() {
  for (const base of [join(process.cwd(), 'noop.js'), fileURLToPath(import.meta.url)]) {
    try { const req = createRequire(pathToFileURL(base).href); const v = req('playwright-core/package.json').version; if (v !== PW_PIN) die(`playwright-core ${v} found, need exactly ${PW_PIN}`, 2); return req('playwright-core'); } catch (e) { if (e.exitCode) throw e; }
  }
  return die(`playwright-core not found: cd "$(mktemp -d)" && npm i playwright-core@${PW_PIN} --no-package-lock, run from there`, 2);
}

// sel = '#hero' (terminal frame), '#bottle' (README bottle, &bottle=1) or '#scene' (drawn scene, &scene=1: no text, no font check)
async function capture(browser, times, dir, sel = '#hero') {
  // viewport taller than the frame (88x30 terminal + bars = 685 px; 1100 leaves room up to ~50 rows), else the clip drops the caption bar
  const ctx = await browser.newContext({ viewport: { width: VIEWPORT, height: 1100 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const base = `${pathToFileURL(PAGE).href}?story=${NAME}&${{ '#bottle': 'bottle=1&', '#scene': 'scene=1&' }[sel] || ''}`;
  let clip = null;
  for (let k = 0; k < times.length; k++) {
    await page.goto(`${base}t=${Math.round(times[k] * 10000) / 10000}`, { waitUntil: k === 0 ? 'networkidle' : 'load' });
    await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
    if (!clip) {
      if (sel !== '#scene' && !(await page.evaluate(() => document.fonts.check('14px "JetBrains Mono"')))) throw new Error('JetBrains Mono not loaded (network for Google Fonts?)');
      clip = await page.locator(sel).boundingBox();
      if (!clip) throw new Error(`${sel} not found`);
      if (clip.y + clip.height > 1100) throw new Error(`${sel} bottom ${clip.y + clip.height}px is below the 1100px viewport`);
    }
    await page.screenshot({ path: join(dir, `f_${String(k).padStart(4, '0')}.png`), clip });
  }
  await ctx.close();
  return errors;
}

// mirror of render.html x256(): capture colour spec -> #rrggbb
const BASIC = ['#000000', '#CD3131', '#0DBC79', '#E5E510', '#2472C8', '#BC3FBC', '#11A8CD', '#E5E5E5', '#666666', '#F14C4C', '#23D18B', '#F5F543', '#3B8EEA', '#D670D6', '#29B8DB', '#FFFFFF'];
const LV = [0, 95, 135, 175, 215, 255], hx = (v) => v.toString(16).padStart(2, '0');
const hexOf = (spec) => spec[0] === '#' ? spec : ((n) => n < 16 ? BASIC[n] : n < 232 ? '#' + [Math.floor((n - 16) / 36), Math.floor((n - 16) / 6) % 6, (n - 16) % 6].map((i) => hx(LV[i])).join('') : '#' + hx(8 + 10 * (n - 232)).repeat(3))(Number(spec));
// mark borders (render.html --gold, --plan) + every fg colour the captures draw: a few-second colour otherwise loses its palette slot to grey
const MARK_VARS = ['--gold', '--plan'];
const markColours = () => { const css = readFileSync(PAGE, 'utf8'); return MARK_VARS.map((v) => css.match(new RegExp(`${v}:\\s*(#[0-9A-Fa-f]{6})`))?.[1] || die(`render.html has no ${v}: #rrggbb`)).map((h) => h.toLowerCase()); };
const keepColours = () => uniq([...markColours(), ...Object.values(loadJs(DATA, 'PH_SCREENS') || {}).filter((s) => typeof s === 'object')
  .flatMap((s) => s.lines.flat().map((seg) => seg[1].match(/(?:^| )f(\S+)/)?.[1]).filter(Boolean)).map(hexOf).map((h) => h.toLowerCase())]);
// ladder rung of an encode: "colors N[ lossy L] (rung k/len)"; the last rung = fewest colours, hues drift
const rungOf = (e) => LADDER.findIndex((s) => s.colors === e.colors && (s.lossy || 0) === (e.lossy || 0));
const encodeText = (e) => `colors ${e.colors}${e.lossy ? ` lossy ${e.lossy}` : ''} (rung ${rungOf(e) + 1}/${LADDER.length})`;

// one swatch frame of stripes, ~1000 rows of each kept colour across `n` palette-only frames
function swatch(dir, colours, width) {
  const png = readFileSync(join(dir, 'f_0000.png')), w = png.readUInt32BE(16), h = png.readUInt32BE(20), stripe = Math.ceil(h / colours.length);
  const out = join(dir, 'swatch.png'), ins = colours.flatMap((c) => ['-f', 'lavfi', '-i', `color=c=0x${c.slice(1)}:s=${w}x${stripe}:d=1`]);
  run('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...ins, '-filter_complex', `${colours.map((_, i) => `[${i}:v]`).join('')}vstack=inputs=${colours.length},crop=${w}:${h}:0:0`, '-frames:v', '1', out]);
  return { out, n: Math.ceil((colours.length * 1000 * w) / (width * h)) };
}

// each kept colour's nearest opaque palette entry within KEEP_SNAP (RGB) becomes that exact colour (palettegen averages it with its anti-aliasing)
const KEEP_SNAP = 4;
function snapKeep(pal, keep) {
  const b = readFileSync(pal), taken = new Set();
  for (const q of keep) {
    let best = [Infinity, -1];
    for (let i = 0; i + 3 < b.length; i += 4) if (b[i + 3] && !taken.has(i)) { const d = Math.hypot(b[i] - q[0], b[i + 1] - q[1], b[i + 2] - q[2]); if (d < best[0]) best = [d, i]; }
    if (best[0] <= KEEP_SNAP) { b.set(q, best[1]); taken.add(best[1]); }
  }
  writeFileSync(pal, b);
}

// palette pass over every frame (+ swatch frames) to rgba (keeps palettegen's transparent slot), snapKeep, then paletteuse on the first `frames`
function encode(dir, frames, fps, outFile, colours, width = WIDTH, target = TARGET_BYTES) {
  const raw = join(dir, 'raw.gif'), pal = join(dir, 'pal.rgba'), sw = colours.length > 1 ? swatch(dir, colours, width) : null, scale = `scale=${width}:-2:flags=lanczos`;
  const src = ['-nostdin', '-v', 'error', '-y', '-framerate', String(fps), '-i', join(dir, 'f_%04d.png')];
  const statIn = sw ? [...src, '-loop', '1', '-framerate', String(fps), '-t', String(sw.n / fps), '-i', sw.out] : src;
  const statFeed = sw ? `[0:v]${scale}[a];[1:v]scale=${width}:-2:flags=neighbor[s];[a][s]concat=n=2:v=1:a=0,` : `[0:v]${scale},`;
  let best = null;
  for (const [k, step] of LADDER.entries()) {
    run('ffmpeg', [...statIn, '-filter_complex', `${statFeed}palettegen=max_colors=${step.colors}:stats_mode=full`, '-f', 'rawvideo', '-pix_fmt', 'rgba', pal]);
    snapKeep(pal, colours.map(rgbOf));
    run('ffmpeg', [...src, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', '16x16', '-i', pal, '-frames:v', String(frames),
      '-filter_complex', `[0:v]${scale}[a];[a][1:v]paletteuse=dither=none:diff_mode=rectangle`, '-loop', '0', raw]);
    // one file per rung: rungs share colour counts (96, 64)
    const tmp = join(dir, `try_${k + 1}.gif`);
    run('gifsicle', ['-O3', ...(step.lossy ? [`--lossy=${step.lossy}`] : []), raw, '-o', tmp]);
    const bytes = statSync(tmp).size;
    if (!best || bytes < best.bytes) best = { bytes, tmp, ...step };
    if (bytes <= target) break;
  }
  copyFileSync(best.tmp, outFile);
  return best;
}

async function record(story, opt, gates) {
  const preview = opt.preview !== undefined, test = !!opt.out || preview;
  if (!test && gates.some((g) => g[1] === false)) return gates.push(['record', false, 'text gates are red: fix them, or record a test GIF with --out <dir>']);
  const outDir = resolve(opt.out || (preview ? tmpdir() : dirname(GIF))), dir = mkdtempSync(join(tmpdir(), `bcm-${NAME}-`));
  mkdirSync(outDir, { recursive: true });
  const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const f = (k) => join(dir, `f_${String(k).padStart(4, '0')}.png`);
    if (preview) {
      await capture(browser, [Number(opt.preview)], dir);
      const p = join(outDir, `${NAME}_preview_${opt.preview}.png`);
      run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', f(0), '-vf', `scale=${WIDTH}:-2:flags=lanczos`, p]);
      return console.log(`preview ${p}`);
    }
    const n = Math.round(story.loop * story.fps);
    if (n / story.fps > MAX_SECONDS) return gates.push(['record', false, `${n / story.fps} s is over the ${MAX_SECONDS} s cap`]);
    const times = Array.from({ length: n }, (_, i) => i / story.fps);
    const errors = await capture(browser, [...times, story.still], dir);
    const outFile = test ? join(outDir, `${NAME}.gif`) : GIF, stillFile = test ? join(outDir, `${NAME}-still.png`) : STILL;
    const enc = encode(dir, n, story.fps, outFile, keepColours()), info = gifInfo(outFile);
    const seam = ssim(f(n - 1), f(0));
    run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', f(n), '-vf', `scale=${WIDTH}:-2:flags=lanczos`, stillFile]);
    gates.push(['record-bytes', enc.bytes <= MAX_BYTES, `${(enc.bytes / 1e6).toFixed(2)} MB, ${encodeText(enc)}${enc.bytes > TARGET_BYTES ? ' (over target)' : ''}`]);
    gates.push(['record-seam', seam >= SEAM_MIN, `SSIM last-to-first ${seam.toFixed(4)} (min ${SEAM_MIN})`]);
    console.log(`${test ? 'TEST ' : ''}${outFile}: ${info.width}x${info.height}, ${info.seconds.toFixed(2)} s, ${info.frames} frames; still t=${story.still} -> ${stillFile}`);
    // README bottle (when story.bottle): its own frames dir, steady loop, BOTTLE_WIDTH px
    const B = story.bottle, bdir = B && mkdtempSync(join(tmpdir(), `bcm-${NAME}-bottle-`)), bn = B && Math.round(B.loop * B.fps);
    const bottleFile = test ? join(outDir, `${NAME}-bottle.gif`) : BOTTLE;
    if (B) try {
      errors.push(...await capture(browser, Array.from({ length: bn }, (_, i) => i / B.fps), bdir, '#bottle'));
      const benc = encode(bdir, bn, B.fps, bottleFile, [], BOTTLE_WIDTH, BOTTLE_TARGET), binfo = gifInfo(bottleFile);
      const bseam = ssim(join(bdir, `f_${String(bn - 1).padStart(4, '0')}.png`), join(bdir, 'f_0000.png'));
      gates.push(['record-bottle', benc.bytes <= BOTTLE_BYTES, `${NAME}-bottle.gif ${binfo.width}x${binfo.height}, ${binfo.seconds.toFixed(2)} s, ${(benc.bytes / 1e6).toFixed(2)} MB (target ${BOTTLE_TARGET / 1e6}, hard ${BOTTLE_BYTES / 1e6}), colors ${benc.colors}${benc.lossy ? ` lossy ${benc.lossy}` : ''}, seam SSIM ${bseam.toFixed(4)}`]);
    } finally { if (!opt.keep) rmSync(bdir, { recursive: true, force: true }); }
    gates.push(['record-errors', errors.length === 0, errors.length ? errors.slice(0, 2).join(' | ') : '0 page errors']);
    if (!test && gates.every((g) => g[1] !== false)) {
      copyFileSync(GIF, DOCS_GIF);
      const vers = uniq(Object.values(loadJs(DATA, 'PH_SCREENS')).flatMap((s) => (typeof s === 'object' ? s.lines.map(plain) : [])).map((l) => l.match(/Claude Code v(\S+)/)?.[1]).filter(Boolean));
      const tools = { playwrightCore: PW_PIN, ffmpeg: ver('ffmpeg', ['-version'], /version (\S+)/), gifsicle: ver('gifsicle', ['--version'], /Gifsicle (\S+)/), node: process.version };
      const png = readFileSync(STILL), bi = B && gifInfo(BOTTLE);
      writeFileSync(MANIFEST, JSON.stringify({ gif: { file: `${NAME}.gif`, bytes: enc.bytes, sha256: sha(GIF), width: info.width, height: info.height, seconds: info.seconds, colors: enc.colors, lossy: enc.lossy || 0 },
        still: { file: `${NAME}-still.png`, sha256: sha(STILL), width: png.readUInt32BE(16), height: png.readUInt32BE(20), t: story.still },
        ...(B && { bottle: { file: `${NAME}-bottle.gif`, bytes: statSync(BOTTLE).size, sha256: sha(BOTTLE), width: bi.width, height: bi.height, seconds: bi.seconds, label: B.label } }),
        sources: sourceHashes(story), ccVersion: vers.join(', ') || 'unknown', tools, recorded: new Date().toISOString() }, null, 2) + '\n');
      console.log(`copied ${NAME}.gif to ${dirname(DOCS_GIF)}; manifest written; brewcode-app: copy ${NAME}.gif + ${NAME}-still.png to ${dirname(APP_GIF)}`);
    }
  } finally {
    await browser.close();
    if (opt.keep) console.log(`frames kept in ${dir}`); else rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- drawn scenes (story.scene, render.html &scene=1): no captures; these gates replace textGates + bottle ----------
// hub-mini: 640x248 CSS px at 2x, saved 800x310 with area scaling (2-colour blends only, no lanczos ringing)
const SCENE = { kind: 'hub-mini', size: [640, 248], width: 800, height: 310, window: [6, 8], slack: .05, target: 250_000, max: 300_000, band: 10, tol: 12 };
const ROLES = ['bg', 'line', 'counter', 'tapBody', 'handle', 'beer', 'beerHi', 'foam', 'foamHi'];
const TOKENS = join(process.env.BREWCODE_APP_DIR || resolve(ROOT, '../brewcode-app'), 'site/main/src/styles/tokens.css');
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hexOfRgb = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// cite "tokens.css <theme> <token> [over <token>]" (rgba composited over the second) or "render.html <selector>"
function citeValue(cite) {
  const [file, ...rest] = cite.split(' ');
  if (file === 'render.html') {
    const sel = rest.join(' '), re = new RegExp(`${escRe(sel)}\\s*\\{[^}]*?(#[0-9A-Fa-f]{6})\\b`), lines = readFileSync(PAGE, 'utf8').split('\n');
    const i = lines.findIndex((l) => re.test(l));
    return i < 0 ? { err: `no "${sel} { #rrggbb }" in render.html` } : { hex: lines[i].match(re)[1].toUpperCase(), at: `render.html:${i + 1}` };
  }
  if (file !== 'tokens.css') return { err: `unknown cite file "${file}"` };
  if (!existsSync(TOKENS)) return { missing: true };
  const [theme, token, over, base] = rest, lines = readFileSync(TOKENS, 'utf8').split('\n');
  const decl = (name) => {
    let inside = false;
    for (let i = 0; i < lines.length; i++) {
      const open = lines[i].match(/^\[data-theme="([^"]+)"\]\s*\{/);
      if (open) inside = open[1] === theme; else if (/^\}/.test(lines[i])) inside = false;
      const m = inside && lines[i].match(new RegExp(`^\\s*${escRe(name)}:\\s*([^;]+);`));
      if (m) { const c = m[1].trim(), h = c.match(/^#([0-9A-Fa-f]{6})$/), a = c.match(/^rgba\(([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)$/);
        return { rgba: h ? [...rgbOf(c), 1] : a ? a.slice(1).map(Number) : null, line: i + 1, raw: c }; }
    }
    return null;
  };
  const a = decl(token), b = over === 'over' ? decl(base) : null;
  if (!a || !a.rgba) return { err: `${token} ${a ? `"${a.raw}" not #rrggbb/rgba()` : `not in [data-theme="${theme}"]`}` };
  if (over === 'over' && (!b || !b.rgba || b.rgba[3] !== 1)) return { err: `${base} not an opaque colour in [data-theme="${theme}"]` };
  if (!b && a.rgba[3] !== 1) return { err: `${token} is translucent: cite it "over <token>"` };
  const c = b ? a.rgba.slice(0, 3).map((v, k) => Math.round(v * a.rgba[3] + b.rgba[k] * (1 - a.rgba[3]))) : a.rgba.slice(0, 3);
  return { hex: hexOfRgb(c), at: `tokens.css:${a.line}${b ? `/${b.line}` : ''}` };
}

function sceneGates(story, gates) {
  [MIN_S, MAX_S] = SCENE.window;
  const pal = story.palette || {}, bad = [];
  if (story.scene !== SCENE.kind) bad.push(`scene "${story.scene}" (render.html draws only ${SCENE.kind})`);
  if (!['light', 'dark'].includes(story.theme)) bad.push(`theme "${story.theme}"`);
  if (!same(Object.keys(pal), ROLES)) bad.push(`roles ${Object.keys(pal).join(',')} != ${ROLES.join(',')}`);
  for (const [k, v] of Object.entries(pal)) if (!Array.isArray(v) || !/^#[0-9A-F]{6}$/.test(v[0]) || typeof v[1] !== 'string') bad.push(`${k} is not ["#RRGGBB", cite]`);
  if (!ROLES.includes(story.border)) bad.push(`border "${story.border}" is not a role`);
  if (!(story.loop >= MIN_S && story.loop <= MAX_S)) bad.push(`loop ${story.loop} s outside ${MIN_S}-${MAX_S}`);
  if (!(story.fps > 0 && story.still > 0 && story.still < story.loop)) bad.push(`fps ${story.fps}, still ${story.still}: still must sit inside the loop`);
  if (!same(story.size, SCENE.size)) bad.push(`size ${story.size} != ${SCENE.size}`);
  const tf = join(HERE, `${story.twin}.story.js`), tw = /^[a-z0-9-]+$/.test(story.twin || '') && existsSync(tf) ? loadJs(tf, 'PH_STORY') : null;
  const twinOk = !!tw && tw.scene === story.scene && tw.twin === NAME && tw.theme !== story.theme && ['loop', 'fps', 'still', 'size'].every((k) => same(tw[k], story[k]));
  if (!twinOk) bad.push(`twin "${story.twin}": needs its own twin = ${NAME}, the other theme and the same loop/fps/still/size`);
  gates.push(['scene-story', bad.length === 0, bad.length ? bad.join(' | ') : `${story.theme}, ${ROLES.length} roles, ${story.loop} s at ${story.fps} fps, still t=${story.still}, border ${story.border}, twin ${story.twin}`]);
  const rows = Object.entries(pal).map(([k, [hex, cite]]) => [k, hex, cite, citeValue(cite)]);
  const wrong = rows.filter(([, hex, , r]) => r.err || (r.hex && r.hex !== hex)), missing = rows.filter(([, , , r]) => r.missing);
  gates.push(['scene-tokens', wrong.length ? false : missing.length ? 'warn' : true, wrong.length ? wrong.map(([k, hex, cite, r]) => `${k} ${hex} != ${cite}: ${r.err || r.hex}`).join(' | ')
    : `${rows.length - missing.length} roles equal their cite (${rows.filter(([, , , r]) => r.at).map(([k, , , r]) => `${k}=${r.at}`).join(', ')})${missing.length ? `; ${TOKENS} missing, ${missing.length} unchecked` : ''}`]);
}

// GIF blocks: global table, per frame rect, local-table flag, delay, transparent index, LZW data span
function gifParse(file) {
  const b = readFileSync(file), u16 = (i) => b.readUInt16LE(i), tbl = (i, n) => Array.from({ length: n }, (_, k) => [b[i + 3 * k], b[i + 3 * k + 1], b[i + 3 * k + 2]]);
  const gct = b[10] & 0x80 ? tbl(13, 2 << (b[10] & 7)) : [], frames = [];
  let i = 13 + 3 * gct.length, gce = { delay: 0, trans: -1 };
  const subs = () => { while (b[i]) i += b[i] + 1; i++; };
  while (i < b.length && b[i] !== 0x3b) {
    if (b[i] === 0x21) { if (b[i + 1] === 0xf9) gce = { delay: u16(i + 4), trans: b[i + 3] & 1 ? b[i + 6] : -1 }; i += 2; subs(); continue; }
    if (b[i] !== 0x2c) throw new Error(`${file}: bad GIF block 0x${b[i].toString(16)} at ${i}`);
    const pf = b[i + 9], fr = { left: u16(i + 1), top: u16(i + 3), w: u16(i + 5), h: u16(i + 7), local: !!(pf & 0x80), interlaced: !!(pf & 0x40), ...gce };
    i += 10 + (fr.local ? 3 * (2 << (pf & 7)) : 0);
    fr.min = b[i++]; fr.at = i; subs(); frames.push(fr); gce = { delay: 0, trans: -1 };
  }
  return { b, width: u16(6), height: u16(8), gct, frames };
}

// LZW-decode one frame's palette indices (row-major, fr.w x fr.h)
function gifIndices(g, fr) {
  const parts = []; for (let i = fr.at; g.b[i]; i += g.b[i] + 1) parts.push(g.b.subarray(i + 1, i + 1 + g.b[i]));
  const d = Buffer.concat(parts), out = new Uint8Array(fr.w * fr.h), clear = 1 << fr.min, pre = new Int32Array(4096), suf = new Uint8Array(4096), first = new Uint8Array(4096), stack = new Uint8Array(4097);
  for (let k = 0; k < clear; k++) { suf[k] = k; first[k] = k; }
  let size = fr.min + 1, next = clear + 2, old = -1, acc = 0, nb = 0, p = 0, o = 0;
  while (o < out.length) {
    while (nb < size && p < d.length) { acc |= d[p++] << nb; nb += 8; }
    if (nb < size) break;
    const code = acc & ((1 << size) - 1); acc >>>= size; nb -= size;
    if (code === clear) { size = fr.min + 1; next = clear + 2; old = -1; continue; }
    if (code === clear + 1) break;
    if (old < 0) { out[o++] = suf[code]; old = code; continue; }
    let c = code, sp = 0;
    if (code >= next) { stack[sp++] = first[old]; c = old; }
    while (c >= clear) { stack[sp++] = suf[c]; c = pre[c]; }
    stack[sp++] = c;
    while (sp && o < out.length) out[o++] = stack[--sp];
    if (next < 4096) { pre[next] = old; suf[next] = c; first[next] = first[old]; next++; if (next === 1 << size && size < 12) size++; }
    old = code;
  }
  return out;
}

// nearest blend of two roles to c (a role alone counts): [RGB distance, rgb]
function blendNearest(c, roles) {
  let best = [Infinity, c];
  for (const a of roles) for (const b of roles) {
    const v = b.map((x, k) => x - a[k]), w = c.map((x, k) => x - a[k]), vv = v.reduce((s, x) => s + x * x, 0);
    const k = vv ? Math.max(0, Math.min(1, w.reduce((s, x, j) => s + x * v[j], 0) / vv)) : 0, p = a.map((x, j) => x + k * v[j]);
    const d = Math.hypot(...c.map((x, j) => x - p[j]));
    if (d < best[0]) best = [d, p.map(Math.round)];
  }
  return best;
}
const blendDist = (c, roles) => blendNearest(c, roles)[0];
const roleRgb = (story) => uniq(Object.values(story.palette).map((v) => v[0])).map(rgbOf);

// palettegen (no transparent slot), every entry but #000 padding snapped onto its nearest 2-role blend, then paletteuse;
// gifsicle -O1: -O2/-O3 merge identical frames (the empty-counter tail), so 84 frames would ship as 83
function encodeScene(dir, frames, fps, outFile, roles) {
  const src = ['-nostdin', '-v', 'error', '-y', '-framerate', String(fps), '-i', join(dir, 'f_%04d.png')], scale = `scale=${SCENE.width}:-2:flags=area`;
  const pal = join(dir, 'pal.rgb'), raw = join(dir, 'raw.gif');
  let best = null;
  for (const step of LADDER) {
    run('ffmpeg', [...src, '-frames:v', String(frames), '-vf', `${scale},palettegen=max_colors=${step.colors}:stats_mode=full:reserve_transparent=0`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', pal]);
    const b = readFileSync(pal);
    for (let i = 0; i + 2 < b.length; i += 3) if (b[i] + b[i + 1] + b[i + 2] > 0) b.set(blendNearest([b[i], b[i + 1], b[i + 2]], roles)[1], i);
    writeFileSync(pal, b);
    run('ffmpeg', [...src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '16x16', '-i', pal, '-frames:v', String(frames),
      '-filter_complex', `[0:v]${scale}[a];[a][1:v]paletteuse=dither=none:diff_mode=rectangle`, '-loop', '0', raw]);
    const tmp = join(dir, `try_${step.colors}.gif`);
    run('gifsicle', ['-O1', ...(step.lossy ? [`--lossy=${step.lossy}`] : []), raw, '-o', tmp]);
    const bytes = statSync(tmp).size;
    if (!best || bytes < best.bytes) best = { bytes, tmp, ...step };
    if (bytes <= SCENE.target) break;
  }
  copyFileSync(best.tmp, outFile);
  return best;
}

// file-level scene checks; m = manifest (--check) or null (record)
function sceneGifGates(story, file, gates, m) {
  const g = gifParse(file), bytes = statSync(file).size, n = Math.round(story.loop * story.fps), secs = g.frames.reduce((s, f) => s + f.delay, 0) / 100;
  gates.push(['gif-dims', g.width === SCENE.width && g.height === SCENE.height, `${g.width}x${g.height} (want ${SCENE.width}x${SCENE.height})`]);
  gates.push(['gif-frames', g.frames.length === n && Math.abs(secs - story.loop) <= SCENE.slack, `${g.frames.length} frames (want ${n}), ${secs.toFixed(2)} s (want ${story.loop.toFixed(2)} +-${SCENE.slack})`]);
  gates.push(['gif-size', bytes > SCENE.max ? false : bytes > SCENE.target ? 'warn' : true, `${(bytes / 1e3).toFixed(1)} KB (target ${SCENE.target / 1e3}, hard ${SCENE.max / 1e3})`]);
  const roles = roleRgb(story), black = (c) => c[0] + c[1] + c[2] === 0;
  const trans = new Set(g.frames.map((f) => f.trans).filter((k) => k >= 0)), used = new Set(), idx = g.frames.map((f) => (f.interlaced ? null : gifIndices(g, f)));
  idx.forEach((px, j) => px && px.forEach((k) => { if (k !== g.frames[j].trans) used.add(k); }));
  const local = g.frames.filter((f) => f.local).length, inter = g.frames.filter((f) => f.interlaced).length;
  const off = g.gct.map((c, k) => [k, c, blendDist(c, roles)]).filter(([k, c, dd]) => !trans.has(k) && !black(c) && dd > SCENE.tol);
  const blackUsed = [...used].filter((k) => black(g.gct[k]));
  gates.push(['gif-palette', !local && !inter && !off.length && !blackUsed.length, local || inter ? `${local} local tables, ${inter} interlaced frames`
    : off.length ? `off-palette: ${off.slice(0, 4).map(([k, c, dd]) => `#${k} ${hexOfRgb(c)} (${dd.toFixed(1)})`).join(', ')}${off.length > 4 ? ` +${off.length - 4}` : ''}`
      : blackUsed.length ? `#000 entries drawn (not padding): ${blackUsed.join(', ')}` : `${g.gct.length} global entries (${used.size} drawn), no local tables, each within RGB ${SCENE.tol} of a 2-role blend`]);
  // no loader row: frames after 0 never touch the top band; frame 0 draws only card bg + border there
  const f0 = g.frames[0], edge = [rgbOf(story.palette.bg[0]), rgbOf(story.palette[story.border][0])], high = g.frames.slice(1).map((f, j) => [j + 1, f.top]).filter(([, top]) => top < SCENE.band);
  const full = f0 && f0.left === 0 && f0.top === 0 && f0.w === g.width && f0.h === g.height && idx[0];
  let stray = 0;
  if (full) for (let y = 0; y < SCENE.band; y++) for (let x = 0; x < g.width; x++) if (blendDist(g.gct[idx[0][y * g.width + x]], edge) > SCENE.tol) stray++;
  const band = !!full && !high.length && !stray, mOk = !m || m.scene?.topBand === true;
  gates.push(['gif-no-loader', band && mOk, !full ? 'frame 0 is not a full-canvas frame' : high.length ? `frames reach above y ${SCENE.band}: ${high.slice(0, 4).map(([j, top]) => `#${j} top ${top}`).join(', ')}`
    : stray ? `${stray} px in frame 0 rows 0-${SCENE.band - 1} are neither card bg nor border` : !mOk ? 'manifest scene.topBand is not true: re-record'
      : `top ${SCENE.band} px: frame 0 card bg + border only, ${g.frames.length - 1} later frames start at y >= ${SCENE.band}${m ? ', manifest topBand true' : ''}`]);
  return { bytes, topBand: band };
}

async function recordScene(story, opt, gates) {
  const preview = opt.preview !== undefined, test = !!opt.out || preview;
  if (!test && gates.some((g) => g[1] === false)) return gates.push(['record', false, 'scene gates are red: fix them, or record a test GIF with --out <dir>']);
  const outDir = resolve(opt.out || (preview ? tmpdir() : dirname(GIF))), dir = mkdtempSync(join(tmpdir(), `bcm-${NAME}-`));
  mkdirSync(outDir, { recursive: true });
  const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true });
  const f = (k) => join(dir, `f_${String(k).padStart(4, '0')}.png`), scale = ['-vf', `scale=${SCENE.width}:-2:flags=area`];
  try {
    if (preview) {
      await capture(browser, [Number(opt.preview)], dir, '#scene');
      const p = join(outDir, `${NAME}_preview_${opt.preview}.png`);
      run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', f(0), ...scale, p]);
      return console.log(`preview ${p}`);
    }
    const n = Math.round(story.loop * story.fps), errors = await capture(browser, [...Array.from({ length: n }, (_, i) => i / story.fps), story.still], dir, '#scene');
    const outFile = test ? join(outDir, `${NAME}.gif`) : GIF, stillFile = test ? join(outDir, `${NAME}-still.png`) : STILL;
    const enc = encodeScene(dir, n, story.fps, outFile, roleRgb(story)), seam = ssim(f(n - 1), f(0));
    run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', f(n), ...scale, stillFile]);
    const { topBand } = sceneGifGates(story, outFile, gates, null);
    gates.push(['record-encode', true, encodeText(enc)]);
    gates.push(['record-seam', seam >= SEAM_MIN, `SSIM last-to-first ${seam.toFixed(4)} (min ${SEAM_MIN})`]);
    gates.push(['record-errors', errors.length === 0, errors.length ? errors.slice(0, 2).join(' | ') : '0 page errors']);
    const info = gifInfo(outFile);
    console.log(`${test ? 'TEST ' : ''}${outFile}: ${info.width}x${info.height}, ${info.seconds.toFixed(2)} s, ${info.frames} frames; still t=${story.still} -> ${stillFile}`);
    if (!test && gates.every((g) => g[1] !== false)) {
      copyFileSync(GIF, DOCS_GIF);
      const tools = { playwrightCore: PW_PIN, ffmpeg: ver('ffmpeg', ['-version'], /version (\S+)/), gifsicle: ver('gifsicle', ['--version'], /Gifsicle (\S+)/), node: process.version };
      const png = readFileSync(STILL);
      writeFileSync(MANIFEST, JSON.stringify({ gif: { file: `${NAME}.gif`, bytes: enc.bytes, sha256: sha(GIF), width: info.width, height: info.height, seconds: info.seconds, colors: enc.colors, lossy: enc.lossy || 0 },
        still: { file: `${NAME}-still.png`, sha256: sha(STILL), width: png.readUInt32BE(16), height: png.readUInt32BE(20), t: story.still },
        scene: { kind: story.scene, theme: story.theme, twin: story.twin, topBand }, sources: sourceHashes(story), tools, recorded: new Date().toISOString() }, null, 2) + '\n');
      console.log(`copied ${NAME}.gif to ${dirname(DOCS_GIF)}; manifest written; brewcode-app: copy ${NAME}.gif + ${NAME}-still.png to ${dirname(APP_GIF)}`);
    }
  } finally {
    await browser.close();
    if (opt.keep) console.log(`frames kept in ${dir}`); else rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const story = loadJs(STORY, 'PH_STORY');
  if (story.scene && (opt.embed || opt.width !== undefined)) die('a drawn scene has no captures and a fixed width: no --embed, no --width', 2);
  if (opt.embed) { writeFileSync(DATA, buildData(story, opt.captures)); console.log(`wrote ${DATA} from ${opt.captures}`); }
  const gates = [];
  if (story.scene) sceneGates(story, gates); else textGates(story, opt, gates);
  if (opt.check) gifGates(story, gates);
  else if (story.scene) await recordScene(story, opt, gates);
  else if (!opt.embed || opt.preview !== undefined) await record(story, opt, gates);
  for (const [g, ok, msg] of gates) console.log(`${ok === 'warn' ? 'WARN' : ok ? 'PASS' : 'FAIL'}  ${NAME}  ${g}: ${msg}`);
  process.exit(gates.some((g) => g[1] === false) ? 1 : 0);
}

main().catch((e) => die(e.stack || String(e)));
