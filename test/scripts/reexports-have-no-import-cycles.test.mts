/**
 * @file Specs for scripts/repo/check/reexports-have-no-import-cycles - the gate
 *   that keeps an eager CJS re-export out of an import cycle.
 *   The pure halves are what the tests drive: the re-export reader, the
 *   shortest-path-back walk, and the audit that joins them. Each case plants a
 *   throwaway module graph in a temp dir, so the dangerous topology can be
 *   built on purpose without touching the repo's own dist.
 *   The last case is the real regression: it runs the audit over the built
 *   dist and expects nothing, which is exactly what `paths/normalize` failed
 *   before its implementations moved down into `paths/shared`.
 */

import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  auditReexportCycles,
  findPathBack,
  listDistFiles,
  readReexports,
} from '../../scripts/repo/check/reexports-have-no-import-cycles.mts'

const DIST_DIR = path.join(import.meta.dirname, '..', '..', 'dist')

/**
 * Write a throwaway module graph and return its directory. Keys are file names
 * relative to that directory, values are the file bodies.
 */
function writeGraph(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'reexport-cycles-'))
  for (const { 0: name, 1: body } of Object.entries(files)) {
    const file = path.join(dir, name)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, body)
  }
  return dir
}

/**
 * The pre-fix `paths/` topology in miniature: a barrel that owns the shared
 * implementation AND re-exports the leaf that imports it back.
 */
function writeCyclicBarrel(): string {
  return writeGraph({
    'barrel.js': `const require_leaf = require('./leaf.js');
function normalizePath() {}
exports.normalizePath = normalizePath;
exports.isPath = require_leaf.isPath;
exports.isRelative = require_leaf.isRelative;
`,
    'leaf.js': `const require_barrel = require('./barrel.js');
exports.isPath = function () {};
exports.isRelative = function () {};
`,
  })
}

describe('readReexports', () => {
  it('maps each eager re-export to the file it copies from', () => {
    const dir = writeGraph({
      'barrel.js': `const require_leaf = require('./leaf.js');
exports.one = require_leaf.one;
exports.two = require_leaf.two;
`,
      'leaf.js': 'exports.one = 1;\nexports.two = 2;\n',
    })
    const found = readReexports(path.join(dir, 'barrel.js'))
    expect([...found.values()]).toEqual([['one', 'two']])
    expect([...found.keys()].map(f => path.basename(f))).toEqual(['leaf.js'])
  })

  it('ignores a local export that is not copied from another module', () => {
    const dir = writeGraph({
      'a.js': 'function local() {}\nexports.local = local;\n',
    })
    expect(readReexports(path.join(dir, 'a.js')).size).toBe(0)
  })

  it('ignores an alias whose specifier does not resolve on disk', () => {
    const dir = writeGraph({
      'a.js': `const require_gone = require('./gone.js');
exports.x = require_gone.x;
`,
    })
    expect(readReexports(path.join(dir, 'a.js')).size).toBe(0)
  })

  it('records a renaming re-export under the name it publishes', () => {
    const dir = writeGraph({
      'barrel.js': `const require_leaf = require('./leaf.js');
exports.outer = require_leaf.inner;
`,
      'leaf.js': 'exports.inner = 1;\n',
    })
    expect([...readReexports(path.join(dir, 'barrel.js')).values()]).toEqual([
      ['outer'],
    ])
  })
})

describe('findPathBack', () => {
  it('returns undefined when the target cannot reach the re-exporter', () => {
    const dir = writeGraph({
      'a.js': `const require_b = require('./b.js');\nexports.x = require_b.x;\n`,
      'b.js': 'exports.x = 1;\n',
    })
    expect(
      findPathBack(path.join(dir, 'b.js'), path.join(dir, 'a.js')),
    ).toBeUndefined()
  })

  it('finds a direct back-edge', () => {
    const dir = writeCyclicBarrel()
    const chain = findPathBack(
      path.join(dir, 'leaf.js'),
      path.join(dir, 'barrel.js'),
    )
    expect(chain?.map(f => path.basename(f))).toEqual(['leaf.js', 'barrel.js'])
  })

  it('reports the SHORTEST route back when several exist', () => {
    // `mid` reaches the barrel directly and also through a three-hop detour.
    // A depth-first walk could report either; the reader needs the short one.
    const dir = writeGraph({
      'barrel.js': `const require_mid = require('./mid.js');\nexports.x = require_mid.x;\n`,
      'far1.js': `require('./far2.js');\n`,
      'far2.js': `require('./barrel.js');\n`,
      'mid.js': `require('./far1.js');\nrequire('./barrel.js');\nexports.x = 1;\n`,
    })
    const chain = findPathBack(
      path.join(dir, 'mid.js'),
      path.join(dir, 'barrel.js'),
    )
    expect(chain?.map(f => path.basename(f))).toEqual(['mid.js', 'barrel.js'])
  })
})

describe('auditReexportCycles', () => {
  it('flags a barrel that re-exports a leaf importing it back', () => {
    const dir = writeCyclicBarrel()
    const findings = auditReexportCycles(listDistFiles(dir))
    expect(findings).toHaveLength(1)
    expect(findings[0]?.bindings).toEqual(['isPath', 'isRelative'])
    expect(findings[0]?.file.endsWith('barrel.js')).toBe(true)
  })

  it('passes a barrel whose implementations live in a true leaf', () => {
    // The shape the fix moved `paths/` to: the barrel imports the graph and
    // nothing in the graph imports the barrel back.
    const dir = writeGraph({
      'barrel.js': `const require_leaf = require('./leaf.js');
const require_shared = require('./shared.js');
exports.isPath = require_leaf.isPath;
exports.normalizePath = require_shared.normalizePath;
`,
      'leaf.js': `const require_shared = require('./shared.js');
exports.isPath = function () { return require_shared.normalizePath(); };
`,
      'shared.js': 'exports.normalizePath = function () {};\n',
    })
    expect(auditReexportCycles(listDistFiles(dir))).toEqual([])
  })

  it('passes a plain cycle that re-exports nothing across the back-edge', () => {
    // The three cycles dist already has. They cannot strand a binding, so the
    // gate must not fail them - otherwise it needs an allowlist and rots.
    const dir = writeGraph({
      'left.js': `const require_right = require('./right.js');
exports.left = function () { return require_right.right(); };
`,
      'right.js': `const require_left = require('./left.js');
exports.right = function () { return require_left.left; };
`,
    })
    expect(auditReexportCycles(listDistFiles(dir))).toEqual([])
  })

  it.runIf(existsSync(DIST_DIR))(
    'passes the repo real dist — no re-export sits inside a cycle',
    () => {
      // The regression this check exists for. `dist/paths/normalize.js` copied
      // nine predicate bindings out of a module that imported it back, so
      // importing `paths/predicates` first left all nine undefined for good.
      expect(auditReexportCycles(listDistFiles(DIST_DIR))).toEqual([])
    },
  )
})
