/**
 * Shared utilities for brewdoc hooks
 */

/**
 * Read JSON from stdin
 * @returns {Promise<Object>} Parsed JSON input
 * @throws {Error} If stdin is empty or contains invalid JSON
 */
export async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(input);
  } catch (e) {
    throw new Error(`Invalid stdin JSON: ${e.message}. Input: ${input.substring(0, 100)}`);
  }
}

/**
 * Output hook response as JSON to stdout
 * @param {Object} response - Hook response object
 */
export function output(response) {
  try {
    console.log(JSON.stringify(response));
  } catch (e) {
    console.error(`[output] Serialization failed: ${e.message}`);
    console.log(JSON.stringify({ error: `Serialization failed: ${e.message}` }));
  }
}

/**
 * Log message to stderr
 * @param {string} level - Log level (error|warn|info|debug)
 * @param {string} prefix - Log prefix (e.g., '[hook]')
 * @param {string} message - Log message
 * @param {string} cwd - Current working directory (unused, kept for API compat)
 * @param {string|null} sessionId - Optional session ID for correlation
 */
export function log(level, prefix, message, cwd, sessionId = null) {
  const sessionTag = (typeof sessionId === 'string' && sessionId)
    ? `[${sessionId.slice(0, 8)}] `
    : '';
  console.error(`${level.toUpperCase()} ${sessionTag}${prefix} ${message}`);
}
