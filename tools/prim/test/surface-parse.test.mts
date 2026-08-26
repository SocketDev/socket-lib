/**
 * @file Unit tests for prim's primordials-surface parser. `parseExports` is the
 *   answer every other command trusts: a name missing from the returned set is
 *   reported as a surface gap, and a name wrongly present makes the codemod
 *   emit an import of something that does not exist. The tests therefore feed
 *   real files in a temp tree and assert the exact membership - which export
 *   forms are recognized, which leaf each name is attributed to, and which
 *   declarations are typed nullable.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'
import { afterEach, describe, expect, it } from 'vitest'

import {
  capitalize,
  deriveNodeBootstrapSurface,
  parseExports,
} from '../src/surface.mts'

const tmpDirs: string[] = []

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await safeDelete(dir)
  }
})

function tmpRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'prim-surface-'))
  tmpDirs.push(root)
  return root
}

/**
 * Write one file inside a fresh temp root and hand back its absolute path.
 */
function fileWith(name: string, content: string): string {
  const abs = path.join(tmpRoot(), name)
  mkdirSync(path.dirname(abs), { recursive: true })
  writeFileSync(abs, content, 'utf8')
  return abs
}

/**
 * Write a directory of leaf files and hand back the directory path.
 */
function dirWith(leaves: Record<string, string>): string {
  const dir = path.join(tmpRoot(), 'primordials')
  mkdirSync(dir, { recursive: true })
  for (const [name, content] of Object.entries(leaves)) {
    writeFileSync(path.join(dir, name), content, 'utf8')
  }
  return dir
}

describe('capitalize', () => {
  it('upper-cases the first character', () => {
    expect(capitalize('freeze')).toBe('Freeze')
  })

  it('leaves an already-capitalized name alone', () => {
    expect(capitalize('Freeze')).toBe('Freeze')
  })

  it('passes the empty string straight through', () => {
    // The reflective walk feeds it every own property name, and a symbol-keyed
    // description can be empty; throwing there would abort the whole surface.
    expect(capitalize('')).toBe('')
  })
})

describe('parseExports on a single file', () => {
  it('recognizes the inline `export const Foo` form', () => {
    const file = fileWith(
      'primordials.ts',
      'export const ArrayPrototypeMap = 1\nexport const ObjectKeys = 2\n',
    )
    const { exports } = parseExports(file)
    expect([...exports].toSorted()).toEqual(['ArrayPrototypeMap', 'ObjectKeys'])
  })

  it('recognizes lower-case `export function` helpers', () => {
    // The Node-platform process primordials ship this way, and the codemod's
    // `process.cwd()` rewrite is gated on them being in the surface.
    const file = fileWith(
      'primordials.ts',
      'export function processCwd() {}\nexport function processNextTick() {}\n',
    )
    const { exports } = parseExports(file)
    expect([...exports].toSorted()).toEqual(['processCwd', 'processNextTick'])
  })

  it('recognizes the grouped `export { … }` form', () => {
    const file = fileWith(
      'primordials.ts',
      "export { ArrayPrototypeMap, ObjectKeys as Keys } from './leaf'\n",
    )
    const { exports } = parseExports(file)
    expect(exports.has('ArrayPrototypeMap')).toBe(true)
    expect(exports.has('ObjectKeys')).toBe(true)
  })

  it('ignores a lower-case name inside a grouped export', () => {
    const file = fileWith('primordials.ts', 'export { helper, ObjectKeys }\n')
    const { exports } = parseExports(file)
    expect(exports.has('helper')).toBe(false)
    expect(exports.has('ObjectKeys')).toBe(true)
  })

  it('recognizes the Node bootstrap `primordials.Foo =` assignment form', () => {
    const file = fileWith(
      'bootstrap.js',
      'primordials.ArrayPrototypeMap = uncurryThis(Array.prototype.map);\n',
    )
    const { exports } = parseExports(file)
    expect(exports.has('ArrayPrototypeMap')).toBe(true)
  })

  it('flags a `T | undefined` annotation as nullable', () => {
    const file = fileWith(
      'primordials.ts',
      'export const MaybeThing: Thing | undefined = get()\nexport const SureThing: Thing = get()\n',
    )
    const { nullable } = parseExports(file)
    expect([...nullable]).toEqual(['MaybeThing'])
  })

  it('reads a nullable annotation that wraps across lines', () => {
    const file = fileWith(
      'primordials.ts',
      'export const MaybeThing:\n  | Thing\n  | undefined = get()\n',
    )
    const { nullable } = parseExports(file)
    expect([...nullable]).toEqual(['MaybeThing'])
  })

  it('leaves exportToLeaf empty for the legacy single-file shape', () => {
    // There is no leaf to attribute to, and a non-empty map here would make
    // the codemod emit per-leaf imports against a file that has no leaves.
    const file = fileWith('primordials.ts', 'export const ObjectKeys = 1\n')
    expect(parseExports(file).exportToLeaf.size).toBe(0)
  })
})

describe('parseExports on a split surface directory', () => {
  it('attributes every export to the leaf it was declared in', () => {
    const dir = dirWith({
      'array.ts': 'export const ArrayPrototypeMap = 1\n',
      'object.mts': 'export const ObjectKeys = 2\n',
    })
    const { exportToLeaf } = parseExports(dir)
    expect(exportToLeaf.get('ArrayPrototypeMap')).toBe('array')
    expect(exportToLeaf.get('ObjectKeys')).toBe('object')
  })

  it('strips a .d.ts double extension down to the leaf name', () => {
    const dir = dirWith({ 'globals.d.ts': 'export const ObjectKeys = 1\n' })
    expect(parseExports(dir).exportToLeaf.get('ObjectKeys')).toBe('globals')
  })

  it('attributes function and lower-case helper exports too', () => {
    const dir = dirWith({
      'uncurry.ts':
        'export const uncurryThis = 1\nexport function applyBind() {}\n',
      'process.mts': 'export function processCwd() {}\n',
      'symbol.cts': 'export function SymbolFor() {}\n',
    })
    const { exportToLeaf } = parseExports(dir)
    expect(exportToLeaf.get('uncurryThis')).toBe('uncurry')
    expect(exportToLeaf.get('applyBind')).toBe('uncurry')
    expect(exportToLeaf.get('processCwd')).toBe('process')
    expect(exportToLeaf.get('SymbolFor')).toBe('symbol')
  })

  it('unions every leaf into one exports set', () => {
    const dir = dirWith({
      'array.ts': 'export const ArrayPrototypeMap = 1\n',
      'object.ts': 'export const ObjectKeys = 2\n',
    })
    const { exports } = parseExports(dir)
    expect([...exports].toSorted()).toEqual(['ArrayPrototypeMap', 'ObjectKeys'])
  })

  it('skips a file whose extension is not a source extension', () => {
    const dir = dirWith({
      'array.ts': 'export const ArrayPrototypeMap = 1\n',
      'README.md': 'export const NotReal = 1\n',
    })
    expect(parseExports(dir).exports.has('NotReal')).toBe(false)
  })

  it('skips a nested directory that happens to end in .ts', () => {
    // readdirSync hands back directory entries too, and readFileSync on one
    // throws EISDIR - the isFile guard is what keeps the parse alive.
    const dir = dirWith({ 'array.ts': 'export const ArrayPrototypeMap = 1\n' })
    mkdirSync(path.join(dir, 'nested.ts'), { recursive: true })
    expect(parseExports(dir).exports.has('ArrayPrototypeMap')).toBe(true)
  })
})

describe('parseExports on a Node per_context surface', () => {
  it('unions in the reflectively-installed bootstrap names', () => {
    // Node installs `ArrayPrototypeMap` by reflection, so it appears nowhere
    // in the file text - a text-only parse would report the whole prototype
    // surface as a gap.
    const file = fileWith(
      path.join('per_context', 'primordials.js'),
      'primordials.uncurryThis = uncurryThis;\n',
    )
    const { exports } = parseExports(file)
    expect(exports.has('ArrayPrototypeMap')).toBe(true)
    expect(exports.has('ObjectKeys')).toBe(true)
  })

  it('leaves an ordinary path without the bootstrap union', () => {
    const file = fileWith(
      'primordials.js',
      'primordials.uncurryThis = uncurryThis;\n',
    )
    expect(parseExports(file).exports.has('ArrayPrototypeMap')).toBe(false)
  })
})

describe('deriveNodeBootstrapSurface', () => {
  it('includes the bare global constructors', () => {
    const surface = deriveNodeBootstrapSurface()
    expect(surface.has('Array')).toBe(true)
    expect(surface.has('Promise')).toBe(true)
    expect(surface.has('WeakRef')).toBe(true)
  })

  it('includes static methods as `<Global><Method>`', () => {
    const surface = deriveNodeBootstrapSurface()
    expect(surface.has('ObjectKeys')).toBe(true)
    expect(surface.has('ArrayIsArray')).toBe(true)
    expect(surface.has('PromiseAll')).toBe(true)
  })

  it('includes prototype methods as `<Global>Prototype<Method>`', () => {
    const surface = deriveNodeBootstrapSurface()
    expect(surface.has('ArrayPrototypeMap')).toBe(true)
    expect(surface.has('StringPrototypeSlice')).toBe(true)
    expect(surface.has('PromisePrototypeThen')).toBe(true)
  })

  it('includes namespace statics as `<Namespace><Method>`', () => {
    const surface = deriveNodeBootstrapSurface()
    expect(surface.has('MathMax')).toBe(true)
    expect(surface.has('JSONStringify')).toBe(true)
    expect(surface.has('ReflectApply')).toBe(true)
  })

  it('omits the plumbing properties that are not primordials', () => {
    // `length`, `name` and `prototype` are own properties of every
    // constructor; emitting `ArrayLength` would invent a surface entry.
    const surface = deriveNodeBootstrapSurface()
    expect(surface.has('ArrayLength')).toBe(false)
    expect(surface.has('ArrayName')).toBe(false)
    expect(surface.has('ArrayPrototype')).toBe(false)
    expect(surface.has('ArrayPrototypeConstructor')).toBe(false)
  })

  it('includes the Safe* wrappers Node installs via makeSafe', () => {
    const surface = deriveNodeBootstrapSurface()
    expect(surface.has('SafeMap')).toBe(true)
    expect(surface.has('SafePromiseAllSettled')).toBe(true)
  })

  it('includes the loose helpers Node exposes directly', () => {
    const surface = deriveNodeBootstrapSurface()
    expect(surface.has('uncurryThis')).toBe(true)
    expect(surface.has('makeSafe')).toBe(true)
    expect(surface.has('IteratorPrototype')).toBe(true)
    expect(surface.has('globalThis')).toBe(true)
  })
})
