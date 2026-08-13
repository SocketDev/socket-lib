/**
 * @file Specs for scripts/repo/check/packed-tarball-resolves — the pack-and-
 *   require smoke gate that catches the class of bug a build-predicate unit
 *   test cannot: a subpath that resolves fine in the workspace `src/` but
 *   throws once loaded from the PACKED, INSTALLED tarball (the externals-
 *   boundary bug fixed in 46a64e45, which shipped socket-cli 1.1.151's "Cannot
 *   find module 'form-data'" outage). `buildPackedProbeSource` /
 *   `parsePackedProbeOutput` / `buildPackedTarballReport` are pure and covered
 *   directly. `runPackedSubpathProbe` spawns a real `node` process against a
 *   REAL fixture package on disk — no `pnpm pack` / `pnpm add` involved, so it
 *   stays fast and network-free — reproducing the exact defect shape: an
 *   exports-map subpath that points at a dist file that does not exist.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildPackedProbeSource,
  buildPackedTarballReport,
  HOT_LIB_SUBPATHS,
  parsePackedProbeOutput,
  runPackedSubpathProbe,
} from '../../scripts/repo/check/packed-tarball-resolves.mts'
import { REPO_ROOT } from '../../scripts/fleet/paths.mts'

const REPO_PACKAGE_JSON = JSON.parse(
  readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'),
) as { exports?: Record<string, unknown> | undefined }

/**
 * A scratch dir whose `node_modules/@fixture/pkg` mirrors the exact shape of
 * the bug this check exists to catch: `ok/mod` resolves to a real file,
 * `broken/mod` is declared in the exports map but its dist file was never
 * written — the same shape as an externalized module whose relative require
 * points at a file the build never emitted.
 */
function writeFixturePackage(): string {
  const scratchDir = mkdtempSync(
    path.join(os.tmpdir(), 'packed-tarball-resolves-fixture-'),
  )
  const pkgDir = path.join(scratchDir, 'node_modules', '@fixture', 'pkg')
  mkdirSync(path.join(pkgDir, 'dist', 'ok'), { recursive: true })
  writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({
      name: '@fixture/pkg',
      version: '1.0.0',
      exports: {
        './ok/mod': './dist/ok/mod.js',
        './broken/mod': './dist/broken/mod.js',
      },
    }),
  )
  writeFileSync(
    path.join(pkgDir, 'dist', 'ok', 'mod.js'),
    'exports.value = 1\n',
  )
  // Deliberately no dist/broken/mod.js — the declared exports target is
  // missing, mirroring the externalized-but-unshipped file class of bug.
  return scratchDir
}

describe('buildPackedProbeSource', () => {
  it('emits a synchronous try/catch require per subpath', () => {
    const source = buildPackedProbeSource(
      '@fixture/pkg',
      ['alphalphalphalphalphalphalphalpha/one', 'beta/two'],
      'require',
    )
    expect(source).toContain('require("@fixture/pkg/alphalphalphalphalphalphalphalpha/one")')
    expect(source).toContain('require("@fixture/pkg/beta/two")')
    expect(source).not.toContain('await')
    expect(source).toContain('process.stdout.write(JSON.stringify(failures))')
  })

  it('emits an awaited dynamic import per subpath', () => {
    const source = buildPackedProbeSource('@fixture/pkg', ['alphalphalphalphalphalphalphalpha/one'], 'import')
    expect(source).toContain('await import("@fixture/pkg/alphalphalphalphalphalphalphalpha/one")')
  })

  it('records the subpath and mode on failure, not the whole specifier', () => {
    const source = buildPackedProbeSource('@fixture/pkg', ['alphalphalphalphalphalphalphalpha/one'], 'require')
    expect(source).toContain('subpath: "alphalphalphalphalphalphalphalpha/one"')
    expect(source).toContain('mode: "require"')
  })
})

describe('parsePackedProbeOutput', () => {
  it('parses a JSON array of failures', () => {
    const failures = parsePackedProbeOutput(
      '[{"subpath":"alphalphalphalphalphalphalphalpha/one","mode":"require","message":"boom"}]',
    )
    expect(failures).toEqual([
      { subpath: 'alphalphalphalphalphalphalphalpha/one', mode: 'require', message: 'boom' },
    ])
  })

  it('parses an empty array as zero failures', () => {
    expect(parsePackedProbeOutput('[]')).toEqual([])
  })

  it('throws on non-JSON stdout instead of reading it as zero failures', () => {
    expect(() => parsePackedProbeOutput('not json at all')).toThrow(/non-JSON/)
  })

  it('throws when the JSON is not an array', () => {
    expect(() => parsePackedProbeOutput('{"oops":true}')).toThrow(/JSON array/)
  })
})

describe('runPackedSubpathProbe', () => {
  it('reports no failures for a subpath that resolves (require)', () => {
    const scratchDir = writeFixturePackage()
    const failures = runPackedSubpathProbe(
      scratchDir,
      '@fixture/pkg',
      ['ok/mod'],
      'require',
    )
    expect(failures).toEqual([])
  })

  it('reports no failures for a subpath that resolves (import)', () => {
    const scratchDir = writeFixturePackage()
    const failures = runPackedSubpathProbe(
      scratchDir,
      '@fixture/pkg',
      ['ok/mod'],
      'import',
    )
    expect(failures).toEqual([])
  })

  it('catches a declared subpath whose dist file is missing (require)', () => {
    const scratchDir = writeFixturePackage()
    const failures = runPackedSubpathProbe(
      scratchDir,
      '@fixture/pkg',
      ['ok/mod', 'broken/mod'],
      'require',
    )
    expect(failures).toHaveLength(1)
    expect(failures[0]?.subpath).toBe('broken/mod')
    expect(failures[0]?.mode).toBe('require')
    expect(failures[0]?.message).toMatch(/cannot find module/i)
  })

  it('catches a declared subpath whose dist file is missing (import)', () => {
    const scratchDir = writeFixturePackage()
    const failures = runPackedSubpathProbe(
      scratchDir,
      '@fixture/pkg',
      ['ok/mod', 'broken/mod'],
      'import',
    )
    expect(failures).toHaveLength(1)
    expect(failures[0]?.subpath).toBe('broken/mod')
    expect(failures[0]?.mode).toBe('import')
    expect(failures[0]?.message).toMatch(/cannot find module/i)
  })
})

describe('buildPackedTarballReport', () => {
  it('is ok when both probes come back clean', () => {
    const report = buildPackedTarballReport(
      '@fixture/pkg',
      '/tmp/fixture.tgz',
      ['ok/mod'],
      [],
      [],
    )
    expect(report.ok).toBe(true)
    expect(report.probedSubpaths).toBe(1)
    expect(report.failures).toEqual([])
  })

  it('is not ok when either probe reports a failure', () => {
    const failure = {
      subpath: 'broken/mod',
      mode: 'require' as const,
      message: 'boom',
    }
    const report = buildPackedTarballReport(
      '@fixture/pkg',
      '/tmp/fixture.tgz',
      ['ok/mod', 'broken/mod'],
      [failure],
      [],
    )
    expect(report.ok).toBe(false)
    expect(report.failures).toEqual([failure])
  })
})

describe('HOT_LIB_SUBPATHS', () => {
  it('every sampled subpath is a real export of this package today', () => {
    const exportsMap = REPO_PACKAGE_JSON.exports ?? {}
    const missing = HOT_LIB_SUBPATHS.filter(
      subpath => !(`./${subpath}` in exportsMap),
    )
    expect(missing).toEqual([])
  })

  it('has no duplicate entries', () => {
    expect(new Set(HOT_LIB_SUBPATHS).size).toBe(HOT_LIB_SUBPATHS.length)
  })
})
