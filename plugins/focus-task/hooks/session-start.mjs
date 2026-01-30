#!/usr/bin/env node
/**
 * SessionStart hook - logs session ID, symlinks latest plan on clear
 */
import { readStdin, output, log } from './lib/utils.mjs';
import { readdirSync, statSync, mkdirSync, symlinkSync, unlinkSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';

function linkLatestPlan(cwd) {
  const globalPlansDir = join(homedir(), '.claude', 'plans');
  const projectPlansDir = join(cwd, '.claude', 'plans');
  const latestLink = join(projectPlansDir, 'LATEST.md');

  if (!existsSync(globalPlansDir)) return null;

  const plans = readdirSync(globalPlansDir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({ name: f, path: join(globalPlansDir, f), mtime: statSync(join(globalPlansDir, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);

  if (plans.length === 0) return null;

  const latest = plans[0];
  const ageMs = Date.now() - latest.mtime.getTime();

  if (ageMs > 60000) return null;

  mkdirSync(projectPlansDir, { recursive: true });

  if (existsSync(latestLink)) unlinkSync(latestLink);
  symlinkSync(latest.path, latestLink);

  return latest.name;
}

async function main() {
  let cwd = null;
  let session_id = null;

  try {
    cwd = process.cwd();
    const input = await readStdin();
    session_id = input.session_id;
    cwd = input.cwd || cwd;
    const source = input.source;

    log('info', '[session]', `Started: ${session_id?.slice(0, 8) || 'unknown'} (${source})`, cwd, session_id);

    if (source === 'clear' && cwd) {
      const linked = linkLatestPlan(cwd);
      if (linked) {
        log('info', '[plan]', `Linked: .claude/plans/LATEST.md -> ${linked}`, cwd, session_id);
      }
    }

    output({
      systemMessage: `session: ${session_id?.slice(0, 8) || 'unknown'} started`
    });
  } catch (error) {
    log('error', '[session-start]', `Error: ${error.message}`, cwd, session_id);
    output({});
  }
}

main();
