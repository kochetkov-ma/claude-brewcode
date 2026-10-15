#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brokenLinks, rebaseLinks, relativeLinks } from '../scripts/markdown-links.mjs';

const MARKDOWN = [
  '<p><img src="../../../assets/demo.gif" width="8"></p>',
  'See [ref](references/a.md "title"), [install](../../README.md#install) and <a href="../gone.md">gone</a>.',
  'Absolute [site](https://example.com/x.md), [anchor](#top), [mail](mailto:a@b.c), [root](/abs.md).',
  'Inline `[code](inline.md)` is not a link.',
  '<!-- [comment](comment.md) -->',
  '```markdown',
  '[fenced](fenced.md)',
  '```',
  ''
].join('\n');
const SOURCE = ['p', 'skills', 's', 'README.md'];
const TARGET = ['p', '.codex', 'skills', 's', 'README.md'];

function fixtureRepo(files) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'markdown-links-')));
  for (const file of files) {
    mkdirSync(join(root, file.endsWith('/') ? file : join(file, '..')), { recursive: true });
    if (!file.endsWith('/')) writeFileSync(join(root, file), 'x\n');
  }
  return root;
}

function rebaseInFixture(files, text) {
  const root = fixtureRepo(files);
  const result = rebaseLinks(text, join(root, ...SOURCE), join(root, ...TARGET));
  rmSync(root, { recursive: true, force: true });
  return result;
}

function urls(text) {
  return relativeLinks(text).map((link) => link.url);
}

const tests = [
  ['GIVEN markdown with links in prose, code and comments WHEN listing relative links THEN only rendered relative targets are returned', () => {
    const links = relativeLinks(MARKDOWN).map(({ url, target, suffix }) => ({ url, target, suffix }));
    assert.deepEqual(links, [
      { url: '../../../assets/demo.gif', target: '../../../assets/demo.gif', suffix: '' },
      { url: 'references/a.md', target: 'references/a.md', suffix: '' },
      { url: '../../README.md#install', target: '../../README.md', suffix: '#install' },
      { url: '../gone.md', target: '../gone.md', suffix: '' }
    ], 'relative links');
  }],
  ['GIVEN a skill README copied one level deeper WHEN rebasing THEN links broken only at the destination keep their repo target and the rest stay as is', () => {
    const files = ['assets/demo.gif', 'p/README.md', 'p/skills/s/references/a.md', 'p/.codex/skills/s/references/a.md'];
    const expected = MARKDOWN
      .replace('src="../../../assets/demo.gif"', 'src="../../../../assets/demo.gif"')
      .replace('](../../README.md#install)', '](../../../README.md#install)');
    assert.deepEqual(rebaseInFixture(files, MARKDOWN), { text: expected, missing: ['../gone.md'] }, 'rebased text and unresolved links');
  }],
  ['GIVEN a markdown file in a fixture repo WHEN checking links THEN only the target absent from the repo is broken', () => {
    const root = fixtureRepo(['assets/demo.gif', 'p/README.md', 'p/skills/s/references/a.md']);
    const broken = brokenLinks(MARKDOWN, join(root, ...SOURCE)).map((link) => link.url);
    rmSync(root, { recursive: true, force: true });
    assert.deepEqual(broken, ['../gone.md'], 'broken links');
  }],
  ['GIVEN a sibling-skill link that resolves at the destination WHEN rebasing THEN it is left as is', () => {
    const text = '[dir](../t/) and [file](../t/x.md)\n';
    const files = ['p/skills/t/x.md', 'p/.codex/skills/t/x.md'];
    assert.deepEqual(rebaseInFixture(files, text), { text, missing: [] }, 'sibling links untouched');
  }],
  ['GIVEN fences nested in a list item and a quote and inline code over two lines WHEN listing links THEN none is returned', () => {
    const text = [
      '- item',
      '',
      '    ```markdown',
      '    [nested](nested.md)',
      '    ```',
      '',
      '> ```markdown',
      '> [quoted](quoted.md)',
      '> ```',
      '',
      'Run `cmd',
      '[span](span.md)` now.',
      ''
    ].join('\n');
    assert.deepEqual(urls(text), [], 'links inside code');
  }],
  ['GIVEN comment markers inside inline code and code inside a comment WHEN listing links THEN only the prose link is returned', () => {
    const text = 'Use `<!--` then [a](../../README.md) then `-->`.\n<!-- `x` [hidden](h.md) -->\n';
    assert.deepEqual(urls(text), ['../../README.md'], 'prose link only');
  }],
  ['GIVEN a directory link with a trailing slash and a literal percent file WHEN rebasing THEN slash and spelling are kept', () => {
    const text = '[d](../../docs/) [p](../../100%.md) [e](../../a%20b.md)\n';
    const files = ['p/docs/', 'p/100%.md', 'p/a b.md'];
    assert.deepEqual(rebaseInFixture(files, text), { text: '[d](../../../docs/) [p](../../../100%.md) [e](../../../a%20b.md)\n', missing: [] }, 'rebased spelling');
  }],
  ['GIVEN a template placeholder link WHEN checking and rebasing THEN it is skipped by both', () => {
    const text = '[t](../{name}/README.md) <img src="{ROOT}/x.gif">\n';
    const root = fixtureRepo([]);
    const broken = brokenLinks(text, join(root, ...SOURCE)).map((link) => link.url);
    rmSync(root, { recursive: true, force: true });
    assert.deepEqual({ broken, rebased: rebaseInFixture([], text) }, { broken: [], rebased: { text, missing: [] } }, 'placeholders skipped');
  }],
  ['GIVEN a reference definition, a footnote and an unquoted img src WHEN listing links THEN the definition and the src are returned', () => {
    const text = '[r]: ../../README.md "title"\n[^1]: Layout includes margins.\n<img src=../../demo.gif width=8>\n';
    assert.deepEqual(urls(text), ['../../README.md', '../../demo.gif'], 'reference and unquoted src');
  }]
];

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`ok - ${name}`); } catch (error) { failed += 1; console.error(`not ok - ${name}\n${error.message}`); }
}
process.exit(failed ? 1 : 0);
