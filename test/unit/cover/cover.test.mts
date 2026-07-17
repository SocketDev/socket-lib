import process from 'node:process'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(import('@socketsecurity/lib-stable/process/spawn/child'))

import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'
import { runQuiet } from '../../../scripts/fleet/cover.mts'

describe('runQuiet', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.mocked(spawn).mockReset()
  })

  it('runs pnpm through the current Node executable', async () => {
    vi.stubEnv('npm_execpath', '/tmp/pnpm.cjs')
    vi.mocked(spawn).mockResolvedValue({
      code: 0,
      stderr: '',
      stdout: '',
    } as Awaited<ReturnType<typeof spawn>>)

    await runQuiet(['exec', 'vitest', 'run'], { cwd: '/tmp' })

    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      ['/tmp/pnpm.cjs', 'exec', 'vitest', 'run'],
      expect.objectContaining({
        cwd: '/tmp',
        env: expect.objectContaining({
          PATH: expect.stringContaining(path.dirname(process.execPath)),
        }),
      }),
    )
  })
})
