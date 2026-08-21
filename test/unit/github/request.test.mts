import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GitHubEmptyBodyError } from '../../../src/github/errors.mjs'
import {
  clearGitHubRateLimitLedger,
  getGitHubRateLimitSnapshot,
} from '../../../src/github/rate-limit.mjs'
import {
  fetchGitHub,
  formatGitHubStatusNote,
  getGhsaUrl,
} from '../../../src/github/request.mjs'

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

  describe('the rate-limit shapes a header-only check misses', () => {
    // Each shape below carries no `x-ratelimit-remaining: 0`, so a check that
    // reads that header alone reports a generic "GitHub API error" and a caller
    // reads a spent quota as a broken resource.
    it('catches a 429', async () => {
      nock(GITHUB_API)
        .get('/repos/foo/bar')
        .reply(429, { message: 'Too Many Requests' })
      const err = (await fetchGitHub(`${GITHUB_API}/repos/foo/bar`).catch(
        e => e,
      )) as { message: string; status: number }
      expect(err.message).toMatch(/rate limit exceeded/)
      expect(err.status).toBe(429)
    })

    it('catches a 403 whose body names the limit but whose headers do not', async () => {
      nock(GITHUB_API)
        .get('/repos/foo/bar')
        .reply(403, { message: 'API rate limit exceeded for 1.2.3.4.' })
      const err = (await fetchGitHub(`${GITHUB_API}/repos/foo/bar`).catch(
        e => e,
      )) as { message: string }
      expect(err.message).toMatch(/rate limit exceeded/)
    })

    it('catches the secondary limit, which sends Retry-After', async () => {
      // The secondary limit carries no x-ratelimit-remaining at all, so a
      // header-only check cannot see it.
      nock(GITHUB_API)
        .get('/repos/foo/bar')
        .reply(
          403,
          { message: 'You have exceeded a secondary rate limit.' },
          { 'Retry-After': '30' },
        )
      const err = (await fetchGitHub(`${GITHUB_API}/repos/foo/bar`).catch(
        e => e,
      )) as { message: string; resetTime: Date | undefined }
      expect(err.message).toMatch(/rate limit exceeded/)
      // Retry-After is a delay, not a timestamp, so the reset has to be
      // derived from the clock rather than read as epoch seconds.
      expect(err.resetTime).toBeInstanceOf(Date)
    })

    it('still throws a plain error for a permission denial', async () => {
      // A 403 that is ABOUT THE RESOURCE must not be reported as a rate limit:
      // it is not retryable and skipping it and continuing is correct.
      nock(GITHUB_API)
        .get('/repos/foo/bar')
        .reply(403, { message: 'Must have admin rights to Repository.' })
      await expect(fetchGitHub(`${GITHUB_API}/repos/foo/bar`)).rejects.toThrow(
        /GitHub API error 403/,
      )
    })
  })

  describe('budget recording', () => {
    it('records the budget from a SUCCESSFUL response', async () => {
      // The point of recording on success: a preflight can then refuse a sweep
      // before it starts. Recording only failures leaves the ledger empty
      // until something has already gone wrong.
      clearGitHubRateLimitLedger()
      nock(GITHUB_API).get('/repos/foo/bar').reply(
        200,
        { id: 1 },
        {
          'X-RateLimit-Limit': '5000',
          'X-RateLimit-Remaining': '4321',
          'X-RateLimit-Reset': '9999999999',
        },
      )
      await fetchGitHub(`${GITHUB_API}/repos/foo/bar`)
      expect(getGitHubRateLimitSnapshot()?.remaining).toBe(4321)
    })

    it('names an unauthenticated request as the cause when throttled', async () => {
      // The silent downgrade made loud. A bare "rate limit exceeded" sends
      // someone looking for a network fault; the anonymous limit of 60 is the
      // fact that explains it.
      clearGitHubRateLimitLedger()
      nock(GITHUB_API)
        .get('/repos/foo/bar')
        .reply(
          403,
          { message: 'API rate limit exceeded' },
          { 'X-RateLimit-Limit': '60', 'X-RateLimit-Remaining': '0' },
        )
      const err = (await fetchGitHub(`${GITHUB_API}/repos/foo/bar`, {
        token: 'ignored',
      }).catch(e => e)) as { message: string }
      expect(err.message).toMatch(/UNAUTHENTICATED/)
      expect(err.message).toMatch(/gh auth login/)
    })

    it('says nothing about authentication when the token was accepted', async () => {
      clearGitHubRateLimitLedger()
      nock(GITHUB_API)
        .get('/repos/foo/bar')
        .reply(
          403,
          { message: 'API rate limit exceeded' },
          { 'X-RateLimit-Limit': '5000', 'X-RateLimit-Remaining': '0' },
        )
      const err = (await fetchGitHub(`${GITHUB_API}/repos/foo/bar`, {
        token: 'accepted',
      }).catch(e => e)) as { message: string }
      expect(err.message).not.toMatch(/UNAUTHENTICATED/)
    })
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

describe('formatGitHubStatusNote', () => {
  it('says nothing when the probe produced no result', () => {
    expect(formatGitHubStatusNote(undefined)).toBe('')
  })

  it('names each degraded component so waiting is the obvious move', () => {
    const note = formatGitHubStatusNote({
      components: [
        { id: 'br0l2tvcx85d', name: 'Actions', status: 'major_outage' },
        { id: 'brv1bkgrwx7q', name: 'API Requests', status: 'operational' },
      ],
      degraded: true,
      status: 'major_outage',
      summary: 'Actions: major_outage',
    })
    expect(note).toContain('GitHub platform status at time of failure')
    expect(note).toContain('Actions: major_outage')
    expect(note).toContain('API Requests: operational')
  })

  it('says all-operational, so nobody waits out an outage that is not happening', () => {
    const note = formatGitHubStatusNote({
      components: [
        { id: 'br0l2tvcx85d', name: 'Actions', status: 'operational' },
      ],
      degraded: false,
      status: 'operational',
      summary: 'All monitored GitHub components operational',
    })
    expect(note).toContain('all monitored components operational')
    expect(note).toContain('request-specific error')
  })

  it('admits an unreachable status page rather than implying health', () => {
    const note = formatGitHubStatusNote({
      components: [],
      degraded: false,
      status: 'unknown',
      summary: 'githubstatus.com unreachable — cannot confirm GitHub health',
    })
    expect(note).toContain('githubstatus.com unreachable')
    expect(note).not.toContain('operational')
  })
})

// A probe reporting the 2026-08-06 shape, injected so no test reaches
// githubstatus.com or pays its timeout.
async function outageProbe() {
  return {
    components: [
      { id: 'br0l2tvcx85d', name: 'Actions', status: 'major_outage' as const },
    ],
    degraded: true,
    status: 'major_outage' as const,
    summary: 'Actions: major_outage',
  }
}

describe('fetchGitHub network failures', () => {
  beforeEach(() => {
    nock.disableNetConnect()
    nock.cleanAll()
    vi.resetModules()
  })

  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
  })

  it(
    'enriches a connection error, which is the shape an outage takes',
    { timeout: 60_000 },
    async () => {
      // The 2026-08-06 Actions incident produced timeouts and dropped runners,
      // never a 5xx body, so this path is the one that needed the platform note.
      nock(GITHUB_API)
        .get('/repos/foo/bar')
        .replyWithError({ code: 'ECONNRESET', message: 'socket hang up' })
      await expect(
        fetchGitHub(`${GITHUB_API}/repos/foo/bar`, {
          probeStatus: outageProbe,
        }),
      ).rejects.toThrow(
        /GitHub API request failed: [\s\S]*Actions: major_outage/,
      )
    },
  )

  it(
    'keeps the original error as the cause so a caller can still read its code',
    { timeout: 60_000 },
    async () => {
      nock(GITHUB_API)
        .get('/repos/foo/bar')
        .replyWithError({ code: 'ETIMEDOUT', message: 'timed out' })
      let caught: unknown
      try {
        await fetchGitHub(`${GITHUB_API}/repos/foo/bar`, {
          probeStatus: outageProbe,
        })
      } catch (e) {
        caught = e
      }
      expect(caught).toBeInstanceOf(Error)
      expect((caught as Error).cause).toBeDefined()
    },
  )
})
