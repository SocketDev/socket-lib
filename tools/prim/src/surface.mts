import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs'
import path from 'node:path'
import { isPathWithinRoot } from '@socketsecurity/lib-stable/paths/predicates'

import { GLOBAL_RECORD } from './globals.mts'

/**
 * A global read off `globalThis` by name. Only its prototype is inspected, so
 * that is all this names.
 */
export interface GlobalWithPrototype {
  prototype?: unknown | undefined
}

/**
 * @param {string} sourcePath - Path to a primordials source file (.ts or .js).
 *
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

export function capitalize(s: string): string {
  if (!s) {
    return s
  }
  return s[0]!.toUpperCase() + s.slice(1)
}

export function collectNamespacePrimordials(exports: Set<string>): void {
  for (let i = 0, { length } = NODE_PRIMORDIAL_NAMESPACES; i < length; i += 1) {
    const ns = NODE_PRIMORDIAL_NAMESPACES[i]!
    const original = GLOBAL_RECORD[ns]
    if (!original) {
      continue
    }
    for (const propName of Object.getOwnPropertyNames(original)) {
      if (propName === 'constructor' || propName === 'prototype') {
        continue
      }
      const descriptor = Object.getOwnPropertyDescriptor(original, propName)
      if (descriptor && 'value' in descriptor) {
        exports.add(`${ns}${capitalize(propName)}`)
      }
    }
  }
}

/**
 * Compute the full set of primordials Node's bootstrap installs by enumerating
 * the static + prototype methods of the upstream globals. This mirrors what
 * `lib/internal/per_context/primordials.js` does at runtime via
 * `copyPropsRenamed` + `copyPrototype` helpers — names like `ArrayPrototypeMap`
 * aren't directly assigned in the source but installed by reflection, so
 * name-only regex parsing misses them.
 */
export function deriveNodeBootstrapSurface() {
  const exports = new Set<string>()

  collectNamespacePrimordials(exports)

  for (let i = 0, { length } = NODE_PRIMORDIAL_GLOBALS; i < length; i += 1) {
    const name = NODE_PRIMORDIAL_GLOBALS[i]!
    const original = GLOBAL_RECORD[name] as GlobalWithPrototype | undefined
    if (!original) {
      continue
    }
    // Static side: `<Name>` itself + `<Name><Method>` for each static
    // method.
    exports.add(name)
    for (const propName of Object.getOwnPropertyNames(original)) {
      if (
        propName === 'length' ||
        propName === 'name' ||
        propName === 'prototype'
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

/**
 * Find a usable primordials source.
 *
 * Explicit sources remain inside the target. Otherwise use its installed
 * package.
 *
 * @param {string} targetRoot - The repo being audited.
 * @param {string} [surfacePath] - Explicit path to a primordials source file.
 *
 * @returns {{ source: string; exports: Set<string> }}
 */
export function loadPrimordialsSurface(
  targetRoot: string,
  surfacePath?: string | undefined,
) {
  if (surfacePath) {
    const resolved = path.resolve(targetRoot, surfacePath)
    if (
      !existsSync(resolved) ||
      !isPathWithinRoot(realpathSync(resolved), realpathSync(targetRoot))
    ) {
      throw new Error(
        `Primordials surface is unavailable or external. Where: ${resolved}. Saw a missing or external source; wanted a source inside ${targetRoot}. Fix: provide a contained --surface path.`,
      )
    }
    return { __proto__: null, source: resolved, ...parseExports(resolved) }
  }
  const installedDir = path.join(
    targetRoot,
    'node_modules',
    '@socketsecurity',
    'lib',
    'dist',
    'primordials',
  )
  if (existsSync(installedDir)) {
    return {
      __proto__: null,
      source: installedDir,
      ...parseExports(installedDir),
    }
  }
  const installedLegacy = path.join(
    targetRoot,
    'node_modules',
    '@socketsecurity',
    'lib',
    'dist',
    'primordials.js',
  )
  if (existsSync(installedLegacy)) {
    return {
      __proto__: null,
      source: installedLegacy,
      ...parseExports(installedLegacy),
    }
  }
  throw new Error(
    `Cannot locate @socketsecurity/lib/primordials. Tried:\n  ${installedDir}\n  ${installedLegacy}\n` +
      `Pass --surface <path> to specify a primordials source explicitly.`,
  )
}

export interface ParsedPrimordialsSurface {
  exports: Set<string>
  nullable: Set<string>
  exportToLeaf: Map<string, string>
}

export function parseExports(sourcePath: string): ParsedPrimordialsSurface {
  const exportToLeaf = new Map<string, string>()
  const src = readSurfaceSources(sourcePath, exportToLeaf)
  const exports = new Set<string>()
  const nullable = new Set<string>()
  // ESM inline form: `export const Foo = …`
  for (const m of src.matchAll(/^export const ([A-Z][a-zA-Z0-9]+)/gm)) {
    exports.add(m[1]!)
  }
  // Lower-case function exports: the Node-platform `process` primordials
  // (`processCwd`, `processNextTick`, …) are `export function`, not const, and
  // lower-case. The codemod's `process.cwd()` → `processCwd()` rewrite needs
  // them in the surface so the `exported.has(...)` guard passes.
  for (const m of src.matchAll(/^export function ([a-z][a-zA-Z0-9]+)/gm)) {
    exports.add(m[1]!)
  }
  // ESM grouped form: `export { Foo, Bar, Baz }` (with or without trailing
  // `from '...'`).
  for (const m of src.matchAll(/^export\s*\{\s*([\s\S]+?)\s*\}/gm)) {
    const idents = m[1]!.split(',')
    for (let i = 0, { length } = idents; i < length; i += 1) {
      const ident = idents[i]!
      const cleaned = ident.trim().replace(/^([A-Z][a-zA-Z0-9]+).*$/, '$1')
      if (/^[A-Z][a-zA-Z0-9]+$/.test(cleaned)) {
        exports.add(cleaned)
      }
    }
  }
  // Node bootstrap form: `primordials.Foo = ...` direct assignments.
  for (const m of src.matchAll(/\bprimordials\.([A-Z][a-zA-Z0-9]+)\s*=/g)) {
    exports.add(m[1]!)
  }
  // Detect nullable typed exports — `export const Foo: T | undefined = …`.
  // The annotation may span multiple lines; match up to the `=` that
  // ends the declaration's left-hand side.
  for (const m of src.matchAll(
    /^export const ([A-Z][a-zA-Z0-9]+)\s*:\s*([\s\S]+?)\s*=\s/gm,
  )) {
    if (/\|\s*undefined\b/.test(m[2]!)) {
      nullable.add(m[1]!)
    }
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
  const surface = { __proto__: null, exports, nullable, exportToLeaf }
  return surface
}

export function readSurfaceSources(
  sourcePath: string,
  exportToLeaf: Map<string, string>,
): string {
  // Post-split layout: `sourcePath` may be a directory of leaves
  // (`primordials/`). Concatenate every leaf so the regex passes below
  // see the same shape as the legacy single-file path. Track which
  // leaf each name came from so the codemod can emit per-leaf imports;
  // transform-primordials uses this.
  const stat = statSync(sourcePath)
  let src
  if (stat.isDirectory()) {
    const parts = []
    const names = readdirSync(sourcePath).toSorted()
    for (let i = 0, { length } = names; i < length; i += 1) {
      const name = names[i]!
      if (
        !(
          name.endsWith('.ts') ||
          name.endsWith('.mts') ||
          name.endsWith('.cts') ||
          name.endsWith('.js') ||
          name.endsWith('.d.ts')
        )
      ) {
        continue
      }
      const full = path.join(sourcePath, name)
      if (!isPathWithinRoot(realpathSync(full), realpathSync(sourcePath))) {
        throw new Error(`Primordial leaf escapes its source directory: ${full}`)
      }
      if (!statSync(full).isFile()) {
        continue
      }
      const leafContent = readFileSync(full, 'utf8')
      // Strip extensions to produce the leaf name (e.g. `array.ts` →
      // `array`, `globals.d.ts` → `globals`).
      const leafName = name.replace(/\.(?:d\.)?[mc]?ts$|\.js$/, '')
      // Walk the leaf content and tag each export name with the leaf.
      // This is intentionally narrower than parseExports below — we
      // only need to know "which leaf does Foo live in", not the
      // nullable info or per_context heuristics.
      for (const m of leafContent.matchAll(
        /^export const ([A-Z][a-zA-Z0-9]+)/gm,
      )) {
        exportToLeaf.set(m[1]!, leafName)
      }
      for (const m of leafContent.matchAll(
        /^export function ([A-Z][a-zA-Z0-9]+)/gm,
      )) {
        exportToLeaf.set(m[1]!, leafName)
      }
      // Also capture lower-case helpers (`uncurryThis`, `applyBind`,
      // `applySafe`, `bindCall`, `weakRefSafe`) since the codemod
      // emits these for the bundle transform.
      for (const m of leafContent.matchAll(
        /^export const ([a-z][a-zA-Z0-9]+)/gm,
      )) {
        exportToLeaf.set(m[1]!, leafName)
      }
      // Lower-case function exports — the Node-platform `process` primordials
      // (`processCwd`, `processNextTick`, …) are `export function`, not const.
      for (const m of leafContent.matchAll(
        /^export function ([a-z][a-zA-Z0-9]+)/gm,
      )) {
        exportToLeaf.set(m[1]!, leafName)
      }
      parts.push(leafContent)
    }
    src = parts.join('\n')
  } else {
    src = readFileSync(sourcePath, 'utf8')
  }
  return src
}
