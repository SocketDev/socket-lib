import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { spawnSync } from '@socketsecurity/lib-stable/process/spawn/child'

import { bundleIsStale, isBundledSource } from '../index.mts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const HOOK_PATH = path.join(__dirname, '..', 'index.mts')

interface RunResult {
  readonly stderr: string
  readonly exitCode: number
}

function runHook(payload: Record<string, unknown>): RunResult {
  const result = spawnSync('node', [HOOK_PATH], {
    input: JSON.stringify(payload),
    env: { ...process.env },
    encoding: 'utf8',
  })
  return {
    exitCode: result.status ?? -1,
    stderr: String(result.stderr ?? ''),
  }
}

test('isBundledSource matches dispatcher / dispatch-table / _shared / hook index', () => {
  assert.equal(
    isBundledSource('repo/.claude/hooks/fleet/_dispatch/dispatch.mts'),
    true,
  )
  assert.equal(
    isBundledSource('repo/.claude/hooks/fleet/_dispatch/dispatch-table.mts'),
    true,
  )
  assert.equal(
    isBundledSource('repo/.claude/hooks/fleet/_shared/transcript.mts'),
    true,
  )
  assert.equal(
    isBundledSource('repo/.claude/hooks/fleet/no-tsx-guard/index.mts'),
    true,
  )
})

test('isBundledSource rejects the built bundle + unrelated paths', () => {
  assert.equal(
    isBundledSource('repo/.claude/hooks/fleet/_dispatch/bundle.cjs'),
    false,
  )
  assert.equal(
    isBundledSource('repo/.claude/hooks/fleet/_dispatch/index.cjs'),
    false,
  )
  assert.equal(isBundledSource('repo/src/foo.mts'), false)
  assert.equal(isBundledSource('repo/README.md'), false)
})

test('bundleIsStale: missing bundle counts as stale', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bundle-stale-'))
  try {
    const src = path.join(dir, 'src.mts')
    writeFileSync(src, 'x')
    assert.equal(bundleIsStale(dir, src), true)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('bundleIsStale: source newer than bundle is stale; older is fresh', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bundle-stale-'))
  try {
    const bundleDir = path.join(dir, '.claude', 'hooks', 'fleet', '_dispatch')
    mkdirSync(bundleDir, { recursive: true })
    const bundle = path.join(bundleDir, 'bundle.cjs')
    const src = path.join(dir, 'src.mts')
    writeFileSync(bundle, 'b')
    writeFileSync(src, 's')
    const past = new Date(Date.now() - 60_000)
    utimesSync(bundle, past, past)
    assert.equal(bundleIsStale(dir, src), true)
    const future = new Date(Date.now() + 60_000)
    utimesSync(bundle, future, future)
    assert.equal(bundleIsStale(dir, src), false)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('hook ALLOWS (exit 0, no reminder) for non-Edit/Write tools', () => {
  const { exitCode, stderr } = runHook({
    hook_event_name: 'PostToolUse',
    tool_input: { command: 'ls' },
    tool_name: 'Bash',
  })
  assert.equal(exitCode, 0)
  assert.equal(stderr.includes('bundle-stale-reminder'), false)
})

test('hook ALLOWS (exit 0, no reminder) for an unrelated file edit', () => {
  const { exitCode, stderr } = runHook({
    hook_event_name: 'PostToolUse',
    tool_input: { file_path: 'repo/src/unrelated.mts' },
    tool_name: 'Edit',
  })
  assert.equal(exitCode, 0)
  assert.equal(stderr.includes('bundle-stale-reminder'), false)
})
