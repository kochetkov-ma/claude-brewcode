/**
 * Knowledge compression and management for focus-task hooks
 */
import { readFileSync, existsSync, writeFileSync, appendFileSync, renameSync } from 'fs';

/**
 * Read KNOWLEDGE.jsonl entries
 * @param {string} knowledgePath - Path to KNOWLEDGE.jsonl
 * @returns {Array<Object>} Array of knowledge entries
 */
export function readKnowledge(knowledgePath) {
  if (!existsSync(knowledgePath)) return [];

  const content = readFileSync(knowledgePath, 'utf8');
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(entry => entry !== null);
}

/**
 * Append entry to KNOWLEDGE.jsonl
 * @param {string} knowledgePath - Path to KNOWLEDGE.jsonl
 * @param {Object} entry - Entry to append
 * @returns {boolean} True if successful
 */
export function appendKnowledge(knowledgePath, entry) {
  try {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      ...entry
    }) + '\n';
    appendFileSync(knowledgePath, line);
    return true;
  } catch (e) {
    console.error(`[appendKnowledge] Failed: ${e.message}`);
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
      const key = e.txt?.substring(0, 50) || '';
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

  // Format entries by category
  const formatCategory = (entries, prefix) => {
    if (!entries.length) return '';
    const items = entries.map(e => truncate(e.txt)).filter(t => t);
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
 * @returns {boolean} True if compaction was performed
 */
export function localCompact(knowledgePath, maxEntries = 100) {
  if (!existsSync(knowledgePath)) return false;

  const entries = readKnowledge(knowledgePath);
  const threshold = Math.floor(maxEntries / 2);
  if (entries.length < threshold) return false; // Only compact if > 50% of max

  // Deduplicate by txt field, keeping most recent
  const seen = new Map();
  for (const entry of entries) {
    const key = `${entry.cat || ''}:${String(entry.txt || '').substring(0, 100)}`;
    const existing = seen.get(key);
    const entryDate = new Date(entry.ts);
    const existingDate = existing ? new Date(existing.ts) : null;
    // Skip invalid dates
    if (isNaN(entryDate.getTime())) continue;
    if (!existing || !existingDate || isNaN(existingDate.getTime()) || entryDate > existingDate) {
      seen.set(key, entry);
    }
  }

  // Sort by priority (❌ first) then by timestamp
  const priorityOrder = { '❌': 0, '✅': 1, 'ℹ️': 2 };
  const compacted = Array.from(seen.values())
    .sort((a, b) => {
      const pA = priorityOrder[a.t] ?? 3;
      const pB = priorityOrder[b.t] ?? 3;
      if (pA !== pB) return pA - pB;
      return new Date(b.ts) - new Date(a.ts);
    })
    .slice(0, maxEntries);

  // Atomic write: write to temp file, then rename
  try {
    const output = compacted.map(e => JSON.stringify(e)).join('\n') + '\n';
    const tmpPath = knowledgePath + '.tmp';
    writeFileSync(tmpPath, output);
    renameSync(tmpPath, knowledgePath);
    return true;
  } catch (e) {
    console.error(`[localCompact] Write failed: ${e.message}`);
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
    cat: 'handoff',
    t: 'ℹ️',
    txt: `Handoff at phase ${phase}: ${reason}`,
    src: 'pre-compact-hook'
  });
}
