/**
 * @file Unit tests for the CLI's primordials-surface lookup.
 *   Every command downstream depends on this answer. Resolve nothing and the
 *   codemod has no surface to import from, so it rewrites against the packaged
 *   surface instead of the project's own; resolve the wrong shape and the
 *   generated import is `../primordials` where `../primordials/array` was
 *   needed, which type-checks nowhere.
 *   Two layouts are supported and they return different KINDS of path - a file
 *   for the legacy single-file shape, a DIRECTORY for the split surface
 *   socket-lib uses - so the tests assert which one came back, not merely that
 *   something did.
 *   Real temp trees throughout: the lookup is `existsSync` / `statSync` /
 *   `readdirSync` over a directory pair, and a scripted filesystem would assert
 *   the script instead of the search.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'
import { afterEach, describe, expect, it } from 'vitest'

import { findLocalPrimordials, isSplitPrimordials } from '../src/cli.mts'

const tmpDirs: string[] = []

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await safeDelete(dir)
  }
})

/**
 * A temp tree.
 *
 * Directories are listed separately rather than marked with a trailing slash:
 * `normalizePath` strips that slash, so a marker embedded in the path cannot
 * survive normalization.
 */
function tree(files: readonly string[], dirs: readonly string[] = []): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'prim-cli-'))
  tmpDirs.push(root)
  for (let i = 0, { length } = dirs; i < length; i += 1) {
    mkdirSync(path.join(root, dirs[i]!), { recursive: true })
  }
  for (let i = 0, { length } = files; i < length; i += 1) {
    const abs = path.join(root, files[i]!)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, '// fixture\n', 'utf8')
  }
  return root
}

describe('the legacy single-file surface', () => {
  it('finds primordials.ts beside the scanned directory', () => {
    const root = tree(['src/primordials.ts'], ['src'])
    expect(findLocalPrimordials(path.join(root, 'src'))).toBe(
      path.join(root, 'src', 'primordials.ts'),
    )
  })

  it('finds it one level up, which is the common layout', () => {
    // The surface usually sits beside `src/`, not inside it.
    const root = tree(['primordials.mts'], ['src'])
    expect(findLocalPrimordials(path.join(root, 'src'))).toBe(
      path.join(root, 'primordials.mts'),
    )
  })

  it('prefers the scanned directory over its parent', () => {
    // A nearer surface is the one that module graph actually imports.
    const root = tree(['primordials.ts', 'src/primordials.ts'], ['src'])
    expect(findLocalPrimordials(path.join(root, 'src'))).toBe(
      path.join(root, 'src', 'primordials.ts'),
    )
  })

  it('accepts every supported extension', () => {
    const exts = ['.cjs', '.cts', '.js', '.mjs', '.mts', '.ts']
    for (let i = 0, { length } = exts; i < length; i += 1) {
      const ext = exts[i]!
      const root = tree([`src/primordials${ext}`], ['src'])
      expect(findLocalPrimordials(path.join(root, 'src'))).toBe(
        path.join(root, 'src', `primordials${ext}`),
      )
    }
  })

  it('ignores a primordials file with an unsupported extension', () => {
    const root = tree(['src/primordials.json'], ['src'])
    expect(findLocalPrimordials(path.join(root, 'src'))).toBe(undefined)
  })
})

describe('the split surface', () => {
  it('returns the DIRECTORY, so the caller can build per-leaf imports', () => {
    // The caller needs `../primordials/array`, which it can only compose from
    // the directory path.
    const root = tree(['src/primordials/array.ts'], ['src', 'src/primordials'])
    expect(findLocalPrimordials(path.join(root, 'src'))).toBe(
      path.join(root, 'src', 'primordials'),
    )
  })

  it('finds a split surface one level up', () => {
    const root = tree(['primordials/string.mts'], ['primordials', 'src'])
    expect(findLocalPrimordials(path.join(root, 'src'))).toBe(
      path.join(root, 'primordials'),
    )
  })

  it('ignores an empty primordials directory', () => {
    // A directory with no leaf files offers nothing to import.
    const root = tree([], ['src', 'src/primordials'])
    expect(findLocalPrimordials(path.join(root, 'src'))).toBe(undefined)
  })

  it('ignores a directory holding no source files', () => {
    const root = tree(['src/primordials/README.md'], ['src', 'src/primordials'])
    expect(findLocalPrimordials(path.join(root, 'src'))).toBe(undefined)
  })

  it('ignores a nested directory as a leaf', () => {
    // Only files count; a subdirectory is not an importable leaf.
    const root = tree([], ['src', 'src/primordials', 'src/primordials/inner'])
    expect(findLocalPrimordials(path.join(root, 'src'))).toBe(undefined)
  })

  it('prefers the single file when both shapes are present', () => {
    // The file is checked first, and an ambiguous project should get the
    // simpler wiring rather than a guess.
    const root = tree(
      ['src/primordials.ts', 'src/primordials/array.ts'],
      ['src', 'src/primordials'],
    )
    expect(findLocalPrimordials(path.join(root, 'src'))).toBe(
      path.join(root, 'src', 'primordials.ts'),
    )
  })
})

describe('when there is no surface', () => {
  it('answers undefined rather than guessing', () => {
    const root = tree(['src/index.ts'], ['src'])
    expect(findLocalPrimordials(path.join(root, 'src'))).toBe(undefined)
  })

  it('answers undefined for a directory that does not exist', () => {
    const root = tree([])
    expect(findLocalPrimordials(path.join(root, 'absent'))).toBe(undefined)
  })
})

describe('isSplitPrimordials', () => {
  it('is true for a directory', () => {
    const root = tree(['primordials/array.ts'], ['primordials'])
    expect(isSplitPrimordials(path.join(root, 'primordials'))).toBe(true)
  })

  it('is false for a single file', () => {
    const root = tree(['primordials.ts'])
    expect(isSplitPrimordials(path.join(root, 'primordials.ts'))).toBe(false)
  })

  it('is false for a missing path rather than throwing', () => {
    // The caller passes whatever the lookup returned, and a path can vanish
    // between the two calls.
    const root = tree([])
    expect(isSplitPrimordials(path.join(root, 'gone'))).toBe(false)
  })
})
