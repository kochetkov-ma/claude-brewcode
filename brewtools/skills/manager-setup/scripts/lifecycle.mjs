#!/usr/bin/env node
// HARD-wall lifecycle for manager-setup install/enable/uninstall/purge; the SKILL.md prelude resolves BT_ROOT/ROOT.
// Usage: node lifecycle.mjs <install|enable|uninstall|purge> <BT_ROOT> <ROOT> [CCVER] [ARM] -> one JSON line; exit 0, 1 = abort, 2 = usage.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const [action, btRoot, root, ccVerArg = '', armArg = ''] = process.argv.slice(2);
const TAG = 'brewtools-manager-guard';
const loadState = () => import(pathToFileURL(btRoot + '/hooks/lib/manager-state.mjs').href);
// A guard hook: the tagged command, or hardmode-guard.mjs in command/args (wrapped launchers).
const isGuardHook = h => typeof h.command==='string' && (h.command.includes(TAG) || [h.command, ...(Array.isArray(h.args) ? h.args : [])].join(' ').includes('hardmode-guard.mjs'));
const isGuardEntry = m => Array.isArray(m.hooks) && m.hooks.some(isGuardHook);

// settings.local.json.lock = O_EXCL dir mutex, stale-broken after 30 s; process.exit skips finally,
// so the exit hook frees it on every path. Returns release.
function lockSettings(settings, abortTail) {
  const lock = settings + '.lock';
  let held = false;
  const release = () => { if (held) { held = false; fs.rmSync(lock, {recursive:true, force:true}); } };
  process.on('exit', release);
  for (let i = 0; i < 50 && !held; i++) {
    try { fs.mkdirSync(lock); held = true; }
    catch {
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 30000) { fs.rmSync(lock, {recursive:true, force:true}); continue; } } catch {}
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  if (!held) { console.error('ABORT: ' + lock + ' is held by another setup skill — ' + abortTail); process.exit(1); }
  return release;
}

async function install() {
  const {writeState} = await loadState();
  const cwd = root;
  const arm = armArg === 'true';
  const src = btRoot + '/hooks/hardmode-guard.mjs';
  const dir = path.join(cwd, '.claude', 'brewtools', 'manager');
  const guard = path.join(dir, 'hardmode-guard.mjs');
  const helper = path.join(dir, 'manager-state.mjs');
  const settings = path.join(cwd, '.claude', 'settings.local.json');
  // Task graph: CC 2.1.233+ gates TaskCreate/Update/Get/List off unless env.CLAUDE_CODE_ENABLE_TODO_TOOLS
  // is set. Numeric compare, never string. Below 2.1.233 the key is a no-op, so skip the write.
  const ccVer = ccVerArg;
  const geVersion = (v, t) => { const a = String(v).split('.').map(n => parseInt(n, 10)); return a.length === 3 && !a.some(Number.isNaN) && (a[0] - t[0] || a[1] - t[1] || a[2] - t[2]) >= 0; };
  const todoToolsGated = geVersion(ccVer, [2,1,233]);
  let todoTools = todoToolsGated ? 'enabled (CC ' + ccVer + ')'
    : ccVer ? 'skipped — CC ' + ccVer + ' predates the 2.1.233 gate, task tools are on by default'
    : 'skipped — could not read the Claude Code version; on 2.1.233+ set env.CLAUDE_CODE_ENABLE_TODO_TOOLS=1 by hand';
  // Highest layer carrying the key decides (local > project > user), by value: its 0/false/empty is an opt-out.
  const keyIn = c => !!(c && c.env && typeof c.env==='object' && 'CLAUDE_CODE_ENABLE_TODO_TOOLS' in c.env);
  const readJson = p => { try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch { return null; } };
  const truthy = v => ['1','true','yes','on'].includes(String(v).trim().toLowerCase());
  // 1. settings lock
  fs.mkdirSync(path.dirname(settings), {recursive:true});
  const release = lockSettings(settings, 'retry in a moment; nothing was written');
  let newlyRegistered = false, addedTodoKey = false;
  try {
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(settings,'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') { console.error('ABORT: ' + settings + ' unreadable or invalid JSON (' + e.message + ') — fix it by hand; nothing was written'); process.exit(1); } }
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) { console.error('ABORT: ' + settings + ' is not a JSON object — fix it by hand; nothing was written'); process.exit(1); }
    cfg.hooks = (cfg.hooks && typeof cfg.hooks==='object') ? cfg.hooks : {};
    const arr = Array.isArray(cfg.hooks.PreToolUse) ? cfg.hooks.PreToolUse : [];
    if (!arr.some(isGuardEntry)) {
      arr.push({ matcher:'*', hooks:[{ type:'command', command:`node "${guard}" # ${TAG}`, timeout:5, onFailure:'block' }] });
      newlyRegistered = true;
    }
    // An entry written before the field existed gains it here: isGuardEntry skips it above.
    for (const m of arr) for (const h of (Array.isArray(m.hooks) ? m.hooks : [])) if (isGuardHook(h)) h.onFailure = 'block';
    cfg.hooks.PreToolUse = arr;
    // 4. task graph on, same merge — idempotent, one key, every other setting preserved.
    const win = [['.claude/settings.local.json', cfg], ['.claude/settings.json', readJson(path.join(cwd,'.claude','settings.json'))],
      ['user settings.json', readJson(path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(),'.claude'),'settings.json'))]].find(([, c]) => keyIn(c));
    if (todoToolsGated && win) { const v = win[1].env.CLAUDE_CODE_ENABLE_TODO_TOOLS; todoTools = (truthy(v) ? 'already on' : 'kept off') + ' — ' + win[0] + ' sets CLAUDE_CODE_ENABLE_TODO_TOOLS=' + JSON.stringify(v) + ', left as is'; }
    else if (todoToolsGated) { cfg.env = (cfg.env && typeof cfg.env==='object' && !Array.isArray(cfg.env)) ? cfg.env : {}; cfg.env.CLAUDE_CODE_ENABLE_TODO_TOOLS = '1'; addedTodoKey = true; }
    // 2-3. disarmed state if missing, copies, registration; a failure deletes what this run created.
    const stateFile = path.join(dir, 'state.json');
    const fresh = [stateFile, guard, helper].filter(f => !fs.existsSync(f));
    try {
      if (fresh.includes(stateFile)) await writeState('project', {hard:false}, cwd);
      fs.mkdirSync(dir, {recursive:true});
      fs.copyFileSync(src, guard);
      fs.copyFileSync(btRoot + '/hooks/lib/manager-state.mjs', helper);
      const tmp = settings + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
      fs.renameSync(tmp, settings);
    } catch (e) {
      for (const f of fresh) fs.rmSync(f, {force:true});
      for (const d of [dir, path.dirname(dir)]) { try { fs.rmdirSync(d); } catch {} }
      console.error('ABORT: install failed (' + e.message + ') — removed the files this run created; the wall is not armed');
      process.exit(1);
    }
  } finally { release(); }
  // 5. arm LAST; todoToolsAdded is purge provenance, written only when this install added the key.
  await writeState('project', addedTodoKey ? {hard:arm, todoToolsAdded:true} : {hard:arm}, cwd);
  console.log(JSON.stringify({armed:arm, guard, helper, settings, newlyRegistered, todoTools, root:cwd}));
}

async function enable() {
  const {writeState} = await loadState();
  const cwd = root;
  const settings = path.join(cwd, '.claude', 'settings.local.json');
  const guard = path.join(cwd, '.claude', 'brewtools', 'manager', 'hardmode-guard.mjs');
  let registered = false;
  try {
    const cfg = JSON.parse(fs.readFileSync(settings,'utf8'));
    const arr = cfg && cfg.hooks && Array.isArray(cfg.hooks.PreToolUse) ? cfg.hooks.PreToolUse : [];
    registered = arr.some(isGuardEntry);
  } catch (e) { if (e.code !== 'ENOENT') { console.error('ABORT: ' + settings + ' unreadable or invalid JSON (' + e.message + ') — cannot tell whether the guard is registered; fix it by hand, nothing was written'); process.exit(1); } }
  if (!registered && !fs.existsSync(guard)) { console.log(JSON.stringify({notInstalled:true})); process.exit(0); }
  const r = await writeState('project', {hard:true}, cwd);
  console.log(JSON.stringify({armed:true, registered, state:r}));
}

async function uninstall() {
  const cwd = root;
  const dir = path.join(cwd, '.claude', 'brewtools', 'manager');
  const guard = path.join(dir, 'hardmode-guard.mjs');
  const helper = path.join(dir, 'manager-state.mjs');
  const settings = path.join(cwd, '.claude', 'settings.local.json');
  fs.mkdirSync(path.dirname(settings), {recursive:true});
  const release = lockSettings(settings, 'retry in a moment; nothing was removed');
  let deregistered = false, original = null;
  try {
    // 1. deregister FIRST — a registered hook pointing at a deleted guard is the brick case.
    let cfg = {};
    try { original = fs.readFileSync(settings,'utf8'); cfg = JSON.parse(original); }
    catch (e) { if (e.code !== 'ENOENT') { console.error('ABORT: ' + settings + ' unreadable or invalid JSON (' + e.message + ') — fix it by hand; nothing was removed'); process.exit(1); } }
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) { console.error('ABORT: ' + settings + ' is not a JSON object — fix it by hand; nothing was removed'); process.exit(1); }
    if (cfg.hooks && Array.isArray(cfg.hooks.PreToolUse)) {
      const before = cfg.hooks.PreToolUse.length;
      cfg.hooks.PreToolUse = cfg.hooks.PreToolUse.filter(m => !isGuardEntry(m));
      deregistered = cfg.hooks.PreToolUse.length < before;
      if (cfg.hooks.PreToolUse.length === 0) delete cfg.hooks.PreToolUse;
      if (Object.keys(cfg.hooks).length === 0) delete cfg.hooks;
      // Nothing left in the file -> delete it rather than leave {}.
      if (deregistered && !Object.keys(cfg).length) fs.unlinkSync(settings);
      else if (deregistered) {
        const tmp = settings + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
        fs.renameSync(tmp, settings);
      }
    }
    // 2. verify the entry is really gone before touching a single file.
    let stillRegistered = false;
    try {
      const back = JSON.parse(fs.readFileSync(settings,'utf8'));
      const arr = back && back.hooks && Array.isArray(back.hooks.PreToolUse) ? back.hooks.PreToolUse : [];
      stillRegistered = arr.some(isGuardEntry);
    } catch (e) { if (e.code !== 'ENOENT') { console.error('ABORT: cannot re-read ' + settings + ' (' + e.message + ') — files were NOT deleted'); process.exit(1); } }
    if (stillRegistered) { console.error('ABORT: the guard entry is still present in ' + settings + ' — files were NOT deleted'); process.exit(1); }
    // 3. only now delete the copied guard + off-switch CLI. A failed delete is rolled back:
    //    the registration goes home, so the project is never left half-guarded.
    try {
      if (fs.existsSync(guard)) fs.unlinkSync(guard);
      if (fs.existsSync(helper)) fs.unlinkSync(helper);
      // rmdir refuses a non-empty dir: only an emptied manager/ and .claude/brewtools/ go.
      for (const d of [dir, path.dirname(dir)]) { try { fs.rmdirSync(d); } catch {} }
    } catch (e) {
      if (original !== null) fs.writeFileSync(settings, original, 'utf8');
      console.error('ABORT: could not delete ' + guard + ' / ' + helper + ' (' + e.message + ') — the settings entry was restored; fix permissions and rerun');
      process.exit(1);
    }
  } finally { release(); }
  console.log(JSON.stringify({deregistered, settings, guardDeleted:!fs.existsSync(guard), helperDeleted:!fs.existsSync(helper), root:cwd}));
}

async function purge() {
  const {resolveState} = await loadState();
  const cwd = root;
  const dir = path.join(cwd, '.claude', 'brewtools', 'manager');
  const settings = path.join(cwd, '.claude', 'settings.local.json');
  // Same ordering rule as uninstall: never delete the tree while the hook is still
  // registered — the guard fails closed and a registered-but-missing guard bricks the session.
  let stillRegistered = false;
  try {
    const cfg = JSON.parse(fs.readFileSync(settings,'utf8'));
    const arr = cfg && cfg.hooks && Array.isArray(cfg.hooks.PreToolUse) ? cfg.hooks.PreToolUse : [];
    stillRegistered = arr.some(isGuardEntry);
  } catch (e) { if (e.code !== 'ENOENT') { console.error('ABORT: ' + settings + ' unreadable or invalid JSON (' + e.message + ') — nothing deleted'); process.exit(1); } }
  if (stillRegistered) { console.error('ABORT: the guard is still registered in ' + settings + ' — run uninstall (steps 1 and 2) first; nothing deleted'); process.exit(1); }
  // Provenance: install/upgrade set todoToolsAdded only when the key was absent before their write.
  // Settings first, tree second: a lock abort leaves that flag in state.json for the rerun.
  const todoToolsAdded = resolveState(cwd).todoToolsAdded === true;
  let todoKeyRemoved = false, todoKeyKept = null, bakRemoved = false, settingsRemoved = false;
  // No .claude/ dir: no settings, no .bak and nowhere to put the lock, so nothing to purge there.
  const claudeDir = (() => { try { return fs.statSync(path.join(cwd, '.claude')).isDirectory(); } catch { return false; } })();
  if (claudeDir) {
    const release = lockSettings(settings, 'nothing deleted; rerun purge');
    try {
      let cfg = null;
      try { cfg = JSON.parse(fs.readFileSync(settings,'utf8')); }
      catch (e) { if (e.code !== 'ENOENT') { console.error('ABORT: ' + settings + ' unreadable or invalid JSON (' + e.message + ') — the key was NOT removed'); process.exit(1); } }
      const isObj = cfg && typeof cfg === 'object' && !Array.isArray(cfg);
      if (isObj && cfg.env && typeof cfg.env === 'object' && 'CLAUDE_CODE_ENABLE_TODO_TOOLS' in cfg.env) {
        if (todoToolsAdded) {
          delete cfg.env.CLAUDE_CODE_ENABLE_TODO_TOOLS;
          if (Object.keys(cfg.env).length === 0) delete cfg.env;
          todoKeyRemoved = true;
        } else todoKeyKept = 'task-graph key kept: it was set before install, or by an install that recorded no provenance';
      }
      // An empty object holds no setting: delete the file instead of leaving {}.
      if (isObj && !Object.keys(cfg).length) { fs.unlinkSync(settings); settingsRemoved = true; }
      else if (todoKeyRemoved) {
        const tmp = settings + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
        fs.renameSync(tmp, settings);
      }
      // Backup file older releases of this skill wrote; current blocks write none.
      bakRemoved = fs.existsSync(settings + '.bak');
      fs.rmSync(settings + '.bak', {force:true});
    } finally { release(); }
  }
  // Everything but prompts/ (the mod's legacy overrides): entries go one by one, then empty dirs.
  const removedDir = fs.existsSync(dir);
  if (removedDir) for (const e of fs.readdirSync(dir)) if (e !== 'prompts') fs.rmSync(path.join(dir, e), {recursive:true, force:true});
  const promptsKept = fs.existsSync(path.join(dir, 'prompts'));
  for (const d of [dir, path.dirname(dir), path.join(cwd, '.claude')]) { try { fs.rmdirSync(d); } catch {} }
  console.log(JSON.stringify({removedDir, dir, promptsKept, todoKeyRemoved, todoKeyKept, bakRemoved, settingsRemoved}));
}

const ACTIONS = {install, enable, uninstall, purge};
if (!Object.hasOwn(ACTIONS, action) || process.argv.length < 5) {
  console.error('Usage: node lifecycle.mjs <install|enable|uninstall|purge> <BT_ROOT> <ROOT> [CCVER] [ARM]');
  process.exit(2);
}
await ACTIONS[action]();
