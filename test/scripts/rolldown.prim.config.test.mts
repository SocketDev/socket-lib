/**
 * @file Execute the production prim bundle from an isolated consumer directory.
 */

import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { rolldown } from 'rolldown'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'
import { spawnSync } from '@socketsecurity/lib-stable/process/spawn/child'

import { primBuildConfig } from '../../.config/repo/rolldown.prim.config.mts'

let directory: string
let entry: string

beforeAll(async () => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'prim-consumer-'))
  const { output, ...input } = primBuildConfig
  assert(output && !Array.isArray(output) && output.file)
  assert(typeof input.input === 'string')
  entry = path.join(directory, path.basename(output.file))
  const bundle = await rolldown(input)
  try {
    await bundle.write({ ...output, file: entry })
  } finally {
    await bundle.close()
  }
  const parser = createRequire(input.input).resolve('@ultrathink/acorn.rs.wasm')
  copyFileSync(parser, path.join(directory, 'acorn-wasm.cjs'))
  copyFileSync(
    path.join(path.dirname(parser), 'acorn.wasm'),
    path.join(directory, 'acorn.wasm'),
  )
})

afterAll(() => {
  if (directory) {
    safeDeleteSync(directory)
  }
})

function runPrim(args: string[]) {
  return spawnSync(process.execPath, [entry, ...args], {
    cwd: directory,
    stdio: 'pipe',
    stdioString: true,
    timeout: 5000,
  })
}

describe('prim distribution CLI', () => {
  it('resolves bundled shared runner dependencies for machine-readable help', () => {
    const result = runPrim(['--describe', '--json'])
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      name: path.basename(entry),
    })
    expect(result.stderr).toBe('')
  })

  it('retains native JSON output without a command', () => {
    const result = runPrim(['--json'])
    expect(result.status).toBe(0)
    const report = JSON.parse(result.stdout)
    expect(report.describe).toEqual(expect.any(String))
    expect(report.help).toEqual(expect.any(String))
    expect(result.stderr).toBe('')
  })
})
