/**
 * @file Unit tests for packages/exports.ts — pure helpers for parsing the npm
 *   `exports` field shape (subpath vs conditional, types-for-subpath crawl,
 *   sugar-form normalization). All exports are side-effect-free; no I/O or
 *   environment dependencies.
 */

import { describe, expect, it } from 'vitest'

import {
  findTypesForSubpath,
  getExportFilePaths,
  getSubpaths,
  isConditionalExports,
  isSubpathExports,
  resolvePackageJsonEntryExports,
} from '../../../src/packages/exports'

describe.sequential('packages/exports — isConditionalExports', () => {
  it('returns false for non-objects', () => {
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- callers may pass null; tested explicitly.
    expect(isConditionalExports(null)).toBe(false)
    expect(isConditionalExports(undefined)).toBe(false)
    expect(isConditionalExports('./index.js')).toBe(false)
    expect(isConditionalExports(['./index.js'])).toBe(false)
  })

  it('returns false for empty object', () => {
    expect(isConditionalExports({})).toBe(false)
  })

  it('returns true when no keys start with "."', () => {
    expect(
      isConditionalExports({
        import: './index.mjs',
        require: './index.cjs',
      }),
    ).toBe(true)
  })

  it('returns false when any key starts with "."', () => {
    expect(isConditionalExports({ '.': './index.js' })).toBe(false)
    expect(
      isConditionalExports({
        '.': './index.js',
        './utils': './utils.js',
      }),
    ).toBe(false)
  })
})

describe.sequential('packages/exports — isSubpathExports', () => {
  it('returns false for non-objects', () => {
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- callers may pass null; tested explicitly.
    expect(isSubpathExports(null)).toBe(false)
    expect(isSubpathExports(undefined)).toBe(false)
    expect(isSubpathExports('./index.js')).toBe(false)
  })

  it('returns false for empty object', () => {
    expect(isSubpathExports({})).toBe(false)
  })

  it('returns true when any key starts with "."', () => {
    expect(isSubpathExports({ '.': './index.js' })).toBe(true)
    expect(isSubpathExports({ './utils': './utils.js' })).toBe(true)
  })

  it('returns false for purely conditional shape', () => {
    expect(
      isSubpathExports({ import: './index.mjs', require: './index.cjs' }),
    ).toBe(false)
  })
})

describe.sequential('packages/exports — getSubpaths', () => {
  it('returns [] for non-objects', () => {
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- callers may pass null; tested explicitly.
    expect(getSubpaths(null)).toEqual([])
    expect(getSubpaths(undefined)).toEqual([])
    expect(getSubpaths('./index.js')).toEqual([])
  })

  it('returns only "."-prefixed keys', () => {
    expect(
      getSubpaths({
        '.': './index.js',
        './utils': './utils.js',
        types: './x.d.ts',
      }),
    ).toEqual(['.', './utils'])
  })

  it('returns [] for purely conditional shape', () => {
    expect(getSubpaths({ import: './a.mjs' })).toEqual([])
  })
})

describe.sequential('packages/exports — getExportFilePaths', () => {
  it('returns [] for non-objects', () => {
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- callers may pass null; tested explicitly.
    expect(getExportFilePaths(null)).toEqual([])
    expect(getExportFilePaths(undefined)).toEqual([])
    expect(getExportFilePaths('./index.js')).toEqual([])
  })

  it('skips keys not starting with "."', () => {
    expect(
      getExportFilePaths({
        '.': './a.js',
        types: './x.d.ts',
        './b': './b.js',
      }),
    ).toEqual(['./a.js', './b.js'])
  })

  it('collects nested conditional string values', () => {
    expect(
      getExportFilePaths({
        '.': { import: './a.mjs', require: './a.cjs' },
      }),
    ).toEqual(['./a.mjs', './a.cjs'])
  })

  it('collects strings from array-of-conditions values', () => {
    expect(
      getExportFilePaths({
        '.': {
          node: ['./node.mjs', { default: './fallback.js' }],
        },
      }),
    ).toEqual(['./node.mjs', './fallback.js'])
  })

  it('returns [] for purely conditional top-level shape', () => {
    expect(
      getExportFilePaths({ import: './a.mjs', require: './a.cjs' }),
    ).toEqual([])
  })
})

describe.sequential('packages/exports — resolvePackageJsonEntryExports', () => {
  it('wraps a string in canonical "." form', () => {
    expect(resolvePackageJsonEntryExports('./index.js')).toEqual({
      '.': './index.js',
    })
  })

  it('wraps an array in canonical "." form', () => {
    expect(resolvePackageJsonEntryExports(['./index.js'])).toEqual({
      '.': ['./index.js'],
    })
  })

  it('passes through conditional-shape objects', () => {
    const exports = { import: './a.mjs', require: './a.cjs' }
    expect(resolvePackageJsonEntryExports(exports)).toBe(exports)
  })

  it('passes through subpath-shape objects', () => {
    const exports = { '.': './index.js' }
    expect(resolvePackageJsonEntryExports(exports)).toBe(exports)
  })

  it('returns undefined for non-object non-array non-string', () => {
    expect(resolvePackageJsonEntryExports(undefined)).toBeUndefined()
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- callers may pass null; tested explicitly.
    expect(resolvePackageJsonEntryExports(null)).toBeUndefined()
    expect(resolvePackageJsonEntryExports(42)).toBeUndefined()
  })
})

describe.sequential('packages/exports — findTypesForSubpath', () => {
  it('returns undefined when subpath is not present', () => {
    expect(
      findTypesForSubpath(
        { '.': { import: './a.mjs', types: './a.d.ts' } },
        './does-not-exist.js',
      ),
    ).toBeUndefined()
  })

  it('finds types adjacent to a matching object-shape leaf', () => {
    const exports = {
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
      },
    }
    expect(findTypesForSubpath(exports, './dist/index.js')).toBe(
      './dist/index.d.ts',
    )
  })

  it('finds types adjacent to a matching array-shape leaf', () => {
    const exports = {
      '.': [
        {
          types: './dist/array.d.ts',
          import: './dist/array.mjs',
        },
      ],
    }
    // Crawling reaches the array's object child; the object's `types`
    // sits next to a matching `import` value.
    expect(findTypesForSubpath(exports, './dist/array.mjs')).toBe(
      './dist/array.d.ts',
    )
  })

  it('returns undefined when the input has no objects at all', () => {
    expect(findTypesForSubpath('./scalar.js', './scalar.js')).toBeUndefined()
  })
})
