import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GitHubEmptyBodyError } from '../../../src/github/errors'
import { fetchGitHub, getGhsaUrl } from '../../../src/github/request'

const GITHUB_API = 'https://api.github.com'

describe('fetchGitHub', () => {
  beforeEach(() => {
    nock.disableNetConnect()
    nock.cleanAll()
    vi.resetModules()
  })

  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
  })

  it('returns parsed JSON on 200', async () => {
    nock(GITHUB_API).get('/repos/foo/bar').reply(200, { id: 1, name: 'bar' })
    const result = await fetchGitHub<{ id: number }>(
      `${GITHUB_API}/repos/foo/bar`,
    )
    expect(result.id).toBe(1)
  })

  it('passes Authorization header when token provided', async () => {
    nock(GITHUB_API, {
      reqheaders: { authorization: 'Bearer mytoken' },
    })
      .get('/repos/foo/bar')
      .reply(200, { id: 2 })
    const result = await fetchGitHub<{ id: number }>(
      `${GITHUB_API}/repos/foo/bar`,
      { token: 'mytoken' },
    )
    expect(result.id).toBe(2)
  })

  it('does not pass Authorization when empty-string token provided', async () => {
    // Empty string passes through `??` but fails the truthy `if (token)`
    // gate, so no Authorization header is added. Env fallback only fires
    // when `token` is undefined / null.
    nock(GITHUB_API, { badheaders: ['authorization'] })
      .get('/repos/foo/bar')
      .reply(200, { id: 3 })
    const result = await fetchGitHub<{ id: number }>(
      `${GITHUB_API}/repos/foo/bar`,
      { token: '' },
    )
    expect(result.id).toBe(3)
  })

  describe('5xx responses — probes GitHubStatus', () => {
    beforeEach(() => {
      // Mock the githubstatus probe so tests are hermetic
      nock('https://www.githubstatus.com')
        .get('/api/v2/components.json')
        .reply(200, {
          components: [
            { id: 'br0l2tvcx85d', name: 'Actions', status: 'operational' },
            {
              id: '8l4ygp009s5s',
              name: 'Git Operations',
              status: 'operational',
            },
            { id: 'brv1bkgrwx7q', name: 'API Requests', status: 'operational' },
          ],
        })
    })

    it('throws with status note when all components are operational', async () => {
      nock(GITHUB_API).get('/repos/foo/bar').reply(502, 'Bad Gateway')
      await expect(fetchGitHub(`${GITHUB_API}/repos/foo/bar`)).rejects.toThrow(
        /GitHub API error 502.*all monitored components operational/s,
      )
    })

    it('throws with degraded component details when GitHub is degraded', async () => {
      nock.cleanAll()
      nock('https://www.githubstatus.com')
        .get('/api/v2/components.json')
        .reply(200, {
          components: [
            {
              id: 'br0l2tvcx85d',
              name: 'Actions',
              status: 'degraded_performance',
            },
            {
              id: '8l4ygp009s5s',
              name: 'Git Operations',
              status: 'operational',
            },
            { id: 'brv1bkgrwx7q', name: 'API Requests', status: 'operational' },
          ],
        })
      nock(GITHUB_API).get('/repos/foo/bar').reply(503, 'Service Unavailable')
      await expect(fetchGitHub(`${GITHUB_API}/repos/foo/bar`)).rejects.toThrow(
        /GitHub platform status at time of failure.*Actions: degraded_performance/s,
      )
    })

    it('throws with unreachable note when status probe fails', async () => {
      nock.cleanAll()
      nock('https://www.githubstatus.com')
        .get('/api/v2/components.json')
        .replyWithError('ECONNREFUSED')
      nock(GITHUB_API).get('/repos/foo/bar').reply(500, 'Internal Server Error')
      await expect(fetchGitHub(`${GITHUB_API}/repos/foo/bar`)).rejects.toThrow(
        /GitHub API error 500.*unreachable/s,
      )
    })
  })

  it('throws GitHubEmptyBodyError on 200 with zero-byte body', async () => {
    nock(GITHUB_API).get('/repos/foo/bar').reply(200, '')
    await expect(
      fetchGitHub(`${GITHUB_API}/repos/foo/bar`),
    ).rejects.toBeInstanceOf(GitHubEmptyBodyError)
  })

  it('throws on malformed JSON body', async () => {
    nock(GITHUB_API).get('/repos/foo/bar').reply(200, 'not json {{{')
    await expect(fetchGitHub(`${GITHUB_API}/repos/foo/bar`)).rejects.toThrow(
      /Failed to parse GitHub API response/,
    )
  })

  it('throws GitHubRateLimitError on 403 rate limit', async () => {
    nock(GITHUB_API).get('/repos/foo/bar').reply(
      403,
      { message: 'API rate limit exceeded' },
      {
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': '9999999999',
      },
    )
    const err = (await fetchGitHub(`${GITHUB_API}/repos/foo/bar`).catch(
      e => e,
    )) as { message: string; status: number }
    expect(err.message).toMatch(/rate limit exceeded/)
    expect(err.status).toBe(403)
  })

  it('throws plain error on non-5xx, non-403 error status', async () => {
    nock(GITHUB_API).get('/repos/foo/bar').reply(404, 'Not Found')
    await expect(fetchGitHub(`${GITHUB_API}/repos/foo/bar`)).rejects.toThrow(
      /GitHub API error 404/,
    )
  })
})

describe('getGhsaUrl', () => {
  it('formats a standard GHSA ID into the advisories URL', () => {
    const url = getGhsaUrl('GHSA-1234-5678-90ab')
    expect(url).toBe('https://github.com/advisories/GHSA-1234-5678-90ab')
  })

  it('returns the same URL for repeated calls with the same ID', () => {
    const ghsaId = 'GHSA-1234-5678-90ab'
    const url1 = getGhsaUrl(ghsaId)
    const url2 = getGhsaUrl(ghsaId)
    expect(url1).toBe(url2)
    expect(url1).toContain(ghsaId)
  })

  it('returns a string type', () => {
    const url = getGhsaUrl('GHSA-test-test-test')
    expect(typeof url).toBe('string')
  })

  it('handles GHSA IDs with mixed case', () => {
    const url = getGhsaUrl('GhSa-MiXeD-CaSe-TeSt')
    expect(url).toBe('https://github.com/advisories/GhSa-MiXeD-CaSe-TeSt')
  })

  it('handles GHSA IDs with dashes only', () => {
    const url = getGhsaUrl('----')
    expect(url).toBe('https://github.com/advisories/----')
  })

  it('handles unicode in GHSA IDs', () => {
    const url = getGhsaUrl('GHSA-你好-世界-测试')
    expect(url).toContain('GHSA-你好-世界-测试')
  })

  it('handles GHSA IDs with unusual characters', () => {
    const url = getGhsaUrl('GHSA-@@@-###-$$$')
    expect(url).toContain('GHSA-@@@-###-$$$')
  })
})
