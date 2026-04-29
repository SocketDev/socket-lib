/**
 * @fileoverview Unit tests for code-coverage parsing.
 *
 * Mocks `readJson` from `@socketsecurity/lib/fs` and `spawn` from
 * `@socketsecurity/lib/spawn` so tests don't touch the real filesystem
 * or run external commands. Uses tmpdir + a real file when needed for
 * existsSync paths.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@socketsecurity/lib/spawn')

import { spawn } from '@socketsecurity/lib/spawn'
import { getCodeCoverage } from '@socketsecurity/lib/cover/code'

let tmpDir: string

function writeCoverageFile(data: unknown): string {
  const file = path.join(tmpDir, 'coverage-final.json')
  writeFileSync(file, JSON.stringify(data))
  return file
}

describe.sequential('cover/code', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'socket-lib-cover-test-'))
    vi.mocked(spawn).mockReset()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  describe('getCodeCoverage', () => {
    it('aggregates statement / branch / function metrics', async () => {
      const coveragePath = writeCoverageFile({
        '/some/file.ts': {
          s: { '0': 5, '1': 0, '2': 3 },
          b: { '0': [1, 0], '1': [2, 2] },
          f: { '0': 1, '1': 0 },
          statementMap: {},
        },
      })

      const result = await getCodeCoverage({ coveragePath })
      expect(result.statements).toEqual({
        covered: 2,
        total: 3,
        percent: '66.67',
      })
      expect(result.branches).toEqual({
        covered: 3,
        total: 4,
        percent: '75.00',
      })
      expect(result.functions).toEqual({
        covered: 1,
        total: 2,
        percent: '50.00',
      })
      // Lines are aggregated from statements.
      expect(result.lines).toEqual({ covered: 2, total: 3, percent: '66.67' })
    })

    it('returns 0.00% for empty coverage data', async () => {
      const coveragePath = writeCoverageFile({})
      const result = await getCodeCoverage({ coveragePath })
      expect(result.statements.percent).toBe('0.00')
      expect(result.branches.percent).toBe('0.00')
      expect(result.functions.percent).toBe('0.00')
      expect(result.lines.percent).toBe('0.00')
    })

    it('aggregates across multiple files', async () => {
      const coveragePath = writeCoverageFile({
        '/a.ts': {
          s: { '0': 1 },
          b: {},
          f: { '0': 1 },
        },
        '/b.ts': {
          s: { '0': 0, '1': 2 },
          b: {},
          f: { '0': 0 },
        },
      })
      const result = await getCodeCoverage({ coveragePath })
      // Total stmts: 3 (1 from a + 2 from b), covered: 2.
      expect(result.statements.covered).toBe(2)
      expect(result.statements.total).toBe(3)
    })

    it('skips entries that are not objects', async () => {
      const coveragePath = writeCoverageFile({
        '/a.ts': null,
        '/b.ts': 'not an object',
        '/c.ts': { s: { '0': 1 }, b: {}, f: {} },
      })
      const result = await getCodeCoverage({ coveragePath })
      expect(result.statements.covered).toBe(1)
      expect(result.statements.total).toBe(1)
    })

    it('skips non-object s/b/f buckets', async () => {
      const coveragePath = writeCoverageFile({
        '/a.ts': { s: 'not an object', b: null, f: undefined },
      })
      const result = await getCodeCoverage({ coveragePath })
      expect(result.statements.total).toBe(0)
    })

    it('skips non-array branch buckets', async () => {
      const coveragePath = writeCoverageFile({
        '/a.ts': { b: { '0': 'not array', '1': [1, 2] } },
      })
      const result = await getCodeCoverage({ coveragePath })
      expect(result.branches.total).toBe(2)
    })

    it('skips non-number counts', async () => {
      const coveragePath = writeCoverageFile({
        '/a.ts': {
          s: { '0': 'not a number', '1': 1 },
          f: { '0': null, '1': 2 },
          b: { '0': [1, 'bad', 3] },
        },
      })
      const result = await getCodeCoverage({ coveragePath })
      // Only valid number counts are counted.
      expect(result.statements.total).toBe(1)
      expect(result.functions.total).toBe(1)
      expect(result.branches.total).toBe(2)
    })

    it('throws when coverage file does not exist and generateIfMissing=false', async () => {
      const coveragePath = path.join(tmpDir, 'missing.json')
      await expect(getCodeCoverage({ coveragePath })).rejects.toThrow(
        /Coverage file not found/,
      )
    })

    it('runs vitest when coverage file is missing and generateIfMissing=true', async () => {
      const coveragePath = path.join(tmpDir, 'will-be-generated.json')
      vi.mocked(spawn).mockImplementationOnce(((..._args: any[]) => {
        // Simulate the vitest run creating the file.
        writeFileSync(coveragePath, JSON.stringify({}))
        const promise = Promise.resolve({
          code: 0,
          signal: null,
          stdout: Buffer.from(''),
          stderr: Buffer.from(''),
        }) as any
        promise.process = null
        promise.stdin = null
        return promise
      }) as any)
      const result = await getCodeCoverage({
        coveragePath,
        generateIfMissing: true,
      })
      expect(vi.mocked(spawn)).toHaveBeenCalledWith(
        'vitest',
        ['run', '--coverage'],
        expect.objectContaining({ stdio: 'inherit' }),
      )
      expect(result.statements.percent).toBe('0.00')
    })

    it('throws when coverage data is not an object', async () => {
      const coveragePath = writeCoverageFile('not an object')
      await expect(getCodeCoverage({ coveragePath })).rejects.toThrow(
        /Invalid coverage data format/,
      )
    })

    it('throws when coveragePath is empty', async () => {
      await expect(getCodeCoverage({ coveragePath: '' })).rejects.toThrow(
        /Coverage path is required/,
      )
    })

    it('uses default coveragePath when none provided', async () => {
      // Default is cwd/coverage/coverage-final.json. Either it exists (we
      // get a result) or it doesn't (we get the missing-file error). Both
      // are acceptable — the test exists to confirm the option default is
      // wired in.
      try {
        const result = await getCodeCoverage()
        expect(result).toHaveProperty('statements')
      } catch (e) {
        expect((e as Error).message).toMatch(/Coverage file not found/)
      }
    })
  })
})
