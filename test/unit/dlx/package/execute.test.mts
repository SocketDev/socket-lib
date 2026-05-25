/**
 * @file Unit tests for src/dlx/package — execute surface. Split out of the
 *   historical monolithic test/unit/dlx/package.test.mts to keep each test file
 *   under the fleet's 500-line soft cap.
 */

import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { executePackage } from '../../../../src/dlx/package'

describe('executePackage', () => {
  it('returns a spawn promise from a binary path', async () => {
    // Use a real binary that should exist on every system.
    const { promise } = (() => {
      const promise = executePackage(process.execPath, [
        '-e',
        'process.exit(0)',
      ])
      return { promise }
    })()
    const result = await promise
    expect(result.code).toBe(0)
  })

  it('forwards args to the spawned process', async () => {
    // Echo via node -p
    const promise = executePackage(process.execPath, [
      '-p',
      '"hello-from-execute"',
    ])
    const result = await promise
    expect(String(result.stdout)).toContain('hello-from-execute')
  })

  it('passes spawn options through', async () => {
    const promise = executePackage(
      process.execPath,
      ['-e', 'process.stderr.write("err"); process.exit(0)'],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    )
    const result = await promise
    expect(String(result.stderr)).toContain('err')
  })
})
