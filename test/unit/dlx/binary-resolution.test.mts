import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  findBinaryPath,
  makePackageBinsExecutable,
  resolveBinaryPath,
} from '../../../src/dlx/binary-resolution'
import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

let tmpRoot: string

function makePackage(opts: {
  packageDir: string
  packageName: string
  bin?: string | Record<string, string> | undefined
  version?: string | undefined
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

beforeEach(async () => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'dlx-binres-test-'))
})

afterEach(async () => {
  await safeDelete(tmpRoot)
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

const IS_WIN = os.platform() === 'win32'

describe.sequential('dlx/binary-resolution — makePackageBinsExecutable', () => {
  test.skipIf(IS_WIN)('chmods the single bin entry to 0o755', () => {
    makePackage({
      packageDir: tmpRoot,
      packageName: 'tool',
      bin: './bin/tool.js',
    })
    const binPath = path.join(tmpRoot, 'node_modules', 'tool', 'bin', 'tool.js')
    mkdirSync(path.dirname(binPath), { recursive: true })
    writeFileSync(binPath, '#!/usr/bin/env node\n')
    makePackageBinsExecutable(tmpRoot, 'tool')
    expect(statSync(binPath).mode & 0o777).toBe(0o755)
  })

  test.skipIf(IS_WIN)('chmods every entry of a multi-bin object', () => {
    makePackage({
      packageDir: tmpRoot,
      packageName: 'tool',
      bin: { primary: './bin/a.js', secondary: './bin/b.js' },
    })
    const dir = path.join(tmpRoot, 'node_modules', 'tool', 'bin')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'a.js'), '')
    writeFileSync(path.join(dir, 'b.js'), '')
    makePackageBinsExecutable(tmpRoot, 'tool')
    expect(statSync(path.join(dir, 'a.js')).mode & 0o777).toBe(0o755)
    expect(statSync(path.join(dir, 'b.js')).mode & 0o777).toBe(0o755)
  })

  test.skipIf(IS_WIN)(
    'returns silently when the package has no bin field',
    () => {
      makePackage({ packageDir: tmpRoot, packageName: 'no-bin' })
      expect(() => makePackageBinsExecutable(tmpRoot, 'no-bin')).not.toThrow()
    },
  )

  test.skipIf(IS_WIN)(
    'returns silently when the bin path does not exist on disk',
    () => {
      makePackage({
        packageDir: tmpRoot,
        packageName: 'tool',
        bin: './bin/missing.js',
      })
      expect(() => makePackageBinsExecutable(tmpRoot, 'tool')).not.toThrow()
    },
  )

  test.skipIf(IS_WIN)('returns silently when package.json is missing', () => {
    expect(() =>
      makePackageBinsExecutable(tmpRoot, 'never-installed'),
    ).not.toThrow()
  })
})

describe.sequential('dlx/binary-resolution — resolveBinaryPath', () => {
  test('returns the path verbatim on Unix', () => {
    if (IS_WIN) {
      return
    }
    expect(resolveBinaryPath('/usr/local/bin/anything')).toBe(
      '/usr/local/bin/anything',
    )
  })

  test('handles paths that do not exist on Unix (returned as-is)', () => {
    if (IS_WIN) {
      return
    }
    const made = path.join(tmpRoot, 'does-not-exist')
    expect(resolveBinaryPath(made)).toBe(made)
  })
})
