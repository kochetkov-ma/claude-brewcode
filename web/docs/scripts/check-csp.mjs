#!/usr/bin/env node
// check-csp.mjs - scan a built docs dist against the CSP in deploy/docs.Caddyfile; rc 0 clean, 1 violations, 2 usage
// Usage: node scripts/check-csp.mjs [--dist DIR] [--caddyfile FILE] [--site ORIGIN]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i === -1 ? dflt : args[i + 1];
};
const dist = resolve(opt('--dist', join(root, 'dist')));
const caddyfile = resolve(opt('--caddyfile', join(root, 'deploy', 'docs.Caddyfile')));
const site = new URL(opt('--site', 'https://doc-claude.brewcode.app'));

const die = (msg) => {
  console.error(`check-csp: ${msg}`);
  process.exit(2);
};

let caddy;
try {
  caddy = readFileSync(caddyfile, 'utf8');
} catch (e) {
  die(`cannot read ${caddyfile}: ${e.message}`);
}
const found = [...caddy.matchAll(/^\s*Content-Security-Policy\s+"([^"]+)"/gim)];
if (found.length !== 1) die(`expected exactly one Content-Security-Policy in ${caddyfile}, found ${found.length}`);

const policy = new Map();
for (const part of found[0][1].split(';')) {
  const [name, ...sources] = part.trim().split(/\s+/);
  if (name) policy.set(name.toLowerCase(), sources);
}

const FALLBACK = {
  'script-src-elem': ['script-src', 'default-src'],
  'script-src-attr': ['script-src', 'default-src'],
  'style-src-elem': ['style-src', 'default-src'],
  'style-src-attr': ['style-src', 'default-src'],
};
const NO_FALLBACK = new Set(['form-action', 'base-uri', 'frame-ancestors']);
const effective = (directive) => {
  for (const d of [directive, ...(FALLBACK[directive] ?? ['default-src'])]) {
    if (policy.has(d)) return policy.get(d);
    if (NO_FALLBACK.has(directive)) return null;
  }
  return null;
};

const allowsInline = (directive) => (effective(directive) ?? ['*']).includes("'unsafe-inline'");

const allowsUrl = (directive, raw) => {
  const list = effective(directive);
  if (list === null) return true;
  let u;
  try {
    u = new URL(raw, `${site.origin}/`);
  } catch {
    return false;
  }
  for (const src of list) {
    const s = src.toLowerCase();
    if (s === "'none'") continue;
    if (s === '*') return u.protocol === 'http:' || u.protocol === 'https:';
    if (s === "'self'") {
      if (u.origin === site.origin) return true;
      continue;
    }
    if (s.endsWith(':') && !s.includes('/')) {
      if (u.protocol === s) return true;
      continue;
    }
    const m = /^(?:(https?):\/\/)?(\*\.)?([a-z0-9.-]+)(?::\d+)?(?:\/.*)?$/.exec(s);
    if (!m) continue;
    const hostOk = m[2] ? u.hostname.endsWith(`.${m[3]}`) : u.hostname === m[3];
    if (hostOk && (!m[1] || u.protocol === `${m[1]}:`)) return true;
  }
  return false;
};

const violations = [];
const flag = (file, kind, detail) => violations.push({ file: file.slice(dist.length + 1), kind, detail: String(detail).slice(0, 140) });

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const NONEXEC = /^(application\/(ld\+)?json|importmap|speculationrules)$/i;
const TAG = /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const LINK_DIRECTIVE = { stylesheet: 'style-src-elem', modulepreload: 'script-src-elem', icon: 'img-src', manifest: 'manifest-src' };
const PRELOAD_AS = { script: 'script-src-elem', style: 'style-src-elem', font: 'font-src', image: 'img-src', fetch: 'connect-src' };

const checkUrl = (file, directive, tag, raw) => {
  if (!raw || raw.startsWith('#')) return;
  if (/^\s*javascript:/i.test(raw)) return flag(file, 'javascript-url', `<${tag}> ${raw}`);
  if (!allowsUrl(directive, raw)) flag(file, 'blocked-origin', `<${tag}> ${raw} not allowed by ${directive}`);
};

const TAG_AT = new RegExp(TAG.source, 'y');

// Linear tokenizer: skips comments, captures raw-text bodies of script/style up to the real closing tag.
const tokenize = (html) => {
  const lower = html.toLowerCase();
  const out = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    TAG_AT.lastIndex = lt;
    const m = TAG_AT.exec(html);
    if (!m) {
      i = lt + 1;
      continue;
    }
    const name = m[1].toLowerCase();
    i = lt + m[0].length;
    let body = '';
    if ((name === 'script' || name === 'style') && !m[0].endsWith('/>')) {
      let close = lower.indexOf(`</${name}`, i);
      while (close !== -1 && !/[\s/>]/.test(lower[close + name.length + 2] ?? '>')) close = lower.indexOf(`</${name}`, close + 1);
      if (close === -1) close = html.length;
      body = html.slice(i, close);
      const gt = html.indexOf('>', close);
      i = gt === -1 ? html.length : gt + 1;
    }
    out.push({ tag: name, rawAttrs: m[2], body });
  }
  return out;
};

const scanMarkup = (file, text) => {
  for (const t of tokenize(text)) {
    const tag = t.tag;
    const attrs = {};
    for (const a of t.rawAttrs.matchAll(ATTR)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    const body = t.body.trim();
    if (tag === 'script' && !('src' in attrs) && body && !NONEXEC.test(attrs.type ?? '') && !allowsInline('script-src-elem')) flag(file, 'inline-script', body);
    if (tag === 'style' && body && !allowsInline('style-src-elem')) flag(file, 'inline-style-element', body);
    for (const [name, val] of Object.entries(attrs)) {
      if (/^on[a-z]+$/.test(name) && !allowsInline('script-src-attr')) flag(file, 'inline-handler', `<${tag} ${name}="${val}">`);
      if (name === 'style' && !allowsInline('style-src-attr')) flag(file, 'inline-style-attr', `<${tag} style="${val}">`);
      if (/^(href|src|action|formaction|xlink:href|poster|data)$/.test(name) && /^\s*javascript:/i.test(val)) flag(file, 'javascript-url', `<${tag} ${name}="${val}">`);
    }
    if (tag === 'script') checkUrl(file, 'script-src-elem', tag, attrs.src);
    else if (tag === 'link') {
      const rels = (attrs.rel ?? '').toLowerCase().split(/\s+/);
      const rel = rels.find((r) => LINK_DIRECTIVE[r] || r === 'preload');
      if (rel === 'preload') checkUrl(file, PRELOAD_AS[(attrs.as ?? '').toLowerCase()] ?? 'default-src', tag, attrs.href);
      else if (rel) checkUrl(file, LINK_DIRECTIVE[rel], tag, attrs.href);
    } else if (tag === 'img') {
      checkUrl(file, 'img-src', tag, attrs.src);
      for (const c of (attrs.srcset ?? '').split(',')) checkUrl(file, 'img-src', tag, c.trim().split(/\s+/)[0]);
    } else if (tag === 'source') checkUrl(file, attrs.srcset === undefined ? 'media-src' : 'img-src', tag, attrs.src ?? attrs.srcset?.split(/[\s,]+/)[0]);
    else if (tag === 'video' || tag === 'audio') {
      checkUrl(file, 'media-src', tag, attrs.src);
      checkUrl(file, 'img-src', tag, attrs.poster);
    } else if (tag === 'iframe' || tag === 'frame') {
      checkUrl(file, 'frame-src', tag, attrs.src);
      if (attrs.srcdoc !== undefined) flag(file, 'iframe-srcdoc', '<iframe srcdoc>');
    } else if (tag === 'object') checkUrl(file, 'object-src', tag, attrs.data);
    else if (tag === 'embed') checkUrl(file, 'object-src', tag, attrs.src);
    else if (tag === 'form') checkUrl(file, 'form-action', tag, attrs.action);
    else if (tag === 'base') checkUrl(file, 'base-uri', tag, attrs.href);
    else if (tag === 'meta' && (attrs['http-equiv'] ?? '').toLowerCase() === 'content-security-policy') flag(file, 'meta-csp', 'CSP meta tag; the policy lives in the Caddyfile only');
  }
};

const scanCss = (file, css) => {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of body.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi)) checkUrl(file, 'style-src-elem', 'css @import', m[1]);
  for (const m of body.matchAll(/@font-face\s*\{[^}]*\}/gi)) {
    for (const u of m[0].matchAll(/url\(\s*["']?([^"')]+)/gi)) checkUrl(file, 'font-src', 'css @font-face', u[1]);
  }
  for (const m of body.replace(/@font-face\s*\{[^}]*\}/gi, '').matchAll(/url\(\s*["']?([^"')]+)/gi)) checkUrl(file, 'img-src', 'css url()', m[1]);
};

const scanJs = (file, js) => {
  const re = /\b(fetch|importScripts|import|sendBeacon|EventSource|WebSocket|open)\s*\(\s*[`"'](?:https?|wss?):\/\/([^`"'/$]+)[^`"']*/g;
  for (const m of js.matchAll(re)) {
    const url = m[0].slice(m[0].search(/[`"']/) + 1);
    const directive = m[1] === 'import' || m[1] === 'importScripts' ? 'script-src-elem' : 'connect-src';
    if (!allowsUrl(directive, url)) flag(file, 'blocked-origin', `${m[1]}(${url}) not allowed by ${directive}`);
  }
};

for (const d of ['script-src', 'script-src-elem', 'script-src-attr']) {
  const list = effective(d) ?? [];
  for (const bad of ["'unsafe-inline'", "'unsafe-eval'", '*', 'https:', 'http:', 'data:']) {
    if (list.includes(bad)) violations.push({ file: caddyfile, kind: 'weak-policy', detail: `${d} contains ${bad}` });
  }
}

let files;
try {
  files = walk(dist);
} catch (e) {
  die(`cannot read dist ${dist}: ${e.message}`);
}
if (files.length === 0) die(`dist ${dist} is empty`);

let scanned = 0;
for (const f of files) {
  const ext = extname(f).toLowerCase();
  if (!['.html', '.htm', '.svg', '.css', '.js', '.mjs'].includes(ext)) continue;
  const text = readFileSync(f, 'utf8');
  scanned++;
  if (ext === '.html' || ext === '.htm' || ext === '.svg') scanMarkup(f, text);
  else if (ext === '.css') scanCss(f, text);
  else scanJs(f, text);
}

if (violations.length) {
  const byKind = {};
  for (const v of violations) (byKind[v.kind] ??= []).push(v);
  for (const [kind, list] of Object.entries(byKind)) {
    console.error(`FAIL ${kind}: ${list.length}`);
    for (const v of list.slice(0, 5)) console.error(`  ${v.file}: ${v.detail}`);
    if (list.length > 5) console.error(`  ... ${list.length - 5} more`);
  }
  console.error(`check-csp: ${violations.length} violation(s) in ${scanned} files`);
  process.exit(1);
}
console.log(`check-csp: OK, ${scanned} files scanned against ${[...policy.keys()].length} directives`);
