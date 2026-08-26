/**
 * @file Unit tests for prim's cross-batch validator. This is the last gate
 *   before `prim mod --apply` writes anything, and the failure it exists to
 *   prevent is the worst one the tool can produce: dozens of half-rewritten
 *   files that only `git checkout` recovers. So the tests drive the three
 *   rejection kinds it can raise - a rewrite inside the source-of-truth root,
 *   output that no longer parses, and an import that points back at the
 *   importer - plus the multi-hop cycle walk that single-file checks cannot
 *   see.
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'
import { afterEach, describe, expect, it } from 'vitest'

import {
  detectImportCycles,
  extractImports,
  formatValidationReport,
  isRelativeSpecifier,
  nodeAbsForKey,
  nodeKey,
  shortenForReport,
  stripExt,
  validateRewrites,
} from '../src/validate.mts'

const tmpDirs: string[] = []

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await safeDelete(dir)
  }
})

function tmpRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'prim-validate-'))
  tmpDirs.push(root)
  return root
}

/**
 * A planned rewrite for `<root>/<name>`, optionally materialized on disk so a
 * graph walk that falls through to the filesystem finds it.
 */
function plan(root: string, name: string, newSource: string, onDisk = false) {
  const absPath = path.join(root, name)
  if (onDisk) {
    writeFileSync(absPath, newSource, 'utf8')
  }
  return { absPath, newSource, relPath: name }
}

describe('path helpers', () => {
  it('strips every source extension the codemod can emit', () => {
    const exts = ['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']
    expect(exts.map(ext => stripExt(`/repo/src/example${ext}`))).toEqual(
      exts.map(() => '/repo/src/example'),
    )
  })

  it('leaves an unrelated extension alone', () => {
    expect(stripExt('/repo/src/example.json')).toBe('/repo/src/example.json')
  })

  it('collapses the two spellings of one file onto one node key', () => {
    // `./foo` and `./foo.ts` are the same module; two node keys would hide a
    // cycle between them.
    const withExt = nodeKey('/repo/src/example.mts')
    const withoutExt = nodeKey('/repo/src/example')
    expect(withExt).toBe(withoutExt)
  })

  it('treats only ./ and ../ as relative specifiers', () => {
    expect(isRelativeSpecifier('./leaf')).toBe(true)
    expect(isRelativeSpecifier('../leaf')).toBe(true)
    expect(isRelativeSpecifier('node:fs')).toBe(false)
    expect(isRelativeSpecifier('@socketsecurity/lib-stable/paths')).toBe(false)
  })

  it('shortens a node key to its last two segments', () => {
    expect(shortenForReport('/repo/src/primordials/array')).toBe(
      'primordials/array',
    )
  })

  it('leaves an already-short key intact', () => {
    expect(shortenForReport('src/array')).toBe('src/array')
    expect(shortenForReport('array')).toBe('array')
  })
})

describe('nodeAbsForKey', () => {
  it('returns the hint when it is the same file as the key', () => {
    expect(nodeAbsForKey('/repo/src/example', '/repo/src/example.mts')).toBe(
      '/repo/src/example.mts',
    )
  })

  it('probes real extensions when the hint is a different file', () => {
    const root = tmpRoot()
    const node = path.join(root, 'example')
    writeFileSync(`${node}.mts`, 'export const a = 1\n', 'utf8')
    expect(nodeAbsForKey(node, path.join(root, 'other.ts'))).toBe(`${node}.mts`)
  })

  it('falls back to the bare key when nothing on disk matches', () => {
    // The caller reads this path and treats the throw as "no outgoing edges",
    // so returning the key is safe and keeps the walk going.
    const root = tmpRoot()
    const node = path.join(root, 'absent')
    expect(nodeAbsForKey(node, path.join(root, 'other.ts'))).toBe(node)
  })
})

describe('extractImports', () => {
  it('collects import, export-from and export-star specifiers', () => {
    const specs = extractImports(
      [
        "import { named } from './imported.mts'",
        "export { renamed } from './re-exported.mts'",
        "export * from './star-exported.mts'",
        "import 'node:fs'",
        'const local = 1',
      ].join('\n'),
      '/repo/src/example.mts',
    )
    expect(specs).toEqual([
      './imported.mts',
      './re-exported.mts',
      './star-exported.mts',
      'node:fs',
    ])
  })

  it('strips TypeScript types before parsing a .mts file', () => {
    // Acorn cannot parse a type annotation; without the strip pass every
    // typed file would be reported unparseable.
    const specs = extractImports(
      "import type { T } from './t.mts'\nconst x: number = 1\n",
      '/repo/src/example.mts',
    )
    expect(specs).toEqual([])
  })

  it('parses a plain .js file without stripping', () => {
    expect(
      extractImports(
        "import { named } from './imported.js'\n",
        '/repo/src/example.js',
      ),
    ).toEqual(['./imported.js'])
  })

  it('throws on syntactically invalid source', () => {
    expect(() => extractImports('const = =', '/repo/src/example.js')).toThrow()
  })
})

describe('formatValidationReport', () => {
  it('is empty when nothing was rejected', () => {
    expect(formatValidationReport([])).toBe('')
  })

  it('heads the report with the rejected count', () => {
    const text = formatValidationReport([
      {
        file: 'src/example.mts',
        kind: 'self-import',
        message: 'rewrite added a self-import',
      },
    ])
    expect(text.split(/\r?\n/)[0]).toBe(
      'prim mod: validation rejected 1 planned rewrite(s):',
    )
  })

  it('lists kind, file, message and optional detail per finding', () => {
    const text = formatValidationReport([
      {
        detail: "specifier: './example'",
        file: 'src/example.mts',
        kind: 'self-import',
        message: 'rewrite added a self-import',
      },
      {
        file: 'src/other.mts',
        kind: 'unparseable',
        message: 'rewritten file failed to parse',
      },
    ])
    expect(text).toContain('  [self-import] src/example.mts')
    expect(text).toContain('    rewrite added a self-import')
    expect(text).toContain("    specifier: './example'")
    expect(text).toContain('  [unparseable] src/other.mts')
  })

  it('closes by promising the tree is untouched and naming the escape hatch', () => {
    const text = formatValidationReport([
      { file: 'a.mts', kind: 'cycle', message: 'cycle' },
    ])
    expect(text).toContain('No files were modified.')
    expect(text).toContain('--no-validate')
  })
})

describe('validateRewrites', () => {
  it('accepts a clean batch', () => {
    const root = tmpRoot()
    expect(
      validateRewrites([
        plan(root, 'example.mts', "import { a } from './a.mts'\n"),
      ]),
    ).toEqual([])
  })

  it('rejects any rewrite inside the primordials source-of-truth root', () => {
    // These files ARE the surface; rewriting one to import from itself is how
    // the whole package stops loading.
    const root = tmpRoot()
    const findings = validateRewrites(
      [plan(root, 'array.mts', 'export const ArrayPrototypeMap = 1\n')],
      { primordialsRoot: root },
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]?.kind).toBe('inside-primordials-root')
    expect(findings[0]?.detail).toContain(root)
  })

  it('leaves a rewrite outside the primordials root alone', () => {
    const root = tmpRoot()
    expect(
      validateRewrites([plan(root, 'example.mts', 'const a = 1\n')], {
        primordialsRoot: path.join(root, 'primordials'),
      }),
    ).toEqual([])
  })

  it('rejects output that no longer parses, carrying the parser message', () => {
    const root = tmpRoot()
    const findings = validateRewrites([plan(root, 'example.mts', 'const = =')])
    expect(findings).toHaveLength(1)
    expect(findings[0]?.kind).toBe('unparseable')
    expect(findings[0]?.detail?.length).toBeGreaterThan(0)
  })

  it('rejects a self-import naming the offending specifier', () => {
    const root = tmpRoot()
    const findings = validateRewrites([
      plan(root, 'number.mts', "import { NumberParseInt } from './number'\n"),
    ])
    // A self-import is also a one-hop cycle, so both checks fire on it.
    expect(findings.map(f => f.kind)).toEqual(['self-import', 'cycle'])
    expect(findings[0]?.detail).toBe("specifier: './number'")
  })

  it('ignores a bare specifier that merely shares the file name', () => {
    const root = tmpRoot()
    expect(
      validateRewrites([
        plan(root, 'number.mts', "import { x } from 'number'\n"),
      ]),
    ).toEqual([])
  })
})

describe('detectImportCycles', () => {
  it('finds nothing for an empty plan set', () => {
    expect(detectImportCycles([])).toEqual([])
  })

  it('finds nothing when the plans do not import each other', () => {
    const root = tmpRoot()
    expect(
      detectImportCycles([
        plan(root, 'a.mts', "import 'node:fs'\n"),
        plan(root, 'b.mts', 'const b = 1\n'),
      ]),
    ).toEqual([])
  })

  it('reports a two-hop cycle with the path that closes it', () => {
    // `array → map-set → array` is the real cycle this validator was written
    // for; the single-file self-import check cannot see it.
    const root = tmpRoot()
    const findings = detectImportCycles([
      plan(root, 'array.mts', "import { MapCtor } from './map-set'\n"),
      plan(root, 'map-set.mts', "import { ArrayFrom } from './array'\n"),
    ])
    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0]?.kind).toBe('cycle')
    expect(findings[0]?.file).toBe('array.mts')
    expect(findings[0]?.detail).toContain('→')
    const [, cyclePath] = findings[0]!.detail!.split('cycle path: ')
    const hops = cyclePath!.split(' → ')
    expect(hops[0]).toBe(hops[hops.length - 1])
  })

  it('reports a self-referential plan as a cycle too', () => {
    const root = tmpRoot()
    const findings = detectImportCycles([
      plan(root, 'number.mts', "import { x } from './number'\n"),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]?.kind).toBe('cycle')
  })

  it('walks a shared dependency once instead of once per path', () => {
    // The diamond is the common shape - every primordials leaf imports
    // ./uncurry - and re-walking it per path is what the visited set stops.
    const root = tmpRoot()
    const findings = detectImportCycles([
      plan(root, 'a.mts', "import './b'\nimport './c'\n"),
      plan(root, 'b.mts', "import './d'\n"),
      plan(root, 'c.mts', "import './d'\n"),
      plan(root, 'd.mts', 'const d = 1\n'),
    ])
    expect(findings).toEqual([])
  })

  it('follows an edge into a file that is on disk but not planned', () => {
    const root = tmpRoot()
    writeFileSync(path.join(root, 'b'), "import { a } from './a.mts'\n", 'utf8')
    const findings = detectImportCycles([
      plan(root, 'a.mts', "import { b } from './b'\n"),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]?.kind).toBe('cycle')
  })

  it('treats an unreadable edge target as a dead end', () => {
    const root = tmpRoot()
    expect(
      detectImportCycles([plan(root, 'a.mts', "import './absent'\n")]),
    ).toEqual([])
  })

  it('treats an unparseable edge target as a dead end', () => {
    // validateRewrites rejects these up front, but the cycle walk is exported
    // on its own and must not throw on one.
    const root = tmpRoot()
    writeFileSync(path.join(root, 'broken'), 'const = =', 'utf8')
    expect(
      detectImportCycles([plan(root, 'a.mts', "import './broken'\n")]),
    ).toEqual([])
  })
})
