/**
 * @fileoverview Unit tests for TypeScript type-coverage helper.
 *
 * Mocks `spawn` from `../../src/spawn` so tests don't need the
 * `type-coverage` binary installed. Covers:
 *   - Successful parse of "covered / total percent%" output
 *   - null on unparseable output (no match, partial match)
 *   - null on spawn failure when generateIfMissing=false (default)
 *   - Throws when generateIfMissing=true and spawn fails
 *   - Throws when cwd is empty string (validation guard)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock spawn at the package specifier — src resolution is enabled in
// vitest.config.mts via the 'source' export condition.
vi.mock('@socketsecurity/lib/spawn')

import { spawn } from '@socketsecurity/lib/spawn'
import { getTypeCoverage } from '@socketsecurity/lib/cover/type'

describe('cover/type', () => {
  beforeEach(() => {
    vi.mocked(spawn).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getTypeCoverage', () => {
    it('parses successful spawn output', async () => {
      vi.mocked(spawn).mockResolvedValueOnce({
        code: 0,
        signal: null,
        stdout: Buffer.from('1234 / 5678 21.74%'),
        stderr: Buffer.from(''),
      } as any)
      const result = await getTypeCoverage({ cwd: '/some/path' })
      expect(result).toEqual({ covered: 1234, total: 5678, percent: '21.74' })
    })

    it('parses output with leading whitespace and other text', async () => {
      vi.mocked(spawn).mockResolvedValueOnce({
        code: 0,
        signal: null,
        stdout: Buffer.from('some files\n  500 / 1000 50.00%\nsome more text'),
        stderr: Buffer.from(''),
      } as any)
      const result = await getTypeCoverage({ cwd: '/some/path' })
      expect(result).toEqual({ covered: 500, total: 1000, percent: '50.00' })
    })

    it('returns null when output is unparseable', async () => {
      vi.mocked(spawn).mockResolvedValueOnce({
        code: 0,
        signal: null,
        stdout: Buffer.from('no metrics here'),
        stderr: Buffer.from(''),
      } as any)
      const result = await getTypeCoverage({ cwd: '/some/path' })
      expect(result).toBeNull()
    })

    it('returns null when spawn output is empty', async () => {
      vi.mocked(spawn).mockResolvedValueOnce({
        code: 0,
        signal: null,
        stdout: undefined,
        stderr: Buffer.from(''),
      } as any)
      const result = await getTypeCoverage({ cwd: '/some/path' })
      expect(result).toBeNull()
    })

    it('returns null when spawn rejects and generateIfMissing=false', async () => {
      vi.mocked(spawn).mockRejectedValueOnce(new Error('command not found'))
      const result = await getTypeCoverage({
        cwd: '/some/path',
        generateIfMissing: false,
      })
      expect(result).toBeNull()
    })

    it('returns null when spawn rejects and generateIfMissing is omitted (default false)', async () => {
      vi.mocked(spawn).mockRejectedValueOnce(new Error('not installed'))
      const result = await getTypeCoverage({ cwd: '/some/path' })
      expect(result).toBeNull()
    })

    it('throws when spawn rejects and generateIfMissing=true', async () => {
      vi.mocked(spawn).mockRejectedValueOnce(new Error('not installed'))
      await expect(
        getTypeCoverage({ cwd: '/some/path', generateIfMissing: true }),
      ).rejects.toThrow(/Unable to generate type coverage/)
    })

    it('throws when cwd is empty string', async () => {
      await expect(getTypeCoverage({ cwd: '' })).rejects.toThrow(
        /Working directory is required/,
      )
    })

    it('uses process.cwd() when no cwd provided', async () => {
      vi.mocked(spawn).mockResolvedValueOnce({
        code: 0,
        signal: null,
        stdout: Buffer.from('1 / 1 100.00%'),
        stderr: Buffer.from(''),
      } as any)
      // Should resolve cleanly without throwing the cwd-required guard.
      const result = await getTypeCoverage()
      expect(result).toEqual({ covered: 1, total: 1, percent: '100.00' })
    })

    it('passes --detail to type-coverage', async () => {
      vi.mocked(spawn).mockResolvedValueOnce({
        code: 0,
        signal: null,
        stdout: Buffer.from('100 / 200 50.00%'),
        stderr: Buffer.from(''),
      } as any)
      await getTypeCoverage({ cwd: '/x' })
      expect(vi.mocked(spawn).mock.calls[0]?.[0]).toBe('type-coverage')
      expect(vi.mocked(spawn).mock.calls[0]?.[1]).toEqual(['--detail'])
    })
  })
})
