import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock(import('../../../src/secrets/keychain'), () => ({
  readSecret:
    vi.fn<
      (opts: {
        service: string
        account: string
      }) => Promise<string | undefined>
    >(),
  readSecretSync:
    vi.fn<(opts: { service: string; account: string }) => string | undefined>(),
}))

async function loadFresh() {
  const kc = await import('../../../src/secrets/keychain')
  const readAsync = kc.readSecret as ReturnType<typeof vi.fn>
  const readSync = kc.readSecretSync as ReturnType<typeof vi.fn>
  const mod = await import('../../../src/secrets/find')
  return {
    readAsync,
    readSync,
    readEnv: mod.readEnv,
    resolve: mod.resolve,
    resolveSync: mod.resolveSync,
  }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe.sequential('secrets/find — readEnv', () => {
  test('returns the trimmed value when env var is set', async () => {
    const { readEnv } = await loadFresh()
    vi.stubEnv('MY_VAR', '  hello  ')
    expect(readEnv('MY_VAR')).toBe('hello')
  })

  test('returns undefined when env var is unset', async () => {
    const { readEnv } = await loadFresh()
    expect(readEnv('DEFINITELY_NOT_SET_XYZ')).toBeUndefined()
  })

  test('returns undefined when env var is empty', async () => {
    const { readEnv } = await loadFresh()
    vi.stubEnv('EMPTY_VAR', '')
    expect(readEnv('EMPTY_VAR')).toBeUndefined()
  })

  test('returns undefined when env var is only whitespace', async () => {
    const { readEnv } = await loadFresh()
    vi.stubEnv('WHITESPACE_VAR', '   \t  ')
    expect(readEnv('WHITESPACE_VAR')).toBeUndefined()
  })
})

describe.sequential('secrets/find — resolve (async)', () => {
  test('returns env hit with source="env" when first account is set', async () => {
    const { resolve, readAsync } = await loadFresh()
    vi.stubEnv('TOK_NEW', 'from-env')
    const result = await resolve({
      service: 'svc',
      accounts: ['TOK_NEW', 'TOK_LEGACY'],
    })
    expect(result).toEqual({
      value: 'from-env',
      source: 'env',
      account: 'TOK_NEW',
    })
    expect(readAsync).not.toHaveBeenCalled()
  })

  test('falls through to legacy env-name when first is unset', async () => {
    const { resolve } = await loadFresh()
    vi.stubEnv('TOK_LEGACY', 'legacy-value')
    const result = await resolve({
      service: 'svc',
      accounts: ['TOK_NEW', 'TOK_LEGACY'],
    })
    expect(result?.source).toBe('env')
    expect(result?.account).toBe('TOK_LEGACY')
    expect(result?.value).toBe('legacy-value')
  })

  test('falls through to keychain when no env var is set', async () => {
    const { resolve, readAsync } = await loadFresh()
    readAsync.mockResolvedValueOnce(undefined)
    readAsync.mockResolvedValueOnce('keychain-value')
    const result = await resolve({
      service: 'svc',
      accounts: ['TOK_NEW', 'TOK_LEGACY'],
    })
    expect(result?.source).toBe('keychain')
    expect(result?.account).toBe('TOK_LEGACY')
    expect(result?.value).toBe('keychain-value')
  })

  test('returns undefined when nothing resolves', async () => {
    const { resolve, readAsync } = await loadFresh()
    readAsync.mockResolvedValue(undefined)
    const result = await resolve({
      service: 'svc',
      accounts: ['TOK_NEW'],
    })
    expect(result).toBeUndefined()
  })

  test('allowEnvOnly skips the keychain path', async () => {
    const { resolve, readAsync } = await loadFresh()
    const result = await resolve({
      service: 'svc',
      accounts: ['TOK_NEW'],
      allowEnvOnly: true,
    })
    expect(result).toBeUndefined()
    expect(readAsync).not.toHaveBeenCalled()
  })
})

describe.sequential('secrets/find — resolveSync', () => {
  test('returns env hit with source="env" when first account is set', async () => {
    const { resolveSync, readSync } = await loadFresh()
    vi.stubEnv('TOK_NEW', 'from-env')
    const result = resolveSync({
      service: 'svc',
      accounts: ['TOK_NEW', 'TOK_LEGACY'],
    })
    expect(result).toEqual({
      value: 'from-env',
      source: 'env',
      account: 'TOK_NEW',
    })
    expect(readSync).not.toHaveBeenCalled()
  })

  test('falls through to keychain when env is empty', async () => {
    const { resolveSync, readSync } = await loadFresh()
    readSync.mockReturnValueOnce(undefined)
    readSync.mockReturnValueOnce('keychain-sync-value')
    const result = resolveSync({
      service: 'svc',
      accounts: ['TOK_NEW', 'TOK_LEGACY'],
    })
    expect(result?.source).toBe('keychain')
    expect(result?.account).toBe('TOK_LEGACY')
  })

  test('returns undefined when nothing resolves', async () => {
    const { resolveSync, readSync } = await loadFresh()
    readSync.mockReturnValue(undefined)
    const result = resolveSync({ service: 'svc', accounts: ['X'] })
    expect(result).toBeUndefined()
  })

  test('allowEnvOnly skips the keychain path', async () => {
    const { resolveSync, readSync } = await loadFresh()
    const result = resolveSync({
      service: 'svc',
      accounts: ['X'],
      allowEnvOnly: true,
    })
    expect(result).toBeUndefined()
    expect(readSync).not.toHaveBeenCalled()
  })
})
