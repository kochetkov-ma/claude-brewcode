import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import { editorMatchers, getEditorEntries, setEditorEntries } from './lib/editor-state'
import { highlight, sameView, suggest } from './lib/editor'
import { validatePrefix, type PlaceholderView } from './lib/match'
import { memoCompile, type Compiled } from './lib/compiled'
import { FILES_GONE, PluginFilesGone, configDirOf, issuesMessage, loadRegistry, newRegistryCache, toEditorEntries, type Registry } from './lib/defs'
import { modeStatePath, planFromState } from './lib/mode'
import { bandBudget, bandRows, renderBand } from './lib/band'
import { NEEDS_NEW_CC, TOOLS, TOOL_PREFIX, handoffAck, handoffText, isStatusRequest, listTool, removeTool, saveTool, statusText, type SaveInput, type ToolOut } from './lib/command'
import { expandInline, isInlineSubmit, unknownMessage, unknownTokens, type SubmitLike } from './lib/inline'

// Atoms are declared in this file only (the scan reads this file); the band reads the same view atom.
const viewAtom = atom({ plugin: 'brewmod-placeholders', key: 'view' } as const, { tokens: [] })
const expandedAtom = atom({ plugin: 'brewmod-placeholders', key: 'expanded' } as const, false)

const REFRESH_MS = 1000

// No guards around the mod's own logic: the engine skips a failing hook and the chain goes on (reference.md:78).
// `$` is never passed on, so each registry load spells its `$.fs.*` lambdas at the call site.
export const register: Register = (on, options) => {
  const check = validatePrefix(options.prefix)
  const prefix = check.prefix
  const cache = newRegistryCache()
  let hasTools = false // the three model tools were registered at session.start
  let isPlan = false // permission_mode of the last state file hooks/inject.mjs wrote for this session
  let compiled: Compiled | null = null
  let published: Registry | null = null
  let shown: PlaceholderView | null = null // last view written to viewAtom
  let refreshedAt = -REFRESH_MS // clock of the last typeahead registry refresh
  let wasDraft: boolean | null = null // isDraft of the last hint-line draw
  let isGone = false // the plugin's own placeholders/ folder vanished: the cached list stays, the band shows the reload line
  let goneToasted = false

  // A load that finds the plugin files gone resolves null (cache kept); a flip of that state redraws the band, the first sighting toasts.
  const settle = async (load: Promise<Registry>, toast: (text: string) => void, redraw: () => void): Promise<Registry | null> => {
    const was = isGone
    let reg: Registry | null = null
    try {
      reg = await load
      isGone = false
    } catch (err) {
      if (!(err instanceof PluginFilesGone)) throw err
      isGone = true
    }
    if (isGone !== was) redraw()
    if (isGone && !goneToasted) {
      goneToasted = true
      toast(FILES_GONE)
    }
    return reg
  }

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
      .register({ name: 'placeholders', description: 'Show your placeholders; say what to add, change or remove', argumentHint: '[what you want]' })
      .catch(() => undefined)
    // Older builds have no $.tool (the call throws): hasTools stays false and the command answers with the status only.
    try {
      for (const t of TOOLS) await $.tool.register({ name: t.name, description: t.description, inputSchema: t.inputSchema, isDeferred: false })
      hasTools = true
    } catch {
      hasTools = false
    }
    if (check.warning !== null) $.ui.toast(check.warning)
    const reg = await settle(
      loadRegistry(
        { exists: (p) => $.fs.exists(p), list: (p) => $.fs.list(p), read: (p) => $.fs.read(p) },
        { pluginRoot: $.plugin.root, root: await $.session.root(), configDir: configDirOf(await $.env.get('CLAUDE_CONFIG_DIR'), (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))) },
        cache,
      ),
      (t) => $.ui.toast(t, { timeoutMs: 8000 }), () => $.ui.invalidate('ui.render'),
    )
    if (reg !== null) {
      adopt(reg)
      const issues = issuesMessage(reg)
      if (issues !== null) $.ui.toast(issues)
    }
    try {
      const file = modeStatePath($.plugin.root, await $.session.id())
      if (file !== null) isPlan = planFromState(await $.fs.read(file)) ?? isPlan
    } catch {
      // no state file yet: not in plan mode
    }
    return next(e)
  })

  // The command hook records the mode at each prompt and tool batch; a finished turn has seen both. No I/O in prompt.edit, so the band reads the module variable.
  on('turn.complete', async ($, e, next) => {
    try {
      const file = modeStatePath($.plugin.root, await $.session.id())
      if (file !== null) isPlan = planFromState(await $.fs.read(file)) ?? isPlan
    } catch {
      // keep the last known mode
    }
    return next(e)
  })

  // Zero I/O except the view atom, written only when the token view changes.
  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    const h = highlight(editorMatchers(prefix), r.text)
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
  // prompt.edit already drew this key's view with the old names: a changed list re-draws it here, so the band does not lag a key.
  on('prompt.autocomplete', { token: /^[^\w\s]{2}/ }, async ($, e, next) => {
    const r = await next(e)
    try {
      const now = await $.clock.now()
      if (e.token.startsWith(prefix) && now - refreshedAt >= REFRESH_MS) {
        refreshedAt = now
        const reg = await settle(
          loadRegistry(
            { exists: (p) => $.fs.exists(p), list: (p) => $.fs.list(p), read: (p) => $.fs.read(p) },
            { pluginRoot: $.plugin.root, root: await $.session.root(), configDir: configDirOf(await $.env.get('CLAUDE_CONFIG_DIR'), (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))) },
            cache,
          ),
          (t) => $.ui.toast(t, { timeoutMs: 8000 }), () => $.ui.invalidate('ui.render'),
        )
        const before = getEditorEntries()
        if (reg !== null) adopt(reg)
        const view = highlight(editorMatchers(prefix), e.text).view
        if (getEditorEntries() !== before && (shown === null || !sameView(view, shown))) {
          await update($, viewAtom, () => view)
          shown = view
        }
      }
    } catch {
      // keep the entries we have: a failed refresh must not drop the typeahead rows
    }
    const rows = suggest(prefix, e.token, getEditorEntries(), /\s/.test(e.text.charAt(e.cursor)))
    return rows.length === 0 ? r : { suggestions: [...r.suggestions, ...rows] }
  })

  // Inline defs are expanded in the submitted text; context defs go through hooks/inject.mjs. No mode here: plan/not-plan inline defs stay verbatim.
  // The unknown-token toast fires here (a command hook has no UI): only for text the person typed, after the expansion.
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
    const reg = await settle(
      loadRegistry(
        { exists: (p) => $.fs.exists(p), list: (p) => $.fs.list(p), read: (p) => $.fs.read(p) },
        { pluginRoot: $.plugin.root, root: await $.session.root(), configDir: configDirOf(await $.env.get('CLAUDE_CONFIG_DIR'), (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))) },
        cache,
      ),
      (t) => $.ui.toast(t, { timeoutMs: 8000 }), () => $.ui.invalidate('ui.render'),
    )
    // Gone: inline defs expand from the cached list; no unknown toast, the list cannot be vouched for.
    const c = reg === null ? compiled : adopt(reg)
    if (c === null) return next(e)
    const text = expandInline(c, e.text)
    const bad = reg === null ? [] : unknownTokens(c.matchers, text ?? e.text)
    if (bad.length > 0) $.ui.toast(unknownMessage(bad))
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
      isPlan,
      isGone,
      budget: bandBudget(e.props.maxRows, e.viewport?.isFullscreen === true),
      onToggle: () => update($, expandedAtom, (open) => !open),
    })
  })

  on('command.run', { command: 'placeholders' }, async ($, e) => {
    const roots = { pluginRoot: $.plugin.root, root: await $.session.root().catch(() => undefined), configDir: configDirOf(await $.env.get('CLAUDE_CONFIG_DIR'), (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))) }
    const reg = await settle(loadRegistry({ exists: (p) => $.fs.exists(p), list: (p) => $.fs.list(p), read: (p) => $.fs.read(p) }, roots, cache), (t) => $.ui.toast(t, { timeoutMs: 8000 }), () => $.ui.invalidate('ui.render'))
    if (reg === null) return { text: FILES_GONE }
    adopt(reg)
    const status = statusText(reg, prefix)
    if (isStatusRequest(e.args)) return { text: status }
    if (!hasTools) return { text: `${status}\n${NEEDS_NEW_CC}` }
    // submit is refused inside command.run: hand off from a timer; fill is the fallback when submit refuses.
    const text = handoffText(e.args.trim(), prefix)
    $.clock.after(250, () => {
      void (async () => {
        try {
          await $.prompt.submit({ text, asUser: true })
        } catch {
          await $.prompt.fill({ text, mode: 'replace' }).catch(() => undefined)
        }
      })()
    })
    return { text: handoffAck(status) }
  }).catch((_$, _e, next) => ({ text: `failed: ${next.error.message ?? next.error.kind}` }))

  // The model's tools: answered here, so Claude Code asks no permission for the file write.
  on('tool.call', { tool: /^mcp__brewmod-placeholders__/ }, async ($, e) => {
    const roots = { pluginRoot: $.plugin.root, root: await $.session.root().catch(() => undefined), configDir: configDirOf(await $.env.get('CLAUDE_CONFIG_DIR'), (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))) }
    const io = {
      exists: (p: string) => $.fs.exists(p),
      list: (p: string) => $.fs.list(p),
      read: (p: string) => $.fs.read(p),
      write: (p: string, t: string) => $.fs.write(p, t),
      stat: (p: string) => $.fs.stat(p, { resolve: true }).catch(() => undefined),
      remove: async (p: string) => {
        const r = await $.process.run(['rm', '--', p])
        return { exitCode: r.exitCode, stderr: r.stderr }
      },
    }
    const input = e as SaveInput
    // Gone: nothing is written or removed, the model gets the reload hint.
    const reg = await settle(loadRegistry(io, roots, cache), (t) => $.ui.toast(t, { timeoutMs: 8000 }), () => $.ui.invalidate('ui.render'))
    if (reg === null) return { result: FILES_GONE, text: FILES_GONE, isError: true }
    const out: ToolOut =
      e.tool === `${TOOL_PREFIX}save_placeholder`
        ? await saveTool(io, roots, input, prefix)
        : e.tool === `${TOOL_PREFIX}remove_placeholder`
          ? await removeTool(io, roots, input, prefix)
          : listTool(reg)
    if (out.registry !== null) adopt(out.registry)
    return out.isError === true ? { result: out.text, text: out.text, isError: true } : { result: out.text, text: out.text }
  }).catch((_$, _e, next) => {
    const text = `failed: ${next.error.message ?? next.error.kind}`
    return { result: text, text, isError: true }
  })
}
