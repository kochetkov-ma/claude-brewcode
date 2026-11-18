// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { assemble, configDirOf, escapeMarkers, isEscaped, layerSpecs, matcher, nameKind, parseDefinition, resolveDefs, validPrefix } from '../hooks/inject.mjs'

export { escapeMarkers, isEscaped, nameKind, validPrefix }

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SYNTHETIC_PROMPT = /^\s*<(?:task-notification>|agent-message\s+from=)/
const within = (root, file) => file === root || file.startsWith(root + path.sep)
const prefixOf = (prefix, env) => validPrefix(prefix ?? env.BREWMOD_PLACEHOLDERS_PREFIX)

// Resolve the worktree, not the git common directory; execFile argv keeps cwd out of shell syntax.
export function resolveProjectRoot(cwd) {
  const dir = fs.realpathSync(path.resolve(cwd))
  const env = { ...process.env }
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE']) delete env[key]
  try {
    const record = execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500, env,
    })
    return fs.realpathSync(record.endsWith('\n') ? record.slice(0, -1) : record)
  } catch {
    return dir
  }
}

// Project Markdown stays in its exact layer directory; symlinked files and path segments are skipped.
function readLayers(roots) {
  const layers = []
  let legacyNames = new Set()
  for (const spec of layerSpecs(roots)) {
    const files = new Map()
    try {
      const project = spec.id.startsWith('project')
      const layerDir = fs.realpathSync(spec.dir)
      if (project && (!within(roots.root, layerDir) || layerDir !== path.resolve(spec.dir))) {
        layers.push({ kind: spec.kind, files })
        continue
      }
      for (const entry of fs.readdirSync(spec.dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || !entry.name.endsWith('.md')) continue
        if (project && !entry.isFile()) continue
        const stem = entry.name.slice(0, -3)
        if (spec.kind === 'legacy' && !legacyNames.has(stem)) continue
        try {
          const file = fs.realpathSync(path.join(spec.dir, entry.name))
          if (project && (!within(layerDir, file) || file !== path.join(layerDir, entry.name))) continue
          if (!fs.statSync(file).isFile()) continue
          files.set(stem, fs.readFileSync(file, 'utf8'))
        } catch (error) {
          if (spec.id === 'default') throw error
        }
      }
    } catch (error) {
      if (spec.id === 'default') throw error
    }
    layers.push({ kind: spec.kind, files })
    if (spec.id === 'default') {
      legacyNames = new Set([...files.values()].map((raw) => parseDefinition(raw).meta.legacy).filter((name) => name !== undefined && name !== ''))
    }
  }
  return layers
}

// Reload per submission/editor launch: the registry is the existing Claude Markdown tree, never a copy.
export function resolveRegistry({ cwd = process.cwd(), env = process.env, configDir, prefix, pluginRoot = PLUGIN_ROOT } = {}) {
  const dir = fs.realpathSync(path.resolve(cwd))
  const root = resolveProjectRoot(dir)
  const config = configDirOf(configDir ?? env.BREWMOD_PLACEHOLDERS_CLAUDE_CONFIG_DIR, env.HOME ?? env.USERPROFILE)
  return {
    cwd: dir,
    root,
    configDir: config,
    prefix: prefixOf(prefix, env),
    defs: resolveDefs(readLayers({ pluginRoot: path.resolve(pluginRoot), root, configDir: config })),
  }
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const escClass = (s) => s.replace(/[\\\][^-]/g, '\\$&')
const glue = (chars) => `[\\p{L}\\p{N}\\p{M}_${escClass([...new Set(chars)].join(''))}]`
const compiled = new WeakMap()

// Mirror hooks/lib/match.ts's pure scanner; Node cannot import its TypeScript on supported older runtimes.
function matchers(registry) {
  if (compiled.has(registry)) return compiled.get(registry)
  const { prefix } = registry
  const byName = new Map()
  for (const def of registry.defs) {
    const name = def.name.toLowerCase()
    const kind = nameKind(name)
    if (kind === null || byName.has(name)) continue
    const pattern = matcher(prefix, name, kind)
    byName.set(name, {
      scan: new RegExp(pattern.source, pattern.flags + 'g'),
      at: new RegExp(pattern.source, pattern.flags + 'y'),
    })
  }
  const result = {
    byName,
    unknown: new RegExp(`(?<![\\w${escClass(prefix)}])${escRe(prefix)}(\\w+)`, 'g'),
    escape: new RegExp(`(?<!${glue(prefix)})(?:${escapeMarkers(prefix).map(escRe).join('|')})`, 'gu'),
  }
  compiled.set(registry, result)
  return result
}

export function matchesDraftToken(registry, text, name, start, end) {
  const pattern = matchers(registry).byName.get(name)?.at
  if (!pattern) return false
  pattern.lastIndex = start
  return pattern.exec(text)?.index === start && pattern.lastIndex === end
}

export function scanDraft(registry, text) {
  if (!text.includes(registry.prefix)) return { tokens: [] }
  const ms = matchers(registry)
  const tokens = []
  for (const [name, { scan }] of ms.byName) {
    for (const hit of text.matchAll(scan)) tokens.push({ text: hit[0], name, isKnown: true, start: hit.index, end: hit.index + hit[0].length })
  }
  for (const hit of text.matchAll(ms.unknown)) {
    const name = hit[1].toLowerCase()
    if (!ms.byName.has(name)) tokens.push({ text: hit[0], name, isKnown: false, start: hit.index, end: hit.index + hit[0].length })
  }
  const escapedBy = text.match(ms.escape)?.[0]
  return { tokens: tokens.sort((a, b) => a.start - b.start), ...(escapedBy === undefined ? {} : { isEscaped: true, escapedBy }) }
}

// Same exclusion and first-winner rules as hooks/lib/inline.ts.
export function inlineBodies(defs) {
  const context = new Set(defs.filter((def) => def.insert === 'context' && !def.isPlan).map((def) => def.name.toLowerCase()))
  const bodies = new Map()
  for (const def of defs) {
    const name = def.name.toLowerCase()
    if (def.insert === 'inline' && !def.isPlan && def.body !== '' && !context.has(name) && !bodies.has(name)) bodies.set(name, def.body)
  }
  return bodies
}

export function expandInline(registry, text) {
  if (!text.includes(registry.prefix) || isEscaped(registry.prefix, text)) return null
  const bodies = inlineBodies(registry.defs)
  let out = ''
  let at = 0
  let changed = false
  const tokens = scanDraft(registry, text).tokens.filter((token) => token.isKnown).sort((a, b) => a.start - b.start || b.end - a.end)
  for (const token of tokens) {
    if (token.start < at || !bodies.has(token.name)) continue
    out += text.slice(at, token.start) + bodies.get(token.name)
    at = token.end
    changed = true
  }
  return changed ? out + text.slice(at) : null
}

export function previewContext(registry, prompt, mode) {
  if (SYNTHETIC_PROMPT.test(prompt) || isEscaped(registry.prefix, prompt)) return ''
  return assemble(registry.defs, registry.prefix, prompt, mode)
}

export function submitContext(event, options = {}) {
  if (event?.hook_event_name !== 'UserPromptSubmit' || typeof event.prompt !== 'string') return {}
  const prefix = prefixOf(options.prefix, options.env ?? process.env)
  if (!event.prompt.includes(prefix) || SYNTHETIC_PROMPT.test(event.prompt) || isEscaped(prefix, event.prompt)) return {}
  const registry = resolveRegistry({ ...options, cwd: options.cwd ?? event.cwd ?? process.cwd() })
  const text = previewContext(registry, event.prompt, event.permission_mode)
  return text === '' ? {} : { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text } }
}
