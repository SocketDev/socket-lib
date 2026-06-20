// node --test specs for the module-noun-name-guard hook.

// Isolate git fixtures from the live repo. Must be the FIRST import —
// see no-unisolated-git-fixture-guard.
import '../../../../../.git-hooks/_shared/isolate-git-env.mts'

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
// prefer-async-spawn: streaming-stdio-required — test spawns child
// subprocess and pipes stdin/stdout/stderr; Node spawn returns the
// ChildProcess streaming surface the lib promise wrapper does not.
import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const HOOK = path.join(here, '..', 'index.mts')

// Synthetic non-existent repo root: git rev-parse fails → isFleetTarget
// fail-SAFE returns true, so convention checks fire (matches a real fleet
// repo's behavior) without touching the live checkout.
const ROOT = '/srv/foo'

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

function write(toolName: string, filePath: string): Promise<Result> {
  return runHook({
    tool_input: { content: 'export const x = 1', file_path: filePath },
    tool_name: toolName,
  })
}

test('non-Edit/Write tool calls pass through', async () => {
  const result = await runHook({
    tool_input: { command: 'ls' },
    tool_name: 'Bash',
  })
  assert.strictEqual(result.code, 0)
})

test('verb-phrase src module is blocked', async () => {
  const result = await write(
    'Write',
    `${ROOT}/src/packages/trim-publish-manifest.ts`,
  )
  assert.strictEqual(result.code, 2)
  assert.match(result.stderr, /module-noun-name-guard/)
  assert.match(result.stderr, /verb-phrase/)
})

test('create-release.ts is blocked', async () => {
  const result = await write('Write', `${ROOT}/src/release/create-release.ts`)
  assert.strictEqual(result.code, 2)
})

test('fetch-packument.mts is blocked', async () => {
  const result = await write('Write', `${ROOT}/src/packages/fetch-packument.mts`)
  assert.strictEqual(result.code, 2)
})

test('single-word noun module passes (manifest.ts)', async () => {
  const result = await write('Write', `${ROOT}/src/packages/manifest.ts`)
  assert.strictEqual(result.code, 0)
})

test('single-word verb module passes (normalize.ts)', async () => {
  const result = await write('Write', `${ROOT}/src/normalize.ts`)
  assert.strictEqual(result.code, 0)
})

test('noun-phrase module passes (package-json.ts)', async () => {
  const result = await write('Write', `${ROOT}/src/packages/package-json.ts`)
  assert.strictEqual(result.code, 0)
})

test('predicate prefix passes (is-number.ts)', async () => {
  const result = await write('Write', `${ROOT}/src/predicates/is-number.ts`)
  assert.strictEqual(result.code, 0)
})

test('exempt stem passes (types.ts)', async () => {
  const result = await write('Write', `${ROOT}/src/packages/types.ts`)
  assert.strictEqual(result.code, 0)
})

test('declaration files pass (.d.ts)', async () => {
  const result = await write('Write', `${ROOT}/src/get-thing.d.ts`)
  assert.strictEqual(result.code, 0)
})

test('verb-phrase outside src/ passes (scripts/)', async () => {
  const result = await write('Write', `${ROOT}/scripts/trim-publish-manifest.ts`)
  assert.strictEqual(result.code, 0)
})

test('verb-phrase test file passes (src/.../*.test.mts)', async () => {
  const result = await write('Write', `${ROOT}/src/packages/trim-manifest.test.mts`)
  assert.strictEqual(result.code, 0)
})

test('verb-phrase under a test/ dir passes', async () => {
  const result = await write('Write', `${ROOT}/test/unit/trim-publish-manifest.mts`)
  assert.strictEqual(result.code, 0)
})

test('editing an already-existing verb-phrase module passes', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'module-noun-'))
  try {
    const srcDir = path.join(dir, 'src', 'packages')
    mkdirSync(srcDir, { recursive: true })
    const file = path.join(srcDir, 'trim-publish-manifest.ts')
    writeFileSync(file, 'export const x = 1')
    const result = await runHook({
      tool_input: { file_path: file, new_string: 'export const x = 2' },
      tool_name: 'Edit',
    })
    assert.strictEqual(result.code, 0)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('bypass phrase in transcript allows the write', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'module-noun-tx-'))
  try {
    const transcript = path.join(dir, 'transcript.jsonl')
    writeFileSync(
      transcript,
      JSON.stringify({
        message: {
          content: [{ text: 'Allow module-noun-name bypass', type: 'text' }],
          role: 'user',
        },
        type: 'user',
      }) + '\n',
    )
    const result = await runHook({
      tool_input: {
        content: 'export const x = 1',
        file_path: `${ROOT}/src/packages/trim-publish-manifest.ts`,
      },
      tool_name: 'Write',
      transcript_path: transcript,
    })
    assert.strictEqual(result.code, 0)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})
