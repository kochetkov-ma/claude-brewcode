#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readStdin, output, log } from './lib/utils.mjs';

async function injectThinkShort(baseContext, cwd, session_id) {
  try {
    const { resolveEffectiveState } = await import('../skills/think-short/helpers/state.mjs');
    let state;
    try {
      state = await resolveEffectiveState(cwd);
    } catch (err) {
      log('info', '[session-start]', `think-short: state resolve failed (${err.message}), skipping injection`, cwd, session_id);
      return baseContext;
    }

    if (!state || state.enabled !== true) {
      log('info', '[session-start]', `think-short: SessionStart — SKIP (enabled=false)`, cwd, session_id);
      return baseContext;
    }

    const profile = state.profile || 'medium';
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT
      || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const profilePath = path.join(pluginRoot, 'skills/think-short/profiles', `${profile}.md`);

    let profileText;
    let usedProfile = profile;
    try {
      profileText = await readFile(profilePath, 'utf8');
    } catch {
      log('info', '[session-start]', `think-short: failed to read profile ${profilePath}, fallback to light`, cwd, session_id);
      const fallbackPath = path.join(pluginRoot, 'skills/think-short/profiles', 'light.md');
      try {
        profileText = await readFile(fallbackPath, 'utf8');
        usedProfile = 'light';
      } catch (err2) {
        log('warn', '[session-start]', `think-short: fallback light.md read failed (${err2.message}), skipping injection`, cwd, session_id);
        return baseContext;
      }
    }

    const approxTokens = Math.ceil(profileText.length / 4);
    log('info', '[session-start]', `think-short: SessionStart — injecting profile=${usedProfile} (~${approxTokens} tok)`, cwd, session_id);
    if (process.env.CLAUDE_DEBUG === '1') {
      const preview = profileText.slice(0, 80).replace(/\n/g, ' ');
      log('debug', '[session-start]', `think-short: profile preview = ${preview}`, cwd, session_id);
    }

    return `${baseContext}\n\n<!-- think-short:${usedProfile} -->\n${profileText}`;
  } catch (err) {
    log('info', '[session-start]', `think-short: injection block error (${err.message}), skipping`, cwd, session_id);
    return baseContext;
  }
}

async function main() {
  let cwd = null;
  let session_id = null;
  try {
    cwd = process.cwd();
    const input = await readStdin();
    session_id = input.session_id;
    cwd = input.cwd || cwd;

    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '';
    const sessionShort = session_id?.slice(0, 8) || 'unknown';

    let context = pluginRoot
      ? `BT_PLUGIN_ROOT=${pluginRoot}\nbrewtools: active | session: ${sessionShort}`
      : `brewtools: active | session: ${sessionShort}`;

    context = await injectThinkShort(context, cwd, session_id);

    output({
      systemMessage: `brewtools: ${pluginRoot} | session: ${sessionShort}`,
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
