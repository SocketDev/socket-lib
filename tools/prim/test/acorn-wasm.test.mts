/**
 * @file Unit tests for the wasm parser accessor's specifier resolution. This is
 *   what keeps the PUBLISHED prim bin working: only dist/ ships, so the bin has
 *   to require the acorn-wasm.cjs sibling the build copies beside it rather
 *   than the package by name, which would not resolve. Running from source
 *   there is no sibling and the package name is right. A regression here is
 *   invisible in the repo, where node_modules resolves either way.
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'
import { afterEach, describe, expect, it } from 'vitest'

import { acornWasmSpecifier } from '../src/acorn-wasm.mts'

// The published contract, spelled out rather than imported from the module
// under test.
const PACKAGE_NAME = '@ultrathink/acorn.rs.wasm'
const SIBLING_FILE = 'acorn-wasm.cjs'

const tempDirs: string[] = []

function makeDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'prim-acorn-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    safeDeleteSync(tempDirs.pop()!)
  }
})

describe('acornWasmSpecifier', () => {
  it('requires the sibling when one sits beside the module', () => {
    const dir = makeDir()
    const sibling = path.join(dir, SIBLING_FILE)
    writeFileSync(sibling, 'module.exports = {}\n')
    const specifier = acornWasmSpecifier(
      pathToFileURL(path.join(dir, 'prim.cjs')).href,
    )
    expect(specifier).toBe(sibling)
  })

  it('falls back to the package name when no sibling exists', () => {
    const dir = makeDir()
    expect(
      acornWasmSpecifier(pathToFileURL(path.join(dir, 'acorn-wasm.mts')).href),
    ).toBe(PACKAGE_NAME)
  })

  it('returns an absolute path for the sibling, not a relative specifier', () => {
    const dir = makeDir()
    writeFileSync(path.join(dir, SIBLING_FILE), 'module.exports = {}\n')
    const specifier = acornWasmSpecifier(
      pathToFileURL(path.join(dir, 'prim.cjs')).href,
    )
    // A relative specifier would resolve against the requiring module's own
    // directory, which is only the same directory by luck once bundled.
    expect(path.isAbsolute(specifier)).toBe(true)
  })

  it('resolves from the module URL, not the process cwd', () => {
    const withSibling = makeDir()
    const without = makeDir()
    writeFileSync(path.join(withSibling, SIBLING_FILE), 'module.exports = {}\n')
    expect(
      acornWasmSpecifier(pathToFileURL(path.join(without, 'prim.cjs')).href),
    ).toBe(PACKAGE_NAME)
    expect(
      acornWasmSpecifier(
        pathToFileURL(path.join(withSibling, 'prim.cjs')).href,
      ),
    ).toBe(path.join(withSibling, SIBLING_FILE))
  })
})
