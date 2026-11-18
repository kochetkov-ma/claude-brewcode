#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import { resolveRegistry, scanDraft, expandInline, isEscaped, matchesDraftToken, nameKind } from './bridge.mjs';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const graphemes = (text) => [...segmenter.segment(text)];
const safe = (text) => String(text).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
const width = (text) => /[\p{Extended_Pictographic}\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6]/u.test(text) ? 2 : 1;

export function completionAt(registry, text, caret) {
  const { prefix, defs } = registry;
  const before = text.slice(0, caret);
  const names = [...new Set(defs.map((def) => def.name.toLowerCase()))].sort();
  const longest = names.reduce((length, name) => Math.max(length, name.length), 0);
  const earliest = Math.max(0, caret - prefix.length - longest);
  const right = text.slice(caret);
  for (let start = before.lastIndexOf(prefix); start >= earliest; start = start === 0 ? -1 : before.lastIndexOf(prefix, start - 1)) {
    const partial = before.slice(start + prefix.length).toLowerCase();
    const namesWithPrefix = names.filter((name) => name.startsWith(partial));
    if (namesWithPrefix.length === 0) continue;
    const wordTail = /^\w*$/.test(partial) ? right.match(/^\w+/)?.[0].length ?? 0 : 0;
    const symbolTail = namesWithPrefix.reduce((length, name) => {
      const tail = name.slice(partial.length);
      return nameKind(name) === 'symbol' && right.startsWith(tail) ? Math.max(length, tail.length) : length;
    }, 0);
    const end = caret + Math.max(wordTail, symbolTail);
    const left = text.slice(0, start);
    const rest = text.slice(end);
    const candidates = namesWithPrefix.filter((name) => {
      const token = prefix + name;
      return matchesDraftToken(registry, left + token + rest, name, start, start + token.length);
    });
    if (candidates.length > 0) return { start, end, candidates };
  }
  return null;
}

export function insertCompletion(registry, text, caret, name) {
  const active = completionAt(registry, text, caret);
  if (!active?.candidates.includes(name)) return { text, caret };
  const token = registry.prefix + name;
  return { text: text.slice(0, active.start) + token + text.slice(active.end), caret: active.start + token.length };
}

function cells(text, tokens, columns) {
  const lines = [{ text: '', columns: 0, start: 0, end: 0 }];
  for (const { segment, index } of graphemes(text)) {
    let line = lines.at(-1);
    if (segment === '\n') {
      line.end = index;
      lines.push({ text: '', columns: 0, start: index + 1, end: index + 1 });
      continue;
    }
    const visible = segment === '\t' ? ' '.repeat(4 - line.columns % 4) : safe(segment);
    const size = segment === '\t' ? visible.length : visible.length !== segment.length ? visible.length : width(segment);
    if (line.columns + size > columns && line.columns > 0) {
      lines.push({ text: '', columns: 0, start: index, end: index });
      line = lines.at(-1);
    }
    const known = tokens.some((token) => token.isKnown && index >= token.start && index < token.end);
    line.text += known ? `\x1b[4m${visible}\x1b[24m` : visible;
    line.columns += size;
    line.end = index + segment.length;
  }
  return lines;
}

function clipped(text, columns) {
  let result = '';
  let used = 0;
  for (const { segment } of graphemes(safe(text).replace(/\n/g, '\\n').replace(/\t/g, '    '))) {
    const size = width(segment);
    if (used + size > columns) break;
    result += segment;
    used += size;
  }
  return result;
}

function saveDraft(filename, text, renameDraft) {
  const mode = fs.statSync(filename).mode & 0o7777;
  const temporary = join(dirname(filename), `.brewmod-draft-${randomUUID()}`);
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try {
    try {
      fs.writeFileSync(fd, text, 'utf8');
      fs.fchmodSync(fd, mode);
    } finally {
      fs.closeSync(fd);
    }
    renameDraft(temporary, filename);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

export async function runEditor(filename, {
  cwd = process.cwd(), input = process.stdin, output = process.stdout, env = process.env, renameDraft = fs.renameSync,
} = {}) {
  if (!filename) throw new Error('Usage: editor.mjs <Codex draft file>');
  if (!input.isTTY || !output.isTTY) throw new Error('The placeholder editor requires an interactive terminal.');
  const draft = fs.realpathSync(filename);
  const original = fs.readFileSync(draft, 'utf8');
  let text = original;
  let caret = text.length;
  let registry = resolveRegistry({ cwd, env });
  let selected = 0;
  let selectionKey = '';
  let status = '';
  let done = false;
  let paste = null;
  let verticalColumn = null;
  let previewName = null;
  let previewTop = 0;
  let previewLength = 0;
  const previousRaw = Boolean(input.isRaw);

  const active = () => {
    const value = completionAt(registry, text, caret);
    const key = value ? `${value.start}:${value.candidates.join(',')}` : '';
    if (key !== selectionKey) { selected = 0; selectionKey = key; }
    if (value) selected = Math.min(selected, value.candidates.length - 1);
    return value;
  };

  const render = () => {
    if (done) return;
    const columns = Math.max(10, (output.columns ?? 80) - 1);
    const rows = Math.max(6, output.rows ?? 24);
    const view = scanDraft(registry, text);
    const completion = active();
    const current = view.tokens.find((token) => token.isKnown && caret >= token.start && caret <= token.end);
    const name = completion?.candidates[selected] ?? current?.name;
    const defs = registry.defs.filter((def) => def.name.toLowerCase() === name);
    if (previewName !== null) {
      const definitions = registry.defs.filter((def) => def.name.toLowerCase() === previewName);
      const body = definitions.map((def) => `${def.isPlan ? 'Plan extension body (only in Plan mode)' : 'Normal body'} · ${def.insert ?? 'context'}\n${def.body || '(empty)'}\n`).join('\n');
      const lines = cells(body || 'Definition no longer available.', [], columns);
      const page = rows - 2;
      previewLength = lines.length;
      previewTop = Math.max(0, Math.min(previewTop, lines.length - page));
      const shown = lines.slice(previewTop, previewTop + page).map((line) => line.text);
      while (shown.length < page) shown.push('');
      const screen = [
        clipped(`Full preview · ${registry.prefix}${previewName} · read-only · Esc/F2 close`, columns),
        ...shown,
        clipped(`↑/↓ scroll · PgUp/PgDn page · Home/End · ${previewTop + 1}–${Math.min(lines.length, previewTop + page)}/${lines.length}`, columns),
      ];
      output.write(`\x1b[?25l\x1b[H${screen.map((line) => `${line}\x1b[K`).join('\r\n')}\x1b[J`);
      return;
    }
    const panel = [];
    if (completion) {
      const start = Math.max(0, selected - 2);
      panel.push(completion.candidates.slice(start, start + 5).map((candidate, i) => `${i + start === selected ? '>' : ' '} ${registry.prefix}${candidate}`).join('  '));
    }
    if (name) {
      for (const def of defs) {
        panel.push(`${def.isPlan ? 'Plan extension (only in Plan mode)' : 'Body'} · ${def.insert ?? 'context'} · ${def.name}`);
        const body = String(def.body).split('\n');
        panel.push(...body.slice(0, 2));
        if (body.length > 2) panel[panel.length - 1] += ' …';
      }
    } else panel.push(`Type ${registry.prefix} to choose a placeholder.`);
    if (isEscaped(registry.prefix, text)) panel.unshift('Escape marker present: placeholders remain literal.');
    const panelSize = Math.min(Math.max(1, Math.floor(rows / 3)), panel.length);
    const draftRows = Math.max(1, rows - panelSize - 3);
    const lines = cells(text, view.tokens, columns);
    let cursorLine = lines.findLastIndex((line) => caret >= line.start);
    cursorLine = Math.max(0, cursorLine);
    const cursorColumn = cells(text.slice(lines[cursorLine].start, caret), [], columns).at(-1).columns;
    const top = Math.max(0, cursorLine - draftRows + 1);
    const shown = lines.slice(top, top + draftRows).map((line) => line.text);
    while (shown.length < draftRows) shown.push('');
    const screen = [
      clipped('Placeholders · Ctrl+S save · Esc cancel · Tab insert · F2 preview · Ctrl+R refresh', columns),
      ...shown,
      clipped(status || `Root: ${registry.root} · ↑/↓ choose · Alt+↑/↓ draft`, columns),
      ...panel.slice(0, panelSize).map((line) => clipped(line, columns)),
    ];
    output.write(`\x1b[?25l\x1b[H${screen.map((line) => `${line}\x1b[K`).join('\r\n')}\x1b[J\x1b[${cursorLine - top + 2};${Math.min(columns, cursorColumn) + 1}H\x1b[?25h`);
  };

  const refresh = () => {
    try { registry = resolveRegistry({ cwd, env }); status = ''; }
    catch (error) { status = `Refresh failed: ${error.message}`; }
    render();
  };
  const replace = (start, end, value) => {
    text = text.slice(0, start) + value + text.slice(end);
    caret = start + value.length;
    verticalColumn = null;
  };
  const moveVertical = (direction) => {
    const start = text.slice(0, caret).lastIndexOf('\n') + 1;
    const end = text.indexOf('\n', caret);
    const column = verticalColumn ?? graphemes(text.slice(start, caret)).length;
    verticalColumn = column;
    if (direction < 0 && start > 0) {
      const previous = text.lastIndexOf('\n', start - 2) + 1;
      caret = previous + graphemes(text.slice(previous, start - 1)).slice(0, column).map((part) => part.segment).join('').length;
    } else if (direction > 0 && end !== -1) {
      const next = text.indexOf('\n', end + 1);
      caret = end + 1 + graphemes(text.slice(end + 1, next === -1 ? text.length : next)).slice(0, column).map((part) => part.segment).join('').length;
    }
  };

  return await new Promise((resolve, reject) => {
    const finish = (save) => {
      try {
        if (save) {
          registry = resolveRegistry({ cwd, env });
          saveDraft(draft, expandInline(registry, text) ?? text, renameDraft);
        }
      } catch (error) { status = `Save failed: ${error.message}`; render(); return; }
      cleanup();
      resolve({ saved: save });
    };
    const onKey = (value, key = {}) => {
      if (paste !== null) {
        if (key.name !== 'paste-end') { paste += value ?? key.sequence ?? ''; return; }
        if (paste && previewName === null) replace(caret, caret, paste.replace(/\r\n?/g, '\n'));
        paste = null;
        render();
        return;
      }
      if (key.name === 'paste-start') { paste = ''; return; }
      if (key.ctrl && key.name === 'c') return finish(false);
      if (key.ctrl && key.name === 'r') return refresh();
      if (previewName !== null) {
        if (key.name === 'escape' || key.name === 'f2') previewName = null;
        else if (key.name === 'up') previewTop--;
        else if (key.name === 'down') previewTop++;
        else if (key.name === 'pageup') previewTop -= Math.max(1, (output.rows ?? 24) - 2);
        else if (key.name === 'pagedown') previewTop += Math.max(1, (output.rows ?? 24) - 2);
        else if (key.name === 'home') previewTop = 0;
        else if (key.name === 'end') previewTop = previewLength;
        render();
        return;
      }
      if (key.name === 'escape') return finish(false);
      if (key.ctrl && key.name === 's') return finish(true);
      if (key.name === 'f2') {
        const completion = active();
        previewName = completion?.candidates[selected] ?? scanDraft(registry, text).tokens.find((token) => token.isKnown && caret >= token.start && caret <= token.end)?.name ?? null;
        previewTop = 0;
        render();
        return;
      }
      const completion = active();
      if (completion && ((key.name === 'up' || key.name === 'down') && !key.meta || key.ctrl && ['p', 'n'].includes(key.name))) {
        selected = (selected + (['up', 'p'].includes(key.name) ? -1 : 1) + completion.candidates.length) % completion.candidates.length;
      } else if (key.name === 'tab' && completion) {
        ({ text, caret } = insertCompletion(registry, text, caret, completion.candidates[selected]));
      } else if (key.name === 'left') {
        caret = graphemes(text.slice(0, caret)).at(-1)?.index ?? 0;
        verticalColumn = null;
      } else if (key.name === 'right') {
        caret += graphemes(text.slice(caret))[0]?.segment.length ?? 0;
        verticalColumn = null;
      } else if (key.name === 'up' || key.name === 'down') moveVertical(key.name === 'up' ? -1 : 1);
      else if (key.name === 'home' || key.ctrl && key.name === 'a') { caret = text.slice(0, caret).lastIndexOf('\n') + 1; verticalColumn = null; }
      else if (key.name === 'end' || key.ctrl && key.name === 'e') { const end = text.indexOf('\n', caret); caret = end === -1 ? text.length : end; verticalColumn = null; }
      else if (key.name === 'backspace') replace(graphemes(text.slice(0, caret)).at(-1)?.index ?? 0, caret, '');
      else if (key.name === 'delete') replace(caret, caret + (graphemes(text.slice(caret))[0]?.segment.length ?? 0), '');
      else if (key.name === 'return' || key.name === 'enter') replace(caret, caret, '\n');
      else if (key.name === 'tab') replace(caret, caret, '\t');
      else if (!key.ctrl && !key.meta && value && !/[\x00-\x1f\x7f-\x9f]/u.test(value)) replace(caret, caret, value);
      render();
    };
    const onError = (error) => { cleanup(); reject(error); };
    const onSignal = () => finish(false);
    const onEnd = () => finish(false);
    const cleanup = () => {
      done = true;
      clearInterval(timer);
      input.removeListener('keypress', onKey);
      input.removeListener('error', onError);
      input.removeListener('end', onEnd);
      output.removeListener('resize', render);
      process.removeListener('SIGTERM', onSignal);
      process.removeListener('SIGHUP', onSignal);
      input.setRawMode(previousRaw);
      input.pause();
      output.write('\x1b[?2004l\x1b[?25h\x1b[?1049l');
    };
    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    input.on('keypress', onKey);
    input.on('error', onError);
    input.on('end', onEnd);
    output.on('resize', render);
    process.on('SIGTERM', onSignal);
    process.on('SIGHUP', onSignal);
    const timer = setInterval(refresh, 1000);
    output.write('\x1b[?1049h\x1b[?2004h');
    render();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runEditor(process.argv[2]).catch((error) => {
    process.stderr.write(`${safe(error.message)}\n`);
    process.exitCode = 1;
  });
}
