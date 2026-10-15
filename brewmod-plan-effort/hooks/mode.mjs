// Records the main loop's permission_mode for register.ts (module hooks are bypassed on Team orgs)
import { mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WEEK_MS = 7 * 24 * 3600 * 1000

try {
  const e = JSON.parse(readFileSync(0, 'utf8'))
  const root = process.env.CLAUDE_PLUGIN_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..')
  const dir = join(root, '.state')
  const ok = e && e.agent_id === undefined && typeof e.permission_mode === 'string' && typeof e.session_id === 'string' && /^[A-Za-z0-9_-]+$/.test(e.session_id)
  if (ok) {
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `mode-${e.session_id}.json`)
    // temp + rename: the module never reads a torn file
    const tmp = `${file}.${process.pid}.tmp`
    try {
      writeFileSync(tmp, JSON.stringify({ mode: e.permission_mode, ts: Date.now() }))
      renameSync(tmp, file)
    } catch (err) {
      try { unlinkSync(tmp) } catch { /* no tmp left to remove */ }
      throw err
    }
    // 7-day prune of other sessions' files and orphaned temp files; one failing entry never stops the rest
    for (const name of readdirSync(dir)) {
      if (!/^mode-[A-Za-z0-9_-]+\.json(\.\d+\.tmp)?$/.test(name)) continue
      try {
        const p = join(dir, name)
        if (Date.now() - statSync(p).mtimeMs > WEEK_MS) unlinkSync(p)
      } catch {
        // raced with another prune: skip this entry
      }
    }
  }
} catch {
  // fail open: the hook never blocks a prompt or tool batch
}
process.stdout.write('{}')
