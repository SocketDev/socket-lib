/**
 * @file Specs for scripts/repo/check/browser-exports-have-no-node-builtins -
 *   the gate that keeps a `browser`-conditioned export honest. The pure halves
 *   are what the tests drive: the specifier reader, the relative resolver, the
 *   transitive walk, and the condition reader.
 *   The walk is exercised against a throwaway module graph written to a temp
 *   dir, so a case can plant a `node:` import five hops deep - which is where
 *   every real finding lived - without touching the repo's own dist.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  auditBrowserExports,
  browserTargetOf,
  findNodeBuiltins,
  readSpecifiers,
  resolveRelative,
} from '../../scripts/repo/check/browser-exports-have-no-node-builtins.mts'

/**
 * Write a throwaway module graph and return its directory. Keys are file names
 * relative to that directory, values are the file bodies.
 */
function writeGraph(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'browser-exports-'))
  for (const { 0: name, 1: body } of Object.entries(files)) {
    const file = path.join(dir, name)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, body)
  }
  return dir
}

describe('readSpecifiers', () => {
  it('reads static, re-export, side-effect, dynamic, and require forms', () => {
    const dir = writeGraph({
      'a.js': [
        `import { x } from './x.js'`,
        `export { y } from './y.js'`,
        `import './side.js'`,
        `const z = await import('./z.js')`,
        `const w = require('node:fs')`,
      ].join('\n'),
    })
    expect(readSpecifiers(path.join(dir, 'a.js')).toSorted()).toEqual([
      './side.js',
      './x.js',
      './y.js',
      './z.js',
      'node:fs',
    ])
  })
})

describe('resolveRelative', () => {
  it('resolves an explicit file, an extensionless file, and an index', () => {
    const dir = writeGraph({
      'dir/index.js': '',
      'exact.js': '',
      'from.js': '',
    })
    const from = path.join(dir, 'from.js')
    expect(resolveRelative('./exact.js', from)).toBe(path.join(dir, 'exact.js'))
    expect(resolveRelative('./exact', from)).toBe(path.join(dir, 'exact.js'))
    expect(resolveRelative('./dir', from)).toBe(
      path.join(dir, 'dir', 'index.js'),
    )
  })

  it('returns undefined for a specifier with no file behind it', () => {
    const dir = writeGraph({ 'from.js': '' })
    expect(resolveRelative('./nope.js', path.join(dir, 'from.js'))).toBe(
      undefined,
    )
  })
})

describe('findNodeBuiltins', () => {
  it('finds nothing in a clean graph', () => {
    const dir = writeGraph({
      'entry.js': `import './mid.js'`,
      'mid.js': `import './leaf.js'`,
      'leaf.js': `export const a = 1`,
    })
    expect(findNodeBuiltins(path.join(dir, 'entry.js')).size).toBe(0)
  })

  it('ignores a BARE builtin, which the browser field stubs to false', () => {
    const dir = writeGraph({
      'entry.js': `import { createRequire } from 'module'`,
    })
    expect(findNodeBuiltins(path.join(dir, 'entry.js')).size).toBe(0)
  })

  it('finds a node: import buried several hops deep', () => {
    const dir = writeGraph({
      'entry.js': `import './a.js'`,
      'a.js': `import './b.js'`,
      'b.js': `import './c.js'`,
      'c.js': `import { gunzip } from 'node:zlib'`,
    })
    const hits = findNodeBuiltins(path.join(dir, 'entry.js'))
    expect([...hits.keys()]).toEqual(['node:zlib'])
  })

  it('reports a shortest chain, not whichever route it wandered first', () => {
    const dir = writeGraph({
      // The long route is listed first so a depth-first walk would find it.
      'entry.js': `import './long1.js'\nimport './short.js'`,
      'long1.js': `import './long2.js'`,
      'long2.js': `import './long3.js'`,
      'long3.js': `import 'node:fs'`,
      'short.js': `import 'node:fs'`,
    })
    const chain = findNodeBuiltins(path.join(dir, 'entry.js')).get('node:fs')!
    expect(path.basename(chain.at(-1)!)).toBe('short.js')
  })

  it('terminates on an import cycle', () => {
    const dir = writeGraph({
      'entry.js': `import './a.js'`,
      'a.js': `import './entry.js'\nimport 'node:os'`,
    })
    expect([...findNodeBuiltins(path.join(dir, 'entry.js')).keys()]).toEqual([
      'node:os',
    ])
  })
})

describe('browserTargetOf', () => {
  it('reads a nested self-routing condition', () => {
    expect(
      browserTargetOf({
        browser: { default: './dist/x.js', types: './dist/x.d.ts' },
        default: './dist/x.js',
      }),
    ).toBe('./dist/x.js')
  })

  it('reads a bare-string build override', () => {
    expect(browserTargetOf({ browser: './dist/x.browser.js' })).toBe(
      './dist/x.browser.js',
    )
  })

  it('returns undefined for an entry with no browser condition', () => {
    expect(browserTargetOf({ default: './dist/x.js' })).toBe(undefined)
    expect(browserTargetOf('./dist/x.js')).toBe(undefined)
    // A JSON null, the way one would arrive from a hand-edited package.json.
    // `typeof null` is 'object', so this is the branch that would throw.
    expect(browserTargetOf(JSON.parse('null'))).toBe(undefined)
  })
})

describe('auditBrowserExports', () => {
  it('ignores an entry whose target is not on disk', () => {
    expect(
      auditBrowserExports({
        './gone': { browser: { default: './dist/definitely-not-here.js' } },
      }),
    ).toEqual([])
  })

  it('ignores an entry with no browser condition', () => {
    expect(
      auditBrowserExports({ './plain': { default: './dist/npm/registry.js' } }),
    ).toEqual([])
  })

  it('passes the repo real dist — every browser leaf is clean', () => {
    // The regression this whole check exists for. Reads the package's own
    // exports map and built bytes, so it fails the moment a browser-flagged
    // leaf picks up a node: import.
    const pkg = JSON.parse(
      readFileSync(
        path.join(import.meta.dirname, '..', '..', 'package.json'),
        'utf8',
      ),
    ) as { exports: Record<string, unknown> }
    expect(auditBrowserExports(pkg.exports)).toEqual([])
  })
})
