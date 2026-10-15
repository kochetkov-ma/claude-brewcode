#!/usr/bin/env node
// Records placeholders.html (#hero, ?t= frames) into ../placeholders.gif; --check = all gates, no Chrome. Usage: README.md.
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
const PAGE = join(HERE, 'placeholders.html'), STORY = join(HERE, 'placeholders.story.js'), DATA = join(HERE, 'placeholders.data.js');
const MANIFEST = join(HERE, 'manifest.json');
const GIF = resolve(HERE, '../placeholders.gif'), DOCS_GIF = join(ROOT, 'web/docs/public/brewmods/placeholders.gif');
const APP_GIF = join(process.env.BREWCODE_APP_DIR || resolve(ROOT, '../brewcode-app'), 'site/main/public/mods/placeholders.gif');
const PW_PIN = '1.64.0', WIDTH = 800, VIEWPORT = 1200, MIN_S = 30, MAX_S = 38, MAX_SECONDS = 40;
const TARGET_BYTES = 3_500_000, MAX_BYTES = 5_000_000, SEAM_MIN = 0.985;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LADDER = [{ colors: 256 }, { colors: 128 }, { colors: 96 }, { colors: 64 }, { colors: 96, lossy: 20 }, { colors: 64, lossy: 20 }, { colors: 48, lossy: 10 }, { colors: 32, lossy: 30 }];
// real macOS keys, "glyph word" as drawn on the keycap (design-b §2.8, design-b2 §3)
const KEY_ALLOW = ['⌃X ctrl+x', '⇥ tab', '⏎ enter', '⎋ esc', '↑ ', '↓ ', '← ', '→ ', '⌫ delete', '⇧⇥ shift+tab', '⌃O ctrl+o'];
const BANNED = [/hover/i, /2\.1\.296/, /\(esc to interrupt ·/, /attached as hidden context/, /[Ѐ-ӿ]/, /\(global\) as drafted|do not ask where/];
const BANNED_STORY = [/⌘|\bcmd\b|command\+|\boption\b|\balt\+|\bmeta\+|backspace/i];
// error rows fail the GIF; the band's own unknown-name notice only warns (it is real while a name is new)
const ERROR_ROW = /no matches found|command not found|Traceback|\b[A-Z]\w*Error\b|^\s*Error:/, NOTICE_ROW = /unknown placeholder/;
const PRIVATE = [/\/Users\//, /\/private\//, /Debug mode/, /SessionStart:/, /tmux focus-events/, /Plugins updated|reload-plugins/];

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
    else if (['--preview', '--out', '--captures'].includes(a)) { if (i + 1 >= argv.length) die(`missing value for ${a}`, 2); opt[a.slice(2)] = argv[++i]; }
    else if (a.startsWith('--')) die(`unknown option ${a}`, 2);
    else pos.push(a);
  }
  if (pos.length !== 1 || pos[0] !== 'placeholders') die('usage: node record-gifs.mjs placeholders [--check] [--embed] [--preview <t>] [--out dir] [--captures dir] [--keep]', 2);
  opt.captures = resolve(opt.captures || join(HERE, 'placeholders.captures'));
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

// ---------- placeholders.data.js: generated from the captures, TODO-CAPTURE:<beat> where one is missing ----------
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
  return '// Generated by record-gifs.mjs --embed from placeholders.captures/; edit the captures, never this file.\n'
    + `window.PH_SCREENS = {\n${out.join('\n')}\n};\n`;
}

// ---------- gates: [name, true|false|'warn', message] ----------
function textGates(story, opt, gates) {
  gates.push(['story-loop', story.loop >= MIN_S && story.loop <= MAX_S && story.end < story.loop, `${story.loop} s loop (window ${MIN_S}-${MAX_S}), end card from ${story.end} s`]);
  const badKeys = story.keys.filter((k) => !KEY_ALLOW.includes(`${k.glyph} ${k.word}`));
  gates.push(['keycaps', badKeys.length === 0, badKeys.length ? `not a real macOS keycap: ${badKeys.map((k) => `"${k.glyph} ${k.word}" at ${k.at}s`).join(', ')}`
    : `${story.keys.length} keycaps, all in the macOS allow-list: ${uniq(story.keys.map((k) => `${k.glyph} ${k.word}`.trim())).join(' | ')}`]);
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
  const missing = got.filter((f) => !(data[f.screen].lines.map((l) => plain(l).trimEnd()).join('\n') + '\n').includes(f.has));
  gates.push(['facts', missing.length === 0 && got.length === facts.length, missing.length ? `not on screen: ${missing.map((f) => `${f.screen} lacks "${f.has}" (${f.why})`).join(' | ')}`
    : `${got.length}/${facts.length} facts checked${got.length < facts.length ? `, ${facts.length - got.length} wait for captures` : ''}`]);
  const fresh = buildData(story, opt.captures) === dataSrc;
  gates.push(['data-fresh', fresh, fresh ? `placeholders.data.js matches ${opt.captures}` : 'placeholders.data.js differs from the captures: run --embed']);
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
      for (const re of PRIVATE) if (re.test(l)) priv.push(`${n}: ${re}`);
      for (const re of BANNED) if (re.test(l)) ban.push(`${n}: ${re}`);
      if (ERROR_ROW.test(l)) errRows.push(`${n}: "${l.trim().slice(0, 60)}"`);
      if (NOTICE_ROW.test(l)) noticeRows.push(`${n}: "${l.trim().slice(0, 40)}"`);
      const v = l.match(/Claude Code v(\d+\.\d+\.\d+)/); if (v) vers.add(v[1]);
    }
    if (story.typing.some((ty) => ty.on === n) && !txt.some((l, i) => i > 0 && l.startsWith('❯') && /^─{8,}$/.test(txt[i - 1].trim()))) noPrompt.push(n);
  }
  gates.push(['captures-size', dims.length === 0, dims.length ? `not ${cols}x${rows}: ${dims.slice(0, 4).join(', ')}` : `${shot.length} captures at ${cols}x${rows}`]);
  gates.push(['captures-parse', parse.length === 0, parse.length ? `ANSI text != .txt for: ${parse.join(', ')}` : 'ANSI rows equal the plain captures']);
  gates.push(['captures-private', priv.length === 0, priv.length ? uniq(priv).slice(0, 4).join(' | ') : 'no home paths, tmp paths, debug, hook or plugin-update rows']);
  gates.push(['captures-banned', ban.length === 0, ban.length ? uniq(ban).slice(0, 4).join(' | ') : 'no hover, 2.1.296, spinner esc hint, invented context row, Cyrillic, old dialog wording']);
  gates.push(['captures-errors', errRows.length === 0, errRows.length ? uniq(errRows).slice(0, 4).join(' | ') : 'no error rows (shell, Traceback, *Error)']);
  gates.push(['captures-notices', noticeRows.length === 0 ? true : 'warn', noticeRows.length ? uniq(noticeRows).join(' | ') : 'no unknown-placeholder rows']);
  gates.push(['captures-version', vers.size <= 1, `Claude Code ${[...vers].join(', ') || '(no header in view)'}`]);
  gates.push(['captures-prompt-row', noPrompt.length === 0, noPrompt.length ? `typing overlay has no ❯ row under a rule in: ${noPrompt.join(', ')}` : `${typed} of ${story.typing.length} typing screens captured, each has its prompt row`]);
}

function gifInfo(file) {
  const b = readFileSync(file);
  let total = 0, frames = 0;
  for (let i = 13; i < b.length - 7; i++) if (b[i] === 0x21 && b[i + 1] === 0xf9 && b[i + 2] === 0x04 && b[i + 7] === 0x00) { total += b.readUInt16LE(i + 4); frames++; }
  return { width: b.readUInt16LE(6), height: b.readUInt16LE(8), seconds: total / 100, frames };
}
const sourceHashes = () => Object.fromEntries([PAGE, STORY, DATA, fileURLToPath(import.meta.url)].map((p) => [p.slice(HERE.length + 1), existsSync(p) ? sha(p) : null]));

function gifGates(gates) {
  if (!existsSync(GIF)) { gates.push(['gif', false, `missing ${GIF}`]); return; }
  const info = gifInfo(GIF), bytes = statSync(GIF).size;
  gates.push(['gif-duration', info.seconds >= MIN_S && info.seconds <= MAX_S, `${info.seconds.toFixed(2)} s (window ${MIN_S}-${MAX_S}), ${info.frames} frames`]);
  gates.push(['gif-width', info.width === WIDTH, `${info.width}x${info.height}`]);
  gates.push(['gif-size', bytes > MAX_BYTES ? false : bytes > TARGET_BYTES ? 'warn' : true, `${(bytes / 1e6).toFixed(2)} MB (target ${TARGET_BYTES / 1e6}, hard ${MAX_BYTES / 1e6})`]);
  const m = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : null, cur = sourceHashes();
  const drift = m ? Object.keys(cur).filter((k) => m.sources[k] !== cur[k]) : [];
  const ok = !!m && m.gif.sha256 === sha(GIF) && drift.length === 0;
  gates.push(['gif-recorded', ok, !m ? 'no manifest.json: placeholders.gif was not recorded from these sources' : m.gif.sha256 !== sha(GIF) ? 'placeholders.gif sha != manifest (re-encoded or replaced by hand)'
    : drift.length ? `sources changed since the recording: ${drift.join(', ')}` : `recorded ${m.recorded} from the current sources`]);
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

async function capture(browser, times, dir) {
  // viewport taller than #hero (88x40 window + caption = 947 px), else the screenshot clip drops the caption
  const ctx = await browser.newContext({ viewport: { width: VIEWPORT, height: 1100 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const base = pathToFileURL(PAGE).href;
  let clip = null;
  for (let k = 0; k < times.length; k++) {
    await page.goto(`${base}?t=${Math.round(times[k] * 10000) / 10000}`, { waitUntil: k === 0 ? 'networkidle' : 'load' });
    await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
    if (!clip) {
      if (!(await page.evaluate(() => document.fonts.check('14px "JetBrains Mono"')))) throw new Error('JetBrains Mono not loaded (network for Google Fonts?)');
      clip = await page.locator('#hero').boundingBox();
      if (!clip) throw new Error('#hero not found');
      if (clip.y + clip.height > 1100) throw new Error(`#hero bottom ${clip.y + clip.height}px is below the 1100px viewport`);
    }
    await page.screenshot({ path: join(dir, `f_${String(k).padStart(4, '0')}.png`), clip });
  }
  await ctx.close();
  return errors;
}

function encode(dir, frames, fps, outFile) {
  const raw = join(dir, 'raw.gif');
  let best = null;
  for (const step of LADDER) {
    run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-framerate', String(fps), '-i', join(dir, 'f_%04d.png'), '-frames:v', String(frames),
      '-vf', `scale=${WIDTH}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=${step.colors}:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`, '-loop', '0', raw]);
    const tmp = join(dir, `try_${step.colors}.gif`);
    run('gifsicle', ['-O3', ...(step.lossy ? [`--lossy=${step.lossy}`] : []), raw, '-o', tmp]);
    const bytes = statSync(tmp).size;
    if (!best || bytes < best.bytes) best = { bytes, tmp, ...step };
    if (bytes <= TARGET_BYTES) break;
  }
  copyFileSync(best.tmp, outFile);
  return best;
}

async function record(story, opt, gates) {
  const preview = opt.preview !== undefined, test = !!opt.out || preview;
  if (!test && gates.some((g) => g[1] === false)) return gates.push(['record', false, 'text gates are red: fix them, or record a test GIF with --out <dir>']);
  const outDir = resolve(opt.out || (preview ? tmpdir() : dirname(GIF))), dir = mkdtempSync(join(tmpdir(), 'bcm-ph-'));
  mkdirSync(outDir, { recursive: true });
  const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const f = (k) => join(dir, `f_${String(k).padStart(4, '0')}.png`);
    if (preview) {
      await capture(browser, [Number(opt.preview)], dir);
      const p = join(outDir, `placeholders_preview_${opt.preview}.png`);
      run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', f(0), '-vf', `scale=${WIDTH}:-2:flags=lanczos`, p]);
      return console.log(`preview ${p}`);
    }
    const n = Math.round(story.loop * story.fps);
    if (n / story.fps > MAX_SECONDS) return gates.push(['record', false, `${n / story.fps} s is over the ${MAX_SECONDS} s cap`]);
    const times = Array.from({ length: n }, (_, i) => i / story.fps);
    const errors = await capture(browser, [...times, story.still], dir);
    const outFile = test ? join(outDir, 'placeholders.gif') : GIF;
    const enc = encode(dir, n, story.fps, outFile), info = gifInfo(outFile);
    const seam = ssim(f(n - 1), f(0)), still = join(test ? outDir : tmpdir(), 'placeholders-still.png');
    run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', f(n), '-vf', `scale=${WIDTH}:-2:flags=lanczos`, still]);
    gates.push(['record-bytes', enc.bytes <= MAX_BYTES, `${(enc.bytes / 1e6).toFixed(2)} MB, colors ${enc.colors}${enc.lossy ? ` lossy ${enc.lossy}` : ''}${enc.bytes > TARGET_BYTES ? ' (over target)' : ''}`]);
    gates.push(['record-seam', seam >= SEAM_MIN, `SSIM last-to-first ${seam.toFixed(4)} (min ${SEAM_MIN})`]);
    gates.push(['record-errors', errors.length === 0, errors.length ? errors.slice(0, 2).join(' | ') : '0 page errors']);
    console.log(`${test ? 'TEST ' : ''}${outFile}: ${info.width}x${info.height}, ${info.seconds.toFixed(2)} s, ${info.frames} frames; still t=${story.still} -> ${still}`);
    if (!test && gates.every((g) => g[1] !== false)) {
      copyFileSync(GIF, DOCS_GIF);
      const vers = uniq(Object.values(loadJs(DATA, 'PH_SCREENS')).flatMap((s) => (typeof s === 'object' ? s.lines.map(plain) : [])).map((l) => l.match(/Claude Code v(\S+)/)?.[1]).filter(Boolean));
      const tools = { playwrightCore: PW_PIN, ffmpeg: ver('ffmpeg', ['-version'], /version (\S+)/), gifsicle: ver('gifsicle', ['--version'], /Gifsicle (\S+)/), node: process.version };
      writeFileSync(MANIFEST, JSON.stringify({ gif: { file: 'placeholders.gif', bytes: enc.bytes, sha256: sha(GIF), width: info.width, height: info.height, seconds: info.seconds },
        sources: sourceHashes(), ccVersion: vers.join(', ') || 'unknown', still: story.still, tools, recorded: new Date().toISOString() }, null, 2) + '\n');
      console.log(`copied to ${DOCS_GIF}; manifest written; copy it + the still to ${dirname(APP_GIF)}`);
    }
  } finally {
    await browser.close();
    if (opt.keep) console.log(`frames kept in ${dir}`); else rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const story = loadJs(STORY, 'PH_STORY');
  if (opt.embed) { writeFileSync(DATA, buildData(story, opt.captures)); console.log(`wrote ${DATA} from ${opt.captures}`); }
  const gates = [];
  textGates(story, opt, gates);
  if (opt.check) gifGates(gates);
  else if (!opt.embed || opt.preview !== undefined) await record(story, opt, gates);
  for (const [g, ok, msg] of gates) console.log(`${ok === 'warn' ? 'WARN' : ok ? 'PASS' : 'FAIL'}  placeholders  ${g}: ${msg}`);
  process.exit(gates.some((g) => g[1] === false) ? 1 : 0);
}

main().catch((e) => die(e.stack || String(e)));
