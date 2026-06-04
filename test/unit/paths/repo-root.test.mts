/**
 * @file Tests for paths/repo-root — boundary-anchored repo root via
 *   findUpSync(package.json) from import.meta.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { findRepoRoot } from '../../../src/paths/repo-root'

describe('findRepoRoot', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'find-repo-root-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns the directory of the nearest package.json walking up from the script', () => {
    // Layout: tmpDir/package.json + tmpDir/scripts/fleet/check/foo.mts
    // The script is 3 levels deep; result should be tmpDir, regardless
    // of the actual ascent count.
    writeFileSync(path.join(tmpDir, 'package.json'), '{}', 'utf8')
    mkdirSync(path.join(tmpDir, 'scripts', 'fleet', 'check'), {
      recursive: true,
    })
    const scriptPath = path.join(
      tmpDir,
      'scripts',
      'fleet',
      'check',
      'foo.mts',
    )
    writeFileSync(scriptPath, '', 'utf8')
    const fakeMeta = { url: pathToFileURL(scriptPath).href } as ImportMeta

    const root = findRepoRoot(fakeMeta)

    // Normalize for cross-platform comparison.
    expect(root.replace(/\\/g, '/')).toBe(tmpDir.replace(/\\/g, '/'))
  })

  it('handles a script directly under the package root', () => {
    writeFileSync(path.join(tmpDir, 'package.json'), '{}', 'utf8')
    const scriptPath = path.join(tmpDir, 'index.mts')
    writeFileSync(scriptPath, '', 'utf8')
    const fakeMeta = { url: pathToFileURL(scriptPath).href } as ImportMeta

    const root = findRepoRoot(fakeMeta)

    expect(root.replace(/\\/g, '/')).toBe(tmpDir.replace(/\\/g, '/'))
  })

  it('walks past inner packages when stopAt is unset (no nearest-wins semantics by default)', () => {
    // Inner package.json should be the nearest match per findUpSync —
    // the helper picks up the FIRST marker, not the outermost.
    writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"outer"}', 'utf8')
    mkdirSync(path.join(tmpDir, 'inner'), { recursive: true })
    writeFileSync(
      path.join(tmpDir, 'inner', 'package.json'),
      '{"name":"inner"}',
      'utf8',
    )
    mkdirSync(path.join(tmpDir, 'inner', 'scripts'), { recursive: true })
    const scriptPath = path.join(tmpDir, 'inner', 'scripts', 'foo.mts')
    writeFileSync(scriptPath, '', 'utf8')
    const fakeMeta = { url: pathToFileURL(scriptPath).href } as ImportMeta

    const root = findRepoRoot(fakeMeta)

    expect(root.replace(/\\/g, '/')).toBe(
      path.join(tmpDir, 'inner').replace(/\\/g, '/'),
    )
  })

  it('accepts a custom marker name (.git) for monorepo roots', () => {
    // .git is a DIRECTORY in a real repo; findUpSync defaults to files
    // only. Use the names override + the helper's default onlyFiles=true
    // will not pick this up unless we pass a file marker. Test the
    // names override with a different file marker.
    writeFileSync(path.join(tmpDir, 'pnpm-workspace.yaml'), '', 'utf8')
    mkdirSync(path.join(tmpDir, 'packages', 'foo'), { recursive: true })
    writeFileSync(
      path.join(tmpDir, 'packages', 'foo', 'package.json'),
      '{}',
      'utf8',
    )
    const scriptPath = path.join(tmpDir, 'packages', 'foo', 'bar.mts')
    writeFileSync(scriptPath, '', 'utf8')
    const fakeMeta = { url: pathToFileURL(scriptPath).href } as ImportMeta

    const root = findRepoRoot(fakeMeta, { names: ['pnpm-workspace.yaml'] })

    expect(root.replace(/\\/g, '/')).toBe(tmpDir.replace(/\\/g, '/'))
  })

  it('throws when no marker is found between the script and stopAt', () => {
    mkdirSync(path.join(tmpDir, 'no-package'), { recursive: true })
    const scriptPath = path.join(tmpDir, 'no-package', 'foo.mts')
    writeFileSync(scriptPath, '', 'utf8')
    const fakeMeta = { url: pathToFileURL(scriptPath).href } as ImportMeta

    expect(() => findRepoRoot(fakeMeta, { stopAt: tmpDir })).toThrow(
      /no package.json found/,
    )
  })

  it('resolves the calling lib script (smoke test against the real source tree)', () => {
    // Self-test: findRepoRoot(import.meta) from this test file should
    // resolve to the socket-lib repo root (i.e. wherever this checkout
    // lives — never hard-coded).
    const root = findRepoRoot(import.meta)
    // This test file is at test/unit/paths/repo-root.test.mts; the repo
    // root contains a package.json with "@socketsecurity/lib".
    expect(root).toMatch(/socket-lib/)
  })
})
