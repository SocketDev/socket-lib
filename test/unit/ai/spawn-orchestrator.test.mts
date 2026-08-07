import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { mockChildSpawn } = vi.hoisted(() => ({
  mockChildSpawn: vi.fn(),
}))

vi.mock(import('../../../src/process/spawn/child'), () => ({
  spawn: mockChildSpawn,
}))

vi.mock(import('../../../src/ai/discover.mts'), () => ({
  discoverAiAgents: vi.fn(),
}))

interface FakeSpawnResult {
  code: number
  stdout: string
  stderr: string
}

function makeSpawnReturn(opts: FakeSpawnResult) {
  // The source does: `const child = spawn(...)` then `child.stdin?.end(prompt)`
  // then `const result = await child`. So spawn() must return a thenable
  // with a `.stdin` getter.
  const stdinEnd = vi.fn()
  const thenable: PromiseLike<FakeSpawnResult> & {
    stdin: { end: ReturnType<typeof vi.fn> }
  } = {
    stdin: { end: stdinEnd },
    // The thenable is intentional: it matches the source's `await child`
    // target.
    // oxlint-disable-next-line unicorn/no-thenable -- intentional
    then(onFulfilled) {
      return Promise.resolve(opts).then(onFulfilled)
    },
  }
  return thenable
}

async function loadFresh() {
  const discoverMod = await import('../../../src/ai/discover.mts')
  const mod = await import('../../../src/ai/spawn.mts')
  return {
    discoverAiAgents: discoverMod.discoverAiAgents as ReturnType<typeof vi.fn>,
    spawnAiAgent: mod.spawnAiAgent,
    pickAgent: mod.pickAgent,
  }
}

const baseOpts = {
  agent: 'claude' as const,
  cwd: '/repo',
  disallow: [] as readonly string[],
  permissionMode: 'dontAsk' as const,
  prompt: 'do the thing',
  tools: [] as readonly string[],
}

beforeEach(() => {
  vi.resetModules()
  mockChildSpawn.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('ai/spawn — spawnAiAgent happy path', () => {
  test('returns exit 0 + stdout/stderr after a single successful attempt', async () => {
    const { discoverAiAgents, spawnAiAgent } = await loadFresh()
    discoverAiAgents.mockResolvedValueOnce({ claude: '/usr/local/bin/claude' })
    mockChildSpawn.mockReturnValueOnce(
      makeSpawnReturn({ code: 0, stdout: 'ok-result', stderr: '' }),
    )
    const result = await spawnAiAgent(baseOpts)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('ok-result')
    expect(result.attempts).toBe(1)
    expect(typeof result.durationMs).toBe('number')
  })

  test('coerces missing stdout/stderr/code from successful child to ""/""/0', async () => {
    const { discoverAiAgents, spawnAiAgent } = await loadFresh()
    discoverAiAgents.mockResolvedValueOnce({ claude: '/p' })
    // Child returns an object with NO stdout/stderr/code — exercises
    // each `?? ''` / `?? 0` fallback.
    mockChildSpawn.mockReturnValueOnce(
      makeSpawnReturn({} as unknown as Parameters<typeof makeSpawnReturn>[0]),
    )
    const result = await spawnAiAgent(baseOpts)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('')
  })

  test('coerces missing fields from a spawn-error throw', async () => {
    const { discoverAiAgents, spawnAiAgent } = await loadFresh()
    discoverAiAgents.mockResolvedValueOnce({ claude: '/p' })
    // SpawnError-shaped (stdout/stderr/code keys present but field-only
    // identification suffices for isSpawnError). Set all to undefined to
    // exercise the catch-arm `?? ''` / `?? 1` fallbacks.
    const spawnErr = { stdout: undefined, stderr: undefined, code: undefined }
    mockChildSpawn.mockImplementationOnce(() => {
      const t: PromiseLike<unknown> & { stdin: { end: () => void } } = {
        stdin: { end: () => {} },
        // The thenable is intentional: it matches the source's `await child`
        // target.
        // oxlint-disable-next-line unicorn/no-thenable -- intentional
        then(_o, r) {
          return Promise.resolve().then(() => {
            if (r) {
              return r(spawnErr)
            }
            throw spawnErr
          })
        },
      }
      return t
    })
    const result = await spawnAiAgent(baseOpts)
    // Generic catch arm: stderr from errorMessage(), exitCode 1.
    expect(result.exitCode).toBe(1)
  })

  test('pipes prompt to child.stdin', async () => {
    const { discoverAiAgents, spawnAiAgent } = await loadFresh()
    discoverAiAgents.mockResolvedValueOnce({ claude: '/p' })
    const ret = makeSpawnReturn({ code: 0, stdout: '', stderr: '' })
    mockChildSpawn.mockReturnValueOnce(ret)
    await spawnAiAgent({ ...baseOpts, prompt: 'PROMPT-X' })
    expect(ret.stdin.end).toHaveBeenCalledWith('PROMPT-X')
  })

  test('passes timeout + cwd to child spawn', async () => {
    const { discoverAiAgents, spawnAiAgent } = await loadFresh()
    discoverAiAgents.mockResolvedValueOnce({ claude: '/p' })
    mockChildSpawn.mockReturnValueOnce(
      makeSpawnReturn({ code: 0, stdout: '', stderr: '' }),
    )
    await spawnAiAgent({ ...baseOpts, timeoutMs: 60_000 })
    const [, , spawnOpts] = mockChildSpawn.mock.calls[0]!
    expect((spawnOpts as { timeout?: number | undefined }).timeout).toBe(60_000)
    expect((spawnOpts as { cwd?: string | undefined }).cwd).toBe('/repo')
  })
})

describe.sequential('ai/spawn — spawnAiAgent non-overload errors do not retry', () => {
  test('non-zero exit without "overloaded" returns after one attempt', async () => {
    const { discoverAiAgents, spawnAiAgent } = await loadFresh()
    discoverAiAgents.mockResolvedValueOnce({ claude: '/p' })
    mockChildSpawn.mockReturnValueOnce(
      makeSpawnReturn({ code: 2, stdout: '', stderr: 'syntax error' }),
    )
    const result = await spawnAiAgent(baseOpts)
    expect(result.exitCode).toBe(2)
    expect(result.attempts).toBe(1)
    expect(result.stderr).toBe('syntax error')
  })

  test('spawnError thrown by child surface populates exit/stdout/stderr', async () => {
    const { discoverAiAgents, spawnAiAgent } = await loadFresh()
    discoverAiAgents.mockResolvedValueOnce({ claude: '/p' })
    // A real spawn rejection is an ERROR carrying extra fields, which is what
    // `spawn` actually throws: `Object.assign(new Error(…), { code, stderr })`.
    // This fixture used to be a bare object literal, which passed only because
    // `isSpawnError` accepted any object with a `code` — while narrowing to a
    // type that declares `message` and `stack`. Building it faithfully keeps
    // the test honest about the shape production code sees.
    const spawnErr = Object.assign(new Error('command failed'), {
      stdout: 'partial-out',
      stderr: 'fatal',
      code: 137,
    })
    mockChildSpawn.mockImplementationOnce(() => {
      const t: PromiseLike<unknown> & { stdin: { end: () => void } } = {
        stdin: { end: () => {} },
        // The thenable is intentional: it matches the source's `await child`
        // target.
        // oxlint-disable-next-line unicorn/no-thenable -- intentional
        then(_o, r) {
          return Promise.resolve().then(() => {
            if (r) {
              return r(spawnErr)
            }
            throw spawnErr
          })
        },
      }
      return t
    })
    const result = await spawnAiAgent(baseOpts)
    // spawnError shape matched: stdout/stderr/code propagated verbatim.
    expect(result.exitCode).toBe(137)
    expect(result.stdout).toBe('partial-out')
    expect(result.stderr).toBe('fatal')
    expect(result.attempts).toBe(1)
  })

  test('non-spawnError thrown (plain Error) falls through to generic catch', async () => {
    const { discoverAiAgents, spawnAiAgent } = await loadFresh()
    discoverAiAgents.mockResolvedValueOnce({ claude: '/p' })
    mockChildSpawn.mockImplementationOnce(() => {
      const t: PromiseLike<unknown> & { stdin: { end: () => void } } = {
        stdin: { end: () => {} },
        // The thenable is intentional: it matches the source's `await child`
        // target.
        // oxlint-disable-next-line unicorn/no-thenable -- intentional
        then(_o, r) {
          return Promise.resolve().then(() => {
            const err = new Error('generic-failure')
            if (r) {
              return r(err)
            }
            throw err
          })
        },
      }
      return t
    })
    const result = await spawnAiAgent(baseOpts)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toMatch(/generic-failure/)
  })
})

describe.sequential('ai/spawn — spawnAiAgent retries on overload', () => {
  test('retries up to MAX_ATTEMPTS=3 when stderr contains "Overloaded"', async () => {
    const { discoverAiAgents, spawnAiAgent } = await loadFresh()
    discoverAiAgents.mockResolvedValueOnce({ claude: '/p' })
    mockChildSpawn
      .mockReturnValueOnce(
        makeSpawnReturn({
          code: 1,
          stdout: '',
          stderr: 'API Error: 529 Overloaded',
        }),
      )
      .mockReturnValueOnce(
        makeSpawnReturn({
          code: 1,
          stdout: '',
          stderr: 'Overloaded',
        }),
      )
      .mockReturnValueOnce(
        makeSpawnReturn({ code: 0, stdout: 'recovered', stderr: '' }),
      )
    // Use fake timers so backoff sleeps don't slow the test.
    vi.useFakeTimers()
    const promise = spawnAiAgent(baseOpts)
    await vi.runAllTimersAsync()
    const result = await promise
    vi.useRealTimers()
    expect(result.exitCode).toBe(0)
    expect(result.attempts).toBe(3)
    expect(result.stdout).toBe('recovered')
  })

  test('stops at MAX_ATTEMPTS=3 when overload persists', async () => {
    const { discoverAiAgents, spawnAiAgent } = await loadFresh()
    discoverAiAgents.mockResolvedValueOnce({ claude: '/p' })
    mockChildSpawn.mockReturnValue(
      makeSpawnReturn({ code: 1, stdout: '', stderr: 'Overloaded' }),
    )
    vi.useFakeTimers()
    const promise = spawnAiAgent(baseOpts)
    await vi.runAllTimersAsync()
    const result = await promise
    vi.useRealTimers()
    expect(result.attempts).toBe(3)
    expect(result.exitCode).toBe(1)
  })
})

describe.sequential('ai/spawn — retries without a flag the CLI rejects', () => {
  test('drops --effort and retries when the CLI reports it unknown', async () => {
    const { discoverAiAgents, spawnAiAgent } = await loadFresh()
    discoverAiAgents.mockResolvedValueOnce({ claude: '/p' })
    mockChildSpawn
      .mockReturnValueOnce(
        makeSpawnReturn({
          code: 1,
          stdout: '',
          stderr: "error: unknown option '--effort'",
        }),
      )
      .mockReturnValueOnce(
        makeSpawnReturn({ code: 0, stdout: 'did-the-work', stderr: '' }),
      )
    const result = await spawnAiAgent({ ...baseOpts, effort: 'high' })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('did-the-work')
    // The first attempt carried the flag, the retry did not.
    const [, firstArgs] = mockChildSpawn.mock.calls[0]!
    const [, retryArgs] = mockChildSpawn.mock.calls[1]!
    expect(firstArgs as string[]).toContain('--effort')
    expect(retryArgs as string[]).not.toContain('--effort')
    // The value goes with the flag; the lockdown args survive.
    expect(retryArgs as string[]).not.toContain('high')
    expect(retryArgs as string[]).toContain('--permission-mode')
  })

  test('retrying costs an attempt rather than looping forever', async () => {
    const { discoverAiAgents, spawnAiAgent } = await loadFresh()
    discoverAiAgents.mockResolvedValueOnce({ claude: '/p' })
    // Every attempt claims the flag is unknown. Once it is stripped the claim
    // no longer matches a flag in argv, so the loop has to exit.
    mockChildSpawn.mockReturnValue(
      makeSpawnReturn({
        code: 1,
        stdout: '',
        stderr: "error: unknown option '--effort'",
      }),
    )
    const result = await spawnAiAgent({ ...baseOpts, effort: 'low' })
    expect(result.exitCode).toBe(1)
    expect(result.attempts).toBe(2)
  })

  test('leaves args alone when a DIFFERENT flag is rejected', async () => {
    const { discoverAiAgents, spawnAiAgent } = await loadFresh()
    discoverAiAgents.mockResolvedValueOnce({ claude: '/p' })
    mockChildSpawn.mockReturnValue(
      makeSpawnReturn({
        code: 1,
        stdout: '',
        stderr: "error: unknown option '--model'",
      }),
    )
    const result = await spawnAiAgent({ ...baseOpts, effort: 'high' })
    // Not a flag this layer treats as optional, so it fails on the first pass.
    expect(result.exitCode).toBe(1)
    expect(result.attempts).toBe(1)
  })

  test('does not retry when the run SUCCEEDS while printing the phrase', async () => {
    const { discoverAiAgents, spawnAiAgent } = await loadFresh()
    discoverAiAgents.mockResolvedValueOnce({ claude: '/p' })
    // Work output can quote a CLI error verbatim; a zero exit is a success
    // whatever the text says.
    mockChildSpawn.mockReturnValueOnce(
      makeSpawnReturn({
        code: 0,
        stdout: "fixed a bug where we logged: unknown option '--effort'",
        stderr: '',
      }),
    )
    const result = await spawnAiAgent({ ...baseOpts, effort: 'high' })
    expect(result.exitCode).toBe(0)
    expect(result.attempts).toBe(1)
    expect(mockChildSpawn).toHaveBeenCalledTimes(1)
  })
})

describe.sequential('ai/spawn — pickAgent', () => {
  test('rejects when requested agent is not discovered', async () => {
    const { discoverAiAgents, pickAgent } = await loadFresh()
    discoverAiAgents.mockResolvedValueOnce({})
    await expect(pickAgent('claude', '/repo')).rejects.toThrow(
      /requested agent "claude" is not on PATH/,
    )
  })

  test('returns claude when present (default preference)', async () => {
    const { discoverAiAgents, pickAgent } = await loadFresh()
    discoverAiAgents.mockResolvedValueOnce({
      claude: '/p',
      codex: '/q',
    })
    expect(await pickAgent(undefined, '/repo')).toBe('claude')
  })

  test('falls back to codex when claude is absent', async () => {
    const { discoverAiAgents, pickAgent } = await loadFresh()
    discoverAiAgents.mockResolvedValueOnce({ codex: '/p', gemini: '/q' })
    expect(await pickAgent(undefined, '/repo')).toBe('codex')
  })

  test('falls back to opencode after codex misses', async () => {
    const { discoverAiAgents, pickAgent } = await loadFresh()
    discoverAiAgents.mockResolvedValueOnce({ opencode: '/p', gemini: '/q' })
    expect(await pickAgent(undefined, '/repo')).toBe('opencode')
  })

  test('falls back to gemini when only it is present', async () => {
    const { discoverAiAgents, pickAgent } = await loadFresh()
    discoverAiAgents.mockResolvedValueOnce({ gemini: '/g' })
    expect(await pickAgent(undefined, '/repo')).toBe('gemini')
  })

  test('throws when no agents are on PATH', async () => {
    const { discoverAiAgents, pickAgent } = await loadFresh()
    discoverAiAgents.mockResolvedValueOnce({})
    await expect(pickAgent(undefined, '/repo')).rejects.toThrow(
      /no AI agent CLI on PATH/,
    )
  })
})
