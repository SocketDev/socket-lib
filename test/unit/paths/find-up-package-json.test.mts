/**
 * @file Tests for paths/find-up-package-json — boundary-anchored
 *   nearest-package-json lookup via findUpSync from import.meta.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { findUpPackageJson } from '../../../src/paths/find-up-package-json'

describe('findUpPackageJson', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'find-up-pkg-json-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns the path of the nearest package.json walking up from the script', () => {
    // Layout: tmpDir/package.json + tmpDir/scripts/fleet/check/foo.mts
    // The script is 3 levels deep; result should be tmpDir/package.json,
    // regardless of the actual ascent count.
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

    const found = findUpPackageJson(fakeMeta)

    expect(found.replace(/\\/g, '/')).toBe(
      path.join(tmpDir, 'package.json').replace(/\\/g, '/'),
    )
  })

  it('handles a script directly under the package root', () => {
    writeFileSync(path.join(tmpDir, 'package.json'), '{}', 'utf8')
    const scriptPath = path.join(tmpDir, 'index.mts')
    writeFileSync(scriptPath, '', 'utf8')
    const fakeMeta = { url: pathToFileURL(scriptPath).href } as ImportMeta

    const found = findUpPackageJson(fakeMeta)

    expect(found.replace(/\\/g, '/')).toBe(
      path.join(tmpDir, 'package.json').replace(/\\/g, '/'),
    )
  })

  it('picks the nearest package.json when nested packages are present', () => {
    // Inner package.json should be the nearest match — findUpSync
    // returns the FIRST marker, not the outermost (matches the
    // package-resolution semantics every module system uses).
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

    const found = findUpPackageJson(fakeMeta)

    expect(found.replace(/\\/g, '/')).toBe(
      path.join(tmpDir, 'inner', 'package.json').replace(/\\/g, '/'),
    )
  })

  it('accepts a custom marker name for monorepo workspace roots', () => {
    // A pnpm-workspace.yaml at the monorepo root is a common alternate
    // anchor when the workspace root isn't itself an npm package.
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

    const found = findUpPackageJson(fakeMeta, {
      names: ['pnpm-workspace.yaml'],
    })

    expect(found.replace(/\\/g, '/')).toBe(
      path.join(tmpDir, 'pnpm-workspace.yaml').replace(/\\/g, '/'),
    )
  })

  it('throws when no marker is found between the script and stopAt', () => {
    mkdirSync(path.join(tmpDir, 'no-package'), { recursive: true })
    const scriptPath = path.join(tmpDir, 'no-package', 'foo.mts')
    writeFileSync(scriptPath, '', 'utf8')
    const fakeMeta = { url: pathToFileURL(scriptPath).href } as ImportMeta

    expect(() => findUpPackageJson(fakeMeta, { stopAt: tmpDir })).toThrow(
      /no package.json found/,
    )
  })

  it('resolves the calling lib script (smoke test against the real source tree)', () => {
    // Self-test: findUpPackageJson(import.meta) from this test file
    // resolves to the socket-lib package.json — never hard-coded.
    const found = findUpPackageJson(import.meta)
    expect(found).toMatch(/socket-lib\/package\.json$/)
  })
})
