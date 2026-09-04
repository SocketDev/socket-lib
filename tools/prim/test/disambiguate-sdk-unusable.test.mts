/**
 * @file What happens when the optional agent SDK peer resolves but is
 *   too old to export `query`. `loadSdk` turns that into a thrown error, and
 *   `disambiguateReceiver` turns the throw into a static verdict rather than
 *   letting it escape into the audit. The mock has to live in its own file
 *   because a module mock is file-scoped and the sibling SDK spec needs a
 *   working `query`.
 */

import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { disambiguateReceiver, loadSdk } from '../src/disambiguate.mts'

vi.mock(import('@anthropic-ai/claude-agent-sdk'), () => ({
  // An SDK below 0.2.0 shipped no `query` export at all.
  query: undefined,
}))

let targetRoot = ''
let previousApiKey: string | undefined

beforeEach(() => {
  targetRoot = mkdtempSync(path.join(os.tmpdir(), 'prim-disambiguate-old-'))
  previousApiKey = process.env['ANTHROPIC_API_KEY']
  process.env['ANTHROPIC_API_KEY'] = 'sk-not-a-real-key-placeholder'
})

afterEach(() => {
  if (previousApiKey === undefined) {
    delete process.env['ANTHROPIC_API_KEY']
  } else {
    process.env['ANTHROPIC_API_KEY'] = previousApiKey
  }
  safeDeleteSync(targetRoot)
})

describe('loadSdk against an SDK without query', () => {
  it('names the version the caller needs', async () => {
    await expect(loadSdk()).rejects.toThrow(/Expected SDK/)
  })
})

describe('disambiguateReceiver when the SDK will not load', () => {
  it('reports a static verdict instead of throwing', async () => {
    const verdict = await disambiguateReceiver({
      aiEnabled: true,
      column: 5,
      filePath: 'example.mts',
      line: 3,
      methodName: 'test',
      receiverName: 'range',
      snippet: 'if (range.test(version)) {}\n',
      targetRoot,
    })

    expect(verdict.type).toBeUndefined()
    expect(verdict.source).toBe('static')
    expect(verdict.reason).toContain('sdk-load-failed')
  })
})
