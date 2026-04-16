#!/usr/bin/env node
import { readStdin, output, log } from './lib/utils.mjs';
import { readState, writeStateAtomic, mergeStates, globalStatePath, projectStatePath } from '../skills/_shared/toggle/state.mjs';
import { enumeratePlugins, resolveTarget } from '../skills/_shared/toggle/cache.mjs';
import { disableTarget, fileExists } from '../skills/_shared/toggle/apply.mjs';

async function main() {
  let cwd = process.cwd();
  let session_id = null;
  try {
    const input = await readStdin();
    session_id = input.session_id || null;
    cwd = input.cwd || cwd;

    const globalState = readState(globalStatePath());
    const projectState = readState(projectStatePath(cwd));
    const merged = mergeStates(globalState, projectState);

    if (!merged.disabled || Object.keys(merged.disabled).length === 0) {
      output({});
      return;
    }

    const plugins = enumeratePlugins();
    const reapplied = [];
    const drift = [];
    let alreadyOk = 0;
    let dirtyProject = false;
    let dirtyGlobal = false;

    for (const [key, entry] of Object.entries(merged.disabled)) {
      const p = plugins.get(entry.plugin);
      if (!p) { drift.push({ key, reason: 'plugin_not_installed' }); continue; }
      const t = resolveTarget(p, entry.kind, entry.name);
      if (!t) { drift.push({ key, reason: 'invalid_kind' }); continue; }

      // WHY dirty-flags: write-back touches only the owning file (project wins over global)
      // so we don't clobber unrelated entries or rewrite files that didn't change.
      const ownedByProject = Object.prototype.hasOwnProperty.call(projectState.disabled, key);

      if (fileExists(t.hidden)) {
        alreadyOk++;
        if (entry.last_applied_version !== p.latest) {
          if (ownedByProject) {
            projectState.disabled[key].last_applied_version = p.latest;
            dirtyProject = true;
          } else {
            globalState.disabled[key].last_applied_version = p.latest;
            dirtyGlobal = true;
          }
        }
        continue;
      }
      if (!fileExists(t.visible)) {
        drift.push({ key, reason: 'file_missing' });
        continue;
      }
      const r = disableTarget(t.visible, t.hidden);
      if (r.status === 'disabled') {
        reapplied.push({ key, to: p.latest, from: entry.last_applied_version });
        if (ownedByProject) {
          projectState.disabled[key].last_applied_version = p.latest;
          dirtyProject = true;
        } else {
          globalState.disabled[key].last_applied_version = p.latest;
          dirtyGlobal = true;
        }
      } else {
        drift.push({ key, reason: r.status || 'apply_failed' });
      }
    }

    if (dirtyProject) writeStateAtomic(projectStatePath(cwd), projectState);
    if (dirtyGlobal) writeStateAtomic(globalStatePath(), globalState);

    const lines = [];
    if (reapplied.length) lines.push(`reapplied: ${reapplied.map(r => `${r.key}→${r.to}`).join(', ')}`);
    if (drift.length) lines.push(`drift: ${drift.map(d => `${d.key}(${d.reason})`).join(', ')}`);
    if (alreadyOk) lines.push(`active: ${alreadyOk}`);

    if (lines.length === 0) { output({}); return; }

    output({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `[brewtools:toggle] ${lines.join(' | ')}`
      }
    });
  } catch (error) {
    log('error', '[reapply-disables]', `Error: ${error.message}`, cwd, session_id);
    output({});
  }
}

main();
