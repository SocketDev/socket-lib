/**
 * @file Verify fuzz command argument forwarding and child output routing.
 */

import process from 'node:process'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { spawnSync } from '@socketsecurity/lib-stable/process/spawn/child'

import { main } from '../../scripts/repo/fuzz.mts'

vi.mock(import('@socketsecurity/lib-stable/process/spawn/child'), () => ({
  spawnSync: vi.fn(),
}))

const originalArgv = process.argv

afterEach(() => {
  process.argv = originalArgv
  vi.mocked(spawnSync).mockReset()
})

describe('fuzz CLI forwarding', () => {
  it.each([
    { args: [], stdio: 'inherit' },
    { args: ['--json'], stdio: ['inherit', 2, 'inherit'] },
  ])('keeps child arguments and status with $args', ({ args, stdio }) => {
    process.argv = [
      'node',
      'fuzz.mts',
      ...args,
      'example.fuzz.mts',
      '--seed',
      '42',
    ]
    const signal: NodeJS.Signals | null = null
    vi.mocked(spawnSync).mockReturnValue({
      pid: 1,
      output: [],
      stdout: '',
      stderr: '',
      status: 7,
      signal,
    })
    expect(main()).toBe(7)
    expect(spawnSync).toHaveBeenLastCalledWith(
      expect.any(String),
      ['run', 'example.fuzz.mts', '--seed', '42'],
      expect.objectContaining({
        stdio,
        env: expect.objectContaining({ VITIATE_FUZZ: '1' }),
      }),
    )
  })
})
