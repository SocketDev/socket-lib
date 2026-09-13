/**
 * @file Verify result JSON and native reports at repository CLI boundaries.
 */

import { spawnSync } from '@socketsecurity/lib-stable/process/spawn/child'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { afterEach, describe, expect, it } from 'vitest'

import { scriptCliPath } from './paths.mts'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'

const directories: string[] = []

function runCli(file: Parameters<typeof scriptCliPath>[0], args: string[]) {
  return spawnSync(process.execPath, [scriptCliPath(file), ...args], {
    stdio: 'pipe',
    stdioString: true,
    timeout: 5000,
  })
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    safeDeleteSync(directory)
  }
})

describe('repository CLI JSON output', () => {
  it.each([
    'repo/check/docs-imports-resolve.mts',
    'repo/check/force-delete-is-opt-in.mts',
    'validate/dist-exports.mts',
    'validate/esm-named-exports.mts',
  ] as const)('describes %s without running checks', file => {
    const result = runCli(file, ['--describe', '--json'])
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      name: path.basename(file),
    })
    expect(result.stderr).toBe('')
  })

  it('keeps strict codemod arguments and dry-run bytes intact', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'codemod-cli-'))
    directories.push(directory)
    const file = path.join(directory, 'example.mts')
    const source =
      "import path from 'node:path'\nexport const separator = path.sep\n"
    writeFileSync(file, source)
    const beforeBytes = readFileSync(file)
    const result = runCli('repo/codemod/prefer-node-getter.mts', [
      '--json',
      '--dry-run',
      file,
    ])
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, exitCode: 0 })
    expect(readFileSync(file).equals(beforeBytes)).toBe(true)
    expect(result.stderr.length).toBeGreaterThan(0)
  })

  it('returns a structured failure for missing expose-leaf arguments', () => {
    const result = runCli('repo/expose-leaf.mts', ['--json', '--dry-run'])
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toEqual({ ok: false, exitCode: 1 })
    expect(result.stderr.length).toBeGreaterThan(0)
  })

  it('preserves a native audit report despite consumer diagnostics', () => {
    const result = runCli('repo/audit-api-usage.mts', [
      '--json',
      '--consumers',
      'example-absent-consumer',
    ])
    expect(result.status).toBe(0)
    const report = JSON.parse(result.stdout)
    expect(report.total).toBeGreaterThan(0)
    expect(report.adopted).toBe(0)
    expect(report.unused).toBe(report.total)
    expect(report.unusedList).toHaveLength(report.total)
    expect(result.stderr.length).toBeGreaterThan(0)
  })
})
