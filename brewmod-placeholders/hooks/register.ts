import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import { editorMatchers, getEditorEntries, setEditorEntries } from './lib/editor-state'
import { caretFocus, highlight, isMenuOpen, sameFocus, sameView, suggest, type CaretFocus } from './lib/editor'
import { escapeMarkers, isEscaped, markerOf, validatePrefix, type PlaceholderView } from './lib/match'
import { memoCompile, type Compiled } from './lib/compiled'
import { FILES_GONE, PluginFilesGone, configDirOf, issuesMessage, loadRegistry, newRegistryCache, toEditorEntries, type Registry } from './lib/defs'
import { modeStatePath, planFromState } from './lib/mode'
import { bandRows, bandState, budgets, renderBand, treeRows } from './lib/band'
import { assembleDraft, planParts } from './lib/sent'
import { NEEDS_NEW_CC, TOOL_PREFIX, handoffAck, handoffText, listTool, oneLayer, removeTool, saveTool, tools, type RemoveInput, type SaveInput, type ToolOut } from './lib/command'
import { fillText, fullText, helpText, parseArgs, queryDrop, queryNames, shownDirs, statusText } from './lib/show'
import { expandInline, isInlineSubmit, unknownMessage, unknownTokens, type SubmitLike } from './lib/inline'

// Atoms are declared in this file only (the scan reads this file); the band reads the same view atom.
const viewAtom = atom({ plugin: 'brewmod-placeholders', key: 'view' } as const, { tokens: [] })
const focusAtom = atom({ plugin: 'brewmod-placeholders', key: 'focus' } as const, { name: null, isQuery: false, isMenuOpen: false })

const REFRESH_MS = 1000

// No guards around the mod's own logic: the engine skips a failing hook and the chain goes on (reference.md:78).
// `$` is never passed on, so each registry load spells its `$.fs.*` lambdas at the call site.
export const register: Register = (on, options) => {
  const check = validatePrefix(options.prefix)
  const prefix = check.prefix
  const cache = newRegistryCache()
  let hasTools = false // the model tools were registered at session.start
  // Settles with hasTools once session.start's registration ends: a command typed right after launch waits for it.
  let toolsSettled: (v: boolean) => void = () => undefined
  const toolsReady = new Promise<boolean>((resolve) => (toolsSettled = resolve))
  let isPlan = false // permission_mode of the last state file hooks/inject.mjs wrote for this session
  let compiled: Compiled | null = null
  let published: Registry | null = null
  let shown: PlaceholderView | null = null // last view written to viewAtom
  let focused: CaretFocus | null = null // last focus written to focusAtom
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
      .register({ name: 'placeholders', description: 'Show, list or explain your placeholders; or say in any words what to add, change or remove', argumentHint: `[show ${prefix}<names> | list | help | any words]` })
      .catch(() => undefined)
    // Older builds have no $.tool (the call throws): hasTools stays false and the command answers with the status only.
    try {
      for (const t of tools(prefix)) await $.tool.register({ name: t.name, description: t.description, inputSchema: t.inputSchema, isDeferred: false })
      hasTools = true
      // A band drawn while the tools were registering lacks the `P<name>?` hand-off: draw it again.
      $.ui.invalidate('ui.render')
    } catch {
      hasTools = false
    }
    toolsSettled(hasTools)
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
    const wasPlan = isPlan
    try {
      const file = modeStatePath($.plugin.root, await $.session.id())
      if (file !== null) isPlan = planFromState(await $.fs.read(file)) ?? isPlan
    } catch {
      // no state file yet: not in plan mode
    }
    // The band reads a module variable, not an atom: a flipped mode redraws it now, not at the next key.
    if (isPlan !== wasPlan) $.ui.invalidate('ui.render')
    return next(e)
  })

  // The command hook records the mode at each prompt and tool batch; a finished turn has seen both. No I/O in prompt.edit, so the band reads the module variable.
  on('turn.complete', async ($, e, next) => {
    const wasPlan = isPlan
    try {
      const file = modeStatePath($.plugin.root, await $.session.id())
      if (file !== null) isPlan = planFromState(await $.fs.read(file)) ?? isPlan
    } catch {
      // keep the last known mode
    }
    if (isPlan !== wasPlan) $.ui.invalidate('ui.render')
    return next(e)
  })

  // The box's view and focus, each atom written only when it changed; writers spelled at the call site. Returns the highlight.
  const publish = async (text: string, cursor: number, writeView: (v: PlaceholderView) => Promise<unknown>, writeFocus: (f: CaretFocus) => Promise<unknown>) => {
    const h = highlight(editorMatchers(prefix), text)
    const f = { ...caretFocus(h.view, text, cursor), isMenuOpen: isMenuOpen(prefix, text, cursor, getEditorEntries()) }
    try {
      if (shown === null || !sameView(h.view, shown)) {
        await writeView(h.view)
        shown = h.view
      }
      if (focused === null || !sameFocus(f, focused)) {
        await writeFocus(f)
        focused = f
      }
    } catch {
      // state write failed: keep the highlight, retry on the next edit
    }
    return h
  }

  // Zero I/O except the view and focus atoms, each written only when it changes; caret moves arrive here too (inputText '').
  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    const h = await publish(r.text, r.cursor, (v) => update($, viewAtom, () => v), (f) => update($, focusAtom, () => f))
    return h.decorations.length === 0 ? r : { ...r, decorations: [...(r.decorations ?? []), ...h.decorations] }
  })

  // A taken row, a recall, an undo, a dropped draft put back or a fill change the box without prompt.edit: the band follows here.
  // No paint channel here: the box underline waits for the next key.
  on('prompt.change', async ($, e, next) => {
    await publish(e.text, e.cursor, (v) => update($, viewAtom, () => v), (f) => update($, focusAtom, () => f))
    return next(e)
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

  // Inline defs are expanded in the submitted text; context defs go through hooks/inject.mjs. No mode here: an inline plan part never expands.
  // The unknown-token toast fires here (a command hook has no UI): only for text the person typed, after the expansion.
  on('prompt.submit', async ($, e, next) => {
    const own: SubmitLike = e // isMeta is absent from the 2.1.296 types
    const isTyped = own.origin.kind === 'composer' && own.isMeta === undefined
    // The draft leaves the composer only on the person's own Enter: other origins keep the band.
    if (isTyped) {
      try {
        await update($, viewAtom, () => ({ tokens: [] }))
        shown = null
      } catch {
        // band stays until the next edit
      }
    }
    // `P/` or `P\` anywhere: sent as typed, no expansion and no toast; inject.mjs skips it too.
    if (isEscaped(prefix, e.text)) return next(e)
    // Only `P<name>?` items, no attachments, a build with tools (the hand-off's gate; fill proven only there): dropped, the box gets `/placeholders show P<names> `.
    // Not run in place: $.command.run passes "every hook but the calling one" (claude-code.d.ts); seen live: `prompt.submit skipped: re-entry` (hand-off).
    const asked = isTyped && hasTools && e.command === undefined && (e.attachments?.length ?? 0) === 0 ? queryNames(editorMatchers(prefix), e.text) : null
    if (asked !== null) {
      $.clock.after(0, () => {
        try {
          void $.prompt.fill({ text: fillText(prefix, asked), mode: 'replace' }).catch(() => undefined)
        } catch {
          // a fill that throws at once: the drop notice stays, the box stays empty
        }
      })
      return { drop: queryDrop(prefix, asked) }
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
    // An emptied box (Esc Esc, submit) draws no band: the atoms are only written by edits. A surface without a box answers '' too, so only the terminal is asked.
    const draft = e.surface === 'terminal' ? (await $.prompt.read()).text : null
    const view = await read($, viewAtom)
    const focus = await read($, focusAtom)
    const mode = bandState({ hasSurvey: e.props.hasSurvey, draft, view, focus: focus.name })
    if (mode === 'hidden') return next(e)
    // The exact text per token, from the draft (terminal) or the token texts; before the first registry load the entries' bodies stand.
    const sent = compiled === null ? undefined : assembleDraft(draft ?? view.tokens.map((t) => t.text).join(' '), compiled, prefix, isPlan).tokens
    const defs = compiled?.defs
    const plans = defs === undefined ? undefined : (name: string) => planParts(defs, name, prefix)
    // Another mod's rows beneath sit above the band (kept on screen, as when that mod is outermost); the band gives up their rows.
    const below = await next(e)
    const ui = $.ui.resolve(e)
    const band = renderBand(ui, bandRows(view, getEditorEntries(), sent, plans), {
      mode,
      focus,
      prefix,
      // No draft (desktop): the marker the last edit saw.
      marker: (draft === null ? null : markerOf(compiled?.matchers ?? prefix, draft)) ?? view.escapedBy ?? escapeMarkers(prefix)[0],
      isPlan,
      isGone,
      ...budgets(e.props.maxRows - treeRows(below), e.viewport?.isFullscreen === true, focus.isMenuOpen),
      columns: e.props.bodyColumns,
      hasQuery: hasTools,
    })
    return below.type === 'engine' ? band : ui.Box({ flexDirection: 'column', children: [below, band] })
  })

  on('command.run', { command: 'placeholders' }, async ($, e) => {
    const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
    const roots = { pluginRoot: $.plugin.root, root: await $.session.root().catch(() => undefined), configDir: configDirOf(await $.env.get('CLAUDE_CONFIG_DIR'), home) }
    const reg = await settle(loadRegistry({ exists: (p) => $.fs.exists(p), list: (p) => $.fs.list(p), read: (p) => $.fs.read(p) }, roots, cache), (t) => $.ui.toast(t, { timeoutMs: 8000 }), () => $.ui.invalidate('ui.render'))
    if (reg === null) return { text: FILES_GONE }
    adopt(reg)
    // A command run before the tools registered waits for them, at most 3 s.
    const withTools = hasTools || (await Promise.race([toolsReady, new Promise<boolean>((resolve) => $.clock.after(3000, () => resolve(false)))]))
    // status, help, show and list answer here; the rest goes to Claude.
    const act = parseArgs(e.args, prefix, reg.defs.map((d) => d.name))
    const dirs = shownDirs(roots, home)
    const one = oneLayer(reg, roots)
    if (act.kind === 'help') return { text: helpText(prefix, dirs, withTools) }
    if (act.kind === 'list' || act.kind === 'show') return { text: fullText(one, act.kind === 'list' ? null : act.names, prefix, isPlan) }
    const status = statusText(one, prefix, dirs, withTools)
    if (act.kind === 'status') return { text: status }
    if (!withTools) return { text: `${status}\n${NEEDS_NEW_CC}` }
    // submit is refused inside command.run: hand off from a timer; fill is the fallback when submit refuses.
    const text = handoffText(act.request, prefix, act.scope)
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
    const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
    const roots = { pluginRoot: $.plugin.root, root: await $.session.root().catch(() => undefined), configDir: configDirOf(await $.env.get('CLAUDE_CONFIG_DIR'), home) }
    if (e.tool === `${TOOL_PREFIX}placeholders_help`) {
      const help = helpText(prefix, shownDirs(roots, home))
      return { result: help, text: help }
    }
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
    const input = e as SaveInput & RemoveInput
    // Gone: nothing is written or removed, the model gets the reload hint.
    const reg = await settle(loadRegistry(io, roots, cache), (t) => $.ui.toast(t, { timeoutMs: 8000 }), () => $.ui.invalidate('ui.render'))
    if (reg === null) return { result: FILES_GONE, text: FILES_GONE, isError: true }
    const out: ToolOut =
      e.tool === `${TOOL_PREFIX}save_placeholder`
        ? await saveTool(io, roots, input, prefix, home)
        : e.tool === `${TOOL_PREFIX}remove_placeholder`
          ? await removeTool(io, roots, input, prefix, home)
          : await listTool(io, roots, reg, prefix)
    if (out.registry !== null) adopt(out.registry)
    return out.isError === true ? { result: out.text, text: out.text, isError: true } : { result: out.text, text: out.text }
  }).catch((_$, _e, next) => {
    const text = `failed: ${next.error.message ?? next.error.kind}`
    return { result: text, text, isError: true }
  })
}
