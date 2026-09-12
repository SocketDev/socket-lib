import { afterEach, describe, expect, it, vi } from 'vitest'
import { runQuietCommand } from '../../../scripts/fleet/cover-run.mts'
import { runQuiet } from '../../../scripts/fleet/cover.mts'

vi.mock(import('../../../scripts/fleet/cover-run.mts'))

describe('runQuiet', () => {
  afterEach(() => {
    vi.mocked(runQuietCommand).mockReset()
  })

  it('delegates command execution to the coverage runner', async () => {
    vi.mocked(runQuietCommand).mockResolvedValue({
      exitCode: 0,
      stderr: '',
      stdout: '',
    })

    await runQuiet(['exec', 'vitest', 'run'], { cwd: '/tmp' })

    expect(runQuietCommand).toHaveBeenCalledWith(['exec', 'vitest', 'run'], {
      cwd: '/tmp',
    })
  })
})
