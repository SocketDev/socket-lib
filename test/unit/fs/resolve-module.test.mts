/**
 * @file Tests for fs/resolve-module — require.resolve from an arbitrary base.
 */

import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  requireResolveFrom,
  requireResolveFromCwd,
} from '../../../src/fs/resolve-module'

let tmp: string

beforeAll(() => {
  // Build a tiny fake package the resolver can find:
  //   <tmp>/node_modules/fixture-pkg/{package.json,index.js}
  // realpathSync resolves the macOS /var → /private/var symlink so the
  // expected paths match createRequire().resolve()'s realpath output.
  tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'resolve-mod-')))
  const pkgDir = path.join(tmp, 'node_modules', 'fixture-pkg')
  mkdirSync(pkgDir, { recursive: true })
  writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'fixture-pkg', version: '1.0.0', main: 'index.js' }),
  )
  writeFileSync(path.join(pkgDir, 'index.js'), 'module.exports = 1\n')
})

afterAll(() => {
  try {
    rmSync(tmp, { force: true, recursive: true })
  } catch {}
})

describe('requireResolveFrom', () => {
  it('resolves a package specifier from the given dir', () => {
    const resolved = requireResolveFrom(tmp, 'fixture-pkg')
    expect(resolved).toBe(
      path.join(tmp, 'node_modules', 'fixture-pkg', 'index.js'),
    )
  })

  it('throws for an unresolvable specifier by default', () => {
    expect(() => requireResolveFrom(tmp, 'does-not-exist-xyz')).toThrow()
  })

  it('returns undefined for an unresolvable specifier with nothrow', () => {
    expect(
      requireResolveFrom(tmp, 'does-not-exist-xyz', { nothrow: true }),
    ).toBeUndefined()
  })

  it('resolves a relative path against the from dir', () => {
    const resolved = requireResolveFrom(
      path.join(tmp, 'node_modules', 'fixture-pkg'),
      './index.js',
    )
    expect(resolved).toBe(
      path.join(tmp, 'node_modules', 'fixture-pkg', 'index.js'),
    )
  })
})

describe('requireResolveFromCwd', () => {
  it('resolves a builtin from cwd (no nothrow → returns a path)', () => {
    // `node:path` is always resolvable; exercises the non-nothrow
    // branch that delegates to requireResolveFrom(cwd, specifier).
    const resolved = requireResolveFromCwd('node:path')
    expect(resolved).toBe('node:path')
  })

  it('throws from cwd for an unresolvable specifier (no nothrow)', () => {
    expect(() => requireResolveFromCwd('does-not-exist-xyz')).toThrow()
  })

  it('returns undefined with nothrow for an unresolvable specifier', () => {
    expect(
      requireResolveFromCwd('does-not-exist-xyz', { nothrow: true }),
    ).toBeUndefined()
  })
})
