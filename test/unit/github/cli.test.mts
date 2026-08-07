/**
 * @file Unit tests for the `gh` CLI runner. Every behavior here was extracted
 *   from a hand-rolled copy, so each has a test naming what it protects: the
 *   `-f` / `-F` split that only one of four copies got right, the temp-file
 *   body that exists because the lib spawn leaves the child's stdin unwired,
 *   and the resolve-don't-throw contract that lets a caller treat a 404 as a
 *   state. The spawn seam is injected, so no test needs a `gh` binary.
 */

import { describe, expect, it } from 'vitest'

import {
  buildGhApiArgs,
  encodeGhFieldArgs,
  formatGhFailure,
  GH_BODY_PLACEHOLDER,
  ghApi,
  ghApiText,
  runGh,
} from '../../../src/github/cli'

interface SpawnCall {
  args: readonly string[]
  command: string
  options: Record<string, unknown>
}

// A spawn stub that records its call and answers a scripted result.
function scriptedSpawn(
  sink: SpawnCall[],
  result: {
    code?: number | undefined
    stderr?: string | undefined
    stdout?: string | undefined
  },
) {
  return ((
    command: string,
    args: readonly string[],
    options: Record<string, unknown>,
  ) => {
    sink.push({ args: [...args], command, options })
    return Promise.resolve({
      code: result.code ?? 0,
      stderr: result.stderr ?? '',
      stdout: result.stdout ?? '',
    })
  }) as never
}

function throwingSpawn(error: unknown) {
  return (() => Promise.reject(error)) as never
}

describe('encodeGhFieldArgs', () => {
  it('sends a string through -f', () => {
    expect(encodeGhFieldArgs({ name: 'main' })).toStrictEqual([
      '-f',
      'name=main',
    ])
  })

  it('sends a boolean through -F, not -f', () => {
    // The defect this exists to stop: `-f enabled=true` posts the STRING
    // "true", which a settings PATCH accepts and stores wrong.
    expect(encodeGhFieldArgs({ enabled: true })).toStrictEqual([
      '-F',
      'enabled=true',
    ])
  })

  it('sends a number, null, array, and object through -F as JSON', () => {
    expect(encodeGhFieldArgs({ count: 3 })).toStrictEqual(['-F', 'count=3'])
    // A cleared settings field is sent as JSON null; undefined drops the key.
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- null is the value under test
    expect(encodeGhFieldArgs({ owner: null })).toStrictEqual([
      '-F',
      'owner=null',
    ])
    expect(encodeGhFieldArgs({ names: ['a', 'b'] })).toStrictEqual([
      '-F',
      'names=["a","b"]',
    ])
    expect(encodeGhFieldArgs({ nested: { on: true } })).toStrictEqual([
      '-F',
      'nested={"on":true}',
    ])
  })

  it('encodes every key, in insertion order', () => {
    expect(encodeGhFieldArgs({ enabled: false, name: 'main' })).toStrictEqual([
      '-F',
      'enabled=false',
      '-f',
      'name=main',
    ])
  })

  it('an empty body encodes to no arguments', () => {
    expect(encodeGhFieldArgs({})).toStrictEqual([])
  })
})

describe('buildGhApiArgs', () => {
  it('is a bare GET by default', () => {
    // GET is gh's default, so naming it would add an argument saying nothing.
    expect(buildGhApiArgs('repos/o/r')).toStrictEqual(['api', 'repos/o/r'])
  })

  it('omits -X for an explicit GET', () => {
    expect(buildGhApiArgs('repos/o/r', { method: 'GET' })).toStrictEqual([
      'api',
      'repos/o/r',
    ])
  })

  it('names any other method', () => {
    expect(buildGhApiArgs('repos/o/r', { method: 'PATCH' })).toStrictEqual([
      'api',
      'repos/o/r',
      '-X',
      'PATCH',
    ])
  })

  it('appends the encoded fields after the method', () => {
    expect(
      buildGhApiArgs('repos/o/r', {
        fields: { has_issues: true },
        method: 'PATCH',
      }),
    ).toStrictEqual([
      'api',
      'repos/o/r',
      '-X',
      'PATCH',
      '-F',
      'has_issues=true',
    ])
  })
})

describe('runGh', () => {
  it('reports a clean run and trims both streams', async () => {
    const calls: SpawnCall[] = []
    const result = await runGh(['auth', 'status'], {
      spawnGh: scriptedSpawn(calls, { stdout: '  logged in \n' }),
    })
    expect(result).toStrictEqual({
      exitCode: 0,
      ok: true,
      stderr: '',
      stdout: 'logged in',
    })
    expect(calls[0]!.command).toBe('gh')
    expect(calls[0]!.args).toStrictEqual(['auth', 'status'])
  })

  it('resolves a non-zero exit rather than throwing', async () => {
    // A missing check run or an absent ruleset is a STATE to report, which is
    // why every caller branches on the code instead of wrapping a try.
    const result = await runGh(['api', 'repos/o/r/rulesets'], {
      spawnGh: scriptedSpawn([], {
        code: 1,
        stderr: 'gh: Not Found (HTTP 404)',
      }),
    })
    expect(result.ok).toBe(false)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('404')
  })

  it('resolves a spawn rejection too, so one branch covers every failure', async () => {
    const result = await runGh(['auth', 'status'], {
      spawnGh: throwingSpawn({ code: 2, stderr: 'boom' }),
    })
    expect(result).toStrictEqual({
      exitCode: 2,
      ok: false,
      stderr: 'boom',
      stdout: '',
    })
  })

  it('reports a command-not-found as exit 1, never as NaN', async () => {
    // ENOENT arrives as a STRING code, which is not an exit status.
    const result = await runGh(['auth'], {
      spawnGh: throwingSpawn({ code: 'ENOENT', message: 'gh not found' }),
    })
    expect(result.exitCode).toBe(1)
    expect(result.ok).toBe(false)
    expect(result.stderr).toBe('gh not found')
  })

  it('carries the default timeout, since a wedged gh should not hang a run', async () => {
    const calls: SpawnCall[] = []
    await runGh(['auth'], { spawnGh: scriptedSpawn(calls, {}) })
    // The literal, not the constant: importing it from the module under test
    // would assert the code against itself.
    expect(calls[0]!.options['timeout']).toBe(30_000)
  })

  it('passes cwd only when one was given', async () => {
    const withCwd: SpawnCall[] = []
    await runGh(['auth'], { cwd: '/repo', spawnGh: scriptedSpawn(withCwd, {}) })
    expect(withCwd[0]!.options['cwd']).toBe('/repo')
    const without: SpawnCall[] = []
    await runGh(['auth'], { spawnGh: scriptedSpawn(without, {}) })
    expect('cwd' in without[0]!.options).toBe(false)
  })

  it('writes a body to a temp file and substitutes the placeholder', async () => {
    // The lib spawn leaves the child's stdin unwired, so `--input -` reads
    // nothing and the request goes out empty. The file is the whole point.
    const calls: SpawnCall[] = []
    await runGh(['api', 'repos/o/r', '--input', GH_BODY_PLACEHOLDER], {
      body: '{"enabled":true}',
      spawnGh: scriptedSpawn(calls, {}),
    })
    const passed = calls[0]!.args
    expect(passed).toHaveLength(4)
    expect(passed[3]).not.toBe('{body}')
    expect(String(passed[3])).toMatch(/socket-gh-.*\.json$/)
  })

  it('leaves args alone when no body is given', async () => {
    const calls: SpawnCall[] = []
    await runGh(['api', 'repos/o/r'], { spawnGh: scriptedSpawn(calls, {}) })
    expect(calls[0]!.args).toStrictEqual(['api', 'repos/o/r'])
  })
})

describe('ghApi', () => {
  it('parses the JSON a successful call returns', async () => {
    const result = await ghApi<{ name: string }>('repos/o/r', {
      spawnGh: scriptedSpawn([], { stdout: '{"name":"r"}' }),
    })
    expect(result).toStrictEqual({ name: 'r' })
  })

  it('answers undefined on a failed call', async () => {
    const result = await ghApi('repos/o/r', {
      spawnGh: scriptedSpawn([], { code: 1, stderr: 'Not Found' }),
    })
    expect(result).toBeUndefined()
  })

  it('answers undefined on an empty body', async () => {
    // A 204 and an absent resource are the same non-answer to these readers.
    const result = await ghApi('repos/o/r', {
      spawnGh: scriptedSpawn([], { stdout: '   ' }),
    })
    expect(result).toBeUndefined()
  })

  it('answers undefined rather than throwing on malformed JSON', async () => {
    const result = await ghApi('repos/o/r', {
      spawnGh: scriptedSpawn([], { stdout: 'not json {{{' }),
    })
    expect(result).toBeUndefined()
  })

  it('sends the method and fields it was given', async () => {
    const calls: SpawnCall[] = []
    await ghApi('repos/o/r', {
      fields: { has_wiki: false },
      method: 'PATCH',
      spawnGh: scriptedSpawn(calls, { stdout: '{}' }),
    })
    expect(calls[0]!.args).toStrictEqual([
      'api',
      'repos/o/r',
      '-X',
      'PATCH',
      '-F',
      'has_wiki=false',
    ])
  })
})

describe('ghApiText', () => {
  it('appends the jq filter and returns trimmed text', async () => {
    const calls: SpawnCall[] = []
    const text = await ghApiText('repos/o/r/releases', '.[0].tag_name', {
      spawnGh: scriptedSpawn(calls, { stdout: ' v1.2.3 \n' }),
    })
    expect(text).toBe('v1.2.3')
    expect(calls[0]!.args).toStrictEqual([
      'api',
      'repos/o/r/releases',
      '--jq',
      '.[0].tag_name',
    ])
  })

  it('answers undefined on a failed call, leaving the choice to the caller', async () => {
    const text = await ghApiText('repos/o/r', '.x', {
      spawnGh: scriptedSpawn([], { code: 1, stderr: 'nope' }),
    })
    expect(text).toBeUndefined()
  })
})

describe('formatGhFailure', () => {
  it('carries all four ingredients in order', () => {
    const message = formatGhFailure('resolving a release', {
      exitCode: 1,
      ok: false,
      stderr: 'HTTP 404',
      stdout: '',
    })
    expect(message).toContain('Where: resolving a release')
    expect(message).toContain('Saw:   exit 1')
    expect(message).toContain('HTTP 404')
    expect(message).toContain('gh auth status')
  })

  it('says so when there was no stderr, rather than trailing off', () => {
    const message = formatGhFailure('a call', {
      exitCode: 3,
      ok: false,
      stderr: '',
      stdout: '',
    })
    expect(message).toContain('(no stderr)')
  })
})
