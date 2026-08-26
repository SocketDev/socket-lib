// Repo check — a `browser`-conditioned export must not reach a Node builtin.
//
// The `browser` condition on an exports entry is a PROMISE to every downstream
// bundler: resolve here for `target: web` and the graph will not want
// `node:*`. Nothing verified that promise. `scripts/repo/package-exports.config`
// grants it from a glob, and a glob cannot know what a module imported after it
// was written — `./npm/**` claimed nineteen browser-safe leaves and three that
// were not, because a tarball reader landed under the same prefix and pulled
// `node:zlib` in behind it.
//
// This is the class of regression nothing else catches. It is invisible in
// Node: the tests pass, `pnpm run type` passes, the package publishes. It
// surfaces only when someone bundles for a browser and webpack reports
// UnhandledSchemeError on a `node:` specifier, in their repo, not ours.
//
// Two properties make this check the one that catches it:
//
//   1. It reads the BUILT dist bytes, so TypeScript's type-only imports are
//      already erased. `import type { Buffer } from 'node:buffer'` costs a
//      browser bundle nothing, and a source-level scan that counted it would
//      cry wolf until someone turned the check off.
//   2. It walks TRANSITIVELY from every entry that carries a `browser`
//      condition. Every one of the three real findings was a leaf whose own
//      imports were clean and whose fourth or fifth hop was not.
//
// A BARE builtin specifier (`require('fs')`, the form `src/node/*.mts` uses on
// purpose) is NOT a finding: the top-level `browser` field maps all ~120 of
// them to `false`, so a bundler stubs them. Only a `node:`-prefixed specifier
// is, because the prefix defeats that mapping and throws instead.
//
// Usage: node scripts/repo/check/browser-exports-have-no-node-builtins.mts [--quiet]

import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import { REPO_ROOT } from '../../fleet/paths.mts'

const logger = getDefaultLogger()

const DIST_DIR = path.join(REPO_ROOT, 'dist')

// Import, re-export, bare side-effect import, dynamic import, and require.
// Matched against BUILT JavaScript, where the only thing standing between a
// specifier and the bundler is this syntax.
const SPECIFIER_RE =
  /(?:^|[\s;}])(?:export|import)[\s\S]*?\bfrom\s*['"]([^'"]+)['"]|(?:^|[\s;}])import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)|\brequire\(\s*['"]([^'"]+)['"]\s*\)/g

/**
 * One browser-conditioned export whose graph reaches a Node builtin.
 */
export interface BrowserLeakFinding {
  // The `node:` specifiers reached, sorted.
  builtins: string[]
  // The dist-relative hops from the leaf's target to the first importer of
  // `builtins[0]`. Read it as the chain a bundler would walk.
  chain: string[]
  // The exports-map key that carries the `browser` condition.
  leaf: string
}

/**
 * Every module specifier a built file imports at RUNTIME.
 *
 * Cached — the graphs of 85 leaves overlap almost completely, and re-reading
 * `paths/normalize.js` once per leaf is the difference between instant and not.
 */
const specifierCache = new Map<string, string[]>()
export function readSpecifiers(file: string): string[] {
  const cached = specifierCache.get(file)
  if (cached) {
    return cached
  }
  const source = readFileSync(file, 'utf8')
  const found = new Set<string>()
  SPECIFIER_RE.lastIndex = 0
  let match = SPECIFIER_RE.exec(source)
  while (match) {
    const spec = match[1] ?? match[2] ?? match[3] ?? match[4]
    if (spec) {
      found.add(spec)
    }
    match = SPECIFIER_RE.exec(source)
  }
  const specs = [...found]
  specifierCache.set(file, specs)
  return specs
}

/**
 * Resolve a relative specifier against the importing file, the way the built
 * output means it. Returns undefined for anything that is not an on-disk
 * module, which a bundler would resolve elsewhere and this walk should skip.
 */
export function resolveRelative(
  spec: string,
  fromFile: string,
): string | undefined {
  const base = path.resolve(path.dirname(fromFile), spec)
  const candidates = [base, `${base}.js`, path.join(base, 'index.js')]
  for (let i = 0, { length } = candidates; i < length; i += 1) {
    const candidate = candidates[i]!
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate
    }
  }
  return undefined
}

/**
 * The `node:`-prefixed specifiers reachable from `entryFile`, each paired with
 * the ABSOLUTE chain of files that leads to the one that imports it. Making
 * the chain relative is the reporter's job, not the walk's.
 *
 * Breadth-first so a reported chain is a SHORTEST path. A depth-first walk
 * reports whichever route it wandered down first, which for `node:zlib` under
 * `./npm/meta` was eleven hops when a five-hop one existed — and the long one
 * sends a reader to the wrong file to fix it.
 */
export function findNodeBuiltins(entryFile: string): Map<string, string[]> {
  const hits = new Map<string, string[]>()
  const seen = new Set<string>([entryFile])
  let frontier: Array<{ chain: string[]; file: string }> = [
    { chain: [entryFile], file: entryFile },
  ]
  while (frontier.length > 0) {
    const next: Array<{ chain: string[]; file: string }> = []
    for (let i = 0, { length } = frontier; i < length; i += 1) {
      const { chain, file } = frontier[i]!
      const specs = readSpecifiers(file)
      for (let j = 0, count = specs.length; j < count; j += 1) {
        const spec = specs[j]!
        if (spec.startsWith('node:')) {
          if (!hits.has(spec)) {
            hits.set(spec, chain)
          }
          continue
        }
        if (!spec.startsWith('.')) {
          continue
        }
        const resolved = resolveRelative(spec, file)
        if (resolved && !seen.has(resolved)) {
          seen.add(resolved)
          next.push({ chain: [...chain, resolved], file: resolved })
        }
      }
    }
    frontier = next
  }
  return hits
}

/**
 * The runtime target of an exports entry's `browser` condition, when it has
 * one. A nested conditions object is a self-routing browser-safe leaf; a bare
 * string is a `.browser.<ext>` build override. Both are promises to a bundler.
 */
export function browserTargetOf(entry: unknown): string | undefined {
  if (entry === null || typeof entry !== 'object') {
    return undefined
  }
  const browser = (entry as Record<string, unknown>)['browser']
  if (typeof browser === 'string') {
    return browser
  }
  if (browser !== null && typeof browser === 'object') {
    const target = (browser as Record<string, unknown>)['default']
    return typeof target === 'string' ? target : undefined
  }
  return undefined
}

/**
 * Audit every browser-conditioned export in `exportsMap`.
 */
export function auditBrowserExports(
  exportsMap: Record<string, unknown>,
): BrowserLeakFinding[] {
  const findings: BrowserLeakFinding[] = []
  const entries = Object.entries(exportsMap)
  for (let i = 0, { length } = entries; i < length; i += 1) {
    const { 0: leaf, 1: entry } = entries[i]!
    const target = browserTargetOf(entry)
    if (!target?.endsWith('.js')) {
      continue
    }
    const file = path.join(REPO_ROOT, target.replace(/^\.\//, ''))
    if (!existsSync(file)) {
      continue
    }
    const hits = findNodeBuiltins(file)
    if (hits.size === 0) {
      continue
    }
    const builtins = [...hits.keys()].toSorted()
    findings.push({
      builtins,
      chain: hits.get(builtins[0]!)!.map(f => path.relative(DIST_DIR, f)),
      leaf,
    })
  }
  return findings
}

export function main(): void {
  const isQuiet = process.argv.includes('--quiet')
  const pkg = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'),
  ) as { exports?: Record<string, unknown> | undefined }
  const exportsMap = pkg.exports ?? {}

  if (!existsSync(DIST_DIR)) {
    logger.warn(
      '[browser-exports] dist/ is absent — run `pnpm run build` first. Skipping.',
    )
    return
  }

  const findings = auditBrowserExports(exportsMap)
  if (findings.length > 0) {
    for (let i = 0, { length } = findings; i < length; i += 1) {
      const finding = findings[i]!
      logger.error(
        `[browser-exports] ${finding.leaf} claims the browser condition but reaches ${finding.builtins.join(', ')}`,
      )
      logger.error(`[browser-exports]   via ${finding.chain.join(' -> ')}`)
    }
    logger.error(
      `[browser-exports] ${findings.length} export(s) promise a browser build they cannot keep. ` +
        `Either drop the leaf from the \`browser\` list in scripts/repo/package-exports.config.mts, ` +
        `or split the Node-only part into a \`node\`/\`browser\` twin pair.`,
    )
    process.exitCode = 1
    return
  }

  if (!isQuiet) {
    const count = Object.values(exportsMap).filter(
      e => browserTargetOf(e) !== undefined,
    ).length
    logger.log(
      `[browser-exports] ok — ${count} browser-conditioned export(s) reach no node: builtin`,
    )
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
