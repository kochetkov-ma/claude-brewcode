export async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  const input = JSON.parse(raw);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('hook input must be an object');
  if (process.env.NODE_ENV === 'test' && process.env.CODEX_HOOK_TEST_DELAY_MS) {
    const delay = Number(process.env.CODEX_HOOK_TEST_DELAY_MS);
    if (Number.isFinite(delay) && delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
  }
  return input;
}

export function respond(value = {}) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
