/**
 * @fileoverview Load the set of primordials currently exported by
 * `@socketsecurity/lib/primordials`.
 *
 * Two ways to resolve the surface:
 *   1. From a sibling socket-lib checkout (`../socket-lib/src/primordials.ts`).
 *      Used during fleet development — picks up unreleased exports.
 *   2. From the installed `@socketsecurity/lib/dist/primordials.js`. Used
 *      when running the audit on a target that has lib as a dep.
 *
 * Either way, we parse out the `export const Foo` symbol names — no
 * type info needed.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * @param {string} sourcePath - Path to a primordials source file (.ts or .js).
 * @returns {Set<string>}
 */
function parseExports(sourcePath) {
  const src = readFileSync(sourcePath, 'utf8')
  const exports = new Set()
  // Inline form: `export const Foo = …`
  for (const m of src.matchAll(/^export const ([A-Z][a-zA-Z0-9]+)/gm)) {
    exports.add(m[1])
  }
  // Grouped form: `export { Foo, Bar, Baz }` (with or without trailing
  // `from '...'`).
  for (const m of src.matchAll(/^export\s*\{\s*([\s\S]+?)\s*\}/gm)) {
    for (const ident of m[1].split(',')) {
      const cleaned = ident.trim().replace(/^([A-Z][a-zA-Z0-9]+).*$/, '$1')
      if (/^[A-Z][a-zA-Z0-9]+$/.test(cleaned)) {
        exports.add(cleaned)
      }
    }
  }
  return exports
}

/**
 * Find a usable primordials source given a fleet-repo-style layout.
 *
 * Lookup order:
 *   1. `<targetRoot>/../socket-lib/src/primordials.ts` (sibling checkout)
 *   2. `<targetRoot>/node_modules/@socketsecurity/lib/dist/primordials.js`
 *
 * @param {string} targetRoot - The repo being audited.
 * @returns {{ source: string; exports: Set<string> }}
 */
export function loadPrimordialsSurface(targetRoot) {
  const sibling = path.resolve(
    targetRoot,
    '..',
    'socket-lib',
    'src',
    'primordials.ts',
  )
  if (existsSync(sibling)) {
    return { source: sibling, exports: parseExports(sibling) }
  }
  const installed = path.join(
    targetRoot,
    'node_modules',
    '@socketsecurity',
    'lib',
    'dist',
    'primordials.js',
  )
  if (existsSync(installed)) {
    return { source: installed, exports: parseExports(installed) }
  }
  throw new Error(
    `Cannot locate @socketsecurity/lib/primordials. Tried:\n  ${sibling}\n  ${installed}`,
  )
}
