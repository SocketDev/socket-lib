/**
 * @file node --test specs for the prefer-evergreen-target-nudge hook. Stop hook
 *   that scans the last assistant turn for a conservative `ES<year>`
 *   `target`/`lib` (below the year floor) inside a tsconfig-shaped block and
 *   nudges toward `ESNext`. It is a REMINDER: it always exits 0 and signals a
 *   finding by writing a stderr nudge; a clean / out-of-scope / bypassed turn
 *   produces no stderr.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
// prefer-async-spawn: streaming-stdio-required — test spawns the hook
// subprocess and pipes stdin/stdout/stderr; Node spawn returns the
// ChildProcess streaming surface the lib promise wrapper does not.
import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const HOOK = path.join(here, '..', 'index.mts')

const NUDGE = /\[prefer-evergreen-target-nudge]/

type Result = { code: number; stderr: string }

function makeTranscript(...turns: Array<Record<string, unknown>>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'evergreen-nudge-'))
  const file = path.join(dir, 'session.jsonl')
  writeFileSync(file, turns.map(turn => JSON.stringify(turn)).join('\n'))
  return file
}

function assistantTurn(text: string): Record<string, unknown> {
  return { role: 'assistant', content: text }
}

function userTurn(text: string): Record<string, unknown> {
  return { role: 'user', content: text }
}

function jsonFence(body: string): string {
  return '```json\n' + body + '\n```'
}

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

test('FIRES: conservative tsconfig "target" in a json fence', async () => {
  const transcript = makeTranscript(
    assistantTurn(jsonFence('{ "compilerOptions": { "target": "ES2017" } }')),
  )
  const result = await runHook({ transcript_path: transcript })
  assert.strictEqual(result.code, 0)
  assert.match(result.stderr, NUDGE)
  assert.match(result.stderr, /ES2017/)
})

test('FIRES: conservative "lib" entry in a tsconfig fence', async () => {
  const transcript = makeTranscript(
    assistantTurn(jsonFence('{ "compilerOptions": { "lib": ["ES2021"] } }')),
  )
  const result = await runHook({ transcript_path: transcript })
  assert.strictEqual(result.code, 0)
  assert.match(result.stderr, NUDGE)
})

test('DOES NOT FIRE: ESNext target', async () => {
  const transcript = makeTranscript(
    assistantTurn(jsonFence('{ "compilerOptions": { "target": "ESNext" } }')),
  )
  const result = await runHook({ transcript_path: transcript })
  assert.strictEqual(result.code, 0)
  assert.doesNotMatch(result.stderr, NUDGE)
})

test('DOES NOT FIRE: target at/above the year floor', async () => {
  const transcript = makeTranscript(
    assistantTurn(jsonFence('{ "compilerOptions": { "target": "ES2024" } }')),
  )
  const result = await runHook({ transcript_path: transcript })
  assert.strictEqual(result.code, 0)
  assert.doesNotMatch(result.stderr, NUDGE)
})

test('DOES NOT FIRE: prose mentioning an ES year with no tsconfig signal', async () => {
  const transcript = makeTranscript(
    assistantTurn('ES2020 introduced optional chaining and nullish coalescing.'),
  )
  const result = await runHook({ transcript_path: transcript })
  assert.strictEqual(result.code, 0)
  assert.doesNotMatch(result.stderr, NUDGE)
})

test('DOES NOT FIRE: bypass phrase in a recent user turn', async () => {
  const transcript = makeTranscript(
    userTurn('Allow evergreen-target bypass'),
    assistantTurn(jsonFence('{ "compilerOptions": { "target": "ES2017" } }')),
  )
  const result = await runHook({ transcript_path: transcript })
  assert.strictEqual(result.code, 0)
  assert.doesNotMatch(result.stderr, NUDGE)
})
