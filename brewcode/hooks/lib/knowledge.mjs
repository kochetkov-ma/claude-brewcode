/**
 * Knowledge compression and management for brewcode hooks
 */
import { readFileSync, existsSync, writeFileSync, appendFileSync, renameSync } from 'fs';
import { log } from './utils.mjs';

const BLOCKLIST_PATTERNS = [
  /^(Working|Starting|Completed|Finished|Beginning)/i,
  /^(Let me|I will|I am|I'll)/i,
  /^(Looks? good|LGTM|Done|Fixed)/i,
  /^Phase \d+/i,
  /^Task (completed|done|finished)/i,
  /^(Now|Next|Then) (I|we|let)/i
];

/**
 * Validate a knowledge entry before appending
 * @param {Object} entry - Entry to validate
 * @returns {{valid: boolean, reason?: string}} Validation result
 */
function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') return { valid: false, reason: 'not an object' };
  if (!entry.txt || typeof entry.txt !== 'string') return { valid: false, reason: 'missing txt' };
  if (!entry.t) return { valid: false, reason: 'missing type' };
  // src is optional; if provided, must be a string
  if (entry.src !== undefined && typeof entry.src !== 'string') return { valid: false, reason: 'invalid src type' };
  for (const pattern of BLOCKLIST_PATTERNS) {
    if (pattern.test(entry.txt)) return { valid: false, reason: `blocklist: ${entry.txt.slice(0, 30)}` };
  }
  return { valid: true };
}

/**
 * Derive cwd from knowledge path
 * @param {string} knowledgePath - Path like /path/.claude/tasks/*_task/KNOWLEDGE.jsonl
 * @returns {string} Project root directory
 */
function deriveCwd(knowledgePath) {
  return knowledgePath.replace(/\/\.claude\/tasks\/.*$/, '');
}

/**
 * Read KNOWLEDGE.jsonl entries
 * @param {string} knowledgePath - Path to KNOWLEDGE.jsonl
 * @returns {Array<Object>} Array of knowledge entries
 */
export function readKnowledge(knowledgePath) {
  if (!existsSync(knowledgePath)) return [];

  let content;
  try {
    content = readFileSync(knowledgePath, 'utf8');
  } catch (e) {
    const cwd = deriveCwd(knowledgePath);
    log('warn', '[knowledge]', `Failed to read ${knowledgePath}: ${e.message}`, cwd);
    return [];
  }
  const cwd = deriveCwd(knowledgePath);
  let invalidCount = 0;

  const entries = content
    .split('\n')
    .map((line, idx) => ({ line, fileLineNum: idx + 1 }))
    .filter(({ line }) => line.trim())
    .map(({ line, fileLineNum }) => {
      try {
        return JSON.parse(line);
      } catch (e) {
        invalidCount++;
        if (invalidCount <= 3) {
          log('warn', '[knowledge]', `Invalid JSON at line ${fileLineNum}: ${line.slice(0, 50)}...`, cwd);
        }
        return null;
      }
    })
    .filter(entry => entry !== null)
    .map(entry => {
      if (entry && !entry.t) entry.t = 'ℹ️';
      return entry;
    });

  if (invalidCount > 3) {
    log('warn', '[knowledge]', `${invalidCount} total invalid lines in KNOWLEDGE.jsonl`, cwd);
  }

  return entries;
}

/**
 * Append entry to KNOWLEDGE.jsonl
 * @param {string} knowledgePath - Path to KNOWLEDGE.jsonl
 * @param {Object} entry - Entry to append
 * @param {string|null} cwd - Optional working directory for logging
 * @returns {boolean} True if successful
 */
export function appendKnowledge(knowledgePath, entry, cwd = null) {
  try {
    const validation = validateEntry(entry);
    if (!validation.valid) {
      log('debug', '[knowledge]', `Skipped invalid entry: ${validation.reason}`, cwd || deriveCwd(knowledgePath));
      return false;
    }
    const line = JSON.stringify({
      ...entry,
      ts: entry.ts || new Date().toISOString()
    }) + '\n';
    appendFileSync(knowledgePath, line);
    return true;
  } catch (e) {
    const logCwd = cwd || deriveCwd(knowledgePath);
    log('error', '[knowledge]', `appendKnowledge failed: ${e.message}`, logCwd);
    return false;
  }
}

/**
 * Compress knowledge entries to ## K format for injection
 * Max ~500 tokens, priorities: ❌ > ✅ > ℹ️
 * @param {Array<Object>} entries - Knowledge entries
 * @param {number} maxTokens - Maximum tokens (approximate)
 * @returns {string} Compressed ## K format
 */
export function compressKnowledge(entries, maxTokens = 500) {
  if (!entries.length) return '';

  // Group by type (t field)
  const avoid = entries.filter(e => e.t === '❌');
  const best = entries.filter(e => e.t === '✅');
  const info = entries.filter(e => e.t === 'ℹ️');

  // Deduplicate by txt field
  const dedupe = (arr) => {
    const seen = new Set();
    return arr.filter(e => {
      const key = e.txt?.substring(0, 100) || '';
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const avoidDeduped = dedupe(avoid).slice(0, 10);
  const bestDeduped = dedupe(best).slice(0, 10);
  const infoDeduped = dedupe(info).slice(0, 10);

  // Truncate text to max 50 chars
  const truncate = (txt) => {
    if (!txt) return '';
    return txt.length > 50 ? txt.substring(0, 47) + '...' : txt;
  };

  // Format entries by type
  const formatCategory = (entries, prefix) => {
    if (!entries.length) return '';
    const items = entries.map(e => truncate(e.txt)).filter(t => t);
    if (!items.length) return '';
    return `${prefix} ${items.join('|')}`;
  };

  const lines = [
    formatCategory(avoidDeduped, '❌'),
    formatCategory(bestDeduped, '✅'),
    formatCategory(infoDeduped, 'ℹ️')
  ].filter(line => line);

  if (!lines.length) return '';

  // Estimate tokens (rough: 1 token ≈ 4 chars)
  let result = '## K\n' + lines.join('\n');
  const estimatedTokens = Math.ceil(result.length / 4);

  // If over budget, progressively remove items
  if (estimatedTokens > maxTokens) {
    // Remove info first, then best, keeping avoid
    const reduced = [
      formatCategory(avoidDeduped.slice(0, 5), '❌'),
      formatCategory(bestDeduped.slice(0, 5), '✅'),
      formatCategory(infoDeduped.slice(0, 3), 'ℹ️')
    ].filter(line => line);
    result = '## K\n' + reduced.join('\n');
  }

  return result;
}

/**
 * Perform local knowledge compaction (dedup + truncate) with atomic write
 * @param {string} knowledgePath - Path to KNOWLEDGE.jsonl
 * @param {number} maxEntries - Maximum entries to keep (from config)
 * @param {string|null} cwd - Optional working directory for logging
 * @returns {boolean} True if compaction was performed
 */
export function localCompact(knowledgePath, maxEntries = 100, cwd = null) {
  if (!existsSync(knowledgePath)) return false;

  const entries = readKnowledge(knowledgePath);
  const threshold = Math.floor(maxEntries * 0.8);
  if (entries.length < threshold) return false; // Only compact if > 80% of max

  // Deduplicate by txt field, keeping most recent
  const seen = new Map();
  for (const entry of entries) {
    const key = String(entry.txt || '').substring(0, 100);
    const existing = seen.get(key);
    const entryDate = new Date(entry.ts);
    if (isNaN(entryDate.getTime())) {
      entry.ts = new Date(0).toISOString();
    }
    const validDate = new Date(entry.ts);
    const existingDate = existing ? new Date(existing.ts) : null;
    if (!existing || !existingDate || isNaN(existingDate.getTime()) || validDate > existingDate) {
      seen.set(key, entry);
    }
  }

  // Sort by priority (❌ first) then by timestamp
  const priorityOrder = { '❌': 0, '✅': 1, 'ℹ️': 2 };
  let compacted = Array.from(seen.values())
    .sort((a, b) => {
      const pA = priorityOrder[a.t] ?? 3;
      const pB = priorityOrder[b.t] ?? 3;
      if (pA !== pB) return pA - pB;
      return new Date(b.ts) - new Date(a.ts);
    });

  // Slice to maxEntries (already sorted by priority + recency)
  compacted = compacted.slice(0, maxEntries);

  // Atomic write: write to temp file, then rename
  try {
    const output = compacted.map(e => JSON.stringify(e)).join('\n') + '\n';
    const tmpPath = knowledgePath + '.tmp';
    writeFileSync(tmpPath, output);
    renameSync(tmpPath, knowledgePath);
    return true;
  } catch (e) {
    const logCwd = cwd || deriveCwd(knowledgePath);
    log('error', '[knowledge]', `localCompact write failed: ${e.message}`, logCwd);
    return false;
  }
}

/**
 * Write handoff entry to KNOWLEDGE.jsonl
 * @param {string} knowledgePath - Path to KNOWLEDGE.jsonl
 * @param {number} phase - Current phase number
 * @param {string} reason - Handoff reason
 */
export function writeHandoffEntry(knowledgePath, phase, reason = 'context compact') {
  appendKnowledge(knowledgePath, {
    t: '✅',
    txt: `Handoff at phase ${phase}: ${reason}`,
    src: 'pre-compact-hook'
  });
}
