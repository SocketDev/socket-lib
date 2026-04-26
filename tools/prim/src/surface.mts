/**
 * @fileoverview Load the set of primordials currently exported by
 * `@socketsecurity/lib/primordials` (or any primordials-shaped source
 * file passed via --surface).
 *
 * Three ways to resolve the surface:
 *   1. Explicit `--surface <path>` flag — overrides everything else.
 *      Use this to point at Node.js's `lib/internal/per_context/primordials.js`,
 *      a vendored copy, or any other primordials file.
 *   2. From a sibling socket-lib checkout (`../socket-lib/src/primordials.ts`).
 *      Used during fleet development — picks up unreleased exports.
 *   3. From the installed `@socketsecurity/lib/dist/primordials.js`. Used
 *      when running the audit on a target that has lib as a dep.
 *
 * Either way, we parse out the `export const Foo` symbol names — no
 * type info needed. For non-ESM surfaces (Node's per_context primordials
 * use `primordials.X = ...` assignments), we also recognize that form.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * @param {string} sourcePath - Path to a primordials source file (.ts or .js).
 * @returns {Set<string>}
 */
// Globals whose static + prototype methods get reflectively copied
// into Node's bootstrap primordials. Sourced from
// `lib/internal/per_context/primordials.js` in the Node tree. Keep
// this list in sync with what `prim` should consider "available" when
// scanning Node bootstrap code.
const NODE_PRIMORDIAL_GLOBALS = [
  'AggregateError',
  'Array',
  'ArrayBuffer',
  'BigInt',
  'BigInt64Array',
  'BigUint64Array',
  'Boolean',
  'DataView',
  'Date',
  'Error',
  'EvalError',
  'FinalizationRegistry',
  'Float32Array',
  'Float64Array',
  'Function',
  'Int16Array',
  'Int32Array',
  'Int8Array',
  'Map',
  'Number',
  'Object',
  'Promise',
  'RangeError',
  'ReferenceError',
  'RegExp',
  'Set',
  'String',
  'Symbol',
  'SyntaxError',
  'TypeError',
  'URIError',
  'Uint16Array',
  'Uint32Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'WeakMap',
  'WeakRef',
  'WeakSet',
]

// Namespace objects whose static methods get copied as `<Name><Method>`.
const NODE_PRIMORDIAL_NAMESPACES = [
  'Atomics',
  'JSON',
  'Math',
  'Proxy',
  'Reflect',
]

/**
 * Compute the full set of primordials Node's bootstrap installs by
 * enumerating the static + prototype methods of the upstream globals.
 * This mirrors what `lib/internal/per_context/primordials.js` does at
 * runtime via `copyPropsRenamed` + `copyPrototype` helpers — names like
 * `ArrayPrototypeMap` aren't directly assigned in the source (they're
 * installed by reflection), so name-only regex parsing misses them.
 */
function deriveNodeBootstrapSurface() {
  const exports = new Set()

  for (const ns of NODE_PRIMORDIAL_NAMESPACES) {
    const original = globalThis[ns]
    if (!original) {
      continue
    }
    for (const propName of Object.getOwnPropertyNames(original)) {
      if (propName === 'prototype' || propName === 'constructor') {
        continue
      }
      const descriptor = Object.getOwnPropertyDescriptor(original, propName)
      if (descriptor && 'value' in descriptor) {
        exports.add(`${ns}${capitalize(propName)}`)
      }
    }
  }

  for (const name of NODE_PRIMORDIAL_GLOBALS) {
    const original = globalThis[name]
    if (!original) {
      continue
    }
    // Static side: `<Name>` itself + `<Name><Method>` for each static
    // method.
    exports.add(name)
    for (const propName of Object.getOwnPropertyNames(original)) {
      if (
        propName === 'prototype' ||
        propName === 'name' ||
        propName === 'length'
      ) {
        continue
      }
      exports.add(`${name}${capitalize(propName)}`)
    }
    // Prototype side: `<Name>Prototype<Method>` for each prototype method.
    if (original.prototype) {
      for (const propName of Object.getOwnPropertyNames(original.prototype)) {
        if (propName === 'constructor') {
          continue
        }
        exports.add(`${name}Prototype${capitalize(propName)}`)
      }
    }
  }

  // Safe* wrappers Node installs via makeSafe.
  for (const safe of [
    'SafeMap',
    'SafeWeakMap',
    'SafeSet',
    'SafeWeakSet',
    'SafeFinalizationRegistry',
    'SafeWeakRef',
    'SafeArrayIterator',
    'SafeStringIterator',
    'SafePromisePrototypeFinally',
    'SafePromiseAll',
    'SafePromiseAllReturnVoid',
    'SafePromiseAllReturnArrayLike',
    'SafePromiseAllSettled',
    'SafePromiseAllSettledReturnVoid',
    'SafePromiseAny',
    'SafePromiseRace',
    'SafePromisePrototypeCatch',
  ]) {
    exports.add(safe)
  }

  // Misc helpers Node exposes directly.
  for (const helper of [
    'uncurryThis',
    'applyBind',
    'makeSafe',
    'IteratorPrototype',
    'AsyncIteratorPrototype',
    'globalThis',
  ]) {
    exports.add(helper)
  }

  return exports
}

function capitalize(s) {
  if (!s) {
    return s
  }
  return s[0].toUpperCase() + s.slice(1)
}

function parseExports(sourcePath) {
  const src = readFileSync(sourcePath, 'utf8')
  const exports = new Set()
  // ESM inline form: `export const Foo = …`
  for (const m of src.matchAll(/^export const ([A-Z][a-zA-Z0-9]+)/gm)) {
    exports.add(m[1])
  }
  // ESM grouped form: `export { Foo, Bar, Baz }` (with or without trailing
  // `from '...'`).
  for (const m of src.matchAll(/^export\s*\{\s*([\s\S]+?)\s*\}/gm)) {
    for (const ident of m[1].split(',')) {
      const cleaned = ident.trim().replace(/^([A-Z][a-zA-Z0-9]+).*$/, '$1')
      if (/^[A-Z][a-zA-Z0-9]+$/.test(cleaned)) {
        exports.add(cleaned)
      }
    }
  }
  // Node bootstrap form: `primordials.Foo = ...` direct assignments.
  for (const m of src.matchAll(/\bprimordials\.([A-Z][a-zA-Z0-9]+)\s*=/g)) {
    exports.add(m[1])
  }
  // Heuristic: detect a Node `per_context/primordials.js` and union in
  // the dynamically-derived surface (the names Node installs via
  // copyPrototype/copyPropsRenamed reflection that aren't in the file
  // as text).
  if (sourcePath.includes('per_context/primordials')) {
    for (const name of deriveNodeBootstrapSurface()) {
      exports.add(name)
    }
  }
  return exports
}

/**
 * Find a usable primordials source.
 *
 * Lookup order:
 *   1. Explicit `surfacePath` argument (from `--surface <path>` CLI flag).
 *   2. `<targetRoot>/../socket-lib/src/primordials.ts` (sibling checkout).
 *   3. `<targetRoot>/node_modules/@socketsecurity/lib/dist/primordials.js`.
 *
 * @param {string} targetRoot - The repo being audited.
 * @param {string} [surfacePath] - Explicit path to a primordials source file.
 * @returns {{ source: string; exports: Set<string> }}
 */
export function loadPrimordialsSurface(targetRoot, surfacePath) {
  if (surfacePath) {
    const resolved = path.resolve(surfacePath)
    if (!existsSync(resolved)) {
      throw new Error(`--surface path not found: ${resolved}`)
    }
    return { source: resolved, exports: parseExports(resolved) }
  }
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
    `Cannot locate @socketsecurity/lib/primordials. Tried:\n  ${sibling}\n  ${installed}\n` +
      `Pass --surface <path> to specify a primordials source explicitly.`,
  )
}
