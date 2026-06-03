import path from 'node:path'
import process from 'node:process'

import { describe, expect, test } from 'vitest'

import {
  pythonBinPath,
  pythonCacheDir,
} from '../../../../src/external-tools/python/from-download'

describe('external-tools/python/from-download — path helpers', () => {
  const WIN32 = process.platform === 'win32'

  test('pythonBinPath nests under python/ with the per-OS interpreter', () => {
    const dir = path.join('a', 'b')
    const expected = WIN32
      ? path.join(dir, 'python', 'python.exe')
      : path.join(dir, 'python', 'bin', 'python3')
    expect(pythonBinPath(dir)).toBe(expected)
  })

  test('pythonCacheDir encodes version-tag-platformArch under _dlx/python', () => {
    const dir = pythonCacheDir('3.11.14', '20260203', 'darwin-arm64')
    expect(dir.replace(/\\/g, '/')).toContain(
      '/_dlx/python/3.11.14-20260203-darwin-arm64',
    )
  })
})
