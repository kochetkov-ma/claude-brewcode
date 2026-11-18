#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov
import { accessSync, constants, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const args = process.argv.slice(2);
let home;
let executable = 'codex';
let printHook = false;
let printHookJson = false;
let index = 0;

try {
  while (index < args.length) {
    const option = args[index];
    if (option === '--') { index++; break; }
    if (option === '--help') {
      process.stdout.write('Usage: node launch.mjs [--home PATH] [--codex EXECUTABLE] [--print-hook|--print-hook-json] -- [CODEX ARGS]\nWithout --home, CODEX_HOME is preserved. Run from the project directory before opening Ctrl+G.\n');
      process.exit(0);
    }
    if (option === '--print-hook') { printHook = true; index++; continue; }
    if (option === '--print-hook-json') { printHookJson = true; index++; continue; }
    if (option !== '--home' && option !== '--codex') break;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
    if (option === '--home') home = resolve(value === '~' ? homedir() : value.startsWith('~/') ? join(homedir(), value.slice(2)) : value);
    else executable = value;
    index += 2;
  }
  if (printHook || printHookJson) {
    const command = `${quote(process.execPath)} ${quote(join(here, 'submit.mjs'))}`;
    if (printHookJson) process.stdout.write(`${JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command, additionalContextLimit: 0 }] }] } }, null, 2)}\n`);
    else process.stdout.write(`[[hooks.UserPromptSubmit]]\n[[hooks.UserPromptSubmit.hooks]]\ntype = "command"\ncommand = ${JSON.stringify(command)}\nadditionalContextLimit = 0\n`);
    process.exit(0);
  }
  const candidates = isAbsolute(executable) || executable.includes('/')
    ? [resolve(executable)]
    : (process.env.PATH ?? '').split(delimiter).map(path => resolve(path || '.', executable));
  const binary = candidates.find(path => {
    try { accessSync(path, constants.X_OK); return statSync(path).isFile(); } catch { return false; }
  });
  if (!binary) throw new Error(`Codex executable not found: ${executable}; use --codex /absolute/path/to/codex`);
  const env = { ...process.env, VISUAL: `${quote(process.execPath)} ${quote(join(here, 'editor.mjs'))}` };
  if (home !== undefined) env.CODEX_HOME = home;
  const result = spawnSync(binary, args.slice(index), { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.signal) process.kill(process.pid, result.signal);
  else process.exitCode = result.status ?? 1;
} catch (error) {
  process.stderr.write(`placeholders: ${error.message}\n`);
  process.exitCode = 1;
}
