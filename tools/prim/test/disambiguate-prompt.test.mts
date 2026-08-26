/**
 * @file Unit tests for the prompt and reply halves of prim's AI
 *   disambiguation, plus the on-disk verdict cache. The verdict decides whether
 *   a call site gets rewritten, so a reply the parser reads too loosely is a
 *   wrong rewrite in someone's tree. These tests hold `parseResponse` to the
 *   candidate list it was given, and hold `buildPrompt` to actually carrying
 *   the location, snippet and candidate wording the model is asked to choose
 *   between.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'
import { afterEach, describe, expect, it } from 'vitest'

import {
  buildPrompt,
  cachePath,
  computeKey,
  loadCache,
  parseResponse,
  saveCache,
} from '../src/disambiguate.mts'

const tmpDirs: string[] = []

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await safeDelete(dir)
  }
})

function tmpRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'prim-disambig-'))
  tmpDirs.push(root)
  return root
}

const PROMPT_INPUT = {
  candidates: ['RegExp', 'Date'],
  column: 11,
  filePath: 'src/example.mts',
  hint: 'semver Range instances also define .test',
  line: 42,
  methodName: 'test',
  receiverName: 'range',
  snippet: 'const range = new Range("^1.0.0")\nif (range.test(v)) {}',
}

describe('buildPrompt', () => {
  it('names the receiver and the call being classified', () => {
    const prompt = buildPrompt(PROMPT_INPUT)
    expect(prompt).toContain('what is the type of `range`')
    expect(prompt).toContain('`range.test(...)`')
  })

  it('carries the exact location so the model can open the file', () => {
    const prompt = buildPrompt(PROMPT_INPUT)
    expect(prompt).toContain('file: src/example.mts')
    expect(prompt).toContain('line: 42')
    expect(prompt).toContain('column: 11')
  })

  it('includes the snippet verbatim', () => {
    expect(buildPrompt(PROMPT_INPUT)).toContain(PROMPT_INPUT.snippet)
  })

  it('lists the spec candidates and the duck-typing hint', () => {
    const prompt = buildPrompt(PROMPT_INPUT)
    expect(prompt).toContain('spec-defined on: RegExp / Date')
    expect(prompt).toContain('semver Range instances also define .test')
  })

  it('offers Other and Unsure as escapes beside the candidates', () => {
    // Without a way to decline, the model picks a built-in it half-believes
    // and the codemod rewrites a semver Range as a RegExp.
    const prompt = buildPrompt(PROMPT_INPUT)
    expect(prompt).toContain('"RegExp" (the spec built-in)')
    expect(prompt).toContain('"Date" (the spec built-in)')
    expect(prompt).toContain('"Other"')
    expect(prompt).toContain('"Unsure"')
    expect(prompt).toContain('DO NOT migrate')
  })

  it('pins the reply format the parser expects', () => {
    const prompt = buildPrompt(PROMPT_INPUT)
    expect(prompt).toContain('VERDICT: <type>')
    expect(prompt).toContain('REASON: <one short sentence>')
  })
})

describe('parseResponse', () => {
  const CANDIDATES = ['RegExp', 'Date']

  it('accepts a candidate verdict with its reason', () => {
    expect(
      parseResponse(
        'VERDICT: RegExp\nREASON: declared as a literal above.',
        CANDIDATES,
      ),
    ).toEqual({ reason: 'declared as a literal above.', type: 'RegExp' })
  })

  it('finds the verdict inside surrounding chatter', () => {
    // The model narrates before answering more often than not.
    expect(
      parseResponse(
        'Let me look at the file.\n\nVERDICT: Date\nREASON: constructed with new Date().\n\nDone.',
        CANDIDATES,
      ).type,
    ).toBe('Date')
  })

  it('declines on Other, keeping the reason for the report', () => {
    expect(
      parseResponse('VERDICT: Other\nREASON: semver Range.', CANDIDATES),
    ).toEqual({ reason: 'semver Range.', type: undefined })
  })

  it('declines on Unsure', () => {
    expect(
      parseResponse('VERDICT: Unsure\nREASON: untyped parameter.', CANDIDATES)
        .type,
    ).toBe(undefined)
  })

  it('declines on a verdict outside the candidate list', () => {
    // A hallucinated type must not be trusted just because it parsed.
    const parsed = parseResponse(
      'VERDICT: Promise\nREASON: guessy.',
      CANDIDATES,
    )
    expect(parsed.type).toBe(undefined)
    expect(parsed.reason).toContain('unexpected verdict "Promise"')
    expect(parsed.reason).toContain('RegExp, Date')
  })

  it('declines when no verdict line is present at all', () => {
    expect(parseResponse('I could not determine this.', CANDIDATES)).toEqual({
      reason: 'no-verdict-line',
      type: undefined,
    })
  })

  it('substitutes a placeholder when the reason line is missing', () => {
    expect(parseResponse('VERDICT: RegExp', CANDIDATES)).toEqual({
      reason: '(no reason supplied)',
      type: 'RegExp',
    })
  })
})

describe('computeKey', () => {
  it('is stable for identical inputs', () => {
    const first = computeKey('test', 'range', 'src')
    const second = computeKey('test', 'range', 'src')
    expect(first).toBe(second)
  })

  it('changes when the snippet changes', () => {
    // The snippet is the evidence; different evidence deserves a fresh ask.
    const forA = computeKey('test', 'range', 'a')
    const forB = computeKey('test', 'range', 'b')
    expect(forA).not.toBe(forB)
  })

  it('changes when the method or receiver changes', () => {
    const base = computeKey('test', 'range', 'src')
    const otherMethod = computeKey('exec', 'range', 'src')
    const otherReceiver = computeKey('test', 'other', 'src')
    expect(base).not.toBe(otherMethod)
    expect(base).not.toBe(otherReceiver)
  })

  it('is a hex digest, not the inputs themselves', () => {
    const key = computeKey('test', 'range', 'src')
    expect(key).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('the verdict cache', () => {
  it('lives under .prim-cache in the target root', () => {
    const root = tmpRoot()
    expect(cachePath(root)).toBe(
      path.join(root, '.prim-cache', 'disambiguate.json'),
    )
  })

  it('reads back what it wrote', () => {
    const root = tmpRoot()
    const entry = { reason: 'a RegExp literal', timestamp: 1, type: 'RegExp' }
    saveCache(root, { entries: { abc: entry }, schema: 1 })
    expect(loadCache(root).entries['abc']).toEqual(entry)
  })

  it('creates the cache directory on first write', () => {
    const root = tmpRoot()
    saveCache(root, { entries: {}, schema: 1 })
    expect(JSON.parse(readFileSync(cachePath(root), 'utf8')).schema).toBe(1)
  })

  it('starts empty when no cache file exists', () => {
    expect(loadCache(tmpRoot())).toEqual({ entries: {}, schema: 1 })
  })

  it('starts empty rather than throwing on corrupt JSON', () => {
    const root = tmpRoot()
    mkdirSync(path.dirname(cachePath(root)), { recursive: true })
    writeFileSync(cachePath(root), '{ not json', 'utf8')
    expect(loadCache(root).entries).toEqual({})
  })

  it('discards a cache written under an older schema', () => {
    // A prompt change can flip a verdict, so stale answers are worse than
    // no answers - but the file is left on disk to inspect.
    const root = tmpRoot()
    mkdirSync(path.dirname(cachePath(root)), { recursive: true })
    writeFileSync(
      cachePath(root),
      JSON.stringify({
        entries: { abc: { reason: 'old', type: 'RegExp' } },
        schema: 0,
      }),
      'utf8',
    )
    expect(loadCache(root).entries).toEqual({})
    expect(readFileSync(cachePath(root), 'utf8')).toContain('"schema":0')
  })

  it('discards a cache file holding JSON null', () => {
    const root = tmpRoot()
    mkdirSync(path.dirname(cachePath(root)), { recursive: true })
    writeFileSync(cachePath(root), 'null', 'utf8')
    expect(loadCache(root).entries).toEqual({})
  })
})
