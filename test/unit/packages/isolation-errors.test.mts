/**
 * @file Error-arm tests for `isolatePackage`. The sibling suite drives the
 *   happy path through the `install` escape hatch; these cases drive the
 *   refusals, which are the ones that matter when a caller mistypes a spec. A
 *   refusal that is silent leaves the caller with a temp directory and no
 *   package in it, and the failure surfaces much later as a confusing import
 *   error, so each arm has to name what it could not resolve.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { safeDelete } from '../../../src/fs/safe.mjs'
import { isolatePackage } from '../../../src/packages/isolation.mjs'

const tmpDirs: string[] = []

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await safeDelete(dir)
  }
})

function tmpRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'isolation-errors-'))
  tmpDirs.push(root)
  return root
}

/**
 * A package directory holding the given manifest, or none when `manifest` is
 * undefined.
 */
function packageDir(manifest?: object | undefined): string {
  const root = tmpRoot()
  const dir = path.join(root, 'example-package')
  mkdirSync(dir, { recursive: true })
  if (manifest) {
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify(manifest),
      'utf8',
    )
  }
  return dir
}

describe('a path that does not resolve', () => {
  it('names the absolute source path it looked for', async () => {
    const missing = path.join(tmpRoot(), 'absent-package')
    await expect(isolatePackage(missing)).rejects.toThrow(
      `Source path does not exist: ${missing}`,
    )
  })

  it('rejects a relative path the same way', async () => {
    await expect(
      isolatePackage('./this-relative-path-does-not-exist'),
    ).rejects.toThrow('Source path does not exist')
  })
})

describe('a directory spec with no readable manifest', () => {
  it('rejects rather than isolating a package with no name', async () => {
    // Without a name there is nowhere in node_modules to place the copy.
    const dir = packageDir()
    await expect(isolatePackage(dir)).rejects.toThrow()
  })

  it('rejects a file: spec pointing at a missing directory', async () => {
    const missing = path.join(tmpRoot(), 'absent-package')
    await expect(isolatePackage(`file:${missing}`)).rejects.toThrow(
      'Source path does not exist',
    )
  })

  it('reads the name from the manifest for a file: spec', async () => {
    // npm-package-arg leaves `name` unset for a bare file: spec, so the
    // manifest is the only source for it.
    const dir = packageDir({ name: '@example/package', version: '1.0.0' })
    const result = await isolatePackage(`file:${dir}`)
    tmpDirs.push(result.tmpdir)
    expect(result.tmpdir).toContain('example-package')
  })
})
