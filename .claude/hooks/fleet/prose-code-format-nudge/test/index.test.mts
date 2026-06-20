// node --test specs for the prose-code-format-nudge hook.

import test from 'node:test'
import assert from 'node:assert/strict'
// prefer-async-spawn: streaming-stdio-required — test spawns the hook child
// and pipes stdin/stdout/stderr; Node spawn returns the streaming surface.
import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const HOOK = path.join(here, '..', 'index.mts')

type Result = { code: number; stderr: string }

async function runHook(file_path: string): Promise<Result> {
  const child = spawn(process.execPath, [HOOK], { stdio: 'pipe' })
  void child.catch(() => undefined)
  child.stdin!.end(
    JSON.stringify({ tool_name: 'Write', tool_input: { file_path } }),
  )
  let stderr = ''
  child.process.stderr!.on('data', chunk => {
    stderr += chunk.toString('utf8')
  })
  return new Promise(resolve => {
    child.process.on('exit', code => resolve({ code: code ?? 0, stderr }))
  })
}

test('nudges on a bare known name in a markdown doc', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'prose-nudge-'))
  try {
    const md = path.join(dir, 'doc.md')
    writeFileSync(md, 'The proxy uses rustls under the hood.\n')
    const r = await runHook(md)
    assert.strictEqual(r.code, 0) // advisory — never blocks
    assert.match(r.stderr, /prose-code-format-nudge/)
    assert.match(r.stderr, /rustls/)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('silent when the name is already backticked', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'prose-nudge2-'))
  try {
    const md = path.join(dir, 'doc.md')
    writeFileSync(md, 'The proxy uses `rustls` under the hood.\n')
    const r = await runHook(md)
    assert.strictEqual(r.code, 0)
    assert.strictEqual(r.stderr, '')
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('ignores non-markdown files', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'prose-nudge3-'))
  try {
    const src = path.join(dir, 'code.ts')
    writeFileSync(src, 'const x = "rustls"\n')
    const r = await runHook(src)
    assert.strictEqual(r.code, 0)
    assert.strictEqual(r.stderr, '')
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})
