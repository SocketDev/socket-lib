import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock(import('../../../src/github/refs-rest'), () => ({
  fetchRefSha: vi.fn(),
}))
vi.mock(import('../../../src/github/refs-cache'), () => ({
  clearRefCache: vi.fn(),
  getGithubCache: vi.fn(() => ({
    getOrFetch: vi.fn(async (_key: string, fn: () => Promise<string>) => fn()),
  })),
}))
vi.mock(import('../../../src/github/refs-graphql'), () => ({
  fetchRefShaViaGraphQL: vi.fn(),
}))

async function loadFresh() {
  const restMod = await import('../../../src/github/refs-rest')
  const cacheMod = await import('../../../src/github/refs-cache')
  const mod = await import('../../../src/github/refs')
  return {
    fetchRefSha: restMod.fetchRefSha as ReturnType<typeof vi.fn>,
    getGithubCache: cacheMod.getGithubCache as ReturnType<typeof vi.fn>,
    resolveRefToSha: mod.resolveRefToSha,
  }
}

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe.sequential('github/refs — resolveRefToSha cache disabled', () => {
  test('bypasses the cache and calls fetchRefSha directly when DISABLE_GITHUB_CACHE is set', async () => {
    vi.stubEnv('DISABLE_GITHUB_CACHE', '1')
    const { fetchRefSha, getGithubCache, resolveRefToSha } = await loadFresh()
    fetchRefSha.mockResolvedValueOnce('abc123')
    const sha = await resolveRefToSha('owner', 'repo', 'main')
    expect(sha).toBe('abc123')
    expect(fetchRefSha).toHaveBeenCalledWith(
      'owner',
      'repo',
      'main',
      expect.any(Object),
    )
    expect(getGithubCache).not.toHaveBeenCalled()
  })

  test('forwards options through to fetchRefSha', async () => {
    vi.stubEnv('DISABLE_GITHUB_CACHE', '1')
    const { fetchRefSha, resolveRefToSha } = await loadFresh()
    fetchRefSha.mockResolvedValueOnce('def456')
    await resolveRefToSha('owner', 'repo', 'v1.0.0', { token: 'ghp_test' })
    const [, , , opts] = fetchRefSha.mock.calls[0]!
    expect((opts as { token?: string | undefined }).token).toBe('ghp_test')
  })
})

describe.sequential('github/refs — resolveRefToSha cache enabled', () => {
  test('routes through the cache.getOrFetch wrapper when cache is enabled', async () => {
    const { fetchRefSha, getGithubCache, resolveRefToSha } = await loadFresh()
    fetchRefSha.mockResolvedValueOnce('cache-hit')
    const sha = await resolveRefToSha('owner', 'repo', 'main')
    expect(sha).toBe('cache-hit')
    expect(getGithubCache).toHaveBeenCalled()
  })

  test('uses the canonical "owner/repo@ref" cacheKey shape', async () => {
    let capturedKey: string | undefined
    const cacheMod = await import('../../../src/github/refs-cache')
    ;(cacheMod.getGithubCache as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      getOrFetch: vi.fn(async (key: string, fn: () => Promise<string>) => {
        capturedKey = key
        return await fn()
      }),
    })
    const { fetchRefSha, resolveRefToSha } = await loadFresh()
    fetchRefSha.mockResolvedValueOnce('sha')
    await resolveRefToSha('socketdev', 'lib', 'main')
    expect(capturedKey).toBe('socketdev/lib@main')
  })
})

describe.sequential('github/refs — re-exports', () => {
  test('re-exports clearRefCache + getGithubCache + fetchRefShaViaGraphQL + fetchRefSha', async () => {
    const mod = await import('../../../src/github/refs')
    expect(typeof mod.clearRefCache).toBe('function')
    expect(typeof mod.getGithubCache).toBe('function')
    expect(typeof mod.fetchRefShaViaGraphQL).toBe('function')
    expect(typeof mod.fetchRefSha).toBe('function')
  })
})
