/**
 * @file Specs for scripts/repo/post-build/pair-declarations-with-js — the
 *   rename step that also repoints declaration specifiers.
 *   The bug these lock down shipped in 7.0.0: tsgo emits a `.mts` source's
 *   re-exports with `.mjs` specifiers, the step renamed the file to `.d.ts`
 *   and left the specifiers alone, and TypeScript resolves `.mjs` only to
 *   `.mts`/`.d.mts` — neither of which the pack ships. Every re-export behind
 *   one dangled and its symbols degraded to `any` with no consumer error.
 *   The last case runs over the built dist and expects zero dangling
 *   specifiers, which is exactly what 7.0.0 failed.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { rewriteDeclarationSpecifiers } from '../../scripts/repo/post-build/pair-declarations-with-js.mts'
import { REPO_ROOT } from '../../scripts/fleet/paths.mts'

const DIST_DIR = path.join(REPO_ROOT, 'dist')

/**
 * Every `.d.ts` under `dir`, absolute, recursively.
 */
function findDeclarations(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      found.push(...findDeclarations(full))
    } else if (entry.name.endsWith('.d.ts')) {
      found.push(full)
    }
  }
  return found
}

describe('rewriteDeclarationSpecifiers', () => {
  it('repoints a relative re-export specifier at .js', () => {
    expect(
      rewriteDeclarationSpecifiers(`export { a } from './leaf.mjs';`),
    ).toBe(`export { a } from './leaf.js';`)
  })

  it('repoints a relative import specifier at .js', () => {
    expect(
      rewriteDeclarationSpecifiers(`import { a } from '../up/leaf.mjs';`),
    ).toBe(`import { a } from '../up/leaf.js';`)
  })

  it('repoints a dynamic type-position import specifier at .js', () => {
    expect(
      rewriteDeclarationSpecifiers(`type A = import('./leaf.mjs').A;`),
    ).toBe(`type A = import('./leaf.js').A;`)
  })

  it('leaves a bare package specifier alone', () => {
    const source = `export { a } from '@example/module/leaf.mjs';`
    expect(rewriteDeclarationSpecifiers(source)).toBe(source)
  })

  it('leaves a JSDoc example alone', () => {
    const source = ` * @example import { a } from './leaf.mjs'`
    expect(rewriteDeclarationSpecifiers(source)).toBe(source)
  })

  it('leaves a line comment alone', () => {
    const source = `// see './leaf.mjs' for the implementation`
    expect(rewriteDeclarationSpecifiers(source)).toBe(source)
  })

  it('rewrites statements while preserving a neighbouring JSDoc example', () => {
    const source = [
      '/**',
      ` * @example import { a } from './leaf.mjs'`,
      ' */',
      `export { a } from './leaf.mjs';`,
    ].join('\n')
    expect(rewriteDeclarationSpecifiers(source)).toBe(
      [
        '/**',
        ` * @example import { a } from './leaf.mjs'`,
        ' */',
        `export { a } from './leaf.js';`,
      ].join('\n'),
    )
  })

  it('leaves a declaration with no .mjs specifier untouched', () => {
    const source = `export declare function a(b: string): string;`
    expect(rewriteDeclarationSpecifiers(source)).toBe(source)
  })
})

describe('the built dist', () => {
  it.skipIf(!existsSync(DIST_DIR))(
    'ships no dangling .mjs specifier in any declaration',
    () => {
      const offenders: string[] = []
      for (const file of findDeclarations(DIST_DIR)) {
        const lines = readFileSync(file, 'utf8').split(/\r?\n/)
        for (let i = 0, { length } = lines; i < length; i += 1) {
          const line = lines[i]!
          const trimmed = line.trimStart()
          if (trimmed.startsWith('*') || trimmed.startsWith('//')) {
            continue
          }
          // A dot-anchored (relative) specifier still wearing `.mjs`:
          // `from '` then a body starting with a dot then `.mjs'`.
          if (/\bfrom\s*'\.[^']*\.mjs'/.test(line)) {
            offenders.push(`${path.relative(DIST_DIR, file)}:${i + 1}`)
          }
        }
      }
      expect(offenders).toEqual([])
    },
  )
})
