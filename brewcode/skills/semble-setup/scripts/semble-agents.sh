#!/usr/bin/env bash
# semble-agents.sh — audit / migrate project agent frontmatter for the two
# semble MCP tools. Contract: DESIGN §9.9 + §11. Never adds an `mcpServers`
# key (§11.2). The only bytes it may change live inside a `tools:` value.
set -euo pipefail

SC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SC_LIB="$SC_DIR/lib/semble-common.sh"
# Hard dependency: a second, drifting copy of these helpers is worse than a stop.
[ -r "$SC_LIB" ] || {
  printf '❌ %s\n' "brewcode:semble-setup is incomplete: missing $SC_LIB" >&2
  exit 1
}
# shellcheck source=/dev/null
. "$SC_LIB"

usage() {
  cat <<'USAGE'
semble-agents.sh audit  [--scope project|global] [--json]
semble-agents.sh apply  [--scope project|global] [--yes] [--revert] [--json]

  audit    read-only report of what would change. Always exits 0.
  apply    writes the two semble tool names into every `tools:` allowlist,
           recording per file which of them the user already had.
           Requires --yes; without it the plan is printed and it exits 4.
  --revert removes exactly the names this skill added, per the record `apply`
           left in .claude/semble/state.json. A name the user authored before
           install is kept; with no record for a file, nothing is removed.
  --scope  project (default) = <projectRoot>/.claude/agents/**/*.md
           global            = <home>/.claude/agents/**/*.md; apply --scope
                               global additionally requires --yes.

Exit: 0 ok | 1 failure/abort | 2 bad usage | 3 conflicts need a user decision
      4 confirmation required (nothing written)
USAGE
}

MODE=""
SCOPE="project"
JSON=0
YES=0
REVERT=0

while [ $# -gt 0 ]; do
  case "$1" in
    audit|apply)
      [ -z "$MODE" ] || { sc_err "unknown argument: $1"; usage >&2; exit 2; }
      MODE="$1" ;;
    --scope)
      shift || true
      case "${1:-}" in
        project|global) SCOPE="$1" ;;
        *) sc_err "--scope needs project|global"; exit 2 ;;
      esac ;;
    --scope=*)
      SCOPE="${1#--scope=}"
      case "$SCOPE" in project|global) ;; *) sc_err "--scope needs project|global"; exit 2 ;; esac ;;
    --json)   JSON=1 ;;
    --yes|-y) YES=1 ;;
    --revert) REVERT=1 ;;
    -h|--help) usage; exit 0 ;;
    *) sc_err "unknown argument: $1"; usage >&2; exit 2 ;;
  esac
  shift
done

[ -n "$MODE" ] || { usage >&2; exit 2; }
[ "$REVERT" -eq 0 ] || [ "$MODE" = "apply" ] || { sc_err "--revert is only valid for apply"; exit 2; }

sc_require_node

if [ "$SCOPE" = "global" ]; then
  ROOT="$(sc_home)"
else
  ROOT="$(sc_project_root)"
fi
AGENTS_DIR="$ROOT/.claude/agents"

DRY=0
if [ "${SEMBLE_DRY_RUN:-}" = "1" ]; then DRY=1; fi

# apply needs --yes; global scope needs it too and is never implied.
WRITE=1
if [ "$MODE" = "audit" ] || [ "$YES" -eq 0 ] || [ "$DRY" -eq 1 ]; then WRITE=0; fi

# The ownership record lives in state.json, so `remove`/`purge` clean it up with
# everything else. Only a write-mode `apply` produces one; node fills this file
# and the shell hands it to sc_state_patch, the one sanctioned state writer.
LEDGER=""
if [ "$WRITE" -eq 1 ] && [ "$REVERT" -eq 0 ]; then
  LEDGER="$(mktemp "${TMPDIR:-/tmp}/semble-agents.XXXXXX")"
  trap 'rm -f "$LEDGER"' EXIT
fi

CFG="$(printf '{"mode":%s,"scope":%s,"root":%s,"dir":%s,"write":%s,"revert":%s,"dry":%s,"json":%s,"search":%s,"related":%s,"state":%s,"ledger":%s}' \
  "$(sc_jstr "$MODE")" "$(sc_jstr "$SCOPE")" "$(sc_jstr "$ROOT")" "$(sc_jstr "$AGENTS_DIR")" \
  "$WRITE" "$REVERT" "$DRY" "$JSON" "$(sc_jstr "$SEMBLE_TOOL_SEARCH")" "$(sc_jstr "$SEMBLE_TOOL_RELATED")" \
  "$(sc_jstr "$(sc_state_file)")" "$(sc_jstr "$LEDGER")")"

PROG="$(cat <<'NODE_PROGRAM'
'use strict';
const fs = require('fs');
const path = require('path');

const CFG = JSON.parse(process.argv[1]);
const SEARCH = CFG.search, RELATED = CFG.related;
const WANT = [SEARCH, RELATED];
const WILDCARDS = ['*', 'mcp__*', 'mcp__semble_code__*'];
const MAX_BYTES = 512 * 1024;

// ── ownership record ────────────────────────────────────────────────────────
// `--revert` may strip only the names THIS skill inserted. `apply` records, per
// file, which of the two the user already had (`state.json:agentsPreExisting`,
// keyed by scope, then by path relative to the root of that scope). The FIRST
// observation wins, so a second `apply` never mistakes its own insertions for
// user text. No record for a file -> revert declines instead of stripping blind.
function stateAgentsMap() {
  let s;
  try { s = JSON.parse(fs.readFileSync(CFG.state, 'utf8')); } catch (e) { return {}; }
  const all = s && typeof s === 'object' && !Array.isArray(s) ? s.agentsPreExisting : null;
  return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
}
const LEDGER_ALL = stateAgentsMap();
const scoped = LEDGER_ALL[CFG.scope];
const LEDGER = scoped && typeof scoped === 'object' && !Array.isArray(scoped) ? scoped : null;
const ledgerNext = Object.assign({}, LEDGER);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function recordPre(p, a) {
  if (!has(ledgerNext, p)) ledgerNext[p] = WANT.filter((n) => a.items.some((i) => i.name === n));
}

/** Names `--revert` is allowed to strip from `p`, or null when authorship is unknown. */
function ownable(p) {
  if (!LEDGER || !has(LEDGER, p)) return null;
  const pre = Array.isArray(LEDGER[p]) ? LEDGER[p] : [];
  return WANT.filter((n) => pre.indexOf(n) < 0);
}

function writeLedger() {
  if (!CFG.ledger || CFG.revert || !Object.keys(ledgerNext).length) return;
  LEDGER_ALL[CFG.scope] = ledgerNext;
  try { fs.writeFileSync(CFG.ledger, JSON.stringify({ agentsPreExisting: LEDGER_ALL })); } catch (e) { /* the shell warns */ }
}

// ── line helpers: a "line" always carries its own ending, so offsets are exact
const contentOf = (l) => l.replace(/\r?\n$/, '');
const endingOf = (l) => l.slice(contentOf(l).length);
const countOf = (s, sub) => s.split(sub).length - 1;
const unquote = (s) => (/^"[\s\S]*"$/.test(s) || /^'[\s\S]*'$/.test(s) ? s.slice(1, -1) : s);

// Value text before an inline `#` comment, and the comment tail (kept verbatim).
function splitComment(v) {
  const m = v.match(/\s+#/);
  if (!m) return [v, ''];
  return [v.slice(0, m.index), v.slice(m.index)];
}

// Comma-separated tokens with absolute source spans (quotes included in span).
function tokenSpans(inner, base) {
  const out = [];
  let i = 0;
  for (const part of inner.split(',')) {
    const lead = part.match(/^\s*/)[0].length;
    const bare = part.trim();
    if (bare) out.push({ name: unquote(bare), start: base + i + lead, end: base + i + lead + bare.length });
    i += part.length + 1;
  }
  return out;
}

/**
 * Locate the frontmatter and the `tools:` declaration inside `raw`.
 * Returns { ok:false, reason } or a descriptor with absolute offsets.
 */
function analyze(raw) {
  const lines = raw.split(/(?<=\n)/);
  const offs = [];
  let acc = 0;
  for (const l of lines) { offs.push(acc); acc += l.length; }

  const head = contentOf(lines[0] || '').replace(/^\uFEFF/, '');
  if (!/^---\s*$/.test(head)) return { ok: false, reason: 'no-frontmatter' };

  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (/^---\s*$/.test(contentOf(lines[i]))) { close = i; break; }
  }
  if (close < 0) return { ok: false, reason: 'unterminated-frontmatter' };

  const fm = { start: 1, end: close };
  const topKey = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:(.*)$/;
  const toolsIdx = [];
  let disallowedIdx = -1;
  for (let i = fm.start; i < fm.end; i++) {
    const m = contentOf(lines[i]).match(topKey);
    if (!m) continue;
    if (m[1] === 'tools') toolsIdx.push(i);
    if (m[1] === 'disallowedTools' && disallowedIdx < 0) disallowedIdx = i;
  }
  if (toolsIdx.length > 1) return { ok: false, reason: 'duplicate-tools-key' };

  const base = { ok: true, lines, offs, fm, disallowedIdx };
  if (toolsIdx.length === 0) return Object.assign(base, { style: 'absent', items: [], region: null });

  const li = toolsIdx[0];
  const lineStart = offs[li];
  const c = contentOf(lines[li]);
  const v = c.match(/^tools\s*:(.*)$/)[1];
  const valueCol = c.length - v.length;
  const [vpre, comment] = splitComment(v);
  const t = vpre.trim();

  const lineRegion = (from, to) => ({ start: offs[from], end: offs[to] + lines[to].length });

  // block scalars are not a tool list we can safely edit
  if (/^[|>]/.test(t)) return { ok: false, reason: 'malformed-tools-value' };

  if (t.startsWith('[')) {
    let closeLine = -1, closeCol = -1;
    for (let i = li; i < fm.end; i++) {
      const s = i === li ? contentOf(lines[i]).indexOf(']', valueCol) : contentOf(lines[i]).indexOf(']');
      if (s >= 0) { closeLine = i; closeCol = s; break; }
    }
    if (closeLine < 0) return { ok: false, reason: 'malformed-tools-value' };
    const openAbs = lineStart + c.indexOf('[', valueCol);
    const closeAbs = offs[closeLine] + closeCol;
    const inner = raw.slice(openAbs + 1, closeAbs);
    if (inner.indexOf('#') >= 0) return { ok: false, reason: 'malformed-tools-value' };
    const items = tokenSpans(inner, openAbs + 1);
    return Object.assign(base, {
      style: items.length ? 'flow' : 'empty',
      kind: 'flow',
      items,
      innerStart: openAbs + 1,
      innerEnd: closeAbs,
      toolsLine: li,
      region: lineRegion(li, closeLine),
    });
  }

  if (t === '' || t === 'null' || t === '~') {
    // block sequence directly under the key, or a genuinely empty allowlist
    const itemRe = /^(\s+)(-\s+)(.*)$/;
    const itemLines = [];
    for (let i = li + 1; i < fm.end; i++) {
      const lc = contentOf(lines[i]);
      if (/^\s*$/.test(lc)) { if (itemLines.length) break; else continue; }
      if (/^\s*#/.test(lc)) continue;
      if (itemRe.test(lc)) { itemLines.push(i); continue; }
      break;
    }
    if (itemLines.length) {
      const items = itemLines.map((i) => {
        const lc = contentOf(lines[i]);
        const m = lc.match(itemRe);
        const [tv] = splitComment(m[3]);
        return {
          name: unquote(tv.trim()),
          line: i,
          indentDash: m[1] + m[2],
          start: offs[i],
          end: offs[i] + lines[i].length,
        };
      });
      return Object.assign(base, {
        style: 'block',
        kind: 'block',
        items,
        toolsLine: li,
        region: lineRegion(li, itemLines[itemLines.length - 1]),
      });
    }
    return Object.assign(base, {
      style: 'empty',
      kind: 'empty',
      items: [],
      // `tools:` with nothing after it, as opposed to `tools: null` / `tools: ~`
      bare: t === '',
      valueStart: lineStart + valueCol,
      valueEnd: lineStart + valueCol + vpre.length,
      toolsLine: li,
      region: lineRegion(li, li),
    });
  }

  // plain (or quoted) CSV scalar
  const quoted = /^"[\s\S]*"$/.test(t) || /^'[\s\S]*'$/.test(t);
  const tStart = lineStart + valueCol + vpre.length - vpre.replace(/^\s*/, '').length;
  const innerStart = quoted ? tStart + 1 : tStart;
  const innerEnd = quoted ? tStart + t.length - 1 : tStart + t.length;
  return Object.assign(base, {
    style: 'csv',
    kind: 'csv',
    items: tokenSpans(raw.slice(innerStart, innerEnd), innerStart),
    innerStart,
    innerEnd,
    quoted,
    comment,
    toolsLine: li,
    region: lineRegion(li, li),
  });
}

function disallowedHit(a, raw) {
  if (a.disallowedIdx < 0) return null;
  const line = contentOf(a.lines[a.disallowedIdx]);
  const v = line.match(/^disallowedTools\s*:(.*)$/)[1];
  const names = [];
  const flow = v.match(/\[([\s\S]*?)\]/);
  if (flow) names.push(...flow[1].split(',').map((s) => unquote(s.trim())));
  else if (v.trim()) names.push(...splitComment(v)[0].split(',').map((s) => unquote(s.trim())));
  else {
    for (let i = a.disallowedIdx + 1; i < a.fm.end; i++) {
      const lc = contentOf(a.lines[i]);
      const m = lc.match(/^\s+-\s+(.*)$/);
      if (!m) break;
      names.push(unquote(splitComment(m[1])[0].trim()));
    }
  }
  const bad = names.filter((n) => WANT.indexOf(n) >= 0 || WILDCARDS.indexOf(n) >= 0);
  return bad.length ? { line, names: bad } : null;
}

const applySplices = (raw, splices) =>
  splices
    .slice()
    .sort((x, y) => y.start - x.start)
    .reduce((s, sp) => s.slice(0, sp.start) + sp.text + s.slice(sp.end), raw);

// Everything outside the `tools:` declaration, with that declaration collapsed
// to a sentinel. Equal skeletons == byte-identical everywhere else.
function skeleton(raw, a) {
  if (!a.ok) return null;
  if (!a.region) return raw.slice(0, a.offs[a.fm.end]) + '\u0000NOTOOLS\u0000' + raw.slice(a.offs[a.fm.end]);
  return raw.slice(0, a.region.start) + '\u0000TOOLS\u0000' + raw.slice(a.region.end);
}

function otherFmLines(raw, a) {
  const out = [];
  for (let i = 0; i < a.lines.length; i++) {
    const off = a.offs[i];
    if (a.region && off >= a.region.start && off < a.region.end) continue;
    out.push(a.lines[i]);
  }
  return out;
}

// ── plan: what would change in this file ────────────────────────────────────
function planAdd(raw, a) {
  const names = a.items.map((i) => i.name);
  if (names.some((n) => WILDCARDS.indexOf(n) >= 0)) {
    return { action: 'unchanged', reason: 'already-allowed', added: [], splices: [], insertedLines: 0 };
  }
  const missing = WANT.filter((n) => names.indexOf(n) < 0);
  if (!missing.length) {
    return { action: 'unchanged', reason: 'already-present', added: [], splices: [], insertedLines: 0 };
  }

  if (a.kind === 'flow' && a.items.length) {
    const lastEnd = a.items[a.items.length - 1].end;
    return {
      action: 'changed',
      reason: 'added',
      added: missing,
      insertedLines: 0,
      splices: [{ start: lastEnd, end: lastEnd, text: missing.map((n) => ', ' + n).join('') }],
    };
  }
  if (a.kind === 'csv') {
    const lastEnd = a.items.length ? a.items[a.items.length - 1].end : a.innerEnd;
    return {
      action: 'changed',
      reason: 'added',
      added: missing,
      insertedLines: 0,
      splices: [{ start: lastEnd, end: lastEnd, text: missing.map((n) => ', ' + n).join('') }],
    };
  }
  if (a.kind === 'block') {
    const last = a.items[a.items.length - 1];
    const lastLine = a.lines[last.line];
    let eol = endingOf(lastLine);
    let prefix = '';
    if (!eol) { eol = countOf(a.lines[0], '\r\n') ? '\r\n' : '\n'; prefix = eol; }
    const text = prefix + missing.map((n) => last.indentDash + n + eol).join('');
    return {
      action: 'changed',
      reason: 'added',
      added: missing,
      insertedLines: countOf(text, '\n'),
      splices: [{ start: last.end, end: last.end, text }],
    };
  }
  // empty allowlist: `tools:` / `tools: null` / `tools: []`
  const only = missing.length === WANT.length;
  const note = only
    ? 'tools: was an empty allowlist — this agent now has ONLY mcp__semble_code__search and mcp__semble_code__find_related'
    : undefined;
  if (a.style === 'empty' && a.kind === 'flow') {
    return {
      action: 'changed', reason: 'added', added: missing, insertedLines: 0, note,
      splices: [{ start: a.innerStart, end: a.innerEnd, text: missing.join(', ') }],
    };
  }
  // A bare `tools:` becomes a block sequence, never a flow list: `--revert`
  // then deletes the item lines and the key is byte-identical to before. A flow
  // list would be indistinguishable from a pre-existing `tools: []`.
  if (a.bare) {
    const tl = a.lines[a.toolsLine];
    let eol = endingOf(tl);
    let prefix = '';
    if (!eol) { eol = countOf(a.lines[0], '\r\n') ? '\r\n' : '\n'; prefix = eol; }
    const at = a.offs[a.toolsLine] + tl.length;
    const text = prefix + missing.map((n) => '  - ' + n + eol).join('');
    return {
      action: 'changed', reason: 'added', added: missing, insertedLines: countOf(text, '\n'), note,
      splices: [{ start: at, end: at, text }],
    };
  }
  return {
    action: 'changed', reason: 'added', added: missing, insertedLines: 0, note,
    splices: [{ start: a.valueStart, end: a.valueEnd, text: ' [' + missing.join(', ') + ']' }],
  };
}

function planRemove(raw, a, own) {
  if (!own) {
    return {
      action: 'unchanged', reason: 'not-owned', added: [], splices: [], insertedLines: 0,
      note: 'no record of what this skill added here — nothing was removed',
    };
  }
  const kept = WANT.filter((n) => own.indexOf(n) < 0 && a.items.some((i) => i.name === n));
  const note = kept.length ? 'kept ' + kept.join(' ') + ' — authored before install' : undefined;
  const idx = [];
  a.items.forEach((it, i) => { if (own.indexOf(it.name) >= 0) idx.push(i); });
  if (!idx.length) {
    return { action: 'unchanged', reason: 'not-present', added: [], splices: [], insertedLines: 0, note };
  }
  const removed = idx.map((i) => a.items[i].name);

  if (a.kind === 'block') {
    return {
      action: 'changed', reason: 'removed', added: removed, insertedLines: -idx.length, note,
      splices: idx.map((i) => ({ start: a.items[i].start, end: a.items[i].end, text: '' })),
    };
  }
  if (a.kind !== 'flow' && a.kind !== 'csv') {
    return { action: 'unchanged', reason: 'not-present', added: [], splices: [], insertedLines: 0, note };
  }
  // contiguous runs, so that removing a tail block leaves no stray separator
  const runs = [];
  for (const i of idx) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === i - 1) last.push(i);
    else runs.push([i]);
  }
  const n = a.items.length;
  const splices = runs.map((run) => {
    const i = run[0], j = run[run.length - 1];
    if (i > 0) return { start: a.items[i - 1].end, end: a.items[j].end, text: '' };
    if (j + 1 < n) return { start: a.items[0].start, end: a.items[j + 1].start, text: '' };
    return { start: a.items[0].start, end: a.items[n - 1].end, text: '' };
  });
  return { action: 'changed', reason: 'removed', added: removed, insertedLines: 0, note, splices };
}

// ── post-write verification ─────────────────────────────────────────────────
function verify(oldRaw, oldA, newRaw, plan) {
  const newA = analyze(newRaw);
  if (!newA.ok) return 'reparse-failed:' + newA.reason;
  if (skeleton(oldRaw, oldA) !== skeleton(newRaw, newA)) return 'skeleton-changed';

  const oldOther = otherFmLines(oldRaw, oldA);
  const newOther = otherFmLines(newRaw, newA);
  if (oldOther.length !== newOther.length) return 'other-lines-count';
  for (let i = 0; i < oldOther.length; i++) {
    if (oldOther[i] !== newOther[i]) return 'other-line-modified';
  }

  const names = newA.items.map((i) => i.name);
  const wantPresent = WANT.every((n) => names.indexOf(n) >= 0);
  if (plan.reason === 'added' && !wantPresent) return 'tool-missing-after-write';
  // Only the names the plan claimed to remove must be gone: a user-authored one
  // is kept on purpose and is not drift.
  if (plan.reason === 'removed' && plan.added.some((n) => names.indexOf(n) >= 0)) {
    return 'tool-present-after-revert';
  }

  const dLf = countOf(newRaw, '\n') - countOf(oldRaw, '\n');
  const dCrLf = countOf(newRaw, '\r\n') - countOf(oldRaw, '\r\n');
  const crlf = countOf(oldRaw.slice(0, 4096), '\r\n') > 0;
  if (dLf !== plan.insertedLines) return 'line-count-drift';
  if (dCrLf !== (crlf ? plan.insertedLines : 0)) return 'eol-style-drift';
  return '';
}

// ── walk ────────────────────────────────────────────────────────────────────
function walk(dir, out) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) { if (/\.md$/i.test(e.name)) out.push({ p, skip: 'symlink' }); continue; }
    if (e.isDirectory()) { walk(p, out); continue; }
    if (!/\.md$/i.test(e.name)) continue;
    if (!e.isFile()) { out.push({ p, skip: 'not-md' }); continue; }
    out.push({ p, skip: '' });
  }
  return out;
}

const rel = (p) => (p.indexOf(CFG.root + path.sep) === 0 ? p.slice(CFG.root.length + 1) : p);

const files = [];
for (const f of walk(CFG.dir, []).sort((x, y) => (rel(x.p) < rel(y.p) ? -1 : rel(x.p) > rel(y.p) ? 1 : 0))) {
  const entry = { path: rel(f.p), action: 'skipped', reason: f.skip, toolsStyle: 'absent', added: [], backup: '' };
  if (f.skip) { files.push(entry); continue; }

  let st, raw;
  try {
    st = fs.statSync(f.p);
    if (st.size > MAX_BYTES) { entry.reason = 'too-large'; files.push(entry); continue; }
    raw = fs.readFileSync(f.p, 'utf8');
  } catch (e) {
    entry.action = 'failed';
    entry.reason = 'read-error';
    entry.note = String(e.message || e);
    files.push(entry);
    continue;
  }

  const a = analyze(raw);
  if (!a.ok) { entry.reason = a.reason; files.push(entry); continue; }
  entry.toolsStyle = a.items.some((i) => WILDCARDS.indexOf(i.name) >= 0) ? 'wildcard' : a.style;

  const hit = disallowedHit(a, raw);
  if (hit) {
    entry.action = 'conflict';
    entry.reason = 'disallowed-tools';
    entry.note = hit.line;
    files.push(entry);
    continue;
  }

  if (a.style === 'absent') {
    entry.action = 'unchanged';
    entry.reason = CFG.revert ? 'not-present' : 'inherits';
    files.push(entry);
    continue;
  }

  if (!CFG.revert) recordPre(entry.path, a);
  const plan = CFG.revert ? planRemove(raw, a, ownable(entry.path)) : planAdd(raw, a);
  entry.action = plan.action;
  entry.reason = plan.reason;
  entry.added = plan.added;
  if (plan.note) entry.note = plan.note;
  if (plan.action !== 'changed' || !CFG.write) { files.push(entry); continue; }

  // Backups are transient: they exist only across the write+verify window and
  // are removed once verify is clean, so no `.bak.*` is ever left next to a
  // git-tracked agent file. A backup that is still needed (verify failed, or a
  // crash between write and verify) survives and its path is reported.
  const backup = f.p + '.bak.' + Math.floor(Date.now() / 1000);
  const next = applySplices(raw, plan.splices);
  try {
    fs.copyFileSync(f.p, backup);
    entry.backup = backup;
    fs.writeFileSync(f.p, next, 'utf8');
  } catch (e) {
    entry.action = 'failed';
    entry.reason = 'write-error';
    entry.note = String(e.message || e);
    files.push(entry);
    continue;
  }

  const problem = verify(raw, a, fs.readFileSync(f.p, 'utf8'), plan);
  if (problem) {
    entry.action = 'failed';
    entry.reason = 'verify-mismatch';
    entry.note = problem;
    try { fs.copyFileSync(backup, f.p); } catch (e) { entry.reason = 'restore-failed'; }
  } else {
    // clean write — nothing can need the copy any more
    try { fs.unlinkSync(backup); entry.backup = ''; } catch (e) { /* report the leftover path */ }
  }
  files.push(entry);
}

writeLedger();

const summary = { changed: 0, unchanged: 0, conflict: 0, skipped: 0, failed: 0 };
for (const f of files) summary[f.action]++;

const result = {
  schema: 1,
  scope: CFG.scope,
  root: CFG.root,
  total: files.length,
  files,
  summary,
};

const ICON = { changed: '✅', unchanged: '⏭️', conflict: '⚠️', skipped: '⏭️', failed: '❌' };
if (CFG.json) {
  process.stdout.write(JSON.stringify(result) + '\n');
} else {
  const verb = CFG.revert ? 'revert' : (CFG.write ? 'apply' : 'plan');
  process.stdout.write('Semble agent migration — ' + verb + ' scope=' + CFG.scope + ' dir=' + CFG.dir + '\n');
  for (const f of files) {
    const extra = f.added.length ? ' [' + f.added.join(' ') + ']' : '';
    const note = f.note ? ' — ' + f.note : '';
    const line = ICON[f.action] + ' ' + f.path + ' — ' + f.action + ' (' + f.reason + ', ' + f.toolsStyle + ')' + extra + note;
    process.stdout.write((CFG.dry && f.action === 'changed' ? 'DRY ' : '') + line + '\n');
  }
  process.stdout.write(
    'Summary: total=' + result.total + ' changed=' + summary.changed + ' unchanged=' + summary.unchanged +
    ' conflict=' + summary.conflict + ' skipped=' + summary.skipped + ' failed=' + summary.failed + '\n');
  if (!CFG.write && !CFG.dry && CFG.mode === 'apply') {
    process.stdout.write('⚠️ --yes required — nothing was written\n');
  }
}

let code = 0;
if (summary.failed) code = 1;
else if (summary.conflict && CFG.mode === 'apply') code = 3;
if (CFG.mode === 'apply' && !CFG.write && !CFG.dry) code = 4;
process.exit(code);
NODE_PROGRAM
)"

set +e
node -e "$PROG" "$CFG"
RC=$?
set -e

# Persist the ownership record. A failure here costs a future `--revert` its
# authorship knowledge (it will decline rather than strip), so it warns on
# stderr — stdout must stay one JSON object — and never changes the exit code.
if [ -n "$LEDGER" ] && [ -s "$LEDGER" ]; then
  if ! ( sc_state_patch "$(cat "$LEDGER")" >/dev/null ); then
    sc_warn "could not record tool ownership in $(sc_state_file) — --revert will decline to strip" >&2
  fi
fi

exit "$RC"
