// Repo check — a re-exported binding must not sit inside an import cycle.
//
// Rolldown emits a re-export as an EAGER value copy taken while the re-exporting
// module initializes:
//
//   exports.isPath = require_paths_predicates.isPath
//
// That is a snapshot, not a live getter. If `paths/predicates` is already on the
// require stack when `paths/normalize` runs that line, Node hands back the
// half-built exports object, the property is missing, and `exports.isPath` is
// pinned to `undefined` for the life of the process. It never heals.
//
// Node says so out loud — "Accessing non-existent property 'isPath' of module
// exports inside circular dependency" — and the warning is easy to read as
// cosmetic. It is not. `paths/normalize` shipped nine bindings that were
// `undefined` whenever a consumer imported `paths/predicates` first, and both
// are public subpaths, so import order alone decided whether the barrel worked.

// Why this shape and not "no cycles at all": three benign cycles exist in dist
// (exe/path/which <-> resolve, logger/node <-> console, spinner/default <->
// spinner). None re-exports across the back-edge, so none can produce an
// undefined binding. Failing on those would buy nothing and invite an
// allowlist. The eager re-export is the part that breaks.
//
// The graph walk is NOT reimplemented here — `readSpecifiers` and
// `resolveRelative` are imported from the browser-exports check, which already
// reads built bytes (so erased type-only imports cost nothing) and resolves
// specifiers the way the built output means them.
//
// Usage: node scripts/repo/check/reexports-have-no-import-cycles.mts [--quiet]

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import { REPO_ROOT } from '../../fleet/paths.mts'
import {
  readSpecifiers,
  resolveRelative,
} from './browser-exports-have-no-node-builtins.mts'

const logger = getDefaultLogger()

const DIST_DIR = path.join(REPO_ROOT, 'dist')

// `const require_paths_shared = require('./shared.js');` — binds an alias to a
// module so the re-export lines below can name it.
const ALIAS_RE =
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g

// `exports.isPath = require_paths_predicates.isPath;` — the eager copy. The
// property read on the right is what evaluates to undefined mid-cycle.
const REEXPORT_RE =
  /\bexports\.([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*;/g

/**
 * One re-exported binding whose source module imports the re-exporter back.
 */
export interface ReexportCycleFinding {
  // The re-exported names that share this back-edge, sorted.
  bindings: string[]
  // Dist-relative hops from the re-export's source module back to the
  // re-exporter. Read it as the cycle, starting one step in.
  chain: string[]
  // The dist-relative file carrying the eager re-export.
  file: string
}

/**
 * Every `.js` file under `dist/`, excluding the pre-bundled `dist/external`
 * tree — those are third-party bundles this repo does not author.
 */
export function listDistFiles(root: string): string[] {
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) {
        if (path.basename(full) !== 'external') {
          walk(full)
        }
      } else if (full.endsWith('.js')) {
        found.push(full)
      }
    }
  }
  walk(root)
  return found.toSorted()
}

/**
 * The eager re-exports in a built file, as a map of source file to the binding
 * names taken from it. A re-export that renames (`exports.a = mod.b`) counts
 * the same — the read that can return undefined is the one on the right.
 */
export function readReexports(file: string): Map<string, string[]> {
  const source = readFileSync(file, 'utf8')
  const aliases = new Map<string, string>()
  ALIAS_RE.lastIndex = 0
  let aliasMatch = ALIAS_RE.exec(source)
  while (aliasMatch) {
    const resolved = resolveRelative(aliasMatch[2]!, file)
    if (resolved) {
      aliases.set(aliasMatch[1]!, resolved)
    }
    aliasMatch = ALIAS_RE.exec(source)
  }
  const byTarget = new Map<string, string[]>()
  REEXPORT_RE.lastIndex = 0
  let match = REEXPORT_RE.exec(source)
  while (match) {
    const target = aliases.get(match[2]!)
    if (target) {
      const names = byTarget.get(target)
      if (names) {
        names.push(match[1]!)
      } else {
        byTarget.set(target, [match[1]!])
      }
    }
    match = REEXPORT_RE.exec(source)
  }
  return byTarget
}

/**
 * The shortest require chain from `start` back to `goal`, or undefined when
 * `start` cannot reach it. Breadth-first, so the reported chain is the one a
 * reader should actually go fix — the same reason the browser check walks
 * breadth-first.
 */
export function findPathBack(
  start: string,
  goal: string,
): string[] | undefined {
  const seen = new Set<string>([start])
  let frontier: string[][] = [[start]]
  while (frontier.length > 0) {
    const next: string[][] = []
    for (let i = 0, { length } = frontier; i < length; i += 1) {
      const chain = frontier[i]!
      const file = chain[chain.length - 1]!
      const specs = readSpecifiers(file)
      for (let j = 0, count = specs.length; j < count; j += 1) {
        const spec = specs[j]!
        if (!spec.startsWith('.')) {
          continue
        }
        const resolved = resolveRelative(spec, file)
        if (!resolved) {
          continue
        }
        if (resolved === goal) {
          return [...chain, resolved]
        }
        if (!seen.has(resolved)) {
          seen.add(resolved)
          next.push([...chain, resolved])
        }
      }
    }
    frontier = next
  }
  return undefined
}

/**
 * Audit every built file for a re-export that crosses a cycle back-edge.
 */
export function auditReexportCycles(files: string[]): ReexportCycleFinding[] {
  const findings: ReexportCycleFinding[] = []
  for (let i = 0, { length } = files; i < length; i += 1) {
    const file = files[i]!
    const reexports = readReexports(file)
    for (const { 0: target, 1: bindings } of reexports) {
      const back = findPathBack(target, file)
      if (back) {
        findings.push({
          bindings: bindings.toSorted(),
          chain: back.map(f => path.relative(DIST_DIR, f)),
          file: path.relative(DIST_DIR, file),
        })
      }
    }
  }
  return findings
}

export function main(): void {
  const isQuiet = process.argv.includes('--quiet')

  if (!existsSync(DIST_DIR)) {
    logger.warn(
      '[reexport-cycles] dist/ is absent — run `pnpm run build` first. Skipping.',
    )
    return
  }

  const files = listDistFiles(DIST_DIR)
  const findings = auditReexportCycles(files)

  if (findings.length > 0) {
    for (let i = 0, { length } = findings; i < length; i += 1) {
      const finding = findings[i]!
      logger.error(
        `[reexport-cycles] ${finding.file} re-exports ${finding.bindings.join(', ')} from a module that imports it back`,
      )
      logger.error(`[reexport-cycles]   via ${finding.chain.join(' -> ')}`)
    }
    logger.error(
      `[reexport-cycles] ${findings.length} re-export(s) sit inside an import cycle and will be ` +
        `undefined depending on load order. Move the shared implementation DOWN into a leaf both ` +
        `sides can import, so the re-exporting module imports the graph and nothing imports it back.`,
    )
    process.exitCode = 1
    return
  }

  if (!isQuiet) {
    logger.log(
      `[reexport-cycles] ok — no re-exported binding sits inside an import cycle (${files.length} module(s))`,
    )
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
