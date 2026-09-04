/**
 * @file Tests for the half of `disambiguateReceiver` that talks to the agent
 *   SDK. The SDK is an optional peer loaded through a dynamic import, so
 *   the whole path — prompt build, message drain, verdict parse, cache write —
 *   only runs when that import resolves to something usable. Mocking the
 *   specifier is what makes it reachable at all; the sibling
 *   `disambiguate.test.mts` covers the short-circuits that return before the
 *   import happens.
 */

import { mkdtempSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { disambiguateReceiver, loadSdk } from '../src/disambiguate.mts'

// One block of a mocked assistant message. Only `text` blocks contribute to
// the answer the parser reads.
interface MockBlock {
  text?: string | undefined
  type: string
}

// A message the mocked `query()` yields. `message` is optional so a test can
// exercise the `message.message?.content ?? []` fallback.
interface MockMessage {
  message?: { content?: MockBlock[] | undefined } | undefined
  type: string
}

// Swapped per test, then read by the module mock's `query`. A plain `let` on
// the factory's return would be frozen at first import; going through this
// indirection lets each test install its own behavior.
let queryImpl: (arg: unknown) => AsyncIterable<MockMessage>

// The argument the module under test passed to `query()`, kept so a test can
// assert on the locked-down options without re-reading the source.
let lastQueryArg: unknown

vi.mock(import('@anthropic-ai/claude-agent-sdk'), () => ({
  query: (arg: unknown) => {
    lastQueryArg = arg
    return queryImpl(arg)
  },
}))

// Yield a fixed list of messages, one at a time.
function messageStream(messages: MockMessage[]): AsyncIterable<MockMessage> {
  return {
    async *[Symbol.asyncIterator]() {
      for (let i = 0, { length } = messages; i < length; i += 1) {
        yield messages[i]!
      }
    },
  }
}

// A single assistant text block followed by the terminating result message.
function verdictStream(text: string): AsyncIterable<MockMessage> {
  return messageStream([
    { type: 'assistant', message: { content: [{ type: 'text', text }] } },
    { type: 'result' },
  ])
}

const SNIPPET = `import { Range } from 'semver'
const range = new Range('^1.0.0')
if (range.test(version)) {
  doSomething()
}
`

// Every field `disambiguateReceiver` needs for the `test` method, which the
// ambiguous-methods table maps to the single candidate `RegExp`.
function callOptions(targetRoot: string) {
  return {
    aiEnabled: true,
    column: 5,
    filePath: 'example.mts',
    line: 3,
    methodName: 'test',
    receiverName: 'range',
    snippet: SNIPPET,
    targetRoot,
  }
}

function readCache(targetRoot: string): {
  entries: Record<string, { reason: string; type: string | undefined }>
  schema: number
} {
  const cacheFile = path.join(targetRoot, '.prim-cache', 'disambiguate.json')
  return JSON.parse(readFileSync(cacheFile, 'utf8'))
}

let targetRoot = ''
let previousApiKey: string | undefined

beforeEach(() => {
  targetRoot = mkdtempSync(path.join(os.tmpdir(), 'prim-disambiguate-sdk-'))
  previousApiKey = process.env['ANTHROPIC_API_KEY']
  process.env['ANTHROPIC_API_KEY'] = 'sk-not-a-real-key-placeholder'
  lastQueryArg = undefined
  queryImpl = () => verdictStream('VERDICT: RegExp\nREASON: it is a literal.')
})

afterEach(() => {
  if (previousApiKey === undefined) {
    delete process.env['ANTHROPIC_API_KEY']
  } else {
    process.env['ANTHROPIC_API_KEY'] = previousApiKey
  }
  safeDeleteSync(targetRoot)
})

describe('disambiguateReceiver with the SDK loaded', () => {
  it('asks the model on a cache miss and reports an ai verdict', async () => {
    const verdict = await disambiguateReceiver(callOptions(targetRoot))

    expect(verdict).toEqual({
      reason: 'it is a literal.',
      source: 'ai',
      type: 'RegExp',
    })
  })

  it('persists the fresh verdict so the next run is free', async () => {
    await disambiguateReceiver(callOptions(targetRoot))

    const cache = readCache(targetRoot)
    const entries = Object.values(cache.entries)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      reason: 'it is a literal.',
      type: 'RegExp',
    })
  })

  it('caches an undecided verdict too, so it is not re-asked', async () => {
    queryImpl = () =>
      verdictStream('VERDICT: Other\nREASON: range comes from semver.')

    const verdict = await disambiguateReceiver(callOptions(targetRoot))

    expect(verdict.type).toBeUndefined()
    expect(verdict.source).toBe('ai')
    const entries = Object.values(readCache(targetRoot).entries)
    expect(entries[0]?.type).toBeUndefined()
  })

  it('locks the tool surface down on every call', () => {
    return disambiguateReceiver(callOptions(targetRoot)).then(() => {
      const arg = lastQueryArg as {
        options: {
          allowedTools: string[]
          cwd: string
          disallowedTools: string[]
          permissionMode: string
          tools: string[]
        }
        prompt: string
      }
      expect(arg.options.tools).toEqual(['Read', 'Grep', 'Glob'])
      expect(arg.options.allowedTools).toEqual(['Read', 'Grep', 'Glob'])
      expect(arg.options.disallowedTools).toContain('Bash')
      expect(arg.options.permissionMode).toBe('dontAsk')
      expect(arg.options.cwd).toBe(targetRoot)
      expect(arg.prompt).toContain('range')
    })
  })

  it('skips messages that carry no assistant text', async () => {
    queryImpl = () =>
      messageStream([
        // No `message` at all — the `?? []` fallback.
        { type: 'assistant' },
        // A block the drain must ignore because it is not text.
        {
          type: 'assistant',
          message: { content: [{ type: 'thinking' }] },
        },
        // Neither assistant nor result: falls through both arms.
        { type: 'system' },
        {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'VERDICT: RegExp\nREASON: ok.' }],
          },
        },
        { type: 'result' },
      ])

    const verdict = await disambiguateReceiver(callOptions(targetRoot))

    expect(verdict.type).toBe('RegExp')
    expect(verdict.source).toBe('ai')
  })

  it('stops draining at the result message', async () => {
    queryImpl = () =>
      messageStream([
        {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'VERDICT: RegExp\nREASON: ok.' }],
          },
        },
        { type: 'result' },
        {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'VERDICT: Other\nREASON: late.' }],
          },
        },
      ])

    const verdict = await disambiguateReceiver(callOptions(targetRoot))

    expect(verdict.type).toBe('RegExp')
  })

  it('falls back to static when the model call throws', async () => {
    queryImpl = () => {
      throw new Error('socket hang up')
    }

    const verdict = await disambiguateReceiver(callOptions(targetRoot))

    expect(verdict.type).toBeUndefined()
    expect(verdict.source).toBe('static')
    expect(verdict.reason).toContain('sdk-call-failed')
    expect(verdict.reason).toContain('socket hang up')
  })

  it('falls back to static when the stream throws mid-drain', async () => {
    queryImpl = () => ({
      async *[Symbol.asyncIterator]() {
        yield { type: 'assistant', message: { content: [] } }
        throw new Error('stream aborted')
      },
    })

    const verdict = await disambiguateReceiver(callOptions(targetRoot))

    expect(verdict.source).toBe('static')
    expect(verdict.reason).toContain('sdk-call-failed')
  })
})

describe('loadSdk', () => {
  it('returns the query function when the peer exports one', async () => {
    const query = await loadSdk()

    expect(typeof query).toBe('function')
  })
})
