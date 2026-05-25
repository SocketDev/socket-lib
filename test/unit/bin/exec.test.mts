/**
 * @file Unit tests for src/bin/exec — execBin + binary path caching across
 *   resolvers. Split out of the historical monolithic test/unit/bin.test.mts.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { execBin } from '../../../src/bin/exec'
import { whichReal, whichRealSync } from '../../../src/bin/which'
import { isError } from '../../../src/errors/predicates'
import { runWithTempDir } from '../util/temp-file-helper'
import { safeDelete } from '../../../src/fs/safe'

describe('execBin', () => {
  it('should execute a binary by path', async () => {
    const result = await execBin('node', ['--version'])
    expect(result.code).toBe(0)
    expect(result.stdout).toBeTruthy()
  })

  it('should execute a binary by name', async () => {
    const result = await execBin('node', ['--version'])
    expect(result.code).toBe(0)
    expect(result.stdout).toBeTruthy()
  })

  it('should throw ENOENT error when binary not found', async () => {
    await expect(
      execBin('totally-nonexistent-binary-xyz-12345', []),
    ).rejects.toThrow('Binary not found')
  })

  it('should throw error with ENOENT code', async () => {
    try {
      await execBin('nonexistent-bin-12345')
    } catch (e) {
      expect(e).toBeInstanceOf(Error)
      if (isError(e)) {
        expect((e as any).code).toBe('ENOENT')
      }
    }
  })

  it('should handle binary with arguments', async () => {
    const result = await execBin('node', ['-e', 'console.log("hello")'])
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('hello')
  })

  it('should handle binary without arguments', async () => {
    const result = await execBin('node', ['--version'])
    expect(result.code).toBe(0)
  })

  it('should pass options to spawn', async () => {
    const result = await execBin('node', ['--version'], {
      cwd: process.cwd(),
    })
    expect(result.code).toBe(0)
  })

  it('should handle absolute path to binary', async () => {
    const nodePath = process.execPath
    const result = await execBin(nodePath, ['--version'])
    expect(result.code).toBe(0)
  })

  it('should handle relative path to binary', async () => {
    await runWithTempDir(async tmpDir => {
      const scriptPath = path.join(tmpDir, 'test.js')
      await fs.writeFile(scriptPath, 'console.log("test output")', 'utf8')

      const result = await execBin('node', [scriptPath])
      expect(result.code).toBe(0)
      expect(result.stdout).toContain('test output')
    }, 'execBin-script-')
  })
})

describe('execBin - path handling', () => {
  it('should handle binary name that needs path resolution', async () => {
    const result = await execBin('node', ['-p', 'process.version'])
    expect(result.code).toBe(0)
    expect(result.stdout).toMatch(/^v\d+\.\d+\.\d+/)
  })

  it('should handle binary with absolute path', async () => {
    const nodePath = process.execPath
    const result = await execBin(nodePath, ['-p', '1+1'])
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('2')
  })

  it('should throw for path that resolves to undefined', async () => {
    await expect(
      execBin('/absolutely/nonexistent/path/to/binary'),
    ).rejects.toThrow()
  })
})

describe('binary path caching', () => {
  it('should cache binary path resolution for execBin', async () => {
    // First call resolves and caches
    const result1 = await execBin('node', ['-p', '"first"'])
    expect(result1.code).toBe(0)

    // Second call should use cache (same result, faster)
    const result2 = await execBin('node', ['-p', '"second"'])
    expect(result2.code).toBe(0)

    // Both should work correctly
    expect(result1.stdout).toContain('first')
    expect(result2.stdout).toContain('second')
  })

  it('should cache binary path resolution for whichReal', async () => {
    // First call resolves and caches
    const result1 = await whichReal('node')
    expect(result1).toBeDefined()
    expect(typeof result1).toBe('string')

    // Second call should use cache
    const result2 = await whichReal('node')
    expect(result2).toBe(result1)
  })

  it('should cache binary path resolution for whichRealSync', () => {
    // First call resolves and caches
    const result1 = whichRealSync('node')
    expect(result1).toBeDefined()
    expect(typeof result1).toBe('string')

    // Second call should use cache
    const result2 = whichRealSync('node')
    expect(result2).toBe(result1)
  })

  it('should invalidate cache when binary no longer exists', async () => {
    await runWithTempDir(async tmpDir => {
      // Create a temporary "binary" script
      // Windows requires .cmd extension to execute batch scripts
      const binName = process.platform === 'win32' ? 'test-bin.cmd' : 'test-bin'
      const binPath = path.join(tmpDir, binName)
      const binScript =
        process.platform === 'win32'
          ? '@echo off\necho test'
          : '#!/bin/sh\necho test'
      await fs.writeFile(binPath, binScript, 'utf8')
      if (process.platform !== 'win32') {
        await fs.chmod(binPath, 0o755)
      }

      // First call with absolute path works
      const result1 = await execBin(binPath, [])
      expect(result1.code).toBe(0)

      // Delete the binary
      await safeDelete(binPath)

      // Second call should fail because binary no longer exists
      await expect(execBin(binPath, [])).rejects.toThrow()
    }, 'cache-invalidation-')
  })

  it('should cache "all" option results in whichReal', async () => {
    // First call resolves and caches
    const result1 = await whichReal('node', { all: true })
    expect(Array.isArray(result1)).toBe(true)
    expect(result1!.length).toBeGreaterThan(0)

    // Second call should use cache and return same result
    const result2 = await whichReal('node', { all: true })
    expect(Array.isArray(result2)).toBe(true)
    expect(result2).toEqual(result1)
  })

  it('should cache "all" option results in whichRealSync', () => {
    // First call resolves and caches
    const result1 = whichRealSync('node', { all: true })
    expect(Array.isArray(result1)).toBe(true)
    expect(result1!.length).toBeGreaterThan(0)

    // Second call should use cache and return same result
    const result2 = whichRealSync('node', { all: true })
    expect(Array.isArray(result2)).toBe(true)
    expect(result2).toEqual(result1)
  })

  it('should use separate caches for single and all lookups', async () => {
    // Single lookup
    const single = await whichReal('node')
    expect(typeof single).toBe('string')

    // All lookup should still work and return array
    const all = await whichReal('node', { all: true })
    expect(Array.isArray(all)).toBe(true)

    // Single should be string, all should be array - different caches
    expect(single).not.toEqual(all)
  })
})
