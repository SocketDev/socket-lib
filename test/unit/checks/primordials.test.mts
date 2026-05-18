/**
 * @file Unit tests for the primordials drift check. Covers:
 *
 *   - Source parsing (`extractPrimordialsNames`)
 *   - Plain destructure
 *   - Comment stripping
 *   - `Foo: BarAlias` rename — captures the source name
 *   - TS export parsing (`extractTsExports`)
 *   - `export const`, `export function`, `export {}`
 *   - `.d.ts` declaration form (`export declare const`)
 *   - Resolver (`resolveSocketLibPrimordials`)
 *   - Explicit path override
 *   - Sibling clone preference
 *   - node_modules fallback
 *   - Throws when nothing found
 *   - End-to-end (`checkPrimordials`)
 *   - All names accounted for → no findings
 *   - Alias-resolved name accounted for via aliasMap
 *   - Missing alias-target reports `missing-from-socket-lib`
 *   - Unmapped name with no entry reports `unmapped`
 *   - nodeInternalOnly skips the diff
 *   - Multiple files contribute to same name's `files` list
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  checkPrimordials,
  extractPrimordialsNames,
  extractTsExports,
  resolveSocketLibPrimordials,
  type PrimordialsCheckConfig,
} from '../../../src/checks/primordials'
import { safeDelete } from '@socketsecurity/lib/fs/safe'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'primordials-check-'))
})

afterEach(async () => {
  await safeDelete(tmpDir)
})

export function makeConfig(
  overrides: Partial<PrimordialsCheckConfig>,
): PrimordialsCheckConfig {
  return {
    scanDirs: ['src'],
    aliasMap: new Map(),
    nodeInternalOnly: new Set(),
    repoRoot: tmpDir,
    ...overrides,
  }
}

export function writeFile(rel: string, content: string): string {
  const full = path.join(tmpDir, rel)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, content, 'utf8')
  return full
}

describe('checks/primordials', () => {
  describe('extractPrimordialsNames', () => {
    it('captures a single destructure', () => {
      const src = `
        const { ArrayPrototypePush } = primordials
      `
      expect(extractPrimordialsNames(src)).toEqual(['ArrayPrototypePush'])
    })

    it('captures multiple destructures across the file', () => {
      const src = `
        const { Foo, Bar } = primordials
        function unrelated() {}
        const { Baz } = primordials
      `
      const names = extractPrimordialsNames(src)
      expect(names.sort()).toEqual(['Bar', 'Baz', 'Foo'])
    })

    it('strips line comments inside destructures', () => {
      const src = `
        const {
          Foo, // comment about Foo
          Bar,
          // standalone comment
          Baz,
        } = primordials
      `
      const names = extractPrimordialsNames(src)
      expect(names.sort()).toEqual(['Bar', 'Baz', 'Foo'])
    })

    it('strips block comments', () => {
      const src = `
        const {
          Foo,
          /* skip Bar for now */
          Baz,
        } = primordials
      `
      const names = extractPrimordialsNames(src)
      expect(names.sort()).toEqual(['Baz', 'Foo'])
    })

    it('captures the source name on rename (Foo: BarAlias → Foo)', () => {
      const src = `
        const { Foo: localAlias, Baz } = primordials
      `
      const names = extractPrimordialsNames(src)
      expect(names.sort()).toEqual(['Baz', 'Foo'])
    })

    it('returns empty for files without a primordials destructure', () => {
      expect(extractPrimordialsNames('const x = require("fs")')).toEqual([])
    })

    it('returns empty for files mentioning primordials only in comments', () => {
      expect(extractPrimordialsNames('// reads primordials elsewhere')).toEqual(
        [],
      )
    })
  })

  describe('extractTsExports', () => {
    it('captures `export const Foo`', () => {
      expect(extractTsExports('export const Foo = 1')).toEqual(['Foo'])
    })

    it('captures `export function Foo`', () => {
      expect(extractTsExports('export function Foo() {}')).toEqual(['Foo'])
    })

    it('captures `export { Foo, Bar }`', () => {
      const names = extractTsExports('export { Foo, Bar }').sort()
      expect(names).toEqual(['Bar', 'Foo'])
    })

    it('captures `export declare const Foo` (.d.ts form)', () => {
      expect(extractTsExports('export declare const Foo: number')).toEqual([
        'Foo',
      ])
    })

    it('captures `export declare function Foo` (.d.ts form)', () => {
      expect(extractTsExports('export declare function Foo(): void')).toEqual([
        'Foo',
      ])
    })

    it('mixes source and declaration forms', () => {
      const src = [
        'export const Foo = 1',
        'export declare const Bar: number',
        'export function Baz() {}',
        'export declare function Qux(): void',
      ].join('\n')
      const names = extractTsExports(src).sort()
      expect(names).toEqual(['Bar', 'Baz', 'Foo', 'Qux'])
    })

    it('captures aliased re-exports (`export { Foo as Bar }` keeps Foo)', () => {
      // The current parser captures the LHS — `Foo` — since that's
      // what the alias map keys against. Document the behavior.
      expect(extractTsExports('export { Foo as Bar }')).toEqual(['Foo'])
    })
  })

  describe('resolveSocketLibPrimordials', () => {
    it('honors socketLibPrimordialsPath when set and exists', () => {
      const explicit = writeFile('explicit.ts', '')
      const found = resolveSocketLibPrimordials(
        makeConfig({ socketLibPrimordialsPath: explicit }),
      )
      expect(found).toBe(explicit)
    })

    it('throws when socketLibPrimordialsPath is set but does not exist', () => {
      expect(() =>
        resolveSocketLibPrimordials(
          makeConfig({
            socketLibPrimordialsPath: path.join(tmpDir, 'missing.ts'),
          }),
        ),
      ).toThrow(/socketLibPrimordialsPath does not exist/)
    })

    it('prefers sibling clone over node_modules', () => {
      // Set up: tmpDir has a sibling at ../socket-lib AND a
      // node_modules fallback. Sibling should win.
      const repoDir = mkdtempSync(path.join(tmpDir, 'consumer-'))
      const siblingPath = path.join(
        path.dirname(repoDir),
        'socket-lib',
        'src',
        'primordials.ts',
      )
      mkdirSync(path.dirname(siblingPath), { recursive: true })
      writeFileSync(siblingPath, 'export const sibling = 1', 'utf8')

      const installedPath = path.join(
        repoDir,
        'node_modules',
        '@socketsecurity',
        'lib',
        'dist',
        'primordials.d.ts',
      )
      mkdirSync(path.dirname(installedPath), { recursive: true })
      writeFileSync(
        installedPath,
        'export declare const installed: number',
        'utf8',
      )

      const found = resolveSocketLibPrimordials(
        makeConfig({ repoRoot: repoDir }),
      )
      expect(found).toBe(siblingPath)
    })

    it('falls back to node_modules when no sibling clone exists', () => {
      const installedPath = writeFile(
        'node_modules/@socketsecurity/lib/dist/primordials.d.ts',
        'export declare const Foo: number',
      )
      const found = resolveSocketLibPrimordials(
        makeConfig({ repoRoot: tmpDir }),
      )
      expect(found).toBe(installedPath)
    })

    it('throws with both candidate paths when nothing found', () => {
      expect(() =>
        resolveSocketLibPrimordials(makeConfig({ repoRoot: tmpDir })),
      ).toThrow(/Cannot locate socket-lib primordials/)
    })
  })

  describe('checkPrimordials — end to end', () => {
    function setupLib(exports: string[]): string {
      // Write a fake primordials.d.ts with the given exports.
      const body = exports
        .map(n => `export declare const ${n}: unknown`)
        .join('\n')
      return writeFile(
        'node_modules/@socketsecurity/lib/dist/primordials.d.ts',
        body,
      )
    }

    it('returns no findings when every name is in lib', () => {
      writeFile('src/a.js', 'const { Foo, Bar } = primordials')
      setupLib(['Foo', 'Bar'])

      const result = checkPrimordials(makeConfig({}))
      expect(result.findings).toEqual([])
      expect([...result.used].sort()).toEqual(['Bar', 'Foo'])
    })

    it('resolves a name through the alias map when alias target exists', () => {
      writeFile('src/a.js', 'const { Array } = primordials')
      setupLib(['ArrayCtor'])

      const result = checkPrimordials(
        makeConfig({
          aliasMap: new Map([['Array', 'ArrayCtor']]),
        }),
      )
      expect(result.findings).toEqual([])
    })

    it('reports `missing-from-socket-lib` when alias target is absent', () => {
      writeFile('src/a.js', 'const { Array } = primordials')
      setupLib([]) // ArrayCtor not exported

      const result = checkPrimordials(
        makeConfig({
          aliasMap: new Map([['Array', 'ArrayCtor']]),
        }),
      )
      expect(result.findings).toHaveLength(1)
      expect(result.findings[0]).toMatchObject({
        kind: 'missing-from-socket-lib',
        name: 'Array',
      })
      expect(result.findings[0]!.hint).toContain('ArrayCtor')
    })

    it('reports `unmapped` when no alias and no lib export', () => {
      writeFile('src/a.js', 'const { Mystery } = primordials')
      setupLib(['Foo']) // Mystery is not anywhere

      const result = checkPrimordials(makeConfig({}))
      expect(result.findings).toHaveLength(1)
      expect(result.findings[0]).toMatchObject({
        kind: 'unmapped',
        name: 'Mystery',
      })
    })

    it('skips names in nodeInternalOnly', () => {
      writeFile('src/a.js', 'const { SafeMap } = primordials')
      setupLib([])

      const result = checkPrimordials(
        makeConfig({
          nodeInternalOnly: new Set(['SafeMap']),
        }),
      )
      expect(result.findings).toEqual([])
    })

    it('attributes a name to every file that uses it', () => {
      writeFile('src/a.js', 'const { Foo } = primordials')
      writeFile('src/sub/b.js', 'const { Foo, Bar } = primordials')
      setupLib(['Foo', 'Bar'])

      const result = checkPrimordials(makeConfig({}))
      const fooFiles = result.usedToFiles.get('Foo')
      expect(fooFiles).toBeDefined()
      expect(fooFiles!.length).toBe(2)
      expect(fooFiles!.some(f => f.endsWith('a.js'))).toBe(true)
      expect(fooFiles!.some(f => f.endsWith('b.js'))).toBe(true)
    })

    it('walks scanDirs recursively', () => {
      writeFile('src/deep/nested/path/file.js', 'const { Foo } = primordials')
      setupLib(['Foo'])

      const result = checkPrimordials(makeConfig({}))
      expect(result.used.has('Foo')).toBe(true)
    })

    it('ignores .ts files (only walks .js)', () => {
      writeFile('src/a.ts', 'const { ShouldBeIgnored } = primordials')
      setupLib([])

      const result = checkPrimordials(makeConfig({}))
      expect(result.used.size).toBe(0)
      expect(result.findings).toEqual([])
    })

    it('handles empty scanDirs gracefully', () => {
      setupLib(['Foo'])
      const result = checkPrimordials(makeConfig({ scanDirs: [] }))
      expect(result.findings).toEqual([])
      expect(result.used.size).toBe(0)
    })

    it('handles missing scanDir gracefully (no throw)', () => {
      setupLib(['Foo'])
      const result = checkPrimordials(
        makeConfig({ scanDirs: ['does-not-exist'] }),
      )
      expect(result.findings).toEqual([])
    })

    it('returns findings sorted by name for stable output', () => {
      writeFile('src/a.js', 'const { Zebra, Alpha, Mango } = primordials')
      setupLib([])

      const result = checkPrimordials(makeConfig({}))
      expect(result.findings.map(f => f.name)).toEqual([
        'Alpha',
        'Mango',
        'Zebra',
      ])
    })
  })
})
