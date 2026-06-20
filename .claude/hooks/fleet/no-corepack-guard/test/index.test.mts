// node --test specs for the no-corepack-guard hook.

// Isolate git fixtures from the live repo. Must be the FIRST import —
// see no-unisolated-git-fixture-guard.
import '../../../../../.git-hooks/_shared/isolate-git-env.mts'

import test from 'node:test'
import assert from 'node:assert/strict'
// prefer-async-spawn: streaming-stdio-required — spawns the hook subprocess.
import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { detectCorepack, formatBlock } from '../index.mts'

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.mts')

function runHook(
  command: string,
  cwd?: string,
): Promise<{ code: number; stderr: string }> {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [HOOK], { stdio: ['pipe', 'ignore', 'pipe'] })
    void child.catch(() => undefined)
    let stderr = ''
    child.process.stderr!.on('data', d => {
      stderr += d.toString()
    })
    child.process.on('exit', code => resolve({ code: code ?? -1, stderr }))
    child.stdin!.end(
      JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd }),
    )
  })
}

test('detectCorepack: corepack enable', () => {
  const d = detectCorepack('corepack enable')
  assert.strictEqual(d.detected, true)
  assert.strictEqual(d.subcommand, 'enable')
})

test('detectCorepack: corepack enable pnpm', () => {
  assert.strictEqual(detectCorepack('corepack enable pnpm').detected, true)
})

test('detectCorepack: corepack prepare pnpm@9 --activate', () => {
  const d = detectCorepack('corepack prepare pnpm@9.0.0 --activate')
  assert.strictEqual(d.detected, true)
  assert.strictEqual(d.subcommand, 'prepare')
})

test('detectCorepack: corepack use pnpm@latest', () => {
  const d = detectCorepack('corepack use pnpm@latest')
  assert.strictEqual(d.detected, true)
  assert.strictEqual(d.subcommand, 'use')
})

test('detectCorepack: corepack install', () => {
  const d = detectCorepack('corepack install')
  assert.strictEqual(d.detected, true)
  assert.strictEqual(d.subcommand, 'install')
})

test('detectCorepack: corepack in a pipeline', () => {
  assert.strictEqual(
    detectCorepack('echo hi && corepack enable').detected,
    true,
  )
})

test('detectCorepack: a leading flag before the subcommand still detects', () => {
  // `corepack --cwd /x enable` — skip the flag (+ its value if glued) and
  // still find the activating subcommand. The flag-skip is conservative:
  // separated flag values may be misread as the subcommand, which only ever
  // OVER-detects corepack, never under-detects, so it fails safe.
  assert.strictEqual(
    detectCorepack('corepack enable --install-directory /x').detected,
    true,
  )
})

test('detectCorepack: corepack --version is allowed', () => {
  assert.strictEqual(detectCorepack('corepack --version').detected, false)
})

test('detectCorepack: corepack --help is allowed', () => {
  assert.strictEqual(detectCorepack('corepack --help').detected, false)
})

test('detectCorepack: corepack disable is allowed (provisions nothing)', () => {
  assert.strictEqual(detectCorepack('corepack disable').detected, false)
})

test('detectCorepack: bare corepack (no subcommand) is allowed', () => {
  assert.strictEqual(detectCorepack('corepack').detected, false)
})

test('detectCorepack: plain pnpm install is allowed', () => {
  assert.strictEqual(detectCorepack('pnpm install').detected, false)
})

test('detectCorepack: setup-tools bootstrap is allowed', () => {
  assert.strictEqual(
    detectCorepack('node scripts/fleet/setup/setup-tools.mjs').detected,
    false,
  )
})

test('detectCorepack: a tool merely NAMED like corepack is not corepack', () => {
  assert.strictEqual(
    detectCorepack('my-corepack-wrapper enable').detected,
    false,
  )
})

test('formatBlock: message names the subcommand + the SRI install path + bypass', () => {
  const msg = formatBlock({ detected: true, subcommand: 'enable' })
  assert.match(msg, /no-corepack-guard/)
  assert.match(msg, /corepack enable/)
  assert.match(msg, /setup-tools\.mjs/)
  assert.match(msg, /Allow corepack bypass/)
})

test('no-ops on corepack OUTSIDE a fleet repo', async () => {
  // Real git repo, no remote, no fleet marker → non-fleet; corepack is the
  // project's own package-manager-version choice there.
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ncp-nonfleet-'))
  try {
    await spawn('git', ['init', dir])
    const { code } = await runHook('corepack enable', dir)
    assert.equal(code, 0)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('still blocks corepack inside a fleet repo', async () => {
  // No cwd → process.cwd() is the wheelhouse (a fleet repo) → the ban applies.
  const { code } = await runHook('corepack enable')
  assert.equal(code, 2)
})
