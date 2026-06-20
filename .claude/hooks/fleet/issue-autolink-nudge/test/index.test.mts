// node --test specs for the issue-autolink-nudge hook.

import test from 'node:test'
import assert from 'node:assert/strict'
// prefer-async-spawn: streaming-stdio-required — test spawns the hook child.
import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { findBareIssueRefs } from '../index.mts'

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.mts')

type Result = { code: number; stderr: string }

function runHook(command: string): Promise<Result> {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [HOOK], {
      stdio: ['pipe', 'ignore', 'pipe'],
    })
    void child.catch(() => undefined)
    let stderr = ''
    child.process.stderr!.on('data', d => {
      stderr += d.toString()
    })
    child.process.on('exit', code => resolve({ code: code ?? -1, stderr }))
    child.stdin!.end(
      JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    )
  })
}

test('findBareIssueRefs: flags bare #N, dedupes', () => {
  assert.deepEqual(findBareIssueRefs('fixes #3 and also #3'), ['#3'])
  assert.deepEqual(findBareIssueRefs('item #5, task #6'), ['#5', '#6'])
})

test('findBareIssueRefs: skips backticked and mid-token refs', () => {
  assert.deepEqual(findBareIssueRefs('see `#3` for context'), [])
  assert.deepEqual(findBareIssueRefs('color #fff and tag v1.2.3#4'), [])
  assert.deepEqual(findBareIssueRefs('no refs here'), [])
})

test('nudges on a bare #N in a commit message', async () => {
  const r = await runHook('git commit -m "implements item #3"')
  assert.strictEqual(r.code, 0) // advisory — never blocks
  assert.match(r.stderr, /issue-autolink-nudge/)
  assert.match(r.stderr, /#3/)
})

test('silent when the ref is already backticked', async () => {
  const r = await runHook('git commit -m "implements item `#3`"')
  assert.strictEqual(r.code, 0)
  assert.strictEqual(r.stderr, '')
})

test('silent on a non-public-surface command', async () => {
  const r = await runHook('ls -la #3')
  assert.strictEqual(r.code, 0)
  assert.strictEqual(r.stderr, '')
})

test('silent on a public surface with no bare refs', async () => {
  const r = await runHook('git commit -m "fix the parser"')
  assert.strictEqual(r.code, 0)
  assert.strictEqual(r.stderr, '')
})
