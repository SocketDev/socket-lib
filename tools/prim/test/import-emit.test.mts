/**
 * @file Unit tests for prim's import emission. Where the import block lands is
 *   not cosmetic: prepending above a file's leading doc block moves the
 *   doc off the top of the file, and re-emitting a second import from the same
 *   specifier instead of merging leaves a file that no longer parses cleanly.
 *   The rewrite-application half is tested for the one bug it was written to
 *   stop - the parser can hand the same span back several times, and applying
 *   it twice eats live bytes.
 */

import { describe, expect, it } from 'vitest'

import {
  applyPrimordialsImports,
  ensureImports,
  escapeRegex,
  findInsertionPoint,
} from '../src/import-emit.mts'

const ESM = { kind: 'esm' as const, specifier: './primordials' }
const CJS = { kind: 'cjs' as const, specifier: './primordials' }

describe('escapeRegex', () => {
  it('escapes the characters that would change a pattern', () => {
    expect(escapeRegex('a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o')).toBe(
      'a\\.b\\*c\\+d\\?e\\^f\\$g\\{h\\}i\\(j\\)k\\|l\\[m\\]n\\\\o',
    )
  })

  it('leaves an ordinary specifier untouched', () => {
    expect(escapeRegex('@socketsecurity/lib/primordials')).toBe(
      '@socketsecurity/lib/primordials',
    )
  })
})

describe('findInsertionPoint', () => {
  it('lands after the last ESM import', () => {
    const src = "import a from 'a'\nimport b from 'b'\nconst x = 1\n"
    expect(findInsertionPoint(src)).toBe(src.indexOf('\nconst x'))
  })

  it('lands after the last require declaration', () => {
    const src = "const a = require('a')\nconst x = 1\n"
    expect(findInsertionPoint(src)).toBe(src.indexOf('\nconst x'))
  })

  it('takes the later of an import and a require', () => {
    const src = "const a = require('a')\nimport b from 'b'\nconst x = 1\n"
    expect(findInsertionPoint(src)).toBe(src.indexOf('\nconst x'))
  })

  it('lands below a leading file-level JSDoc block', () => {
    // Prepending above it would move the file-level doc off the top of the file.
    const src = '/**\n * @file Example.\n */\nconst x = 1\n'
    expect(findInsertionPoint(src)).toBe(src.indexOf('const x'))
  })

  it('lands below a shebang and its JSDoc block', () => {
    const src = '#!/usr/bin/env node\n/** doc */\nconst x = 1\n'
    expect(findInsertionPoint(src)).toBe(src.indexOf('const x'))
  })

  it('lands below a leading line-comment block', () => {
    const src = '// one\n// two\nconst x = 1\n'
    expect(findInsertionPoint(src)).toBe(src.indexOf('const x'))
  })

  it('prepends at the top when the file opens with code', () => {
    expect(findInsertionPoint('const x = 1\n')).toBe(0)
  })

  it('prepends at the top when a block comment is never closed', () => {
    // Guessing an end for an unterminated comment would insert the import
    // inside it.
    expect(findInsertionPoint('/** never closed\nconst x = 1\n')).toBe(0)
  })

  it('falls back to the top for a file that is only a shebang', () => {
    // Nothing follows the shebang, so there is no comment block to land
    // under and the scan reports the prepend position.
    expect(findInsertionPoint('#!/usr/bin/env node')).toBe(0)
  })

  it('handles a line comment with no trailing newline', () => {
    expect(findInsertionPoint('// only a comment')).toBe(17)
  })
})

describe('ensureImports when no matching import exists', () => {
  it('emits an ESM import at the top of a bare file', () => {
    expect(ensureImports('const x = 1\n', ['ObjectKeys'], ESM)).toEqual({
      importAdded: true,
      newSource: "import { ObjectKeys } from './primordials'\nconst x = 1\n",
    })
  })

  it('emits a CJS require instead in cjs mode', () => {
    expect(ensureImports('const x = 1\n', ['ObjectKeys'], CJS)).toEqual({
      importAdded: true,
      newSource:
        "const { ObjectKeys } = require('./primordials')\nconst x = 1\n",
    })
  })

  it('inserts below an existing import prologue', () => {
    const result = ensureImports(
      "import a from 'a'\nconst x = 1\n",
      ['ObjectKeys'],
      ESM,
    )
    expect(result.newSource).toBe(
      "import a from 'a'\nimport { ObjectKeys } from './primordials'\n\nconst x = 1\n",
    )
  })

  it('aliases every identifier when an aliasPrefix is set', () => {
    const result = ensureImports('const x = 1\n', ['ObjectKeys'], {
      ...ESM,
      aliasPrefix: 'prim',
    })
    expect(
      result.newSource.startsWith(
        "import { ObjectKeys: primObjectKeys } from './primordials'",
      ),
    ).toBe(true)
  })
})

describe('ensureImports when a matching import exists', () => {
  it('merges new identifiers into the existing destructure, sorted', () => {
    // A second import from the same specifier is a duplicate binding.
    const result = ensureImports(
      "import { ObjectKeys } from './primordials'\nconst x = 1\n",
      ['ArrayIsArray'],
      ESM,
    )
    expect(result).toEqual({
      importAdded: true,
      newSource:
        "import { ArrayIsArray, ObjectKeys } from './primordials'\nconst x = 1\n",
    })
  })

  it('merges into an existing require in cjs mode', () => {
    const result = ensureImports(
      "const { ObjectKeys } = require('./primordials')\nconst x = 1\n",
      ['ArrayIsArray'],
      CJS,
    )
    expect(result.newSource).toBe(
      "const { ArrayIsArray, ObjectKeys } = require('./primordials')\nconst x = 1\n",
    )
  })

  it('reports no change when every identifier is already imported', () => {
    const source = "import { ObjectKeys } from './primordials'\nconst x = 1\n"
    expect(ensureImports(source, ['ObjectKeys'], ESM)).toEqual({
      importAdded: false,
      newSource: source,
    })
  })

  it('reads an aliased entry back as its imported name', () => {
    // `Foo: localFoo` still imports `Foo`; re-adding it would duplicate it.
    const source =
      "import { ObjectKeys: primObjectKeys } from './primordials'\nconst x = 1\n"
    const result = ensureImports(source, ['ObjectKeys'], {
      ...ESM,
      aliasPrefix: 'prim',
    })
    expect(result.importAdded).toBe(false)
  })

  it('leaves the statement after the merged import intact', () => {
    const result = ensureImports(
      "import { ObjectKeys } from './primordials';\nconst x = 1\n",
      ['ArrayIsArray'],
      ESM,
    )
    expect(result.newSource).toContain('const x = 1')
  })

  it('does not treat a different specifier as a match', () => {
    const result = ensureImports(
      "import { Other } from './elsewhere'\n",
      ['ObjectKeys'],
      ESM,
    )
    expect(result.newSource).toContain("from './elsewhere'")
    expect(result.newSource).toContain("from './primordials'")
  })
})

describe('applyPrimordialsImports rewriting', () => {
  it('splices each rewrite and then emits the import', () => {
    const source = 'const keys = Object.keys(o)\n'
    const start = source.indexOf('Object.keys(o)')
    const result = applyPrimordialsImports(
      source,
      [
        {
          end: start + 'Object.keys(o)'.length,
          replacement: 'ObjectKeys(o)',
          start,
        },
      ],
      new Set(['ObjectKeys']),
      { kind: 'esm', specifier: './primordials' },
      '/repo/src/example.mts',
    )
    expect(result).toEqual({
      importAdded: true,
      newSource:
        "import { ObjectKeys } from './primordials'\nconst keys = ObjectKeys(o)\n",
    })
  })

  it('applies a repeated span once', () => {
    // The parser can surface the same node several times; a second apply
    // would eat the bytes after the new identifier.
    const source = 'const keys = Object.keys(o)\n'
    const start = source.indexOf('Object.keys(o)')
    const span = {
      end: start + 'Object.keys(o)'.length,
      replacement: 'ObjectKeys(o)',
      start,
    }
    const result = applyPrimordialsImports(
      source,
      [span, { ...span }, { ...span }],
      new Set(['ObjectKeys']),
      { kind: 'esm', specifier: './primordials' },
      '/repo/src/example.mts',
    )
    expect(result.newSource).toContain('const keys = ObjectKeys(o)')
  })

  it('applies several spans back-to-front so offsets stay valid', () => {
    const source = 'a.slice(1)\nb.slice(2)\n'
    const first = source.indexOf('a.slice(1)')
    const second = source.indexOf('b.slice(2)')
    const result = applyPrimordialsImports(
      source,
      [
        { end: first + 10, replacement: 'S(a, 1)', start: first },
        { end: second + 10, replacement: 'S(b, 2)', start: second },
      ],
      new Set(['S']),
      { kind: 'esm', specifier: './primordials' },
      '/repo/src/example.mts',
    )
    expect(result.newSource).toContain('S(a, 1)\nS(b, 2)')
  })

  it('resolves a per-file specifier function', () => {
    const result = applyPrimordialsImports(
      'const x = 1\n',
      [],
      new Set(['ObjectKeys']),
      {
        kind: 'esm',
        specifier: (absFile: string) =>
          absFile.includes('deep') ? '../../primordials' : './primordials',
      },
      '/repo/src/deep/example.mts',
    )
    expect(result.newSource).toContain("from '../../primordials'")
  })
})

describe('applyPrimordialsImports with a split surface', () => {
  const splitStyle = {
    kind: 'esm' as const,
    specifier: (): string => '',
    splitByLeaf: {
      exportToLeaf: new Map([
        ['ArrayIsArray', 'array'],
        ['ObjectKeys', 'object'],
        ['StringPrototypeSlice', 'string'],
      ]),
      leafSpecifier: (_absFile: string, leaf: string): string =>
        `./primordials/${leaf}`,
    },
  }

  it('emits one import per leaf, leaves sorted', () => {
    const result = applyPrimordialsImports(
      'const x = 1\n',
      [],
      new Set(['ArrayIsArray', 'ObjectKeys', 'StringPrototypeSlice']),
      splitStyle,
      '/repo/src/example.mts',
    )
    expect(result.importAdded).toBe(true)
    const lines = result.newSource
      .split(/\r?\n/)
      .filter(l => l.startsWith('import'))
    expect(lines).toEqual([
      "import { ArrayIsArray } from './primordials/array'",
      "import { ObjectKeys } from './primordials/object'",
      "import { StringPrototypeSlice } from './primordials/string'",
    ])
  })

  it('groups several identifiers from one leaf into a single import', () => {
    const result = applyPrimordialsImports(
      'const x = 1\n',
      [],
      new Set(['ArrayFrom', 'ArrayIsArray']),
      {
        ...splitStyle,
        splitByLeaf: {
          ...splitStyle.splitByLeaf,
          exportToLeaf: new Map([
            ['ArrayFrom', 'array'],
            ['ArrayIsArray', 'array'],
          ]),
        },
      },
      '/repo/src/example.mts',
    )
    expect(result.newSource).toContain(
      "import { ArrayFrom, ArrayIsArray } from './primordials/array'",
    )
  })

  it('skips an identifier missing from the leaf map', () => {
    // The catalog and the leaf map drifted; emitting an import for a leaf
    // nobody can name would produce an unresolvable specifier.
    const result = applyPrimordialsImports(
      'const x = 1\n',
      [],
      new Set(['NotInTheMap', 'ObjectKeys']),
      splitStyle,
      '/repo/src/example.mts',
    )
    expect(result.newSource).not.toContain('NotInTheMap')
    expect(result.newSource).toContain("from './primordials/object'")
  })

  it('reports no import added when every leaf import is already complete', () => {
    const source = "import { ObjectKeys } from './primordials/object'\n"
    const result = applyPrimordialsImports(
      source,
      [],
      new Set(['ObjectKeys']),
      splitStyle,
      '/repo/src/example.mts',
    )
    expect(result).toEqual({ importAdded: false, newSource: source })
  })
})
