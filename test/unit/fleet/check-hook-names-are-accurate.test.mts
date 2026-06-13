// vitest specs for check-hook-names-are-accurate — the pure block-idiom
// detector (sourceBlocks / dropCommentLines), which decides whether a `-guard`
// or `-reminder` hook's name matches its real blocking behavior.

import { describe, test } from 'vitest'
import assert from 'node:assert/strict'

import {
  dropCommentLines,
  sourceBlocks,
} from '../../../scripts/fleet/check/hook-names-are-accurate.mts'

describe('dropCommentLines', () => {
  test('removes whole-line // comments and * JSDoc continuations', () => {
    const src = [
      '// it BLOCKS the edit by setting process.exitCode = 2',
      ' * decision: block the commit',
      'const x = 1',
    ].join('\n')
    const out = dropCommentLines(src)
    assert.ok(!out.includes('BLOCKS'))
    assert.ok(!out.includes('decision'))
    assert.ok(out.includes('const x = 1'))
  })
})

describe('sourceBlocks — detects the 4 block idioms on CODE lines', () => {
  test('process.exitCode = 2 (the canonical with*Guard form)', () => {
    assert.ok(
      sourceBlocks('await withEditGuard(() => {\n  process.exitCode = 2\n})'),
    )
  })

  test('process.exit(2) / process.exit(1)', () => {
    assert.ok(sourceBlocks('if (bad) process.exit(2)'))
    assert.ok(sourceBlocks('process.exit(1)'))
  })

  test('return 2 (main returning a non-zero code)', () => {
    assert.ok(sourceBlocks('function main() {\n  return 2\n}'))
  })

  test("decision: 'block' stdout JSON", () => {
    assert.ok(
      sourceBlocks(
        `process.stdout.write(JSON.stringify({ decision: 'block', reason }))`,
      ),
    )
  })
})

describe('sourceBlocks — does NOT false-match prose / variables (the bug v1 had)', () => {
  test('the words block/decision/exit in COMMENTS do not count', () => {
    const reminderSrc = [
      '// This hook BLOCKS nothing — reporting only.',
      '// Per CLAUDE.md the decision is informational; never process.exit(2).',
      "logger.error('left a breadcrumb')",
    ].join('\n')
    assert.ok(!sourceBlocks(reminderSrc))
  })

  test('a `const blocks = []` variable is not a block decision', () => {
    assert.ok(!sourceBlocks('const blocks = []\nblocks.push(x)\nreturn blocks'))
  })

  test('a regex literal mentioning the words does not false-match', () => {
    // v1 mis-lexed regex literals and corrupted the scan; v2 drops comment
    // lines only and matches specific code shapes, so this stays clean.
    assert.ok(
      !sourceBlocks('const RE = /blocks|decision|exits/i\nreturn RE.test(s)'),
    )
  })

  test('a plain reminder (stderr write, no exit) does not block', () => {
    assert.ok(
      !sourceBlocks('await withBashGuard(() => {\n  logger.error("nudge")\n})'),
    )
  })
})
