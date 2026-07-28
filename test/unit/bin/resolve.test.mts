/**
 * @file Unit tests for src/bin/resolve — resolveRealBinSync core behavior:
 *   path normalization, symlink resolution, relative/absolute/Windows-style
 *   inputs, and general edge cases (special characters, UNC paths, current
 *   and parent directory references, repeated separators).
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { resolveRealBinSync } from '../../../src/bin/resolve'
import { isError } from '../../../src/errors/predicates'
import { getDefaultLogger } from '../../../src/logger/default'
import { runWithTempDir } from '../util/temp-file-helper'

const logger = getDefaultLogger()

describe('resolveRealBinSync', () => {
  it('should normalize path with forward slashes', () => {
    const result = resolveRealBinSync('/usr/bin/node')
    expect(result).not.toContain('\\')
  })

  it('should return "." for empty string', () => {
    const result = resolveRealBinSync('')
    expect(result).toBe('.')
  })

  it('should handle relative path', async () => {
    await runWithTempDir(async tmpDir => {
      const binFile = path.join(tmpDir, 'test-bin')
      await fs.writeFile(binFile, '#!/bin/sh\necho "test"', 'utf8')
      await fs.chmod(binFile, 0o755)

      const result = resolveRealBinSync(binFile)
      expect(result).toBeTruthy()
      expect(result).not.toContain('\\')
    }, 'resolveBin-relative-')
  })

  it('should resolve symlinks when possible', async () => {
    await runWithTempDir(async tmpDir => {
      const targetFile = path.join(tmpDir, 'target')
      await fs.writeFile(targetFile, '#!/bin/sh\necho "test"', 'utf8')

      const linkFile = path.join(tmpDir, 'link')
      try {
        await fs.symlink(targetFile, linkFile)

        const result = resolveRealBinSync(linkFile)
        expect(result).toBeTruthy()
        // Should resolve to real path
        expect(result).toContain('target')
      } catch (e) {
        // Skip if symlinks are not supported on this platform
        if (
          isError(e) &&
          (e.message.includes('EPERM') ||
            e.message.includes('operation not permitted'))
        ) {
          logger.log('Skipping symlink test - not supported')
        } else {
          throw e
        }
      }
    }, 'resolveBin-symlink-')
  })

  it('should handle non-absolute paths', () => {
    const result = resolveRealBinSync('node')
    expect(result).toBeTruthy()
  })

  it('should normalize Windows-style paths', () => {
    const result = resolveRealBinSync('C:\\Program Files\\nodejs\\node.exe')
    expect(result).not.toContain('\\')
  })

  it('should handle paths with spaces', () => {
    const result = resolveRealBinSync('/usr/local/bin/my binary')
    expect(result).toBeTruthy()
  })

  it('should return normalized path when realpath fails', async () => {
    const result = resolveRealBinSync('/nonexistent/path/to/binary')
    expect(result).toBeTruthy()
    expect(result).not.toContain('\\')
  })
})

describe('resolveRealBinSync - edge cases', () => {
  it('should handle paths with special characters', () => {
    const result = resolveRealBinSync('/usr/bin/test-binary-name')
    expect(result).toBeTruthy()
    expect(result).not.toContain('\\')
  })

  it('should handle Windows drive letters', () => {
    const result = resolveRealBinSync('C:/Windows/System32/cmd.exe')
    expect(result).toBeTruthy()
    expect(result).not.toContain('\\')
  })

  it('should handle UNC paths', () => {
    const result = resolveRealBinSync('//server/share/bin/executable')
    expect(result).toBeTruthy()
  })

  it('should handle current directory reference', () => {
    const result = resolveRealBinSync('./node')
    expect(result).toBeTruthy()
  })

  it('should handle parent directory reference', () => {
    const result = resolveRealBinSync('../bin/node')
    expect(result).toBeTruthy()
  })

  it('should handle multiple path separators', () => {
    const result = resolveRealBinSync('/usr//local//bin///node')
    expect(result).toBeTruthy()
    expect(result).not.toMatch(/\/\//)
  })

  it('should handle trailing slash', () => {
    const result = resolveRealBinSync('/usr/bin/node/')
    expect(result).toBeTruthy()
  })
})

describe('resolveRealBinSync - additional scenarios', () => {
  it('should handle current directory reference', () => {
    const result = resolveRealBinSync('.')
    expect(result).toBe('.')
  })

  it('should handle non-absolute path lookup', async () => {
    // When given a relative or binary name, should try to find it first
    const result = resolveRealBinSync('node')
    expect(result).toBeDefined()
    if (typeof result === 'string') {
      expect(result.length).toBeGreaterThan(0)
    }
  })

  it('should normalize Windows paths with backslashes', async () => {
    await runWithTempDir(async tmpDir => {
      const binPath = path.join(tmpDir, 'test.cmd')
      await fs.writeFile(binPath, '@echo off\necho test', 'utf8')

      const result = resolveRealBinSync(binPath)
      expect(result).toBeTruthy()
      // Result should be normalized (no backslashes mixed with forward slashes)
      if (typeof result === 'string') {
        expect(result.includes('\\')).toBe(false)
      }
    }, 'resolveBin-normalize-')
  })
})
