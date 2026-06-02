import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock(import('../../../src/secrets/find'), () => ({
  resolve: vi.fn(),
  resolveSync: vi.fn(),
}))

async function loadFresh() {
  const findMod = await import('../../../src/secrets/find')
  const resolveMock = findMod.resolve as ReturnType<typeof vi.fn>
  const resolveSyncMock = findMod.resolveSync as ReturnType<typeof vi.fn>
  const mod = await import('../../../src/secrets/socket-api-token')
  return {
    resolveMock,
    resolveSyncMock,
    readSocketApiToken: mod.readSocketApiToken,
    readSocketApiTokenSync: mod.readSocketApiTokenSync,
  }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('secrets/socket-api-token — readSocketApiToken (async)', () => {
  test('returns the resolved value', async () => {
    const { readSocketApiToken, resolveMock } = await loadFresh()
    resolveMock.mockResolvedValueOnce({
      value: 'tok-xyz',
      source: 'env',
      account: 'SOCKET_API_TOKEN',
    })
    expect(await readSocketApiToken()).toBe('tok-xyz')
  })

  test('passes service="socket-cli" and the canonical accounts list', async () => {
    const { readSocketApiToken, resolveMock } = await loadFresh()
    resolveMock.mockResolvedValueOnce(undefined)
    await readSocketApiToken()
    const callArg = resolveMock.mock.calls[0]![0] as {
      service: string
      accounts: readonly string[]
    }
    expect(callArg.service).toBe('socket-cli')
    // socket-api-token-env: bootstrap — asserting the source's literal account
    // fallback list, which includes the SOCKET_API_KEY legacy alias by design.
    expect(callArg.accounts).toEqual(['SOCKET_API_TOKEN', 'SOCKET_API_KEY'])
  })

  test('forwards allowEnvOnly to resolve', async () => {
    const { readSocketApiToken, resolveMock } = await loadFresh()
    resolveMock.mockResolvedValueOnce(undefined)
    await readSocketApiToken({ allowEnvOnly: true })
    const callArg = resolveMock.mock.calls[0]![0] as { allowEnvOnly: unknown }
    expect(callArg.allowEnvOnly).toBe(true)
  })

  test('returns undefined when resolve returns undefined', async () => {
    const { readSocketApiToken, resolveMock } = await loadFresh()
    resolveMock.mockResolvedValueOnce(undefined)
    expect(await readSocketApiToken()).toBeUndefined()
  })
})

describe.sequential('secrets/socket-api-token — readSocketApiTokenSync', () => {
  test('returns the resolved value', async () => {
    const { readSocketApiTokenSync, resolveSyncMock } = await loadFresh()
    resolveSyncMock.mockReturnValueOnce({
      value: 'tok-xyz',
      source: 'keychain',
      account: 'SOCKET_API_TOKEN',
    })
    expect(readSocketApiTokenSync()).toBe('tok-xyz')
  })

  test('passes service="socket-cli" and the canonical accounts list', async () => {
    const { readSocketApiTokenSync, resolveSyncMock } = await loadFresh()
    resolveSyncMock.mockReturnValueOnce(undefined)
    readSocketApiTokenSync()
    const callArg = resolveSyncMock.mock.calls[0]![0] as {
      service: string
      accounts: readonly string[]
    }
    expect(callArg.service).toBe('socket-cli')
    // socket-api-token-env: bootstrap — asserting the source's literal account
    // fallback list, which includes the SOCKET_API_KEY legacy alias by design.
    expect(callArg.accounts).toEqual(['SOCKET_API_TOKEN', 'SOCKET_API_KEY'])
  })

  test('forwards allowEnvOnly to resolveSync', async () => {
    const { readSocketApiTokenSync, resolveSyncMock } = await loadFresh()
    resolveSyncMock.mockReturnValueOnce(undefined)
    readSocketApiTokenSync({ allowEnvOnly: true })
    const callArg = resolveSyncMock.mock.calls[0]![0] as {
      allowEnvOnly: unknown
    }
    expect(callArg.allowEnvOnly).toBe(true)
  })

  test('returns undefined when resolveSync returns undefined', async () => {
    const { readSocketApiTokenSync, resolveSyncMock } = await loadFresh()
    resolveSyncMock.mockReturnValueOnce(undefined)
    expect(readSocketApiTokenSync()).toBeUndefined()
  })
})
