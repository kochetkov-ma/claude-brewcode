// Plan-mode state written by hooks/inject.mjs: <plugin root>/.state/mode-<session id>.json = {mode, ts}.

const SESSION_ID = /^[A-Za-z0-9_-]+$/

// Null = no valid path for this id (never read a file outside .state).
export function modeStatePath(pluginRoot: string, sessionId: unknown): string | null {
  return typeof sessionId === 'string' && SESSION_ID.test(sessionId) ? `${pluginRoot.replace(/[\\/]+$/, '')}/.state/mode-${sessionId}.json` : null
}

// True = plan, false = any other mode; null = unreadable or no string mode (the caller keeps its last value).
export function planFromState(raw: string): boolean | null {
  try {
    const mode: unknown = (JSON.parse(raw) as { mode?: unknown } | null)?.mode
    return typeof mode === 'string' ? mode === 'plan' : null
  } catch {
    return null
  }
}
