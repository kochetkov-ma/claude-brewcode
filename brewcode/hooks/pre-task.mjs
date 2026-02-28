#!/usr/bin/env node
/**
 * PreToolUse hook for Task tool
 * - Injects grepai reminder for ALL agents (when .grepai/ exists)
 * - Injects ## K knowledge into sub-agent prompts (brewcode only)
 * - Injects v3 task context (phase reminder + paths) when phases/ exists
 */
import {
  readStdin,
  output,
  getKnowledgePath,
  checkLock,
  isSystemAgent,
  loadConfig,
  log
} from './lib/utils.mjs';
import { readKnowledge, compressKnowledge } from './lib/knowledge.mjs';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';

const GREPAI_REMINDER = 'grepai: USE grepai_search FIRST for code exploration';

/**
 * Parse section content from string using tag boundaries
 * Pure function - easily testable without file I/O
 * @param {string} content - File content
 * @param {string} tag - Tag name (ALL, DEV, TEST, REVIEW)
 * @returns {string} Section content or empty string
 */
function parseSectionFromContent(content, tag) {
  if (!content || !tag) return '';

  const startTag = `<!-- ${tag} -->`;
  const endTag = `<!-- /${tag} -->`;

  const startIdx = content.indexOf(startTag);
  if (startIdx === -1) return '';

  const endIdx = content.indexOf(endTag, startIdx);
  if (endIdx === -1) return '';

  const section = content.substring(startIdx + startTag.length, endIdx);

  return section
    .split('\n')
    .filter(line => !/^\s*<!--.*-->\s*$/s.test(line))
    .join('\n')
    .trim();
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

    // Only process Task tool calls
    if (!tool_input) {
      output({});
      return;
    }

    const subagentType = tool_input.subagent_type;

    // Skip if no subagent type
    if (!subagentType) {
      output({});
      return;
    }

    // Check grepai availability (for ALL agents including system agents)
    const grepaiDir = join(cwd, '.grepai');
    const hasGrepai = existsSync(grepaiDir);

    let updatedPrompt = tool_input.prompt || '';
    let modified = false;

    // 0. Inject BC_PLUGIN_ROOT for ALL agents (first injection)
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '';
    if (pluginRoot) {
      updatedPrompt = `BC_PLUGIN_ROOT=${pluginRoot}\n\n${updatedPrompt}`;
      modified = true;
      log('debug', '[pre-task]', `Injected BC_PLUGIN_ROOT for ${subagentType}`, cwd, session_id);
    }

    // 1. Inject grepai reminder for ALL agents (including Explore, Plan, etc.)
    if (hasGrepai) {
      updatedPrompt = `${GREPAI_REMINDER}\n\n${updatedPrompt}`;
      modified = true;
      log('debug', '[pre-task]', `grepai reminder for ${subagentType}`, cwd, session_id);
    }

    // 2. Inject knowledge for NON-system agents only (skip coordinator, Explore, etc.)
    const isSystem = isSystemAgent(subagentType, cwd);
    if (!isSystem) {
      const config = loadConfig(cwd);
      const lock = checkLock(cwd, session_id);

      if (lock && lock.task_path) {
        const knowledgePath = getKnowledgePath(join(cwd, lock.task_path));
        const entries = readKnowledge(knowledgePath);

        if (entries.length) {
          const knowledge = compressKnowledge(entries, config.knowledge.maxTokens);

          if (knowledge) {
            updatedPrompt = `${knowledge}\n\n${updatedPrompt}`;
            modified = true;
            log('info', '[pre-task]', `Injecting knowledge for ${subagentType} (${entries.length} entries)`, cwd, session_id);
          }
        }
      }

      // 3. Inject v3 task context (phase reminder + paths) for non-system agents
      if (lock && lock.task_path) {
        const taskDir = dirname(join(cwd, lock.task_path));
        const phasesDir = join(taskDir, 'phases');

        if (existsSync(phasesDir)) {
          const artifactsDir = join(taskDir, 'artifacts');
          const taskContext = [
            '## Task Context',
            `Task dir: ${taskDir}`,
            `Artifacts: ${artifactsDir}`,
            '',
            '> ⛔ READ the phases/ file referenced in your task description FIRST before doing any work.'
          ].join('\n');

          updatedPrompt = `${taskContext}\n\n${updatedPrompt}`;
          modified = true;
          log('debug', '[pre-task]', `Injecting v3 task context for ${subagentType}`, cwd, session_id);
        }
      }

      // 4. Inject constraints for non-system agents
      if (config.constraints?.enabled !== false && lock && lock.task_path) {
        const taskPath = join(cwd, lock.task_path);
        let taskContent = null;
        try {
          if (existsSync(taskPath)) {
            taskContent = readFileSync(taskPath, 'utf8');
          }
        } catch {}

        if (taskContent) {
          // ALL constraints apply to every non-system agent
          const allConstraints = parseSectionFromContent(taskContent, 'ALL');

          // Detect role for role-specific constraints
          const name = subagentType.toLowerCase();
          let role = null;
          if (/\b(?:test(?:er)?|qa|sdet)\b/.test(name)) {
            role = 'TEST';
          } else if (/\b(?:review(?:er)?|check(?:er)?|audit(?:or)?)\b/.test(name)) {
            role = 'REVIEW';
          } else if (/\b(?:dev(?:eloper)?|implement(?:er)?|cod(?:er|ing)|engineer|architect|build(?:er)?|fix(?:er)?)\b/.test(name)) {
            role = 'DEV';
          }

          const roleConstraints = role ? parseSectionFromContent(taskContent, role) : '';

          if (allConstraints || roleConstraints) {
            const constraintLines = [allConstraints, roleConstraints]
              .filter(c => c)
              .join('\n');

            const constraintInjection = `## Task Constraints\n${constraintLines}`;
            updatedPrompt = `${constraintInjection}\n\n${updatedPrompt}`;
            modified = true;
            log('debug', '[pre-task]', `Injecting ${role || 'ALL'} constraints for ${subagentType}`, cwd, session_id);
          }
        }
      }
    }

    // Output result - updatedInput MUST be inside hookSpecificOutput per Claude Code docs
    // Note: systemMessage removed - logs go to brewcode.log only, not UI
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
    // On error, pass through without modification
    log('error', '[pre-task]', `Error: ${error.message}`, cwd, session_id);
    output({});
  }
}

main();
