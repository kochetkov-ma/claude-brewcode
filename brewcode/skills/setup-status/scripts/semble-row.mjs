#!/usr/bin/env node
// Row 2 verdict from `semble-status.sh --json --section guidance` (stdin), the ladder of its nextStep; never re-reads bytes.
// Usage: node semble-row.mjs <rule-template-path> -> `ROW2 <state> <signal>`, `FOUND ...`, `COMMAND ...`; exit 0, 1 = usage.
import { readFileSync } from 'node:fs';

const SETUP = '/brewcode:semble-setup';
const tpl = process.argv[2];
if (!tpl) {
  process.stderr.write('usage: semble-row.mjs <rule-template-path> < semble-status.json\n');
  process.exit(1);
}

let report = null;
try { report = JSON.parse(readFileSync(0, 'utf8')); } catch { report = null; }
const g = report && report.guidance;

function emit(state, signal, found, command) {
  process.stdout.write(`ROW2 ${state} ${signal}\nFOUND ${found}\nCOMMAND ${command}\n`);
}

function num(v) { return typeof v === 'number' ? v : 0; }
function str(v) { return typeof v === 'string' ? v : ''; }

if (!g || typeof g !== 'object' || g.error) {
  const why = g && g.error ? g.error : 'no guidance section in the semble-status output';
  emit('unknown', 'guidance-failed', `guidance probe failed: ${why}`, 'none (Phase 2a/2b alone decide row 2)');
  process.exit(0);
}

const rule = str(g.rule) || 'absent';
const cv = str(g.content_version);
const tcv = str(g.templateContentVersion);
const wired = num(g.wiredCount);
const want = num(g.wantCount);
const staleEntries = num(g.staleEntries);
const absolute = num(g.absoluteCount);
const retired = [...new Set([...(Array.isArray(g.retired) ? g.retired : []), ...(Array.isArray(g.retiredWired) ? g.retiredWired : [])])];
// semble-status' own staleness verdict (an absent content_version counts older): consumed, never re-derived.
const stampStale = g.ruleStampStale === true;
const ruleFile = `${str(report.projectRoot) || '<project>'}/.claude/rules/semble-first.md`;

const gaps = [];
if (rule === 'absent') gaps.push('semble-first.md absent');
if (staleEntries > 0) gaps.push(`${staleEntries} stale settings ${staleEntries === 1 ? 'entry' : 'entries'}`);
if (want > 0 && wired !== want) gaps.push(`hooks wired ${wired}/${want}`);
if (g.permissionsWired !== true) gaps.push('mcp__semble_code tools granted in no settings layer (permissionsWired false)');
const absoluteOnly = absolute > 0 && staleEntries === absolute && wired + absolute === want
  && rule !== 'absent' && g.permissionsWired === true;

if (retired.length) {
  emit('partial', 'retired', `retired: ${retired.join(', ')} - stale (remove via upgrade)`,
    `${SETUP} upgrade "remove the retired semble hooks: ${retired.join(', ')}"`);
} else if (rule === 'stale') {
  emit('stale', 'rule-stale', `semble-first.md is a byte-pristine prior-release copy (content_version ${cv || 'none'}, plugin ${tcv || 'none'})`,
    `${SETUP} upgrade "replace the prior-release semble-first.md with the current template"`);
} else if (absoluteOnly) {
  emit('partial', 'portable', `portable: ${absolute} absolute-path hook entries`,
    `${SETUP} upgrade "rewrite the ${absolute} absolute-path semble hook entries to the portable form"`);
} else if (gaps.length) {
  emit('partial', 'install', gaps.join('; '), `${SETUP} install "repair: ${gaps.join('; ')}"`);
} else if (stampStale && rule === 'user_modified') {
  emit('partial', 'edited-stale',
    `semble-first.md hand-edited (content_version ${cv || 'none'}, plugin ${tcv}): upgrade keeps it as is; never edit it on the user's behalf`,
    `none, the user decides: review \`diff -u ${ruleFile} ${tpl}\`; replace: \`${SETUP} upgrade --force\` (backs up ${ruleFile}.bak.<epoch> first)`);
} else if (stampStale) {
  emit('stale', 'stamp-stale', `semble-first.md at content_version ${cv || 'none'}, plugin ${tcv}`,
    `${SETUP} upgrade "re-sync the semble-first.md stamp to content_version ${tcv}"`);
} else if (rule === 'user_modified') {
  emit('current', 'edited-current', `semble-first.md hand-edited at the current content_version ${cv}: supported, its byte pair DIFFERS by design`,
    `${SETUP} status`);
} else {
  emit('current', 'ok', 'rule, hooks and permissions wired', `${SETUP} status`);
}
