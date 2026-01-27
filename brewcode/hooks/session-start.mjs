#!/usr/bin/env node
/**
 * SessionStart hook - logs session ID, symlinks latest plan on clear
 *
 * LATEST PLAN SYMLINK LOGIC:
 * ─────────────────────────
 * When user exits Plan Mode, Claude offers "Clear session and start work".
 * If user chooses Clear → SessionStart fires with source='clear'.
 *
 * Flow:
 * 1. EnterPlanMode → Claude writes plan to ~/.claude/plans/<name>.md
 * 2. ExitPlanMode → Claude offers "Clear session?" option
 * 3. User clicks Clear → SessionStart(source='clear')
 * 4. This hook creates .claude/plans/LATEST.md → ~/.claude/plans/<newest>.md
 *
 * Conditions:
 * - Only on source='clear' (not on init/resume)
 * - Only if plan modified < 60 seconds ago (fresh plan)
 * - Symlink points to global plan file for easy access from project
 *
 * Cleanup: /brewcode:teardown removes .claude/plans/ directory
 */
import { readStdin, output, log, getActiveTaskPath } from './lib/utils.mjs';
import { readdirSync, statSync, mkdirSync, symlinkSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PLAN_FRESHNESS_MS = 60_000;

/**
 * Creates symlink .claude/plans/LATEST.md → ~/.claude/plans/<newest>.md
 * Only if newest plan is < 60 seconds old (fresh from Plan Mode)
 */
function linkLatestPlan(cwd) {
  const globalPlansDir = join(homedir(), '.claude', 'plans');
  const projectPlansDir = join(cwd, '.claude', 'plans');
  const latestLink = join(projectPlansDir, 'LATEST.md');

  if (!existsSync(globalPlansDir)) return null;

  const plans = readdirSync(globalPlansDir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      try {
        const p = join(globalPlansDir, f);
        return { name: f, path: p, mtime: statSync(p).mtime };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);

  if (plans.length === 0) return null;

  const latest = plans[0];
  const ageMs = Date.now() - latest.mtime.getTime();

  if (ageMs > PLAN_FRESHNESS_MS) return null;

  mkdirSync(projectPlansDir, { recursive: true });

  try { unlinkSync(latestLink); } catch {}
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

    log('info', '[session-start]', `Started: ${session_id?.slice(0, 8) || 'unknown'} (${source})`, cwd, session_id);

    if (source === 'clear' && cwd) {
      try {
        const linked = linkLatestPlan(cwd);
        if (linked) {
          log('info', '[session-start]', `Linked: .claude/plans/LATEST.md -> ${linked}`, cwd, session_id);
        }
      } catch (e) {
        log('warn', '[session-start]', `Plan linking failed: ${e.message}`, cwd, session_id);
      }
    }

    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '';
    const sessionShort = session_id?.slice(0, 8) || 'unknown';

    let context = pluginRoot
      ? `BC_PLUGIN_ROOT=${pluginRoot}\nbrewcode: active | session: ${sessionShort}`
      : `brewcode: active | session: ${sessionShort}`;

    if (source === 'compact' && cwd && getActiveTaskPath(cwd)) {
      context += '\n\n[HANDOFF after compact] Re-read PLAN.md and KNOWLEDGE.jsonl, then continue current phase.';
    }

    output({
      systemMessage: `brewcode: ${pluginRoot} | session: ${sessionShort}`,
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: context
      }
    });
  } catch (error) {
    log('error', '[session-start]', `Error: ${error.message}`, cwd, session_id);
    output({});
  }
}

main();
