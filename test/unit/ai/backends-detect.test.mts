/**
 * @file Tests for ai/backends detection plus the two argv builders the sibling
 *   suite does not reach. Detection decides whether a review or scan pass runs
 *   at all, so `which` is mocked: the answer must come from the registry's
 *   logic, not from which agent CLIs happen to be installed on the machine.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

const whichMock = vi.fn()

vi.mock(import('../../../src/exe/path/which.mjs'), () => ({
  which: whichMock,
}))

async function loadBackends() {
  return await import('../../../src/ai/backends.mjs')
}

// `which` answers null, not undefined, for a binary that is not on PATH, and
// `isCommandAvailable` compares against null - the mock has to match or every
// detection result inverts.
const NOT_ON_PATH: string | null = null

afterEach(() => {
  vi.clearAllMocks()
})

/**
 * Set and restore one env var around a single argv assertion.
 */
async function withEnv(
  name: string,
  value: string | undefined,
  fn: () => Promise<void>,
): Promise<void> {
  const prev = process.env[name]
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
  try {
    await fn()
  } finally {
    if (prev === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = prev
    }
  }
}

describe('kimi argv', () => {
  it('emits to stdout with streaming off', async () => {
    // The caller captures stdout into a file; a streaming response would
    // interleave partial frames into that capture.
    const { BACKENDS } = await loadBackends()
    const run = BACKENDS.kimi.run('/tmp/prompt', '/tmp/out')
    expect(run.outMode).toBe('stdout')
    expect(run.argv).toEqual(['chat', '--model', 'kimi-latest', '--no-stream'])
  })

  it('honours KIMI_MODEL', async () => {
    const { BACKENDS } = await loadBackends()
    await withEnv('KIMI_MODEL', 'kimi-k2', async () => {
      const run = BACKENDS.kimi.run('/tmp/prompt', '/tmp/out')
      expect(run.argv).toContain('kimi-k2')
    })
  })
})

describe('opencode argv', () => {
  it('pins the provider slug when OPENCODE_MODEL is set', async () => {
    const { BACKENDS } = await loadBackends()
    await withEnv('OPENCODE_MODEL', 'fireworks-ai/example-model', async () => {
      const run = BACKENDS.opencode.run('/tmp/prompt', '/tmp/out')
      expect(run.argv).toEqual(['run', '--model', 'fireworks-ai/example-model'])
      expect(run.outMode).toBe('stdout')
    })
  })

  it('leaves the choice to opencode config when the env is unset', async () => {
    const { BACKENDS } = await loadBackends()
    await withEnv('OPENCODE_MODEL', undefined, async () => {
      const run = BACKENDS.opencode.run('/tmp/prompt', '/tmp/out')
      expect(run.argv).toEqual(['run'])
    })
  })
})

describe('isCommandAvailable', () => {
  it('is true when which resolves a path', async () => {
    const { isCommandAvailable } = await loadBackends()
    whichMock.mockResolvedValue('/usr/local/bin/claude')
    expect(await isCommandAvailable('claude')).toBe(true)
  })

  it('is false when which finds nothing on PATH', async () => {
    const { isCommandAvailable } = await loadBackends()
    whichMock.mockResolvedValue(NOT_ON_PATH)
    expect(await isCommandAvailable('claude')).toBe(false)
  })
})

describe('detectAvailableBackends', () => {
  it('reports every backend whose CLI resolves', async () => {
    const { detectAvailableBackends } = await loadBackends()
    whichMock.mockImplementation(async (bin: string) =>
      bin === 'claude' || bin === 'kimi'
        ? `/usr/local/bin/${bin}`
        : NOT_ON_PATH,
    )
    const available = await detectAvailableBackends()
    expect([...available].toSorted()).toEqual(['claude', 'kimi'])
  })

  it('reports an empty set when nothing is installed', async () => {
    // The caller skips the pass with a note rather than failing the run.
    const { detectAvailableBackends } = await loadBackends()
    whichMock.mockResolvedValue(NOT_ON_PATH)
    const available = await detectAvailableBackends()
    expect(available.size).toBe(0)
  })

  it('probes each registered backend by its bin name', async () => {
    const { detectAvailableBackends } = await loadBackends()
    whichMock.mockResolvedValue(NOT_ON_PATH)
    await detectAvailableBackends()
    const probed = whichMock.mock.calls.map(call => call[0]).toSorted()
    expect(probed).toEqual(['claude', 'codex', 'kimi', 'opencode'])
  })

  it('fans the lookups out rather than awaiting one at a time', async () => {
    // Four sequential `which` calls on a cold PATH cache is the difference
    // between a snappy pass and a visible stall.
    const { detectAvailableBackends } = await loadBackends()
    let inFlight = 0
    let peak = 0
    whichMock.mockImplementation(async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await Promise.resolve()
      inFlight -= 1
      return NOT_ON_PATH
    })
    await detectAvailableBackends()
    expect(peak).toBeGreaterThan(1)
  })
})
