/**
 * @file Verify distribution syntax, dependency boundaries, and CLI output.
 */

import { spawnSync } from '@socketsecurity/lib-stable/process/spawn/child'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { afterEach, describe, expect, it } from 'vitest'

import { scriptCliPath } from './paths.mts'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'

const scratchDirs: string[] = []

function createDistribution(source: string): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'dist-integrity-'))
  scratchDirs.push(directory)
  writeFileSync(path.join(directory, 'example.cjs'), source)
  return directory
}

function runVerifier(args: string[]) {
  return spawnSync(
    process.execPath,
    [scriptCliPath('repo/build/verify-dist.mts'), ...args],
    {
      stdio: 'pipe',
      stdioString: true,
      timeout: 5000,
    },
  )
}

afterEach(() => {
  for (const directory of scratchDirs.splice(0)) {
    safeDeleteSync(directory)
  }
})

describe('verify-dist CLI', () => {
  it('describes the command before reading a nonexistent distribution', () => {
    const result = runVerifier(['--describe', '--json', 'absent-distribution'])
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ name: 'verify-dist.mts' })
    expect(result.stderr).toBe('')
  })

  it('accepts the distribution after the JSON flag and does not execute it', () => {
    const directory = createDistribution(
      "throw new Error('must not execute')\n",
    )
    const result = runVerifier(['--json', directory])
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, exitCode: 0 })
  })

  it.each([
    { kind: 'syntax error', source: 'module.exports = {' },
    {
      kind: 'undeclared dependency',
      source: "require('@example/undeclared-module')",
    },
  ])(
    'rejects a distribution with $kind and emits one JSON result',
    ({ source }) => {
      const directory = createDistribution(source)
      const result = runVerifier([directory, '--json'])
      expect(result.status).toBe(1)
      expect(JSON.parse(result.stdout)).toEqual({ ok: false, exitCode: 1 })
      expect(result.stderr.length).toBeGreaterThan(0)
    },
  )
})
