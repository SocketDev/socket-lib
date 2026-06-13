// vitest specs for check-ai-spawns-have-paired-effort.

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { test } from 'vitest'

import {
  objectSpan,
  scanBackendArgv,
  scanFile,
  scanSpawnCalls,
} from '../../../scripts/fleet/check/ai-spawns-have-paired-effort.mts'

// ── objectSpan ──────────────────────────────────────────────────

test('objectSpan returns the balanced-brace span', () => {
  const text = 'foo({ a: 1, b: { c: 2 } })'
  const start = text.indexOf('{')
  assert.equal(objectSpan(text, start), '{ a: 1, b: { c: 2 } }')
})

test('objectSpan returns empty on an unbalanced/truncated literal', () => {
  const text = 'foo({ a: 1, b: { c: 2 }'
  assert.equal(objectSpan(text, text.indexOf('{')), '')
})

// ── scanSpawnCalls ──────────────────────────────────────────────

test('scanSpawnCalls flags a spawn with model but no effort', () => {
  const src = `await spawnAiAgent({
    ...AI_PROFILE.edit,
    cwd,
    model,
    prompt,
  })`
  const hits = scanSpawnCalls(src)
  assert.equal(hits.length, 1)
  assert.match(hits[0]!.detail, /sets `model` but not `effort`/)
})

test('scanSpawnCalls passes a spawn that pairs model and effort', () => {
  const src = `await spawnAiAgent({
    ...AI_PROFILE.edit,
    cwd,
    effort,
    model,
    prompt,
  })`
  assert.equal(scanSpawnCalls(src).length, 0)
})

test('scanSpawnCalls ignores a spawn with neither model nor effort', () => {
  // No model pinned → caller's choice → nothing to pair.
  const src = `await spawnAiAgent({ ...AI_PROFILE.read, cwd, prompt })`
  assert.equal(scanSpawnCalls(src).length, 0)
})

test('scanSpawnCalls matches model given as an explicit key:value', () => {
  const src = `spawnAiAgent({ cwd, model: 'claude-haiku-4-5', prompt })`
  assert.equal(scanSpawnCalls(src).length, 1)
})

test('scanSpawnCalls reports one hit per offending call', () => {
  const src = `
    spawnAiAgent({ cwd, model, prompt })
    spawnAiAgent({ cwd, effort, model, prompt })
    spawnAiAgent({ cwd, model: 'x', prompt })
  `
  assert.equal(scanSpawnCalls(src).length, 2)
})

// ── scanBackendArgv ─────────────────────────────────────────────

test('scanBackendArgv flags a claude runner pushing --model without --effort', () => {
  const src = `
    const BACKENDS = { claude: { run() {
      return { argv: ['--print', '--model', model, '--no-session-persistence'] }
    } } }
  `
  const hits = scanBackendArgv(src)
  assert.equal(hits.length, 1)
  assert.match(hits[0]!.detail, /paired effort flag/)
})

test('scanBackendArgv passes a claude runner that pairs --effort', () => {
  const src = `
    const BACKENDS = { claude: { run() {
      return { argv: ['--print', '--model', model, '--effort', effort] }
    } } }
  `
  assert.equal(scanBackendArgv(src).length, 0)
})

test('scanBackendArgv passes a codex runner pairing model_reasoning_effort', () => {
  const src = `
    const BACKENDS = { codex: { bin: 'codex', run() {
      const model = process.env['CODEX_MODEL'] ?? 'gpt-5.5'
      const reasoning = process.env['CODEX_REASONING'] ?? 'xhigh'
      return { argv: ['exec', '--model', model, '-c', \`model_reasoning_effort=\${reasoning}\`] }
    } } }
  `
  assert.equal(scanBackendArgv(src).length, 0)
})

test('scanBackendArgv exempts a file with no claude/codex reference', () => {
  // A gemini/opencode-only runner has no effort flag and must not be flagged.
  const src = `
    const run = () => ({ argv: ['--print', '--model', model, '--workspace', cwd] })
  `
  assert.equal(scanBackendArgv(src).length, 0)
})

test('scanBackendArgv does NOT flag a kimi block sitting in a file that also has claude/codex', () => {
  // Regression: a kimi/gemini/opencode backend's --model push must not be
  // flagged just because a claude or codex backend lives in the same file.
  // kimi has no effort flag, so its push is legitimately effort-free.
  const src = `
    const BACKENDS = {
      claude: { bin: 'claude', run() {
        const model = process.env['CLAUDE_MODEL'] ?? 'opus'
        const effort = process.env['CLAUDE_EFFORT'] ?? 'high'
        return { argv: ['--print', '--model', model, '--effort', effort] }
      } },
      kimi: { bin: 'kimi', run() {
        const model = process.env['KIMI_MODEL'] ?? 'kimi-latest'
        return { argv: ['chat', '--model', model, '--no-stream'] }
      } },
    }
  `
  assert.equal(scanBackendArgv(src).length, 0)
})

// ── scanFile (fixture repo) ─────────────────────────────────────

function makeRepo(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'effort-pair-test-'))
}

function write(repo: string, rel: string, body: string): void {
  const abs = path.join(repo, rel)
  mkdirSync(path.dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

test('scanFile reports file + line for an offending spawn', () => {
  const repo = makeRepo()
  const rel = 'scripts/x.mts'
  write(repo, rel, `// line 1\nspawnAiAgent({ cwd, model, prompt })\n`)
  const out = scanFile(repo, rel)
  assert.equal(out.length, 1)
  assert.equal(out[0]!.file, rel)
  assert.equal(out[0]!.line, 2)
})

test('scanFile is clean for a paired spawn', () => {
  const repo = makeRepo()
  const rel = 'scripts/x.mts'
  write(repo, rel, `spawnAiAgent({ cwd, effort, model, prompt })\n`)
  assert.equal(scanFile(repo, rel).length, 0)
})

test('scanFile tolerates a missing file', () => {
  const repo = makeRepo()
  assert.equal(scanFile(repo, 'scripts/gone.mts').length, 0)
})
