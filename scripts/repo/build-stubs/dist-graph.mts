/*
 * @file The reachability leg of the unexposed-leaf mechanism: no throwing stub
 *   may sit in the require graph of a dist module that ships real code.
 *
 *   The stub list answers "does a fleet repo IMPORT this specifier". That is a
 *   different question from "can shipped code REACH this file", and the gap
 *   between them shipped a dead HTTP transport. `@socketsecurity/lib/http-request`
 *   is imported all over the fleet, but its `browser` condition resolves to
 *   `dist/http-request/browser.js`, whose exports-map key is the SEPARATE leaf
 *   `http-request/browser` that nobody names in an import. So the browser twin
 *   read as fleet-unused, got compiled out, and every browser bundle of the SDK
 *   threw before it touched `fetch`.
 *
 *   Two properties make this leg the one that catches that class:
 *
 *   1. It seeds from EVERY condition of an exports entry, not just `default`.
 *      A `browser` / `import` / `require` target is a real entry point, so a
 *      leaf reachable only through a condition is reachable, full stop.
 *   2. It reads the BUILT dist bytes, so it needs no sibling checkouts. The
 *      fleet-usage leg degrades to a warning wherever the roster is absent,
 *      which is precisely CI. This one runs everywhere and never abstains.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { normalizePath } from '@socketsecurity/lib-stable/paths/normalize'

import { readUnexposedLeaves, STUB_BANNER } from './unexposed.mts'

export interface ReachableStubFinding {
  // The dist-relative file that carries the stub banner.
  file: string
  // The exports-map leaves whose entry points at that file, when any does.
  leaves: string[]
  // The exports-map leaf the walk started from, then each require hop to the
  // stub. Read it as the import a consumer writes, followed by the chain that
  // makes the stub reachable.
  chain: string[]
}

// A dist path as a comparable key: forward slashes, no leading `./`. An
// exports target is spelled `./dist/x.js` while a resolved require is
// `dist/x.js`, and the two must be the SAME key or the walk silently treats
// one file as two and reports a reachable stub as unreachable.
function distKey(relPath: string): string {
  const unix = normalizePath(relPath)
  return unix.startsWith('./') ? unix.slice(2) : unix
}

/**
 * Every dist `.js` target an exports entry can resolve to, across all
 * conditions. A conditional entry is a tree of objects, so this recurses
 * rather than reading `default` alone.
 */
export function collectConditionTargets(
  entry: unknown,
  acc: string[],
): string[] {
  if (typeof entry === 'string') {
    if (entry.endsWith('.js')) {
      acc.push(distKey(entry))
    }
    return acc
  }
  if (entry !== null && typeof entry === 'object') {
    const values = Object.values(entry as Record<string, unknown>)
    for (let i = 0, { length } = values; i < length; i += 1) {
      collectConditionTargets(values[i], acc)
    }
  }
  return acc
}

/**
 * The exports map's concrete leaves paired with every dist target they can
 * resolve to. Pattern entries and `./package.json` carry no module to stub.
 */
export function leafTargetMap(repoRoot: string): Map<string, string[]> {
  const manifest = JSON.parse(
    readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
  ) as { exports?: Record<string, unknown> | undefined }
  const exportsMap = manifest.exports ?? {}
  const result = new Map<string, string[]>()
  const keys = Object.keys(exportsMap)
  for (let i = 0, { length } = keys; i < length; i += 1) {
    const key = keys[i] as string
    if (
      !key.startsWith('./') ||
      key.includes('*') ||
      key === './package.json'
    ) {
      continue
    }
    const targets = [...new Set(collectConditionTargets(exportsMap[key], []))]
    if (targets.length > 0) {
      result.set(key.slice(2), targets)
    }
  }
  return result
}

// Resolve a dist-relative require target the way Node would: the literal
// file, then `.js`, then `index.js` inside a directory.
function resolveDistFile(
  repoRoot: string,
  relPath: string,
): string | undefined {
  const key = distKey(relPath)
  const candidates = key.endsWith('.js')
    ? [key]
    : [`${key}.js`, `${key}/index.js`, key]
  for (let i = 0, { length } = candidates; i < length; i += 1) {
    const candidate = candidates[i] as string
    const absPath = path.join(repoRoot, candidate)
    if (existsSync(absPath) && !statSync(absPath).isDirectory()) {
      return candidate
    }
  }
  return undefined
}

function isStubFile(repoRoot: string, key: string): boolean {
  return readFileSync(path.join(repoRoot, key), 'utf8').startsWith(STUB_BANNER)
}

const RELATIVE_REQUIRE_RE = /require\(\s*['"](?<spec>\.[^'"]+)['"]\s*\)/g

// The dist files a built CJS module requires, as resolved dist keys.
function requiredDistFiles(repoRoot: string, key: string): string[] {
  const text = readFileSync(path.join(repoRoot, key), 'utf8')
  const deps: string[] = []
  let match = RELATIVE_REQUIRE_RE.exec(text)
  while (match !== null) {
    const spec = match.groups?.['spec']
    if (spec) {
      const joined = distKey(
        path.posix.join(path.posix.dirname(distKey(key)), normalizePath(spec)),
      )
      const resolved = resolveDistFile(repoRoot, joined)
      if (resolved) {
        deps.push(resolved)
      }
    }
    match = RELATIVE_REQUIRE_RE.exec(text)
  }
  return deps
}

/**
 * Throwing stubs that shipped code can reach. Walks the built require graph
 * out of every real entry point and reports each stub it lands on, with the
 * chain that got there.
 *
 * Returns empty when dist/ is unbuilt — there are no bytes to judge, and an
 * unbuilt tree is not a finding.
 */
export function findStubsReachableFromShippedCode(
  repoRoot: string,
): ReachableStubFinding[] {
  if (!existsSync(path.join(repoRoot, 'dist'))) {
    return []
  }
  const listed = new Set(readUnexposedLeaves(repoRoot))
  const leafTargets = leafTargetMap(repoRoot)

  // Which leaves claim a given dist file, so a finding can name the leaf to
  // pass to expose-leaf.mts rather than just the file that throws.
  const targetOwners = new Map<string, string[]>()
  for (const [leaf, targets] of leafTargets) {
    for (let i = 0, { length } = targets; i < length; i += 1) {
      const resolved = resolveDistFile(repoRoot, targets[i] as string)
      if (!resolved) {
        continue
      }
      const owners = targetOwners.get(resolved)
      if (owners) {
        owners.push(leaf)
      } else {
        targetOwners.set(resolved, [leaf])
      }
    }
  }

  // Seed with every dist target of every leaf that is NOT on the stub list.
  // Those are the entry points a consumer can resolve and expect to work.
  //
  // A seed target that is ITSELF a stub is the primary finding, not something
  // to skip: that is the http-request shape, where an unlisted leaf's `browser`
  // condition points at the same file a listed leaf owns. The walk below
  // records it, so seeding unconditionally is what makes the direct case fail.
  const queue: Array<{ chain: string[]; file: string }> = []
  for (const [leaf, targets] of leafTargets) {
    if (listed.has(leaf)) {
      continue
    }
    for (let i = 0, { length } = targets; i < length; i += 1) {
      const resolved = resolveDistFile(repoRoot, targets[i] as string)
      if (resolved) {
        queue.push({ chain: [leaf], file: resolved })
      }
    }
  }

  const seen = new Set<string>()
  const hits = new Map<string, string[]>()
  while (queue.length > 0) {
    const { chain, file } = queue.pop() as { chain: string[]; file: string }
    if (seen.has(file)) {
      continue
    }
    seen.add(file)
    if (isStubFile(repoRoot, file)) {
      if (!hits.has(file)) {
        hits.set(file, chain)
      }
      // A stub's body is generated, so it has no real dependencies to follow.
      continue
    }
    const deps = requiredDistFiles(repoRoot, file)
    for (let i = 0, { length } = deps; i < length; i += 1) {
      const dep = deps[i] as string
      if (!seen.has(dep)) {
        queue.push({ chain: [...chain, dep], file: dep })
      }
    }
  }

  const findings: ReachableStubFinding[] = []
  for (const [file, chain] of hits) {
    const owners = targetOwners.get(file) ?? []
    findings.push({
      chain,
      file,
      leaves: owners.filter(leaf => listed.has(leaf)).toSorted(),
    })
  }
  return findings.toSorted((a, b) => a.file.localeCompare(b.file))
}

/**
 * The error text for a reachable-stub finding set, shaped What / Where / Saw /
 * Fix so the build and the check report it identically.
 */
export function reachableStubErrorMessage(
  findings: readonly ReachableStubFinding[],
): string {
  const lines = findings.map(
    finding =>
      `    ${finding.file}\n` +
      `      reached by: ${finding.chain.join(' -> ')}\n` +
      `      expose: ${finding.leaves.join(', ') || '(no exports-map leaf owns this file)'}`,
  )
  const exposable = [
    ...new Set(findings.flatMap(finding => finding.leaves)),
  ].toSorted()
  return (
    'build-stubs: shipped code can reach a throwing stub.\n' +
    '  Where: the built dist require graph.\n' +
    `  Saw: ${findings.length} stub module(s) reachable from a leaf that ships real code; wanted every stub unreachable.\n` +
    `${lines.join('\n')}\n` +
    '  Why: the leaf a consumer imports resolves into these files, so the call throws\n' +
    '    the compiled-out error instead of running. A leaf reached only through an\n' +
    '    exports CONDITION (browser/import/require) is invisible to the fleet-usage\n' +
    '    leg, which asks who imports a specifier.\n' +
    '  Fix: expose the reachable leaves, which rebuilds and commits:\n' +
    `    node scripts/repo/expose-leaf.mts ${exposable.join(' ') || '<leaf>'}`
  )
}
