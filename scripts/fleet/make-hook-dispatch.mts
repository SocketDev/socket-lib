#!/usr/bin/env node
/*
 * @file Generate the STATIC hook dispatch table the rolldown bundle is built
 *   from. The dispatcher (`_dispatch/dispatch.mts`) can't use a dynamic
 *   `import(path.join(HOOKS_DIR, rel))` — a dynamic specifier is opaque to the
 *   bundler, so nothing would get bundled. This maker scans
 *   `.claude/hooks/fleet/<name>/index.mts`, keeps only the hooks that are
 *   BUNDLE-SAFE (entrypoint-guarded so importing them doesn't fire `main()`,
 *   AND exporting a pure `run(payload)`), and writes
 *   `.claude/hooks/fleet/_dispatch/dispatch-table.mts`: one STATIC `import` per
 *   eligible hook, grouped by hook event. Re-run after adding/removing an
 *   eligible hook, then rebuild the bundle (`build-hook-bundle.mts`).
 *
 *   Eligibility is decided by reading each hook's source for two markers:
 *     - the entrypoint guard `import.meta.url === \`file://${process.argv[1]}\``
 *     - `export function run(` or `export async function run(`
 *   Optional per-hook tuning via two named exports the maker reads statically:
 *     - `export const DISPATCH_EVENT = 'PostToolUse'`  (default 'PreToolUse')
 *     - `export const DISPATCH_TOOLS: readonly string[] = ['Edit', 'Write']`
 *
 *   Usage: `node scripts/fleet/make-hook-dispatch.mts [--check]`
 *     --check  exit 2 if the on-disk table differs from freshly generated.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import { REPO_ROOT } from './paths.mts'

const logger = getDefaultLogger()

export const FLEET_HOOKS_DIR = path.join(
  REPO_ROOT,
  '.claude',
  'hooks',
  'fleet',
)
export const DISPATCH_DIR = path.join(FLEET_HOOKS_DIR, '_dispatch')
export const DISPATCH_TABLE_PATH = path.join(DISPATCH_DIR, 'dispatch-table.mts')

const ENTRYPOINT_GUARD_RE =
  /import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`/
const EXPORT_RUN_RE = /export\s+(?:async\s+)?function\s+run\s*\(/
const DISPATCH_EVENT_RE = /export\s+const\s+DISPATCH_EVENT\s*=\s*['"]([^'"]+)['"]/
const DISPATCH_TOOLS_RE =
  /export\s+const\s+DISPATCH_TOOLS\b[^=]*=\s*\[([^\]]*)\]/

export interface EligibleHook {
  readonly event: string
  readonly name: string
  readonly tools: readonly string[]
}

/**
 * Parse a hook's source for the eligibility markers + optional event/tools
 * declarations. Returns the eligible-hook descriptor, or undefined when the
 * hook is not bundle-safe.
 */
export function parseHookSource(
  name: string,
  source: string,
): EligibleHook | undefined {
  if (!ENTRYPOINT_GUARD_RE.test(source) || !EXPORT_RUN_RE.test(source)) {
    return undefined
  }
  const eventMatch = DISPATCH_EVENT_RE.exec(source)
  const event = eventMatch?.[1] ?? 'PreToolUse'
  const toolsMatch = DISPATCH_TOOLS_RE.exec(source)
  const tools = toolsMatch?.[1]
    ? toolsMatch[1]
        .split(',')
        .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
    : []
  return { __proto__: null, event, name, tools } as EligibleHook
}

/**
 * Scan the fleet hooks dir, returning every bundle-safe hook sorted by name.
 */
export function collectEligibleHooks(hooksDir: string): EligibleHook[] {
  const entries = readdirSync(hooksDir, { withFileTypes: true })
  const eligible: EligibleHook[] = []
  for (const dirent of entries) {
    if (!dirent.isDirectory()) {
      continue
    }
    const name = dirent.name
    if (name.startsWith('_')) {
      continue
    }
    const indexPath = path.join(hooksDir, name, 'index.mts')
    let source: string
    try {
      source = readFileSync(indexPath, 'utf8')
    } catch {
      continue
    }
    const parsed = parseHookSource(name, source)
    if (parsed) {
      eligible.push(parsed)
    }
  }
  eligible.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return eligible
}

/**
 * Render the dispatch-table.mts source from the eligible-hook list. Each hook
 * gets a STATIC import (so rolldown bundles it) and a table row keyed by event.
 */
export function renderDispatchTable(hooks: readonly EligibleHook[]): string {
  const importLines = hooks.map(
    (h, i) => `import { run as run${i} } from '../${h.name}/index.mts'`,
  )
  const byEvent = new Map<string, { idx: number; hook: EligibleHook }[]>()
  hooks.forEach((hook, idx) => {
    const list = byEvent.get(hook.event) ?? []
    list.push({ hook, idx })
    byEvent.set(hook.event, list)
  })
  const events = [...byEvent.keys()].sort()
  const tableBody = events
    .map(event => {
      const rows = byEvent
        .get(event)!
        .map(({ hook, idx }) => {
          const toolsLiteral = hook.tools.length
            ? `[${hook.tools.map(t => `'${t}'`).join(', ')}]`
            : 'undefined'
          return `    { name: '${hook.name}', run: run${idx}, tools: ${toolsLiteral} },`
        })
        .join('\n')
      return `  '${event}': [\n${rows}\n  ],`
    })
    .join('\n')
  return (
    `// GENERATED by scripts/fleet/make-hook-dispatch.mts — do not edit by hand.\n` +
    `// Static dispatch table: every bundle-safe fleet hook, grouped by event.\n` +
    `// Re-run the maker after adding/removing an eligible hook, then rebuild\n` +
    `// the bundle with scripts/fleet/build-hook-bundle.mts.\n` +
    `\n` +
    `import type { DispatchHookEntry } from './dispatch.mts'\n` +
    `\n` +
    (importLines.length ? importLines.join('\n') + '\n\n' : '\n') +
    `export const DISPATCH_TABLE: Record<string, readonly DispatchHookEntry[]> = {\n` +
    `  __proto__: null,\n` +
    (tableBody ? tableBody + '\n' : '') +
    `} as Record<string, readonly DispatchHookEntry[]>\n`
  )
}

export function generateDispatchTableSource(hooksDir: string): string {
  return renderDispatchTable(collectEligibleHooks(hooksDir))
}

function main(): void {
  const checkOnly = process.argv.includes('--check')
  const generated = generateDispatchTableSource(FLEET_HOOKS_DIR)
  if (checkOnly) {
    let onDisk = ''
    try {
      onDisk = readFileSync(DISPATCH_TABLE_PATH, 'utf8')
    } catch {
      onDisk = ''
    }
    if (onDisk !== generated) {
      logger.error(
        `dispatch-table.mts is stale. Regenerate:\n` +
          `  node scripts/fleet/make-hook-dispatch.mts`,
      )
      process.exitCode = 2
      return
    }
    logger.log('dispatch-table.mts is current.')
    return
  }
  writeFileSync(DISPATCH_TABLE_PATH, generated)
  const count = collectEligibleHooks(FLEET_HOOKS_DIR).length
  logger.log(
    `Wrote ${path.relative(REPO_ROOT, DISPATCH_TABLE_PATH)} (${count} bundle-safe hook${count === 1 ? '' : 's'}).`,
  )
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main()
}
