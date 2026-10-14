import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import { editorMatchers, getEditorEntries, setEditorEntries } from './lib/editor-state'
import { highlight, optionColor, sameView, suggest, type EditorStyle } from './lib/editor'
import { validatePrefix, type PlaceholderView } from './lib/match'
import { SYNTHETIC_PROMPT, applyBuilt, assembleBlocks, memoCompile, type Compiled } from './lib/assemble'
import { configDirOf, issuesMessage, loadRegistry, newRegistryCache, toEditorEntries, type Registry } from './lib/defs'
import { createModeTracker } from './lib/mode'
import { bandBudget, bandRows, renderBand } from './lib/band'
import { runCommand } from './lib/command'
import { expandInline, isInlineSubmit, isTypedSource, unknownMessage, unknownTokens, type SubmitLike } from './lib/inline'

// Atoms are declared in this file only (the scan reads this file); the band reads the same view atom.
const viewAtom = atom({ plugin: 'brewmod-placeholders', key: 'view' } as const, { tokens: [] })
const expandedAtom = atom({ plugin: 'brewmod-placeholders', key: 'expanded' } as const, false)

const REFRESH_MS = 1000

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
  let refreshedAt = -REFRESH_MS // clock of the last typeahead registry refresh
  let wasDraft: boolean | null = null // isDraft of the last hint-line draw

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
      .register({ name: 'placeholders', description: 'List, show, add, edit and remove placeholder definitions', argumentHint: '[list|show|add|edit|rm] [name] [--global] [text]' })
      .catch(() => undefined)
    if (check.warning !== null) $.ui.toast(check.warning)
    const reg = await loadRegistry(
      { exists: (p) => $.fs.exists(p), list: (p) => $.fs.list(p), read: (p) => $.fs.read(p) },
      { pluginRoot: $.plugin.root, root: await $.session.root(), configDir: configDirOf(await $.env.get('CLAUDE_CONFIG_DIR'), (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))) },
      cache,
    )
    adopt(reg)
    const issues = issuesMessage(reg)
    if (issues !== null) $.ui.toast(issues)
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
    if (options.warnUnknown !== false && isTypedSource(e.source)) {
      const bad = unknownTokens(c.matchers, e.prompt)
      if (bad.length > 0) $.ui.toast(unknownMessage(bad))
    }
    const built = assembleBlocks(c, e.prompt, e.permission_mode)
    const r = await next(e)
    return built === null ? r : applyBuilt(r, built)
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

  // The hint line redraws when the box turns empty or non-empty (Esc Esc, submit, a recall into an empty box): draw the band again, it reads the box. A state write is refused while drawing.
  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    const flipped = wasDraft !== null && wasDraft !== e.props.isDraft
    wasDraft = e.props.isDraft
    if (flipped) $.ui.invalidate('ui.render')
    return next(e)
  })

  // A prefixed token re-reads the definitions at most once a second, so a file made by hand shows as known without a submit. A failed read keeps the rows.
  on('prompt.autocomplete', { token: /^[^\w\s]{2}/ }, async ($, e, next) => {
    const r = await next(e)
    try {
      const now = await $.clock.now()
      if (e.token.startsWith(prefix) && now - refreshedAt >= REFRESH_MS) {
        refreshedAt = now
        adopt(
          await loadRegistry(
            { exists: (p) => $.fs.exists(p), list: (p) => $.fs.list(p), read: (p) => $.fs.read(p) },
            { pluginRoot: $.plugin.root, root: await $.session.root(), configDir: configDirOf(await $.env.get('CLAUDE_CONFIG_DIR'), (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))) },
            cache,
          ),
        )
      }
    } catch {
      // keep the entries we have: a failed refresh must not drop the typeahead rows
    }
    const rows = suggest(prefix, e.token, getEditorEntries(), /\s/.test(e.text.charAt(e.cursor)))
    return rows.length === 0 ? r : { suggestions: [...r.suggestions, ...rows] }
  })

  // Inline defs are expanded in the submitted text; context defs stay on the classic path. No mode here: plan/not-plan inline defs stay verbatim.
  on('prompt.submit', async ($, e, next) => {
    // The draft leaves the composer only on the person's own Enter: other origins keep the band.
    const own: SubmitLike = e // isMeta is absent from the 2.1.296 types
    if (own.origin.kind === 'composer' && own.isMeta === undefined) {
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
    // An emptied box (Esc Esc, submit) draws no band: the view atom is only written by edits. A surface without a box answers '' too, so only the terminal is asked.
    if (e.surface === 'terminal' && (await $.prompt.read()).text === '') return next(e)
    const rows = bandRows(await read($, viewAtom), getEditorEntries())
    if (rows.length === 0) return next(e)
    return renderBand($.ui.resolve(e), rows, {
      isExpanded: await read($, expandedAtom),
      isPlan: mode.isPlan(),
      style,
      budget: bandBudget(e.props.maxRows, e.viewport?.isFullscreen === true),
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
      prefix,
    )
    if (out.registry !== null) setEditorEntries(toEditorEntries(out.registry.defs))
    return { text: out.text }
  }).catch((_$, _e, next) => ({ text: `failed: ${next.error.message ?? next.error.kind}` }))
}
