#!/usr/bin/env node
// SKILL.md contract: hint, tools, the 3 modes, phase order, the one question, each mutation in its own phase.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'SKILL.md'), 'utf8');
const FRONT = SKILL.slice(4, SKILL.indexOf('\n---\n', 4)).split('\n');
const SECTIONS = SKILL.split(/^(?=## )/m).map(s => ({ head: s.split('\n')[0], body: s, lines: s.split('\n') }));
const section = head => SECTIONS.filter(s => s.head === head).flatMap(s => s.lines);
const where = re => SECTIONS.flatMap(s => s.lines.filter(l => re.test(l)).map(l => [s.head, l]));
// Fence identity = its ✅ marker; the prune preview has none and is named by its flag.
const fenceKey = body => (body.match(/"✅ (.+?) OK"/) || body.match(/(prune --dry-run)/) || [null, null])[1];
const MUTATING = /claude plugin (update|install|uninstall|prune|enable|disable|marketplace (?:add|update|remove))/;
const P = {
    contract: '## Prompt contract', modes: '## Modes', rules: '## Critical Rules', p0: '## Phase 0 — Inventory',
    p1: '## Phase 1 — Latest Versions', p2: '## Phase 2 — Plan', p3: '## Phase 3 — One Question',
    p4: '## Phase 4 — Update, Then Install', p5: '## Phase 5 — Prune, Then the After Snapshot', p6: '## Phase 6 — Report',
};

// GIVEN the frontmatter WHEN read THEN the hint is prompt-first with the 3 modes and the tools grant one question, no Write/Edit.
assert.deepEqual({
    keys: FRONT.map(l => l.split(':')[0]),
    hint: FRONT.filter(l => l.startsWith('argument-hint:')),
    tools: FRONT.filter(l => l.startsWith('allowed-tools:')),
}, {
    keys: ['name', 'description', 'user-invocable', 'disable-model-invocation', 'argument-hint', 'allowed-tools', 'model', 'license'],
    hint: ['argument-hint: "[prompt] [update|check|all]"'],
    tools: ['allowed-tools: [Read, Bash, AskUserQuestion]'],
}, 'THEN the frontmatter keeps the house key order, the exact hint and the exact tool list');

// GIVEN the Modes table and the Prompt contract WHEN read THEN update (default), check and all are the only modes; interactive is gone.
assert.deepEqual({
    modes: section(P.modes).filter(l => l.startsWith('| `')).map(l => l.split('|').map(c => c.trim())).map(c => [c[1], c[2], c[4]]),
    fallback: where(/No hit or empty/),
    interactive: SKILL.match(/interactive/gi),
}, {
    modes: [['`update`', '*(empty)*, `update`, `upgrade`', 'yes'], ['`check`', '`check`, `status`', 'no'], ['`all`', '`all`, `everything`, `full`', 'yes']],
    fallback: [[P.contract, '   No hit or empty -> `update`.']],
    interactive: null,
}, 'THEN no keyword and an empty prompt resolve to update; check never mutates');

// GIVEN SKILL.md WHEN its level-2 headings are listed THEN the phases run 0..6 in order after the contract sections.
assert.deepEqual(SECTIONS.slice(1).map(s => s.head), Object.values(P),
    'THEN the headings are the Prompt contract, Modes, Critical Rules and Phases 0-6 in this order');

// GIVEN the one question WHEN every AskUserQuestion line and the whole Phase 3 are read THEN the wording is verbatim.
assert.deepEqual({ mentions: where(/AskUserQuestion/), phase3: section(P.p3) }, {
    mentions: [
        ['---', 'allowed-tools: [Read, Bash, AskUserQuestion]'],
        [P.contract, '3. Ask: at most ONE `AskUserQuestion` per run, at most 2 questions, only in `update` and only when'],
        [P.rules, '- AskUserQuestion: option lists only, no free-text fields.'],
        [P.p3, '`offers.mods` or `offers.plugins` -> ONE `AskUserQuestion`, `multiSelect: true`, one question per non-empty'],
    ],
    phase3: [
        P.p3,
        '',
        'The PLAN block is already printed (your first output): never repeat it. Only in `update` with a non-empty',
        '`offers.mods` or `offers.plugins` -> ONE `AskUserQuestion`, `multiSelect: true`, one question per non-empty',
        'list, in this order:',
        '',
        '| Question | Header | Options |',
        '|---|---|---|',
        '| `Install the missing mods?` | `Mods` | per `offers.mods[]`, in order: label `<name>`, description `<value>`; `migration` set -> description `<value> - replaces the codewords you used`; then `Skip` |',
        '| `Install the missing plugins?` | `Plugins` | up to 3 `offers.plugins[]`: label `<name>`, description `<value>`; more than 3 -> one option `Install all N`, description the names; then `Skip` |',
        '',
        'Install set = the chosen options. `Skip`, alone or with others, or no answer (declined, headless) ->',
        'nothing from that question; the report then prints each open offer\'s install command. `all` -> every',
        'offer, no question. No offers -> no question.',
        '',
        '',
    ],
}, 'THEN Phase 3 never re-prints the PLAN and asks once; the update itself is never asked about; Mods then Plugins, each ending with Skip');

// GIVEN the PLAN rule WHEN the lines after the H1, the Phase 0 opening and every PLAN line are read THEN the PLAN is the first output, once.
const H1 = SECTIONS[0].lines.indexOf('# Brewcode Plugin Update');
assert.deepEqual({ opening: SECTIONS[0].lines.slice(H1, H1 + 3), p0: section(P.p0).slice(0, 6), plan: where(/PLAN/) }, {
    opening: ['# Brewcode Plugin Update', '', '**First output:** the PLAN block below, as plain text, before any tool call.'],
    p0: [P.p0, '', 'The PLAN block is already above in your reply, as plain text; not yet -> print it now, before this first tool call.', '',
        '**EXECUTE** using Bash tool:', '```bash'],
    plan: [
        ['---', '**First output:** the PLAN block below, as plain text, before any tool call.'],
        [P.contract, '   Phase 2 lists offers; after the PLAN block, before the first change. The update itself is never'],
        [P.contract, 'PLAN — brewtools:plugin-update'],
        [P.p0, 'The PLAN block is already above in your reply, as plain text; not yet -> print it now, before this first tool call.'],
        [P.p3, 'The PLAN block is already printed (your first output): never repeat it. Only in `update` with a non-empty'],
    ],
}, 'THEN the body opens with the First-output line, Phase 0 repeats it before the first fence and no phase defers or repeats the block (live e2e P5)');

// GIVEN every bash fence and every mutating command line WHEN mapped to its phase THEN installs sit only in Phase 4, prune only in Phase 5.
assert.deepEqual({
    fences: SECTIONS.flatMap(s => [...s.body.matchAll(/```bash\n([\s\S]*?)```/g)].map(m => [s.head, fenceKey(m[1])])),
    commands: where(MUTATING).map(([head, line]) => [head, line.match(MUTATING)[0]]),
}, {
    fences: [
        [P.p0, 'scratch'], [P.p0, 'list'], [P.p0, 'discover'],
        [P.p1, 'marketplace update'], [P.p1, 'latest'], [P.p1, 'fetch'],
        [P.p2, 'plan'],
        [P.p4, 'update <id>'], [P.p4, 'update <id> (<scope> <projectPath>)'], [P.p4, 'marketplace add'], [P.p4, 'install <plugin>'],
        [P.p5, 'prune --dry-run'], [P.p5, 'prune (<scope> <projectPath>)'], [P.p5, 'list'],
        [P.p6, 'report'], [P.p6, 'scratch removed'],
    ],
    commands: [
        [P.p1, 'claude plugin marketplace update'],
        [P.p4, 'claude plugin update'], [P.p4, 'claude plugin update'], [P.p4, 'claude plugin uninstall'],
        [P.p4, 'claude plugin marketplace add'], [P.p4, 'claude plugin install'],
        [P.p5, 'claude plugin prune'], [P.p5, 'claude plugin prune'],
    ],
}, 'THEN each change has its own phase: refresh in 1, updates then installs in 4, prune then the after snapshot in 5');

// GIVEN the print rule WHEN the marker rule and the Phase 6 report-text lines are read THEN no fence marker reaches the printed report (live u-14 printed `✅ report OK`).
assert.deepEqual({ rules: section(P.rules).slice(10, 13), p6: section(P.p6).filter(l => /[Rr]eport text|without the `❌` line|^degraded/.test(l)) }, {
    rules: [
        '- Markers in anything you print: 🟢 done, 🔵 info, offer or next step, 🔴 failed, ⚪ unchanged or not',
        '  installed. Fence marker lines (`✅ … OK`, `❌ … degraded`, `❌ … FAILED`, `SCRATCH <dir>`) are for you',
        '  only: never copy one into a message.',
    ],
    p6: [
        'Your final message starts with the report text, character for character: no preamble, no re-worded bullet.',
        'Report text, every mode (`check` included) = the report fence output above its `✅ report OK`/`❌ report',
        'degraded` line; that line, the scratch-removed line and `SCRATCH <dir>` are never printed, not even last.',
        'Print the report text verbatim as the answer: title, table (before -> after), lines',
        'unreadable) is still the complete report: print that markdown verbatim, without the `❌` line, then the',
    ],
}, 'THEN fence markers are model-only in every mode and a degraded report is still printed in full, minus its ❌ line');
console.log('suite-default: PASS');
