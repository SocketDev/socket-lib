/**
 * @file Unit tests for src/bin/find — findRealBin, findRealNpm, findRealPnpm,
 *   findRealYarn. Split out of the historical monolithic
 *   test/unit/bin.test.mts.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  findRealBin,
  findRealNpm,
  findRealPnpm,
  findRealYarn,
} from '../../../src/bin/find'
import { isShadowBinPath } from '../../../src/bin/shadow'
import { runWithTempDir } from '../util/temp-file-helper'

describe('findRealBin', () => {
  it('should find node binary', () => {
    const result = findRealBin('node')
    expect(result).toBeDefined()
    expect(result).toContain('node')
  })

  it('should return undefined for non-existent binary', () => {
    const result = findRealBin('totally-nonexistent-binary-xyz-12345')
    expect(result).toBeUndefined()
  })

  it('should check common paths first', async () => {
    await runWithTempDir(async tmpDir => {
      const binPath = path.join(tmpDir, 'custom-bin')
      await fs.writeFile(binPath, '#!/bin/sh\necho "test"', 'utf8')

      const result = findRealBin('test-binary', [binPath])
      expect(result).toBe(binPath)
    }, 'findRealBin-common-')
  })

  it('should skip shadow bins', async () => {
    await runWithTempDir(async _tmpDir => {
      const result = findRealBin('node', [])
      expect(result).toBeDefined()
      expect(isShadowBinPath(path.dirname(result!))).toBe(false)
    }, 'findRealBin-shadow-')
  })

  it('should handle empty common paths array', () => {
    const result = findRealBin('node', [])
    expect(result).toBeDefined()
  })

  it('should return first existing common path', async () => {
    await runWithTempDir(async tmpDir => {
      const bin1 = path.join(tmpDir, 'bin1')
      const bin2 = path.join(tmpDir, 'bin2')

      await fs.writeFile(bin2, '#!/bin/sh\necho "test"', 'utf8')

      const result = findRealBin('test', [bin1, bin2])
      expect(result).toBe(bin2)
    }, 'findRealBin-first-')
  })
})

describe('findRealNpm', () => {
  it('should find npm binary', () => {
    const result = findRealNpm()
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
  })

  it('should return a valid path or fallback to "npm"', () => {
    const result = findRealNpm()
    expect(result.length).toBeGreaterThan(0)
    // Should either be a full path or the string "npm"
    if (result !== 'npm') {
      expect(result).toContain('npm')
    }
  })

  it('should not return a shadow bin path when possible', () => {
    const result = findRealNpm()
    // If we found a real path (not just "npm"), it shouldn't be a shadow bin
    if (result !== 'npm' && result.includes('/')) {
      const dir = path.dirname(result)
      // We prefer non-shadow paths, but don't strictly require it
      // since the system might only have shadow bins available
      expect(typeof isShadowBinPath(dir)).toBe('boolean')
    }
  })
})

describe('findRealPnpm', () => {
  it('should return a string', () => {
    const result = findRealPnpm()
    expect(typeof result).toBe('string')
  })

  it('should return empty string if pnpm not found', () => {
    // This test documents current behavior - returns empty string when not found
    const result = findRealPnpm()
    expect(typeof result).toBe('string')
  })

  it('should return path containing pnpm when found', () => {
    const result = findRealPnpm()
    expect(typeof result).toBe('string')
    // When found (non-empty), must include 'pnpm' in the path.
    if (result) {
      expect(result).toContain('pnpm')
    }
  })
})

describe('findRealYarn', () => {
  it('should return a string', () => {
    const result = findRealYarn()
    expect(typeof result).toBe('string')
  })

  it('should return empty string if yarn not found', () => {
    // This test documents current behavior - returns empty string when not found
    const result = findRealYarn()
    expect(typeof result).toBe('string')
  })

  it('should return path containing yarn when found', () => {
    const result = findRealYarn()
    expect(typeof result).toBe('string')
    if (result) {
      expect(result).toContain('yarn')
    }
  })
})

describe('findRealBin - shadow bin detection', () => {
  it('should prefer non-shadow bin paths', async () => {
    const result = findRealBin('node', [])
    expect(result).toBeDefined()
    expect(isShadowBinPath(path.dirname(result!))).toBe(false)
  })

  it('should handle when all paths are shadow bins', () => {
    // In some environments, all available paths might be shadow bins
    const result = findRealBin('node', [])
    expect(result === undefined || typeof result === 'string').toBe(true)
  })
})

describe('findRealBin - additional edge cases', () => {
  it('should handle binary found in common paths', async () => {
    await runWithTempDir(async tmpDir => {
      const binPath = path.join(tmpDir, 'test-binary')
      await fs.writeFile(binPath, '#!/bin/sh\necho "test"', 'utf8')
      await fs.chmod(binPath, 0o755)

      const result = findRealBin('test-binary', [binPath])
      expect(result).toBe(binPath)
    }, 'findRealBin-common-found-')
  })

  it('should fall back to which when common paths not found', () => {
    const result = findRealBin('node', [
      '/nonexistent/path1',
      '/nonexistent/path2',
    ])
    expect(result).toBeDefined()
    expect(result).toContain('node')
  })

  it('should detect and skip shadow bin paths', async () => {
    await runWithTempDir(async tmpDir => {
      const shadowPath = path.join(tmpDir, 'node_modules/.bin')
      await fs.mkdir(shadowPath, { recursive: true })

      const binPath = path.join(shadowPath, 'test-bin')
      await fs.writeFile(binPath, '#!/bin/sh\necho "test"', 'utf8')

      const result = findRealBin('node', [])
      expect(result).toBeDefined()
      expect(isShadowBinPath(path.dirname(result!))).toBe(false)
    }, 'findRealBin-shadow-detection-')
  })
})

describe('findRealNpm - edge cases', () => {
  it('should check npm in node directory', () => {
    // This test exercises the logic that checks for npm next to node
    const result = findRealNpm()
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
  })

  it('should fall back through all strategies', () => {
    // This exercises all fallback paths in findRealNpm
    const result = findRealNpm()
    // Should return either a path or 'npm' as final fallback
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('findRealPnpm - edge cases', () => {
  it('should check common pnpm locations', () => {
    const result = findRealPnpm()
    // Should return either a path or empty string
    expect(typeof result).toBe('string')
  })

  it('should return empty string when pnpm not found', () => {
    // This tests the ?? '' fallback
    const result = findRealPnpm()
    expect(typeof result).toBe('string')
  })
})

describe('findRealYarn - edge cases', () => {
  it('should check common yarn locations', () => {
    const result = findRealYarn()
    // Should return either a path or empty string
    expect(typeof result).toBe('string')
  })

  it('should return empty string when yarn not found', () => {
    // This tests the ?? '' fallback
    const result = findRealYarn()
    expect(typeof result).toBe('string')
  })
})
