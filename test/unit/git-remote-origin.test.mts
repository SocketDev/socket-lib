/**
 * @file Unit tests for the half of src/git/remote.mts that reads a checkout:
 *   the six origin* readers and the `urlFromResult` they share. git is mocked,
 *   so these run without a repository and can drive the arms a real checkout
 *   cannot reach on demand — a missing origin, a git that exits non-zero, and
 *   the two different exit-code field names gitSpawn and gitSync report. The
 *   sibling git-remote spec covers the pure URL parsers.
 */

import os from 'node:os'
import path from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted so the mock factory, which runs before this module body, sees
// initialized spies.
const { gitSpawn, gitSync } = vi.hoisted(() => ({
  gitSpawn: vi.fn(),
  gitSync: vi.fn(),
}))

vi.mock(import('../../src/git/exec.mts'), async orig => {
  const actual = await orig()
  return {
    ...actual,
    // Both runners are typed against their real spawn result shapes, which
    // carry more than these tests supply; the spies stand in for the call, not
    // for the shape.
    gitSpawn: gitSpawn as unknown as typeof actual.gitSpawn,
    gitSync: gitSync as unknown as typeof actual.gitSync,
  }
})

import {
  originOwnerRepo,
  originOwnerRepoSync,
  originRemoteUrl,
  originRemoteUrlSync,
  originSlug,
  originSlugSync,
  urlFromResult,
} from '../../src/git/remote.mts'

const REMOTE = 'git@github.com:Acme/Widgets.git'

// A real absolute path on every platform. A POSIX literal like `/checkout` is
// not absolute on Windows, so a directory argument written that way stops
// meaning what the test says the moment anything resolves it.
const CHECKOUT = path.join(os.tmpdir(), 'example-checkout')

// gitSpawn resolves; its exit code is `code`.
function spawnResolves(code: number, stdout: string): void {
  gitSpawn.mockResolvedValue({ code, stdout })
}

// gitSync returns; its exit code is `status`.
function syncReturns(status: number, stdout: string): void {
  gitSync.mockReturnValue({ status, stdout })
}

beforeEach(() => {
  gitSpawn.mockReset()
  gitSync.mockReset()
})

describe('urlFromResult', () => {
  it('trims the trailing newline git writes', () => {
    expect(urlFromResult({ status: 0, stdout: `${REMOTE}\n` })).toBe(REMOTE)
  })

  it('falls through to the code field when status is not set', () => {
    // gitSpawn reports `code` and no `status`, and a signalled gitSync reports
    // a nullish `status` beside it, so both arrive here the same way.
    expect(urlFromResult({ code: 0, stdout: REMOTE })).toBe(REMOTE)
  })

  it('decodes a Buffer stdout', () => {
    expect(urlFromResult({ code: 0, stdout: Buffer.from(`${REMOTE}\n`) })).toBe(
      REMOTE,
    )
  })

  it('reports nothing when git exited non-zero', () => {
    expect(urlFromResult({ status: 128, stdout: REMOTE })).toBeUndefined()
  })

  it('reports nothing when neither exit field is set', () => {
    expect(urlFromResult({ stdout: REMOTE })).toBeUndefined()
  })

  it('reports nothing for stdout that is only whitespace', () => {
    expect(urlFromResult({ code: 0, stdout: '  \n' })).toBeUndefined()
  })

  it('reports nothing for absent stdout', () => {
    expect(urlFromResult({ code: 0, stdout: undefined })).toBeUndefined()
  })
})

describe('the async origin readers', () => {
  it('asks git for the origin URL in the given directory', async () => {
    spawnResolves(0, `${REMOTE}\n`)

    await expect(originRemoteUrl(CHECKOUT)).resolves.toBe(REMOTE)
    expect(gitSpawn).toHaveBeenCalledWith(
      ['remote', 'get-url', 'origin'],
      expect.objectContaining({ cwd: CHECKOUT }),
    )
  })

  it('reports no URL when the checkout has no origin', async () => {
    spawnResolves(2, '')

    await expect(originRemoteUrl(CHECKOUT)).resolves.toBeUndefined()
  })

  it('preserves case in the owner/repo pair', async () => {
    spawnResolves(0, `${REMOTE}\n`)

    await expect(originOwnerRepo(CHECKOUT)).resolves.toBe('Acme/Widgets')
  })

  it('reports no owner/repo when there is no origin', async () => {
    spawnResolves(2, '')

    await expect(originOwnerRepo(CHECKOUT)).resolves.toBeUndefined()
  })

  it('lowercases the slug', async () => {
    spawnResolves(0, `${REMOTE}\n`)

    await expect(originSlug(CHECKOUT)).resolves.toBe('widgets')
  })

  it('reports no slug when there is no origin', async () => {
    spawnResolves(2, '')

    await expect(originSlug(CHECKOUT)).resolves.toBeUndefined()
  })
})

describe('the sync origin readers', () => {
  it('asks git for the origin URL in the given directory', () => {
    syncReturns(0, `${REMOTE}\n`)

    expect(originRemoteUrlSync(CHECKOUT)).toBe(REMOTE)
    expect(gitSync).toHaveBeenCalledWith(
      ['remote', 'get-url', 'origin'],
      expect.objectContaining({ cwd: CHECKOUT }),
    )
  })

  it('reports no URL when the checkout has no origin', () => {
    syncReturns(2, '')

    expect(originRemoteUrlSync(CHECKOUT)).toBeUndefined()
  })

  it('preserves case in the owner/repo pair', () => {
    syncReturns(0, `${REMOTE}\n`)

    expect(originOwnerRepoSync(CHECKOUT)).toBe('Acme/Widgets')
  })

  it('reports no owner/repo when there is no origin', () => {
    syncReturns(2, '')

    expect(originOwnerRepoSync(CHECKOUT)).toBeUndefined()
  })

  it('lowercases the slug', () => {
    syncReturns(0, `${REMOTE}\n`)

    expect(originSlugSync(CHECKOUT)).toBe('widgets')
  })

  it('reports no slug when there is no origin', () => {
    syncReturns(2, '')

    expect(originSlugSync(CHECKOUT)).toBeUndefined()
  })
})
