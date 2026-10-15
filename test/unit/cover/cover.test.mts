import { describe, expect, it } from 'vitest'
import {
  coverageRunBudgetMs,
  resolveCoverageBudgets,
} from '../../../scripts/fleet/cover/budget-allowances.mts'
import { createSuiteBudget } from '../../../scripts/fleet/cover/lane-budget.mts'
import { runQuietCommand } from '../../../scripts/fleet/cover/execution.mts'
import { COVER_BUDGET_MS } from '../../../scripts/fleet/constants/test-budget.mts'
import { REPO_ROOT } from '../../../scripts/fleet/paths.mts'

describe('coverage command execution', () => {
  it('captures failure output and normalized exit code from a child process', async () => {
    const childScript = [
      `process.stdout.write('stdout')`,
      `process.stderr.write('stderr')`,
      'process.exitCode = 1',
    ].join('; ')
    const result = await runQuietCommand(['exec', 'node', '-e', childScript], {
      cwd: REPO_ROOT,
    })

    expect(result).toMatchObject({
      exitCode: 1,
      stdout: 'stdout',
      stderr: 'stderr',
    })
  })
})

describe('coverage budget allowances', () => {
  const today = '2026-10-13'
  const allowance = {
    maxMs: 180_000,
    reason: 'Fixed fixture for coverage allowance calculations.',
    created: today,
    expires: '2026-11-13',
  }

  it('applies a valid explicit fast-lane allowance within the CI run budget', () => {
    const policy = resolveCoverageBudgets({
      today,
      allowances: { fast: allowance },
    })
    const totalMs = coverageRunBudgetMs(policy, COVER_BUDGET_MS.ci)
    const budget = createSuiteBudget(REPO_ROOT, totalMs, {
      policy,
      startedAt: 0,
    })

    expect(totalMs).toBe(COVER_BUDGET_MS.ci)
    expect(budget.remaining('fast')).toBe(allowance.maxMs)
  })

  it('rejects an allowance that expired before the fixed evaluation date', () => {
    expect(() =>
      resolveCoverageBudgets({
        today,
        allowances: {
          fast: {
            ...allowance,
            created: '2026-09-13',
            expires: '2026-10-12',
          },
        },
      }),
    ).toThrow('Invalid coverage budget allowance.')
  })
})
