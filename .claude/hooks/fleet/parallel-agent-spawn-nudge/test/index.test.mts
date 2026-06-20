// node --test specs for the parallel-agent-spawn-nudge hook.

// prefer-async-spawn: streaming-stdio-required — test spawns child
// subprocess and pipes stdin/stdout/stderr; Node spawn returns the
// ChildProcess streaming surface the lib promise wrapper does not.
import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const here = path.dirname(fileURLToPath(import.meta.url))
const HOOK = path.join(here, '..', 'index.mts')

type Result = { code: number; stderr: string }

async function runHook(payload: Record<string, unknown>): Promise<Result> {
  const child = spawn(process.execPath, [HOOK], { stdio: 'pipe' })
  void child.catch(() => undefined)
  child.stdin!.end(JSON.stringify(payload))
  let stderr = ''
  child.process.stderr!.on('data', chunk => {
    stderr += chunk.toString('utf8')
  })
  return new Promise(resolve => {
    child.process.on('exit', code => {
      resolve({ code: code ?? 0, stderr })
    })
  })
}

test('non-Task tool passes silently', async () => {
  const r = await runHook({
    tool_name: 'Bash',
    tool_input: { command: 'echo hi' },
  })
  assert.strictEqual(r.code, 0)
  assert.strictEqual(r.stderr, '')
})

test('Task with a read-only prompt — no reminder', async () => {
  const r = await runHook({
    tool_name: 'Task',
    tool_input: {
      prompt: 'Search the repo for usages of foo and summarize them.',
    },
  })
  assert.strictEqual(r.code, 0)
  assert.strictEqual(r.stderr, '')
})

test('Task told to git commit — reminder fires, never blocks', async () => {
  const r = await runHook({
    tool_name: 'Task',
    tool_input: {
      prompt: 'Fix the lint errors in src/ and git commit the result.',
    },
  })
  assert.strictEqual(r.code, 0)
  assert.ok(r.stderr.includes('parallel-agent-spawn-nudge'))
  assert.ok(r.stderr.includes('DISJOINT'))
})

test('Task told to land it — reminder fires', async () => {
  const r = await runHook({
    tool_name: 'Task',
    tool_input: { prompt: 'Apply the patch and land it on main.' },
  })
  assert.strictEqual(r.code, 0)
  assert.ok(r.stderr.includes('parallel-agent-spawn-nudge'))
})

test('Task with no prompt field — no reminder', async () => {
  const r = await runHook({ tool_name: 'Task', tool_input: {} })
  assert.strictEqual(r.code, 0)
  assert.strictEqual(r.stderr, '')
})
