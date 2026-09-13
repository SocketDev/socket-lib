import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  coverageRunBudgetMs,
  readCoverageBudgets,
} from '../../../scripts/fleet/cover/budget-allowances.mts'
import { createSuiteBudget } from '../../../scripts/fleet/cover/lane-budget.mts'
import { runQuietCommand } from '../../../scripts/fleet/cover-run.mts'
import { runQuiet } from '../../../scripts/fleet/cover.mts'
import { COVER_BUDGET_MS } from '../../../scripts/fleet/constants/test-budget.mts'
import { REPO_ROOT } from '../../../scripts/fleet/paths.mts'

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

describe('publish coverage budget', () => {
  it('preserves the repository fast-lane allowance inside the CI run budget', () => {
    const policy = readCoverageBudgets(REPO_ROOT)
    const totalMs = coverageRunBudgetMs(policy, COVER_BUDGET_MS.ci)
    const budget = createSuiteBudget(REPO_ROOT, totalMs, {
      policy,
      startedAt: 0,
    })

    expect(totalMs).toBe(COVER_BUDGET_MS.ci)
    expect(budget.remaining('fast')).toBe(180_000)
  })
})
