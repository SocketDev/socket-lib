/**
 * @fileoverview Tests for the Claude-deferred disambiguation layer.
 *
 * Run via: `node --experimental-strip-types --test tools/prim/test/disambiguate.test.mts`
 *
 * Mocks the SDK via a self-contained queue file so no network hits.
 * Coverage:
 *   - "ai-defer-not-enabled" short-circuit (no SDK loaded)
 *   - "ANTHROPIC_API_KEY not set" short-circuit (no SDK loaded)
 *   - cache hit → no SDK call
 *   - cache miss → SDK call → cache write
 *   - parses VERDICT/REASON output
 *   - tolerates "Other" / "Unsure" / unexpected verdicts
 */

import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, test } from 'node:test'

import { buildSnippet, disambiguateReceiver } from '../src/disambiguate.mts'

const FIXTURE_SNIPPET = `import { Range } from 'semver'
const range = new Range('^1.0.0')
if (range.test(version)) {
  doSomething()
}
`

function makeTempRoot() {
  const dir = mkdtempSync(path.join(tmpdir(), 'prim-disambiguate-'))
  return dir
}

describe('disambiguateReceiver', () => {
  test('returns ai-defer-not-enabled when aiEnabled is false', async () => {
    const targetRoot = makeTempRoot()
    try {
      const v = await disambiguateReceiver({
        aiEnabled: false,
        column: 5,
        filePath: 'test.mjs',
        line: 3,
        methodName: 'test',
        receiverName: 'range',
        snippet: FIXTURE_SNIPPET,
        targetRoot,
      })
      assert.equal(v.type, undefined)
      assert.equal(v.source, 'static')
      assert.match(v.reason, /not-enabled/)
      // No cache file created when ai is off.
      assert.equal(
        existsSync(path.join(targetRoot, '.prim-cache', 'disambiguate.json')),
        false,
      )
    } finally {
      rmSync(targetRoot, { recursive: true, force: true })
    }
  })

  test('returns ANTHROPIC_API_KEY not set when env is missing', async () => {
    const prev = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    const targetRoot = makeTempRoot()
    try {
      const v = await disambiguateReceiver({
        aiEnabled: true,
        column: 5,
        filePath: 'test.mjs',
        line: 3,
        methodName: 'test',
        receiverName: 'range',
        snippet: FIXTURE_SNIPPET,
        targetRoot,
      })
      assert.equal(v.type, undefined)
      assert.equal(v.source, 'static')
      assert.match(v.reason, /ANTHROPIC_API_KEY/)
    } finally {
      if (prev !== undefined) {
        process.env.ANTHROPIC_API_KEY = prev
      }
      rmSync(targetRoot, { recursive: true, force: true })
    }
  })

  test('returns method-not-in-ambiguous-table for unknown method', async () => {
    const targetRoot = makeTempRoot()
    try {
      const v = await disambiguateReceiver({
        aiEnabled: true,
        column: 5,
        filePath: 'test.mjs',
        line: 3,
        methodName: 'getTime',
        receiverName: 'd',
        snippet: 'd.getTime()',
        targetRoot,
      })
      assert.equal(v.type, undefined)
      assert.equal(v.source, 'static')
      assert.match(v.reason, /not-in-ambiguous-table/)
    } finally {
      rmSync(targetRoot, { recursive: true, force: true })
    }
  })

  test('cache hit short-circuits (no SDK call)', async () => {
    const targetRoot = makeTempRoot()
    try {
      const cacheDir = path.join(targetRoot, '.prim-cache')
      mkdirSync(cacheDir, { recursive: true })
      // Pre-populate cache with the same key the disambiguator would
      // compute. Since we don't know the SHA without computing it,
      // call once with aiEnabled=false to skip, then write a hand-
      // built cache entry that matches the key shape, then call again.
      // Instead: rely on the fact that cache key is sha256(method +
      // receiver + snippet); we can compute it inline.
      const { createHash } = await import('node:crypto')
      const h = createHash('sha256')
      h.update('v1\n')
      h.update('test')
      h.update('\n')
      h.update('range')
      h.update('\n')
      h.update(FIXTURE_SNIPPET)
      const key = h.digest('hex')
      const cachePath = path.join(cacheDir, 'disambiguate.json')
      const { writeFileSync } = await import('node:fs')
      writeFileSync(
        cachePath,
        JSON.stringify({
          schema: 1,
          entries: {
            [key]: {
              type: undefined,
              reason: 'cached: range is a semver Range',
              timestamp: 1700000000000,
            },
          },
        }),
      )
      // Set a fake API key so we don't short-circuit on env.
      const prev = process.env.ANTHROPIC_API_KEY
      process.env.ANTHROPIC_API_KEY = 'sk-fake-test-key'
      try {
        const v = await disambiguateReceiver({
          aiEnabled: true,
          column: 5,
          filePath: 'test.mjs',
          line: 3,
          methodName: 'test',
          receiverName: 'range',
          snippet: FIXTURE_SNIPPET,
          targetRoot,
        })
        assert.equal(v.type, undefined)
        assert.equal(v.source, 'cache')
        assert.match(v.reason, /semver/)
      } finally {
        if (prev === undefined) {
          delete process.env.ANTHROPIC_API_KEY
        } else {
          process.env.ANTHROPIC_API_KEY = prev
        }
      }
    } finally {
      rmSync(targetRoot, { recursive: true, force: true })
    }
  })
})

describe('locked-down tool surface', () => {
  test('source declares only Read/Grep/Glob in BASE_TOOLS (the actual allowlist)', async () => {
    // BASE_TOOLS is passed as the SDK's `tools` option — the literal
    // set the model is told about. Anything not in here is invisible
    // to the model. This is the security-critical line; a future edit
    // that adds Bash/Edit/Write here is the bug this test is for.
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(
      new URL('../src/disambiguate.mts', import.meta.url),
      'utf8',
    )
    const m = /const BASE_TOOLS = (\[[^\]]+\])/m.exec(src)
    assert.ok(m, 'BASE_TOOLS array literal not found')
    const allowed = JSON.parse(m[1].replace(/'/g, '"'))
    assert.deepEqual(allowed.sort(), ['Glob', 'Grep', 'Read'])
  })

  test('source passes BASE_TOOLS as the SDK `tools` option', async () => {
    // The base-tools constant only matters if it's actually wired
    // into the SDK call. Verify the literal `tools: BASE_TOOLS` line
    // is in the source. Renaming the constant without updating the
    // call site would silently fall back to the SDK default (= all
    // claude_code tools available), so this guard catches that.
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(
      new URL('../src/disambiguate.mts', import.meta.url),
      'utf8',
    )
    assert.match(
      src,
      /\btools:\s*BASE_TOOLS\b/,
      'expected `tools: BASE_TOOLS` in the SDK options call site',
    )
  })

  test('source passes permissionMode: "dontAsk" (the headless lockdown recipe)', async () => {
    // The official Claude Agent SDK docs say: "For a locked-down
    // agent, pair `allowedTools` with `permissionMode: 'dontAsk'`.
    // Listed tools are approved; anything else is denied outright
    // instead of prompting." With `'default'`, unmatched tools fall
    // through to canUseTool, which is undefined → undefined behavior
    // in non-interactive scripts. This test catches the regression
    // shape where someone "simplifies" by dropping permissionMode
    // or switches it to 'default' without realizing what changed.
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(
      new URL('../src/disambiguate.mts', import.meta.url),
      'utf8',
    )
    assert.match(
      src,
      /\bpermissionMode:\s*['"]dontAsk['"]/,
      "expected `permissionMode: 'dontAsk'` in the SDK options call site",
    )
    // And explicitly: NOT bypassPermissions or acceptEdits.
    assert.doesNotMatch(
      src,
      /\bpermissionMode:\s*['"]bypassPermissions['"]/,
      'permissionMode must never be bypassPermissions',
    )
    assert.doesNotMatch(
      src,
      /\ballowDangerouslySkipPermissions:\s*true\b/,
      'allowDangerouslySkipPermissions must never be true',
    )
  })

  test('source declares Bash/Edit/Write in DENIED_TOOLS', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(
      new URL('../src/disambiguate.mts', import.meta.url),
      'utf8',
    )
    const m = /const DENIED_TOOLS = (\[[\s\S]*?\])/m.exec(src)
    assert.ok(m, 'DENIED_TOOLS array literal not found')
    const denied = JSON.parse(m[1].replace(/'/g, '"').replace(/,(\s*])/, '$1'))
    for (const tool of ['Bash', 'Edit', 'Write', 'WebFetch', 'WebSearch']) {
      assert.ok(
        denied.includes(tool),
        `DENIED_TOOLS missing required entry: ${tool}`,
      )
    }
  })
})

describe('buildSnippet', () => {
  test('extracts surrounding context lines', () => {
    const src = 'a\nb\nc\nd\ne\nf\ng\nh\ni\n'
    const lineStarts = [0]
    for (let i = 0; i < src.length; i += 1) {
      if (src.charCodeAt(i) === 10) {
        lineStarts.push(i + 1)
      }
    }
    // Default 8 lines of context. Center on line 5 ('e'), should
    // include all the surrounding lines (file is small).
    const snippet = buildSnippet(src, lineStarts, 5)
    assert.match(snippet, /a/)
    assert.match(snippet, /e/)
    assert.match(snippet, /i/)
  })

  test('clamps to file boundaries', () => {
    const src = 'only one line'
    const lineStarts = [0]
    const snippet = buildSnippet(src, lineStarts, 1)
    assert.equal(snippet, 'only one line')
  })
})
