import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import { editorMatchers, getEditorEntries, setEditorEntries } from './lib/editor-state'
import { highlight, optionColor, sameView, suggest, type EditorStyle } from './lib/editor'
import { validatePrefix, type PlaceholderView } from './lib/match'
import { SYNTHETIC_PROMPT, assembleBlocks, injectOnce, memoCompile, type Compiled } from './lib/assemble'
import { configDirOf, loadRegistry, newRegistryCache, toEditorEntries, type Registry } from './lib/defs'
import { createModeTracker } from './lib/mode'
import { bandRows, renderBand } from './lib/band'
import { runCommand } from './lib/command'
import { expandInline, isInlineSubmit, unknownMessage, unknownTokens } from './lib/inline'

// Atoms are declared in this file only (the scan reads this file); the band reads the same view atom.
const viewAtom = atom({ plugin: 'brewmod-placeholders', key: 'view' } as const, { tokens: [] })
const expandedAtom = atom({ plugin: 'brewmod-placeholders', key: 'expanded' } as const, false)

// No guards around the mod's own logic: the engine skips a failing hook and the chain goes on (reference.md:78).
// `$` is never passed on, so each registry load spells its `$.fs.*` lambdas at the call site.
export const register: Register = (on, options) => {
  const check = validatePrefix(options.prefix)
  const prefix = check.prefix
  const style: EditorStyle = { knownColor: optionColor(options.knownColor, 'suggestion'), unknownColor: optionColor(options.unknownColor, 'warning') }
  const cache = newRegistryCache()
  const mode = createModeTracker()
  let compiled: Compiled | null = null
  let published: Registry | null = null
  let shown: PlaceholderView | null = null // last view written to viewAtom

  // Hands a freshly loaded registry to the editor/band names and the compiled matchers; both skip an unchanged registry.
  const adopt = (reg: Registry): Compiled => {
    if (published !== reg) {
      published = reg
      setEditorEntries(toEditorEntries(reg.defs))
    }
    compiled = memoCompile(compiled, reg.defs, prefix)
    return compiled
  }

  // Command registration cannot fail the warm-up below, and the warm-up cannot block the session.
  on('session.start', async ($, e, next) => {
    await $.command
      .register({ name: 'placeholders', description: 'List, show, add, edit and remove placeholder definitions', argumentHint: '[list|show|add|edit|rm] [name] [global] [text]' })
      .catch(() => undefined)
    if (check.warning !== null) $.ui.toast(`placeholders: ${check.warning}`)
    const reg = await loadRegistry(
      { exists: (p) => $.fs.exists(p), list: (p) => $.fs.list(p), read: (p) => $.fs.read(p) },
      { pluginRoot: $.plugin.root, root: await $.session.root(), configDir: configDirOf(await $.env.get('CLAUDE_CONFIG_DIR'), (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))) },
      cache,
    )
    adopt(reg)
    if (reg.issues.length > 0) $.ui.toast(`placeholders: ${reg.issues.length} definition issue(s), first: ${reg.issues[0]}`)
    return next(e)
  })

  // Assemble first, let brewtools' hook run inside next(e), then de-dup against its blocks.
  on('classic.UserPromptSubmit', async ($, e, next) => {
    mode.classic(e)
    if (!e.prompt.includes(prefix) || SYNTHETIC_PROMPT.test(e.prompt)) return next(e)
    const c = adopt(
      await loadRegistry(
        { exists: (p) => $.fs.exists(p), list: (p) => $.fs.list(p), read: (p) => $.fs.read(p) },
        { pluginRoot: $.plugin.root, root: await $.session.root(), configDir: configDirOf(await $.env.get('CLAUDE_CONFIG_DIR'), (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))) },
        cache,
      ),
    )
    if (options.warnUnknown !== false) {
      const bad = unknownTokens(c.matchers, e.prompt)
      if (bad.length > 0) $.ui.toast(unknownMessage(bad))
    }
    const built = assembleBlocks(c, e.prompt, e.permission_mode)
    const r = await next(e)
    return built === null ? r : { ...r, additionalContext: injectOnce(r.additionalContext, built) }
  })

  on('classic.PostToolBatch', (_$, e, next) => {
    mode.classic(e)
    return next(e)
  })

  // Non-classic fallback (org-managed installs); fires before turn.step.
  on('session.append', (_$, e, next) => {
    mode.append(e)
    return next(e)
  })

  // Zero I/O except the view atom, written only when the token view changes.
  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    const h = highlight(editorMatchers(prefix), r.text, style)
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

  on('prompt.autocomplete', { token: /^[^\w\s]{2}/ }, async (_$, e, next) => {
    const r = await next(e)
    const rows = suggest(prefix, e.token, getEditorEntries())
    return rows.length === 0 ? r : { suggestions: [...r.suggestions, ...rows] }
  })

  // Inline defs are expanded in the submitted text; context defs stay on the classic path. No mode here: plan/not-plan inline defs stay verbatim.
  on('prompt.submit', async ($, e, next) => {
    // The draft leaves the composer only on the person's own Enter: other origins keep the band.
    if (e.origin.kind === 'composer' && e.isMeta === undefined) {
      try {
        await update($, viewAtom, () => ({ tokens: [] }))
        shown = null
      } catch {
        // band stays until the next edit
      }
    }
    if (!isInlineSubmit(e) || !e.text.includes(prefix)) return next(e)
    const c = adopt(
      await loadRegistry(
        { exists: (p) => $.fs.exists(p), list: (p) => $.fs.list(p), read: (p) => $.fs.read(p) },
        { pluginRoot: $.plugin.root, root: await $.session.root(), configDir: configDirOf(await $.env.get('CLAUDE_CONFIG_DIR'), (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))) },
        cache,
      ),
    )
    const text = expandInline(c, e.text)
    return next(text === null ? e : { ...e, text })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const rows = bandRows(await read($, viewAtom), getEditorEntries())
    if (rows.length === 0) return next(e)
    return renderBand($.ui.resolve(e), rows, {
      isExpanded: await read($, expandedAtom),
      isPlan: mode.isPlan(),
      style,
      onToggle: () => update($, expandedAtom, (open) => !open),
    })
  })

  on('command.run', { command: 'placeholders' }, async ($, e) => {
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
      { pluginRoot: $.plugin.root, root: await $.session.root().catch(() => undefined), configDir: configDirOf(await $.env.get('CLAUDE_CONFIG_DIR'), (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))) },
      e.args,
    )
    if (out.registry !== null) setEditorEntries(toEditorEntries(out.registry.defs))
    return { text: out.text }
  }).catch((_$, _e, next) => ({ text: `placeholders: failed: ${next.error.message ?? next.error.kind}` }))
}
