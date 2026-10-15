#!/usr/bin/env node
// Records scenarios/<name>.json into assets/demos/<name>.gif: Playwright frames, ffmpeg palette, gifsicle, then gates.
// Usage: README.md. Needs playwright-core 1.64.0 (cwd or NODE_PATH), ffmpeg, gifsicle, Chrome.
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, statSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const OUT_DEFAULT = resolve(HERE, '..');
const PW_PIN = '1.64.0', WIDTH = 800, MAX_BYTES = 5_000_000, TARGET_BYTES = 2_500_000, MAX_SECONDS = 20.5, SEAM_MIN = 0.985, CAP_FPS = 20;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LADDER = [{ colors: 256 }, { colors: 128 }, { colors: 64 }, { colors: 48, lossy: 10 }, { colors: 32, lossy: 30 }];
// engine literals copied from a real Claude Code 2.1.300 session (cc-strings.capture.txt)
const CC_LITERALS = ['⏺', '⎿', 'Initializing…', 'Running…', '(ctrl+o to expand)', '(ctrl+b to run in background)', 'Done (', 'tool use', 'tokens)',
  '· done ', 'Claude Code v', 'Claude Max', '⏸ manual mode on', '(3s · ↓ 131 tokens)', 'Brewed for', '❯ '];
const require = createRequire(import.meta.url);
const { model, blocks } = require('./engine.js');

const die = (m, code = 1) => { console.error(m); process.exit(code); };
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

function parseArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check' || a === '--keep') opt[a.slice(2)] = true;
    else if (a === '--preview' || a === '--out') { if (i + 1 >= argv.length) die(`missing value for ${a}`, 2); opt[a.slice(2)] = argv[++i]; }
    else if (a.startsWith('--')) die(`unknown option ${a}`, 2);
    else pos.push(a);
  }
  const dir = join(HERE, 'scenarios');
  const all = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  const names = pos[0] === 'all' ? all : pos;
  if (!names.length || names.some((n) => !all.includes(n))) die('usage: node record.mjs <name|all> [--check] [--preview <t>] [--out dir] [--keep]\nscenarios: ' + all.join(', '), 2);
  return { names, opt };
}

const loadScenario = (n) => JSON.parse(readFileSync(join(HERE, 'scenarios', `${n}.json`), 'utf8'));

// ---------- text gates (no browser) ----------
function corpus(S) {
  const rowsText = new Set(), lines = [];
  const B = blocks(S);
  const times = new Set([0, S.duration - 0.01]);
  for (let t = 0; t < S.duration; t += 0.05) times.add(Math.round(t * 100) / 100);
  for (const t of times) {
    const M = model(S, t, B);
    for (const r of M.rows) {
      const txt = r.segs.map((s) => s[0]).join('');
      if (!rowsText.has(txt)) { rowsText.add(txt); lines.push({ t, txt, kind: 'row' }); }
    }
    if (M.card) for (const txt of M.card.text) if (!rowsText.has(txt)) { rowsText.add(txt); lines.push({ t, txt, kind: 'card' }); }
    for (const [k, txt] of [['caption', M.caption.text], ['chapter', M.chapter.label], ['chip', M.chip]]) if (txt && !rowsText.has(k + txt)) { rowsText.add(k + txt); lines.push({ t, txt, kind: k }); }
  }
  return lines;
}

function checkText(S, gates) {
  const maxCols = (S.layout && S.layout.maxCols) || 94;
  const lines = corpus(S);
  const long = lines.filter((l) => l.kind === 'row' && [...l.txt].length > maxCols);
  gates.push(['layout', long.length === 0, long.length ? `${long.length} rows > ${maxCols} cols, e.g. "${long[0].txt}" (${[...long[0].txt].length}) at ${long[0].t}s` : `all rows <= ${maxCols} cols`]);
  const cyr = lines.filter((l) => /[Ѐ-ӿ]/.test(l.txt));
  gates.push(['cyrillic', cyr.length === 0, cyr.length ? `Cyrillic in "${cyr[0].txt}"` : 'none']);
  const allow = (S.forbidAllow || []);
  let bad = [];
  for (const re of S.forbid || []) {
    const rx = new RegExp(re, 'i');
    for (const l of lines) { let x = l.txt; for (const a of allow) x = x.split(a).join(''); if (rx.test(x)) bad.push(`/${re}/ in "${l.txt}"`); }
  }
  gates.push(['banned-claim', bad.length === 0, bad.length ? bad.slice(0, 3).join(' | ') : `${(S.forbid || []).length} patterns, 0 hits`]);
  const cap = readFileSync(join(HERE, 'cc-strings.capture.txt'), 'utf8');
  const miss = CC_LITERALS.filter((s) => !cap.includes(s));
  gates.push(['source-strings(cc)', miss.length === 0, miss.length ? `not in real capture: ${miss.join(' | ')}` : `${CC_LITERALS.length} engine literals found in the real 2.1.300 capture`]);
  const subs = S.events.filter((e) => e.type === 'submit'), keys = S.events.filter((e) => e.type === 'key');
  const bare = subs.filter((u) => !keys.some((k) => k.at <= u.at && u.at - k.at <= 0.4));
  gates.push(['keycap-per-submit', bare.length === 0, bare.length ? `submit at ${bare.map((b) => b.at).join(', ')} s has no key beat within 0.4 s before` : `${subs.length} submits, each with a keycap beat`]);
  const cards = S.events.filter((e) => e.type === 'card');
  gates.push(['summary-card', cards.length === 1 && cards[0].at <= S.duration - 1.6, cards.length === 1 ? `1 card at ${cards[0].at} s, >= 1 s on screen before the end` : `${cards.length} cards (need exactly 1)`]);
  const stats = S.events.filter((e) => e.type === 'agent').map((e) => e.stats);
  const badStats = stats.filter((s) => !/^\d+ tool uses? · \d+(\.\d)?k tokens · (\d+m )?\d+s$/.test(s));
  gates.push(['agent-stats-format', badStats.length === 0, badStats.length ? `bad: ${badStats.join(' | ')}` : `${stats.length} agent stats match the real "N tool uses · Xk tokens · Ys"`]);
  const facts = S.facts || [], stale = [];
  for (const f of facts) {
    const p = join(ROOT, f.src);
    if (!existsSync(p) || !readFileSync(p, 'utf8').includes(f.has)) stale.push(`${f.src} lacks "${f.has}"`);
  }
  gates.push(['facts(source files)', stale.length === 0, stale.length ? `STALE: ${stale.slice(0, 3).join(' | ')}` : `${facts.length} strings present in the real skill/agent files`]);
  return { facts };
}

// ---------- tools ----------
function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.error || r.status !== 0) throw new Error(`${cmd} failed (rc ${r.status}): ${r.error || r.stderr.slice(-500)}`);
  return r.stderr;
}
const ssim = (a, b) => { const m = run('ffmpeg', ['-nostdin', '-v', 'info', '-i', a, '-i', b, '-lavfi', 'ssim', '-f', 'null', '-']).match(/All:([0-9.]+)/); return m ? Number(m[1]) : NaN; };
const ver = (cmd, args, re) => { const r = spawnSync(cmd, args, { encoding: 'utf8' }); return ((r.stdout || '') + (r.stderr || '')).match(re)?.[1] || 'unknown'; };

function loadPlaywright() {
  for (const base of [join(process.cwd(), 'noop.js'), fileURLToPath(import.meta.url)]) {
    try { const pw = createRequire(pathToFileURL(base).href); const v = pw('playwright-core/package.json').version; if (v !== PW_PIN) die(`playwright-core ${v} found, need exactly ${PW_PIN}`, 2); return pw('playwright-core'); } catch (e) { if (e.exitCode) throw e; }
  }
  return die(`playwright-core not found: cd "$(mktemp -d)" && npm i playwright-core@${PW_PIN} --no-package-lock, run from there`, 2);
}

// ---------- capture ----------
async function capture(browser, S, dir, opt) {
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(`window.SCENARIO = ${JSON.stringify(S)};`);
  await page.goto(pathToFileURL(join(HERE, 'shell.html')).href);
  await page.addScriptTag({ path: join(HERE, 'engine.js') });
  await page.evaluate(() => document.fonts.ready);
  const font = await page.evaluate(() => document.fonts.check('13px "JetBrains Mono"') && getComputedStyle(document.body).fontFamily);
  if (!font) throw new Error('JetBrains Mono not available to Chrome');
  const height = await page.evaluate(() => { window.demo.render(0); return Math.ceil(document.body.getBoundingClientRect().height) + 2; });
  const clip = { x: 0, y: 0, width: WIDTH, height: height % 2 ? height + 1 : height };
  if (opt.preview !== undefined) {
    const t = Number(opt.preview); await page.evaluate((x) => window.demo.render(x), t);
    const f = join(opt.outAbs, `${S.name}_preview_${t}.png`); await page.screenshot({ path: f, clip }); await ctx.close(); return { preview: f };
  }
  const n = Math.round(S.duration * CAP_FPS), kept = [];
  let prev = null, overflow = 0, first = null, last = null;
  for (let k = 0; k < n; k++) {
    const r = await page.evaluate((t) => window.demo.render(t), k / CAP_FPS);
    overflow += r.overflow;
    const buf = await page.screenshot({ clip });
    const h = createHash('sha1').update(buf).digest('hex');
    if (k === 0) first = buf;
    last = buf;
    if (h === prev) kept[kept.length - 1].dur += 1 / CAP_FPS;
    else { const f = join(dir, `f_${String(kept.length).padStart(4, '0')}.png`); writeFileSync(f, buf); kept.push({ f, dur: 1 / CAP_FPS }); prev = h; }
  }
  writeFileSync(join(dir, 'first.png'), first); writeFileSync(join(dir, 'last.png'), last);
  await ctx.close();
  return { kept, errors, overflow, frames: n };
}

function encode(dir, kept, outFile, S) {
  const list = join(dir, 'frames.txt');
  const cs = kept.map((k) => Math.max(2, Math.round(k.dur * 100)));
  writeFileSync(list, kept.map((k, i) => `file '${k.f}'\nduration ${cs[i] / 100}`).join('\n') + `\nfile '${kept[kept.length - 1].f}'\n`);
  const raw = join(dir, 'raw.gif');
  let best = null;
  for (const step of LADDER) {
    run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-fps_mode', 'vfr',
      '-vf', `scale=${WIDTH}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=${step.colors}:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`, '-loop', '0', raw]);
    const tmp = join(dir, `try_${step.colors}.gif`);
    run('gifsicle', ['-O3', ...(step.lossy ? [`--lossy=${step.lossy}`] : []), raw, '-o', tmp]);
    const bytes = statSync(tmp).size;
    if (!best || bytes < best.bytes) best = { bytes, tmp, ...step };
    if (bytes <= (S.targetBytes || TARGET_BYTES)) break;
  }
  copyFileSync(best.tmp, outFile);
  return best;
}

function gifInfo(file) {
  const b = readFileSync(file);
  let total = 0, frames = 0;
  for (let i = 0; i < b.length - 7; i++) if (b[i] === 0x21 && b[i + 1] === 0xf9 && b[i + 2] === 0x04) { total += b.readUInt16LE(i + 4); frames++; }
  return { width: b.readUInt16LE(6), height: b.readUInt16LE(8), seconds: total / 100, frames };
}

async function main() {
  const { names, opt } = parseArgs(process.argv.slice(2));
  const manifestPath = join(HERE, 'manifest.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { demos: {} };
  let failed = 0;
  const outDir = resolve(opt.out || OUT_DEFAULT);
  mkdirSync(outDir, { recursive: true });
  opt.outAbs = outDir;
  const pw = opt.check ? null : loadPlaywright();
  const browser = pw ? await pw.chromium.launch({ executablePath: CHROME, headless: true }) : null;
  for (const name of names) {
    const S = loadScenario(name), gates = [];
    const { facts } = checkText(S, gates);
    const hashes = Object.fromEntries([...new Set(facts.map((f) => f.src))].map((s) => [s, existsSync(join(ROOT, s)) ? sha(join(ROOT, s)) : null]));
    const old = manifest.demos[name];
    if (opt.check && old) { const drift = Object.keys(hashes).filter((s) => old.sources[s] !== hashes[s]); gates.push(['manifest-hash', drift.length === 0, drift.length ? `source changed since last record: ${drift.join(', ')}` : 'sources unchanged since last record']); }
    let gif = null;
    if (!opt.check && gates.every((g) => g[1])) {
      const dir = mkdtempSync(join(tmpdir(), 'bcdemo-'));
      try {
        const cap = await capture(browser, S, dir, opt);
        if (cap.preview) { console.log(`${name}: preview ${cap.preview}`); continue; }
        const outFile = join(outDir, `${name}.gif`);
        const enc = encode(dir, cap.kept, outFile, S);
        const info = gifInfo(outFile);
        const seam = ssim(join(dir, 'last.png'), join(dir, 'first.png')), step = ssim(join(dir, 'first.png'), cap.kept[1] ? cap.kept[1].f : join(dir, 'first.png'));
        gates.push(['bytes', enc.bytes <= MAX_BYTES, `${enc.bytes} B (hard ${MAX_BYTES}, target ${S.targetBytes || TARGET_BYTES}${enc.bytes > TARGET_BYTES ? ' EXCEEDED' : ''}) colors ${enc.colors}${enc.lossy ? ' lossy ' + enc.lossy : ''}`]);
        gates.push(['width', info.width === WIDTH, `${info.width}x${info.height}`]);
        gates.push(['duration', info.seconds <= MAX_SECONDS, `${info.seconds.toFixed(2)} s, ${info.frames} frames kept of ${cap.frames}`]);
        gates.push(['seam-ssim', seam >= SEAM_MIN, `${seam.toFixed(4)} (min ${SEAM_MIN}); first-to-second step ${step.toFixed(4)} (info)`]);
        gates.push(['page-errors', cap.errors.length === 0, cap.errors.length ? cap.errors.slice(0, 2).join(' | ') : '0']);
        gates.push(['row-overflow', cap.overflow === 0, `${cap.overflow} clipped rows over ${cap.frames} frames`]);
        gif = { file: `${name}.gif`, bytes: enc.bytes, sha256: sha(outFile), width: info.width, seconds: info.seconds };
        manifest.demos[name] = { gif, sources: hashes, ccVersion: S.meta.version, recorded: new Date().toISOString() };
      } catch (e) { gates.push(['record', false, e.message]); }
      finally { if (opt.keep) console.log(`${name}: frames kept in ${dir}`); else rmSync(dir, { recursive: true, force: true }); }
    }
    for (const [g, ok, msg] of gates) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${g}: ${msg}`);
    if (gates.some((g) => !g[1])) failed++;
  }
  if (browser) await browser.close();
  if (!opt.check && !opt.preview) {
    manifest.tools = { playwrightCore: PW_PIN, ffmpeg: ver('ffmpeg', ['-version'], /version (\S+)/), gifsicle: ver('gifsicle', ['--version'], /Gifsicle (\S+)/), node: process.version };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => die(e.stack || String(e)));
