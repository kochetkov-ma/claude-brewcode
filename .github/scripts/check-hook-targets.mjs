#!/usr/bin/env node
// check-hook-targets.mjs [root] - every file a marketplace plugin's hooks.json targets exists inside that plugin.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '../..'))
const PLUGIN_ROOT_PATH = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s"'`;|&()]+)/g
const isFile = (path) => existsSync(path) && statSync(path).isFile()

function targetsOf(config) {
  const strings = Object.values(config.hooks ?? {}).flat().flatMap((group) => group.hooks ?? []).flatMap((hook) => [hook.command, ...(hook.args ?? [])])
  const fromHooks = strings.filter((s) => typeof s === 'string').flatMap((s) => [...s.matchAll(PLUGIN_ROOT_PATH)].map((m) => m[1]))
  return [...new Set([...fromHooks, ...(config.modules ?? []).map((m) => join('hooks', m))])]
}

const errors = []
let checked = 0
for (const { name, source } of JSON.parse(readFileSync(join(root, '.claude-plugin/marketplace.json'), 'utf8')).plugins) {
  const plugin = resolve(root, source)
  const hooksFile = join(plugin, 'hooks/hooks.json')
  if (!existsSync(hooksFile)) continue
  for (const target of targetsOf(JSON.parse(readFileSync(hooksFile, 'utf8')))) {
    checked += 1
    const path = resolve(plugin, target)
    if (relative(plugin, path).startsWith('..') || !isFile(path)) errors.push(`::error file=${relative(root, hooksFile)}::${name}: hook target missing: ${target}`)
  }
}
for (const line of errors) console.error(line)
if (errors.length === 0) console.log(`hook targets exist: ${checked}`)
process.exit(errors.length === 0 ? 0 : 1)
