/**
 * @file Tests for ai/worktree's tryGit throw paths.
 *   tryGit has three failure shapes: git exits non-zero (covered against a real
 *   repo in the isolated suite), the spawn itself throws a SpawnError, and the
 *   spawn throws something else entirely. The last two cannot be produced by a
 *   real git invocation — a missing binary or a malformed spawn — so the spawn
 *   boundary is mocked here rather than left uncovered.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSpawnSync } = vi.hoisted(() => ({ mockSpawnSync: vi.fn() }))

vi.mock(import('../../../src/process/spawn/child'), async importOriginal => ({
  ...(await importOriginal()),
  spawnSync: mockSpawnSync,
}))

import { tryGit } from '../../../src/ai/worktree'

beforeEach(() => {
  mockSpawnSync.mockReset()
})

describe('tryGit — spawn throws', () => {
  it('reports ok=false with stderr when the spawn throws a SpawnError', () => {
    // The shape isSpawnError recognizes: stdout/stderr/code carried on the
    // thrown value rather than returned.
    mockSpawnSync.mockImplementation(() => {
      const err = new Error('spawn failed') as Error & {
        code: number
        stderr: string
        stdout: string
      }
      err.code = 127
      err.stderr = 'git: command not found'
      err.stdout = ''
      throw err
    })
    const r = tryGit('/repo', 'status')
    expect(r.ok).toBe(false)
    expect(r.output).toContain('command not found')
  })

  it('falls back to stdout when the SpawnError carries no stderr', () => {
    mockSpawnSync.mockImplementation(() => {
      const err = new Error('spawn failed') as Error & {
        code: number
        stdout: string
      }
      err.code = 1
      err.stdout = 'partial output'
      throw err
    })
    const r = tryGit('/repo', 'status')
    expect(r.ok).toBe(false)
    expect(r.output).toBe('partial output')
  })

  it('reports ok=false with the message for a non-spawn error', () => {
    mockSpawnSync.mockImplementation(() => {
      throw new Error('something else entirely')
    })
    const r = tryGit('/repo', 'status')
    expect(r.ok).toBe(false)
    expect(r.output).toContain('something else entirely')
  })

  it('reports ok=false when spawnSync returns an error field', () => {
    // spawnSync signals a failure to launch by RESOLVING with `error` set,
    // which is a distinct path from a non-zero exit.
    mockSpawnSync.mockReturnValue({
      error: new Error('ENOENT'),
      status: undefined,
      stderr: '',
      stdout: '',
    })
    const r = tryGit('/repo', 'status')
    expect(r.ok).toBe(false)
  })
})
