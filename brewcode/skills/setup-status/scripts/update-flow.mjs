#!/usr/bin/env node
// Update-flow core of plugin-update and setup-status: version diff, release notes between versions, offers, report.
// Usage: update-flow.mjs latest | plan <dir> --mode update|check|all | report <dir>; exit 0 ok, 1 degraded, 2 usage.
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKET = 'claude-brewcode';
const NON_MARKET = new Set(['inline', 'skills-dir', 'synced']);
const MODES = ['update', 'check', 'all'];
const SCOPES = ['user', 'managed', 'project', 'local'];
const HEADING = /^(#{1,6}\s|---\s*$)/;
const REF = join(dirname(fileURLToPath(import.meta.url)), '..', 'references', 'update-flow.md');
const USAGE = 'usage: update-flow.mjs latest | plan <dir> --mode update|check|all | report <dir>';

function ver(v) {
  const m = typeof v === 'string' ? v.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/) : null;
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
}

// -1/0/1, or null when either side is not a version ("unknown").
function cmp(a, b) {
  const x = ver(a), y = ver(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

const known = v => (ver(v) ? v.trim().replace(/^v/, '') : null);
const atLeast = (a, b) => [0, 1].includes(cmp(a, b));
const behind = (installed, latest) => latest !== null && !atLeast(installed, latest);
const isDir = p => { try { return typeof p === 'string' && statSync(p).isDirectory(); } catch { return false; } };
const real = p => { try { return realpathSync(p); } catch { return p; } };
function read(file) { try { return file ? readFileSync(file, 'utf8') : null; } catch { return null; } }
function json(text) { try { return JSON.parse(text); } catch { return null; } }
function split(id) { const at = id.lastIndexOf('@'); return at < 0 ? [id, ''] : [id.slice(0, at), id.slice(at + 1)]; }
const ours = r => split(r.id)[1] === MARKET;
const foreign = r => { const m = split(r.id)[1]; return m !== '' && m !== MARKET && !NON_MARKET.has(m); };
const suite = rows => new Set(rows.filter(ours).map(r => split(r.id)[0]));
const scopeRank = s => (SCOPES.includes(s) ? SCOPES.indexOf(s) : SCOPES.length);
const keyOf = r => `${r.scope}\u0000${r.projectPath ?? ''}`;
const byPlace = (a, b) => scopeRank(a.scope) - scopeRank(b.scope) || String(a.projectPath ?? '').localeCompare(String(b.projectPath ?? ''));
const versionsIn = rows => rows.map(r => known(r.version)).filter(Boolean).sort(cmp);
const versionsOf = (rows, name) => versionsIn(rows.filter(r => r.id === `${name}@${MARKET}`));

/** Parses the single json fence of references/update-flow.md section 3, the data single source. */
export function loadData(text = readFileSync(REF, 'utf8')) {
  const m = text.replace(/\r\n?/g, '\n').match(/^```json\n([\s\S]*?)\n```$/m);
  if (!m) throw new Error('update-flow.md: no json data block');
  return JSON.parse(m[1]);
}

const names = data => [...data.mods, ...data.plugins].map(x => x.name);

// `claude plugin list --json` array or `discover-plugins.sh` object -> rows; anything else -> null (inventory unknown).
function rowsOf(value) {
  if (Array.isArray(value)) {
    return value.filter(r => r && typeof r.id === 'string').map(r => ({
      id: r.id, version: typeof r.version === 'string' ? r.version : 'unknown', scope: r.scope || 'user', projectPath: r.projectPath || null }));
  }
  if (value && typeof value === 'object' && !value.error && value.installed && typeof value.installed === 'object') {
    return Object.entries(value.installed).map(([name, v]) => ({
      id: `${name}@${v && v.marketplace}`, version: (v && v.version) || 'unknown', scope: 'user', projectPath: null }));
  }
  return null;
}

// `latest` output, or the flat fetch-latest-versions.sh map; null when unusable or when no entry is a real version (all "unknown").
function latestOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.error) return null;
  const nested = value.versions && typeof value.versions === 'object';
  if (!Object.values(nested ? value.versions : value).some(v => known(v))) return null;
  if (nested) return { versions: value.versions, autoUpdate: typeof value.autoUpdate === 'boolean' ? value.autoUpdate : null, notes: value.notes || null };
  return { versions: value, autoUpdate: null, notes: null };
}

function marketplace(env) {
  const root = env.CLAUDE_CODE_PLUGIN_CACHE_DIR || join(env.CLAUDE_CONFIG_DIR || join(env.HOME || homedir(), '.claude'), 'plugins');
  const entry = (json(read(join(root, 'known_marketplaces.json'))) || {})[MARKET];
  const loc = entry && typeof entry.installLocation === 'string' ? entry.installLocation : null;
  if (!isDir(loc)) return null;
  const notes = join(loc, 'RELEASE-NOTES.md');
  return { installLocation: loc, autoUpdate: entry.autoUpdate === true, notes: existsSync(notes) ? notes : null };
}

// Bullets after a bold label: stop at the first non-empty non-bullet line after a bullet, or a heading.
function bulletsAfter(lines, start) {
  const bullets = [];
  let requirement = null;
  for (const line of lines.slice(start + 1)) {
    if (HEADING.test(line)) break;
    if (line.startsWith('- ')) { bullets.push(line.slice(2).trim()); continue; }
    if (!line.trim()) continue;
    if (bullets.length) break;
    if (requirement === null && line.startsWith('❗')) requirement = line.replace(/^❗\s*/, '').trim();
  }
  return { bullets, requirement };
}

function parseSection({ version, lines }) {
  const block = lines.findIndex(l => l.trim() === '**What changed for you**');
  const mig = lines.findIndex(l => l.trim() === '**Migration:**');
  const migration = mig < 0 ? [] : bulletsAfter(lines, mig).bullets;
  if (block >= 0) return { version, ...bulletsAfter(lines, block), migration, fallback: false };
  const end = lines.findIndex(l => HEADING.test(l));
  const plain = lines.slice(0, end < 0 ? lines.length : end).find(l => l.trim() && !/^[\s>#\-*|!`<]/.test(l));
  return { version, bullets: plain ? [plain.trim()] : [], requirement: null, migration, fallback: true };
}

/** Notes for versions in (from, to], newest first, capped per version and in total; ❗ kept once, newest.
 *  A block bullet repeated as a migration bullet of its version shows once, as the migration. */
export function releaseNotes(text, from, to, { source = null, link = null, caps = { perVersion: 3, total: 10 } } = {}) {
  const empty = { source: null, requirement: null, migration: [], versions: [], hidden: 0, missing: false, link };
  const c = cmp(from, to);
  if (c === null || c >= 0) return empty;
  if (typeof text !== 'string') return { ...empty, missing: true };
  const sections = [];
  let cur = null;
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const h = line.match(/^## v(\d+\.\d+\.\d+)(?:\s|$)/);
    if (h) { cur = { version: h[1], lines: [] }; sections.push(cur); } else if (line.startsWith('## ')) cur = null; else if (cur) cur.lines.push(line);
  }
  const range = sections.filter(s => cmp(s.version, from) === 1 && cmp(s.version, to) !== 1).sort((a, b) => cmp(b.version, a.version)).map(parseSection);
  if (!range.length) return { ...empty, source, missing: true };
  let left = caps.total, hidden = 0;
  const versions = range.map(s => {
    const own = s.bullets.filter(b => !s.migration.includes(b));
    const bullets = own.slice(0, Math.min(caps.perVersion, left));
    left -= bullets.length;
    hidden += own.length - bullets.length;
    return { version: s.version, bullets, count: s.bullets.length, fallback: s.fallback };
  });
  return {
    source, requirement: range.find(s => s.requirement)?.requirement ?? null,
    migration: range.flatMap(s => s.migration.map(t => ({ version: s.version, text: t }))),
    // No section at or above `to`: the clone is older than latest; `versions` keeps what it has.
    versions, hidden, missing: !sections.some(s => cmp(s.version, to) !== -1), link,
  };
}

/** Per-row status updated|installed|current|behind|unknown|not-installed; after null -> check. A null latest is `unknown`, never current. */
export function diff(before, after, versions, data = loadData()) {
  const out = [];
  for (const name of names(data)) {
    const id = `${name}@${MARKET}`, latest = known((versions || {})[name]);
    const b = (before || []).filter(r => r.id === id), a = (after || []).filter(r => r.id === id);
    const places = [...new Map([...b, ...a].map(r => [keyOf(r), r])).values()].sort(byPlace);
    if (!places.length) out.push({ name, id, scope: null, projectPath: null, before: null, after: null, latest, status: 'not-installed' });
    for (const p of places) {
      const br = b.find(r => keyOf(r) === keyOf(p)), ar = a.find(r => keyOf(r) === keyOf(p));
      const row = { name, id, scope: p.scope, projectPath: p.projectPath, before: br ? br.version : null, after: ar ? ar.version : null, latest };
      if (!after) row.status = latest === null ? 'unknown' : behind(row.before, latest) ? 'behind' : 'current';
      else if (!br) row.status = 'installed';
      else if (!ar) row.status = 'behind';
      else row.status = latest === null ? 'unknown' : behind(row.after, latest) ? 'behind' : row.after !== row.before ? 'updated' : 'current';
      out.push(row);
    }
  }
  // Other marketplaces: only rows that changed (updated by `all`), named by full id.
  for (const ar of (after || []).filter(foreign).sort((x, y) => x.id.localeCompare(y.id) || byPlace(x, y))) {
    const br = (before || []).find(r => r.id === ar.id && keyOf(r) === keyOf(ar));
    if (br && br.version === ar.version) continue;
    out.push({ name: ar.id, id: ar.id, scope: ar.scope, projectPath: ar.projectPath, before: br ? br.version : null, after: ar.version, latest: null, status: br ? 'updated' : 'installed' });
  }
  return out;
}

function fired(rows, versions, data) {
  const have = suite(rows);
  return data.migrations.filter(m => have.has(m.plugin) && !have.has(m.needsAbsent)).map(m => ({
    needsAbsent: m.needsAbsent,
    migration: { id: m.id, crossed: cmp(versionsOf(rows, m.plugin)[0], m.crossedAt) === -1 && atLeast((versions || {})[m.plugin], m.crossedAt),
      message: m.message, docsUrl: m.docsUrl },
  }));
}

/** Install offers: mods only when Claude Code >= ccMin (cc from `claude --version`), missing suite plugins always. */
export function offers(rows, versions, ccText, data = loadData()) {
  const cc = (typeof ccText === 'string' && ccText.match(/\d+\.\d+\.\d+/)?.[0]) || null;
  const ccOk = atLeast(cc, data.ccMin);
  const have = suite(rows);
  const moved = fired(rows, versions, data);
  return {
    ccOk, cc, ccMin: data.ccMin,
    mods: ccOk ? data.mods.filter(x => !have.has(x.name))
      .map(x => ({ name: x.name, value: x.value, migration: moved.find(f => f.needsAbsent === x.name)?.migration ?? null })) : [],
    plugins: data.plugins.filter(x => !have.has(x.name)).map(x => ({ name: x.name, value: x.value })),
  };
}

// Port of the my-claude REFRESH scan fence (SKILL.md "Stale rule"); the golden test in tests/update-flow.mjs runs the fence on the same INDEX.
const guideKey = r => {
  const p = String(r.path || '');
  if (r.mode === 'internal') return 'internal';
  if (r.mode === 'external') return /_context-schema\.md$/.test(p) ? 'external/context-schema' : 'external';
  const m = r.mode === 'research' && /_research-([^/]+)\.md$/.exec(p);
  return m ? `research/${m[1]}` : '';
};

function guideFront(text) {
  const out = {};
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  for (const l of m ? m[1].split(/\r?\n/) : []) {
    const kv = /^([A-Za-z_]+):[ \t]*(.*)$/.exec(l);
    if (kv) { const v = kv[2].trim(); out[kv[1]] = /^(["']).*\1$/.test(v) ? v.slice(1, -1) : v; }
  }
  return out;
}

const dotted = v => String(v).split('.').map(n => parseInt(n, 10) || 0);

function olderThan(a, b) {
  const x = dotted(a), y = dotted(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  return false;
}

/** Verdict per guide key as `/brewdoc:my-claude <prompt>` scans it against `version` (installed brewdoc), scan order: [{ verdict, key, path, doc }]. */
export function guideVerdicts(root, version, { prompt = 'refresh', home = homedir() } = {}) {
  const text = read(join(root, '.claude', 'brewdoc', 'INDEX.jsonl'));
  if (text === null || !ver(version)) return [];
  const newest = new Map();
  for (const line of text.split('\n')) {
    const row = json(line);
    const key = row && guideKey(row);
    if (key && !(newest.has(key) && String(newest.get(key).ts ?? '') > String(row.ts ?? ''))) newest.set(key, row);
  }
  const words = String(prompt || '').toLowerCase().split(/[\s,;]+/);
  return [...newest].map(([key, row]) => {
    const path = String(row.path);
    const body = read(path.startsWith('~/') ? join(home, path.slice(2)) : resolve(root, path));
    const fm = body === null ? {} : guideFront(body);
    const v = fm.version;
    const slug = key.startsWith('research/') ? key.slice(9).toLowerCase() : '';
    const named = words.includes(slug) || words.includes(`research-${slug}`);
    const verdict = slug && !named ? 'SKIP' : body === null ? 'MISSING' : fm.doc_type === 'skip' ? 'SKIP'
      : !v || /[{}]/.test(v) || olderThan(v, version) ? 'STALE' : 'CURRENT';
    return { verdict, key, path, doc: !v ? 'none' : /[{}]/.test(v) ? 'unsubstituted' : v };
  });
}

/** Guides `/brewdoc:my-claude refresh` would regenerate (verdict STALE; MISSING and SKIP never count), sorted by path. */
export function staleGuides(root, version, opts) {
  return guideVerdicts(root, version, opts).filter(g => g.verdict === 'STALE').sort((a, b) => a.path.localeCompare(b.path));
}

// Lowest brewdoc version loadable in `cwd` (user/managed installs + this project's own): refresh compares guides with the loaded one.
function loadedBrewdoc(snap, cwd) {
  const here = real(cwd);
  const local = r => ['project', 'local'].includes(r.scope);
  return versionsIn(snap.filter(r => r.id === `brewdoc@${MARKET}` && (!local(r) || real(r.projectPath) === here)))[0] ?? null;
}

function updateSet(rows, versions, mode, data) {
  const order = names(data);
  const rank = id => { const [n, m] = split(id); return m === MARKET ? (order.includes(n) ? order.indexOf(n) : order.length) : order.length + 1; };
  const target = r => (ours(r) ? known(versions[split(r.id)[0]]) : null);
  // Suite rows: an unknown latest or installed version counts as behind; other marketplaces only in `all`.
  return rows.filter(r => (ours(r) ? !atLeast(r.version, target(r)) : mode === 'all' && foreign(r)))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id) || byPlace(a, b)).map(r => ({
      id: r.id, scope: r.scope, projectPath: r.projectPath, before: r.version, latest: target(r),
      orphan: ['project', 'local'].includes(r.scope) && !isDir(r.projectPath),
    }));
}

function inputs(dir, env) {
  const lat = latestOf(json(read(join(dir, 'latest.json'))));
  const mk = marketplace(env);
  return { lat, versions: lat ? lat.versions : {}, notesPath: lat?.notes || mk?.notes || null,
    autoUpdate: lat && lat.autoUpdate !== null ? lat.autoUpdate : mk ? mk.autoUpdate : null, cc: read(join(dir, 'cc.txt')) };
}

function notesFor(rows, inp, data) {
  const from = versionsIn((rows || []).filter(ours))[0] ?? null;
  const to = names(data).map(n => known(inp.versions[n])).filter(Boolean).sort((a, b) => cmp(b, a))[0] ?? null;
  const notes = releaseNotes(read(inp.notesPath), from, to, { source: inp.notesPath, link: data.notesUrl, caps: data.caps });
  return { range: { from, to }, notes };
}

// Distinct inventory scopes (the prune step's input), `user` first.
const scopesOf = rows => [...new Map(rows.map(r => [keyOf(r), { scope: r.scope, projectPath: r.projectPath }])).values()].sort(byPlace);

function plan(dir, mode, env, data) {
  const rows = rowsOf(json(read(join(dir, 'before.json'))));
  const inp = inputs(dir, env);
  const { range, notes } = notesFor(rows, inp, data);
  const off = offers(rows || [], inp.versions, inp.cc, data);
  const out = {
    mode, range, update: rows ? updateSet(rows, inp.versions, mode, data) : [], scopes: rows ? scopesOf(rows) : [],
    offers: rows ? off : { ...off, mods: [], plugins: [] }, notes, autoUpdate: inp.autoUpdate,
  };
  if (!rows) out.error = 'no-inventory';
  else if (!inp.lat) out.error = 'no-latest';
  return { text: `${JSON.stringify(out)}\n`, rc: out.error ? 1 : 0 };
}

function latest(env, data) {
  const m = marketplace(env);
  if (!m) return { text: `${JSON.stringify({ error: 'no-marketplace' })}\n`, rc: 1 };
  const versions = Object.fromEntries(names(data).map(n => [n, known((json(read(join(m.installLocation, n, '.claude-plugin', 'plugin.json'))) || {}).version) || 'unknown']));
  return { text: `${JSON.stringify({ versions, autoUpdate: m.autoUpdate, installLocation: m.installLocation, notes: m.notes })}\n`, rc: 0 };
}

const CELL = { updated: '🟢 updated', installed: '🟢 installed', current: '⚪ already current', 'not-installed': '⚪ not installed',
  unknown: '⚪ latest unknown', orphan: '⚪ orphan install' };
const TITLE = { unknown: '## ⚪ brewcode: latest versions unknown (offline?)', checkUnknown: '## 🔵 brewcode check: latest versions unknown',
  unread: '## 🔴 brewcode: update result unknown (plugin list unreadable)' };

function component(r) {
  const where = r.scope && r.scope !== 'user' ? ` (${r.scope}${r.projectPath ? `: \`${r.projectPath}\`` : ''})` : '';
  return `**${r.name}**${where}`;
}

// variant: check | update | unread (update run, after list unreadable: After is `—`, a behind row is unverified).
function markOf(r, variant) {
  if (r.status !== 'behind') return CELL[r.status];
  if (variant === 'check') return '🔵 update available';
  return variant === 'unread' ? `🔴 not verified, latest ${r.latest}` : `🔴 still ${r.after ?? r.before}, latest ${r.latest ?? 'unknown'}`;
}

function tableOf(rows, variant) {
  const check = variant === 'check';
  const head = check ? ['| Component | Installed | Latest | |', '|---|---|---|---|'] : ['| Component | Before | After | |', '|---|---|---|---|'];
  return [...head, ...rows.map(r => {
    const cells = check
      ? [r.before ?? '—', r.latest ? (r.status === 'behind' ? `**${r.latest}**` : r.latest) : '—']
      : [r.before ?? '—', r.after === null ? '—' : ['updated', 'installed'].includes(r.status) ? `**${r.after}**` : r.after];
    return `| ${component(r)} | ${cells[0]} | ${cells[1]} | ${markOf(r, variant)} |`;
  })];
}

// A project/local row whose directory is gone cannot be updated: never a failure, never "can be updated".
const orphaned = r => ['project', 'local'].includes(r.scope) && !isDir(r.projectPath);

// `notes` covers (range.from, range.to]: an empty or unknown range yields no notes, so no block.
function changes(range, notes) {
  const shown = notes.versions.flatMap(v => v.bullets.map(b => `- **v${v.version}:** ${b}`));
  if (!notes.missing && !shown.length && !notes.requirement && !notes.migration.length) return [];
  const link = notes.link ? `[release notes](${notes.link})` : 'release notes';
  const out = [`### What changed for you (${range.from} → ${range.to})`, ''];
  if (notes.missing && !notes.versions.length) return [...out, `🔵 The release notes for these versions are not available here: ${link}.`];
  if (notes.missing) out.push(`🔵 Notes for versions after ${notes.versions[0].version} are not in your local marketplace copy yet: ${link}.`, '');
  if (notes.requirement) out.push(`🔵 ${notes.requirement}`, '');
  out.push(...notes.migration.map(m => `- **v${m.version} migration:** ${m.text}`), ...shown);
  if (notes.hidden) out.push(`- *+${notes.hidden} more:* ${link}`);
  return out.at(-1) === '' ? out.slice(0, -1) : out;
}

// target: the latest brewcode when the after list is unreadable (snap holds only the old version), else null.
function nextSteps(check, rows, snap, cwd, target = null) {
  const steps = [];
  const own = versionsOf(snap, 'brewcode').at(-1) ?? null;
  const doc = loadedBrewdoc(snap, cwd);
  const code = target ?? own;
  if (check) {
    const n = rows.filter(r => r.status === 'behind').length;
    if (n) steps.push(`🔵 **\`/brewtools:plugin-update\`**: applies the ${n} update${n === 1 ? '' : 's'}.`);
  } else {
    steps.push('🔵 **`/reload-plugins`**: activates the new versions in this session (or `exit`, then `claude`).');
    if (code && isDir(join(cwd, '.claude'))) {
      const here = real(cwd);
      const others = [...new Set(snap.filter(r => ours(r) && ['project', 'local'].includes(r.scope) && isDir(r.projectPath)
        && real(r.projectPath) !== here).map(r => r.projectPath))].sort();
      steps.push(`🔵 **\`/brewcode:setup-status upgrade\`**: brings this project's setups up to **${code}** in one run; `
        + `repeat it in every project you use${others.length ? `: ${others.map(p => `\`${p}\``).join(', ')}` : ''}.`);
    }
  }
  const guides = staleGuides(cwd, doc);
  if (guides.length === 1) steps.push(`🔵 **\`/brewdoc:my-claude refresh\`**: your installation guide \`${guides[0].path}\` is older than brewdoc **${doc}**.`);
  if (guides.length > 1) {
    steps.push(`🔵 **\`/brewdoc:my-claude refresh\`**: ${guides.length} installation guides are older than brewdoc **${doc}**: ${guides.map(g => `\`${g.path}\``).join(', ')}.`);
  }
  return steps.length ? ['### Next steps', '', ...steps.map((s, i) => `${i + 1}. ${s}`)] : [];
}

function report(dir, env, cwd, data) {
  const before = rowsOf(json(read(join(dir, 'before.json'))));
  if (!before) return { text: '🔴 The plugin list from before the update could not be read: run `claude plugin list` and compare by hand.\n', rc: 1 };
  const afterFile = join(dir, 'after.json');
  const afterText = read(afterFile);
  const after = rowsOf(json(afterText));
  const check = afterText === null && !existsSync(afterFile);
  const unreadable = !check && !after;
  const variant = check ? 'check' : unreadable ? 'unread' : 'update';
  const inp = inputs(dir, env);
  const snap = after || before;
  const rows = diff(before, after, inp.versions, data).map(r => (['behind', 'unknown'].includes(r.status) && orphaned(r) ? { ...r, status: 'orphan' } : r));
  const installed = rows.filter(r => r.status !== 'not-installed').length;
  const done = rows.filter(r => ['updated', 'installed'].includes(r.status)).length;
  const failed = rows.filter(r => r.status === 'behind').length;
  const unknown = rows.filter(r => r.status === 'unknown').length;
  const title = check ? (unknown ? TITLE.checkUnknown : `## 🔵 brewcode check: ${failed} of ${installed} components can be updated`)
    : unreadable ? TITLE.unread
      : failed ? `## 🔴 brewcode: ${done} updated, ${failed} failed`
        : unknown ? TITLE.unknown : done ? `## 🟢 brewcode updated: ${done} of ${installed} components` : '## ⚪ brewcode is current';
  const blocks = [];
  if (unreadable) blocks.push(['🔴 The plugin list after the update could not be read: the table shows the versions from before it.']);
  blocks.push([title], tableOf(rows, variant));
  const off = offers(snap, inp.versions, inp.cc, data);
  const missingMod = rows.some(r => r.status === 'not-installed' && data.mods.some(x => x.name === r.name));
  if (!off.ccOk && missingMod) {
    blocks.push([`🔵 Mods need Claude Code **${data.ccMin}** or newer (you have **${off.cc ?? 'unknown'}**): run \`claude update\`, restart Claude Code, then run \`/brewtools:plugin-update\` again.`]);
  }
  for (const { migration: m } of fired(snap, inp.versions, data)) blocks.push([`🔵 **Moved:** ${m.message} ([docs](${m.docsUrl}))`]);
  for (const o of [...off.mods, ...off.plugins]) blocks.push([`🔵 **${o.name}** is not installed (${o.value}): \`claude plugin install ${o.name}@${MARKET}\``]);
  const { range, notes } = notesFor(before, inp, data);
  // The ❗ requirement is the mods' Claude Code floor: shown only below `ccMin` or with `cc` unreadable.
  blocks.push(changes(range, off.ccOk ? { ...notes, requirement: null } : notes), nextSteps(check, rows, snap, cwd, unreadable ? known(inp.versions.brewcode) : null));
  if (inp.autoUpdate === false) blocks.push([`🔵 Auto-update is off for ${MARKET}: \`/plugin\` -> Marketplaces -> ${MARKET} -> **Enable auto-update**.`]);
  return { text: `${blocks.filter(b => b.length).map(b => b.join('\n')).join('\n\n')}\n`, rc: unreadable || unknown ? 1 : 0 };
}

function main(argv, env, cwd) {
  const [cmd, ...rest] = argv;
  const usage = msg => ({ text: '', err: `update-flow.mjs: ${msg}\n${USAGE}\n`, rc: 2 });
  let data;
  try { data = loadData(); } catch (e) { return { text: `${JSON.stringify({ error: 'no-data' })}\n`, err: `${e.message}\n`, rc: 1 }; }
  if (cmd === 'latest') return rest.length ? usage('latest takes no arguments') : latest(env, data);
  if (cmd === 'plan') {
    const at = rest.indexOf('--mode');
    const mode = at < 0 ? undefined : rest[at + 1];
    if (!MODES.includes(mode)) return usage(`--mode must be one of ${MODES.join('|')}`);
    const pos = rest.filter((_, i) => i !== at && i !== at + 1);
    if (pos.length !== 1 || !isDir(pos[0])) return usage('plan needs one existing <dir>');
    return plan(pos[0], mode, env, data);
  }
  if (cmd === 'report') return rest.length !== 1 || !isDir(rest[0]) ? usage('report needs one existing <dir>') : report(rest[0], env, cwd, data);
  return usage(cmd ? `unknown command: ${cmd}` : 'no command');
}

/** Run only when executed directly; importing (tests) must not run the CLI. Doubt -> run. */
function invokedDirectly() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return true;
  }
}

if (invokedDirectly()) {
  const r = main(process.argv.slice(2), process.env, process.cwd());
  if (r.err) process.stderr.write(r.err);
  process.stdout.write(r.text);
  process.exitCode = r.rc;
}
