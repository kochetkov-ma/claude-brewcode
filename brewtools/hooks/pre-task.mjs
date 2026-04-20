#!/usr/bin/env node
/**
 * PreToolUse hook for Task|Agent tools
 * Injects BT_PLUGIN_ROOT into sub-agent prompts
 * Optionally prepends think-short profile-lite directive (first 2 non-empty lines)
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readStdin, output, log as rawLog } from './lib/utils.mjs';
import { resolveEffectiveState, log as tsLog } from '../skills/think-short/helpers/state.mjs';

async function tryInjectThinkShort(updatedPrompt, tool_input, cwd, session_id) {
  const agent = tool_input.subagent_type;
  try {
    let state;
    try {
      state = await resolveEffectiveState(cwd);
    } catch (err) {
      tsLog('info', `Task(${agent}) — resolve failed (${err.message}), skipping`, cwd, session_id);
      return { prompt: updatedPrompt, injected: false };
    }

    if (state.enabled === false) {
      tsLog('info', `Task(${agent}) — SKIP (enabled=false)`, cwd, session_id);
      return { prompt: updatedPrompt, injected: false };
    }
    if (Array.isArray(state.blacklist)) {
      const agentShort = typeof agent === 'string' && agent.includes(':')
        ? agent.split(':').pop()
        : agent;
      const blocked = state.blacklist.some(b => b === agent || b === agentShort);
      if (blocked) {
        tsLog('info', `Task(${agent}) — SKIP (agent in blacklist)`, cwd, session_id);
        return { prompt: updatedPrompt, injected: false };
      }
    }

    // Resolve profile file path
    const profile = state.profile;
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
    let profilePath;
    if (pluginRoot) {
      profilePath = path.join(pluginRoot, 'skills/think-short/profiles', `${profile}.md`);
    } else {
      // Fallback: derive from this file's URL (hooks/ → up 2 → plugin root)
      const here = path.dirname(fileURLToPath(import.meta.url));
      profilePath = path.resolve(here, '..', 'skills/think-short/profiles', `${profile}.md`);
    }

    let content;
    try {
      content = await readFile(profilePath, 'utf8');
    } catch (err) {
      tsLog('info', `Task(${agent}) — profile read failed at ${profilePath} (${err.message}), skipping`, cwd, session_id);
      return { prompt: updatedPrompt, injected: false };
    }

    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0).slice(0, 2);
    if (lines.length === 0) {
      tsLog('info', `Task(${agent}) — profile empty at ${profilePath}, skipping`, cwd, session_id);
      return { prompt: updatedPrompt, injected: false };
    }

    const header = `<!-- think-short:${profile} -->\n${lines.join('\n')}\n\n`;
    const newPrompt = `${header}${updatedPrompt}`;
    const injectedLen = header.length;
    const origLen = updatedPrompt.length;

    tsLog('info', `Task(${agent}) — injecting profile-lite (~${Math.ceil(injectedLen / 4)} tok)`, cwd, session_id);
    if (process.env.CLAUDE_DEBUG === '1') {
      tsLog('info', `original prompt length=${origLen}, injected length=${injectedLen}, total=${origLen + injectedLen}`, cwd, session_id);
    }
    return { prompt: newPrompt, injected: true };
  } catch (err) {
    tsLog('info', `Task(${agent}) — unexpected error (${err.message}), skipping`, cwd, session_id);
    return { prompt: updatedPrompt, injected: false };
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
    const tool_input = input.tool_input;

    if (!tool_input || !tool_input.subagent_type) {
      output({});
      return;
    }

    let updatedPrompt = tool_input.prompt || '';
    let modified = false;

    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '';
    if (pluginRoot) {
      updatedPrompt = `BT_PLUGIN_ROOT=${pluginRoot}\n\n${updatedPrompt}`;
      modified = true;
      rawLog('debug', '[pre-task]', `Injected BT_PLUGIN_ROOT for ${tool_input.subagent_type}`, cwd, session_id);
    }

    // think-short injection (isolated — never breaks BT_PLUGIN_ROOT)
    try {
      const result = await tryInjectThinkShort(updatedPrompt, tool_input, cwd, session_id);
      if (result.injected) {
        updatedPrompt = result.prompt;
        modified = true;
      }
    } catch (err) {
      tsLog('info', `Task(${tool_input.subagent_type}) — outer guard caught (${err.message}), skipping`, cwd, session_id);
    }

    if (modified) {
      output({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          updatedInput: {
            ...tool_input,
            prompt: updatedPrompt
          }
        }
      });
    } else {
      output({});
    }
  } catch (error) {
    rawLog('error', '[pre-task]', `Error: ${error.message}`, cwd, session_id);
    output({});
  }
}

main();
