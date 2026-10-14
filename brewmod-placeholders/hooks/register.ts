import { atom, read, update } from 'claude-code'
import type { On, PluginOptions, Register } from 'claude-code'
import { editorMatchers, getEditorEntries, setEditorEntries } from './lib/editor-state'
import { highlight, optionColor, sameView, suggest, type EditorStyle, type Highlight } from './lib/editor'
import { validatePrefix, type PlaceholderView } from './lib/match'
import { SYNTHETIC_PROMPT, assembleBlocks, injectOnce, memoCompile, type Built, type Compiled } from './lib/assemble'
import { configDirOf, loadRegistry, newRegistryCache, toEditorEntries, type Registry } from './lib/defs'
import { isPlan, resetMode, type ModeTracker } from './lib/mode'
import { bandRows, renderBand } from './lib/band'
import { runCommand } from './lib/command'
import { expandInline, isInlineSubmit, unknownMessage, unknownTokens } from './lib/inline'

export const register: Register = (on, options) => {
  registerEditor(on, options) // T2.6 editor UX
  registerClassic(on, options) // T2.4 classic expansion + mode
  registerBand(on, options) // T2.7 preview band
  registerCommand(on, options) // T2.8 /placeholders command
  registerInline(on, options) // T2.9 inline expansion on submit
}

// ===== T2.6 editor UX: prompt.edit highlight + prompt.autocomplete typeahead (owner: T2.6) =====
// The scan only reads atoms declared in this file; the T2.7 band reads this same const.
const viewAtom = atom({ plugin: 'brewmod-placeholders', key: 'view' } as const, { tokens: [] })
let shown: PlaceholderView | null = null // module level so T2.9 can forget it after a view reset; register() clears it

function registerEditor(on: On, options: PluginOptions): void {
  const prefix = validatePrefix(options.prefix).prefix
  const style: EditorStyle = { knownColor: optionColor(options.knownColor, 'suggestion'), unknownColor: optionColor(options.unknownColor, 'warning') }
  shown = null

  // Zero I/O except the view atom, written only when the token view changes.
  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    let h: Highlight
    try {
      h = highlight(editorMatchers(prefix), r.text, style)
    } catch {
      return r
    }
    try {
      if (shown === null || !sameView(h.view, shown)) {
        await update($, viewAtom, () => h.view)
        shown = h.view
      }
    } catch {
      // state write failed: keep the highlight, retry on the next edit
    }
    return h.decorations.length === 0 ? r : { ...r, decorations: [...(r.decorations ?? []), ...h.decorations] }
  })

  on('prompt.autocomplete', { token: /^[^\w\s]{2}/ }, async ($, e, next) => {
    const r = await next(e)
    try {
      const rows = suggest(prefix, e.token, getEditorEntries())
      return rows.length === 0 ? r : { suggestions: [...r.suggestions, ...rows] }
    } catch {
      return r
    }
  })
}
// ===== end T2.6 =====

// ===== T2.4 classic expansion + exactly-once vs brewtools + mode tracking (owner: T2.4) =====
// Returns the mode tracker so the band can label plan-only rows. The Io lambdas spell `$.fs.*` at the call site.
function registerClassic(on: On, options: PluginOptions): ModeTracker {
  const check = validatePrefix(options.prefix)
  const cache = newRegistryCache()
  const mode = resetMode()
  let compiled: Compiled | null = null
  let published: Registry | null = null

  // Warm the registry and surface a bad prefix or broken definition files once; nothing here may block the session.
  on('session.start', async ($, e, next) => {
    try {
      if (check.warning !== null) $.ui.toast(`placeholders: ${check.warning}`)
      const root = await $.session.root()
      const cfg = await $.env.get('CLAUDE_CONFIG_DIR')
      const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
      const reg = await loadRegistry(
        { exists: (p) => $.fs.exists(p), list: (p) => $.fs.list(p), read: (p) => $.fs.read(p) },
        { pluginRoot: $.plugin.root, root, configDir: configDirOf(cfg, home) },
        cache,
      )
      if (published !== reg) {
        published = reg
        setEditorEntries(toEditorEntries(reg.defs))
      }
      if (reg.issues.length > 0) $.ui.toast(`placeholders: ${reg.issues.length} definition issue(s), first: ${reg.issues[0]}`)
    } catch {
      // registry loads again on the first prompt
    }
    return next(e)
  })

  // Assemble first, let brewtools' hook run inside next(e), then de-dup; any mod failure leaves brewtools' blocks untouched.
  on('classic.UserPromptSubmit', async ($, e, next) => {
    let built: Built | null = null
    try {
      const prompt = typeof e.prompt === 'string' ? e.prompt : ''
      if (prompt.includes(check.prefix) && !SYNTHETIC_PROMPT.test(prompt)) {
        const root = await $.session.root()
        const cfg = await $.env.get('CLAUDE_CONFIG_DIR')
        const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
        const reg = await loadRegistry(
          { exists: (p) => $.fs.exists(p), list: (p) => $.fs.list(p), read: (p) => $.fs.read(p) },
          { pluginRoot: $.plugin.root, root, configDir: configDirOf(cfg, home) },
          cache,
        )
        if (published !== reg) {
          published = reg
          setEditorEntries(toEditorEntries(reg.defs))
        }
        compiled = memoCompile(compiled, reg.defs, check.prefix)
        try { // T2.9 warnUnknown toast: advisory, never alters the prompt or the expansion
          const bad = options.warnUnknown === false ? [] : unknownTokens(compiled.matchers, prompt)
          if (bad.length > 0) $.ui.toast(unknownMessage(bad))
        } catch {
          // no toast
        }
        built = assembleBlocks(compiled, prompt, e.permission_mode)
      }
    } catch {
      built = null
    }
    const r = await next(e)
    let out = r
    try {
      if (built !== null) out = { ...r, additionalContext: injectOnce(r.additionalContext, built) }
    } catch {
      out = r
    }
    mode.classic(e)
    return out
  })

  on('classic.PostToolBatch', ($, e, next) => {
    mode.classic(e)
    return next(e)
  })

  // Non-classic fallback (org-managed installs); fires before turn.step.
  on('session.append', ($, e, next) => {
    mode.append(e)
    return next(e)
  })

  return mode
}
// ===== end T2.4 =====

// ===== T2.7 preview band above the prompt (owner: T2.7) =====
// Rows come from the T2.6 view atom + the editor entries; the toggle atom lives here (validate rejects atoms in lib files).
const expandedAtom = atom({ plugin: 'brewmod-placeholders', key: 'expanded' } as const, false)

function registerBand(on: On, options: PluginOptions): void {
  const style = { knownColor: optionColor(options.knownColor, 'suggestion'), unknownColor: optionColor(options.unknownColor, 'warning') }

  // Fail open: any throw leaves the engine's own band; a survey or an empty view yields.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    try {
      if (e.props.hasSurvey) return next(e)
      const rows = bandRows(await read($, viewAtom), getEditorEntries())
      if (rows.length === 0) return next(e)
      const isExpanded = await read($, expandedAtom)
      return renderBand($.ui.resolve(e), rows, {
        isExpanded,
        isPlan: isPlan(),
        style,
        onToggle: () => update($, expandedAtom, (open) => !open),
      })
    } catch {
      return next(e)
    }
  })
}
// ===== end T2.7 =====

// ===== T2.9 inline + warnUnknown (owner: T2.9) =====
// Inline defs (`insert: inline`, `when: always`) are expanded in the submitted text; context defs stay on the classic path (assembleBlocks skips inline).
// prompt.submit has no mode, so a plan/not-plan inline def is left verbatim. The warnUnknown toast lives in the classic hook above (one marked block).
function registerInline(on: On, options: PluginOptions): void {
  const check = validatePrefix(options.prefix)
  const cache = newRegistryCache()
  let compiled: Compiled | null = null

  on('prompt.submit', async ($, e, next) => {
    // The draft leaves the composer on submit only for the person's own Enter: bridge/sdk/other origins keep the band.
    if (e.origin.kind === 'composer' && e.isMeta === undefined) {
      try {
        await update($, viewAtom, () => ({ tokens: [] }))
        shown = null
      } catch {
        // band stays until the next edit
      }
    }
    let out = e
    try {
      if (isInlineSubmit(e) && e.text.includes(check.prefix)) {
        const root = await $.session.root()
        const cfg = await $.env.get('CLAUDE_CONFIG_DIR')
        const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
        const reg = await loadRegistry(
          { exists: (p) => $.fs.exists(p), list: (p) => $.fs.list(p), read: (p) => $.fs.read(p) },
          { pluginRoot: $.plugin.root, root, configDir: configDirOf(cfg, home) },
          cache,
        )
        compiled = memoCompile(compiled, reg.defs, check.prefix)
        const text = expandInline(compiled, e.text)
        if (text !== null) out = { ...e, text }
      }
    } catch {
      out = e
    }
    return next(out)
  })
}
// ===== end T2.9 =====

// ===== T2.8 command (owner: T2.8) =====
// A second unmatched session.start is refused by validate, so the registration hook carries the match-all matcher `{ cwd: /^/ }`.
function registerCommand(on: On, _options: PluginOptions): void {
  on('session.start', { cwd: /^/ }, async ($, e, next) => {
    try {
      await $.command.register({ name: 'placeholders', description: 'List, show, add, edit and remove placeholder definitions', argumentHint: '[list|show|add|edit|rm] [name] [global] [text]' })
    } catch {
      // the command stays unavailable; nothing else depends on it
    }
    return next(e)
  })

  on('command.run', { command: 'placeholders' }, async ($, e) => {
    try {
      const root = await $.session.root().catch(() => undefined)
      const cfg = await $.env.get('CLAUDE_CONFIG_DIR')
      const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
      const out = await runCommand(
        {
          exists: (p) => $.fs.exists(p),
          list: (p) => $.fs.list(p),
          read: (p) => $.fs.read(p),
          write: (p, t) => $.fs.write(p, t),
          stat: (p) => $.fs.stat(p, { resolve: true }).catch(() => undefined),
          remove: async (p) => {
            const r = await $.process.run(['rm', '--', p])
            return { exitCode: r.exitCode, stderr: r.stderr }
          },
        },
        { pluginRoot: $.plugin.root, root, configDir: configDirOf(cfg, home) },
        e.args,
      )
      if (out.registry !== null) setEditorEntries(toEditorEntries(out.registry.defs))
      return { text: out.text }
    } catch (err) {
      return { text: `placeholders: failed: ${err instanceof Error ? err.message : String(err)}` }
    }
  }).catch(($, e, next) => (next.called ? next(e) : { text: 'placeholders: command failed' }))
}
// ===== end T2.8 =====
