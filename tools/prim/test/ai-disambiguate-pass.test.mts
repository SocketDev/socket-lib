/**
 * @file Unit tests for the AI-deferred drain pass. This is the one place where
 *   a model's answer turns into an edit on disk, so the tests care about what
 *   it refuses to do: no rewrite without a verdict, no rewrite for a primordial
 *   the surface does not export, and no rewrite when the call's closing paren
 *   cannot be found. The disambiguator itself is mocked - the pass under test
 *   is the plumbing around the verdict, not the model.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

const disambiguateReceiver = vi.fn()

vi.mock(import('../src/disambiguate.mts'), async importOriginal => ({
  ...(await importOriginal()),
  disambiguateReceiver,
}))

async function loadDrain() {
  const mod = await import('../src/ai-disambiguate-pass.mts')
  return mod.drainPendingAmbiguous
}

afterEach(() => {
  vi.clearAllMocks()
})

// `re.test(value)` on the third line, with every byte range the drain pass
// needs pre-computed against SRC.
const SRC = 'const re = /x/g\nconst value = "y"\nif (re.test(value)) {}\n'
const CALLEE_START = SRC.indexOf('re.test')
const OBJECT_START = CALLEE_START
const OBJECT_END = CALLEE_START + 're'.length
const FIRST_ARG_START = SRC.indexOf('value)')
const LAST_ARG_END = FIRST_ARG_START + 'value'.length

const SITE = {
  calleeEnd: CALLEE_START + 're.test'.length,
  calleeStart: CALLEE_START,
  firstArgStart: FIRST_ARG_START,
  lastArgEnd: LAST_ARG_END,
  methodName: 'test',
  objectEnd: OBJECT_END,
  objectStart: OBJECT_START,
  offset: CALLEE_START,
  receiverName: 're',
}

async function drain(
  overrides: {
    exported?: string[] | undefined
    isTsFile?: boolean | undefined
    nullable?: string[] | undefined
    pendingAmbiguous?: Array<typeof SITE> | undefined
    src?: string | undefined
  } = {},
) {
  const rewrites: Array<{ end: number; replacement: string; start: number }> =
    []
  const usedPrimordials = new Set<string>()
  const drainPendingAmbiguous = await loadDrain()
  return {
    result: drainPendingAmbiguous({
      exported: new Set(overrides.exported ?? ['RegExpPrototypeTest']),
      isTsFile: overrides.isTsFile ?? false,
      localName: (name: string) => name,
      nullable: overrides.nullable ? new Set(overrides.nullable) : undefined,
      pendingAmbiguous: overrides.pendingAmbiguous ?? [SITE],
      relPath: 'src/example.mjs',
      rewrites,
      src: overrides.src ?? SRC,
      targetRoot: '/repo',
      usedPrimordials,
    }),
    rewrites,
    usedPrimordials,
  }
}

describe('when the model names a candidate type', () => {
  it('rewrites the call to the prototype primordial', async () => {
    disambiguateReceiver.mockResolvedValue({
      reason: 'a RegExp literal',
      source: 'ai',
      type: 'RegExp',
    })
    const { rewrites, result, usedPrimordials } = await drain()
    expect(await result).toEqual({ skipped: 0 })
    expect(rewrites).toEqual([
      {
        end: SRC.indexOf(')) {}') + 1,
        replacement: 'RegExpPrototypeTest(re, value)',
        start: CALLEE_START,
      },
    ])
    expect([...usedPrimordials]).toEqual(['RegExpPrototypeTest'])
  })

  it('omits the argument list for a no-argument call', async () => {
    const src = 'const s = "x"\nconst t = s.trim()\n'
    const start = src.indexOf('s.trim')
    disambiguateReceiver.mockResolvedValue({
      reason: 'a string literal',
      source: 'ai',
      type: 'String',
    })
    const { rewrites, result } = await drain({
      exported: ['StringPrototypeTrim'],
      pendingAmbiguous: [
        {
          calleeEnd: start + 's.trim'.length,
          calleeStart: start,
          firstArgStart: -1,
          lastArgEnd: start + 's.trim('.length,
          methodName: 'trim',
          objectEnd: start + 1,
          objectStart: start,
          offset: start,
          receiverName: 's',
        },
      ],
      src,
    })
    await result
    expect(rewrites[0]?.replacement).toBe('StringPrototypeTrim(s)')
  })

  it('appends a non-null assertion for a nullable primordial in TypeScript', async () => {
    // The split surface types some exports `T | undefined`, and without the
    // bang the rewritten call does not type-check.
    disambiguateReceiver.mockResolvedValue({
      reason: 'a RegExp literal',
      source: 'ai',
      type: 'RegExp',
    })
    const { rewrites, result } = await drain({
      isTsFile: true,
      nullable: ['RegExpPrototypeTest'],
    })
    await result
    expect(rewrites[0]?.replacement).toBe('RegExpPrototypeTest!(re, value)')
  })

  it('leaves the bang off a JavaScript file', async () => {
    disambiguateReceiver.mockResolvedValue({
      reason: 'a RegExp literal',
      source: 'ai',
      type: 'RegExp',
    })
    const { rewrites, result } = await drain({
      isTsFile: false,
      nullable: ['RegExpPrototypeTest'],
    })
    await result
    expect(rewrites[0]?.replacement).toBe('RegExpPrototypeTest(re, value)')
  })
})

describe('when the pass declines to rewrite', () => {
  it('counts a verdict-less site as skipped', async () => {
    disambiguateReceiver.mockResolvedValue({
      reason: 'semver Range',
      source: 'ai',
      type: undefined,
    })
    const { rewrites, result } = await drain()
    expect(await result).toEqual({ skipped: 1 })
    expect(rewrites).toEqual([])
  })

  it('drops a verdict whose primordial the surface does not export', async () => {
    // Rewriting to a name that is not in primordials produces a file that
    // imports something that does not exist.
    disambiguateReceiver.mockResolvedValue({
      reason: 'a RegExp literal',
      source: 'ai',
      type: 'RegExp',
    })
    const { rewrites, result } = await drain({ exported: [] })
    expect(await result).toEqual({ skipped: 0 })
    expect(rewrites).toEqual([])
  })

  it('drops a verdict whose type has no such prototype method', async () => {
    disambiguateReceiver.mockResolvedValue({
      reason: 'guessy',
      source: 'ai',
      type: 'Number',
    })
    const { rewrites, result } = await drain()
    await result
    expect(rewrites).toEqual([])
  })

  it('drops a site whose closing paren cannot be located', async () => {
    // A wrong last-argument end would otherwise splice over live code.
    disambiguateReceiver.mockResolvedValue({
      reason: 'a RegExp literal',
      source: 'ai',
      type: 'RegExp',
    })
    const { rewrites, result } = await drain({
      pendingAmbiguous: [{ ...SITE, lastArgEnd: OBJECT_START }],
    })
    await result
    expect(rewrites).toEqual([])
  })

  it('does nothing at all for an empty queue', async () => {
    const { result } = await drain({ pendingAmbiguous: [] })
    expect(await result).toEqual({ skipped: 0 })
    expect(disambiguateReceiver).not.toHaveBeenCalled()
  })
})

describe('what the disambiguator is told', () => {
  it('reports a one-based line and column for the call site', async () => {
    disambiguateReceiver.mockResolvedValue({
      reason: 'a RegExp literal',
      source: 'ai',
      type: 'RegExp',
    })
    await (
      await drain()
    ).result
    const { 0: call } = disambiguateReceiver.mock.calls
    expect(call?.[0]).toMatchObject({
      aiEnabled: true,
      column: 5,
      filePath: 'src/example.mjs',
      line: 3,
      methodName: 'test',
      receiverName: 're',
      targetRoot: '/repo',
    })
  })

  it('passes a snippet of the surrounding source, not the whole file', async () => {
    disambiguateReceiver.mockResolvedValue({
      reason: 'a RegExp literal',
      source: 'ai',
      type: 'RegExp',
    })
    await (
      await drain()
    ).result
    const snippet = disambiguateReceiver.mock.calls[0]?.[0]?.snippet
    expect(typeof snippet).toBe('string')
    expect(snippet).toContain('re.test(value)')
  })

  it('asks once per queued site, in order', async () => {
    disambiguateReceiver.mockResolvedValue({
      reason: 'unsure',
      source: 'ai',
      type: undefined,
    })
    const { result } = await drain({ pendingAmbiguous: [SITE, SITE] })
    expect(await result).toEqual({ skipped: 2 })
    expect(disambiguateReceiver).toHaveBeenCalledTimes(2)
  })
})
