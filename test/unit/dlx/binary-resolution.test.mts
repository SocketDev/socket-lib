import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { findBinaryPath } from '../../../src/dlx/binary-resolution'

let tmpRoot: string

function makePackage(opts: {
  packageDir: string
  packageName: string
  bin?: string | Record<string, string>
  version?: string
}): void {
  const installedDir = path.join(
    opts.packageDir,
    'node_modules',
    opts.packageName,
  )
  mkdirSync(installedDir, { recursive: true })
  const pkg: Record<string, unknown> = {
    name: opts.packageName,
    version: opts.version ?? '1.0.0',
  }
  if (opts.bin !== undefined) {
    pkg['bin'] = opts.bin
  }
  writeFileSync(path.join(installedDir, 'package.json'), JSON.stringify(pkg))
}

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'dlx-binres-test-'))
})

afterEach(() => {
  rmSync(tmpRoot, { force: true, recursive: true })
})

describe.sequential('dlx/binary-resolution — findBinaryPath', () => {
  test('returns the string bin field verbatim when bin is a string', () => {
    makePackage({
      packageDir: tmpRoot,
      packageName: 'tool',
      bin: './bin/tool.js',
    })
    const result = findBinaryPath(tmpRoot, 'tool')
    // The path is normalized + joined under node_modules/tool/.
    expect(result).toContain('tool/bin/tool.js')
  })

  test('returns the single entry of a single-key bin object', () => {
    makePackage({
      packageDir: tmpRoot,
      packageName: 'tool',
      bin: { somename: './bin/cli.js' },
    })
    const result = findBinaryPath(tmpRoot, 'tool')
    expect(result).toContain('tool/bin/cli.js')
  })

  test('matches binaryName when bin has multiple keys', () => {
    makePackage({
      packageDir: tmpRoot,
      packageName: 'tool',
      bin: {
        primary: './bin/primary.js',
        secondary: './bin/secondary.js',
      },
    })
    const result = findBinaryPath(tmpRoot, 'tool', 'secondary')
    expect(result).toContain('bin/secondary.js')
  })

  test('falls back to last segment of package name when binaryName is absent', () => {
    makePackage({
      packageDir: tmpRoot,
      packageName: '@scope/tool',
      bin: {
        tool: './bin/tool.js',
        other: './bin/other.js',
      },
    })
    const result = findBinaryPath(tmpRoot, '@scope/tool')
    expect(result).toContain('bin/tool.js')
  })

  test('falls back to first bin entry when no candidate matches', () => {
    makePackage({
      packageDir: tmpRoot,
      packageName: 'mismatch',
      bin: {
        somethingelse: './bin/first.js',
        another: './bin/another.js',
      },
    })
    const result = findBinaryPath(tmpRoot, 'mismatch', 'definitely-not-there')
    // The first key in insertion order is `somethingelse`.
    expect(result).toContain('bin/first.js')
  })

  test('throws when bin entry is missing from package.json', () => {
    makePackage({
      packageDir: tmpRoot,
      packageName: 'no-bin',
    })
    expect(() => findBinaryPath(tmpRoot, 'no-bin')).toThrow(
      /No binary found for package/,
    )
  })

  test('handles bin object with scoped name in path', () => {
    makePackage({
      packageDir: tmpRoot,
      packageName: '@scope/mypkg',
      bin: { mypkg: './cli.js' },
    })
    const result = findBinaryPath(tmpRoot, '@scope/mypkg')
    expect(result).toContain('@scope/mypkg/cli.js')
  })
})
