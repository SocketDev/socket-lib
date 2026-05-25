/**
 * @file Unit tests for src/dlx/package — ensure surface. Split out of the
 *   historical monolithic test/unit/dlx/package.test.mts to keep each test file
 *   under the fleet's 500-line soft cap.
 */

import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ensurePackageInstalled } from '../../../../src/dlx/package'
import { setPath } from '../../../../src/paths/rewire'

// `tmpDir` and `process.env['SOCKET_DLX_DIR']` are mutated at describe
// scope and beforeEach. Under vitest's default
// `sequence.concurrent: true` (off-CI), parallel `it` blocks would
// overwrite both, making the .npmrc assertion read from the wrong
// tmpDir. Force sequential here.
describe.sequential('ensurePackageInstalled (cached path)', () => {
  let tmpDir: string
  let savedDlxDir: string | undefined

  // Pre-stage a node_modules/<pkg>/package.json under <dlxDir>/<sha512-prefix>/
  // matching what generateCacheKey produces. The early-return path inside
  // ensurePackageInstalled then short-circuits Arborist entirely.
  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'dlx-pkg-cached-'))
    savedDlxDir = process.env['SOCKET_DLX_DIR']
    process.env['SOCKET_DLX_DIR'] = tmpDir
    setPath('socket-dlx-dir', tmpDir)
  })

  afterEach(() => {
    if (savedDlxDir === undefined) {
      delete process.env['SOCKET_DLX_DIR']
    } else {
      process.env['SOCKET_DLX_DIR'] = savedDlxDir
    }
    setPath('socket-dlx-dir', undefined)
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  function stageCachedPackage(packageSpec: string, packageName: string) {
    // generateCacheKey is sha512-hex-prefix(16) of the package spec.
    const cacheKey = createHash('sha512')
      .update(packageSpec)
      .digest('hex')
      .slice(0, 16)
    const packageDir = path.join(tmpDir, cacheKey)
    const installedDir = path.join(packageDir, 'node_modules', packageName)
    mkdirSync(installedDir, { recursive: true })
    writeFileSync(
      path.join(installedDir, 'package.json'),
      JSON.stringify({ name: packageName, version: '1.2.3' }),
    )
    return { cacheKey, installedDir, packageDir }
  }

  it('short-circuits when an installed package.json already exists', async () => {
    const { installedDir, packageDir } = stageCachedPackage(
      'lodash@4.17.21',
      'lodash',
    )
    const result = await ensurePackageInstalled(
      'lodash',
      'lodash@4.17.21',
      false,
    )
    expect(result.installed).toBe(false)
    // packageDir matches exactly (modulo path normalization).
    expect(result.packageDir.replace(/\\/g, '/')).toBe(
      packageDir.replace(/\\/g, '/'),
    )
    // The cached package.json is untouched.
    expect(existsSync(path.join(installedDir, 'package.json'))).toBe(true)
  })

  it('short-circuits for scoped packages too', async () => {
    stageCachedPackage('@scope/pkg@2.0.0', '@scope/pkg')
    const result = await ensurePackageInstalled(
      '@scope/pkg',
      '@scope/pkg@2.0.0',
      false,
    )
    expect(result.installed).toBe(false)
  })

  it('writes hardened .npmrc when lockfile is JSON-string content', async () => {
    // Skip the early-return so the lockfile branch runs.
    const lockfileContent = JSON.stringify({
      name: 'lf-test',
      lockfileVersion: 3,
      requires: true,
      packages: { '': { name: 'lf-test' } },
    })
    const cacheKey = createHash('sha512')
      .update('lf-test@1.0.0')
      .digest('hex')
      .slice(0, 16)
    const packageDir = path.join(tmpDir, cacheKey)
    // Don't pre-stage installedDir — we want to enter the Arborist branch.
    mkdirSync(packageDir, { recursive: true })

    // Arborist will throw downstream, but the .npmrc write happens
    // synchronously inside the lockfile branch BEFORE Arborist runs, and
    // unlike package-lock.json it isn't rewritten by reify(). Asserting
    // only on .npmrc avoids the Arborist-overwrites-lockfile race that
    // makes the package-lock.json assertion flaky in concurrent runs.
    await expect(
      ensurePackageInstalled('lf-test', 'lf-test@1.0.0', false, {
        lockfile: lockfileContent,
      }),
    ).rejects.toBeDefined()

    const writtenNpmrc = readFileSync(path.join(packageDir, '.npmrc'), 'utf8')
    expect(writtenNpmrc).toContain('ignore-scripts=true')
    expect(writtenNpmrc).toContain('audit=false')
  })
})

describe.sequential('ensurePackageInstalled (installRoot option)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'dlx-pkg-installRoot-'))
  })

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  it('uses installRoot verbatim — no cacheKey appended', async () => {
    // Pre-stage <installRoot>/node_modules/<pkg>/package.json directly
    // (no cacheKey subdirectory). The early-return path inside
    // ensurePackageInstalled then short-circuits Arborist.
    const installRoot = path.join(tmpDir, 'my-build-cache')
    const installedDir = path.join(installRoot, 'node_modules', 'lodash')
    mkdirSync(installedDir, { recursive: true })
    writeFileSync(
      path.join(installedDir, 'package.json'),
      JSON.stringify({ name: 'lodash', version: '4.17.21' }),
    )

    const result = await ensurePackageInstalled(
      'lodash',
      'lodash@4.17.21',
      false,
      { installRoot },
    )

    expect(result.installed).toBe(false)
    expect(result.packageDir.replace(/\\/g, '/')).toBe(
      installRoot.replace(/\\/g, '/'),
    )
  })

  it('does not collide with the default cache layout', async () => {
    // Two parallel "installs" of the same spec — one to the default
    // dlxDir cache (cacheKey-keyed), one to a custom installRoot
    // (verbatim) — must end up at distinct directories.
    const customPath = path.join(tmpDir, 'custom')
    const defaultDlxDir = path.join(tmpDir, 'default-dlx')

    // Stage at customPath (no cacheKey).
    const customInstalled = path.join(customPath, 'node_modules', 'lodash')
    mkdirSync(customInstalled, { recursive: true })
    writeFileSync(
      path.join(customInstalled, 'package.json'),
      JSON.stringify({ name: 'lodash', version: '4.17.21' }),
    )

    // Stage at default location (with cacheKey).
    const cacheKey = createHash('sha512')
      .update('lodash@4.17.21')
      .digest('hex')
      .slice(0, 16)
    const defaultInstalled = path.join(
      defaultDlxDir,
      cacheKey,
      'node_modules',
      'lodash',
    )
    mkdirSync(defaultInstalled, { recursive: true })
    writeFileSync(
      path.join(defaultInstalled, 'package.json'),
      JSON.stringify({ name: 'lodash', version: '4.17.21' }),
    )

    // Resolve via installRoot.
    const customResult = await ensurePackageInstalled(
      'lodash',
      'lodash@4.17.21',
      false,
      { installRoot: customPath },
    )
    expect(customResult.packageDir.replace(/\\/g, '/')).toBe(
      customPath.replace(/\\/g, '/'),
    )

    // Resolve via default (point SOCKET_DLX_DIR at our default-dlx tmp).
    const savedDlxDir = process.env['SOCKET_DLX_DIR']
    process.env['SOCKET_DLX_DIR'] = defaultDlxDir
    setPath('socket-dlx-dir', defaultDlxDir)
    try {
      const defaultResult = await ensurePackageInstalled(
        'lodash',
        'lodash@4.17.21',
        false,
      )
      expect(defaultResult.packageDir.replace(/\\/g, '/')).toBe(
        path.join(defaultDlxDir, cacheKey).replace(/\\/g, '/'),
      )
      // Distinct paths — proves the option doesn't accidentally fold
      // into the default layout.
      expect(defaultResult.packageDir).not.toBe(customResult.packageDir)
    } finally {
      if (savedDlxDir === undefined) {
        delete process.env['SOCKET_DLX_DIR']
      } else {
        process.env['SOCKET_DLX_DIR'] = savedDlxDir
      }
      setPath('socket-dlx-dir', undefined)
    }
  })

  it('works with scoped package names', async () => {
    const installRoot = path.join(tmpDir, 'scoped')
    const installedDir = path.join(installRoot, 'node_modules', '@scope', 'pkg')
    mkdirSync(installedDir, { recursive: true })
    writeFileSync(
      path.join(installedDir, 'package.json'),
      JSON.stringify({ name: '@scope/pkg', version: '2.0.0' }),
    )

    const result = await ensurePackageInstalled(
      '@scope/pkg',
      '@scope/pkg@2.0.0',
      false,
      { installRoot },
    )

    expect(result.installed).toBe(false)
    expect(result.packageDir.replace(/\\/g, '/')).toBe(
      installRoot.replace(/\\/g, '/'),
    )
  })
})
