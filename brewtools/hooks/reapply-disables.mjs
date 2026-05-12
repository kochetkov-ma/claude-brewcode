#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
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

    let dirtyProject = false;
    let dirtyGlobal = false;
    const migrated = [];

    // One-shot migration (W2-T2): move legacy skill entries from toggle-state.json
    // into ~/.claude/settings.json skillOverrides. Agent entries stay in toggle-state.
    // Idempotent: after first run no skill entries remain, so this loop is a no-op.
    // Fast-path (v3.8.0): skip dynamic import on steady-state (no skill entries).
    const hasSkillEntries = (st) =>
      st && st.disabled && Object.values(st.disabled).some(e => e && e.kind === 'skill');
    const scopes = [
      { st: projectState, isProject: true, label: 'project', path: projectStatePath(cwd) },
      { st: globalState, isProject: false, label: 'global', path: globalStatePath() }
    ];
    const needsMigration = scopes.some(s => hasSkillEntries(s.st));
    if (needsMigration) {
      try {
        const { writeOverride } = await import('../skills/skill-toggle/helpers/overrides.mjs');
        const TS = new Date().toISOString().replace(/[:.]/g, '-');
        for (const scope of scopes) {
          // Pre-migration backup: snapshot original state file BEFORE any delete.
          // Skip backup on fast-path scopes (no skill entries — nothing to back up).
          // If copy fails, abort migration for THIS scope; continue with next.
          if (!hasSkillEntries(scope.st)) {
            // no skill entries in this scope — skip backup and migration
            continue;
          }
          const backupPath = `${path.dirname(scope.path)}/toggle-state.json.bak.pre-migration-${TS}`;
          try {
            fs.copyFileSync(scope.path, backupPath);
            log('info', '[reapply-disables]', `migration_backup scope=${scope.label} path=${backupPath}`, cwd, session_id);
          } catch (copyErr) {
            log('error', '[reapply-disables]', `migration_backup_failed scope=${scope.label} error=${copyErr.message} — aborting migration for this scope`, cwd, session_id);
            continue;
          }
          for (const key of Object.keys(scope.st.disabled || {})) {
            const entry = scope.st.disabled[key];
            if (!entry || entry.kind !== 'skill') continue;
            try {
              await writeOverride(entry.plugin, entry.name, 'off');
              // Defense-in-depth: assert kind before delete in case a future
              // refactor moves the outer filter. Should never trigger today.
              if (entry.kind !== 'skill') continue;
              delete scope.st.disabled[key];
              migrated.push(key);
              if (scope.isProject) dirtyProject = true; else dirtyGlobal = true;
              log('info', '[reapply-disables]',
                `migrated kind=skill plugin=${entry.plugin} name=${entry.name} mode=off legacy_disabled_at=${entry.disabled_at || 'unknown'} source=${scope.label}`,
                cwd, session_id);
            } catch (e) {
              log('warn', '[reapply-disables]', `migrate failed ${key}: ${e.message}`, cwd, session_id);
            }
          }
        }
        if (migrated.length) {
          log('info', '[reapply-disables]', `migrated_count=${migrated.length}`, cwd, session_id);
        }
      } catch (e) {
        log('warn', '[reapply-disables]', `migration helper unavailable: ${e.message}`, cwd, session_id);
      }
    }

    const merged = mergeStates(globalState, projectState);

    if (!merged.disabled || Object.keys(merged.disabled).length === 0) {
      if (dirtyProject) writeStateAtomic(projectStatePath(cwd), projectState);
      if (dirtyGlobal) writeStateAtomic(globalStatePath(), globalState);
      if (migrated.length) {
        output({
          hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext: `[brewtools:toggle] migrated to skillOverrides: ${migrated.join(', ')}`
          }
        });
        return;
      }
      output({});
      return;
    }

    const plugins = enumeratePlugins();
    const reapplied = [];
    const drift = [];
    let alreadyOk = 0;

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
    if (migrated.length) lines.push(`migrated→skillOverrides: ${migrated.join(', ')}`);
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
